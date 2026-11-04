import type {
  ChatPipelineGraph,
  ChatPipelineGraphNode,
  ChatPipelineIoKind,
  ChatPipelineNodePosition,
  ChatPipelineNodeRunSummary,
  ChatPipelineNodeSize,
  ChatPipelineNodeType,
} from '@inkseek/shared';
import { canConnectPipelineKinds, resolvePipelineNodeInputs } from '@inkseek/shared';
import { ChevronDown, Maximize2, Minus, Plus } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/cn';
import { PipelineNodeCard } from './pipeline-node-card';
import type { ProviderOption } from './pipeline-config-options';
import {
  MIN_CARD_HEIGHT,
  MIN_CARD_WIDTH,
  edgeCurvePoint,
  edgeMidpoint,
  edgePath,
  formatConditionValue,
  formatRuntimeDetail,
  formatRuntimePreview,
  inputPoint,
  nodeHeight,
  nodeWidth,
  outputPoint,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type PipelineSelection,
} from './pipeline-ui';

export interface PipelineCanvasHandle {
  fit(): void;
  center(): ChatPipelineNodePosition;
}

interface PipelineCanvasProps {
  graph: ChatPipelineGraph;
  catalog: ChatPipelineNodeType[];
  selection: PipelineSelection;
  /** Model providers for provider/model selects rendered on card faces. */
  providers: ProviderOption[];
  nodeRuns: Map<string, ChatPipelineNodeRunSummary>;
  /** Shows the runtime values each edge carried for the overlaid run. */
  debugMode: boolean;
  onSelect: (selection: PipelineSelection) => void;
  onMoveNode: (id: string, position: ChatPipelineNodePosition) => void;
  onResizeNode: (id: string, size: ChatPipelineNodeSize) => void;
  onUpdateNodeConfig: (id: string, key: string, value: unknown) => void;
  onCreateVariable: (key: string) => void;
  onAddNodeInput: (id: string) => void;
  onRemoveNodeInput: (id: string, key: string) => void;
  onOpenNodeHelp: (type: string) => void;
  onConnect: (from: string, fromPort: string, to: string, toPort: string) => void;
  onConnectError: (message: string) => void;
}

const MIN_SCALE = 0.35;
const MAX_SCALE = 1.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function runtimePreview(run: ChatPipelineNodeRunSummary | undefined, value: unknown): string {
  if (!run) {
    return '未运行';
  }
  if (run.status === 'RUNNING') {
    return '运行中…';
  }
  if (run.status === 'SKIPPED') {
    return '已跳过';
  }
  if (run.status === 'CANCELLED') {
    return '已取消';
  }
  if (run.status === 'FAILED') {
    return '失败';
  }
  return formatRuntimePreview(value);
}

/** The value an edge carried; the target port only mirrors it. */
function edgeRuntimePreview(
  sourceRun: ChatPipelineNodeRunSummary | undefined,
  targetRun: ChatPipelineNodeRunSummary | undefined,
  value: unknown,
): string {
  if (sourceRun?.status === 'SUCCEEDED') {
    return targetRun?.status === 'SKIPPED' ? '已跳过' : formatRuntimePreview(value);
  }
  return runtimePreview(sourceRun, value);
}

/** Full value for the expanded pill; plain text stays readable. */
function runtimeDetail(value: unknown): string {
  return typeof value === 'string' ? value : formatRuntimeDetail(value);
}

interface ConnectionDraft {
  from: string;
  fromPort: string;
  kind: ChatPipelineIoKind;
  start: ChatPipelineNodePosition;
  pointer: ChatPipelineNodePosition;
}

export const PipelineCanvas = forwardRef<PipelineCanvasHandle, PipelineCanvasProps>(
  function PipelineCanvas(
    {
      graph,
      catalog,
      selection,
      providers,
      nodeRuns,
      debugMode,
      onSelect,
      onMoveNode,
      onResizeNode,
      onUpdateNodeConfig,
      onCreateVariable,
      onAddNodeInput,
      onRemoveNodeInput,
      onOpenNodeHelp,
      onConnect,
      onConnectError,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
    const viewportRef = useRef(viewport);
    const [connecting, setConnecting] = useState<ConnectionDraft | null>(null);
    const [expandedEdge, setExpandedEdge] = useState<string | null>(null);
    const fittedRef = useRef(false);

    useEffect(() => {
      viewportRef.current = viewport;
    }, [viewport]);

    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const definitions = new Map(catalog.map((entry) => [entry.type, entry]));

    const fit = useCallback(() => {
      const element = containerRef.current;
      if (!element || graph.nodes.length === 0) {
        return;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }

      const catalogByType = new Map(catalog.map((entry) => [entry.type, entry]));
      const minX = Math.min(...graph.nodes.map((node) => node.position.x)) - 72;
      const minY = Math.min(...graph.nodes.map((node) => node.position.y)) - 72;
      const maxX =
        Math.max(...graph.nodes.map((node) => node.position.x + nodeWidth(node))) + 72;
      const maxY =
        Math.max(
          ...graph.nodes.map(
            (node) => node.position.y + nodeHeight(node, catalogByType.get(node.type) ?? null),
          ),
        ) + 72;
      const width = maxX - minX;
      const height = maxY - minY;
      const scale = clamp(
        Math.min((rect.width - 48) / width, (rect.height - 48) / height),
        MIN_SCALE,
        1.05,
      );

      setViewport({
        scale,
        x: (rect.width - width * scale) / 2 - minX * scale,
        y: (rect.height - height * scale) / 2 - minY * scale,
      });
    }, [graph.nodes, catalog]);

    const center = useCallback((): ChatPipelineNodePosition => {
      const element = containerRef.current;
      if (!element) {
        return { x: 120, y: 120 };
      }
      const rect = element.getBoundingClientRect();
      const current = viewportRef.current;
      return {
        x: (rect.width / 2 - current.x) / current.scale,
        y: (rect.height / 2 - current.y) / current.scale,
      };
    }, []);

    useImperativeHandle(ref, () => ({ fit, center }), [fit, center]);

    useEffect(() => {
      if (fittedRef.current || graph.nodes.length === 0) {
        return;
      }
      fittedRef.current = true;
      const frame = requestAnimationFrame(fit);
      return () => cancelAnimationFrame(frame);
    }, [fit, graph.nodes.length]);

    useEffect(() => {
      const element = containerRef.current;
      if (!element) {
        return;
      }
      const handleWheel = (event: WheelEvent) => {
        event.preventDefault();
        const rect = element.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        setViewport((current) => {
          const scale = clamp(current.scale * (event.deltaY < 0 ? 1.08 : 0.92), MIN_SCALE, MAX_SCALE);
          const ratio = scale / current.scale;
          return {
            scale,
            x: px - (px - current.x) * ratio,
            y: py - (py - current.y) * ratio,
          };
        });
      };
      element.addEventListener('wheel', handleWheel, { passive: false });
      return () => element.removeEventListener('wheel', handleWheel);
    }, []);

    const toWorld = useCallback((clientX: number, clientY: number): ChatPipelineNodePosition => {
      const element = containerRef.current;
      if (!element) {
        return { x: 0, y: 0 };
      }
      const rect = element.getBoundingClientRect();
      const current = viewportRef.current;
      return {
        x: (clientX - rect.left - current.x) / current.scale,
        y: (clientY - rect.top - current.y) / current.scale,
      };
    }, []);

    const zoomBy = (factor: number) => {
      const element = containerRef.current;
      if (!element) {
        return;
      }
      const rect = element.getBoundingClientRect();
      const px = rect.width / 2;
      const py = rect.height / 2;
      setViewport((current) => {
        const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
        const ratio = scale / current.scale;
        return {
          scale,
          x: px - (px - current.x) * ratio,
          y: py - (py - current.y) * ratio,
        };
      });
    };

    const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      onSelect(null);
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = viewportRef.current.x;
      const originY = viewportRef.current.y;
      const handleMove = (moveEvent: PointerEvent) => {
        setViewport((current) => ({
          ...current,
          x: originX + moveEvent.clientX - startX,
          y: originY + moveEvent.clientY - startY,
        }));
      };
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    };

    const beginNodeDrag = (
      event: React.PointerEvent<HTMLElement>,
      node: ChatPipelineGraphNode,
    ) => {
      if (event.button !== 0) {
        return;
      }
      event.stopPropagation();
      onSelect({ kind: 'node', id: node.id });
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = node.position.x;
      const originY = node.position.y;
      const scale = viewportRef.current.scale;
      let moved = false;

      const handleMove = (moveEvent: PointerEvent) => {
        const dx = (moveEvent.clientX - startX) / scale;
        const dy = (moveEvent.clientY - startY) / scale;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 2) {
          return;
        }
        moved = true;
        onMoveNode(node.id, {
          x: Math.round(originX + dx),
          y: Math.round(originY + dy),
        });
      };
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    };

    const beginResize = (
      event: React.PointerEvent<HTMLButtonElement>,
      node: ChatPipelineGraphNode,
    ) => {
      if (event.button !== 0) {
        return;
      }
      const definition = definitions.get(node.type);
      if (!definition?.resizable) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onSelect({ kind: 'node', id: node.id });
      const startX = event.clientX;
      const startY = event.clientY;
      const scale = viewportRef.current.scale;
      const cardElement = event.currentTarget.closest('[data-node-id]');
      const rendered = cardElement?.getBoundingClientRect();
      const startWidth = node.size?.width ?? (rendered ? rendered.width / scale : nodeWidth(node));
      const startHeight =
        node.size?.height ?? (rendered ? rendered.height / scale : nodeHeight(node, definition));

      const handleMove = (moveEvent: PointerEvent) => {
        onResizeNode(node.id, {
          width: Math.max(
            MIN_CARD_WIDTH,
            Math.round(startWidth + (moveEvent.clientX - startX) / scale),
          ),
          height: Math.max(
            MIN_CARD_HEIGHT,
            Math.round(startHeight + (moveEvent.clientY - startY) / scale),
          ),
        });
      };
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    };

    const beginConnect = (
      event: React.PointerEvent<HTMLButtonElement>,
      node: ChatPipelineGraphNode,
      portKey: string,
    ) => {
      if (event.button !== 0) {
        return;
      }
      const definition = definitions.get(node.type);
      const port = definition?.outputs.find((entry) => entry.key === portKey);
      if (!definition || !port) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setConnecting({
        from: node.id,
        fromPort: portKey,
        kind: port.kind,
        start: outputPoint(node, definition, portKey),
        pointer: toWorld(event.clientX, event.clientY),
      });

      const handleMove = (moveEvent: PointerEvent) => {
        const pointer = toWorld(moveEvent.clientX, moveEvent.clientY);
        setConnecting((current) => (current ? { ...current, pointer } : current));
      };
      const handleUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', handleMove);
        const element = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
        const portElement =
          element instanceof Element ? element.closest('[data-port-in]') : null;
        const cardElement =
          element instanceof Element ? element.closest('[data-node-id]') : null;
        const targetId = cardElement?.getAttribute('data-node-id') ?? null;
        setConnecting(null);

        if (!targetId || targetId === node.id) {
          return;
        }

        const targetNode = nodesById.get(targetId);
        const targetDefinition = targetNode ? definitions.get(targetNode.type) : undefined;
        if (!targetNode || !targetDefinition) {
          return;
        }

        // Dropping on a card body picks the first compatible input port that is
        // still free; dropping on a port uses it even if the kinds disagree so
        // the page can explain the rejection.
        let toPort = portElement?.getAttribute('data-port-in') ?? null;
        if (!toPort) {
          const candidate = resolvePipelineNodeInputs(targetDefinition, targetNode.config).find(
            (input) =>
              canConnectPipelineKinds(port.kind, input.kind) &&
              (input.multiple === true ||
                !graph.edges.some(
                  (edge) => edge.to === targetId && edge.toPort === input.key,
                )),
          );
          toPort = candidate?.key ?? null;
        }

        if (!toPort) {
          onConnectError('目标节点没有可用的匹配输入端口');
          return;
        }

        onConnect(node.id, portKey, targetId, toPort);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp, { once: true });
    };

    return (
      <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-ink-950/25">
        <div
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          onPointerDown={beginPan}
          style={{
            backgroundImage: 'radial-gradient(rgba(147, 160, 176, 0.16) 1px, transparent 1px)',
            backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(70% 60% at 50% 40%, rgba(8, 12, 18, 0) 0%, rgba(8, 12, 18, 0.42) 100%)',
          }}
        />

        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
        >
          <svg
            width={WORLD_WIDTH}
            height={WORLD_HEIGHT}
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
          >
            {graph.edges.map((edge, index) => {
              const source = nodesById.get(edge.from);
              const target = nodesById.get(edge.to);
              if (!source || !target) {
                return null;
              }
              const start = outputPoint(source, definitions.get(source.type) ?? null, edge.fromPort);
              const end = inputPoint(target, definitions.get(target.type) ?? null, edge.toPort);
              const path = edgePath(start, end);
              const selected = selection?.kind === 'edge' && selection.index === index;
              const sourceRun = nodeRuns.get(edge.from);
              const targetRun = nodeRuns.get(edge.to);
              const flowing =
                sourceRun?.status === 'RUNNING' || targetRun?.status === 'RUNNING';
              const tone = flowing
                ? 'stroke-brass-300/80'
                : targetRun
                  ? targetRun.status === 'SUCCEEDED'
                    ? 'stroke-jade-400/70'
                    : targetRun.status === 'FAILED'
                      ? 'stroke-signal-400/80'
                      : 'stroke-mist-600/45'
                  : 'stroke-mist-300/25';

              return (
                <g key={`${edge.from}-${edge.fromPort}-${edge.to}-${edge.toPort}-${index}`}>
                  <path
                    d={path}
                    fill="none"
                    className="pointer-events-auto cursor-pointer stroke-transparent"
                    strokeWidth={18}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onSelect({ kind: 'edge', index })}
                  />
                  <path
                    d={path}
                    fill="none"
                    strokeWidth={selected ? 2.4 : 1.4}
                    strokeDasharray={targetRun?.status === 'SKIPPED' ? '5 5' : undefined}
                    className={cn(
                      'pointer-events-none transition-[stroke]',
                      selected ? 'stroke-brass-300' : tone,
                    )}
                  />
                  {debugMode && flowing && (
                    <circle r={2.8} className="pointer-events-none fill-brass-200">
                      <animateMotion
                        dur="1.15s"
                        repeatCount="indefinite"
                        path={path}
                        keyPoints="0;1"
                        keyTimes="0;1"
                        calcMode="linear"
                      />
                    </circle>
                  )}
                </g>
              );
            })}

            {connecting && (
              <path
                d={edgePath(connecting.start, connecting.pointer)}
                fill="none"
                strokeWidth={1.8}
                strokeDasharray="6 5"
                className="stroke-brass-300/80"
              />
            )}
          </svg>

          {graph.edges.map((edge, index) => {
            if (!edge.when) {
              return null;
            }
            const source = nodesById.get(edge.from);
            const target = nodesById.get(edge.to);
            if (!source || !target) {
              return null;
            }
            const midpoint = edgeMidpoint(
              outputPoint(source, definitions.get(source.type) ?? null, edge.fromPort),
              inputPoint(target, definitions.get(target.type) ?? null, edge.toPort),
            );
            const selected = selection?.kind === 'edge' && selection.index === index;
            return (
              <button
                key={`label-${edge.from}-${edge.fromPort}-${edge.to}-${edge.toPort}-${index}`}
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onSelect({ kind: 'edge', index })}
                className={cn(
                  'pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border px-2 py-0.5 font-mono text-[0.48rem] transition',
                  selected
                    ? 'border-brass-400/50 bg-ink-950 text-brass-200'
                    : 'border-mist-100/[0.12] bg-ink-950/90 text-mist-400 hover:border-brass-400/30 hover:text-brass-200',
                )}
                style={{ left: midpoint.x, top: midpoint.y }}
              >
                {edge.when.field} = {formatConditionValue(edge.when.equals)}
              </button>
            );
          })}

          {debugMode &&
            graph.edges.map((edge, index) => {
              const source = nodesById.get(edge.from);
              const target = nodesById.get(edge.to);
              if (!source || !target) {
                return null;
              }
              const sourceRun = nodeRuns.get(edge.from);
              const targetRun = nodeRuns.get(edge.to);
              if (!sourceRun && !targetRun) {
                return null;
              }
              const start = outputPoint(
                source,
                definitions.get(source.type) ?? null,
                edge.fromPort,
              );
              const end = inputPoint(
                target,
                definitions.get(target.type) ?? null,
                edge.toPort,
              );
              const point = edgeCurvePoint(start, end, 0.34);
              const outputValue = recordOf(sourceRun?.output)?.[edge.fromPort];
              const targetDefinition = definitions.get(target.type) ?? null;
              const targetPort = targetDefinition
                ? resolvePipelineNodeInputs(targetDefinition, target.config).find(
                    (port) => port.key === edge.toPort,
                  )
                : undefined;
              // A multi-line input aggregates every incoming edge, so only the
              // source output belongs on this pill.
              const inputValue =
                targetPort?.multiple === true
                  ? undefined
                  : recordOf(recordOf(targetRun?.input)?.ports)?.[edge.toPort];
              const carried = outputValue !== undefined ? outputValue : inputValue;
              const key = `runtime-${edge.from}-${edge.fromPort}-${edge.to}-${edge.toPort}-${index}`;
              const selected = selection?.kind === 'edge' && selection.index === index;
              const expanded = expandedEdge === key;
              const expandable = carried !== undefined;
              const flowing = sourceRun?.status === 'SUCCEEDED' && targetRun?.status !== 'SKIPPED';

              // Pills for adjacent output rows would cover each other; lift the
              // upper rows clear of the lower ones so every pill stays clickable.
              const sourceOutputs = definitions.get(source.type)?.outputs ?? [];
              const rowOf = (portKey: string) =>
                Math.max(
                  0,
                  sourceOutputs.findIndex((port) => port.key === portKey),
                );
              const siblingRows = [
                ...new Set(
                  graph.edges
                    .filter((other) => other.from === edge.from)
                    .map((other) => rowOf(other.fromPort)),
                ),
              ].sort((a, b) => a - b);
              const lift = (siblingRows.length - 1 - siblingRows.indexOf(rowOf(edge.fromPort))) * 26;

              return (
                <div
                  key={key}
                  className={cn(
                    'pointer-events-auto absolute z-10 flex cursor-pointer flex-col gap-0.5 rounded-md border px-1.5 py-1 font-mono text-[0.46rem] leading-3.5 shadow-[0_10px_28px_-14px_rgba(0,0,0,0.95)] backdrop-blur-sm transition-[width,border-color]',
                    expanded ? 'w-[22rem]' : 'w-[11.5rem]',
                    selected
                      ? 'border-brass-400/50 bg-ink-950/[0.97]'
                      : 'border-mist-100/[0.14] bg-ink-950/92 hover:border-brass-400/35',
                  )}
                  style={{
                    left: point.x,
                    top: point.y,
                    transform: `translate(-50%, calc(-100% - 7px - ${lift}px))`,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    onSelect({ kind: 'edge', index });
                    if (expandable) {
                      setExpandedEdge((current) => (current === key ? null : key));
                    }
                  }}
                >
                  <span className="flex min-w-0 items-center gap-1">
                    <span
                      className={cn(
                        'size-1 shrink-0 rounded-full',
                        flowing ? 'bg-brass-400' : 'bg-mist-600',
                      )}
                    />
                    <span className="shrink-0 text-brass-300/85">{edge.fromPort}</span>
                    <span className="shrink-0 text-mist-600">→</span>
                    <span className="shrink-0 text-jade-300/85">{edge.toPort}</span>
                    {expandable && (
                      <ChevronDown
                        className={cn(
                          'ml-auto size-2 shrink-0 text-mist-600 transition-transform',
                          expanded && 'rotate-180',
                        )}
                        strokeWidth={2}
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      'min-w-0',
                      flowing ? 'text-mist-100' : 'text-mist-500',
                      expanded
                        ? 'max-h-[30vh] overflow-auto whitespace-pre-wrap break-all pr-1'
                        : 'truncate',
                    )}
                    onWheelCapture={expanded ? (event) => event.stopPropagation() : undefined}
                  >
                    {expanded && expandable
                      ? runtimeDetail(carried)
                      : edgeRuntimePreview(sourceRun, targetRun, carried)}
                  </span>
                </div>
              );
            })}

          {graph.nodes.map((node) => (
            <PipelineNodeCard
              key={node.id}
              node={node}
              definition={definitions.get(node.type) ?? null}
              selected={selection?.kind === 'node' && selection.id === node.id}
              run={nodeRuns.get(node.id)}
              dragKind={connecting?.kind ?? null}
              variables={graph.variables}
              providers={providers}
              onPointerDown={(event) => beginNodeDrag(event, node)}
              onStartConnect={(event, portKey) => beginConnect(event, node, portKey)}
              onUpdateNodeConfig={onUpdateNodeConfig}
              onCreateVariable={onCreateVariable}
              onAddInput={onAddNodeInput}
              onRemoveInput={onRemoveNodeInput}
              onOpenHelp={onOpenNodeHelp}
              onStartResize={(event) => beginResize(event, node)}
            />
          ))}
        </div>

        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 rounded-full border border-mist-100/[0.09] bg-ink-950/85 px-1.5 py-1 backdrop-blur">
          <button
            type="button"
            aria-label="缩小"
            onClick={() => zoomBy(0.88)}
            className="grid size-6 place-items-center rounded-full text-mist-500 transition hover:bg-mist-100/[0.06] hover:text-mist-200"
          >
            <Minus className="size-3" strokeWidth={1.8} />
          </button>
          <span className="w-10 text-center font-mono text-[0.54rem] text-mist-500">
            {Math.round(viewport.scale * 100)}%
          </span>
          <button
            type="button"
            aria-label="放大"
            onClick={() => zoomBy(1.14)}
            className="grid size-6 place-items-center rounded-full text-mist-500 transition hover:bg-mist-100/[0.06] hover:text-mist-200"
          >
            <Plus className="size-3" strokeWidth={1.8} />
          </button>
          <span className="mx-0.5 h-3.5 w-px bg-mist-100/[0.1]" />
          <button
            type="button"
            aria-label="适应画布"
            onClick={fit}
            className="grid size-6 place-items-center rounded-full text-mist-500 transition hover:bg-mist-100/[0.06] hover:text-mist-200"
          >
            <Maximize2 className="size-3" strokeWidth={1.8} />
          </button>
        </div>

        <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-mist-100/[0.07] bg-ink-950/70 px-3 py-1 font-mono text-[0.5rem] tracking-[0.04em] text-mist-600 backdrop-blur">
          拖动卡片移动 · 从输出端口拖到匹配的输入端口 · Ctrl+C / Ctrl+V 复制粘贴 · Delete 删除选中
        </p>

        {graph.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p className="text-[0.72rem] text-mist-500">画布是空的，从右上角添加一个节点开始。</p>
          </div>
        )}
      </div>
    );
  },
);
