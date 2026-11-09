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
  ChatForwardDetail,
  ChatMessagePage,
  ChatMessageSummary,
  ChatPersonaHistoryEntry,
  ChatPersonaValue,
  ChatSendMessageInput,
  SaveChannelPersonaInput,
} from '@inkseek/shared';
import { buildChannelPersonaSnapshot } from '@inkseek/shared';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../database/prisma.service.js';
import type {
  ChatChannel,
  ChatChannelPersona,
  PersonaState,
  Prisma,
} from '../generated/prisma/client.js';
import { PersonasService } from '../personas/personas.service.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatForwardService, toForwardDetail } from './chat-forward.service.js';
import { ChatMessagesService, toMessageSummary } from './chat-messages.service.js';
import { CHAT_CHANNEL_ROOT, isChannelId } from './chat-paths.js';
import { ChatRuntimeService } from './chat-runtime.service.js';
import { findForwardSegment } from './message-content.js';
import { NapCatClient } from './napcat-client.js';
import { externalIdOf, userAvatarUrl, type OneBotSegment } from './onebot.js';

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
    private readonly forwards: ChatForwardService,
    private readonly events: ChatEventsService,
    private readonly personas: PersonasService,
  ) {}

  /** Channel cards with conversation and message counts aggregated in one round trip. */
  async listChannels(): Promise<ChatChannelSummary[]> {
    const [records, conversationCounts, messageCounts] = await Promise.all([
      this.prisma.chatChannel.findMany({
        include: { persona: { include: { state: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.chatConversation.groupBy({
        by: ['channelId', 'kind', 'isDirect'],
        _count: { _all: true },
      }),
      this.prisma.chatMessageRecord.groupBy({
        by: ['channelId'],
        _count: { _all: true },
      }),
    ]);

    const stats = new Map<string, ChatChannelStats>();
    conversationCounts.forEach((entry) => {
      if (entry.isDirect) {
        return;
      }
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

  /** Probes NapCat, rejects duplicate accounts, then creates the channel and adopts the client. */
  async connect(input: ChatChannelConnectInput): Promise<ChatChannelSummary> {
    const persona = buildChannelPersonaSnapshot(
      await this.personas.latestForSnapshot(input.personaId),
    );
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
              cardId: persona.cardId,
              cardSerial: persona.cardSerial,
              name: persona.name,
              identity: persona.identity,
              quote: persona.quote,
              accent: persona.accent,
              values: persona.values as Prisma.InputJsonValue,
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

  /** Stops the runtime, deletes the row (cascading) and removes the channel media directory. */
  async deleteChannel(id: string): Promise<void> {
    const existing = await this.prisma.chatChannel.findUnique({
      where: { id },
      select: { id: true },
    });

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

    // The DB cascade owns metadata; media bytes live under the channel dir and
    // would otherwise stay publicly served after the channel is gone.
    if (isChannelId(id)) {
      await rm(join(CHAT_CHANNEL_ROOT, id), { recursive: true, force: true }).catch(
        (error: unknown) => {
          this.logger.warn(
            `渠道 ${id} 的媒体目录清理失败：${error instanceof Error ? error.message : String(error)}`,
          );
        },
      );
    }

    this.logger.log(`已移除渠道 ${id} 及其命名空间数据`);
  }

  /**
   * Channel persona is the single owner of the persona's own attributes. The
   * scene editors only project into it; nothing is stored per conversation.
   */
  async updatePersonaValues(
    channelId: string,
    input: SaveChannelPersonaInput,
  ): Promise<ChatChannelSummary> {
    const existing = await this.prisma.chatChannelPersona.findUnique({ where: { channelId } });
    if (!existing) {
      throw new NotFoundException({
        code: 'PERSONA_NOT_FOUND',
        message: '这个渠道还没有绑定人格',
      });
    }
    const values = sanitizePersonaValues(input.values);
    const history = input.history.slice(0, 200) as unknown as Prisma.InputJsonValue;
    const name = readPersonaText(values['name']) || existing.name;
    const identity = readPersonaText(values['identity']) || existing.identity;
    const quote =
      readPersonaText(values['anchor_quote']) || readPersonaText(values['quote']) || existing.quote;
    await this.prisma.chatChannelPersona.update({
      where: { channelId },
      data: {
        values: values as Prisma.InputJsonValue,
        history,
        name,
        identity,
        quote,
      },
    });
    this.events.emit({ type: 'channel.updated', channelId });
    return this.getChannelSummary(channelId);
  }

  /** Direct sessions are hidden from PRIVATE listings; they are web-only test lines. */
  async listConversations(kind: ChatConversationKind): Promise<ChatConversationSummary[]> {
    const records = await this.prisma.chatConversation.findMany({
      where: { kind, ...(kind === 'PRIVATE' ? { isDirect: false } : {}) },
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
      isDirect: record.isDirect,
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

  /** Newest-first page, returned oldest-first; one extra row is read to compute hasMore. */
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
        forward: {
          select: { id: true, title: true, source: true, status: true, nodeCount: true },
        },
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

  /** Returns the stored expansion, or lazily expands and persists it while the channel is online. */
  async getForwardDetail(messageId: string): Promise<ChatForwardDetail> {
    const record = await this.loadForward(messageId);

    if (!record) {
      throw new NotFoundException({
        code: 'MESSAGE_NOT_FOUND',
        message: '消息不存在或已被删除',
      });
    }

    if (record.forward) {
      return toForwardDetail(record.forward);
    }

    const segment = findForwardSegment(
      Array.isArray(record.segments) ? (record.segments as unknown as OneBotSegment[]) : [],
    );

    if (!segment) {
      throw new NotFoundException({
        code: 'FORWARD_NOT_FOUND',
        message: '该消息不是合并转发',
      });
    }

    const client = this.runtime.getClient(record.channelId);

    if (!client) {
      throw new ServiceUnavailableException({
        code: 'CHANNEL_OFFLINE',
        message: '渠道不在线，暂时无法展开合并转发',
      });
    }

    const forward = await this.forwards.expand(client, segment, record.channelId);

    if (forward.nodes.length === 0) {
      return {
        id: '',
        messageId,
        title: forward.title,
        source: forward.source,
        status: forward.status,
        nodeCount: 0,
        nodes: [],
      };
    }

    await this.messages.attachForward(messageId, forward);
    const repaired = await this.loadForward(messageId);

    if (!repaired?.forward) {
      throw new ServiceUnavailableException({
        code: 'FORWARD_EXPAND_FAILED',
        message: '合并转发已读取，但内容写入失败，请稍后重试',
      });
    }

    return toForwardDetail(repaired.forward);
  }

  /** Loads a message with its stored forward tree; null when the message no longer exists. */
  private loadForward(messageId: string) {
    return this.prisma.chatMessageRecord.findUnique({
      where: { id: messageId },
      select: {
        channelId: true,
        segments: true,
        forward: {
          include: {
            nodes: {
              orderBy: [{ depth: 'asc' }, { position: 'asc' }],
              include: {
                images: { orderBy: { position: 'asc' } },
                voices: { orderBy: { position: 'asc' } },
              },
            },
          },
        },
      },
    });
  }

  /** Direct lines store locally; QQ lines need an online client or the send is rejected. */
  async sendMessage(
    conversationId: string,
    input: ChatSendMessageInput & { imageDescriptions?: string[] },
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

    if (conversation.isDirect) {
      return this.messages.appendLocal(conversation.channel, conversation, {
        isSelf: true,
        text: input.text,
        images: input.images,
        imageDescriptions: input.imageDescriptions,
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
        imageDescriptions: input.imageDescriptions,
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

  /** Re-reads one channel with fresh per-kind counts, for post-mutation responses. */
  private async getChannelSummary(id: string): Promise<ChatChannelSummary> {
    const record = await this.prisma.chatChannel.findUnique({
      where: { id },
      include: { persona: { include: { state: true } } },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'CHANNEL_NOT_FOUND',
        message: '渠道不存在或已被删除',
      });
    }

    const [privateCount, groupCount, messageCount] = await Promise.all([
      this.prisma.chatConversation.count({
        where: { channelId: id, kind: 'PRIVATE', isDirect: false },
      }),
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

type ChannelWithPersona = ChatChannel & {
  persona?: (ChatChannelPersona & { state?: PersonaState | null }) | null;
};

/** Masks the access token so the UI can hint at it without shipping the secret. */
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

/** Exposes the editable persona fields plus a compact projection of live state. */
function toPersonaSnapshot(
  record: ChatChannelPersona & { state?: PersonaState | null },
): ChatChannelPersonaSnapshot {
  return {
    id: record.id,
    cardId: record.cardId,
    cardSerial: record.cardSerial,
    name: record.name,
    identity: record.identity,
    quote: record.quote,
    accent: record.accent === 'jade' ? 'jade' : 'brass',
    values: (record.values ?? {}) as Record<string, ChatPersonaValue>,
    meta: {
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      history: readPersonaHistory(record.history),
    },
    state: record.state
      ? {
          moodValence: record.state.moodValence,
          moodArousal: record.state.moodArousal,
          moodDominance: record.state.moodDominance,
          energy: record.state.energy,
          health: record.state.health,
          stress: record.state.stress,
          socialBattery: record.state.socialBattery,
          attention: record.state.attention,
          currentActivity: record.state.currentActivity,
          location: record.state.location,
          sleepDebt: record.state.sleepDebt,
          grooming: record.state.grooming,
          nextWakeAt: record.state.nextWakeAt?.toISOString() ?? null,
          updatedAt: record.state.updatedAt.toISOString(),
        }
      : null,
  };
}

/** Drops non-scalar values so a malformed client payload cannot poison the JSON column. */
function sanitizePersonaValues(
  values: Record<string, ChatPersonaValue>,
): Record<string, ChatPersonaValue> {
  const result: Record<string, ChatPersonaValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      result[key] = value;
    }
  }
  return result;
}

/** Trimmed string values only; name/identity columns fall back to their stored text. */
function readPersonaText(value: ChatPersonaValue | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Keeps only fully formed history entries; older or corrupt rows are ignored. */
function readPersonaHistory(value: Prisma.JsonValue | null): ChatPersonaHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: ChatPersonaHistoryEntry[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record['id'] === 'string' &&
      typeof record['time'] === 'string' &&
      typeof record['field'] === 'string' &&
      typeof record['from'] === 'string' &&
      typeof record['to'] === 'string' &&
      typeof record['reason'] === 'string'
    ) {
      entries.push(record as unknown as ChatPersonaHistoryEntry);
    }
  }
  return entries;
}

/** Shows only the last four characters; short tokens reveal nothing at all. */
function maskAccessToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length <= 4 ? '••••' : `•••• ${trimmed.slice(-4)}`;
}

/** Narrows errors to Prisma's known code strings without importing its error classes. */
function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
