import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import {
  canConnectPipelineKinds,
  type ChatPipelineGraph,
  type ChatPipelineGraphEdge,
  type ChatPipelineGraphNode,
  type ChatPipelineGraphSnapshot,
  type ChatPipelineNodeType,
  type SaveChatPipelineGraphInput,
} from '@inkseek/shared';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  DEFAULT_PIPELINE_GRAPH,
  PIPELINE_GRAPH_SCHEMA_VERSION,
  validateGraph,
  type PipelineEdge,
  type PipelineGraph,
  type PipelineNode,
} from './pipeline-graph.js';
import { migrateLegacyMessagePorts } from './pipeline-migrate.js';
import { getPipelineNode, listPipelineNodes } from './pipeline-nodes.js';

interface LoadedGraph {
  graph: PipelineGraph;
  updatedAt: Date;
  degraded: boolean;
  degradedReason: string | null;
}

interface StoredGraphRecord {
  id: string;
  name: string;
  version: number;
  revision: number;
  schemaVersion: number;
  nodes: Prisma.JsonValue;
  edges: Prisma.JsonValue;
  updatedAt: Date;
}

/**
 * Reads and writes the single editable graph. The compiled graph is cached in
 * process; saves and resets invalidate it, so message ingest only pays one
 * query after a graph edit rather than one per message.
 *
 * Writes are guarded by `revision`: a save that lost a race returns 409 instead
 * of overwriting the other editor. Migrations run once at startup; the read
 * path never rewrites the row, and an unreadable graph falls back to the
 * default in memory instead of being replaced in the database.
 */
@Injectable()
export class PipelineGraphService implements OnModuleInit {
  private readonly logger = new Logger(PipelineGraphService.name);
  private cache: LoadedGraph | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrap();
  }

  async snapshot(): Promise<ChatPipelineGraphSnapshot> {
    return snapshotOf(await this.loadWithMeta());
  }

  /** Used by the runner; a degraded graph yields the default (no reply). */
  async load(): Promise<PipelineGraph> {
    return (await this.loadWithMeta()).graph;
  }

  async save(input: SaveChatPipelineGraphInput): Promise<ChatPipelineGraphSnapshot> {
    const current = await this.loadWithMeta();
    const nodes: PipelineNode[] = input.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      ...(node.config ? { config: node.config } : {}),
      join: node.join,
      position: { ...node.position },
    }));
    const edges: PipelineEdge[] = input.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      fromPort: edge.fromPort,
      toPort: edge.toPort,
      ...(edge.when ? { when: { field: edge.when.field, equals: edge.when.equals } } : {}),
    }));

    const next: PipelineGraph = {
      id: current.graph.id,
      name: input.name,
      version: current.graph.version,
      revision: current.graph.revision,
      schemaVersion: PIPELINE_GRAPH_SCHEMA_VERSION,
      nodes,
      edges,
    };
    this.assertValid(next, true);
    stampNodeVersions(next);

    const structuralChange = signature(next) !== signature(current.graph);
    if (structuralChange) {
      next.version = current.graph.version + 1;
    }

    const nextRevision = input.expectedRevision + 1;
    const updated = await this.prisma.chatPipelineGraph.updateMany({
      where: { id: next.id, revision: input.expectedRevision },
      data: {
        name: next.name,
        version: next.version,
        revision: nextRevision,
        schemaVersion: next.schemaVersion,
        nodes: toJson(next.nodes),
        edges: toJson(next.edges),
      },
    });

    if (updated.count === 0) {
      // The cache may predate another process's write; force a reload next read.
      this.cache = null;
      throw new ConflictException('管线图已在其他窗口被修改，请刷新后再保存');
    }

    next.revision = nextRevision;
    const record = await this.prisma.chatPipelineGraph.findUnique({
      where: { id: next.id },
      select: { updatedAt: true },
    });
    this.cache = {
      graph: next,
      updatedAt: record?.updatedAt ?? new Date(),
      degraded: false,
      degradedReason: null,
    };
    return snapshotOf(this.cache);
  }

  async reset(): Promise<ChatPipelineGraphSnapshot> {
    await this.prisma.chatPipelineGraph.deleteMany({
      where: { id: DEFAULT_PIPELINE_GRAPH.id },
    });
    this.cache = null;
    return snapshotOf(await this.seedDefault());
  }

  /**
   * Startup pass: apply the one-time port migration, stamp node versions and
   * validate. This is the only path that writes without a user save.
   */
  private async bootstrap(): Promise<void> {
    const record = await this.prisma.chatPipelineGraph.findUnique({
      where: { id: DEFAULT_PIPELINE_GRAPH.id },
    });
    if (!record) {
      await this.seedDefault();
      return;
    }

    try {
      const graph = graphFromRecord(record);
      const storedVersions = new Map(graph.nodes.map((node) => [node.id, node.nodeVersion]));
      const migrated = migrateLegacyMessagePorts(graph, (message) =>
        this.logger.warn(message),
      );
      stampNodeVersions(graph);
      this.assertValid(graph);

      const versionsStale = graph.nodes.some(
        (node) => storedVersions.get(node.id) !== node.nodeVersion,
      );
      const schemaStale = record.schemaVersion !== PIPELINE_GRAPH_SCHEMA_VERSION;

      if (migrated || versionsStale || schemaStale) {
        await this.persistStartupWrite(graph, record.revision, {
          bumpVersion: migrated,
          logMessage: migrated ? '管线图启动迁移完成' : '管线图节点版本与结构版本已更新',
        });
        return;
      }

      this.cache = {
        graph,
        updatedAt: record.updatedAt,
        degraded: false,
        degradedReason: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`管线图定义无法解析，已回退到默认图且不会写回存储：${message}`);
      this.cache = {
        graph: fallbackGraph(record),
        updatedAt: record.updatedAt,
        degraded: true,
        degradedReason: message,
      };
    }
  }

  private async persistStartupWrite(
    graph: PipelineGraph,
    expectedRevision: number,
    options: { bumpVersion: boolean; logMessage: string },
  ): Promise<void> {
    const nextRevision = expectedRevision + 1;
    const nextVersion = options.bumpVersion ? graph.version + 1 : graph.version;

    const updated = await this.prisma.chatPipelineGraph.updateMany({
      where: { id: graph.id, revision: expectedRevision },
      data: {
        name: graph.name,
        version: nextVersion,
        revision: nextRevision,
        schemaVersion: graph.schemaVersion,
        nodes: toJson(graph.nodes),
        edges: toJson(graph.edges),
      },
    });

    if (updated.count === 0) {
      this.cache = null;
      this.logger.warn(`${options.logMessage}：存储已被其他进程修改，本次未写回`);
      return;
    }

    graph.version = nextVersion;
    graph.revision = nextRevision;
    const record = await this.prisma.chatPipelineGraph.findUnique({
      where: { id: graph.id },
      select: { updatedAt: true },
    });
    this.cache = {
      graph,
      updatedAt: record?.updatedAt ?? new Date(),
      degraded: false,
      degradedReason: null,
    };
    this.logger.log(`${options.logMessage}：v${nextVersion} r${nextRevision}`);
  }

  /**
   * Read path: parse and validate only. A graph that cannot be understood is
   * served from memory as the default and left untouched on disk, so a schema
   * drift or a removed node type can never wipe the user's layout.
   */
  private async loadWithMeta(): Promise<LoadedGraph> {
    if (this.cache) {
      return this.cache;
    }

    const record = await this.prisma.chatPipelineGraph.findUnique({
      where: { id: DEFAULT_PIPELINE_GRAPH.id },
    });

    if (!record) {
      return this.seedDefault();
    }

    try {
      const graph = graphFromRecord(record);
      this.assertValid(graph);
      this.cache = {
        graph,
        updatedAt: record.updatedAt,
        degraded: false,
        degradedReason: null,
      };
      return this.cache;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`管线图定义无法解析，本次使用默认图且不会写回存储：${message}`);
      this.cache = {
        graph: fallbackGraph(record),
        updatedAt: record.updatedAt,
        degraded: true,
        degradedReason: message,
      };
      return this.cache;
    }
  }

  private async seedDefault(): Promise<LoadedGraph> {
    const graph = cloneGraph(DEFAULT_PIPELINE_GRAPH);
    try {
      const record = await this.prisma.chatPipelineGraph.create({
        data: {
          id: graph.id,
          name: graph.name,
          version: graph.version,
          revision: graph.revision,
          schemaVersion: graph.schemaVersion,
          nodes: toJson(graph.nodes),
          edges: toJson(graph.edges),
        },
        select: { updatedAt: true },
      });
      this.cache = {
        graph,
        updatedAt: record.updatedAt,
        degraded: false,
        degradedReason: null,
      };
      return this.cache;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        // Another process seeded first; serve what it wrote.
        this.cache = null;
        return this.loadWithMeta();
      }
      throw error;
    }
  }

  private assertValid(graph: PipelineGraph, asRequest = false): void {
    try {
      validateGraph(graph);
      assertTypedGraph(graph);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (asRequest) {
        throw new BadRequestException(message);
      }
      throw error;
    }
  }
}

export function pipelineCatalog(): ChatPipelineNodeType[] {
  return listPipelineNodes().map((definition) => ({
    type: definition.type,
    label: definition.label,
    category: definition.category,
    description: definition.description,
    version: definition.version,
    system: definition.system ?? false,
    defaultJoin: definition.defaultJoin ?? 'all',
    defaultConfig: JSON.parse(JSON.stringify(definition.defaultConfig)) as Record<string, unknown>,
    fields: definition.fields.map((field) => ({ ...field })),
    inputs: definition.inputs.map((field) => ({ ...field })),
    outputs: definition.outputs.map((field) => ({ ...field })),
  }));
}

const KIND_LABEL: Record<string, string> = {
  text: '文本',
  number: '数字',
  boolean: '布尔',
  json: 'JSON',
  any: '任意',
};

/**
 * Port-level validation that needs the node registry: every system card must
 * be present exactly once, each node config must pass its own validator, and
 * every edge must land on a declared port whose kind accepts the source output.
 */
function assertTypedGraph(graph: PipelineGraph): void {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const counts = new Map<string, number>();

  for (const node of graph.nodes) {
    const definition = getPipelineNode(node.type);
    try {
      definition.validateConfig?.(node.config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`节点 ${node.id}（${node.type}）配置无效：${message}`, { cause: error });
    }
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }

  for (const definition of listPipelineNodes()) {
    if (!definition.system) {
      continue;
    }
    if ((counts.get(definition.type) ?? 0) !== 1) {
      throw new Error(
        `系统节点「${definition.label}」必须且只能有一张（${definition.type}）`,
      );
    }
  }

  const occupiedPorts = new Set<string>();
  const seenEdges = new Set<string>();

  for (const edge of graph.edges) {
    const source = nodesById.get(edge.from);
    const target = nodesById.get(edge.to);
    if (!source || !target) {
      continue;
    }

    const sourceDefinition = getPipelineNode(source.type);
    const targetDefinition = getPipelineNode(target.type);
    if (sourceDefinition.type === 'message.output') {
      throw new Error('消息输出卡片是管线终点，不能继续向外连线');
    }

    const output = sourceDefinition.outputs.find((port) => port.key === edge.fromPort);
    if (!output) {
      throw new Error(`节点 ${edge.from} 没有输出端口 ${edge.fromPort}`);
    }

    const input = targetDefinition.inputs.find((port) => port.key === edge.toPort);
    if (!input) {
      throw new Error(`节点 ${edge.to} 没有输入端口 ${edge.toPort}`);
    }

    if (!canConnectPipelineKinds(output.kind, input.kind)) {
      throw new Error(
        `类型不匹配：${edge.from}.${edge.fromPort} 输出${KIND_LABEL[output.kind] ?? output.kind}，` +
          `${edge.to}.${edge.toPort} 只接受${KIND_LABEL[input.kind] ?? input.kind}`,
      );
    }

    if (edge.when && !sourceDefinition.outputs.some((port) => port.key === edge.when!.field)) {
      throw new Error(`连线条件字段 ${edge.when.field} 不是节点 ${edge.from} 的输出`);
    }

    const identity = `${edge.from}:${edge.fromPort}->${edge.to}:${edge.toPort}`;
    if (seenEdges.has(identity)) {
      throw new Error(`重复连线：${identity}`);
    }
    seenEdges.add(identity);

    const portKey = `${edge.to}:${edge.toPort}`;
    if (!input.multiple && occupiedPorts.has(portKey)) {
      throw new Error(`端口 ${edge.to}.${edge.toPort} 只接受一根连线`);
    }
    occupiedPorts.add(portKey);
  }
}

function snapshotOf(loaded: LoadedGraph): ChatPipelineGraphSnapshot {
  return {
    graph: toContractGraph(loaded.graph, loaded.updatedAt),
    catalog: pipelineCatalog(),
    degraded: loaded.degraded,
    degradedReason: loaded.degradedReason,
  };
}

function toContractGraph(graph: PipelineGraph, updatedAt: Date): ChatPipelineGraph {
  return {
    id: graph.id,
    name: graph.name,
    version: graph.version,
    revision: graph.revision,
    schemaVersion: graph.schemaVersion,
    updatedAt: updatedAt.toISOString(),
    nodes: graph.nodes.map(
      (node): ChatPipelineGraphNode => ({
        id: node.id,
        type: node.type,
        config: node.config ?? null,
        join: node.join ?? 'all',
        position: { ...node.position },
      }),
    ),
    edges: graph.edges.map(
      (edge): ChatPipelineGraphEdge => ({
        from: edge.from,
        to: edge.to,
        fromPort: edge.fromPort,
        toPort: edge.toPort,
        when: edge.when ? { field: edge.when.field, equals: edge.when.equals } : null,
      }),
    ),
  };
}

/** Structural fingerprint; positions and omitted defaults are irrelevant. */
function signature(graph: PipelineGraph): string {
  return JSON.stringify({
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      config: node.config ?? null,
      join: node.join ?? 'all',
    })),
    edges: graph.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      fromPort: edge.fromPort,
      toPort: edge.toPort,
      when: edge.when ? { field: edge.when.field, equals: edge.when.equals } : null,
    })),
  });
}

function stampNodeVersions(graph: PipelineGraph): void {
  for (const node of graph.nodes) {
    node.nodeVersion = getPipelineNode(node.type).version;
  }
}

function graphFromRecord(record: StoredGraphRecord): PipelineGraph {
  if (record.schemaVersion > PIPELINE_GRAPH_SCHEMA_VERSION) {
    throw new Error(
      `存储的图 schema 版本 ${record.schemaVersion} 高于当前支持的 ${PIPELINE_GRAPH_SCHEMA_VERSION}`,
    );
  }

  return {
    id: record.id,
    name: record.name,
    version: record.version,
    revision: record.revision,
    schemaVersion: record.schemaVersion,
    nodes: nodesFromJson(record.nodes),
    edges: edgesFromJson(record.edges),
  };
}

function fallbackGraph(record: StoredGraphRecord): PipelineGraph {
  const graph = cloneGraph(DEFAULT_PIPELINE_GRAPH);
  graph.version = record.version;
  graph.revision = record.revision;
  graph.schemaVersion = record.schemaVersion;
  return graph;
}

function cloneGraph(graph: PipelineGraph): PipelineGraph {
  return JSON.parse(JSON.stringify(graph)) as PipelineGraph;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function nodesFromJson(value: Prisma.JsonValue): PipelineNode[] {
  if (!Array.isArray(value)) {
    throw new Error('节点定义必须是数组');
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('节点定义格式错误');
    }
    const id = entry['id'];
    const type = entry['type'];
    const position = entry['position'];
    if (typeof id !== 'string' || typeof type !== 'string') {
      throw new Error('节点缺少 id 或类型');
    }
    if (
      !isRecord(position) ||
      typeof position['x'] !== 'number' ||
      typeof position['y'] !== 'number'
    ) {
      throw new Error(`节点 ${id} 缺少坐标`);
    }
    const config = entry['config'];
    if (config !== undefined && config !== null && !isRecord(config)) {
      throw new Error(`节点 ${id} 的配置格式错误`);
    }
    const join = entry['join'];
    if (join !== undefined && join !== 'all' && join !== 'any') {
      throw new Error(`节点 ${id} 的合并方式无效`);
    }
    const nodeVersion = entry['nodeVersion'];
    if (
      nodeVersion !== undefined &&
      (typeof nodeVersion !== 'number' || !Number.isInteger(nodeVersion) || nodeVersion < 1)
    ) {
      throw new Error(`节点 ${id} 的版本号无效`);
    }

    return {
      id,
      type,
      ...(isRecord(config) ? { config } : {}),
      ...(join ? { join } : {}),
      ...(typeof nodeVersion === 'number' ? { nodeVersion } : {}),
      position: { x: position['x'], y: position['y'] },
    };
  });
}

function edgesFromJson(value: Prisma.JsonValue): PipelineEdge[] {
  if (!Array.isArray(value)) {
    throw new Error('边定义必须是数组');
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('边定义格式错误');
    }
    const from = entry['from'];
    const to = entry['to'];
    const fromPort = entry['fromPort'];
    const toPort = entry['toPort'];
    if (
      typeof from !== 'string' ||
      typeof to !== 'string' ||
      typeof fromPort !== 'string' ||
      typeof toPort !== 'string'
    ) {
      throw new Error('边缺少起点、终点或端口');
    }
    const when = entry['when'];
    if (when === undefined || when === null) {
      return { from, to, fromPort, toPort };
    }
    if (!isRecord(when) || typeof when['field'] !== 'string') {
      throw new Error(`边 ${from} -> ${to} 的条件格式错误`);
    }
    return { from, to, fromPort, toPort, when: { field: when['field'], equals: when['equals'] } };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
