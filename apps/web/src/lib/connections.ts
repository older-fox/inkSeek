import { useSyncExternalStore } from 'react';

export type PlatformId = 'qq' | 'wechat' | 'telegram';
export type ChannelAccent = 'brass' | 'jade';
export type ChannelStatus = 'online' | 'offline';
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

export interface Channel {
  id: string;
  platform: PlatformId;
  connector: string;
  displayName: string;
  accountId: string;
  initials: string;
  accent: ChannelAccent;
  signature: string;
  status: ChannelStatus;
  serverUrl: string;
  tokenHint: string;
  connectedAt: string;
}

export interface ChatMessage {
  id: string;
  self: boolean;
  author: string;
  text: string;
  time: string;
  images?: string[];
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  platform: PlatformId;
  name: string;
  handle: string;
  initials: string;
  accent: ChannelAccent;
  members?: number;
  unread: number;
  lastMessage: string;
  lastTime: string;
  messages: ChatMessage[];
}

export interface ConversationSource {
  id: string;
  platform: PlatformId;
  displayName: string;
  accountId: string;
  initials: string;
  accent: ChannelAccent;
}

export interface ConversationSourceSummary extends ConversationSource {
  count: number;
}

export interface SourcedConversation extends Conversation {
  source: ConversationSource;
}

export interface NapCatAccount {
  displayName: string;
  accountId: string;
  initials: string;
  signature: string;
}

export const DEFAULT_NAPCAT_SERVER_URL = 'ws://127.0.0.1:3001';

const NAPCAT_ACCOUNTS = [
  {
    displayName: '沈砚',
    accountId: '3184226907',
    initials: '砚',
    signature: '先把纸修好，再谈旧事。',
  },
  {
    displayName: '江述',
    accountId: '2561180432',
    initials: '述',
    signature: '替人保管旧信，也替人保守秘密。',
  },
  {
    displayName: '闻舟',
    accountId: '1749032566',
    initials: '舟',
    signature: '夜班电台常驻，专收没处说的话。',
  },
] as const;

export interface NapCatConnection {
  serverUrl: string;
  accessToken: string;
}

export const CONVERSATIONS: readonly Conversation[] = [
  {
    id: 'qq-private-zhouxu',
    kind: 'private',
    platform: 'qq',
    name: '周叙',
    handle: 'QQ 4421087331',
    initials: '周',
    accent: 'jade',
    unread: 2,
    lastMessage: '发过去了，别笑我。',
    lastTime: '20:46',
    messages: [
      {
        id: 'm1',
        self: false,
        author: '周叙',
        text: '沈砚，你那儿还能修民国时候的信笺吗？边角全碎了。',
        time: '20:41',
      },
      { id: 'm2', self: true, author: '沈砚', text: '能。别自己拿胶带粘。', time: '20:44' },
      { id: 'm3', self: false, author: '周叙', text: '已经……粘了。', time: '20:44' },
      { id: 'm4', self: true, author: '沈砚', text: '……拍给我看。', time: '20:45' },
      {
        id: 'm5',
        self: false,
        author: '周叙',
        text: '发过去了，别笑我。',
        time: '20:46',
        images: ['/media/letter-mending.jpg'],
      },
    ],
  },
  {
    id: 'qq-private-xiaran',
    kind: 'private',
    platform: 'qq',
    name: '夏然',
    handle: 'QQ 1903358214',
    initials: '夏',
    accent: 'brass',
    unread: 0,
    lastMessage: '明天带给你。',
    lastTime: '18:25',
    messages: [
      {
        id: 'm1',
        self: true,
        author: '沈砚',
        text: '书到了，扉页有前任主人的批注。',
        time: '18:20',
      },
      {
        id: 'm2',
        self: false,
        author: '夏然',
        text: '真的？拍来看看，我最喜欢这种意外的痕迹。',
        time: '18:22',
      },
      { id: 'm3', self: true, author: '沈砚', text: '明天带给你。', time: '18:25' },
    ],
  },
  {
    id: 'qq-private-chenyu',
    kind: 'private',
    platform: 'qq',
    name: '陈屿',
    handle: 'QQ 275513908',
    initials: '陈',
    accent: 'jade',
    unread: 1,
    lastMessage: '那我六点前到，麻烦你了。',
    lastTime: '16:06',
    messages: [
      {
        id: 'm1',
        self: false,
        author: '陈屿',
        text: '店今天开吗？想送一本旧诗集去修。',
        time: '16:02',
      },
      { id: 'm2', self: true, author: '沈砚', text: '开。六点前。', time: '16:05' },
      { id: 'm3', self: false, author: '陈屿', text: '那我六点前到，麻烦你了。', time: '16:06' },
    ],
  },
  {
    id: 'qq-private-alan',
    kind: 'private',
    platform: 'qq',
    name: '阿岚',
    handle: 'QQ 3390017726',
    initials: '岚',
    accent: 'brass',
    unread: 0,
    lastMessage: '很薄，对着灯能看见纤维。',
    lastTime: '14:14',
    messages: [
      {
        id: 'm1',
        self: false,
        author: '阿岚',
        text: '我找到一叠你之前说的那种竹纸。',
        time: '14:11',
      },
      { id: 'm2', self: true, author: '沈砚', text: '薄吗？', time: '14:13' },
      { id: 'm3', self: false, author: '阿岚', text: '很薄，对着灯能看见纤维。', time: '14:14' },
    ],
  },
  {
    id: 'qq-group-oldbooks',
    kind: 'group',
    platform: 'qq',
    name: '旧书与雨',
    handle: '群号 720338914',
    initials: '旧',
    accent: 'brass',
    members: 128,
    unread: 5,
    lastMessage: '笑死，沈老板从不缺席。',
    lastTime: '19:37',
    messages: [
      { id: 'm1', self: false, author: '阿岚', text: '周末有人去城南旧货市场吗？', time: '19:30' },
      { id: 'm2', self: false, author: '老K', text: '我我我，带上放大镜。', time: '19:32' },
      { id: 'm3', self: true, author: '沈砚', text: '帮我留意民国以后的线装。', time: '19:35' },
      { id: 'm4', self: false, author: '阿岚', text: '沈老板开口了，必须留意。', time: '19:36' },
      { id: 'm5', self: false, author: '小满', text: '笑死，沈老板从不缺席。', time: '19:37' },
    ],
  },
  {
    id: 'qq-group-radio',
    kind: 'group',
    platform: 'qq',
    name: '夜班电台听众群',
    handle: '群号 884210773',
    initials: '夜',
    accent: 'jade',
    members: 342,
    unread: 0,
    lastMessage: '那我去听。',
    lastTime: '23:09',
    messages: [
      { id: 'm1', self: false, author: '小满', text: '今晚停云姐会读什么？', time: '23:05' },
      { id: 'm2', self: false, author: '北岛', text: '说是读听众来信。', time: '23:07' },
      { id: 'm3', self: true, author: '沈砚', text: '那我去听。', time: '23:09' },
    ],
  },
  {
    id: 'qq-group-craft',
    kind: 'group',
    platform: 'qq',
    name: '墨色手作交流',
    handle: '群号 615092884',
    initials: '墨',
    accent: 'brass',
    members: 86,
    unread: 2,
    lastMessage: '求教程！',
    lastTime: '11:29',
    messages: [
      { id: 'm1', self: false, author: '鱼丸', text: '有人试过用柿染做书衣吗？', time: '11:20' },
      {
        id: 'm2',
        self: true,
        author: '沈砚',
        text: '颜色会随时间变深，很适合旧书。',
        time: '11:28',
      },
      { id: 'm3', self: false, author: '鱼丸', text: '求教程！', time: '11:29' },
    ],
  },
];

const STORAGE_KEY = 'inkseek-message-channels';
const STORAGE_VERSION = 2;
const EMPTY_CHANNELS: Channel[] = [];

let snapshot: Channel[] | null = null;
const listeners = new Set<() => void>();

function isPlatformId(value: unknown): value is PlatformId {
  return value === 'qq' || value === 'wechat' || value === 'telegram';
}

function isChannel(value: unknown): value is Channel {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === 'string' &&
    isPlatformId(record.platform) &&
    typeof record.connector === 'string' &&
    typeof record.displayName === 'string' &&
    typeof record.accountId === 'string' &&
    typeof record.initials === 'string' &&
    (record.accent === 'brass' || record.accent === 'jade') &&
    typeof record.signature === 'string' &&
    (record.status === 'online' || record.status === 'offline') &&
    typeof record.serverUrl === 'string' &&
    typeof record.tokenHint === 'string' &&
    typeof record.connectedAt === 'string'
  );
}

function readChannels(): Channel[] {
  if (typeof window === 'undefined') {
    return EMPTY_CHANNELS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY_CHANNELS;
    }

    const parsed = JSON.parse(raw) as { version?: unknown; channels?: unknown };
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.channels)) {
      return EMPTY_CHANNELS;
    }

    return parsed.channels.filter(isChannel);
  } catch {
    return EMPTY_CHANNELS;
  }
}

function writeChannels(channels: Channel[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, channels }),
    );
  } catch {
    // Storage may be unavailable in private mode; keep the in-memory snapshot.
  }
}

function getSnapshot(): Channel[] {
  if (snapshot === null) {
    snapshot = readChannels();
  }

  return snapshot;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) {
      return;
    }

    snapshot = readChannels();
    notify();
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
  };
}

export function useChannels(): Channel[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_CHANNELS);
}

export function addChannel(channel: Channel): void {
  snapshot = [...getSnapshot().filter((item) => item.id !== channel.id), channel];
  writeChannels(snapshot);
  notify();
}

export function removeChannel(id: string): void {
  snapshot = getSnapshot().filter((item) => item.id !== id);
  writeChannels(snapshot);
  notify();
}

export function maskAccessToken(token: string): string {
  const trimmed = token.trim();
  return trimmed.length <= 4 ? '••••' : `•••• ${trimmed.slice(-4)}`;
}

export function previewNapCatAccount(): NapCatAccount {
  const qqChannels = getSnapshot().filter((channel) => channel.platform === 'qq').length;
  return NAPCAT_ACCOUNTS[qqChannels % NAPCAT_ACCOUNTS.length] ?? NAPCAT_ACCOUNTS[0];
}

export function createNapCatChannel(
  { serverUrl, accessToken }: NapCatConnection,
  account: NapCatAccount = previewNapCatAccount(),
): Channel {
  return {
    id: `qq-napcat-${createChannelId()}`,
    platform: 'qq',
    connector: QQ.connector,
    ...account,
    accent: QQ.accent,
    status: 'online',
    serverUrl,
    tokenHint: maskAccessToken(accessToken),
    connectedAt: new Date().toISOString(),
  };
}

function createChannelId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function orderedChannels(channels: readonly Channel[]): Channel[] {
  return [...channels].sort(
    (left, right) =>
      left.connectedAt.localeCompare(right.connectedAt) || left.id.localeCompare(right.id),
  );
}

function toConversationSource(channel: Channel): ConversationSource {
  return {
    id: channel.id,
    platform: channel.platform,
    displayName: channel.displayName,
    accountId: channel.accountId,
    initials: channel.initials,
    accent: channel.accent,
  };
}

/**
 * Conversations are mock, platform-level data; newer connected accounts take turns
 * owning them so a multi-account setup still has something to filter through.
 */
export function conversationsFor(
  channels: readonly Channel[],
  kind: ConversationKind,
  sourceId?: string | null,
): readonly SourcedConversation[] {
  if (channels.length === 0) {
    return [];
  }

  const byPlatform = new Map<PlatformId, Channel[]>();
  orderedChannels(channels).forEach((channel) => {
    const pool = byPlatform.get(channel.platform);
    if (pool) {
      pool.push(channel);
    } else {
      byPlatform.set(channel.platform, [channel]);
    }
  });

  const cursors = new Map<PlatformId, number>();
  const result: SourcedConversation[] = [];

  CONVERSATIONS.forEach((conversation) => {
    if (conversation.kind !== kind) {
      return;
    }

    const pool = byPlatform.get(conversation.platform);
    if (!pool || pool.length === 0) {
      return;
    }

    const cursor = cursors.get(conversation.platform) ?? 0;
    cursors.set(conversation.platform, cursor + 1);

    const channel = pool[cursor % pool.length];
    if (!channel || (sourceId && channel.id !== sourceId)) {
      return;
    }

    result.push({ ...conversation, source: toConversationSource(channel) });
  });

  return result;
}

export function conversationSources(
  channels: readonly Channel[],
  kind: ConversationKind,
): readonly ConversationSourceSummary[] {
  const counts = new Map<string, number>();
  conversationsFor(channels, kind).forEach((conversation) => {
    counts.set(conversation.source.id, (counts.get(conversation.source.id) ?? 0) + 1);
  });

  return orderedChannels(channels).flatMap((channel) => {
    const count = counts.get(channel.id) ?? 0;
    return count > 0 ? [{ ...toConversationSource(channel), count }] : [];
  });
}

export function channelConversationStats(platform: PlatformId): {
  private: number;
  groups: number;
  messages: number;
} {
  const owned = CONVERSATIONS.filter((conversation) => conversation.platform === platform);

  return {
    private: owned.filter((conversation) => conversation.kind === 'private').length,
    groups: owned.filter((conversation) => conversation.kind === 'group').length,
    messages: owned.reduce((total, conversation) => total + conversation.messages.length, 0),
  };
}
