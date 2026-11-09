import type {
  MindInsightCard,
  MindInsightEvidence,
  MindInsightKind,
  MindInsightUsage,
} from '@inkseek/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  ArrowUpRight,
  Coins,
  HeartHandshake,
  LoaderCircle,
  MessageCircleQuestion,
  PenLine,
  RefreshCw,
  Send,
  Sparkles,
  ThermometerSnowflake,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { DropdownSelect } from '@/components/dropdown-select';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { chatChannelsQuery, mindInsightsQuery } from '@/lib/queries';

const RANGES = [7, 30, 90] as const;
const DEFAULT_DAYS = 30;

interface KindMeta {
  label: string;
  icon: LucideIcon;
  iconBox: string;
  chip: string;
  destination: 'relations' | 'learning' | 'conversations';
  destinationLabel: string;
}

const KIND_META: Record<MindInsightKind, KindMeta> = {
  RELATIONSHIP_SHIFT: {
    label: '关系跃迁',
    icon: HeartHandshake,
    iconBox: 'border-brass-400/25 bg-brass-400/[0.08] text-brass-300',
    chip: 'border-brass-400/25 bg-brass-400/[0.07] text-brass-200',
    destination: 'relations',
    destinationLabel: '关系数值',
  },
  CONVERSATION_COOLING: {
    label: '对话降温',
    icon: ThermometerSnowflake,
    iconBox: 'border-signal-400/25 bg-signal-400/[0.08] text-signal-400',
    chip: 'border-signal-400/25 bg-signal-400/[0.07] text-signal-400',
    destination: 'conversations',
    destinationLabel: '会话列表',
  },
  STYLE_DRIFT: {
    label: '风格漂移',
    icon: PenLine,
    iconBox: 'border-jade-400/25 bg-jade-400/[0.08] text-jade-300',
    chip: 'border-jade-400/25 bg-jade-400/[0.07] text-jade-300',
    destination: 'learning',
    destinationLabel: '表达笔记',
  },
};

const SEVERITY_META = {
  high: { label: '强信号', dot: 'bg-signal-400', text: 'text-signal-400' },
  medium: { label: '中等信号', dot: 'bg-brass-400', text: 'text-brass-300' },
  low: { label: '弱信号', dot: 'bg-mist-500', text: 'text-mist-500' },
} as const;

const FOLLOW_UPS: Record<MindInsightKind, string[]> = {
  RELATIONSHIP_SHIFT: ['从哪条记录开始变的？', '和上一期比差多少？', '现在是什么水平？'],
  CONVERSATION_COOLING: ['从哪天开始减少的？', '最后一条说了什么？', '这个判断可信吗？'],
  STYLE_DRIFT: ['举几个最近的例子', '这个习惯从什么时候开始？', '它出现在哪些回复里？'],
};

const TRIGGER_META: Record<string, { label: string; color: string }> = {
  MESSAGE: { label: '聊天', color: 'bg-brass-400' },
  HEARTBEAT: { label: '心跳', color: 'bg-jade-400' },
  PROACTIVE: { label: '主动', color: 'bg-brass-500' },
  PHONE: { label: '手机', color: 'bg-signal-400' },
  MANUAL: { label: '手动', color: 'bg-mist-500' },
  VISION: { label: '识图', color: 'bg-jade-500' },
};

const dayFormat = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' });
const clockFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' });
const tokenFormat = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const fullNumberFormat = new Intl.NumberFormat('zh-CN');

interface Exchange {
  question: string;
  answer: string;
  citations: MindInsightEvidence[];
}

export function InsightsPage() {
  const search = useSearch({ strict: false }) as { channelId?: string; days?: number };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const channelsQuery = useQuery(chatChannelsQuery);
  const channels = channelsQuery.data ?? [];
  const channelId = search.channelId ?? '';
  const [refreshing, setRefreshing] = useState(false);
  const days = RANGES.includes((search.days ?? DEFAULT_DAYS) as (typeof RANGES)[number])
    ? (search.days ?? DEFAULT_DAYS)
    : DEFAULT_DAYS;

  useEffect(() => {
    if (channelId) return;
    const first = channels.find((channel) => channel.persona);
    if (first) {
      void navigate({ to: '/insights', search: { channelId: first.id, days }, replace: true });
    }
  }, [channelId, channels, days, navigate]);

  const channel = channels.find((item) => item.id === channelId) ?? null;
  const persona = channel?.persona ?? null;
  const feedQuery = useQuery(mindInsightsQuery(channelId, days));

  const changeChannel = (value: string) => {
    void navigate({ to: '/insights', search: { channelId: value, days }, replace: true });
  };
  const changeDays = (value: number) => {
    void navigate({
      to: '/insights',
      search: { ...(channelId ? { channelId } : {}), days: value },
      replace: true,
    });
  };
  const refreshNow = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['insights', channelId] });
    } finally {
      setRefreshing(false);
    }
  };

  const channelOptions = channels.map((item) => ({
    value: item.id,
    label: item.persona
      ? item.persona.name === item.displayName
        ? item.displayName
        : `${item.displayName} · ${item.persona.name}`
      : `${item.displayName} · 未绑定人格`,
  }));
  const feed = feedQuery.data ?? null;
  const feedError =
    feedQuery.error instanceof ApiError
      ? feedQuery.error.message
      : feedQuery.error
        ? '洞察生成失败，请稍后重试'
        : null;

  return (
    <div className="relative mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:py-10">
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-end justify-between gap-4 lg:flex-nowrap"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-brass-400/75">
              Signal Room
            </span>
            <span className="h-px w-12 bg-brass-400/25" />
          </div>
          <h1 className="mt-3 flex items-center gap-3 font-display text-[clamp(1.8rem,3vw,2.7rem)] font-semibold tracking-[-0.03em] text-mist-100">
            <Sparkles className="size-7 text-brass-300" strokeWidth={1.4} />
            数据洞察
          </h1>
          <p className="mt-2 max-w-2xl text-[0.86rem] leading-6 text-mist-500">
            从关系记录、对话节奏和表达笔记里找变化。每条结论都带证据，也可以接着往下问。
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <span className="hidden shrink-0 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-mist-500 sm:inline">
              渠道
            </span>
            <div className="min-w-0 flex-1 sm:w-[12.5rem]">
              <DropdownSelect
                value={channelId}
                options={channelOptions}
                onChange={changeChannel}
                ariaLabel="选择渠道"
                placeholder="选择渠道"
                showValue={false}
                className="h-10"
              />
            </div>
          </div>

          <div className="flex h-10 shrink-0 items-center gap-0.5 rounded-xl border border-mist-100/[0.07] bg-ink-900/40 px-1">
            {RANGES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => changeDays(value)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[0.72rem] transition',
                  days === value
                    ? 'bg-brass-400/[0.12] text-brass-200'
                    : 'text-mist-500 hover:text-mist-200',
                )}
              >
                近 {value} 天
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void refreshNow()}
            disabled={refreshing || !channelId}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-mist-100/[0.1] px-3 text-[0.72rem] text-mist-400 transition hover:border-brass-400/30 hover:text-brass-200 disabled:opacity-50"
            title="重新计算洞察"
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            重算
          </button>
        </div>
      </motion.header>

      {channelsQuery.isPending ? (
        <LoadingBlock />
      ) : channels.length === 0 ? (
        <Panel
          icon={<Sparkles className="size-5 text-brass-300" />}
          title="还没有可分析的渠道"
          description="先在互联中心接入一个 QQ 渠道并绑定人格，洞察才有数据可看。"
          action={
            <Link
              to="/connections"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brass-400/30 bg-brass-400/[0.08] px-3 text-[0.76rem] text-brass-200 transition hover:bg-brass-400/[0.16]"
            >
              前往互联中心
              <ArrowUpRight className="size-3.5" />
            </Link>
          }
        />
      ) : !channelId ? (
        channels.some((item) => item.persona) ? (
          <Panel
            icon={<Sparkles className="size-5 text-brass-300" />}
            title="选择一个渠道"
            description="每个渠道的人格、关系和对话都是独立的，洞察也按渠道分别计算。"
          />
        ) : (
          <Panel
            icon={<Sparkles className="size-5 text-brass-300" />}
            title="还没有绑定人格的渠道"
            description="洞察按人格归集关系、对话与表达习惯。先给一个渠道绑定角色卡，这里才会有内容。"
            action={
              <Link
                to="/connections"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brass-400/30 bg-brass-400/[0.08] px-3 text-[0.76rem] text-brass-200 transition hover:bg-brass-400/[0.16]"
              >
                前往互联中心
                <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
        )
      ) : feedError ? (
        <Panel
          icon={<Sparkles className="size-5 text-brass-300" />}
          title="这次没有算出洞察"
          description={feedError}
          action={
            <button
              type="button"
              onClick={() => void refreshNow()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-mist-100/[0.12] px-3 text-[0.76rem] text-mist-300 transition hover:border-brass-400/30 hover:text-brass-200"
            >
              <RefreshCw className="size-3.5" />
              再试一次
            </button>
          }
        />
      ) : !persona ? (
        <Panel
          icon={<Sparkles className="size-5 text-brass-300" />}
          title="这个渠道还没有绑定人格"
          description="先在渠道设置里选择一张角色卡，关系、对话与风格数据才会归到人格名下。"
          action={
            <Link
              to="/connections"
              search={{ persona: channelId }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brass-400/30 bg-brass-400/[0.08] px-3 text-[0.76rem] text-brass-200 transition hover:bg-brass-400/[0.16]"
            >
              去绑定人格
              <ArrowUpRight className="size-3.5" />
            </Link>
          }
        />
      ) : feedQuery.isPending ? (
        <LoadingBlock />
      ) : feed ? (
        <>
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-mist-100/[0.06] sm:grid-cols-4"
          >
            <StatCell
              label="消息总量"
              value={feed.stats.messages}
              hint={`日均 ${Math.round((feed.stats.messages / days) * 10) / 10} 条`}
            />
            <StatCell label="收到" value={feed.stats.incoming} hint="联系人发来的" />
            <StatCell label="发出" value={feed.stats.outgoing} hint={`${persona.name} 的回复`} />
            <StatCell label="活跃会话" value={feed.stats.conversations} hint="窗口内有过消息" />
          </motion.section>

          <UsageStrip usage={feed.usage} />

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.76rem] text-mist-500">
              {feed.cards.length > 0
                ? `${feed.cards.length} 条值得注意的变化，按信号强度排序`
                : '这段时间没有足够强的变化'}
            </p>
            <p className="font-mono text-[0.62rem] text-mist-600">
              {feedQuery.dataUpdatedAt
                ? `计算于 ${clockFormat.format(feedQuery.dataUpdatedAt)}`
                : '尚未计算'}
            </p>
          </div>

          {feed.cards.length === 0 ? (
            <Panel
              icon={<Sparkles className="size-5 text-jade-300" />}
              title="没有需要处理的变化"
              description="关系数值没有大幅跳动，对话量保持平稳，表达笔记也还在原有范围内。这通常是个好信号——换成更长的时间窗口可以看得更远。"
            />
          ) : (
            <div className="relative mt-4 space-y-4">
              <span className="pointer-events-none absolute bottom-6 left-[1.15rem] top-6 hidden w-px bg-gradient-to-b from-brass-400/25 via-mist-100/[0.08] to-transparent sm:block" />
              {feed.cards.map((card, index) => (
                <InsightCard
                  key={card.id}
                  card={card}
                  channelId={channelId}
                  windowDays={feed.windowDays}
                  index={index}
                />
              ))}
            </div>
          )}

          <p className="mt-6 rounded-xl border border-mist-100/[0.06] bg-ink-950/30 px-4 py-3 text-[0.72rem] leading-5 text-mist-600">
            数字、时间和证据全部由后端按固定规则从数据库计算；模型只负责解释和回答追问，不会凭空补数字。
          </p>
        </>
      ) : null}
    </div>
  );
}

function UsageStrip({ usage }: { usage: MindInsightUsage }) {
  const delta =
    usage.previousTotalTokens && usage.previousTotalTokens > 0
      ? Math.round(
          ((usage.totalTokens - usage.previousTotalTokens) / usage.previousTotalTokens) * 100,
        )
      : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08 }}
      className="mt-3 rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 px-4 py-3.5"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="inline-flex items-center gap-2">
          <Coins className="size-4 text-brass-300" strokeWidth={1.7} />
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-mist-500">
            Token 用量
          </span>
        </span>
        <span
          className="font-display text-[1.12rem] font-semibold leading-none text-mist-100"
          title={fullNumberFormat.format(usage.totalTokens)}
        >
          {tokenFormat.format(usage.totalTokens)}
          <span className="ml-1 font-mono text-[0.6rem] font-normal uppercase tracking-[0.14em] text-mist-600">
            tokens
          </span>
        </span>
        <span className="text-[0.72rem] text-mist-500">
          输入 {tokenFormat.format(usage.promptTokens)} · 输出{' '}
          {tokenFormat.format(usage.completionTokens)}
        </span>
        <span className="text-[0.72rem] text-mist-500">
          {usage.runs} 次运行 · 平均 {tokenFormat.format(usage.averageTokens)}/次
        </span>
        {delta !== null && (
          <span className="rounded-full border border-mist-100/[0.08] px-2 py-0.5 font-mono text-[0.64rem] text-mist-400">
            较上期 {delta > 0 ? '+' : ''}
            {delta}%
          </span>
        )}
        {usage.runs === 0 && (
          <span className="text-[0.72rem] text-mist-600">这个窗口还没有心智运行记录</span>
        )}
      </div>

      {usage.totalTokens > 0 && usage.byTrigger.length > 0 && (
        <div className="mt-3">
          <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-mist-100/[0.06]">
            {usage.byTrigger.map((item) => (
              <span
                key={item.trigger}
                className={cn('basis-0', TRIGGER_META[item.trigger]?.color ?? 'bg-mist-500')}
                style={{ flexGrow: item.tokens }}
                title={`${TRIGGER_META[item.trigger]?.label ?? item.trigger} ${fullNumberFormat.format(item.tokens)} tokens`}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {usage.byTrigger.map((item) => (
              <span
                key={item.trigger}
                className="inline-flex items-center gap-1.5 text-[0.68rem] text-mist-500"
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    TRIGGER_META[item.trigger]?.color ?? 'bg-mist-500',
                  )}
                />
                {TRIGGER_META[item.trigger]?.label ?? item.trigger}
                <span className="font-mono text-[0.62rem] text-mist-600">
                  {Math.round((item.tokens / usage.totalTokens) * 100)}% ·{' '}
                  {tokenFormat.format(item.tokens)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.section>
  );
}

function StatCell({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="bg-ink-900/60 px-4 py-4">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-mist-600">{label}</p>
      <p className="mt-2 font-display text-[1.45rem] font-semibold leading-none text-mist-100">
        {value.toLocaleString('zh-CN')}
      </p>
      <p className="mt-2 text-[0.7rem] text-mist-600">{hint}</p>
    </div>
  );
}

function InsightCard({
  card,
  channelId,
  windowDays,
  index,
}: {
  card: MindInsightCard;
  channelId: string;
  windowDays: number;
  index: number;
}) {
  const queryClient = useQueryClient();
  const meta = KIND_META[card.kind];
  const severity = SEVERITY_META[card.severity];
  const Icon = meta.icon;
  const [expanded, setExpanded] = useState(false);
  const [thread, setThread] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const ask = useMutation({
    mutationFn: (question: string) =>
      api.askMindInsight({
        channelId,
        days: windowDays,
        cardId: card.id,
        question,
        history: thread
          .flatMap((item) => [
            { role: 'user' as const, text: item.question },
            { role: 'assistant' as const, text: item.answer },
          ])
          .slice(-8),
      }),
    onSuccess: (result, question) => {
      setThread((current) => [
        ...current,
        {
          question,
          answer: result.answer,
          citations: result.citations,
        },
      ]);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'INSIGHT_NOT_FOUND') {
        toast.error(error.message);
        void queryClient.invalidateQueries({ queryKey: ['insights', channelId] });
        return;
      }
      toast.error(error instanceof ApiError ? error.message : '追问失败，请稍后重试');
    },
    onSettled: () => {
      inputRef.current?.focus();
    },
  });

  const submit = (question: string) => {
    const text = question.trim();
    if (!text || ask.isPending) return;
    setDraft('');
    ask.mutate(text);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(draft);
  };

  const visibleEvidence = expanded ? card.evidence : card.evidence.slice(0, 2);
  const hiddenEvidence = card.evidence.length - visibleEvidence.length;

  const destination =
    meta.destination === 'conversations'
      ? { to: '/connections' as const, search: { persona: channelId } }
      : {
          to: '/mind' as const,
          search: {
            channelId,
            tab: meta.destination === 'relations' ? 'relations' : 'learning',
          },
        };

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: Math.min(index, 5) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="relative sm:pl-10"
    >
      <span
        className={cn(
          'absolute left-[0.68rem] top-6 hidden size-4 rounded-full border bg-ink-950 sm:block',
          card.severity === 'high'
            ? 'border-signal-400/50'
            : card.severity === 'medium'
              ? 'border-brass-400/50'
              : 'border-mist-100/[0.16]',
        )}
      >
        <span
          className={cn(
            'absolute inset-[0.22rem] rounded-full',
            card.severity === 'high'
              ? 'bg-signal-400'
              : card.severity === 'medium'
                ? 'bg-brass-400'
                : 'bg-mist-500',
          )}
        />
      </span>

      <div className="overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 backdrop-blur-sm transition hover:border-mist-100/[0.12]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl border border-mist-100/[0.07]">
              <span
                className={cn('grid size-full place-items-center rounded-xl border', meta.iconBox)}
              >
                <Icon className="size-4" strokeWidth={1.7} />
              </span>
            </span>
            <span className={cn('rounded-full border px-2 py-0.5 text-[0.68rem]', meta.chip)}>
              {meta.label}
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em]">
              <span className={cn('size-1.5 rounded-full', severity.dot)} />
              <span className={severity.text}>{severity.label}</span>
            </span>
          </div>

          <h2 className="mt-4 font-display text-[1.08rem] font-semibold leading-6 tracking-tight text-mist-100">
            {card.title}
          </h2>
          <p className="mt-2 text-[0.84rem] leading-7 text-mist-400">{card.summary}</p>

          {card.metrics.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {card.metrics.map((metric) => {
                const delta = metricDelta(metric.value, metric.previous);
                return (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-mist-100/[0.06] bg-ink-950/35 px-3 py-2.5"
                  >
                    <p className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-mist-600">
                      {metric.label}
                    </p>
                    <p className="mt-1 flex items-baseline gap-1.5 text-[0.95rem] font-medium text-mist-200">
                      {metric.value}
                      {delta !== null && delta !== 0 && (
                        <span
                          className={cn(
                            'font-mono text-[0.66rem]',
                            delta > 0 ? 'text-jade-300' : 'text-signal-400',
                          )}
                        >
                          {delta > 0 ? '+' : ''}
                          {delta}
                        </span>
                      )}
                    </p>
                    {metric.previous !== undefined && (
                      <p className="mt-1 font-mono text-[0.62rem] text-mist-600">
                        前一期 {metric.previous}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-mist-100/[0.06] bg-ink-950/30 px-3.5 py-3">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-brass-400/70">
              为什么是它
            </p>
            <p className="mt-1.5 text-[0.78rem] leading-6 text-mist-400">{card.why}</p>
          </div>

          {card.evidence.length > 0 && (
            <div className="mt-3 rounded-xl border border-mist-100/[0.06] px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-mist-500">
                  依据 · {card.evidence.length} 条
                </p>
                {hiddenEvidence > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="text-[0.68rem] text-mist-500 transition hover:text-brass-300"
                  >
                    {expanded ? '收起' : `展开其余 ${hiddenEvidence} 条`}
                  </button>
                )}
              </div>
              <ul className="mt-2 space-y-2.5">
                {visibleEvidence.map((item, itemIndex) => (
                  <li key={`${item.label}-${itemIndex}`} className="flex gap-2.5">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-brass-400/50" />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-[0.72rem] text-mist-400">
                        <span className="font-medium text-mist-300">{item.label}</span>
                        {item.at && (
                          <span className="font-mono text-[0.62rem] text-mist-600">
                            {dayFormat.format(new Date(item.at))}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[0.76rem] leading-6 text-mist-500">
                        {item.value}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-mist-100/[0.06] pt-3">
            <div className="min-w-0">
              <div className="h-1 w-28 overflow-hidden rounded-full bg-mist-100/[0.08]">
                <span
                  className={cn(
                    'block h-full rounded-full',
                    card.confidence >= 75
                      ? 'bg-brass-400'
                      : card.confidence >= 60
                        ? 'bg-jade-400'
                        : 'bg-mist-500',
                  )}
                  style={{ width: `${card.confidence}%` }}
                />
              </div>
              <p className="mt-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-mist-600">
                窗口 {windowDays} 天 · 可信度 {card.confidence}
              </p>
            </div>
            <Link
              {...destination}
              className="inline-flex items-center gap-1 text-[0.7rem] text-mist-500 transition hover:text-brass-200"
            >
              {meta.destinationLabel}
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </div>

        <div className="border-t border-mist-100/[0.06] bg-ink-950/25 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <MessageCircleQuestion className="size-4 text-brass-300/80" strokeWidth={1.7} />
            <span className="mr-1 text-[0.74rem] text-mist-400">继续追问</span>
            {FOLLOW_UPS[card.kind].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => submit(suggestion)}
                disabled={ask.isPending}
                className="rounded-full border border-mist-100/[0.08] px-2.5 py-1 text-[0.7rem] text-mist-500 transition hover:border-brass-400/30 hover:text-brass-200 disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {thread.length > 0 && (
            <div className="mt-3 space-y-3">
              {thread.map((exchange, exchangeIndex) => (
                <div key={`${exchange.question}-${exchangeIndex}`} className="space-y-2">
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-xl rounded-br-sm bg-brass-400/[0.1] px-3 py-2 text-[0.76rem] leading-6 text-brass-200">
                      {exchange.question}
                    </p>
                  </div>
                  <div className="max-w-[92%] rounded-xl rounded-bl-sm border border-mist-100/[0.06] bg-ink-900/60 px-3.5 py-2.5">
                    <p className="whitespace-pre-wrap text-[0.78rem] leading-6 text-mist-300">
                      {exchange.answer}
                    </p>
                    {exchange.citations.length > 0 && (
                      <p className="mt-2 border-t border-mist-100/[0.06] pt-2 font-mono text-[0.62rem] leading-5 text-mist-600">
                        依据：
                        {exchange.citations
                          .slice(0, 2)
                          .map((item) => item.label)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {ask.isPending && (
                <div className="max-w-[92%] rounded-xl rounded-bl-sm border border-mist-100/[0.06] bg-ink-900/60 px-3.5 py-3">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 animate-pulse rounded-full bg-brass-300" />
                    <span className="size-1.5 animate-pulse rounded-full bg-brass-300 [animation-delay:150ms]" />
                    <span className="size-1.5 animate-pulse rounded-full bg-brass-300 [animation-delay:300ms]" />
                  </span>
                </div>
              )}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-3 flex items-center gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="比如：从什么时候开始的？和谁比？"
              maxLength={500}
              aria-label="追问这条洞察"
              spellCheck={false}
              className="h-9 min-w-0 flex-1 rounded-lg border border-mist-100/[0.1] bg-ink-950/50 px-3 text-[0.78rem] text-mist-200 outline-none transition placeholder:text-mist-600 focus:border-brass-400/45 focus:bg-ink-950/80"
            />
            <button
              type="submit"
              disabled={ask.isPending || draft.trim().length === 0}
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-brass-400/30 bg-brass-400/[0.08] text-brass-200 transition hover:bg-brass-400/[0.16] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="发送追问"
            >
              {ask.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
            </button>
          </form>
        </div>
      </div>
    </motion.article>
  );
}

function metricDelta(value: string, previous: string | undefined): number | null {
  if (previous === undefined) return null;
  const current = Number(value);
  const before = Number(previous);
  if (!Number.isFinite(current) || !Number.isFinite(before)) return null;
  return Math.round((current - before) * 10) / 10;
}

function Panel({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-8 flex flex-col items-center rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 px-6 py-14 text-center"
    >
      <span className="grid size-11 place-items-center rounded-2xl border border-brass-400/20 bg-brass-400/[0.06]">
        {icon}
      </span>
      <h2 className="mt-4 font-display text-[1.02rem] font-semibold text-mist-200">{title}</h2>
      <p className="mt-2 max-w-md text-[0.8rem] leading-6 text-mist-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

function LoadingBlock() {
  return (
    <div className="mt-8 space-y-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-mist-100/[0.06] sm:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="bg-ink-900/60 px-4 py-4">
            <div className="h-2 w-12 animate-pulse rounded bg-mist-100/[0.08]" />
            <div className="mt-3 h-6 w-16 animate-pulse rounded bg-mist-100/[0.08]" />
          </div>
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-2xl border border-mist-100/[0.06] bg-ink-900/30" />
      <div className="h-40 animate-pulse rounded-2xl border border-mist-100/[0.06] bg-ink-900/20" />
    </div>
  );
}
