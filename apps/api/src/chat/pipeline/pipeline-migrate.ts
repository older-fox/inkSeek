import type { PipelineEdge, PipelineGraph, PipelineNode } from './pipeline-graph.js';

/**
 * `message.input` used to expose one port per field. Those ports were folded
 * into a single `message` object readable through `object.get`, so legacy
 * edges are rewired to a generated extraction card before validation.
 */
const LEGACY_MESSAGE_PORTS: Record<string, { path: string; output: 'value' | 'found' }> = {
  sender: { path: 'sender.name', output: 'value' },
  senderId: { path: 'sender.id', output: 'value' },
  kind: { path: 'kind', output: 'value' },
  hasQuote: { path: 'quote', output: 'found' },
  quoteAuthor: { path: 'quote.author.name', output: 'value' },
  quoteText: { path: 'quote.text', output: 'value' },
  imageCount: { path: 'imageCount', output: 'value' },
  voiceCount: { path: 'voiceCount', output: 'value' },
  isForward: { path: 'isForward', output: 'value' },
};

/**
 * Rewrites legacy `message.input` edges in place and returns whether anything
 * changed. Idempotent: once the ports are gone a second pass is a no-op.
 *
 * Edge conditions are evaluated on the source node, so a condition may only
 * survive when it reads the same legacy port that carries the payload. Mixed
 * conditions (payload `text`, condition `hasQuote`) cannot be expressed with a
 * single extraction card and are dropped with a warning.
 */
export function migrateLegacyMessagePorts(
  graph: PipelineGraph,
  warn: (message: string) => void,
): boolean {
  const inputIds = new Set(
    graph.nodes.filter((node) => node.type === 'message.input').map((node) => node.id),
  );
  if (inputIds.size === 0) {
    return false;
  }

  const usedIds = new Set(graph.nodes.map((node) => node.id));
  const extractions = new Map<string, { nodeId: string; output: string }>();
  const edges: PipelineEdge[] = [];
  let changed = false;

  const extractionOf = (source: PipelineNode, port: string): { nodeId: string; output: string } => {
    const key = `${source.id}:${port}`;
    const cached = extractions.get(key);
    if (cached) {
      return cached;
    }

    const mapping = LEGACY_MESSAGE_PORTS[port]!;
    const nodeId = freeNodeId(`get_${port}`, usedIds);
    usedIds.add(nodeId);
    graph.nodes.push({
      id: nodeId,
      type: 'object.get',
      config: { path: mapping.path },
      position: {
        x: source.position.x + 300,
        y: source.position.y + extractions.size * 170,
      },
    });
    // The extraction card also needs the object itself; without this edge it
    // would be a source node with an unbound input and stay skipped forever.
    edges.push({ from: source.id, fromPort: 'message', to: nodeId, toPort: 'value' });
    const extraction = { nodeId, output: mapping.output };
    extractions.set(key, extraction);
    changed = true;
    return extraction;
  };

  for (const edge of graph.edges) {
    if (!inputIds.has(edge.from)) {
      edges.push(edge);
      continue;
    }

    const source = graph.nodes.find((node) => node.id === edge.from)!;
    const payloadLegacy = LEGACY_MESSAGE_PORTS[edge.fromPort] !== undefined;
    const conditionLegacy =
      edge.when !== undefined && LEGACY_MESSAGE_PORTS[edge.when.field] !== undefined;

    if (edge.when && edge.when.field !== edge.fromPort && (payloadLegacy || conditionLegacy)) {
      warn(
        `管线图迁移：连线 ${edge.from}.${edge.fromPort} -> ${edge.to}.${edge.toPort} ` +
          `的条件字段 ${edge.when.field} 无法随端口收敛保留，已移除该连线`,
      );
      changed = true;
      continue;
    }

    let next: PipelineEdge = edge;
    if (payloadLegacy) {
      const extraction = extractionOf(source, edge.fromPort);
      next = { ...next, from: extraction.nodeId, fromPort: extraction.output };
      changed = true;
      if (edge.when) {
        next.when = { field: extraction.output, equals: edge.when.equals };
      }
    }

    edges.push(next);
  }

  graph.edges = edges;
  return changed;
}

function freeNodeId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    return base;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${base}_${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
}
