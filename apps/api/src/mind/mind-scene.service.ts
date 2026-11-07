import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ChatMessageSnapshot } from '../chat/chat-message.types.js';
import { ImageDescriptionService } from '../chat/image-description.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type {
  ChatConversation,
  ChatMessageRecord,
  ChatChannelPersona,
  Prisma,
} from '../generated/prisma/client.js';
import { PersonaGroupStanceService } from './persona-group-stance.service.js';
import {
  readString,
  readStringArray,
  type MindScene,
  type SceneCastMember,
  type SceneKnownCastMember,
  type SceneMessage,
  type SceneSelfMessage,
} from './mind.types.js';

const SCENE_MESSAGE_LIMIT = 200;
const CAST_LIMIT = 80;
const SCENE_IMAGE_DESCRIBE_LIMIT = 6;
const SCENE_IMAGE_DESCRIBE_BATCH = 3;
const SELF_HISTORY_WINDOW_MS = 6 * 3_600_000;
const SELF_HISTORY_LIMIT = 12;

type MessageWithAssets = ChatMessageRecord & {
  images: {
    url: string;
    media: { description: string | null } | null;
  }[];
  voices: {
    description: string | null;
  }[];
  sender: {
    id: string;
    nickname: string;
    externalId: string;
    isSelf: boolean;
  };
};

@Injectable()
export class MindSceneService {
  private readonly logger = new Logger(MindSceneService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stances: PersonaGroupStanceService,
    private readonly imageDescriptions: ImageDescriptionService,
  ) {}

  async buildFromMessage(
    message: ChatMessageSnapshot,
    imageDescriptionPrompt = '',
  ): Promise<MindScene | null> {
    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { channelId: message.channelId },
    });
    if (!persona) {
      return null;
    }
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: message.conversationId },
    });
    if (!conversation) {
      throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: '会话不存在' });
    }
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: persona.channelId },
      select: { accountId: true },
    });
    const accountId = channel?.accountId ?? '';

    const rows = await this.prisma.chatMessageRecord.findMany({
      where: {
        conversationId: conversation.id,
        sentAt: { lte: message.sentAt },
      },
      orderBy: { sentAt: 'desc' },
      take: SCENE_MESSAGE_LIMIT,
      include: {
        images: {
          orderBy: { position: 'asc' },
          include: { media: { select: { description: true } } },
        },
        voices: { orderBy: { position: 'asc' }, select: { description: true } },
        sender: { select: { id: true, nickname: true, externalId: true, isSelf: true } },
      },
    });
    await this.describeMissingImages(rows, message.messageId, imageDescriptionPrompt);
    const messages = rows.reverse().map((row) => toSceneMessage(row, accountId));
    const cast = await this.loadCast(conversation, persona);
    const stance =
      conversation.kind === 'GROUP'
        ? await this.stances.ensure(persona.id, conversation.id).then((row) =>
            this.prisma.personaGroupStance.findUniqueOrThrow({
              where: { id: row.id },
              include: { conversation: true },
            }),
          )
        : null;

    return {
      persona,
      conversation,
      anchor: message,
      messages,
      cast,
      knownCast: await this.loadKnownCast(conversation, persona, cast),
      stance,
      recentSelf: await this.loadRecentSelf(conversation.id, message.sentAt.toISOString()),
      startedAt: new Date(),
    };
  }

  async buildFromConversation(
    channelId: string,
    conversationId: string,
    anchorTime = new Date(),
    imageDescriptionPrompt = '',
  ): Promise<MindScene | null> {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, channelId },
    });
    if (!conversation) {
      return null;
    }
    const last = await this.prisma.chatMessageRecord.findFirst({
      where: { conversationId, sentAt: { lte: anchorTime } },
      orderBy: { sentAt: 'desc' },
    });
    if (!last) {
      return null;
    }
    const anchor = toChatMessageSnapshot(last, conversation);
    return this.buildFromMessage(anchor, imageDescriptionPrompt);
  }

  /**
   * Read-only scene for the conversation simulator: real recent messages plus
   * one ephemeral test message. Never writes image descriptions or stances.
   */
  async buildSimulationScene(
    personaId: string,
    conversationId: string,
    input: {
      text: string;
      senderName?: string;
      senderExternalId?: string;
      /** Earlier rehearsal turns, projected as ephemeral messages. */
      history?: { role: 'user' | 'persona'; text: string }[];
    },
  ): Promise<MindScene | null> {
    const persona = await this.prisma.chatChannelPersona.findUnique({
      where: { id: personaId },
    });
    if (!persona) {
      return null;
    }
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, channelId: persona.channelId },
    });
    if (!conversation) {
      return null;
    }
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: persona.channelId },
      select: { accountId: true },
    });
    const accountId = channel?.accountId ?? '';
    const rows = await this.prisma.chatMessageRecord.findMany({
      where: { conversationId: conversation.id },
      orderBy: { sentAt: 'desc' },
      take: SCENE_MESSAGE_LIMIT,
      include: {
        images: {
          orderBy: { position: 'asc' },
          include: { media: { select: { description: true } } },
        },
        voices: { orderBy: { position: 'asc' }, select: { description: true } },
        sender: { select: { id: true, nickname: true, externalId: true, isSelf: true } },
      },
    });
    const messages = rows.reverse().map((row) => toSceneMessage(row, accountId));
    const lastInbound = [...messages].reverse().find((message) => !message.isSelf);
    const contact = input.senderExternalId
      ? await this.prisma.chatContact.findUnique({
          where: {
            channelId_externalId: {
              channelId: persona.channelId,
              externalId: input.senderExternalId,
            },
          },
        })
      : null;
    const senderId = contact?.id ?? lastInbound?.senderId ?? '';
    const senderName =
      input.senderName?.trim() || contact?.nickname || lastInbound?.senderName || '对方';
    const now = new Date();
    const history = input.history ?? [];
    for (const [index, turn] of history.entries()) {
      const at = new Date(now.getTime() - (history.length - index + 1) * 60_000);
      messages.push({
        id: `simulation-history-${index}`,
        senderId: turn.role === 'persona' ? persona.id : senderId,
        senderName: turn.role === 'persona' ? persona.name : senderName,
        isSelf: turn.role === 'persona',
        kind: 'TEXT',
        text: turn.text,
        sentAt: at.toISOString(),
        images: [],
        imageCount: 0,
        mentionedSelf: false,
      });
    }
    const anchor: ChatMessageSnapshot = {
      messageId: '',
      channelId: persona.channelId,
      conversationId: conversation.id,
      conversationKind: conversation.kind,
      conversationExternalId: conversation.externalId,
      externalId: null,
      isSelf: false,
      senderId,
      senderName,
      text: input.text,
      kind: 'TEXT',
      quote: null,
      images: [],
      imageCount: 0,
      voices: [],
      voiceCount: 0,
      sentAt: now,
    };
    messages.push({
      id: `simulation-${now.getTime()}`,
      senderId,
      senderName,
      isSelf: false,
      kind: 'TEXT',
      text: input.text,
      sentAt: now.toISOString(),
      images: [],
      imageCount: 0,
      mentionedSelf: false,
    });
    const cast = await this.loadCast(conversation, persona);
    const stance =
      conversation.kind === 'GROUP'
        ? await this.prisma.personaGroupStance.findUnique({
            where: { personaId_conversationId: { personaId, conversationId } },
            include: { conversation: true },
          })
        : null;
    return {
      persona,
      conversation,
      anchor,
      messages,
      cast,
      knownCast: await this.loadKnownCast(conversation, persona, cast),
      stance,
      recentSelf: await this.loadRecentSelf(conversation.id, now.toISOString()),
      startedAt: now,
    };
  }

  /**
   * Own messages are paged separately from the prompt window: in a busy chat
   * they slide out within minutes, and the persona then re-announces plans it
   * already made. The planner renders only the ones not already in view.
   */
  private async loadRecentSelf(
    conversationId: string,
    anchorSentAt: string,
  ): Promise<SceneSelfMessage[]> {
    const anchor = new Date(anchorSentAt);
    const since = new Date(anchor.getTime() - SELF_HISTORY_WINDOW_MS);
    const rows = await this.prisma.chatMessageRecord.findMany({
      where: {
        conversationId,
        isSelf: true,
        sentAt: { gte: since, lte: anchor },
        text: { not: '' },
      },
      orderBy: { sentAt: 'desc' },
      take: SELF_HISTORY_LIMIT,
      select: { id: true, text: true, sentAt: true },
    });
    return rows.reverse().map((row) => ({
      id: row.id,
      text: row.text,
      sentAt: row.sentAt.toISOString(),
    }));
  }

  async recentMessages(
    conversationId: string,
    limit: number,
    before = new Date(),
  ): Promise<SceneMessage[]> {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { channelId: true },
    });
    const channel = conversation
      ? await this.prisma.chatChannel.findUnique({
          where: { id: conversation.channelId },
          select: { accountId: true },
        })
      : null;
    const accountId = channel?.accountId ?? '';
    const rows = await this.prisma.chatMessageRecord.findMany({
      where: { conversationId, sentAt: { lte: before } },
      orderBy: { sentAt: 'desc' },
      take: limit,
      include: {
        images: {
          orderBy: { position: 'asc' },
          include: { media: { select: { description: true } } },
        },
        voices: { orderBy: { position: 'asc' }, select: { description: true } },
        sender: { select: { id: true, nickname: true, externalId: true, isSelf: true } },
      },
    });
    return rows.reverse().map((row) => toSceneMessage(row, accountId));
  }

  /**
   * Whether this message was aimed at the persona: an at/poke targeting the
   * channel account, or the persona's name/alias appearing in the text. Used
   * to bypass the reply-avoid window without paying for a full scene build.
   */
  async isDirectedMention(
    message: ChatMessageSnapshot,
    persona: { name: string; values: unknown },
  ): Promise<boolean> {
    const values =
      persona.values && typeof persona.values === 'object' && !Array.isArray(persona.values)
        ? (persona.values as Record<string, unknown>)
        : null;
    const names = [
      persona.name,
      readString(values?.['name']),
      ...readStringArray(values?.['aliases']),
    ]
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.some((name) => message.text.includes(name))) {
      return true;
    }
    if (!message.messageId) {
      return false;
    }
    const [record, channel] = await Promise.all([
      this.prisma.chatMessageRecord.findUnique({
        where: { id: message.messageId },
        select: { segments: true },
      }),
      this.prisma.chatChannel.findUnique({
        where: { id: message.channelId },
        select: { accountId: true },
      }),
    ]);
    return Boolean(channel?.accountId && mentionsAccount(record?.segments, channel.accountId));
  }

  /**
   * True when this sender already had a message before the persona's latest
   * reply and is now continuing the same exchange. The mention-only switch
   * still blocks cold messages; this only prevents dropping its own follow-up.
   */
  async isActiveExchange(
    conversationId: string,
    senderId: string,
    windowMinutes: number,
  ): Promise<boolean> {
    const since = new Date(Date.now() - Math.max(1, windowMinutes) * 60_000);
    const rows = await this.prisma.chatMessageRecord.findMany({
      where: { conversationId, sentAt: { gte: since } },
      orderBy: { sentAt: 'desc' },
      take: 20,
      select: { isSelf: true, senderId: true, sentAt: true },
    });
    const lastSelf = rows.find((row) => row.isSelf);
    const lastInbound = rows.find((row) => !row.isSelf && row.senderId === senderId);
    if (!lastSelf || !lastInbound) {
      return false;
    }
    const selfAt = lastSelf.sentAt.getTime();
    const inboundAt = lastInbound.sentAt.getTime();
    if (inboundAt <= selfAt) {
      return false;
    }
    return rows.some(
      (row) =>
        !row.isSelf && row.senderId === senderId && row.sentAt.getTime() <= selfAt,
    );
  }

  /**
   * Frequency signal for long events: how many messages in the window were
   * actually aimed at the persona (at/poke/name). The current message has
   * already been stored, so it is included.
   */
  async countDirectedMentions(conversationId: string, since: Date, limit = 50): Promise<number> {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { channelId: true },
    });
    if (!conversation) {
      return 0;
    }
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: conversation.channelId },
      select: { accountId: true },
    });
    if (!channel?.accountId) {
      return 0;
    }
    const rows = await this.prisma.chatMessageRecord.findMany({
      where: {
        conversationId,
        isSelf: false,
        sentAt: { gte: since },
      },
      orderBy: { sentAt: 'desc' },
      take: Math.max(1, Math.min(200, limit)),
      select: { segments: true },
    });
    return rows.filter((row) => mentionsAccount(row.segments, channel.accountId)).length;
  }

  /**
   * Vision descriptions are the only image payload the planner can read, so
   * missing descriptions are generated here and written back to the shared
   * media row. Anchor images go first, then the most recent messages; the cap
   * keeps a backlog of old images from turning one turn into a burst of vision
   * calls.
   */
  private async describeMissingImages(
    rows: MessageWithAssets[],
    anchorId: string,
    prompt: string,
  ): Promise<void> {
    const anchor = rows.find((row) => row.id === anchorId);
    const ordered = anchor ? [anchor, ...rows.filter((row) => row !== anchor)] : rows;
    const missing: string[] = [];
    const seen = new Set<string>();

    for (const row of ordered) {
      for (const image of row.images) {
        const url = image.url.trim();
        if (!url || seen.has(url) || image.media?.description?.trim()) {
          continue;
        }
        seen.add(url);
        missing.push(url);
        if (missing.length >= SCENE_IMAGE_DESCRIBE_LIMIT) {
          break;
        }
      }
      if (missing.length >= SCENE_IMAGE_DESCRIBE_LIMIT) {
        break;
      }
    }

    if (missing.length === 0) {
      return;
    }

    const described = new Map<string, string>();
    for (let index = 0; index < missing.length; index += SCENE_IMAGE_DESCRIBE_BATCH) {
      const batch = missing.slice(index, index + SCENE_IMAGE_DESCRIBE_BATCH);
      const results = await Promise.all(
        batch.map(async (url) => {
          try {
            const result = await this.imageDescriptions.describeForScene(url, prompt);
            return { url, description: result.description.trim() };
          } catch (error) {
            this.logger.warn(
              `图片描述失败：${url}：${error instanceof Error ? error.message : String(error)}`,
            );
            return { url, description: '' };
          }
        }),
      );
      for (const result of results) {
        if (result.description) {
          described.set(result.url, result.description);
        }
      }
    }

    if (described.size === 0) {
      return;
    }
    for (const row of rows) {
      for (const image of row.images) {
        if (image.media?.description?.trim()) {
          continue;
        }
        const description = described.get(image.url);
        if (description) {
          image.media = { description };
        }
      }
    }
  }

  private async loadCast(
    conversation: ChatConversation,
    persona: ChatChannelPersona,
  ): Promise<SceneCastMember[]> {
    if (conversation.kind === 'PRIVATE') {
      const contact = await this.prisma.chatContact.findUnique({
        where: {
          channelId_externalId: {
            channelId: persona.channelId,
            externalId: conversation.externalId,
          },
        },
      });
      if (!contact) {
        return [];
      }
      const relationship = await this.prisma.personaRelationship.findUnique({
        where: { personaId_contactId: { personaId: persona.id, contactId: contact.id } },
      });
      return [
        {
          contactId: contact.id,
          externalId: contact.externalId,
          nickname: contact.nickname,
          isSelf: contact.isSelf,
          role: '',
          relationship: relationship
            ? {
                affinity: relationship.affinity,
                trust: relationship.trust,
                hostility: relationship.hostility,
                attraction: relationship.attraction,
                intimacy: relationship.intimacy,
                obligation: relationship.obligation,
                familiarity: relationship.familiarity,
                fear: relationship.fear,
                respect: relationship.respect,
                dependency: relationship.dependency,
                possessiveness: relationship.possessiveness,
                friction: relationship.friction,
                unresolvedConflict: relationship.unresolvedConflict,
                blocked: relationship.blocked,
                mutedUntil: relationship.mutedUntil?.toISOString() ?? null,
                disclosureScope: relationship.disclosureScope,
                relationTags: relationList(relationship.relationTags),
                addressHere: relationList(relationship.addressHere),
                publicMask: relationText(relationship.publicMask),
                boundaries: relationList(relationship.boundaries),
                openPromises: relationList(relationship.openPromises),
                sharedEvents: relationList(relationship.sharedEvents),
              }
            : null,
        },
      ];
    }

    const members = await this.prisma.chatGroupMember.findMany({
      where: { conversationId: conversation.id },
      include: { contact: true },
      take: CAST_LIMIT,
      orderBy: { lastSeenAt: 'desc' },
    });
    const relationships = await this.prisma.personaRelationship.findMany({
      where: {
        personaId: persona.id,
        contactId: { in: members.map((member) => member.contactId) },
      },
    });
    const byContact = new Map(relationships.map((row) => [row.contactId, row]));
    return members.map((member) => {
      const relationship = byContact.get(member.contactId);
      return {
        contactId: member.contactId,
        externalId: member.contact.externalId,
        nickname: member.contact.nickname,
        isSelf: member.contact.isSelf,
        role: member.card || member.role || '',
        relationship: relationship
          ? {
              affinity: relationship.affinity,
              trust: relationship.trust,
              hostility: relationship.hostility,
              attraction: relationship.attraction,
              intimacy: relationship.intimacy,
              obligation: relationship.obligation,
              familiarity: relationship.familiarity,
              fear: relationship.fear,
              respect: relationship.respect,
              dependency: relationship.dependency,
              possessiveness: relationship.possessiveness,
              friction: relationship.friction,
              unresolvedConflict: relationship.unresolvedConflict,
              blocked: relationship.blocked,
              mutedUntil: relationship.mutedUntil?.toISOString() ?? null,
              disclosureScope: relationship.disclosureScope,
              relationTags: relationList(relationship.relationTags),
              addressHere: relationList(relationship.addressHere),
              publicMask: relationText(relationship.publicMask),
              boundaries: relationList(relationship.boundaries),
              openPromises: relationList(relationship.openPromises),
              sharedEvents: relationList(relationship.sharedEvents),
            }
          : null,
      };
    });
  }

  /**
   * Group turns should not dump private history, but the persona should know
   * when someone present is already an acquaintance. Count memories from other
   * conversations only; the prompt gets a hint, not their content.
   */
  private async loadKnownCast(
    conversation: ChatConversation,
    persona: ChatChannelPersona,
    cast: SceneCastMember[],
  ): Promise<SceneKnownCastMember[]> {
    if (conversation.kind !== 'GROUP') {
      return [];
    }
    const members = cast.filter((member) => !member.isSelf && member.contactId);
    if (members.length === 0) {
      return [];
    }
    const rows = await this.prisma.personaMemory.groupBy({
      by: ['subjectId'],
      where: {
        personaId: persona.id,
        channelId: persona.channelId,
        status: 'ACTIVE',
        subjectType: 'PERSON',
        subjectId: { in: members.map((member) => member.contactId) },
        // Channel-wide relation memories have conversationId = null, so a plain
        // NOT would silently exclude exactly the history we want to hint at.
        OR: [
          { conversationId: null },
          { conversationId: { not: conversation.id } },
        ],
      },
      _count: { _all: true },
    });
    const counts = new Map(
      rows
        .filter((row) => row.subjectId)
        .map((row) => [row.subjectId as string, row._count._all]),
    );
    return members
      .map((member) => ({
        contactId: member.contactId,
        nickname: member.nickname,
        memoryCount: counts.get(member.contactId) ?? 0,
      }))
      .filter((member) => member.memoryCount > 0)
      .sort((left, right) => right.memoryCount - left.memoryCount)
      .slice(0, 5);
  }
}

function toSceneMessage(row: MessageWithAssets, accountId: string): SceneMessage {
  const images = row.images
    .map((image) => image.media?.description?.trim() || '')
    .filter((description) => description.length > 0);
  const voiceText = row.voices
    .map((voice) => voice.description?.trim() || '')
    .filter((description) => description.length > 0);
  const text = [row.text, ...voiceText.map((transcript) => `[语音：${transcript}]`)]
    .filter(Boolean)
    .join('\n');
  return {
    id: row.id,
    senderId: row.senderId,
    senderName: row.sender.nickname || row.senderName,
    isSelf: row.isSelf,
    kind: row.kind,
    text,
    sentAt: row.sentAt.toISOString(),
    images,
    imageCount: row.images.length,
    mentionedSelf: accountId.length > 0 && mentionsAccount(row.segments, accountId),
  };
}

/**
 * A literal "@" in text is not reliable (quoted text, someone else's handle).
 * Only an at-segment or poke whose target is the channel account counts.
 */
function mentionsAccount(segments: unknown, accountId: string): boolean {
  if (!Array.isArray(segments)) {
    return false;
  }
  return segments.some((raw) => {
    if (!raw || typeof raw !== 'object') {
      return false;
    }
    const segment = raw as { type?: unknown; data?: unknown };
    const data =
      segment.data && typeof segment.data === 'object'
        ? (segment.data as Record<string, unknown>)
        : {};
    if (segment.type === 'at') {
      const qq = data['qq'];
      return qq !== undefined && String(qq).trim() === accountId;
    }
    if (segment.type === 'poke') {
      const target = data['target_id'];
      return target !== undefined && String(target).trim() === accountId;
    }
    return false;
  });
}

export function toChatMessageSnapshot(
  record: ChatMessageRecord,
  conversation: ChatConversation,
): ChatMessageSnapshot {
  return {
    messageId: record.id,
    channelId: record.channelId,
    conversationId: record.conversationId,
    conversationKind: conversation.kind,
    conversationExternalId: conversation.externalId,
    externalId: record.externalId,
    isSelf: record.isSelf,
    senderId: record.senderId,
    senderName: record.senderName,
    text: record.text,
    kind: record.kind,
    quote: null,
    images: [],
    imageCount: 0,
    voices: [],
    voiceCount: 0,
    sentAt: record.sentAt,
  };
}

/** Legacy rows hold `{}` placeholders and nested objects in list columns. */
function relationList(value: Prisma.JsonValue | null): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => Boolean(item) && item !== '{}' && item !== '[]');
  return items.length > 0 ? items : null;
}

function relationText(value: Prisma.JsonValue | null): string | null {
  if (typeof value === 'string') {
    const text = value.trim();
    return text && text !== '{}' ? text : null;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).length > 0 ? JSON.stringify(value).slice(0, 300) : null;
  }
  return null;
}
