import type {
  ChatPipelineConfigField,
  ChatPipelineGraph,
  ChatPipelineGraphEdge,
  ChatPipelineGraphNode,
  ChatPipelineIoField,
  ChatPipelineIoKind,
  ChatPipelineNodeType,
} from '@inkseek/shared';
import { Info, Link2, Lock, Trash2, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  CATEGORY_STYLE,
  IO_KIND_STYLE,
  categoryOf,
  definitionOf,
  formatRunTime,
  type PipelineSelection,
} from './pipeline-ui';
import { PipelineSelect } from './pipeline-select';

interface PipelineInspectorProps {
  graph: ChatPipelineGraph;
  catalog: ChatPipelineNodeType[];
  selection: PipelineSelection;
  onRenameGraph: (name: string) => void;
  onUpdateNode: (id: string, patch: Partial<ChatPipelineGraphNode>) => void;
  onUpdateNodeConfig: (id: string, key: string, value: unknown) => void;
  onUpdateEdge: (index: number, patch: Partial<ChatPipelineGraphEdge>) => void;
  onDelete: () => void;
}

export function PipelineInspector({
  graph,
  catalog,
  selection,
  onRenameGraph,
  onUpdateNode,
  onUpdateNodeConfig,
  onUpdateEdge,
  onDelete,
}: PipelineInspectorProps) {
  const selectedNode =
    selection?.kind === 'node'
      ? (graph.nodes.find((node) => node.id === selection.id) ?? null)
      : null;
  const selectedEdge =
    selection?.kind === 'edge' ? (graph.edges[selection.index] ?? null) : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      {selectedNode ? (
        <NodeInspector
          node={selectedNode}
          definition={definitionOf(selectedNode, catalog)}
          onUpdateNode={onUpdateNode}
          onUpdateNodeConfig={onUpdateNodeConfig}
          onDelete={onDelete}
        />
      ) : selectedEdge && selection?.kind === 'edge' ? (
        <EdgeInspector
          edge={selectedEdge}
          index={selection.index}
          graph={graph}
          catalog={catalog}
          onUpdateEdge={onUpdateEdge}
          onDelete={onDelete}
        />
      ) : (
        <GraphInspector graph={graph} onRenameGraph={onRenameGraph} />
      )}
    </div>
  );
}

function GraphInspector({
  graph,
  onRenameGraph,
}: {
  graph: ChatPipelineGraph;
  onRenameGraph: (name: string) => void;
}) {
  return (
    <div>
      <p className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-mist-600">
        Graph
      </p>
      <h2 className="mt-2 text-[0.92rem] font-medium text-mist-100">图设置</h2>

      <label className="mt-4 block">
        <span className="text-[0.68rem] text-mist-500">图名称</span>
        <input
          value={graph.name}
          onChange={(event) => onRenameGraph(event.target.value)}
          maxLength={80}
          className="mt-1.5 w-full rounded-lg border border-mist-100/[0.1] bg-ink-950/50 px-2.5 py-2 text-[0.74rem] text-mist-200 outline-none transition focus:border-brass-400/40"
        />
      </label>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="版本" value={`v${graph.version}`} />
        <Stat label="节点" value={String(graph.nodes.length)} />
        <Stat label="连线" value={String(graph.edges.length)} />
        <Stat label="更新" value={formatRunTime(graph.updatedAt)} />
      </dl>

      <div className="mt-5 rounded-xl border border-mist-100/[0.07] bg-ink-950/30 px-3 py-3">
        <p className="flex items-center gap-1.5 text-[0.66rem] text-mist-400">
          <Info className="size-3" strokeWidth={1.7} />
          选择卡片或连线开始编辑
        </p>
        <p className="mt-1.5 text-[0.62rem] leading-5 text-mist-600">
          端口按类型连接：文本、数字、布尔、JSON、图片只能接到同类型或「任意」端口。消息输入 /
          输出是系统卡片，始终存在且不能删除。
        </p>
      </div>

      <div className="mt-3 rounded-xl border border-brass-400/20 bg-brass-400/[0.04] px-3 py-3">
        <p className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-brass-300">
          最简复读
        </p>
        <p className="mt-1.5 text-[0.6rem] leading-5 text-mist-400">
          消息输入的 <span className="font-mono text-mist-200">text</span> 直连消息输出的{' '}
          <span className="font-mono text-mist-200">text</span>，不经过任何处理节点；
          打开消息输出的「发送回复」开关后即可原样回发。需要提取或加工时，在两者之间插入节点，
          再用 <span className="font-mono text-mist-200">text.join</span> 汇总多条分支。
        </p>
      </div>
    </div>
  );
}

function NodeInspector({
  node,
  definition,
  onUpdateNode,
  onUpdateNodeConfig,
  onDelete,
}: {
  node: ChatPipelineGraphNode;
  definition: ChatPipelineNodeType | null;
  onUpdateNode: (id: string, patch: Partial<ChatPipelineGraphNode>) => void;
  onUpdateNodeConfig: (id: string, key: string, value: unknown) => void;
  onDelete: () => void;
}) {
  const category = CATEGORY_STYLE[categoryOf(node, definition ? [definition] : [])];
  const Icon = category.icon;
  const config = node.config ?? {};
  const isSystem = definition?.system === true;
  const showJoin =
    !isSystem &&
    definition !== null &&
    (definition.inputs.length > 1 || definition.inputs.some((port) => port.multiple));

  return (
    <div>
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-xl border',
            category.border,
            category.background,
            category.text,
          )}
        >
          <Icon className="size-4" strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-[0.9rem] font-medium text-mist-100">
              {definition?.label ?? node.type}
            </h2>
            {isSystem && (
              <span className="shrink-0 rounded border border-brass-400/30 bg-brass-400/[0.08] px-1 py-px font-mono text-[0.46rem] uppercase tracking-[0.1em] text-brass-300">
                系统
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-[0.57rem] text-mist-600">
            {node.id} · {node.type}@{definition?.version ?? 1}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[0.66rem] leading-5 text-mist-500">
        {definition?.description ?? '未注册的节点类型，运行时会被记为失败。'}
      </p>

      {isSystem && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-brass-400/20 bg-brass-400/[0.05] px-2.5 py-2 text-[0.6rem] leading-4.5 text-brass-200/80">
          <Lock className="mt-0.5 size-3 shrink-0" strokeWidth={1.7} />
          系统卡片由管线固定提供，不能删除；消息输出是终点，不会有出边。
        </p>
      )}

      {definition && (
        <div className="mt-4 grid gap-2.5 rounded-xl border border-mist-100/[0.07] bg-ink-950/25 p-2.5">
          <IoList title="输入端口" hint="类型匹配的上游输出" fields={definition.inputs} />
          <IoList title="输出端口" hint="可被下游引用或连接" fields={definition.outputs} />
        </div>
      )}

      <div className="mt-4 space-y-3.5">
        {(definition?.fields ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-mist-100/[0.1] px-3 py-3 text-[0.62rem] text-mist-600">
            这个节点没有可配置字段。
          </p>
        ) : (
          definition?.fields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={config[field.key]}
              onChange={(value) => onUpdateNodeConfig(node.id, field.key, value)}
            />
          ))
        )}
      </div>

      {showJoin && definition && (
        <div className="mt-5">
          <p className="text-[0.68rem] text-mist-500">入边合并方式</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg border border-mist-100/[0.08] bg-ink-950/40 p-1">
            {(['all', 'any'] as const).map((join) => (
              <button
                key={join}
                type="button"
                onClick={() => onUpdateNode(node.id, { join })}
                className={cn(
                  'rounded-md px-2 py-1.5 text-[0.66rem] transition',
                  node.join === join
                    ? 'bg-brass-400/[0.12] text-brass-200'
                    : 'text-mist-500 hover:bg-mist-100/[0.04] hover:text-mist-300',
                )}
              >
                {join === 'all' ? '全部命中' : '任一命中'}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[0.58rem] leading-4.5 text-mist-600">
            {node.join === 'all'
              ? definition.inputs.every((port) => port.optional === true)
                ? '所有入边都激活时节点才执行；可选端口没有入边也可以执行。'
                : '所有入边都激活时节点才执行，缺少必填端口时节点跳过。'
              : '任一入边激活就执行（分支汇合常用），空输入端口留空。'}
          </p>
        </div>
      )}

      <details className="mt-4 rounded-lg border border-mist-100/[0.07] bg-ink-950/30">
        <summary className="cursor-pointer select-none px-3 py-2 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-mist-600">
          完整配置
        </summary>
        <pre className="max-h-48 overflow-auto border-t border-mist-100/[0.06] px-3 py-2 font-mono text-[0.56rem] leading-4 text-mist-500">
          {JSON.stringify(config, null, 2)}
        </pre>
      </details>

      {isSystem ? (
        <p className="mt-5 rounded-lg border border-mist-100/[0.08] px-3 py-2 text-center text-[0.6rem] text-mist-600">
          系统卡片不可删除
        </p>
      ) : (
        <button
          type="button"
          onClick={onDelete}
          className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-signal-400/20 bg-signal-400/[0.05] px-3 py-2 text-[0.66rem] text-signal-400 transition hover:border-signal-400/40 hover:bg-signal-400/[0.1]"
        >
          <Trash2 className="size-3" strokeWidth={1.7} />
          删除节点
        </button>
      )}
    </div>
  );
}

function EdgeInspector({
  edge,
  index,
  graph,
  catalog,
  onUpdateEdge,
  onDelete,
}: {
  edge: ChatPipelineGraphEdge;
  index: number;
  graph: ChatPipelineGraph;
  catalog: ChatPipelineNodeType[];
  onUpdateEdge: (index: number, patch: Partial<ChatPipelineGraphEdge>) => void;
  onDelete: () => void;
}) {
  const source = graph.nodes.find((node) => node.id === edge.from);
  const target = graph.nodes.find((node) => node.id === edge.to);
  const sourceDefinition = source ? definitionOf(source, catalog) : null;
  const targetDefinition = target ? definitionOf(target, catalog) : null;
  const fromPort = sourceDefinition?.outputs.find((port) => port.key === edge.fromPort) ?? null;
  const toPort = targetDefinition?.inputs.find((port) => port.key === edge.toPort) ?? null;
  const conditionField = edge.when
    ? (sourceDefinition?.outputs.find((port) => port.key === edge.when?.field) ?? null)
    : null;
  const conditionOptions = [
    ...(sourceDefinition?.outputs ?? []).map((port) => ({
      value: port.key,
      label: port.label,
    })),
    ...(edge.when && conditionField === null
      ? [{ value: edge.when.field, label: `${edge.when.field}（未知字段）` }]
      : []),
  ];

  return (
    <div>
      <p className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-mist-600">
        Edge
      </p>
      <h2 className="mt-2 flex items-center gap-1.5 text-[0.9rem] font-medium text-mist-100">
        <Link2 className="size-3.5 text-brass-300" strokeWidth={1.7} />
        连线
      </h2>

      <div className="mt-3 rounded-xl border border-mist-100/[0.08] bg-ink-950/35 px-3 py-2.5 font-mono text-[0.62rem] text-mist-300">
        <div className="flex items-center gap-1.5">
          <span className="text-brass-200">{edge.from}</span>
          <span className="text-mist-600">·</span>
          <span className="text-mist-300">{edge.fromPort}</span>
          {fromPort && <KindChip kind={fromPort.kind} />}
          <span className="mx-0.5 text-mist-600">→</span>
          <span className="text-jade-300">{edge.to}</span>
          <span className="text-mist-600">·</span>
          <span className="text-mist-300">{edge.toPort}</span>
          {toPort && <KindChip kind={toPort.kind} />}
        </div>
        <span className="mt-1 block text-[0.55rem] text-mist-600">
          {sourceDefinition?.label ?? source?.type ?? '未知节点'} →{' '}
          {targetDefinition?.label ?? target?.type ?? '未知节点'}
        </span>
      </div>

      <button
        type="button"
        onClick={() =>
          onUpdateEdge(index, {
            when: edge.when
              ? null
              : { field: pickConditionField(sourceDefinition), equals: conditionDefault('boolean') },
          })
        }
        className="mt-4 flex w-full items-center justify-between rounded-lg border border-mist-100/[0.08] bg-ink-950/40 px-3 py-2 text-left transition hover:border-mist-100/[0.16]"
      >
        <span className="text-[0.68rem] text-mist-300">始终触发</span>
        <span
          className={cn(
            'relative h-4 w-7 rounded-full transition',
            edge.when === null ? 'bg-jade-400/60' : 'bg-mist-100/[0.12]',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 size-3 rounded-full bg-ink-950 transition',
              edge.when === null ? 'left-3.5' : 'left-0.5',
            )}
          />
        </span>
      </button>

      {edge.when ? (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[0.68rem] text-mist-500">判断字段</span>
            <PipelineSelect
              value={edge.when.field}
              options={conditionOptions}
              onChange={(field) => {
                const kind =
                  sourceDefinition?.outputs.find((port) => port.key === field)?.kind ?? 'json';
                onUpdateEdge(index, {
                  when: { field, equals: conditionDefault(kind) },
                });
              }}
              ariaLabel="判断字段"
              menuTitle="判断字段"
              className="mt-1.5"
            />
            <span className="mt-1 block text-[0.58rem] leading-4 text-mist-600">
              只有来源节点成功且该字段等于期望值时，连线才激活；可与传输端口不同。
            </span>
          </label>

          <ConditionValue
            label="期望值"
            kind={conditionField?.kind ?? 'json'}
            value={edge.when.equals}
            onCommit={(value) =>
              onUpdateEdge(index, { when: { ...edge.when!, equals: value } })
            }
          />
        </div>
      ) : (
        <p className="mt-3 flex items-start gap-1.5 text-[0.6rem] leading-5 text-mist-600">
          <Info className="mt-0.5 size-3 shrink-0" strokeWidth={1.6} />
          只要上游节点成功执行，这条连线就会激活并传递 {edge.fromPort} 的值。
        </p>
      )}

      <button
        type="button"
        onClick={onDelete}
        className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-signal-400/20 bg-signal-400/[0.05] px-3 py-2 text-[0.66rem] text-signal-400 transition hover:border-signal-400/40 hover:bg-signal-400/[0.1]"
      >
        <Unlink className="size-3" strokeWidth={1.7} />
        删除连线
      </button>
    </div>
  );
}

function IoList({
  title,
  hint,
  fields,
}: {
  title: string;
  hint: string;
  fields: ChatPipelineIoField[];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-mist-500">
          {title}
        </p>
        <p className="truncate text-[0.52rem] text-mist-600">{hint}</p>
      </div>
      {fields.length === 0 ? (
        <p className="mt-1 text-[0.56rem] text-mist-600">无</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {fields.map((field) => (
            <li
              key={`${field.key}-${field.label}`}
              className="rounded-md border border-mist-100/[0.06] bg-ink-950/40 px-2 py-1.5"
            >
              <div className="flex items-center gap-1.5">
                <span className="truncate font-mono text-[0.6rem] text-mist-200">
                  {field.key}
                </span>
                <span className="truncate text-[0.55rem] text-mist-500">{field.label}</span>
                {field.optional && (
                  <span className="shrink-0 rounded border border-mist-100/[0.1] px-1 py-px font-mono text-[0.46rem] text-mist-500">
                    可选
                  </span>
                )}
                {field.multiple && (
                  <span className="shrink-0 rounded border border-jade-400/25 bg-jade-400/[0.06] px-1 py-px font-mono text-[0.46rem] text-jade-300">
                    多路
                  </span>
                )}
                <span className="ml-auto">
                  <KindChip kind={field.kind} />
                </span>
              </div>
              {field.description && (
                <p className="mt-0.5 text-[0.55rem] leading-4.5 text-mist-600">
                  {field.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KindChip({ kind }: { kind: ChatPipelineIoKind }) {
  const style = IO_KIND_STYLE[kind];
  return (
    <span
      className={cn(
        'shrink-0 rounded border px-1 py-px font-mono text-[0.46rem]',
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}

function pickConditionField(definition: ChatPipelineNodeType | null): string {
  return definition?.outputs.find((port) => port.kind === 'boolean')?.key
    ?? definition?.outputs[0]?.key
    ?? 'matched';
}

function conditionDefault(kind: ChatPipelineIoKind): unknown {
  switch (kind) {
    case 'boolean':
      return true;
    case 'number':
      return 0;
    case 'text':
      return '';
    default:
      return null;
  }
}

function ConditionValue({
  label,
  kind,
  value,
  onCommit,
}: {
  label: string;
  kind: ChatPipelineIoKind;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  if (kind === 'boolean') {
    return (
      <div>
        <span className="text-[0.68rem] text-mist-500">{label}</span>
        <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg border border-mist-100/[0.08] bg-ink-950/40 p-1">
          {[
            { value: true, label: 'true' },
            { value: false, label: 'false' },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onCommit(option.value)}
              className={cn(
                'rounded-md px-2 py-1.5 font-mono text-[0.66rem] transition',
                value === option.value
                  ? 'bg-brass-400/[0.12] text-brass-200'
                  : 'text-mist-500 hover:bg-mist-100/[0.04] hover:text-mist-300',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'number' || kind === 'text') {
    return (
      <label className="block">
        <span className="text-[0.68rem] text-mist-500">{label}</span>
        <input
          type={kind === 'number' ? 'number' : 'text'}
          value={
            kind === 'number'
              ? typeof value === 'number'
                ? value
                : ''
              : typeof value === 'string'
                ? value
                : value === null || value === undefined
                  ? ''
                  : String(value)
          }
          onChange={(event) =>
            onCommit(
              kind === 'number'
                ? event.target.value === ''
                  ? undefined
                  : Number(event.target.value)
                : event.target.value,
            )
          }
          className="mt-1.5 w-full rounded-lg border border-mist-100/[0.1] bg-ink-950/50 px-2.5 py-2 font-mono text-[0.7rem] text-mist-200 outline-none transition focus:border-brass-400/40"
        />
      </label>
    );
  }

  return <JsonField label={label} value={value} onCommit={onCommit} />;
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: ChatPipelineConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.kind === 'json') {
    return <JsonField label={field.label} value={value} hint={field.hint} onCommit={onChange} />;
  }

  if (field.kind === 'boolean') {
    const checked = value === true;
    return (
      <div className="flex items-center justify-between rounded-lg border border-mist-100/[0.08] bg-ink-950/40 px-3 py-2">
        <div>
          <p className="text-[0.68rem] text-mist-300">{field.label}</p>
          {field.hint && <p className="mt-0.5 text-[0.58rem] text-mist-600">{field.hint}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
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

  return (
    <label className="block">
      <span className="text-[0.68rem] text-mist-500">{field.label}</span>
      {field.kind === 'select' ? (
        <PipelineSelect
          value={typeof value === 'string' ? value : ''}
          options={field.options ?? []}
          onChange={onChange}
          ariaLabel={field.label}
          menuTitle={field.label}
          className="mt-1.5"
        />
      ) : field.kind === 'text' ? (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className="mt-1.5 w-full resize-y rounded-lg border border-mist-100/[0.1] bg-ink-950/50 px-2.5 py-2 font-mono text-[0.68rem] leading-5 text-mist-200 outline-none transition focus:border-brass-400/40"
        />
      ) : field.kind === 'number' ? (
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : Number(event.target.value))
          }
          placeholder={field.placeholder}
          className="mt-1.5 w-full rounded-lg border border-mist-100/[0.1] bg-ink-950/50 px-2.5 py-2 font-mono text-[0.7rem] text-mist-200 outline-none transition focus:border-brass-400/40"
        />
      ) : (
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="mt-1.5 w-full rounded-lg border border-mist-100/[0.1] bg-ink-950/50 px-2.5 py-2 font-mono text-[0.7rem] text-mist-200 outline-none transition focus:border-brass-400/40"
        />
      )}
      {field.hint && (
        <span className="mt-1 block text-[0.58rem] leading-4 text-mist-600">{field.hint}</span>
      )}
    </label>
  );
}

function JsonField({
  label,
  value,
  hint,
  onCommit,
}: {
  label: string;
  value: unknown;
  hint?: string;
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
    <label className="block">
      <span className="text-[0.68rem] text-mist-500">{label}</span>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        rows={3}
        spellCheck={false}
        className={cn(
          'mt-1.5 w-full resize-y rounded-lg border bg-ink-950/50 px-2.5 py-2 font-mono text-[0.66rem] leading-5 text-mist-200 outline-none transition',
          error ? 'border-signal-400/50' : 'border-mist-100/[0.1] focus:border-brass-400/40',
        )}
      />
      {error ? (
        <span className="mt-1 block text-[0.58rem] text-signal-400">{error}</span>
      ) : (
        <span className="mt-1 block text-[0.58rem] leading-4 text-mist-600">
          {hint ?? '字符串需要带引号，布尔值直接写 true / false。'}
        </span>
      )}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-mist-100/[0.07] bg-ink-950/30 px-2.5 py-2">
      <dt className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-mist-600">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-[0.64rem] text-mist-300">{value}</dd>
    </div>
  );
}
