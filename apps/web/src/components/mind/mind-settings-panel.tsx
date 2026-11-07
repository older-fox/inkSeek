import type { MindSettingsUpdateInput, PhoneDeviceInfo } from '@inkseek/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DropdownSelect, type DropdownOption } from '@/components/dropdown-select';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { MODES } from './mind-format';
import { EmptyState, NumberField, TextAreaField, ToggleRow } from './mind-ui';

export function MindSettingsPanel({
  channelId,
  personaName,
}: {
  channelId: string;
  personaName: string;
}) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['mind', 'settings', channelId],
    queryFn: () => api.mindSettings(channelId),
    enabled: Boolean(channelId),
    staleTime: 5_000,
  });
  const phoneDevicesQuery = useQuery({
    queryKey: ['mind', 'phone-devices'],
    queryFn: api.mindPhoneDevices,
    staleTime: 0,
  });
  const settings = settingsQuery.data ?? null;
  const [mode, setMode] = useState('OFF');
  const [heartbeat, setHeartbeat] = useState(true);
  const [proactive, setProactive] = useState(false);
  const [maxBeats, setMaxBeats] = useState(3);
  const [messageBudget, setMessageBudget] = useState(30);
  const [proactiveWakeLimit, setProactiveWakeLimit] = useState(0);
  const [proactiveWakeGap, setProactiveWakeGap] = useState(0);
  const [selfSchedule, setSelfSchedule] = useState(true);
  const [wakeInterval, setWakeInterval] = useState(45);
  const [wakeMin, setWakeMin] = useState(10);
  const [wakeMax, setWakeMax] = useState(240);
  const [quietInterval, setQuietInterval] = useState(90);
  const [replyAvoid, setReplyAvoid] = useState(180);
  const [privateBurst, setPrivateBurst] = useState(0);
  const [lifeEventChance, setLifeEventChance] = useState(1);
  const [lifeEventLimit, setLifeEventLimit] = useState(1);
  const [curiosityChance, setCuriosityChance] = useState(15);
  const [curiosityLimit, setCuriosityLimit] = useState(0);
  const [reflectionHours, setReflectionHours] = useState(6);
  const [imagePrompt, setImagePrompt] = useState('');
  const [phoneDevice, setPhoneDevice] = useState('');
  const [phonePlayChance, setPhonePlayChance] = useState(0);
  const [phonePlayLimit, setPhonePlayLimit] = useState(0);
  const appliedSettingsRef = useRef('');

  useEffect(() => {
    if (!settings) return;
    if (appliedSettingsRef.current === settings.updatedAt) return;
    appliedSettingsRef.current = settings.updatedAt;
    setMode(settings.mode);
    setHeartbeat(settings.heartbeatEnabled);
    setProactive(settings.proactiveEnabled);
    setMaxBeats(settings.maxBeats);
    setMessageBudget(settings.dailyMessageBudget);
    setProactiveWakeLimit(settings.proactiveWakeDailyLimit);
    setProactiveWakeGap(settings.proactiveWakeMinGapSeconds);
    setSelfSchedule(settings.selfScheduleEnabled);
    setWakeInterval(settings.wakeIntervalMinutes);
    setWakeMin(settings.wakeMinMinutes);
    setWakeMax(settings.wakeMaxMinutes);
    setQuietInterval(settings.quietIntervalMinutes);
    setReplyAvoid(settings.replyAvoidSeconds);
    setPrivateBurst(settings.privateBurstSeconds);
    setLifeEventChance(settings.lifeEventChancePercent);
    setLifeEventLimit(settings.lifeEventDailyLimit);
    setCuriosityChance(settings.curiosityChancePercent);
    setCuriosityLimit(settings.curiosityDailyLimit);
    setReflectionHours(settings.reflectionIntervalHours);
    setImagePrompt(settings.imageDescriptionPrompt);
    setPhoneDevice(settings.phoneDevice ?? '');
    setPhonePlayChance(settings.phonePlayChancePercent);
    setPhonePlayLimit(settings.phonePlayDailyLimit);
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (input: MindSettingsUpdateInput) => api.updateMindSettings(channelId, input),
    onSuccess: () => {
      toast.success('心智设置已保存');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '保存失败'),
  });

  if (settingsQuery.isPending) {
    return (
      <div className="grid place-items-center py-10">
        <LoaderCircle className="size-5 animate-spin text-brass-300" />
      </div>
    );
  }

  if (!settings) {
    return <EmptyState compact text="暂时无法读取这个渠道的心智设置。" />;
  }

  const dirty =
    settings.mode !== mode ||
    settings.heartbeatEnabled !== heartbeat ||
    settings.proactiveEnabled !== proactive ||
    settings.maxBeats !== maxBeats ||
    settings.dailyMessageBudget !== messageBudget ||
    settings.proactiveWakeDailyLimit !== proactiveWakeLimit ||
    settings.proactiveWakeMinGapSeconds !== proactiveWakeGap ||
    settings.selfScheduleEnabled !== selfSchedule ||
    settings.wakeIntervalMinutes !== wakeInterval ||
    settings.wakeMinMinutes !== wakeMin ||
    settings.wakeMaxMinutes !== wakeMax ||
    settings.quietIntervalMinutes !== quietInterval ||
    settings.replyAvoidSeconds !== replyAvoid ||
    settings.privateBurstSeconds !== privateBurst ||
    settings.lifeEventChancePercent !== lifeEventChance ||
    settings.lifeEventDailyLimit !== lifeEventLimit ||
    settings.curiosityChancePercent !== curiosityChance ||
    settings.curiosityDailyLimit !== curiosityLimit ||
    settings.reflectionIntervalHours !== reflectionHours ||
    settings.imageDescriptionPrompt !== imagePrompt ||
    (settings.phoneDevice ?? '') !== phoneDevice ||
    settings.phonePlayChancePercent !== phonePlayChance ||
    settings.phonePlayDailyLimit !== phonePlayLimit;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-mist-500">
            Runtime
          </p>
          <p className="mt-0.5 text-[0.86rem] text-mist-200">{personaName} 的心智运行模式</p>
        </div>
        <span className="rounded-full border border-jade-400/20 bg-jade-400/10 px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-jade-300">
          {MODES.find((item) => item.value === mode)?.label ?? mode}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
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
            <span className="block text-[0.82rem] text-mist-200">{item.label}</span>
            <span className="mt-0.5 block text-[0.64rem] leading-4 text-mist-600">{item.hint}</span>
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
          label="每日回复额度"
          hint="只统计被动回复；主动消息不计入、不受此限制；0 表示不限制"
          value={messageBudget}
          min={0}
          max={500}
          onChange={setMessageBudget}
        />
        <NumberField
          label="每日自发唤醒上限"
          hint="心跳和自主唤醒每天最多消耗几次模型轮次；0 表示不限制；有到期待办时不受限"
          value={proactiveWakeLimit}
          min={0}
          max={500}
          onChange={setProactiveWakeLimit}
        />
        <NumberField
          label="自发唤醒最小间隔（秒）"
          hint="两次自发唤醒之间至少隔这么久；0 关闭；有到期待办时不受限"
          value={proactiveWakeGap}
          min={0}
          max={86400}
          onChange={setProactiveWakeGap}
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
          hint="仅私聊生效；对方连发好几条时，等这段安静时间后合成一次回复；最长等 12 秒；0 关闭"
          value={privateBurst}
          min={0}
          max={30}
          onChange={setPrivateBurst}
        />
      </div>

      <div className="mt-4 rounded-xl border border-mist-100/[0.06] bg-ink-950/25 p-3">
        <p className="text-[0.8rem] text-mist-300">唤醒节奏（分钟）</p>
        <p className="mt-1 text-[0.64rem] leading-4 text-mist-600">
          只决定没人发消息时 TA 多久自己醒一次；收到新消息会尽快处理。安静时段默认按人格时区
          00:00–07:00。
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
        <p className="text-[0.8rem] text-mist-300">生活小事</p>
        <p className="mt-1 text-[0.64rem] leading-4 text-mist-600">
          只在没有任何待办、意图的空闲心跳里掷骰，命中后由 TA
          自己判断这段时间发生了什么、要不要改数值。 默认很稀疏，避免一天像电视剧一样。
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField
            label="每次心跳概率（%）"
            hint="0 关闭；1% 约两三天一次"
            value={lifeEventChance}
            min={0}
            max={20}
            onChange={setLifeEventChance}
            compact
          />
          <NumberField
            label="每日上限"
            hint="按人格时区计算"
            value={lifeEventLimit}
            min={0}
            max={5}
            onChange={setLifeEventLimit}
            compact
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-mist-100/[0.06] bg-ink-950/25 p-3">
        <p className="text-[0.8rem] text-mist-300">好奇与成长</p>
        <p className="mt-1 text-[0.64rem] leading-4 text-mist-600">
          空闲时才可能自己去网上看看在意的话题，读到的东西会沉淀成世界知识或自我反思；反思到点就做，用来让经历慢慢变成性格变化。
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField
            label="好奇概率（%）"
            hint="0 关闭；只在空闲心跳掷骰"
            value={curiosityChance}
            min={0}
            max={100}
            onChange={setCuriosityChance}
            compact
          />
          <NumberField
            label="每日探索上限"
            hint="0 表示不限制"
            value={curiosityLimit}
            min={0}
            max={500}
            onChange={setCuriosityLimit}
            compact
          />
        </div>
        <div className="mt-2">
          <NumberField
            label="自我反思间隔（小时）"
            hint="0 关闭；默认 6 小时一次"
            value={reflectionHours}
            min={0}
            max={168}
            onChange={setReflectionHours}
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-mist-100/[0.06] bg-ink-950/25 p-3">
        <p className="text-[0.8rem] text-mist-300">手机设备</p>
        <p className="mt-1 text-[0.64rem] leading-4 text-mist-600">
          只支持无线 ADB：已连接或无线调试自动发现的设备都会列出。这里选择的是本渠道可以操作的设备；没选或设备离线时，手机工具会拒绝执行。
        </p>
        <div className="mt-2">
          <DropdownSelect
            value={phoneDevice}
            options={phoneDeviceOptions(phoneDevice, phoneDevicesQuery.data?.devices ?? [])}
            onChange={setPhoneDevice}
            ariaLabel="手机设备"
            placeholder="不使用手机"
            showValue={false}
          />
        </div>
        {phoneDevicesQuery.data && !phoneDevicesQuery.data.adbAvailable && (
          <p className="mt-2 text-[0.64rem] text-signal-400">
            {phoneDevicesQuery.data.error || '没有找到可用的 adb'}
          </p>
        )}
        {phoneDevicesQuery.data?.adbAvailable && phoneDevicesQuery.data.devices.length === 0 && (
          <p className="mt-2 text-[0.64rem] text-mist-600">
            还没有可用的无线设备。先到系统设置 → 手机控制完成连接与配对。
          </p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-mist-100/[0.06] bg-ink-950/25 p-3">
        <p className="text-[0.8rem] text-mist-300">手机消遣</p>
        <p className="mt-1 text-[0.64rem] leading-4 text-mist-600">
          空闲心跳时才可能自己拿起手机，按自己的节奏一步步玩；有人说话会先停下，回完再继续。
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField
            label="每次心跳概率（%）"
            hint="0 关闭；只在空闲心跳掷骰"
            value={phonePlayChance}
            min={0}
            max={100}
            onChange={setPhonePlayChance}
            compact
          />
          <NumberField
            label="每日上限"
            hint="0 表示不限制"
            value={phonePlayLimit}
            min={0}
            max={500}
            onChange={setPhonePlayLimit}
            compact
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-mist-100/[0.06] bg-ink-950/25 p-3">
        <p className="text-[0.8rem] text-mist-300">图片理解</p>
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
            mode: mode as MindSettingsUpdateInput['mode'],
            heartbeatEnabled: heartbeat,
            proactiveEnabled: proactive,
            maxBeats,
            dailyMessageBudget: messageBudget,
            proactiveWakeDailyLimit: proactiveWakeLimit,
            proactiveWakeMinGapSeconds: proactiveWakeGap,
            selfScheduleEnabled: selfSchedule,
            wakeIntervalMinutes: wakeInterval,
            wakeMinMinutes: Math.min(wakeMin, wakeMax),
            wakeMaxMinutes: Math.max(wakeMin, wakeMax),
            quietIntervalMinutes: quietInterval,
            replyAvoidSeconds: replyAvoid,
            privateBurstSeconds: privateBurst,
            lifeEventChancePercent: lifeEventChance,
            lifeEventDailyLimit: lifeEventLimit,
            curiosityChancePercent: curiosityChance,
            curiosityDailyLimit: curiosityLimit,
            reflectionIntervalHours: reflectionHours,
            imageDescriptionPrompt: imagePrompt.trim(),
            phoneDevice: phoneDevice || null,
            phonePlayChancePercent: phonePlayChance,
            phonePlayDailyLimit: phonePlayLimit,
          })
        }
        className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-brass-400/30 bg-brass-400/10 text-[0.78rem] text-brass-200 transition hover:bg-brass-400/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {mutation.isPending ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
        保存心智设置
      </button>
    </div>
  );
}

function phoneDeviceOptions(current: string, devices: PhoneDeviceInfo[]): DropdownOption[] {
  const options: DropdownOption[] = [{ value: '', label: '不使用手机' }];
  for (const device of devices) {
    const state = device.state === 'device' ? '' : `（${device.state}）`;
    options.push({
      value: device.serial,
      label: `${device.model || '安卓设备'} · ${device.serial}${state}`,
    });
  }
  if (current && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: `${current}（离线）` });
  }
  return options;
}
