import type { MindSimulationResult } from '@inkseek/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LoaderCircle, Play } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { DropdownSelect } from '@/components/dropdown-select';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatTime } from './mind-format';
import { EmptyState, MindSection, PromptBlock, TraceBlock, renderPayload } from './mind-ui';

const VERDICT_LABELS: Record<string, string> = {
  continue: '还在继续',
  linger: '可停可续',
  close: '已经收尾',
};

export function MindSimulateTab({ personaId }: { personaId: string }) {
  const [conversationId, setConversationId] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState<MindSimulationResult | null>(null);
  const [error, setError] = useState('');

  const conversationsQuery = useQuery({
    queryKey: ['mind', 'simulation-conversations', personaId],
    queryFn: () => api.mindSimulationConversations(personaId),
    staleTime: 30_000,
  });

  const conversations = conversationsQuery.data ?? [];

  useEffect(() => {
    setResult(null);
    setError('');
    setConversationId('');
  }, [personaId]);

  useEffect(() => {
    if (!conversationId && conversations.length > 0) {
      setConversationId(conversations[0]!.id);
    }
  }, [conversationId, conversations]);

  const run = useMutation({
    mutationFn: () =>
      api.simulateMind({
        personaId,
        conversationId: conversationId || undefined,
        text: text.trim(),
      }),
    onMutate: () => {
      setError('');
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (cause) => {
      setError(cause instanceof ApiError ? cause.message : '试跑失败，请稍后重试');
    },
  });

  const disabled = text.trim().length === 0 || run.isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-jade-400/20 bg-jade-400/[0.05] p-3.5">
        <p className="text-[0.78rem] leading-5 text-jade-100">
          真实环境只读试跑：读取当前人格、状态、关系、记忆和最近聊天，追加一条临时测试消息，让模型真实生成一次回应。
        </p>
        <p className="mt-1 text-[0.7rem] leading-5 text-mist-400">
          不会写运行轨迹、记忆、关系、待办、提示词日志，也不会真的发消息。改完提示词或人格后跑一次，就能对比微调效果。
        </p>
      </div>

      <MindSection title="试跑输入" count={conversationsQuery.isPending ? '读取会话…' : '不写库'}>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-mist-600">
              会话
            </span>
            <div className="min-w-0 flex-1">
              <DropdownSelect
                value={conversationId}
                options={conversations.map((item) => ({
                  value: item.id,
                  label: `${item.name || item.id}${item.lastMessageAt ? ` · ${formatTime(item.lastMessageAt)}` : ''}`,
                }))}
                onChange={setConversationId}
                ariaLabel="选择试跑会话"
                showValue
              />
            </div>
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            placeholder="输入一条测试消息，例如：在吗？今天有点累，陪我聊两句。"
            className="w-full resize-y rounded-xl border border-mist-100/[0.1] bg-ink-950/40 px-3 py-2 text-[0.8rem] leading-6 text-mist-100 outline-none transition placeholder:text-mist-600 focus:border-brass-400/40"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.62rem] text-mist-600">
              {text.trim().length} / 2000
            </span>
            <button
              type="button"
              onClick={() => run.mutate()}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-full border border-brass-400/35 bg-brass-400/10 px-3 py-1.5 text-[0.74rem] text-brass-200 transition hover:bg-brass-400/15 disabled:opacity-50"
            >
              {run.isPending ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              {run.isPending ? '模型正在生成…' : '跑一次试听'}
            </button>
          </div>
          {error ? (
            <p className="rounded-xl border border-signal-400/20 bg-signal-400/[0.05] px-3 py-2 text-[0.74rem] text-signal-400">
              {error}
            </p>
          ) : null}
          {conversations.length === 0 && !conversationsQuery.isPending ? (
            <EmptyState compact text="这个渠道还没有会话，先收到一条真实消息再试跑。" />
          ) : null}
        </div>
      </MindSection>

      {run.isPending ? (
        <div className="grid place-items-center rounded-2xl border border-mist-100/[0.07] bg-ink-950/20 py-16">
          <LoaderCircle className="size-5 animate-spin text-brass-300" />
          <p className="mt-2 text-[0.72rem] text-mist-500">正在调用真实模型，不会写入任何数据。</p>
        </div>
      ) : result ? (
        <SimulationResultView result={result} testText={text.trim()} />
      ) : (
        <EmptyState compact text="还没有试跑结果。输入一条消息，点“跑一次试听”。" />
      )}
    </div>
  );
}

function SimulationResultView({
  result,
  testText,
}: {
  result: MindSimulationResult;
  testText: string;
}) {
  const decision = result.decision;
  const read = decision.read;
  const felt = recordOf(read.felt);
  const conversation = recordOf(result.conversationRead);
  const verdict = textOf(conversation?.['verdict']);
  const plan = recordOf(result.plan);
  const beats = readBeats(plan);
  const engage = plan?.['engage'];
  const memoryWrites = numOf(plan?.['memoryWrites']) ?? 0;
  const relationshipSignals = numOf(plan?.['relationshipSignals']) ?? 0;
  const todoWrites = numOf(plan?.['todos']) ?? 0;
  const extra = [...result.memories.core, ...result.memories.relevant];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>{result.mode}</Chip>
        <Chip>{result.model ?? '未知模型'}</Chip>
        <Chip>{result.latencyMs}ms</Chip>
        <Chip>
          {result.promptTokens} + {result.completionTokens} tokens
        </Chip>
        <Chip>只读</Chip>
        <span className="ml-auto font-mono text-[0.62rem] text-mist-600">
          {result.conversationName}
        </span>
      </div>

      {result.notes.length > 0 ? (
        <ul className="space-y-0.5 rounded-xl border border-brass-400/20 bg-brass-400/[0.05] px-3 py-2 text-[0.7rem] leading-5 text-brass-200">
          {result.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      ) : null}

      <DetailBlock title="判断" meta="社交读 / 对话节奏">
        <p className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 p-3 text-[0.8rem] leading-6 text-mist-300">
          {decision.reason || '没有记录判断理由'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip>{decision.engage ? '决定回应' : '决定保持沉默'}</Chip>
          {read.suggestedStance ? <Chip>社交建议 · {read.suggestedStance}</Chip> : null}
          {textOf(felt?.['label']) ? (
            <Chip>
              感受 · {textOf(felt?.['label'])}
              {numOf(felt?.['intensity']) != null ? ` ${numOf(felt?.['intensity'])}` : ''}
            </Chip>
          ) : null}
          {verdict ? <Chip>对话节奏 · {VERDICT_LABELS[verdict] ?? verdict}</Chip> : null}
          {numOf(conversation?.['score']) != null ? (
            <Chip>收尾分 {numOf(conversation?.['score'])}</Chip>
          ) : null}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {(
            [
              ['注意力', read.attention],
              ['想说话', read.desire],
              ['风险', read.risk],
              ['亏欠', read.obligation],
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
      </DetailBlock>

      <DetailBlock
        title="Agent 的回应"
        meta={
          beats.length > 0 ? `${beats.length} 条表达` : engage === false ? '保持沉默' : '没有表达'
        }
      >
        {plan ? (
          <p className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30 p-3 text-[0.8rem] leading-6 text-mist-300">
            {textOf(plan['reason']) || '没有记录计划理由'}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {textOf(plan?.['stance']) ? <Chip>姿态 · {textOf(plan?.['stance'])}</Chip> : null}
          {textOf(plan?.['shown']) ? <Chip>表现 · {textOf(plan?.['shown'])}</Chip> : null}
          {memoryWrites > 0 ? <Chip>计划写 {memoryWrites} 条记忆（已拦截）</Chip> : null}
          {relationshipSignals > 0 ? (
            <Chip>计划改 {relationshipSignals} 个关系信号（已拦截）</Chip>
          ) : null}
          {todoWrites > 0 ? <Chip>计划建 {todoWrites} 条待办（已拦截）</Chip> : null}
          {textOf(plan?.['nextWakeAt']) ? (
            <Chip>下次唤醒 · {textOf(plan?.['nextWakeAt'])}</Chip>
          ) : null}
        </div>
        {beats.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {engage === false ? (
              <p className="text-[0.7rem] leading-5 text-brass-300">
                计划标记为不发言；真实运行不会发送下面的文本，这里只展示模型生成的草稿。
              </p>
            ) : null}
            {beats.map((beat, index) => (
              <div
                key={`${beat.kind}-${index}`}
                className="rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2.5 py-2"
              >
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-mist-600">
                  {beatLabel(beat.kind)}
                </span>
                <p className="mt-1 whitespace-pre-wrap break-words text-[0.84rem] leading-6 text-mist-100">
                  {beat.text ?? beat.stickerId ?? beat.faceId ?? '（空）'}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {plan ? <TraceBlock title="原始动作计划" value={plan} /> : null}
      </DetailBlock>

      {result.toolCalls.length > 0 ? (
        <DetailBlock title="工具调用" meta={`${result.toolCalls.length} 次`}>
          <div className="space-y-1.5">
            {result.toolCalls.map((call, index) => (
              <details
                key={`${call.name}-${index}`}
                className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30"
              >
                <summary className="cursor-pointer px-2.5 py-2">
                  <span className="font-mono text-[0.72rem] text-mist-200">{call.name}</span>
                  <span className="ml-2 font-mono text-[0.62rem] text-mist-600">
                    {call.durationMs}ms
                  </span>
                  {call.error ? (
                    <span className="ml-2 text-[0.62rem] text-signal-400">失败</span>
                  ) : null}
                </summary>
                <div className="space-y-2 border-t border-mist-100/[0.06] px-2.5 py-2.5">
                  <JsonPanel label="入参" value={call.input} />
                  <JsonPanel label="结果" value={call.output} />
                  {call.error ? (
                    <p className="text-[0.7rem] text-signal-400">{call.error}</p>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </DetailBlock>
      ) : null}

      <DetailBlock title="模型提示词" meta={`${result.prompts.length} 次调用`}>
        {result.prompts.length === 0 ? (
          <p className="text-[0.74rem] text-mist-500">这次试跑没有捕获到提示词。</p>
        ) : (
          <div className="space-y-1.5">
            {result.prompts.map((prompt, index) => (
              <details
                key={index}
                open={index === result.prompts.length - 1}
                className="rounded-xl border border-mist-100/[0.06] bg-ink-950/30"
              >
                <summary className="cursor-pointer px-2.5 py-2">
                  <span className="font-mono text-[0.7rem] text-mist-200">
                    #{index + 1} {prompt.model ?? '未知模型'}
                  </span>
                  <span className="ml-2 font-mono text-[0.62rem] text-mist-600">
                    {prompt.promptTokens} / {prompt.completionTokens} tokens · {prompt.latencyMs}ms
                  </span>
                </summary>
                <div className="space-y-2 border-t border-mist-100/[0.06] px-2.5 py-2.5">
                  <PromptBlock title="System" text={prompt.system || '（无）'} />
                  <PromptBlock title="Prompt" text={prompt.prompt} />
                  <PromptBlock title="Response" text={prompt.response || '（无）'} />
                </div>
              </details>
            ))}
          </div>
        )}
      </DetailBlock>

      <DetailBlock
        title="读取的记忆"
        meta={`底色 ${result.memories.core.length} · 相关 ${result.memories.relevant.length} · 库 ${result.memories.stats.total}`}
      >
        {extra.length === 0 ? (
          <p className="text-[0.74rem] text-mist-500">这次没有读到记忆。</p>
        ) : (
          <div className="space-y-1">
            {result.memories.core.map((memory) => (
              <p
                key={memory.id}
                className="rounded-lg border border-brass-400/15 bg-brass-400/[0.04] px-2.5 py-1.5 text-[0.72rem] leading-5 text-brass-100"
              >
                <span className="font-mono text-[0.58rem] text-brass-300">底色 · </span>
                {memory.content}
              </p>
            ))}
            {result.memories.relevant.map((memory) => (
              <p
                key={memory.id}
                className="rounded-lg border border-mist-100/[0.05] bg-ink-950/25 px-2.5 py-1.5 text-[0.72rem] leading-5 text-mist-300"
              >
                {memory.content}
              </p>
            ))}
          </div>
        )}
      </DetailBlock>

      <DetailBlock
        title="进入心智的对话"
        meta={`${result.scene.messages.length} 条（含临时测试消息）`}
      >
        <div className="space-y-1">
          {result.scene.messages.map((message) => {
            const isTest = !message.isSelf && message.text === testText;
            return (
              <div
                key={`${message.id}-${message.sentAt}`}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5',
                  isTest
                    ? 'border-brass-400/30 bg-brass-400/[0.06]'
                    : 'border-mist-100/[0.05] bg-ink-950/20',
                )}
              >
                <div className="flex items-center justify-between gap-2 font-mono text-[0.6rem] text-mist-600">
                  <span>
                    {message.sender || '未知'}
                    {message.isSelf ? ' · 我' : ''}
                    {isTest ? ' · 临时测试消息' : ''}
                  </span>
                  <span>{formatTime(message.sentAt)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[0.76rem] leading-5 text-mist-300">
                  {message.text ||
                    (message.imageCount ? `［图片 ×${message.imageCount}］` : '（没有文字内容）')}
                </p>
                {(message.images ?? []).map((image, index) => (
                  <p
                    key={index}
                    className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2 py-1 text-[0.68rem] leading-5 text-mist-500"
                  >
                    <span className="font-mono text-mist-600">［图片］</span>
                    {image}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </DetailBlock>

      <DetailBlock title="运行状态" meta="真实环境快照">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {Object.entries(result.state).map(([key, value]) => (
            <div
              key={key}
              className="rounded-lg border border-mist-100/[0.06] bg-ink-950/30 px-2 py-1.5"
            >
              <p className="truncate font-mono text-[0.56rem] uppercase tracking-[0.12em] text-mist-600">
                {key}
              </p>
              <p className="mt-0.5 truncate text-[0.74rem] text-mist-300">
                {value === null || value === undefined ? '—' : String(value)}
              </p>
            </div>
          ))}
        </div>
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

function JsonPanel({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-mist-600">{label}</p>
      <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-mist-100/[0.06] bg-ink-950/40 p-2.5 font-mono text-[0.66rem] leading-4 text-mist-400">
        {value === null || value === undefined ? '—' : renderPayload(value)}
      </pre>
    </div>
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
