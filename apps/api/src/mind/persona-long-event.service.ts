import { Injectable, Logger } from '@nestjs/common';
import type { LongEventDraft, PersonaLongEventRecord } from '@inkseek/shared';
import { LlmService } from '../ai/llm.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { PersonaLongEvent, PersonaState } from '../generated/prisma/client.js';
import { selfTraitLines } from './mind-behavior.js';
import { criticalAdvisory } from './mind-fatigue.js';
import { MindSettingsService } from './mind-settings.service.js';
import {
  localHour,
  normalizeTimeZone,
  parseJsonObject,
  readNumber,
  readString,
  type MindSleepBrief,
} from './mind.types.js';
import { PersonaStateService } from './persona-state.service.js';

export type LongEventWakeReason =
  'PLANNED' | 'MENTIONS' | 'KEYWORD' | 'JUDGMENT' | 'MANUAL' | 'AGENT_END' | 'REPLACED';

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
  urgency: number | null;
  judgeReason: string | null;
  source: 'RULE' | 'MODEL' | 'FALLBACK';
  error?: string;
}

const KIND_ACTIVITY: Record<string, string> = {
  SLEEP: '睡觉',
  NAP: '打盹',
  REST: '休息',
  FOCUS: '专注做事',
  AWAY: '离开一会儿',
};

const MIN_EVENT_MS = 10 * 60 * 1000;
const MAX_EVENT_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EVENT_MS = 60 * 60 * 1000;
const MIN_SLEEP_FALLBACK_MS = 5 * 60 * 60 * 1000;
const MAX_SLEEP_FALLBACK_MS = 10 * 60 * 60 * 1000;
const SETTLEMENT_TIMEOUT_MS = 20_000;
const WAKE_JUDGE_TIMEOUT_MS = 12_000;
const REST_SUGGEST_AWAKE_HOURS = 16;

@Injectable()
export class PersonaLongEventService {
  private readonly logger = new Logger(PersonaLongEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: MindSettingsService,
    private readonly states: PersonaStateService,
    private readonly llm: LlmService,
  ) {}

  /** The event currently running, if any; a persona holds at most one at a time. */
  async active(personaId: string): Promise<PersonaLongEvent | null> {
    return this.prisma.personaLongEvent.findFirst({
      where: { personaId, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** Recent events for the mind panel, newest first. */
  async list(personaId: string, limit = 10): Promise<PersonaLongEventRecord[]> {
    const rows = await this.prisma.personaLongEvent.findMany({
      where: { personaId },
      orderBy: { startedAt: 'desc' },
      take: Math.max(1, Math.min(50, limit)),
    });
    return rows.map(toRecord);
  }

  /** Replaces any running event, then defers the end time and activity text to the state service. */
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
    const state = await this.states.ensure(personaId);
    const plannedEndAt = resolvePlannedEnd(now, kind, draft.plannedEndAt, state.sleepDebt);
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

  /** Claims the event before settling, so two wake paths cannot double-apply its deltas. */
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
        status: wakeReason === 'PLANNED' || wakeReason === 'JUDGMENT' ? 'COMPLETED' : 'CANCELLED',
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
    await this.states.scheduleWake(event.personaId, soon, '长时事件结束');
    return { event, effects };
  }

  /** Ends whatever is running; null when the persona is already awake. */
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

  /** Counts a nudge aimed at a resting persona, feeding the mention wake threshold. */
  async noteStimulus(eventId: string): Promise<void> {
    await this.prisma.personaLongEvent.update({
      where: { id: eventId },
      data: { triggerCount: { increment: 1 }, lastStimulusAt: new Date() },
    });
  }

  /** Backend facts plus a non-binding duration suggestion for the planner prompt. */
  async sleepBrief(
    personaId: string,
    state: PersonaState,
    values: Record<string, unknown> | null,
  ): Promise<MindSleepBrief> {
    const now = new Date();
    const zone = normalizeTimeZone(readString(values?.['time_zone']));
    const sleepDepth = clampInt(readNumber(values?.['sleep_depth'], 2), 2, 0, 4);
    const last = await this.prisma.personaLongEvent.findFirst({
      where: {
        personaId,
        kind: { in: ['SLEEP', 'NAP'] },
        status: { in: ['COMPLETED', 'CANCELLED'] },
        endedAt: { not: null },
      },
      orderBy: { endedAt: 'desc' },
    });
    const lastEnd = last?.endedAt ?? state.lastWakeAt;
    const awakeMinutes = lastEnd
      ? Math.max(0, Math.round((now.getTime() - lastEnd.getTime()) / 60_000))
      : null;
    const endedAt = last?.endedAt ?? null;
    const critical = criticalAdvisory(awakeMinutes, {
      health: state.health,
      sleepDebt: state.sleepDebt,
      stress: state.stress,
    });
    return {
      localTime: localClock(now, zone),
      timeZone: zone ?? 'server-local',
      sleepDepth,
      lastSleep:
        last && endedAt
          ? {
              kind: last.kind,
              title: last.title || KIND_ACTIVITY[last.kind] || last.kind,
              minutes: Math.max(
                1,
                Math.round((endedAt.getTime() - last.startedAt.getTime()) / 60_000),
              ),
              plannedMinutes: last.plannedEndAt
                ? Math.max(
                    1,
                    Math.round((last.plannedEndAt.getTime() - last.startedAt.getTime()) / 60_000),
                  )
                : null,
              endedAt: endedAt.toISOString(),
            }
          : null,
      awakeMinutes,
      sleepDebt: state.sleepDebt,
      energy: state.energy,
      health: state.health,
      stress: state.stress,
      criticalWarnings: critical.warnings,
      suggestion: suggestRest({
        hour: localHour(now, zone),
        sleepDebt: state.sleepDebt,
        energy: state.energy,
        awakeMinutes,
        sleepDepth,
      }),
    };
  }

  /**
   * Planned end wakes without a model call. Being addressed wakes only if the
   * persona decides it is worth it; a model failure falls back to the event's
   * own reminder words and mention threshold.
   */
  async judgeWake(
    event: PersonaLongEvent,
    input: {
      now: Date;
      directed: boolean;
      recentMentions: number;
      text: string;
      senderName?: string;
    },
  ): Promise<LongEventWakeEvaluation> {
    const base: LongEventWakeEvaluation = {
      wake: false,
      reason: null,
      keyword: null,
      mentions: input.recentMentions,
      urgency: null,
      judgeReason: null,
      source: 'RULE',
    };
    if (event.plannedEndAt && input.now >= event.plannedEndAt) {
      return { ...base, wake: true, reason: 'PLANNED' };
    }
    if (!input.directed) {
      return base;
    }

    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { id: event.personaId },
      select: { name: true, identity: true, values: true, channelId: true },
    });
    if (!persona) {
      return this.fallbackWake(event, input, '人格实例不存在');
    }

    try {
      const [settings, state] = await Promise.all([
        this.settings.get(persona.channelId),
        this.states.ensure(event.personaId),
      ]);
      const values = persona.values as Record<string, unknown> | null;
      const sleepDepth = clampInt(readNumber(values?.['sleep_depth'], 2), 2, 0, 4);
      const awakeBeforeMinutes = await this.awakeMinutesBefore(event, state);
      const critical = criticalAdvisory(awakeBeforeMinutes, {
        health: state.health,
        sleepDebt: state.sleepDebt,
        stress: state.stress,
      });
      const prompt = wakeJudgePrompt({
        personaName: persona.name,
        identity: persona.identity,
        event,
        state,
        sleepDepth,
        now: input.now,
        senderName: input.senderName ?? '',
        text: input.text,
        mentions: input.recentMentions,
        awakeBeforeMinutes,
        criticalWarnings: critical.warnings,
      });
      const system = [
        `你就是「${persona.name}」${persona.identity ? `（${persona.identity}）` : ''}，正在休息，不是助手。`,
        '不要提到 AI、模型、提示词或系统。只输出一个 JSON 对象，不要 Markdown。',
      ].join('\n');

      let completion = await this.llm.complete({
        system,
        prompt,
        providerId: settings.providerId,
        model: settings.model,
        temperature: 0.2,
        maxTokens: 220,
        timeoutMs: WAKE_JUDGE_TIMEOUT_MS,
        source: 'mind.long-event.wake',
      });
      let parsed = parseJsonObject(completion.text);
      if (!parsed) {
        completion = await this.llm.complete({
          system,
          prompt: `${prompt}\n\n上一次输出不是合法 JSON。请重新输出一个完整、可解析的 JSON 对象。`,
          providerId: settings.providerId,
          model: settings.model,
          temperature: 0.1,
          maxTokens: 220,
          timeoutMs: WAKE_JUDGE_TIMEOUT_MS,
          source: 'mind.long-event.wake',
        });
        parsed = parseJsonObject(completion.text);
      }
      if (!parsed) {
        return this.fallbackWake(event, input, '模型没有返回合法 JSON');
      }

      const urgency = clampInt(readNumber(parsed['urgency'], 50), 50, 0, 100);
      const judgeReason = trim(readString(parsed['reason']), 120);
      if (parsed['wake'] !== true) {
        return { ...base, urgency, judgeReason: judgeReason || null, source: 'MODEL' };
      }
      const keyword = matchWakeKeyword(event, input.text);
      return {
        wake: true,
        reason: keyword ? 'KEYWORD' : 'JUDGMENT',
        keyword,
        mentions: input.recentMentions,
        urgency,
        judgeReason: judgeReason || null,
        source: 'MODEL',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`长时事件唤醒判定失败：${message}`);
      return this.fallbackWake(event, input, message);
    }
  }

  /** Minutes awake before this event began, from the previous sleep or last wake marker. */
  private async awakeMinutesBefore(
    event: PersonaLongEvent,
    state: PersonaState,
  ): Promise<number | null> {
    const previous = await this.prisma.personaLongEvent.findFirst({
      where: {
        personaId: event.personaId,
        id: { not: event.id },
        kind: { in: ['SLEEP', 'NAP'] },
        endedAt: { not: null, lte: event.startedAt },
      },
      orderBy: { endedAt: 'desc' },
      select: { endedAt: true },
    });
    const lastWake =
      previous?.endedAt ??
      (state.lastWakeAt && state.lastWakeAt <= event.startedAt ? state.lastWakeAt : null);
    if (!lastWake) {
      return null;
    }
    return Math.max(0, Math.round((event.startedAt.getTime() - lastWake.getTime()) / 60_000));
  }

  /** Rule-only decision when the model fails: keywords first, then accumulated mentions. */
  private fallbackWake(
    event: PersonaLongEvent,
    input: { recentMentions: number; text: string },
    error: string,
  ): LongEventWakeEvaluation {
    const base: LongEventWakeEvaluation = {
      wake: false,
      reason: null,
      keyword: null,
      mentions: input.recentMentions,
      urgency: null,
      judgeReason: null,
      source: 'FALLBACK',
      error,
    };
    const keyword = matchWakeKeyword(event, input.text);
    if (keyword) {
      return {
        ...base,
        wake: true,
        reason: 'KEYWORD',
        keyword,
        judgeReason: `判定失败，命中提醒词「${keyword}」`,
      };
    }
    if (input.recentMentions >= event.wakeMentions) {
      return {
        ...base,
        wake: true,
        reason: 'MENTIONS',
        judgeReason: `判定失败，点名达到 ${event.wakeMentions} 次`,
      };
    }
    return { ...base, judgeReason: '判定失败，未达到提醒阈值，继续休息' };
  }

  /** Asks the model for signed body deltas; failures still return a usable result carrying `error`. */
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
        sleepDepth: clampInt(
          readNumber((persona.values as Record<string, unknown> | null)?.['sleep_depth'], 2),
          2,
          0,
          4,
        ),
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

  /** Throws when the row disappeared mid-flight, which only happens on manual deletion. */
  private async requireEvent(eventId: string): Promise<PersonaLongEvent> {
    return this.prisma.personaLongEvent.findUniqueOrThrow({ where: { id: eventId } });
  }
}

/** End-of-event prompt: event facts, current body values and the JSON contract. */
function settlementPrompt(input: {
  personaName: string;
  traits: string[];
  event: PersonaLongEvent;
  wakeReason: LongEventWakeReason;
  actualMinutes: number;
  plannedMinutes: number | null;
  endedAt: Date;
  state: PersonaState;
  sleepDepth: number;
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
    `睡眠深度 ${input.sleepDepth}/4（越高越难被叫醒）`,
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

/** "Should I wake up" prompt with sender, depth, elapsed time and critical reminders. */
function wakeJudgePrompt(input: {
  personaName: string;
  identity: string;
  event: PersonaLongEvent;
  state: PersonaState;
  sleepDepth: number;
  now: Date;
  senderName: string;
  text: string;
  mentions: number;
  awakeBeforeMinutes: number | null;
  criticalWarnings: string[];
}): string {
  const elapsedMinutes = Math.max(
    0,
    Math.round((input.now.getTime() - input.event.startedAt.getTime()) / 60_000),
  );
  const plannedMinutes = input.event.plannedEndAt
    ? Math.round((input.event.plannedEndAt.getTime() - input.event.startedAt.getTime()) / 60_000)
    : null;
  const depthLabel =
    input.sleepDepth >= 4
      ? '很深，很难被叫醒'
      : input.sleepDepth === 3
        ? '偏深，要费点劲'
        : input.sleepDepth === 1
          ? '偏浅，容易醒'
          : input.sleepDepth === 0
            ? '很浅，一有动静就会醒'
            : '一般';
  const keywords = input.event.wakeKeywords.filter(Boolean);
  return [
    `你正在「${input.event.title || input.event.kind}」中（${input.event.kind}），不是助手。`,
    input.event.reason ? `开始原因：${input.event.reason}` : '',
    `已经过去 ${elapsedMinutes} 分钟${plannedMinutes ? `，原计划 ${plannedMinutes} 分钟` : ''}。`,
    `睡眠深度 ${input.sleepDepth}/4（${depthLabel}）。`,
    `现在：精力 ${input.state.energy}、睡眠债 ${input.state.sleepDebt}、压力 ${input.state.stress}、心情好坏 ${input.state.moodValence}。`,
    input.awakeBeforeMinutes !== null
      ? `睡前已经连续清醒约 ${formatHours(input.awakeBeforeMinutes / 60)}。`
      : '',
    ...input.criticalWarnings.map((warning) => `临界提醒：${warning}`),
    input.criticalWarnings.length > 0
      ? '这些只是临界提醒；醒不醒、要不要继续睡，由你自己判断。'
      : '',
    `最近 ${input.event.wakeWindowMinutes} 分钟内被点名 ${input.mentions} 次；平时大约 ${input.event.wakeMentions} 次才算一直被叫。`,
    keywords.length > 0 ? `睡前你在意的词：${keywords.join('、')}（只是参考，不是硬规则）。` : '',
    '',
    `现在${input.senderName ? `「${input.senderName}」` : '有人'}对你说：「${input.text.slice(0, 300)}」`,
    '',
    '判断你要不要现在醒来：谁在叫你、语气急不急、事情是不是真的重要、你睡得多深、身体有多累。',
    '普通闲聊、可以晚点回的消息，就继续休息；真正的急事、重要的人、反复叫你，可以考虑醒。',
    '不要因为被叫了一次就机械醒来，也不要无视明显紧急的事。',
    '只输出 JSON：{"wake":true|false,"urgency":0-100,"reason":"不超过40字的内心理由"}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Non-binding rest hint: night, debt, low energy and long wakefulness push toward sleep. */
function suggestRest(input: {
  hour: number;
  sleepDebt: number;
  energy: number;
  awakeMinutes: number | null;
  sleepDepth: number;
}): MindSleepBrief['suggestion'] {
  const awakeHours = input.awakeMinutes === null ? null : input.awakeMinutes / 60;
  const night = input.hour >= 21 || input.hour < 6;
  const afternoon = input.hour >= 12 && input.hour < 17;
  const sleepDepthExtra = (input.sleepDepth - 2) * 15;

  if (
    night ||
    input.sleepDebt >= 55 ||
    input.energy <= 25 ||
    (awakeHours !== null && awakeHours >= REST_SUGGEST_AWAKE_HOURS)
  ) {
    const base = 420 + (input.sleepDebt - 35) * 2.5 + sleepDepthExtra;
    const minutes = Math.min(600, Math.max(300, Math.round(base / 15) * 15));
    const facts = [
      night ? '现在是夜里' : '',
      input.sleepDebt >= 35 ? `睡眠债 ${input.sleepDebt}` : '',
      awakeHours !== null ? `已经清醒约 ${Math.round(awakeHours)} 小时` : '',
      input.energy <= 25 ? '精力很低' : '',
    ].filter(Boolean);
    return {
      action: 'SLEEP',
      minutes,
      reason: `${facts.join('，')}；按恢复需要大约 ${minutes} 分钟，但你可以自己决定`,
    };
  }

  if (afternoon && input.sleepDebt >= 35 && input.energy <= 50) {
    const minutes = Math.min(60, Math.max(20, Math.round((30 + sleepDepthExtra) / 5) * 5));
    return {
      action: 'NAP',
      minutes,
      reason: `下午有点累（睡眠债 ${input.sleepDebt}），可以小睡 ${minutes} 分钟，也可以不睡`,
    };
  }

  return {
    action: 'NONE',
    minutes: null,
    reason:
      awakeHours === null
        ? '没有可靠的睡眠记录，按你现在的感觉决定'
        : `已经清醒约 ${Math.round(awakeHours)} 小时、睡眠债 ${input.sleepDebt}，现在不一定要睡`,
  };
}

/** HH:MM in the target zone; falls back to server local time on bad zones. */
function localClock(date: Date, timeZone?: string | null): string {
  try {
    if (timeZone) {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    }
  } catch {
    // Fall back to server local time.
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** One-decimal hour count for prompt sentences. */
function formatHours(hours: number): string {
  return `${Math.round(hours * 10) / 10} 小时`;
}

/** Reads the JSON column as a settlement, or null when it is not an object. */
function readSettlement(value: unknown): LongEventSettlement | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LongEventSettlement)
    : null;
}

/** Object-shaped JSON or an empty object, so field reads never throw. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Only the words the persona left for itself; there is no global wake list. */
export function matchWakeKeyword(
  event: Pick<PersonaLongEvent, 'wakeKeywords'>,
  text: string,
): string | null {
  const normalized = text.replace(/\s+/gu, '');
  const keywords = event.wakeKeywords
    .map((keyword) => keyword.replace(/\s+/gu, ''))
    .filter(Boolean);
  return keywords.find((keyword) => normalized.includes(keyword)) ?? null;
}

/** Chinese label for a wake reason, used in prompts and change-log rows. */
function wakeReasonLabel(reason: LongEventWakeReason): string {
  switch (reason) {
    case 'PLANNED':
      return '到点';
    case 'MENTIONS':
      return '重复点名';
    case 'KEYWORD':
      return '被在意的话叫醒';
    case 'JUDGMENT':
      return '自己判断醒来';
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

/** Clamps a requested end into 10 min..24 h; sleep without an end uses a debt-scaled default. */
function resolvePlannedEnd(now: Date, kind: string, plannedEndAt?: string, sleepDebt = 40): Date {
  const parsed = plannedEndAt ? new Date(plannedEndAt) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    const fallbackMs =
      kind === 'SLEEP' || kind === 'NAP'
        ? Math.min(
            MAX_SLEEP_FALLBACK_MS,
            Math.max(
              MIN_SLEEP_FALLBACK_MS,
              (300 + Math.max(0, Math.min(100, sleepDebt)) * 3) * 60_000,
            ),
          )
        : DEFAULT_EVENT_MS;
    return new Date(now.getTime() + fallbackMs);
  }
  return new Date(
    Math.min(
      now.getTime() + MAX_EVENT_MS,
      Math.max(now.getTime() + MIN_EVENT_MS, parsed.getTime()),
    ),
  );
}

/** Uppercases and strips a free-form kind, defaulting to sleep. */
function normalizeKind(value?: string): string {
  const kind = (value ?? 'SLEEP')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/gu, '')
    .slice(0, 20);
  return kind || 'SLEEP';
}

/** Trims, caps and limits the wake words the persona left for itself. */
function normalizeKeywords(value?: string[]): string[] {
  return (value ?? [])
    .map((keyword) => keyword.trim().slice(0, 20))
    .filter(Boolean)
    .slice(0, 8);
}

/** Rounds and bounds an optional number, falling back when it is absent or not finite. */
function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** Trims and hard-caps a free-form string. */
function trim(value: string | undefined, max: number): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

/** Wire shape; optional dates become ISO strings or null. */
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
