import type { ModelProviderProtocol } from './schemas.js';

export type UserRole = 'ADMIN' | 'MEMBER';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

export interface BootstrapStatus {
  initialized: boolean;
}

export interface BootstrapResult {
  user: AuthUser;
}

export interface RedisProbeResult {
  ok: true;
  latencyMs: number;
}

export interface RedisSettings {
  host: string;
  port: number;
  db: number;
  tls: boolean;
  hasPassword: boolean;
  updatedAt: string;
}

export interface ModelProviderSummary {
  id: string;
  name: string;
  protocol: ModelProviderProtocol;
  baseUrl: string;
  keyHint: string;
  modelCount: number;
  models: string[];
  lastTestedAt: string;
  createdAt: string;
}

export interface SettingsOverview {
  redis: RedisSettings | null;
  providers: ModelProviderSummary[];
}

export interface RedisSettingsResult {
  redis: RedisSettings;
  latencyMs: number;
}

export interface ModelProviderSaveResult {
  provider: ModelProviderSummary;
  latencyMs: number;
  modelCount: number;
  models: string[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
}

export interface HealthStatus {
  status: 'ok';
  service: string;
  time: string;
}

export type ChatChannelStatus = 'CONNECTING' | 'ONLINE' | 'OFFLINE' | 'ERROR';
export type ChatConversationKind = 'PRIVATE' | 'GROUP';
export type ChatMessageKind = 'TEXT' | 'IMAGE' | 'VOICE' | 'FACE' | 'MIXED' | 'SYSTEM';

export interface ChatChannelStats {
  private: number;
  groups: number;
  messages: number;
}

export type ChatPersonaValue = string | number | boolean | string[];

/**
 * A deep copy of a Persona Center card, frozen at import time and stored under
 * the channel namespace. Editing the source card never mutates this snapshot.
 */
export interface ChatChannelPersonaSnapshot {
  cardId: string;
  cardSerial: string;
  name: string;
  identity: string;
  quote: string;
  accent: 'brass' | 'jade';
  values: Record<string, ChatPersonaValue>;
}

/**
 * A message channel is the namespace root: every conversation, contact,
 * message and future persona snapshot lives under exactly one channel id.
 */
export interface ChatChannelSummary {
  id: string;
  platform: 'qq';
  connector: string;
  displayName: string;
  accountId: string;
  avatarUrl: string | null;
  serverUrl: string;
  status: ChatChannelStatus;
  lastError: string | null;
  tokenHint: string | null;
  connectedAt: string;
  lastConnectedAt: string | null;
  stats: ChatChannelStats;
  persona: ChatChannelPersonaSnapshot | null;
}

export interface ChatConversationSource {
  id: string;
  platform: 'qq';
  displayName: string;
  accountId: string;
  avatarUrl: string | null;
}

export interface ChatConversationSummary {
  id: string;
  channelId: string;
  kind: ChatConversationKind;
  externalId: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number | null;
  lastMessage: string;
  lastMessageAt: string | null;
  source: ChatConversationSource;
}

export interface ChatMessageImageSummary {
  id: string;
  url: string;
  /** Zero-based index of the source message segment, used to keep render order. */
  position: number;
  width: number | null;
  height: number | null;
}

export interface ChatMessageVoiceSummary {
  id: string;
  url: string;
  /** Zero-based index of the source message segment, used to keep render order. */
  position: number;
  /** Duration in seconds when NapCat provides it; otherwise null. */
  duration: number | null;
  mimeType: string | null;
  byteSize: number | null;
}

export type ChatMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: ChatMessageImageSummary }
  | { type: 'voice'; voice: ChatMessageVoiceSummary };

export interface ChatMessageSummary {
  id: string;
  conversationId: string;
  channelId: string;
  externalId: string | null;
  self: boolean;
  author: string;
  authorId: string;
  authorCard: string | null;
  avatarUrl: string | null;
  text: string;
  kind: ChatMessageKind;
  images: ChatMessageImageSummary[];
  voices: ChatMessageVoiceSummary[];
  /** Ordered text/image/voice segments; pure-media messages contain no text parts. */
  parts: ChatMessagePart[];
  sentAt: string;
}

export interface ChatMessagePage {
  messages: ChatMessageSummary[];
  hasMore: boolean;
}

export interface ChatGroupMemberSummary {
  id: string;
  externalId: string;
  nickname: string;
  card: string | null;
  role: string | null;
  avatarUrl: string | null;
}

export type ChatEventType = 'channel.updated' | 'conversation.updated' | 'message.created';

export interface ChatEvent {
  type: ChatEventType;
  channelId: string;
  conversationId?: string;
  messageId?: string;
}
