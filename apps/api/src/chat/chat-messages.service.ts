import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ChatConversationKind,
  ChatForwardSummary,
  ChatMessageKind,
  ChatMessageSummary,
  ChatQuoteSummary,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type {
  ChatChannel,
  ChatContact,
  ChatConversation,
  ChatForward,
  ChatImageAsset,
  ChatMessageRecord,
  ChatVoiceAsset,
  Prisma,
} from '../generated/prisma/client.js';
import { ChatEventsService } from './chat-events.service.js';
import {
  ChatForwardService,
  forwardSummaryText,
  stripExpandedForward,
  type ForwardNodeWrite,
  type ForwardWrite,
} from './chat-forward.service.js';
import { ChatMediaService, type StoredMedia } from './chat-media.service.js';
import {
  ChatMessageProcessor,
  type PersistedChatMessage,
} from './chat-message-processor.service.js';
import { buildParts, extractContent, findForwardSegment } from './message-content.js';
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
const QUOTE_TIMEOUT_MS = 8_000;

type MessageView = ChatMessageRecord & {
  images: ChatImageAsset[];
  voices: ChatVoiceAsset[];
  sender: Pick<ChatContact, 'externalId' | 'avatarUrl'>;
  forward: ForwardMeta | null;
};

type ForwardMeta = Pick<ChatForward, 'id' | 'title' | 'source' | 'status' | 'nodeCount'>;

type PositionedMedia = StoredMedia & { position: number };

interface ResolvedQuote {
  replyToExternalId: string;
  replyToMessageId: string | null;
  snapshot: ChatQuoteSummary;
}

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
    private readonly forwards: ChatForwardService,
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
      const content = extractContent(parsed.segments);

      // Persist the message before any media download, quote lookup or forward
      // expansion: a slow or failing remote must never cost the message itself.
      const { id } = await this.prisma.$transaction(async (tx) => {
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
            text: content.text,
            segments: sanitizeInlineMedia(parsed.segments) as unknown as Prisma.InputJsonValue,
            sentAt: parsed.sentAt,
          },
          select: { id: true },
        });

        await tx.chatConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: parsed.sentAt,
            lastMessagePreview: previewOf(
              content.text,
              content.kind,
              imageSegments.length,
              voiceSegments.length,
            ),
            lastMessageSender: parsed.senderCard ?? parsed.senderName,
          },
        });

        return created;
      });

      let imageAssets: PositionedMedia[] = [];
      let voiceAssets: PositionedMedia[] = [];

      try {
        // These three may each call NapCat or the network; run them together so
        // ingest is bounded by the slowest one, and isolate individual failures.
        const quotePromise = this.resolveQuote(conversation.id, parsed.segments, client).catch(
          () => null,
        );
        const forwardSegment = findForwardSegment(parsed.segments);
        const forwardPromise = forwardSegment
          ? this.forwards.expand(client, forwardSegment).catch((error: unknown) => {
              this.logger.warn(
                `转发展开失败，保留基础消息：${error instanceof Error ? error.message : String(error)}`,
              );
              return null;
            })
          : Promise.resolve(null);
        const [storedImages, storedVoices, forward, quote] = await Promise.all([
          Promise.all(
            imageSegments.map(async ({ segment, position }) => {
              const media = await this.media.saveSegment(segment).catch(() => null);
              return media ? { ...media, position } : null;
            }),
          ),
          Promise.all(
            voiceSegments.map(async ({ segment, position }) => {
              const media = await this.media.saveVoiceSegment(segment, client).catch(() => null);
              return media ? { ...media, position } : null;
            }),
          ),
          forwardPromise,
          quotePromise,
        ]);

        imageAssets = storedImages.filter((item): item is PositionedMedia => item !== null);
        voiceAssets = storedVoices.filter((item): item is PositionedMedia => item !== null);
        const finalContent = forward
          ? { kind: 'FORWARD' as const, text: forwardSummaryText(forward) }
          : content;
        const segments = forward ? stripExpandedForward(parsed.segments, forward) : parsed.segments;
        // Nested nodes reference their forward by id, so generate it up front.
        const forwardRecordId = forward ? randomUUID() : '';

        await this.prisma.$transaction(async (tx) => {
          if (imageAssets.length > 0) {
            await tx.chatImageAsset.createMany({
              data: imageAssets.map((asset) => ({
                messageId: id,
                mediaId: asset.mediaId,
                url: asset.url,
                fileName: asset.fileName,
                mimeType: asset.mimeType,
                byteSize: asset.byteSize,
                width: asset.width,
                height: asset.height,
                remoteUrl: asset.remoteUrl,
                position: asset.position,
              })),
            });
          }
          if (voiceAssets.length > 0) {
            await tx.chatVoiceAsset.createMany({
              data: voiceAssets.map((asset) => ({
                messageId: id,
                url: asset.url,
                fileName: asset.fileName,
                mimeType: asset.mimeType,
                byteSize: asset.byteSize,
                duration: asset.duration,
                remoteUrl: asset.remoteUrl,
                position: asset.position,
              })),
            });
          }
          if (forward) {
            await tx.chatForward.create({
              data: {
                id: forwardRecordId,
                messageId: id,
                forwardId: forward.forwardId,
                title: forward.title,
                source: forward.source,
                status: forward.status,
                nodeCount: forward.nodes.length,
                depth: forward.depth,
                errorCode: forward.errorCode,
                nodes: {
                  create: forward.nodes.map((node) => toForwardNodeCreate(node, forwardRecordId)),
                },
              },
            });
          }

          await tx.chatMessageRecord.update({
            where: { id },
            data: {
              kind: finalContent.kind,
              text: finalContent.text,
              segments: sanitizeInlineMedia(segments) as unknown as Prisma.InputJsonValue,
              replyToExternalId: quote?.replyToExternalId ?? null,
              replyToMessageId: quote?.replyToMessageId ?? null,
              ...(quote
                ? { replySnapshot: quote.snapshot as unknown as Prisma.InputJsonValue }
                : {}),
            },
          });

          await tx.chatConversation.update({
            where: { id: conversation.id },
            data: {
              lastMessagePreview: previewOf(
                finalContent.text,
                finalContent.kind,
                imageAssets.length,
                voiceAssets.length,
              ),
            },
          });
        });
      } catch (error) {
        this.logger.warn(
          `消息附件处理失败，保留基础消息：${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Loading relations inside the transaction issues concurrent SELECTs on one
      // pg connection; fetch the view from the pool once the write is committed.
      const message = await this.loadMessageView(id);

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
        `处理 NapCat 消息失败：${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
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

    const action = conversation.kind === 'GROUP' ? 'send_group_msg' : 'send_private_msg';
    const params =
      conversation.kind === 'GROUP'
        ? { group_id: toOneBotId(conversation.externalId), message: segments }
        : { user_id: toOneBotId(conversation.externalId), message: segments };

    const response = await client.call<{ message_id?: number | string }>(action, params, 30_000);
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
          forward: {
            select: { id: true, title: true, source: true, status: true, nodeCount: true },
          },
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
    const assetsByPosition = new Map(imageAssets.map((asset) => [asset.position, asset]));
    // Keep the archived segment list ordered but swap transport blobs for stored
    // media URLs so the column never duplicates megabytes of base64.
    const storedSegments = segments.map((segment, position) => {
      if (segment.type !== 'image') {
        return segment;
      }
      const asset = assetsByPosition.get(position);
      return { type: 'image', data: asset ? { file: asset.url } : {} } satisfies OneBotSegment;
    });
    const kind: ChatMessageKind =
      imageAssets.length > 0 ? (input.text.length > 0 ? 'MIXED' : 'IMAGE') : 'TEXT';
    const text = input.text;

    const { id } = await this.prisma.$transaction(async (tx) => {
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
          segments: storedSegments as unknown as Prisma.InputJsonValue,
          sentAt: now,
          images: {
            create: imageAssets.map((asset) => ({
              mediaId: asset.mediaId,
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
        select: { id: true },
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

    const message = await this.loadMessageView(id);

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

  private loadMessageView(id: string): Promise<MessageView> {
    return this.prisma.chatMessageRecord.findUniqueOrThrow({
      where: { id },
      include: {
        images: { orderBy: { position: 'asc' } },
        voices: { orderBy: { position: 'asc' } },
        sender: { select: { externalId: true, avatarUrl: true } },
        forward: {
          select: { id: true, title: true, source: true, status: true, nodeCount: true },
        },
      },
    });
  }

  /**
   * Repairs a message ingested before forward expansion existed: its stored
   * segments still point at the original card, so expand it once and attach the
   * nodes without changing message identity or ordering.
   */
  async attachForward(messageId: string, forward: ForwardWrite): Promise<void> {
    const record = await this.prisma.chatMessageRecord.findUnique({
      where: { id: messageId },
      select: { segments: true },
    });

    if (!record) {
      return;
    }

    const segments = Array.isArray(record.segments)
      ? (record.segments as unknown as OneBotSegment[])
      : [];
    const forwardRecordId = randomUUID();

    await this.prisma.chatMessageRecord.update({
      where: { id: messageId },
      data: {
        kind: 'FORWARD',
        text: forwardSummaryText(forward),
        segments: stripExpandedForward(segments, forward) as unknown as Prisma.InputJsonValue,
        forward: {
          create: {
            id: forwardRecordId,
            forwardId: forward.forwardId,
            title: forward.title,
            source: forward.source,
            status: forward.status,
            nodeCount: forward.nodes.length,
            depth: forward.depth,
            errorCode: forward.errorCode,
            nodes: {
              create: forward.nodes.map((node) => toForwardNodeCreate(node, forwardRecordId)),
            },
          },
        },
      },
      select: { id: true },
    });
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

  private parseEvent(channel: ChatChannel, event: OneBotMessageEvent): ParsedMessageEvent | null {
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
        (externalIdOf(event.user_id) !== channel.accountId ? externalIdOf(event.user_id) : null);
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
      senderRole: kind === 'GROUP' ? (event.sender?.role ?? null) : null,
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
          parsed.kind === 'GROUP' ? groupAvatarUrl(parsed.peerId) : userAvatarUrl(parsed.peerId);
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
        const chunk = members.slice(index, index + MEMBER_SYNC_CHUNK).flatMap((member) => {
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

  /**
   * NapCat's reply segment only carries the target id. Prefer a local record so
   * the snapshot costs no API call; otherwise ask `get_msg` once, and fall back
   * to an UNAVAILABLE snapshot when the target was recalled or is unreachable.
   */
  private async resolveQuote(
    conversationId: string,
    segments: readonly OneBotSegment[],
    client: OneBotRequester,
  ): Promise<ResolvedQuote | null> {
    const replyId = replyExternalIdOf(segments);
    if (!replyId) {
      return null;
    }

    const stored = await this.prisma.chatMessageRecord.findUnique({
      where: {
        conversationId_externalId: { conversationId, externalId: replyId },
      },
      select: {
        id: true,
        senderName: true,
        sentAt: true,
        kind: true,
        text: true,
        sender: { select: { externalId: true, avatarUrl: true } },
        images: { orderBy: { position: 'asc' }, select: { url: true } },
      },
    });

    if (stored) {
      return {
        replyToExternalId: replyId,
        replyToMessageId: stored.id,
        snapshot: {
          messageId: stored.id,
          externalId: replyId,
          authorName: stored.senderName,
          authorId: stored.sender.externalId,
          sentAt: stored.sentAt.toISOString(),
          kind: stored.kind,
          text: stored.text,
          images: stored.images.map((image) => image.url),
          status: 'RESOLVED',
        },
      };
    }

    const fetched = await this.fetchQuotedMessage(client, replyId);

    return {
      replyToExternalId: replyId,
      replyToMessageId: null,
      snapshot: fetched ?? unavailableQuote(replyId),
    };
  }

  private async fetchQuotedMessage(
    client: OneBotRequester,
    messageId: string,
  ): Promise<ChatQuoteSummary | null> {
    try {
      const result = await client.call<{
        time?: number;
        sender?: { user_id?: number | string; nickname?: string; card?: string };
        message?: OneBotSegment[] | string;
      }>('get_msg', { message_id: messageId }, QUOTE_TIMEOUT_MS);
      const segments = normalizeSegments(result?.message ?? []);
      const content = extractContent(segments);
      // The quoted message may only exist on QQ's side; store its images next
      // to ours so pipeline runs keep a stable reference after URLs expire.
      const images = (
        await Promise.all(
          segments
            .filter((segment) => this.media.isMediaSegment(segment))
            .map((segment) => this.media.saveSegment(segment).catch(() => null)),
        )
      )
        .filter((media): media is StoredMedia => media !== null)
        .map((media) => media.url);
      const authorId = externalIdOf(result?.sender?.user_id);
      const authorName =
        result?.sender?.card || result?.sender?.nickname || (authorId ? `QQ ${authorId}` : '');
      const sentAt =
        typeof result?.time === 'number' && Number.isFinite(result.time)
          ? new Date(result.time * 1000).toISOString()
          : null;

      return {
        messageId: null,
        externalId: messageId,
        authorName,
        authorId,
        sentAt,
        kind: content.kind,
        text: content.text,
        images,
        status: 'RESOLVED',
      };
    } catch (error) {
      this.logger.warn(
        `get_msg 获取引用消息失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
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
        quote: quoteContextOf(message.replySnapshot),
        images: [...message.images]
          .sort((left, right) => left.position - right.position)
          .map((image) => image.url),
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

  const forward = toForwardSummary(record.forward);
  const card = forward ?? storedForwardSummary(record.segments);

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
    forward: card,
    quote: quoteFromRecord(record),
    parts: card
      ? [{ type: 'forward', forward: card }]
      : buildParts(record.segments, images, voices, record.text),
    sentAt: record.sentAt.toISOString(),
  };
}

/**
 * Cards received before eager expansion existed kept only the res-id segment.
 * Surface them as pending cards instead of a bare "[嵌套聊天记录]" text bubble;
 * opening one expands and persists it.
 */
function storedForwardSummary(segments: Prisma.JsonValue): ChatForwardSummary | null {
  if (!Array.isArray(segments)) {
    return null;
  }

  const hasForward = segments.some(
    (segment) =>
      Boolean(segment) &&
      typeof segment === 'object' &&
      (segment as { type?: unknown }).type === 'forward',
  );

  return hasForward
    ? { id: '', title: '合并转发', source: 'FETCHED', status: 'PENDING', nodeCount: 0 }
    : null;
}

function toForwardSummary(record: ForwardMeta | null): ChatForwardSummary | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    title: record.title,
    source: record.source === 'FETCHED' ? 'FETCHED' : 'INLINE',
    status:
      record.status === 'FAILED'
        ? 'FAILED'
        : record.status === 'TRUNCATED'
          ? 'TRUNCATED'
          : 'COMPLETE',
    nodeCount: record.nodeCount,
  };
}

const QUOTE_KINDS = new Set<ChatMessageKind>([
  'TEXT',
  'IMAGE',
  'VOICE',
  'FACE',
  'MIXED',
  'SYSTEM',
  'FORWARD',
]);

function replyExternalIdOf(segments: readonly OneBotSegment[]): string | null {
  const reply = segments.find((segment) => segment.type === 'reply');
  const data = reply?.data;

  if (!data || typeof data !== 'object') {
    return null;
  }

  const id = (data as Record<string, unknown>)['id'];
  if (typeof id === 'number') {
    return String(id);
  }

  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : null;
}

function unavailableQuote(externalId: string): ChatQuoteSummary {
  return {
    messageId: null,
    externalId,
    authorName: '',
    authorId: null,
    sentAt: null,
    kind: 'TEXT',
    text: '',
    images: [],
    status: 'UNAVAILABLE',
  };
}

function quoteFromSnapshot(value: Prisma.JsonValue | null): ChatQuoteSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const status = record['status'];

  if (status !== 'RESOLVED' && status !== 'UNAVAILABLE') {
    return null;
  }

  const kind = record['kind'];
  const externalId = record['externalId'];

  return {
    messageId: typeof record['messageId'] === 'string' ? record['messageId'] : null,
    externalId: typeof externalId === 'string' ? externalId : null,
    authorName: typeof record['authorName'] === 'string' ? record['authorName'] : '',
    authorId: typeof record['authorId'] === 'string' ? record['authorId'] : null,
    sentAt: typeof record['sentAt'] === 'string' ? record['sentAt'] : null,
    kind:
      typeof kind === 'string' && QUOTE_KINDS.has(kind as ChatMessageKind)
        ? (kind as ChatMessageKind)
        : 'TEXT',
    text: typeof record['text'] === 'string' ? record['text'] : '',
    images: Array.isArray(record['images'])
      ? record['images'].filter(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
        )
      : [],
    status,
  };
}

/**
 * Snapshot wins; messages stored before quote support only kept the reply
 * segment, so surface those as unavailable instead of dropping the quote.
 */
function quoteFromRecord(record: MessageView): ChatQuoteSummary | null {
  const snapshot = quoteFromSnapshot(record.replySnapshot);

  if (snapshot) {
    return { ...snapshot, messageId: record.replyToMessageId };
  }

  const segments = Array.isArray(record.segments)
    ? (record.segments as unknown as OneBotSegment[])
    : [];
  const externalId = replyExternalIdOf(segments);

  return externalId ? unavailableQuote(externalId) : null;
}

function quoteContextOf(value: Prisma.JsonValue | null): PersistedChatMessage['quote'] {
  const quote = quoteFromSnapshot(value);

  if (!quote || quote.status !== 'RESOLVED') {
    return null;
  }

  if (!quote.authorName && !quote.text && quote.images.length === 0) {
    return null;
  }

  return {
    messageId: quote.messageId,
    externalId: quote.externalId,
    authorName: quote.authorName,
    authorId: quote.authorId,
    text: quote.text,
    kind: quote.kind,
    sentAt: quote.sentAt,
    images: quote.images,
  };
}

function toForwardNodeCreate(
  node: ForwardNodeWrite,
  forwardId: string,
): Prisma.ChatForwardNodeCreateWithoutForwardInput {
  return {
    ...forwardNodeFields(node),
    ...(node.children.length > 0
      ? {
          children: {
            create: node.children.map((child) => toNestedForwardNodeCreate(child, forwardId)),
          },
        }
      : {}),
  };
}

function toNestedForwardNodeCreate(
  node: ForwardNodeWrite,
  forwardId: string,
): Prisma.ChatForwardNodeUncheckedCreateWithoutParentInput {
  return {
    forwardId,
    ...forwardNodeFields(node),
    ...(node.children.length > 0
      ? {
          children: {
            create: node.children.map((child) => toNestedForwardNodeCreate(child, forwardId)),
          },
        }
      : {}),
  };
}

function forwardNodeFields(node: ForwardNodeWrite) {
  return {
    position: node.position,
    depth: node.depth,
    senderExternalId: node.senderExternalId,
    senderName: node.senderName,
    sentAt: node.sentAt,
    kind: node.kind,
    text: node.text,
    segments: node.segments as unknown as Prisma.InputJsonValue,
    images: {
      create: node.images.map((asset) => ({
        mediaId: asset.mediaId,
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
      create: node.voices.map((asset) => ({
        url: asset.url,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
        duration: asset.duration,
        remoteUrl: asset.remoteUrl,
        position: asset.position,
      })),
    },
  };
}

/** Segments whose payload may arrive inline as base64 instead of a URL. */
const INLINE_MEDIA_TYPES = new Set(['image', 'mface', 'marketface', 'record']);

/**
 * The archived segment list must never carry megabytes of base64. Media bytes
 * live in ChatMediaObject and the asset row keeps the position, so the inline
 * payload is dropped once the asset has been stored.
 */
function sanitizeInlineMedia(segments: readonly OneBotSegment[]): OneBotSegment[] {
  return segments.map((segment) => {
    if (!INLINE_MEDIA_TYPES.has(segment.type)) {
      return segment;
    }

    const file = segment.data['file'];
    if (typeof file !== 'string' || !/^(?:base64:\/\/|data:)/i.test(file)) {
      return segment;
    }

    const data = { ...segment.data };
    delete data['file'];
    return { ...segment, data };
  });
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
