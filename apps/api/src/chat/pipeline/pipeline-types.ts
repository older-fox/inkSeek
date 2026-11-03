import type {
  ChatConversationKind,
  ChatMessageKind,
  ChatPipelineConfigField,
  ChatPipelineIoField,
  ChatPipelineJoin,
  ChatPipelineNodeCategory,
} from '@inkseek/shared';
import type { PipelineGraph, PipelineNode } from './pipeline-graph.js';

export interface PipelineMessage {
  messageId: string;
  channelId: string;
  conversationId: string;
  conversationKind: ChatConversationKind;
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
export type PipelineEffect = { type: 'reply'; text: string; images: string[] };

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
  /** Resolves `$nodeId.field` / `$input.port` references and `{{…}}` templates. */
  resolve(value: unknown): unknown;
  /** Interpolates a template string using the same references. */
  template(template: string): string;
  /** Waits `ms`; the runner owns the timer and cancels it on shutdown. */
  wait(ms: number): Promise<void>;
}

export interface PipelineNodeDefinition {
  type: string;
  version: number;
  label: string;
  category: ChatPipelineNodeCategory;
  description: string;
  /** Locked card: exactly one instance must exist and it cannot be removed. */
  system?: boolean;
  /** Join mode used when the node is added from the palette. */
  defaultJoin?: ChatPipelineJoin;
  defaultConfig: Record<string, unknown>;
  fields: ChatPipelineConfigField[];
  /** Typed input ports; edges connect to these keys. */
  inputs: ChatPipelineIoField[];
  /** Fields the node writes into its output namespace. */
  outputs: ChatPipelineIoField[];
  /** Save-time validation for the node config; throwing rejects the save. */
  validateConfig?(config: Record<string, unknown> | undefined): void;
  run(context: PipelineNodeContext): PipelineNodeResult | Promise<PipelineNodeResult>;
}
