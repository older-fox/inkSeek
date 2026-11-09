import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AgentActionRecord,
  AgentIntentionCreateInput,
  AgentIntentionRecord,
  AgentRunDetail,
  AgentRunSummary,
  AgentTodoCreateInput,
  AgentTodoRecord,
  AgentTodoUpdateInput,
  LlmPromptLogRecord,
  MindHeartbeatLogRecord,
  MindFocusOverview,
  MindHeartbeatQueryInput,
  MindLearningOverview,
  MindPromptLogQueryInput,
  MindSettingsRecord,
  MindSettingsUpdateInput,
  MindTurnResult,
  PersonaChangeRecord,
  PersonaGroupStanceRecord,
  PersonaGroupStanceUpdateInput,
  PersonaJournalRecord,
  PersonaMemoryQueryInput,
  PersonaMemoryRecord,
  PersonaRelationshipRecord,
  PersonaRelationshipUpdateInput,
  PersonaStateRecord,
  PersonaStateUpdateInput,
  PersonaStyleNoteRecord,
  PersonaStyleNoteUpdateInput,
  PhoneDeviceList,
  StickerRecord,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import { PhoneService } from '../phone/phone.service.js';
import type {
  AgentIntention,
  AgentTodo,
  LlmCallLog,
  PersonaJournal,
} from '../generated/prisma/client.js';
import { MindActionExecutor } from './mind-action-executor.service.js';
import { MindFocusService } from './mind-focus.service.js';
import { MindHeartbeatLogService } from './mind-heartbeat-log.service.js';
import { MindHeartbeatService } from './mind-heartbeat.service.js';
import { MindLearningService } from './mind-learning.service.js';
import { MindLoopService } from './mind-loop.service.js';
import { MindPhoneFocusService } from './mind-phone-focus.service.js';
import { MindRuntimeService, toRunSummary } from './mind-runtime.service.js';
import { MindSettingsService } from './mind-settings.service.js';
import { MindSituationService } from './mind-situation.service.js';
import { PersonaGroupStanceService } from './persona-group-stance.service.js';
import {
  PersonaLongEventService,
  toRecord as toLongEventRecord,
} from './persona-long-event.service.js';
import { PersonaMemoryService } from './persona-memory.service.js';
import { PersonaRelationshipService } from './persona-relationship.service.js';
import { PersonaStateService } from './persona-state.service.js';
import { PersonaStyleNoteService } from './persona-style-note.service.js';
import { StickerService } from './sticker.service.js';

@Injectable()
export class MindService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: MindSettingsService,
    private readonly states: PersonaStateService,
    private readonly relationships: PersonaRelationshipService,
    private readonly stances: PersonaGroupStanceService,
    private readonly longEvents: PersonaLongEventService,
    private readonly memories: PersonaMemoryService,
    private readonly runtime: MindRuntimeService,
    private readonly executor: MindActionExecutor,
    private readonly heartbeat: MindHeartbeatService,
    private readonly heartbeatLogs: MindHeartbeatLogService,
    private readonly stickers: StickerService,
    private readonly phones: PhoneService,
    private readonly focus: MindFocusService,
    private readonly phoneFocus: MindPhoneFocusService,
    private readonly loop: MindLoopService,
    private readonly situation: MindSituationService,
    private readonly learning: MindLearningService,
    private readonly styleNotes: PersonaStyleNoteService,
  ) {}

  /** Admin change log, newest first; scope/target filters optional, paging clamped. */
  listChanges(
    personaId: string,
    input: { scope?: string; targetId?: string; limit: number; offset: number },
  ): Promise<PersonaChangeRecord[]> {
    return this.prisma.personaChangeLog
      .findMany({
        where: {
          personaId,
          ...(input.scope ? { scope: input.scope } : {}),
          ...(input.targetId ? { targetId: input.targetId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.max(1, Math.min(200, input.limit)),
        skip: Math.max(0, input.offset),
      })
      .then((rows) =>
        rows.map((change) => ({
          id: change.id,
          personaId: change.personaId,
          scope: change.scope,
          targetId: change.targetId,
          field: change.field,
          beforeValue: change.beforeValue,
          afterValue: change.afterValue,
          delta: change.delta,
          reason: change.reason,
          source: change.source,
          runId: change.runId,
          createdAt: change.createdAt.toISOString(),
        })),
      );
  }

  /** Recent long-running life events for the mind page; read-only projection. */
  listLongEvents(personaId: string, limit = 20) {
    return this.longEvents.list(personaId, limit);
  }

  /** Looks up a relationship by channel contact id rather than internal row id. */
  relationshipByExternalId(personaId: string, externalId: string) {
    return this.relationships.getByExternalId(personaId, externalId);
  }

  /** Per-channel mind settings; the settings service materializes defaults on first read. */
  getSettings(channelId: string): Promise<MindSettingsRecord> {
    return this.settingsService.get(channelId);
  }

  /** Persists a partial settings patch and returns the merged record. */
  updateSettings(channelId: string, input: MindSettingsUpdateInput): Promise<MindSettingsRecord> {
    return this.settingsService.update(channelId, input);
  }

  /** Current persona state; a missing row is created by the state service. */
  getState(personaId: string): Promise<PersonaStateRecord> {
    return this.states.get(personaId);
  }

  /** Manual edit from the mind page, stamped MANUAL so drift logs stay distinguishable. */
  updateState(personaId: string, input: PersonaStateUpdateInput): Promise<PersonaStateRecord> {
    return this.states.update(personaId, input, {
      reason: '心智页手动调整',
      source: 'MANUAL',
    });
  }

  /** Force-closes the active long event; null when nothing is running. */
  async endLongEvent(
    personaId: string,
  ): Promise<{ event: ReturnType<typeof toLongEventRecord>; effects: unknown } | null> {
    const result = await this.longEvents.endActive(personaId, 'MANUAL');
    if (!result) {
      return null;
    }
    return { event: toLongEventRecord(result.event), effects: result.effects };
  }

  /** All relationship rows for the persona, unfiltered; the page does its own grouping. */
  listRelationships(personaId: string): Promise<PersonaRelationshipRecord[]> {
    return this.relationships.list(personaId);
  }

  /** Writes relationship numbers and attributes; range validation lives in the service. */
  updateRelationship(
    personaId: string,
    input: PersonaRelationshipUpdateInput,
  ): Promise<PersonaRelationshipRecord> {
    return this.relationships.update(personaId, input);
  }

  /** Per-group stance rows (tone and disclosure) for the persona. */
  listGroupStances(personaId: string): Promise<PersonaGroupStanceRecord[]> {
    return this.stances.list(personaId);
  }

  /** Updates one group's stance; unknown groups are rejected downstream. */
  updateGroupStance(
    personaId: string,
    input: PersonaGroupStanceUpdateInput,
  ): Promise<PersonaGroupStanceRecord> {
    return this.stances.update(personaId, input);
  }

  /** Paged memory query; the caller supplies the full filter set. */
  listMemories(input: PersonaMemoryQueryInput): Promise<PersonaMemoryRecord[]> {
    return this.memories.list(input);
  }

  /** Total for the same filter, so the list page can paginate without guessing. */
  countMemories(input: PersonaMemoryQueryInput): Promise<number> {
    return this.memories.count(input);
  }

  /** Todo list capped at 100, open items first, then priority and recency. */
  listTodos(personaId: string): Promise<AgentTodoRecord[]> {
    return this.prisma.agentTodo
      .findMany({
        where: { personaId },
        orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      })
      .then((rows) => rows.map(toTodoRecord));
  }

  /** Admin-created todo, stamped ADMIN so agent-made items stay distinguishable. */
  async createTodo(input: AgentTodoCreateInput): Promise<AgentTodoRecord> {
    const persona = await this.states.persona(input.personaId);
    const row = await this.prisma.agentTodo.create({
      data: {
        personaId: persona.id,
        channelId: persona.channelId,
        title: input.title,
        detail: input.detail ?? '',
        kind: input.kind ?? 'follow_up',
        priority: input.priority ?? 50,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        wakeCondition: input.wakeCondition as object | undefined,
        source: 'ADMIN',
        relatedContactId: input.relatedContactId,
        relatedConversationId: input.relatedConversationId,
      },
    });
    return toTodoRecord(row);
  }

  /** Partial todo update; moving to DONE also stamps completedAt. Unknown ids throw 404. */
  async updateTodo(id: string, input: AgentTodoUpdateInput): Promise<AgentTodoRecord> {
    const existing = await this.prisma.agentTodo.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: 'TODO_NOT_FOUND', message: '待办不存在' });
    }
    const row = await this.prisma.agentTodo.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.detail !== undefined ? { detail: input.detail } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
        ...(input.wakeCondition !== undefined
          ? { wakeCondition: input.wakeCondition as object | undefined }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.status === 'DONE' ? { completedAt: new Date() } : {}),
      },
    });
    return toTodoRecord(row);
  }

  /** Admin-created proactive intention; urgency, confidence and risk fall back to sane defaults. */
  async createIntention(input: AgentIntentionCreateInput): Promise<AgentIntentionRecord> {
    const persona = await this.states.persona(input.personaId);
    const row = await this.prisma.agentIntention.create({
      data: {
        personaId: persona.id,
        channelId: persona.channelId,
        targetType: input.targetType ?? 'PERSON',
        targetId: input.targetId ?? '',
        reason: input.reason ?? '',
        seed: input.seed ?? '',
        need: input.need ?? '',
        urgency: input.urgency ?? 50,
        confidence: input.confidence ?? 50,
        risk: input.risk ?? 20,
        feedback: input.feedback ?? '',
        feedbackAt: input.feedbackAt ? new Date(input.feedbackAt) : null,
        earliestAt: input.earliestAt ? new Date(input.earliestAt) : new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
    return toIntentionRecord(row);
  }

  /** Latest 100 intentions regardless of status; filtering happens in the UI. */
  listIntentions(personaId: string): Promise<AgentIntentionRecord[]> {
    return this.prisma.agentIntention
      .findMany({
        where: { personaId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      .then((rows) => rows.map(toIntentionRecord));
  }

  /** Stored prompts with optional source/run filters; rows without a prompt are excluded. */
  listPromptLogs(input: MindPromptLogQueryInput): Promise<LlmPromptLogRecord[]> {
    return this.prisma.llmCallLog
      .findMany({
        where: {
          prompt: { not: null },
          ...(input.source ? { source: input.source } : {}),
          ...(input.runId ? { runId: input.runId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.max(1, Math.min(200, input.limit)),
      })
      .then((rows) => rows.map(toPromptLogRecord));
  }

  /** Run list for polling; plan and social-read blobs are omitted to keep payloads small. */
  listRuns(
    personaId: string,
    conversationId?: string,
    limit = 30,
    offset = 0,
  ): Promise<AgentRunSummary[]> {
    return this.prisma.agentRun
      .findMany({
        where: {
          personaId,
          ...(conversationId ? { conversationId } : {}),
        },
        orderBy: { startedAt: 'desc' },
        take: Math.max(1, Math.min(100, limit)),
        skip: Math.max(0, offset),
        // The head page is polled every few seconds; skip plan/socialRead blobs.
        select: {
          id: true,
          personaId: true,
          channelId: true,
          conversationId: true,
          messageId: true,
          trigger: true,
          mode: true,
          status: true,
          providerId: true,
          model: true,
          promptTokens: true,
          completionTokens: true,
          latencyMs: true,
          decision: true,
          scene: true,
          startedAt: true,
          finishedAt: true,
          conversation: { select: { name: true } },
        },
      })
      .then((rows) => rows.map((run) => toRunSummary(run, run.conversation?.name ?? null)));
  }

  /** Full run trace including plan and tool calls, delegated to the runtime. */
  runDetail(id: string): Promise<AgentRunDetail> {
    return this.runtime.runDetail(id);
  }

  /** Heartbeat log page; ordering and paging are handled by the log service. */
  listHeartbeats(
    personaId: string,
    input: MindHeartbeatQueryInput,
  ): Promise<MindHeartbeatLogRecord[]> {
    return this.heartbeatLogs.list(personaId, input.limit, input.offset);
  }

  /** Recent diary entries, newest first, capped at 100. */
  listJournal(personaId: string, limit = 30): Promise<PersonaJournalRecord[]> {
    return this.prisma.personaJournal
      .findMany({
        where: { personaId },
        orderBy: { createdAt: 'desc' },
        take: Math.max(1, Math.min(100, limit)),
      })
      .then((rows) => rows.map(toJournalRecord));
  }

  /** Removes a diary entry; an unknown id raises 404 instead of failing silently. */
  async deleteJournal(id: string): Promise<void> {
    const existing = await this.prisma.personaJournal.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: 'JOURNAL_NOT_FOUND', message: '日记不存在' });
    }
    await this.prisma.personaJournal.delete({ where: { id } });
  }

  /** Actions waiting for human approval. */
  pendingActions(personaId: string): Promise<AgentActionRecord[]> {
    return this.executor.pending(personaId);
  }

  /** Approves and executes a pending action; side effects happen inside the executor. */
  approveAction(id: string): Promise<AgentActionRecord> {
    return this.executor.approve(id);
  }

  /** Requests one heartbeat turn; false means the gate refused (busy or off-duty). */
  triggerHeartbeat(personaId: string): Promise<boolean> {
    return this.heartbeat.trigger(personaId);
  }

  /** Learning stats; the channel falls back to the persona's own channel when omitted. */
  async learningOverview(
    personaId: string,
    channelId?: string,
    limit = 12,
  ): Promise<MindLearningOverview> {
    const resolved = channelId?.trim() || (await this.states.persona(personaId)).channelId;
    return this.learning.overview(personaId, resolved, limit);
  }

  /** Runs a learning turn outside the normal heartbeat cadence; null if the loop is busy. */
  startLearning(personaId: string): Promise<MindTurnResult | null> {
    return this.loop.submitHeartbeat(personaId, { forceLearning: true });
  }

  /** Applies a partial edit to one style note and returns the stored record. */
  updateStyleNote(id: string, input: PersonaStyleNoteUpdateInput): Promise<PersonaStyleNoteRecord> {
    return this.styleNotes.update(id, input);
  }

  /** Removes a style note by id. */
  deleteStyleNote(id: string): Promise<void> {
    return this.styleNotes.remove(id);
  }

  /** Sticker library for one channel; stickers are channel-scoped, not persona-scoped. */
  listStickers(channelId: string): Promise<StickerRecord[]> {
    return this.stickers.list(channelId);
  }

  /** Deletes a sticker, checked against its channel so ids cannot cross channels. */
  deleteSticker(channelId: string, id: string): Promise<void> {
    return this.stickers.remove(id, channelId);
  }

  /** Phone devices currently bridged for this deployment. */
  phoneDevices(): Promise<PhoneDeviceList> {
    return this.phones.devices();
  }

  /** Merges the focus view with live state and situation so the page needs one request. */
  async focusOverview(personaId: string): Promise<MindFocusOverview> {
    const [overview, state, situation] = await Promise.all([
      this.focus.overview(personaId),
      this.prisma.personaState.findUnique({ where: { personaId } }),
      this.situation.describe(personaId),
    ]);
    return {
      ...overview,
      now: {
        activity: state?.currentActivity ?? '',
        activitySince: state?.activitySince?.toISOString() ?? null,
        location: state?.location ?? '',
        situation,
      },
    };
  }

  /** Starts a manual phone focus and kicks the loop so the agent picks it up promptly. */
  async startPhoneFocus(personaId: string, goal?: string) {
    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { id: personaId },
      select: { channelId: true },
    });
    if (!persona) {
      throw new NotFoundException({ code: 'PERSONA_NOT_FOUND', message: '人格实例不存在' });
    }
    const focus = await this.phoneFocus.startManual(personaId, persona.channelId, goal);
    this.loop.kick(personaId);
    return focus;
  }
}

/** Maps a Prisma todo row to the shared contract, serializing dates to ISO strings. */
function toTodoRecord(row: AgentTodo): AgentTodoRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    title: row.title,
    detail: row.detail,
    kind: row.kind,
    priority: row.priority,
    dueAt: row.dueAt?.toISOString() ?? null,
    wakeCondition: row.wakeCondition,
    recurrence: row.recurrence,
    status: row.status,
    source: row.source,
    relatedContactId: row.relatedContactId,
    relatedConversationId: row.relatedConversationId,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Maps an intention row to the shared contract, keeping nullable timestamps nullable. */
function toIntentionRecord(row: AgentIntention): AgentIntentionRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    seed: row.seed,
    need: row.need,
    urgency: row.urgency,
    confidence: row.confidence,
    risk: row.risk,
    feedback: row.feedback,
    feedbackAt: row.feedbackAt?.toISOString() ?? null,
    earliestAt: row.earliestAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    status: row.status,
    attempts: row.attempts,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Maps a call-log row to the prompt-log contract; missing prompt/response become empty. */
function toPromptLogRecord(row: LlmCallLog): LlmPromptLogRecord {
  return {
    id: row.id,
    runId: row.runId,
    source: row.source,
    providerId: row.providerId,
    providerName: row.providerName,
    model: row.model,
    system: row.system,
    prompt: row.prompt ?? '',
    response: row.response ?? '',
    imageCount: row.imageCount,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    latencyMs: row.latencyMs,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Maps a diary row to the shared contract, serializing its creation timestamp. */
function toJournalRecord(row: PersonaJournal): PersonaJournalRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    date: row.date,
    content: row.content,
    mood: row.mood,
    consolidatedMemoryIds: row.consolidatedMemoryIds,
    createdAt: row.createdAt.toISOString(),
  };
}
