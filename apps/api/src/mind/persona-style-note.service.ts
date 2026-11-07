import { Injectable } from '@nestjs/common';
import type {
  PersonaStyleNoteRecord,
  PersonaStyleNoteStatus,
  StyleNoteDraft,
  StyleNoteSource,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { PersonaStyleNote, Prisma } from '../generated/prisma/client.js';

const STALE_DAYS = 30;
const DECAY_STEP = 10;
const PAUSE_BELOW = 30;
const MAX_SOURCES = 8;
const MAX_SAMPLES = 5;
const DIMENSIONS = new Set([
  'length',
  'punctuation',
  'particles',
  'openings',
  'humor',
  'rhythm',
  'vocabulary',
  'tone',
]);

/**
 * Learned ways of speaking. These are an adaptation layer on top of the
 * persona card, not a second persona: they can change length, punctuation and
 * tone, but never values, boundaries or identity.
 */
@Injectable()
export class PersonaStyleNoteService {
  constructor(private readonly prisma: PrismaService) {}

  async addDrafts(
    personaId: string,
    channelId: string,
    drafts: readonly StyleNoteDraft[] | undefined,
    fallbackSources: readonly StyleNoteSource[] = [],
  ): Promise<PersonaStyleNoteRecord[]> {
    const created: PersonaStyleNoteRecord[] = [];
    for (const draft of drafts ?? []) {
      const content = normalizeContent(draft.content);
      if (!content) {
        continue;
      }
      const scope = draft.scope === 'RELATION' && draft.contactId?.trim() ? 'RELATION' : 'SELF';
      const contactId = scope === 'RELATION' ? (draft.contactId ?? '').trim() : '';
      const dimension = normalizeDimension(draft.dimension);
      const incomingSources = draft.sources?.length ? draft.sources : [...fallbackSources];
      const samples = normalizeSamples(draft.samples);
      const existing = await this.prisma.personaStyleNote.findMany({
        where: {
          personaId,
          channelId,
          scope,
          contactId,
          dimension,
          status: { in: ['ACTIVE', 'PAUSED'] },
        },
        take: 30,
      });
      const match = existing.find((row) => similar(row.content, content));
      if (match) {
        const merged = mergeSources(parseSources(match.sources), normalizeSources(incomingSources));
        const updated = await this.prisma.personaStyleNote.update({
          where: { id: match.id },
          data: {
            confidence: Math.min(100, Math.max(match.confidence, draft.confidence ?? 55) + 6),
            evidenceCount: { increment: 1 },
            sources: merged as unknown as Prisma.InputJsonValue,
            samples: mergeSamples(parseStrings(match.samples), samples) as unknown as Prisma.InputJsonValue,
            lastSeenAt: new Date(),
            status: 'ACTIVE',
          },
        });
        created.push(toRecord(updated));
        continue;
      }
      const row = await this.prisma.personaStyleNote.create({
        data: {
          personaId,
          channelId,
          scope,
          contactId,
          dimension,
          content,
          samples: samples as unknown as Prisma.InputJsonValue,
          sources: normalizeSources(incomingSources) as unknown as Prisma.InputJsonValue,
          confidence: clamp(Math.round(draft.confidence ?? 55), 0, 100),
        },
      });
      created.push(toRecord(row));
    }
    return created;
  }

  /** Notes that should be fixed into every prompt for this contact. */
  async activeFor(
    personaId: string,
    channelId: string,
    contactId?: string,
    limit = 4,
  ): Promise<PersonaStyleNoteRecord[]> {
    const scopes: Prisma.PersonaStyleNoteWhereInput[] = [{ scope: 'SELF', contactId: '' }];
    if (contactId?.trim()) {
      scopes.push({ scope: 'RELATION', contactId: contactId.trim() });
    }
    const rows = await this.prisma.personaStyleNote.findMany({
      where: { personaId, channelId, status: 'ACTIVE', OR: scopes },
      orderBy: [{ confidence: 'desc' }, { lastSeenAt: 'desc' }],
      take: Math.max(1, Math.min(8, limit)),
    });
    return rows.map(toRecord);
  }

  /** Stable notes offered to reflection for slow promotion into the card. */
  async promotionCandidates(personaId: string, limit = 4): Promise<PersonaStyleNoteRecord[]> {
    const cutoff = new Date(Date.now() - 14 * 86400_000);
    const rows = await this.prisma.personaStyleNote.findMany({
      where: {
        personaId,
        status: 'ACTIVE',
        confidence: { gte: 70 },
        evidenceCount: { gte: 2 },
        lastSeenAt: { gte: cutoff },
        promotedAt: null,
      },
      orderBy: [{ confidence: 'desc' }, { evidenceCount: 'desc' }],
      take: Math.max(1, Math.min(8, limit)),
    });
    return rows.map(toRecord);
  }

  async list(personaId: string, channelId: string, limit = 50): Promise<PersonaStyleNoteRecord[]> {
    const rows = await this.prisma.personaStyleNote.findMany({
      where: { personaId, channelId },
      orderBy: [{ status: 'asc' }, { confidence: 'desc' }, { updatedAt: 'desc' }],
      take: Math.max(1, Math.min(200, limit)),
    });
    return rows.map(toRecord);
  }

  async update(
    id: string,
    input: { status?: 'ACTIVE' | 'PAUSED'; confidence?: number; content?: string },
  ): Promise<PersonaStyleNoteRecord> {
    const row = await this.prisma.personaStyleNote.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.confidence !== undefined
          ? { confidence: clamp(Math.round(input.confidence), 0, 100) }
          : {}),
        ...(input.content ? { content: normalizeContent(input.content) } : {}),
      },
    });
    return toRecord(row);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.personaStyleNote.delete({ where: { id } }).catch(() => undefined);
  }

  async markApplied(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.personaStyleNote.updateMany({
      where: { id: { in: [...ids] }, status: 'ACTIVE' },
      data: { appliedCount: { increment: 1 }, lastAppliedAt: new Date() },
    });
  }

  async markPromoted(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.personaStyleNote.updateMany({
      where: { id: { in: [...ids] } },
      data: { status: 'PROMOTED', promotedAt: new Date() },
    });
  }

  /** Notes that were not seen for a month slowly lose confidence. */
  async decay(personaId: string): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_DAYS * 86400_000);
    const stale = await this.prisma.personaStyleNote.findMany({
      where: { personaId, status: 'ACTIVE', lastSeenAt: { lt: cutoff } },
      take: 100,
    });
    let changed = 0;
    for (const row of stale) {
      const confidence = Math.max(0, row.confidence - DECAY_STEP);
      await this.prisma.personaStyleNote.update({
        where: { id: row.id },
        data: { confidence, status: confidence < PAUSE_BELOW ? 'PAUSED' : 'ACTIVE' },
      });
      changed += 1;
    }
    return changed;
  }
}

function toRecord(row: PersonaStyleNote): PersonaStyleNoteRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    scope: row.scope === 'RELATION' ? 'RELATION' : 'SELF',
    contactId: row.contactId,
    dimension: row.dimension,
    content: row.content,
    samples: parseStrings(row.samples),
    sources: parseSources(row.sources),
    confidence: row.confidence,
    evidenceCount: row.evidenceCount,
    status: normalizeStatus(row.status),
    appliedCount: row.appliedCount,
    lastAppliedAt: row.lastAppliedAt?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt.toISOString(),
    promotedAt: row.promotedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeContent(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
}

function normalizeDimension(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return DIMENSIONS.has(text) ? text : 'tone';
}

function normalizeStatus(value: string): PersonaStyleNoteStatus {
  return value === 'PAUSED' || value === 'PROMOTED' ? value : 'ACTIVE';
}

function normalizeSamples(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.replace(/\s+/g, ' ').trim().slice(0, 120))
        .filter(Boolean),
    ),
  ].slice(0, MAX_SAMPLES);
}

function normalizeSources(value: readonly StyleNoteSource[]): StyleNoteSource[] {
  const seen = new Set<string>();
  const sources: StyleNoteSource[] = [];
  for (const item of value) {
    const url = typeof item?.url === 'string' ? item.url.trim().slice(0, 500) : '';
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    sources.push({
      url,
      title: typeof item.title === 'string' ? item.title.replace(/\s+/g, ' ').trim().slice(0, 160) : '',
      kind: typeof item.kind === 'string' ? item.kind.trim().slice(0, 30) : 'web',
    });
    if (sources.length >= MAX_SOURCES) {
      break;
    }
  }
  return sources;
}

function mergeSources(left: StyleNoteSource[], right: StyleNoteSource[]): StyleNoteSource[] {
  return normalizeSources([...left, ...right]);
}

function mergeSamples(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right])].slice(0, MAX_SAMPLES);
}

function parseSources(value: Prisma.JsonValue): StyleNoteSource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const objects = (value as Prisma.JsonValue[]).filter(
    (item): item is Prisma.JsonObject =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  );
  return normalizeSources(
    objects.map((item) => ({
      url: typeof item['url'] === 'string' ? item['url'] : '',
      title: typeof item['title'] === 'string' ? item['title'] : '',
      kind: typeof item['kind'] === 'string' ? item['kind'] : 'web',
    })),
  );
}

function parseStrings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, MAX_SAMPLES)
    : [];
}

function compact(text: string): string {
  return text.replace(/[\s，。！？、；：“”‘’（）()【】[\]…—-]/gu, '');
}

function similar(left: string, right: string): boolean {
  const a = compact(left);
  const b = compact(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 6 && long.includes(short)) {
    return true;
  }
  if (Math.min(a.length, b.length) < 8) {
    return false;
  }
  return jaccard(a, b) >= 0.55;
}

function jaccard(left: string, right: string): number {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const item of a) {
    if (b.has(item)) {
      overlap += 1;
    }
  }
  return overlap / (a.size + b.size - overlap);
}

function bigrams(text: string): Set<string> {
  const chars = [...text];
  const out = new Set<string>();
  for (let index = 0; index < chars.length - 1; index += 1) {
    out.add(`${chars[index]}${chars[index + 1]}`);
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
