import type {
  ChatPipelineGraph,
  ChatPipelineGraphNode,
  ChatPipelineIoKind,
  ChatPipelineNodePosition,
  ChatPipelineNodeRunSummary,
  ChatPipelineNodeType,
} from '@inkseek/shared';
import { canConnectPipelineKinds } from '@inkseek/shared';
import { Maximize2, Minus, Plus } from 'lucide-react';
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
import {
  CARD_WIDTH,
  cardHeight,
  edgeMidpoint,
  edgePath,
  formatConditionValue,
  inputPoint,
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
  nodeRuns: Map<string, ChatPipelineNodeRunSummary>;
  onSelect: (selection: PipelineSelection) => void;
  onMoveNode: (id: string, position: ChatPipelineNodePosition) => void;
  onUpdateNodeConfig: (id: string, key: string, value: unknown) => void;
  onConnect: (from: string, fromPort: string, to: string, toPort: string) => void;
  onConnectError: (message: string) => void;
}

const MIN_SCALE = 0.35;
const MAX_SCALE = 1.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
      nodeRuns,
      onSelect,
      onMoveNode,
      onUpdateNodeConfig,
      onConnect,
      onConnectError,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
    const viewportRef = useRef(viewport);
    const [connecting, setConnecting] = useState<ConnectionDraft | null>(null);
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
        Math.max(...graph.nodes.map((node) => node.position.x + CARD_WIDTH)) + 72;
      const maxY =
        Math.max(
          ...graph.nodes.map(
            (node) =>
              node.position.y + cardHeight(catalogByType.get(node.type) ?? null),
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
        if (!targetDefinition) {
          return;
        }

        // Dropping on a card body picks the first compatible input port that is
        // still free; dropping on a port uses it even if the kinds disagree so
        // the page can explain the rejection.
        let toPort = portElement?.getAttribute('data-port-in') ?? null;
        if (!toPort) {
          const candidate = targetDefinition.inputs.find(
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
              const targetRun = nodeRuns.get(edge.to);
              const tone = targetRun
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
                  'absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border px-2 py-0.5 font-mono text-[0.48rem] transition',
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

          {graph.nodes.map((node) => (
            <PipelineNodeCard
              key={node.id}
              node={node}
              definition={definitions.get(node.type) ?? null}
              selected={selection?.kind === 'node' && selection.id === node.id}
              run={nodeRuns.get(node.id)}
              dragKind={connecting?.kind ?? null}
              onPointerDown={(event) => beginNodeDrag(event, node)}
              onStartConnect={(event, portKey) => beginConnect(event, node, portKey)}
              onUpdateNodeConfig={onUpdateNodeConfig}
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
          拖动卡片移动 · 从输出端口拖到匹配的输入端口 · Delete 删除选中
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
