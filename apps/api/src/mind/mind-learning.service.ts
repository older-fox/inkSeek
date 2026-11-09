import { Injectable } from '@nestjs/common';
import type {
  MindLearningItemRecord,
  MindLearningLogRecord,
  MindLearningOverview,
  MindSettingsRecord,
  StyleNoteSource,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { MindLearningLog, Prisma } from '../generated/prisma/client.js';
import { MindSettingsService } from './mind-settings.service.js';
import { PersonaStyleNoteService } from './persona-style-note.service.js';

export interface LearningFinishInput {
  status: 'SUCCEEDED' | 'FAILED';
  sources?: readonly (StyleNoteSource & { at?: string })[];
  learned?: readonly MindLearningItemRecord[];
  styleNotes?: readonly MindLearningItemRecord[];
  summary?: string;
  error?: string | null;
}

/**
 * Session ledger for autonomous learning. It answers "what did she read, what
 * stuck, and which way of speaking did she pick up" without duplicating the
 * memory rows themselves.
 */
@Injectable()
export class MindLearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: MindSettingsService,
    private readonly styleNotes: PersonaStyleNoteService,
  ) {}

  /** Opens a RUNNING ledger row and returns its id for the matching finish(). */
  async start(input: {
    personaId: string;
    channelId: string;
    trigger: 'HEARTBEAT' | 'MANUAL';
    reason: string;
    runId?: string;
  }): Promise<string> {
    const row = await this.prisma.mindLearningLog.create({
      data: {
        personaId: input.personaId,
        channelId: input.channelId,
        trigger: input.trigger,
        reason: input.reason.slice(0, 300),
        runId: input.runId ?? null,
      },
    });
    return row.id;
  }

  /** Closes the ledger row; blobs are sanitised and truncated so a runaway
   *  model response cannot bloat the row. */
  async finish(id: string, input: LearningFinishInput): Promise<void> {
    await this.prisma.mindLearningLog.update({
      where: { id },
      data: {
        status: input.status,
        sources: normalizeSources(input.sources) as unknown as Prisma.InputJsonValue,
        learned: normalizeItems(input.learned) as unknown as Prisma.InputJsonValue,
        styleNotes: normalizeItems(input.styleNotes) as unknown as Prisma.InputJsonValue,
        summary: (input.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
        error: input.error?.slice(0, 500) ?? null,
        finishedAt: new Date(),
      },
    });
  }

  /** True when the persona may spend this idle heartbeat learning. */
  async isDue(
    personaId: string,
    settings: MindSettingsRecord,
    now = new Date(),
  ): Promise<{ due: boolean; reason: string }> {
    if (!settings.learningEnabled) {
      return { due: false, reason: '学习已关闭' };
    }
    if (settings.learningIntervalHours <= 0) {
      return { due: false, reason: '学习间隔为 0，只保留手动学习' };
    }
    const last = await this.prisma.mindLearningLog.findFirst({
      where: { personaId, status: { in: ['SUCCEEDED', 'FAILED'] } },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    });
    if (last && now.getTime() - last.startedAt.getTime() < settings.learningIntervalHours * 3600_000) {
      return { due: false, reason: '学习间隔未到' };
    }
    if (settings.learningDailySourceLimit > 0) {
      const since = new Date(now.getTime() - 86400_000);
      const rows = await this.prisma.mindLearningLog.findMany({
        where: { personaId, startedAt: { gte: since } },
        select: { sources: true },
      });
      const used = rows.reduce((sum, row) => sum + parseSources(row.sources).length, 0);
      if (used >= settings.learningDailySourceLimit) {
        return { due: false, reason: '今天的学习来源额度已用完' };
      }
    }
    return { due: true, reason: '学习时间到了' };
  }

  /** Assembles the learning panel snapshot for one conversation. */
  async overview(
    personaId: string,
    channelId: string,
    limit = 12,
  ): Promise<MindLearningOverview> {
    const settings = await this.settings.peek(channelId);
    const since = new Date(Date.now() - 86400_000);
    const [logs, notes, last, todayRows] = await Promise.all([
      this.prisma.mindLearningLog.findMany({
        where: { personaId, channelId },
        orderBy: { startedAt: 'desc' },
        take: Math.max(1, Math.min(50, limit)),
      }),
      this.styleNotes.list(personaId, channelId, 80),
      this.prisma.mindLearningLog.findFirst({
        where: { personaId, channelId, status: 'SUCCEEDED' },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      }),
      this.prisma.mindLearningLog.findMany({
        where: { personaId, channelId, startedAt: { gte: since } },
        select: { sources: true },
      }),
    ]);
    return {
      enabled: settings.learningEnabled,
      intervalHours: settings.learningIntervalHours,
      dailySourceLimit: settings.learningDailySourceLimit,
      browserEnabled: settings.browserEnabled,
      styleLearningEnabled: settings.styleLearningEnabled,
      stylePromotionEnabled: settings.stylePromotionEnabled,
      lastRunAt: last?.startedAt.toISOString() ?? null,
      sourcesToday: todayRows.reduce((sum, row) => sum + parseSources(row.sources).length, 0),
      logs: logs.map(toRecord),
      notes,
    };
  }

  /** Newest-first ledger page for one conversation, limit clamped to 1..100. */
  async logs(personaId: string, channelId: string, limit = 20): Promise<MindLearningLogRecord[]> {
    const rows = await this.prisma.mindLearningLog.findMany({
      where: { personaId, channelId },
      orderBy: { startedAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)),
    });
    return rows.map(toRecord);
  }
}

/** Maps a ledger row to the shared shape, defaulting unknown statuses. */
function toRecord(row: MindLearningLog): MindLearningLogRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    trigger: row.trigger,
    status: row.status === 'FAILED' ? 'FAILED' : row.status === 'RUNNING' ? 'RUNNING' : 'SUCCEEDED',
    reason: row.reason,
    sources: parseSources(row.sources).map((source) => ({
      ...source,
      at: source.at ?? row.startedAt.toISOString(),
    })),
    learned: parseItems(row.learned),
    styleNotes: parseItems(row.styleNotes),
    summary: row.summary,
    error: row.error,
    runId: row.runId,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/** Clamps source fields and drops duplicate URLs, keeping at most 40 entries. */
function normalizeSources(
  value: readonly (StyleNoteSource & { at?: string })[] | undefined,
): (StyleNoteSource & { at: string })[] {
  const seen = new Set<string>();
  const out: (StyleNoteSource & { at: string })[] = [];
  for (const item of value ?? []) {
    const url = typeof item?.url === 'string' ? item.url.trim().slice(0, 500) : '';
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    out.push({
      url,
      title: typeof item.title === 'string' ? item.title.replace(/\s+/g, ' ').trim().slice(0, 160) : '',
      kind: typeof item.kind === 'string' ? item.kind.trim().slice(0, 30) : 'web',
      at: typeof item.at === 'string' ? item.at : new Date().toISOString(),
    });
    if (out.length >= 40) {
      break;
    }
  }
  return out;
}

/** Clamps learned-item text, discards empties, keeping at most 60 entries. */
function normalizeItems(
  value: readonly MindLearningItemRecord[] | undefined,
): MindLearningItemRecord[] {
  return (value ?? [])
    .map((item) => ({
      kind: (item.kind ?? 'FACT').toString().slice(0, 30),
      content: (item.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
      ...(item.sourceUrl ? { sourceUrl: item.sourceUrl.slice(0, 500) } : {}),
      ...(item.memoryId ? { memoryId: item.memoryId } : {}),
    }))
    .filter((item) => item.content)
    .slice(0, 60);
}

/** Keeps only plain objects from a JSON column; anything else decodes to []. */
function jsonObjects(value: Prisma.JsonValue): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: Record<string, unknown>[] = [];
  for (const item of value as Prisma.JsonValue[]) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      out.push(item as unknown as Record<string, unknown>);
    }
  }
  return out;
}

/** Lenient decode of stored sources; rows without a URL are dropped. */
function parseSources(
  value: Prisma.JsonValue,
): (StyleNoteSource & { at?: string })[] {
  return jsonObjects(value)
    .map((item) => ({
      url: typeof item['url'] === 'string' ? item['url'] : '',
      title: typeof item['title'] === 'string' ? item['title'] : '',
      kind: typeof item['kind'] === 'string' ? item['kind'] : 'web',
      at: typeof item['at'] === 'string' ? item['at'] : undefined,
    }))
    .filter((item) => item.url);
}

/** Lenient decode of stored learned items; entries without content are dropped. */
function parseItems(value: Prisma.JsonValue): MindLearningItemRecord[] {
  return jsonObjects(value)
    .map((item) => ({
      kind: typeof item['kind'] === 'string' ? item['kind'] : 'FACT',
      content: typeof item['content'] === 'string' ? item['content'] : '',
      ...(typeof item['sourceUrl'] === 'string' ? { sourceUrl: item['sourceUrl'] } : {}),
      ...(typeof item['memoryId'] === 'string' ? { memoryId: item['memoryId'] } : {}),
    }))
    .filter((item) => item.content);
}
