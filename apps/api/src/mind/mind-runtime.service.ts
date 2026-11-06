import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import type {
  AgentRunDetail,
  AgentRunScene,
  AgentRunSummary,
  AgentStepRecord,
  ActionPlan,
  MindSettingsRecord,
  MindTurnResult,
  MindHeartbeatStatus,
  MindSimulationResult,
  PersonaMindMode,
  PersonaMemoryRecord,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { AgentIntention, AgentStep, PersonaState } from '../generated/prisma/client.js';
import type { ChatMessageSnapshot } from '../chat/chat-message.types.js';
import { MindActionExecutor } from './mind-action-executor.service.js';
import { classifyText, readConversation } from './mind-conversation-read.js';
import { MindDriftService, type DriftSummary } from './mind-drift.service.js';
import {
  MindHeartbeatLogService,
  type MindHeartbeatLogInput,
} from './mind-heartbeat-log.service.js';
import { MindPlannerService } from './mind-planner.service.js';
import { MindReplyLockService } from './mind-reply-lock.service.js';
import { MindSceneService } from './mind-scene.service.js';
import { MindSettingsService } from './mind-settings.service.js';
import { MindSocialService } from './mind-social.service.js';
import { PersonaGroupStanceService } from './persona-group-stance.service.js';
import { PersonaLongEventService } from './persona-long-event.service.js';
import { PersonaMemoryService } from './persona-memory.service.js';
import { PersonaRelationshipService } from './persona-relationship.service.js';
import { PersonaStateService } from './persona-state.service.js';
import {
  clamp,
  isMindTurnInterrupted,
  localDateKey,
  localHour,
  isQuietHour,
  normalizeTimeZone,
  readString,
  relationScoreOf,
  type MindIntentionFeedback,
  type MindPersona,
  type MindScene,
  type MindSleepBrief,
  type MindWakeBrief,
} from './mind.types.js';

type Trigger = 'MESSAGE' | 'HEARTBEAT' | 'PROACTIVE' | 'MANUAL';

/** Idle heartbeats revisit an activity once it is this old. */
const ACTIVITY_REVIEW_AFTER_MINUTES = 90;
/** Do not ask again for the same activity sooner than this. */
const ACTIVITY_REVIEW_COOLDOWN_MINUTES = 60;
const SLEEP_ACTIVITY_RE = /睡|休息|打盹|午休|小憩/u;
const INTERRUPTED_REASON = '同一个人发来更新的消息，这一轮改为重新规划';

@Injectable()
export class MindRuntimeService implements OnModuleInit {
  private readonly logger = new Logger(MindRuntimeService.name);
  private readonly consolidating = new Set<string>();
  /** conversationId:senderId -> in-flight turn controller. */
  private readonly activeTurns = new Map<
    string,
    { controller: AbortController; messageId: string }
  >();
  /** Serialises turns per sender; superseded waiters release without running. */
  private readonly turnGates = new Map<string, Promise<void>>();
  private readonly turnGenerations = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: MindSettingsService,
    private readonly states: PersonaStateService,
    private readonly relationships: PersonaRelationshipService,
    private readonly stances: PersonaGroupStanceService,
    private readonly longEvents: PersonaLongEventService,
    private readonly memories: PersonaMemoryService,
    private readonly scenes: MindSceneService,
    private readonly social: MindSocialService,
    private readonly planner: MindPlannerService,
    private readonly drift: MindDriftService,
    private readonly executor: MindActionExecutor,
    private readonly replyLock: MindReplyLockService,
    private readonly heartbeatLogs: MindHeartbeatLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    // The rehearsal script boots this service without an HTTP server; it must
    // not reclaim live runs as if the process had restarted.
    if (process.env.MIND_SCRIPT_CONTEXT === '1') {
      return;
    }
    const interrupted = await this.prisma.agentRun.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        error: '服务重启中断',
      },
    });
    if (interrupted.count > 0) {
      this.logger.warn(`已回收 ${interrupted.count} 条中断的心智运行`);
    }
  }

  /**
   * Message turns for the same sender in the same conversation are serialised:
   * a newer message aborts the in-flight model call and re-plans from the
   * latest scene, while middle messages that were already superseded drop out.
   */
  async turn(input: {
    message: ChatMessageSnapshot;
    mode?: PersonaMindMode;
    trigger?: Trigger;
  }): Promise<MindTurnResult> {
    if (input.message.isSelf) {
      return skipped('自己发出的消息不触发心智');
    }
    const trigger = input.trigger ?? 'MESSAGE';
    if (trigger !== 'MESSAGE') {
      return this.executeTurn(input, undefined, false);
    }

    const key = `${input.message.conversationId}:${input.message.senderId}`;
    const generation = (this.turnGenerations.get(key) ?? 0) + 1;
    this.turnGenerations.set(key, generation);
    const superseded = this.activeTurns.get(key);
    superseded?.controller.abort();

    const prior = this.turnGates.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prior.then(() => gate);
    this.turnGates.set(key, tail);
    await prior;

    if (this.turnGenerations.get(key) !== generation) {
      release();
      if (this.turnGates.get(key) === tail) {
        this.turnGates.delete(key);
      }
      return skipped(INTERRUPTED_REASON);
    }

    const controller = new AbortController();
    this.activeTurns.set(key, {
      controller,
      messageId: input.message.messageId,
    });
    try {
      return await this.executeTurn(input, controller.signal, Boolean(superseded));
    } finally {
      if (this.activeTurns.get(key)?.controller === controller) {
        this.activeTurns.delete(key);
      }
      release();
      if (this.turnGates.get(key) === tail) {
        this.turnGates.delete(key);
      }
      if (!this.turnGates.has(key)) {
        this.turnGenerations.delete(key);
      }
    }
  }

  private async executeTurn(
    input: {
      message: ChatMessageSnapshot;
      mode?: PersonaMindMode;
      trigger?: Trigger;
    },
    signal?: AbortSignal,
    interruptedPredecessor = false,
  ): Promise<MindTurnResult> {
    if (input.message.isSelf) {
      return skipped('自己发出的消息不触发心智');
    }
    if (signal?.aborted) {
      return skipped(INTERRUPTED_REASON);
    }
    const settings = await this.settings.get(input.message.channelId);
    const mode = input.mode ?? settings.mode;
    if (mode === 'OFF') {
      return skipped('心智模式关闭');
    }
    const boundPersona = await this.prisma.chatChannelPersona.findUnique({
      where: { channelId: input.message.channelId },
      select: { id: true, name: true, values: true },
    });
    const activeEvent = boundPersona ? await this.longEvents.active(boundPersona.id) : null;
    // Private chats have no reply-avoid window; the window is a group-burst tool.
    const avoidWindow =
      settings.replyAvoidSeconds > 0 && input.message.conversationKind === 'GROUP';
    let directedCache: boolean | null = null;
    const isDirected = async (): Promise<boolean> => {
      if (directedCache === null) {
        directedCache =
          (avoidWindow || Boolean(activeEvent)) && boundPersona
            ? await this.scenes.isDirectedMention(input.message, boundPersona)
            : false;
      }
      return directedCache;
    };
    let eventWake: {
      eventId: string;
      kind: string;
      title: string;
      wakeMentions: number;
      wakeWindowMinutes: number;
      wakeKeywords: string[];
      reason: string;
      keyword: string | null;
      mentions: number;
      urgency: number | null;
      judgeReason: string | null;
      judgeSource: string;
      effects: unknown;
    } | null = null;
    if (boundPersona && activeEvent) {
      const directed = await isDirected();
      const now = new Date();
      const recentMentions = directed
        ? await this.scenes.countDirectedMentions(
            input.message.conversationId,
            new Date(now.getTime() - activeEvent.wakeWindowMinutes * 60_000),
          )
        : 0;
      const evaluation = await this.longEvents.judgeWake(activeEvent, {
        now,
        directed,
        recentMentions,
        text: input.message.text,
        senderName: input.message.senderName,
      });
      if (directed) {
        await this.longEvents.noteStimulus(activeEvent.id);
      }
      if (evaluation.wake) {
        const finished = await this.longEvents.finish(
          activeEvent.id,
          evaluation.reason ?? 'MENTIONS',
          { wakeText: input.message.text },
        );
        eventWake = {
          eventId: activeEvent.id,
          kind: activeEvent.kind,
          title: activeEvent.title,
          wakeMentions: activeEvent.wakeMentions,
          wakeWindowMinutes: activeEvent.wakeWindowMinutes,
          wakeKeywords: activeEvent.wakeKeywords,
          reason: evaluation.reason ?? 'MENTIONS',
          keyword: evaluation.keyword,
          mentions: recentMentions,
          urgency: evaluation.urgency,
          judgeReason: evaluation.judgeReason,
          judgeSource: evaluation.source,
          effects: finished.effects,
        };
      } else {
        const preview = input.message.text.trim().replace(/\s+/gu, ' ').slice(0, 30);
        const label = activeEvent.title || activeEvent.kind;
        const reason = `长时事件「${label}」中，跳过${preview ? `「${preview}」` : '这条消息'}`;
        const runId = await this.recordSkippedRun({
          personaId: boundPersona.id,
          message: input.message,
          mode,
          trigger: input.trigger ?? 'MESSAGE',
          reason,
          stepTitle: '长时事件',
          stepInput: {
            eventId: activeEvent.id,
            kind: activeEvent.kind,
            title: activeEvent.title,
            wakeMentions: activeEvent.wakeMentions,
            wakeWindowMinutes: activeEvent.wakeWindowMinutes,
            wakeKeywords: activeEvent.wakeKeywords,
            recentMentions,
            directed,
          },
          stepOutput: {
            skipped: true,
            triggerCount: activeEvent.triggerCount + (directed ? 1 : 0),
            decision: {
              wake: evaluation.wake,
              urgency: evaluation.urgency,
              reason: evaluation.judgeReason,
              source: evaluation.source,
              error: evaluation.error ?? null,
            },
          },
        });
        return skipped(reason, { runId, suppressed: true });
      }
    }
    const locked =
      avoidWindow &&
      !interruptedPredecessor &&
      (await this.replyLock.active(input.message.conversationId));
    if (boundPersona && locked && !(await isDirected())) {
      const preview = input.message.text.trim().replace(/\s+/gu, ' ').slice(0, 30);
      const reason = preview
        ? `回复回避窗口内，跳过「${preview}」`
        : '回复回避窗口内，跳过了这条消息';
      const runId = await this.recordSkippedRun({
        personaId: boundPersona.id,
        message: input.message,
        mode,
        trigger: input.trigger ?? 'MESSAGE',
        reason,
        stepTitle: '回复回避窗口',
        stepInput: {
          conversationId: input.message.conversationId,
          windowSeconds: settings.replyAvoidSeconds,
        },
        stepOutput: { skipped: true, reason },
      });
      return skipped(reason, { runId, suppressed: true });
    }
    if (boundPersona) {
      await this.relationships
        .ensureForContact(boundPersona.id, input.message.senderId)
        .catch(() => undefined);
    }
    const scene = await this.scenes.buildFromMessage(
      input.message,
      settings.imageDescriptionPrompt,
    );
    if (!scene) {
      return skipped('渠道尚未绑定人格');
    }
    if (signal?.aborted) {
      return skipped(INTERRUPTED_REASON);
    }

    await this.applyInboundFeedback(
      scene.persona.id,
      input.message.senderId,
      input.message.text,
    ).catch((error: unknown) => {
      this.logger.warn(
        `主动反馈写入失败：${error instanceof Error ? error.message : String(error)}`,
      );
    });
    const intentionFeedback = await this.recentIntentionFeedback(scene.persona.id);

    const startedAt = new Date();
    const state = await this.states.ensure(scene.persona.id);
    const sleepBrief = await this.longEvents.sleepBrief(
      scene.persona.id,
      state,
      scene.persona.values as Record<string, unknown> | null,
    );
    const query = buildMemoryQuery(scene);
    const recall = await this.memories.recallForScene(scene, query, 12);
    const memories = [...recall.core, ...recall.relevant];
    const decision = this.social.buildDecision({ scene, state, memories });
    const conversationRead = readConversation({ scene, state, memories });
    if (signal?.aborted) {
      return skipped(INTERRUPTED_REASON);
    }
    const run = await this.prisma.agentRun.create({
      data: {
        personaId: scene.persona.id,
        channelId: scene.persona.channelId,
        conversationId: scene.conversation.id,
        messageId: input.message.messageId || null,
        trigger: input.trigger ?? 'MESSAGE',
        mode,
        status: 'RUNNING',
        scene: compactScene(scene),
      },
    });
    const finishInterruptedTurn = async (
      stage: string,
      plan?: ActionPlan,
    ): Promise<MindTurnResult> => {
      await this.step(run.id, 'EXPRESSION', '被更新的消息打断', { stage }, { aborted: true }, 0);
      await this.finishRun(run.id, 'SKIPPED', {
        startedAt,
        decision: {
          engage: false,
          reason: INTERRUPTED_REASON,
          stance: decision.read.suggestedStance,
          felt: decision.read.felt,
          shown: decision.read.suggestedStance,
        },
        socialRead: decision.read,
        plan,
        error: INTERRUPTED_REASON,
      });
      return {
        runId: run.id,
        engage: false,
        reason: INTERRUPTED_REASON,
        plan: plan ?? null,
        socialRead: decision.read,
        felt: decision.read.felt,
        shown: decision.read.suggestedStance,
        memories: memories.map(toPublicMemory),
        suppressed: true,
      };
    };
    if (eventWake) {
      await this.step(
        run.id,
        'ATTENTION',
        '长时事件结束',
        {
          eventId: eventWake.eventId,
          kind: eventWake.kind,
          title: eventWake.title,
          wakeMentions: eventWake.wakeMentions,
          wakeWindowMinutes: eventWake.wakeWindowMinutes,
          wakeKeywords: eventWake.wakeKeywords,
        },
        {
          wakeReason: eventWake.reason,
          keyword: eventWake.keyword,
          mentions: eventWake.mentions,
          urgency: eventWake.urgency,
          judgeReason: eventWake.judgeReason,
          judgeSource: eventWake.judgeSource,
          effects: eventWake.effects,
        },
        0,
      );
    }
    await this.step(
      run.id,
      'ATTENTION',
      '注意力与社交判断',
      {
        trigger: input.trigger ?? 'MESSAGE',
        mode,
      },
      {
        engage: decision.engage,
        reason: decision.reason,
        read: decision.read,
        conversation: conversationRead,
      },
      0,
    );

    if (!decision.engage && input.trigger !== 'MANUAL') {
      await this.finishRun(run.id, 'SKIPPED', {
        startedAt,
        decision: {
          engage: false,
          reason: decision.reason,
          stance: decision.read.suggestedStance,
          felt: decision.read.felt,
          shown: decision.read.suggestedStance,
        },
        socialRead: decision.read,
      });
      return {
        runId: run.id,
        engage: false,
        reason: decision.reason,
        plan: null,
        socialRead: decision.read,
        felt: decision.read.felt,
        shown: decision.read.suggestedStance,
        memories: memories.map(toPublicMemory),
      };
    }

    await this.relationships
      .ensureForContact(
        scene.persona.id,
        decision.target?.contactId ?? scene.cast[0]?.contactId ?? '',
      )
      .catch(() => undefined);

    let plannerResult;
    try {
      plannerResult = await this.planner.plan({
        runId: run.id,
        scene,
        state,
        social: decision.read,
        memories: recall.relevant,
        coreMemories: recall.core,
        memoryStats: recall.stats,
        conversationRead,
        intentionFeedback,
        settings,
        mode,
        trigger: input.trigger ?? 'MESSAGE',
        sleepBrief,
        signal,
      });
    } catch (error) {
      if (isMindTurnInterrupted(error, signal)) {
        return finishInterruptedTurn('规划模型');
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`心智规划失败：${message}`);
      await this.finishRun(run.id, 'FAILED', {
        startedAt,
        decision: null,
        socialRead: decision.read,
        error: message,
      });
      return {
        runId: run.id,
        engage: false,
        reason: `规划失败：${message}`,
        plan: null,
        socialRead: decision.read,
        felt: decision.read.felt,
        shown: decision.read.suggestedStance,
        memories: memories.map(toPublicMemory),
        error: message,
      };
    }

    await this.step(
      run.id,
      'PLAN',
      '动作计划',
      {
        toolCalls: plannerResult.toolCalls.length,
        promptTokens: plannerResult.promptTokens,
        completionTokens: plannerResult.completionTokens,
      },
      plannerResult.plan,
      plannerResult.latencyMs,
    );
    for (const toolCall of plannerResult.toolCalls) {
      await this.step(
        run.id,
        'TOOL',
        toolCall.name,
        toolCall.input,
        toolCall.output,
        toolCall.durationMs,
        toolCall.error,
      );
    }

    const plan = plannerResult.plan;
    if (signal?.aborted) {
      return finishInterruptedTurn('规划完成', plan);
    }
    let lockAcquired = false;
    if (plan.engage && plan.beats.length > 0 && mode !== 'SHADOW' && avoidWindow) {
      const acquired = await this.replyLock.acquire({
        conversationId: scene.conversation.id,
        runId: run.id,
        windowSeconds: settings.replyAvoidSeconds,
      });
      lockAcquired = acquired;
      if (!acquired && (await isDirected())) {
        await this.replyLock.extend({
          conversationId: scene.conversation.id,
          runId: run.id,
          windowSeconds: settings.replyAvoidSeconds,
        });
        await this.step(
          run.id,
          'EXPRESSION',
          '回复回避窗口',
          {
            conversationId: scene.conversation.id,
            windowSeconds: settings.replyAvoidSeconds,
          },
          { acquired: false, extended: true, directed: true },
          0,
        );
      } else if (!acquired) {
        await this.step(
          run.id,
          'EXPRESSION',
          '回复回避窗口',
          {
            conversationId: scene.conversation.id,
            windowSeconds: settings.replyAvoidSeconds,
          },
          { acquired: false },
          0,
        );
        await this.finishRun(run.id, 'SKIPPED', {
          startedAt,
          decision: {
            engage: false,
            reason: '回复回避窗口内，取消本次回复',
            stance: plan.stance,
            felt: plan.felt ?? decision.read.felt,
            shown: plan.shown ?? plan.stance,
          },
          socialRead: decision.read,
          plan,
        });
        return skipped('回复回避窗口内，取消本次回复', {
          runId: run.id,
          socialRead: decision.read,
          memories: memories.map(toPublicMemory),
          suppressed: true,
        });
      }
    }
    if (signal?.aborted) {
      if (lockAcquired) {
        await this.replyLock.release(scene.conversation.id, run.id);
      }
      return finishInterruptedTurn('表达前', plan);
    }
    await this.writeBack(run.id, scene, plan, decision.read, state, settings);
    void this.consolidateIfNeeded(scene.persona.id, scene, state);
    await this.executor.execute({
      plan,
      scene,
      settings,
      mode,
      runId: run.id,
      signal,
    });
    if (signal?.aborted) {
      if (lockAcquired) {
        await this.replyLock.release(scene.conversation.id, run.id);
      }
      return finishInterruptedTurn('表达中', plan);
    }
    await this.finishRun(run.id, 'SUCCEEDED', {
      startedAt,
      decision: {
        engage: plan.engage,
        reason: plan.reason,
        stance: plan.stance,
        felt: plan.felt ?? decision.read.felt,
        shown: plan.shown ?? plan.stance,
      },
      socialRead: decision.read,
      plan,
      providerId: plannerResult.providerId,
      model: plannerResult.model,
      latencyMs: plannerResult.latencyMs,
      promptTokens: plannerResult.promptTokens,
      completionTokens: plannerResult.completionTokens,
    });

    return {
      runId: run.id,
      engage: plan.engage,
      reason: plan.reason,
      plan,
      socialRead: decision.read,
      felt: plan.felt ?? decision.read.felt,
      shown: plan.shown ?? plan.stance,
      memories: memories.map(toPublicMemory),
    };
  }

  async heartbeat(personaId: string): Promise<MindTurnResult | null> {
    const persona = await this.states.persona(personaId);
    const settings = await this.settings.get(persona.channelId);
    const log = (
      status: MindHeartbeatStatus,
      reason: string,
      extra: Partial<
        Omit<MindHeartbeatLogInput, 'personaId' | 'channelId' | 'status' | 'reason' | 'mode'>
      > = {},
    ) =>
      this.heartbeatLogs.record({
        personaId,
        channelId: persona.channelId,
        status,
        reason,
        mode: settings.mode,
        ...extra,
      });
    if (!settings.heartbeatEnabled || settings.mode === 'OFF') {
      await log('DISABLED', '心跳关闭或心智模式为关闭');
      return null;
    }
    const proactiveUsed = await this.proactiveSendsToday(personaId);
    const proactiveAllowed =
      settings.proactiveEnabled &&
      (settings.dailyProactiveBudget < 0 || proactiveUsed < settings.dailyProactiveBudget);
    let state = await this.states.ensure(personaId);
    const now = new Date();
    const values = persona.values as Record<string, unknown> | null;
    const timeZone = normalizeTimeZone(readString(values?.['time_zone']));
    const hour = localHour(now, timeZone);
    const quiet = isQuietHour(hour, settings.quietHours);

    const activeEvent = await this.longEvents.active(personaId);
    if (activeEvent) {
      if (activeEvent.plannedEndAt && now >= activeEvent.plannedEndAt) {
        await this.longEvents.finish(activeEvent.id, 'PLANNED');
        state = await this.states.ensure(personaId);
      } else {
        const minutes = activeEvent.plannedEndAt
          ? Math.max(1, Math.ceil((activeEvent.plannedEndAt.getTime() - now.getTime()) / 60_000))
          : effectiveWakeMinutes(settings, quiet);
        await this.reschedule(personaId, minutes, '长时事件进行中', { heartbeat: false });
        await log('LONG_EVENT', `长时事件「${activeEvent.title || activeEvent.kind}」进行中`, {
          quiet,
          detail: {
            wakeReason: state.wakeReason,
            eventId: activeEvent.id,
            kind: activeEvent.kind,
            title: activeEvent.title,
            plannedEndAt: activeEvent.plannedEndAt?.toISOString() ?? null,
            minutes,
          },
        });
        return null;
      }
    }

    const sleepBrief = await this.longEvents.sleepBrief(personaId, state, values);
    await this.sweepUnansweredIntentions(personaId);

    const dueTodos = await this.prisma.agentTodo.findMany({
      where: {
        personaId,
        status: 'PENDING',
        OR: [
          { dueAt: { lte: now } },
          { dueAt: null, createdAt: { lte: new Date(now.getTime() - 6 * 3600_000) } },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 5,
    });
    const dueIntentions = proactiveAllowed
      ? await this.prisma.agentIntention.findMany({
          where: {
            personaId,
            status: 'PENDING',
            earliestAt: { lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
          },
          orderBy: [{ urgency: 'desc' }, { createdAt: 'asc' }],
          take: 5,
        })
      : [];
    const dueIntentionBriefs = await this.dueIntentionBriefs(personaId, dueIntentions);
    const unconsolidated = await this.memories.countUnconsolidated(personaId);

    // Only idle beats roll for everyday events or curiosity, so busy days never
    // stack a second storyline on top of the messages already being handled.
    // Reflection is scheduled by time and takes priority over both.
    const idle = dueTodos.length === 0 && dueIntentions.length === 0 && unconsolidated < 2;
    const reflection = !quiet && (await this.reflectionDue(personaId, settings));
    const lifeEvent =
      !reflection && idle && !quiet && (await this.rollLifeEvent(personaId, settings, timeZone));
    const curiosity =
      !reflection &&
      !lifeEvent &&
      idle &&
      !quiet &&
      (await this.rollCuriosity(personaId, settings, timeZone));
    const heartbeatBase = {
      quiet,
      dueTodos: dueTodos.length,
      dueIntentions: dueIntentions.length,
      unconsolidated,
      lifeEvent,
      curiosity,
      reflection,
    };

    // A wake is an opportunity, not a duty. Layered budgets cap how many
    // unsolicited model turns a day may spend, and how close together.
    const proactiveWake = dueIntentions.length > 0 || lifeEvent || curiosity || Boolean(reflection);
    if (proactiveWake && dueTodos.length === 0) {
      const gate = await this.wakeGate(personaId, settings, timeZone);
      if (!gate.allowed) {
        await this.reviewStaleActivity(personaId, persona, state, sleepBrief, settings, timeZone);
        await this.reschedule(personaId, gate.nextMinutes, gate.reason, { heartbeat: false });
        await log('GATED', gate.reason, {
          ...heartbeatBase,
          detail: {
            ...heartbeatBase,
            wakeReason: state.wakeReason,
            gate,
            nextMinutes: gate.nextMinutes,
          },
        });
        return null;
      }
    }

    if (!lifeEvent && !curiosity && !reflection && idle) {
      await this.reviewStaleActivity(personaId, persona, state, sleepBrief, settings, timeZone);
      await this.reschedule(personaId, effectiveWakeMinutes(settings, quiet), '无到期事项');
      await log('IDLE', '空闲心跳：没有到期事项，也未触发生活小事、好奇或反思', {
        ...heartbeatBase,
        detail: { ...heartbeatBase, wakeReason: state.wakeReason },
      });
      return null;
    }

    const conversationId =
      dueTodos.find((todo) => todo.relatedConversationId)?.relatedConversationId ??
      (await this.mostRecentConversationId(personaId, persona.channelId));
    if (!conversationId) {
      await this.reschedule(personaId, settings.wakeIntervalMinutes, '没有可用的会话');
      await log('NO_CONVERSATION', '没有可用的会话', {
        ...heartbeatBase,
        detail: { ...heartbeatBase, wakeReason: state.wakeReason },
      });
      return null;
    }
    const conversationKind = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { kind: true },
    });
    const isGroup = conversationKind?.kind === 'GROUP';
    if (
      settings.replyAvoidSeconds > 0 &&
      isGroup &&
      (await this.replyLock.active(conversationId))
    ) {
      await this.reschedule(personaId, effectiveWakeMinutes(settings, quiet), '回复回避窗口内', {
        heartbeat: false,
      });
      await log('REPLY_LOCK', '回复回避窗口内，本轮不规划', {
        ...heartbeatBase,
        detail: { ...heartbeatBase, wakeReason: state.wakeReason, conversationId },
      });
      return null;
    }
    const scene = await this.scenes.buildFromConversation(
      persona.channelId,
      conversationId,
      new Date(),
      settings.imageDescriptionPrompt,
    );
    if (!scene) {
      await this.reschedule(personaId, settings.wakeIntervalMinutes, '会话没有消息');
      await log('NO_CONVERSATION', '会话没有消息', {
        ...heartbeatBase,
        detail: { ...heartbeatBase, wakeReason: state.wakeReason, conversationId },
      });
      return null;
    }

    const overnightMessages = await this.scenes.recentMessages(
      conversationId,
      12,
      new Date(now.getTime() - 12 * 3600_000),
    );
    const wakeBrief: MindWakeBrief = {
      now,
      timeZone: timeZone ?? 'server-local',
      state,
      dueTodos: dueTodos.map((todo) => ({
        id: todo.id,
        title: todo.title,
        detail: todo.detail,
        kind: todo.kind,
        priority: todo.priority,
        dueAt: todo.dueAt?.toISOString() ?? null,
      })),
      dueIntentions: dueIntentionBriefs,
      overnightMessages,
      unconsolidatedCount: unconsolidated,
    };

    const reflectionBrief = reflection
      ? {
          recent: (await this.memories.list({ personaId, limit: 20, offset: 0 })).map((memory) => ({
            kind: memory.kind,
            content: memory.content,
            occurredAt: memory.occurredAt,
            confidence: memory.confidence,
            sourceType: memory.sourceType,
          })),
          journal:
            (
              await this.prisma.personaJournal.findFirst({
                where: { personaId },
                orderBy: { date: 'desc' },
                select: { content: true },
              })
            )?.content ?? null,
        }
      : undefined;
    const decayed = reflection ? await this.maybeDecayMemories(personaId, timeZone) : 0;

    const mode: PersonaMindMode =
      settings.mode === 'LIVE' && proactiveAllowed
        ? 'LIVE'
        : settings.mode === 'APPROVAL' && proactiveAllowed
          ? 'APPROVAL'
          : 'SHADOW';
    const query = [
      '我醒来后需要处理的待办、承诺和最近发生的事',
      ...dueTodos.map((todo) => todo.title),
      ...dueIntentionBriefs.map((intent) => intent.reason || intent.seed),
    ].join('；');
    const recall = await this.memories.recallForScene(scene, query, 12);
    const memories = [...recall.core, ...recall.relevant];
    const decision = this.social.buildDecision({ scene, state, memories });
    const intentionFeedback = await this.recentIntentionFeedback(personaId);
    const startedAt = new Date();
    const run = await this.prisma.agentRun.create({
      data: {
        personaId,
        channelId: persona.channelId,
        conversationId,
        trigger: dueIntentions.length > 0 || dueTodos.length > 0 ? 'PROACTIVE' : 'HEARTBEAT',
        mode,
        status: 'RUNNING',
        scene: compactScene(scene),
      },
    });
    await this.step(run.id, 'ATTENTION', '唤醒简报', { wakeBrief }, { decision: decision.read }, 0);
    if (lifeEvent) {
      await this.step(
        run.id,
        'ATTENTION',
        '生活事件判定',
        { chancePercent: settings.lifeEventChancePercent },
        { hit: true },
        0,
      );
    }
    if (reflection) {
      await this.step(
        run.id,
        'ATTENTION',
        '自我反思',
        { intervalHours: settings.reflectionIntervalHours },
        { due: true, recentMemories: reflectionBrief?.recent.length ?? 0 },
        0,
      );
    }
    if (curiosity) {
      await this.step(
        run.id,
        'ATTENTION',
        '好奇探索',
        {
          chancePercent: settings.curiosityChancePercent,
          dailyLimit: settings.curiosityDailyLimit,
        },
        { hit: true },
        0,
      );
    }
    if (decayed > 0) {
      await this.step(run.id, 'CONSOLIDATION', '记忆衰减', { staleAfterDays: 30 }, { decayed }, 0);
    }

    try {
      const plannerResult = await this.planner.plan({
        runId: run.id,
        scene,
        state,
        social: decision.read,
        memories: recall.relevant,
        coreMemories: recall.core,
        memoryStats: recall.stats,
        intentionFeedback,
        settings,
        mode,
        trigger: 'HEARTBEAT',
        wakeBrief,
        sleepBrief,
        lifeEvent,
        curiosity,
        reflection,
        reflectionBrief,
      });
      await this.step(
        run.id,
        'PLAN',
        '心跳动作计划',
        {
          toolCalls: plannerResult.toolCalls.length,
          promptTokens: plannerResult.promptTokens,
          completionTokens: plannerResult.completionTokens,
        },
        plannerResult.plan,
        plannerResult.latencyMs,
      );
      for (const toolCall of plannerResult.toolCalls) {
        await this.step(
          run.id,
          'TOOL',
          toolCall.name,
          toolCall.input,
          toolCall.output,
          toolCall.durationMs,
          toolCall.error,
        );
      }
      const plan = plannerResult.plan;
      if (plan.engage && plan.beats.length > 0 && mode !== 'SHADOW' && isGroup) {
        const acquired = await this.replyLock.acquire({
          conversationId,
          runId: run.id,
          windowSeconds: settings.replyAvoidSeconds,
        });
        if (!acquired) {
          await this.step(
            run.id,
            'EXPRESSION',
            '回复回避窗口',
            { conversationId, windowSeconds: settings.replyAvoidSeconds },
            { acquired: false },
            0,
          );
          await this.finishRun(run.id, 'SKIPPED', {
            startedAt,
            decision: {
              engage: false,
              reason: '回复回避窗口内，取消本次回复',
              stance: plan.stance,
              felt: plan.felt ?? decision.read.felt,
              shown: plan.shown ?? plan.stance,
            },
            socialRead: decision.read,
            plan,
          });
          await this.reschedule(personaId, effectiveWakeMinutes(settings, quiet), '回复回避窗口内');
          await log('RUN', '回复回避窗口内，取消本次回复', {
            ...heartbeatBase,
            runId: run.id,
            detail: {
              ...heartbeatBase,
              wakeReason: state.wakeReason,
              outcome: 'REPLY_LOCK',
              conversationId,
              plan: heartbeatPlanSummary(plan),
              toolCalls: plannerResult.toolCalls.map((call) => ({
                name: call.name,
                error: call.error ?? null,
                durationMs: call.durationMs,
              })),
              providerId: plannerResult.providerId,
              model: plannerResult.model,
              latencyMs: plannerResult.latencyMs,
              promptTokens: plannerResult.promptTokens,
              completionTokens: plannerResult.completionTokens,
            },
          });
          return skipped('回复回避窗口内，取消本次回复', {
            runId: run.id,
            socialRead: decision.read,
            memories: memories.map(toPublicMemory),
            suppressed: true,
          });
        }
      }
      await this.writeBack(run.id, scene, plan, decision.read, state, settings);
      const actions = await this.executor.execute({ plan, scene, settings, mode, runId: run.id });
      await this.finishRun(run.id, 'SUCCEEDED', {
        startedAt,
        decision: {
          engage: plan.engage,
          reason: plan.reason,
          stance: plan.stance,
          felt: plan.felt ?? decision.read.felt,
          shown: plan.shown ?? plan.stance,
        },
        socialRead: decision.read,
        plan,
        providerId: plannerResult.providerId,
        model: plannerResult.model,
        latencyMs: plannerResult.latencyMs,
        promptTokens: plannerResult.promptTokens,
        completionTokens: plannerResult.completionTokens,
      });
      await this.completeWakeItems(
        dueTodos.map((todo) => todo.id),
        dueIntentions.map((intent) => intent.id),
        plan,
        actions.some((action) => action.status === 'SENT'),
      );
      if (!plan.nextWakeAt || !settings.selfScheduleEnabled) {
        await this.reschedule(personaId, effectiveWakeMinutes(settings, quiet), plan.reason);
      }
      await this.consolidateIfNeeded(personaId, scene, state, run.id);
      const outcome =
        mode === 'SHADOW' ? 'SHADOW' : plan.engage && plan.beats.length > 0 ? 'SENT' : 'SILENT';
      await log('RUN', plan.reason, {
        ...heartbeatBase,
        runId: run.id,
        detail: {
          ...heartbeatBase,
          wakeReason: state.wakeReason,
          outcome,
          conversationId,
          brief: {
            dueTodos: dueTodos.map((todo) => ({
              title: todo.title,
              priority: todo.priority,
              dueAt: todo.dueAt?.toISOString() ?? null,
            })),
            dueIntentions: dueIntentionBriefs,
            unconsolidated,
            overnightMessages: overnightMessages.length,
            intentionFeedback,
          },
          plan: heartbeatPlanSummary(plan),
          actions: heartbeatActionSummary(actions),
          nextWakeAt: plan.nextWakeAt ?? null,
          providerId: plannerResult.providerId,
          model: plannerResult.model,
          latencyMs: plannerResult.latencyMs,
          promptTokens: plannerResult.promptTokens,
          completionTokens: plannerResult.completionTokens,
        },
      });
      return {
        runId: run.id,
        engage: plan.engage,
        reason: plan.reason,
        plan,
        socialRead: decision.read,
        felt: plan.felt ?? decision.read.felt,
        shown: plan.shown ?? plan.stance,
        memories: memories.map(toPublicMemory),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`心跳规划失败：${message}`);
      await this.finishRun(run.id, 'FAILED', {
        startedAt,
        decision: null,
        socialRead: decision.read,
        error: message,
      });
      await this.reschedule(personaId, settings.wakeIntervalMinutes, `心跳失败：${message}`);
      await log('FAILED', message, {
        ...heartbeatBase,
        runId: run.id,
        detail: {
          ...heartbeatBase,
          wakeReason: state.wakeReason,
          outcome: 'FAILED',
          conversationId,
          error: message,
        },
      });
      return null;
    }
  }

  /**
   * Read-only conversation check: real persona, settings, state, memories and
   * recent messages, plus one ephemeral test message. The model runs for real,
   * but no run, memory, relationship, prompt log or message is persisted.
   */
  async simulate(input: {
    personaId: string;
    conversationId?: string;
    text: string;
    senderName?: string;
    senderExternalId?: string;
    /** Earlier rehearsal turns; the persona's own simulated lines are isSelf. */
    history?: { role: 'user' | 'persona'; text: string }[];
  }): Promise<MindSimulationResult> {
    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { id: input.personaId },
    });
    if (!persona) {
      throw new NotFoundException({ code: 'PERSONA_NOT_FOUND', message: '人格不存在' });
    }
    const conversationId =
      input.conversationId ?? (await this.mostRecentConversationId(persona.id, persona.channelId));
    if (!conversationId) {
      throw new NotFoundException({
        code: 'MIND_SIMULATION_NO_CONVERSATION',
        message: '这个渠道还没有会话，先收到一条消息再试跑',
      });
    }
    const settings = await this.settings.peek(persona.channelId);
    const notes: string[] = [];
    let mode: PersonaMindMode = settings.mode;
    if (mode === 'OFF') {
      mode = 'SHADOW';
      notes.push('渠道心智模式为关闭，试跑按 SHADOW 读取，不会发送。');
    }
    const scene = await this.scenes.buildSimulationScene(persona.id, conversationId, {
      text: input.text,
      senderName: input.senderName,
      senderExternalId: input.senderExternalId,
      history: input.history,
    });
    if (!scene) {
      throw new NotFoundException({
        code: 'MIND_SIMULATION_NO_CONVERSATION',
        message: '会话不存在或不属于这个渠道',
      });
    }
    const storedState = await this.prisma.personaState.findUnique({
      where: { personaId: persona.id },
    });
    if (!storedState) {
      notes.push('人格还没有持久化状态，本次用默认状态试跑，没有写入状态行。');
    }
    const state = storedState ?? ephemeralState(persona);
    const sleepBrief = await this.longEvents.sleepBrief(
      persona.id,
      state,
      persona.values as Record<string, unknown> | null,
    );
    const intentionFeedback = await this.recentIntentionFeedback(persona.id);
    const recall = await this.memories.recallForScene(scene, buildMemoryQuery(scene), 12, {
      markRecalled: false,
    });
    const memories = [...recall.core, ...recall.relevant];
    const decision = this.social.buildDecision({ scene, state, memories });
    const conversationRead = readConversation({ scene, state, memories });
    const plannerResult = await this.planner.plan({
      scene,
      state,
      social: decision.read,
      memories: recall.relevant,
      coreMemories: recall.core,
      memoryStats: recall.stats,
      conversationRead,
      intentionFeedback,
      settings,
      mode,
      trigger: 'MANUAL',
      sleepBrief,
      dryRun: true,
      capturePrompts: true,
    });
    notes.push(
      '只读试跑：没有创建运行轨迹、没有写记忆/关系/待办，也没有留下提示词日志和测试消息。',
    );
    return {
      personaId: persona.id,
      channelId: persona.channelId,
      conversationId: scene.conversation.id,
      conversationName: scene.conversation.name,
      mode,
      scene: compactScene(scene),
      state: simulationState(state),
      decision: { engage: decision.engage, reason: decision.reason, read: decision.read },
      conversationRead,
      memories: { core: recall.core, relevant: recall.relevant, stats: recall.stats },
      plan: plannerResult.plan,
      toolCalls: plannerResult.toolCalls,
      prompts: plannerResult.prompts,
      providerId: plannerResult.providerId,
      model: plannerResult.model,
      latencyMs: plannerResult.latencyMs,
      promptTokens: plannerResult.promptTokens,
      completionTokens: plannerResult.completionTokens,
      notes,
    };
  }

  async latest(conversationId: string): Promise<AgentRunSummary | null> {
    const row = await this.prisma.agentRun.findFirst({
      where: { conversationId },
      orderBy: { startedAt: 'desc' },
      include: { conversation: { select: { name: true } } },
    });
    return row ? toRunSummary(row, row.conversation?.name ?? null) : null;
  }

  async runDetail(id: string): Promise<AgentRunDetail> {
    const row = await this.prisma.agentRun.findUnique({
      where: { id },
      include: {
        conversation: { select: { name: true } },
        steps: { orderBy: { createdAt: 'asc' } },
        actions: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) {
      throw new NotFoundException({ code: 'MIND_RUN_NOT_FOUND', message: '心智运行不存在' });
    }
    return {
      ...toRunSummary(row, row.conversation?.name ?? null),
      decision: row.decision,
      socialRead: row.socialRead,
      plan: row.plan,
      scene: (row.scene as AgentRunScene | null) ?? null,
      error: row.error,
      steps: row.steps.map(toStepRecord),
      actions: row.actions.map((action) => ({
        id: action.id,
        kind: action.kind,
        payload: action.payload,
        status: action.status,
        idempotencyKey: action.idempotencyKey,
        sentMessageId: action.sentMessageId,
        error: action.error,
        createdAt: action.createdAt.toISOString(),
        updatedAt: action.updatedAt.toISOString(),
      })),
    };
  }

  private async writeBack(
    runId: string,
    scene: MindScene,
    plan: ActionPlan,
    social: import('@inkseek/shared').SocialRead,
    state: PersonaState,
    settings: MindSettingsRecord,
  ): Promise<void> {
    resolveSceneRefs(scene, plan);
    await this.states.applyEmotion(scene.persona.id, plan.felt ?? social.felt, { runId });
    await this.states.recordTurnAttention(scene.persona.id, plan.engage, { runId });
    const drift = await this.applyDrift(scene, plan);
    await this.step(
      runId,
      'WRITEBACK',
      '属性漂移',
      {
        activity: plan.self?.activity ?? null,
        traits: plan.self?.traits ?? null,
        groupStance: plan.groupStance ?? null,
        relationshipSignals: plan.relationshipSignals.length,
      },
      drift,
      0,
    );
    await this.memories.applyDrafts(scene, plan.memoryWrites);
    if (plan.memoryWrites.length === 0) {
      const felt = plan.felt ?? social.felt;
      const strongSignal = plan.relationshipSignals.some((signal) =>
        [
          signal.affinity,
          signal.trust,
          signal.intimacy,
          signal.attraction,
          signal.hostility,
          signal.fear,
          signal.respect,
          signal.obligation,
          signal.dependency,
          signal.possessiveness,
          signal.friction,
          signal.unresolvedConflict,
        ].some((delta) => Math.abs(delta ?? 0) >= 4),
      );
      const significant =
        strongSignal ||
        (felt.intensity >= 80 &&
          /生气|委屈|心动|难过|害怕|恐惧|失望|开心|兴奋|冲突/u.test(felt.label));
      await this.memories.recordEpisode({
        scene,
        planReason: plan.reason,
        engage: plan.engage,
        stance: plan.stance,
        salience: significant ? Math.max(social.attention, 80) : social.attention,
        significant,
      });
    }
    for (const todo of plan.todos) {
      await this.prisma.agentTodo.create({
        data: {
          personaId: scene.persona.id,
          channelId: scene.persona.channelId,
          title: todo.title,
          detail: todo.detail ?? '',
          kind: todo.kind ?? 'follow_up',
          priority: todo.priority ?? 50,
          dueAt: todo.dueAt ? new Date(todo.dueAt) : null,
          wakeCondition: todo.wakeCondition as object | undefined,
          source: 'MIND',
          relatedContactId: todo.relatedContactId,
          relatedConversationId: todo.relatedConversationId ?? scene.conversation.id,
        },
      });
    }
    await this.persistPlanIntentions(runId, scene, plan);
    if (plan.longEvent) {
      const result = await this.longEvents.applyDraft(scene.persona.id, plan.longEvent, {
        runId,
      });
      await this.step(
        runId,
        'WRITEBACK',
        '长时事件',
        plan.longEvent,
        {
          action: result.action,
          event: result.event
            ? {
                id: result.event.id,
                kind: result.event.kind,
                title: result.event.title,
                status: result.event.status,
                startedAt: result.event.startedAt.toISOString(),
                plannedEndAt: result.event.plannedEndAt?.toISOString() ?? null,
                wakeMentions: result.event.wakeMentions,
                wakeWindowMinutes: result.event.wakeWindowMinutes,
                wakeKeywords: result.event.wakeKeywords,
              }
            : null,
          effects: result.effects,
        },
        0,
      );
    }
    if (plan.nextWakeAt && settings.selfScheduleEnabled) {
      const nextWakeAt = clampWakeAt(settings, new Date(plan.nextWakeAt));
      await this.states.scheduleWake(scene.persona.id, nextWakeAt, '人格自己安排的唤醒');
    }
    if (scene.conversation.kind === 'GROUP' && social.attention >= 55) {
      await this.stances.markRead(scene.persona.id, scene.conversation.id);
    }
    void state;
  }

  private async applyDrift(scene: MindScene, plan: ActionPlan): Promise<DriftSummary> {
    try {
      return await this.drift.applyTurn(scene, plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`属性漂移写回失败：${message}`);
      return { activity: null, grooming: null, selfTraits: {}, group: {}, relations: [] };
    }
  }

  /** Keeps an earlier private-chat fragment visible even though only the last
   * message of the burst runs a real turn. */
  async recordMergedMessage(
    message: ChatMessageSnapshot,
    meta: { batchSize: number; quietSeconds: number },
  ): Promise<void> {
    if (message.isSelf) {
      return;
    }
    const boundPersona = await this.prisma.chatChannelPersona.findUnique({
      where: { channelId: message.channelId },
      select: { id: true },
    });
    if (!boundPersona) {
      return;
    }
    const settings = await this.settings.get(message.channelId);
    const preview = message.text.trim().replace(/\s+/gu, ' ').slice(0, 30);
    const reason = `私聊连发，合并到同一轮回复（静默 ${meta.quietSeconds} 秒）${
      preview ? `：${preview}` : ''
    }`;
    await this.recordSkippedRun({
      personaId: boundPersona.id,
      message,
      mode: settings.mode,
      trigger: 'MESSAGE',
      reason,
      stepTitle: '私聊连发合并',
      stepInput: {
        conversationId: message.conversationId,
        batchSize: meta.batchSize,
        quietSeconds: meta.quietSeconds,
      },
      stepOutput: { merged: true, batchSize: meta.batchSize },
    });
  }

  private async recordSkippedRun(input: {
    personaId: string;
    message: ChatMessageSnapshot;
    mode: PersonaMindMode;
    trigger: Trigger;
    reason: string;
    stepTitle: string;
    stepInput: unknown;
    stepOutput: unknown;
  }): Promise<string> {
    const startedAt = new Date();
    const run = await this.prisma.agentRun.create({
      data: {
        personaId: input.personaId,
        channelId: input.message.channelId,
        conversationId: input.message.conversationId,
        messageId: input.message.messageId || null,
        trigger: input.trigger,
        mode: input.mode,
        status: 'RUNNING',
        scene: compactMessageScene(input.message),
      },
    });
    await this.step(run.id, 'ATTENTION', input.stepTitle, input.stepInput, input.stepOutput, 0);
    await this.finishRun(run.id, 'SKIPPED', {
      startedAt,
      decision: { engage: false, reason: input.reason, stance: '沉默', felt: null, shown: null },
      socialRead: null,
    });
    return run.id;
  }

  private async finishRun(
    runId: string,
    status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED',
    input: {
      startedAt: Date;
      decision: unknown;
      socialRead: unknown;
      plan?: unknown;
      providerId?: string | null;
      model?: string | null;
      latencyMs?: number;
      promptTokens?: number;
      completionTokens?: number;
      error?: string;
    },
  ): Promise<void> {
    const finishedAt = new Date();
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        status,
        finishedAt,
        latencyMs: Date.now() - input.startedAt.getTime(),
        decision: input.decision as object | undefined,
        socialRead: input.socialRead as object | undefined,
        plan: input.plan as object | undefined,
        providerId: input.providerId ?? null,
        model: input.model ?? null,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        error: input.error ?? null,
      },
    });
  }

  private async step(
    runId: string,
    type: AgentStep['type'],
    title: string,
    input: unknown,
    output: unknown,
    durationMs: number,
    error?: string,
  ): Promise<void> {
    await this.prisma.agentStep.create({
      data: {
        runId,
        type,
        title,
        input: input as object | undefined,
        output: output as object | undefined,
        durationMs,
        error: error ?? null,
      },
    });
  }

  private async mostRecentConversationId(
    personaId: string,
    channelId: string,
  ): Promise<string | null> {
    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { id: personaId },
      select: { channelId: true },
    });
    if (!persona || persona.channelId !== channelId) {
      return null;
    }
    const row = await this.prisma.chatConversation.findFirst({
      where: { channelId, lastMessageAt: { not: null } },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** Counts unsolicited runs that actually sent, so the daily budget caps topics, not beats. */
  private async proactiveSendsToday(personaId: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.prisma.agentRun.count({
      where: {
        personaId,
        trigger: { in: ['PROACTIVE', 'HEARTBEAT'] },
        startedAt: { gte: start },
        actions: { some: { status: 'SENT' } },
      },
    });
  }

  /**
   * Rolls whether this idle beat may consider an everyday event. The roll and
   * the daily cap only decide whether the model gets the nudge; what actually
   * happened and which values moved is still the model's call.
   */
  private async rollLifeEvent(
    personaId: string,
    settings: MindSettingsRecord,
    timeZone: string | null,
  ): Promise<boolean> {
    const chance = settings.lifeEventChancePercent;
    const limit = settings.lifeEventDailyLimit;
    if (chance <= 0 || limit <= 0) {
      return false;
    }
    const now = new Date();
    const today = localDateKey(now, timeZone);
    const recent = await this.prisma.agentStep.findMany({
      where: {
        title: '生活事件判定',
        run: { personaId },
        createdAt: { gte: new Date(now.getTime() - 48 * 3600_000) },
      },
      select: { createdAt: true },
    });
    const used = recent.filter((step) => localDateKey(step.createdAt, timeZone) === today).length;
    if (used >= limit) {
      return false;
    }
    return Math.random() * 100 < chance;
  }

  /**
   * Rolls whether an idle beat is spent reading about something the persona
   * cares about. curiosityDailyLimit = 0 means no daily cap; the probability
   * still keeps quiet days quiet.
   */
  private async rollCuriosity(
    personaId: string,
    settings: MindSettingsRecord,
    timeZone: string | null,
  ): Promise<boolean> {
    const chance = settings.curiosityChancePercent;
    if (chance <= 0) {
      return false;
    }
    const limit = settings.curiosityDailyLimit;
    if (limit > 0) {
      const now = new Date();
      const today = localDateKey(now, timeZone);
      const recent = await this.prisma.agentStep.findMany({
        where: {
          title: '好奇探索',
          run: { personaId },
          createdAt: { gte: new Date(now.getTime() - 48 * 3600_000) },
        },
        select: { createdAt: true },
      });
      const used = recent.filter((step) => localDateKey(step.createdAt, timeZone) === today).length;
      if (used >= limit) {
        return false;
      }
    }
    return Math.random() * 100 < chance;
  }

  private async reflectionDue(personaId: string, settings: MindSettingsRecord): Promise<boolean> {
    const hours = settings.reflectionIntervalHours;
    if (hours <= 0) {
      return false;
    }
    const last = await this.prisma.agentStep.findFirst({
      where: { title: '自我反思', run: { personaId } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!last) {
      return true;
    }
    return Date.now() - last.createdAt.getTime() >= hours * 3600_000;
  }

  /** Runs at most once per persona-local day; stale knowledge fades slowly. */
  private async maybeDecayMemories(personaId: string, timeZone: string | null): Promise<number> {
    const now = new Date();
    const today = localDateKey(now, timeZone);
    const last = await this.prisma.agentStep.findFirst({
      where: {
        title: '记忆衰减',
        run: { personaId },
        createdAt: { gte: new Date(now.getTime() - 48 * 3600_000) },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (last && localDateKey(last.createdAt, timeZone) === today) {
      return 0;
    }
    return this.memories.decay(personaId);
  }

  /**
   * Idle heartbeats used to return before any model turn, so a stale activity
   * could survive for days. This focused call only revisits the activity.
   */
  private async reviewStaleActivity(
    personaId: string,
    persona: MindPersona,
    state: PersonaState,
    sleepBrief: MindSleepBrief,
    settings: MindSettingsRecord,
    timeZone: string | null,
  ): Promise<void> {
    const activity = state.currentActivity.trim();
    if (!activity || SLEEP_ACTIVITY_RE.test(activity) || !state.activitySince) {
      return;
    }
    const now = Date.now();
    const ageMinutes = (now - state.activitySince.getTime()) / 60_000;
    if (ageMinutes < ACTIVITY_REVIEW_AFTER_MINUTES) {
      return;
    }
    const checkedAt = state.activityCheckedAt?.getTime() ?? 0;
    if (checkedAt > 0 && now - checkedAt < ACTIVITY_REVIEW_COOLDOWN_MINUTES * 60_000) {
      return;
    }
    const values = persona.values as Record<string, unknown> | null;
    try {
      const result = await this.planner.refreshActivity({
        personaName: persona.name,
        identity: persona.identity || readString(values?.['identity']),
        state,
        settings,
        sleepBrief,
        timeZone,
      });
      await this.states.markActivityChecked(personaId);
      if (!result || result.activity === activity) {
        return;
      }
      await this.states.update(
        personaId,
        {
          currentActivity: result.activity,
          ...(result.location ? { location: result.location } : {}),
        },
        { reason: `活动时效复核：${result.reason}`, source: 'AGENT' },
      );
    } catch (error) {
      await this.states.markActivityChecked(personaId).catch(() => undefined);
      this.logger.warn(
        `活动时效复核失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async reschedule(
    personaId: string,
    minutes: number,
    reason: string,
    options?: { heartbeat?: boolean },
  ): Promise<void> {
    const nextWakeAt = new Date(Date.now() + Math.max(1, minutes) * 60_000);
    await this.states.scheduleWake(personaId, nextWakeAt, reason);
    if (options?.heartbeat !== false) {
      await this.states.markHeartbeat(personaId);
    }
  }

  private async completeWakeItems(
    todoIds: string[],
    intentionIds: string[],
    plan: ActionPlan,
    hadActions: boolean,
  ): Promise<void> {
    if (todoIds.length > 0) {
      const accomplished = plan.engage && plan.beats.length > 0;
      await this.prisma.agentTodo.updateMany({
        where: { id: { in: todoIds } },
        data: {
          status: accomplished ? 'DONE' : 'ACTIVE',
          completedAt: accomplished ? new Date() : null,
          ...(accomplished ? {} : { dueAt: new Date(Date.now() + 60 * 60_000) }),
        },
      });
    }
    for (const intentionId of intentionIds) {
      await this.prisma.agentIntention.update({
        where: { id: intentionId },
        data: {
          status: hadActions ? 'SENT' : 'DEFERRED',
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          earliestAt: hadActions ? undefined : new Date(Date.now() + 3_600_000),
        },
      });
    }
  }

  /**
   * A proactive attempt is a hypothesis. When the other side answers, record
   * how it landed so later heartbeats can revise confidence instead of
   * repeating the same opening.
   */
  private async applyInboundFeedback(
    personaId: string,
    senderId: string,
    text: string,
  ): Promise<void> {
    const since = new Date(Date.now() - 72 * 3600_000);
    const intention = await this.prisma.agentIntention.findFirst({
      where: {
        personaId,
        targetType: 'PERSON',
        targetId: senderId,
        status: 'SENT',
        feedback: '',
        lastAttemptAt: { gte: since },
      },
      orderBy: { lastAttemptAt: 'desc' },
    });
    if (!intention) {
      return;
    }
    const kind = classifyText(text);
    let feedback: string;
    let delta = 0;
    switch (kind) {
      case 'question':
        feedback = '对方接住了话题，还继续追问';
        delta = 5;
        break;
      case 'request':
        feedback = '对方顺着话题请你帮忙';
        delta = 5;
        break;
      case 'substantive':
        feedback = '对方认真接住了这个话题';
        delta = 3;
        break;
      case 'ack':
        feedback = '对方只简单应了一声';
        break;
      case 'ending':
        feedback = '对方顺势收尾，没有接这个话题';
        delta = -8;
        break;
      default:
        feedback = '对方回了一条非文字消息';
        delta = 2;
        break;
    }
    await this.prisma.agentIntention.update({
      where: { id: intention.id },
      data: {
        feedback,
        feedbackAt: new Date(),
        confidence: clamp(intention.confidence + delta, 0, 100),
      },
    });
  }

  /** Proactive attempts with no answer after 12h lose a little confidence. */
  private async sweepUnansweredIntentions(personaId: string): Promise<void> {
    const now = new Date();
    await this.prisma.agentIntention.updateMany({
      where: { personaId, status: 'PENDING', expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });
    const cutoff = new Date(Date.now() - 12 * 3600_000);
    const rows = await this.prisma.agentIntention.findMany({
      where: {
        personaId,
        status: 'SENT',
        feedback: '',
        lastAttemptAt: { lte: cutoff },
      },
      take: 20,
    });
    for (const row of rows) {
      await this.prisma.agentIntention.update({
        where: { id: row.id },
        data: {
          feedback: '发出后 12 小时没有回应',
          feedbackAt: new Date(),
          confidence: clamp(row.confidence - 5, 0, 100),
        },
      });
    }
  }

  private async recentIntentionFeedback(personaId: string): Promise<MindIntentionFeedback[]> {
    const rows = await this.prisma.agentIntention.findMany({
      where: {
        personaId,
        feedback: { not: '' },
        feedbackAt: { gte: new Date(Date.now() - 7 * 86400_000) },
      },
      orderBy: { feedbackAt: 'desc' },
      take: 3,
    });
    return rows.map((row) => ({
      need: row.need,
      seed: row.seed,
      feedback: row.feedback,
      status: row.status,
      at: (row.feedbackAt ?? row.updatedAt).toISOString(),
    }));
  }

  private async dueIntentionBriefs(
    personaId: string,
    rows: AgentIntention[],
  ): Promise<MindWakeBrief['dueIntentions']> {
    const targetIds = [...new Set(rows.map((row) => row.targetId).filter(Boolean))];
    const relations =
      targetIds.length > 0
        ? await this.prisma.personaRelationship.findMany({
            where: { personaId, contactId: { in: targetIds } },
            select: {
              contactId: true,
              affinity: true,
              intimacy: true,
              trust: true,
              obligation: true,
            },
          })
        : [];
    const relationById = new Map(relations.map((row) => [row.contactId, row]));
    return rows
      .map((row) => ({
        id: row.id,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        seed: row.seed,
        urgency: row.urgency,
        need: row.need,
        confidence: row.confidence,
        risk: row.risk,
        relationScore: relationScoreOf(relationById.get(row.targetId) ?? null),
      }))
      .sort((left, right) => intentionPriority(right) - intentionPriority(left));
  }

  /**
   * Counts only unsolicited model turns. Message-triggered replies and
   * due-todo obligations do not consume this budget.
   */
  private async wakeGate(
    personaId: string,
    settings: MindSettingsRecord,
    timeZone: string | null,
  ): Promise<{ allowed: boolean; nextMinutes: number; reason: string }> {
    const limit = settings.proactiveWakeDailyLimit;
    const gapSeconds = settings.proactiveWakeMinGapSeconds;
    const fallback = settings.wakeIntervalMinutes;
    if (limit <= 0 && gapSeconds <= 0) {
      return { allowed: true, nextMinutes: fallback, reason: '' };
    }
    const now = new Date();
    const runs = await this.prisma.agentRun.findMany({
      where: {
        personaId,
        trigger: { in: ['HEARTBEAT', 'PROACTIVE'] },
        status: { not: 'SKIPPED' },
        startedAt: { gte: new Date(now.getTime() - 48 * 3600_000) },
      },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    });
    const lastWake = runs[0];
    if (gapSeconds > 0 && lastWake) {
      const remainingMs = gapSeconds * 1000 - (now.getTime() - lastWake.startedAt.getTime());
      if (remainingMs > 0) {
        const minutes = Math.ceil(remainingMs / 60_000);
        return {
          allowed: false,
          nextMinutes: Math.max(1, minutes),
          reason: `自发唤醒间隔未到，还需 ${minutes} 分钟`,
        };
      }
    }
    if (limit > 0) {
      const today = localDateKey(now, timeZone);
      const used = runs.filter((run) => localDateKey(run.startedAt, timeZone) === today).length;
      if (used >= limit) {
        return {
          allowed: false,
          nextMinutes: minutesUntilLocalMidnight(now, timeZone),
          reason: `今日自发唤醒次数已用完（${used}/${limit}）`,
        };
      }
    }
    return { allowed: true, nextMinutes: fallback, reason: '' };
  }

  /**
   * Turns the plan's intentions into persisted goals, including the "we can
   * pick this up later" point from an intentional close.
   */
  private async persistPlanIntentions(
    runId: string,
    scene: MindScene,
    plan: ActionPlan,
  ): Promise<void> {
    const drafts = [...(plan.intentions ?? [])];
    if (plan.dialogue?.close) {
      await this.step(
        runId,
        'WRITEBACK',
        '对话收尾',
        { summary: plan.dialogue.summary ?? null, nextOpening: plan.dialogue.nextOpening ?? null },
        { close: true },
        0,
      );
      if (plan.dialogue.nextOpening) {
        const target = conversationPartnerContactId(scene);
        drafts.push({
          need: 'followup',
          ...(target ? { targetContactId: target } : {}),
          reason: plan.dialogue.summary ?? '想以后再接着聊',
          seed: plan.dialogue.nextOpening,
          urgency: 40,
          confidence: 55,
          risk: 20,
          earliestAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
          expiresAt: new Date(Date.now() + 14 * 86400_000).toISOString(),
        });
      }
    }
    if (drafts.length === 0) {
      return;
    }
    const now = new Date();
    const created: string[] = [];
    let skipped = 0;
    for (const draft of drafts) {
      const seed = draft.seed.trim();
      if (!seed) {
        continue;
      }
      const existing = await this.prisma.agentIntention.findFirst({
        where: { personaId: scene.persona.id, status: 'PENDING', seed },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      const earliest = draft.earliestAt ? new Date(draft.earliestAt) : now;
      const row = await this.prisma.agentIntention.create({
        data: {
          personaId: scene.persona.id,
          channelId: scene.persona.channelId,
          targetType: draft.targetContactId ? 'PERSON' : 'SELF',
          targetId: draft.targetContactId ?? '',
          reason: draft.reason?.trim().slice(0, 2000) ?? '',
          seed: seed.slice(0, 4000),
          need: draft.need?.trim().slice(0, 40) ?? '',
          urgency: clamp(draft.urgency ?? 50, 0, 100),
          confidence: clamp(draft.confidence ?? 50, 0, 100),
          risk: clamp(draft.risk ?? 20, 0, 100),
          earliestAt: earliest.getTime() < now.getTime() ? now : earliest,
          expiresAt: draft.expiresAt ? new Date(draft.expiresAt) : null,
        },
      });
      created.push(row.id);
    }
    await this.step(
      runId,
      'WRITEBACK',
      '待发意图',
      { requested: drafts.length },
      { created, skipped },
      0,
    );
  }

  /**
   * Long-term memory upkeep is a small, best-effort LLM task. Running it after
   * normal turns as well as heartbeats keeps the knowledge base growing even
   * when no heartbeat plans. The per-persona guard stops a heartbeat and a
   * message turn from summarizing the same episodes twice.
   */
  private async consolidateIfNeeded(
    personaId: string,
    scene: MindScene,
    state: PersonaState,
    runId?: string,
  ): Promise<void> {
    if (this.consolidating.has(personaId)) {
      return;
    }
    this.consolidating.add(personaId);
    try {
      if ((await this.memories.countUnconsolidated(personaId)) < 2) {
        return;
      }
      const result = await this.memories.consolidate(personaId);
      if (result.created === 0) {
        return;
      }
      await this.writeJournal(personaId, result.summary, scene, state);
      if (runId && result.episodeIds.length > 0) {
        await this.step(
          runId,
          'CONSOLIDATION',
          '整理近期记忆',
          { episodeIds: result.episodeIds },
          { created: result.created, summary: result.summary },
          0,
        );
      }
    } catch (error) {
      this.logger.warn(`记忆整理失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.consolidating.delete(personaId);
    }
  }

  private async writeJournal(
    personaId: string,
    summary: string,
    scene: MindScene,
    state: PersonaState,
  ): Promise<void> {
    if (!summary.trim()) {
      return;
    }
    const persona = scene.persona;
    const values = persona.values as Record<string, unknown> | null;
    const timeZone = normalizeTimeZone(readString(values?.['time_zone']));
    const date = localDateKey(new Date(), timeZone);
    await this.prisma.personaJournal.upsert({
      where: { personaId_date: { personaId, date } },
      create: {
        personaId,
        channelId: persona.channelId,
        date,
        content: summary,
        mood: moodLabel(state),
      },
      update: { content: summary, mood: moodLabel(state) },
    });
  }
}

function resolveSceneRefs(scene: MindScene, plan: ActionPlan): void {
  const byRef = new Map<string, string>();
  for (const member of scene.cast) {
    byRef.set(member.contactId, member.contactId);
    byRef.set(member.externalId, member.contactId);
    byRef.set(member.nickname, member.contactId);
  }
  const known = new Set(scene.cast.map((member) => member.contactId));
  const resolve = (ref?: string, name?: string): string => {
    const raw = ref?.trim() ?? '';
    const direct = raw ? byRef.get(raw) : undefined;
    if (direct) {
      return direct;
    }
    const named = name?.trim() ? byRef.get(name.trim()) : undefined;
    return named ?? raw;
  };

  plan.relationshipSignals = plan.relationshipSignals
    .map((signal) => ({ ...signal, contactId: resolve(signal.contactId) }))
    .filter((signal) => known.has(signal.contactId));
  plan.memoryWrites = plan.memoryWrites.map((draft) => {
    if (draft.subjectType === 'PERSON') {
      const mapped = resolve(draft.subjectId, draft.subjectName);
      return mapped && mapped !== draft.subjectId ? { ...draft, subjectId: mapped } : draft;
    }
    if (draft.subjectType === 'GROUP' && draft.subjectId !== scene.conversation.id) {
      return { ...draft, subjectId: scene.conversation.id };
    }
    return draft;
  });
  for (const todo of plan.todos) {
    if (todo.relatedContactId) {
      todo.relatedContactId = resolve(todo.relatedContactId);
    }
  }
  for (const intention of plan.intentions ?? []) {
    if (intention.targetContactId) {
      intention.targetContactId = resolve(intention.targetContactId);
    }
  }
}

function skipped(
  reason: string,
  options?: {
    runId?: string;
    socialRead?: MindTurnResult['socialRead'];
    memories?: PersonaMemoryRecord[];
    suppressed?: boolean;
  },
): MindTurnResult {
  return {
    runId: options?.runId ?? '',
    engage: false,
    reason,
    plan: null,
    socialRead: options?.socialRead ?? null,
    felt: null,
    shown: null,
    memories: options?.memories ?? [],
    skipped: true,
    ...(options?.suppressed ? { suppressed: true } : {}),
  };
}

function buildMemoryQuery(scene: MindScene): string {
  const recent = scene.messages
    .slice(-5)
    .map((message) => message.text)
    .join('\n');
  return [scene.conversation.name, scene.anchor.senderName, recent]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
}

function compactMessageScene(message: ChatMessageSnapshot) {
  return {
    conversationId: message.conversationId,
    conversationName: null,
    kind: message.conversationKind,
    messages: [
      {
        id: message.messageId,
        sender: message.senderName,
        isSelf: message.isSelf,
        text: message.text.slice(0, 300),
        images: [],
        imageCount: message.imageCount,
        sentAt: message.sentAt.toISOString(),
      },
    ],
    cast: [],
  };
}

function compactScene(scene: MindScene) {
  return {
    conversationId: scene.conversation.id,
    conversationName: scene.conversation.name,
    kind: scene.conversation.kind,
    messages: scene.messages.slice(-12).map((message) => ({
      id: message.id,
      sender: message.senderName,
      isSelf: message.isSelf,
      text: message.text.slice(0, 300),
      images: message.images.slice(0, 4).map((image) => image.slice(0, 300)),
      imageCount: message.imageCount,
      sentAt: message.sentAt,
    })),
    cast: scene.cast.slice(0, 10).map((member) => ({
      contactId: member.contactId,
      nickname: member.nickname,
      relationship: member.relationship,
    })),
  };
}

function toPublicMemory(memory: PersonaMemoryRecord): PersonaMemoryRecord {
  return memory;
}

function ephemeralState(persona: MindPersona): PersonaState {
  const now = new Date();
  const values =
    persona.values && typeof persona.values === 'object' && !Array.isArray(persona.values)
      ? (persona.values as Record<string, unknown>)
      : {};
  const cardGrooming = Number(values['grooming']);
  return {
    id: `simulation-${persona.id}`,
    personaId: persona.id,
    moodValence: 0,
    moodArousal: 50,
    moodDominance: 0,
    energy: 70,
    stress: 20,
    socialBattery: 70,
    attention: 60,
    currentActivity: '',
    activitySince: null,
    activityCheckedAt: null,
    location: '',
    sleepDebt: 0,
    health: 80,
    grooming: Number.isFinite(cardGrooming) ? clamp(Math.round(cardGrooming), 0, 100) : 70,
    lastWakeAt: null,
    nextWakeAt: null,
    lastHeartbeatAt: null,
    leaseUntil: null,
    leaseOwner: null,
    wakeReason: '',
    createdAt: now,
    updatedAt: now,
  };
}

function simulationState(state: PersonaState): Record<string, unknown> {
  return {
    moodValence: state.moodValence,
    moodArousal: state.moodArousal,
    moodDominance: state.moodDominance,
    energy: state.energy,
    stress: state.stress,
    socialBattery: state.socialBattery,
    attention: state.attention,
    currentActivity: state.currentActivity,
    activitySince: state.activitySince?.toISOString() ?? null,
    location: state.location,
    sleepDebt: state.sleepDebt,
    health: state.health,
    grooming: state.grooming,
  };
}

function toStepRecord(step: AgentStep): AgentStepRecord {
  return {
    id: step.id,
    type: step.type,
    title: step.title,
    input: step.input,
    output: step.output,
    durationMs: step.durationMs,
    error: step.error,
    createdAt: step.createdAt.toISOString(),
  };
}

function heartbeatPlanSummary(plan: ActionPlan) {
  return {
    engage: plan.engage,
    reason: plan.reason,
    stance: plan.stance,
    felt: plan.felt ?? null,
    shown: plan.shown ?? null,
    beats: plan.beats.map((beat) =>
      beat.kind === 'text' ? { kind: 'text', text: beat.text, delayMs: beat.delayMs } : { ...beat },
    ),
    memoryWrites: plan.memoryWrites.length,
    relationshipSignals: plan.relationshipSignals.length,
    todos: plan.todos.length,
    intentions: plan.intentions?.length ?? 0,
    dialogue: plan.dialogue ?? null,
    longEvent: plan.longEvent ?? null,
    nextWakeAt: plan.nextWakeAt ?? null,
  };
}

function heartbeatActionSummary(
  actions: readonly {
    kind: string;
    status: string;
    payload: unknown;
    sentMessageId: string | null;
    error: string | null;
  }[],
) {
  return actions.map((action) => ({
    kind: action.kind,
    status: action.status,
    payload: action.payload,
    sentMessageId: action.sentMessageId,
    error: action.error,
  }));
}

export function toRunSummary(
  row: {
    id: string;
    personaId: string;
    channelId: string;
    conversationId: string | null;
    messageId: string | null;
    trigger: string;
    mode: string;
    status: string;
    providerId: string | null;
    model: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
    cost: number | null;
    latencyMs: number | null;
    decision: unknown;
    scene: unknown;
    startedAt: Date;
    finishedAt: Date | null;
  },
  conversationName: string | null,
): AgentRunSummary {
  const decision =
    row.decision && typeof row.decision === 'object' && !Array.isArray(row.decision)
      ? (row.decision as Record<string, unknown>)
      : null;
  const preview = lastInboundPreview(row.scene);
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    conversationId: row.conversationId,
    conversationName,
    messageId: row.messageId,
    messagePreview: preview?.text ?? null,
    messageSender: preview?.sender ?? null,
    trigger: row.trigger as AgentRunSummary['trigger'],
    mode: row.mode as AgentRunSummary['mode'],
    status: row.status as AgentRunSummary['status'],
    providerId: row.providerId,
    model: row.model,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    cost: row.cost,
    latencyMs: row.latencyMs,
    engage: typeof decision?.['engage'] === 'boolean' ? decision['engage'] : null,
    reason: typeof decision?.['reason'] === 'string' ? decision['reason'] : null,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/** Prefer the latest inbound message, falling back to the raw last line. */
function lastInboundPreview(scene: unknown): { text: string; sender: string } | null {
  if (!scene || typeof scene !== 'object') {
    return null;
  }
  const messages = (scene as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) {
    return null;
  }
  let fallback: { text: string; sender: string } | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as {
      text?: unknown;
      sender?: unknown;
      isSelf?: unknown;
      images?: unknown;
      imageCount?: unknown;
    };
    if (!message) {
      continue;
    }
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    const images = Array.isArray(message.images)
      ? message.images.filter(
          (image): image is string => typeof image === 'string' && image.trim().length > 0,
        )
      : [];
    const imageCount = typeof message.imageCount === 'number' ? message.imageCount : images.length;
    if (!text && images.length === 0 && imageCount === 0) {
      continue;
    }
    const preview = text
      ? text.replace(/\s+/gu, ' ').slice(0, 160)
      : images.length > 0
        ? `［图片］${images[0]!.replace(/\s+/gu, ' ').slice(0, 140)}`
        : `［图片 ×${imageCount}］`;
    const item = {
      text: preview,
      sender: typeof message.sender === 'string' ? message.sender : '',
    };
    if (message.isSelf !== true) {
      return item;
    }
    fallback ??= item;
  }
  return fallback;
}

function moodLabel(state: PersonaState): string {
  const base =
    state.moodValence > 30
      ? '愉快'
      : state.moodValence > 10
        ? '轻松'
        : state.moodValence < -30
          ? '低落'
          : state.moodValence < -10
            ? '烦闷'
            : '平静';
  if (state.moodArousal > 70) return `亢奋·${base}`;
  if (state.moodArousal < 30) return `倦怠·${base}`;
  return base;
}

function effectiveWakeMinutes(settings: MindSettingsRecord, quiet: boolean): number {
  const base = quiet ? settings.quietIntervalMinutes : settings.wakeIntervalMinutes;
  return Math.min(settings.wakeMaxMinutes, Math.max(settings.wakeMinMinutes, base));
}

function intentionPriority(intent: {
  urgency: number;
  confidence: number;
  risk: number;
  relationScore: number;
}): number {
  const confidenceFactor = 0.5 + intent.confidence / 200;
  const relationFactor = 1 + Math.max(-50, Math.min(50, intent.relationScore)) / 100;
  const riskFactor = 1 - Math.min(0.4, Math.max(0, intent.risk) / 250);
  return intent.urgency * confidenceFactor * relationFactor * riskFactor;
}

/** The person a private chat is with, or the last person who spoke in a group. */
function conversationPartnerContactId(scene: MindScene): string | null {
  if (scene.conversation.kind === 'PRIVATE') {
    return scene.cast.find((member) => !member.isSelf)?.contactId ?? null;
  }
  for (let index = scene.messages.length - 1; index >= 0; index -= 1) {
    const message = scene.messages[index];
    if (message && !message.isSelf) {
      return message.senderId;
    }
  }
  return null;
}

function localMinute(date: Date, timeZone: string | null): number {
  if (timeZone) {
    try {
      return Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone,
          minute: 'numeric',
          hour12: false,
        }).format(date),
      );
    } catch {
      // Fall back to the server local minute.
    }
  }
  return date.getMinutes();
}

function minutesUntilLocalMidnight(now: Date, timeZone: string | null): number {
  return Math.max(1, 24 * 60 - (localHour(now, timeZone) * 60 + localMinute(now, timeZone)));
}

function clampWakeAt(settings: MindSettingsRecord, requested: Date): Date {
  const now = Date.now();
  const earliest = now + Math.max(1, settings.wakeMinMinutes) * 60_000;
  const latest = now + Math.max(settings.wakeMinMinutes, settings.wakeMaxMinutes) * 60_000;
  const value = requested.getTime();
  if (!Number.isFinite(value)) {
    return new Date(now + effectiveWakeMinutes(settings, false) * 60_000);
  }
  return new Date(Math.min(latest, Math.max(earliest, value)));
}
