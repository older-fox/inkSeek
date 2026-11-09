import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { ConversationClosureRecord } from './mind.types.js';

const SUMMARY_MAX = 500;
const NEXT_OPENING_MAX = 300;

/**
 * Remembers where a conversation was intentionally closed. The planner only
 * sees a short line about it; nothing here gates sending.
 */
@Injectable()
export class MindClosureService {
  private readonly logger = new Logger(MindClosureService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Closure record for the conversation, or null if it was never closed. */
  async load(conversationId: string): Promise<ConversationClosureRecord | null> {
    const row = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: {
        closureClosedAt: true,
        closureReason: true,
        closureSummary: true,
        closureNextOpening: true,
        closureReopenedAt: true,
      },
    });
    if (!row?.closureClosedAt) {
      return null;
    }
    return {
      closedAt: row.closureClosedAt,
      reason: row.closureReason,
      summary: row.closureSummary,
      nextOpening: row.closureNextOpening,
      reopenedAt: row.closureReopenedAt,
    };
  }

  /**
   * Marks the first message after a close. Later messages keep the original
   * reopen time so the prompt can still say "just reopened" for a few minutes.
   */
  async markReopened(conversationId: string, at: Date): Promise<void> {
    const row = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { closureClosedAt: true, closureReopenedAt: true },
    });
    if (!row?.closureClosedAt || at <= row.closureClosedAt) {
      return;
    }
    if (row.closureReopenedAt && row.closureReopenedAt > row.closureClosedAt) {
      return;
    }
    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { closureReopenedAt: at },
    });
  }

  /** Best-effort write: text is clamped and write errors are logged, not thrown. */
  async recordClose(
    conversationId: string,
    input: { reason?: string | null; summary?: string | null; nextOpening?: string | null },
    at = new Date(),
  ): Promise<void> {
    try {
      await this.prisma.chatConversation.update({
        where: { id: conversationId },
        data: {
          closureClosedAt: at,
          closureReason: clean(input.reason, 40) ?? 'natural',
          closureSummary: clean(input.summary, SUMMARY_MAX),
          closureNextOpening: clean(input.nextOpening, NEXT_OPENING_MAX),
          closureReopenedAt: null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `收尾记录写入失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** Trims input and clamps it to max; blank input becomes null so columns stay empty. */
function clean(value: string | null | undefined, max: number): string | null {
  const text = value?.trim() ?? '';
  return text ? text.slice(0, max) : null;
}
