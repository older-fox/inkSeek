import {
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  ChatPipelineNodeRunSummary,
  ChatPipelineNodeStatus,
  ChatPipelineRunDetail,
  ChatPipelineRunStatus,
  ChatPipelineRunSummary,
} from '@inkseek/shared';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PipelineEffectsService } from './pipeline-effects.service.js';
import {
  topologicalOrder,
  type PipelineEdge,
  type PipelineGraph,
  type PipelineNode,
} from './pipeline-graph.js';
import { PipelineGraphService } from './pipeline-graph.service.js';
import { createPipelineHelpers, getPipelineNode } from './pipeline-nodes.js';
import {
  PipelineAbortError,
  type PipelineInputs,
  type PipelineMessage,
  type PipelineNodeDefinition,
  type PipelineOutputs,
} from './pipeline-types.js';

const RUN_INCLUDE = {
  channel: { select: { displayName: true } },
  conversation: { select: { name: true } },
  message: { select: { text: true, senderName: true, kind: true } },
} satisfies Prisma.ChatPipelineRunInclude;

const RUN_DETAIL_INCLUDE = {
  ...RUN_INCLUDE,
  nodes: { orderBy: { startedAt: 'asc' as const } },
} satisfies Prisma.ChatPipelineRunInclude;

type RunRecord = Prisma.ChatPipelineRunGetPayload<{ include: typeof RUN_INCLUDE }>;

const PREVIEW_LENGTH = 80;
const STALE_MESSAGE = '服务重启，运行被中断';
const CANCELLED_MESSAGE = '管线运行已取消，该节点未执行';
const WAITING_CANCELLED_MESSAGE = '等待被取消';

@Injectable()
export class ChatPipelineRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatPipelineRunner.name);
  private readonly activeRuns = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly graphs: PipelineGraphService,
    private readonly effects: PipelineEffectsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const stale = await this.prisma.chatPipelineRun.findMany({
        where: { status: 'RUNNING' },
        select: { id: true, startedAt: true },
      });
      if (stale.length === 0) {
        return;
      }

      const now = new Date();
      for (const run of stale) {
        await this.prisma.chatPipelineNodeRun.updateMany({
          where: { runId: run.id, status: 'RUNNING' },
          data: { status: 'CANCELLED', finishedAt: now, error: STALE_MESSAGE },
        });
        await this.prisma.chatPipelineRun.update({
          where: { id: run.id },
          data: {
            status: 'INTERRUPTED',
            finishedAt: now,
            durationMs: Math.max(0, now.getTime() - run.startedAt.getTime()),
            error: STALE_MESSAGE,
          },
        });
      }
      this.logger.log(`已把 ${stale.length} 条遗留的运行记录标记为中断`);
    } catch (error) {
      this.logger.warn(
        `清理遗留运行记录失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const controller of this.activeRuns.values()) {
      controller.abort();
    }
    this.activeRuns.clear();
  }

  async run(message: PipelineMessage): Promise<void> {
    if (message.isSelf) {
      // Outgoing messages are archived but must not trigger another round.
      return;
    }

    let graph: PipelineGraph;
    try {
      graph = await this.graphs.load();
    } catch (error) {
      this.logger.warn(
        `管线图读取失败，跳过本次运行：${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const order = topologicalOrder(graph);
    const incoming = indexIncoming(graph);

    let runId: string;
    let startedAt: Date;
    try {
      const run = await this.prisma.chatPipelineRun.create({
        data: {
          graphId: graph.id,
          graphVersion: graph.version,
          status: 'RUNNING',
          channelId: message.channelId,
          conversationId: message.conversationId,
          messageId: message.messageId,
        },
        select: { id: true, startedAt: true },
      });
      runId = run.id;
      startedAt = run.startedAt;
    } catch (error) {
      this.logger.warn(
        `管线运行创建失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const controller = new AbortController();
    this.activeRuns.set(runId, controller);

    const outputs = new Map<string, Record<string, unknown>>();
    const statuses = new Map<string, ChatPipelineNodeStatus>();
    const failures: string[] = [];
    let aborted = false;

    try {
      for (const node of order) {
        const definition = getPipelineNode(node.type);
        const nodeEdges = incoming.get(node.id) ?? [];
        const activeEdges = this.activeEdges(nodeEdges, statuses, outputs);
        const inputs = collectInputs(definition, activeEdges, outputs);
        const traceInput = {
          config: node.config ?? null,
          join: node.join ?? 'all',
          ports: inputs,
        };
        const nodeStartedAt = new Date();

        if (aborted || controller.signal.aborted) {
          aborted = true;
          statuses.set(node.id, 'CANCELLED');
          await this.settleNode(runId, null, node, nodeStartedAt, 'CANCELLED', traceInput, null, CANCELLED_MESSAGE);
          continue;
        }

        if (!shouldRunNode(definition, node, nodeEdges, activeEdges, inputs)) {
          statuses.set(node.id, 'SKIPPED');
          await this.settleNode(runId, null, node, nodeStartedAt, 'SKIPPED', traceInput, null, null);
          continue;
        }

        const rowId = await this.startNode(runId, node, nodeStartedAt, traceInput);

        try {
          const helpers = createPipelineHelpers(message, outputs, inputs);
          const result = await definition.run({
            message,
            graph,
            node,
            outputs,
            inputs,
            resolve: helpers.resolve,
            template: helpers.template,
            wait: (ms) => this.wait(ms, controller.signal),
          });
          const output = sanitizeRecord(result.outputs);
          if (result.effects && result.effects.length > 0) {
            await this.effects.commit(message, result.effects);
          }
          outputs.set(node.id, output);
          statuses.set(node.id, 'SUCCEEDED');
          await this.settleNode(runId, rowId, node, nodeStartedAt, 'SUCCEEDED', traceInput, output, null);
        } catch (error) {
          if (error instanceof PipelineAbortError || controller.signal.aborted) {
            aborted = true;
            statuses.set(node.id, 'CANCELLED');
            await this.settleNode(
              runId,
              rowId,
              node,
              nodeStartedAt,
              'CANCELLED',
              traceInput,
              null,
              WAITING_CANCELLED_MESSAGE,
            );
            continue;
          }

          const failureMessage = error instanceof Error ? error.message : String(error);
          statuses.set(node.id, 'FAILED');
          failures.push(`节点 ${node.id}（${node.type}）失败：${failureMessage}`);
          await this.settleNode(
            runId,
            rowId,
            node,
            nodeStartedAt,
            'FAILED',
            traceInput,
            null,
            failureMessage,
          );
        }
      }
    } finally {
      this.activeRuns.delete(runId);
      await this.finishRun(runId, startedAt, outputs, statuses, failures, aborted);
    }
  }

  async listRuns(limit: number): Promise<ChatPipelineRunSummary[]> {
    const records = await this.prisma.chatPipelineRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: RUN_INCLUDE,
    });
    return records.map((record) => this.toSummary(record));
  }

  async getRun(id: string): Promise<ChatPipelineRunDetail> {
    const record = await this.prisma.chatPipelineRun.findUnique({
      where: { id },
      include: RUN_DETAIL_INCLUDE,
    });
    if (!record) {
      throw new NotFoundException('管线运行不存在');
    }

    return {
      ...this.toSummary(record),
      variables: asRecord(record.variables),
      nodes: record.nodes.map(
        (node): ChatPipelineNodeRunSummary => ({
          id: node.id,
          nodeId: node.nodeId,
          nodeType: node.nodeType,
          nodeVersion: node.nodeVersion,
          status: node.status,
          startedAt: node.startedAt.toISOString(),
          finishedAt: node.finishedAt?.toISOString() ?? null,
          durationMs: node.durationMs,
          input: node.input,
          output: node.output,
          error: node.error,
        }),
      ),
    };
  }

  private async finishRun(
    runId: string,
    startedAt: Date,
    outputs: PipelineOutputs,
    statuses: Map<string, ChatPipelineNodeStatus>,
    failures: string[],
    aborted: boolean,
  ): Promise<void> {
    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
    const status: ChatPipelineRunStatus = aborted
      ? 'INTERRUPTED'
      : failures.length > 0
        ? 'FAILED'
        : 'SUCCEEDED';
    const error =
      failures.length > 0 ? failures.join('；') : aborted ? '管线运行已取消' : null;

    try {
      await this.prisma.chatPipelineRun.update({
        where: { id: runId },
        data: {
          status,
          finishedAt,
          durationMs,
          error: error ? truncate(error, 2000) : null,
          variables: toInputJson(Object.fromEntries(outputs)),
        },
      });
    } catch (updateError) {
      this.logger.warn(
        `管线运行收尾失败：${updateError instanceof Error ? updateError.message : String(updateError)}`,
      );
    }

    const branchSummary = [...statuses.entries()]
      .map(([id, nodeStatus]) => `${id}:${nodeStatus}`)
      .join(', ');
    this.logger.debug(
      `管线运行 ${runId} ${status} ${durationMs}ms [${branchSummary}]` +
        (error ? ` error=${error}` : ''),
    );
  }

  /** Opens a RUNNING row before the node executes, so waits stay visible. */
  private async startNode(
    runId: string,
    node: PipelineNode,
    startedAt: Date,
    input: Record<string, unknown>,
  ): Promise<string | null> {
    try {
      const row = await this.prisma.chatPipelineNodeRun.create({
        data: {
          runId,
          nodeId: node.id,
          nodeType: node.type,
          nodeVersion: getPipelineNode(node.type).version,
          status: 'RUNNING',
          startedAt,
          input: toInputJson(input),
        },
        select: { id: true },
      });
      return row.id;
    } catch (error) {
      this.logger.warn(
        `管线节点记录创建失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async settleNode(
    runId: string,
    rowId: string | null,
    node: PipelineNode,
    startedAt: Date,
    status: ChatPipelineNodeStatus,
    input: Record<string, unknown>,
    output: Record<string, unknown> | null,
    error: string | null,
  ): Promise<void> {
    const finishedAt = new Date();
    const data = {
      status,
      finishedAt,
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      output: output ? toInputJson(output) : undefined,
      error,
    } satisfies Prisma.ChatPipelineNodeRunUpdateInput;

    try {
      if (rowId) {
        await this.prisma.chatPipelineNodeRun.update({ where: { id: rowId }, data });
        return;
      }
      // Row creation failed earlier: record the outcome anyway.
      await this.prisma.chatPipelineNodeRun.create({
        data: {
          runId,
          nodeId: node.id,
          nodeType: node.type,
          nodeVersion: getPipelineNode(node.type).version,
          startedAt,
          input: toInputJson(input),
          ...data,
        },
      });
    } catch (writeError) {
      this.logger.warn(
        `管线节点记录写入失败：${writeError instanceof Error ? writeError.message : String(writeError)}`,
      );
    }
  }

  /** Runner-owned timer: shutdown aborts the wait instead of holding the process. */
  private wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new PipelineAbortError());
        return;
      }

      const onAbort = (): void => {
        clearTimeout(timer);
        reject(new PipelineAbortError());
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private activeEdges(
    edges: PipelineEdge[],
    statuses: Map<string, ChatPipelineNodeStatus>,
    outputs: PipelineOutputs,
  ): PipelineEdge[] {
    return edges.filter((edge) => {
      if (statuses.get(edge.from) !== 'SUCCEEDED') {
        return false;
      }
      if (!edge.when) {
        return true;
      }
      const output = outputs.get(edge.from);
      if (!output) {
        return false;
      }
      return jsonEqual(output[edge.when.field], edge.when.equals);
    });
  }

  private toSummary(record: RunRecord): ChatPipelineRunSummary {
    return {
      id: record.id,
      graphId: record.graphId,
      graphVersion: record.graphVersion,
      status: record.status,
      channelName: record.channel.displayName,
      conversationName: record.conversation.name,
      senderName: record.message?.senderName ?? null,
      messagePreview: truncate(record.message?.text ?? '', PREVIEW_LENGTH),
      messageKind: record.message?.kind ?? null,
      startedAt: record.startedAt.toISOString(),
      finishedAt: record.finishedAt?.toISOString() ?? null,
      durationMs: record.durationMs,
      error: record.error,
    };
  }
}

function sanitizeRecord(values: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(values)) as Record<string, unknown>;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function truncate(value: string, length: number): string {
  const chars = Array.from(value);
  return chars.length > length ? `${chars.slice(0, length).join('')}…` : value;
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function indexIncoming(graph: PipelineGraph): Map<string, PipelineEdge[]> {
  const incoming = new Map<string, PipelineEdge[]>();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.to) ?? [];
    list.push(edge);
    incoming.set(edge.to, list);
  }
  return incoming;
}

/** Only active edges contribute; a `multiple` port aggregates them in order. */
function collectInputs(
  definition: PipelineNodeDefinition,
  edges: PipelineEdge[],
  outputs: PipelineOutputs,
): PipelineInputs {
  const inputs: Record<string, unknown> = {};

  for (const port of definition.inputs) {
    const values = edges
      .filter((edge) => edge.toPort === port.key)
      .map((edge) => outputs.get(edge.from)?.[edge.fromPort]);
    if (values.length === 0) {
      continue;
    }
    inputs[port.key] = port.multiple ? values : values[values.length - 1];
  }

  return inputs;
}

/**
 * Source nodes (no inputs) run unconditionally; every other node needs active
 * edges. `all` additionally requires every incoming edge to be active and every
 * required port to have received a value.
 */
function shouldRunNode(
  definition: PipelineNodeDefinition,
  node: PipelineNode,
  edges: PipelineEdge[],
  activeEdges: PipelineEdge[],
  inputs: PipelineInputs,
): boolean {
  if (edges.length === 0) {
    return definition.inputs.length === 0;
  }

  if (node.join === 'any') {
    return activeEdges.length > 0;
  }

  if (activeEdges.length !== edges.length) {
    return false;
  }

  return definition.inputs.every(
    (port) => port.optional === true || inputs[port.key] !== undefined,
  );
}
