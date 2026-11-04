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

export type ChatPipelineRunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED';
export type ChatPipelineNodeStatus = 'RUNNING' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED' | 'CANCELLED';

/**
 * A pipeline graph belongs to exactly one namespace. `global` is the editable
 * system template; channels and personas inherit it until they save their own
 * copy, which stops the inheritance for that namespace only.
 */
export type ChatPipelineScope = 'global' | 'channel' | 'persona';
export type ChatPipelineRunMode = 'live' | 'debug';

export interface ChatPipelineNodeRunSummary {
  id: string;
  nodeId: string;
  nodeType: string;
  nodeVersion: number;
  status: ChatPipelineNodeStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  /** Resolved node configuration or message reference used for this run. */
  input: unknown;
  output: unknown;
  error: string | null;
}

export interface ChatPipelineRunSummary {
  id: string;
  graphId: string;
  graphVersion: number;
  status: ChatPipelineRunStatus;
  scope: ChatPipelineScope;
  scopeId: string | null;
  mode: ChatPipelineRunMode;
  channelName: string | null;
  conversationName: string | null;
  personaName: string | null;
  senderName: string | null;
  /** Truncated message text so the list is readable without another request. */
  messagePreview: string;
  messageKind: ChatMessageKind | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface ChatPipelineRunDetail extends ChatPipelineRunSummary {
  /** Final namespaced node outputs: `{ [nodeId]: output }`. */
  variables: Record<string, unknown> | null;
  /** Final pipeline variable values after the run: `{ [key]: value }`. */
  variableValues: Record<string, unknown> | null;
  /** Effects the nodes asked for; debug runs record them without committing. */
  effects: unknown;
  nodes: ChatPipelineNodeRunSummary[];
}

/** Pushed over SSE so an open canvas can follow runs in real time. */
export interface ChatPipelineRunEvent {
  runId: string;
  graphId: string;
  scope: ChatPipelineScope;
  scopeId: string | null;
  mode: ChatPipelineRunMode;
  /** `RUNNING` when the run opens, the final status when it settles. */
  status: ChatPipelineRunStatus;
  at: string;
}

export type ChatPipelineNodeCategory =
  'system' | 'ai' | 'text' | 'logic' | 'data' | 'media' | 'flow' | 'variable' | 'note';
export type ChatPipelineJoin = 'all' | 'any';

/**
 * Declared on the graph, reset to `value` at the start of every run. Cards read
 * the live value through `$vars.<key>` / `{{vars.<key>}}` or the `vars.get` card.
 */
export interface ChatPipelineVariable {
  key: string;
  value: string | number | boolean;
}

/**
 * Structured message object emitted by the `message.input` card. Downstream
 * cards read fields from it by path (`object.get`) instead of every field
 * getting its own port.
 */
export interface ChatPipelineMessageValue {
  /** Local message id. */
  id: string;
  externalId: string | null;
  channelId: string;
  conversationId: string;
  conversationKind: ChatConversationKind;
  /** Group number for groups, peer QQ for private chats; '' when unknown. */
  conversationExternalId: string;
  isSelf: boolean;
  sender: { id: string; name: string };
  text: string;
  kind: ChatMessageKind;
  /** Convenience flag so branches can test it without descending into quote. */
  hasQuote: boolean;
  quote: ChatPipelineQuoteValue | null;
  images: string[];
  imageCount: number;
  /** Stored voice segments in message order, with the NapCat transcript when ready. */
  voices: ChatPipelineVoiceValue[];
  voiceCount: number;
  isForward: boolean;
  sentAt: string;
}

export interface ChatPipelineVoiceValue {
  url: string;
  position: number;
  /** Duration in seconds when the connector provides it. */
  duration: number | null;
  /** Speech-to-text text; null for silence or when transcription did not finish. */
  transcript: string | null;
  mimeType: string | null;
  byteSize: number | null;
}

export interface ChatPipelineQuoteValue {
  messageId: string | null;
  externalId: string | null;
  author: { id: string | null; name: string };
  text: string;
  kind: ChatMessageKind;
  sentAt: string | null;
  /** Stored media references of the quoted message, in order. */
  images: string[];
  imageCount: number;
}

export interface ChatPipelineNodePosition {
  x: number;
  y: number;
}

/** Optional per-card canvas size; cards opt in through the node catalog. */
export interface ChatPipelineNodeSize {
  width: number;
  height: number;
}

export interface ChatPipelineGraphNode {
  id: string;
  type: string;
  config: Record<string, unknown> | null;
  join: ChatPipelineJoin;
  /** Canvas coordinates; layout only, never affects execution. */
  position: ChatPipelineNodePosition;
  /** User-adjusted card size; layout only, absent means the default card size. */
  size?: ChatPipelineNodeSize;
}

export interface ChatPipelineEdgeCondition {
  /** Output field on the source node, e.g. `matched`. */
  field: string;
  equals: unknown;
}

export interface ChatPipelineGraphEdge {
  from: string;
  to: string;
  /** Output port on the source node that carries the payload. */
  fromPort: string;
  /** Input port on the target node that receives the payload. */
  toPort: string;
  /** null means the edge always activates. */
  when: ChatPipelineEdgeCondition | null;
}

export interface ChatPipelineGraph {
  id: string;
  name: string;
  /** Structural version: bumps when nodes, edges or config change. */
  version: number;
  /** Write token: bumps on every successful save, including position-only edits. */
  revision: number;
  /** Stored graph schema version, used to gate migrations. */
  schemaVersion: number;
  updatedAt: string;
  nodes: ChatPipelineGraphNode[];
  edges: ChatPipelineGraphEdge[];
  /** Graph-level variables, in palette order; every run starts from these values. */
  variables: ChatPipelineVariable[];
}

export type ChatPipelineConfigFieldKind =
  'text' | 'string' | 'number' | 'boolean' | 'select' | 'json';

/**
 * Select fields can resolve their options at runtime instead of listing them in
 * the catalog: `model-providers` lists configured model providers,
 * `provider-models` lists the models of the provider named by `dependsOn`, and
 * `pipeline-variables` lists the variables declared on the current graph.
 */
export type ChatPipelineConfigOptionsSource =
  'model-providers' | 'provider-models' | 'pipeline-variables';

export interface ChatPipelineConfigField {
  key: string;
  label: string;
  kind: ChatPipelineConfigFieldKind;
  placeholder?: string;
  hint?: string;
  /** Pair short fields side by side in the inspector instead of one per row. */
  width?: 'half';
  options?: Array<{ value: string; label: string }>;
  /** Runtime option origin; takes precedence over `options`. */
  optionsSource?: ChatPipelineConfigOptionsSource;
  /** Config key whose value scopes the dynamic options (provider id for models). */
  dependsOn?: string;
  /** Shown only when every condition matches the node config. */
  visibleWhen?: Array<{ key: string; equals: string }>;
}

/** Input-port strategy for node types whose ports are stored in the node config. */
export type ChatPipelineDynamicInputs = 'values';

/**
 * `image` values are image references (stored media URLs) or data URLs; the
 * message output card resolves them to sendable images.
 */
export type ChatPipelineIoKind = 'text' | 'number' | 'boolean' | 'json' | 'image' | 'any';

/** One input port or one emitted output field of a node type. */
export interface ChatPipelineIoField {
  /** Output field name, or the input port key that edges connect to. */
  key: string;
  label: string;
  kind: ChatPipelineIoKind;
  description?: string;
  /** Input ports only: the node still runs when this port has no active edge. */
  optional?: boolean;
  /** Input ports only: the port accepts several incoming edges (aggregated as an array). */
  multiple?: boolean;
}

/** Named key list shown in a node's help panel, e.g. persona template parameters. */
export interface ChatPipelineHelpKeyGroup {
  title: string;
  keys: string[];
}

export interface ChatPipelineNodeHelp {
  /** Extra paragraphs after the node description. */
  notes?: string[];
  /** Key names the card accepts, grouped by category. */
  keyGroups?: ChatPipelineHelpKeyGroup[];
}

export interface ChatPipelineNodeType {
  type: string;
  label: string;
  category: ChatPipelineNodeCategory;
  description: string;
  version: number;
  /** Optional card-specific help content shown from the card's ? button. */
  help?: ChatPipelineNodeHelp;
  /** Locked system cards: always present, never deletable or addable. */
  system?: boolean;
  /**
   * Layout-only card: an annotation with no ports. It is never planned into a
   * run, so it has no status and produces no node row.
   */
  layout?: boolean;
  /** Card can be resized from its bottom-right corner; size is stored per node. */
  resizable?: boolean;
  /** Join mode a freshly added node starts with. */
  defaultJoin?: ChatPipelineJoin;
  /**
   * Runtime ports: `values` reads the keys from `config.inputs`, so a card can
   * grow input ports without a catalog change. `inputs` then lists the fallback
   * ports used when the config has none.
   */
  dynamicInputs?: ChatPipelineDynamicInputs;
  defaultConfig: Record<string, unknown>;
  fields: ChatPipelineConfigField[];
  inputs: ChatPipelineIoField[];
  outputs: ChatPipelineIoField[];
}

/**
 * Kind compatibility for one edge. `any` matches everything on both sides;
 * otherwise the kinds must be identical, so a boolean output can never feed a
 * text-only port.
 */
export function canConnectPipelineKinds(from: ChatPipelineIoKind, to: ChatPipelineIoKind): boolean {
  return from === 'any' || to === 'any' || from === to;
}

/** Whether a config field applies to the current node config. */
export function isPipelineConfigFieldVisible(
  field: ChatPipelineConfigField,
  config: Record<string, unknown> | null | undefined,
): boolean {
  if (!field.visibleWhen || field.visibleWhen.length === 0) {
    return true;
  }
  return field.visibleWhen.every((condition) => config?.[condition.key] === condition.equals);
}

const PIPELINE_INPUT_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Ports an edge can connect to. Dynamic node types keep the keys in
 * `config.inputs`; everything else uses the catalog list unchanged.
 */
export function resolvePipelineNodeInputs(
  definition: Pick<ChatPipelineNodeType, 'inputs' | 'dynamicInputs'>,
  config: Record<string, unknown> | null | undefined,
): ChatPipelineIoField[] {
  if (definition.dynamicInputs !== 'values') {
    return definition.inputs;
  }
  const raw = config?.['inputs'];
  const keys = Array.isArray(raw)
    ? raw.filter((key): key is string => typeof key === 'string' && PIPELINE_INPUT_KEY.test(key))
    : [];
  const resolved = keys.length > 0 ? keys : definition.inputs.map((port) => port.key);

  return resolved.map((key) => ({
    key,
    label: `值 ${key.length === 1 ? key.toUpperCase() : key}`,
    kind: 'any',
    optional: true,
    description: '数字计算的左值 / 右值、文本追加的一段，或 Math 表达式里的变量。',
  }));
}

/** Next unused port key: a–z, then v27, v28… */
export function nextPipelineInputKey(keys: readonly string[]): string {
  const used = new Set(keys);
  for (let index = 0; ; index += 1) {
    const key = index < 26 ? String.fromCharCode(97 + index) : `v${index + 1}`;
    if (!used.has(key)) {
      return key;
    }
  }
}

export interface ChatPipelineGraphSnapshot {
  graph: ChatPipelineGraph;
  catalog: ChatPipelineNodeType[];
  scope: ChatPipelineScope;
  scopeId: string | null;
  /** True while the namespace has no saved copy and uses an inherited graph. */
  following: boolean;
  /** Where the effective graph comes from when `following` is true. */
  inheritedFrom: ChatPipelineScope | null;
  /**
   * The stored graph failed to parse and the default graph is shown instead.
   * Nothing was written back; saving will replace the stored row.
   */
  degraded: boolean;
  degradedReason: string | null;
}

export interface PipelineScopeRef {
  scope: ChatPipelineScope;
  scopeId?: string | null;
}

export interface SaveChatPipelineGraphInput extends PipelineScopeRef {
  name: string;
  nodes: ChatPipelineGraphNode[];
  edges: ChatPipelineGraphEdge[];
  variables: ChatPipelineVariable[];
  /** Revision the editor loaded; a mismatch means another window saved first. */
  expectedRevision: number;
  /** Graph row the editor loaded; guards the copy-on-write race. */
  expectedGraphId: string;
}

export interface DebugChatPipelineRunInput extends PipelineScopeRef {
  text: string;
  senderName?: string;
  /** Synthetic conversation kind; defaults to PRIVATE. */
  conversationKind?: ChatConversationKind;
  /** Synthetic group number / peer QQ used by source filters; '' when unknown. */
  conversationExternalId?: string;
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
