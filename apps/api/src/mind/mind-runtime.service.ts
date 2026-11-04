import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import type {
  AgentRunDetail,
  AgentRunSummary,
  AgentStepRecord,
  ActionPlan,
  MindSettingsRecord,
  MindTurnResult,
  PersonaMindMode,
  PersonaMemoryRecord,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { AgentStep, PersonaState } from '../generated/prisma/client.js';
import type { ChatMessageSnapshot } from '../chat/chat-message.types.js';
import { MindActionExecutor } from './mind-action-executor.service.js';
import { MindDriftService, type DriftSummary } from './mind-drift.service.js';
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
  localDateKey,
  localHour,
  isQuietHour,
  readString,
  type MindScene,
  type MindWakeBrief,
} from './mind.types.js';

type Trigger = 'MESSAGE' | 'HEARTBEAT' | 'PROACTIVE' | 'MANUAL';

@Injectable()
export class MindRuntimeService implements OnModuleInit {
  private readonly logger = new Logger(MindRuntimeService.name);

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
  ) {}

  async onModuleInit(): Promise<void> {
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

  async turn(input: {
    message: ChatMessageSnapshot;
    mode?: PersonaMindMode;
    trigger?: Trigger;
  }): Promise<MindTurnResult> {
    if (input.message.isSelf) {
      return skipped('自己发出的消息不触发心智');
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
    const locked = avoidWindow && (await this.replyLock.active(input.message.conversationId));
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

    const startedAt = new Date();
    const state = await this.states.ensure(scene.persona.id);
    const sleepBrief = await this.longEvents.sleepBrief(
      scene.persona.id,
      state,
      scene.persona.values as Record<string, unknown> | null,
    );
    const query = buildMemoryQuery(scene);
    const memories = await this.memories.searchForScene(scene, query, 10);
    const decision = this.social.buildDecision({ scene, state, memories });
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
        scene,
        state,
        social: decision.read,
        memories,
        settings,
        mode,
        trigger: input.trigger ?? 'MESSAGE',
        sleepBrief,
      });
    } catch (error) {
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
    if (plan.engage && plan.beats.length > 0 && mode !== 'SHADOW' && avoidWindow) {
      const acquired = await this.replyLock.acquire({
        conversationId: scene.conversation.id,
        runId: run.id,
        windowSeconds: settings.replyAvoidSeconds,
      });
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
    await this.writeBack(run.id, scene, plan, decision.read, state, settings);
    await this.executor.execute({
      plan,
      scene,
      settings,
      mode,
      runId: run.id,
    });
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
    if (!settings.heartbeatEnabled || settings.mode === 'OFF') {
      return null;
    }
    const proactiveUsed = await this.proactiveSendsToday(personaId);
    const proactiveAllowed =
      settings.proactiveEnabled &&
      (settings.dailyProactiveBudget < 0 || proactiveUsed < settings.dailyProactiveBudget);
    let state = await this.states.ensure(personaId);
    const now = new Date();
    const values = persona.values as Record<string, unknown> | null;
    const timeZone = readString(values?.['time_zone']) || null;
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
        return null;
      }
    }

    const sleepBrief = await this.longEvents.sleepBrief(personaId, state, values);

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
          where: { personaId, status: 'PENDING', earliestAt: { lte: now } },
          orderBy: [{ urgency: 'desc' }, { createdAt: 'asc' }],
          take: 5,
        })
      : [];
    const unconsolidated = await this.memories.countUnconsolidated(personaId);

    if (dueTodos.length === 0 && dueIntentions.length === 0 && unconsolidated < 2) {
      await this.reschedule(personaId, effectiveWakeMinutes(settings, quiet), '无到期事项');
      return null;
    }

    const conversationId =
      dueTodos.find((todo) => todo.relatedConversationId)?.relatedConversationId ??
      (await this.mostRecentConversationId(personaId, persona.channelId));
    if (!conversationId) {
      await this.reschedule(personaId, settings.wakeIntervalMinutes, '没有可用的会话');
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
      return null;
    }

    const overnightMessages = await this.scenes.recentMessages(
      conversationId,
      12,
      new Date(now.getTime() - 12 * 3600_000),
    );
    const recentMemories = await this.memories.list({
      personaId,
      limit: 6,
      offset: 0,
    });
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
      dueIntentions: dueIntentions.map((intent) => ({
        id: intent.id,
        targetType: intent.targetType,
        targetId: intent.targetId,
        reason: intent.reason,
        seed: intent.seed,
        urgency: intent.urgency,
      })),
      overnightMessages,
      recentMemories: recentMemories.map((memory) => ({
        title: memory.title,
        content: memory.content,
        occurredAt: memory.occurredAt,
      })),
      unconsolidatedCount: unconsolidated,
    };

    const mode: PersonaMindMode =
      settings.mode === 'LIVE' && proactiveAllowed
        ? 'LIVE'
        : settings.mode === 'APPROVAL' && proactiveAllowed
          ? 'APPROVAL'
          : 'SHADOW';
    const query = [
      '我醒来后需要处理的待办、承诺和最近发生的事',
      ...dueTodos.map((todo) => todo.title),
      ...dueIntentions.map((intent) => intent.reason || intent.seed),
    ].join('；');
    const memories = await this.memories.searchForScene(scene, query, 10);
    const decision = this.social.buildDecision({ scene, state, memories });
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

    try {
      const plannerResult = await this.planner.plan({
        scene,
        state,
        social: decision.read,
        memories,
        settings,
        mode,
        trigger: 'HEARTBEAT',
        wakeBrief,
        sleepBrief,
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
      await this.memories
        .consolidate(personaId)
        .then(async (result) => {
          if (result.created > 0) {
            await this.writeJournal(personaId, result.summary, scene, state);
            if (result.episodeIds.length > 0) {
              await this.step(
                run.id,
                'CONSOLIDATION',
                '整理近期记忆',
                {
                  episodeIds: result.episodeIds,
                },
                {
                  created: result.created,
                  summary: result.summary,
                },
                0,
              );
            }
          }
        })
        .catch(() => undefined);
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
      return null;
    }
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
      scene: row.scene,
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
    await this.states.applyTurnCost(scene.persona.id, plan.engage, { runId });
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
    for (const todo of plan.todos.slice(0, 3)) {
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
    const timeZone = readString(values?.['time_zone']) || null;
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

function toRunSummary(
  row: {
    id: string;
    personaId: string;
    channelId: string;
    conversationId: string | null;
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
    startedAt: Date;
    finishedAt: Date | null;
  },
  conversationName: string | null,
): AgentRunSummary {
  const decision =
    row.decision && typeof row.decision === 'object' && !Array.isArray(row.decision)
      ? (row.decision as Record<string, unknown>)
      : null;
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    conversationId: row.conversationId,
    conversationName,
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
