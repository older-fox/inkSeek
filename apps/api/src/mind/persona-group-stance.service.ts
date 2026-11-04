import { Injectable, NotFoundException } from '@nestjs/common';
import type { PersonaGroupStanceRecord, PersonaGroupStanceUpdateInput } from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { ChatConversation, PersonaGroupStance, Prisma } from '../generated/prisma/client.js';
import { jsonOrNull, jsonValue } from './mind-json.js';
import { clamp, type MindPersona } from './mind.types.js';

@Injectable()
export class PersonaGroupStanceService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(personaId: string, conversationId: string): Promise<PersonaGroupStance> {
    const persona = await this.persona(personaId);
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, channelId: persona.channelId, kind: 'GROUP' },
    });
    if (!conversation) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '群会话不存在' });
    }
    const existing = await this.prisma.personaGroupStance.findUnique({
      where: { personaId_conversationId: { personaId, conversationId } },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.personaGroupStance.create({
      data: {
        persona: { connect: { id: personaId } },
        channel: { connect: { id: persona.channelId } },
        conversation: { connect: { id: conversationId } },
      },
    });
  }

  /** Existing rows only: opening a group creates its row on demand. */
  async list(personaId: string): Promise<PersonaGroupStanceRecord[]> {
    const rows = await this.prisma.personaGroupStance.findMany({
      where: { personaId },
      include: { conversation: true },
      orderBy: [{ attention: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });
    return rows.map(toRecord);
  }

  async get(personaId: string, conversationId: string): Promise<PersonaGroupStanceRecord> {
    const row = await this.ensure(personaId, conversationId);
    const withConversation = await this.prisma.personaGroupStance.findUniqueOrThrow({
      where: { id: row.id },
      include: { conversation: true },
    });
    return toRecord(withConversation);
  }

  async update(
    personaId: string,
    input: PersonaGroupStanceUpdateInput,
    meta?: { source?: string; reason?: string },
  ): Promise<PersonaGroupStanceRecord> {
    const stance = await this.ensure(personaId, input.conversationId);
    const data: Prisma.PersonaGroupStanceUpdateInput = {};
    const changes: Prisma.PersonaChangeLogCreateManyInput[] = [];
    const source = meta?.source ?? 'ADMIN_EDIT';
    const reason = meta?.reason ?? '操作员手动调整群态度';
    const logField = (field: string, before: unknown, after: unknown, delta?: number) => {
      if (before === after) {
        return;
      }
      changes.push({
        personaId,
        scope: 'GROUP',
        targetId: input.conversationId,
        field,
        beforeValue: jsonValue(before),
        afterValue: jsonValue(after),
        delta: delta ?? null,
        reason,
        source,
      });
    };
    const numeric = [
      'comfort',
      'belonging',
      'attention',
      'formality',
      'speakRate',
      'audienceRisk',
    ] as const;
    for (const field of numeric) {
      const next = input[field];
      if (next === undefined) {
        continue;
      }
      const clamped = clamp(next, 0, 100);
      data[field] = clamped;
      logField(field, stance[field], clamped, clamped - stance[field]);
    }
    const text = ['role', 'narrative', 'sceneRules', 'topic', 'phase'] as const;
    for (const field of text) {
      const next = input[field];
      if (next === undefined) {
        continue;
      }
      data[field] = next;
      logField(field, stance[field], next);
    }
    const json = ['boundaries', 'tabooTopics', 'extras'] as const;
    for (const field of json) {
      if (input[field] !== undefined) {
        data[field] = jsonOrNull(input[field]);
        logField(field, stance[field], input[field]);
      }
    }
    if (input.mentionOnly !== undefined) {
      data.mentionOnly = input.mentionOnly;
      logField('mentionOnly', stance.mentionOnly, input.mentionOnly);
    }
    await this.prisma.personaGroupStance.update({ where: { id: stance.id }, data });
    if (changes.length > 0) {
      await this.prisma.personaChangeLog.createMany({ data: changes });
    }
    return this.get(personaId, input.conversationId);
  }

  async markRead(personaId: string, conversationId: string): Promise<void> {
    const stance = await this.ensure(personaId, conversationId);
    await this.prisma.personaGroupStance.update({
      where: { id: stance.id },
      data: { lastReadAt: new Date() },
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
}

function toRecord(
  row: PersonaGroupStance & { conversation: ChatConversation },
): PersonaGroupStanceRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    conversationId: row.conversationId,
    externalId: row.conversation.externalId,
    name: row.conversation.name,
    avatarUrl: row.conversation.avatarUrl,
    memberCount: row.conversation.memberCount,
    comfort: row.comfort,
    belonging: row.belonging,
    attention: row.attention,
    formality: row.formality,
    speakRate: row.speakRate,
    audienceRisk: row.audienceRisk,
    role: row.role,
    narrative: row.narrative,
    boundaries: row.boundaries,
    tabooTopics: row.tabooTopics,
    sceneRules: row.sceneRules,
    mentionOnly: row.mentionOnly,
    topic: row.topic,
    phase: row.phase,
    extras: row.extras,
    lastReadAt: row.lastReadAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
