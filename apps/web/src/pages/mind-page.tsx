import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgentIntentionRecord,
  AgentRunSummary,
  AgentTodoRecord,
  LlmPromptLogRecord,
  MindOverview,
  MindSettingsUpdateInput,
  PersonaGroupStanceRecord,
  PersonaJournalRecord,
  PersonaMemoryKind,
  PersonaMemoryRecord,
  PersonaMemoryVisibility,
  PersonaRelationshipRecord,
  PersonaStateChangeRecord,
  StickerImageCandidate,
  StickerRecord,
} from '@inkseek/shared';
import { motion } from 'motion/react';
import {
  Activity,
  Brain,
  Check,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PipelineSelect } from '@/components/pipeline/pipeline-select';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { chatChannelsQuery, mindOverviewQuery, mindRunQuery } from '@/lib/queries';

const MODES = [
  { value: 'OFF', label: '关闭', hint: '继续使用原消息管线' },
  { value: 'SHADOW', label: '影子', hint: '记录心智轨迹，但不发送' },
  { value: 'APPROVAL', label: '审批', hint: '生成动作，人工批准后发送' },
  { value: 'LIVE', label: '直发', hint: '心智直接执行动作' },
] as const;

const TABS = [
  { key: 'runs', label: '运行轨迹' },
  { key: 'relations', label: '个人关系' },
  { key: 'groups', label: '群关系' },
  { key: 'memories', label: '记忆' },
  { key: 'todos', label: '待办与主动' },
  { key: 'journal', label: '日记' },
  { key: 'stickers', label: '表情库' },
  { key: 'prompts', label: '提示词' },
  { key: 'changes', label: '变动历史' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const REFRESH_OPTIONS = [
  { value: '0', label: '不自动刷新' },
  { value: '10000', label: '10 秒' },
  { value: '30000', label: '30 秒' },
  { value: '60000', label: '1 分钟' },
  { value: '300000', label: '5 分钟' },
] as const;
const REFRESH_VALUES = REFRESH_OPTIONS.map((option) => Number(option.value));
const REFRESH_STORAGE_KEY = 'mind.refreshMs';

const MEMORY_KINDS: PersonaMemoryKind[] = [
  'EPISODE',
  'FACT',
  'PREFERENCE',
  'PROMISE',
  'BOUNDARY',
  'REFLECTION',
  'PROCEDURE',
];
const VISIBILITIES: PersonaMemoryVisibility[] = ['PRIVATE', 'SCENE', 'CHANNEL', 'PUBLIC'];

const BASE_METRIC_LABELS: Record<string, string> = {
  age: '年龄',
  height_cm: '身高',
  weight_kg: '体重',
  typo_level: '错字习惯',
  split_level: '分段倾向',
  emoji_level: '表情频率',
  typing_level: '打字速度',
  sleep_depth: '睡眠深度',
  confidence: '自信',
  self_control: '自控',
  shame: '羞耻',
  trust_bias: '信任倾向',
  attachment_style: '依恋类型',
  possessiveness_base: '占有欲',
  agreeableness: '亲和',
  proactivity: '主动性',
  curiosity: '好奇心',
  stamina_max: '体力',
  strength: '力量',
  agility: '灵活',
  pain_tolerance: '疼痛耐受',
  recovery_rate: '恢复速度',
  sensitivity: '敏感度',
  physique_effect_cap: '体型影响上限',
  emotional_inertia_sec: '情绪惯性',
  mood_decay_halflife_sec: '心情衰减半衰期',
  affinity_halflife_day: '好感半衰期',
  stress_recovery_halflife_sec: '压力恢复半衰期',
  aftercare_need_base: '事后安抚需求',
  experience_level: '经验等级',
};

const STATE_FIELD_LABELS: Record<string, string> = {
  moodValence: '心情好坏',
  moodArousal: '情绪唤醒',
  moodDominance: '掌控感',
  energy: '精力',
  health: '健康度',
  stress: '压力',
  socialBattery: '社交电量',
  attention: '注意力',
  sleepDebt: '睡眠债',
  grooming: '整洁程度',
  currentActivity: '正在做',
  location: '位置',
};

const STATE_SOURCE_LABELS: Record<string, string> = {
  EVENT: '长时事件',
  DRIFT: '自然漂移',
  EMOTION: '情绪',
  TURN: '对话消耗',
  AGENT: 'Agent 调整',
  MANUAL: '手动调整',
  WAKE: '醒来',
  SCHEDULE: '唤醒安排',
};

const STATE_EVENT_KIND_LABELS: Record<string, string> = {
  SLEEP: '睡觉',
  NAP: '打盹',
  REST: '休息',
  FOCUS: '专注',
  AWAY: '离开',
};

const MEMORY_KIND_LABELS: Record<PersonaMemoryKind, string> = {
  EPISODE: '情景',
  FACT: '事实',
  PREFERENCE: '偏好',
  PROMISE: '承诺',
  BOUNDARY: '边界',
  REFLECTION: '反思',
  PROCEDURE: '流程',
};

const VISIBILITY_LABELS: Record<PersonaMemoryVisibility, string> = {
  PRIVATE: '私密',
  SCENE: '本场景',
  CHANNEL: '本渠道',
  PUBLIC: '公开',
};

export function MindPage() {
  const queryClient = useQueryClient();
  const channelsQuery = useQuery(chatChannelsQuery);
  const [channelId, setChannelId] = useState('');
  const [refreshMs, setRefreshMsState] = useState(() => {
    const stored = window.localStorage.getItem(REFRESH_STORAGE_KEY);
    if (stored === null) {
      return 30000;
    }
    const value = Number(stored);
    return REFRESH_VALUES.includes(value) ? value : 30000;
  });
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const overviewQuery = useQuery({
    ...mindOverviewQuery(channelId),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const overview = overviewQuery.data;
  const persona = overview?.persona ?? null;
  const [tab, setTab] = useState<TabKey>('runs');
  const channelOptions =
    channelsQuery.data?.map((channel) => ({
      value: channel.id,
      label: `${channel.displayName} · ${channel.persona?.name ?? '未绑定人格'}`,
    })) ?? [];

  useEffect(() => {
    if (channelId) return;
    const first = channelsQuery.data?.find((channel) => channel.persona);
    if (first) setChannelId(first.id);
  }, [channelId, channelsQuery.data]);

  useEffect(() => {
    if (!refreshMs || !channelId) {
      return;
    }
    const timer = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs, channelId, queryClient]);

  const changeRefreshMs = (value: number) => {
    setRefreshMsState(value);
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

  return (
    <div className="relative mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-end justify-between gap-5"
      >
        <div>
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
            自我状态、关系、记忆、注意力和生活节奏。管线负责「这一轮怎么执行」，心智负责「TA
            现在是谁、想不想说、为什么」。
          </p>
        </div>

        <label className="w-full rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-3 sm:min-w-[17rem] sm:w-auto">
          <span className="font-mono text-[0.72rem] uppercase tracking-[0.22em] text-mist-500">
            渠道
          </span>
          <div className="mt-2">
            <PipelineSelect
              value={channelId}
              options={channelOptions}
              onChange={setChannelId}
              ariaLabel="选择渠道"
              placeholder="选择渠道"
              showValue={false}
            />
          </div>
        </label>
      </motion.header>

      {channelsQuery.isPending ? (
        <div className="mt-10 grid place-items-center rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 py-20">
          <LoaderCircle className="size-6 animate-spin text-brass-300" />
        </div>
      ) : !channelsQuery.data?.length ? (
        <EmptyState text="还没有渠道。先在互联中心接入一个 QQ 渠道。" />
      ) : !channelId ? (
        <EmptyState text="选择一个渠道，查看它的人格心智。" />
      ) : overviewQuery.isPending ? (
        <div className="mt-10 grid place-items-center rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 py-20">
          <LoaderCircle className="size-6 animate-spin text-brass-300" />
        </div>
      ) : !persona ? (
        <EmptyState text="这个渠道还没有绑定人格。先在渠道设置里选择一张角色卡。" />
      ) : (
        <>
          <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_2fr]">
            <SettingsPanel
              channelId={channelId}
              settings={overview?.settings ?? null}
              personaName={persona.name}
            />
            <StatePanel
              state={overview?.state ?? null}
              base={persona.base}
              longEvent={overview?.longEvent ?? null}
              onEndEvent={persona ? () => endLongEvent.mutate() : undefined}
              endingEvent={endLongEvent.isPending}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-mist-100/[0.07] pb-3">
            <div className="flex flex-wrap items-center gap-2">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[0.8rem] transition',
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
              <span className="font-mono text-[0.68rem] text-mist-600">
                {overviewQuery.dataUpdatedAt
                  ? `更新 ${formatClock(overviewQuery.dataUpdatedAt)}`
                  : '尚未刷新'}
              </span>
              <div className="w-[7.2rem]">
                <PipelineSelect
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
            {tab === 'runs' && (
              <RunsTab
                personaId={persona.id}
                runs={overview?.runs ?? []}
                pendingActions={
                  overview?.settings?.mode === 'APPROVAL' ? overview.persona?.id : undefined
                }
              />
            )}
            {tab === 'relations' && (
              <RelationsTab personaId={persona.id} relationships={overview?.relationships ?? []} />
            )}
            {tab === 'groups' && (
              <GroupsTab personaId={persona.id} stances={overview?.groupStances ?? []} />
            )}
            {tab === 'memories' && (
              <MemoriesTab personaId={persona.id} memories={overview?.memories ?? []} />
            )}
            {tab === 'todos' && (
              <TodosTab
                personaId={persona.id}
                todos={overview?.todos ?? []}
                intentions={overview?.intentions ?? []}
                settings={overview?.settings ?? null}
              />
            )}
            {tab === 'journal' && <JournalTab journal={overview?.journal ?? []} />}
            {tab === 'stickers' && (
              <StickersTab channelId={channelId} stickers={overview?.stickers ?? []} />
            )}
            {tab === 'prompts' && <PromptLogsTab />}
            {tab === 'changes' && (
              <StateChangesTab changes={overview?.stateChanges ?? []} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SettingsPanel({
  channelId,
  settings,
  personaName,
}: {
  channelId: string;
  settings: MindOverview['settings'];
  personaName: string;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState(settings?.mode ?? 'OFF');
  const [heartbeat, setHeartbeat] = useState(settings?.heartbeatEnabled ?? true);
  const [proactive, setProactive] = useState(settings?.proactiveEnabled ?? false);
  const [maxBeats, setMaxBeats] = useState(settings?.maxBeats ?? 3);
  const [selfSchedule, setSelfSchedule] = useState(settings?.selfScheduleEnabled ?? true);
  const [wakeInterval, setWakeInterval] = useState(settings?.wakeIntervalMinutes ?? 45);
  const [wakeMin, setWakeMin] = useState(settings?.wakeMinMinutes ?? 10);
  const [wakeMax, setWakeMax] = useState(settings?.wakeMaxMinutes ?? 240);
  const [quietInterval, setQuietInterval] = useState(settings?.quietIntervalMinutes ?? 90);
  const [replyAvoid, setReplyAvoid] = useState(settings?.replyAvoidSeconds ?? 180);
  const [privateBurst, setPrivateBurst] = useState(settings?.privateBurstSeconds ?? 0);
  const [imagePrompt, setImagePrompt] = useState(settings?.imageDescriptionPrompt ?? '');
  const appliedSettingsRef = useRef('');

  useEffect(() => {
    if (!settings) return;
    // Background refreshes return a new object with the same updatedAt; do not
    // clobber unsaved edits unless the stored settings actually changed.
    if (appliedSettingsRef.current === settings.updatedAt) return;
    appliedSettingsRef.current = settings.updatedAt;
    setMode(settings.mode);
    setHeartbeat(settings.heartbeatEnabled);
    setProactive(settings.proactiveEnabled);
    setMaxBeats(settings.maxBeats);
    setSelfSchedule(settings.selfScheduleEnabled);
    setWakeInterval(settings.wakeIntervalMinutes);
    setWakeMin(settings.wakeMinMinutes);
    setWakeMax(settings.wakeMaxMinutes);
    setQuietInterval(settings.quietIntervalMinutes);
    setReplyAvoid(settings.replyAvoidSeconds);
    setPrivateBurst(settings.privateBurstSeconds);
    setImagePrompt(settings.imageDescriptionPrompt);
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (input: MindSettingsUpdateInput) => api.updateMindSettings(channelId, input),
    onSuccess: () => {
      toast.success('心智设置已保存');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '保存失败'),
  });

  const dirty =
    settings &&
    (settings.mode !== mode ||
      settings.heartbeatEnabled !== heartbeat ||
      settings.proactiveEnabled !== proactive ||
      settings.maxBeats !== maxBeats ||
      settings.selfScheduleEnabled !== selfSchedule ||
      settings.wakeIntervalMinutes !== wakeInterval ||
      settings.wakeMinMinutes !== wakeMin ||
      settings.wakeMaxMinutes !== wakeMax ||
      settings.quietIntervalMinutes !== quietInterval ||
      settings.replyAvoidSeconds !== replyAvoid ||
      settings.privateBurstSeconds !== privateBurst ||
      settings.imageDescriptionPrompt !== imagePrompt);

  return (
    <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-mist-500">
            Runtime
          </p>
          <h2 className="mt-1 text-[1rem] font-medium text-mist-100">{personaName} 的运行模式</h2>
        </div>
        <span className="rounded-full border border-jade-400/20 bg-jade-400/10 px-2 py-0.5 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-jade-300">
          {MODES.find((item) => item.value === mode)?.label ?? mode}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setMode(item.value)}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-left transition',
              mode === item.value
                ? 'border-brass-400/40 bg-brass-400/10'
                : 'border-mist-100/[0.07] bg-ink-950/30 hover:border-mist-100/[0.14]',
            )}
          >
            <span className="block text-[0.84rem] text-mist-200">{item.label}</span>
            <span className="mt-0.5 block text-[0.68rem] leading-4 text-mist-600">{item.hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        <ToggleRow
          label="心跳"
          hint="按待办和近期经历唤醒"
          checked={heartbeat}
          onChange={setHeartbeat}
        />
        <ToggleRow
          label="主动消息"
          hint="允许 TA 自己找人说话"
          checked={proactive}
          onChange={setProactive}
        />
        <NumberField
          label="最多气泡"
          hint="一次回应最多分几条"
          value={maxBeats}
          min={1}
          max={8}
          onChange={setMaxBeats}
        />
        <NumberField
          label="回复回避窗口（秒）"
          hint="仅群聊生效；窗口内只忽略没 @、没叫名字、没戳你的消息；被点名时照常回复；0 关闭"
          value={replyAvoid}
          min={0}
          max={7200}
          onChange={setReplyAvoid}
        />
        <NumberField
          label="私聊连发合并（秒）"
          hint="仅私聊生效；对方连发好几条时，等这段安静时间后把整串合成一次回复；最长等 12 秒；0 关闭，不拦消息"
          value={privateBurst}
          min={0}
          max={30}
          onChange={setPrivateBurst}
        />
      </div>

      <div className="mt-4 rounded-xl border border-mist-100/[0.06] bg-ink-950/25 p-3">
        <p className="text-[0.82rem] text-mist-300">唤醒节奏（分钟）</p>
        <p className="mt-1 text-[0.68rem] leading-4 text-mist-600">
          只决定没人发消息时 TA 多久自己醒一次；收到新消息会尽快处理，私聊连发合并开启时
          会先等一小段安静时间。安静时段默认按人格时区 00:00–07:00。
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField
            label="常规间隔"
            hint="正常时段"
            value={wakeInterval}
            min={1}
            max={1440}
            onChange={setWakeInterval}
            compact
          />
          <NumberField
            label="安静时段间隔"
            hint="安静时段内"
            value={quietInterval}
            min={1}
            max={1440}
            onChange={setQuietInterval}
            compact
          />
          <NumberField
            label="最短间隔"
            hint="唤醒下限"
            value={wakeMin}
            min={1}
            max={1440}
            onChange={setWakeMin}
            compact
          />
          <NumberField
            label="最长间隔"
            hint="唤醒上限"
            value={wakeMax}
            min={1}
            max={10080}
            onChange={setWakeMax}
            compact
          />
        </div>
        <div className="mt-2">
          <ToggleRow
            label="自主安排唤醒"
            hint="允许 TA 自己决定下次醒来的时间，并受最短/最长间隔约束"
            checked={selfSchedule}
            onChange={setSelfSchedule}
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-mist-100/[0.06] bg-ink-950/25 p-3">
        <p className="text-[0.82rem] text-mist-300">图片理解</p>
        <div className="mt-2">
          <TextAreaField
            label="心智图片描述提示词"
            hint="留空使用内置默认；只影响尚未生成描述的新图片"
            value={imagePrompt}
            onChange={setImagePrompt}
          />
        </div>
      </div>

      <button
        type="button"
        disabled={!dirty || mutation.isPending}
        onClick={() =>
          mutation.mutate({
            mode,
            heartbeatEnabled: heartbeat,
            proactiveEnabled: proactive,
            maxBeats,
            selfScheduleEnabled: selfSchedule,
            wakeIntervalMinutes: wakeInterval,
            wakeMinMinutes: Math.min(wakeMin, wakeMax),
            wakeMaxMinutes: Math.max(wakeMin, wakeMax),
            quietIntervalMinutes: quietInterval,
            replyAvoidSeconds: replyAvoid,
            privateBurstSeconds: privateBurst,
            imageDescriptionPrompt: imagePrompt.trim(),
          })
        }
        className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-brass-400/30 bg-brass-400/10 text-[0.8rem] text-brass-200 transition hover:bg-brass-400/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {mutation.isPending ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
        保存运行设置
      </button>
    </section>
  );
}

function StatePanel({
  state,
  base,
  longEvent,
  onEndEvent,
  endingEvent,
}: {
  state: MindOverview['state'];
  base: Record<string, number>;
  longEvent: MindOverview['longEvent'];
  onEndEvent?: () => void;
  endingEvent?: boolean;
}) {
  const metrics = [
    { label: '心情好坏', value: state?.moodValence ?? 0, signed: true },
    { label: '情绪唤醒', value: state?.moodArousal ?? 0 },
    { label: '掌控感', value: state?.moodDominance ?? 0, signed: true },
    { label: '精力', value: state?.energy ?? 0 },
    { label: '健康度', value: state?.health ?? 0 },
    { label: '压力', value: state?.stress ?? 0, inverse: true },
    { label: '社交电量', value: state?.socialBattery ?? 0 },
    { label: '注意力', value: state?.attention ?? 0 },
    { label: '睡眠债', value: state?.sleepDebt ?? 0, inverse: true },
    { label: '整洁程度', value: state?.grooming ?? 0 },
  ];
  return (
    <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-mist-500">
            Self State
          </p>
          <h2 className="mt-1 text-[1rem] font-medium text-mist-100">此刻的 TA</h2>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[0.68rem] text-mist-500">
          <Activity className="size-3 text-jade-300" />
          {state ? `${stateMoodLabel(state)} · ${state.currentActivity || '在线'}` : '在线'}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
          当前数值 · 唯一动态状态
        </p>
        <span className="font-mono text-[0.68rem] text-mist-600">{metrics.length} 项</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 p-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[0.72rem] text-mist-500">{metric.label}</span>
              <span className="font-mono text-[0.88rem] text-mist-200">{metric.value}</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-mist-100/[0.08]">
              <div
                className={cn(
                  'h-full rounded-full',
                  metric.inverse
                    ? 'bg-signal-400/70'
                    : metric.signed && metric.value < 0
                      ? 'bg-signal-400/70'
                      : 'bg-jade-400/70',
                )}
                style={{ width: `${Math.min(100, Math.abs(metric.value))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2 text-[0.72rem] text-mist-500 sm:grid-cols-2">
        <p className="rounded-lg bg-ink-950/30 px-3 py-2">
          正在做：<span className="text-mist-300">{state?.currentActivity || '未设定'}</span>
        </p>
        <p className="rounded-lg bg-ink-950/30 px-3 py-2">
          位置：<span className="text-mist-300">{state?.location || '未设定'}</span>
        </p>
        <p className="rounded-lg bg-ink-950/30 px-3 py-2">
          上次醒来：<span className="text-mist-300">{formatTime(state?.lastWakeAt ?? null)}</span>
        </p>
        <p className="rounded-lg bg-ink-950/30 px-3 py-2">
          上次心跳：
          <span className="text-mist-300">{formatTime(state?.lastHeartbeatAt ?? null)}</span>
        </p>
        <p className="rounded-lg bg-ink-950/30 px-3 py-2 sm:col-span-2">
          下次唤醒：<span className="text-mist-300">{formatTime(state?.nextWakeAt ?? null)}</span>
        </p>
      </div>

      {longEvent ? (
        <div className="mt-4 rounded-xl border border-brass-400/25 bg-brass-400/[0.06] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-brass-200">
              长时事件 · {longEvent.status === 'ACTIVE' ? '进行中' : longEvent.status}
            </p>
            {onEndEvent ? (
              <button
                type="button"
                onClick={onEndEvent}
                disabled={endingEvent}
                className="rounded border border-brass-400/35 px-2 py-0.5 text-[0.68rem] text-brass-200 transition hover:bg-brass-400/10 disabled:opacity-50"
              >
                {endingEvent ? '结束中…' : '结束事件'}
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-[0.82rem] text-mist-200">
            {longEvent.title || longEvent.kind}
            <span className="ml-2 text-[0.7rem] text-mist-500">
              {STATE_EVENT_KIND_LABELS[longEvent.kind] ?? longEvent.kind}
            </span>
          </p>
          <p className="mt-1 text-[0.7rem] text-mist-500">
            开始 {formatTime(longEvent.startedAt)} ·{' '}
            {longEvent.plannedEndAt
              ? `计划结束 ${formatTime(longEvent.plannedEndAt)}`
              : '没有计划结束'}
          </p>
          <p className="mt-1 text-[0.7rem] leading-4 text-mist-500">
            唤醒条件：{longEvent.wakeWindowMinutes} 分钟内被点到 {longEvent.wakeMentions} 次，
            或出现关键词
            {longEvent.wakeKeywords.length > 0 ? `（${longEvent.wakeKeywords.join('、')}）` : ''}
            ；已收到 {longEvent.triggerCount} 次点名刺激。
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
            基本数值 · 渠道人格（唯一来源）
          </p>
          <span className="font-mono text-[0.68rem] text-mist-600">
            {Object.keys(base).length} 项
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(base).map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-2 rounded-lg border border-mist-100/[0.06] bg-ink-950/25 px-2.5 py-1.5"
            >
              <span className="truncate text-[0.72rem] text-mist-500">
                {BASE_METRIC_LABELS[key] ?? key}
              </span>
              <span className="font-mono text-[0.78rem] text-mist-200">{value}</span>
            </div>
          ))}
        </div>
        {Object.keys(base).length === 0 ? (
          <p className="mt-2 text-[0.72rem] text-mist-600">渠道人格还没有数值属性。</p>
        ) : null}
      </div>
    </section>
  );
}

function RunsTab({
  personaId,
  runs,
  pendingActions,
}: {
  personaId: string;
  runs: AgentRunSummary[];
  pendingActions?: string;
}) {
  const [selectedId, setSelectedId] = useState(runs[0]?.id ?? '');
  const [extraRuns, setExtraRuns] = useState<AgentRunSummary[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const allRuns = [
    ...runs,
    ...extraRuns.filter((extra) => !runs.some((run) => run.id === extra.id)),
  ];
  useEffect(() => {
    setExtraRuns([]);
    setReachedEnd(false);
  }, [personaId]);
  useEffect(() => {
    if (!selectedId && allRuns[0]) setSelectedId(allRuns[0].id);
  }, [allRuns, selectedId]);
  const loadMore = async () => {
    if (loadingMore || reachedEnd) return;
    setLoadingMore(true);
    try {
      const next = await api.mindRuns(personaId, undefined, 30, allRuns.length);
      const fresh = next.filter((run) => !allRuns.some((known) => known.id === run.id));
      setExtraRuns((current) => [...current, ...fresh]);
      if (next.length < 30) setReachedEnd(true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '加载失败');
    } finally {
      setLoadingMore(false);
    }
  };
  const detailQuery = useQuery(mindRunQuery(selectedId));
  const actionQuery = useQuery({
    queryKey: ['mind', 'pending-actions', personaId],
    queryFn: () => api.mindPendingActions(personaId),
    enabled: Boolean(pendingActions),
    refetchInterval: 5000,
  });
  const queryClient = useQueryClient();
  const approve = useMutation({
    mutationFn: (id: string) => api.approveMindAction(id),
    onSuccess: () => {
      toast.success('动作已发送');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '发送失败'),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-2">
        {pendingActions && (actionQuery.data?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-brass-400/25 bg-brass-400/[0.06] p-3">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-brass-200">
              待审批动作 · {actionQuery.data?.length}
            </p>
            <div className="mt-2 space-y-1.5">
              {actionQuery.data?.map((action) => (
                <div key={action.id} className="rounded-lg bg-ink-950/40 p-2">
                  <p className="text-[0.72rem] text-mist-300">
                    {renderPayload(action.payload).slice(0, 90)}
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
          </div>
        )}
        {allRuns.length === 0 ? (
          <EmptyState compact text="还没有心智运行。发一条消息，或等心跳自动唤醒。" />
        ) : (
          <>
            <LazyList
              items={allRuns}
              step={20}
              renderItem={(run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedId(run.id)}
                  className={cn(
                    'w-full rounded-xl border px-3 py-2.5 text-left transition',
                    selectedId === run.id
                      ? 'border-brass-400/35 bg-brass-400/[0.07]'
                      : 'border-mist-100/[0.07] bg-ink-900/30 hover:border-mist-100/[0.14]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[0.78rem] text-mist-200">
                      <StatusDot status={run.status} />
                      {run.trigger}
                    </span>
                    <span className="font-mono text-[0.68rem] text-mist-600">
                      {formatTime(run.startedAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[0.7rem] leading-4 text-mist-500">
                    {run.reason || (run.engage === false ? '保持沉默' : '没有记录理由')}
                  </p>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[0.68rem] text-mist-600">
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
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="mt-2 w-full rounded-lg border border-mist-100/[0.08] py-1.5 text-[0.72rem] text-mist-400 transition hover:border-mist-100/[0.16] hover:text-mist-200 disabled:opacity-50"
              >
                {loadingMore ? '加载中…' : '加载更多'}
              </button>
            ) : null}
          </>
        )}
      </div>

      <div className="min-w-0 rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
        {!selectedId ? (
          <EmptyState compact text="选择一次运行查看轨迹。" />
        ) : detailQuery.isPending ? (
          <div className="grid place-items-center py-16">
            <LoaderCircle className="size-5 animate-spin text-brass-300" />
          </div>
        ) : !detailQuery.data ? (
          <EmptyState compact text="运行详情不可用。" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={detailQuery.data.status} />
              <span className="rounded-full border border-mist-100/[0.08] px-2 py-0.5 font-mono text-[0.68rem] text-mist-500">
                {detailQuery.data.mode} · {detailQuery.data.trigger}
              </span>
              {detailQuery.data.model && (
                <span className="font-mono text-[0.68rem] text-mist-600">
                  {detailQuery.data.model}
                </span>
              )}
            </div>
            <p className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 p-3 text-[0.82rem] leading-6 text-mist-300">
              {detailQuery.data.reason ?? '没有理由记录'}
            </p>
            <TraceBlock title="社交判断" value={detailQuery.data.socialRead} />
            <TraceBlock title="动作计划" value={detailQuery.data.plan} />
            <div>
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-mist-600">
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
                        <span className="ml-2 font-mono text-[0.68rem] text-mist-600">
                          {step.durationMs}ms
                        </span>
                      ) : null}
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.68rem] leading-4 text-mist-500">
                      {formatJson(step.output ?? step.input)}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
            <div>
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-mist-600">
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
                        {action.sentMessageId && (
                          <span className="font-mono text-[0.68rem] text-jade-300">已发送</span>
                        )}
                      </div>
                      <p className="mt-1 text-[0.7rem] leading-4 text-mist-500">
                        {renderPayload(action.payload)}
                      </p>
                      {action.error && (
                        <p className="mt-1 text-[0.68rem] text-signal-400">{action.error}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StateChangesTab({ changes }: { changes: PersonaStateChangeRecord[] }) {
  return (
    <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-mist-600">
          数据变动历史
        </p>
        <span className="font-mono text-[0.68rem] text-mist-600">{changes.length} 条</span>
      </div>
      {changes.length === 0 ? (
        <EmptyState compact text="还没有变动记录。" />
      ) : (
        <div className="mt-2 space-y-1.5">
          <LazyList
            items={changes}
            step={30}
            renderItem={(change) => (
              <div
                key={change.id}
                className="rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.7rem]">
                  <span className="font-mono text-mist-600">{formatTime(change.createdAt)}</span>
                  <span className="text-mist-300">
                    {STATE_FIELD_LABELS[change.field] ?? change.field}
                  </span>
                  <span className="font-mono text-mist-400">
                    {formatStateValue(change.beforeValue)} → {formatStateValue(change.afterValue)}
                  </span>
                  {change.delta !== null ? (
                    <span
                      className={cn(
                        'font-mono',
                        change.delta >= 0 ? 'text-jade-300' : 'text-signal-400',
                      )}
                    >
                      {change.delta > 0 ? '+' : ''}
                      {change.delta}
                    </span>
                  ) : null}
                  <span className="ml-auto text-mist-500">
                    {change.reason || STATE_SOURCE_LABELS[change.source] || change.source}
                  </span>
                </div>
              </div>
            )}
          />
        </div>
      )}
    </section>
  );
}

const RELATION_DIMENSIONS = [
  { key: 'affinity', label: '好感' },
  { key: 'trust', label: '信任' },
  { key: 'intimacy', label: '亲密' },
  { key: 'attraction', label: '心动' },
  { key: 'hostility', label: '敌意' },
  { key: 'fear', label: '恐惧' },
  { key: 'respect', label: '尊重' },
  { key: 'obligation', label: '亏欠' },
  { key: 'dependency', label: '依赖' },
  { key: 'possessiveness', label: '占有欲' },
  { key: 'friction', label: '摩擦' },
  { key: 'unresolvedConflict', label: '未解冲突' },
  { key: 'familiarity', label: '熟悉度' },
] as const;

const STANCE_DIMENSIONS = [
  { key: 'comfort', label: '自在' },
  { key: 'belonging', label: '归属' },
  { key: 'attention', label: '关注' },
  { key: 'formality', label: '严肃' },
  { key: 'speakRate', label: '主动' },
  { key: 'audienceRisk', label: '观众风险' },
] as const;

type RelationDimension = (typeof RELATION_DIMENSIONS)[number]['key'];
type RelationDraft = Record<RelationDimension, number> & {
  relationTags: string;
  addressHere: string;
  publicMask: string;
  boundaries: string;
  openPromises: string;
  sharedEvents: string;
  disclosureScope: string;
  blocked: boolean;
  mutedUntil: string;
  extrasText: string;
};
type StanceDimension = (typeof STANCE_DIMENSIONS)[number]['key'];
type StanceDraft = Record<StanceDimension, number> & {
  role: string;
  narrative: string;
  sceneRules: string;
  topic: string;
  phase: string;
  mentionOnly: boolean;
  boundaries: string;
  tabooTopics: string;
  sceneType: string;
  focus: string;
  explicitCap: string;
};

function jsonText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').join('\n');
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return '';
}

function listText(value: string): string[] {
  return value
    .split(/\r?\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function jsonValue(value: string): unknown {
  const text = value.trim();
  if (!text) {
    return [];
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function jsonObject(value: string): Record<string, unknown> | null {
  const text = value.trim();
  if (!text) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extrasRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toIsoOrNull(value: string): string | null {
  const text = value.trim();
  if (!text) {
    return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function relationDraftOf(record: PersonaRelationshipRecord | null): RelationDraft {
  return {
    ...(Object.fromEntries(
      RELATION_DIMENSIONS.map(({ key }) => [key, record?.[key] ?? 0]),
    ) as Record<RelationDimension, number>),
    relationTags: jsonText(record?.relationTags),
    addressHere: jsonText(record?.addressHere),
    publicMask: jsonText(record?.publicMask),
    boundaries: jsonText(record?.boundaries),
    openPromises: jsonText(record?.openPromises),
    sharedEvents: jsonText(record?.sharedEvents),
    disclosureScope: record?.disclosureScope ?? 'SCENE',
    blocked: record?.blocked ?? false,
    mutedUntil: record?.mutedUntil ?? '',
    extrasText: JSON.stringify(extrasRecord(record?.extras), null, 2),
  };
}

function stanceDraftOf(record: PersonaGroupStanceRecord | null): StanceDraft {
  const extras = extrasRecord(record?.extras);
  return {
    ...(Object.fromEntries(
      STANCE_DIMENSIONS.map(({ key }) => [key, Math.max(0, Math.min(100, record?.[key] ?? 0))]),
    ) as Record<StanceDimension, number>),
    role: record?.role ?? '',
    narrative: record?.narrative ?? '',
    sceneRules: record?.sceneRules ?? '',
    topic: record?.topic ?? '',
    phase: record?.phase ?? '',
    mentionOnly: record?.mentionOnly ?? false,
    boundaries: jsonText(record?.boundaries),
    tabooTopics: jsonText(record?.tabooTopics),
    sceneType: typeof extras['scene_type'] === 'string' ? extras['scene_type'] : '',
    focus: typeof extras['focus'] === 'string' ? extras['focus'] : '',
    explicitCap: typeof extras['explicit_cap'] === 'string' ? extras['explicit_cap'] : '',
  };
}

function RelationsTab({
  personaId,
  relationships,
}: {
  personaId: string;
  relationships: PersonaRelationshipRecord[];
}) {
  const queryClient = useQueryClient();
  const [relationQuery, setRelationQuery] = useState('');
  const [relationContactId, setRelationContactId] = useState(relationships[0]?.contactId ?? '');
  const [relationDraft, setRelationDraft] = useState<RelationDraft>(() =>
    relationDraftOf(relationships[0] ?? null),
  );

  const keyword = relationQuery.trim().toLowerCase();
  const filteredRelationships = relationships.filter((relationship) => {
    if (!keyword) return true;
    return [relationship.nickname, relationship.externalId, relationship.contactId]
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
  const activeRelation =
    filteredRelationships.find((relationship) => relationship.contactId === relationContactId) ??
    filteredRelationships[0] ??
    relationships.find((relationship) => relationship.contactId === relationContactId) ??
    null;

  useEffect(() => {
    setRelationDraft(relationDraftOf(activeRelation));
  }, [activeRelation?.contactId, activeRelation?.updatedAt]);

  const relationMutation = useMutation({
    mutationFn: () => {
      const extras = jsonObject(relationDraft.extrasText);
      if (relationDraft.extrasText.trim() && extras === null) {
        throw new Error('扩展档案不是合法的 JSON 对象');
      }
      return api.updateMindRelationship(personaId, {
        contactId: activeRelation?.contactId ?? '',
        affinity: relationDraft.affinity,
        trust: relationDraft.trust,
        intimacy: relationDraft.intimacy,
        attraction: relationDraft.attraction,
        hostility: relationDraft.hostility,
        fear: relationDraft.fear,
        respect: relationDraft.respect,
        obligation: relationDraft.obligation,
        dependency: relationDraft.dependency,
        possessiveness: relationDraft.possessiveness,
        friction: relationDraft.friction,
        unresolvedConflict: relationDraft.unresolvedConflict,
        familiarity: relationDraft.familiarity,
        relationTags: listText(relationDraft.relationTags),
        addressHere: listText(relationDraft.addressHere),
        publicMask: jsonValue(relationDraft.publicMask),
        boundaries: listText(relationDraft.boundaries),
        openPromises: listText(relationDraft.openPromises),
        sharedEvents: listText(relationDraft.sharedEvents),
        disclosureScope: (relationDraft.disclosureScope || 'SCENE').slice(0, 32),
        blocked: relationDraft.blocked,
        mutedUntil: toIsoOrNull(relationDraft.mutedUntil),
        extras: extras ?? undefined,
      });
    },
    onSuccess: () => {
      toast.success('关系已更新');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '更新失败'),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[21rem_1fr]">
      <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
          Relationships · {relationships.length}
        </p>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-mist-100/[0.1] bg-ink-950/40 px-2.5">
          <Search className="size-3.5 text-mist-600" />
          <input
            value={relationQuery}
            onChange={(event) => setRelationQuery(event.target.value)}
            placeholder="搜索昵称、QQ 或 ID"
            className="h-9 flex-1 bg-transparent text-[0.78rem] text-mist-200 outline-none placeholder:text-mist-600"
          />
        </div>
        <div className="mt-2 space-y-1.5 pr-1">
          <LazyList
            items={filteredRelationships}
            step={24}
            renderItem={(relationship) => (
              <button
                key={relationship.id}
                type="button"
                onClick={() => setRelationContactId(relationship.contactId)}
                className={cn(
                  'w-full rounded-xl border px-3 py-2 text-left transition',
                  activeRelation?.id === relationship.id
                    ? 'border-brass-400/35 bg-brass-400/[0.07]'
                    : 'border-mist-100/[0.06] bg-ink-950/25 hover:border-mist-100/[0.14]',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[0.8rem] text-mist-200">
                    {relationship.nickname}
                  </span>
                  <span className="font-mono text-[0.68rem] text-mist-600">
                    {relationship.externalId}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[0.68rem] text-mist-500">
                  <span>好感 {relationship.affinity}</span>
                  <span>信任 {relationship.trust}</span>
                  <span>敌意 {relationship.hostility}</span>
                  <span>亏欠 {relationship.obligation}</span>
                </div>
              </button>
            )}
          />
          {filteredRelationships.length === 0 ? (
            <p className="py-3 text-center text-[0.72rem] text-mist-600">没有匹配的人。</p>
          ) : null}
        </div>
      </section>

      <div className="min-w-0 space-y-4">
        <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
              Edit · {activeRelation?.nickname ?? '选择一个人'}
            </p>
            <span className="font-mono text-[0.68rem] text-mist-600">
              {activeRelation ? `${activeRelation.externalId} · ${activeRelation.contactId}` : ''}
            </span>
          </div>
          {activeRelation ? (
            <>
              <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {RELATION_DIMENSIONS.map((dimension) => (
                  <RangeField
                    key={dimension.key}
                    label={dimension.label}
                    value={relationDraft[dimension.key]}
                    min={-100}
                    max={100}
                    onChange={(value) =>
                      setRelationDraft((current) => ({ ...current, [dimension.key]: value }))
                    }
                  />
                ))}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <TextField
                  label="关系标签"
                  hint="用逗号分隔，例如：朋友、同事"
                  value={relationDraft.relationTags}
                  onChange={(relationTags) =>
                    setRelationDraft((current) => ({ ...current, relationTags }))
                  }
                />
                <TextField
                  label="可公开范围"
                  hint="SCENE / CHANNEL / PUBLIC / PRIVATE"
                  value={relationDraft.disclosureScope}
                  onChange={(disclosureScope) =>
                    setRelationDraft((current) => ({ ...current, disclosureScope }))
                  }
                />
                <TextAreaField
                  label="各场合称呼"
                  hint="一行一处，例如：私聊：周叙"
                  value={relationDraft.addressHere}
                  onChange={(addressHere) =>
                    setRelationDraft((current) => ({ ...current, addressHere }))
                  }
                />
                <TextAreaField
                  label="公开面具"
                  hint="在别人面前表现出的态度"
                  value={relationDraft.publicMask}
                  onChange={(publicMask) =>
                    setRelationDraft((current) => ({ ...current, publicMask }))
                  }
                />
                <TextAreaField
                  label="边界"
                  hint="一行一条，只能加严"
                  value={relationDraft.boundaries}
                  onChange={(boundaries) =>
                    setRelationDraft((current) => ({ ...current, boundaries }))
                  }
                />
                <TextAreaField
                  label="承诺清单"
                  hint="一行一条，未兑现的承诺"
                  value={relationDraft.openPromises}
                  onChange={(openPromises) =>
                    setRelationDraft((current) => ({ ...current, openPromises }))
                  }
                />
                <TextAreaField
                  label="共同经历"
                  hint="一行一条，可被回忆引用"
                  value={relationDraft.sharedEvents}
                  onChange={(sharedEvents) =>
                    setRelationDraft((current) => ({ ...current, sharedEvents }))
                  }
                />
                <TextField
                  label="静默截止"
                  hint="ISO 时间，留空表示不静默"
                  value={relationDraft.mutedUntil}
                  onChange={(mutedUntil) =>
                    setRelationDraft((current) => ({ ...current, mutedUntil }))
                  }
                />
                <div className="sm:col-span-2">
                  <TextAreaField
                    label="扩展档案（JSON）"
                    hint="安全词、对象档案、已拒行为等旧字段都保存在这里，和关系数值一样只有这一份。"
                    value={relationDraft.extrasText}
                    onChange={(extrasText) =>
                      setRelationDraft((current) => ({ ...current, extrasText }))
                    }
                  />
                </div>
              </div>
              <div className="mt-3">
                <ToggleRow
                  label="拉黑"
                  hint="彻底拒绝交流；仍会读取关系数值"
                  checked={relationDraft.blocked}
                  onChange={(blocked) => setRelationDraft((current) => ({ ...current, blocked }))}
                />
              </div>
              <button
                type="button"
                onClick={() => relationMutation.mutate()}
                disabled={relationMutation.isPending}
                className="mt-3 h-9 w-full rounded-lg border border-brass-400/25 bg-brass-400/10 text-[0.78rem] text-brass-200 transition hover:bg-brass-400/20 disabled:opacity-40"
              >
                {relationMutation.isPending ? '保存中…' : '保存关系'}
              </button>
            </>
          ) : (
            <p className="mt-2 text-[0.74rem] text-mist-600">还没有关系记录。</p>
          )}
        </section>
      </div>
    </div>
  );
}

function GroupsTab({
  personaId,
  stances,
}: {
  personaId: string;
  stances: PersonaGroupStanceRecord[];
}) {
  const queryClient = useQueryClient();
  const [groupId, setGroupId] = useState(stances[0]?.id ?? '');
  const [groupQuery, setGroupQuery] = useState('');
  const [stanceDraft, setStanceDraft] = useState<StanceDraft>(() =>
    stanceDraftOf(stances[0] ?? null),
  );

  const keyword = groupQuery.trim().toLowerCase();
  const filteredGroups = stances.filter((stance) => {
    if (!keyword) return true;
    return [stance.name, stance.externalId, stance.conversationId]
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
  const selectedGroup =
    filteredGroups.find((stance) => stance.id === groupId) ??
    filteredGroups[0] ??
    stances.find((stance) => stance.id === groupId) ??
    null;

  useEffect(() => {
    setStanceDraft(stanceDraftOf(selectedGroup));
  }, [selectedGroup?.id, selectedGroup?.updatedAt]);

  const stanceMutation = useMutation({
    mutationFn: () =>
      api.updateMindGroupStance(personaId, {
        conversationId: selectedGroup?.conversationId ?? '',
        comfort: stanceDraft.comfort,
        belonging: stanceDraft.belonging,
        attention: stanceDraft.attention,
        formality: stanceDraft.formality,
        speakRate: stanceDraft.speakRate,
        audienceRisk: stanceDraft.audienceRisk,
        role: stanceDraft.role,
        narrative: stanceDraft.narrative,
        sceneRules: stanceDraft.sceneRules,
        topic: stanceDraft.topic,
        phase: stanceDraft.phase,
        mentionOnly: stanceDraft.mentionOnly,
        boundaries: listText(stanceDraft.boundaries),
        tabooTopics: listText(stanceDraft.tabooTopics),
        extras: {
          ...extrasRecord(selectedGroup?.extras),
          scene_type: stanceDraft.sceneType,
          focus: stanceDraft.focus,
          explicit_cap: stanceDraft.explicitCap,
        },
      }),
    onSuccess: () => {
      toast.success('群态度已更新');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '更新失败'),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[21rem_1fr]">
      <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
          Groups · {stances.length}
        </p>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-mist-100/[0.1] bg-ink-950/40 px-2.5">
          <Search className="size-3.5 text-mist-600" />
          <input
            value={groupQuery}
            onChange={(event) => setGroupQuery(event.target.value)}
            placeholder="搜索群名、群号或 ID"
            className="h-9 flex-1 bg-transparent text-[0.78rem] text-mist-200 outline-none placeholder:text-mist-600"
          />
        </div>
        <div className="mt-2 space-y-1.5 pr-1">
          <LazyList
            items={filteredGroups}
            step={24}
            renderItem={(stance) => (
              <button
                key={stance.id}
                type="button"
                onClick={() => setGroupId(stance.id)}
                className={cn(
                  'w-full rounded-xl border px-3 py-2 text-left transition',
                  selectedGroup?.id === stance.id
                    ? 'border-brass-400/35 bg-brass-400/[0.07]'
                    : 'border-mist-100/[0.06] bg-ink-950/25 hover:border-mist-100/[0.14]',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[0.8rem] text-mist-200">{stance.name}</span>
                  <span className="font-mono text-[0.68rem] text-mist-600">
                    {stance.externalId}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[0.68rem] text-mist-500">
                  <span>自在 {stance.comfort}</span>
                  <span>归属 {stance.belonging}</span>
                  <span>关注 {stance.attention}</span>
                  <span>主动 {stance.speakRate}</span>
                  <span>{stance.mentionOnly ? '仅@回' : '自由发言'}</span>
                </div>
              </button>
            )}
          />
          {filteredGroups.length === 0 ? (
            <p className="py-3 text-center text-[0.72rem] text-mist-600">没有匹配的群。</p>
          ) : null}
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
            Edit · {selectedGroup?.name ?? '选择一个群'}
          </p>
          <span className="font-mono text-[0.68rem] text-mist-600">
            {selectedGroup ? `${selectedGroup.externalId} · ${selectedGroup.conversationId}` : ''}
          </span>
        </div>
        {selectedGroup ? (
          <>
            <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {STANCE_DIMENSIONS.map((dimension) => (
                <RangeField
                  key={dimension.key}
                  label={dimension.label}
                  value={stanceDraft[dimension.key]}
                  min={0}
                  max={100}
                  onChange={(value) =>
                    setStanceDraft((current) => ({ ...current, [dimension.key]: value }))
                  }
                />
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <TextField
                label="群内角色"
                value={stanceDraft.role}
                onChange={(role) => setStanceDraft((current) => ({ ...current, role }))}
              />
              <TextField
                label="当前话题"
                value={stanceDraft.topic}
                onChange={(topic) => setStanceDraft((current) => ({ ...current, topic }))}
              />
              <TextField
                label="场景阶段"
                value={stanceDraft.phase}
                onChange={(phase) => setStanceDraft((current) => ({ ...current, phase }))}
              />
              <TextField
                label="群规"
                value={stanceDraft.sceneRules}
                onChange={(sceneRules) => setStanceDraft((current) => ({ ...current, sceneRules }))}
              />
              <TextField
                label="场合类型"
                value={stanceDraft.sceneType}
                onChange={(sceneType) => setStanceDraft((current) => ({ ...current, sceneType }))}
              />
              <TextField
                label="是否指向我"
                hint="被 @、被回复、点名，还是旁观"
                value={stanceDraft.focus}
                onChange={(focus) => setStanceDraft((current) => ({ ...current, focus }))}
              />
              <TextField
                label="尺度硬上限"
                hint="群聊通常为 none，不交模型裁量"
                value={stanceDraft.explicitCap}
                onChange={(explicitCap) =>
                  setStanceDraft((current) => ({ ...current, explicitCap }))
                }
              />
              <TextAreaField
                label="本群边界"
                hint="一行一条，只能加严"
                value={stanceDraft.boundaries}
                onChange={(boundaries) => setStanceDraft((current) => ({ ...current, boundaries }))}
              />
              <TextAreaField
                label="禁忌话题"
                hint="一行一条"
                value={stanceDraft.tabooTopics}
                onChange={(tabooTopics) =>
                  setStanceDraft((current) => ({ ...current, tabooTopics }))
                }
              />
              <label className="sm:col-span-2">
                <span className="text-[0.72rem] text-mist-500">一句总纲</span>
                <textarea
                  value={stanceDraft.narrative}
                  onChange={(event) =>
                    setStanceDraft((current) => ({ ...current, narrative: event.target.value }))
                  }
                  rows={2}
                  className="wizard-textarea mt-1 min-h-16"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <ToggleRow
                label="仅被@才回"
                hint="开启后，没有点名就不主动说话"
                checked={stanceDraft.mentionOnly}
                onChange={(mentionOnly) =>
                  setStanceDraft((current) => ({ ...current, mentionOnly }))
                }
              />
              <button
                type="button"
                onClick={() => stanceMutation.mutate()}
                disabled={stanceMutation.isPending}
                className="h-9 rounded-lg border border-brass-400/25 bg-brass-400/10 px-5 text-[0.78rem] text-brass-200 transition hover:bg-brass-400/20 disabled:opacity-40"
              >
                {stanceMutation.isPending ? '保存中…' : '保存群态度'}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-[0.74rem] text-mist-600">还没有群态度记录。</p>
        )}
      </section>
    </div>
  );
}

function MemoriesTab({
  personaId,
  memories,
}: {
  personaId: string;
  memories: PersonaMemoryRecord[];
}) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<PersonaMemoryKind>('FACT');
  const [visibility, setVisibility] = useState<PersonaMemoryVisibility>('SCENE');
  const queryClient = useQueryClient();

  const searchQuery = useQuery({
    queryKey: ['mind', 'memories', personaId, query],
    queryFn: () =>
      api.mindMemories({
        personaId,
        query: query.trim() || undefined,
        limit: 60,
        offset: 0,
      }),
    enabled: Boolean(personaId),
    staleTime: 4000,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createMindMemory({
        personaId,
        content: draft.trim(),
        kind,
        scope: kind === 'EPISODE' ? 'SCENE' : 'RELATION',
        subjectType: 'SELF',
        visibility,
        sourceType: 'ADMIN',
      }),
    onSuccess: () => {
      setDraft('');
      toast.success('记忆已写入');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '写入失败'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteMindMemory(id),
    onSuccess: () => {
      toast.success('已遗忘');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
  });

  const rows = query.trim() ? (searchQuery.data ?? []) : memories;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-mist-100/[0.1] bg-ink-950/40 px-2.5">
            <Search className="size-3.5 text-mist-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="按语义搜索记忆，例如「B 考试」「群里的冲突」"
              className="h-9 flex-1 bg-transparent text-[0.78rem] text-mist-200 outline-none placeholder:text-mist-600"
            />
          </div>
          <span className="font-mono text-[0.68rem] text-mist-600">{rows.length} 条</span>
        </div>
        <div className="mt-3 space-y-1.5 pr-1">
          {rows.length === 0 ? (
            <EmptyState compact text="没有匹配的记忆。" />
          ) : (
            <LazyList
              items={rows}
              step={30}
              renderItem={(memory) => (
                <div
                  key={memory.id}
                  className="rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full border border-jade-400/20 px-1.5 py-0.5 font-mono text-[0.68rem] text-jade-300">
                      {memory.kind}
                    </span>
                    <span className="rounded-full border border-mist-100/[0.08] px-1.5 py-0.5 font-mono text-[0.68rem] text-mist-500">
                      {memory.visibility}
                    </span>
                    <span className="font-mono text-[0.68rem] text-mist-600">
                      {formatTime(memory.occurredAt)} · 重要度 {memory.importance}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove.mutate(memory.id)}
                      className="ml-auto rounded p-1 text-mist-600 hover:bg-signal-400/10 hover:text-signal-400"
                      aria-label="遗忘这条记忆"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                  <p className="mt-1.5 text-[0.78rem] leading-5 text-mist-300">{memory.content}</p>
                  <p className="mt-1 font-mono text-[0.68rem] text-mist-600">
                    {memory.subjectName || memory.subjectType} · 置信度 {memory.confidence} · 回忆{' '}
                    {memory.recallCount}
                  </p>
                </div>
              )}
            />
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
          Write Memory
        </p>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={5}
          placeholder="写一条会影响未来的记忆。比如：B 不喜欢被吊着。"
          className="wizard-textarea mt-2 min-h-28"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <PipelineSelect
            value={kind}
            options={MEMORY_KINDS.map((item) => ({ value: item, label: MEMORY_KIND_LABELS[item] }))}
            onChange={(value) => setKind(value as PersonaMemoryKind)}
            ariaLabel="记忆类型"
            showValue={false}
          />
          <PipelineSelect
            value={visibility}
            options={VISIBILITIES.map((item) => ({ value: item, label: VISIBILITY_LABELS[item] }))}
            onChange={(value) => setVisibility(value as PersonaMemoryVisibility)}
            ariaLabel="记忆可见范围"
            showValue={false}
          />
        </div>
        <button
          type="button"
          disabled={!draft.trim() || create.isPending}
          onClick={() => create.mutate()}
          className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-brass-400/25 bg-brass-400/10 text-[0.76rem] text-brass-200 hover:bg-brass-400/20 disabled:opacity-40"
        >
          {create.isPending ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          写入记忆
        </button>
        <p className="mt-2 text-[0.68rem] leading-4 text-mist-600">
          PRIVATE 记忆只能作为内心判断，不会在群里被说出。SCENE 只在学到的会话里可用。
        </p>
      </section>
    </div>
  );
}

function TodosTab({
  personaId,
  todos,
  intentions,
  settings,
}: {
  personaId: string;
  todos: AgentTodoRecord[];
  intentions: AgentIntentionRecord[];
  settings: MindOverview['settings'];
}) {
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (id: string) => api.updateMindTodo(id, { status: 'DONE' }),
    onSuccess: () => {
      toast.success('待办已完成');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
  });
  const heartbeat = useMutation({
    mutationFn: () => api.mindHeartbeat(personaId),
    onSuccess: () => toast.success('已安排一次心跳'),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '唤醒失败'),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
            Todos · {todos.length}
          </p>
          <button
            type="button"
            onClick={() => heartbeat.mutate()}
            disabled={heartbeat.isPending}
            className="flex items-center gap-1 rounded-full border border-mist-100/[0.1] px-2 py-0.5 text-[0.68rem] text-mist-400 hover:border-brass-400/30 hover:text-brass-200 disabled:opacity-40"
          >
            <RefreshCw className={cn('size-2.5', heartbeat.isPending && 'animate-spin')} />
            立即唤醒
          </button>
        </div>
        <div className="mt-2 space-y-1.5">
          {todos.length === 0 ? (
            <EmptyState compact text="没有待办。人格会在对话里自己创建。" />
          ) : (
            todos.map((todo) => (
              <div
                key={todo.id}
                className="rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[0.78rem] text-mist-200">{todo.title}</p>
                    <p className="mt-0.5 font-mono text-[0.68rem] text-mist-600">
                      {todo.status} · 优先级 {todo.priority}
                      {todo.dueAt ? ` · ${formatTime(todo.dueAt)}` : ''}
                    </p>
                  </div>
                  {todo.status !== 'DONE' && (
                    <button
                      type="button"
                      onClick={() => update.mutate(todo.id)}
                      className="rounded border border-jade-400/20 px-1.5 py-0.5 text-[0.68rem] text-jade-300 hover:bg-jade-400/10"
                    >
                      完成
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
      <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
          Intentions · {intentions.length}
        </p>
        {!settings?.proactiveEnabled && (
          <p className="mt-2 rounded-lg border border-signal-400/20 bg-signal-400/[0.05] px-2.5 py-2 text-[0.68rem] leading-4 text-signal-400">
            主动消息当前关闭。TA 会记录想做的事，但不会自己发出去。
          </p>
        )}
        <div className="mt-2 space-y-1.5">
          {intentions.length === 0 ? (
            <EmptyState compact text="没有主动意图。" />
          ) : (
            intentions.map((intention) => (
              <div
                key={intention.id}
                className="rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.76rem] text-mist-200">
                    {intention.reason || '想找 TA 说话'}
                  </span>
                  <span className="font-mono text-[0.68rem] text-mist-600">{intention.status}</span>
                </div>
                <p className="mt-0.5 text-[0.68rem] leading-4 text-mist-500">{intention.seed}</p>
                <p className="mt-1 font-mono text-[0.68rem] text-mist-600">
                  紧急度 {intention.urgency} · 尝试 {intention.attempts}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function JournalTab({ journal }: { journal: PersonaJournalRecord[] }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteMindJournal(id),
    onSuccess: () => {
      toast.success('日记已删除');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '删除失败'),
  });
  return (
    <div className="space-y-2">
      {journal.length === 0 ? (
        <EmptyState text="还没有日记。心跳整理记忆后会写一段第一人称日记。" />
      ) : (
        <LazyList
          items={journal}
          step={8}
          renderItem={(entry) => (
            <article
              key={entry.id}
              className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-brass-300">
                  {entry.date}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[0.68rem] text-mist-600">{entry.mood}</span>
                  <button
                    type="button"
                    onClick={() => remove.mutate(entry.id)}
                    disabled={remove.isPending}
                    className="rounded p-1 text-mist-600 transition hover:bg-signal-400/10 hover:text-signal-400 disabled:opacity-40"
                    aria-label="删除这篇日记"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-line text-[0.82rem] leading-6 text-mist-300">
                {entry.content}
              </p>
            </article>
          )}
        />
      )}
    </div>
  );
}

function StickersTab({ channelId, stickers }: { channelId: string; stickers: StickerRecord[] }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<StickerImageCandidate | null>(null);
  const imagesQuery = useQuery({
    queryKey: ['mind', 'sticker-images', channelId],
    queryFn: () => api.mindStickerImages(channelId),
    enabled: Boolean(channelId),
    staleTime: 15_000,
  });
  const scan = useMutation({
    mutationFn: () => api.scanMindStickers(false),
    onSuccess: (result) => {
      toast.success(`扫描 ${result.scanned} 个文件，新增 ${result.created} 个表情`);
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '扫描失败'),
  });
  const collect = useMutation({
    mutationFn: (candidate: StickerImageCandidate) =>
      api.importMindSticker({
        mediaId: candidate.mediaId ?? undefined,
        imageUrl: candidate.mediaId ? undefined : candidate.url,
        describe: true,
      }),
    onSuccess: (sticker) => {
      setSelected(null);
      toast.success(`已收进表情库${sticker.description ? `：${sticker.description}` : ''}`);
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '收藏失败'),
  });

  const images = imagesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-500">
              Sticker Library · {stickers.length}
            </p>
            <p className="mt-1 text-[0.7rem] text-mist-500">
              本地目录与从聊天里收藏的图片都会进入这里，按描述和标签做向量检索。
            </p>
          </div>
          <button
            type="button"
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
            className="flex items-center gap-1.5 rounded-full border border-brass-400/25 px-3 py-1 text-[0.7rem] text-brass-200 hover:bg-brass-400/10 disabled:opacity-40"
          >
            <RefreshCw className={cn('size-3', scan.isPending && 'animate-spin')} />
            扫描本地表情
          </button>
        </div>
        {stickers.length === 0 ? (
          <EmptyState compact text="表情库为空。" />
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            <LazyList
              items={stickers}
              step={32}
              sentinelClassName="col-span-full"
              renderItem={(sticker) => (
                <div
                  key={sticker.id}
                  className="overflow-hidden rounded-xl border border-mist-100/[0.08] bg-ink-950/30"
                >
                  <img
                    src={stickerUrl(sticker.filePath)}
                    alt={sticker.description || sticker.tags.join(' ')}
                    className="aspect-square w-full object-contain"
                    loading="lazy"
                  />
                  <p className="truncate px-1.5 py-1 font-mono text-[0.68rem] text-mist-600">
                    {sticker.description || sticker.tags.join(' / ') || '未标注'}
                  </p>
                </div>
              )}
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-500">
              Received Images · {images.length}
            </p>
            <p className="mt-1 text-[0.7rem] text-mist-500">
              渠道收到过的图片都可以收进 TA 的表情库；点击选中后再确认。
            </p>
          </div>
          <button
            type="button"
            disabled={!selected || collect.isPending}
            onClick={() => selected && collect.mutate(selected)}
            className="flex items-center gap-1.5 rounded-full border border-jade-400/25 px-3 py-1 text-[0.7rem] text-jade-300 hover:bg-jade-400/10 disabled:opacity-40"
          >
            {collect.isPending ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : (
              <ImagePlus className="size-3" />
            )}
            加入表情库
          </button>
        </div>
        {imagesQuery.isPending ? (
          <div className="grid place-items-center py-10">
            <LoaderCircle className="size-5 animate-spin text-brass-300" />
          </div>
        ) : images.length === 0 ? (
          <EmptyState compact text="这个渠道还没有收到可收藏的图片。" />
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            <LazyList
              items={images}
              step={32}
              sentinelClassName="col-span-full"
              renderItem={(image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setSelected(image)}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border bg-ink-950/30 text-left transition',
                    selected?.id === image.id
                      ? 'border-brass-400/60 ring-2 ring-brass-400/25'
                      : 'border-mist-100/[0.08] hover:border-mist-100/[0.2]',
                  )}
                >
                  <img
                    src={image.url}
                    alt={image.description || `${image.author} 收到的图片`}
                    className="aspect-square w-full object-contain"
                    loading="lazy"
                  />
                  <span className="block truncate px-1.5 py-1 font-mono text-[0.68rem] text-mist-600">
                    {image.author} · {formatTime(image.sentAt)}
                  </span>
                  {image.collected ? (
                    <span className="absolute right-1 top-1 rounded-full bg-jade-400/20 px-1.5 py-0.5 font-mono text-[0.68rem] text-jade-300">
                      已收藏
                    </span>
                  ) : null}
                </button>
              )}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function PromptLogsTab() {
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
  const selected = logs.find((log) => log.id === selectedId) ?? logs[0] ?? null;

  useEffect(() => {
    if (!selectedId && logs[0]) {
      setSelectedId(logs[0].id);
    }
  }, [logs, selectedId]);

  return (
    <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
      <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
              LLM Prompts · {logs.length}
            </p>
            <p className="mt-1 text-[0.7rem] text-mist-500">仅保留最近 200 条请求。</p>
          </div>
          <button
            type="button"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['mind', 'prompts'] })}
            className="rounded-full border border-mist-100/[0.1] p-1.5 text-mist-500 hover:border-brass-400/30 hover:text-brass-200"
            aria-label="刷新提示词日志"
          >
            <RefreshCw className="size-3" />
          </button>
        </div>
        <div className="mt-2">
          <PipelineSelect
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
        <div className="mt-2 space-y-1.5 pr-1">
          {logsQuery.isPending ? (
            <div className="grid place-items-center py-10">
              <LoaderCircle className="size-5 animate-spin text-brass-300" />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState compact text="还没有 LLM 请求日志。" />
          ) : (
            <LazyList
              items={logs}
              step={30}
              renderItem={(log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedId(log.id)}
                  className={cn(
                    'w-full rounded-xl border px-3 py-2 text-left transition',
                    selected?.id === log.id
                      ? 'border-brass-400/35 bg-brass-400/[0.07]'
                      : 'border-mist-100/[0.06] bg-ink-950/25 hover:border-mist-100/[0.14]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[0.72rem] text-mist-200">
                      {log.source}
                    </span>
                    <span className="font-mono text-[0.68rem] text-mist-600">
                      {formatTime(log.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[0.68rem] text-mist-600">
                    <span>{log.model ?? '未记录模型'}</span>
                    <span>
                      {log.promptTokens ?? '—'} / {log.completionTokens ?? '—'} tokens
                    </span>
                    {log.error ? <span className="text-signal-400">失败</span> : null}
                  </div>
                </button>
              )}
            />
          )}
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4">
        {!selected ? (
          <EmptyState compact text="选择一条请求查看完整提示词。" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-brass-400/25 bg-brass-400/[0.07] px-2 py-0.5 font-mono text-[0.68rem] text-brass-200">
                {selected.source}
              </span>
              <span className="font-mono text-[0.68rem] text-mist-500">
                {selected.providerName ?? '未知提供商'} · {selected.model ?? '未知模型'}
              </span>
              <span className="font-mono text-[0.68rem] text-mist-600">
                {selected.latencyMs ?? '—'}ms · {selected.imageCount} 张图片 ·{' '}
                {formatTime(selected.createdAt)}
              </span>
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
        )}
      </section>
    </div>
  );
}

function PromptBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-mist-600">{title}</p>
      <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-mist-100/[0.06] bg-ink-950/40 p-3 font-mono text-[0.7rem] leading-5 text-mist-400">
        {text}
      </pre>
    </div>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        'grid place-items-center rounded-2xl border border-dashed border-mist-100/[0.1] px-5 text-center text-[0.76rem] leading-5 text-mist-600',
        compact ? 'py-8' : 'mt-10 py-20',
      )}
    >
      {text}
    </div>
  );
}

/**
 * Renders list items in batches; the sentinel below the rendered batch loads
 * the next one when it enters the mind tab scroll container. Keeps long tabs
 * (runs, memories, prompts) from mounting hundreds of nodes at once.
 */
function LazyList<T>({
  items,
  step = 24,
  sentinelClassName = '',
  renderItem,
}: {
  items: readonly T[];
  step?: number;
  sentinelClassName?: string;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const [visible, setVisible] = useState(step);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisible((count) => (count > items.length ? Math.max(step, items.length) : count));
  }, [items.length, step]);

  useEffect(() => {
    const node = sentinelRef.current;
    const root = node?.closest('[data-mind-scroll]');
    if (!node || !root || visible >= items.length) {
      return;
    }
    const loadMore = () => {
      setVisible((count) => Math.min(items.length, count + step));
    };
    // Scroll events keep batching working in hidden/throttled tabs where
    // IntersectionObserver callbacks may not be delivered.
    const onScroll = () => {
      if (node.getBoundingClientRect().top <= root.getBoundingClientRect().bottom + 240) {
        loadMore();
      }
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { root, rootMargin: '240px 0px' },
    );
    observer.observe(node);
    return () => {
      root.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [visible, items.length, step]);

  return (
    <>
      {items.slice(0, visible).map((item, index) => renderItem(item, index))}
      {visible < items.length ? (
        <div ref={sentinelRef} aria-hidden className={cn('h-px w-full', sentinelClassName)} />
      ) : null}
    </>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  compact = false,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  compact?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>
        <span className={cn('block text-mist-300', compact ? 'text-[0.76rem]' : 'text-[0.82rem]')}>
          {label}
        </span>
        {hint ? <span className="block text-[0.68rem] text-mist-600">{hint}</span> : null}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || min)}
        className={cn(
          'rounded-lg border border-mist-100/[0.1] bg-ink-950/50 px-2 py-1.5 text-center font-mono text-mist-200 outline-none focus:border-brass-400/40',
          compact ? 'w-14 text-[0.76rem]' : 'w-16 text-[0.82rem]',
        )}
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const span = Math.max(1, max - min);
  const percent = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[0.74rem] text-mist-400">{label}</span>
        <span className="font-mono text-[0.74rem] text-mist-200">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mind-range mt-1"
        style={
          {
            '--range-low': '0%',
            '--range-high': `${percent}%`,
          } as CSSProperties
        }
        aria-label={label}
      />
    </label>
  );
}

function TextField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[0.72rem] text-mist-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="wizard-input mt-1"
      />
      {hint ? (
        <span className="mt-0.5 block text-[0.64rem] leading-4 text-mist-600">{hint}</span>
      ) : null}
    </label>
  );
}

function TextAreaField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[0.72rem] text-mist-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="wizard-textarea mt-1 min-h-20"
      />
      {hint ? (
        <span className="mt-0.5 block text-[0.64rem] leading-4 text-mist-600">{hint}</span>
      ) : null}
    </label>
  );
}

function stateMoodLabel(state: { moodValence: number; moodArousal: number }): string {
  const base =
    state.moodValence > 30
      ? '愉快'
      : state.moodValence > 10
        ? '轻松'
        : state.moodValence < -30
          ? '低落'
          : state.moodValence < -10
            ? '烦闷'
            : '平静';
  if (state.moodArousal > 70) return `亢奋·${base}`;
  if (state.moodArousal < 30) return `倦怠·${base}`;
  return base;
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <span>
        <span className="block text-[0.82rem] text-mist-300">{label}</span>
        <span className="block text-[0.68rem] text-mist-600">{hint}</span>
      </span>
      <span
        data-active={checked ? 'true' : 'false'}
        className={cn(
          'relative h-5 w-9 rounded-full border transition',
          checked ? 'border-jade-400/40 bg-jade-400/20' : 'border-mist-100/[0.12] bg-ink-950/60',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 size-3 -translate-y-1/2 rounded-full transition-all',
            checked ? 'right-1 bg-jade-300' : 'left-1 bg-mist-600',
          )}
        />
      </span>
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'SUCCEEDED'
      ? 'bg-jade-400'
      : status === 'FAILED'
        ? 'bg-signal-400'
        : status === 'RUNNING'
          ? 'bg-brass-400'
          : 'bg-mist-600';
  return <span className={cn('size-1.5 rounded-full', color)} />;
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[0.68rem] uppercase tracking-[0.12em]',
        status === 'SUCCEEDED'
          ? 'border-jade-400/25 text-jade-300'
          : status === 'FAILED'
            ? 'border-signal-400/25 text-signal-400'
            : 'border-mist-100/[0.1] text-mist-500',
      )}
    >
      <StatusDot status={status} />
      {status}
    </span>
  );
}

function TraceBlock({ title, value }: { title: string; value: unknown }) {
  if (!value) return null;
  return (
    <details className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 px-3 py-2">
      <summary className="cursor-pointer font-mono text-[0.68rem] uppercase tracking-[0.16em] text-mist-500">
        {title}
        <ChevronRight className="ml-1 inline size-3" />
      </summary>
      <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.68rem] leading-4 text-mist-500">
        {formatJson(value)}
      </pre>
    </details>
  );
}

function renderPayload(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value ?? '');
  const record = value as Record<string, unknown>;
  if (typeof record['text'] === 'string') return record['text'];
  if (typeof record['stickerId'] === 'string') return `表情 ${record['stickerId']}`;
  return formatJson(value);
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatStateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return String(value);
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

function stickerUrl(filePath: string): string {
  return `/api/v1/media/stickers/${filePath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}
