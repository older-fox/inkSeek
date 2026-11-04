import { Injectable, Logger } from '@nestjs/common';
import type { LongEventDraft, PersonaLongEventRecord } from '@inkseek/shared';
import { LlmService } from '../ai/llm.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { PersonaLongEvent, PersonaState } from '../generated/prisma/client.js';
import { selfTraitLines } from './mind-behavior.js';
import { MindSettingsService } from './mind-settings.service.js';
import { parseJsonObject, readString } from './mind.types.js';
import { PersonaStateService } from './persona-state.service.js';

export type LongEventWakeReason =
  'PLANNED' | 'MENTIONS' | 'KEYWORD' | 'MANUAL' | 'AGENT_END' | 'REPLACED';

export const LONG_EVENT_METRICS = [
  'moodValence',
  'moodArousal',
  'moodDominance',
  'energy',
  'health',
  'stress',
  'socialBattery',
  'attention',
  'sleepDebt',
  'grooming',
] as const;

export type LongEventMetric = (typeof LONG_EVENT_METRICS)[number];

/**
 * The persona itself decides what a finished event did to its body: the model
 * receives the event, how it ended and the current values, then returns signed
 * deltas plus a short reason per changed field.
 */
export interface LongEventSettlement {
  settled: boolean;
  kind: string;
  title: string;
  wakeReason: LongEventWakeReason;
  actualMinutes: number;
  plannedMinutes: number | null;
  triggerCount: number;
  deltas: Partial<Record<LongEventMetric, number>>;
  reasons: Partial<Record<LongEventMetric, string>>;
  activity: string | null;
  location: string | null;
  reason: string;
  providerId?: string | null;
  model?: string | null;
  error?: string;
}

export interface LongEventWakeEvaluation {
  wake: boolean;
  reason: LongEventWakeReason | null;
  keyword: string | null;
  mentions: number;
}

const DEFAULT_WAKE_KEYWORDS = [
  '醒醒',
  '起床',
  '快醒',
  '别睡了',
  '紧急',
  '急事',
  '救命',
  '出事',
  '马上回',
  '快回我',
];

const KIND_ACTIVITY: Record<string, string> = {
  SLEEP: '睡觉',
  NAP: '打盹',
  REST: '休息',
  FOCUS: '专注做事',
  AWAY: '离开一会儿',
};

const MIN_EVENT_MS = 10 * 60 * 1000;
const MAX_EVENT_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SLEEP_MS = 8 * 60 * 60 * 1000;
const DEFAULT_EVENT_MS = 2 * 60 * 60 * 1000;
const SETTLEMENT_TIMEOUT_MS = 20_000;

@Injectable()
export class PersonaLongEventService {
  private readonly logger = new Logger(PersonaLongEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: MindSettingsService,
    private readonly states: PersonaStateService,
    private readonly llm: LlmService,
  ) {}

  async active(personaId: string): Promise<PersonaLongEvent | null> {
    return this.prisma.personaLongEvent.findFirst({
      where: { personaId, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
    });
  }

  async list(personaId: string, limit = 10): Promise<PersonaLongEventRecord[]> {
    const rows = await this.prisma.personaLongEvent.findMany({
      where: { personaId },
      orderBy: { startedAt: 'desc' },
      take: Math.max(1, Math.min(50, limit)),
    });
    return rows.map(toRecord);
  }

  async start(
    personaId: string,
    draft: LongEventDraft,
    opts?: { runId?: string },
  ): Promise<{ event: PersonaLongEvent; replaced: PersonaLongEvent | null }> {
    const now = new Date();
    const replaced = await this.active(personaId);
    if (replaced) {
      await this.finish(replaced.id, 'REPLACED', opts);
    }

    const kind = normalizeKind(draft.kind);
    const plannedEndAt = resolvePlannedEnd(now, kind, draft.plannedEndAt);
    const event = await this.prisma.personaLongEvent.create({
      data: {
        personaId,
        kind,
        title: trim(draft.title, 80) || KIND_ACTIVITY[kind] || kind,
        reason: trim(draft.reason, 300),
        plannedEndAt,
        wakeMentions: clampInt(draft.wakeMentions, 3, 1, 20),
        wakeWindowMinutes: clampInt(draft.wakeWindowMinutes, 10, 1, 120),
        wakeKeywords: normalizeKeywords(draft.wakeKeywords),
      },
    });
    await this.states.applyBodyDeltas(
      personaId,
      {
        currentActivity: event.title || KIND_ACTIVITY[kind] || kind,
      },
      { reason: `开始长时事件：${event.title || kind}`, source: 'EVENT', runId: opts?.runId },
    );
    return { event, replaced };
  }

  async finish(
    eventId: string,
    wakeReason: LongEventWakeReason,
    opts?: { runId?: string; wakeText?: string },
  ): Promise<{ event: PersonaLongEvent; effects: LongEventSettlement | null }> {
    const existing = await this.prisma.personaLongEvent.findUnique({
      where: { id: eventId },
    });
    if (!existing) {
      return { event: await this.requireEvent(eventId), effects: null };
    }
    if (existing.status !== 'ACTIVE') {
      return { event: existing, effects: readSettlement(existing.effects) };
    }

    const now = new Date();
    // Claim the event before calling the model so two wake paths cannot settle
    // the same event twice and apply duplicate deltas.
    const claimed = await this.prisma.personaLongEvent.updateMany({
      where: { id: eventId, status: 'ACTIVE' },
      data: {
        status: wakeReason === 'PLANNED' ? 'COMPLETED' : 'CANCELLED',
        endedAt: now,
        wakeReason,
      },
    });
    if (claimed.count === 0) {
      const latest = await this.requireEvent(eventId);
      return { event: latest, effects: readSettlement(latest.effects) };
    }

    const effects = await this.settle(existing, wakeReason, now, opts);
    const event = await this.prisma.personaLongEvent.update({
      where: { id: eventId },
      data: { effects: effects as unknown as object },
    });
    await this.states.applyBodyDeltas(
      event.personaId,
      {
        ...effects.deltas,
        currentActivity:
          effects.activity ??
          `刚结束${event.title || KIND_ACTIVITY[event.kind.toUpperCase()] || event.kind}`,
        ...(effects.location ? { location: effects.location } : {}),
        markWake: true,
      },
      {
        reason: `长时事件结算：${event.title || event.kind}（${wakeReasonLabel(wakeReason)}）${
          effects.reason ? ` · ${effects.reason}` : ''
        }`,
        source: 'EVENT',
        runId: opts?.runId,
        fieldReasons: effects.reasons,
      },
    );
    const soon = new Date(now.getTime() + 60_000);
    await this.prisma.personaSchedule.updateMany({
      where: { personaId: event.personaId },
      data: { nextWakeAt: soon, reason: '长时事件结束', leaseUntil: null, leaseOwner: null },
    });
    await this.states.setNextWakeAt(event.personaId, soon);
    return { event, effects };
  }

  async endActive(
    personaId: string,
    wakeReason: LongEventWakeReason = 'MANUAL',
  ): Promise<{ event: PersonaLongEvent; effects: LongEventSettlement | null } | null> {
    const active = await this.active(personaId);
    if (!active) {
      return null;
    }
    return this.finish(active.id, wakeReason);
  }

  /** Applies a planner-authored START/END draft inside writeBack. */
  async applyDraft(
    personaId: string,
    draft: LongEventDraft,
    opts?: { runId?: string },
  ): Promise<{
    event: PersonaLongEvent | null;
    effects: LongEventSettlement | null;
    action: 'START' | 'END' | 'NOOP';
  }> {
    if (draft.action === 'END') {
      const active = await this.active(personaId);
      if (!active) {
        return { event: null, effects: null, action: 'NOOP' };
      }
      const result = await this.finish(active.id, 'AGENT_END', opts);
      return { event: result.event, effects: result.effects, action: 'END' };
    }
    const { event } = await this.start(personaId, draft, opts);
    return { event, effects: null, action: 'START' };
  }

  async noteStimulus(eventId: string): Promise<void> {
    await this.prisma.personaLongEvent.update({
      where: { id: eventId },
      data: { triggerCount: { increment: 1 }, lastStimulusAt: new Date() },
    });
  }

  evaluateWake(
    event: PersonaLongEvent,
    input: {
      now: Date;
      directed: boolean;
      recentMentions: number;
      text: string;
    },
  ): LongEventWakeEvaluation {
    if (event.plannedEndAt && input.now >= event.plannedEndAt) {
      return { wake: true, reason: 'PLANNED', keyword: null, mentions: input.recentMentions };
    }
    if (!input.directed) {
      return { wake: false, reason: null, keyword: null, mentions: input.recentMentions };
    }
    const keyword = matchWakeKeyword(event, input.text);
    if (keyword) {
      return { wake: true, reason: 'KEYWORD', keyword, mentions: input.recentMentions };
    }
    if (input.recentMentions >= event.wakeMentions) {
      return { wake: true, reason: 'MENTIONS', keyword: null, mentions: input.recentMentions };
    }
    return { wake: false, reason: null, keyword: null, mentions: input.recentMentions };
  }

  private async settle(
    event: PersonaLongEvent,
    wakeReason: LongEventWakeReason,
    endedAt: Date,
    opts?: { wakeText?: string },
  ): Promise<LongEventSettlement> {
    const actualMinutes = Math.max(
      0,
      Math.round((endedAt.getTime() - event.startedAt.getTime()) / 60_000),
    );
    const plannedMinutes = event.plannedEndAt
      ? Math.max(1, Math.round((event.plannedEndAt.getTime() - event.startedAt.getTime()) / 60_000))
      : null;
    const base: LongEventSettlement = {
      settled: false,
      kind: event.kind,
      title: event.title,
      wakeReason,
      actualMinutes,
      plannedMinutes,
      triggerCount: event.triggerCount,
      deltas: {},
      reasons: {},
      activity: null,
      location: null,
      reason: '',
    };

    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { id: event.personaId },
      select: { name: true, identity: true, values: true, channelId: true },
    });
    if (!persona) {
      return { ...base, error: '人格实例不存在' };
    }

    try {
      const state = await this.states.ensure(event.personaId);
      const settings = await this.settings.get(persona.channelId);
      const basePrompt = settlementPrompt({
        personaName: persona.name,
        traits: selfTraitLines(persona.values as Record<string, unknown> | null, 3),
        event,
        wakeReason,
        actualMinutes,
        plannedMinutes,
        endedAt,
        state,
        wakeText: opts?.wakeText ?? '',
      });
      const system = [
        `你就是「${persona.name}」${persona.identity ? `（${persona.identity}）` : ''}，不是助手。`,
        '不要提到 AI、模型、提示词或系统，不要用书面总结的口吻。',
        '你刚结束一段长时事件，现在诚实地判断这段经历如何改变了你的身体和心情。只输出一个 JSON 对象，不要 Markdown。',
      ].join('\n');

      let completion = await this.llm.complete({
        system,
        prompt: basePrompt,
        providerId: settings.providerId,
        model: settings.model,
        temperature: 0.4,
        maxTokens: 700,
        timeoutMs: SETTLEMENT_TIMEOUT_MS,
        source: 'mind.long-event.settlement',
      });
      let parsed = parseJsonObject(completion.text);
      if (!parsed) {
        completion = await this.llm.complete({
          system,
          prompt: `${basePrompt}\n\n上一次输出不是合法 JSON，可能被截断了。请重新输出一个完整、可解析的 JSON 对象，不要 Markdown，不要省略结尾。`,
          providerId: settings.providerId,
          model: settings.model,
          temperature: 0.3,
          maxTokens: 700,
          timeoutMs: SETTLEMENT_TIMEOUT_MS,
          source: 'mind.long-event.settlement',
        });
        parsed = parseJsonObject(completion.text);
      }
      if (!parsed) {
        return {
          ...base,
          providerId: completion.providerId,
          model: completion.model,
          error: '模型没有返回合法 JSON',
        };
      }

      const deltasRaw = asRecord(parsed['deltas']);
      const reasonsRaw = asRecord(parsed['reasons']);
      const deltas: Partial<Record<LongEventMetric, number>> = {};
      const reasons: Partial<Record<LongEventMetric, string>> = {};
      for (const field of LONG_EVENT_METRICS) {
        const raw = deltasRaw[field];
        if (typeof raw !== 'number' || !Number.isFinite(raw)) {
          continue;
        }
        const delta = Math.round(raw);
        if (delta === 0) {
          continue;
        }
        deltas[field] = delta;
        const why = readString(reasonsRaw[field]).trim();
        if (why) {
          reasons[field] = why.slice(0, 80);
        }
      }

      return {
        ...base,
        settled: true,
        deltas,
        reasons,
        activity: trim(readString(parsed['activity']), 60) || null,
        location: trim(readString(parsed['location']), 100) || null,
        reason: trim(readString(parsed['reason']), 160),
        providerId: completion.providerId,
        model: completion.model,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`长时事件结算失败：${message}`);
      return { ...base, error: message };
    }
  }

  private async requireEvent(eventId: string): Promise<PersonaLongEvent> {
    return this.prisma.personaLongEvent.findUniqueOrThrow({ where: { id: eventId } });
  }
}

function settlementPrompt(input: {
  personaName: string;
  traits: string[];
  event: PersonaLongEvent;
  wakeReason: LongEventWakeReason;
  actualMinutes: number;
  plannedMinutes: number | null;
  endedAt: Date;
  state: PersonaState;
  wakeText: string;
}): string {
  const { event, state } = input;
  const stateLines = [
    `心情好坏 ${state.moodValence}（-100 很差 .. 100 很好）`,
    `心情兴奋 ${state.moodArousal}（0 .. 100）`,
    `心情掌控 ${state.moodDominance}（-100 .. 100）`,
    `精力 ${state.energy}（0 .. 100）`,
    `健康 ${state.health}（0 .. 100）`,
    `压力 ${state.stress}（0 .. 100）`,
    `社交电量 ${state.socialBattery}（0 .. 100）`,
    `注意力 ${state.attention}（0 .. 100）`,
    `睡眠债 ${state.sleepDebt}（0 .. 100）`,
    `整洁 ${state.grooming}（0 .. 100）`,
    `正在做：${state.currentActivity || '未设定'}`,
    `位置：${state.location || '未设定'}`,
  ].join('\n');

  return [
    `长时事件刚结束。`,
    input.traits.length > 0 ? `你的性格底色：${input.traits.join('；')}` : '',
    `事件：${event.title || event.kind}（${event.kind}）`,
    `开始原因：${event.reason || '未记录'}`,
    `结束原因：${wakeReasonLabel(input.wakeReason)}`,
    `计划时长：${input.plannedMinutes ? `${input.plannedMinutes} 分钟` : '没有计划结束'}`,
    `实际时长：${input.actualMinutes} 分钟`,
    `事件期间被点名：${event.triggerCount} 次`,
    input.wakeText ? `叫醒你的消息：「${input.wakeText.slice(0, 200)}」` : '',
    `结束时间：${input.endedAt.toISOString()}`,
    '',
    `你结束时的身体状态：`,
    stateLines,
    '',
    '请以这个人的身份，判断这段经历实际对身体和心情的影响。',
    `- 考虑事件类型（${event.kind}）、是否按计划完成、是被叫醒还是自然结束、期间有没有被打扰。`,
    '- 不要机械套用睡眠规则；没有受到影响的指标就不要改。',
    '- deltas 是相对当前值的整数增减，可正可负；没有变化的字段不要写。',
    '- reasons 给每个变化字段写不超过 30 字的理由。',
    '- activity 是醒来后正在做的事，location 是所在位置；不确定就省略。',
    '- 只输出 JSON，格式：{"deltas":{"energy":0},"reasons":{"energy":"..."},"activity":"...","location":"...","reason":"一句话总结这次结算"}',
    '- 可用字段：' + LONG_EVENT_METRICS.join('、') + '。',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function readSettlement(value: unknown): LongEventSettlement | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LongEventSettlement)
    : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function matchWakeKeyword(
  event: Pick<PersonaLongEvent, 'wakeKeywords'>,
  text: string,
): string | null {
  const normalized = text.replace(/\s+/gu, '');
  const keywords = [...DEFAULT_WAKE_KEYWORDS, ...event.wakeKeywords]
    .map((keyword) => keyword.replace(/\s+/gu, ''))
    .filter(Boolean);
  return keywords.find((keyword) => normalized.includes(keyword)) ?? null;
}

function wakeReasonLabel(reason: LongEventWakeReason): string {
  switch (reason) {
    case 'PLANNED':
      return '到点';
    case 'MENTIONS':
      return '重复点名';
    case 'KEYWORD':
      return '强制叫醒';
    case 'MANUAL':
      return '手动结束';
    case 'AGENT_END':
      return '主动结束';
    case 'REPLACED':
      return '被新事件替换';
    default:
      return reason;
  }
}

function resolvePlannedEnd(now: Date, kind: string, plannedEndAt?: string): Date {
  const fallback = kind === 'SLEEP' ? DEFAULT_SLEEP_MS : DEFAULT_EVENT_MS;
  const parsed = plannedEndAt ? new Date(plannedEndAt) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return new Date(now.getTime() + fallback);
  }
  return new Date(
    Math.min(
      now.getTime() + MAX_EVENT_MS,
      Math.max(now.getTime() + MIN_EVENT_MS, parsed.getTime()),
    ),
  );
}

function normalizeKind(value?: string): string {
  const kind = (value ?? 'SLEEP')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/gu, '')
    .slice(0, 20);
  return kind || 'SLEEP';
}

function normalizeKeywords(value?: string[]): string[] {
  return (value ?? [])
    .map((keyword) => keyword.trim().slice(0, 20))
    .filter(Boolean)
    .slice(0, 8);
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function trim(value: string | undefined, max: number): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

export function toRecord(row: PersonaLongEvent): PersonaLongEventRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    kind: row.kind,
    title: row.title,
    status: row.status as PersonaLongEventRecord['status'],
    reason: row.reason,
    startedAt: row.startedAt.toISOString(),
    plannedEndAt: row.plannedEndAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    wakeMentions: row.wakeMentions,
    wakeWindowMinutes: row.wakeWindowMinutes,
    wakeKeywords: row.wakeKeywords,
    triggerCount: row.triggerCount,
    lastStimulusAt: row.lastStimulusAt?.toISOString() ?? null,
    wakeReason: row.wakeReason,
    effects: row.effects,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
