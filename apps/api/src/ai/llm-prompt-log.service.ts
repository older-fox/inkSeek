import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

export interface LlmPromptLogInput {
  /** Authored by a mind run; omitted for standalone calls. */
  runId?: string | null;
  source: string;
  providerId: string | null;
  providerName: string | null;
  model: string | null;
  system: string;
  prompt: string;
  response: string;
  imageCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
  error: string | null;
}

const PROMPT_LOG_LIMIT = 200;

/** Stores raw LLM requests so the mind panel can explain every call. */
@Injectable()
export class LlmPromptLogService {
  private readonly logger = new Logger(LlmPromptLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: LlmPromptLogInput): Promise<void> {
    try {
      await this.prisma.llmPromptLog.create({
        data: { ...input, runId: input.runId ?? null },
      });
      const stale = await this.prisma.llmPromptLog.findMany({
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        skip: PROMPT_LOG_LIMIT,
      });
      if (stale.length > 0) {
        await this.prisma.llmPromptLog.deleteMany({
          where: { id: { in: stale.map((row) => row.id) } },
        });
      }
    } catch (error) {
      this.logger.warn(
        `提示词日志写入失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
