import type {
  ChatPipelineGraph,
  ChatPipelineGraphEdge,
  ChatPipelineGraphNode,
  ChatPipelineGraphSnapshot,
  ChatPipelineNodeType,
  SaveChatPipelineGraphInput,
} from '@inkseek/shared';
import { canConnectPipelineKinds } from '@inkseek/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
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
import { PipelineDocs } from '@/components/pipeline/pipeline-docs';
import { PipelineInspector } from '@/components/pipeline/pipeline-inspector';
import { PipelineRunPanel } from '@/components/pipeline/pipeline-run-panel';
import {
  CARD_WIDTH,
  CATEGORY_STYLE,
  IO_KIND_STYLE,
  wouldCreateCycle,
  type PipelineSelection,
} from '@/components/pipeline/pipeline-ui';
import { cn } from '@/lib/cn';
import { ApiError, api } from '@/lib/api';
import {
  pipelineGraphQuery,
  pipelineRunQuery,
  pipelineRunsQuery,
} from '@/lib/queries';

type SaveState = 'saved' | 'saving' | 'error' | 'conflict';

function toInput(graph: ChatPipelineGraph): SaveChatPipelineGraphInput {
  return {
    name: graph.name.trim() || '未命名消息图',
    nodes: graph.nodes,
    edges: graph.edges,
    expectedRevision: graph.revision,
  };
}

function readDegraded(snapshot: ChatPipelineGraphSnapshot): string | null {
  return snapshot.degraded
    ? (snapshot.degradedReason ?? '存储中的管线图无法解析')
    : null;
}

export function MessagePipelinePage() {
  const queryClient = useQueryClient();
  const graphQuery = useQuery(pipelineGraphQuery);
  const runsQuery = useQuery(pipelineRunsQuery);

  const [graph, setGraph] = useState<ChatPipelineGraph | null>(null);
  const [catalog, setCatalog] = useState<ChatPipelineNodeType[]>([]);
  const [selection, setSelection] = useState<PipelineSelection>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [degradedReason, setDegradedReason] = useState<string | null>(null);

  const graphRef = useRef<ChatPipelineGraph | null>(null);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const editSeq = useRef(0);
  const saveLoopRef = useRef<Promise<void> | null>(null);
  const initialized = useRef(false);
  const runInitialized = useRef(false);
  const noticeTimer = useRef<number | null>(null);
  const canvasRef = useRef<PipelineCanvasHandle>(null);

  useEffect(() => {
    if (!graphQuery.data || initialized.current) {
      return;
    }
    initialized.current = true;
    graphRef.current = graphQuery.data.graph;
    setGraph(graphQuery.data.graph);
    setCatalog(graphQuery.data.catalog);
    setDegradedReason(readDegraded(graphQuery.data));
  }, [graphQuery.data]);

  useEffect(() => {
    if (runInitialized.current) {
      return;
    }
    const latest = runsQuery.data?.[0];
    if (latest) {
      runInitialized.current = true;
      setSelectedRunId(latest.id);
    }
  }, [runsQuery.data]);

  const detailQuery = useQuery(pipelineRunQuery(selectedRunId ?? ''));
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

      let failed = false;
      const loop = (async () => {
        while (dirtyRef.current && graphRef.current) {
          dirtyRef.current = false;
          setDirty(false);
          setSaveState('saving');
          const seq = editSeq.current;
          try {
            const snapshot = await api.savePipelineGraph(toInput(graphRef.current));
            setCatalog(snapshot.catalog);
            setDegradedReason(readDegraded(snapshot));
            // Merge only the write token synchronously: local nodes/edges may be
            // newer than the response, and the next save must send the new revision.
            const current = graphRef.current;
            if (current) {
              const next = {
                ...current,
                version: snapshot.graph.version,
                revision: snapshot.graph.revision,
                schemaVersion: snapshot.graph.schemaVersion,
                updatedAt: snapshot.graph.updatedAt,
              };
              graphRef.current = next;
              setGraph(next);
            }
            queryClient.setQueryData(pipelineGraphQuery.queryKey, snapshot);
            setSaveError(null);
            setSaveState('saved');
            if (editSeq.current !== seq) {
              dirtyRef.current = true;
              setDirty(true);
            }
          } catch (error) {
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
        if (!failed && dirtyRef.current) {
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
      const input = targetDefinition?.inputs.find((port) => port.key === toPort);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      if (!selection) {
        return;
      }
      event.preventDefault();
      deleteSelection();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelection, selection]);

  const addNode = (type: string) => {
    const definition = catalog.find((entry) => entry.type === type);
    const current = graphRef.current;
    if (!definition || !current) {
      return;
    }

    const base = type.split('.').slice(1).join('-') || 'node';
    let id = base;
    let suffix = 2;
    while (current.nodes.some((node) => node.id === id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }

    const center = canvasRef.current?.center() ?? { x: 240, y: 240 };
    const cascade = (current.nodes.length % 4) * 18;
    const config =
      Object.keys(definition.defaultConfig).length > 0
        ? (JSON.parse(JSON.stringify(definition.defaultConfig)) as Record<string, unknown>)
        : null;

    applyGraph((graph) => ({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id,
          type,
          config,
          join: definition.defaultJoin ?? 'all',
          position: {
            x: Math.max(16, Math.round(center.x - CARD_WIDTH / 2 + cascade)),
            y: Math.max(16, Math.round(center.y - 60 + cascade)),
          },
        },
      ],
    }));
    setSelection({ kind: 'node', id });
  };

  const resetGraph = async () => {
    if (!resetArmed) {
      setResetArmed(true);
      window.setTimeout(() => setResetArmed(false), 3200);
      return;
    }
    if (saveState === 'saving') {
      flash('正在保存，稍后再重置');
      return;
    }

    setResetArmed(false);
    try {
      const snapshot = await api.resetPipelineGraph();
      conflictRef.current = false;
      editSeq.current += 1;
      dirtyRef.current = false;
      setDirty(false);
      graphRef.current = snapshot.graph;
      setGraph(snapshot.graph);
      setCatalog(snapshot.catalog);
      setDegradedReason(readDegraded(snapshot));
      setSelection(null);
      setSaveState('saved');
      setSaveError(null);
      queryClient.setQueryData(pipelineGraphQuery.queryKey, snapshot);
      window.requestAnimationFrame(() => canvasRef.current?.fit());
    } catch (error) {
      flash(error instanceof Error ? error.message : String(error));
    }
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

  if (graphQuery.isPending || !graph) {
    return <PipelineSkeleton />;
  }

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
            onClick={() => setDocsOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-mist-100/[0.1] px-2.5 py-1.5 text-[0.62rem] text-mist-400 transition hover:border-brass-400/30 hover:text-brass-200"
          >
            <BookOpen className="size-3" strokeWidth={1.8} />
            节点文档
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
          <button
            type="button"
            onClick={() => void resetGraph()}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.6rem] transition',
              resetArmed
                ? 'border-signal-400/40 bg-signal-400/[0.08] text-signal-400'
                : 'border-mist-100/[0.1] text-mist-500 hover:border-mist-100/[0.2] hover:text-mist-200',
            )}
          >
            <RotateCcw className="size-3" strokeWidth={1.8} />
            {resetArmed ? '再次点击确认' : '重置'}
          </button>
        </div>
      </header>

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
            nodeRuns={nodeRuns}
            onSelect={setSelection}
            onMoveNode={moveNode}
            onUpdateNodeConfig={updateNodeConfig}
            onConnect={connect}
            onConnectError={flash}
          />
        </div>

        <aside className="hidden min-h-0 w-[23rem] shrink-0 flex-col overflow-hidden border-l border-mist-100/[0.07] bg-ink-900/35 lg:flex">
          <PipelineInspector
            graph={graph}
            catalog={catalog}
            selection={selection}
            onRenameGraph={(name) =>
              applyGraph((current) => ({ ...current, name }))
            }
            onUpdateNode={updateNode}
            onUpdateNodeConfig={updateNodeConfig}
            onUpdateEdge={updateEdge}
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

      {docsOpen && <PipelineDocs catalog={catalog} onClose={() => setDocsOpen(false)} />}

      {notice && (
        <div className="pointer-events-none absolute left-1/2 top-[4.4rem] z-50 -translate-x-1/2 rounded-full border border-brass-400/30 bg-ink-900/95 px-3.5 py-1.5 text-[0.6rem] text-brass-200 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.9)]">
          {notice}
        </div>
      )}

      {!runsQuery.isPending && (
        <div className="pointer-events-none absolute bottom-4 right-4 z-30 hidden items-center gap-2 rounded-full border border-mist-100/[0.08] bg-ink-950/80 px-3 py-1.5 xl:flex">
          <span
            className={cn(
              'size-1.5 rounded-full',
              selectedRunId ? 'bg-jade-400' : 'bg-mist-600',
            )}
          />
          <span className="font-mono text-[0.52rem] uppercase tracking-[0.12em] text-mist-500">
            {selectedRunId ? `叠加运行 ${nodeRuns.size} 节点` : '未叠加运行轨迹'}
          </span>
        </div>
      )}
    </div>
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

  const categories = (['system', 'data', 'text', 'logic', 'flow'] as const).map((category) => ({
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

