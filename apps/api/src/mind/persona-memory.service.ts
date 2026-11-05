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
import { PrismaService } from '../database/prisma.service.js';
import type { PersonaMemory, Prisma } from '../generated/prisma/client.js';
import { embedText, cosineSimilarity, keywordOverlap } from './mind-vector.js';
import {
  clamp,
  formatSceneForPrompt,
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
const CORE_MEMORY_LIMIT = 3;
const CORE_IMPORTANCE_FLOOR = 60;
const CORE_KINDS: readonly PersonaMemoryKind[] = [
  'FACT',
  'PREFERENCE',
  'PROMISE',
  'BOUNDARY',
  'REFLECTION',
];
const DEDUPE_THRESHOLD = 0.94;
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

  async create(input: PersonaMemoryCreateInput): Promise<PersonaMemoryRecord> {
    const persona = await this.persona(input.personaId);
    const content = input.content.trim();
    if (!content) {
      throw new NotFoundException({ code: 'MEMORY_EMPTY', message: '记忆内容不能为空' });
    }
    const embedding = embedText(
      [input.title, content, input.subjectName].filter(Boolean).join('\n'),
    );

    const existing = await this.findDuplicate(
      persona.id,
      input.kind,
      input.subjectType,
      input.subjectId ?? '',
      embedding,
    );
    if (existing) {
      const sourceIds = Array.from(new Set([...existing.sourceIds, ...(input.sourceIds ?? [])]));
      const updated = await this.prisma.personaMemory.update({
        where: { id: existing.id },
        data: {
          content: content.length > existing.content.length ? content : existing.content,
          title: input.title ?? existing.title,
          subjectName: input.subjectName ?? existing.subjectName,
          importance: Math.max(existing.importance, clamp(input.importance ?? 50, 0, 100)),
          confidence: Math.max(existing.confidence, clamp(input.confidence ?? 70, 0, 100)),
          sourceIds,
          embedding,
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
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        sourceType: input.sourceType,
        sourceIds: input.sourceIds ?? [],
        embedding,
      },
    });
    return toRecord(row);
  }

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

  async list(input: PersonaMemoryQueryInput): Promise<PersonaMemoryRecord[]> {
    await this.persona(input.personaId);
    const where: Prisma.PersonaMemoryWhereInput = {
      personaId: input.personaId,
      ...(input.includeDeleted ? {} : { status: 'ACTIVE' as const }),
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.sourceType ? { sourceType: input.sourceType } : {}),
      ...(input.subjectType ? { subjectType: input.subjectType } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    };

    if (!input.query?.trim()) {
      const rows = await this.prisma.personaMemory.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { updatedAt: 'desc' }],
        take: input.limit,
        skip: input.offset,
      });
      return rows.map(toRecord);
    }

    const candidates = await this.loadCandidates(where);
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
  ): Promise<{
    core: PersonaMemoryRecord[];
    relevant: PersonaMemoryRecord[];
    stats: MindMemoryStats;
  }> {
    const where = this.sceneWhere(scene);
    const statsWhere: Prisma.PersonaMemoryWhereInput = {
      personaId: scene.persona.id,
      channelId: scene.persona.channelId,
      status: 'ACTIVE',
    };
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [coreRows, candidates, total, recent7d, latest] = await Promise.all([
      this.prisma.personaMemory.findMany({
        where: {
          ...where,
          kind: { in: [...CORE_KINDS] },
          importance: { gte: CORE_IMPORTANCE_FLOOR },
        },
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: CORE_MEMORY_LIMIT,
      }),
      this.loadCandidates(where),
      this.prisma.personaMemory.count({ where: statsWhere }),
      this.prisma.personaMemory.count({
        where: { ...statsWhere, occurredAt: { gte: weekAgo } },
      }),
      this.prisma.personaMemory.findFirst({
        where: statsWhere,
        orderBy: [{ occurredAt: 'desc' }],
        select: { occurredAt: true },
      }),
    ]);
    const coreIds = new Set(coreRows.map((row) => row.id));
    const queryEmbedding = embedText(query);
    const relevant = candidates
      .filter((row) => !coreIds.has(row.id))
      .map((row) => ({ row, score: scoreMemory(row, queryEmbedding, query) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
    await this.markRecalled(
      [...coreRows, ...relevant.map((entry) => entry.row)].map((row) => row.id),
    );
    return {
      core: coreRows.map(toRecord),
      relevant: relevant.map((entry) => ({
        ...toRecord(entry.row),
        score: round(entry.score),
      })),
      stats: {
        total,
        recent7d,
        lastAt: latest?.occurredAt.toISOString() ?? null,
      },
    };
  }

  private async loadCandidates(where: Prisma.PersonaMemoryWhereInput): Promise<PersonaMemory[]> {
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
    return [...byId.values()];
  }

  /**
   * Visibility, channel and temporal-validity rules for scene recall. Memories
   * whose validTo has passed stay in the library but no longer shape replies.
   */
  private sceneWhere(scene: MindScene): Prisma.PersonaMemoryWhereInput {
    const now = new Date();
    return {
      personaId: scene.persona.id,
      channelId: scene.persona.channelId,
      status: 'ACTIVE',
      AND: [
        {
          OR: [
            { visibility: { not: 'SCENE' } },
            { visibility: 'SCENE', conversationId: scene.conversation.id },
            { visibility: 'SCENE', conversationId: null },
          ],
        },
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validTo: null }, { validTo: { gt: now } }] },
      ],
    };
  }

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
    const timeZone =
      readString((input.scene.persona.values as Record<string, unknown> | null)?.['time_zone']) ||
      null;
    const transcript = formatSceneForPrompt(
      input.scene.messages.slice(-8).map((message) => ({
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
      '已有长期记忆不要重复。如果新经历补充或修正了旧事实，输出合并后的完整内容，而不是另起一条。',
      '输出 JSON 数组，每项字段：kind(FACT/PREFERENCE/PROMISE/BOUNDARY/REFLECTION)、scope(SELF/RELATION/GROUP/SCENE/WORLD/PROCEDURE)、subjectType(PERSON/GROUP/SELF/WORLD/TOPIC)、subjectName、content、importance(0-100)、confidence(0-100)、visibility(PRIVATE/SCENE/CHANNEL/PUBLIC)。',
      '直接输出 JSON，不要解释。',
      existing.length > 0
        ? `已有长期记忆：\n${existing
            .map((memory) => `- [${memory.kind}] ${memory.content.slice(0, 160)}`)
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

  async markRecalled(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.personaMemory.updateMany({
      where: { id: { in: [...ids] } },
      data: { lastRecalledAt: new Date(), recallCount: { increment: 1 } },
    });
  }

  async persona(personaId: string) {
    const persona = await this.prisma.chatChannelPersona.findUnique({ where: { id: personaId } });
    if (!persona) {
      throw new NotFoundException({ code: 'PERSONA_NOT_FOUND', message: '人格实例不存在' });
    }
    return persona;
  }

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
        kind,
        subjectType,
        subjectId,
        status: 'ACTIVE',
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    let best: PersonaMemory | null = null;
    let bestScore = DEDUPE_THRESHOLD;
    for (const candidate of candidates) {
      const score = cosineSimilarity(embedding, candidate.embedding);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }
}

function scoreMemory(row: PersonaMemory, queryEmbedding: number[], query: string): number {
  const semantic = cosineSimilarity(queryEmbedding, row.embedding);
  const keyword = keywordOverlap(query, `${row.title}\n${row.content}\n${row.subjectName}`);
  const ageDays = Math.max(0, (Date.now() - row.occurredAt.getTime()) / 86_400_000);
  const recency = Math.exp(-ageDays / 60);
  const importance = row.importance / 100;
  const recall = Math.min(1, row.recallCount / 10);
  return semantic * 0.45 + keyword * 0.2 + importance * 0.15 + recency * 0.12 + recall * 0.08;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function jsonOrNull(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    return {};
  }
  return value as Prisma.InputJsonValue;
}

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
