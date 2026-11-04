import type {
  ChatPipelineConfigField,
  ChatPipelineGraph,
  ChatPipelineGraphEdge,
  ChatPipelineGraphNode,
  ChatPipelineIoField,
  ChatPipelineIoKind,
  ChatPipelineNodeRunSummary,
  ChatPipelineNodeStatus,
  ChatPipelineNodeType,
  ChatPipelineVariable,
} from '@inkseek/shared';
import { isPipelineConfigFieldVisible, resolvePipelineNodeInputs } from '@inkseek/shared';
import { Info, Link2, Lock, Plus, Trash2, Unlink, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  CATEGORY_STYLE,
  IO_KIND_STYLE,
  MAX_PIPELINE_VARIABLES,
  NODE_STATUS_STYLE,
  VARIABLE_KEY_PATTERN,
  categoryOf,
  definitionOf,
  formatConditionValue,
  formatDuration,
  formatRunTime,
  formatRuntimeDetail,
  formatRuntimePreview,
  variableSelectCreate,
  type PipelineSelection,
} from './pipeline-ui';
import {
  PipelineSelect,
  type PipelineSelectCreate,
  type PipelineSelectOption,
} from './pipeline-select';
import {
  dependentConfigResets,
  dynamicFieldOptions,
  type ProviderOption,
} from './pipeline-config-options';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

interface PipelineInspectorProps {
  graph: ChatPipelineGraph;
  catalog: ChatPipelineNodeType[];
  selection: PipelineSelection;
  /** Model providers resolved once by the page for every provider/model select. */
  providers: ProviderOption[];
  /** Runtime overlays for the selected run; only surfaced in debug mode. */
  debugMode: boolean;
  nodeRuns: Map<string, ChatPipelineNodeRunSummary>;
  onRenameGraph: (name: string) => void;
  onUpdateNode: (id: string, patch: Partial<ChatPipelineGraphNode>) => void;
  onUpdateNodeConfig: (id: string, key: string, value: unknown) => void;
  onUpdateEdge: (index: number, patch: Partial<ChatPipelineGraphEdge>) => void;
  onAddVariable: () => void;
  onCreateVariable: (key: string) => void;
  onRenameVariable: (from: string, to: string) => void;
  onUpdateVariableValue: (key: string, value: ChatPipelineVariable['value']) => void;
  onDeleteVariable: (key: string) => void;
  onDelete: () => void;
}

export function PipelineInspector({
  graph,
  catalog,
  selection,
  providers,
  debugMode,
  nodeRuns,
  onRenameGraph,
  onUpdateNode,
  onUpdateNodeConfig,
  onUpdateEdge,
  onAddVariable,
  onCreateVariable,
  onRenameVariable,
  onUpdateVariableValue,
  onDeleteVariable,
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
          providers={providers}
          variables={graph.variables}
          debugMode={debugMode}
          run={nodeRuns.get(selectedNode.id)}
          onUpdateNode={onUpdateNode}
          onUpdateNodeConfig={onUpdateNodeConfig}
          onCreateVariable={onCreateVariable}
          onDelete={onDelete}
        />
      ) : selectedEdge && selection?.kind === 'edge' ? (
        <EdgeInspector
          edge={selectedEdge}
          index={selection.index}
          graph={graph}
          catalog={catalog}
          debugMode={debugMode}
          sourceRun={nodeRuns.get(selectedEdge.from)}
          targetRun={nodeRuns.get(selectedEdge.to)}
          onUpdateEdge={onUpdateEdge}
          onDelete={onDelete}
        />
      ) : (
        <GraphInspector
          graph={graph}
          onRenameGraph={onRenameGraph}
          onAddVariable={onAddVariable}
          onRenameVariable={onRenameVariable}
          onUpdateVariableValue={onUpdateVariableValue}
          onDeleteVariable={onDeleteVariable}
        />
      )}
    </div>
  );
}

function GraphInspector({
  graph,
  onRenameGraph,
  onAddVariable,
  onRenameVariable,
  onUpdateVariableValue,
  onDeleteVariable,
}: {
  graph: ChatPipelineGraph;
  onRenameGraph: (name: string) => void;
  onAddVariable: () => void;
  onRenameVariable: (from: string, to: string) => void;
  onUpdateVariableValue: (key: string, value: ChatPipelineVariable['value']) => void;
  onDeleteVariable: (key: string) => void;
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
        <Stat label="变量" value={String(graph.variables.length)} />
        <Stat label="更新" value={formatRunTime(graph.updatedAt)} />
      </dl>

      <section className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-mist-500">
            Variables · 管线变量
          </p>
          <button
            type="button"
            onClick={onAddVariable}
            disabled={graph.variables.length >= MAX_PIPELINE_VARIABLES}
            className="flex items-center gap-1 rounded-full border border-mist-100/[0.1] px-2 py-0.5 text-[0.56rem] text-mist-400 transition hover:border-brass-400/40 hover:text-brass-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="size-2.5" strokeWidth={2} />
            添加
          </button>
        </div>
        <p className="mt-1.5 text-[0.58rem] leading-4.5 text-mist-600">
          每次运行从这里的声明值开始；卡片里用{' '}
          <span className="font-mono text-mist-400">$vars.名称</span> 或{' '}
          <span className="font-mono text-mist-400">{'{{vars.名称}}'}</span>{' '}
          读取，也可以用「读取变量 / 写入变量」卡。
        </p>

        {graph.variables.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-mist-100/[0.1] px-3 py-3 text-center text-[0.6rem] leading-4.5 text-mist-600">
            还没有变量。添加后可以跨卡片传递计数、开关或固定参数。
          </p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {graph.variables.map((variable) => (
              <VariableRow
                key={variable.key}
                variable={variable}
                siblings={graph.variables}
                onRename={onRenameVariable}
                onUpdateValue={onUpdateVariableValue}
                onDelete={onDeleteVariable}
              />
            ))}
          </div>
        )}
      </section>

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

type VariableKind = 'text' | 'number' | 'boolean';

function variableKindOf(value: ChatPipelineVariable['value']): VariableKind {
  if (typeof value === 'number') {
    return 'number';
  }
  return typeof value === 'boolean' ? 'boolean' : 'text';
}

function VariableRow({
  variable,
  siblings,
  onRename,
  onUpdateValue,
  onDelete,
}: {
  variable: ChatPipelineVariable;
  siblings: ChatPipelineVariable[];
  onRename: (from: string, to: string) => void;
  onUpdateValue: (key: string, value: ChatPipelineVariable['value']) => void;
  onDelete: (key: string) => void;
}) {
  const [draftKey, setDraftKey] = useState(variable.key);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftKey(variable.key);
    setError(null);
  }, [variable.key]);

  const kind = variableKindOf(variable.value);

  const commitKey = () => {
    const next = draftKey.trim();
    if (next === variable.key) {
      setDraftKey(variable.key);
      setError(null);
      return;
    }
    if (!VARIABLE_KEY_PATTERN.test(next)) {
      setError('支持任意语言的字母、数字、下划线或连字符，1–32 个字符');
      return;
    }
    if (siblings.some((entry) => entry.key === next)) {
      setError('变量名重复');
      return;
    }
    setError(null);
    onRename(variable.key, next);
  };

  const changeKind = (next: VariableKind) => {
    if (next === kind) {
      return;
    }
    if (next === 'text') {
      onUpdateValue(variable.key, String(variable.value));
    } else if (next === 'number') {
      const parsed = Number(variable.value);
      onUpdateValue(variable.key, Number.isFinite(parsed) ? parsed : 0);
    } else {
      onUpdateValue(variable.key, variable.value === true || variable.value === 'true');
    }
  };

  return (
    <div className="rounded-lg border border-mist-100/[0.08] bg-ink-950/35 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <input
          value={draftKey}
          onChange={(event) => setDraftKey(event.target.value)}
          onBlur={commitKey}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          spellCheck={false}
          aria-label="变量名"
          className={cn(
            'min-w-0 flex-1 rounded-md border bg-ink-950/60 px-2 py-1 font-mono text-[0.68rem] text-mist-200 outline-none transition',
            error
              ? 'border-signal-400/50'
              : 'border-mist-100/[0.1] focus:border-brass-400/40',
          )}
        />
        <div className="w-[4.6rem] shrink-0">
          <PipelineSelect
            value={kind}
            options={[
              { value: 'text', label: '文本' },
              { value: 'number', label: '数字' },
              { value: 'boolean', label: '布尔' },
            ]}
            onChange={(next) => changeKind(next as VariableKind)}
            ariaLabel="变量类型"
            variant="card"
            menuTitle="变量类型"
          />
        </div>
        <button
          type="button"
          onClick={() => onDelete(variable.key)}
          aria-label="删除变量"
          className="grid size-6 shrink-0 place-items-center rounded-md text-mist-600 transition hover:bg-signal-400/10 hover:text-signal-400"
        >
          <X className="size-3" strokeWidth={2} />
        </button>
      </div>

      <div className="mt-1.5">
        {kind === 'boolean' ? (
          <div className="grid grid-cols-2 gap-1 rounded-md border border-mist-100/[0.08] bg-ink-950/40 p-0.5">
            {[true, false].map((value) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => onUpdateValue(variable.key, value)}
                className={cn(
                  'rounded px-2 py-1 font-mono text-[0.6rem] transition',
                  variable.value === value
                    ? 'bg-brass-400/[0.12] text-brass-200'
                    : 'text-mist-500 hover:bg-mist-100/[0.04] hover:text-mist-300',
                )}
              >
                {String(value)}
              </button>
            ))}
          </div>
        ) : (
          <input
            type={kind === 'number' ? 'number' : 'text'}
            value={
              kind === 'number'
                ? typeof variable.value === 'number'
                  ? variable.value
                  : ''
                : String(variable.value)
            }
            onChange={(event) => {
              if (kind === 'number') {
                onUpdateValue(
                  variable.key,
                  event.target.value === '' ? 0 : Number(event.target.value),
                );
              } else {
                onUpdateValue(variable.key, event.target.value);
              }
            }}
            aria-label="变量值"
            className="w-full rounded-md border border-mist-100/[0.1] bg-ink-950/60 px-2 py-1 font-mono text-[0.66rem] text-mist-200 outline-none transition focus:border-brass-400/40"
          />
        )}
      </div>

      {error && <p className="mt-1 text-[0.55rem] text-signal-400">{error}</p>}
      <p className="mt-1 truncate font-mono text-[0.52rem] text-mist-600">
        $vars.{variable.key} · {variable.value === '' ? '∅' : String(variable.value)}
      </p>
    </div>
  );
}

function NodeInspector({
  node,
  definition,
  providers,
  variables,
  debugMode,
  run,
  onUpdateNode,
  onUpdateNodeConfig,
  onCreateVariable,
  onDelete,
}: {
  node: ChatPipelineGraphNode;
  definition: ChatPipelineNodeType | null;
  providers: ProviderOption[];
  variables: ChatPipelineVariable[];
  debugMode: boolean;
  run: ChatPipelineNodeRunSummary | undefined;
  onUpdateNode: (id: string, patch: Partial<ChatPipelineGraphNode>) => void;
  onUpdateNodeConfig: (id: string, key: string, value: unknown) => void;
  onCreateVariable: (key: string) => void;
  onDelete: () => void;
}) {
  const category = CATEGORY_STYLE[categoryOf(node, definition ? [definition] : [])];
  const Icon = category.icon;
  const config = node.config ?? {};
  const isSystem = definition?.system === true;
  const inputs = definition ? resolvePipelineNodeInputs(definition, node.config) : [];
  const fields = (definition?.fields ?? []).filter((field) =>
    isPipelineConfigFieldVisible(field, config),
  );
  const showJoin =
    !isSystem &&
    definition !== null &&
    (inputs.length > 1 || inputs.some((port) => port.multiple));

  const commitField = (field: ChatPipelineConfigField, value: unknown) => {
    onUpdateNodeConfig(node.id, field.key, value);

    for (const reset of dependentConfigResets(
      definition,
      field,
      value,
      config,
      providers,
      variables,
    )) {
      onUpdateNodeConfig(node.id, reset.key, reset.value);
    }
  };

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
          <IoList title="输入端口" hint="类型匹配的上游输出" fields={inputs} />
          <IoList title="输出端口" hint="可被下游引用或连接" fields={definition.outputs} />
        </div>
      )}

      {debugMode && run && (
        <RuntimePanel title="运行数据 · 本节点" status={run.status} durationMs={run.durationMs}>
          {run.error && (
            <p className="text-[0.56rem] leading-4 text-signal-400">{run.error}</p>
          )}
          <RuntimeValue label="输入 · ports" value={asRecord(run.input)?.ports} />
          <RuntimeValue label="输出" value={run.output} />
          <p className="font-mono text-[0.46rem] text-mist-600">
            {run.nodeId} · {run.nodeType}@{run.nodeVersion}
          </p>
        </RuntimePanel>
      )}

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3.5">
        {fields.length === 0 ? (
          <p className="col-span-2 rounded-lg border border-dashed border-mist-100/[0.1] px-3 py-3 text-[0.62rem] text-mist-600">
            这个节点没有可配置字段。
          </p>
        ) : (
          fields.map((field) => (
            <div key={field.key} className={cn('min-w-0', field.width !== 'half' && 'col-span-2')}>
              <FieldControl
                field={field}
                value={config[field.key]}
                options={dynamicFieldOptions(field, config, providers, variables)}
                create={
                  field.optionsSource === 'pipeline-variables'
                    ? variableSelectCreate(variables, onCreateVariable)
                    : undefined
                }
                onChange={(value) => commitField(field, value)}
              />
            </div>
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
              ? inputs.every((port) => port.optional === true)
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
  debugMode,
  sourceRun,
  targetRun,
  onUpdateEdge,
  onDelete,
}: {
  edge: ChatPipelineGraphEdge;
  index: number;
  graph: ChatPipelineGraph;
  catalog: ChatPipelineNodeType[];
  debugMode: boolean;
  sourceRun: ChatPipelineNodeRunSummary | undefined;
  targetRun: ChatPipelineNodeRunSummary | undefined;
  onUpdateEdge: (index: number, patch: Partial<ChatPipelineGraphEdge>) => void;
  onDelete: () => void;
}) {
  const source = graph.nodes.find((node) => node.id === edge.from);
  const target = graph.nodes.find((node) => node.id === edge.to);
  const sourceDefinition = source ? definitionOf(source, catalog) : null;
  const targetDefinition = target ? definitionOf(target, catalog) : null;
  const fromPort = sourceDefinition?.outputs.find((port) => port.key === edge.fromPort) ?? null;
  const toPort =
    targetDefinition && target
      ? (resolvePipelineNodeInputs(targetDefinition, target.config).find(
          (port) => port.key === edge.toPort,
        ) ?? null)
      : null;
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
  const sourceOutput = asRecord(sourceRun?.output)?.[edge.fromPort];
  const targetInput = asRecord(asRecord(targetRun?.input)?.ports)?.[edge.toPort];
  const conditionActual = edge.when
    ? asRecord(sourceRun?.output)?.[edge.when.field]
    : undefined;
  const runtimeStatus: ChatPipelineNodeStatus | null =
    targetRun?.status ?? sourceRun?.status ?? null;

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

      {debugMode && runtimeStatus && (
        <RuntimePanel
          title="运行数据 · 本连线"
          status={runtimeStatus}
          durationMs={targetRun?.durationMs ?? sourceRun?.durationMs ?? null}
        >
          {edge.when && (
            <p className="rounded-md border border-mist-100/[0.06] bg-ink-950/50 px-2 py-1.5 font-mono text-[0.52rem] text-mist-400">
              {edge.when.field} = {formatConditionValue(edge.when.equals)}
              <span className="text-mist-600"> · 实际 </span>
              <span
                className={cn(
                  sourceRun?.status === 'SUCCEEDED' ? 'text-brass-200' : 'text-mist-500',
                )}
              >
                {sourceRun?.status === 'SUCCEEDED'
                  ? formatRuntimePreview(conditionActual)
                  : '未运行'}
              </span>
            </p>
          )}
          <RuntimeValue label={`来源输出 · ${edge.fromPort}`} value={sourceOutput} />
          <RuntimeValue label={`目标输入 · ${edge.toPort}`} value={targetInput} />
        </RuntimePanel>
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

function RuntimePanel({
  title,
  status,
  durationMs,
  children,
}: {
  title: string;
  status: ChatPipelineNodeStatus;
  durationMs: number | null;
  children: ReactNode;
}) {
  const style = NODE_STATUS_STYLE[status];
  return (
    <section className="mt-4 rounded-xl border border-brass-400/20 bg-ink-950/40">
      <header className="flex items-center justify-between gap-2 border-b border-mist-100/[0.06] px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-mist-500">
          <span className={cn('size-1.5 shrink-0 rounded-full', style.dot)} />
          <span className="truncate">{title}</span>
          <span className={cn('shrink-0 text-[0.5rem]', style.text)}>{style.label}</span>
        </span>
        <span className="shrink-0 font-mono text-[0.52rem] text-mist-600">
          {formatDuration(durationMs)}
        </span>
      </header>
      <div className="space-y-2 px-3 py-2.5">{children}</div>
    </section>
  );
}

function RuntimeValue({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="font-mono text-[0.48rem] uppercase tracking-[0.12em] text-mist-600">
        {label}
      </p>
      <pre className="mt-1 max-h-36 overflow-auto rounded-md border border-mist-100/[0.06] bg-ink-950/60 px-2 py-1.5 font-mono text-[0.56rem] leading-4 text-mist-300">
        {formatRuntimeDetail(value)}
      </pre>
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
  options,
  create,
  onChange,
}: {
  field: ChatPipelineConfigField;
  value: unknown;
  /** Runtime options for dynamic selects; `null` falls back to `field.options`. */
  options: PipelineSelectOption[] | null;
  /** Inline create row for select fields backed by a mutable collection. */
  create?: PipelineSelectCreate;
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
          options={options ?? field.options ?? []}
          onChange={onChange}
          ariaLabel={field.label}
          menuTitle={field.label}
          create={create}
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
