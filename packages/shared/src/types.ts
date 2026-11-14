import type {
  DeepseekTtsVoiceId,
  ModelProviderProtocol,
  TtsAudioFormat,
  TtsProvider,
} from './schemas.js';

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

export interface BilibiliSettings {
  hasCookie: boolean;
  loginName: string;
  updatedAt: string;
}

/** Ceiling applied to a single model call when the operator has not changed it. */
export const DEFAULT_TOOL_MAX_TOKENS = 20_000;

/** Minimum accepted value for the global call ceiling. */
export const MIN_TOOL_MAX_TOKENS = 256;

export interface VisionModelSettings {
  providerId: string | null;
  providerName: string | null;
  model: string | null;
  /** Timestamp of the last successful probe with this configuration. */
  verifiedAt: string | null;
  /** What the probe saw, so the card can show it is really reading images. */
  lastDescription: string | null;
}

export interface VisionModelResult {
  visionModel: VisionModelSettings;
  description: string;
  latencyMs: number;
  completionTokens: number | null;
  reasoningTokens: number | null;
}

export interface ToolTokenResult {
  maxTokens: number;
}

export interface TtsSettings {
  endpoint: string;
  model: string;
  voice: string;
  format: TtsAudioFormat;
  speed: number;
  hasKey: boolean;
  keyHint: string;
  updatedAt: string;
}

export interface DeepseekTtsSettings {
  voiceId: DeepseekTtsVoiceId;
  hasKey: boolean;
  keyHint: string;
  /** Bound model provider whose key is reused; null means a manually saved key. */
  providerId: string | null;
  providerName: string | null;
  updatedAt: string;
}

/**
 * Both engines keep their own saved configuration; only `provider` is active,
 * so switching never discards the other setup.
 */
export interface TtsOverview {
  provider: TtsProvider;
  openai: TtsSettings | null;
  deepseek: DeepseekTtsSettings | null;
  /** The active engine has a key and can synthesize right now. */
  ready: boolean;
}

export interface PhoneDeviceInfo {
  serial: string;
  state: string;
  model: string;
  product: string;
}

export interface PhoneSettings {
  adbAvailable: boolean;
  adbPath: string;
  adbVersion: string;
  devices: PhoneDeviceInfo[];
  error: string;
}

/** Wireless devices available for channel-level selection. */
export interface PhoneDeviceList {
  adbAvailable: boolean;
  devices: PhoneDeviceInfo[];
  error: string;
}

export interface SettingsOverview {
  redis: RedisSettings | null;
  bilibili: BilibiliSettings | null;
  tts: TtsOverview | null;
  phone: PhoneSettings;
  providers: ModelProviderSummary[];
  /** Hard ceiling for a single model call, in tokens. */
  maxTokens: number;
  /** Dedicated model for image reading; empty means the default provider/model. */
  visionModel: VisionModelSettings;
  /** Global banned words applied to every channel's mind prompt. */
  mindBannedWords: string[];
  /** Hosts the mind may read even when they resolve to private addresses. */
  webAllowedHosts: string[];
}

export interface MindBannedWordsResult {
  words: string[];
}

export interface WebAllowedHostsResult {
  hosts: string[];
}

export interface PhoneSettingsResult {
  phone: PhoneSettings;
}

export interface RedisSettingsResult {
  redis: RedisSettings;
  latencyMs: number;
}

export interface BilibiliSettingsResult {
  bilibili: BilibiliSettings;
}

export interface TtsSettingsResult {
  tts: TtsOverview;
  latencyMs: number;
}

export interface TtsProviderResult {
  tts: TtsOverview;
}

export interface TtsTestResult {
  audioBase64: string;
  mimeType: string;
  byteSize: number;
  latencyMs: number;
  /** Engine that produced the clip, so the UI can label the preview. */
  provider: TtsProvider;
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
  /** A direct line that bypasses the QQ transport but keeps the real mind. */
  isDirect: boolean;
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
