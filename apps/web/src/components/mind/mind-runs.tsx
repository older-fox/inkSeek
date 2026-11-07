import type {
  AgentRunDetail,
  AgentRunScene,
  AgentRunSceneMessage,
  AgentRunSummary,
  AgentStepRecord,
  LlmPromptLogRecord,
} from '@inkseek/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { DropdownSelect } from '@/components/dropdown-select';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatTime } from './mind-format';
import { HeartbeatLogView } from './mind-heartbeats';
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
  const [view, setView] = useState<'runs' | 'prompts' | 'heartbeats'>('runs');
  const [runFocus, setRunFocus] = useState<{ id: string } | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(
          [
            ['runs', '运行轨迹'],
            ['prompts', '提示词日志'],
            ['heartbeats', '心跳日志'],
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
        <RunsList
          personaId={personaId}
          approvalMode={approvalMode}
          focus={runFocus}
          onFocusConsumed={() => setRunFocus(null)}
        />
      ) : view === 'prompts' ? (
        <PromptList />
      ) : (
        <HeartbeatLogView
          personaId={personaId}
          onOpenRun={(id) => {
            setRunFocus({ id });
            setView('runs');
          }}
        />
      )}
    </div>
  );
}

const LIST_PAGE_SIZE = 40;
const LIST_POLL_MS = 3_000;
const RUN_POLL_MS = 2_000;
/** Finished runs still collect late writeback steps; a slow poll catches them. */
const DETAIL_IDLE_POLL_MS = 6_000;

const TRIGGER_LABELS: Record<string, string> = {
  MESSAGE: '消息触发',
  HEARTBEAT: '心跳唤醒',
  PROACTIVE: '主动唤醒',
  MANUAL: '手动触发',
  PHONE: '手机消遣',
};

const STEP_TYPE_LABELS: Record<string, string> = {
  ATTENTION: '注意力',
  RETRIEVAL: '记忆检索',
  APPRAISAL: '判断',
  SOCIAL: '社交',
  TOOL: '工具',
  PLAN: '计划',
  EXPRESSION: '表达',
  WRITEBACK: '写回',
  CONSOLIDATION: '整理',
};

const ACTION_LABELS: Record<string, string> = {
  MESSAGE: '文字消息',
  STICKER: '表情',
  FACE: 'QQ 表情',
  TYPING: '输入中',
  MEMORY: '记忆',
  TODO: '待办',
};

const VERDICT_LABELS: Record<string, string> = {
  continue: '还在继续',
  linger: '可停可续',
  close: '已经收尾',
};

function RunsList({
  personaId,
  approvalMode,
  focus,
  onFocusConsumed,
}: {
  personaId: string;
  approvalMode: boolean;
  focus?: { id: string } | null;
  onFocusConsumed?: () => void;
}) {
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [offset, setOffset] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (focus) {
      setSelectedId(focus.id);
      onFocusConsumed?.();
    }
  }, [focus, onFocusConsumed]);

  // The first page keeps polling even after older pages are loaded, so new
  // runs still appear at the top while the operator scrolls back in time.
  const headQuery = useQuery({
    queryKey: ['mind', 'runs', personaId, 0],
    queryFn: () => api.mindRuns(personaId, undefined, LIST_PAGE_SIZE, 0),
    staleTime: 1_500,
    refetchInterval: LIST_POLL_MS,
    // The trace is a monitoring view; keep pulling even in a background tab.
    refetchIntervalInBackground: true,
  });
  const pageQuery = useQuery({
    queryKey: ['mind', 'runs', personaId, offset],
    queryFn: () => api.mindRuns(personaId, undefined, LIST_PAGE_SIZE, offset),
    enabled: offset > 0,
    staleTime: 1_500,
  });

  useEffect(() => {
    setRuns([]);
    setOffset(0);
    setReachedEnd(false);
    setSelectedId('');
  }, [personaId]);

  useEffect(() => {
    const pages = [headQuery.data, pageQuery.data];
    if (!headQuery.data && !pageQuery.data) {
      return;
    }
    setRuns((current) => {
      const byId = new Map(current.map((run) => [run.id, run]));
      for (const page of pages) {
        for (const run of page ?? []) {
          byId.set(run.id, run);
        }
      }
      return [...byId.values()].sort((left, right) =>
        right.startedAt.localeCompare(left.startedAt),
      );
    });
    const loadedPage = offset > 0 ? pageQuery.data : headQuery.data;
    if (loadedPage && loadedPage.length < LIST_PAGE_SIZE) {
      setReachedEnd(true);
    }
  }, [headQuery.data, pageQuery.data, offset]);

  const detailQuery = useQuery({
    queryKey: ['mind', 'run', selectedId],
    queryFn: () => api.mindRun(selectedId),
    enabled: Boolean(selectedId),
    staleTime: 1_500,
    refetchInterval: (query) =>
      query.state.data?.status === 'RUNNING' ? RUN_POLL_MS : DETAIL_IDLE_POLL_MS,
    refetchIntervalInBackground: true,
  });

  const detail = detailQuery.data ?? null;
  const isRunning = detail?.status === 'RUNNING';

  const promptQuery = useQuery({
    queryKey: ['mind', 'run-prompts', selectedId],
    queryFn: () => api.mindPromptLogs({ runId: selectedId, limit: 50 }),
    enabled: Boolean(selectedId),
    staleTime: 1_500,
    refetchInterval: isRunning ? LIST_POLL_MS : false,
    refetchIntervalInBackground: true,
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
  const runningCount = runs.filter((run) => run.status === 'RUNNING').length;

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

      <MindSection
        title={`Runs · ${runs.length}`}
        count={
          runningCount > 0
            ? `${runningCount} 条运行中 · 3s 自动刷新`
            : reachedEnd
              ? '到底了'
              : '3s 自动刷新'
        }
      >
        {headQuery.isPending && runs.length === 0 ? (
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
                  className={cn(
                    'w-full rounded-xl border bg-ink-950/25 px-3 py-2.5 text-left transition hover:border-brass-400/30 hover:bg-brass-400/[0.04]',
                    run.status === 'RUNNING' ? 'border-brass-400/25' : 'border-mist-100/[0.06]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[0.76rem] text-mist-200">
                      <StatusDot status={run.status} />
                      <span className="shrink-0">{TRIGGER_LABELS[run.trigger] ?? run.trigger}</span>
                      {run.status === 'RUNNING' ? (
                        <span className="animate-pulse rounded-full border border-brass-400/30 px-1.5 py-px font-mono text-[0.58rem] text-brass-300">
                          运行中
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-[0.64rem] text-mist-600">
                      {formatTime(run.startedAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[0.74rem] leading-5 text-mist-300">
                    {run.messagePreview ? (
                      <>
                        <span className="text-mist-500">{run.messageSender || '对方'}：</span>
                        {run.messagePreview}
                      </>
                    ) : (
                      run.reason || '没有记录消息'
                    )}
                  </p>
                  {run.messagePreview && run.reason ? (
                    <p className="mt-0.5 line-clamp-1 text-[0.66rem] leading-4 text-mist-500">
                      {run.reason}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.62rem] text-mist-600">
                    <span>{run.mode}</span>
                    <span>{run.conversationName ?? '会话'}</span>
                    <span>{run.latencyMs ? `${run.latencyMs}ms` : '—'}</span>
                    {run.promptTokens != null ? (
                      <span>
                        {run.promptTokens}+{run.completionTokens ?? 0} tok
                      </span>
                    ) : null}
                  </div>
                </button>
              )}
            />
            {!reachedEnd ? (
              <button
                type="button"
                onClick={() => setOffset(runs.length)}
                disabled={offset > 0 && pageQuery.isPending}
                className="mt-2 w-full rounded-lg border border-mist-100/[0.08] py-1.5 text-[0.72rem] text-mist-400 transition hover:border-mist-100/[0.16] hover:text-mist-200 disabled:opacity-50"
              >
                {offset > 0 && pageQuery.isPending ? '加载中…' : '加载更多'}
              </button>
            ) : null}
          </div>
        )}
      </MindSection>

      <MindDrawer
        open={Boolean(selectedId)}
        title="运行详情"
        subtitle={
          isRunning
            ? '运行中 · 每 2 秒自动刷新'
            : detail
              ? `${TRIGGER_LABELS[detail.trigger] ?? detail.trigger} · ${formatTime(detail.startedAt)}`
              : selectedId
        }
        onClose={() => setSelectedId('')}
        widthClassName="sm:max-w-[56rem]"
      >
        {detailQuery.isPending ? (
          <div className="grid place-items-center py-16">
            <LoaderCircle className="size-5 animate-spin text-brass-300" />
          </div>
        ) : !detail ? (
          <EmptyState compact text="运行详情不可用。" />
        ) : (
          <RunTrace
            detail={detail}
            prompts={promptQuery.data ?? []}
            promptsLoading={promptQuery.isPending}
            isRunning={Boolean(isRunning)}
          />
        )}
      </MindDrawer>
    </>
  );
}

function RunTrace({
  detail,
  prompts,
  promptsLoading,
  isRunning,
}: {
  detail: AgentRunDetail;
  prompts: LlmPromptLogRecord[];
  promptsLoading: boolean;
  isRunning: boolean;
}) {
  const attention = detail.steps.find((step) => step.title === '注意力与社交判断');
  const attentionOutput = recordOf(attention?.output);
  // A running run has not written its final decision yet; the attention step already has it.
  const decision = recordOf(detail.decision) ?? attentionOutput;
  const plan = recordOf(detail.plan);
  const social = recordOf(detail.socialRead) ?? recordOf(attentionOutput?.['read']);
  const conversation = recordOf(attentionOutput?.['conversation']);
  const triggerMessage = lastInboundMessage(detail.scene);
  const toolSteps = detail.steps.filter((step) => step.type === 'TOOL');
  const otherSteps = detail.steps.filter((step) => step.type !== 'TOOL');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill status={detail.status} />
        <Chip>{TRIGGER_LABELS[detail.trigger] ?? detail.trigger}</Chip>
        <Chip>{detail.mode}</Chip>
        {detail.model ? <Chip>{detail.model}</Chip> : null}
        <Chip>
          {formatTime(detail.startedAt)} →{' '}
          {detail.finishedAt ? formatTime(detail.finishedAt) : '进行中'}
        </Chip>
        {detail.latencyMs != null ? <Chip>{detail.latencyMs}ms</Chip> : null}
        {detail.promptTokens != null || detail.completionTokens != null ? (
          <Chip>
            {detail.promptTokens ?? 0} + {detail.completionTokens ?? 0} tokens
          </Chip>
        ) : null}
        {detail.cost != null ? <Chip>¥{detail.cost.toFixed(4)}</Chip> : null}
      </div>

      {isRunning ? (
        <div className="flex items-center gap-2 rounded-xl border border-brass-400/25 bg-brass-400/[0.06] px-3 py-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brass-400/60" />
            <span className="relative inline-flex size-2 rounded-full bg-brass-400" />
          </span>
          <p className="text-[0.72rem] text-brass-200">
            运行中，每 2 秒自动刷新轨迹与提示词；工具调用和模型输出会随执行出现。
          </p>
        </div>
      ) : null}

      {detail.error ? (
        <p className="rounded-xl border border-signal-400/20 bg-signal-400/[0.05] px-3 py-2 text-[0.74rem] text-signal-400">
          {detail.error}
        </p>
      ) : null}

      <DetailBlock
        title={detail.trigger === 'MESSAGE' ? '收到的消息' : '唤醒场景'}
        meta={detail.conversationName ?? detail.scene?.conversationName ?? undefined}
      >
        {triggerMessage ? (
          <div className="rounded-xl border border-brass-400/25 bg-brass-400/[0.06] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.78rem] text-mist-200">
                {triggerMessage.sender || '对方'}
              </span>
              <span className="font-mono text-[0.62rem] text-mist-600">
                {formatTime(triggerMessage.sentAt)}
              </span>
            </div>
            <MessageBody message={triggerMessage} tone="trigger" />
            <div className="mt-1.5 flex flex-wrap gap-2 font-mono text-[0.6rem] text-mist-600">
              <span>{detail.trigger === 'MESSAGE' ? '触发本轮' : '心跳时的最近一条消息'}</span>
              {detail.messageId ? <span>{detail.messageId}</span> : null}
              <span>{detail.scene?.kind ?? '—'}</span>
            </div>
          </div>
        ) : (
          <p className="text-[0.74rem] text-mist-500">
            这次运行没有捕获到消息（可能是手动触发或会话为空）。
          </p>
        )}
      </DetailBlock>

      <JudgementTrace decision={decision} social={social} conversation={conversation} />

      <PromptTrace prompts={prompts} loading={promptsLoading} isRunning={isRunning} />

      <ToolTrace steps={toolSteps} />

      <ResponseTrace plan={plan} decision={decision} />

      <ActionTrace actions={detail.actions} />

      <SceneTrace scene={detail.scene} trigger={detail.trigger} />

      <StepTrace steps={otherSteps} />
    </div>
  );
}

function JudgementTrace({
  decision,
  social,
  conversation,
}: {
  decision: Record<string, unknown> | null;
  social: Record<string, unknown> | null;
  conversation: Record<string, unknown> | null;
}) {
  const reason = textOf(decision?.['reason']) || '没有记录理由';
  const engage = decision?.['engage'];
  const stance = textOf(decision?.['stance']);
  const shown = textOf(decision?.['shown']);
  const felt = recordOf(decision?.['felt']);
  const socialFelt = recordOf(social?.['felt']);
  const feltLabel = textOf(felt?.['label']) || textOf(socialFelt?.['label']);
  const feltIntensity = numOf(felt?.['intensity']) ?? numOf(socialFelt?.['intensity']);
  const socialReasons = listOf(social?.['reasons']);
  const constraints = listOf(social?.['hardConstraints']);
  const suggested = textOf(social?.['suggestedStance']);
  const verdict = textOf(conversation?.['verdict']);
  const interest = recordOf(conversation?.['interest']);
  const interestTopics = listOf(interest?.['topics']);
  const conversationReasons = listOf(conversation?.['reasons']);

  return (
    <DetailBlock title="判断" meta="社交读 / 对话节奏">
      <p className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 p-3 text-[0.8rem] leading-6 text-mist-300">
        {reason}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {engage === false ? <Chip>决定保持沉默</Chip> : null}
        {engage === true ? <Chip>决定回应</Chip> : null}
        {stance ? <Chip>姿态 · {stance}</Chip> : null}
        {shown ? <Chip>表现 · {shown}</Chip> : null}
        {feltLabel ? (
          <Chip>
            感受 · {feltLabel}
            {feltIntensity != null ? ` ${feltIntensity}` : ''}
          </Chip>
        ) : null}
        {suggested ? <Chip>社交建议 · {suggested}</Chip> : null}
      </div>

      {social ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {(
            [
              ['注意力', 'attention'],
              ['想说话', 'desire'],
              ['风险', 'risk'],
              ['亏欠', 'obligation'],
            ] as const
          ).map(([label, key]) => (
            <div
              key={key}
              className="rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2 py-1.5"
            >
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-mist-600">
                {label}
              </p>
              <p className="mt-0.5 text-[0.8rem] text-mist-200">{numOf(social[key]) ?? '—'}</p>
            </div>
          ))}
        </div>
      ) : null}

      {conversation ? (
        <div className="mt-2 rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip>对话节奏 · {VERDICT_LABELS[verdict] ?? (verdict || '—')}</Chip>
            <Chip>收尾分 {numOf(conversation['score']) ?? '—'}</Chip>
            <Chip>兴趣 {numOf(interest?.['score']) ?? '—'}</Chip>
            {interestTopics.length > 0 ? <Chip>话题 · {interestTopics.join('、')}</Chip> : null}
          </div>
          {textOf(conversation['advice']) ? (
            <p className="mt-1.5 text-[0.74rem] leading-5 text-mist-400">
              {textOf(conversation['advice'])}
            </p>
          ) : null}
          {conversationReasons.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-[0.68rem] leading-4 text-mist-500">
              {conversationReasons.map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {socialReasons.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-[0.7rem] leading-4 text-mist-500">
          {socialReasons.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      ) : null}
      {constraints.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-[0.7rem] leading-4 text-signal-400/90">
          {constraints.map((item) => (
            <li key={item}>! {item}</li>
          ))}
        </ul>
      ) : null}
    </DetailBlock>
  );
}

function PromptTrace({
  prompts,
  loading,
  isRunning,
}: {
  prompts: LlmPromptLogRecord[];
  loading: boolean;
  isRunning: boolean;
}) {
  const ordered = [...prompts].reverse();
  return (
    <DetailBlock title="生成的提示词" meta={`${prompts.length} 次模型调用`}>
      {loading ? (
        <div className="grid place-items-center py-8">
          <LoaderCircle className="size-4 animate-spin text-brass-300" />
        </div>
      ) : ordered.length === 0 ? (
        <p className="text-[0.74rem] text-mist-500">
          {isRunning
            ? '模型还没有返回，提示词日志会在下一次刷新出现。'
            : '这次运行没有关联的提示词日志（旧运行或没有调用模型）。'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {ordered.map((log, index) => (
            <details
              key={log.id}
              open={index === ordered.length - 1}
              className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30"
            >
              <summary className="cursor-pointer px-2.5 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[0.7rem] text-mist-200">
                    #{index + 1} {log.source}
                  </span>
                  <span className="font-mono text-[0.62rem] text-mist-600">
                    {formatTime(log.createdAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[0.62rem] text-mist-600">
                  <span>{log.model ?? '未记录模型'}</span>
                  <span>
                    {log.promptTokens ?? '—'} / {log.completionTokens ?? '—'} tokens
                  </span>
                  <span>{log.latencyMs ?? '—'}ms</span>
                  {log.imageCount > 0 ? <span>{log.imageCount} 图</span> : null}
                  {log.error ? <span className="text-signal-400">失败</span> : null}
                </div>
              </summary>
              <div className="space-y-2 border-t border-mist-100/[0.06] px-2.5 py-2.5">
                {log.error ? (
                  <p className="rounded-lg border border-signal-400/20 bg-signal-400/[0.05] px-2 py-1.5 text-[0.7rem] text-signal-400">
                    {log.error}
                  </p>
                ) : null}
                <PromptBlock title="System" text={log.system || '（无）'} />
                <PromptBlock title="Prompt" text={log.prompt} />
                <PromptBlock title="Response / Agent 输出" text={log.response || '（无）'} />
              </div>
            </details>
          ))}
        </div>
      )}
    </DetailBlock>
  );
}

function ToolTrace({ steps }: { steps: AgentStepRecord[] }) {
  return (
    <DetailBlock title="工具调用" meta={`${steps.length} 次`}>
      {steps.length === 0 ? (
        <p className="text-[0.74rem] text-mist-500">这次运行没有调用工具。</p>
      ) : (
        <div className="space-y-1.5">
          {steps.map((step) => (
            <details
              key={step.id}
              className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30"
            >
              <summary className="cursor-pointer px-2.5 py-2">
                <span className="font-mono text-[0.72rem] text-mist-200">{step.title}</span>
                <span className="ml-2 font-mono text-[0.62rem] text-mist-600">
                  {step.durationMs ?? 0}ms
                </span>
                <span className="ml-2 font-mono text-[0.62rem] text-mist-600">
                  {formatTime(step.createdAt)}
                </span>
                {step.error ? (
                  <span className="ml-2 text-[0.62rem] text-signal-400">失败</span>
                ) : null}
              </summary>
              <div className="space-y-2 border-t border-mist-100/[0.06] px-2.5 py-2.5">
                <JsonPanel label="入参" value={step.input} />
                <JsonPanel label="结果" value={step.output} />
                {step.error ? <p className="text-[0.7rem] text-signal-400">{step.error}</p> : null}
              </div>
            </details>
          ))}
        </div>
      )}
    </DetailBlock>
  );
}

function ResponseTrace({
  plan,
  decision,
}: {
  plan: Record<string, unknown> | null;
  decision: Record<string, unknown> | null;
}) {
  const beats = readBeats(plan);
  const engage = plan?.['engage'];
  const stance = textOf(plan?.['stance']);
  const shown = textOf(plan?.['shown']) || textOf(decision?.['shown']);
  const felt = recordOf(plan?.['felt']) ?? recordOf(decision?.['felt']);
  const feltLabel = textOf(felt?.['label']);
  const feltIntensity = numOf(felt?.['intensity']);

  return (
    <DetailBlock title="Agent 的回应" meta={beats.length > 0 ? `${beats.length} 条表达` : '未发送'}>
      {!plan ? (
        <p className="text-[0.74rem] text-mist-500">这次运行没有生成动作计划。</p>
      ) : beats.length === 0 ? (
        <p className="text-[0.76rem] text-mist-500">
          {engage === false ? '计划决定保持沉默，没有发送。' : '计划没有生成可发送的表达。'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {beats.map((beat, index) => (
            <div
              key={`${beat.kind}-${index}`}
              className="rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-mist-600">
                  {beatLabel(beat.kind)}
                </span>
                {beat.delayMs != null ? (
                  <span className="font-mono text-[0.62rem] text-mist-600">
                    延迟 {beat.delayMs}ms
                  </span>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-[0.8rem] leading-5 text-mist-200">
                {beat.text ?? beat.stickerId ?? beat.faceId ?? '（空）'}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {stance ? <Chip>姿态 · {stance}</Chip> : null}
        {feltLabel ? (
          <Chip>
            情绪 · {feltLabel}
            {feltIntensity != null ? ` ${feltIntensity}` : ''}
          </Chip>
        ) : null}
        {shown ? <Chip>表现 · {shown}</Chip> : null}
      </div>
      {plan ? <TraceBlock title="原始动作计划" value={plan} /> : null}
    </DetailBlock>
  );
}

function ActionTrace({ actions }: { actions: AgentRunDetail['actions'] }) {
  return (
    <DetailBlock title="动作执行" meta={`${actions.length} 个动作`}>
      {actions.length === 0 ? (
        <p className="text-[0.74rem] text-mist-500">这次运行没有产生动作。</p>
      ) : (
        <div className="space-y-1.5">
          {actions.map((action) => (
            <div
              key={action.id}
              className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 px-2.5 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[0.68rem] text-mist-200">
                  {ACTION_LABELS[action.kind] ?? action.kind} · {action.status}
                </span>
                <span className="font-mono text-[0.62rem] text-mist-600">
                  {formatTime(action.createdAt)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-[0.74rem] leading-5 text-mist-300">
                {renderPayload(action.payload)}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[0.6rem] text-mist-600">
                {action.sentMessageId ? (
                  <span className="text-jade-300">已发送 · {action.sentMessageId}</span>
                ) : null}
                <span>{action.idempotencyKey}</span>
              </div>
              {action.error ? (
                <p className="mt-1 text-[0.66rem] text-signal-400">{action.error}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </DetailBlock>
  );
}

function SceneTrace({ scene, trigger }: { scene: AgentRunScene | null; trigger: string }) {
  if (!scene) {
    return null;
  }
  const triggerMessage = trigger === 'MESSAGE' ? lastInboundMessage(scene) : null;
  return (
    <DetailBlock
      title="进入心智的对话"
      meta={`${scene.messages.length} 条 · ${scene.conversationName ?? scene.conversationId}`}
    >
      <div className="space-y-1">
        {scene.messages.map((message) => {
          const highlight = triggerMessage !== null && message === triggerMessage;
          return (
            <div
              key={`${message.id}-${message.sentAt}`}
              className={cn(
                'rounded-lg border px-2.5 py-1.5',
                highlight
                  ? 'border-brass-400/30 bg-brass-400/[0.06]'
                  : 'border-mist-100/[0.05] bg-ink-950/20',
              )}
            >
              <div className="flex items-center justify-between gap-2 font-mono text-[0.6rem] text-mist-600">
                <span>
                  {message.sender || '未知'}
                  {message.isSelf ? ' · 我' : ''}
                  {highlight ? ' · 触发消息' : ''}
                </span>
                <span>{formatTime(message.sentAt)}</span>
              </div>
              <MessageBody message={message} />
            </div>
          );
        })}
      </div>
    </DetailBlock>
  );
}

function MessageBody({
  message,
  tone = 'normal',
}: {
  message: AgentRunSceneMessage;
  tone?: 'trigger' | 'normal';
}) {
  const images = message.images ?? [];
  const textClass =
    tone === 'trigger'
      ? 'text-[0.84rem] leading-6 text-mist-100'
      : 'mt-0.5 text-[0.74rem] leading-5 text-mist-300';
  const imageClass =
    tone === 'trigger'
      ? 'mt-1.5 text-[0.74rem] leading-5 text-mist-300'
      : 'mt-1 text-[0.68rem] leading-5 text-mist-500';
  return (
    <>
      {message.text ? (
        <p className={cn('whitespace-pre-wrap break-words', textClass)}>{message.text}</p>
      ) : null}
      {images.map((image, index) => (
        <p
          key={`${message.id}-image-${index}`}
          className={cn(
            'whitespace-pre-wrap break-words rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2 py-1',
            imageClass,
          )}
        >
          <span className="font-mono text-mist-600">［图片］</span>
          {image}
        </p>
      ))}
      {!message.text && images.length === 0 ? (
        <p className={cn('break-words', textClass)}>
          {message.imageCount ? `［图片 ×${message.imageCount}］` : '（没有文字内容）'}
        </p>
      ) : null}
    </>
  );
}

function StepTrace({ steps }: { steps: AgentStepRecord[] }) {
  return (
    <DetailBlock title="执行步骤" meta={`${steps.length} 步（不含工具）`}>
      {steps.length === 0 ? (
        <p className="text-[0.74rem] text-mist-500">没有其他步骤记录。</p>
      ) : (
        <div className="space-y-1">
          {steps.map((step) => (
            <details
              key={step.id}
              className="rounded-lg border border-mist-100/[0.06] bg-ink-950/30"
            >
              <summary className="cursor-pointer px-2.5 py-2">
                <span className="font-mono text-[0.62rem] text-mist-600">
                  [{STEP_TYPE_LABELS[step.type] ?? step.type}]
                </span>{' '}
                <span className="text-[0.74rem] text-mist-300">{step.title}</span>
                {step.durationMs != null ? (
                  <span className="ml-2 font-mono text-[0.62rem] text-mist-600">
                    {step.durationMs}ms
                  </span>
                ) : null}
                <span className="ml-2 font-mono text-[0.6rem] text-mist-600">
                  {formatTime(step.createdAt)}
                </span>
                {step.error ? (
                  <span className="ml-2 text-[0.62rem] text-signal-400">失败</span>
                ) : null}
              </summary>
              <div className="space-y-2 border-t border-mist-100/[0.06] px-2.5 py-2.5">
                <JsonPanel label="入参" value={step.input} />
                <JsonPanel label="产出" value={step.output} />
                {step.error ? <p className="text-[0.7rem] text-signal-400">{step.error}</p> : null}
              </div>
            </details>
          ))}
        </div>
      )}
    </DetailBlock>
  );
}

function DetailBlock({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-950/20 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-mist-600">
          {title}
        </p>
        {meta ? (
          <span className="truncate font-mono text-[0.62rem] text-mist-600">{meta}</span>
        ) : null}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-mist-100/[0.08] px-2 py-0.5 font-mono text-[0.64rem] text-mist-500">
      {children}
    </span>
  );
}

function JsonPanel({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-mist-600">{label}</p>
      <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-mist-100/[0.06] bg-ink-950/40 p-2.5 font-mono text-[0.66rem] leading-4 text-mist-400">
        {value === null || value === undefined ? '—' : formatJson(value)}
      </pre>
    </div>
  );
}

interface BeatView {
  kind: string;
  text?: string;
  stickerId?: string;
  faceId?: string;
  delayMs?: number;
}

function readBeats(plan: Record<string, unknown> | null): BeatView[] {
  const beats = plan?.['beats'];
  if (!Array.isArray(beats)) {
    return [];
  }
  return beats.flatMap((item) => {
    const record = recordOf(item);
    if (!record) {
      return [];
    }
    const beat: BeatView = {
      kind: textOf(record['kind']) || 'text',
    };
    const text = textOf(record['text']);
    const stickerId = textOf(record['stickerId']);
    const faceId = textOf(record['faceId']);
    const delayMs = numOf(record['delayMs']);
    if (text) beat.text = text;
    if (stickerId) beat.stickerId = stickerId;
    if (faceId) beat.faceId = faceId;
    if (delayMs != null) beat.delayMs = delayMs;
    return [beat];
  });
}

function beatLabel(kind: string): string {
  if (kind === 'sticker') return '表情';
  if (kind === 'face') return 'QQ 表情';
  return '文字';
}

function lastInboundMessage(scene: AgentRunScene | null): AgentRunSceneMessage | null {
  if (!scene) {
    return null;
  }
  for (let index = scene.messages.length - 1; index >= 0; index -= 1) {
    const message = scene.messages[index];
    if (message && !message.isSelf) {
      return message;
    }
  }
  return null;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function listOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
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
