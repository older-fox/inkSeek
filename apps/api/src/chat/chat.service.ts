import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  ChatChannelConnectInput,
  ChatChannelPersonaSnapshot,
  ChatChannelStats,
  ChatChannelSummary,
  ChatConversationKind,
  ChatConversationSummary,
  ChatMessagePage,
  ChatMessageSummary,
  ChatPersonaValue,
  ChatSendMessageInput,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type {
  ChatChannel,
  ChatChannelPersona,
  Prisma,
} from '../generated/prisma/client.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatMessagesService, toMessageSummary } from './chat-messages.service.js';
import { ChatRuntimeService } from './chat-runtime.service.js';
import { NapCatClient } from './napcat-client.js';
import { externalIdOf, userAvatarUrl } from './onebot.js';

interface LoginInfo {
  user_id?: number | string;
  nickname?: string;
}

const EMPTY_STATS: ChatChannelStats = { private: 0, groups: 0, messages: 0 };
const DEFAULT_MESSAGE_LIMIT = 50;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: ChatRuntimeService,
    private readonly messages: ChatMessagesService,
    private readonly events: ChatEventsService,
  ) {}

  async listChannels(): Promise<ChatChannelSummary[]> {
    const [records, conversationCounts, messageCounts] = await Promise.all([
      this.prisma.chatChannel.findMany({
        include: { persona: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.chatConversation.groupBy({
        by: ['channelId', 'kind'],
        _count: { _all: true },
      }),
      this.prisma.chatMessageRecord.groupBy({
        by: ['channelId'],
        _count: { _all: true },
      }),
    ]);

    const stats = new Map<string, ChatChannelStats>();
    conversationCounts.forEach((entry) => {
      const current = stats.get(entry.channelId) ?? { ...EMPTY_STATS };
      if (entry.kind === 'PRIVATE') {
        current.private = entry._count._all;
      } else {
        current.groups = entry._count._all;
      }
      stats.set(entry.channelId, current);
    });
    messageCounts.forEach((entry) => {
      const current = stats.get(entry.channelId) ?? { ...EMPTY_STATS };
      current.messages = entry._count._all;
      stats.set(entry.channelId, current);
    });

    return records.map((record) => toChannelSummary(record, stats.get(record.id) ?? EMPTY_STATS));
  }

  async connect(input: ChatChannelConnectInput): Promise<ChatChannelSummary> {
    const client = new NapCatClient(input.serverUrl, input.accessToken, 'NapCat 探测连接');

    try {
      await client.open(12_000);
    } catch (error) {
      client.close();
      throw new BadGatewayException({
        code: 'NAPCAT_UNREACHABLE',
        message: `无法连接 NapCat：${error instanceof Error ? error.message : String(error)}`,
      });
    }

    let login: LoginInfo;

    try {
      login = await client.call<LoginInfo>('get_login_info', {}, 8_000);
    } catch (error) {
      client.close();
      throw new BadGatewayException({
        code: 'NAPCAT_LOGIN_UNREADABLE',
        message: `NapCat 已连接，但读取登录账号失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }

    const accountId = externalIdOf(login.user_id);

    if (!accountId) {
      client.close();
      throw new BadGatewayException({
        code: 'NAPCAT_LOGIN_UNREADABLE',
        message: 'NapCat 未返回有效的登录 QQ 号',
      });
    }

    const existing = await this.prisma.chatChannel.findUnique({
      where: { platform_accountId: { platform: 'qq', accountId } },
      select: { id: true },
    });

    if (existing) {
      client.close();
      throw new ConflictException({
        code: 'CHANNEL_EXISTS',
        message: `QQ ${accountId} 已经接入，请勿重复添加`,
      });
    }

    const displayName = login.nickname?.trim() || `QQ ${accountId}`;

    let channel: ChatChannel;

    try {
      channel = await this.prisma.chatChannel.create({
        data: {
          platform: 'qq',
          connector: 'NapCat',
          displayName,
          accountId,
          avatarUrl: userAvatarUrl(accountId),
          serverUrl: input.serverUrl,
          accessToken: input.accessToken,
          status: 'ONLINE',
          lastConnectedAt: new Date(),
          persona: {
            create: {
              cardId: input.persona.cardId,
              cardSerial: input.persona.cardSerial,
              name: input.persona.name,
              identity: input.persona.identity,
              quote: input.persona.quote,
              accent: input.persona.accent,
              values: input.persona.values as Prisma.InputJsonValue,
            },
          },
        },
        include: { persona: true },
      });
    } catch (error) {
      client.close();

      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException({
          code: 'CHANNEL_EXISTS',
          message: `QQ ${accountId} 已经接入，请勿重复添加`,
        });
      }

      throw error;
    }

    await this.runtime.adopt(channel, client);
    this.events.emit({ type: 'channel.updated', channelId: channel.id });

    return this.getChannelSummary(channel.id);
  }

  async deleteChannel(id: string): Promise<void> {
    const existing = await this.prisma.chatChannel.findUnique({ where: { id }, select: { id: true } });

    if (!existing) {
      throw new NotFoundException({
        code: 'CHANNEL_NOT_FOUND',
        message: '渠道不存在或已被删除',
      });
    }

    this.runtime.stop(id);

    try {
      await this.prisma.chatChannel.delete({ where: { id } });
    } catch (error) {
      if (hasPrismaCode(error, 'P2025')) {
        throw new NotFoundException({
          code: 'CHANNEL_NOT_FOUND',
          message: '渠道不存在或已被删除',
        });
      }
      throw error;
    }

    this.logger.log(`已移除渠道 ${id} 及其命名空间数据`);
  }

  async listConversations(kind: ChatConversationKind): Promise<ChatConversationSummary[]> {
    const records = await this.prisma.chatConversation.findMany({
      where: { kind },
      include: {
        channel: {
          select: {
            id: true,
            platform: true,
            displayName: true,
            accountId: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });

    return records.map((record) => ({
      id: record.id,
      channelId: record.channelId,
      kind: record.kind,
      externalId: record.externalId,
      name: record.name,
      avatarUrl: record.avatarUrl,
      memberCount: record.memberCount,
      lastMessage: record.lastMessagePreview ?? '',
      lastMessageAt: record.lastMessageAt?.toISOString() ?? null,
      source: {
        id: record.channel.id,
        platform: 'qq',
        displayName: record.channel.displayName,
        accountId: record.channel.accountId,
        avatarUrl: record.channel.avatarUrl,
      },
    }));
  }

  async getMessages(
    conversationId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<ChatMessagePage> {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: '会话不存在或已被删除',
      });
    }

    const limit = options.limit ?? DEFAULT_MESSAGE_LIMIT;

    const records = await this.prisma.chatMessageRecord.findMany({
      where: { conversationId },
      include: {
        images: { orderBy: { position: 'asc' } },
        voices: { orderBy: { position: 'asc' } },
        sender: { select: { externalId: true, avatarUrl: true } },
      },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = records.length > limit;
    const page = records.slice(0, limit).reverse();

    return {
      messages: page.map(toMessageSummary),
      hasMore,
    };
  }

  async sendMessage(
    conversationId: string,
    input: ChatSendMessageInput,
  ): Promise<ChatMessageSummary> {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: { channel: true },
    });

    if (!conversation) {
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: '会话不存在或已被删除',
      });
    }

    if (conversation.channel.status !== 'ONLINE') {
      throw new ServiceUnavailableException({
        code: 'CHANNEL_OFFLINE',
        message: '当前渠道不在线，消息未发送',
      });
    }

    const client = this.runtime.getClient(conversation.channelId);

    if (!client) {
      throw new ServiceUnavailableException({
        code: 'CHANNEL_OFFLINE',
        message: 'NapCat 连接尚未就绪，消息未发送',
      });
    }

    try {
      return await this.messages.send(conversation.channel, conversation, client, {
        text: input.text,
        images: input.images,
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new BadGatewayException({
        code: 'SEND_MESSAGE_FAILED',
        message: `发送失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async getChannelSummary(id: string): Promise<ChatChannelSummary> {
    const record = await this.prisma.chatChannel.findUnique({
      where: { id },
      include: { persona: true },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'CHANNEL_NOT_FOUND',
        message: '渠道不存在或已被删除',
      });
    }

    const [privateCount, groupCount, messageCount] = await Promise.all([
      this.prisma.chatConversation.count({ where: { channelId: id, kind: 'PRIVATE' } }),
      this.prisma.chatConversation.count({ where: { channelId: id, kind: 'GROUP' } }),
      this.prisma.chatMessageRecord.count({ where: { channelId: id } }),
    ]);

    return toChannelSummary(record, {
      private: privateCount,
      groups: groupCount,
      messages: messageCount,
    });
  }
}

type ChannelWithPersona = ChatChannel & { persona?: ChatChannelPersona | null };

function toChannelSummary(record: ChannelWithPersona, stats: ChatChannelStats): ChatChannelSummary {
  return {
    id: record.id,
    platform: 'qq',
    connector: record.connector,
    displayName: record.displayName,
    accountId: record.accountId,
    avatarUrl: record.avatarUrl,
    serverUrl: record.serverUrl,
    status: record.status,
    lastError: record.lastError,
    tokenHint: maskAccessToken(record.accessToken),
    connectedAt: record.createdAt.toISOString(),
    lastConnectedAt: record.lastConnectedAt?.toISOString() ?? null,
    stats,
    persona: record.persona ? toPersonaSnapshot(record.persona) : null,
  };
}

function toPersonaSnapshot(record: ChatChannelPersona): ChatChannelPersonaSnapshot {
  return {
    cardId: record.cardId,
    cardSerial: record.cardSerial,
    name: record.name,
    identity: record.identity,
    quote: record.quote,
    accent: record.accent === 'jade' ? 'jade' : 'brass',
    values: (record.values ?? {}) as Record<string, ChatPersonaValue>,
  };
}

function maskAccessToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length <= 4 ? '••••' : `•••• ${trimmed.slice(-4)}`;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
