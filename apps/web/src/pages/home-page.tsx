import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type {
  OverviewAttention,
  OverviewChannel,
  OverviewEvent,
  OverviewEventKind,
  OverviewLink,
  OverviewSeverity,
} from '@inkseek/shared';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Brain,
  CalendarClock,
  CheckCircle2,
  HeartPulse,
  MessageCircle,
  Moon,
  Pencil,
  PlugZap,
  RefreshCw,
  Smartphone,
  Sparkles,
  Users,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { ChannelAvatar } from '@/components/connection-bits';
import { meQuery, overviewQuery } from '@/lib/queries';
import { cn } from '@/lib/cn';

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
});

const STATUS_META = {
  ONLINE: {
    label: '在线',
    dot: 'bg-jade-400',
    pill: 'border-jade-400/25 bg-jade-400/[0.06] text-jade-300',
  },
  CONNECTING: {
    label: '连接中',
    dot: 'bg-brass-400 animate-pulse',
    pill: 'border-brass-400/25 bg-brass-400/[0.06] text-brass-200',
  },
  OFFLINE: {
    label: '离线',
    dot: 'bg-mist-500',
    pill: 'border-mist-100/[0.12] bg-ink-950/40 text-mist-400',
  },
  ERROR: {
    label: '异常',
    dot: 'bg-signal-400',
    pill: 'border-signal-400/25 bg-signal-400/[0.06] text-signal-300',
  },
} as const;

const MODE_META = {
  LIVE: { label: '心智在线', pill: 'border-jade-400/20 text-jade-300' },
  SHADOW: { label: '影子模式', pill: 'border-brass-400/20 text-brass-200' },
  APPROVAL: { label: '审批模式', pill: 'border-brass-400/20 text-brass-200' },
  OFF: { label: '心智关闭', pill: 'border-mist-100/[0.08] text-mist-500' },
} as const;

const EVENT_META: Record<
  OverviewEventKind,
  { label: string; icon: LucideIcon; iconClass: string; labelClass: string }
> = {
  RELATION: {
    label: '关系',
    icon: HeartPulse,
    iconClass: 'border-jade-400/20 bg-jade-400/[0.06] text-jade-300',
    labelClass: 'text-jade-400/80',
  },
  GROUP: {
    label: '群关系',
    icon: Users,
    iconClass: 'border-jade-400/20 bg-jade-400/[0.06] text-jade-300',
    labelClass: 'text-jade-400/80',
  },
  SELF: {
    label: '自身',
    icon: Sparkles,
    iconClass: 'border-brass-400/20 bg-brass-400/[0.06] text-brass-300',
    labelClass: 'text-brass-400/80',
  },
  MOOD: {
    label: '心情',
    icon: Activity,
    iconClass: 'border-brass-400/20 bg-brass-400/[0.06] text-brass-300',
    labelClass: 'text-brass-400/80',
  },
  LONG_EVENT: {
    label: '长时事件',
    icon: Moon,
    iconClass: 'border-mist-100/[0.08] bg-ink-950/40 text-mist-400',
    labelClass: 'text-mist-500',
  },
  INTENTION: {
    label: '主动',
    icon: MessageCircle,
    iconClass: 'border-brass-400/20 bg-brass-400/[0.06] text-brass-300',
    labelClass: 'text-brass-400/80',
  },
  LEARNING: {
    label: '学习',
    icon: BookOpen,
    iconClass: 'border-mist-100/[0.08] bg-ink-950/40 text-mist-400',
    labelClass: 'text-mist-500',
  },
  CLOSURE: {
    label: '收尾',
    icon: CheckCircle2,
    iconClass: 'border-mist-100/[0.08] bg-ink-950/40 text-mist-400',
    labelClass: 'text-mist-500',
  },
  JOURNAL: {
    label: '日记',
    icon: Pencil,
    iconClass: 'border-brass-400/20 bg-brass-400/[0.06] text-brass-300',
    labelClass: 'text-brass-400/80',
  },
};

const SEVERITY_META: Record<
  OverviewSeverity,
  { icon: LucideIcon; iconClass: string; ringClass: string }
> = {
  high: {
    icon: AlertTriangle,
    iconClass: 'text-signal-300',
    ringClass: 'border-signal-400/20 bg-signal-400/[0.05]',
  },
  medium: {
    icon: AlertTriangle,
    iconClass: 'text-brass-300',
    ringClass: 'border-brass-400/20 bg-brass-400/[0.05]',
  },
  low: {
    icon: AlertTriangle,
    iconClass: 'text-mist-500',
    ringClass: 'border-mist-100/[0.06] bg-ink-950/25',
  },
};

function clock(value: string): string {
  return timeFormatter.format(new Date(value));
}

function dayLabel(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
  if (sameDay(date, now)) return '今天';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return '昨天';
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function timeAgo(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return dayLabel(value);
}

function elapsed(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return '不到 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

function moodLabel(value: number): string {
  if (value >= 60) return '愉快';
  if (value >= 20) return '轻松';
  if (value > -20) return '平静';
  if (value > -60) return '低落';
  return '沉重';
}

function barColor(value: number): string {
  if (value >= 70) return 'bg-jade-400/80';
  if (value >= 40) return 'bg-brass-400/80';
  return 'bg-signal-400/80';
}

function clipText(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function nextWakeText(channel: OverviewChannel): string {
  if (!channel.state) return '状态还没建立';
  if (channel.mind && !channel.mind.heartbeatEnabled) return '心跳已关闭';
  if (!channel.state.nextWakeAt) return '还没有安排下次醒来';
  return `下次醒来 ${clock(channel.state.nextWakeAt)}`;
}

function groupEvents(
  events: OverviewEvent[],
): Array<{ key: string; label: string; items: OverviewEvent[] }> {
  const groups: Array<{ key: string; label: string; items: OverviewEvent[] }> = [];
  for (const event of events) {
    const label = dayLabel(event.occurredAt);
    const current = groups[groups.length - 1];
    if (current && current.label === label) {
      current.items.push(event);
    } else {
      groups.push({ key: `${label}:${event.id}`, label, items: [event] });
    }
  }
  return groups;
}

export function HomePage() {
  const { data: user } = useQuery(meQuery);
  const overview = useQuery(overviewQuery);
  const data = overview.data;

  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const firstChannel = data?.channels[0] ?? null;
  const eventGroups = data ? groupEvents(data.events) : [];

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:py-14">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[0.63rem] uppercase tracking-[0.3em] text-brass-400/75">
            Overview · 值班台
          </span>
          <span className="h-px w-12 bg-brass-400/25" />
          <span className="text-[0.72rem] text-mist-600">{dateFormatter.format(new Date())}</span>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[clamp(1.9rem,3.2vw,2.8rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-mist-100">
              {greeting}，{user?.displayName ?? ''}
            </h1>
            <p className="mt-3 max-w-2xl text-[0.9rem] leading-7 text-mist-500">
              此刻的状态、过去 24 小时发生的事，以及需要你看一眼的地方。
            </p>
          </div>

          {data ? (
            <div className="flex flex-wrap items-center gap-2">
              <HealthPill
                icon={RefreshCw}
                label={overview.isFetching ? '刷新中' : `更新于 ${timeAgo(data.generatedAt)}`}
                tone="mist"
                spin={overview.isFetching}
              />
              <HealthPill
                icon={Waypoints}
                label={`${data.health.channelsOnline}/${data.health.channelsTotal} 渠道在线`}
                tone={
                  data.health.channelsOnline === data.health.channelsTotal
                    ? 'jade'
                    : data.health.channelsOnline > 0
                      ? 'brass'
                      : 'signal'
                }
              />
              <HealthPill
                icon={Brain}
                label={
                  data.health.mindsLive > 0 ? `${data.health.mindsLive} 个心智在线` : '心智都没开'
                }
                tone={data.health.mindsLive > 0 ? 'jade' : 'mist'}
              />
              <HealthPill
                icon={CalendarClock}
                label={
                  data.health.lastHeartbeatAt
                    ? `心跳 ${timeAgo(data.health.lastHeartbeatAt)}`
                    : '还没跑过心跳'
                }
                tone="mist"
              />
              <HealthPill
                icon={MessageCircle}
                label={
                  data.health.pendingActions > 0
                    ? `${data.health.pendingActions} 个动作待确认`
                    : '没有待确认'
                }
                tone={data.health.pendingActions > 0 ? 'brass' : 'jade'}
              />
            </div>
          ) : null}
        </div>
      </motion.header>

      {overview.isPending ? (
        <HomeSkeleton />
      ) : overview.isError ? (
        <ErrorPanel
          message={overview.error instanceof Error ? overview.error.message : '读取失败'}
          onRetry={() => void overview.refetch()}
        />
      ) : !data || data.channels.length === 0 ? (
        <EmptyChannels />
      ) : (
        <>
          <section className="mt-10">
            <SectionHeading
              eyebrow="此刻"
              meta={`${data.channels.length} 个渠道`}
              action={
                <Link
                  to="/connections"
                  className="text-[0.66rem] text-mist-600 transition hover:text-brass-300"
                >
                  管理渠道
                </Link>
              }
            />
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {data.channels.map((channel, index) => (
                <ChannelCard key={channel.id} channel={channel} index={index} />
              ))}
            </div>
          </section>

          <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.75fr)]">
            <div>
              <SectionHeading eyebrow="过去 24 小时" meta={`${data.events.length} 件事`} />
              <div className="mt-4 overflow-hidden rounded-3xl border border-mist-100/[0.07] bg-ink-900/35">
                {eventGroups.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-12 text-center">
                    <span className="grid size-10 place-items-center rounded-full border border-mist-100/[0.08] bg-ink-950/40 text-mist-500">
                      <Moon className="size-4" strokeWidth={1.6} />
                    </span>
                    <p className="mt-3 text-[0.82rem] text-mist-300">过去 24 小时很安静</p>
                    <p className="mt-1 max-w-xs text-[0.68rem] leading-5 text-mist-600">
                      没有关系变化、长时事件或学习记录。她可能只是待着，或者还在睡觉。
                    </p>
                  </div>
                ) : (
                  eventGroups.map((group) => (
                    <div
                      key={group.key}
                      className="border-b border-mist-100/[0.05] last:border-b-0"
                    >
                      <p className="px-4 pt-3 pb-1 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-mist-600">
                        {group.label}
                      </p>
                      {group.items.map((event) => (
                        <EventRow key={event.id} event={event} />
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <SectionHeading
                eyebrow="需要你处理"
                meta={data.attention.length > 0 ? `${data.attention.length} 项` : '都正常'}
              />
              <div className="mt-4 overflow-hidden rounded-3xl border border-mist-100/[0.07] bg-ink-900/35">
                {data.attention.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-10 text-center">
                    <span className="grid size-10 place-items-center rounded-full border border-jade-400/20 bg-jade-400/[0.06] text-jade-300">
                      <CheckCircle2 className="size-4" strokeWidth={1.7} />
                    </span>
                    <p className="mt-3 text-[0.82rem] text-mist-300">都正常</p>
                    <p className="mt-1 max-w-[15rem] text-[0.68rem] leading-5 text-mist-600">
                      渠道、心智和待确认动作都没有需要你介入的地方。
                    </p>
                  </div>
                ) : (
                  data.attention.map((item) => <AttentionRow key={item.id} attention={item} />)
                )}
              </div>

              <div className="mt-4 rounded-3xl border border-mist-100/[0.06] bg-ink-950/30 p-4">
                <p className="px-1 font-mono text-[0.56rem] uppercase tracking-[0.22em] text-mist-600">
                  快速进入
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <QuickLink
                    link={{
                      page: '/direct',
                      ...(firstChannel ? { channelId: firstChannel.id } : {}),
                    }}
                    icon={MessageCircle}
                    label="直接对话"
                  />
                  <QuickLink
                    link={{
                      page: '/mind',
                      ...(firstChannel ? { channelId: firstChannel.id, tab: 'focus' } : {}),
                    }}
                    icon={Brain}
                    label="人格心智"
                  />
                  <QuickLink
                    link={{
                      page: '/insights',
                      ...(firstChannel ? { channelId: firstChannel.id } : {}),
                    }}
                    icon={BarChart3}
                    label="数据洞察"
                  />
                  <QuickLink link={{ page: '/connections' }} icon={Waypoints} label="互联中心" />
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  meta,
  action,
}: {
  eyebrow: string;
  meta: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-mist-500">
        {eyebrow}
      </span>
      <span className="h-px flex-1 bg-mist-100/[0.06]" />
      <span className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-mist-600">
        {meta}
      </span>
      {action}
    </div>
  );
}

function HealthPill({
  icon: Icon,
  label,
  tone,
  spin,
}: {
  icon: LucideIcon;
  label: string;
  tone: 'jade' | 'brass' | 'signal' | 'mist';
  spin?: boolean;
}) {
  const tones = {
    jade: 'border-jade-400/20 bg-jade-400/[0.04] text-jade-300',
    brass: 'border-brass-400/20 bg-brass-400/[0.04] text-brass-200',
    signal: 'border-signal-400/20 bg-signal-400/[0.05] text-signal-300',
    mist: 'border-mist-100/[0.07] bg-ink-900/40 text-mist-500',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[0.58rem] tracking-[0.04em]',
        tones[tone],
      )}
    >
      <Icon className={cn('size-3', spin && 'animate-spin')} strokeWidth={1.7} />
      {label}
    </span>
  );
}

function ChannelCard({ channel, index }: { channel: OverviewChannel; index: number }) {
  const status = STATUS_META[channel.status];
  const mode = channel.mind ? MODE_META[channel.mind.mode] : null;
  const accent = channel.persona?.accent === 'jade' ? 'jade' : 'brass';
  const personaName = channel.persona?.name ?? channel.displayName;
  const online = channel.status === 'ONLINE';

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.08 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="group relative overflow-hidden rounded-3xl border border-mist-100/[0.07] bg-ink-900/40 p-5 backdrop-blur-sm transition hover:border-brass-400/20 sm:p-6"
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b to-transparent opacity-80',
          accent === 'jade' ? 'from-jade-400/[0.08]' : 'from-brass-400/[0.08]',
        )}
      />

      <div className="relative flex items-start gap-3.5">
        <ChannelAvatar
          initials={personaName}
          accent={accent}
          size="lg"
          src={channel.avatarUrl}
          className={cn(!online && 'opacity-70 saturate-50')}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold tracking-tight text-mist-100">
              {personaName}
            </h3>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.14em]',
                status.pill,
              )}
            >
              <span className={cn('size-1.5 rounded-full', status.dot)} />
              {status.label}
            </span>
            {mode ? (
              <span
                className={cn(
                  'rounded-full border bg-ink-950/30 px-2 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.12em]',
                  mode.pill,
                )}
              >
                {mode.label}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[0.66rem] text-mist-600">
            QQ {channel.accountId} · {channel.displayName}
          </p>
        </div>
        <Link
          to="/direct"
          search={{ channelId: channel.id }}
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-mist-100/[0.08] bg-ink-950/40 text-mist-500 transition hover:border-brass-400/25 hover:text-brass-200"
          title="直接对话"
          aria-label={`直接和 ${personaName} 对话`}
        >
          <MessageCircle className="size-4" strokeWidth={1.7} />
        </Link>
      </div>

      {!channel.persona ? (
        <div className="relative mt-4 rounded-2xl border border-brass-400/20 bg-brass-400/[0.05] px-4 py-3 text-[0.72rem] leading-6 text-brass-200">
          这个渠道还没有绑定人格。绑定之后，心智才会开始收消息、记关系。
          <Link to="/connections" className="ml-1 underline underline-offset-2">
            去绑定
          </Link>
        </div>
      ) : (
        <>
          <div className="relative mt-4 rounded-2xl border border-mist-100/[0.06] bg-ink-950/35 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[0.54rem] uppercase tracking-[0.2em] text-mist-600">
                此刻正在
              </span>
              {channel.state?.activitySince ? (
                <span className="text-[0.58rem] text-mist-600">
                  已经 {elapsed(channel.state.activitySince)}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-[0.9rem] leading-6 text-mist-200">
              {channel.state?.activity || '还没有记录当前活动'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.64rem] text-mist-600">
              {channel.state?.location ? <span>在 {channel.state.location}</span> : null}
              {channel.focus ? (
                <span className="inline-flex items-center gap-1 text-brass-300">
                  {channel.focus.kind === 'PHONE' ? (
                    <Smartphone className="size-3" strokeWidth={1.7} />
                  ) : (
                    <MessageCircle className="size-3" strokeWidth={1.7} />
                  )}
                  {channel.focus.kind === 'PHONE' ? '正在玩手机' : '正在专注对话'}
                  {channel.focus.goal ? `：${clipText(channel.focus.goal, 36)}` : ''}
                </span>
              ) : null}
            </div>
          </div>

          <div className="relative mt-3 grid grid-cols-3 gap-2">
            <Vital
              label="精力"
              value={channel.state ? `${channel.state.energy}` : '—'}
              bar={channel.state?.energy}
            />
            <Vital
              label="心情"
              value={channel.state ? moodLabel(channel.state.moodValence) : '—'}
              bar={null}
            />
            <Vital
              label="社交电量"
              value={channel.state ? `${channel.state.socialBattery}` : '—'}
              bar={channel.state?.socialBattery}
            />
          </div>

          <div className="relative mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.64rem] text-mist-600">
            <span>
              24 小时 · 收到 {channel.stats.incoming} / 发出 {channel.stats.outgoing}
            </span>
            <span>·</span>
            <span>{channel.stats.conversations} 个活跃会话</span>
            {channel.stats.pendingActions > 0 ? (
              <span className="text-brass-300">· {channel.stats.pendingActions} 个待确认</span>
            ) : null}
            <span className="ml-auto font-mono text-[0.6rem] text-mist-500">
              {nextWakeText(channel)}
            </span>
          </div>

          <div className="relative mt-4 flex flex-wrap items-center gap-2">
            <OverviewNavLink
              link={{ page: '/direct', channelId: channel.id }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-brass-400/25 bg-brass-400/[0.08] px-3 text-[0.66rem] text-brass-200 transition hover:bg-brass-400/[0.14]"
            >
              直接对话 <ArrowUpRight className="size-3" />
            </OverviewNavLink>
            <OverviewNavLink
              link={{ page: '/mind', channelId: channel.id, tab: 'focus' }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-mist-100/[0.08] px-3 text-[0.64rem] text-mist-400 transition hover:border-brass-400/20 hover:text-brass-200"
            >
              看她此刻
            </OverviewNavLink>
            <OverviewNavLink
              link={{ page: '/insights', channelId: channel.id }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-mist-100/[0.08] px-3 text-[0.64rem] text-mist-400 transition hover:border-brass-400/20 hover:text-brass-200"
            >
              数据洞察
            </OverviewNavLink>
          </div>
        </>
      )}

      {!online ? (
        <div
          className={cn(
            'relative mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[0.65rem] leading-5',
            channel.status === 'ERROR' || channel.status === 'OFFLINE'
              ? 'border-signal-400/20 bg-signal-400/[0.05] text-signal-300'
              : 'border-brass-400/20 bg-brass-400/[0.05] text-brass-200',
          )}
        >
          <PlugZap className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.7} />
          <span className="min-w-0 flex-1">
            {channel.lastError ? clipText(channel.lastError, 90) : '连接已断开，消息暂时不会进来。'}
          </span>
          <Link to="/connections" className="shrink-0 underline underline-offset-2">
            去处理
          </Link>
        </div>
      ) : null}
    </motion.article>
  );
}

function Vital({
  label,
  value,
  bar,
}: {
  label: string;
  value: string;
  bar: number | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-mist-100/[0.05] bg-ink-950/25 px-2.5 py-2">
      <p className="font-mono text-[0.5rem] uppercase tracking-[0.16em] text-mist-600">{label}</p>
      <div className="mt-1 flex items-end gap-2">
        <span className="font-display text-[0.86rem] leading-none text-mist-200">{value}</span>
        {bar !== null && bar !== undefined ? (
          <span className="mb-0.5 h-1 flex-1 overflow-hidden rounded-full bg-mist-100/[0.06]">
            <span
              className={cn('block h-full rounded-full transition-[width]', barColor(bar))}
              style={{ width: `${Math.max(0, Math.min(100, bar))}%` }}
            />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: OverviewEvent }) {
  const meta = EVENT_META[event.kind];
  const Icon = meta.icon;
  return (
    <div className="group flex gap-3 px-4 py-3 transition hover:bg-mist-100/[0.02]">
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border',
          meta.iconClass,
        )}
      >
        <Icon className="size-3.5" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.56rem] text-mist-600">{clock(event.occurredAt)}</span>
          <span
            className={cn('font-mono text-[0.5rem] uppercase tracking-[0.14em]', meta.labelClass)}
          >
            {meta.label}
          </span>
          <span className="ml-auto shrink-0 text-[0.58rem] text-mist-600">
            {event.personaName ?? event.channelName}
          </span>
        </div>
        <p className="mt-1 text-[0.8rem] leading-5 text-mist-200">{event.title}</p>
        <p className="mt-0.5 line-clamp-2 text-[0.68rem] leading-5 text-mist-500">{event.detail}</p>
      </div>
      {event.link ? (
        <OverviewNavLink
          link={event.link}
          className="mt-1 shrink-0 self-center rounded-lg p-1.5 text-mist-600 transition hover:bg-brass-400/[0.08] hover:text-brass-300"
        >
          <ArrowUpRight className="size-3.5" />
        </OverviewNavLink>
      ) : null}
    </div>
  );
}

function AttentionRow({ attention }: { attention: OverviewAttention }) {
  const meta = SEVERITY_META[attention.severity];
  const Icon = meta.icon;
  return (
    <div className="flex gap-3 border-b border-mist-100/[0.05] px-4 py-3.5 last:border-b-0">
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border',
          meta.ringClass,
        )}
      >
        <Icon className={cn('size-3.5', meta.iconClass)} strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.78rem] leading-5 text-mist-200">{attention.title}</p>
        <p className="mt-0.5 line-clamp-2 text-[0.66rem] leading-5 text-mist-500">
          {attention.detail}
        </p>
      </div>
      {attention.link ? (
        <OverviewNavLink
          link={attention.link}
          className="shrink-0 self-center text-[0.62rem] text-brass-300 underline decoration-brass-300/25 underline-offset-2 transition hover:text-brass-200"
        >
          去处理
        </OverviewNavLink>
      ) : null}
    </div>
  );
}

function QuickLink({
  link,
  icon: Icon,
  label,
}: {
  link: OverviewLink;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <OverviewNavLink
      link={link}
      className="flex items-center gap-2 rounded-xl border border-mist-100/[0.06] bg-ink-900/30 px-3 py-2.5 text-[0.7rem] text-mist-400 transition hover:border-brass-400/20 hover:text-brass-200"
    >
      <Icon className="size-3.5" strokeWidth={1.7} />
      {label}
      <ArrowUpRight className="ml-auto size-3 opacity-40" />
    </OverviewNavLink>
  );
}

function OverviewNavLink({
  link,
  className,
  children,
}: {
  link: OverviewLink;
  className?: string;
  children: ReactNode;
}) {
  switch (link.page) {
    case '/mind':
      return (
        <Link
          to="/mind"
          search={{ channelId: link.channelId, tab: link.tab }}
          className={className}
        >
          {children}
        </Link>
      );
    case '/direct':
      return (
        <Link to="/direct" search={{ channelId: link.channelId }} className={className}>
          {children}
        </Link>
      );
    case '/insights':
      return (
        <Link
          to="/insights"
          search={{ channelId: link.channelId, days: link.days }}
          className={className}
        >
          {children}
        </Link>
      );
    case '/connections':
      return (
        <Link to="/connections" className={className}>
          {children}
        </Link>
      );
    case '/settings':
      return (
        <Link to="/settings" className={className}>
          {children}
        </Link>
      );
    default:
      return null;
  }
}

function EmptyChannels() {
  return (
    <div className="mt-10 flex flex-col items-center rounded-3xl border border-mist-100/[0.07] bg-ink-900/35 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-brass-400/20 bg-brass-400/[0.05] text-brass-300">
        <Waypoints className="size-5" strokeWidth={1.6} />
      </span>
      <h2 className="mt-4 font-display text-xl font-semibold text-mist-100">还没有接入渠道</h2>
      <p className="mt-2 max-w-sm text-[0.78rem] leading-6 text-mist-500">
        先到互联中心接入一个 QQ 渠道并绑定人格，值班台才会开始显示她的状态和今天发生的事。
      </p>
      <Link
        to="/connections"
        className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg border border-brass-400/25 bg-brass-400/[0.08] px-4 text-[0.72rem] text-brass-200 transition hover:bg-brass-400/[0.14]"
      >
        去互联中心 <ArrowUpRight className="size-3.5" />
      </Link>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center rounded-3xl border border-signal-400/15 bg-signal-400/[0.03] px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-2xl border border-signal-400/20 bg-signal-400/[0.05] text-signal-300">
        <AlertTriangle className="size-4" strokeWidth={1.7} />
      </span>
      <h2 className="mt-4 font-display text-lg font-semibold text-mist-100">值班台读取失败</h2>
      <p className="mt-2 max-w-md text-[0.72rem] leading-5 text-mist-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg border border-mist-100/[0.1] px-4 text-[0.7rem] text-mist-300 transition hover:border-brass-400/25 hover:text-brass-200"
      >
        <RefreshCw className="size-3.5" />
        重新读取
      </button>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="mt-10 animate-pulse">
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((item) => (
          <div
            key={item}
            className="h-[20rem] rounded-3xl border border-mist-100/[0.05] bg-ink-900/30"
          />
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.75fr)]">
        <div className="h-72 rounded-3xl border border-mist-100/[0.05] bg-ink-900/30" />
        <div className="h-72 rounded-3xl border border-mist-100/[0.05] bg-ink-900/30" />
      </div>
    </div>
  );
}
