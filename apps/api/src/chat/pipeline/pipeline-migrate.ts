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

/**
 * `message.get` was a source card that read the inbound message without an
 * input port, which hid where a value came from. Saved graphs keep their
 * wiring by turning each one into an `object.get` fed from the message input,
 * so the card disappears from the palette without changing behaviour.
 */
export function migrateRemovedMessageFieldNodes(
  graph: PipelineGraph,
  warn: (message: string) => void,
): boolean {
  const legacy = graph.nodes.filter((node) => node.type === 'message.get');
  if (legacy.length === 0) {
    return false;
  }

  const input = graph.nodes.find((node) => node.type === 'message.input');
  if (!input) {
    warn(`管线图迁移：图中没有消息输入，${legacy.length} 张「取消息内容」卡片已移除`);
    const legacyIds = new Set(legacy.map((node) => node.id));
    graph.nodes = graph.nodes.filter((node) => !legacyIds.has(node.id));
    graph.edges = graph.edges.filter(
      (edge) => !legacyIds.has(edge.from) && !legacyIds.has(edge.to),
    );
    return true;
  }

  for (const node of legacy) {
    node.type = 'object.get';
  }

  for (const node of legacy) {
    const wired = graph.edges.some((edge) => edge.to === node.id && edge.toPort === 'value');
    if (!wired) {
      graph.edges.push({ from: input.id, fromPort: 'message', to: node.id, toPort: 'value' });
    }
  }

  return true;
}

/**
 * `persona.get` was replaced by `persona.call`: one template fills every
 * persona value instead of reading a single field. Legacy cards become
 * `{field}` templates and their edges keep flowing through the text output.
 */
export function migratePersonaParameterCards(
  graph: PipelineGraph,
  warn: (message: string) => void,
): boolean {
  const legacy = graph.nodes.filter((node) => node.type === 'persona.get');
  if (legacy.length === 0) {
    return false;
  }

  const legacyIds = new Set(legacy.map((node) => node.id));
  for (const node of legacy) {
    const raw = node.config?.['field'];
    const field = typeof raw === 'string' && raw.trim() ? raw.trim() : 'name';
    node.type = 'persona.call';
    node.config = { template: `{${field}}` };
  }

  const edges: PipelineEdge[] = [];
  for (const edge of graph.edges) {
    if (!legacyIds.has(edge.from)) {
      edges.push(edge);
      continue;
    }
    if (edge.fromPort === 'found') {
      warn(
        `管线图迁移：${edge.from} 的「是否存在」输出已移除，` +
          `连线 ${edge.from}.found -> ${edge.to}.${edge.toPort} 已删除`,
      );
      continue;
    }
    const next: PipelineEdge = { ...edge, fromPort: 'text' };
    if (edge.when) {
      if (edge.when.field === 'found') {
        delete next.when;
        warn(`管线图迁移：${edge.from} 的连线条件依赖已移除的「是否存在」输出，已改为无条件`);
      } else {
        next.when = { ...edge.when, field: 'text' };
      }
    }
    edges.push(next);
  }
  graph.edges = edges;
  return true;
}

/**
 * The source whitelist card used one list for both kinds, so a group number
 * that happened to equal a QQ number could let the wrong conversation through.
 * Split it into a group-number column and a peer-QQ column, copying legacy
 * entries into the column(s) the old `source` allowed.
 */
export function migrateSourceWhitelistColumns(
  graph: PipelineGraph,
  warn: (message: string) => void,
): boolean {
  let changed = false;

  for (const node of graph.nodes) {
    if (node.type !== 'logic.whitelist' || !node.config) {
      continue;
    }

    const config = node.config;
    if (!Object.prototype.hasOwnProperty.call(config, 'whitelist')) {
      continue;
    }

    const legacy = typeof config['whitelist'] === 'string' ? config['whitelist'].trim() : '';
    delete config['whitelist'];

    const targets: Array<'groupWhitelist' | 'privateWhitelist'> =
      config['source'] === 'group'
        ? ['groupWhitelist']
        : config['source'] === 'private'
          ? ['privateWhitelist']
          : ['groupWhitelist', 'privateWhitelist'];

    if (legacy.length > 0) {
      for (const key of targets) {
        if (config[key] === undefined) {
          config[key] = legacy;
        }
      }
      warn(
        `管线图迁移：来源白名单已拆分为群号与 QQ 号两列，旧名单写入了` +
          `${targets.length === 2 ? '两列' : '对应列'}，请按需删减`,
      );
    }

    if (config['groupWhitelist'] === undefined) {
      config['groupWhitelist'] = '';
    }
    if (config['privateWhitelist'] === undefined) {
      config['privateWhitelist'] = '';
    }
    changed = true;
  }

  return changed;
}

/**
 * The source card gained an explicit three-way list mode. Legacy configs
 * filtered by the list whenever it had entries and ignored it otherwise, so an
 * empty pair maps to `off` and anything else to `whitelist`. The old per-column
 * "empty means allow all" no longer applies to whitelist mode, so a half-empty
 * pair is reported.
 */
export function migrateSourceWhitelistMode(
  graph: PipelineGraph,
  warn: (message: string) => void,
): boolean {
  let changed = false;

  for (const node of graph.nodes) {
    if (node.type !== 'logic.whitelist' || !node.config) {
      continue;
    }

    const config = node.config;
    if (Object.prototype.hasOwnProperty.call(config, 'mode')) {
      continue;
    }

    const group = typeof config['groupWhitelist'] === 'string' ? config['groupWhitelist'].trim() : '';
    const privateList =
      typeof config['privateWhitelist'] === 'string' ? config['privateWhitelist'].trim() : '';
    const mode = group.length === 0 && privateList.length === 0 ? 'off' : 'whitelist';
    config['mode'] = mode;
    changed = true;

    if (mode === 'whitelist' && (group.length === 0 || privateList.length === 0)) {
      const empty = group.length === 0 ? '群号' : 'QQ 号';
      warn(
        `管线图迁移：来源过滤已设为白名单，${empty}名单为空，该类来源将不再放行；` +
          '如需放行请改为黑名单或不启用',
      );
    }
  }

  return changed;
}

/**
 * The separate source-type filter was removed: the card only decides by list
 * membership, choosing the group or QQ column from the message itself. Drop
 * the stale key so the saved config matches the card definition.
 */
export function migrateSourceWhitelistScope(
  graph: PipelineGraph,
  warn: (message: string) => void,
): boolean {
  let changed = false;

  for (const node of graph.nodes) {
    if (node.type !== 'logic.whitelist' || !node.config) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(node.config, 'source')) {
      continue;
    }
    delete node.config['source'];
    changed = true;
    warn('管线图迁移：来源过滤已移除「来源类型」限制，只按名单判定');
  }

  return changed;
}

/**
 * The source card became a pure gate: it only emits the message object when
 * the source passes, and a blocked card stops its whole branch. The boolean
 * and source-id outputs are gone, so edges carrying them are dropped and
 * conditions that tested them become unconditional.
 */
const REMOVED_WHITELIST_OUTPUTS = new Set(['matched', 'conversationKind', 'conversationExternalId']);

export function migrateSourceWhitelistGate(
  graph: PipelineGraph,
  warn: (message: string) => void,
): boolean {
  const whitelistIds = new Set(
    graph.nodes.filter((node) => node.type === 'logic.whitelist').map((node) => node.id),
  );
  if (whitelistIds.size === 0) {
    return false;
  }

  let changed = false;
  const edges: PipelineEdge[] = [];
  for (const edge of graph.edges) {
    if (!whitelistIds.has(edge.from)) {
      edges.push(edge);
      continue;
    }

    if (edge.fromPort !== 'value') {
      warn(
        `管线图迁移：来源过滤已改为纯闸门，移除了引用已删除输出 ${edge.fromPort} 的连线 ` +
          `${edge.from}.${edge.fromPort} -> ${edge.to}.${edge.toPort}`,
      );
      changed = true;
      continue;
    }

    if (edge.when && REMOVED_WHITELIST_OUTPUTS.has(edge.when.field)) {
      const next = { ...edge };
      delete next.when;
      edges.push(next);
      warn('管线图迁移：来源过滤的放行条件已内置为闸门，连线改为放行后直接生效');
      changed = true;
      continue;
    }

    edges.push(edge);
  }

  graph.edges = edges;
  return changed;
}

/**
 * The source whitelist card now reads a connected message object instead of
 * the runtime message, so legacy edges move from the old `value` port to
 * `message`. Without the rewire the card would stay skipped.
 */
export function migrateSourceWhitelistInput(
  graph: PipelineGraph,
  warn: (message: string) => void,
): boolean {
  const whitelistIds = new Set(
    graph.nodes.filter((node) => node.type === 'logic.whitelist').map((node) => node.id),
  );
  if (whitelistIds.size === 0) {
    return false;
  }

  let changed = false;
  for (const edge of graph.edges) {
    if (whitelistIds.has(edge.to) && edge.toPort === 'value') {
      edge.toPort = 'message';
      changed = true;
    }
  }

  if (changed) {
    warn('管线图迁移：来源白名单的输入改为消息对象，原连线已接到 message 端口');
  }
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
