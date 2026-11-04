import type { AgentRunSummary, LlmPromptLogRecord } from '@inkseek/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DropdownSelect } from '@/components/dropdown-select';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatTime } from './mind-format';
import {
  EmptyState,
  LazyList,
  MindDrawer,
  MindSection,
  PromptBlock,
  StatusDot,
  StatusPill,
  TraceBlock,
  formatJson,
  renderPayload,
} from './mind-ui';

export function MindRunsTab({
  personaId,
  approvalMode,
}: {
  personaId: string;
  approvalMode: boolean;
}) {
  const [view, setView] = useState<'runs' | 'prompts'>('runs');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(
          [
            ['runs', '运行轨迹'],
            ['prompts', '提示词日志'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={cn(
              'rounded-full border px-3 py-1 text-[0.72rem] transition',
              view === key
                ? 'border-brass-400/35 bg-brass-400/10 text-brass-200'
                : 'border-mist-100/[0.08] text-mist-500 hover:text-mist-300',
            )}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.16em] text-mist-600">
          Trace & LLM
        </span>
      </div>
      {view === 'runs' ? (
        <RunsList personaId={personaId} approvalMode={approvalMode} />
      ) : (
        <PromptList />
      )}
    </div>
  );
}

function RunsList({ personaId, approvalMode }: { personaId: string; approvalMode: boolean }) {
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [offset, setOffset] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(false);
  const queryClient = useQueryClient();

  const runsQuery = useQuery({
    queryKey: ['mind', 'runs', personaId, offset],
    queryFn: () => api.mindRuns(personaId, undefined, 40, offset),
    staleTime: 3_000,
  });

  useEffect(() => {
    setRuns([]);
    setOffset(0);
    setReachedEnd(false);
    setSelectedId('');
  }, [personaId]);

  useEffect(() => {
    if (!runsQuery.data) {
      return;
    }
    setRuns((current) => {
      const merged = [
        ...current,
        ...runsQuery.data.filter((run) => !current.some((item) => item.id === run.id)),
      ];
      return merged;
    });
    if (runsQuery.data.length < 40) {
      setReachedEnd(true);
    }
  }, [runsQuery.data]);

  const detailQuery = useQuery({
    queryKey: ['mind', 'run', selectedId],
    queryFn: () => api.mindRun(selectedId),
    enabled: Boolean(selectedId),
    staleTime: 10_000,
  });

  const actionQuery = useQuery({
    queryKey: ['mind', 'pending-actions', personaId],
    queryFn: () => api.mindPendingActions(personaId),
    enabled: approvalMode,
    refetchInterval: 5_000,
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.approveMindAction(id),
    onSuccess: () => {
      toast.success('动作已发送');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '发送失败'),
  });

  const pending = actionQuery.data ?? [];

  return (
    <>
      {pending.length > 0 ? (
        <MindSection
          title={`待审批动作 · ${pending.length}`}
          className="border-brass-400/25 bg-brass-400/[0.05]"
        >
          <div className="mt-2 space-y-1.5">
            {pending.map((action) => (
              <div key={action.id} className="rounded-lg bg-ink-950/40 p-2">
                <p className="text-[0.72rem] text-mist-300">
                  {renderPayload(action.payload).slice(0, 120)}
                </p>
                <button
                  type="button"
                  onClick={() => approve.mutate(action.id)}
                  className="mt-1.5 rounded border border-jade-400/25 px-2 py-0.5 text-[0.68rem] text-jade-300 hover:bg-jade-400/10"
                >
                  批准发送
                </button>
              </div>
            ))}
          </div>
        </MindSection>
      ) : null}

      <MindSection title={`Runs · ${runs.length}`} count={reachedEnd ? '到底了' : '可加载更多'}>
        {runsQuery.isPending && runs.length === 0 ? (
          <div className="grid place-items-center py-16">
            <LoaderCircle className="size-5 animate-spin text-brass-300" />
          </div>
        ) : runs.length === 0 ? (
          <EmptyState compact text="还没有心智运行。发一条消息，或等心跳自动唤醒。" />
        ) : (
          <div className="mt-2 space-y-1.5">
            <LazyList
              items={runs}
              step={20}
              renderItem={(run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedId(run.id)}
                  className="w-full rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2.5 text-left transition hover:border-brass-400/30 hover:bg-brass-400/[0.04]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[0.78rem] text-mist-200">
                      <StatusDot status={run.status} />
                      {run.trigger}
                    </span>
                    <span className="font-mono text-[0.66rem] text-mist-600">
                      {formatTime(run.startedAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[0.7rem] leading-4 text-mist-500">
                    {run.reason || (run.engage === false ? '保持沉默' : '没有记录理由')}
                  </p>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[0.64rem] text-mist-600">
                    <span>{run.mode}</span>
                    <span>{run.conversationName ?? '会话'}</span>
                    <span>{run.latencyMs ? `${run.latencyMs}ms` : '—'}</span>
                  </div>
                </button>
              )}
            />
            {!reachedEnd ? (
              <button
                type="button"
                onClick={() => setOffset(runs.length)}
                disabled={runsQuery.isFetching}
                className="mt-2 w-full rounded-lg border border-mist-100/[0.08] py-1.5 text-[0.72rem] text-mist-400 transition hover:border-mist-100/[0.16] hover:text-mist-200 disabled:opacity-50"
              >
                {runsQuery.isFetching ? '加载中…' : '加载更多'}
              </button>
            ) : null}
          </div>
        )}
      </MindSection>

      <MindDrawer
        open={Boolean(selectedId)}
        title="运行详情"
        subtitle={selectedId}
        onClose={() => setSelectedId('')}
        widthClassName="sm:max-w-[42rem]"
      >
        {detailQuery.isPending ? (
          <div className="grid place-items-center py-16">
            <LoaderCircle className="size-5 animate-spin text-brass-300" />
          </div>
        ) : !detailQuery.data ? (
          <EmptyState compact text="运行详情不可用。" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={detailQuery.data.status} />
              <span className="rounded-full border border-mist-100/[0.08] px-2 py-0.5 font-mono text-[0.66rem] text-mist-500">
                {detailQuery.data.mode} · {detailQuery.data.trigger}
              </span>
              {detailQuery.data.model ? (
                <span className="font-mono text-[0.66rem] text-mist-600">
                  {detailQuery.data.model}
                </span>
              ) : null}
            </div>
            <p className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 p-3 text-[0.8rem] leading-6 text-mist-300">
              {detailQuery.data.reason ?? '没有理由记录'}
            </p>
            <TraceBlock title="社交判断" value={detailQuery.data.socialRead} />
            <TraceBlock title="动作计划" value={detailQuery.data.plan} />
            <div>
              <p className="font-mono text-[0.66rem] uppercase tracking-[0.16em] text-mist-600">
                步骤
              </p>
              <div className="mt-1.5 space-y-1">
                {detailQuery.data.steps.map((step) => (
                  <details
                    key={step.id}
                    className="rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2.5 py-2"
                  >
                    <summary className="cursor-pointer text-[0.74rem] text-mist-300">
                      {step.type} · {step.title}
                      {step.durationMs ? (
                        <span className="ml-2 font-mono text-[0.66rem] text-mist-600">
                          {step.durationMs}ms
                        </span>
                      ) : null}
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.66rem] leading-4 text-mist-500">
                      {formatJson(step.output ?? step.input)}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
            <div>
              <p className="font-mono text-[0.66rem] uppercase tracking-[0.16em] text-mist-600">
                动作
              </p>
              <div className="mt-1.5 space-y-1">
                {detailQuery.data.actions.length === 0 ? (
                  <p className="text-[0.72rem] text-mist-600">没有动作。</p>
                ) : (
                  detailQuery.data.actions.map((action) => (
                    <div
                      key={action.id}
                      className="rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2.5 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[0.72rem] text-mist-300">
                          {action.kind} · {action.status}
                        </span>
                        {action.sentMessageId ? (
                          <span className="font-mono text-[0.66rem] text-jade-300">已发送</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[0.7rem] leading-4 text-mist-500">
                        {renderPayload(action.payload)}
                      </p>
                      {action.error ? (
                        <p className="mt-1 text-[0.66rem] text-signal-400">{action.error}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </MindDrawer>
    </>
  );
}

function PromptList() {
  const queryClient = useQueryClient();
  const [source, setSource] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const logsQuery = useQuery({
    queryKey: ['mind', 'prompts', source],
    queryFn: () => api.mindPromptLogs({ source: source || undefined, limit: 200 }),
    staleTime: 5_000,
  });
  const logs: LlmPromptLogRecord[] = logsQuery.data ?? [];
  const sources = Array.from(new Set(logs.map((log) => log.source))).sort();
  const selected = logs.find((log) => log.id === selectedId) ?? null;

  return (
    <>
      <MindSection title={`LLM Prompts · ${logs.length}`} count="最近 200 条">
        <div className="mt-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <DropdownSelect
              value={source}
              options={[
                { value: '', label: '全部来源' },
                ...sources.map((item) => ({ value: item, label: item })),
              ]}
              onChange={(value) => {
                setSource(value);
                setSelectedId('');
              }}
              ariaLabel="按来源筛选提示词"
              showValue={false}
            />
          </div>
          <button
            type="button"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['mind', 'prompts'] })}
            className="rounded-full border border-mist-100/[0.1] p-2 text-mist-500 hover:border-brass-400/30 hover:text-brass-200"
            aria-label="刷新提示词日志"
          >
            <RefreshCw className="size-3" />
          </button>
        </div>
        {logsQuery.isPending ? (
          <div className="grid place-items-center py-10">
            <LoaderCircle className="size-5 animate-spin text-brass-300" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState compact text="还没有 LLM 请求日志。" />
        ) : (
          <div className="mt-2 space-y-1.5">
            <LazyList
              items={logs}
              step={30}
              renderItem={(log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedId(log.id)}
                  className="w-full rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2 text-left transition hover:border-brass-400/30 hover:bg-brass-400/[0.04]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[0.72rem] text-mist-200">
                      {log.source}
                    </span>
                    <span className="font-mono text-[0.66rem] text-mist-600">
                      {formatTime(log.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[0.64rem] text-mist-600">
                    <span>{log.model ?? '未记录模型'}</span>
                    <span>
                      {log.promptTokens ?? '—'} / {log.completionTokens ?? '—'} tokens
                    </span>
                    {log.error ? <span className="text-signal-400">失败</span> : null}
                  </div>
                </button>
              )}
            />
          </div>
        )}
      </MindSection>

      <MindDrawer
        open={Boolean(selected)}
        title={selected?.source ?? '提示词详情'}
        subtitle={
          selected
            ? `${selected.providerName ?? '未知提供商'} · ${selected.model ?? '未知模型'}`
            : undefined
        }
        onClose={() => setSelectedId('')}
        widthClassName="sm:max-w-[42rem]"
      >
        {selected ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[0.66rem] text-mist-600">
              <span>{selected.latencyMs ?? '—'}ms</span>
              <span>{selected.imageCount} 张图片</span>
              <span>{formatTime(selected.createdAt)}</span>
            </div>
            {selected.error ? (
              <p className="rounded-lg border border-signal-400/20 bg-signal-400/[0.05] px-3 py-2 text-[0.74rem] text-signal-400">
                {selected.error}
              </p>
            ) : null}
            <PromptBlock title="System" text={selected.system || '（无）'} />
            <PromptBlock title="Prompt" text={selected.prompt} />
            <PromptBlock title="Response" text={selected.response || '（无）'} />
          </div>
        ) : null}
      </MindDrawer>
    </>
  );
}
