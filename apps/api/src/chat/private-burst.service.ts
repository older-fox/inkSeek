import { Injectable, Logger } from '@nestjs/common';
import type { ChatMessageSnapshot } from './chat-message.types.js';

/** Hard ceiling so a person who keeps typing without pause still gets a reply. */
const MAX_BURST_MS = 12_000;

type BurstRunner = (messages: ChatMessageSnapshot[], quietSeconds: number) => Promise<void>;

interface BurstState {
  messages: ChatMessageSnapshot[];
  firstAt: number;
  timer: NodeJS.Timeout;
  quietSeconds: number;
  runner: BurstRunner;
}

/**
 * Private chats only: wait for a short quiet gap and answer the whole burst
 * once. This is not the group reply-avoid window; nothing is suppressed.
 * Runs are serialized per conversation so two flushes cannot overlap.
 */
@Injectable()
export class PrivateBurstService {
  private readonly logger = new Logger(PrivateBurstService.name);
  private readonly bursts = new Map<string, BurstState>();
  private readonly queues = new Map<string, Promise<void>>();

  /** Extends the quiet window on each new message, but never past MAX_BURST_MS from the first. */
  schedule(message: ChatMessageSnapshot, quietSeconds: number, runner: BurstRunner): void {
    const quietMs = Math.max(0, Math.round(quietSeconds * 1000));
    if (quietMs === 0) {
      void this.enqueue(message.conversationId, () => this.runBurst([message], 0, runner));
      return;
    }
    const key = message.conversationId;
    const now = Date.now();
    const existing = this.bursts.get(key);

    if (existing) {
      existing.messages.push(message);
      existing.quietSeconds = quietSeconds;
      existing.runner = runner;
      clearTimeout(existing.timer);
      existing.timer = setTimeout(
        () => void this.flush(key),
        burstDelay(existing.firstAt, now, quietMs),
      );
      return;
    }

    const state: BurstState = {
      messages: [message],
      firstAt: now,
      quietSeconds,
      runner,
      timer: setTimeout(() => void this.flush(key), quietMs),
    };
    this.bursts.set(key, state);
  }

  /** Fires when the quiet window closes and hands the batch to the serialized queue. */
  private async flush(key: string): Promise<void> {
    const state = this.bursts.get(key);
    if (!state) {
      return;
    }
    this.bursts.delete(key);
    await this.enqueue(key, () => this.runBurst(state.messages, state.quietSeconds, state.runner));
  }

  /** Swallows runner failures so one bad turn does not poison later bursts of the chat. */
  private async runBurst(
    messages: ChatMessageSnapshot[],
    quietSeconds: number,
    runner: BurstRunner,
  ): Promise<void> {
    try {
      await runner(messages, quietSeconds);
    } catch (error) {
      this.logger.warn(
        `私聊连发合并失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Chains work per conversation so two flushes of the same chat never overlap. */
  private enqueue(key: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.then(task).catch(() => undefined);
    this.queues.set(key, next);
    void next.finally(() => {
      if (this.queues.get(key) === next) {
        this.queues.delete(key);
      }
    });
    return next;
  }
}

/** Quiet time left, also capped by the deadline measured from the first message. */
function burstDelay(firstAt: number, now: number, quietMs: number): number {
  const remaining = MAX_BURST_MS - (now - firstAt);
  return Math.max(0, Math.min(quietMs, remaining));
}
