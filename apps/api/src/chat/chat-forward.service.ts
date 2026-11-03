import { Injectable, Logger } from '@nestjs/common';
import type {
  ChatForwardDetail,
  ChatForwardNodeSummary,
  ChatForwardSource,
  ChatForwardStatus,
  ChatMessageImageSummary,
  ChatMessageKind,
  ChatMessageVoiceSummary,
} from '@inkseek/shared';
import { ChatMediaService, type StoredMedia } from './chat-media.service.js';
import { extractContent, buildParts } from './message-content.js';
import {
  externalIdOf,
  normalizeSegments,
  userAvatarUrl,
  type OneBotForwardNode,
  type OneBotRequester,
  type OneBotSegment,
} from './onebot.js';

/** QQ caps a single forward card well below this; the rest only wastes ingest time. */
const MAX_FORWARD_NODES = 200;
/** Every level of nested forwards shares one budget so a card cannot explode. */
const MAX_FORWARD_TOTAL_NODES = 500;
const MAX_FORWARD_MEDIA = 50;
const MAX_FORWARD_DEPTH = 3;
const MAX_FORWARD_FETCHES = 20;
const FORWARD_FETCH_TIMEOUT_MS = 10_000;
/** Wall-clock ceiling for one card; nested fetches run sequentially. */
const FORWARD_TOTAL_BUDGET_MS = 15_000;

export interface ForwardNodeWrite {
  position: number;
  depth: number;
  senderExternalId: string | null;
  senderName: string;
  sentAt: Date | null;
  kind: ChatMessageKind;
  text: string;
  segments: OneBotSegment[];
  images: Array<StoredMedia & { position: number }>;
  voices: Array<StoredMedia & { position: number }>;
  children: ForwardNodeWrite[];
}

export interface ForwardWrite {
  forwardId: string | null;
  title: string;
  source: ChatForwardSource;
  /** PENDING is derived at read time for legacy cards and never persisted. */
  status: Exclude<ChatForwardStatus, 'PENDING'>;
  errorCode: string | null;
  depth: number;
  nodes: ForwardNodeWrite[];
}

interface NormalizedNode {
  senderExternalId: string | null;
  senderName: string;
  sentAt: Date | null;
  segments: OneBotSegment[];
}

interface ExpansionBudget {
  nodesLeft: number;
  mediaLeft: number;
  fetchesLeft: number;
  deadline: number;
  visited: Set<string>;
  truncated: boolean;
  errorCode: string | null;
}

@Injectable()
export class ChatForwardService {
  private readonly logger = new Logger(ChatForwardService.name);

  constructor(private readonly media: ChatMediaService) {}

  /**
   * Expands one forward card eagerly, including nested forwards up to
   * MAX_FORWARD_DEPTH. Failures never throw: whatever was read is archived and
   * the card is marked TRUNCATED (or FAILED when nothing could be read).
   */
  async expand(client: OneBotRequester, segment: OneBotSegment): Promise<ForwardWrite> {
    const forwardId = readForwardId(segment.data['id']);
    const inlineNodes = readNodeArray(segment.data['content']);
    const source: ChatForwardSource = inlineNodes.length > 0 ? 'INLINE' : 'FETCHED';
    const budget: ExpansionBudget = {
      nodesLeft: MAX_FORWARD_TOTAL_NODES,
      mediaLeft: MAX_FORWARD_MEDIA,
      fetchesLeft: MAX_FORWARD_FETCHES,
      deadline: Date.now() + FORWARD_TOTAL_BUDGET_MS,
      visited: new Set<string>(),
      truncated: false,
      errorCode: null,
    };

    let rawNodes: OneBotForwardNode[] = [];

    if (inlineNodes.length > 0) {
      rawNodes = inlineNodes;
    } else if (forwardId) {
      rawNodes = (await this.fetchLevel(client, forwardId, budget)) ?? [];
    } else {
      budget.errorCode = 'FORWARD_ID_MISSING';
    }

    // Guards against a nested card pointing back at an ancestor.
    if (forwardId) {
      budget.visited.add(forwardId);
    }

    const kept = rawNodes.slice(0, MAX_FORWARD_NODES);
    if (rawNodes.length > kept.length) {
      budget.truncated = true;
    }

    const nodes: ForwardNodeWrite[] = [];

    for (const [position, raw] of kept.entries()) {
      const node = await this.buildNode(client, raw, position, 1, budget);
      if (!node) {
        break;
      }
      nodes.push(node);
    }

    const status: Exclude<ChatForwardStatus, 'PENDING'> =
      nodes.length === 0
        ? 'FAILED'
        : budget.truncated || budget.errorCode
          ? 'TRUNCATED'
          : 'COMPLETE';

    return {
      forwardId,
      title: deriveTitle(nodes),
      source,
      status,
      errorCode: budget.errorCode,
      depth: maxDepthOf(nodes),
      nodes,
    };
  }

  private async buildNode(
    client: OneBotRequester,
    raw: OneBotForwardNode,
    position: number,
    depth: number,
    budget: ExpansionBudget,
  ): Promise<ForwardNodeWrite | null> {
    if (budget.nodesLeft <= 0) {
      budget.truncated = true;
      budget.errorCode ??= 'FORWARD_NODE_LIMIT';
      return null;
    }
    budget.nodesLeft -= 1;

    const node = normalizeNode(raw);
    const content = extractContent(node.segments);
    const { images, voices } = await this.storeNodeMedia(node.segments, client, budget);
    const nested = await this.expandNested(client, node.segments, depth, budget);

    return {
      position,
      depth,
      senderExternalId: node.senderExternalId,
      senderName: node.senderName,
      sentAt: node.sentAt,
      kind: content.kind,
      text: content.text,
      segments: nested.segments,
      images,
      voices,
      children: nested.children,
    };
  }

  private async storeNodeMedia(
    segments: readonly OneBotSegment[],
    client: OneBotRequester,
    budget: ExpansionBudget,
  ): Promise<{
    images: Array<StoredMedia & { position: number }>;
    voices: Array<StoredMedia & { position: number }>;
  }> {
    const images: Array<StoredMedia & { position: number }> = [];
    const voices: Array<StoredMedia & { position: number }> = [];

    for (const [position, segment] of segments.entries()) {
      const isImage = this.media.isMediaSegment(segment);
      const isVoice = this.media.isVoiceSegment(segment);
      if (!isImage && !isVoice) {
        continue;
      }

      if (budget.mediaLeft <= 0) {
        budget.truncated = true;
        budget.errorCode ??= 'FORWARD_MEDIA_LIMIT';
        continue;
      }
      budget.mediaLeft -= 1;

      if (isImage) {
        const stored = await this.media.saveSegment(segment);
        if (stored) {
          images.push({ ...stored, position });
        }
      } else {
        const stored = await this.media.saveVoiceSegment(segment, client);
        if (stored) {
          voices.push({ ...stored, position });
        }
      }
    }

    return { images, voices };
  }

  private async expandNested(
    client: OneBotRequester,
    segments: readonly OneBotSegment[],
    parentDepth: number,
    budget: ExpansionBudget,
  ): Promise<{ children: ForwardNodeWrite[]; segments: OneBotSegment[] }> {
    if (!segments.some((segment) => segment.type === 'forward')) {
      return { children: [], segments: [...segments] };
    }

    if (parentDepth >= MAX_FORWARD_DEPTH) {
      budget.truncated = true;
      budget.errorCode ??= 'FORWARD_DEPTH_LIMIT';
      return { children: [], segments: [...segments] };
    }

    const children: ForwardNodeWrite[] = [];
    let complete = true;

    for (const segment of segments) {
      if (segment.type !== 'forward') {
        continue;
      }

      const id = readForwardId(segment.data['id']);
      const inlineNodes = readNodeArray(segment.data['content']);
      let levelNodes: OneBotForwardNode[] | null;

      if (inlineNodes.length > 0) {
        if (id) {
          if (budget.visited.has(id)) {
            this.noteTruncated(budget, 'FORWARD_CYCLE');
            complete = false;
            continue;
          }
          budget.visited.add(id);
        }
        levelNodes = inlineNodes;
      } else if (id) {
        levelNodes = await this.fetchLevel(client, id, budget);
      } else {
        this.noteTruncated(budget, 'FORWARD_ID_MISSING');
        levelNodes = null;
      }

      if (!levelNodes) {
        complete = false;
        continue;
      }

      for (const raw of levelNodes) {
        const child = await this.buildNode(client, raw, children.length, parentDepth + 1, budget);
        if (!child) {
          complete = false;
          break;
        }
        children.push(child);
      }
    }

    return {
      children,
      // Fully expanded levels no longer need their inline payload duplicated on disk.
      segments: complete ? stripNestedForwardContent(segments) : [...segments],
    };
  }

  private async fetchLevel(
    client: OneBotRequester,
    forwardId: string,
    budget: ExpansionBudget,
  ): Promise<OneBotForwardNode[] | null> {
    if (budget.visited.has(forwardId)) {
      this.noteTruncated(budget, 'FORWARD_CYCLE');
      return null;
    }
    if (budget.fetchesLeft <= 0 || Date.now() >= budget.deadline) {
      this.noteTruncated(budget, 'FORWARD_BUDGET_EXCEEDED');
      return null;
    }

    budget.visited.add(forwardId);
    budget.fetchesLeft -= 1;

    try {
      const response = await client.call<unknown>(
        'get_forward_msg',
        { id: forwardId },
        FORWARD_FETCH_TIMEOUT_MS,
      );
      const nodes = readNodeArray(
        Array.isArray(response)
          ? response
          : (response as { messages?: unknown } | null)?.messages,
      );
      if (nodes.length === 0) {
        this.noteTruncated(budget, 'FORWARD_FETCH_EMPTY');
      }
      return nodes;
    } catch (error) {
      this.noteTruncated(budget, 'FORWARD_FETCH_FAILED');
      this.logger.warn(
        `读取合并转发 ${forwardId} 失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private noteTruncated(budget: ExpansionBudget, code: string): void {
    budget.truncated = true;
    budget.errorCode ??= code;
  }
}

export function forwardSummaryText(forward: ForwardWrite): string {
  if (forward.status === 'FAILED') {
    return '[合并转发] 聊天记录无法展开';
  }

  const suffix = forward.status === 'TRUNCATED' ? ' · 部分内容' : '';
  return `[合并转发] ${forward.title} · ${forward.nodes.length} 条${suffix}`;
}

/** Replaces inline node payloads with a pointer once the nodes are persisted. */
export function stripExpandedForward(
  segments: readonly OneBotSegment[],
  forward: ForwardWrite,
): OneBotSegment[] {
  if (forward.status === 'FAILED') {
    return [...segments];
  }

  return segments.map((segment) =>
    segment.type === 'forward'
      ? {
          type: 'forward',
          data: { id: forward.forwardId ?? '', nodeCount: forward.nodes.length },
        }
      : segment,
  );
}

export interface ForwardDetailRecord {
  id: string;
  messageId: string;
  title: string;
  source: string;
  status: string;
  nodeCount: number;
  nodes: Array<{
    id: string;
    parentId: string | null;
    position: number;
    depth: number;
    senderExternalId: string | null;
    senderName: string;
    sentAt: Date | null;
    kind: ChatMessageKind;
    text: string;
    segments: unknown;
    images: Array<{
      id: string;
      url: string;
      position: number;
      width: number | null;
      height: number | null;
    }>;
    voices: Array<{
      id: string;
      url: string;
      position: number;
      duration: number | null;
      mimeType: string | null;
      byteSize: number | null;
    }>;
  }>;
}

export function toForwardDetail(record: ForwardDetailRecord): ChatForwardDetail {
  const parentIds = new Set(
    record.nodes
      .map((node) => node.parentId)
      .filter((id): id is string => typeof id === 'string'),
  );
  const byId = new Map<string, ChatForwardNodeSummary>();
  const roots: ChatForwardNodeSummary[] = [];

  for (const node of record.nodes) {
    byId.set(node.id, toNodeSummary(node, parentIds.has(node.id)));
  }

  for (const node of record.nodes) {
    const summary = byId.get(node.id);
    if (!summary) {
      continue;
    }
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(summary);
    } else {
      roots.push(summary);
    }
  }

  return {
    id: record.id,
    messageId: record.messageId,
    title: record.title,
    source: record.source === 'FETCHED' ? 'FETCHED' : 'INLINE',
    status:
      record.status === 'FAILED'
        ? 'FAILED'
        : record.status === 'TRUNCATED'
          ? 'TRUNCATED'
          : 'COMPLETE',
    nodeCount: record.nodeCount,
    nodes: roots,
  };
}

function toNodeSummary(
  node: ForwardDetailRecord['nodes'][number],
  hasChildren: boolean,
): ChatForwardNodeSummary {
  const images: ChatMessageImageSummary[] = node.images.map((image) => ({
    id: image.id,
    url: image.url,
    position: image.position,
    width: image.width,
    height: image.height,
  }));
  const voices: ChatMessageVoiceSummary[] = node.voices.map((voice) => ({
    id: voice.id,
    url: voice.url,
    position: voice.position,
    duration: voice.duration,
    mimeType: voice.mimeType,
    byteSize: voice.byteSize,
  }));

  return {
    id: node.id,
    position: node.position,
    depth: node.depth,
    senderName: node.senderName,
    senderExternalId: node.senderExternalId,
    avatarUrl: node.senderExternalId ? userAvatarUrl(node.senderExternalId) : null,
    sentAt: node.sentAt?.toISOString() ?? null,
    kind: node.kind,
    text: node.text,
    parts: buildParts(node.segments, images, voices, node.text, { skipForward: hasChildren }),
    children: [],
  };
}

function readForwardId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === 'string' ? externalIdOf(value) : null;
}

function readNodeArray(value: unknown): OneBotForwardNode[] {
  return Array.isArray(value)
    ? value.filter((item): item is OneBotForwardNode => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeNode(raw: OneBotForwardNode): NormalizedNode {
  const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
  const message = data.message ?? raw.message ?? data.content;
  const segments = normalizeSegments(
    Array.isArray(message) || typeof message === 'string' ? message : [],
  );

  const senderExternalId = externalIdOf(
    data.user_id ?? data.uin ?? raw.user_id ?? raw.sender?.user_id,
  );
  const senderName =
    firstText(data.nickname, data.name, raw.sender?.card, raw.sender?.nickname) ??
    (senderExternalId ? `QQ ${senderExternalId}` : '未知发送者');

  return {
    senderExternalId,
    senderName,
    sentAt: readSentAt(data.time ?? raw.time),
    segments,
  };
}

function firstText(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function readSentAt(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value * 1000);
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return new Date(numeric * 1000);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function deriveTitle(nodes: ReadonlyArray<{ senderName: string }>): string {
  const names = Array.from(new Set(nodes.map((node) => node.senderName.trim())))
    .filter((name) => name.length > 0)
    .slice(0, 4);

  if (names.length === 0) {
    return '聊天记录';
  }
  if (names.length === 1) {
    return `${names[0]}的聊天记录`;
  }
  return `${names.join('、')}的聊天记录`;
}

/** Expanded levels keep only the forward id; the nodes live in their own rows. */
function stripNestedForwardContent(segments: readonly OneBotSegment[]): OneBotSegment[] {
  return segments.map((segment) => {
    if (segment.type !== 'forward') {
      return segment;
    }
    const data = { ...segment.data };
    delete data['content'];
    return { type: 'forward', data };
  });
}

function maxDepthOf(nodes: readonly ForwardNodeWrite[]): number {
  return nodes.reduce(
    (max, node) => Math.max(max, node.depth, maxDepthOf(node.children)),
    1,
  );
}
