import { Injectable } from '@nestjs/common';
import type {
  MindFocusOverview,
  PersonaFocusKind,
  PersonaFocusRecord,
  PersonaFocusStatus,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PersonaFocus } from '../generated/prisma/client.js';
import { localDateKey } from './mind.types.js';

interface FocusStartInput {
  personaId: string;
  channelId: string;
  kind: PersonaFocusKind;
  goal?: string;
  parentId?: string | null;
  state?: Record<string, unknown>;
}

/**
 * Persistent attention state: one body, one focus. A chat interruption pauses
 * the phone focus instead of creating a second actor.
 */
@Injectable()
export class MindFocusService {
  constructor(private readonly prisma: PrismaService) {}

  /** Looks up any focus by id, including finished ones. */
  async byId(id: string): Promise<PersonaFocusRecord | null> {
    const row = await this.prisma.personaFocus.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  /** Most recent ACTIVE or PAUSED focus, optionally narrowed to one kind. */
  async active(
    personaId: string,
    kind?: PersonaFocusKind,
  ): Promise<PersonaFocusRecord | null> {
    const row = await this.prisma.personaFocus.findFirst({
      where: {
        personaId,
        status: { in: ['ACTIVE', 'PAUSED'] },
        ...(kind ? { kind } : {}),
      },
      orderBy: { startedAt: 'desc' },
    });
    return row ? toRecord(row) : null;
  }

  /** One phone focus per persona: a second request returns the running one. */
  async start(input: FocusStartInput): Promise<PersonaFocusRecord> {
    if (input.kind === 'PHONE') {
      const existing = await this.active(input.personaId, 'PHONE');
      if (existing) {
        return existing;
      }
    }
    const row = await this.prisma.personaFocus.create({
      data: {
        personaId: input.personaId,
        channelId: input.channelId,
        kind: input.kind,
        goal: input.goal?.trim().slice(0, 200) ?? '',
        parentId: input.parentId ?? null,
        state: (input.state ?? {}) as Prisma.InputJsonValue,
      },
    });
    return toRecord(row);
  }

  /** PAUSED is a no-op when the row is not ACTIVE; safe to call twice. */
  async pause(id: string): Promise<void> {
    await this.prisma.personaFocus.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'PAUSED', pausedAt: new Date() },
    });
  }

  /** Reactivates a paused focus; ignored unless the row is PAUSED. */
  async resume(id: string): Promise<void> {
    await this.prisma.personaFocus.updateMany({
      where: { id, status: 'PAUSED' },
      data: { status: 'ACTIVE', pausedAt: null },
    });
  }

  /** Ends a focus (DONE unless overridden); state patch is merged, not replaced. */
  async finish(
    id: string,
    patch?: { state?: Record<string, unknown>; status?: PersonaFocusStatus },
  ): Promise<void> {
    const row = await this.prisma.personaFocus.findUnique({ where: { id } });
    if (!row) {
      return;
    }
    await this.prisma.personaFocus.update({
      where: { id },
      data: {
        status: patch?.status ?? 'DONE',
        endedAt: new Date(),
        pausedAt: null,
        ...(patch?.state ? { state: mergeState(row.state, patch.state) } : {}),
      },
    });
  }

  /** Merge workbook fields and bump the step counter after actions. */
  async advance(
    id: string,
    patch: Record<string, unknown>,
    steps = 1,
  ): Promise<void> {
    const row = await this.prisma.personaFocus.findUnique({ where: { id } });
    if (!row) {
      return;
    }
    await this.prisma.personaFocus.update({
      where: { id },
      data: {
        step: { increment: Math.max(1, Math.round(steps)) },
        state: mergeState(row.state, patch),
      },
    });
  }

  /** Overwrites workbook fields without touching the step counter. */
  async updateState(id: string, patch: Record<string, unknown>): Promise<void> {
    const row = await this.prisma.personaFocus.findUnique({ where: { id } });
    if (!row) {
      return;
    }
    await this.prisma.personaFocus.update({
      where: { id },
      data: { state: mergeState(row.state, patch) },
    });
  }

  /** Current focus plus a newest-first history page for the panel. */
  async overview(personaId: string, limit = 12): Promise<Omit<MindFocusOverview, 'now'>> {
    const [active, recent] = await Promise.all([
      this.active(personaId),
      this.prisma.personaFocus.findMany({
        where: { personaId },
        orderBy: { startedAt: 'desc' },
        take: limit,
      }),
    ]);
    return {
      active,
      recent: recent.map(toRecord),
    };
  }

  /** Daily quota check: rows are fetched over a 48h window, then bucketed by
   *  the persona's local date so timezone offsets are honoured. */
  async countStartedToday(
    personaId: string,
    kind: PersonaFocusKind,
    timeZone: string | null,
  ): Promise<number> {
    const now = new Date();
    const today = localDateKey(now, timeZone);
    const rows = await this.prisma.personaFocus.findMany({
      where: {
        personaId,
        kind,
        startedAt: { gte: new Date(now.getTime() - 48 * 3_600_000) },
      },
      select: { startedAt: true },
    });
    return rows.filter((row) => localDateKey(row.startedAt, timeZone) === today).length;
  }

  /** After a restart nothing can still be holding the device. */
  async reclaimStale(): Promise<void> {
    const stale = await this.prisma.personaFocus.findMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] } },
    });
    if (stale.length === 0) {
      return;
    }
    const endedAt = new Date();
    await Promise.all(
      stale.map((row) => {
        const state =
          row.state && typeof row.state === 'object' && !Array.isArray(row.state)
            ? (row.state as Record<string, unknown>)
            : {};
        // A reclaimed phone session did not finish on its own; keep the reason
        // visible so the next turn does not think it played normally.
        const patch =
          row.kind === 'PHONE' && !state['error'] ? { error: '服务重启中断' } : {};
        return this.prisma.personaFocus.update({
          where: { id: row.id },
          data: {
            status: 'DONE',
            endedAt,
            pausedAt: null,
            state: mergeState(row.state, patch),
          },
        });
      }),
    );
  }
}

/** Shallow-merges a workbook patch over the stored JSON object. */
function mergeState(current: Prisma.JsonValue, patch: Record<string, unknown>): Prisma.InputJsonValue {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

/** Flattens a focus row into the API shape with ISO timestamps. */
function toRecord(row: PersonaFocus): PersonaFocusRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    kind: row.kind,
    status: row.status,
    parentId: row.parentId,
    goal: row.goal,
    step: row.step,
    state: row.state,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
