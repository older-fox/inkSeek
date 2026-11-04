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
export type ChatMessageKind = 'TEXT' | 'IMAGE' | 'VOICE' | 'FACE' | 'MIXED' | 'SYSTEM' | 'FORWARD';

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
/**
 * Read-time projection of the single PersonaState row. Never stored on the
 * channel persona; this only lets channel-level UI show the live values.
 */
export interface ChatChannelPersonaStateSnapshot {
  moodValence: number;
  moodArousal: number;
  moodDominance: number;
  energy: number;
  health: number;
  stress: number;
  socialBattery: number;
  attention: number;
  currentActivity: string;
  location: string;
  sleepDebt: number;
  grooming: number;
  nextWakeAt: string | null;
  updatedAt: string;
}

export interface ChatChannelPersonaSnapshot {
  /** Persona instance id; the single identity used by mind/relationship APIs. */
  id: string;
  cardId: string;
  cardSerial: string;
  name: string;
  identity: string;
  quote: string;
  accent: 'brass' | 'jade';
  values: Record<string, ChatPersonaValue>;
  meta: ChatPersonaMetadata;
  state?: ChatChannelPersonaStateSnapshot | null;
}

/** Snapshot built from a card before it is attached to a channel. */
export type ChatChannelPersonaDraft = Omit<ChatChannelPersonaSnapshot, 'id' | 'meta' | 'state'>;

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
  /** NapCat speech-to-text transcript; null when the audio is silent or untranscribed. */
  description: string | null;
  mimeType: string | null;
  byteSize: number | null;
}

export type ChatForwardSource = 'INLINE' | 'FETCHED';
/**
 * PENDING is derived at read time for cards stored before forward expansion
 * existed; opening the card expands and persists them. It is never saved.
 */
export type ChatForwardStatus = 'PENDING' | 'COMPLETE' | 'TRUNCATED' | 'FAILED';

/** Card-level metadata for a merged-forward message. */
export interface ChatForwardSummary {
  id: string;
  title: string;
  source: ChatForwardSource;
  status: ChatForwardStatus;
  nodeCount: number;
}

export type ChatMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: ChatMessageImageSummary }
  | { type: 'voice'; voice: ChatMessageVoiceSummary }
  | { type: 'forward'; forward: ChatForwardSummary };

/**
 * Display snapshot of the message quoted by a reply segment. NapCat only sends
 * the target id, so the snapshot is resolved at ingest and must stand alone:
 * the original may be deleted, outside retained history, or unreachable.
 */
export interface ChatQuoteSummary {
  /** Local message id when the quoted message is stored; enables jump-to-original. */
  messageId: string | null;
  /** OneBot message_id from the reply segment. */
  externalId: string | null;
  authorName: string;
  authorId: string | null;
  sentAt: string | null;
  kind: ChatMessageKind;
  text: string;
  /** Stored media references of the quoted message, in order. */
  images: string[];
  status: 'RESOLVED' | 'UNAVAILABLE';
}

export interface ChatForwardNodeSummary {
  id: string;
  position: number;
  depth: number;
  senderName: string;
  senderExternalId: string | null;
  avatarUrl: string | null;
  sentAt: string | null;
  kind: ChatMessageKind;
  /** Flattened transcript of this line, used for search and LLM context. */
  text: string;
  /** Ordered text/image/voice parts; expanded nested forwards render from `children`. */
  parts: ChatMessagePart[];
  /** Expanded nested forward lines, empty when this node has none or hit a limit. */
  children: ChatForwardNodeSummary[];
}

export interface ChatForwardDetail extends ChatForwardSummary {
  messageId: string;
  nodes: ChatForwardNodeSummary[];
}

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
  /** Card metadata when this message is a merged-forward snapshot. */
  forward: ChatForwardSummary | null;
  /** Quoted-message snapshot from a NapCat reply segment; null when not a reply. */
  quote: ChatQuoteSummary | null;
  /** Ordered text/image/voice/forward segments; pure-media messages contain no text parts. */
  parts: ChatMessagePart[];
  sentAt: string;
}

export interface ChatMessagePage {
  messages: ChatMessageSummary[];
  hasMore: boolean;
}

export interface ChatPersonaHistoryEntry {
  id: string;
  time: string;
  field: string;
  from: string;
  to: string;
  reason: string;
}

export interface ChatPersonaMetadata {
  createdAt: string;
  updatedAt: string;
  history: ChatPersonaHistoryEntry[];
}

export interface ChatGroupMemberSummary {
  id: string;
  externalId: string;
  nickname: string;
  card: string | null;
  role: string | null;
  avatarUrl: string | null;
}

export type ChatEventType =
  'channel.updated' | 'conversation.updated' | 'message.created' | 'message.updated';

export interface ChatEvent {
  type: ChatEventType;
  channelId: string;
  conversationId?: string;
  messageId?: string;
}
