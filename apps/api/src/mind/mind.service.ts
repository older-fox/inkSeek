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
  ConversationPersonaValues,
  LlmPromptLogRecord,
  MindOverview,
  MindPromptLogQueryInput,
  MindSettingsRecord,
  MindSettingsUpdateInput,
  PersonaGroupStanceRecord,
  PersonaGroupStanceUpdateInput,
  PersonaJournalRecord,
  PersonaMemoryRecord,
  PersonaRelationshipRecord,
  PersonaRelationshipUpdateInput,
  PersonaStateRecord,
  PersonaStateUpdateInput,
  StickerImageCandidate,
  StickerImportInput,
  StickerRecord,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type {
  AgentIntention,
  AgentTodo,
  LlmPromptLog,
  PersonaJournal,
} from '../generated/prisma/client.js';
import { MindActionExecutor } from './mind-action-executor.service.js';
import { MindHeartbeatService } from './mind-heartbeat.service.js';
import { MindRuntimeService } from './mind-runtime.service.js';
import { MindSceneService } from './mind-scene.service.js';
import { MindSettingsService } from './mind-settings.service.js';
import { PersonaGroupStanceService } from './persona-group-stance.service.js';
import {
  PersonaLongEventService,
  toRecord as toLongEventRecord,
} from './persona-long-event.service.js';
import { PersonaMemoryService } from './persona-memory.service.js';
import { PersonaRelationshipService } from './persona-relationship.service.js';
import { PersonaStateService } from './persona-state.service.js';
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
    private readonly stickers: StickerService,
    private readonly scenes: MindSceneService,
  ) {}

  async overview(channelId: string): Promise<MindOverview> {
    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { channelId },
    });
    if (!persona) {
      return {
        persona: null,
        settings: null,
        state: null,
        relationships: [],
        groupStances: [],
        memories: [],
        todos: [],
        intentions: [],
        runs: [],
        journal: [],
        stickers: await this.stickers.list(),
        longEvent: null,
        longEvents: [],
        stateChanges: [],
      };
    }
    const settings = await this.settingsService.get(channelId);
    const [
      state,
      relationships,
      groupStances,
      memories,
      todos,
      intentions,
      runs,
      journal,
      stickers,
      longEvent,
      longEvents,
      stateChanges,
    ] = await Promise.all([
      this.states.get(persona.id),
      this.relationships.list(persona.id),
      this.stances.list(persona.id),
      this.memories.list({ personaId: persona.id, limit: 50, offset: 0 }),
      this.prisma.agentTodo.findMany({
        where: { personaId: persona.id, status: { not: 'CANCELLED' } },
        orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
      this.prisma.agentIntention.findMany({
        where: { personaId: persona.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.agentRun.findMany({
        where: { personaId: persona.id },
        orderBy: { startedAt: 'desc' },
        take: 20,
        include: { conversation: { select: { name: true } } },
      }),
      this.prisma.personaJournal.findMany({
        where: { personaId: persona.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.stickers.list(),
      this.longEvents.active(persona.id),
      this.longEvents.list(persona.id, 10),
      this.prisma.personaStateChange.findMany({
        where: { personaId: persona.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    return {
      persona: {
        id: persona.id,
        channelId: persona.channelId,
        cardId: persona.cardId,
        name: persona.name,
        identity: persona.identity,
        quote: persona.quote,
        accent: persona.accent,
        base: numericValues(persona.values),
      },
      settings,
      state,
      relationships,
      groupStances,
      memories,
      todos: todos.map(toTodoRecord),
      intentions: intentions.map(toIntentionRecord),
      runs: runs.map((run) => toRunSummary(run, run.conversation?.name ?? null)),
      journal: journal.map(toJournalRecord),
      stickers,
      longEvent: longEvent ? toLongEventRecord(longEvent) : null,
      longEvents,
      stateChanges: stateChanges.map((change) => ({
        id: change.id,
        personaId: change.personaId,
        field: change.field,
        beforeValue: change.beforeValue,
        afterValue: change.afterValue,
        delta: change.delta,
        reason: change.reason,
        source: change.source,
        runId: change.runId,
        createdAt: change.createdAt.toISOString(),
      })),
    };
  }

  getSettings(channelId: string): Promise<MindSettingsRecord> {
    return this.settingsService.get(channelId);
  }

  updateSettings(channelId: string, input: MindSettingsUpdateInput): Promise<MindSettingsRecord> {
    return this.settingsService.update(channelId, input);
  }

  getState(personaId: string): Promise<PersonaStateRecord> {
    return this.states.get(personaId);
  }

  updateState(personaId: string, input: PersonaStateUpdateInput): Promise<PersonaStateRecord> {
    return this.states.update(personaId, input, {
      reason: '心智页手动调整',
      source: 'MANUAL',
    });
  }

  async endLongEvent(
    personaId: string,
  ): Promise<{ event: ReturnType<typeof toLongEventRecord>; effects: unknown } | null> {
    const result = await this.longEvents.endActive(personaId, 'MANUAL');
    if (!result) {
      return null;
    }
    return { event: toLongEventRecord(result.event), effects: result.effects };
  }

  listRelationships(personaId: string): Promise<PersonaRelationshipRecord[]> {
    return this.relationships.list(personaId);
  }

  updateRelationship(
    personaId: string,
    input: PersonaRelationshipUpdateInput,
  ): Promise<PersonaRelationshipRecord> {
    return this.relationships.update(personaId, input);
  }

  listGroupStances(personaId: string): Promise<PersonaGroupStanceRecord[]> {
    return this.stances.list(personaId);
  }

  updateGroupStance(
    personaId: string,
    input: PersonaGroupStanceUpdateInput,
  ): Promise<PersonaGroupStanceRecord> {
    return this.stances.update(personaId, input);
  }

  listMemories(input: {
    personaId: string;
    query?: string;
    scope?: PersonaMemoryRecord['scope'];
    kind?: PersonaMemoryRecord['kind'];
    subjectType?: PersonaMemoryRecord['subjectType'];
    subjectId?: string;
    includeDeleted?: boolean;
    limit: number;
    offset: number;
  }): Promise<PersonaMemoryRecord[]> {
    return this.memories.list(input);
  }

  listTodos(personaId: string): Promise<AgentTodoRecord[]> {
    return this.prisma.agentTodo
      .findMany({
        where: { personaId },
        orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      })
      .then((rows) => rows.map(toTodoRecord));
  }

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
        urgency: input.urgency ?? 50,
        earliestAt: input.earliestAt ? new Date(input.earliestAt) : new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
    return toIntentionRecord(row);
  }

  listIntentions(personaId: string): Promise<AgentIntentionRecord[]> {
    return this.prisma.agentIntention
      .findMany({
        where: { personaId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      .then((rows) => rows.map(toIntentionRecord));
  }

  listPromptLogs(input: MindPromptLogQueryInput): Promise<LlmPromptLogRecord[]> {
    return this.prisma.llmPromptLog
      .findMany({
        where: input.source ? { source: input.source } : {},
        orderBy: { createdAt: 'desc' },
        take: Math.max(1, Math.min(200, input.limit)),
      })
      .then((rows) => rows.map(toPromptLogRecord));
  }

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
        include: { conversation: { select: { name: true } } },
      })
      .then((rows) => rows.map((run) => toRunSummary(run, run.conversation?.name ?? null)));
  }

  runDetail(id: string): Promise<AgentRunDetail> {
    return this.runtime.runDetail(id);
  }

  listJournal(personaId: string, limit = 30): Promise<PersonaJournalRecord[]> {
    return this.prisma.personaJournal
      .findMany({
        where: { personaId },
        orderBy: { createdAt: 'desc' },
        take: Math.max(1, Math.min(100, limit)),
      })
      .then((rows) => rows.map(toJournalRecord));
  }

  async deleteJournal(id: string): Promise<void> {
    const existing = await this.prisma.personaJournal.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: 'JOURNAL_NOT_FOUND', message: '日记不存在' });
    }
    await this.prisma.personaJournal.delete({ where: { id } });
  }

  pendingActions(personaId: string): Promise<AgentActionRecord[]> {
    return this.executor.pending(personaId);
  }

  approveAction(id: string): Promise<AgentActionRecord> {
    return this.executor.approve(id);
  }

  /**
   * Pipeline persona cards read the same single-source relationship/stance
   * rows. A missing row returns null instead of creating empty data.
   */
  async conversationPersonaValues(
    kind: 'GROUP' | 'PRIVATE',
    channelId: string,
    externalId: string,
  ): Promise<ConversationPersonaValues | null> {
    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { channelId },
      select: { id: true },
    });
    if (!persona) {
      return null;
    }
    return kind === 'GROUP'
      ? this.stances.valuesForExternalId(persona.id, externalId)
      : this.relationships.valuesForExternalId(persona.id, externalId);
  }

  triggerHeartbeat(personaId: string): Promise<boolean> {
    return this.heartbeat.trigger(personaId);
  }

  async scanStickers(describe: boolean) {
    return this.stickers.scan(describe);
  }

  listStickers() {
    return this.stickers.list();
  }

  recentStickerImages(channelId: string, limit = 48): Promise<StickerImageCandidate[]> {
    return this.stickers.recentImages(channelId, limit);
  }

  importSticker(input: StickerImportInput): Promise<StickerRecord> {
    return this.stickers.importFromReceived(input);
  }

  searchStickers(query: string, limit: number) {
    return this.stickers.search(query, limit);
  }

  async conversationScene(channelId: string, conversationId: string) {
    return this.scenes.buildFromConversation(channelId, conversationId);
  }
}

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

function toIntentionRecord(row: AgentIntention): AgentIntentionRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    seed: row.seed,
    urgency: row.urgency,
    earliestAt: row.earliestAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    status: row.status,
    attempts: row.attempts,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function numericValues(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const metadataKeys = new Set([
    'card_serial',
    'card_experience',
    'card_traits',
    'card_physical',
    'created_at',
    'updated_at',
    'time_zone',
  ]);
  /**
   * These numeric card keys are leftovers from the pre-PersonaState design.
   * Live values are owned by PersonaState, so the overview must not present the
   * stale card copies as "basic values".
   */
  const stateOwnedKeys = new Set([
    'mood_tags',
    'mood_intensity',
    'stress',
    'social_battery',
    'doing_now',
    'location',
    'grooming',
  ]);
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (metadataKeys.has(key) || stateOwnedKeys.has(key)) {
      continue;
    }
    const number = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (Number.isFinite(number)) {
      result[key] = number;
    }
  }
  return result;
}

function toPromptLogRecord(row: LlmPromptLog): LlmPromptLogRecord {
  return {
    id: row.id,
    source: row.source,
    providerId: row.providerId,
    providerName: row.providerName,
    model: row.model,
    system: row.system,
    prompt: row.prompt,
    response: row.response,
    imageCount: row.imageCount,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    latencyMs: row.latencyMs,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

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
