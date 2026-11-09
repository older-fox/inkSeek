import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import WebSocket, { type RawData } from 'ws';
import type {
  OneBotActionResponse,
  OneBotEvent,
  OneBotRequester,
} from './onebot.js';

export interface NapCatCloseInfo {
  code: number;
  reason: string;
}

export interface NapCatClientHandlers {
  onEvent: (event: OneBotEvent) => void;
  onClose: (info: NapCatCloseInfo) => void;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const CONNECT_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * OneBot 11 forward WebSocket client. NapCat is the server; inkSeek connects
 * out so no inbound port has to be exposed on the control plane.
 */
export class NapCatClient implements OneBotRequester {
  private readonly logger = new Logger(NapCatClient.name);
  private readonly pending = new Map<string, PendingCall>();
  private socket: WebSocket | null = null;
  private handlers: NapCatClientHandlers | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private disposed = false;
  private alive = true;

  constructor(
    private readonly serverUrl: string,
    private readonly accessToken: string,
    private readonly label: string,
  ) {}

  /** Registers the event and close callbacks; attaching replaces any previous handlers. */
  attach(handlers: NapCatClientHandlers): void {
    this.handlers = handlers;
  }

  /** Opens the forward WebSocket, resolving on open; the heartbeat starts at the same moment. */
  open(timeoutMs = CONNECT_TIMEOUT_MS): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error('连接已关闭'));
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const url = this.buildUrl();
      const headers = this.accessToken
        ? { Authorization: `Bearer ${this.accessToken}` }
        : undefined;

      const socket = new WebSocket(url, { headers });
      this.socket = socket;
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        socket.terminate();
        reject(new Error('连接 NapCat WebSocket 超时'));
      }, timeoutMs);

      socket.once('open', () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.alive = true;
        this.startHeartbeat();
        this.logger.log(`[${this.label}] WebSocket 已连接`);
        resolve();
      });

      socket.on('message', (data) => this.handleMessage(data));
      socket.on('pong', () => {
        this.alive = true;
      });

      socket.on('error', (error) => {
        this.logger.warn(`[${this.label}] WebSocket 错误：${error.message}`);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });

      socket.on('close', (code, reason) => {
        clearTimeout(timer);
        this.stopHeartbeat();
        this.socket = null;
        const message = reason.toString();
        this.rejectPending(`NapCat 连接已断开（${code}${message ? ` ${message}` : ''}）`);

        if (!settled) {
          settled = true;
          reject(new Error(`NapCat 连接被关闭（${code}）`));
        }

        if (!this.disposed) {
          this.handlers?.onClose({ code, reason: message });
        }
      });
    });
  }

  /** Sends an OneBot action, settling on the matching echo; rejects on timeout or non-zero retcode. */
  call<T>(action: string, params: Record<string, unknown> = {}, timeoutMs = CALL_TIMEOUT_MS): Promise<T> {
    const socket = this.socket;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('NapCat 连接尚未就绪'));
    }

    const echo = randomUUID();

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(echo);
        reject(new Error(`NapCat 接口 ${action} 超时`));
      }, timeoutMs);

      this.pending.set(echo, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });

      socket.send(JSON.stringify({ action, params, echo }), (error) => {
        if (!error) {
          return;
        }

        const entry = this.pending.get(echo);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(echo);
          entry.reject(error);
        }
      });
    });
  }

  /** Marks the client disposed so the socket close does not trigger a reconnect. */
  close(): void {
    this.disposed = true;
    this.stopHeartbeat();
    this.rejectPending('NapCat 连接已被主动关闭');

    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close(1000, 'inkSeek disconnect');
    }
  }

  /** Appends the access token as a query parameter, which some NapCat builds read instead. */
  private buildUrl(): string {
    const url = new URL(this.serverUrl);
    if (this.accessToken) {
      url.searchParams.set('access_token', this.accessToken);
    }
    return url.toString();
  }

  /** Dispatches parsed frames: an echo settles a pending call, post_type frames become events. */
  private handleMessage(raw: RawData): void {
    let payload: unknown;

    try {
      payload = JSON.parse(raw.toString());
    } catch {
      this.logger.warn(`[${this.label}] 收到无法解析的 NapCat 消息`);
      return;
    }

    if (!payload || typeof payload !== 'object') {
      return;
    }

    const record = payload as Record<string, unknown>;

    if (record['echo'] !== undefined && record['echo'] !== null) {
      this.settleCall(record as unknown as OneBotActionResponse);
      return;
    }

    if (typeof record['post_type'] === 'string') {
      this.handlers?.onEvent(record as OneBotEvent);
    }
  }

  /** Resolves or rejects the pending call whose echo matches this response. */
  private settleCall(response: OneBotActionResponse): void {
    const echo = String(response.echo);
    const entry = this.pending.get(echo);

    if (!entry) {
      return;
    }

    this.pending.delete(echo);
    clearTimeout(entry.timer);

    if (response.retcode === 0 && response.status !== 'failed') {
      entry.resolve(response.data);
      return;
    }

    const detail = response.wording ?? response.message ?? `retcode ${response.retcode}`;
    entry.reject(new Error(detail));
  }

  /** Fails every in-flight call; used on disconnect and shutdown. */
  private rejectPending(message: string): void {
    this.pending.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
    });
    this.pending.clear();
  }

  /** Ping/pong liveness: a missed pong from the previous tick terminates the socket. */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (!this.alive) {
        this.logger.warn(`[${this.label}] NapCat 心跳超时，主动断开重连`);
        socket.terminate();
        return;
      }
      this.alive = false;
      socket.ping();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /** Cancels the heartbeat timer, if one is running. */
  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }
}
