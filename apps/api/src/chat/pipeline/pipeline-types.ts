import type {
  ChatConversationKind,
  ChatMessageKind,
  ConversationPersonaValues,
  ChatPipelineConfigField,
  ChatPipelineDynamicInputs,
  ChatPipelineIoField,
  ChatPipelineJoin,
  ChatPipelineNodeCategory,
  ChatPipelineNodeHelp,
  ChatPipelineVoiceValue,
  MindTurnResult,
} from '@inkseek/shared';
import type { PipelineGraph, PipelineNode } from './pipeline-graph.js';

export interface PipelineMessage {
  messageId: string;
  channelId: string;
  conversationId: string;
  conversationKind: ChatConversationKind;
  /** External conversation id: group number for groups, peer QQ for private chats. */
  conversationExternalId: string;
  externalId: string | null;
  isSelf: boolean;
  senderId: string;
  senderName: string;
  text: string;
  kind: ChatMessageKind;
  /** Resolved quote snapshot, so the quoted content reaches the model context. */
  quote: {
    messageId: string | null;
    externalId: string | null;
    authorName: string;
    authorId: string | null;
    text: string;
    kind: ChatMessageKind;
    sentAt: string | null;
    images: string[];
  } | null;
  /** Stored image references (media URLs), in message order. */
  images: string[];
  imageCount: number;
  /** Stored voice segments in message order; transcription is awaited before the run. */
  voices: ChatPipelineVoiceValue[];
  voiceCount: number;
  sentAt: Date;
}

/** Immutable per-node outputs keyed by node id: `{ [nodeId]: output }`. */
export type PipelineOutputs = ReadonlyMap<string, Record<string, unknown>>;

/**
 * Active port values for the running node. A single port holds the value from
 * its one active edge; a `multiple` port holds an array in edge order.
 */
export type PipelineInputs = Readonly<Record<string, unknown>>;

/**
 * Side effect a node asks the runner to commit after the node succeeds. Cards
 * never perform I/O themselves, so a failed node cannot leave a half-sent reply
 * and a future dry-run only has to skip the commit step.
 */
export type PipelineEffect =
  | { type: 'reply'; text: string; images: string[] }
  | { type: 'media.description'; mediaId: string; description: string };

export interface PipelineImageDescriptionInput {
  /** Stored media reference or data URL carried by an image port. */
  reference: string;
  prompt: string;
  providerId?: string | null;
  model?: string | null;
  /** Regenerate even when the blob already has a description. */
  force?: boolean;
}

export interface PipelineImageDescriptionResult {
  sha256: string;
  /** Blob row to attach the description to; null when storage was unavailable. */
  mediaId: string | null;
  description: string;
  cached: boolean;
}

export interface PipelineChatInput {
  prompt: string;
  system?: string | null;
  /** Empty values fall back to the first configured provider / its first model. */
  providerId?: string | null;
  model?: string | null;
  temperature?: number;
  maxTokens?: number;
}

export interface PipelineChatResult {
  /** Raw model text, already trimmed. */
  text: string;
  providerId: string;
  providerName: string;
  model: string;
  latencyMs: number;
}

export const PROMPT_COMPRESSION_DEFAULT_TTL_SECONDS = 86_400;
export const PROMPT_COMPRESSION_MIN_TTL_SECONDS = 60;
export const PROMPT_COMPRESSION_MAX_TTL_SECONDS = 2_592_000;

/** Compression instruction used when the card leaves its own instruction empty. */
export const PROMPT_COMPRESSION_DEFAULT_INSTRUCTION = [
  '你是提示词压缩器。把用户给出的详细提示词改写成更紧凑的一版：',
  '删除重复、客套、可合并的表述和多余举例，但必须保留全部事实、设定、约束、字段名、输出格式、语气与安全要求。',
  '不得新增原文没有的信息，不得改变语义，不得省略任何限制条件。',
  '直接输出压缩后的提示词正文，不要解释，不要使用 Markdown 代码块。',
].join('\n');

export interface PipelinePromptCompressionInput {
  /** Detailed prompt to condense; the cache key derives from it. */
  prompt: string;
  /** Compression instruction; empty or omitted uses the built-in default. */
  instruction?: string | null;
  providerId?: string | null;
  model?: string | null;
  /** Seconds the compressed prompt stays cached; omitted uses the card default. */
  ttlSeconds?: number;
}

export interface PipelinePromptCompressionResult {
  text: string;
  /** True when the text came from Redis instead of a model call. */
  cached: boolean;
  /** Model that produced the cached/generated text; null on older cache rows. */
  model: string | null;
}

export interface PipelineHistoryImage {
  url: string;
  /** Vision description; null when the blob was never described. */
  description: string | null;
}

export interface PipelineHistoryVoice {
  url: string;
  /** Speech-to-text transcript; null for silence or failed requests. */
  transcript: string | null;
}

/** One stored message older than the anchor message in the same conversation. */
export interface PipelineHistoryMessage {
  id: string;
  sender: string;
  isSelf: boolean;
  text: string;
  kind: ChatMessageKind;
  sentAt: string;
  images: PipelineHistoryImage[];
  voices: PipelineHistoryVoice[];
}

export interface PipelineHistoryInput {
  conversationId: string;
  /** Internal id of the anchor message; excluded from the result. */
  messageId?: string | null;
  /** Anchor time; only entries strictly older than it are returned. */
  sentAt?: string | null;
  limit: number;
}

export interface PipelineNodeResult {
  outputs: Record<string, unknown>;
  effects?: PipelineEffect[];
  /** Gate stopped the branch: outgoing edges never activate, so downstream cards skip. */
  blocked?: boolean;
}

export class PipelineAbortError extends Error {
  constructor(message = '管线运行已取消') {
    super(message);
    this.name = 'PipelineAbortError';
  }
}

export interface PipelineNodeContext {
  message: PipelineMessage;
  graph: PipelineGraph;
  node: PipelineNode;
  outputs: PipelineOutputs;
  inputs: PipelineInputs;
  /** Resolves `$nodeId.field` / `$input.port` / `$vars.key` references and `{{…}}` templates. */
  resolve(value: unknown): unknown;
  /** Interpolates a template string using the same references. */
  template(template: string): string;
  /**
   * Persona card bound to this run, normalized with the same values the channel
   * snapshot exposes; null when the run has no persona (e.g. global debug).
   */
  personaValues: Readonly<ConversationPersonaValues> | null;
  /** Live pipeline variable value; undefined when the key was never declared. */
  getVariable(key: string): unknown;
  /** Writes a pipeline variable for later cards in the same run. */
  setVariable(key: string, value: unknown): void;
  /**
   * Reads stored messages older than the anchor message, oldest first, limited
   * to the anchor's conversation. Empty when the conversation cannot be located.
   */
  readHistory(input: PipelineHistoryInput): Promise<PipelineHistoryMessage[]>;
  /**
   * Reads a conversation-level persona snapshot by external id (group number
   * or peer QQ). Strict about the kind: a group card never resolves a private
   * conversation and vice versa. Null when out of channel scope or unset.
   */
  readConversationPersona(
    kind: 'group' | 'private',
    externalId: string,
  ): Promise<ConversationPersonaValues | null>;
  /** Waits `ms`; the runner owns the timer and cancels it on shutdown. */
  wait(ms: number): Promise<void>;
  /** Hashes the image, returns a cached description or asks a vision model. */
  describeImage(input: PipelineImageDescriptionInput): Promise<PipelineImageDescriptionResult>;
  /** Text completion against the configured model providers. */
  chat(input: PipelineChatInput): Promise<PipelineChatResult>;
  /** Compresses a detailed prompt, reusing the Redis-cached result while its TTL holds. */
  compressPrompt(input: PipelinePromptCompressionInput): Promise<PipelinePromptCompressionResult>;
  /**
   * Runs one persona-mind turn. The mind owns retrieval, social calculus,
   * tool calls, write-back and action execution; this hook only passes the
   * current message and an optional mode override.
   */
  runMind(input: {
    message?: PipelineMessage;
    mode?: 'SHADOW' | 'APPROVAL' | 'LIVE';
    trigger?: 'MESSAGE' | 'HEARTBEAT' | 'PROACTIVE' | 'MANUAL';
  }): Promise<MindTurnResult>;
}

export interface PipelineNodeDefinition {
  type: string;
  version: number;
  label: string;
  category: ChatPipelineNodeCategory;
  description: string;
  /** Optional card-specific help content, surfaced from the card's ? button. */
  help?: ChatPipelineNodeHelp;
  /** Locked card: exactly one instance must exist and it cannot be removed. */
  system?: boolean;
  /**
   * Annotation card: placed on the canvas only. The runner skips it entirely,
   * so it never opens a node row and has no ports to connect.
   */
  layout?: boolean;
  /** Card can be resized on the canvas; size is layout-only and stored per node. */
  resizable?: boolean;
  /** Join mode used when the node is added from the palette. */
  defaultJoin?: ChatPipelineJoin;
  /** Runs even without incoming edges; for cards whose inputs only order execution. */
  alwaysRun?: boolean;
  defaultConfig: Record<string, unknown>;
  fields: ChatPipelineConfigField[];
  /** Typed input ports; edges connect to these keys. */
  inputs: ChatPipelineIoField[];
  /** Ports stored in the node config; `inputs` is then only the fallback list. */
  dynamicInputs?: ChatPipelineDynamicInputs;
  /** Fields the node writes into its output namespace. */
  outputs: ChatPipelineIoField[];
  /**
   * Save-time validation for the node config; throwing rejects the save. The
   * graph is passed so cards can check references against declared variables.
   */
  validateConfig?(config: Record<string, unknown> | undefined, graph: PipelineGraph): void;
  run(context: PipelineNodeContext): PipelineNodeResult | Promise<PipelineNodeResult>;
}
