import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ChatConversationSummary,
  ChatDirectConversationInput,
  ChatMessageSummary,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type {
  ChatChannel,
  ChatContact,
  ChatConversation,
} from '../generated/prisma/client.js';
import { ChatMessageProcessor } from './chat-message-processor.service.js';
import { ChatMessagesService } from './chat-messages.service.js';

/**
 * A direct line runs the production mind for one channel/contact pair without
 * NapCat. Inbound messages are ordinary records, so runs, memories, relations
 * and tools behave exactly as they do for QQ.
 */
@Injectable()
export class ChatDirectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: ChatMessagesService,
    private readonly processor: ChatMessageProcessor,
  ) {}

  async ensure(input: ChatDirectConversationInput): Promise<ChatConversationSummary> {
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: input.channelId },
      include: { persona: { select: { id: true } } },
    });
    if (!channel) {
      throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: '渠道不存在' });
    }
    if (!channel.persona) {
      throw new BadRequestException({
        code: 'PERSONA_NOT_BOUND',
        message: '这个渠道还没有绑定人格',
      });
    }

    const contact = await this.resolveContact(channel.id, input.privateConversationId);
    const externalId = `direct:${contact.id}`;
    // The page may mount twice (default identity, then the selected one), so
    // opening the same line must be an upsert rather than create-or-insert.
    try {
      const conversation = await this.prisma.chatConversation.upsert({
        where: {
          channelId_kind_externalId: {
            channelId: channel.id,
            kind: 'PRIVATE',
            externalId,
          },
        },
        create: {
          channelId: channel.id,
          kind: 'PRIVATE',
          externalId,
          name: contact.nickname,
          avatarUrl: contact.avatarUrl,
          isDirect: true,
          directContactId: contact.id,
        },
        update: {
          isDirect: true,
          directContactId: contact.id,
          name: contact.nickname,
          avatarUrl: contact.avatarUrl,
        },
      });
      return toSummary(conversation, channel);
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') {
        throw error;
      }
      const existing = await this.prisma.chatConversation.findUniqueOrThrow({
        where: {
          channelId_kind_externalId: {
            channelId: channel.id,
            kind: 'PRIVATE',
            externalId,
          },
        },
      });
      return toSummary(existing, channel);
    }
  }

  async sendIncoming(conversationId: string, text: string): Promise<ChatMessageSummary> {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: { channel: true },
    });
    if (!conversation || !conversation.isDirect) {
      throw new NotFoundException({
        code: 'DIRECT_CONVERSATION_NOT_FOUND',
        message: '直连会话不存在',
      });
    }
    const contact = conversation.directContactId
      ? await this.prisma.chatContact.findUnique({ where: { id: conversation.directContactId } })
      : null;
    if (!contact) {
      throw new BadRequestException({
        code: 'DIRECT_CONTACT_MISSING',
        message: '直连会话缺少说话人身份',
      });
    }

    const summary = await this.messages.appendLocal(conversation.channel, conversation, {
      isSelf: false,
      contact,
      text,
    });

    // Returns immediately; the real mind runs in its normal attention loop and
    // its replies are persisted by the action executor on this same line.
    void this.processor.process({
      messageId: summary.id,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      conversationKind: 'PRIVATE',
      conversationExternalId: conversation.externalId,
      externalId: null,
      isSelf: false,
      senderId: contact.externalId,
      senderName: contact.nickname,
      text: summary.text,
      kind: summary.kind,
      quote: null,
      images: [],
      imageCount: 0,
      voices: [],
      voiceCount: 0,
      sentAt: new Date(summary.sentAt),
    });

    return summary;
  }

  /**
   * Choose who speaks on the direct line. Reusing a QQ private conversation's
   * contact keeps the same relationship and memories; omitting the identity
   * uses the channel's own "主人" contact.
   */
  private async resolveContact(
    channelId: string,
    privateConversationId?: string,
  ): Promise<ChatContact> {
    if (privateConversationId) {
      const conversation = await this.prisma.chatConversation.findFirst({
        where: { id: privateConversationId, channelId, kind: 'PRIVATE', isDirect: false },
      });
      if (!conversation) {
        throw new NotFoundException({
          code: 'PRIVATE_CONVERSATION_NOT_FOUND',
          message: '用作身份的私聊会话不存在',
        });
      }
      const inbound = await this.prisma.chatMessageRecord.findFirst({
        where: { conversationId: conversation.id, isSelf: false },
        orderBy: { sentAt: 'desc' },
        include: { sender: true },
      });
      if (inbound) {
        return inbound.sender;
      }
      const contact = await this.prisma.chatContact.findUnique({
        where: {
          channelId_externalId: { channelId, externalId: conversation.externalId },
        },
      });
      if (contact) {
        return contact;
      }
      throw new BadRequestException({
        code: 'PRIVATE_IDENTITY_MISSING',
        message: '这段私聊还没有可用的对方身份',
      });
    }

    return this.prisma.chatContact.upsert({
      where: { channelId_externalId: { channelId, externalId: 'direct-owner' } },
      create: {
        channelId,
        externalId: 'direct-owner',
        nickname: '主人',
        isSelf: false,
        lastSeenAt: new Date(),
      },
      update: {},
    });
  }
}

function toSummary(
  conversation: ChatConversation,
  channel: ChatChannel,
): ChatConversationSummary {
  return {
    id: conversation.id,
    channelId: conversation.channelId,
    kind: conversation.kind,
    isDirect: conversation.isDirect,
    externalId: conversation.externalId,
    name: conversation.name,
    avatarUrl: conversation.avatarUrl,
    memberCount: conversation.memberCount,
    lastMessage: conversation.lastMessagePreview ?? '',
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    source: {
      id: channel.id,
      platform: 'qq',
      displayName: channel.displayName,
      accountId: channel.accountId,
      avatarUrl: channel.avatarUrl,
    },
  };
}
