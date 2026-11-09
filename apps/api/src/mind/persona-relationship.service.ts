import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  PersonaRelationshipRecord,
  PersonaRelationshipUpdateInput,
  RelationshipSignal,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { ChatContact, PersonaRelationship, Prisma } from '../generated/prisma/client.js';
import { jsonOrNull, jsonValue } from './mind-json.js';
import { clamp, type MindPersona } from './mind.types.js';

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

  /** Creates the relationship on first contact with a neutral familiarity seed so later math has a base. */
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

  /** Resolves a channel-scoped external id first; unknown contacts fail instead of being created. */
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

  /** Read-only lookup for simulations: never creates a relationship row. */
  async find(personaId: string, contactId: string): Promise<PersonaRelationshipRecord | null> {
    const withContact = await this.prisma.personaRelationship.findUnique({
      where: { personaId_contactId: { personaId, contactId } },
      include: { contact: true },
    });
    return withContact ? toRecord(withContact) : null;
  }

  /** Full record with contact metadata; ensures the row exists so readers always get a complete shape. */
  async get(personaId: string, contactId: string): Promise<PersonaRelationshipRecord> {
    const row = await this.ensureForContact(personaId, contactId);
    const withContact = await this.prisma.personaRelationship.findUniqueOrThrow({
      where: { id: row.id },
      include: { contact: true },
    });
    return toRecord(withContact);
  }

  /** Operator-facing write: dimensions clamp to -100..100 and only real changes are logged. */
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

    /** Queues a change-log row, but only for a field that actually moved. */
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

  /** Applies drift deltas round-by-round; zero or clamped-out deltas skip the write entirely. */
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
        const delta = Math.round(raw);
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

  /** Bumps the last-interaction timestamp without touching any dimension value. */
  async touch(personaId: string, contactId: string): Promise<void> {
    const relationship = await this.ensureForContact(personaId, contactId);
    await this.prisma.personaRelationship.update({
      where: { id: relationship.id },
      data: { lastInteractionAt: new Date() },
    });
  }

  /** Loads the persona or fails with a 404 so callers never see a half-resolved channel id. */
  async persona(personaId: string): Promise<MindPersona> {
    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { id: personaId },
    });
    if (!persona) {
      throw new NotFoundException({ code: 'PERSONA_NOT_FOUND', message: '人格实例不存在' });
    }
    return persona;
  }

  /** Contacts are channel-scoped, so the id alone is not enough to find one. */
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

/** Flattens the joined contact fields into the wire record shape, normalising dates to ISO strings. */
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
