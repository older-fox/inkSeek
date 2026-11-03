import type {
  ChatConversationKind,
  ChatMessageKind,
  ChatPipelineConfigField,
  ChatPipelineIoField,
  ChatPipelineJoin,
  ChatPipelineNodeCategory,
  ChatPipelineVoiceValue,
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

export interface PipelineNodeResult {
  outputs: Record<string, unknown>;
  effects?: PipelineEffect[];
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
  /** Live pipeline variable value; undefined when the key was never declared. */
  getVariable(key: string): unknown;
  /** Writes a pipeline variable for later cards in the same run. */
  setVariable(key: string, value: unknown): void;
  /** Waits `ms`; the runner owns the timer and cancels it on shutdown. */
  wait(ms: number): Promise<void>;
  /** Hashes the image, returns a cached description or asks a vision model. */
  describeImage(
    input: PipelineImageDescriptionInput,
  ): Promise<PipelineImageDescriptionResult>;
}

export interface PipelineNodeDefinition {
  type: string;
  version: number;
  label: string;
  category: ChatPipelineNodeCategory;
  description: string;
  /** Locked card: exactly one instance must exist and it cannot be removed. */
  system?: boolean;
  /**
   * Annotation card: placed on the canvas only. The runner skips it entirely,
   * so it never opens a node row and has no ports to connect.
   */
  layout?: boolean;
  /** Join mode used when the node is added from the palette. */
  defaultJoin?: ChatPipelineJoin;
  /** Runs even without incoming edges; for cards whose inputs only order execution. */
  alwaysRun?: boolean;
  defaultConfig: Record<string, unknown>;
  fields: ChatPipelineConfigField[];
  /** Typed input ports; edges connect to these keys. */
  inputs: ChatPipelineIoField[];
  /** Fields the node writes into its output namespace. */
  outputs: ChatPipelineIoField[];
  /**
   * Save-time validation for the node config; throwing rejects the save. The
   * graph is passed so cards can check references against declared variables.
   */
  validateConfig?(config: Record<string, unknown> | undefined, graph: PipelineGraph): void;
  run(context: PipelineNodeContext): PipelineNodeResult | Promise<PipelineNodeResult>;
}
