import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  PersonaRelationshipRecord,
  PersonaRelationshipUpdateInput,
  RelationshipSignal,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { ChatContact, PersonaRelationship, Prisma } from '../generated/prisma/client.js';
import { jsonOrNull, jsonValue } from './mind-json.js';
import { clamp, MIND_MAX_RELATIONSHIP_DELTA, type MindPersona } from './mind.types.js';

const DIMENSIONS = [
  'affinity',
  'trust',
  'intimacy',
  'attraction',
  'hostility',
  'fear',
  'respect',
  'obligation',
  'dependency',
  'possessiveness',
  'friction',
  'unresolvedConflict',
  'familiarity',
] as const;

@Injectable()
export class PersonaRelationshipService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureForContact(personaId: string, contactId: string): Promise<PersonaRelationship> {
    const persona = await this.persona(personaId);
    await this.contact(persona.channelId, contactId);
    const existing = await this.prisma.personaRelationship.findUnique({
      where: { personaId_contactId: { personaId, contactId } },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.personaRelationship.create({
      data: {
        persona: { connect: { id: personaId } },
        channel: { connect: { id: persona.channelId } },
        contact: { connect: { id: contactId } },
        familiarity: 20,
      },
    });
  }

  /** Existing rows only: opening a contact creates its row on demand. */
  async list(personaId: string): Promise<PersonaRelationshipRecord[]> {
    const rows = await this.prisma.personaRelationship.findMany({
      where: { personaId },
      include: { contact: true },
      orderBy: [{ lastInteractionAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    });
    return rows.map(toRecord);
  }

  async getByExternalId(personaId: string, externalId: string): Promise<PersonaRelationshipRecord> {
    const persona = await this.persona(personaId);
    const contact = await this.prisma.chatContact.findFirst({
      where: { channelId: persona.channelId, externalId },
      select: { id: true },
    });
    if (!contact) {
      throw new NotFoundException({ code: 'CONTACT_NOT_FOUND', message: '联系人不存在' });
    }
    return this.get(personaId, contact.id);
  }

  async get(personaId: string, contactId: string): Promise<PersonaRelationshipRecord> {
    const row = await this.ensureForContact(personaId, contactId);
    const withContact = await this.prisma.personaRelationship.findUniqueOrThrow({
      where: { id: row.id },
      include: { contact: true },
    });
    return toRecord(withContact);
  }

  async update(
    personaId: string,
    input: PersonaRelationshipUpdateInput,
    audit?: { kind?: string; reason?: string },
  ): Promise<PersonaRelationshipRecord> {
    const relationship = await this.ensureForContact(personaId, input.contactId);
    const data: Prisma.PersonaRelationshipUpdateInput = {};
    const changes: Prisma.PersonaChangeLogCreateManyInput[] = [];
    const source = audit?.kind ?? 'ADMIN_EDIT';
    const reason = audit?.reason ?? '操作员手动调整关系';

    const logField = (field: string, before: unknown, after: unknown, delta?: number) => {
      if (before === after) {
        return;
      }
      changes.push({
        personaId,
        scope: 'RELATION',
        targetId: input.contactId,
        field,
        beforeValue: jsonValue(before),
        afterValue: jsonValue(after),
        delta: delta ?? null,
        reason,
        source,
      });
    };

    for (const dimension of DIMENSIONS) {
      const next = input[dimension];
      if (next !== undefined && next !== relationship[dimension]) {
        const clamped = clamp(next, -100, 100);
        data[dimension] = clamped;
        logField(dimension, relationship[dimension], clamped, clamped - relationship[dimension]);
      }
    }

    const jsonFields = [
      'relationTags',
      'addressHere',
      'publicMask',
      'boundaries',
      'openPromises',
      'sharedEvents',
      'extras',
    ] as const;
    for (const field of jsonFields) {
      if (input[field] !== undefined) {
        data[field] = jsonOrNull(input[field]);
        logField(field, relationship[field], input[field]);
      }
    }
    if (input.disclosureScope !== undefined) {
      data.disclosureScope = input.disclosureScope;
      logField('disclosureScope', relationship.disclosureScope, input.disclosureScope);
    }
    if (input.blocked !== undefined) {
      data.blocked = input.blocked;
      logField('blocked', relationship.blocked, input.blocked);
    }
    if (input.mutedUntil !== undefined) {
      data.mutedUntil = input.mutedUntil ? new Date(input.mutedUntil) : null;
      logField('mutedUntil', relationship.mutedUntil, data.mutedUntil);
    }

    await this.prisma.personaRelationship.update({ where: { id: relationship.id }, data });
    if (changes.length > 0) {
      await this.prisma.personaChangeLog.createMany({ data: changes });
    }
    return this.get(personaId, input.contactId);
  }

  async applySignals(
    personaId: string,
    signals: readonly RelationshipSignal[],
    reason = '',
    source = 'DRIFT',
  ): Promise<void> {
    for (const signal of signals) {
      const relationship = await this.ensureForContact(personaId, signal.contactId);
      const data: Prisma.PersonaRelationshipUpdateInput = {};
      const changes: Prisma.PersonaChangeLogCreateManyInput[] = [];
      for (const dimension of DIMENSIONS) {
        const raw = signal[dimension];
        if (raw === undefined) {
          continue;
        }
        const delta = clamp(raw, -MIND_MAX_RELATIONSHIP_DELTA, MIND_MAX_RELATIONSHIP_DELTA);
        if (delta === 0) {
          continue;
        }
        const next = clamp(relationship[dimension] + delta, -100, 100);
        if (next === relationship[dimension]) {
          continue;
        }
        data[dimension] = next;
        changes.push({
          personaId,
          scope: 'RELATION',
          targetId: signal.contactId,
          field: dimension,
          beforeValue: relationship[dimension],
          afterValue: next,
          delta: next - relationship[dimension],
          reason: signal.reason || reason,
          source,
        });
      }
      if (changes.length === 0) {
        continue;
      }
      data.lastInteractionAt = new Date();
      await this.prisma.personaRelationship.update({ where: { id: relationship.id }, data });
      await this.prisma.personaChangeLog.createMany({ data: changes });
    }
  }

  async touch(personaId: string, contactId: string): Promise<void> {
    const relationship = await this.ensureForContact(personaId, contactId);
    await this.prisma.personaRelationship.update({
      where: { id: relationship.id },
      data: { lastInteractionAt: new Date() },
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

  private async contact(channelId: string, contactId: string): Promise<ChatContact> {
    const contact = await this.prisma.chatContact.findFirst({
      where: { id: contactId, channelId },
    });
    if (!contact) {
      throw new NotFoundException({ code: 'CONTACT_NOT_FOUND', message: '联系人不存在' });
    }
    return contact;
  }
}

function toRecord(row: PersonaRelationship & { contact: ChatContact }): PersonaRelationshipRecord {
  return {
    id: row.id,
    personaId: row.personaId,
    channelId: row.channelId,
    contactId: row.contactId,
    externalId: row.contact.externalId,
    nickname: row.contact.nickname,
    avatarUrl: row.contact.avatarUrl,
    affinity: row.affinity,
    trust: row.trust,
    intimacy: row.intimacy,
    attraction: row.attraction,
    hostility: row.hostility,
    fear: row.fear,
    respect: row.respect,
    obligation: row.obligation,
    dependency: row.dependency,
    possessiveness: row.possessiveness,
    friction: row.friction,
    unresolvedConflict: row.unresolvedConflict,
    familiarity: row.familiarity,
    relationTags: row.relationTags,
    addressHere: row.addressHere,
    publicMask: row.publicMask,
    boundaries: row.boundaries,
    openPromises: row.openPromises,
    sharedEvents: row.sharedEvents,
    extras: row.extras,
    disclosureScope: row.disclosureScope,
    blocked: row.blocked,
    mutedUntil: row.mutedUntil?.toISOString() ?? null,
    lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
