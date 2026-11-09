import { useQuery } from '@tanstack/react-query';
import type {
  ChatChannelPersonaSnapshot,
  ChatChannelStats,
  ChatChannelStatus,
  ChatChannelSummary,
  ChatConversationSummary,
  ChatForwardSummary,
  ChatMessageImageSummary,
  ChatMessagePart,
  ChatMessageSummary,
  ChatMessageVoiceSummary,
  ChatQuoteSummary,
} from '@inkseek/shared';
import { useMemo } from 'react';
import { chatChannelsQuery } from './queries';

export type PlatformId = 'qq' | 'wechat' | 'telegram';
export type ChannelAccent = 'brass' | 'jade';
export type ChannelStatus = 'online' | 'offline' | 'connecting' | 'error';
export type ConversationKind = 'private' | 'group';

export interface PlatformDefinition {
  id: PlatformId;
  name: string;
  short: string;
  connector: string;
  accent: ChannelAccent;
  available: boolean;
  description: string;
}

const QQ: PlatformDefinition = {
  id: 'qq',
  name: 'QQ',
  short: 'QQ',
  connector: 'NapCat',
  accent: 'brass',
  available: true,
  description: '通过 NapCat 接入，自动同步登录账号、全部私聊与群聊。',
};

const WECHAT: PlatformDefinition = {
  id: 'wechat',
  name: '微信',
  short: '微',
  connector: 'WeChat Bridge',
  accent: 'jade',
  available: false,
  description: '个人号与企微桥接适配中，暂未开放。',
};

const TELEGRAM: PlatformDefinition = {
  id: 'telegram',
  name: 'Telegram',
  short: 'TG',
  connector: 'Bot API',
  accent: 'jade',
  available: false,
  description: '基于 Bot API 的群组与私聊接入，暂未开放。',
};

export const PLATFORMS = {
  qq: QQ,
  wechat: WECHAT,
  telegram: TELEGRAM,
} satisfies Record<PlatformId, PlatformDefinition>;

export const PLATFORM_LIST: readonly PlatformDefinition[] = [QQ, WECHAT, TELEGRAM];

export const DEFAULT_NAPCAT_SERVER_URL = 'ws://127.0.0.1:3001';

/** 一个渠道命名空间，其后所有会话与消息都挂在它的 id 下。 */
export interface Channel {
  id: string;
  platform: PlatformId;
  connector: string;
  displayName: string;
  accountId: string;
  avatarUrl: string | null;
  initials: string;
  accent: ChannelAccent;
  status: ChannelStatus;
  serverUrl: string;
  tokenHint: string | null;
  lastError: string | null;
  connectedAt: string;
  lastConnectedAt: string | null;
  stats: ChatChannelStats;
  persona: ChatChannelPersonaSnapshot | null;
}

export interface ChatMessage {
  id: string;
  self: boolean;
  author: string;
  authorId: string;
  authorCard: string | null;
  avatarUrl: string | null;
  text: string;
  time: string;
  kind: string;
  images: ChatMessageImageSummary[];
  voices: ChatMessageVoiceSummary[];
  forward: ChatForwardSummary | null;
  quote: ChatQuoteSummary | null;
  parts: ChatMessagePart[];
}

export interface ConversationSource {
  id: string;
  platform: PlatformId;
  displayName: string;
  accountId: string;
  avatarUrl: string | null;
  initials: string;
  accent: ChannelAccent;
}

export interface ConversationSourceSummary extends ConversationSource {
  count: number;
}

export interface SourcedConversation {
  id: string;
  kind: ConversationKind;
  platform: PlatformId;
  name: string;
  handle: string;
  externalId: string;
  initials: string;
  accent: ChannelAccent;
  avatarUrl: string | null;
  members?: number;
  lastMessage: string;
  lastTime: string;
  lastMessageAt: string | null;
  source: ConversationSource;
}

// 旧版纯前端演示会把渠道、会话与人格覆盖写进 localStorage，真实接入后不再读取它们。
const LEGACY_MOCK_STORAGE_KEY = 'inkseek-message-channels';
const LEGACY_PERSONA_STORAGE_KEYS = [
  'inkseek-group-persona-values',
  'inkseek-group-persona-meta',
  'inkseek-private-persona-values',
  'inkseek-private-persona-meta',
];

/** Clears localStorage keys written by the pre-API demo so stale data cannot resurface. */
function purgeLegacyMockData(): void {
  try {
    window.localStorage.removeItem(LEGACY_MOCK_STORAGE_KEY);
    // Conversation persona values now live in PersonaRelationship /
    // PersonaGroupStance; these keys are no longer a data source.
    LEGACY_PERSONA_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // localStorage 可能不可用，忽略即可。
  }
}

if (typeof window !== 'undefined') {
  purgeLegacyMockData();
}

const CHANNEL_STATUS: Record<ChatChannelStatus, ChannelStatus> = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  CONNECTING: 'connecting',
  ERROR: 'error',
};

/** First character of a display name, used for avatar fallbacks. */
function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Q';
  }
  return Array.from(trimmed)[0] ?? 'Q';
}

/** Short list timestamp: time of day for today, otherwise month/day. */
function formatConversationTime(value: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** Full message timestamp, adding the date once a message is not from today. */
export function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return time;
  }

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

/** Maps an API channel summary onto the view model used by the connections screen. */
export function toChannel(summary: ChatChannelSummary): Channel {
  const definition = PLATFORMS[summary.platform];

  return {
    id: summary.id,
    platform: summary.platform,
    connector: summary.connector,
    displayName: summary.displayName,
    accountId: summary.accountId,
    avatarUrl: summary.avatarUrl,
    initials: initialsOf(summary.displayName || summary.accountId),
    accent: definition.accent,
    status: CHANNEL_STATUS[summary.status],
    serverUrl: summary.serverUrl,
    tokenHint: summary.tokenHint,
    lastError: summary.lastError,
    connectedAt: summary.connectedAt,
    lastConnectedAt: summary.lastConnectedAt,
    stats: summary.stats,
    persona: summary.persona,
  };
}

/** Maps an API conversation summary onto the chat list item view model. */
export function toSourcedConversation(summary: ChatConversationSummary): SourcedConversation {
  const kind: ConversationKind = summary.kind === 'GROUP' ? 'group' : 'private';
  const definition = PLATFORMS[summary.source.platform];

  return {
    id: summary.id,
    kind,
    platform: summary.source.platform,
    name: summary.name,
    handle: kind === 'group' ? `群号 ${summary.externalId}` : `QQ ${summary.externalId}`,
    externalId: summary.externalId,
    initials: initialsOf(summary.name),
    accent: definition.accent,
    avatarUrl: summary.avatarUrl,
    members: summary.memberCount ?? undefined,
    lastMessage: summary.lastMessage,
    lastTime: formatConversationTime(summary.lastMessageAt),
    lastMessageAt: summary.lastMessageAt,
    source: {
      id: summary.channelId,
      platform: summary.source.platform,
      displayName: summary.source.displayName,
      accountId: summary.source.accountId,
      avatarUrl: summary.source.avatarUrl,
      initials: initialsOf(summary.source.displayName || summary.source.accountId),
      accent: definition.accent,
    },
  };
}

/** Maps an API message summary onto the render model, formatting its timestamp. */
export function toChatMessage(summary: ChatMessageSummary): ChatMessage {
  return {
    id: summary.id,
    self: summary.self,
    author: summary.author,
    authorId: summary.authorId,
    authorCard: summary.authorCard,
    avatarUrl: summary.avatarUrl,
    text: summary.text,
    time: formatMessageTime(summary.sentAt),
    kind: summary.kind,
    images: summary.images,
    voices: summary.voices,
    forward: summary.forward,
    quote: summary.quote,
    parts: summary.parts,
  };
}

/** Groups conversations by their channel so the sidebar can show per-channel filters. */
export function conversationSources(
  conversations: readonly SourcedConversation[],
): ConversationSourceSummary[] {
  const counts = new Map<string, { source: ConversationSource; count: number }>();

  conversations.forEach((conversation) => {
    const current = counts.get(conversation.source.id);
    if (current) {
      current.count += 1;
    } else {
      counts.set(conversation.source.id, { source: conversation.source, count: 1 });
    }
  });

  return Array.from(counts.values())
    .sort((left, right) => left.source.displayName.localeCompare(right.source.displayName))
    .map(({ source, count }) => ({ ...source, count }));
}

/** Loads connected channels with a pending flag for the connections screen skeletons. */
export function useChannelsState(): { channels: Channel[]; isLoading: boolean } {
  const { data, isPending } = useQuery(chatChannelsQuery);
  const channels = useMemo(() => (data ?? []).map(toChannel), [data]);

  return { channels, isLoading: isPending };
}

/** Convenience hook returning only the channel list. */
export function useChannels(): Channel[] {
  return useChannelsState().channels;
}
