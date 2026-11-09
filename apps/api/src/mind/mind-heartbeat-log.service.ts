import { Injectable, Logger } from '@nestjs/common';
import type { MindHeartbeatLogRecord, MindHeartbeatStatus, PersonaMindMode } from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { MindHeartbeatLog } from '../generated/prisma/client.js';

export interface MindHeartbeatLogInput {
  personaId: string;
  channelId: string;
  status: MindHeartbeatStatus;
  reason: string;
  mode: PersonaMindMode;
  quiet?: boolean;
  dueTodos?: number;
  dueIntentions?: number;
  unconsolidated?: number;
  lifeEvent?: boolean;
  curiosity?: boolean;
  learning?: boolean;
  reflection?: boolean;
  runId?: string | null;
  detail?: unknown;
}

const KEEP_PER_PERSONA = 500;

/** Append-only heartbeat journal so every wake can explain what it did. */
@Injectable()
export class MindHeartbeatLogService {
  private readonly logger = new Logger(MindHeartbeatLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Appends one journal row and prunes older rows beyond the per-persona cap.
   *  Logging failures are swallowed so a heartbeat never dies over telemetry. */
  async record(input: MindHeartbeatLogInput): Promise<void> {
    try {
      await this.prisma.mindHeartbeatLog.create({
        data: {
          personaId: input.personaId,
          channelId: input.channelId,
          status: input.status,
          reason: input.reason.slice(0, 2000),
          mode: input.mode,
          quiet: input.quiet ?? false,
          dueTodos: input.dueTodos ?? 0,
          dueIntentions: input.dueIntentions ?? 0,
          unconsolidated: input.unconsolidated ?? 0,
          lifeEvent: input.lifeEvent ?? false,
          curiosity: input.curiosity ?? false,
          learning: input.learning ?? false,
          reflection: input.reflection ?? false,
          runId: input.runId ?? null,
          detail: (input.detail ?? undefined) as object | undefined,
        },
      });
      const stale = await this.prisma.mindHeartbeatLog.findMany({
        where: { personaId: input.personaId },
        orderBy: { createdAt: 'desc' },
        skip: KEEP_PER_PERSONA,
        select: { id: true },
      });
      if (stale.length > 0) {
        await this.prisma.mindHeartbeatLog.deleteMany({
          where: { id: { in: stale.map((row) => row.id) } },
        });
      }
    } catch (error) {
      this.logger.warn(
        `心跳日志写入失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Newest-first journal page; limit is clamped to 1..200, offset floors at 0. */
  async list(personaId: string, limit = 60, offset = 0): Promise<MindHeartbeatLogRecord[]> {
    const rows = await this.prisma.mindHeartbeatLog.findMany({
      where: { personaId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(200, limit)),
      skip: Math.max(0, offset),
    });
    return rows.map(toRecord);
  }
}

/** Maps a journal row to the API shape with an ISO timestamp. */
function toRecord(row: MindHeartbeatLog): MindHeartbeatLogRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    status: row.status as MindHeartbeatStatus,
    reason: row.reason,
    mode: row.mode as PersonaMindMode,
    quiet: row.quiet,
    dueTodos: row.dueTodos,
    dueIntentions: row.dueIntentions,
    unconsolidated: row.unconsolidated,
    lifeEvent: row.lifeEvent,
    curiosity: row.curiosity,
    learning: row.learning,
    reflection: row.reflection,
    runId: row.runId,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  };
}
