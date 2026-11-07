import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Brain, LoaderCircle, RefreshCw, Settings2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DropdownSelect } from '@/components/dropdown-select';
import { MindBrief } from '@/components/mind/mind-brief';
import { MindChangesTab } from '@/components/mind/mind-changes';
import { MindFocusTab } from '@/components/mind/mind-focus';
import {
  MODES,
  MIND_TABS,
  REFRESH_OPTIONS,
  REFRESH_STORAGE_KEY,
  REFRESH_VALUES,
  formatClock,
  type MindTabKey,
} from '@/components/mind/mind-format';
import { MindLearningTab } from '@/components/mind/mind-learning';
import {
  MindGrowthTab,
  MindJournalTab,
  MindMemoriesTab,
  MindPlansTab,
  MindStickersTab,
} from '@/components/mind/mind-library';
import { MindGroupsTab, MindRelationsTab } from '@/components/mind/mind-people';
import { MindRunsTab } from '@/components/mind/mind-runs';
import { EmptyState } from '@/components/mind/mind-ui';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { chatChannelsQuery } from '@/lib/queries';

export function MindPage() {
  const search = useSearch({ strict: false }) as { channelId?: string; tab?: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const channelsQuery = useQuery(chatChannelsQuery);
  const channels = channelsQuery.data ?? [];
  const [channelId, setChannelId] = useState(search.channelId ?? '');
  const [tab, setTab] = useState<MindTabKey>(() =>
    MIND_TABS.some((item) => item.key === search.tab) ? (search.tab as MindTabKey) : 'runs',
  );
  const [refreshMs, setRefreshMs] = useState(() => {
    const stored = window.localStorage.getItem(REFRESH_STORAGE_KEY);
    if (stored === null) {
      return 30000;
    }
    const value = Number(stored);
    return REFRESH_VALUES.includes(value) ? value : 30000;
  });
  const [manualRefreshing, setManualRefreshing] = useState(false);

  useEffect(() => {
    if (channelId) return;
    const first = channels.find((channel) => channel.persona);
    if (first) setChannelId(first.id);
  }, [channelId, channels]);

  const channel = channels.find((item) => item.id === channelId) ?? null;
  const persona = channel?.persona ?? null;

  useEffect(() => {
    if (!refreshMs || !persona) {
      return;
    }
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void queryClient.invalidateQueries({ queryKey: ['mind'] });
      }
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs, persona, queryClient]);

  const stateQuery = useQuery({
    queryKey: ['mind', 'state', persona?.id],
    queryFn: () => api.mindState(persona!.id),
    enabled: Boolean(persona),
    staleTime: 5_000,
  });
  const longEventsQuery = useQuery({
    queryKey: ['mind', 'long-events', persona?.id],
    queryFn: () => api.mindLongEvents(persona!.id, 8),
    enabled: Boolean(persona),
    staleTime: 5_000,
  });
  const settingsQuery = useQuery({
    queryKey: ['mind', 'settings', channelId],
    queryFn: () => api.mindSettings(channelId),
    enabled: Boolean(channelId),
    staleTime: 5_000,
  });
  const focusQuery = useQuery({
    queryKey: ['mind', 'focus', persona?.id],
    queryFn: () => api.mindFocus(persona!.id),
    enabled: Boolean(persona),
    staleTime: 3_000,
    networkMode: 'always',
  });

  const endLongEvent = useMutation({
    mutationFn: () => {
      if (!persona) {
        throw new Error('当前渠道还没有绑定人格');
      }
      return api.endMindLongEvent(persona.id);
    },
    onSuccess: () => {
      toast.success('长时事件已结束');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '结束失败'),
  });

  const selectChannel = (value: string) => {
    setChannelId(value);
    void navigate({ to: '/mind', search: { channelId: value, tab }, replace: true });
  };
  const selectTab = (value: MindTabKey) => {
    setTab(value);
    void navigate({
      to: '/mind',
      search: { ...(channelId ? { channelId } : {}), tab: value },
      replace: true,
    });
  };
  const changeRefreshMs = (value: number) => {
    setRefreshMs(value);
    window.localStorage.setItem(REFRESH_STORAGE_KEY, String(value));
  };
  const refreshNow = async () => {
    setManualRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['mind'] });
    } finally {
      setManualRefreshing(false);
    }
  };

  const heartbeat = useMutation({
    mutationFn: () => api.mindHeartbeat(persona!.id),
    onSuccess: () => {
      toast.success('已安排一次心跳');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '唤醒失败'),
  });

  const channelOptions = channels.map((item) => ({
    value: item.id,
    label: `${item.displayName} · ${item.persona?.name ?? '未绑定人格'}`,
  }));
  const mode = settingsQuery.data?.mode ?? 'OFF';
  const modeLabel = MODES.find((item) => item.value === mode)?.label ?? mode;

  return (
    <div className="relative mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-end justify-between gap-5"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-brass-400/75">
              Persona Mind
            </span>
            <span className="h-px w-12 bg-brass-400/25" />
          </div>
          <h1 className="mt-3 flex items-center gap-3 font-display text-[clamp(1.8rem,3vw,2.7rem)] font-semibold tracking-[-0.03em] text-mist-100">
            <Brain className="size-7 text-brass-300" strokeWidth={1.4} />
            人格心智
          </h1>
          <p className="mt-2 max-w-2xl text-[0.86rem] leading-6 text-mist-500">
            此刻的状态、关系、记忆与运行轨迹。配置已并入渠道人格面板，这里只做观测与干预。
          </p>
        </div>

        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <label className="min-w-[16rem] flex-1 rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-3">
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.22em] text-mist-500">
              渠道
            </span>
            <div className="mt-2">
              <DropdownSelect
                value={channelId}
                options={channelOptions}
                onChange={selectChannel}
                ariaLabel="选择渠道"
                placeholder="选择渠道"
                showValue={false}
              />
            </div>
          </label>
          <Link
            to="/connections"
            search={channelId ? { persona: channelId } : {}}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-mist-100/[0.1] px-3 text-[0.72rem] text-mist-400 transition hover:border-brass-400/30 hover:text-brass-200"
          >
            <Settings2 className="size-3.5" />
            渠道配置
          </Link>
        </div>
      </motion.header>

      {channelsQuery.isPending ? (
        <div className="mt-10 grid place-items-center rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 py-20">
          <LoaderCircle className="size-6 animate-spin text-brass-300" />
        </div>
      ) : channels.length === 0 ? (
        <EmptyState text="还没有渠道。先在互联中心接入一个 QQ 渠道。" />
      ) : !channelId ? (
        <EmptyState text="选择一个渠道，查看它的人格心智。" />
      ) : !persona ? (
        <EmptyState text="这个渠道还没有绑定人格。先在渠道设置里选择一张角色卡。" />
      ) : (
        <>
          <div className="mt-7">
            <MindBrief
              name={persona.name}
              identity={persona.identity}
              quote={persona.quote}
              modeLabel={modeLabel}
              state={stateQuery.data ?? null}
              longEvents={longEventsQuery.data ?? []}
              focus={focusQuery.data?.active ?? null}
              base={persona.values ? numericBase(persona.values) : {}}
              onEndEvent={() => endLongEvent.mutate()}
              endingEvent={endLongEvent.isPending}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-mist-100/[0.07] pb-3">
            <div className="flex flex-wrap items-center gap-2">
              {MIND_TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectTab(item.key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[0.78rem] transition',
                    tab === item.key
                      ? 'border-brass-400/35 bg-brass-400/10 text-brass-200'
                      : 'border-transparent text-mist-500 hover:border-mist-100/[0.1] hover:text-mist-300',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => heartbeat.mutate()}
                disabled={heartbeat.isPending}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-mist-100/[0.1] px-2.5 text-[0.66rem] text-mist-500 transition hover:border-brass-400/30 hover:text-brass-200 disabled:opacity-50"
              >
                <RefreshCw className={cn('size-3', heartbeat.isPending && 'animate-spin')} />
                立即唤醒
              </button>
              <span className="font-mono text-[0.62rem] text-mist-600">
                {stateQuery.dataUpdatedAt
                  ? `更新 ${formatClock(stateQuery.dataUpdatedAt)}`
                  : '尚未刷新'}
              </span>
              <div className="w-[7rem]">
                <DropdownSelect
                  value={String(refreshMs)}
                  options={[...REFRESH_OPTIONS]}
                  onChange={(value) => changeRefreshMs(Number(value))}
                  ariaLabel="自动刷新间隔"
                  showValue={false}
                />
              </div>
              <button
                type="button"
                onClick={() => void refreshNow()}
                disabled={manualRefreshing}
                className="flex size-8 items-center justify-center rounded-full border border-mist-100/[0.1] text-mist-500 transition hover:border-brass-400/35 hover:text-brass-200 disabled:opacity-50"
                aria-label="刷新心智数据"
                title="刷新"
              >
                <RefreshCw className={cn('size-3.5', manualRefreshing && 'animate-spin')} />
              </button>
            </div>
          </div>

          <div
            data-mind-scroll
            className="mind-scroll mt-5 h-[min(70vh,860px)] min-h-[26rem] overflow-y-auto overscroll-contain pr-1"
          >
            {tab === 'focus' ? (
              <MindFocusTab
                personaId={persona.id}
                phoneDevice={settingsQuery.data?.phoneDevice ?? null}
              />
            ) : null}
            {tab === 'runs' ? (
              <MindRunsTab personaId={persona.id} approvalMode={mode === 'APPROVAL'} />
            ) : null}
            {tab === 'changes' ? <MindChangesTab personaId={persona.id} /> : null}
            {tab === 'relations' ? <MindRelationsTab personaId={persona.id} /> : null}
            {tab === 'groups' ? <MindGroupsTab personaId={persona.id} /> : null}
            {tab === 'memories' ? <MindMemoriesTab personaId={persona.id} /> : null}
            {tab === 'growth' ? <MindGrowthTab personaId={persona.id} /> : null}
            {tab === 'learning' ? (
              <MindLearningTab personaId={persona.id} channelId={channelId} />
            ) : null}
            {tab === 'plans' ? (
              <MindPlansTab
                personaId={persona.id}
                proactiveEnabled={settingsQuery.data?.proactiveEnabled ?? false}
              />
            ) : null}
            {tab === 'journal' ? <MindJournalTab personaId={persona.id} /> : null}
            {tab === 'stickers' ? <MindStickersTab channelId={channelId} /> : null}
          </div>
        </>
      )}
    </div>
  );
}

function numericBase(values: Record<string, unknown>): Record<string, number> {
  const metadata = new Set([
    'card_serial',
    'card_experience',
    'card_traits',
    'card_physical',
    'created_at',
    'updated_at',
    'time_zone',
    'mood_tags',
    'mood_intensity',
    'stress',
    'social_battery',
    'doing_now',
    'location',
    'grooming',
  ]);
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (metadata.has(key)) continue;
    const number = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (Number.isFinite(number)) {
      result[key] = number;
    }
  }
  return result;
}
