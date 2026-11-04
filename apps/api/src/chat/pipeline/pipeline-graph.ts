import type { ChatPipelineNodeSize, ChatPipelineVariable } from '@inkseek/shared';

export interface PipelineEdgeCondition {
  /** Output field on the source node, e.g. `matched`. */
  field: string;
  equals: unknown;
}

export interface PipelineEdge {
  from: string;
  to: string;
  /** Output port on the source node that carries the payload. */
  fromPort: string;
  /** Input port on the target node that receives the payload. */
  toPort: string;
  /** Edge only activates when the source output matches; omitted means always. */
  when?: PipelineEdgeCondition;
}

export interface PipelineNode {
  id: string;
  /** Registered node type, e.g. `text.template`. */
  type: string;
  config?: Record<string, unknown>;
  /**
   * How incoming edges combine: `all` (default) requires every required input
   * port and every incoming edge to be active, `any` runs when at least one
   * branch arrives.
   */
  join?: 'all' | 'any';
  /** Registry version this node was last migrated to. */
  nodeVersion?: number;
  /** Canvas position; layout only. */
  position: { x: number; y: number };
  /** User-adjusted card size; layout only. */
  size?: ChatPipelineNodeSize;
}

export interface PipelineGraph {
  id: string;
  version: number;
  /** Optimistic-concurrency token; bumps on every write. */
  revision: number;
  schemaVersion: number;
  name: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  /** Declared variables; every run starts from these values. */
  variables: ChatPipelineVariable[];
}

/** Bump when the stored graph shape changes; gates startup migrations. */
export const PIPELINE_GRAPH_SCHEMA_VERSION = 1;

/**
 * First-version graph: the message input card is wired straight into the
 * message output card for both text and images, which is the simplest possible
 * repeater. Sending stays disabled until the output card is switched on, so
 * seeding this graph never posts into a live channel.
 */
export const DEFAULT_PIPELINE_GRAPH: PipelineGraph = {
  id: 'default-message-graph',
  version: 1,
  revision: 0,
  schemaVersion: PIPELINE_GRAPH_SCHEMA_VERSION,
  name: '默认消息处理图',
  nodes: [
    { id: 'input', type: 'message.input', position: { x: 120, y: 200 } },
    {
      id: 'output',
      type: 'message.output',
      config: { enabled: false },
      position: { x: 560, y: 200 },
    },
  ],
  edges: [
    { from: 'input', to: 'output', fromPort: 'text', toPort: 'text' },
    { from: 'input', to: 'output', fromPort: 'images', toPort: 'images' },
  ],
  variables: [],
};

/** Variable keys may use any language; the key itself is the runtime id. */
const VARIABLE_KEY = /^[\p{L}\p{N}\p{M}_-]+$/u;
const MAX_VARIABLES = 32;
const MAX_VARIABLE_KEY_LENGTH = 32;
const MAX_VARIABLE_TEXT = 4000;

export function validateGraph(graph: PipelineGraph): void {
  const ids = new Set<string>();

  validateVariables(graph.variables);

  for (const node of graph.nodes) {
    if (ids.has(node.id)) {
      throw new Error(`管线图节点 id 重复：${node.id}`);
    }
    ids.add(node.id);

    const size = node.size;
    if (
      size !== undefined &&
      (!Number.isFinite(size.width) ||
        size.width <= 0 ||
        !Number.isFinite(size.height) ||
        size.height <= 0)
    ) {
      throw new Error(`管线图节点尺寸无效：${node.id}`);
    }
  }

  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      throw new Error(`管线图边引用了未知节点：${edge.from} -> ${edge.to}`);
    }
    if (!edge.fromPort || !edge.toPort) {
      throw new Error(`管线图边缺少端口：${edge.from} -> ${edge.to}`);
    }
  }

  topologicalOrder(graph);
}

function validateVariables(variables: ChatPipelineVariable[]): void {
  if (!Array.isArray(variables)) {
    throw new Error('管线变量必须是数组');
  }
  if (variables.length > MAX_VARIABLES) {
    throw new Error(`管线变量最多 ${MAX_VARIABLES} 个`);
  }

  const keys = new Set<string>();
  for (const variable of variables) {
    if (typeof variable.key !== 'string' || !VARIABLE_KEY.test(variable.key)) {
      throw new Error(`管线变量名无效：${String(variable.key)}`);
    }
    if (variable.key.length > MAX_VARIABLE_KEY_LENGTH) {
      throw new Error(`管线变量名最多 ${MAX_VARIABLE_KEY_LENGTH} 个字符：${variable.key}`);
    }
    if (keys.has(variable.key)) {
      throw new Error(`管线变量名重复：${variable.key}`);
    }
    keys.add(variable.key);

    const value = variable.value;
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new Error(`管线变量 ${variable.key} 的值必须是文本、数字或布尔`);
    }
    if (typeof value === 'string' && value.length > MAX_VARIABLE_TEXT) {
      throw new Error(`管线变量 ${variable.key} 的文本不能超过 ${MAX_VARIABLE_TEXT} 个字符`);
    }
  }
}

/** Kahn's algorithm; also rejects cycles because a push-based DAG cannot loop. */
export function topologicalOrder(graph: PipelineGraph): PipelineNode[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const edge of graph.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }

  const queue = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order: PipelineNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodesById.get(id)!;
    order.push(node);

    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        queue.push(target);
      }
    }
  }

  if (order.length !== graph.nodes.length) {
    throw new Error('管线图存在环，无法按拓扑顺序执行');
  }

  return order;
}
