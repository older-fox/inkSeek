import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  MemoryDraft,
  PersonaMemoryCreateInput,
  PersonaMemoryKind,
  PersonaMemoryQueryInput,
  PersonaMemoryRecord,
  PersonaMemoryScope,
  PersonaMemorySubjectType,
  PersonaMemoryUpdateInput,
  PersonaMemoryVisibility,
} from '@inkseek/shared';
import { LlmService } from '../ai/llm.service.js';
import { truncateText } from '../common/text.js';
import { PrismaService } from '../database/prisma.service.js';
import type { PersonaMemory, Prisma } from '../generated/prisma/client.js';
import { embedText, cosineSimilarity, keywordOverlap } from './mind-vector.js';
import {
  clamp,
  formatSceneForPrompt,
  normalizeTimeZone,
  parseJsonArray,
  readNumber,
  readString,
  type MindMemoryStats,
  type MindScene,
  type MemoryPromptItem,
} from './mind.types.js';

/**
 * Retrieval is two-pool: the most recent memories plus any older memory that
 * matters. Without the importance pool, a memory bank larger than the recent
 * limit would silently make old knowledge unreachable.
 */
const VECTOR_RECENT_LIMIT = 600;
const VECTOR_IMPORTANT_LIMIT = 300;
const VECTOR_IMPORTANCE_FLOOR = 60;
/** Old, low-importance rows rotate through this pool so they stay reachable. */
const VECTOR_ARCHIVE_LIMIT = 400;
/** Explicit searches (tool/UI) scan the whole library, bounded for safety. */
const FULL_SEARCH_LIMIT = 10_000;
const CORE_MEMORY_LIMIT = 3;
const CORE_IMPORTANCE_FLOOR = 60;
/** Memories older than this are offered to the model for a keep/forget call. */
const STALE_REVIEW_AGE_MS = 180 * 86_400_000;
const STALE_REVIEW_LIMIT = 3;
/** Channel-wide memories must share at least a little text with this turn. */
const MIN_GLOBAL_RELEVANCE = 0.03;
const CORE_KINDS: readonly PersonaMemoryKind[] = [
  'FACT',
  'PREFERENCE',
  'PROMISE',
  'BOUNDARY',
  'REFLECTION',
];
const DEDUPE_THRESHOLD = 0.94;
/**
 * The same exchange is often written twice within minutes with slightly
 * different wording ("碰到胸" vs "连续两次碰到胸"). For a short window, use a
 * lower bar; outside it, keep the stricter long-term threshold.
 */
const DEDUPE_RECENT_THRESHOLD = 0.82;
const DEDUPE_RECENT_MS = 24 * 60 * 60 * 1000;
/**
 * The same event often gets written once as FACT and once as PROMISE.
 * Only merge across kinds for long-term relation facts, and only when the
 * text is nearly identical; episodes and procedures keep their own rows.
 */
const CROSS_KIND_DEDUPE_THRESHOLD = 0.92;
const CROSS_KIND_DEDUPE_KINDS = new Set<PersonaMemoryKind>([
  'FACT',
  'PROMISE',
  'PREFERENCE',
  'BOUNDARY',
]);
/**
 * Scenes are not a chat log. Ordinary conversation is only recorded after a
 * cooldown; notable moments are coalesced. Long-term facts, preferences,
 * promises and boundaries come from the planner's explicit memoryWrites.
 */
const EPISODE_MIN_GAP_MS = 3 * 60 * 60_000;
const EPISODE_SIGNIFICANT_GAP_MS = 20 * 60_000;
const EPISODE_SALIENCE_THRESHOLD = 75;

@Injectable()
export class PersonaMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /** Dedupes against a near-identical row first, so rewrites reinforce one memory instead of piling up. */
  async create(input: PersonaMemoryCreateInput): Promise<PersonaMemoryRecord> {
    const persona = await this.persona(input.personaId);
    const content = input.content.trim();
    if (!content) {
      throw new NotFoundException({ code: 'MEMORY_EMPTY', message: '记忆内容不能为空' });
    }
    const embedding = embedText(
      [input.title, content, input.subjectName].filter(Boolean).join('\n'),
    );
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    const existing = await this.findDuplicate(
      persona.id,
      input.kind,
      input.subjectType,
      input.subjectId ?? '',
      embedding,
    );
    if (existing) {
      const sourceIds = Array.from(new Set([...existing.sourceIds, ...(input.sourceIds ?? [])]));
      const incomingImportance = clamp(input.importance ?? 50, 0, 100);
      const preferNew =
        incomingImportance > existing.importance + 5 ||
        (incomingImportance >= existing.importance &&
          occurredAt.getTime() > existing.occurredAt.getTime());
      const nextContent = preferNew ? content : existing.content;
      const nextTitle = preferNew ? (input.title ?? existing.title) : existing.title;
      const nextSubjectName = input.subjectName ?? existing.subjectName;
      const nextEmbedding = embedText(
        [nextTitle, nextContent, nextSubjectName].filter(Boolean).join('\n'),
      );
      const updated = await this.prisma.personaMemory.update({
        where: { id: existing.id },
        data: {
          content: nextContent,
          title: nextTitle,
          subjectName: nextSubjectName,
          conversationId: existing.conversationId ?? input.conversationId ?? null,
          importance: Math.max(existing.importance, incomingImportance),
          confidence: Math.max(existing.confidence, clamp(input.confidence ?? 70, 0, 100)),
          sourceIds,
          embedding: nextEmbedding,
          occurredAt: preferNew ? occurredAt : existing.occurredAt,
        },
      });
      return toRecord(updated);
    }

    const row = await this.prisma.personaMemory.create({
      data: {
        persona: { connect: { id: persona.id } },
        channel: { connect: { id: persona.channelId } },
        conversationId: input.conversationId ?? null,
        scope: input.scope,
        kind: input.kind,
        subjectType: input.subjectType,
        subjectId: input.subjectId ?? '',
        subjectName: input.subjectName ?? '',
        title: input.title ?? '',
        content,
        structured: jsonOrNull(input.structured),
        importance: clamp(input.importance ?? 50, 0, 100),
        confidence: clamp(input.confidence ?? 70, 0, 100),
        emotionalValence: clamp(input.emotionalValence ?? 0, -100, 100),
        emotionalArousal: clamp(input.emotionalArousal ?? 0, 0, 100),
        visibility: input.visibility,
        occurredAt,
        sourceType: input.sourceType,
        sourceIds: input.sourceIds ?? [],
        embedding,
      },
    });
    return toRecord(row);
  }

  /** Partial edit; any text change re-embeds the row so search stays consistent. */
  async update(id: string, input: PersonaMemoryUpdateInput): Promise<PersonaMemoryRecord> {
    const existing = await this.prisma.personaMemory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: 'MEMORY_NOT_FOUND', message: '记忆不存在' });
    }
    const content = input.content?.trim();
    const data: Prisma.PersonaMemoryUpdateInput = {};
    if (content) data.content = content;
    if (input.title !== undefined) data.title = input.title;
    if (input.subjectName !== undefined) data.subjectName = input.subjectName;
    if (input.subjectId !== undefined) data.subjectId = input.subjectId;
    if (input.scope !== undefined) data.scope = input.scope;
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.subjectType !== undefined) data.subjectType = input.subjectType;
    if (input.conversationId !== undefined) data.conversationId = input.conversationId;
    if (input.structured !== undefined) data.structured = jsonOrNull(input.structured);
    if (input.importance !== undefined) data.importance = clamp(input.importance, 0, 100);
    if (input.confidence !== undefined) data.confidence = clamp(input.confidence, 0, 100);
    if (input.emotionalValence !== undefined) {
      data.emotionalValence = clamp(input.emotionalValence, -100, 100);
    }
    if (input.emotionalArousal !== undefined) {
      data.emotionalArousal = clamp(input.emotionalArousal, 0, 100);
    }
    if (input.visibility !== undefined) data.visibility = input.visibility;
    if (input.status !== undefined) data.status = input.status;
    if (input.occurredAt !== undefined) data.occurredAt = new Date(input.occurredAt);
    if (input.validFrom !== undefined) {
      data.validFrom = input.validFrom ? new Date(input.validFrom) : null;
    }
    if (input.validTo !== undefined) {
      data.validTo = input.validTo ? new Date(input.validTo) : null;
    }
    if (content || input.title !== undefined || input.subjectName !== undefined) {
      data.embedding = embedText(
        [
          input.title ?? existing.title,
          content ?? existing.content,
          input.subjectName ?? existing.subjectName,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
    const updated = await this.prisma.personaMemory.update({ where: { id }, data });
    return toRecord(updated);
  }

  /** Soft delete: the row survives for audit but its embedding is cleared so it stops matching. */
  async delete(id: string): Promise<void> {
    const existing = await this.prisma.personaMemory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: 'MEMORY_NOT_FOUND', message: '记忆不存在' });
    }
    await this.prisma.personaMemory.update({
      where: { id },
      data: { status: 'DELETED', embedding: [] },
    });
  }

  /** The model can forget its own memories; ownership is checked before delete. */
  async forget(
    personaId: string,
    ids: string[],
  ): Promise<{ forgotten: string[]; skipped: string[] }> {
    const wanted = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (wanted.length === 0) {
      return { forgotten: [], skipped: [] };
    }
    const rows = await this.prisma.personaMemory.findMany({
      where: { id: { in: wanted }, personaId, status: 'ACTIVE' },
      select: { id: true },
    });
    const owned = rows.map((row) => row.id);
    if (owned.length > 0) {
      await this.prisma.personaMemory.updateMany({
        where: { id: { in: owned } },
        data: { status: 'DELETED', embedding: [] },
      });
    }
    const kept = new Set(owned);
    return { forgotten: owned, skipped: wanted.filter((id) => !kept.has(id)) };
  }

  /** Paged listing; a query switches to full-library ranking instead of the automatic pools. */
  async list(input: PersonaMemoryQueryInput): Promise<PersonaMemoryRecord[]> {
    await this.persona(input.personaId);
    const where = this.listWhere(input);

    if (!input.query?.trim()) {
      const rows = await this.prisma.personaMemory.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { updatedAt: 'desc' }],
        take: input.limit,
        skip: input.offset,
      });
      return rows.map(toRecord);
    }

    // Library search is explicit, so it scans everything instead of only the
    // automatic pools; otherwise old memories would never be findable.
    const candidates = await this.loadCandidates(where, { full: true });
    const queryEmbedding = embedText(input.query);
    const scored = candidates
      .map((row) => ({
        row,
        score: scoreMemory(row, queryEmbedding, input.query ?? ''),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(input.offset, input.offset + input.limit);
    await this.markRecalled(scored.map((entry) => entry.row.id));
    return scored.map((entry) => ({ ...toRecord(entry.row), score: round(entry.score) }));
  }

  /** Total matching rows for the same filters the listing uses. */
  async count(input: PersonaMemoryQueryInput): Promise<number> {
    await this.persona(input.personaId);
    return this.prisma.personaMemory.count({ where: this.listWhere(input) });
  }

  /** Shared filter builder so listing and counting cannot drift apart. */
  private listWhere(input: PersonaMemoryQueryInput): Prisma.PersonaMemoryWhereInput {
    return {
      personaId: input.personaId,
      ...(input.includeDeleted ? {} : { status: 'ACTIVE' as const }),
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.sourceType ? { sourceType: input.sourceType } : {}),
      ...(input.subjectType ? { subjectType: input.subjectType } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    };
  }

  /**
   * Two-layer recall for a turn: a few stable "who I am / what I promised"
   * memories that must stay in view, plus the memories that actually match
   * this moment. Keeping them separate stops a busy recent episode from
   * pushing long-term knowledge out of the prompt budget.
   */
  async recallForScene(
    scene: MindScene,
    query: string,
    limit = 10,
    options: { markRecalled?: boolean; full?: boolean; review?: boolean } = {},
  ): Promise<{
    core: PersonaMemoryRecord[];
    relevant: PersonaMemoryRecord[];
    stale: PersonaMemoryRecord[];
    stats: MindMemoryStats;
  }> {
    const where = this.sceneWhere(scene);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [coreCandidates, candidates, total, recent7d, latest] = await Promise.all([
      this.prisma.personaMemory.findMany({
        where: {
          ...where,
          kind: { in: [...CORE_KINDS] },
          importance: { gte: CORE_IMPORTANCE_FLOOR },
        },
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: CORE_MEMORY_LIMIT * 6,
      }),
      this.loadCandidates(where, { full: options.full }),
      this.prisma.personaMemory.count({ where }),
      this.prisma.personaMemory.count({
        where: { ...where, occurredAt: { gte: weekAgo } },
      }),
      this.prisma.personaMemory.findFirst({
        where,
        orderBy: [{ occurredAt: 'desc' }],
        select: { occurredAt: true },
      }),
    ]);
    const queryEmbedding = embedText(query);
    // Stable background still has to touch this turn; otherwise it is not
    // "background", it is another conversation's memory.
    const coreRows = pickDiverseCore(
      coreCandidates.filter((row) => this.isSceneRelevant(row, scene, queryEmbedding, query)),
      CORE_MEMORY_LIMIT,
    );
    const coreIds = new Set(coreRows.map((row) => row.id));
    const relevant = candidates
      .filter((row) => !coreIds.has(row.id))
      .filter((row) => this.isSceneRelevant(row, scene, queryEmbedding, query))
      .map((row) => ({
        row,
        score: scoreMemory(row, queryEmbedding, query) + contextBias(row, scene),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
    if (options.markRecalled !== false) {
      // Core memories are always candidates, so counting them as "recalled"
      // would inflate the same few rows hundreds of times.
      await this.markRecalled(relevant.map((entry) => entry.row.id));
    }
    const stale = options.review ? await this.loadStaleReview(where) : [];
    return {
      core: coreRows.map(toRecord),
      relevant: relevant.map((entry) => ({
        ...toRecord(entry.row),
        score: round(entry.score),
      })),
      stale,
      stats: {
        total,
        recent7d,
        lastAt: latest?.occurredAt.toISOString() ?? null,
      },
    };
  }

  /**
   * Conversation-local memories are context by definition. Channel-wide
   * background (self-reflection, world/topic knowledge) must share some text
   * with this turn; private-chat partner facts stay available in private chats.
   */
  private isSceneRelevant(
    row: PersonaMemory,
    scene: MindScene,
    queryEmbedding: number[],
    query: string,
  ): boolean {
    if (row.conversationId === scene.conversation.id) {
      return true;
    }
    if (scene.conversation.kind === 'PRIVATE' && row.subjectType === 'PERSON') {
      return true;
    }
    const semantic = cosineSimilarity(queryEmbedding, row.embedding);
    const keyword = keywordOverlap(query, `${row.title}\n${row.content}\n${row.subjectName}`);
    return semantic + keyword >= MIN_GLOBAL_RELEVANCE;
  }

  /** Three pools (recent, important, rotating archive) so old low-importance rows stay reachable. */
  private async loadCandidates(
    where: Prisma.PersonaMemoryWhereInput,
    options: { full?: boolean } = {},
  ): Promise<PersonaMemory[]> {
    if (options.full) {
      // An explicit search must not be blocked by the automatic pools. The cap
      // only exists so a runaway library cannot exhaust memory in one call.
      return this.prisma.personaMemory.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }],
        take: FULL_SEARCH_LIMIT,
      });
    }
    const [recent, important] = await Promise.all([
      this.prisma.personaMemory.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }],
        take: VECTOR_RECENT_LIMIT,
      }),
      this.prisma.personaMemory.findMany({
        where: { ...where, importance: { gte: VECTOR_IMPORTANCE_FLOOR } },
        orderBy: [{ importance: 'desc' }, { occurredAt: 'desc' }],
        take: VECTOR_IMPORTANT_LIMIT,
      }),
    ]);
    const byId = new Map<string, PersonaMemory>();
    for (const row of [...recent, ...important]) {
      byId.set(row.id, row);
    }
    // Anything older than the recent window and below the importance floor
    // would otherwise be unreachable forever. Least-recently-recalled first so
    // the archive rotates instead of pinning the same rows.
    const oldestRecent = recent.at(-1)?.occurredAt ?? null;
    const archive = await this.prisma.personaMemory.findMany({
      where: {
        ...where,
        importance: { lt: VECTOR_IMPORTANCE_FLOOR },
        ...(oldestRecent ? { occurredAt: { lt: oldestRecent } } : {}),
      },
      orderBy: [{ lastRecalledAt: { sort: 'asc', nulls: 'first' } }, { importance: 'desc' }],
      take: VECTOR_ARCHIVE_LIMIT,
    });
    for (const row of archive) {
      byId.set(row.id, row);
    }
    return [...byId.values()];
  }

  /** Very old rows offered to the model: keep them or forget them, its call. */
  private async loadStaleReview(
    where: Prisma.PersonaMemoryWhereInput,
  ): Promise<PersonaMemoryRecord[]> {
    const cutoff = new Date(Date.now() - STALE_REVIEW_AGE_MS);
    const rows = await this.prisma.personaMemory.findMany({
      where: { ...where, occurredAt: { lt: cutoff } },
      orderBy: [{ staleReviewedAt: { sort: 'asc', nulls: 'first' } }, { occurredAt: 'asc' }],
      take: STALE_REVIEW_LIMIT,
    });
    if (rows.length === 0) {
      return [];
    }
    // Mark as reviewed so the next turn rotates to another batch. This is not
    // a recall: lastRecalledAt drives decay and the archive pool, so it stays
    // untouched.
    await this.prisma.personaMemory.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { staleReviewedAt: new Date() },
    });
    return rows.map(toRecord);
  }

  /**
   * Visibility, channel and temporal-validity rules for scene recall. Memories
   * whose validTo has passed stay in the library but no longer shape replies.
   */
  private sceneWhere(scene: MindScene): Prisma.PersonaMemoryWhereInput {
    const now = new Date();
    const conversationId = scene.conversation.id;
    const partnerId =
      scene.conversation.kind === 'PRIVATE'
        ? (scene.cast.find((member) => !member.isSelf)?.contactId ?? null)
        : null;
    const scopes: Prisma.PersonaMemoryWhereInput[] = [
      { conversationId },
      // Self/world/topic knowledge is not tied to one chat.
      { conversationId: null, subjectType: { in: ['SELF', 'WORLD', 'TOPIC'] } },
    ];
    if (scene.conversation.kind === 'GROUP') {
      scopes.push({ conversationId: null, scope: 'GROUP', subjectId: conversationId });
    } else if (partnerId) {
      // Facts about this partner follow the private chat; other people's stay out.
      scopes.push({ conversationId: null, scope: 'RELATION', subjectId: partnerId });
    }
    return {
      personaId: scene.persona.id,
      channelId: scene.persona.channelId,
      status: 'ACTIVE',
      AND: [
        {
          OR: [
            { visibility: { not: 'SCENE' } },
            { visibility: 'SCENE', conversationId },
            { visibility: 'SCENE', conversationId: null },
          ],
        },
        { OR: scopes },
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validTo: null }, { validTo: { gt: now } }] },
      ],
    };
  }

  /** Writes planner drafts, normalising visibility and superseding the row named by `supersedesId`. */
  async applyDrafts(
    scene: MindScene,
    drafts: readonly MemoryDraft[],
  ): Promise<PersonaMemoryRecord[]> {
    const created: PersonaMemoryRecord[] = [];
    for (const draft of drafts) {
      if (!draft.content.trim()) {
        continue;
      }
      const visibility = draft.visibility ?? 'SCENE';
      const structured = parseStructured(draft.structured);
      const sourceUrl = readString(structured?.['sourceUrl']).trim();
      const supersedesId = readString(structured?.['supersedesId']).trim();
      const record = await this.create({
        personaId: scene.persona.id,
        conversationId:
          draft.scope === 'SCENE' || draft.scope === 'GROUP' ? scene.conversation.id : null,
        scope: draft.scope,
        kind: draft.kind,
        subjectType: draft.subjectType,
        subjectId: draft.subjectId,
        subjectName: draft.subjectName,
        title: draft.title,
        content: draft.content,
        structured: draft.structured,
        importance: draft.importance,
        confidence: draft.confidence,
        visibility:
          scene.conversation.kind === 'PRIVATE' && visibility === 'SCENE' ? 'PRIVATE' : visibility,
        occurredAt: draft.occurredAt,
        sourceType: sourceUrl ? 'WEB' : 'MESSAGE',
        sourceIds: draft.sourceIds ?? [scene.anchor.messageId],
      });
      if (supersedesId && supersedesId !== record.id) {
        await this.prisma.personaMemory.updateMany({
          where: { id: supersedesId, personaId: scene.persona.id },
          data: {
            status: 'SUPERSEDED',
            supersededById: record.id,
            validTo: new Date(),
          },
        });
      }
      created.push(record);
    }
    return created;
  }

  /** Saves a scene summary only for notable turns; ordinary chat is coalesced behind a cooldown. */
  async recordEpisode(input: {
    scene: MindScene;
    planReason: string;
    engage: boolean;
    stance: string;
    salience: number;
    significant?: boolean;
  }): Promise<PersonaMemoryRecord | null> {
    if (!input.significant && input.salience < EPISODE_SALIENCE_THRESHOLD) {
      return null;
    }
    const last = await this.prisma.personaMemory.findFirst({
      where: {
        personaId: input.scene.persona.id,
        conversationId: input.scene.conversation.id,
        kind: 'EPISODE',
        status: 'ACTIVE',
      },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    });
    const gap = input.significant ? EPISODE_SIGNIFICANT_GAP_MS : EPISODE_MIN_GAP_MS;
    if (last && Date.now() - last.occurredAt.getTime() < gap) {
      return null;
    }
    const timeZone = normalizeTimeZone(
      readString((input.scene.persona.values as Record<string, unknown> | null)?.['time_zone']),
    );
    // Only the other side's lines. Storing the persona's own replies turns the
    // episode into a script she later replays almost verbatim.
    const transcript = formatSceneForPrompt(
      input.scene.messages
        .filter((message) => !message.isSelf)
        .slice(-8)
        .map((message) => ({
          ...message,
          text: truncate(message.text, 160),
          images: message.images.slice(0, 1),
        })),
      timeZone,
    );
    const reply = input.engage
      ? `我最终决定回应，姿态是「${input.stance}」。`
      : '我最终决定保持沉默。';
    const content = [
      `场景：${input.scene.conversation.name || input.scene.conversation.externalId}`,
      transcript,
      `我的判断：${input.planReason || '没有特别理由'}。${reply}`,
    ]
      .filter(Boolean)
      .join('\n');
    const isGroup = input.scene.conversation.kind === 'GROUP';
    const counterpart = input.scene.cast.find((member) => !member.isSelf) ?? null;
    return this.create({
      personaId: input.scene.persona.id,
      conversationId: input.scene.conversation.id,
      scope: 'SCENE',
      kind: 'EPISODE',
      subjectType: isGroup ? 'GROUP' : counterpart ? 'PERSON' : 'SELF',
      subjectId: isGroup
        ? input.scene.conversation.id
        : (counterpart?.contactId ?? input.scene.persona.id),
      subjectName: isGroup
        ? input.scene.conversation.name
        : (counterpart?.nickname ?? input.scene.persona.name),
      title: input.engage ? '一次回应' : '一次沉默',
      content,
      importance: clamp(input.salience, 0, 100),
      confidence: 80,
      visibility: 'SCENE',
      occurredAt: new Date().toISOString(),
      sourceType: 'MESSAGE',
      sourceIds: input.scene.messages.slice(-8).map((message) => message.id),
    });
  }

  /** Episodes old enough to be consolidated into long-term knowledge. */
  async countUnconsolidated(personaId: string): Promise<number> {
    return this.prisma.personaMemory.count({
      where: {
        personaId,
        kind: 'EPISODE',
        status: 'ACTIVE',
        consolidatedAt: null,
        occurredAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
      },
    });
  }

  /**
   * Light forgetting: knowledge and reflections that have not been recalled
   * for a month lose a little importance/confidence. Boundaries, promises and
   * high-importance memories are never touched here.
   */
  async decay(personaId: string): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    const rows = await this.prisma.personaMemory.findMany({
      where: {
        personaId,
        status: 'ACTIVE',
        kind: { in: ['FACT', 'PREFERENCE', 'REFLECTION'] },
        importance: { gt: 22 },
        confidence: { gt: 31 },
        occurredAt: { lt: cutoff },
        OR: [{ lastRecalledAt: null }, { lastRecalledAt: { lt: cutoff } }],
      },
      select: { id: true },
      take: 500,
    });
    if (rows.length === 0) {
      return 0;
    }
    await this.prisma.personaMemory.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { importance: { decrement: 2 }, confidence: { decrement: 1 } },
    });
    return rows.length;
  }

  /**
   * Asks the model to distill recent episodes into durable memories. Episodes
   * are only marked consolidated when the call and the parse both succeed.
   */
  async consolidate(personaId: string): Promise<{
    created: number;
    summary: string;
    episodeIds: string[];
  }> {
    const episodes = await this.prisma.personaMemory.findMany({
      where: {
        personaId,
        kind: 'EPISODE',
        status: 'ACTIVE',
        consolidatedAt: null,
        occurredAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
      },
      orderBy: { occurredAt: 'desc' },
      take: 20,
    });
    if (episodes.length < 2) {
      return { created: 0, summary: '', episodeIds: [] };
    }

    const persona = await this.persona(personaId);
    const contacts = await this.prisma.chatContact.findMany({
      where: { channelId: persona.channelId },
      select: { id: true, nickname: true },
    });
    const contactByName = new Map(contacts.map((contact) => [contact.nickname.trim(), contact.id]));
    const existing = await this.prisma.personaMemory.findMany({
      where: {
        personaId,
        status: 'ACTIVE',
        kind: { in: [...CORE_KINDS] },
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: 12,
    });
    const prompt = [
      `你在整理人格「${persona.name}」最近的情景记忆，并把它们沉淀进长期知识库。写多少条由你判断，只保留真正值得长期保留的内容。`,
      '只保留会影响未来行为的事实、偏好、承诺、边界、关系变化或反思。不要编造。',
      '记忆要具体：保留人名、时间、偏好细节和因果，不要写成“聊了天”“关系变好了”这种空话。',
      '边界和情景只写以后怎么做、当时发生了什么：BOUNDARY 不要抄当时的原话或固定台词，EPISODE 不要抄自己的回复原文；要留的是处理原则，不是复读稿。',
      '已有长期记忆不要重复。如果新经历补充或修正了旧事实，输出合并后的完整内容，而不是另起一条。',
      '输出 JSON 数组，每项字段：kind(FACT/PREFERENCE/PROMISE/BOUNDARY/REFLECTION)、scope(SELF/RELATION/GROUP/SCENE/WORLD/PROCEDURE)、subjectType(PERSON/GROUP/SELF/WORLD/TOPIC)、subjectName、content、importance(0-100)、confidence(0-100)、visibility(PRIVATE/SCENE/CHANNEL/PUBLIC)。',
      '直接输出 JSON，不要解释。',
      // Prompt-facing list: cut by code points so a name is never split into a
      // dangling surrogate (which strict providers reject as invalid JSON).
      existing.length > 0
        ? `已有长期记忆：\n${existing
            .map((memory) => `- [${memory.kind}] ${truncateText(memory.content, 160)}`)
            .join('\n')}`
        : '',
      '---',
      episodes
        .map((episode) => `[${episode.occurredAt.toISOString()}] ${episode.content}`)
        .join('\n\n'),
    ]
      .filter(Boolean)
      .join('\n');

    let summary = '';
    let created = 0;
    try {
      const completion = await this.llm.complete({
        prompt,
        system: '你是长期记忆整理器，只输出 JSON 数组。',
        temperature: 0.2,
        maxTokens: 2400,
        source: 'mind.consolidate',
      });
      const parsed = parseJsonArray(completion.text);
      for (const item of parsed ?? []) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          continue;
        }
        const record = item as Record<string, unknown>;
        const content = readString(record['content']).trim();
        if (!content) {
          continue;
        }
        const subjectType = enumValue<PersonaMemorySubjectType>(
          record['subjectType'],
          ['PERSON', 'GROUP', 'SELF', 'WORLD', 'TOPIC'],
          'SELF',
        );
        const subjectName = readString(record['subjectName']);
        await this.create({
          personaId,
          conversationId:
            episodes.find((episode) => episode.conversationId)?.conversationId ?? null,
          scope: enumValue<PersonaMemoryScope>(
            record['scope'],
            ['SELF', 'RELATION', 'GROUP', 'SCENE', 'WORLD', 'PROCEDURE'],
            'WORLD',
          ),
          kind: enumValue<PersonaMemoryKind>(
            record['kind'],
            ['EPISODE', 'FACT', 'PREFERENCE', 'PROMISE', 'BOUNDARY', 'REFLECTION', 'PROCEDURE'],
            'FACT',
          ),
          subjectType,
          subjectId:
            subjectType === 'PERSON'
              ? (contactByName.get(subjectName.trim()) ?? '')
              : subjectType === 'SELF'
                ? personaId
                : subjectType === 'GROUP'
                  ? (episodes.find((episode) => episode.subjectType === 'GROUP')?.subjectId ?? '')
                  : '',
          subjectName,
          content,
          importance: clamp(readNumber(record['importance'], 55), 0, 100),
          confidence: clamp(readNumber(record['confidence'], 65), 0, 100),
          visibility: enumValue<PersonaMemoryVisibility>(
            record['visibility'],
            ['PRIVATE', 'SCENE', 'CHANNEL', 'PUBLIC'],
            'CHANNEL',
          ),
          sourceType: 'HEARTBEAT',
          sourceIds: episodes.map((episode) => episode.id),
        });
        created += 1;
        summary += `${content}\n`;
      }
    } catch {
      return { created: 0, summary: '', episodeIds: [] };
    }

    const episodeIds = episodes.map((episode) => episode.id);
    await this.prisma.personaMemory.updateMany({
      where: { id: { in: episodeIds } },
      data: { consolidatedAt: new Date() },
    });
    return { created, summary: summary.trim(), episodeIds };
  }

  /** Prompt-safe view; private visibility becomes a secret flag rather than a separate list. */
  async toPromptItems(memories: readonly PersonaMemoryRecord[]): Promise<MemoryPromptItem[]> {
    return memories.map((memory) => ({
      id: memory.id,
      content: memory.content,
      kind: memory.kind,
      occurredAt: memory.occurredAt,
      importance: memory.importance,
      visibility: memory.visibility,
      secret: memory.visibility === 'PRIVATE',
    }));
  }

  /** Recall bookkeeping that feeds decay, scoring and the archive rotation. */
  async markRecalled(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.personaMemory.updateMany({
      where: { id: { in: [...ids] } },
      data: { lastRecalledAt: new Date(), recallCount: { increment: 1 } },
    });
  }

  /** Loads the persona or fails with a 404 so memory rows always resolve a channel. */
  async persona(personaId: string) {
    const persona = await this.prisma.chatChannelPersona.findUnique({ where: { id: personaId } });
    if (!persona) {
      throw new NotFoundException({ code: 'PERSONA_NOT_FOUND', message: '人格实例不存在' });
    }
    return persona;
  }

  /** Closest existing row above a context-dependent bar; recent and cross-kind matches use looser ones. */
  private async findDuplicate(
    personaId: string,
    kind: PersonaMemoryKind,
    subjectType: PersonaMemorySubjectType,
    subjectId: string,
    embedding: number[],
  ): Promise<PersonaMemory | null> {
    const candidates = await this.prisma.personaMemory.findMany({
      where: {
        personaId,
        subjectType,
        subjectId,
        status: 'ACTIVE',
      },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    });
    const now = Date.now();
    let best: PersonaMemory | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const sameKind = candidate.kind === kind;
      const recent =
        Math.abs(now - candidate.occurredAt.getTime()) <= DEDUPE_RECENT_MS;
      const threshold = sameKind
        ? recent
          ? DEDUPE_RECENT_THRESHOLD
          : DEDUPE_THRESHOLD
        : CROSS_KIND_DEDUPE_KINDS.has(kind) && CROSS_KIND_DEDUPE_KINDS.has(candidate.kind)
          ? CROSS_KIND_DEDUPE_THRESHOLD
          : Number.POSITIVE_INFINITY;
      const score = cosineSimilarity(embedding, candidate.embedding);
      if (score >= threshold && score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }
}

/** Blended relevance: semantic, keyword, importance, recency and past recall. */
function scoreMemory(row: PersonaMemory, queryEmbedding: number[], query: string): number {
  const semantic = cosineSimilarity(queryEmbedding, row.embedding);
  const keyword = keywordOverlap(query, `${row.title}\n${row.content}\n${row.subjectName}`);
  const ageDays = Math.max(0, (Date.now() - row.occurredAt.getTime()) / 86_400_000);
  const recency = Math.exp(-ageDays / 60);
  const importance = row.importance / 100;
  const recall = Math.min(1, row.recallCount / 10);
  return semantic * 0.45 + keyword * 0.2 + importance * 0.15 + recency * 0.12 + recall * 0.08;
}

/** Keeps the three long-term slots from becoming three versions of one confession. */
function pickDiverseCore(rows: PersonaMemory[], limit: number): PersonaMemory[] {
  const picked: PersonaMemory[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.subjectType}:${row.subjectId || row.subjectName}:${row.kind}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    picked.push(row);
    if (picked.length >= limit) {
      return picked;
    }
  }
  for (const row of rows) {
    if (picked.length >= limit) {
      break;
    }
    if (!picked.includes(row)) {
      picked.push(row);
    }
  }
  return picked;
}

/** Same-conversation and same-person memories outrank old drama from another group. */
function contextBias(row: PersonaMemory, scene: MindScene): number {
  let bias = 0;
  if (row.conversationId === scene.conversation.id) {
    bias += 0.1;
  } else if (row.conversationId) {
    bias -= 0.05;
  }
  const partner =
    scene.conversation.kind === 'PRIVATE'
      ? scene.cast.find((member) => !member.isSelf)?.contactId
      : scene.anchor.senderId;
  if (row.subjectId && partner && row.subjectId === partner) {
    bias += 0.08;
  } else if (row.subjectId && scene.cast.some((member) => member.contactId === row.subjectId)) {
    bias += 0.04;
  }
  return bias;
}

/** Coerces a model-provided string into one of the allowed values, else the fallback. */
function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Rounds to three decimals so scores stay readable in tool output. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Code-point-safe truncation; never splits a surrogate pair. */
function truncate(value: string, max: number): string {
  return truncateText(value, max);
}

/** Accepts an object or a JSON string; anything else means no structured data. */
function parseStructured(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Plain-object guard applied before trusting parsed JSON. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** JSON columns use `{}` for a cleared value, matching the other persona tables. */
function jsonOrNull(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    return {};
  }
  return value as Prisma.InputJsonValue;
}

/** Wire shape; optional dates become ISO strings or null. */
function toRecord(row: PersonaMemory): PersonaMemoryRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    conversationId: row.conversationId,
    scope: row.scope,
    kind: row.kind,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    title: row.title,
    content: row.content,
    structured: row.structured,
    importance: row.importance,
    confidence: row.confidence,
    emotionalValence: row.emotionalValence,
    emotionalArousal: row.emotionalArousal,
    visibility: row.visibility,
    status: row.status,
    occurredAt: row.occurredAt.toISOString(),
    validFrom: row.validFrom?.toISOString() ?? null,
    validTo: row.validTo?.toISOString() ?? null,
    lastRecalledAt: row.lastRecalledAt?.toISOString() ?? null,
    recallCount: row.recallCount,
    sourceType: row.sourceType,
    sourceIds: row.sourceIds,
    consolidatedAt: row.consolidatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
