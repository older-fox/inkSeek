import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { ChatChannel } from '../generated/prisma/client.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatMessagesService } from './chat-messages.service.js';
import { NapCatClient, type NapCatCloseInfo } from './napcat-client.js';
import {
  externalIdOf,
  isOneBotMessageEvent,
  isOneBotPokeEvent,
  userAvatarUrl,
  type OneBotEvent,
} from './onebot.js';

interface ManagedConnection {
  channel: ChatChannel;
  client: NapCatClient;
  attempts: number;
  retryTimer: NodeJS.Timeout | null;
  disposed: boolean;
  blocked: boolean;
}

interface LoginInfo {
  user_id?: number | string;
  nickname?: string;
}

const MAX_RETRY_DELAY_MS = 30_000;

@Injectable()
export class ChatRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatRuntimeService.name);
  private readonly connections = new Map<string, ManagedConnection>();
  private shuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: ChatMessagesService,
    private readonly events: ChatEventsService,
  ) {}

  /** Reconnects every saved channel on boot; failures fall back to the retry loop. */
  async onModuleInit(): Promise<void> {
    const channels = await this.prisma.chatChannel.findMany({ orderBy: { createdAt: 'asc' } });
    channels.forEach((channel) => this.launch(channel));
  }

  /** Suppresses reconnects while Nest tears the process down. */
  onModuleDestroy(): void {
    this.shuttingDown = true;
    this.connections.forEach((connection) => this.dispose(connection));
    this.connections.clear();
  }

  /** Live client for a channel, or null when the channel is not being managed. */
  getClient(channelId: string): NapCatClient | null {
    return this.connections.get(channelId)?.client ?? null;
  }

  /** Reads the persisted status flag rather than the socket, so restarts converge. */
  isOnline(channelId: string): boolean {
    const connection = this.connections.get(channelId);
    return connection?.channel.status === 'ONLINE';
  }

  /**
   * Takes ownership of a client that was already opened and probed during the
   * connect flow. The channel row must exist before this is called.
   */
  async adopt(channel: ChatChannel, client: NapCatClient): Promise<void> {
    const previous = this.connections.get(channel.id);
    if (previous) {
      this.dispose(previous);
    }

    const connection: ManagedConnection = {
      channel,
      client,
      attempts: 0,
      retryTimer: null,
      disposed: false,
      blocked: false,
    };

    client.attach({
      onEvent: (event) => {
        void this.handleEvent(connection, event);
      },
      onClose: (info) => {
        void this.handleClose(connection, info);
      },
    });

    this.connections.set(channel.id, connection);
    await this.verifyAndMarkOnline(connection);
  }

  /** Disposes the connection and forgets it, so nothing schedules a reconnect. */
  stop(channelId: string): void {
    const connection = this.connections.get(channelId);
    if (!connection) {
      return;
    }

    this.dispose(connection);
    this.connections.delete(channelId);
  }

  /** Replaces any existing connection with a fresh client and connects without awaiting. */
  private launch(channel: ChatChannel): void {
    this.stop(channel.id);

    const connection: ManagedConnection = {
      channel,
      client: new NapCatClient(channel.serverUrl, channel.accessToken, channel.displayName),
      attempts: 0,
      retryTimer: null,
      disposed: false,
      blocked: false,
    };

    connection.client.attach({
      onEvent: (event) => {
        void this.handleEvent(connection, event);
      },
      onClose: (info) => {
        void this.handleClose(connection, info);
      },
    });

    this.connections.set(channel.id, connection);
    void this.start(connection);
  }

  /** Guards against stale or disposed connections, then opens and verifies the login account. */
  private async start(connection: ManagedConnection): Promise<void> {
    if (connection.disposed || this.shuttingDown) {
      return;
    }

    if (this.connections.get(connection.channel.id) !== connection) {
      return;
    }

    try {
      await connection.client.open();
      connection.attempts = 0;
      await this.verifyAndMarkOnline(connection);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`渠道 ${connection.channel.displayName} 连接失败：${message}`);
      await this.updateStatus(connection, 'OFFLINE', message);
      this.scheduleReconnect(connection);
    }
  }

  /** Confirms NapCat is logged into the expected QQ account before messages are accepted. */
  private async verifyAndMarkOnline(connection: ManagedConnection): Promise<void> {
    let info: LoginInfo;

    try {
      info = await connection.client.call<LoginInfo>('get_login_info', {}, 8000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.updateStatus(connection, 'ERROR', `读取登录账号失败：${message}`);
      this.scheduleReconnect(connection);
      return;
    }

    const loginId = externalIdOf(info.user_id);

    if (loginId && loginId !== connection.channel.accountId) {
      const message = `NapCat 当前登录账号为 ${loginId}，与渠道账号 ${connection.channel.accountId} 不一致，已停止接收消息`;
      this.logger.error(message);
      connection.blocked = true;
      await this.updateStatus(connection, 'ERROR', message);
      connection.client.close();
      return;
    }

    const displayName = info.nickname?.trim() || connection.channel.displayName;
    const updated = await this.prisma.chatChannel.update({
      where: { id: connection.channel.id },
      data: {
        displayName,
        avatarUrl: userAvatarUrl(connection.channel.accountId),
        status: 'ONLINE',
        lastError: null,
        lastConnectedAt: new Date(),
      },
    });

    connection.channel = updated;

    try {
      await this.messages.ensureSelfContact(updated);
    } catch (error) {
      this.logger.warn(
        `写入渠道 ${updated.displayName} 的自身联系人失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.events.emit({ type: 'channel.updated', channelId: updated.id });
    this.logger.log(`渠道 ${updated.displayName}（${updated.accountId}）已上线`);
  }

  /** Pokes go to the dedicated ingest path; everything else must parse as a message event. */
  private async handleEvent(connection: ManagedConnection, event: OneBotEvent): Promise<void> {
    if (connection.disposed) {
      return;
    }

    if (isOneBotPokeEvent(event)) {
      await this.messages.ingestPoke(connection.channel, connection.client, event);
      return;
    }

    if (!isOneBotMessageEvent(event)) {
      return;
    }

    await this.messages.ingest(connection.channel, connection.client, event);
  }

  /** Outside shutdown, a close means offline plus a backoff reconnect. */
  private async handleClose(connection: ManagedConnection, info: NapCatCloseInfo): Promise<void> {
    if (connection.disposed || connection.blocked || this.shuttingDown) {
      return;
    }

    const message = `NapCat 连接断开（${info.code}${info.reason ? ` ${info.reason}` : ''}）`;
    this.logger.warn(`渠道 ${connection.channel.displayName}：${message}`);
    await this.updateStatus(connection, 'OFFLINE', message);
    this.scheduleReconnect(connection);
  }

  /** Exponential backoff capped at MAX_RETRY_DELAY_MS, with a single timer per connection. */
  private scheduleReconnect(connection: ManagedConnection): void {
    if (connection.disposed || this.shuttingDown || connection.retryTimer) {
      return;
    }

    const exponent = Math.min(connection.attempts, 5);
    const delay = Math.min(MAX_RETRY_DELAY_MS, 1_000 * 2 ** exponent);
    connection.attempts += 1;

    connection.retryTimer = setTimeout(() => {
      connection.retryTimer = null;
      void this.start(connection);
    }, delay);
  }

  /** Persists status for the UI; a failed write is logged instead of thrown. */
  private async updateStatus(
    connection: ManagedConnection,
    status: 'CONNECTING' | 'ONLINE' | 'OFFLINE' | 'ERROR',
    lastError: string | null,
  ): Promise<void> {
    if (connection.disposed) {
      return;
    }

    try {
      const updated = await this.prisma.chatChannel.update({
        where: { id: connection.channel.id },
        data: { status, lastError },
      });

      connection.channel = updated;
      this.events.emit({ type: 'channel.updated', channelId: updated.id });
    } catch (error) {
      this.logger.warn(
        `更新渠道状态失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Marks the connection dead, cancels any retry timer and closes the socket. */
  private dispose(connection: ManagedConnection): void {
    connection.disposed = true;

    if (connection.retryTimer) {
      clearTimeout(connection.retryTimer);
      connection.retryTimer = null;
    }

    connection.client.close();
  }
}
