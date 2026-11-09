import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

export interface LlmCallLogInput {
  /** Authored by a mind run; omitted for standalone calls. */
  runId?: string | null;
  /** Attribution for usage outside a run; unrelated to the mind run aggregate. */
  channelId?: string | null;
  personaId?: string | null;
  source: string;
  providerId: string | null;
  providerName: string | null;
  model: string | null;
  system: string;
  prompt: string | null;
  response: string | null;
  imageCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
  error: string | null;
}

const BODY_LIMIT = 200;

/**
 * One log for every LLM call. The newest calls keep their raw text so the mind
 * panel can explain them; older attributed calls keep only usage, and older
 * unattributed/run-scoped rows are dropped with their text.
 */
@Injectable()
export class LlmCallLogService {
  private readonly logger = new Logger(LlmCallLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: LlmCallLogInput): Promise<void> {
    try {
      await this.prisma.llmCallLog.create({
        data: {
          ...input,
          runId: input.runId ?? null,
          channelId: input.channelId ?? null,
          personaId: input.personaId ?? null,
        },
      });
      const overflow = await this.prisma.llmCallLog.findMany({
        select: { id: true, runId: true, channelId: true, personaId: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: BODY_LIMIT,
      });
      if (overflow.length === 0) {
        return;
      }
      const usageIds: string[] = [];
      const disposableIds: string[] = [];
      for (const row of overflow) {
        const attributed = !row.runId && (row.channelId !== null || row.personaId !== null);
        (attributed ? usageIds : disposableIds).push(row.id);
      }
      if (usageIds.length > 0) {
        await this.prisma.llmCallLog.updateMany({
          where: { id: { in: usageIds }, prompt: { not: null } },
          data: { prompt: null, response: null, system: '' },
        });
      }
      if (disposableIds.length > 0) {
        await this.prisma.llmCallLog.deleteMany({ where: { id: { in: disposableIds } } });
      }
    } catch (error) {
      this.logger.warn(
        `调用日志写入失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
