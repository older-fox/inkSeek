import type {
  ChatPipelineRunDetail,
  ChatPipelineRunSummary,
  ChatPipelineRunStatus,
} from '@inkseek/shared';
import { History, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDuration, formatRunTime } from './pipeline-ui';

const RUN_STATUS: Record<
  ChatPipelineRunStatus,
  { label: string; text: string; dot: string; border: string }
> = {
  SUCCEEDED: {
    label: '成功',
    text: 'text-jade-300',
    dot: 'bg-jade-400',
    border: 'border-jade-400/25',
  },
  RUNNING: {
    label: '运行中',
    text: 'text-brass-300',
    dot: 'bg-brass-300',
    border: 'border-brass-400/25',
  },
  FAILED: {
    label: '失败',
    text: 'text-signal-400',
    dot: 'bg-signal-400',
    border: 'border-signal-400/30',
  },
  INTERRUPTED: {
    label: '已中断',
    text: 'text-mist-400',
    dot: 'bg-mist-500',
    border: 'border-mist-100/[0.16]',
  },
};

interface PipelineRunPanelProps {
  runs: ChatPipelineRunSummary[];
  pending: boolean;
  refreshing: boolean;
  selectedRunId: string | null;
  selectedRun: ChatPipelineRunDetail | undefined;
  onSelectRun: (id: string | null) => void;
  onRefresh: () => void;
}

export function PipelineRunPanel({
  runs,
  pending,
  refreshing,
  selectedRunId,
  selectedRun,
  onSelectRun,
  onRefresh,
}: PipelineRunPanelProps) {
  const skipped = selectedRun?.nodes.filter((node) => node.status === 'SKIPPED').length ?? 0;
  const cancelled =
    selectedRun?.nodes.filter((node) => node.status === 'CANCELLED').length ?? 0;
  const failed = selectedRun?.nodes.filter((node) => node.status === 'FAILED').length ?? 0;
  const succeeded =
    selectedRun?.nodes.filter((node) => node.status === 'SUCCEEDED').length ?? 0;
  const running = selectedRun?.nodes.filter((node) => node.status === 'RUNNING').length ?? 0;

  return (
    <section className="flex max-h-[22rem] shrink-0 flex-col border-t border-mist-100/[0.07] bg-ink-950/25">
      <header className="flex items-center justify-between px-4 pb-1.5 pt-3">
        <span className="flex items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-mist-600">
          <History className="size-3" strokeWidth={1.6} />
          运行记录
          <span className="text-mist-500">({runs.length})</span>
        </span>
        <div className="flex items-center gap-1">
          {selectedRunId && (
            <button
              type="button"
              onClick={() => onSelectRun(null)}
              className="flex items-center gap-1 rounded-full border border-mist-100/[0.1] px-2 py-1 text-[0.5rem] text-mist-500 transition hover:border-mist-100/[0.2] hover:text-mist-300"
            >
              <X className="size-2.5" strokeWidth={2} />
              关闭叠加
            </button>
          )}
          <button
            type="button"
            aria-label="刷新运行记录"
            onClick={onRefresh}
            className="grid size-6 place-items-center rounded-full text-mist-600 transition hover:bg-mist-100/[0.05] hover:text-mist-300"
          >
            <RefreshCw
              className={cn('size-3', refreshing && 'animate-spin')}
              strokeWidth={1.7}
            />
          </button>
        </div>
      </header>

      {selectedRun && (
        <div className="mx-3 mb-2 rounded-xl border border-mist-100/[0.08] bg-ink-900/50 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[0.6rem]">
              <span className={cn('size-1.5 rounded-full', RUN_STATUS[selectedRun.status].dot)} />
              <span className={cn(RUN_STATUS[selectedRun.status].text)}>
                {RUN_STATUS[selectedRun.status].label}
              </span>
              <span className="truncate font-mono text-[0.5rem] text-mist-600">
                {selectedRun.graphId}@{selectedRun.graphVersion}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[0.5rem] text-mist-600">
              {formatDuration(selectedRun.durationMs)}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-[0.6rem] leading-5 text-mist-400">
            {selectedRun.senderName ? `${selectedRun.senderName}：` : ''}
            {selectedRun.messagePreview || '（无文本消息）'}
          </p>
          <p className="mt-1 font-mono text-[0.5rem] text-mist-600">
            {selectedRun.conversationName} · {selectedRun.channelName}
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[0.5rem] text-mist-600">
            <span>{succeeded} 成功</span>
            {running > 0 && <span>{running} 运行中</span>}
            <span>{skipped} 跳过</span>
            {cancelled > 0 && <span>{cancelled} 取消</span>}
            <span>{failed} 失败</span>
          </p>
          {selectedRun.error && (
            <p className="mt-1.5 line-clamp-2 text-[0.54rem] leading-4 text-signal-400">
              {selectedRun.error}
            </p>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {pending ? (
          <div className="space-y-1.5">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded-lg border border-mist-100/[0.05] bg-ink-950/30"
              />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-mist-100/[0.1] px-3 py-5 text-center text-[0.58rem] leading-5 text-mist-600">
            还没有运行记录，新的入站消息会在这里留下轨迹。
          </p>
        ) : (
          <div className="space-y-1.5">
            {runs.map((run) => {
              const status = RUN_STATUS[run.status];
              const active = run.id === selectedRunId;
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onSelectRun(run.id)}
                  className={cn(
                    'w-full rounded-lg border px-2.5 py-2 text-left transition',
                    active
                      ? 'border-brass-400/40 bg-brass-400/[0.07]'
                      : 'border-mist-100/[0.06] bg-ink-950/25 hover:border-mist-100/[0.14]',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[0.56rem]">
                      <span className={cn('size-1.5 rounded-full', status.dot)} />
                      <span className={status.text}>{status.label}</span>
                    </span>
                    <span className="font-mono text-[0.48rem] text-mist-600">
                      {formatRunTime(run.startedAt)} · {formatDuration(run.durationMs)}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-[0.58rem] text-mist-400">
                    {run.senderName ? `${run.senderName}：` : ''}
                    {run.messagePreview || '（无文本消息）'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
