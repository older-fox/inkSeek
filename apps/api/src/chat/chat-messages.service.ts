import { Injectable, Logger } from '@nestjs/common';
import type {
  ChatConversationKind,
  ChatMessageImageSummary,
  ChatMessageKind,
  ChatMessagePart,
  ChatMessageSummary,
  ChatMessageVoiceSummary,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type {
  ChatChannel,
  ChatContact,
  ChatConversation,
  ChatImageAsset,
  ChatMessageRecord,
  ChatVoiceAsset,
  Prisma,
} from '../generated/prisma/client.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatMediaService, type StoredMedia } from './chat-media.service.js';
import { ChatMessageProcessor } from './chat-message-processor.service.js';
import {
  externalIdOf,
  groupAvatarUrl,
  normalizeSegments,
  userAvatarUrl,
  type OneBotGroupInfo,
  type OneBotGroupMember,
  type OneBotMessageEvent,
  type OneBotRequester,
  type OneBotSegment,
} from './onebot.js';

const MEMBER_SYNC_CHUNK = 50;
const PREVIEW_LENGTH = 120;

type MessageView = ChatMessageRecord & {
  images: ChatImageAsset[];
  voices: ChatVoiceAsset[];
  sender: Pick<ChatContact, 'externalId' | 'avatarUrl'>;
};

type PositionedMedia = StoredMedia & { position: number };

interface ParsedMessageEvent {
  kind: ChatConversationKind;
  peerId: string;
  senderId: string;
  senderName: string;
  senderCard: string | null;
  senderRole: string | null;
  isSelf: boolean;
  externalId: string | null;
  sentAt: Date;
  segments: OneBotSegment[];
}

@Injectable()
export class ChatMessagesService {
  private readonly logger = new Logger(ChatMessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: ChatMediaService,
    private readonly events: ChatEventsService,
    private readonly processor: ChatMessageProcessor,
  ) {}

  async ingest(
    channel: ChatChannel,
    client: OneBotRequester,
    event: OneBotMessageEvent,
  ): Promise<void> {
    const parsed = this.parseEvent(channel, event);
    if (!parsed) {
      return;
    }

    try {
      const conversation = await this.ensureConversation(channel, client, parsed);
      const senderContact = await this.ensureContact(channel, {
        externalId: parsed.senderId,
        nickname: parsed.senderName,
        avatarUrl: userAvatarUrl(parsed.senderId),
        isSelf: parsed.isSelf,
        seenAt: parsed.sentAt,
      });

      if (parsed.kind === 'GROUP') {
        await this.ensureMembership(conversation.id, senderContact.id, parsed);
      }

      if (parsed.externalId) {
        const existing = await this.prisma.chatMessageRecord.findUnique({
          where: {
            conversationId_externalId: {
              conversationId: conversation.id,
              externalId: parsed.externalId,
            },
          },
          select: { id: true },
        });

        if (existing) {
          return;
        }
      }

      const imageSegments = parsed.segments.flatMap((segment, position) =>
        this.media.isMediaSegment(segment) ? [{ segment, position }] : [],
      );
      const voiceSegments = parsed.segments.flatMap((segment, position) =>
        this.media.isVoiceSegment(segment) ? [{ segment, position }] : [],
      );
      const storedImages = await Promise.all(
        imageSegments.map(async ({ segment, position }) => {
          const media = await this.media.saveSegment(segment);
          return media ? { ...media, position } : null;
        }),
      );
      const storedVoices = await Promise.all(
        voiceSegments.map(async ({ segment, position }) => {
          const media = await this.media.saveVoiceSegment(segment, client);
          return media ? { ...media, position } : null;
        }),
      );
      const imageAssets = storedImages.filter((item): item is PositionedMedia => item !== null);
      const voiceAssets = storedVoices.filter((item): item is PositionedMedia => item !== null);
      const content = extractContent(parsed.segments);
      const text = content.text;

      const message = await this.prisma.$transaction(async (tx) => {
        const created = await tx.chatMessageRecord.create({
          data: {
            channelId: channel.id,
            conversationId: conversation.id,
            externalId: parsed.externalId,
            senderId: senderContact.id,
            senderName: parsed.senderName,
            senderCard: parsed.senderCard,
            isSelf: parsed.isSelf,
            kind: content.kind,
            text,
            segments: parsed.segments as unknown as Prisma.InputJsonValue,
            sentAt: parsed.sentAt,
            images: {
              create: imageAssets.map((asset) => ({
                url: asset.url,
                fileName: asset.fileName,
                mimeType: asset.mimeType,
                byteSize: asset.byteSize,
                width: asset.width,
                height: asset.height,
                remoteUrl: asset.remoteUrl,
                position: asset.position,
              })),
            },
            voices: {
              create: voiceAssets.map((asset) => ({
                url: asset.url,
                fileName: asset.fileName,
                mimeType: asset.mimeType,
                byteSize: asset.byteSize,
                duration: asset.duration,
                remoteUrl: asset.remoteUrl,
                position: asset.position,
              })),
            },
          },
          include: {
            images: { orderBy: { position: 'asc' } },
            voices: { orderBy: { position: 'asc' } },
            sender: { select: { externalId: true, avatarUrl: true } },
          },
        });

        await tx.chatConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: parsed.sentAt,
            lastMessagePreview: previewOf(text, content.kind, imageAssets.length, voiceAssets.length),
            lastMessageSender: parsed.senderCard ?? parsed.senderName,
          },
        });

        return created;
      });

      this.events.emit({
        type: 'message.created',
        channelId: channel.id,
        conversationId: conversation.id,
        messageId: message.id,
      });
      this.events.emit({
        type: 'conversation.updated',
        channelId: channel.id,
        conversationId: conversation.id,
      });

      await this.triggerProcessing(
        channel,
        conversation,
        parsed,
        message,
        imageAssets.length,
        voiceAssets.length,
      );
    } catch (error) {
      this.logger.error(
        `处理 NapCat 消息失败：${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      );
    }
  }

  async send(
    channel: ChatChannel,
    conversation: ChatConversation,
    client: OneBotRequester,
    input: { text: string; images: string[] },
  ): Promise<ChatMessageSummary> {
    const segments: OneBotSegment[] = [];
    const pendingImages: { dataUrl: string; position: number }[] = [];

    if (input.text.length > 0) {
      segments.push({ type: 'text', data: { text: input.text } });
    }

    input.images.forEach((dataUrl) => {
      const parsed = parseImageDataUrl(dataUrl);
      if (parsed) {
        const position = segments.length;
        segments.push({ type: 'image', data: { file: `base64://${parsed.base64}` } });
        pendingImages.push({ dataUrl, position });
      }
    });

    if (segments.length === 0) {
      throw new Error('消息内容为空');
    }

    const action =
      conversation.kind === 'GROUP' ? 'send_group_msg' : 'send_private_msg';
    const params =
      conversation.kind === 'GROUP'
        ? { group_id: toOneBotId(conversation.externalId), message: segments }
        : { user_id: toOneBotId(conversation.externalId), message: segments };

    const response = await client.call<{ message_id?: number | string }>(
      action,
      params,
      30_000,
    );
    const externalId = externalIdOf(response?.message_id);

    if (externalId) {
      const existing = await this.prisma.chatMessageRecord.findUnique({
        where: {
          conversationId_externalId: {
            conversationId: conversation.id,
            externalId,
          },
        },
        include: {
          images: { orderBy: { position: 'asc' } },
          voices: { orderBy: { position: 'asc' } },
          sender: { select: { externalId: true, avatarUrl: true } },
        },
      });

      if (existing) {
        return toMessageSummary(existing);
      }
    }

    const now = new Date();
    const selfContact = await this.ensureContact(channel, {
      externalId: channel.accountId,
      nickname: channel.displayName,
      avatarUrl: channel.avatarUrl ?? userAvatarUrl(channel.accountId),
      isSelf: true,
      seenAt: now,
    });
    const imageAssets = (
      await Promise.all(
        pendingImages.map(async ({ dataUrl, position }) => {
          const asset = await this.media.saveDataUrl(dataUrl);
          return asset ? { ...asset, position } : null;
        }),
      )
    ).filter((item): item is PositionedMedia => item !== null);
    const kind: ChatMessageKind =
      imageAssets.length > 0
        ? input.text.length > 0
          ? 'MIXED'
          : 'IMAGE'
        : 'TEXT';
    const text = input.text;

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessageRecord.create({
        data: {
          channelId: channel.id,
          conversationId: conversation.id,
          externalId,
          senderId: selfContact.id,
          senderName: channel.displayName,
          senderCard: null,
          isSelf: true,
          kind,
          text,
          segments: segments as unknown as Prisma.InputJsonValue,
          sentAt: now,
          images: {
            create: imageAssets.map((asset) => ({
              url: asset.url,
              fileName: asset.fileName,
              mimeType: asset.mimeType,
              byteSize: asset.byteSize,
              width: asset.width,
              height: asset.height,
              remoteUrl: asset.remoteUrl,
              position: asset.position,
            })),
          },
        },
        include: {
          images: { orderBy: { position: 'asc' } },
          voices: { orderBy: { position: 'asc' } },
          sender: { select: { externalId: true, avatarUrl: true } },
        },
      });

      await tx.chatConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: now,
          lastMessagePreview: previewOf(text, kind, imageAssets.length, 0),
          lastMessageSender: channel.displayName,
        },
      });

      return created;
    });

    this.events.emit({
      type: 'message.created',
      channelId: channel.id,
      conversationId: conversation.id,
      messageId: message.id,
    });
    this.events.emit({
      type: 'conversation.updated',
      channelId: channel.id,
      conversationId: conversation.id,
    });

    await this.triggerProcessing(
      channel,
      conversation,
      {
        kind: conversation.kind,
        peerId: conversation.externalId,
        senderId: channel.accountId,
        senderName: channel.displayName,
        senderCard: null,
        senderRole: null,
        isSelf: true,
        externalId,
        sentAt: now,
        segments,
      },
      message,
      imageAssets.length,
      0,
    );

    return toMessageSummary(message);
  }

  async ensureSelfContact(channel: ChatChannel): Promise<ChatContact> {
    return this.ensureContact(channel, {
      externalId: channel.accountId,
      nickname: channel.displayName,
      avatarUrl: channel.avatarUrl ?? userAvatarUrl(channel.accountId),
      isSelf: true,
      seenAt: new Date(),
    });
  }

  private parseEvent(
    channel: ChatChannel,
    event: OneBotMessageEvent,
  ): ParsedMessageEvent | null {
    const kind: ChatConversationKind = event.message_type === 'group' ? 'GROUP' : 'PRIVATE';
    const isSelf =
      event.post_type === 'message_sent' || externalIdOf(event.user_id) === channel.accountId;
    const senderId = isSelf ? channel.accountId : externalIdOf(event.user_id);
    const nickname = event.sender?.nickname?.trim();
    const card = event.sender?.card?.trim();

    if (!senderId) {
      return null;
    }

    let peerId: string | null;

    if (kind === 'GROUP') {
      peerId = externalIdOf(event.group_id);
    } else if (isSelf) {
      peerId =
        externalIdOf(event.target_id) ??
        (externalIdOf(event.user_id) !== channel.accountId
          ? externalIdOf(event.user_id)
          : null);
    } else {
      peerId = externalIdOf(event.user_id);
    }

    if (!peerId) {
      this.logger.warn(`收到缺少会话对象的私聊消息（message_id=${String(event.message_id)}）`);
      return null;
    }

    return {
      kind,
      peerId,
      senderId,
      senderName: isSelf ? channel.displayName : nickname || card || `QQ ${senderId}`,
      senderCard: kind === 'GROUP' ? card || null : null,
      senderRole: kind === 'GROUP' ? event.sender?.role ?? null : null,
      isSelf,
      externalId: externalIdOf(event.message_id),
      sentAt: new Date(event.time ? event.time * 1000 : Date.now()),
      segments: normalizeSegments(event.message),
    };
  }

  private async ensureConversation(
    channel: ChatChannel,
    client: OneBotRequester,
    parsed: ParsedMessageEvent,
  ): Promise<ChatConversation> {
    const existing = await this.prisma.chatConversation.findUnique({
      where: {
        channelId_kind_externalId: {
          channelId: channel.id,
          kind: parsed.kind,
          externalId: parsed.peerId,
        },
      },
    });

    if (existing) {
      const patch: Prisma.ChatConversationUpdateInput = {};

      if (parsed.kind === 'PRIVATE' && !parsed.isSelf && existing.name !== parsed.senderName) {
        patch.name = parsed.senderName;
      }
      if (!existing.avatarUrl) {
        patch.avatarUrl =
          parsed.kind === 'GROUP'
            ? groupAvatarUrl(parsed.peerId)
            : userAvatarUrl(parsed.peerId);
      }

      const needsGroupInfo =
        parsed.kind === 'GROUP' &&
        (existing.memberCount === null || existing.name.startsWith('群 '));

      if (needsGroupInfo) {
        const info = await this.fetchGroupInfo(client, parsed.peerId);
        if (info) {
          patch.name = info.group_name?.trim() || existing.name;
          patch.memberCount = info.member_count ?? existing.memberCount;
          patch.avatarUrl = groupAvatarUrl(parsed.peerId);
        }
      }

      const conversation =
        Object.keys(patch).length > 0
          ? await this.prisma.chatConversation.update({
              where: { id: existing.id },
              data: patch,
            })
          : existing;

      if (needsGroupInfo) {
        void this.syncGroupMembers(channel, conversation.id, parsed.peerId, client);
      }

      return conversation;
    }

    if (parsed.kind === 'PRIVATE') {
      const created = await this.prisma.chatConversation.create({
        data: {
          channelId: channel.id,
          kind: 'PRIVATE',
          externalId: parsed.peerId,
          name: parsed.isSelf ? `QQ ${parsed.peerId}` : parsed.senderName,
          avatarUrl: userAvatarUrl(parsed.peerId),
        },
      });

      this.events.emit({
        type: 'conversation.updated',
        channelId: channel.id,
        conversationId: created.id,
      });
      return created;
    }

    const info = await this.fetchGroupInfo(client, parsed.peerId);
    const created = await this.prisma.chatConversation.create({
      data: {
        channelId: channel.id,
        kind: 'GROUP',
        externalId: parsed.peerId,
        name: info?.group_name?.trim() || `群 ${parsed.peerId}`,
        avatarUrl: groupAvatarUrl(parsed.peerId),
        memberCount: info?.member_count ?? null,
      },
    });

    this.events.emit({
      type: 'conversation.updated',
      channelId: channel.id,
      conversationId: created.id,
    });

    void this.syncGroupMembers(channel, created.id, parsed.peerId, client);

    return created;
  }

  private async fetchGroupInfo(
    client: OneBotRequester,
    groupId: string,
  ): Promise<OneBotGroupInfo | null> {
    try {
      const info = await client.call<OneBotGroupInfo>(
        'get_group_info',
        { group_id: toOneBotId(groupId) },
        8000,
      );
      return info && typeof info === 'object' ? info : null;
    } catch (error) {
      this.logger.warn(
        `读取群 ${groupId} 资料失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Records the full group roster (QQ number + nickname + card) under the
   * channel namespace, not just the members who have spoken.
   */
  private async syncGroupMembers(
    channel: ChatChannel,
    conversationId: string,
    groupId: string,
    client: OneBotRequester,
  ): Promise<void> {
    try {
      const members = await client.call<OneBotGroupMember[]>(
        'get_group_member_list',
        { group_id: toOneBotId(groupId) },
        20_000,
      );

      if (!Array.isArray(members) || members.length === 0) {
        return;
      }

      const now = new Date();

      for (let index = 0; index < members.length; index += MEMBER_SYNC_CHUNK) {
        const chunk = members
          .slice(index, index + MEMBER_SYNC_CHUNK)
          .flatMap((member) => {
            const externalId = externalIdOf(member.user_id);
            return externalId ? [{ member, externalId }] : [];
          });

        if (chunk.length === 0) {
          continue;
        }

        const contacts = await this.prisma.$transaction(
          chunk.map(({ member, externalId }) => {
            const nickname = member.nickname?.trim() || member.card?.trim() || `QQ ${externalId}`;

            return this.prisma.chatContact.upsert({
              where: { channelId_externalId: { channelId: channel.id, externalId } },
              create: {
                channelId: channel.id,
                externalId,
                nickname,
                avatarUrl: userAvatarUrl(externalId),
                lastSeenAt: now,
              },
              update: {
                nickname,
                avatarUrl: userAvatarUrl(externalId),
                lastSeenAt: now,
              },
            });
          }),
        );

        const membershipQueries = chunk.flatMap(({ member }, memberIndex) => {
          const contact = contacts[memberIndex];
          if (!contact) {
            return [];
          }

          const joinedAt =
            typeof member.join_time === 'number' && member.join_time > 0
              ? new Date(member.join_time * 1000)
              : null;

          return [
            this.prisma.chatGroupMember.upsert({
              where: {
                conversationId_contactId: {
                  conversationId,
                  contactId: contact.id,
                },
              },
              create: {
                conversationId,
                contactId: contact.id,
                card: member.card?.trim() || null,
                role: member.role ?? null,
                joinedAt,
                lastSeenAt: now,
              },
              update: {
                card: member.card?.trim() || null,
                role: member.role ?? null,
                lastSeenAt: now,
              },
            }),
          ];
        });

        if (membershipQueries.length > 0) {
          await this.prisma.$transaction(membershipQueries);
        }
      }

      await this.prisma.chatConversation.update({
        where: { id: conversationId },
        data: { memberCount: members.length },
      });
    } catch (error) {
      this.logger.warn(
        `同步群 ${groupId} 成员失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async ensureMembership(
    conversationId: string,
    contactId: string,
    parsed: ParsedMessageEvent,
  ): Promise<void> {
    await this.prisma.chatGroupMember.upsert({
      where: {
        conversationId_contactId: { conversationId, contactId },
      },
      create: {
        conversationId,
        contactId,
        card: parsed.senderCard,
        role: parsed.senderRole,
        lastSeenAt: parsed.sentAt,
      },
      update: {
        card: parsed.senderCard ?? undefined,
        role: parsed.senderRole ?? undefined,
        lastSeenAt: parsed.sentAt,
      },
    });
  }

  private ensureContact(
    channel: ChatChannel,
    input: {
      externalId: string;
      nickname: string;
      avatarUrl: string;
      isSelf: boolean;
      seenAt: Date;
    },
  ): Promise<ChatContact> {
    return this.prisma.chatContact.upsert({
      where: {
        channelId_externalId: { channelId: channel.id, externalId: input.externalId },
      },
      create: {
        channelId: channel.id,
        externalId: input.externalId,
        nickname: input.nickname,
        avatarUrl: input.avatarUrl,
        isSelf: input.isSelf,
        lastSeenAt: input.seenAt,
      },
      update: {
        nickname: input.nickname,
        avatarUrl: input.avatarUrl,
        isSelf: input.isSelf ? true : undefined,
        lastSeenAt: input.seenAt,
      },
    });
  }

  private async triggerProcessing(
    channel: ChatChannel,
    conversation: ChatConversation,
    parsed: ParsedMessageEvent,
    message: MessageView,
    imageCount: number,
    voiceCount: number,
  ): Promise<void> {
    try {
      await this.processor.process({
        messageId: message.id,
        channelId: channel.id,
        conversationId: conversation.id,
        conversationKind: conversation.kind,
        externalId: parsed.externalId,
        isSelf: parsed.isSelf,
        senderId: parsed.senderId,
        senderName: parsed.senderName,
        text: message.text,
        kind: message.kind,
        imageCount,
        voiceCount,
        sentAt: parsed.sentAt,
      });
    } catch (error) {
      this.logger.warn(
        `消息处理占位管线执行失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export function toMessageSummary(record: MessageView): ChatMessageSummary {
  const images = [...record.images]
    .sort((left, right) => left.position - right.position)
    .map((image) => ({
      id: image.id,
      url: image.url,
      position: image.position,
      width: image.width,
      height: image.height,
    }));
  const voices = [...record.voices]
    .sort((left, right) => left.position - right.position)
    .map((voice) => ({
      id: voice.id,
      url: voice.url,
      position: voice.position,
      duration: voice.duration,
      mimeType: voice.mimeType,
      byteSize: voice.byteSize,
    }));

  return {
    id: record.id,
    conversationId: record.conversationId,
    channelId: record.channelId,
    externalId: record.externalId,
    self: record.isSelf,
    author: record.senderName,
    authorId: record.sender.externalId,
    authorCard: record.senderCard,
    avatarUrl: record.sender.avatarUrl,
    text: record.text,
    kind: record.kind,
    images,
    voices,
    parts: buildParts(record.segments, images, voices, record.text),
    sentAt: record.sentAt.toISOString(),
  };
}

/**
 * Replays the stored OneBot segments so text, images and voices keep their
 * original order. Media assets carry the segment index in `position`.
 */
function buildParts(
  rawSegments: unknown,
  images: readonly ChatMessageImageSummary[],
  voices: readonly ChatMessageVoiceSummary[],
  fallbackText: string,
): ChatMessagePart[] {
  const parts: ChatMessagePart[] = [];
  const imagesByPosition = new Map<number, ChatMessageImageSummary>();
  const voicesByPosition = new Map<number, ChatMessageVoiceSummary>();

  images.forEach((image) => {
    if (!imagesByPosition.has(image.position)) {
      imagesByPosition.set(image.position, image);
    }
  });
  voices.forEach((voice) => {
    if (!voicesByPosition.has(voice.position)) {
      voicesByPosition.set(voice.position, voice);
    }
  });

  const consumedImages = new Set<string>();
  const consumedVoices = new Set<string>();

  const appendText = (value: string) => {
    if (!value) {
      return;
    }
    const last = parts[parts.length - 1];
    if (last && last.type === 'text') {
      last.text += value;
    } else {
      parts.push({ type: 'text', text: value });
    }
  };

  if (Array.isArray(rawSegments)) {
    rawSegments.forEach((raw, position) => {
      if (!raw || typeof raw !== 'object') {
        return;
      }

      const segment = raw as { type?: unknown; data?: unknown };
      const data =
        segment.data && typeof segment.data === 'object'
          ? (segment.data as Record<string, unknown>)
          : {};

      switch (segment.type) {
        case 'text':
          appendText(typeof data['text'] === 'string' ? data['text'] : '');
          break;
        case 'at': {
          const label =
            (typeof data['name'] === 'string' && data['name']) ||
            (data['qq'] !== undefined ? String(data['qq']) : '');
          if (label) {
            appendText(`@${label} `);
          }
          break;
        }
        case 'image':
        case 'mface':
        case 'marketface': {
          const image = imagesByPosition.get(position);
          if (image && !consumedImages.has(image.id)) {
            consumedImages.add(image.id);
            parts.push({ type: 'image', image });
          } else if (!image) {
            appendText('[图片]');
          }
          break;
        }
        case 'record': {
          const voice = voicesByPosition.get(position);
          if (voice && !consumedVoices.has(voice.id)) {
            consumedVoices.add(voice.id);
            parts.push({ type: 'voice', voice });
          } else if (!voice) {
            appendText('[语音]');
          }
          break;
        }
        case 'face':
          appendText('[表情]');
          break;
        case 'video':
          appendText('[视频]');
          break;
        case 'file':
          appendText('[文件]');
          break;
        case 'json':
        case 'xml':
          appendText('[卡片消息]');
          break;
        default:
          break;
      }
    });
  }

  images.forEach((image) => {
    if (!consumedImages.has(image.id)) {
      parts.push({ type: 'image', image });
    }
  });
  voices.forEach((voice) => {
    if (!consumedVoices.has(voice.id)) {
      parts.push({ type: 'voice', voice });
    }
  });

  if (parts.length === 0 && fallbackText) {
    appendText(fallbackText);
  }

  return parts;
}

function extractContent(segments: readonly OneBotSegment[]): {
  text: string;
  kind: ChatMessageKind;
} {
  const parts: string[] = [];
  let hasFace = false;
  let hasPlainText = false;
  let hasImages = false;
  let hasVoices = false;

  segments.forEach((segment) => {
    const data = segment.data;

    switch (segment.type) {
      case 'text': {
        const text = typeof data['text'] === 'string' ? data['text'] : '';
        if (text.length > 0) {
          parts.push(text);
          hasPlainText = true;
        }
        break;
      }
      case 'at': {
        const label =
          (typeof data['name'] === 'string' && data['name']) ||
          (data['qq'] !== undefined ? String(data['qq']) : '');
        if (label) {
          parts.push(`@${label} `);
          hasPlainText = true;
        }
        break;
      }
      case 'face':
        parts.push('[表情]');
        hasFace = true;
        break;
      // mface / marketface are stored as image assets and rendered directly.
      case 'image':
      case 'mface':
      case 'marketface':
        hasImages = true;
        break;
      // record is stored as a voice asset and rendered as an audio bar.
      case 'record':
        hasVoices = true;
        break;
      case 'video':
        parts.push('[视频]');
        hasPlainText = true;
        break;
      case 'file':
        parts.push('[文件]');
        hasPlainText = true;
        break;
      case 'json':
      case 'xml':
        parts.push('[卡片消息]');
        hasPlainText = true;
        break;
      default:
        break;
    }
  });

  const text = parts.join('').trim();
  const kind: ChatMessageKind =
    hasImages || hasVoices
      ? text.length > 0
        ? 'MIXED'
        : hasVoices && !hasImages
          ? 'VOICE'
          : 'IMAGE'
      : hasFace && !hasPlainText
        ? 'FACE'
        : 'TEXT';

  return { text, kind };
}

function previewOf(
  text: string,
  kind: ChatMessageKind,
  imageCount: number,
  voiceCount: number,
): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length > 0) {
    return normalized.slice(0, PREVIEW_LENGTH);
  }
  if (kind === 'VOICE' || (voiceCount > 0 && imageCount === 0)) {
    return '[语音]';
  }
  if (kind === 'IMAGE' || imageCount > 0) {
    return '[图片]';
  }
  return kind === 'FACE' ? '[表情]' : '[消息]';
}

function toOneBotId(value: string): number | string {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : value;
}

function parseImageDataUrl(dataUrl: string): { base64: string } | null {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl);
  return match?.[1] ? { base64: match[1] } : null;
}
