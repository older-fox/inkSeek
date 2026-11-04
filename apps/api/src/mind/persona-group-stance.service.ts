import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ConversationPersonaValues,
  PersonaGroupStanceRecord,
  PersonaGroupStanceUpdateInput,
} from '@inkseek/shared';
import { stanceToPersonaValues } from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { ChatConversation, PersonaGroupStance, Prisma } from '../generated/prisma/client.js';
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

  async list(personaId: string): Promise<PersonaGroupStanceRecord[]> {
    const persona = await this.persona(personaId);
    const groups = await this.prisma.chatConversation.findMany({
      where: { channelId: persona.channelId, kind: 'GROUP' },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });
    for (const group of groups) {
      await this.ensure(personaId, group.id);
    }
    const rows = await this.prisma.personaGroupStance.findMany({
      where: { personaId },
      include: { conversation: true },
      orderBy: [{ attention: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });
    return rows.map(toRecord);
  }

  /** Read-only projection for pipeline persona cards; no row is created. */
  async valuesForExternalId(
    personaId: string,
    externalId: string,
  ): Promise<ConversationPersonaValues | null> {
    const persona = await this.persona(personaId);
    const row = await this.prisma.personaGroupStance.findFirst({
      where: {
        personaId,
        conversation: { channelId: persona.channelId, kind: 'GROUP', externalId },
      },
      include: { conversation: true },
    });
    return row ? stanceToPersonaValues(toRecord(row)) : null;
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
  ): Promise<PersonaGroupStanceRecord> {
    const stance = await this.ensure(personaId, input.conversationId);
    const data: Prisma.PersonaGroupStanceUpdateInput = {};
    if (input.comfort !== undefined) data.comfort = clamp(input.comfort, 0, 100);
    if (input.belonging !== undefined) data.belonging = clamp(input.belonging, 0, 100);
    if (input.attention !== undefined) data.attention = clamp(input.attention, 0, 100);
    if (input.formality !== undefined) data.formality = clamp(input.formality, 0, 100);
    if (input.speakRate !== undefined) data.speakRate = clamp(input.speakRate, 0, 100);
    if (input.audienceRisk !== undefined) data.audienceRisk = clamp(input.audienceRisk, 0, 100);
    if (input.role !== undefined) data.role = input.role;
    if (input.narrative !== undefined) data.narrative = input.narrative;
    if (input.boundaries !== undefined) data.boundaries = jsonOrNull(input.boundaries);
    if (input.tabooTopics !== undefined) data.tabooTopics = jsonOrNull(input.tabooTopics);
    if (input.sceneRules !== undefined) data.sceneRules = input.sceneRules;
    if (input.mentionOnly !== undefined) data.mentionOnly = input.mentionOnly;
    if (input.topic !== undefined) data.topic = input.topic;
    if (input.phase !== undefined) data.phase = input.phase;
    if (input.extras !== undefined) data.extras = jsonOrNull(input.extras);
    await this.prisma.personaGroupStance.update({ where: { id: stance.id }, data });
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

function jsonOrNull(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    return {};
  }
  return value as Prisma.InputJsonValue;
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
