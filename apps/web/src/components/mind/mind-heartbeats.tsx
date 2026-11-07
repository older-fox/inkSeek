import type { MindHeartbeatLogRecord } from '@inkseek/shared';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatTime } from './mind-format';
import {
  EmptyState,
  LazyList,
  MindDrawer,
  MindSection,
  TraceBlock,
  renderPayload,
} from './mind-ui';

const LABELS: Record<string, string> = {
  RUN: '模型已运行',
  IDLE: '空闲跳过',
  GATED: '唤醒门控',
  LONG_EVENT: '长时事件中',
  NO_CONVERSATION: '没有会话',
  REPLY_LOCK: '回复回避窗口',
  DISABLED: '心跳关闭',
  FAILED: '运行失败',
};

const TONES: Record<string, string> = {
  RUN: 'border-jade-400/25 text-jade-300',
  IDLE: 'border-mist-100/[0.14] text-mist-400',
  GATED: 'border-brass-400/30 text-brass-300',
  LONG_EVENT: 'border-brass-400/30 text-brass-300',
  NO_CONVERSATION: 'border-mist-100/[0.14] text-mist-400',
  REPLY_LOCK: 'border-brass-400/30 text-brass-300',
  DISABLED: 'border-mist-100/[0.14] text-mist-500',
  FAILED: 'border-signal-400/30 text-signal-400',
};

const ACTION_LABELS: Record<string, string> = {
  MESSAGE: '文字消息',
  STICKER: '表情',
  FACE: 'QQ 表情',
  TYPING: '输入中',
  MEMORY: '记忆',
  TODO: '待办',
};

export function HeartbeatLogView({
  personaId,
  onOpenRun,
}: {
  personaId: string;
  onOpenRun: (runId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const logsQuery = useQuery({
    queryKey: ['mind', 'heartbeats', personaId],
    queryFn: () => api.mindHeartbeats(personaId, 60, 0),
    staleTime: 2_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
  const logs = logsQuery.data ?? [];
  const selected = logs.find((log) => log.id === selectedId) ?? null;

  useEffect(() => {
    setSelectedId('');
  }, [personaId]);

  return (
    <>
      <MindSection
        title={`心跳日志 · ${logs.length}`}
        count={logsQuery.isPending ? '读取中' : '最近 60 次 · 5s 自动刷新'}
      >
        {logsQuery.isPending ? (
          <div className="grid place-items-center py-16">
            <LoaderCircle className="size-5 animate-spin text-brass-300" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState compact text="还没有心跳记录。心跳开启后每次唤醒都会在这里留一条。" />
        ) : (
          <div className="mt-2 space-y-1.5">
            <LazyList
              items={logs}
              step={25}
              renderItem={(log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedId(log.id)}
                  className={cn(
                    'w-full rounded-xl border bg-ink-950/25 px-3 py-2.5 text-left transition hover:border-brass-400/30 hover:bg-brass-400/[0.04]',
                    log.status === 'RUN' ? 'border-jade-400/15' : 'border-mist-100/[0.06]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[0.76rem] text-mist-200">
                      <span
                        className={cn(
                          'shrink-0 rounded-full border px-1.5 py-px font-mono text-[0.6rem]',
                          TONES[log.status] ?? 'border-mist-100/[0.12] text-mist-400',
                        )}
                      >
                        {LABELS[log.status] ?? log.status}
                      </span>
                      <span className="truncate">{log.reason || '没有记录原因'}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[0.64rem] text-mist-600">
                      {formatTime(log.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.62rem] text-mist-600">
                    <span>{log.mode}</span>
                    {log.dueTodos > 0 ? <span>待办 {log.dueTodos}</span> : null}
                    {log.dueIntentions > 0 ? <span>意图 {log.dueIntentions}</span> : null}
                    {log.unconsolidated > 0 ? <span>待整理 {log.unconsolidated}</span> : null}
                    {log.lifeEvent ? <span className="text-brass-300">生活小事</span> : null}
                    {log.curiosity ? <span className="text-brass-300">好奇</span> : null}
                    {log.learning ? <span className="text-brass-300">学习</span> : null}
                    {log.reflection ? <span className="text-brass-300">反思</span> : null}
                    {log.quiet ? <span>安静时段</span> : null}
                    {log.runId ? <span className="text-jade-300">有运行轨迹</span> : null}
                  </div>
                </button>
              )}
            />
          </div>
        )}
      </MindSection>

      <MindDrawer
        open={Boolean(selected)}
        title="心跳详情"
        subtitle={
          selected
            ? `${LABELS[selected.status] ?? selected.status} · ${formatTime(selected.createdAt)}`
            : undefined
        }
        onClose={() => setSelectedId('')}
        widthClassName="sm:max-w-[48rem]"
      >
        {selected ? <HeartbeatDetail log={selected} onOpenRun={onOpenRun} /> : null}
      </MindDrawer>
    </>
  );
}

function HeartbeatDetail({
  log,
  onOpenRun,
}: {
  log: MindHeartbeatLogRecord;
  onOpenRun: (runId: string) => void;
}) {
  const detail = recordOf(log.detail);
  const plan = recordOf(detail?.['plan']);
  const brief = recordOf(detail?.['brief']);
  const gate = recordOf(detail?.['gate']);
  const outcome = textOf(detail?.['outcome']);
  const toolCalls = listOfRecords(detail?.['toolCalls']);
  const actions = listOfRecords(detail?.['actions']);
  const beats = readBeats(plan);
  const felt = recordOf(plan?.['felt']);
  const engage = plan?.['engage'];
  const memoryWrites = numOf(plan?.['memoryWrites']) ?? 0;
  const relationshipSignals = numOf(plan?.['relationshipSignals']) ?? 0;
  const todoWrites = numOf(plan?.['todos']) ?? 0;
  const intentions = numOf(plan?.['intentions']) ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 font-mono text-[0.66rem]',
            TONES[log.status] ?? 'border-mist-100/[0.12] text-mist-400',
          )}
        >
          {LABELS[log.status] ?? log.status}
        </span>
        <Chip>{log.mode}</Chip>
        {outcome ? <Chip>结果 · {outcome}</Chip> : null}
        {log.quiet ? <Chip>安静时段</Chip> : null}
        {textOf(detail?.['wakeReason']) ? (
          <Chip>唤醒理由 · {textOf(detail?.['wakeReason'])}</Chip>
        ) : null}
        <span className="ml-auto font-mono text-[0.62rem] text-mist-600">
          {formatTime(log.createdAt)}
        </span>
      </div>

      <DetailBlock title="本轮判定" meta="为什么醒 / 做了什么">
        <p className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 p-3 text-[0.8rem] leading-6 text-mist-300">
          {log.reason || '没有记录原因'}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {(
            [
              ['到期待办', log.dueTodos],
              ['到期意图', log.dueIntentions],
              ['待整理记忆', log.unconsolidated],
              ['夜间消息', numOf(brief?.['overnightMessages']) ?? 0],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2 py-1.5"
            >
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-mist-600">
                {label}
              </p>
              <p className="mt-0.5 text-[0.8rem] text-mist-200">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip>{log.lifeEvent ? '触发生活小事' : '没有生活小事'}</Chip>
          <Chip>{log.curiosity ? '触发好奇探索' : '没有好奇探索'}</Chip>
          <Chip>{log.learning ? '触发自主学习' : '没有自主学习'}</Chip>
          <Chip>{log.reflection ? '触发自我反思' : '没有自我反思'}</Chip>
        </div>
      </DetailBlock>

      {gate ? (
        <DetailBlock title="唤醒门控">
          <div className="flex flex-wrap gap-1.5">
            {textOf(gate['reason']) ? <Chip>{textOf(gate['reason'])}</Chip> : null}
            {numOf(gate['nextMinutes']) != null ? (
              <Chip>下次约 {numOf(gate['nextMinutes'])} 分钟后</Chip>
            ) : null}
          </div>
          <TraceBlock title="原始门控" value={gate} />
        </DetailBlock>
      ) : null}

      {plan ? (
        <DetailBlock
          title="Agent 的计划"
          meta={
            beats.length > 0 ? `${beats.length} 条表达` : engage === false ? '保持沉默' : '无表达'
          }
        >
          <p className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 p-3 text-[0.8rem] leading-6 text-mist-300">
            {textOf(plan['reason']) || '没有记录计划理由'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {engage === true ? <Chip>决定主动发言</Chip> : null}
            {engage === false ? <Chip>决定不发言</Chip> : null}
            {textOf(plan['stance']) ? <Chip>姿态 · {textOf(plan['stance'])}</Chip> : null}
            {textOf(felt?.['label']) ? (
              <Chip>
                情绪 · {textOf(felt?.['label'])}
                {numOf(felt?.['intensity']) != null ? ` ${numOf(felt?.['intensity'])}` : ''}
              </Chip>
            ) : null}
            {memoryWrites > 0 ? <Chip>{memoryWrites} 条记忆写入</Chip> : null}
            {relationshipSignals > 0 ? <Chip>{relationshipSignals} 个关系信号</Chip> : null}
            {todoWrites > 0 ? <Chip>{todoWrites} 条新待办</Chip> : null}
            {intentions > 0 ? <Chip>{intentions} 条意图</Chip> : null}
            {textOf(plan['nextWakeAt']) ? (
              <Chip>下次唤醒 · {textOf(plan['nextWakeAt'])}</Chip>
            ) : null}
          </div>
          {beats.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {beats.map((beat, index) => (
                <div
                  key={`${beat.kind}-${index}`}
                  className="rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2.5 py-2"
                >
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-mist-600">
                    {beatLabel(beat.kind)}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[0.8rem] leading-5 text-mist-200">
                    {beat.text ?? beat.stickerId ?? beat.faceId ?? '（空）'}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {plan['dialogue'] ? <TraceBlock title="对话节奏" value={plan['dialogue']} /> : null}
          {plan['longEvent'] ? <TraceBlock title="长时事件" value={plan['longEvent']} /> : null}
          <TraceBlock title="原始计划摘要" value={plan} />
        </DetailBlock>
      ) : null}

      {toolCalls.length > 0 ? (
        <DetailBlock title="工具调用" meta={`${toolCalls.length} 次`}>
          <div className="space-y-1">
            {toolCalls.map((call, index) => (
              <div
                key={`${textOf(call['name'])}-${index}`}
                className="flex flex-wrap items-center gap-x-2 rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2.5 py-1.5 font-mono text-[0.66rem] text-mist-400"
              >
                <span className="text-mist-200">{textOf(call['name']) || '工具'}</span>
                {numOf(call['durationMs']) != null ? (
                  <span>{numOf(call['durationMs'])}ms</span>
                ) : null}
                {textOf(call['error']) ? (
                  <span className="text-signal-400">{textOf(call['error'])}</span>
                ) : null}
              </div>
            ))}
          </div>
        </DetailBlock>
      ) : null}

      {actions.length > 0 ? (
        <DetailBlock title="动作执行" meta={`${actions.length} 个动作`}>
          <div className="space-y-1.5">
            {actions.map((action, index) => (
              <div
                key={`${textOf(action['kind'])}-${index}`}
                className="rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2.5 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[0.66rem]">
                  <span className="text-mist-200">
                    {ACTION_LABELS[textOf(action['kind'])] ?? textOf(action['kind'])} ·{' '}
                    {textOf(action['status'])}
                  </span>
                  {textOf(action['sentMessageId']) ? (
                    <span className="text-jade-300">
                      已发送 · {textOf(action['sentMessageId'])}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[0.74rem] leading-5 text-mist-300">
                  {renderPayload(action['payload'])}
                </p>
                {textOf(action['error']) ? (
                  <p className="mt-1 text-[0.66rem] text-signal-400">{textOf(action['error'])}</p>
                ) : null}
              </div>
            ))}
          </div>
        </DetailBlock>
      ) : null}

      {brief ? (
        <DetailBlock title="唤醒简报" meta="模型看到的上下文">
          {listOfRecords(brief['dueTodos']).map((todo, index) => (
            <p key={`todo-${index}`} className="text-[0.72rem] text-mist-300">
              · 待办：{textOf(todo['title'])}（优先级 {numOf(todo['priority']) ?? '—'}）
            </p>
          ))}
          {listOfRecords(brief['dueIntentions']).map((intent, index) => (
            <p key={`intent-${index}`} className="text-[0.72rem] text-mist-300">
              · 意图：{textOf(intent['reason']) || textOf(intent['need']) || '主动想说'}
            </p>
          ))}
          {textOf(brief['intentionFeedback']) ? (
            <p className="mt-1 text-[0.72rem] text-mist-400">
              {textOf(brief['intentionFeedback'])}
            </p>
          ) : null}
        </DetailBlock>
      ) : null}

      <DetailBlock title="原始记录" meta={log.runId ? '关联运行轨迹' : undefined}>
        <TraceBlock title="detail" value={log.detail} />
        {log.runId ? (
          <button
            type="button"
            onClick={() => onOpenRun(log.runId!)}
            className="mt-2 rounded-lg border border-brass-400/30 px-2.5 py-1 text-[0.72rem] text-brass-200 hover:bg-brass-400/10"
          >
            打开这次运行的轨迹与提示词
          </button>
        ) : null}
      </DetailBlock>
    </div>
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

interface BeatView {
  kind: string;
  text?: string;
  stickerId?: string;
  faceId?: string;
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
    const beat: BeatView = { kind: textOf(record['kind']) || 'text' };
    const text = textOf(record['text']);
    const stickerId = textOf(record['stickerId']);
    const faceId = textOf(record['faceId']);
    if (text) beat.text = text;
    if (stickerId) beat.stickerId = stickerId;
    if (faceId) beat.faceId = faceId;
    return [beat];
  });
}

function beatLabel(kind: string): string {
  if (kind === 'sticker') return '表情';
  if (kind === 'face') return 'QQ 表情';
  return '文字';
}

function listOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = recordOf(item);
        return record ? [record] : [];
      })
    : [];
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
