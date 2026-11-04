import { Injectable, NotFoundException } from '@nestjs/common';
import type { MindEmotion, PersonaStateRecord, PersonaStateUpdateInput } from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { PersonaState } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { clamp, localHour, readString, type MindPersona } from './mind.types.js';

const SCHEDULE_LEAD_MS = 15 * 60 * 1000;

export interface StateChangeMeta {
  reason?: string;
  source?: string;
  runId?: string;
  /** Optional per-field reasons; fall back to `reason` when absent. */
  fieldReasons?: Record<string, string>;
}

const NUMERIC_STATE_FIELDS = [
  'moodValence',
  'moodArousal',
  'moodDominance',
  'energy',
  'stress',
  'socialBattery',
  'attention',
  'sleepDebt',
  'health',
  'grooming',
] as const;

const TEXT_STATE_FIELDS = ['currentActivity', 'location'] as const;

@Injectable()
export class PersonaStateService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(personaId: string): Promise<PersonaState> {
    const persona = await this.persona(personaId);
    const values =
      persona.values && typeof persona.values === 'object' && !Array.isArray(persona.values)
        ? (persona.values as Record<string, unknown>)
        : {};
    const cardGrooming = Number(values['grooming']);
    return this.prisma.personaState.upsert({
      where: { personaId },
      create: {
        personaId,
        nextWakeAt: new Date(Date.now() + SCHEDULE_LEAD_MS),
        wakeReason: '首次唤醒',
        ...(Number.isFinite(cardGrooming)
          ? { grooming: clamp(Math.round(cardGrooming), 0, 100) }
          : {}),
      },
      update: {},
    });
  }

  async get(personaId: string): Promise<PersonaStateRecord> {
    const persona = await this.persona(personaId);
    const state = await this.ensure(personaId);
    const drifted = await this.drift(persona, state);
    return toRecord(drifted);
  }

  async update(
    personaId: string,
    input: PersonaStateUpdateInput,
    meta?: StateChangeMeta,
  ): Promise<PersonaStateRecord> {
    const before = await this.ensure(personaId);
    const data: Prisma.PersonaStateUpdateInput = {};
    if (input.moodValence !== undefined) data.moodValence = clamp(input.moodValence, -100, 100);
    if (input.moodArousal !== undefined) data.moodArousal = clamp(input.moodArousal, 0, 100);
    if (input.moodDominance !== undefined)
      data.moodDominance = clamp(input.moodDominance, -100, 100);
    if (input.energy !== undefined) data.energy = clamp(input.energy, 0, 100);
    if (input.stress !== undefined) data.stress = clamp(input.stress, 0, 100);
    if (input.socialBattery !== undefined) data.socialBattery = clamp(input.socialBattery, 0, 100);
    if (input.attention !== undefined) data.attention = clamp(input.attention, 0, 100);
    if (input.currentActivity !== undefined) data.currentActivity = input.currentActivity;
    if (input.location !== undefined) data.location = input.location;
    if (input.sleepDebt !== undefined) data.sleepDebt = clamp(input.sleepDebt, 0, 100);
    if (input.health !== undefined) data.health = clamp(input.health, 0, 100);
    if (input.grooming !== undefined) data.grooming = clamp(input.grooming, 0, 100);
    if (input.nextWakeAt !== undefined) {
      data.nextWakeAt = input.nextWakeAt ? new Date(input.nextWakeAt) : null;
    }
    const state = await this.prisma.personaState.update({ where: { personaId }, data });
    await this.logChanges(personaId, before, state, {
      reason: meta?.reason ?? '手动调整',
      source: meta?.source ?? 'MANUAL',
      runId: meta?.runId,
    });
    if (input.nextWakeAt !== undefined) {
      await this.setNextWakeAt(personaId, input.nextWakeAt ? new Date(input.nextWakeAt) : null);
    }
    return toRecord(state);
  }

  async applyEmotion(
    personaId: string,
    felt: MindEmotion | null,
    meta?: StateChangeMeta,
  ): Promise<void> {
    if (!felt) {
      return;
    }
    const state = await this.ensure(personaId);
    const intensity = clamp(felt.intensity ?? 30, 0, 100);
    const positive = /开心|高兴|心动|喜欢|安心|感激|期待|骄傲|温暖|满足|兴奋/u.test(felt.label);
    const negative = /生气|愤怒|难过|伤心|焦虑|委屈|厌烦|讨厌|恐惧|害怕|愧疚|嫉妒|失望/u.test(
      felt.label,
    );
    const arousing = /生气|愤怒|焦虑|恐惧|害怕|兴奋|嫉妒|紧张/u.test(felt.label);
    const valenceDelta = positive ? intensity * 0.45 : negative ? -intensity * 0.5 : 0;
    const arousalDelta = arousing ? intensity * 0.3 : negative ? -intensity * 0.1 : 0;

    const next = await this.prisma.personaState.update({
      where: { personaId },
      data: {
        moodValence: clamp(state.moodValence + valenceDelta, -100, 100),
        moodArousal: clamp(state.moodArousal + arousalDelta, 0, 100),
        stress: clamp(state.stress + (negative ? intensity * 0.2 : -intensity * 0.08), 0, 100),
        energy: clamp(state.energy - 1.5, 0, 100),
        socialBattery: clamp(state.socialBattery - 2, 0, 100),
        lastHeartbeatAt: new Date(),
      },
    });
    await this.logChanges(personaId, state, next, {
      reason: meta?.reason ?? `情绪：${felt.label}`,
      source: meta?.source ?? 'EMOTION',
      runId: meta?.runId,
    });
  }

  async applyTurnCost(personaId: string, engaged: boolean, meta?: StateChangeMeta): Promise<void> {
    const state = await this.ensure(personaId);
    const next = await this.prisma.personaState.update({
      where: { personaId },
      data: {
        energy: clamp(state.energy - (engaged ? 2 : 0.5), 0, 100),
        socialBattery: clamp(state.socialBattery - (engaged ? 3 : 1), 0, 100),
        attention: clamp(state.attention + (engaged ? 3 : 1), 0, 100),
      },
    });
    await this.logChanges(personaId, state, next, {
      reason: meta?.reason ?? (engaged ? '参与对话' : '旁观对话'),
      source: meta?.source ?? 'TURN',
      runId: meta?.runId,
    });
  }

  /** Heartbeat cadence only. Waking up is recorded by event settlement (`applyBodyDeltas`). */
  async markHeartbeat(personaId: string): Promise<void> {
    await this.prisma.personaState.updateMany({
      where: { personaId },
      data: { lastHeartbeatAt: new Date() },
    });
  }

  /** Bounded body deltas, used by long-event start/end settlement. */
  async applyBodyDeltas(
    personaId: string,
    deltas: {
      moodValence?: number;
      moodArousal?: number;
      moodDominance?: number;
      energy?: number;
      health?: number;
      sleepDebt?: number;
      stress?: number;
      attention?: number;
      socialBattery?: number;
      grooming?: number;
      currentActivity?: string;
      location?: string;
      markWake?: boolean;
    },
    meta?: StateChangeMeta,
  ): Promise<void> {
    const state = await this.ensure(personaId);
    const next = await this.prisma.personaState.update({
      where: { personaId },
      data: {
        ...(deltas.moodValence !== undefined
          ? { moodValence: clamp(state.moodValence + deltas.moodValence, -100, 100) }
          : {}),
        ...(deltas.moodArousal !== undefined
          ? { moodArousal: clamp(state.moodArousal + deltas.moodArousal, 0, 100) }
          : {}),
        ...(deltas.moodDominance !== undefined
          ? { moodDominance: clamp(state.moodDominance + deltas.moodDominance, -100, 100) }
          : {}),
        ...(deltas.energy !== undefined
          ? { energy: clamp(state.energy + deltas.energy, 0, 100) }
          : {}),
        ...(deltas.health !== undefined
          ? { health: clamp(state.health + deltas.health, 0, 100) }
          : {}),
        ...(deltas.sleepDebt !== undefined
          ? { sleepDebt: clamp(state.sleepDebt + deltas.sleepDebt, 0, 100) }
          : {}),
        ...(deltas.stress !== undefined
          ? { stress: clamp(state.stress + deltas.stress, 0, 100) }
          : {}),
        ...(deltas.attention !== undefined
          ? { attention: clamp(state.attention + deltas.attention, 0, 100) }
          : {}),
        ...(deltas.socialBattery !== undefined
          ? { socialBattery: clamp(state.socialBattery + deltas.socialBattery, 0, 100) }
          : {}),
        ...(deltas.grooming !== undefined
          ? { grooming: clamp(state.grooming + deltas.grooming, 0, 100) }
          : {}),
        ...(deltas.currentActivity !== undefined
          ? { currentActivity: deltas.currentActivity }
          : {}),
        ...(deltas.location !== undefined ? { location: deltas.location } : {}),
        ...(deltas.markWake ? { lastWakeAt: new Date(), lastHeartbeatAt: new Date() } : {}),
      },
    });
    await this.logChanges(personaId, state, next, {
      reason: meta?.reason ?? '身体状态变化',
      source: meta?.source ?? 'EVENT',
      runId: meta?.runId,
      fieldReasons: meta?.fieldReasons,
    });
  }

  async setNextWakeAt(personaId: string, nextWakeAt: Date | null): Promise<void> {
    await this.prisma.personaState.updateMany({
      where: { personaId },
      data: { nextWakeAt },
    });
  }

  /** Schedule the next heartbeat and clear any worker lease in one write. */
  async scheduleWake(personaId: string, nextWakeAt: Date, reason: string): Promise<void> {
    await this.prisma.personaState.updateMany({
      where: { personaId },
      data: { nextWakeAt, wakeReason: reason, leaseUntil: null, leaseOwner: null },
    });
  }

  async persona(personaId: string): Promise<MindPersona> {
    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { id: personaId },
    });
    if (!persona) {
      throw new NotFoundException({ code: 'PERSONA_NOT_FOUND', message: '人格实例不存在' });
    }
    return persona;
  }

  private async drift(persona: MindPersona, state: PersonaState): Promise<PersonaState> {
    const now = Date.now();
    const hours = Math.min(48, Math.max(0, (now - state.updatedAt.getTime()) / 3_600_000));
    if (hours < 0.02) {
      return state;
    }
    const values = persona.values as Record<string, unknown> | null;
    const timeZone = readString(values?.['time_zone']) || null;
    const hour = localHour(new Date(now), timeZone);
    const sleeping = hour >= 0 && hour < 7;

    const data: Prisma.PersonaStateUpdateInput = {
      moodValence: approach(state.moodValence, 0, 0.08 * hours),
      moodArousal: approach(state.moodArousal, 45, 0.06 * hours),
      moodDominance: approach(state.moodDominance, 0, 0.05 * hours),
      energy: approach(state.energy, sleeping ? 35 : 70, 0.06 * hours),
      stress: approach(state.stress, 15, 0.05 * hours),
      socialBattery: approach(state.socialBattery, sleeping ? 90 : 65, 0.08 * hours),
      attention: approach(state.attention, sleeping ? 20 : 60, 0.1 * hours),
      sleepDebt: clamp(state.sleepDebt + (sleeping ? -4 * hours : 1.2 * hours), 0, 100),
      health: approach(state.health, 80, 0.02 * hours),
      lastHeartbeatAt: new Date(now),
    };

    if (sleeping && state.currentActivity.length === 0) {
      data.currentActivity = '睡觉';
    }

    const next = await this.prisma.personaState.update({ where: { personaId: persona.id }, data });
    await this.logChanges(persona.id, state, next, {
      reason: `自然漂移（${hours.toFixed(1)} 小时）`,
      source: 'DRIFT',
    });
    return next;
  }

  private async logChanges(
    personaId: string,
    before: PersonaState,
    after: PersonaState,
    meta: StateChangeMeta,
  ): Promise<void> {
    const rows: Prisma.PersonaChangeLogCreateManyInput[] = [];
    const reason = meta.reason ?? '';
    const source = meta.source ?? 'SYSTEM';

    for (const field of NUMERIC_STATE_FIELDS) {
      const previous = before[field];
      const next = after[field];
      if (previous === next) {
        continue;
      }
      rows.push({
        personaId,
        scope: 'STATE',
        targetId: '',
        field,
        beforeValue: previous,
        afterValue: next,
        delta: next - previous,
        reason: meta.fieldReasons?.[field] ?? reason,
        source,
        runId: meta.runId ?? null,
      });
    }

    for (const field of TEXT_STATE_FIELDS) {
      const previous = before[field];
      const next = after[field];
      if (previous === next) {
        continue;
      }
      rows.push({
        personaId,
        scope: 'STATE',
        targetId: '',
        field,
        beforeValue: previous,
        afterValue: next,
        reason: meta.fieldReasons?.[field] ?? reason,
        source,
        runId: meta.runId ?? null,
      });
    }

    if (rows.length === 0) {
      return;
    }
    try {
      await this.prisma.personaChangeLog.createMany({ data: rows });
    } catch {
      // History is auxiliary; a failed audit row must not break the state write.
    }
  }
}

function approach(current: number, target: number, rate: number): number {
  return clamp(current + (target - current) * Math.min(1, rate), 0, 100);
}

function toRecord(state: PersonaState): PersonaStateRecord {
  return {
    personaId: state.personaId,
    moodValence: state.moodValence,
    moodArousal: state.moodArousal,
    moodDominance: state.moodDominance,
    energy: state.energy,
    stress: state.stress,
    socialBattery: state.socialBattery,
    attention: state.attention,
    currentActivity: state.currentActivity,
    location: state.location,
    sleepDebt: state.sleepDebt,
    health: state.health,
    grooming: state.grooming,
    lastWakeAt: state.lastWakeAt?.toISOString() ?? null,
    nextWakeAt: state.nextWakeAt?.toISOString() ?? null,
    lastHeartbeatAt: state.lastHeartbeatAt?.toISOString() ?? null,
    updatedAt: state.updatedAt.toISOString(),
  };
}
