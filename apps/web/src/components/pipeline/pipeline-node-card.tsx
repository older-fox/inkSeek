import type {
  ChatPipelineGraphNode,
  ChatPipelineIoField,
  ChatPipelineIoKind,
  ChatPipelineNodeRunSummary,
  ChatPipelineNodeType,
} from '@inkseek/shared';
import { canConnectPipelineKinds } from '@inkseek/shared';
import { cn } from '@/lib/cn';
import {
  CARD_HEADER_HEIGHT,
  CARD_WIDTH,
  CATEGORY_STYLE,
  IO_KIND_DOT,
  IO_KIND_STYLE,
  NODE_STATUS_STYLE,
  PORT_ROW_HEIGHT,
  categoryOf,
  formatConfigValue,
  formatDuration,
} from './pipeline-ui';
import { PipelineSelect } from './pipeline-select';

interface PipelineNodeCardProps {
  node: ChatPipelineGraphNode;
  definition: ChatPipelineNodeType | null;
  selected: boolean;
  run: ChatPipelineNodeRunSummary | undefined;
  /** Kind currently being dragged from an output port, for compatibility cues. */
  dragKind: ChatPipelineIoKind | null;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onStartConnect: (event: React.PointerEvent<HTMLButtonElement>, portKey: string) => void;
  onUpdateNodeConfig: (id: string, key: string, value: unknown) => void;
}

export function PipelineNodeCard({
  node,
  definition,
  selected,
  run,
  dragKind,
  onPointerDown,
  onStartConnect,
  onUpdateNodeConfig,
}: PipelineNodeCardProps) {
  const category = CATEGORY_STYLE[categoryOf(node, definition ? [definition] : [])];
  const Icon = category.icon;
  const status = run ? NODE_STATUS_STYLE[run.status] : null;
  const inputs = definition?.inputs ?? [];
  const outputs = definition?.outputs ?? [];
  const rows = Math.max(1, inputs.length, outputs.length);
  const configEntries = (definition?.fields ?? [])
    .map((field) => ({ field, value: node.config?.[field.key] }))
    .filter((entry) => entry.value !== undefined)
    .slice(0, 2);

  return (
    <article
      data-node-id={node.id}
      onPointerDown={onPointerDown}
      className={cn(
        'group pointer-events-auto absolute cursor-grab touch-none select-none rounded-2xl border bg-ink-900/90 backdrop-blur-md transition-[border-color,box-shadow] active:cursor-grabbing',
        selected
          ? 'z-20 border-brass-400/60 shadow-[0_0_0_1px_rgba(230,189,122,0.25),0_18px_40px_-24px_rgba(0,0,0,0.9)]'
          : status
            ? 'z-[1] ' + status.border
            : 'z-[1] border-mist-100/[0.09] hover:border-mist-100/[0.2]',
      )}
      style={{ left: node.position.x, top: node.position.y, width: CARD_WIDTH }}
    >
      <header
        className="flex items-start gap-2.5 overflow-hidden px-3.5 pt-3"
        style={{ height: CARD_HEADER_HEIGHT }}
      >
        <span
          className={cn(
            'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border',
            category.border,
            category.background,
            category.text,
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[0.8rem] font-medium text-mist-100">
              {definition?.label ?? node.type}
            </h3>
            {definition?.system && (
              <span className="rounded border border-brass-400/30 px-1 py-px font-mono text-[0.46rem] uppercase tracking-[0.1em] text-brass-300">
                系统
              </span>
            )}
            {node.join === 'any' && (
              <span className="rounded border border-mist-100/[0.12] px-1 py-px font-mono text-[0.48rem] uppercase tracking-[0.1em] text-mist-500">
                any
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-[0.57rem] text-mist-600">
            {node.id}
            <span className="mx-1 text-mist-600/60">·</span>
            {node.type}
          </p>
        </div>
        {status && run && (
          <span className={cn('flex shrink-0 items-center gap-1 text-[0.56rem]', status.text)}>
            <span className={cn('size-1.5 rounded-full', status.dot)} />
            {status.label}
            <span className="font-mono text-mist-600">{formatDuration(run.durationMs)}</span>
          </span>
        )}
      </header>

      <div className="grid grid-cols-2 gap-x-3 px-3.5" style={{ paddingTop: 6 }}>
        <div className="relative" style={{ height: rows * PORT_ROW_HEIGHT }}>
          {inputs.map((port, index) => (
            <InputPortRow
              key={port.key}
              port={port}
              index={index}
              dragKind={dragKind}
            />
          ))}
        </div>
        <div className="relative" style={{ height: rows * PORT_ROW_HEIGHT }}>
          {outputs.map((port, index) => (
            <OutputPortRow
              key={port.key}
              port={port}
              index={index}
              onStartConnect={onStartConnect}
            />
          ))}
        </div>
      </div>

      <div className="px-3.5 pb-3 pt-2">
        <p className="line-clamp-2 text-[0.6rem] leading-[1.15rem] text-mist-600">
          {definition?.description ?? '未注册的节点类型，运行时会被记为失败。'}
        </p>

        {configEntries.length > 0 && (
          <div className="mt-2.5 space-y-1.5 rounded-lg border border-mist-100/[0.06] bg-ink-950/50 px-2 py-2">
            {configEntries.map(({ field, value }) => {
              if (field.kind === 'select' && field.options?.length) {
                const current = typeof value === 'string' ? value : '';
                return (
                  <div key={field.key} className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[0.64rem] text-mist-500">
                      {field.label}
                    </span>
                    <PipelineSelect
                      value={current}
                      options={field.options}
                      onChange={(next) => onUpdateNodeConfig(node.id, field.key, next)}
                      ariaLabel={field.label}
                      variant="card"
                      menuTitle={field.label}
                      className="flex-1"
                    />
                  </div>
                );
              }

              return (
                <p
                  key={field.key}
                  className="flex min-w-0 gap-1.5 font-mono text-[0.56rem] leading-5"
                >
                  <span className="shrink-0 text-mist-600">{field.label}</span>
                  <span className="truncate text-mist-400">{formatConfigValue(value)}</span>
                </p>
              );
            })}
          </div>
        )}

        {run?.error && (
          <p className="mt-1.5 line-clamp-2 text-[0.56rem] leading-4 text-signal-400">
            {run.error}
          </p>
        )}
      </div>
    </article>
  );
}

function InputPortRow({
  port,
  index,
  dragKind,
}: {
  port: ChatPipelineIoField;
  index: number;
  dragKind: ChatPipelineIoKind | null;
}) {
  const compatible = dragKind !== null && canConnectPipelineKinds(dragKind, port.kind);
  const dimmed = dragKind !== null && !compatible;
  const kind = IO_KIND_STYLE[port.kind];

  return (
    <div
      className="absolute inset-x-0 flex items-center gap-1"
      style={{ top: index * PORT_ROW_HEIGHT, height: PORT_ROW_HEIGHT }}
    >
      <span
        data-port-in={port.key}
        title={portTitle(port, `输入 · ${kind.label}`)}
        className={cn(
          'absolute -left-[20px] size-3 rounded-full border bg-ink-950 transition',
          IO_KIND_DOT[port.kind],
          compatible && 'ring-2 ring-brass-400/50',
          dimmed && 'opacity-25',
        )}
      />
      <span className="min-w-0 flex-1 truncate text-[0.55rem] text-mist-400">{port.label}</span>
      <span
        className={cn(
          'shrink-0 rounded border px-1 font-mono text-[0.44rem]',
          kind.className,
          dimmed && 'opacity-40',
        )}
      >
        {kind.label}
        {port.optional ? '?' : ''}
        {port.multiple ? '⋯' : ''}
      </span>
    </div>
  );
}

function OutputPortRow({
  port,
  index,
  onStartConnect,
}: {
  port: ChatPipelineIoField;
  index: number;
  onStartConnect: (event: React.PointerEvent<HTMLButtonElement>, portKey: string) => void;
}) {
  const kind = IO_KIND_STYLE[port.kind];

  return (
    <div
      className="absolute inset-x-0 flex items-center justify-end gap-1"
      style={{ top: index * PORT_ROW_HEIGHT, height: PORT_ROW_HEIGHT }}
    >
      <span
        className={cn(
          'shrink-0 rounded border px-1 font-mono text-[0.44rem]',
          kind.className,
        )}
      >
        {kind.label}
      </span>
      <span className="min-w-0 truncate text-right text-[0.55rem] text-mist-300">
        {port.label}
      </span>
      <button
        type="button"
        title={`${portTitle(port, `输出 · ${kind.label}`)}\n拖到目标输入端口连线`}
        aria-label={`从 ${port.key} 连线`}
        onPointerDown={(event) => onStartConnect(event, port.key)}
        className="absolute -right-[20px] grid size-3 place-items-center rounded-full"
      >
        <span
          className={cn(
            'block size-3 rounded-full border transition hover:scale-125',
            IO_KIND_DOT[port.kind],
          )}
        />
      </button>
    </div>
  );
}

function portTitle(port: ChatPipelineIoField, prefix: string): string {
  return port.description ? `${prefix} · ${port.key}\n${port.description}` : `${prefix} · ${port.key}`;
}
