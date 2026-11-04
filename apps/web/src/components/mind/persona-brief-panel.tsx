import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Activity, ArrowUpRight, LoaderCircle, Settings2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  CHANGE_SCOPE_LABELS,
  STATE_EVENT_KIND_LABELS,
  STATE_FIELD_LABELS,
  formatStateValue,
  formatTime,
  stateMoodLabel,
} from './mind-format';
import { EmptyState, MindDrawer } from './mind-ui';

const METRICS = [
  { key: 'moodValence', label: '心情', signed: true },
  { key: 'moodArousal', label: '唤醒' },
  { key: 'moodDominance', label: '掌控', signed: true },
  { key: 'energy', label: '精力' },
  { key: 'health', label: '健康' },
  { key: 'stress', label: '压力', inverse: true },
  { key: 'socialBattery', label: '社交电量' },
  { key: 'attention', label: '注意力' },
  { key: 'sleepDebt', label: '睡眠债', inverse: true },
  { key: 'grooming', label: '整洁' },
] as const;

export function PersonaBriefPanel({
  open,
  channelId,
  personaId,
  name,
  identity,
  quote,
  onClose,
}: {
  open: boolean;
  channelId: string;
  personaId: string;
  name: string;
  identity: string;
  quote: string;
  onClose: () => void;
}) {
  const stateQuery = useQuery({
    queryKey: ['mind', 'state', personaId],
    queryFn: () => api.mindState(personaId),
    enabled: open && Boolean(personaId),
    staleTime: 5_000,
  });
  const eventsQuery = useQuery({
    queryKey: ['mind', 'long-events', personaId],
    queryFn: () => api.mindLongEvents(personaId, 4),
    enabled: open && Boolean(personaId),
    staleTime: 5_000,
  });
  const changesQuery = useQuery({
    queryKey: ['mind', 'changes', personaId, 'brief'],
    queryFn: () => api.mindChanges(personaId, { limit: 8, offset: 0 }),
    enabled: open && Boolean(personaId),
    staleTime: 5_000,
  });
  const state = stateQuery.data ?? null;
  const activeEvent = (eventsQuery.data ?? []).find((event) => event.status === 'ACTIVE') ?? null;

  return (
    <MindDrawer
      open={open}
      title={name}
      subtitle={identity || '人格简报'}
      onClose={onClose}
      widthClassName="sm:max-w-[34rem]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-jade-400/20 bg-jade-400/[0.07] px-2.5 py-1 text-[0.68rem] text-jade-300">
          <Activity className="size-3" />
          {state ? `${stateMoodLabel(state)} · ${state.currentActivity || '在线'}` : '状态读取中'}
        </span>
        {quote ? <span className="text-[0.7rem] text-mist-500">「{quote}」</span> : null}
      </div>

      {stateQuery.isPending ? (
        <div className="grid place-items-center py-12">
          <LoaderCircle className="size-5 animate-spin text-brass-300" />
        </div>
      ) : !state ? (
        <EmptyState compact text="还没有实时状态。" />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {METRICS.map((metric) => {
              const value = state[metric.key];
              return (
                <div
                  key={metric.key}
                  className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 px-2.5 py-2"
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-[0.64rem] text-mist-600">{metric.label}</span>
                    <span className="font-mono text-[0.82rem] text-mist-200">{value}</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-mist-100/[0.08]">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        'inverse' in metric && metric.inverse
                          ? 'bg-signal-400/70'
                          : 'signed' in metric && metric.signed && value < 0
                            ? 'bg-signal-400/70'
                            : 'bg-jade-400/70',
                      )}
                      style={{ width: `${Math.min(100, Math.abs(value))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 grid gap-2 text-[0.68rem] text-mist-500 sm:grid-cols-2">
            <p className="rounded-lg bg-ink-950/25 px-2.5 py-1.5">
              位置 <span className="text-mist-300">{state.location || '未设定'}</span>
            </p>
            <p className="rounded-lg bg-ink-950/25 px-2.5 py-1.5">
              下次唤醒 <span className="text-mist-300">{formatTime(state.nextWakeAt)}</span>
            </p>
          </div>
        </>
      )}

      {activeEvent ? (
        <div className="mt-4 rounded-xl border border-brass-400/25 bg-brass-400/[0.06] p-3">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-brass-200">
            长时事件 · {STATE_EVENT_KIND_LABELS[activeEvent.kind] ?? activeEvent.kind}
          </p>
          <p className="mt-1 text-[0.82rem] text-mist-200">
            {activeEvent.title || activeEvent.kind}
          </p>
          <p className="mt-1 text-[0.68rem] text-mist-500">
            开始 {formatTime(activeEvent.startedAt)} ·{' '}
            {activeEvent.plannedEndAt
              ? `计划结束 ${formatTime(activeEvent.plannedEndAt)}`
              : '没有计划结束'}
          </p>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-mist-600">
            最近变动
          </p>
          <Link
            to="/mind"
            search={{ channelId, tab: 'changes' }}
            className="inline-flex items-center gap-1 text-[0.66rem] text-brass-300 hover:text-brass-200"
          >
            全部
            <ArrowUpRight className="size-3" />
          </Link>
        </div>
        {changesQuery.isPending ? (
          <div className="grid place-items-center py-6">
            <LoaderCircle className="size-4 animate-spin text-brass-300" />
          </div>
        ) : (changesQuery.data ?? []).length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-mist-100/[0.1] px-3 py-3 text-center text-[0.68rem] text-mist-600">
            还没有变动记录。
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            {changesQuery.data?.map((change) => (
              <div
                key={change.id}
                className="rounded-lg border border-mist-100/[0.06] bg-ink-950/25 px-2.5 py-1.5 text-[0.68rem]"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-mono text-mist-600">{formatTime(change.createdAt)}</span>
                  <span className="rounded-full border border-mist-100/[0.08] px-1.5 py-0.5 font-mono text-[0.58rem] text-mist-500">
                    {CHANGE_SCOPE_LABELS[change.scope] ?? change.scope}
                  </span>
                  <span className="text-mist-300">
                    {STATE_FIELD_LABELS[change.field] ?? change.field}
                  </span>
                  <span className="font-mono text-mist-400">
                    {formatStateValue(change.beforeValue)} → {formatStateValue(change.afterValue)}
                  </span>
                </div>
                {change.reason ? (
                  <p className="mt-0.5 truncate text-mist-600">{change.reason}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          to="/mind"
          search={{ channelId, tab: 'runs' }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brass-400/30 bg-brass-400/10 px-3 text-[0.72rem] text-brass-200 transition hover:bg-brass-400/20"
        >
          <Activity className="size-3.5" />
          打开心智面板
        </Link>
        <Link
          to="/connections"
          search={{ persona: channelId }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-mist-100/10 px-3 text-[0.72rem] text-mist-400 transition hover:border-brass-400/25 hover:text-brass-200"
        >
          <Settings2 className="size-3.5" />
          人格与配置
        </Link>
      </div>
    </MindDrawer>
  );
}
