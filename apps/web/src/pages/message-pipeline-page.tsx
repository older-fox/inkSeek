import type {
  ChatPipelineGraph,
  ChatPipelineGraphEdge,
  ChatPipelineGraphNode,
  ChatPipelineGraphSnapshot,
  ChatPipelineNodePosition,
  ChatPipelineNodeSize,
  ChatPipelineNodeType,
  ChatPipelineRunDetail,
  ChatPipelineScope,
  ChatPipelineVariable,
  PipelineScopeRef,
  SaveChatPipelineGraphInput,
} from '@inkseek/shared';
import {
  canConnectPipelineKinds,
  nextPipelineInputKey,
  resolvePipelineNodeInputs,
} from '@inkseek/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  ChevronDown,
  CopyPlus,
  FlaskConical,
  Layers,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Workflow,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PipelineCanvas,
  type PipelineCanvasHandle,
} from '@/components/pipeline/pipeline-canvas';
import { PipelineDebugPanel } from '@/components/pipeline/pipeline-debug-panel';
import { useProviderOptions } from '@/components/pipeline/pipeline-config-options';
import { PipelineInspector } from '@/components/pipeline/pipeline-inspector';
import { PipelineNodeHelp } from '@/components/pipeline/pipeline-node-help';
import { PipelineRunPanel } from '@/components/pipeline/pipeline-run-panel';
import {
  CARD_WIDTH,
  CATEGORY_STYLE,
  IO_KIND_STYLE,
  MAX_PIPELINE_VARIABLES,
  cardHeight,
  wouldCreateCycle,
  type PipelineSelection,
} from '@/components/pipeline/pipeline-ui';
import { cn } from '@/lib/cn';
import { ApiError, api, type PipelineRunFilter } from '@/lib/api';
import { usePipelineRunEvents } from '@/lib/pipeline-events';
import {
  chatChannelsQuery,
  personasQuery,
  pipelineGraphQuery,
  pipelineRunQuery,
  pipelineRunsQuery,
} from '@/lib/queries';

type SaveState = 'saved' | 'saving' | 'error' | 'conflict';

const DEBUG_STORAGE_KEY = 'inkseek.pipeline.debug';

function toInput(graph: ChatPipelineGraph, ref: PipelineScopeRef): SaveChatPipelineGraphInput {
  return {
    scope: ref.scope,
    scopeId: ref.scope === 'global' ? null : (ref.scopeId ?? null),
    name: graph.name.trim() || '未命名消息图',
    nodes: graph.nodes,
    edges: graph.edges,
    variables: graph.variables,
    expectedRevision: graph.revision,
    expectedGraphId: graph.id,
  };
}

function readDegraded(snapshot: ChatPipelineGraphSnapshot): string | null {
  return snapshot.degraded
    ? (snapshot.degradedReason ?? '存储中的管线图无法解析')
    : null;
}

function nextNodeId(type: string, nodes: readonly ChatPipelineGraphNode[]): string {
  const base = type.split('.').slice(1).join('-') || 'node';
  let id = base;
  let suffix = 2;
  while (nodes.some((node) => node.id === id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

/** Drop a new card at the visual center of the current viewport. */
function centeredNodePosition(
  center: ChatPipelineNodePosition,
  definition: ChatPipelineNodeType,
  config: Record<string, unknown> | null,
  offset = 0,
  size?: ChatPipelineNodeSize,
): ChatPipelineNodePosition {
  const width = size?.width ?? CARD_WIDTH;
  const height = size?.height ?? cardHeight(definition, config);
  return {
    x: Math.round(center.x - width / 2 + offset),
    y: Math.round(center.y - height / 2 + offset),
  };
}

const SCOPE_LABEL: Record<ChatPipelineScope, string> = {
  global: '全局模板',
  channel: '渠道',
  persona: '人格',
};

export function MessagePipelinePage() {
  const queryClient = useQueryClient();
  const search = useSearch({ from: '/app/pipeline' });
  const navigate = useNavigate();

  const scope: ChatPipelineScope = search.scope ?? 'global';
  const scopeId = scope === 'global' ? null : (search.scopeId ?? null);
  const scopeRef = useMemo<PipelineScopeRef>(() => ({ scope, scopeId }), [scope, scopeId]);
  const refKey = `${scope}:${scopeId ?? ''}`;
  const refRef = useRef(scopeRef);
  refRef.current = scopeRef;

  const graphQuery = useQuery(pipelineGraphQuery(scopeRef));
  const channelsQuery = useQuery(chatChannelsQuery);
  const personaListQuery = useQuery(personasQuery);

  const [graph, setGraph] = useState<ChatPipelineGraph | null>(null);
  const [catalog, setCatalog] = useState<ChatPipelineNodeType[]>([]);
  const [selection, setSelection] = useState<PipelineSelection>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [followArmed, setFollowArmed] = useState(false);
  const [following, setFollowing] = useState(false);
  const [inheritedFrom, setInheritedFrom] = useState<ChatPipelineScope | null>(null);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [helpType, setHelpType] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [degradedReason, setDegradedReason] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(() => {
    try {
      return window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const watchGraphId = graph?.id ?? graphQuery.data?.graph.id ?? null;
  const runFilter = useMemo<PipelineRunFilter>(
    () => (debugMode && watchGraphId ? { graphId: watchGraphId } : scopeRef),
    [debugMode, watchGraphId, scopeRef],
  );
  const runsQuery = useQuery({
    ...pipelineRunsQuery(runFilter),
    // SSE pushes lifecycle events; polling is the fallback when it drops.
    refetchInterval: debugMode ? 4000 : false,
  });

  const graphRef = useRef<ChatPipelineGraph | null>(null);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const editSeq = useRef(0);
  const saveLoopRef = useRef<Promise<void> | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const autoRunKeyRef = useRef<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const canvasRef = useRef<PipelineCanvasHandle>(null);
  const providers = useProviderOptions(true);
  const clipboardRef = useRef<{
    type: string;
    config: Record<string, unknown> | null;
    join: ChatPipelineGraphNode['join'];
    size?: ChatPipelineNodeSize;
  } | null>(null);
  const pasteCountRef = useRef(0);

  const currentScopeLabel = useMemo(() => {
    if (scope === 'global') {
      return '全局模板';
    }
    if (scope === 'channel') {
      return (
        channelsQuery.data?.find((channel) => channel.id === scopeId)?.displayName ??
        '未知渠道'
      );
    }
    return personaListQuery.data?.find((persona) => persona.id === scopeId)?.name ?? '未知人格';
  }, [scope, scopeId, channelsQuery.data, personaListQuery.data]);

  const inheritedLabel = useMemo(() => {
    if (inheritedFrom === 'persona') {
      const bound = channelsQuery.data?.find((channel) => channel.id === scopeId)?.persona;
      return bound ? `人格「${bound.name}」` : '已绑定人格';
    }
    if (inheritedFrom === 'global') {
      return '全局模板';
    }
    return '父级';
  }, [inheritedFrom, scopeId, channelsQuery.data]);

  useEffect(() => {
    const data = graphQuery.data;
    if (!data || loadedKeyRef.current === refKey) {
      return;
    }
    loadedKeyRef.current = refKey;
    conflictRef.current = false;
    editSeq.current += 1;
    dirtyRef.current = false;
    setDirty(false);
    graphRef.current = data.graph;
    setGraph(data.graph);
    setCatalog(data.catalog);
    setDegradedReason(readDegraded(data));
    setFollowing(data.following);
    setInheritedFrom(data.inheritedFrom);
    setSelection(null);
    setSelectedRunId(null);
    setSaveState('saved');
    setSaveError(null);
    window.requestAnimationFrame(() => canvasRef.current?.fit());
  }, [graphQuery.data, refKey]);

  useEffect(() => {
    if (!runsQuery.data || autoRunKeyRef.current === refKey) {
      return;
    }
    autoRunKeyRef.current = refKey;
    setSelectedRunId(runsQuery.data[0]?.id ?? null);
  }, [runsQuery.data, refKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DEBUG_STORAGE_KEY, debugMode ? '1' : '0');
    } catch {
      // 隐私模式下 localStorage 不可写，开关仅在本次会话生效。
    }
  }, [debugMode]);

  const debugFollowRef = useRef<string | null>(null);
  useEffect(() => {
    const runs = runsQuery.data;
    if (debugMode) {
      const top = runs?.[0]?.id ?? null;
      if (top && debugFollowRef.current !== top) {
        debugFollowRef.current = top;
        setSelectedRunId(top);
      }
      return;
    }
    debugFollowRef.current = null;
    if (!runs || runs.length === 0) {
      return;
    }
    setSelectedRunId((current) =>
      current && runs.some((run) => run.id === current) ? current : (runs[0]?.id ?? null),
    );
  }, [debugMode, runsQuery.data]);

  usePipelineRunEvents(debugMode && Boolean(watchGraphId), (event) => {
    if (event.graphId !== watchGraphId) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['pipeline', 'runs'] });
    void queryClient.invalidateQueries({ queryKey: ['pipeline', 'run', event.runId] });
  });

  const switchScope = (nextScope: ChatPipelineScope, nextId: string | null) => {
    setScopeMenuOpen(false);
    setFollowArmed(false);
    void navigate({
      to: '/pipeline',
      search: {
        scope: nextScope,
        scopeId: nextScope === 'global' ? undefined : (nextId ?? undefined),
      },
    });
  };

  const detailQuery = useQuery({
    ...pipelineRunQuery(selectedRunId ?? ''),
    refetchInterval: (query) =>
      debugMode && query.state.data?.status === 'RUNNING' ? 1200 : false,
  });
  const nodeRuns = useMemo(
    () => new Map((detailQuery.data?.nodes ?? []).map((node) => [node.nodeId, node])),
    [detailQuery.data],
  );

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current !== null) {
      window.clearTimeout(noticeTimer.current);
    }
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) {
        window.clearTimeout(noticeTimer.current);
      }
    },
    [],
  );

  const applyGraph = useCallback(
    (updater: (current: ChatPipelineGraph) => ChatPipelineGraph) => {
      const current = graphRef.current;
      if (!current) {
        return;
      }
      const next = updater(current);
      graphRef.current = next;
      editSeq.current += 1;
      dirtyRef.current = true;
      setDirty(true);
      setGraph(next);
    },
    [],
  );

  const requestSave = useCallback(
    (force = false) => {
      if (force) {
        dirtyRef.current = true;
        setDirty(true);
      }
      if (saveLoopRef.current || conflictRef.current) {
        return;
      }

      const loopKey = loadedKeyRef.current;
      let failed = false;
      const loop = (async () => {
        while (dirtyRef.current && graphRef.current && loadedKeyRef.current === loopKey) {
          dirtyRef.current = false;
          setDirty(false);
          setSaveState('saving');
          const seq = editSeq.current;
          const targetRef = refRef.current;
          try {
            const snapshot = await api.savePipelineGraph(
              toInput(graphRef.current, targetRef),
            );
            if (loadedKeyRef.current !== loopKey) {
              // The user switched namespaces while this save was in flight.
              return;
            }
            setCatalog(snapshot.catalog);
            setDegradedReason(readDegraded(snapshot));
            setFollowing(snapshot.following);
            setInheritedFrom(snapshot.inheritedFrom);
            // Merge only the write token synchronously: local nodes/edges may be
            // newer than the response, and the next save must send the new revision.
            const current = graphRef.current;
            if (current) {
              const next = {
                ...current,
                id: snapshot.graph.id,
                version: snapshot.graph.version,
                revision: snapshot.graph.revision,
                schemaVersion: snapshot.graph.schemaVersion,
                updatedAt: snapshot.graph.updatedAt,
              };
              graphRef.current = next;
              setGraph(next);
            }
            queryClient.setQueryData(pipelineGraphQuery(targetRef).queryKey, snapshot);
            setSaveError(null);
            setSaveState('saved');
            if (editSeq.current !== seq) {
              dirtyRef.current = true;
              setDirty(true);
            }
          } catch (error) {
            if (loadedKeyRef.current !== loopKey) {
              return;
            }
            failed = true;
            if (error instanceof ApiError && error.status === 409) {
              conflictRef.current = true;
              dirtyRef.current = false;
              setDirty(false);
              setSaveState('conflict');
              setSaveError(error.message);
              break;
            }
            dirtyRef.current = true;
            setDirty(true);
            setSaveState('error');
            setSaveError(error instanceof Error ? error.message : String(error));
            break;
          }
        }
      })();

      saveLoopRef.current = loop.finally(() => {
        saveLoopRef.current = null;
        if (!failed && dirtyRef.current && loadedKeyRef.current === loopKey) {
          requestSave();
        }
      });
    },
    [queryClient],
  );

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const timer = window.setTimeout(() => requestSave(), 900);
    return () => window.clearTimeout(timer);
  }, [dirty, graph, requestSave]);

  const updateNode = useCallback(
    (id: string, patch: Partial<ChatPipelineGraphNode>) => {
      applyGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
      }));
    },
    [applyGraph],
  );

  const updateNodeConfig = useCallback(
    (id: string, key: string, value: unknown) => {
      applyGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) => {
          if (node.id !== id) {
            return node;
          }
          const config = { ...(node.config ?? {}) };
          if (value === undefined) {
            delete config[key];
          } else {
            config[key] = value;
          }
          return { ...node, config: Object.keys(config).length > 0 ? config : null };
        }),
      }));
    },
    [applyGraph],
  );

  const addNodeInput = useCallback(
    (id: string) => {
      applyGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) => {
          if (node.id !== id) {
            return node;
          }
          const definition = catalog.find((entry) => entry.type === node.type);
          if (!definition?.dynamicInputs) {
            return node;
          }
          const config = { ...(node.config ?? {}) };
          const keys = resolvePipelineNodeInputs(definition, config).map((port) => port.key);
          return {
            ...node,
            config: { ...config, inputs: [...keys, nextPipelineInputKey(keys)] },
          };
        }),
      }));
    },
    [applyGraph, catalog],
  );

  const removeNodeInput = useCallback(
    (id: string, key: string) => {
      const current = graphRef.current;
      const node = current?.nodes.find((entry) => entry.id === id);
      const definition = catalog.find((entry) => entry.type === node?.type);
      if (!current || !node || !definition?.dynamicInputs) {
        return;
      }
      const keys = resolvePipelineNodeInputs(definition, node.config).map((port) => port.key);
      if (keys.length <= 1) {
        flash('至少保留一个左侧输入');
        return;
      }
      const remaining = keys.filter((entry) => entry !== key);
      applyGraph((graph) => ({
        ...graph,
        nodes: graph.nodes.map((entry) =>
          entry.id === id
            ? { ...entry, config: { ...(entry.config ?? {}), inputs: remaining } }
            : entry,
        ),
        edges: graph.edges.filter((edge) => !(edge.to === id && edge.toPort === key)),
      }));
    },
    [applyGraph, catalog, flash],
  );

  const updateEdge = useCallback(
    (index: number, patch: Partial<ChatPipelineGraphEdge>) => {
      applyGraph((current) => ({
        ...current,
        edges: current.edges.map((edge, currentIndex) =>
          currentIndex === index ? { ...edge, ...patch } : edge,
        ),
      }));
    },
    [applyGraph],
  );

  const addVariable = useCallback(() => {
    applyGraph((current) => {
      let index = 1;
      while (current.variables.some((variable) => variable.key === `var_${index}`)) {
        index += 1;
      }
      return {
        ...current,
        variables: [...current.variables, { key: `var_${index}`, value: '' }],
      };
    });
  }, [applyGraph]);

  const createVariable = useCallback(
    (key: string) => {
      const current = graphRef.current;
      if (!current || current.variables.some((variable) => variable.key === key)) {
        return;
      }
      if (current.variables.length >= MAX_PIPELINE_VARIABLES) {
        flash(`一张图最多 ${MAX_PIPELINE_VARIABLES} 个变量`);
        return;
      }
      applyGraph((graph) => ({
        ...graph,
        variables: [...graph.variables, { key, value: '' }],
      }));
    },
    [applyGraph, flash],
  );

  const renameVariable = useCallback(
    (from: string, to: string) => {
      applyGraph((current) => ({
        ...current,
        variables: current.variables.map((variable) =>
          variable.key === from ? { ...variable, key: to } : variable,
        ),
        nodes: current.nodes.map((node) =>
          node.config?.['variable'] === from
            ? { ...node, config: { ...node.config, variable: to } }
            : node,
        ),
      }));
    },
    [applyGraph],
  );

  const updateVariableValue = useCallback(
    (key: string, value: ChatPipelineVariable['value']) => {
      applyGraph((current) => ({
        ...current,
        variables: current.variables.map((variable) =>
          variable.key === key ? { ...variable, value } : variable,
        ),
      }));
    },
    [applyGraph],
  );

  const deleteVariable = useCallback(
    (key: string) => {
      applyGraph((current) => ({
        ...current,
        variables: current.variables.filter((variable) => variable.key !== key),
        // Clearing the picker keeps the card savable: an empty key is allowed.
        nodes: current.nodes.map((node) =>
          node.config?.['variable'] === key
            ? { ...node, config: { ...node.config, variable: '' } }
            : node,
        ),
      }));
    },
    [applyGraph],
  );

  const moveNode = useCallback(
    (id: string, position: { x: number; y: number }) => {
      applyGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === id ? { ...node, position } : node,
        ),
      }));
    },
    [applyGraph],
  );

  const resizeNode = useCallback(
    (id: string, size: ChatPipelineNodeSize) => {
      applyGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === id ? { ...node, size: { ...size } } : node,
        ),
      }));
    },
    [applyGraph],
  );

  const connect = useCallback(
    (from: string, fromPort: string, to: string, toPort: string) => {
      const current = graphRef.current;
      if (!current) {
        return;
      }

      const source = current.nodes.find((node) => node.id === from);
      const target = current.nodes.find((node) => node.id === to);
      const sourceDefinition = catalog.find((entry) => entry.type === source?.type);
      const targetDefinition = catalog.find((entry) => entry.type === target?.type);
      const output = sourceDefinition?.outputs.find((port) => port.key === fromPort);
      const input = targetDefinition
        ? resolvePipelineNodeInputs(targetDefinition, target?.config).find(
            (port) => port.key === toPort,
          )
        : undefined;

      if (!output || !input) {
        flash('端口不存在，连线已取消');
        return;
      }

      if (!canConnectPipelineKinds(output.kind, input.kind)) {
        flash(
          `类型不匹配：${IO_KIND_STYLE[output.kind].label}输出不能接入「${input.label}」${IO_KIND_STYLE[input.kind].label}端口`,
        );
        return;
      }

      if (
        input.multiple !== true &&
        current.edges.some((edge) => edge.to === to && edge.toPort === toPort)
      ) {
        flash(`「${input.label}」只接受一根连线`);
        return;
      }

      if (
        current.edges.some(
          (edge) =>
            edge.from === from &&
            edge.fromPort === fromPort &&
            edge.to === to &&
            edge.toPort === toPort,
        )
      ) {
        flash('这两个端口已经连上了');
        return;
      }

      if (wouldCreateCycle(current.edges, from, to)) {
        flash('这条连线会形成环，已阻止');
        return;
      }

      applyGraph((graph) => ({
        ...graph,
        edges: [...graph.edges, { from, fromPort, to, toPort, when: null }],
      }));
      setSelection({ kind: 'edge', index: current.edges.length });
    },
    [applyGraph, catalog, flash],
  );

  const deleteSelection = useCallback(() => {
    const current = graphRef.current;
    if (!current || !selection) {
      return;
    }
    if (selection.kind === 'node') {
      const node = current.nodes.find((entry) => entry.id === selection.id);
      const definition = catalog.find((entry) => entry.type === node?.type);
      if (definition?.system) {
        flash('消息输入 / 输出是系统卡片，不能删除');
        return;
      }
      if (current.nodes.length <= 2) {
        flash('至少保留消息输入与输出卡片');
        return;
      }
      applyGraph((graph) => ({
        ...graph,
        nodes: graph.nodes.filter((entry) => entry.id !== selection.id),
        edges: graph.edges.filter(
          (edge) => edge.from !== selection.id && edge.to !== selection.id,
        ),
      }));
    } else {
      applyGraph((graph) => ({
        ...graph,
        edges: graph.edges.filter((_edge, index) => index !== selection.index),
      }));
    }
    setSelection(null);
  }, [applyGraph, catalog, flash, selection]);

  const copySelection = useCallback(() => {
    const current = graphRef.current;
    if (!current || selection?.kind !== 'node') {
      return;
    }
    const node = current.nodes.find((entry) => entry.id === selection.id);
    if (!node) {
      return;
    }
    clipboardRef.current = {
      type: node.type,
      config: node.config
        ? (JSON.parse(JSON.stringify(node.config)) as Record<string, unknown>)
        : null,
      join: node.join,
      size: node.size ? { ...node.size } : undefined,
    };
    pasteCountRef.current = 0;
    flash('已复制卡片');
  }, [flash, selection]);

  const pasteNode = useCallback(() => {
    const copied = clipboardRef.current;
    const current = graphRef.current;
    if (!copied || !current) {
      return;
    }
    const definition = catalog.find((entry) => entry.type === copied.type);
    if (!definition) {
      flash('这张卡片的类型已不可用');
      return;
    }
    const config = copied.config
      ? (JSON.parse(JSON.stringify(copied.config)) as Record<string, unknown>)
      : null;
    const id = nextNodeId(copied.type, current.nodes);
    const center = canvasRef.current?.center() ?? { x: 240, y: 240 };
    pasteCountRef.current += 1;
    const offset = pasteCountRef.current * 24;

    applyGraph((graph) => ({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id,
          type: copied.type,
          config,
          join: copied.join,
          ...(copied.size ? { size: { ...copied.size } } : {}),
          position: centeredNodePosition(center, definition, config, offset, copied.size),
        },
      ],
    }));
    setSelection({ kind: 'node', id });
    flash('已粘贴卡片');
  }, [applyGraph, catalog, flash]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const inField =
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"]') !== null;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (inField || !selection) {
          return;
        }
        event.preventDefault();
        deleteSelection();
        return;
      }

      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }
      if (event.key.toLowerCase() === 'c' && !inField && selection?.kind === 'node') {
        event.preventDefault();
        copySelection();
        return;
      }
      if (event.key.toLowerCase() === 'v' && !inField && clipboardRef.current) {
        event.preventDefault();
        pasteNode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copySelection, deleteSelection, pasteNode, selection]);

  const addNode = (type: string) => {
    const definition = catalog.find((entry) => entry.type === type);
    const current = graphRef.current;
    if (!definition || !current) {
      return;
    }

    const id = nextNodeId(type, current.nodes);
    const center = canvasRef.current?.center() ?? { x: 240, y: 240 };
    const config =
      Object.keys(definition.defaultConfig).length > 0
        ? (JSON.parse(JSON.stringify(definition.defaultConfig)) as Record<string, unknown>)
        : null;
    const position = centeredNodePosition(center, definition, config);

    applyGraph((graph) => ({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id,
          type,
          config,
          join: definition.defaultJoin ?? 'all',
          position,
        },
      ],
    }));
    setSelection({ kind: 'node', id });
  };

  const followGraph = async () => {
    if (!followArmed) {
      setFollowArmed(true);
      window.setTimeout(() => setFollowArmed(false), 3200);
      return;
    }
    if (saveState === 'saving') {
      flash('正在保存，稍后再恢复');
      return;
    }

    setFollowArmed(false);
    try {
      const snapshot = await api.followPipelineGraph(scopeRef);
      conflictRef.current = false;
      editSeq.current += 1;
      dirtyRef.current = false;
      setDirty(false);
      graphRef.current = snapshot.graph;
      setGraph(snapshot.graph);
      setCatalog(snapshot.catalog);
      setDegradedReason(readDegraded(snapshot));
      setFollowing(snapshot.following);
      setInheritedFrom(snapshot.inheritedFrom);
      setSelection(null);
      setSaveState('saved');
      setSaveError(null);
      queryClient.setQueryData(pipelineGraphQuery(scopeRef).queryKey, snapshot);
      void queryClient.invalidateQueries({ queryKey: ['pipeline', 'graph'] });
      window.requestAnimationFrame(() => canvasRef.current?.fit());
      flash(scope === 'global' ? '已恢复内置默认图' : '已恢复跟随父级');
    } catch (error) {
      flash(error instanceof Error ? error.message : String(error));
    }
  };

  const createCopy = () => {
    if (saveState === 'saving') {
      flash('正在保存，稍后再创建副本');
      return;
    }
    requestSave(true);
    flash('正在为当前作用域建立独立副本');
  };

  const handleDebugCompleted = (run: ChatPipelineRunDetail) => {
    setSelectedRunId(run.id);
    queryClient.setQueryData(pipelineRunQuery(run.id).queryKey, run);
    void queryClient.invalidateQueries({ queryKey: ['pipeline', 'runs'] });
  };

  const reloadLatest = async () => {
    if (saveState === 'saving') {
      flash('正在保存，稍后再载入');
      return;
    }
    try {
      const result = await graphQuery.refetch({ throwOnError: true });
      if (!result.data) {
        return;
      }
      conflictRef.current = false;
      editSeq.current += 1;
      dirtyRef.current = false;
      setDirty(false);
      graphRef.current = result.data.graph;
      setGraph(result.data.graph);
      setCatalog(result.data.catalog);
      setDegradedReason(readDegraded(result.data));
      setFollowing(result.data.following);
      setInheritedFrom(result.data.inheritedFrom);
      setSelection(null);
      setSaveState('saved');
      setSaveError(null);
      window.requestAnimationFrame(() => canvasRef.current?.fit());
    } catch (error) {
      flash(error instanceof Error ? error.message : String(error));
    }
  };

  if (graphQuery.isError) {
    return (
      <div className="grid h-full min-h-[calc(100dvh-4rem)] place-items-center px-6">
        <div className="rounded-2xl border border-signal-400/25 bg-signal-400/[0.05] px-8 py-8 text-center">
          <AlertTriangle className="mx-auto size-5 text-signal-400" strokeWidth={1.7} />
          <p className="mt-3 text-sm text-mist-300">管线图读取失败</p>
          <p className="mt-1 text-[0.65rem] text-mist-600">
            {graphQuery.error instanceof Error ? graphQuery.error.message : '请稍后重试'}
          </p>
          <button
            type="button"
            onClick={() => void graphQuery.refetch()}
            className="mt-4 rounded-full border border-brass-400/30 bg-brass-400/10 px-4 py-1.5 text-[0.65rem] text-brass-200"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (graphQuery.isPending || !graph || loadedKeyRef.current !== refKey) {
    return <PipelineSkeleton />;
  }

  const helpEntry = helpType
    ? (catalog.find((item) => item.type === helpType) ?? null)
    : null;

  return (
    <div className="relative flex h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <header className="relative z-30 flex h-14 shrink-0 flex-wrap items-center gap-2.5 border-b border-mist-100/[0.07] bg-ink-950/50 px-3 backdrop-blur-xl sm:px-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-brass-400/25 bg-brass-400/[0.08] text-brass-300">
          <Workflow className="size-4" strokeWidth={1.7} />
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <input
            value={graph.name}
            onChange={(event) =>
              applyGraph((current) => ({ ...current, name: event.target.value }))
            }
            maxLength={80}
            aria-label="管线图名称"
            className="w-36 truncate rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[0.78rem] font-medium text-mist-100 outline-none transition hover:border-mist-100/[0.1] focus:border-brass-400/40 sm:w-52"
          />
          <span className="rounded-full border border-mist-100/[0.1] px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-mist-500">
            v{graph.version}
          </span>
          <SaveBadge state={saveState} dirty={dirty} />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={debugMode}
            onClick={() => setDebugMode((current) => !current)}
            title="调试模式：自动跟随最新一次运行，并在连线上显示传递的输入/输出"
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.62rem] transition',
              debugMode
                ? 'border-brass-400/50 bg-brass-400/[0.12] text-brass-200'
                : 'border-mist-100/[0.1] text-mist-400 hover:border-brass-400/30 hover:text-brass-200',
            )}
          >
            <Bug className="size-3" strokeWidth={1.8} />
            {debugMode ? '调试中' : '调试'}
            {debugMode && (
              <span className="size-1.5 animate-pulse rounded-full bg-brass-300" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setDebugOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-jade-400/25 bg-jade-400/[0.06] px-2.5 py-1.5 text-[0.62rem] text-jade-300 transition hover:bg-jade-400/[0.12]"
          >
            <FlaskConical className="size-3" strokeWidth={1.8} />
            试跑
          </button>
          <AddNodeMenu catalog={catalog} onAdd={addNode} />
          <button
            type="button"
            onClick={() => requestSave(true)}
            title={saveState === 'conflict' ? '存在保存冲突，请先载入最新版本' : '立即保存'}
            aria-label="保存画布"
            disabled={saveState === 'saving' || saveState === 'conflict'}
            className="grid size-8 place-items-center rounded-lg border border-mist-100/[0.1] text-mist-400 transition hover:border-brass-400/30 hover:text-brass-200 disabled:opacity-50"
          >
            {saveState === 'saving' ? (
              <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.8} />
            ) : (
              <Save className="size-3.5" strokeWidth={1.7} />
            )}
          </button>
        </div>
      </header>

      <div className="relative z-20 flex min-h-[2.65rem] shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-mist-100/[0.06] bg-ink-950/35 px-3 py-1.5 sm:px-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => setScopeMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={scopeMenuOpen}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[0.62rem] transition',
              scopeMenuOpen
                ? 'border-brass-400/45 bg-brass-400/[0.1] text-brass-200'
                : 'border-mist-100/[0.12] bg-ink-900/40 text-mist-300 hover:border-brass-400/30 hover:text-brass-200',
            )}
          >
            <Layers className="size-3 shrink-0 text-brass-300/80" strokeWidth={1.8} />
            <span className="max-w-[9.5rem] truncate">{currentScopeLabel}</span>
            <span className="font-mono text-[0.48rem] uppercase tracking-[0.1em] text-mist-600">
              {SCOPE_LABEL[scope]}
            </span>
            <ChevronDown
              className={cn('size-3 shrink-0 transition', scopeMenuOpen && 'rotate-180')}
              strokeWidth={1.8}
            />
          </button>

          {scopeMenuOpen && (
            <>
              <button
                type="button"
                aria-label="关闭作用域菜单"
                onClick={() => setScopeMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div className="absolute left-0 top-full z-50 mt-1.5 max-h-[70vh] w-[19rem] overflow-y-auto rounded-xl border border-mist-100/[0.1] bg-ink-900/97 p-1.5 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl">
                <ScopeOption
                  label="全局模板"
                  hint="所有作用域继承的默认管线"
                  active={scope === 'global'}
                  onClick={() => switchScope('global', null)}
                />
                <ScopeSection label="渠道" count={channelsQuery.data?.length ?? 0} />
                {channelsQuery.data?.map((channel) => (
                  <ScopeOption
                    key={channel.id}
                    label={channel.displayName}
                    hint={
                      channel.persona
                        ? `${channel.accountId} · 人格 ${channel.persona.name}`
                        : `${channel.accountId} · 未绑定人格`
                    }
                    active={scope === 'channel' && scopeId === channel.id}
                    onClick={() => switchScope('channel', channel.id)}
                  />
                ))}
                <ScopeSection label="人格卡" count={personaListQuery.data?.length ?? 0} />
                {personaListQuery.data?.map((persona) => (
                  <ScopeOption
                    key={persona.id}
                    label={persona.name}
                    hint={`${persona.serial} · ${persona.occupation || '未填写职业'}`}
                    active={scope === 'persona' && scopeId === persona.id}
                    onClick={() => switchScope('persona', persona.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <span
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.55rem]',
            following
              ? 'border-brass-400/30 bg-brass-400/[0.07] text-brass-200'
              : 'border-jade-400/25 bg-jade-400/[0.06] text-jade-300',
          )}
        >
          <span className={cn('size-1.5 rounded-full', following ? 'bg-brass-300' : 'bg-jade-400')} />
          {following ? `跟随中 · ${inheritedLabel}` : '独立副本'}
        </span>

        <p className="hidden min-w-0 flex-1 truncate text-[0.55rem] text-mist-600 lg:block">
          {scope === 'global'
            ? '全局模板是所有未单独保存副本的渠道与人格卡继承的默认管线。'
            : following
              ? '当前没有独立副本；画布上的任何修改都会自动为这个作用域建立副本。'
              : '这个作用域拥有自己的副本，修改不会影响其他渠道或人格卡。'}
        </p>

        <div className="ml-auto flex items-center gap-1.5">
          {following && scope !== 'global' && (
            <button
              type="button"
              onClick={createCopy}
              className="flex items-center gap-1.5 rounded-lg border border-brass-400/25 bg-brass-400/[0.06] px-2.5 py-1.5 text-[0.58rem] text-brass-300 transition hover:bg-brass-400/[0.14]"
            >
              <CopyPlus className="size-3" strokeWidth={1.8} />
              创建独立副本
            </button>
          )}
          {(scope === 'global' || !following) && (
            <button
              type="button"
              onClick={() => void followGraph()}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.58rem] transition',
                followArmed
                  ? 'border-signal-400/40 bg-signal-400/[0.08] text-signal-400'
                  : 'border-mist-100/[0.1] text-mist-500 hover:border-mist-100/[0.2] hover:text-mist-200',
              )}
            >
              <RotateCcw className="size-3" strokeWidth={1.8} />
              {followArmed
                ? '再次点击确认'
                : scope === 'global'
                  ? '恢复默认'
                  : '恢复跟随'}
            </button>
          )}
        </div>
      </div>

      {degradedReason && (
        <p className="border-b border-brass-400/20 bg-brass-400/[0.06] px-4 py-1.5 text-[0.58rem] text-brass-200">
          当前展示的是内置默认图：{degradedReason}。修复存储中的图后刷新页面即可恢复。
        </p>
      )}

      {saveState === 'conflict' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-signal-400/20 bg-signal-400/[0.06] px-4 py-1.5 text-[0.58rem] text-signal-400">
          <span>保存冲突：{saveError}</span>
          <button
            type="button"
            onClick={() => void reloadLatest()}
            className="rounded-full border border-signal-400/40 px-2.5 py-0.5 text-[0.56rem] text-signal-400 transition hover:bg-signal-400/[0.1]"
          >
            载入最新版本（放弃本地修改）
          </button>
        </div>
      )}

      {saveState === 'error' && saveError && (
        <p className="border-b border-signal-400/20 bg-signal-400/[0.06] px-4 py-1.5 text-[0.58rem] text-signal-400">
          保存失败：{saveError}
        </p>
      )}

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <PipelineCanvas
            ref={canvasRef}
            graph={graph}
            catalog={catalog}
            selection={selection}
            providers={providers}
            nodeRuns={nodeRuns}
            debugMode={debugMode}
            onSelect={setSelection}
            onMoveNode={moveNode}
            onResizeNode={resizeNode}
            onUpdateNodeConfig={updateNodeConfig}
            onCreateVariable={createVariable}
            onAddNodeInput={addNodeInput}
            onRemoveNodeInput={removeNodeInput}
            onOpenNodeHelp={setHelpType}
            onConnect={connect}
            onConnectError={flash}
          />
        </div>

        <aside className="hidden min-h-0 w-[23rem] shrink-0 flex-col overflow-hidden border-l border-mist-100/[0.07] bg-ink-900/35 lg:flex">
          <PipelineInspector
            graph={graph}
            catalog={catalog}
            selection={selection}
            providers={providers}
            debugMode={debugMode}
            nodeRuns={nodeRuns}
            onRenameGraph={(name) =>
              applyGraph((current) => ({ ...current, name }))
            }
            onUpdateNode={updateNode}
            onUpdateNodeConfig={updateNodeConfig}
            onUpdateEdge={updateEdge}
            onAddVariable={addVariable}
            onCreateVariable={createVariable}
            onRenameVariable={renameVariable}
            onUpdateVariableValue={updateVariableValue}
            onDeleteVariable={deleteVariable}
            onDelete={deleteSelection}
          />
          <PipelineRunPanel
            runs={runsQuery.data ?? []}
            pending={runsQuery.isPending}
            refreshing={runsQuery.isFetching}
            selectedRunId={selectedRunId}
            selectedRun={detailQuery.data}
            onSelectRun={setSelectedRunId}
            onRefresh={() => void runsQuery.refetch()}
          />
        </aside>
      </div>

      {helpEntry && <PipelineNodeHelp entry={helpEntry} onClose={() => setHelpType(null)} />}

      {debugOpen && (
        <PipelineDebugPanel
          scope={scope}
          scopeId={scopeId}
          scopeLabel={currentScopeLabel}
          onClose={() => setDebugOpen(false)}
          onCompleted={handleDebugCompleted}
        />
      )}

      {notice && (
        <div className="pointer-events-none absolute left-1/2 top-[4.4rem] z-50 -translate-x-1/2 rounded-full border border-brass-400/30 bg-ink-900/95 px-3.5 py-1.5 text-[0.6rem] text-brass-200 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.9)]">
          {notice}
        </div>
      )}

      {!runsQuery.isPending && (
        <div
          className={cn(
            'pointer-events-none absolute bottom-4 right-4 z-30 hidden items-center gap-2 rounded-full border px-3 py-1.5 xl:flex',
            debugMode
              ? 'border-brass-400/30 bg-ink-950/85'
              : 'border-mist-100/[0.08] bg-ink-950/80',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              detailQuery.data?.status === 'RUNNING'
                ? 'animate-pulse bg-brass-300'
                : debugMode
                  ? 'bg-brass-300'
                  : selectedRunId
                    ? 'bg-jade-400'
                    : 'bg-mist-600',
            )}
          />
          <span className="font-mono text-[0.52rem] uppercase tracking-[0.12em] text-mist-500">
            {debugMode
              ? `调试模式 · ${runsQuery.data?.length ?? 0} 次运行 · 叠加 ${nodeRuns.size} 节点`
              : selectedRunId
                ? `叠加运行 ${nodeRuns.size} 节点`
                : '未叠加运行轨迹'}
          </span>
        </div>
      )}
    </div>
  );
}

function ScopeSection({ label, count }: { label: string; count: number }) {
  return (
    <p className="mt-1.5 flex items-center justify-between px-2 pb-1 pt-1 font-mono text-[0.46rem] uppercase tracking-[0.18em] text-mist-600">
      <span>{label}</span>
      <span>{count}</span>
    </p>
  );
}

function ScopeOption({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition',
        active
          ? 'bg-brass-400/[0.1] text-brass-100'
          : 'text-mist-300 hover:bg-mist-100/[0.05]',
      )}
    >
      <span
        className={cn(
          'grid size-5 shrink-0 place-items-center rounded-md border',
          active
            ? 'border-brass-400/40 text-brass-300'
            : 'border-mist-100/[0.12] text-mist-600',
        )}
      >
        {active ? (
          <CheckCircle2 className="size-3" strokeWidth={2} />
        ) : (
          <span className="size-1 rounded-full bg-mist-600" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.64rem]">{label}</span>
        <span className="block truncate font-mono text-[0.48rem] text-mist-600">{hint}</span>
      </span>
    </button>
  );
}

function SaveBadge({ state, dirty }: { state: SaveState; dirty: boolean }) {
  const label =
    state === 'saving'
      ? '保存中'
      : state === 'conflict'
        ? '保存冲突'
        : state === 'error'
          ? '保存失败'
          : dirty
            ? '未保存'
            : '已保存';
  const tone =
    state === 'error' || state === 'conflict'
      ? 'text-signal-400'
      : state === 'saving' || dirty
        ? 'text-brass-300'
        : 'text-jade-300';
  const dot =
    state === 'error' || state === 'conflict'
      ? 'bg-signal-400'
      : state === 'saving'
        ? 'bg-brass-300 animate-pulse'
        : dirty
          ? 'bg-brass-300'
          : 'bg-jade-400';

  return (
    <span className={cn('flex items-center gap-1.5 text-[0.55rem]', tone)}>
      <span className={cn('size-1.5 rounded-full', dot)} />
      {label}
    </span>
  );
}

function AddNodeMenu({
  catalog,
  onAdd,
}: {
  catalog: ChatPipelineNodeType[];
  onAdd: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const categories = (
    ['system', 'ai', 'data', 'variable', 'media', 'text', 'logic', 'flow', 'note'] as const
  ).map((category) => ({
    category,
    style: CATEGORY_STYLE[category],
    items: catalog.filter((entry) => entry.category === category && !entry.system),
  }));

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.62rem] transition',
          open
            ? 'border-brass-400/40 bg-brass-400/[0.1] text-brass-200'
            : 'border-brass-400/25 bg-brass-400/[0.06] text-brass-300 hover:bg-brass-400/[0.12]',
        )}
      >
        <Plus className="size-3" strokeWidth={2} />
        添加节点
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[19rem] overflow-y-auto rounded-xl border border-mist-100/[0.1] bg-ink-900/97 p-2 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl">
          {categories.map(({ category, style, items }) => {
            const Icon = style.icon;
            if (items.length === 0) {
              return null;
            }
            return (
              <div key={category} className="mb-1 last:mb-0">
                <p className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 font-mono text-[0.48rem] uppercase tracking-[0.16em] text-mist-600">
                  <Icon className={cn('size-2.5', style.text)} strokeWidth={1.8} />
                  {style.label}
                </p>
                {items.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => {
                      onAdd(item.type);
                      setOpen(false);
                    }}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-mist-100/[0.05]"
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border',
                        style.border,
                        style.background,
                        style.text,
                      )}
                    >
                      <Icon className="size-3" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[0.64rem] text-mist-200">{item.label}</span>
                        <span className="truncate font-mono text-[0.46rem] text-mist-600">
                          {item.type}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[0.52rem] text-mist-600">
                        {item.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PipelineSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-mist-100/[0.07] px-4">
        <div className="size-8 animate-pulse rounded-lg bg-ink-800" />
        <div className="h-4 w-40 animate-pulse rounded bg-ink-800" />
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 bg-ink-950/20" />
        {[
          { left: '12%', top: '20%' },
          { left: '40%', top: '38%' },
          { left: '68%', top: '22%' },
          { left: '66%', top: '60%' },
          { left: '16%', top: '62%' },
        ].map((position, index) => (
          <div
            key={index}
            className="absolute h-[8.5rem] w-[15.25rem] animate-pulse rounded-2xl border border-mist-100/[0.06] bg-ink-900/60"
            style={position}
          />
        ))}
        <div className="absolute inset-x-0 bottom-5 flex justify-center">
          <span className="flex items-center gap-2 rounded-full border border-mist-100/[0.08] bg-ink-950/70 px-3 py-1.5 text-[0.58rem] text-mist-500">
            <CheckCircle2 className="size-3 text-brass-300" strokeWidth={1.7} />
            正在读取画布
          </span>
        </div>
      </div>
    </div>
  );
}

