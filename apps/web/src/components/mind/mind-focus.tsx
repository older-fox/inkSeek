import type { MindFocusOverview, PersonaFocusRecord } from '@inkseek/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Pause, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatTime } from './mind-format';

const KIND_LABELS: Record<PersonaFocusRecord['kind'], string> = {
  CHAT: '回消息',
  PHONE: '手机',
};

const STATUS_LABELS: Record<PersonaFocusRecord['status'], string> = {
  ACTIVE: '进行中',
  PAUSED: '暂停中',
  DONE: '已结束',
};

export function MindFocusTab({
  personaId,
  phoneDevice,
}: {
  personaId: string;
  phoneDevice: string | null;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['mind', 'focus', personaId],
    queryFn: () => api.mindFocus(personaId),
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
    networkMode: 'always',
  });
  const start = useMutation({
    mutationFn: () => api.startMindPhoneFocus(personaId),
    onSuccess: () => {
      toast.success('已经在后台开始玩手机');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '启动失败'),
  });

  const data: MindFocusOverview | undefined = query.data;
  const active = data?.active ?? null;
  const now = data?.now;
  const recent = (data?.recent ?? []).filter((row) => row.id !== active?.id);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-mist-100/[0.08] bg-ink-900/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-brass-400/70">
              Attention
            </p>
            <h3 className="mt-1 text-[0.95rem] text-mist-100">此刻在干嘛</h3>
          </div>
          <button
            type="button"
            disabled={start.isPending || Boolean(active) || !phoneDevice}
            onClick={() => start.mutate()}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-jade-400/25 bg-jade-400/[0.07] px-3 text-[0.72rem] text-jade-200 transition hover:border-jade-400/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {start.isPending ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Smartphone className="size-3.5" />
            )}
            让 TA 玩手机
          </button>
        </div>

        {!phoneDevice && (
          <p className="mt-2 text-[0.66rem] text-mist-600">
            先在渠道人格面板 → 心智设置 → 手机设备里选一台无线设备。
          </p>
        )}

        <div className="mt-3 space-y-2">
          {active ? <ActiveFocus focus={active} /> : <NowCard now={now} />}
          {now?.situation ? (
            <div className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 px-3 py-2">
              <p className="font-mono text-[0.56rem] uppercase tracking-[0.16em] text-mist-600">
                Situation
              </p>
              <p className="mt-1 whitespace-pre-line text-[0.68rem] leading-5 text-mist-400">
                {now.situation}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-mist-100/[0.06] bg-ink-950/25 p-4">
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-mist-600">
          最近焦点 · {recent.length}
        </p>
        <div className="mt-2 space-y-2">
          {recent.length === 0 ? (
            <p className="py-3 text-center text-[0.68rem] text-mist-600">还没有记录。</p>
          ) : (
            recent.map((focus) => <FocusRow key={focus.id} focus={focus} />)
          )}
        </div>
      </section>
    </div>
  );
}

function NowCard({ now }: { now: MindFocusOverview['now'] | undefined }) {
  const activity = now?.activity?.trim() ?? '';
  const since = now?.activitySince ? `（开始于 ${formatTime(now.activitySince)}）` : '';
  return (
    <div className="rounded-xl border border-mist-100/[0.08] bg-ink-950/30 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-mist-100/10 px-2 py-0.5 font-mono text-[0.56rem] uppercase tracking-[0.1em] text-mist-500">
          现在
        </span>
        <span className="text-[0.8rem] text-mist-100">
          {activity ? `正在做：${activity}${since}` : '现在没有记录正在做的事'}
        </span>
      </div>
      {now?.location ? (
        <p className="mt-1 text-[0.66rem] text-mist-500">在：{now.location}</p>
      ) : null}
    </div>
  );
}

function ActiveFocus({ focus }: { focus: PersonaFocusRecord }) {
  const state = stateOf(focus);
  const activity = textOf(state['activity']) || focus.goal || '玩手机';
  const lastAction = textOf(state['lastAction']);
  const notable = textOf(state['notable']);
  const board = textOf(state['board']);
  const failures = typeof state['failures'] === 'number' ? state['failures'] : 0;
  const battery = batteryOf(state);
  return (
    <div className="rounded-xl border border-jade-400/20 bg-jade-400/[0.05] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-jade-400/25 px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-jade-200">
          {focus.status === 'PAUSED' ? <Pause className="size-3" /> : <Smartphone className="size-3" />}
          {focus.status === 'PAUSED' ? '被消息打断' : '进行中'}
        </span>
        <span className="text-[0.8rem] text-mist-100">{activity}</span>
        <span className="font-mono text-[0.62rem] text-mist-500">第 {focus.step + 1} 步</span>
        <span className="text-[0.62rem] text-mist-600">开始于 {formatTime(focus.startedAt)}</span>
        {failures > 0 && (
          <span className="text-[0.62rem] text-amber-300/80">连续失败 {failures} 次</span>
        )}
        {battery && (
          <span
            className={cn(
              'font-mono text-[0.62rem]',
              battery.level <= 15 && !battery.charging ? 'text-amber-300' : 'text-mist-600',
            )}
          >
            {battery.level}%{battery.charging ? ' 充电中' : ''}
          </span>
        )}
      </div>
      {lastAction && (
        <p className="mt-2 text-[0.68rem] text-mist-400">上一步：{lastAction}</p>
      )}
      {notable && <p className="mt-1 text-[0.68rem] text-brass-200/80">刚注意到：{notable}</p>}
      {board && (
        <pre className="mt-2 overflow-x-auto whitespace-pre font-mono text-[0.62rem] leading-4 text-mist-300">
          {board}
        </pre>
      )}
    </div>
  );
}

function FocusRow({ focus }: { focus: PersonaFocusRecord }) {
  const state = stateOf(focus);
  const activity = textOf(state['activity']) || focus.goal;
  const summary = textOf(state['summary']);
  const error = textOf(state['error']);
  const problem = textOf(state['problem']);
  const battery = batteryOf(state);
  const failed = Boolean(error);
  return (
    <div className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-mist-100/10 px-2 py-0.5 font-mono text-[0.56rem] uppercase tracking-[0.1em] text-mist-500">
          {KIND_LABELS[focus.kind]}
        </span>
        <span
          className={cn(
            'text-[0.62rem]',
            failed
              ? 'text-amber-300'
              : focus.status === 'DONE'
                ? 'text-mist-600'
                : 'text-jade-300',
          )}
        >
          {failed ? '异常结束' : STATUS_LABELS[focus.status]}
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.74rem] text-mist-200">
          {activity || '没有写目标'}
        </span>
        <span className="font-mono text-[0.6rem] text-mist-600">
          {focus.step} 步 · {formatTime(focus.endedAt ?? focus.startedAt)}
        </span>
      </div>
      {failed ? (
        <p className="mt-1 line-clamp-2 text-[0.66rem] leading-4 text-amber-300/80">
          异常：{error}
        </p>
      ) : summary ? (
        <p className="mt-1 line-clamp-2 text-[0.66rem] leading-4 text-mist-500">{summary}</p>
      ) : null}
      {problem ? (
        <p className="mt-1 text-[0.66rem] leading-4 text-amber-300/80">
          遇到：{problem}
          {battery ? ` · 结束时 ${battery.level}%` : ''}
        </p>
      ) : null}
    </div>
  );
}

function batteryOf(
  state: Record<string, unknown>,
): { level: number; charging: boolean } | null {
  const value = state['battery'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const level = typeof record['level'] === 'number' ? record['level'] : -1;
  if (level < 0 || level > 100) {
    return null;
  }
  return { level: Math.round(level), charging: record['charging'] === true };
}

function stateOf(focus: PersonaFocusRecord): Record<string, unknown> {
  return focus.state && typeof focus.state === 'object' && !Array.isArray(focus.state)
    ? (focus.state as Record<string, unknown>)
    : {};
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
