import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '../redis/redis-cache.service.js';

const KEY_PREFIX = 'mind:reply-lock:';

/**
 * Per-conversation reply window. A run takes the lock right after the planner
 * commits to answering, so a burst of messages cannot produce parallel
 * replies. Redis coordinates across processes; an in-process map keeps the
 * window working when Redis is unavailable.
 */
@Injectable()
export class MindReplyLockService {
  private readonly fallback = new Map<string, number>();

  constructor(private readonly cache: RedisCacheService) {}

  /** Whether the window is still open; the in-process map is checked first. */
  async active(conversationId: string): Promise<boolean> {
    if (!conversationId) {
      return false;
    }
    const now = Date.now();
    const local = this.fallback.get(conversationId);
    if (local !== undefined) {
      if (local > now) {
        return true;
      }
      this.fallback.delete(conversationId);
    }
    return (await this.cache.get(KEY_PREFIX + conversationId)) !== null;
  }

  /** Takes the window; false when another run already holds it. A zero window
   *  disables the lock entirely and always succeeds. */
  async acquire(input: {
    conversationId: string;
    runId: string;
    windowSeconds: number;
  }): Promise<boolean> {
    const { conversationId, runId, windowSeconds } = input;
    if (!conversationId || windowSeconds <= 0) {
      return true;
    }
    const now = Date.now();
    const local = this.fallback.get(conversationId);
    if (local !== undefined && local > now) {
      return false;
    }

    const ttlSeconds = Math.max(1, Math.round(windowSeconds));
    // Reserve synchronously so two runs in this process cannot both win while
    // the Redis round-trip is in flight.
    this.fallback.set(conversationId, now + ttlSeconds * 1000);
    const result = await this.cache.setIfAbsent(KEY_PREFIX + conversationId, runId, ttlSeconds);
    if (result === false) {
      this.fallback.delete(conversationId);
      return false;
    }
    return true;
  }

  /**
   * Frees the window when the run that took it was superseded by a newer
   * message from the same sender, so the replacement turn can answer.
   */
  async release(conversationId: string, runId: string): Promise<void> {
    if (!conversationId) {
      return;
    }
    const key = KEY_PREFIX + conversationId;
    const current = await this.cache.get(key);
    if (current !== null && current !== runId) {
      return;
    }
    this.fallback.delete(conversationId);
    await this.cache.delete(key);
  }

  /**
   * Restarts the window after a directed mention was allowed to reply through
   * an active lock, so the next unaddressed message waits the full window.
   */
  async extend(input: {
    conversationId: string;
    runId: string;
    windowSeconds: number;
  }): Promise<void> {
    const { conversationId, runId, windowSeconds } = input;
    if (!conversationId || windowSeconds <= 0) {
      return;
    }
    const ttlSeconds = Math.max(1, Math.round(windowSeconds));
    this.fallback.set(conversationId, Date.now() + ttlSeconds * 1000);
    await this.cache.set(KEY_PREFIX + conversationId, runId, ttlSeconds);
  }
}
