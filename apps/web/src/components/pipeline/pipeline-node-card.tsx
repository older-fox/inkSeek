import type {
  ChatPipelineConfigField,
  ChatPipelineGraphNode,
  ChatPipelineIoField,
  ChatPipelineIoKind,
  ChatPipelineNodeRunSummary,
  ChatPipelineNodeType,
  ChatPipelineVariable,
} from '@inkseek/shared';
import { canConnectPipelineKinds, isPipelineConfigFieldVisible, resolvePipelineNodeInputs } from '@inkseek/shared';
import { MoveDiagonal2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  CARD_HEADER_HEIGHT,
  CATEGORY_STYLE,
  IO_KIND_DOT,
  IO_KIND_STYLE,
  NODE_STATUS_STYLE,
  PORT_ROW_HEIGHT,
  categoryOf,
  formatDuration,
  nodeWidth,
  noteLineCount,
  noteTextOf,
  variableSelectCreate,
} from './pipeline-ui';
import { PipelineSelect } from './pipeline-select';
import {
  dependentConfigResets,
  dynamicFieldOptions,
  type ProviderOption,
} from './pipeline-config-options';

interface PipelineNodeCardProps {
  node: ChatPipelineGraphNode;
  definition: ChatPipelineNodeType | null;
  selected: boolean;
  run: ChatPipelineNodeRunSummary | undefined;
  /** Kind currently being dragged from an output port, for compatibility cues. */
  dragKind: ChatPipelineIoKind | null;
  /** Variables declared on the graph, used by `pipeline-variables` selects. */
  variables: ChatPipelineVariable[];
  /** Model providers, used by `model-providers` / `provider-models` selects. */
  providers: ProviderOption[];
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onStartConnect: (event: React.PointerEvent<HTMLButtonElement>, portKey: string) => void;
  onUpdateNodeConfig: (id: string, key: string, value: unknown) => void;
  onCreateVariable: (key: string) => void;
  onAddInput: (id: string) => void;
  onRemoveInput: (id: string, key: string) => void;
  onOpenHelp: (type: string) => void;
  onStartResize: (event: React.PointerEvent<HTMLButtonElement>) => void;
}

export function PipelineNodeCard({
  node,
  definition,
  selected,
  run,
  dragKind,
  variables,
  providers,
  onPointerDown,
  onStartConnect,
  onUpdateNodeConfig,
  onCreateVariable,
  onAddInput,
  onRemoveInput,
  onOpenHelp,
  onStartResize,
}: PipelineNodeCardProps) {
  const category = CATEGORY_STYLE[categoryOf(node, definition ? [definition] : [])];
  const Icon = category.icon;
  const isNote = definition?.layout === true;
  const resizable = definition?.resizable === true;
  const width = nodeWidth(node);
  const fixedHeight = node.size?.height;
  const noteText = noteTextOf(node.config);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(noteText);
  const status = run ? NODE_STATUS_STYLE[run.status] : null;
  const inputs = definition ? resolvePipelineNodeInputs(definition, node.config) : [];
  const addable = definition?.dynamicInputs !== undefined;
  const outputs = definition?.outputs ?? [];
  const rows = Math.max(1, inputs.length + (addable ? 1 : 0), outputs.length);
  const configEntries = (definition?.fields ?? [])
    .filter((field) => isPipelineConfigFieldVisible(field, node.config))
    .map((field) => ({ field, value: node.config?.[field.key] }));

  useEffect(() => {
    if (!editingNote) {
      setNoteDraft(noteText);
    }
  }, [noteText, editingNote]);

  const commitNote = () => {
    setEditingNote(false);
    if (noteDraft !== noteText) {
      onUpdateNodeConfig(node.id, 'text', noteDraft);
    }
  };

  const beginNoteEdit = () => {
    setNoteDraft(noteText);
    setEditingNote(true);
  };

  return (
    <article
      data-node-id={node.id}
      onPointerDown={onPointerDown}
      className={cn(
        'group pointer-events-auto absolute flex cursor-grab touch-none select-none flex-col rounded-2xl border bg-ink-900/90 backdrop-blur-md transition-[border-color,box-shadow] active:cursor-grabbing',
        selected
          ? 'z-20 border-brass-400/60 shadow-[0_0_0_1px_rgba(230,189,122,0.25),0_18px_40px_-24px_rgba(0,0,0,0.9)]'
          : status
            ? 'z-[1] ' + status.border
            : isNote
              ? 'z-[1] border-[#bfa878]/25 hover:border-[#bfa878]/45'
              : 'z-[1] border-mist-100/[0.09] hover:border-mist-100/[0.2]',
      )}
      style={{
        left: node.position.x,
        top: node.position.y,
        width,
        ...(fixedHeight !== undefined ? { height: fixedHeight } : {}),
      }}
    >
      <header
        className="flex shrink-0 items-start gap-2.5 overflow-hidden px-3.5 pt-3"
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
            {node.join === 'any' && !isNote && (
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
        {definition && (
          <button
            type="button"
            title={`${definition.label} 帮助`}
            aria-label={`打开${definition.label}帮助`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onOpenHelp(node.type);
            }}
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-mist-100/[0.12] font-mono text-[0.58rem] leading-none text-mist-500 transition hover:border-brass-400/50 hover:bg-brass-400/[0.08] hover:text-brass-200"
          >
            ?
          </button>
        )}
      </header>

      {isNote ? (
        editingNote ? (
          <div className="px-3.5 pb-3 pt-2">
            <textarea
              autoFocus
              value={noteDraft}
              maxLength={4000}
              rows={Math.min(16, Math.max(3, noteLineCount(noteDraft) + 1))}
              spellCheck={false}
              aria-label="说明文字"
              placeholder="写一段注释……"
              onChange={(event) => setNoteDraft(event.target.value)}
              onBlur={commitNote}
              onFocus={(event) => {
                const element = event.currentTarget;
                element.setSelectionRange(element.value.length, element.value.length);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setNoteDraft(noteText);
                  setEditingNote(false);
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onWheelCapture={(event) => event.stopPropagation()}
              className="w-full resize-none rounded-lg border border-[#bfa878]/25 bg-ink-950/50 px-2.5 py-2 text-[0.66rem] leading-5 text-mist-200 outline-none transition focus:border-brass-400/40"
            />
            <p className="mt-1 text-[0.52rem] text-mist-600">
              Esc 取消 · 点击卡片外保存
            </p>
          </div>
        ) : (
          <div
            onDoubleClick={(event) => {
              event.stopPropagation();
              beginNoteEdit();
            }}
            title="双击编辑说明"
            className="cursor-text px-3.5 pb-3 pt-2"
          >
            <p
              className={cn(
                'whitespace-pre-wrap break-words text-[0.66rem] leading-5',
                noteText ? 'text-mist-300' : 'text-mist-600',
              )}
            >
              {noteText || '双击编辑说明…'}
            </p>
          </div>
        )
      ) : (
        <>
          <div className="grid shrink-0 grid-cols-2 gap-x-3 px-3.5" style={{ paddingTop: 6 }}>
            <div className="relative" style={{ height: rows * PORT_ROW_HEIGHT }}>
              {inputs.map((port, index) => (
                <InputPortRow
                  key={port.key}
                  port={port}
                  index={index}
                  dragKind={dragKind}
                  onRemove={
                    addable ? () => onRemoveInput(node.id, port.key) : undefined
                  }
                />
              ))}
              {addable && (
                <button
                  type="button"
                  title="添加一个左侧输入连接点"
                  aria-label="添加输入"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddInput(node.id);
                  }}
                  className="absolute -left-1 flex items-center gap-1 text-[0.55rem] text-mist-600 transition hover:text-brass-300"
                  style={{ top: inputs.length * PORT_ROW_HEIGHT, height: PORT_ROW_HEIGHT }}
                >
                  <span className="grid size-3 place-items-center rounded-full border border-dashed border-mist-100/30 text-[0.62rem] leading-none">
                    +
                  </span>
                  添加输入
                </button>
              )}
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

          <div
            className={cn(
              'px-3.5 pb-3 pt-2',
              fixedHeight !== undefined && 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
            )}
            onWheelCapture={
              fixedHeight !== undefined ? (event) => event.stopPropagation() : undefined
            }
          >
            <p className="line-clamp-2 text-[0.6rem] leading-[1.15rem] text-mist-600">
              {definition?.description ?? '未注册的节点类型，运行时会被记为失败。'}
            </p>

            {configEntries.length > 0 && (
              <div className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-lg border border-mist-100/[0.06] bg-ink-950/50 px-2 py-2">
                {configEntries.map(({ field, value }) => (
                  <CardConfigField
                    key={field.key}
                    nodeId={node.id}
                    definition={definition}
                    field={field}
                    value={value}
                    config={node.config ?? {}}
                    variables={variables}
                    providers={providers}
                    onCreateVariable={onCreateVariable}
                    onUpdateNodeConfig={onUpdateNodeConfig}
                    className={field.width === 'half' ? undefined : 'col-span-2'}
                  />
                ))}
              </div>
            )}

            {run?.error && (
              <p className="mt-1.5 line-clamp-2 shrink-0 text-[0.56rem] leading-4 text-signal-400">
                {run.error}
              </p>
            )}
          </div>
        </>
      )}

      {resizable && (
        <button
          type="button"
          title="拖动调整卡片大小"
          aria-label="调整卡片大小"
          onPointerDown={onStartResize}
          className="absolute bottom-1 right-1 z-10 grid size-4 cursor-nwse-resize place-items-center rounded text-mist-600/70 transition hover:text-brass-300"
        >
          <MoveDiagonal2 className="size-3" strokeWidth={1.6} />
        </button>
      )}
    </article>
  );
}

function CardConfigField({
  nodeId,
  definition,
  field,
  value,
  config,
  variables,
  providers,
  onCreateVariable,
  onUpdateNodeConfig,
  className,
}: {
  nodeId: string;
  definition: ChatPipelineNodeType | null;
  field: ChatPipelineConfigField;
  value: unknown;
  config: Record<string, unknown>;
  variables: ChatPipelineVariable[];
  providers: ProviderOption[];
  onCreateVariable: (key: string) => void;
  onUpdateNodeConfig: (id: string, key: string, value: unknown) => void;
  className?: string;
}) {
  const commit = (next: unknown) => {
    onUpdateNodeConfig(nodeId, field.key, next);

    for (const reset of dependentConfigResets(
      definition,
      field,
      next,
      config,
      providers,
      variables,
    )) {
      onUpdateNodeConfig(nodeId, reset.key, reset.value);
    }
  };

  const label = (
    <span className="block min-w-0 truncate text-[0.56rem] text-mist-600" title={field.label}>
      {field.label}
    </span>
  );

  if (field.kind === 'boolean') {
    const checked = value === true;
    return (
      <div className={cn('flex min-w-0 items-center justify-between gap-2', className)}>
        {label}
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={field.label}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            commit(!checked);
          }}
          className={cn(
            'relative h-4 w-7 shrink-0 rounded-full transition',
            checked ? 'bg-jade-400/60' : 'bg-mist-100/[0.12]',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 size-3 rounded-full bg-ink-950 transition',
              checked ? 'left-3.5' : 'left-0.5',
            )}
          />
        </button>
      </div>
    );
  }

  if (field.kind === 'select') {
    const options =
      dynamicFieldOptions(field, config, providers, variables) ?? field.options ?? [];
    return (
      <div className={cn('min-w-0', className)}>
        {label}
        <PipelineSelect
          value={typeof value === 'string' ? value : ''}
          options={options}
          onChange={commit}
          ariaLabel={field.label}
          menuTitle={field.label}
          variant="card"
          create={
            field.optionsSource === 'pipeline-variables'
              ? variableSelectCreate(variables, onCreateVariable)
              : undefined
          }
          className="mt-0.5"
        />
      </div>
    );
  }

  if (field.kind === 'json') {
    return (
      <div className={cn('min-w-0', className)}>
        <CardJsonField label={field.label} value={value} onCommit={commit} />
      </div>
    );
  }

  if (field.kind === 'text') {
    const current = typeof value === 'string' ? value : '';
    return (
      <div className={cn('min-w-0', className)}>
        {label}
        <textarea
          value={current}
          rows={Math.max(2, current.split('\n').length)}
          placeholder={field.placeholder}
          spellCheck={false}
          aria-label={field.label}
          onChange={(event) => commit(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          onWheelCapture={(event) => event.stopPropagation()}
          className="mt-0.5 min-h-[2.5rem] w-full resize-none rounded-md border border-mist-100/[0.1] bg-ink-900/60 px-1.5 py-1 text-[0.7rem] leading-5 text-mist-200 outline-none transition [field-sizing:content] focus:border-brass-400/40"
        />
      </div>
    );
  }

  const numeric = field.kind === 'number';
  return (
    <div className={cn('min-w-0', className)}>
      {label}
      <input
        type={numeric ? 'number' : undefined}
        value={numeric ? (typeof value === 'number' ? value : '') : typeof value === 'string' ? value : ''}
        placeholder={field.placeholder}
        spellCheck={false}
        aria-label={field.label}
        onChange={(event) =>
          commit(
            numeric
              ? event.target.value === ''
                ? undefined
                : Number(event.target.value)
              : event.target.value,
          )
        }
        onPointerDown={(event) => event.stopPropagation()}
        onWheelCapture={(event) => event.stopPropagation()}
        className="mt-0.5 w-full rounded-md border border-mist-100/[0.1] bg-ink-900/60 px-1.5 py-1 font-mono text-[0.64rem] text-mist-200 outline-none transition focus:border-brass-400/40"
      />
    </div>
  );
}

function CardJsonField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(JSON.stringify(value ?? null, null, 2));
    setError(null);
  }, [value]);

  const commit = () => {
    try {
      onCommit(JSON.parse(draft) as unknown);
      setError(null);
    } catch {
      setError('JSON 格式不正确');
    }
  };

  return (
    <>
      <span className="block truncate text-[0.56rem] text-mist-600" title={label}>
        {label}
      </span>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        rows={3}
        spellCheck={false}
        aria-label={label}
        onPointerDown={(event) => event.stopPropagation()}
        onWheelCapture={(event) => event.stopPropagation()}
        className={cn(
          'mt-0.5 w-full resize-y rounded-md border bg-ink-900/60 px-1.5 py-1 font-mono text-[0.64rem] leading-5 text-mist-200 outline-none transition',
          error ? 'border-signal-400/50' : 'border-mist-100/[0.1] focus:border-brass-400/40',
        )}
      />
      {error && <span className="mt-0.5 block text-[0.52rem] text-signal-400">{error}</span>}
    </>
  );
}

function InputPortRow({
  port,
  index,
  dragKind,
  onRemove,
}: {
  port: ChatPipelineIoField;
  index: number;
  dragKind: ChatPipelineIoKind | null;
  onRemove?: () => void;
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
      <span className="min-w-0 truncate text-[0.55rem] text-mist-400">{port.label}</span>
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
      {onRemove && (
        <button
          type="button"
          title={`删除输入 ${port.key}`}
          aria-label={`删除输入 ${port.key}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="ml-auto grid size-3.5 shrink-0 place-items-center rounded-full text-[0.62rem] leading-none text-mist-600 transition hover:bg-signal-400/10 hover:text-signal-400"
        >
          ×
        </button>
      )}
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
