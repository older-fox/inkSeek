import { Injectable } from '@nestjs/common';
import {
  relationshipAttributePatch,
  type ActionPlan,
  type PersonaGroupStanceUpdateInput,
  type PersonaRelationshipRecord,
  type PersonaRelationshipUpdateInput,
  type RelationshipAttributeRejection,
  type RelationshipSignal,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isSelfTraitKey, type SelfTraitKey } from './mind-behavior.js';
import { PersonaGroupStanceService } from './persona-group-stance.service.js';
import { PersonaRelationshipService } from './persona-relationship.service.js';
import { PersonaStateService } from './persona-state.service.js';
import { clamp, readString, type MindScene } from './mind.types.js';

const DAY_MS = 24 * 3600_000;

const SELF_PER_TURN = 1;
const SELF_DAILY = 4;
const SELF_COOLDOWN_MS = 45 * 60_000;

const GROUP_PER_TURN = 2;
const GROUP_DAILY = 8;
const GROUP_COOLDOWN_MS = 30 * 60_000;

const RELATION_PER_TURN = 5;
const RELATION_DAILY = 10;
const RELATION_COOLDOWN_MS = 10 * 60_000;

const GROOMING_PER_TURN = 8;
const GROOMING_DAILY = 30;
const GROOMING_COOLDOWN_MS = 5 * 60_000;

const GROUP_FIELDS = [
  'comfort',
  'belonging',
  'attention',
  'formality',
  'speakRate',
  'audienceRisk',
] as const;

type GroupField = (typeof GROUP_FIELDS)[number];

const RELATION_FIELDS = [
  'affinity',
  'trust',
  'intimacy',
  'attraction',
  'hostility',
  'fear',
  'respect',
  'obligation',
  'dependency',
  'possessiveness',
  'friction',
  'unresolvedConflict',
  'familiarity',
] as const;

type RelationField = (typeof RELATION_FIELDS)[number];

interface LedgerEntry {
  sum: number;
  lastAt: Date;
}

export interface DriftSummary {
  activity: string | null;
  grooming: number | null;
  selfTraits: Record<string, number>;
  group: Record<string, number>;
  relations: { contactId: string; deltas: Record<string, number> }[];
}

/**
 * Applies post-turn drift with deterministic limits. The model may propose
 * changes every turn, but this service decides whether they are small enough,
 * recent enough and within the daily budget to actually land. It never owns a
 * second copy of any value.
 */
@Injectable()
export class MindDriftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: PersonaRelationshipService,
    private readonly stances: PersonaGroupStanceService,
    private readonly states: PersonaStateService,
  ) {}

  async applyTurn(scene: MindScene, plan: ActionPlan): Promise<DriftSummary> {
    const ledger = await this.loadLedger(scene.persona.id);
    const summary: DriftSummary = {
      activity: null,
      grooming: null,
      selfTraits: {},
      group: {},
      relations: [],
    };

    const activity = await this.applyActivity(scene, plan, ledger);
    if (activity.activity) {
      summary.activity = activity.activity;
    }
    summary.grooming = activity.grooming;

    const selfTraits = await this.applySelfTraits(scene, plan, ledger);
    summary.selfTraits = selfTraits.values;

    const group = await this.applyGroupStance(scene, plan, ledger);
    summary.group = group;

    const relations = await this.applyRelationships(scene, plan, ledger);
    summary.relations = relations;
    return summary;
  }

  /**
   * Explicit relationship patch requested through the `relationship.update`
   * tool. Numeric fields still obey per-turn spans, daily caps and cooldowns;
   * qualitative fields (tags, addresses, boundaries, promises...) write
   * directly because they are not scores.
   */
  async applyRelationshipPatch(input: {
    personaId: string;
    contactId: string;
    numeric: Record<string, number>;
    fields?: Omit<PersonaRelationshipUpdateInput, 'contactId'>;
    attributes?: unknown;
    reason?: string;
  }): Promise<{
    contactId: string;
    applied: Record<string, number>;
    blocked: string[];
    relationship: PersonaRelationshipRecord;
    attributesUpdated: string[];
    attributesRejected: RelationshipAttributeRejection[];
  }> {
    const current = await this.relationships.get(input.personaId, input.contactId);
    const attributePatch =
      input.attributes === undefined ? null : relationshipAttributePatch(input.attributes, current);
    const numeric = { ...attributePatch?.numeric, ...input.numeric };
    const patch: PersonaRelationshipUpdateInput = {
      contactId: input.contactId,
      ...attributePatch?.fields,
      ...input.fields,
    };
    const ledger = await this.loadLedger(input.personaId);
    const applied: Record<string, number> = {};
    const blocked: string[] = [];
    const attributesUpdated = attributePatch?.updated ?? [];
    const attributesRejected = attributePatch?.rejected ?? [];

    if (Object.keys(numeric).length === 0 && Object.keys(patch).length <= 1) {
      return {
        contactId: input.contactId,
        applied,
        blocked,
        relationship: current,
        attributesUpdated,
        attributesRejected,
      };
    }

    for (const field of RELATION_FIELDS) {
      const desiredRaw = numeric[field];
      if (typeof desiredRaw !== 'number' || !Number.isFinite(desiredRaw)) {
        continue;
      }
      const desired = clamp(desiredRaw, -100, 100);
      if (desired === current[field]) {
        continue;
      }
      const delta = this.limitDelta({
        ledger,
        scope: 'RELATION',
        targetId: input.contactId,
        key: field,
        proposed: desired - current[field],
        perTurn: RELATION_PER_TURN,
        daily: RELATION_DAILY,
        cooldownMs: RELATION_COOLDOWN_MS,
      });
      if (delta === 0) {
        blocked.push(field);
        continue;
      }
      const next = clamp(current[field] + delta, -100, 100);
      const actual = next - current[field];
      if (actual === 0) {
        blocked.push(field);
        continue;
      }
      patch[field] = next;
      applied[field] = actual;
      this.remember(ledger, 'RELATION', input.contactId, field, actual);
    }

    const relationship = await this.relationships.update(input.personaId, patch, {
      kind: 'TOOL',
      reason: input.reason || '人格通过工具调整关系',
    });
    return {
      contactId: input.contactId,
      applied,
      blocked,
      relationship,
      attributesUpdated,
      attributesRejected,
    };
  }

  private async applyActivity(
    scene: MindScene,
    plan: ActionPlan,
    ledger: Map<string, LedgerEntry>,
  ): Promise<{ activity: string | null; grooming: number | null }> {
    const activity = readString(plan.self?.activity).trim().slice(0, 80);
    if (!activity) {
      return { activity: null, grooming: null };
    }
    const state = await this.prisma.personaState.findUnique({
      where: { personaId: scene.persona.id },
      select: { currentActivity: true, grooming: true },
    });
    if (!state || state.currentActivity === activity) {
      return { activity: null, grooming: null };
    }

    let nextGrooming: number | null = null;
    const proposed = groomingDeltaForActivity(activity);
    if (proposed !== 0) {
      const delta = this.limitDelta({
        ledger,
        scope: 'STATE',
        targetId: '',
        key: 'grooming',
        proposed,
        perTurn: GROOMING_PER_TURN,
        daily: GROOMING_DAILY,
        cooldownMs: GROOMING_COOLDOWN_MS,
      });
      if (delta !== 0) {
        const next = clamp(state.grooming + delta, 0, 100);
        const actual = next - state.grooming;
        if (actual !== 0) {
          nextGrooming = next;
          this.remember(ledger, 'STATE', '', 'grooming', actual);
        }
      }
    }

    await this.states.applyBodyDeltas(
      scene.persona.id,
      {
        currentActivity: activity,
        ...(nextGrooming !== null ? { grooming: nextGrooming - state.grooming } : {}),
      },
      { reason: `活动变化：${activity}`, source: 'DRIFT' },
    );
    return { activity, grooming: nextGrooming };
  }

  private async applySelfTraits(
    scene: MindScene,
    plan: ActionPlan,
    ledger: Map<string, LedgerEntry>,
  ): Promise<{ values: Record<string, number> }> {
    const proposed = plan.self?.traits;
    if (!proposed) {
      return { values: {} };
    }
    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { id: scene.persona.id },
      select: { values: true },
    });
    const stored = persona?.values;
    const values = isObject(stored) ? { ...stored } : {};
    const changes: Record<string, number> = {};
    const logRows: Prisma.PersonaChangeLogCreateManyInput[] = [];
    const reason = readString(plan.self?.reason) || plan.reason;

    const candidates = Object.entries(proposed)
      .filter((entry): entry is [SelfTraitKey, number] => {
        const [key, delta] = entry;
        return isSelfTraitKey(key) && Number.isFinite(delta) && Math.abs(delta) >= 0.5;
      })
      .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]));

    for (const [key, raw] of candidates) {
      const current = numeric(values[key]);
      if (current === null) {
        continue;
      }
      const delta = this.limitDelta({
        ledger,
        scope: 'SELF',
        targetId: '',
        key,
        proposed: raw,
        perTurn: SELF_PER_TURN,
        daily: SELF_DAILY,
        cooldownMs: SELF_COOLDOWN_MS,
      });
      if (delta === 0) {
        continue;
      }
      const next = clamp(current + delta, 0, 100);
      const actual = next - current;
      if (actual === 0) {
        continue;
      }
      values[key] = next;
      changes[key] = actual;
      logRows.push({
        personaId: scene.persona.id,
        scope: 'SELF',
        targetId: '',
        field: key,
        beforeValue: current,
        afterValue: next,
        delta: actual,
        reason,
        source: 'DRIFT',
      });
      this.remember(ledger, 'SELF', '', key, actual);
    }

    if (Object.keys(changes).length > 0) {
      await this.prisma.chatChannelPersona.update({
        where: { id: scene.persona.id },
        data: { values: values as Prisma.InputJsonValue },
      });
      await this.prisma.personaChangeLog.createMany({ data: logRows });
    }
    return { values: changes };
  }

  private async applyGroupStance(
    scene: MindScene,
    plan: ActionPlan,
    ledger: Map<string, LedgerEntry>,
  ): Promise<Record<string, number>> {
    const signal = plan.groupStance;
    if (!signal || scene.conversation.kind !== 'GROUP') {
      return {};
    }
    const stance = await this.stances.get(scene.persona.id, scene.conversation.id);
    const changes: Record<string, number> = {};
    const reason = readString(signal.reason) || plan.reason;

    const candidates = GROUP_FIELDS.map((field) => ({ field, raw: signal[field] }))
      .filter(
        (item): item is { field: GroupField; raw: number } =>
          typeof item.raw === 'number' && Number.isFinite(item.raw) && Math.abs(item.raw) >= 0.5,
      )
      .sort((left, right) => Math.abs(right.raw) - Math.abs(left.raw));

    for (const { field, raw } of candidates) {
      const delta = this.limitDelta({
        ledger,
        scope: 'GROUP',
        targetId: scene.conversation.id,
        key: field,
        proposed: raw,
        perTurn: GROUP_PER_TURN,
        daily: GROUP_DAILY,
        cooldownMs: GROUP_COOLDOWN_MS,
      });
      if (delta === 0) {
        continue;
      }
      const next = clamp(stance[field] + delta, 0, 100);
      const actual = next - stance[field];
      if (actual === 0) {
        continue;
      }
      changes[field] = actual;
      this.remember(ledger, 'GROUP', scene.conversation.id, field, actual);
    }

    const topic = readString(signal.topic).trim().slice(0, 80);
    const patch: PersonaGroupStanceUpdateInput = { conversationId: scene.conversation.id };
    for (const [field, actual] of Object.entries(changes)) {
      patch[field as GroupField] = actual;
    }
    if (topic && topic !== stance.topic) {
      patch.topic = topic;
    }
    if (Object.keys(patch).length > 1) {
      await this.stances.update(scene.persona.id, patch, { source: 'DRIFT', reason });
    }
    return changes;
  }

  private async applyRelationships(
    scene: MindScene,
    plan: ActionPlan,
    ledger: Map<string, LedgerEntry>,
  ): Promise<{ contactId: string; deltas: Record<string, number> }[]> {
    if (plan.relationshipSignals.length === 0) {
      return [];
    }
    const known = new Set(scene.cast.map((member) => member.contactId));
    const accepted: RelationshipSignal[] = [];
    const summary: { contactId: string; deltas: Record<string, number> }[] = [];

    for (const signal of plan.relationshipSignals) {
      if (!known.has(signal.contactId)) {
        continue;
      }
      const member = scene.cast.find((cast) => cast.contactId === signal.contactId);
      const currentRelationship = await this.relationships
        .get(scene.persona.id, signal.contactId)
        .catch(() => null);
      const deltas: Record<string, number> = {};
      const candidates = RELATION_FIELDS.map((field) => ({ field, raw: signal[field] }))
        .filter(
          (item): item is { field: RelationField; raw: number } =>
            typeof item.raw === 'number' && Number.isFinite(item.raw) && Math.abs(item.raw) >= 0.5,
        )
        .sort((left, right) => Math.abs(right.raw) - Math.abs(left.raw));

      for (const { field, raw } of candidates) {
        const delta = this.limitDelta({
          ledger,
          scope: 'RELATION',
          targetId: signal.contactId,
          key: field,
          proposed: raw,
          perTurn: RELATION_PER_TURN,
          daily: RELATION_DAILY,
          cooldownMs: RELATION_COOLDOWN_MS,
        });
        if (delta === 0) {
          continue;
        }
        const current = currentRelationship?.[field] ?? member?.relationship?.[field] ?? 0;
        const actual = clamp(current + delta, -100, 100) - current;
        if (actual === 0) {
          continue;
        }
        deltas[field] = actual;
        this.remember(ledger, 'RELATION', signal.contactId, field, actual);
      }

      if (Object.keys(deltas).length === 0) {
        continue;
      }
      accepted.push({
        ...signal,
        ...deltas,
        ...(signal.reason ? { reason: signal.reason } : {}),
      });
      summary.push({ contactId: signal.contactId, deltas });
    }

    if (accepted.length > 0) {
      await this.relationships.applySignals(scene.persona.id, accepted, plan.reason, 'DRIFT');
    }
    return summary;
  }

  private async loadLedger(personaId: string): Promise<Map<string, LedgerEntry>> {
    const rows = await this.prisma.personaChangeLog.findMany({
      where: {
        personaId,
        createdAt: { gte: new Date(Date.now() - DAY_MS) },
        source: { in: ['DRIFT', 'TOOL'] },
        delta: { not: null },
      },
      select: { scope: true, targetId: true, field: true, delta: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const ledger = new Map<string, LedgerEntry>();
    for (const row of rows) {
      const delta = row.delta ?? 0;
      const id = ledgerKey(row.scope, row.targetId, row.field);
      const entry = ledger.get(id);
      if (entry) {
        entry.sum += delta;
        if (row.createdAt > entry.lastAt) {
          entry.lastAt = row.createdAt;
        }
      } else {
        ledger.set(id, { sum: delta, lastAt: row.createdAt });
      }
    }
    return ledger;
  }

  private limitDelta(input: {
    ledger: Map<string, LedgerEntry>;
    scope: string;
    targetId: string;
    key: string;
    proposed: number;
    perTurn: number;
    daily: number;
    cooldownMs: number;
  }): number {
    const id = ledgerKey(input.scope, input.targetId, input.key);
    const entry = input.ledger.get(id);
    if (entry && Date.now() - entry.lastAt.getTime() < input.cooldownMs) {
      return 0;
    }
    let delta = Math.round(clamp(input.proposed, -input.perTurn, input.perTurn));
    if (delta === 0) {
      return 0;
    }
    const daySum = entry?.sum ?? 0;
    if (daySum !== 0 && Math.sign(delta) === Math.sign(daySum)) {
      const remaining = input.daily - Math.abs(daySum);
      if (remaining <= 0) {
        return 0;
      }
      delta = Math.sign(delta) * Math.min(Math.abs(delta), remaining);
    }
    return delta;
  }

  private remember(
    ledger: Map<string, LedgerEntry>,
    scope: string,
    targetId: string,
    key: string,
    delta: number,
  ): void {
    const id = ledgerKey(scope, targetId, key);
    const existing = ledger.get(id);
    const now = new Date();
    ledger.set(id, {
      sum: (existing?.sum ?? 0) + delta,
      lastAt: now,
    });
  }
}

const GROOMING_EVENTS: { pattern: RegExp; delta: number }[] = [
  {
    pattern:
      /洗[了完过好]?澡|冲澡|洗澡|洗漱|淋浴|泡澡|洗脸|刷牙|换[了完好]?衣|整理|收拾|梳头|化妆|护肤|擦身/u,
    delta: 12,
  },
  {
    pattern:
      /跑步|晨跑|夜跑|健身|运动|打球|踢球|游泳|爬山|徒步|骑行|淋雨|雨里|摔|泥|汗|搬|打扫|清理|干活|做家务/u,
    delta: -8,
  },
  {
    pattern: /出门|散步|逛街|通勤|上班|下班|买菜|骑车|坐车|挤地铁|赶路/u,
    delta: -3,
  },
];

/**
 * Grooming changes with concrete events instead of drifting on its own:
 * exercise/rain/dirt lower it, washing/tidying raise it. The per-turn and
 * daily caps live in applyActivity so a single chat turn cannot reset it.
 */
function groomingDeltaForActivity(activity: string): number {
  for (const event of GROOMING_EVENTS) {
    if (event.pattern.test(activity)) {
      return event.delta;
    }
  }
  return 0;
}

function ledgerKey(scope: string, targetId: string, key: string): string {
  return `${scope}|${targetId}|${key}`;
}

function numeric(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
