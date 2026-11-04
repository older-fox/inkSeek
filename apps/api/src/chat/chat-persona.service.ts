import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ChatConversationPersonaRecord,
  ChatPersonaHistoryEntry,
  ChatPersonaMetadata,
  ChatPersonaValue,
  SaveConversationPersonaInput,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

const HISTORY_LIMIT = 200;

interface PersonaRow {
  values: Prisma.JsonValue;
  history: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ChatPersonaService {
  constructor(private readonly prisma: PrismaService) {}

  async get(conversationId: string): Promise<ChatConversationPersonaRecord> {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        channelId: true,
        kind: true,
        externalId: true,
        createdAt: true,
        updatedAt: true,
        groupPersona: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: '会话不存在或已被删除',
      });
    }

    if (conversation.kind === 'GROUP') {
      return this.toRecord(conversation, null, conversation.groupPersona);
    }

    const contact = await this.findContact(conversation.channelId, conversation.externalId);

    if (!contact) {
      throw new NotFoundException({
        code: 'PERSONA_CONTACT_NOT_FOUND',
        message: '该私聊对象尚未归档，暂时无法读取人格属性',
      });
    }

    const record = await this.prisma.chatPrivatePersona.findUnique({
      where: {
        channelId_contactId: {
          channelId: conversation.channelId,
          contactId: contact.id,
        },
      },
    });

    return this.toRecord(conversation, contact.id, record);
  }

  /**
   * Pipeline lookup: external ids are group numbers / peer QQ numbers, which
   * are what message objects expose. Kind is explicit so a card can never
   * silently fall back to the other persona table.
   */
  async valuesByExternalId(
    kind: 'GROUP' | 'PRIVATE',
    channelId: string,
    externalId: string,
  ): Promise<Record<string, ChatPersonaValue> | null> {
    if (!channelId || !externalId) {
      return null;
    }

    if (kind === 'GROUP') {
      const conversation = await this.prisma.chatConversation.findUnique({
        where: { channelId_kind_externalId: { channelId, kind, externalId } },
        select: { groupPersona: { select: { values: true } } },
      });

      return conversation?.groupPersona
        ? readValues(conversation.groupPersona.values)
        : null;
    }

    const contact = await this.prisma.chatContact.findUnique({
      where: { channelId_externalId: { channelId, externalId } },
      select: { id: true },
    });

    if (!contact) {
      return null;
    }

    const row = await this.prisma.chatPrivatePersona.findUnique({
      where: { channelId_contactId: { channelId, contactId: contact.id } },
      select: { values: true },
    });

    return row ? readValues(row.values) : null;
  }

  async save(
    conversationId: string,
    input: SaveConversationPersonaInput,
  ): Promise<ChatConversationPersonaRecord> {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, channelId: true, kind: true, externalId: true },
    });

    if (!conversation) {
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: '会话不存在或已被删除',
      });
    }

    const values = input.values as Prisma.InputJsonValue;
    const history = input.history.slice(0, HISTORY_LIMIT) as unknown as Prisma.InputJsonValue;

    if (conversation.kind === 'GROUP') {
      await this.prisma.chatGroupPersona.upsert({
        where: { conversationId },
        create: { conversationId, values, history },
        update: { values, history },
      });

      return this.get(conversationId);
    }

    const contact = await this.findContact(conversation.channelId, conversation.externalId);

    if (!contact) {
      throw new NotFoundException({
        code: 'PERSONA_CONTACT_NOT_FOUND',
        message: '该私聊对象尚未归档，暂时无法保存人格属性',
      });
    }

    await this.prisma.chatPrivatePersona.upsert({
      where: {
        channelId_contactId: {
          channelId: conversation.channelId,
          contactId: contact.id,
        },
      },
      create: {
        channelId: conversation.channelId,
        contactId: contact.id,
        values,
        history,
      },
      update: { values, history },
    });

    return this.get(conversationId);
  }

  private findContact(channelId: string, externalId: string) {
    return this.prisma.chatContact.findUnique({
      where: { channelId_externalId: { channelId, externalId } },
      select: { id: true },
    });
  }

  private toRecord(
    conversation: {
      id: string;
      channelId: string;
      kind: 'PRIVATE' | 'GROUP';
      createdAt: Date;
      updatedAt: Date;
    },
    contactId: string | null,
    row: PersonaRow | null,
  ): ChatConversationPersonaRecord {
    return {
      kind: conversation.kind,
      conversationId: conversation.id,
      channelId: conversation.channelId,
      contactId,
      values: readValues(row?.values),
      meta: toMeta(row, conversation.createdAt, conversation.updatedAt),
      persisted: row !== null,
    };
  }
}

function isPersonaValue(value: unknown): value is ChatPersonaValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }

  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function readValues(value: Prisma.JsonValue | undefined): Record<string, ChatPersonaValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, ChatPersonaValue> = {};

  Object.entries(value).forEach(([key, item]) => {
    if (isPersonaValue(item)) {
      result[key] = item;
    }
  });

  return result;
}

function isHistoryEntry(value: unknown): value is ChatPersonaHistoryEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const entry = value as Record<string, unknown>;

  return (
    typeof entry.id === 'string' &&
    typeof entry.time === 'string' &&
    typeof entry.field === 'string' &&
    typeof entry.from === 'string' &&
    typeof entry.to === 'string' &&
    typeof entry.reason === 'string'
  );
}

function readHistory(value: Prisma.JsonValue | undefined): ChatPersonaHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: ChatPersonaHistoryEntry[] = [];

  value.forEach((entry) => {
    if (isHistoryEntry(entry)) {
      entries.push(entry);
    }
  });

  return entries.slice(0, HISTORY_LIMIT);
}

function toMeta(row: PersonaRow | null, createdAt: Date, updatedAt: Date): ChatPersonaMetadata {
  return {
    createdAt: (row?.createdAt ?? createdAt).toISOString(),
    updatedAt: (row?.updatedAt ?? updatedAt).toISOString(),
    history: readHistory(row?.history),
  };
}
