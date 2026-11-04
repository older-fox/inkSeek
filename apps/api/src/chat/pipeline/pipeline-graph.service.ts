import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import {
  canConnectPipelineKinds,
  resolvePipelineNodeInputs,
  type ChatPipelineGraph,
  type ChatPipelineGraphEdge,
  type ChatPipelineGraphNode,
  type ChatPipelineGraphSnapshot,
  type ChatPipelineNodeType,
  type ChatPipelineScope,
  type ChatPipelineVariable,
  type PipelineScopeRef,
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
import {
  migrateGroupPersonaTemplates,
  migrateLegacyMessagePorts,
  migratePersonaParameterCards,
  migrateRemovedMessageFieldNodes,
  migrateSourceWhitelistColumns,
  migrateSourceWhitelistInput,
  migrateSourceWhitelistGate,
  migrateSourceWhitelistMode,
  migrateSourceWhitelistScope,
} from './pipeline-migrate.js';
import { getPipelineNode, listPipelineNodes } from './pipeline-nodes.js';

type PrismaScope = 'GLOBAL' | 'CHANNEL' | 'PERSONA';

interface NormalizedRef {
  scope: ChatPipelineScope;
  scopeId: string | null;
}

interface LoadedGraph {
  graph: PipelineGraph;
  updatedAt: Date;
  degraded: boolean;
  degradedReason: string | null;
}

export interface ResolvedPipelineGraph extends LoadedGraph {
  scope: ChatPipelineScope;
  scopeId: string | null;
  /** True while this namespace has no saved row and uses an inherited graph. */
  following: boolean;
  inheritedFrom: ChatPipelineScope | null;
}

interface StoredGraphRecord {
  id: string;
  scope: PrismaScope;
  scopeId: string;
  name: string;
  version: number;
  revision: number;
  schemaVersion: number;
  nodes: Prisma.JsonValue;
  edges: Prisma.JsonValue;
  variables: Prisma.JsonValue | null;
  updatedAt: Date;
}

const GLOBAL_REF: NormalizedRef = { scope: 'global', scopeId: null };

/**
 * Graphs are stored per namespace: the global template, one optional copy per
 * channel, and one optional copy per persona card. A namespace without a row
 * follows its parent (channel → bound persona card → global, persona → global);
 * the first save writes a copy-on-write row and stops following. Deleting that
 * row (follow) resumes inheritance.
 *
 * Parsed rows are cached per namespace. Resolution itself always re-reads the
 * channel → persona binding so re-binding a persona cannot serve a stale graph.
 * Writes are guarded by `revision`; a save that lost a race returns 409. Startup
 * migrates every stored row; the read path never writes, and an unreadable row
 * is served from memory as the default instead of being replaced on disk.
 */
@Injectable()
export class PipelineGraphService implements OnModuleInit {
  private readonly logger = new Logger(PipelineGraphService.name);
  private readonly cache = new Map<string, LoadedGraph>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrap();
  }

  async snapshot(ref: PipelineScopeRef): Promise<ChatPipelineGraphSnapshot> {
    return snapshotOf(await this.resolve(ref));
  }

  /** Used by the live runner: the graph a channel actually executes. */
  async resolveForChannel(channelId: string): Promise<ResolvedPipelineGraph> {
    return this.resolve({ scope: 'channel', scopeId: channelId });
  }

  async resolve(input: PipelineScopeRef): Promise<ResolvedPipelineGraph> {
    const ref = normalizeRef(input);

    if (ref.scope === 'global') {
      return wrap(await this.loadGlobalOrDefault(), ref, false, null);
    }

    const own = await this.loadStored(ref);
    if (own) {
      return wrap(own, ref, false, null);
    }

    if (ref.scope === 'persona') {
      return wrap(await this.loadGlobalOrDefault(), ref, true, 'global');
    }

    const binding = await this.prisma.chatChannelPersona.findUnique({
      where: { channelId: ref.scopeId! },
      select: { cardId: true },
    });
    if (binding) {
      const persona = await this.loadStored({ scope: 'persona', scopeId: binding.cardId });
      if (persona) {
        return wrap(persona, ref, true, 'persona');
      }
    }

    return wrap(await this.loadGlobalOrDefault(), ref, true, 'global');
  }

  async save(input: SaveChatPipelineGraphInput): Promise<ChatPipelineGraphSnapshot> {
    const ref = normalizeRef(input);
    await this.assertScopeTarget(ref);

    const current = await this.resolve(ref);
    if (current.graph.id !== input.expectedGraphId) {
      throw new ConflictException('管线图来源已变化，请刷新后再保存');
    }
    if (current.graph.revision !== input.expectedRevision) {
      throw new ConflictException('管线图已在其他窗口被修改，请刷新后再保存');
    }

    const nodes: PipelineNode[] = input.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      ...(node.config ? { config: node.config } : {}),
      join: node.join,
      position: { ...node.position },
      ...(node.size ? { size: { ...node.size } } : {}),
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
      variables: input.variables.map((variable) => ({ ...variable })),
    };
    this.assertValid(next, true);
    stampNodeVersions(next);

    if (signature(next) !== signature(current.graph)) {
      next.version = current.graph.version + 1;
    }

    const existing = await this.prisma.chatPipelineGraph.findUnique({
      where: { scope_scopeId: toUniqueWhere(ref) },
      select: { id: true },
    });

    let persisted: LoadedGraph;
    if (existing) {
      const nextRevision = input.expectedRevision + 1;
      const updated = await this.prisma.chatPipelineGraph.updateMany({
        where: { id: existing.id, revision: input.expectedRevision },
        data: {
          name: next.name,
          version: next.version,
          revision: nextRevision,
          schemaVersion: next.schemaVersion,
          nodes: toJson(next.nodes),
          edges: toJson(next.edges),
          variables: toJson(next.variables),
        },
      });

      if (updated.count === 0) {
        // The cache may predate another process's write; force a reload next read.
        this.cache.clear();
        throw new ConflictException('管线图已在其他窗口被修改，请刷新后再保存');
      }

      next.id = existing.id;
      next.revision = nextRevision;
      persisted = {
        graph: next,
        updatedAt: await this.readUpdatedAt(existing.id),
        degraded: false,
        degradedReason: null,
      };
    } else {
      // Copy-on-write: this namespace stops following and owns revision 1.
      next.revision = 1;
      try {
        const created = await this.prisma.chatPipelineGraph.create({
          data: {
            scope: toPrismaScope(ref.scope),
            scopeId: ref.scopeId ?? '',
            name: next.name,
            version: next.version,
            revision: next.revision,
            schemaVersion: next.schemaVersion,
            nodes: toJson(next.nodes),
            edges: toJson(next.edges),
            variables: toJson(next.variables),
          },
          select: { id: true, updatedAt: true },
        });
        next.id = created.id;
        persisted = {
          graph: next,
          updatedAt: created.updatedAt,
          degraded: false,
          degradedReason: null,
        };
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          this.cache.clear();
          throw new ConflictException('该管线副本已被其他窗口创建，请刷新后再保存');
        }
        throw error;
      }
    }

    this.cache.set(cacheKey(ref), persisted);
    return snapshotOf(wrap(persisted, ref, false, null));
  }

  /**
   * Drop the namespace's own copy and resume following its parent. For the
   * global namespace this restores the factory template.
   */
  async follow(input: PipelineScopeRef): Promise<ChatPipelineGraphSnapshot> {
    const ref = normalizeRef(input);
    await this.assertScopeTarget(ref);

    if (ref.scope === 'global') {
      await this.prisma.chatPipelineGraph.deleteMany({ where: { scope: 'GLOBAL' } });
      this.cache.clear();
      return snapshotOf(await this.resolve(GLOBAL_REF));
    }

    await this.prisma.chatPipelineGraph.deleteMany({
      where: { scope: toPrismaScope(ref.scope), scopeId: ref.scopeId! },
    });
    this.cache.delete(cacheKey(ref));
    return this.snapshot(ref);
  }

  /**
   * Startup pass: apply the one-time port migration to every stored row, stamp
   * node versions and validate. This is the only path that writes without a
   * user save.
   */
  private async bootstrap(): Promise<void> {
    const records = await this.prisma.chatPipelineGraph.findMany();
    if (records.length === 0) {
      await this.seedGlobal();
      return;
    }

    for (const record of records) {
      const ref = refOfRecord(record);
      try {
        const graph = graphFromRecord(record);
        const storedVersions = new Map(graph.nodes.map((node) => [node.id, node.nodeVersion]));
        const warn = (message: string) => this.logger.warn(message);
        const portsMigrated = migrateLegacyMessagePorts(graph, warn);
        const cardsMigrated = migrateRemovedMessageFieldNodes(graph, warn);
        const personaMigrated = migratePersonaParameterCards(graph, warn);
        const groupPersonaMigrated = migrateGroupPersonaTemplates(graph, warn);
        const whitelistMigrated = migrateSourceWhitelistColumns(graph, warn);
        const whitelistModeMigrated = migrateSourceWhitelistMode(graph, warn);
        const whitelistScopeMigrated = migrateSourceWhitelistScope(graph, warn);
        const whitelistGated = migrateSourceWhitelistGate(graph, warn);
        const whitelistWired = migrateSourceWhitelistInput(graph, warn);
        const migrated =
          portsMigrated ||
          cardsMigrated ||
          personaMigrated ||
          groupPersonaMigrated ||
          whitelistMigrated ||
          whitelistModeMigrated ||
          whitelistScopeMigrated ||
          whitelistGated ||
          whitelistWired;
        stampNodeVersions(graph);
        this.assertValid(graph);

        const versionsStale = graph.nodes.some(
          (node) => storedVersions.get(node.id) !== node.nodeVersion,
        );
        const schemaStale = record.schemaVersion !== PIPELINE_GRAPH_SCHEMA_VERSION;

        if (migrated || versionsStale || schemaStale) {
          await this.persistStartupWrite(ref, graph, record.revision, {
            bumpVersion: migrated,
            logMessage: migrated ? '管线图启动迁移完成' : '管线图节点版本与结构版本已更新',
          });
          continue;
        }

        this.cache.set(cacheKey(ref), {
          graph,
          updatedAt: record.updatedAt,
          degraded: false,
          degradedReason: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `管线图 ${scopeLabel(ref)} 无法解析，已回退到默认图且不会写回存储：${message}`,
        );
        this.cache.set(cacheKey(ref), {
          graph: fallbackGraph(record),
          updatedAt: record.updatedAt,
          degraded: true,
          degradedReason: message,
        });
      }
    }
  }

  private async persistStartupWrite(
    ref: NormalizedRef,
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
        variables: toJson(graph.variables),
      },
    });

    if (updated.count === 0) {
      this.cache.delete(cacheKey(ref));
      this.logger.warn(`${options.logMessage}：存储已被其他进程修改，本次未写回`);
      return;
    }

    graph.version = nextVersion;
    graph.revision = nextRevision;
    this.cache.set(cacheKey(ref), {
      graph,
      updatedAt: await this.readUpdatedAt(graph.id),
      degraded: false,
      degradedReason: null,
    });
    this.logger.log(`${options.logMessage}：${scopeLabel(ref)} v${nextVersion} r${nextRevision}`);
  }

  private async loadStored(ref: NormalizedRef): Promise<LoadedGraph | null> {
    const key = cacheKey(ref);
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    const record = await this.prisma.chatPipelineGraph.findUnique({
      where: { scope_scopeId: toUniqueWhere(ref) },
    });
    if (!record) {
      return null;
    }

    const loaded = this.parseRecord(record);
    this.cache.set(key, loaded);
    return loaded;
  }

  /**
   * Read path: parse and validate only. A graph that cannot be understood is
   * served from memory as the default and left untouched on disk, so a schema
   * drift or a removed node type can never wipe the user's layout.
   */
  private parseRecord(record: StoredGraphRecord): LoadedGraph {
    try {
      const graph = graphFromRecord(record);
      this.assertValid(graph);
      return { graph, updatedAt: record.updatedAt, degraded: false, degradedReason: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `管线图 ${scopeLabel(refOfRecord(record))} 无法解析，本次使用默认图且不会写回存储：${message}`,
      );
      return {
        graph: fallbackGraph(record),
        updatedAt: record.updatedAt,
        degraded: true,
        degradedReason: message,
      };
    }
  }

  private async loadGlobalOrDefault(): Promise<LoadedGraph> {
    return (await this.loadStored(GLOBAL_REF)) ?? (await this.seedGlobal());
  }

  private async seedGlobal(): Promise<LoadedGraph> {
    const graph = cloneGraph(DEFAULT_PIPELINE_GRAPH);
    try {
      const record = await this.prisma.chatPipelineGraph.create({
        data: {
          id: graph.id,
          scope: 'GLOBAL',
          scopeId: '',
          name: graph.name,
          version: graph.version,
          revision: graph.revision,
          schemaVersion: graph.schemaVersion,
          nodes: toJson(graph.nodes),
          edges: toJson(graph.edges),
          variables: toJson(graph.variables),
        },
        select: { updatedAt: true },
      });
      const loaded: LoadedGraph = {
        graph,
        updatedAt: record.updatedAt,
        degraded: false,
        degradedReason: null,
      };
      this.cache.set(cacheKey(GLOBAL_REF), loaded);
      return loaded;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        // Another process seeded first; serve what it wrote.
        this.cache.delete(cacheKey(GLOBAL_REF));
        const existing = await this.loadStored(GLOBAL_REF);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  private async readUpdatedAt(id: string): Promise<Date> {
    const record = await this.prisma.chatPipelineGraph.findUnique({
      where: { id },
      select: { updatedAt: true },
    });
    return record?.updatedAt ?? new Date();
  }

  private async assertScopeTarget(ref: NormalizedRef): Promise<void> {
    if (ref.scope === 'global') {
      return;
    }

    if (ref.scope === 'channel') {
      const channel = await this.prisma.chatChannel.findUnique({
        where: { id: ref.scopeId! },
        select: { id: true },
      });
      if (!channel) {
        throw new NotFoundException('渠道不存在，无法保存管线');
      }
      return;
    }

    const persona = await this.prisma.personaCard.findUnique({
      where: { id: ref.scopeId! },
      select: { id: true },
    });
    if (!persona) {
      throw new NotFoundException('人格卡不存在，无法保存管线');
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
    help: definition.help
      ? {
          notes: definition.help.notes ? [...definition.help.notes] : undefined,
          keyGroups: definition.help.keyGroups?.map((group) => ({
            title: group.title,
            keys: [...group.keys],
          })),
        }
      : undefined,
    system: definition.system ?? false,
    layout: definition.layout ?? false,
    resizable: definition.resizable ?? false,
    defaultJoin: definition.defaultJoin ?? 'all',
    dynamicInputs: definition.dynamicInputs,
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
      definition.validateConfig?.(node.config, graph);
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

    const input = resolvePipelineNodeInputs(targetDefinition, target.config).find(
      (port) => port.key === edge.toPort,
    );
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

function snapshotOf(resolved: ResolvedPipelineGraph): ChatPipelineGraphSnapshot {
  return {
    graph: toContractGraph(resolved.graph, resolved.updatedAt),
    catalog: pipelineCatalog(),
    scope: resolved.scope,
    scopeId: resolved.scopeId,
    following: resolved.following,
    inheritedFrom: resolved.inheritedFrom,
    degraded: resolved.degraded,
    degradedReason: resolved.degradedReason,
  };
}

function wrap(
  loaded: LoadedGraph,
  ref: NormalizedRef,
  following: boolean,
  inheritedFrom: ChatPipelineScope | null,
): ResolvedPipelineGraph {
  return {
    ...loaded,
    scope: ref.scope,
    scopeId: ref.scopeId,
    following,
    inheritedFrom,
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
        ...(node.size ? { size: { ...node.size } } : {}),
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
    variables: graph.variables.map((variable) => ({ ...variable })),
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
    variables: graph.variables,
  });
}

function stampNodeVersions(graph: PipelineGraph): void {
  for (const node of graph.nodes) {
    node.nodeVersion = getPipelineNode(node.type).version;
  }
}

function normalizeRef(input: PipelineScopeRef): NormalizedRef {
  return {
    scope: input.scope,
    scopeId: input.scope === 'global' ? null : (input.scopeId ?? null),
  };
}

function toPrismaScope(scope: ChatPipelineScope): PrismaScope {
  if (scope === 'channel') {
    return 'CHANNEL';
  }
  if (scope === 'persona') {
    return 'PERSONA';
  }
  return 'GLOBAL';
}

function fromPrismaScope(scope: PrismaScope): ChatPipelineScope {
  if (scope === 'CHANNEL') {
    return 'channel';
  }
  if (scope === 'PERSONA') {
    return 'persona';
  }
  return 'global';
}

function toUniqueWhere(ref: NormalizedRef): {
  scope: PrismaScope;
  scopeId: string;
} {
  return { scope: toPrismaScope(ref.scope), scopeId: ref.scopeId ?? '' };
}

function cacheKey(ref: NormalizedRef): string {
  return `${ref.scope}:${ref.scopeId ?? ''}`;
}

function refOfRecord(record: Pick<StoredGraphRecord, 'scope' | 'scopeId'>): NormalizedRef {
  const scope = fromPrismaScope(record.scope);
  return { scope, scopeId: scope === 'global' ? null : record.scopeId };
}

function scopeLabel(ref: NormalizedRef): string {
  if (ref.scope === 'global') {
    return '全局模板';
  }
  return `${ref.scope === 'channel' ? '渠道' : '人格'} ${ref.scopeId ?? ''}`;
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
    variables: variablesFromJson(record.variables),
  };
}

function fallbackGraph(record: StoredGraphRecord): PipelineGraph {
  const graph = cloneGraph(DEFAULT_PIPELINE_GRAPH);
  graph.name = record.name;
  graph.version = record.version;
  graph.revision = record.revision;
  graph.schemaVersion = record.schemaVersion;
  graph.id = record.id;
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
    const size = entry['size'];
    if (
      size !== undefined &&
      (!isRecord(size) ||
        typeof size['width'] !== 'number' ||
        !Number.isFinite(size['width']) ||
        size['width'] <= 0 ||
        typeof size['height'] !== 'number' ||
        !Number.isFinite(size['height']) ||
        size['height'] <= 0)
    ) {
      throw new Error(`节点 ${id} 的尺寸无效`);
    }

    return {
      id,
      type,
      ...(isRecord(config) ? { config } : {}),
      ...(join ? { join } : {}),
      ...(typeof nodeVersion === 'number' ? { nodeVersion } : {}),
      position: { x: position['x'], y: position['y'] },
      ...(isRecord(size)
        ? { size: { width: size['width'] as number, height: size['height'] as number } }
        : {}),
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

function variablesFromJson(value: Prisma.JsonValue | null): ChatPipelineVariable[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('管线变量必须是数组');
  }

  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry['key'] !== 'string') {
      throw new Error('管线变量格式错误');
    }
    const variableValue = entry['value'];
    if (
      typeof variableValue !== 'string' &&
      typeof variableValue !== 'number' &&
      typeof variableValue !== 'boolean'
    ) {
      throw new Error(`管线变量 ${entry['key']} 的值必须是文本、数字或布尔`);
    }
    return { key: entry['key'], value: variableValue };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
