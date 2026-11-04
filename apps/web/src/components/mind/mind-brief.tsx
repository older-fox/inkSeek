import type { PersonaLongEventRecord, PersonaStateRecord } from '@inkseek/shared';
import { Activity, CalendarClock, HeartPulse, Moon } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  BASE_METRIC_LABELS,
  STATE_EVENT_KIND_LABELS,
  STATE_WAKE_REASON_LABELS,
  formatTime,
  sleepDifficultyLabel,
  stateMoodLabel,
} from './mind-format';
import { EmptyState } from './mind-ui';

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

export function MindBrief({
  name,
  identity,
  quote,
  modeLabel,
  state,
  longEvents,
  base,
  onEndEvent,
  endingEvent,
}: {
  name: string;
  identity: string;
  quote: string;
  modeLabel: string;
  state: PersonaStateRecord | null;
  longEvents: PersonaLongEventRecord[];
  base: Record<string, number>;
  onEndEvent?: () => void;
  endingEvent?: boolean;
}) {
  const activeEvent = longEvents.find((event) => event.status === 'ACTIVE') ?? null;
  const recentEvents = longEvents.filter((event) => event.status !== 'ACTIVE').slice(0, 2);
  const baseEntries = Object.entries(base);
  const sleepDepth = Math.max(0, Math.min(4, base['sleep_depth'] ?? 2));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <section className="relative overflow-hidden rounded-[1.6rem] border border-mist-100/[0.08] bg-ink-900/40 p-5 sm:p-6">
        <div
          className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--orb-brass), transparent 68%)' }}
        />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.26em] text-brass-400/75">
                Persona Brief
              </p>
              <h2 className="mt-1.5 font-display text-[1.5rem] font-semibold tracking-tight text-mist-100">
                {name}
              </h2>
              <p className="mt-1 text-[0.8rem] leading-6 text-mist-500">
                {identity || '还没有身份描述'}
                {quote ? ` · 「${quote}」` : ''}
              </p>
            </div>
            <span className="rounded-full border border-jade-400/20 bg-jade-400/[0.07] px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-jade-300">
              {modeLabel}
            </span>
          </div>

          {state ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.72rem] text-mist-500">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-mist-100/[0.08] bg-ink-950/30 px-2.5 py-1">
                  <Activity className="size-3 text-jade-300" />
                  {stateMoodLabel(state)} · {state.currentActivity || '在线'}
                </span>
                {state.location ? (
                  <span className="rounded-full border border-mist-100/[0.08] bg-ink-950/30 px-2.5 py-1">
                    位置 {state.location}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-mist-100/[0.08] bg-ink-950/30 px-2.5 py-1">
                  <CalendarClock className="size-3 text-brass-300" />
                  下次唤醒 {formatTime(state.nextWakeAt)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {METRICS.map((metric) => {
                  const value = state[metric.key];
                  return (
                    <div
                      key={metric.key}
                      className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 px-2.5 py-2"
                    >
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-[0.66rem] text-mist-600">{metric.label}</span>
                        <span className="font-mono text-[0.84rem] text-mist-200">{value}</span>
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

              <div className="mt-3 grid gap-2 text-[0.7rem] text-mist-600 sm:grid-cols-3">
                <p className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950/25 px-2.5 py-1.5">
                  <HeartPulse className="size-3 text-signal-400/80" />
                  上次心跳 {formatTime(state.lastHeartbeatAt)}
                </p>
                <p className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950/25 px-2.5 py-1.5">
                  <Moon className="size-3 text-brass-300/80" />
                  上次醒来 {formatTime(state.lastWakeAt)}
                </p>
                <p className="rounded-lg bg-ink-950/25 px-2.5 py-1.5">
                  健康 {state.health} · 整洁 {state.grooming}
                </p>
              </div>
            </>
          ) : (
            <EmptyState compact text="还没有实时状态。心智第一次运行后会创建。" />
          )}
        </div>
      </section>

      <section className="rounded-[1.6rem] border border-mist-100/[0.08] bg-ink-900/40 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-mist-500">
            Long Event
          </p>
          {activeEvent && onEndEvent ? (
            <button
              type="button"
              onClick={onEndEvent}
              disabled={endingEvent}
              className="rounded-full border border-brass-400/35 px-2.5 py-0.5 text-[0.66rem] text-brass-200 transition hover:bg-brass-400/10 disabled:opacity-50"
            >
              {endingEvent ? '结束中…' : '结束事件'}
            </button>
          ) : null}
        </div>

        {activeEvent ? (
          <div className="mt-2 rounded-xl border border-brass-400/25 bg-brass-400/[0.06] p-3">
            <p className="text-[0.86rem] text-mist-200">
              {activeEvent.title || activeEvent.kind}
              <span className="ml-2 font-mono text-[0.62rem] text-mist-500">
                {STATE_EVENT_KIND_LABELS[activeEvent.kind] ?? activeEvent.kind}
              </span>
            </p>
            <p className="mt-1 text-[0.68rem] leading-4 text-mist-500">
              开始 {formatTime(activeEvent.startedAt)} ·{' '}
              {activeEvent.plannedEndAt
                ? `计划结束 ${formatTime(activeEvent.plannedEndAt)}`
                : '没有计划结束'}
            </p>
            <p className="mt-1 text-[0.68rem] leading-4 text-mist-500">
              叫醒难度 {sleepDifficultyLabel(sleepDepth)}（睡眠深度 {sleepDepth}/4）· 已收到{' '}
              {activeEvent.triggerCount} 次点名
            </p>
            <p className="mt-1 text-[0.68rem] leading-4 text-mist-500">
              普通消息通常不会打断；被点名时由 TA 自己判断醒不醒，计划结束一定醒。
            </p>
          </div>
        ) : (
          <p className="mt-2 rounded-xl border border-dashed border-mist-100/[0.1] px-3 py-4 text-center text-[0.72rem] text-mist-600">
            当前没有长时事件。TA 可以在对话里自己安排睡觉、专注或离开。
          </p>
        )}

        {recentEvents.length > 0 ? (
          <div className="mt-3 space-y-1">
            {recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-mist-100/[0.06] bg-ink-950/25 px-2.5 py-1.5 text-[0.68rem]"
              >
                <span className="truncate text-mist-400">{event.title || event.kind}</span>
                <span className="shrink-0 font-mono text-mist-600">
                  {event.wakeReason
                    ? (STATE_WAKE_REASON_LABELS[event.wakeReason] ?? event.wakeReason)
                    : event.status}{' '}
                  · {formatTime(event.endedAt)}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {baseEntries.length > 0 ? (
          <details className="mt-3 rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2">
            <summary className="cursor-pointer font-mono text-[0.62rem] uppercase tracking-[0.16em] text-mist-600">
              基本数值 · {baseEntries.length} 项
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {baseEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-md bg-ink-950/40 px-2 py-1 text-[0.66rem]"
                >
                  <span className="truncate text-mist-500">{BASE_METRIC_LABELS[key] ?? key}</span>
                  <span className="font-mono text-mist-300">{value}</span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>
    </div>
  );
}
