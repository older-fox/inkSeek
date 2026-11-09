import type { ChatMessagePart, ChatMessageSummary } from '@inkseek/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  ArrowUp,
  LoaderCircle,
  MessagesSquare,
  Radio,
  Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { DropdownSelect } from '@/components/dropdown-select';
import { MODES } from '@/components/mind/mind-format';
import { EmptyState } from '@/components/mind/mind-ui';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useChatEvents } from '@/lib/chat-events';
import { chatChannelsQuery, chatConversationsQuery, chatMessagesQuery } from '@/lib/queries';

const EASE = [0.22, 1, 0.36, 1] as const;
const OWNER_IDENTITY = '__owner__';

type ModeView = 'OFF' | 'SHADOW' | 'APPROVAL' | 'LIVE';

/** Direct line to a persona: pick persona and speaking identity, then chat without QQ delivery. */
export function DirectChatPage() {
  const search = useSearch({ strict: false }) as {
    channelId?: string;
    identityId?: string;
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useChatEvents();

  const channelsQuery = useQuery(chatChannelsQuery);
  const channels = channelsQuery.data ?? [];
  const [channelId, setChannelId] = useState(search.channelId ?? '');
  const [identityId, setIdentityId] = useState(search.identityId ?? '');
  const [draft, setDraft] = useState('');
  const [awaitingSince, setAwaitingSince] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  /** Refocuses the composer without scrolling and parks the caret at the end, keeping typing flow after a send. */
  const focusComposer = () => {
    const el = composerRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    el.setSelectionRange(end, end);
  };

  const channel = channels.find((item) => item.id === channelId) ?? null;
  const persona = channel?.persona ?? null;

  const privateQuery = useQuery({
    ...chatConversationsQuery('PRIVATE'),
    enabled: channels.length > 0,
  });
  const identities = useMemo(
    () => (privateQuery.data ?? []).filter((item) => item.channelId === channelId),
    [privateQuery.data, channelId],
  );

  const settingsQuery = useQuery({
    queryKey: ['mind', 'settings', channelId],
    queryFn: () => api.mindSettings(channelId),
    enabled: Boolean(channelId),
    staleTime: 5_000,
  });
  const mode = (settingsQuery.data?.mode ?? 'OFF') as ModeView;

  const directQuery = useQuery({
    queryKey: ['chat', 'direct', channelId, identityId],
    queryFn: () =>
      api.ensureDirectConversation({
        channelId,
        privateConversationId:
          identityId && identityId !== OWNER_IDENTITY ? identityId : undefined,
      }),
    enabled: Boolean(channelId && persona && identityId),
    retry: false,
    staleTime: 30_000,
  });
  const direct = directQuery.data ?? null;

  const messagesQuery = useQuery({
    ...chatMessagesQuery(direct?.id ?? ''),
    enabled: Boolean(direct?.id),
    refetchInterval: awaitingSince ? 2500 : false,
  });
  const messages = messagesQuery.data?.messages ?? [];

  const send = useMutation({
    mutationFn: (text: string) => api.sendDirectMessage(direct!.id, { text }),
    onSuccess: (_sent, text) => {
      setDraft((current) => (current.trim() === text ? '' : current));
      focusComposer();
      if (mode === 'LIVE') {
        setAwaitingSince(Date.now());
      }
      if (direct) {
        void queryClient.invalidateQueries({ queryKey: ['chat', 'messages', direct.id] });
        void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      }
    },
    onError: (error) => {
      focusComposer();
      toast.error(error instanceof ApiError ? error.message : '消息没有发出去');
    },
  });

  useEffect(() => {
    if (channelId) return;
    const first = channels.find((item) => item.persona);
    if (first) setChannelId(first.id);
  }, [channelId, channels]);

  useEffect(() => {
    if (!channelId || privateQuery.isPending) return;
    if (identityId === OWNER_IDENTITY) return;
    if (identities.some((item) => item.id === identityId)) return;
    setIdentityId(identities[0]?.id ?? OWNER_IDENTITY);
  }, [channelId, identityId, identities, privateQuery.isPending]);

  const lastMessageId = messages.at(-1)?.id ?? null;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [lastMessageId, awaitingSince]);

  useEffect(() => {
    if (awaitingSince === null) return;
    const replied = messages.some(
      (message) => message.self && Date.parse(message.sentAt) >= awaitingSince,
    );
    if (replied) {
      setAwaitingSince(null);
    }
  }, [awaitingSince, messages]);

  useEffect(() => {
    if (awaitingSince === null) return;
    const timer = window.setTimeout(() => setAwaitingSince(null), 90_000);
    return () => window.clearTimeout(timer);
  }, [awaitingSince]);

  useEffect(() => {
    if (!direct?.id) return;
    setAwaitingSince(null);
  }, [direct?.id]);

  /** Resets the identity and the awaiting-reply timer (they belong to the old channel) and mirrors the choice into the URL. */
  const selectChannel = (value: string) => {
    setChannelId(value);
    setIdentityId('');
    setAwaitingSince(null);
    void navigate({ to: '/direct', search: { channelId: value }, replace: true });
  };
  /** Drops the pending-reply state before switching personas and writes the identity into the URL search. */
  const selectIdentity = (value: string) => {
    setIdentityId(value);
    setAwaitingSince(null);
    void navigate({
      to: '/direct',
      search: { channelId, identityId: value },
      replace: true,
    });
  };

  /** Guards empty drafts, a missing direct conversation and in-flight sends so no duplicate message can go out. */
  const submit = () => {
    const text = draft.trim();
    if (!text || !direct || send.isPending) return;
    send.mutate(text);
  };
  /** Sends a suggestion-chip text as-is; same pending guard as submit, then returns focus to the composer. */
  const sendText = (text: string) => {
    if (!direct || send.isPending) return;
    send.mutate(text);
    focusComposer();
  };
  /** Enter sends and Shift+Enter inserts a break; IME composition Enter is ignored so CJK input is not cut off. */
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const channelOptions = channels
    .filter((item) => item.persona)
    .map((item) => ({
      value: item.id,
      label: `${item.persona?.name ?? '未命名'} · ${item.displayName}`,
    }));
  const identityOptions =
    identities.length > 0
      ? identities.map((item) => ({
          value: item.id,
          label: item.name,
        }))
      : [{ value: OWNER_IDENTITY, label: '主人（新身份）' }];
  const identity = identities.find((item) => item.id === identityId) ?? null;
  const identityName =
    identity?.name ?? (identityId === OWNER_IDENTITY ? '主人' : direct?.name ?? '我');
  const personaName = persona?.name ?? '人格';
  const modeLabel = MODES.find((item) => item.value === mode)?.label ?? mode;
  const waiting = awaitingSince !== null && mode === 'LIVE';

  return (
    <div className="relative mx-auto flex w-full max-w-7xl flex-col px-5 pb-5 pt-6 sm:px-8 lg:h-[calc(100dvh-4rem)] lg:pb-6">
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="flex shrink-0 flex-wrap items-end justify-between gap-5"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-brass-400/75">
              Direct Line
            </span>
            <span className="h-px w-12 bg-brass-400/25" />
          </div>
          <h1 className="mt-3 flex items-center gap-3 font-display text-[clamp(1.8rem,3vw,2.7rem)] font-semibold tracking-[-0.03em] text-mist-100">
            <MessagesSquare className="size-7 text-brass-300" strokeWidth={1.4} />
            直接对话
          </h1>
          <p className="mt-2 max-w-2xl text-[0.86rem] leading-6 text-mist-500">
            绕过 QQ，直接和人格说话。消息、运行轨迹、记忆、关系和待办都会真实写入，
            只是投递不走 NapCat；TA 的回复也只出现在这条直连线上。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-jade-400/20 bg-jade-400/[0.06] px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-jade-300">
            生产对话
          </span>
          <span className="rounded-full border border-brass-400/20 bg-brass-400/[0.06] px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-brass-200">
            绕过 QQ
          </span>
        </div>
      </motion.header>

      {channelsQuery.isPending ? (
        <div className="mt-10 grid place-items-center rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 py-20">
          <LoaderCircle className="size-6 animate-spin text-brass-300" />
        </div>
      ) : channels.length === 0 ? (
        <EmptyState text="还没有渠道。先在互联中心接入一个 QQ 渠道并绑定人格。" />
      ) : channelOptions.length === 0 ? (
        <EmptyState text="还没有绑定人格的渠道。先在渠道设置里选择一张角色卡。" />
      ) : (
        <div className="mt-5 grid min-h-0 flex-1 gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
            className="mind-scroll space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1"
          >
            <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-4">
              <p className="font-mono text-[0.64rem] uppercase tracking-[0.2em] text-mist-600">
                直连对象
              </p>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="text-[0.7rem] text-mist-500">人格</span>
                  <div className="mt-1.5">
                    <DropdownSelect
                      value={channelId}
                      options={channelOptions}
                      onChange={selectChannel}
                      ariaLabel="选择人格"
                      placeholder="选择人格"
                      showValue={false}
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="text-[0.7rem] text-mist-500">以谁的身份说话</span>
                  <div className="mt-1.5">
                    <DropdownSelect
                      value={identityId}
                      options={identityOptions}
                      onChange={selectIdentity}
                      ariaLabel="选择说话身份"
                      placeholder="选择身份"
                      showValue={false}
                    />
                  </div>
                  <span className="mt-1 block text-[0.64rem] leading-4 text-mist-600">
                    选择一段真实私聊，就沿用那个人的关系与记忆；没有私聊时使用「主人」。
                  </span>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.2em] text-mist-600">
                  心智状态
                </p>
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 font-mono text-[0.6rem]',
                    mode === 'LIVE'
                      ? 'border-jade-400/25 text-jade-300'
                      : mode === 'OFF'
                        ? 'border-signal-400/25 text-signal-400'
                        : 'border-brass-400/25 text-brass-200',
                  )}
                >
                  {modeLabel}
                </span>
              </div>
              <p className="mt-3 text-[0.72rem] leading-5 text-mist-500">{modeHint(mode)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  to="/mind"
                  search={{ channelId, tab: 'runs' }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-mist-100/[0.1] px-2.5 text-[0.66rem] text-mist-500 transition hover:border-brass-400/30 hover:text-brass-200"
                >
                  看运行轨迹
                </Link>
                <Link
                  to="/mind"
                  search={{ channelId, tab: 'changes' }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-mist-100/[0.1] px-2.5 text-[0.66rem] text-mist-500 transition hover:border-brass-400/30 hover:text-brass-200"
                >
                  看变动
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-4">
              <p className="font-mono text-[0.64rem] uppercase tracking-[0.2em] text-mist-600">
                这条线
              </p>
              <ul className="mt-3 space-y-2 text-[0.72rem] leading-5 text-mist-500">
                <li>· 消息写入独立会话，不会出现在 QQ 私聊里。</li>
                <li>· 人格照常思考、用工具、写记忆与关系。</li>
                <li>· 回复只落在这条直连线，不会再发给 QQ。</li>
              </ul>
            </section>
          </motion.aside>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
            className="flex h-[calc(100dvh-16rem)] min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 lg:h-full lg:min-h-0"
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-mist-100/[0.07] px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-jade-400/30 to-brass-400/20 font-display text-[0.74rem] font-semibold text-jade-200">
                  {Array.from(personaName)[0] ?? '人'}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[0.82rem] font-medium text-mist-200">
                    {personaName}
                  </p>
                  <p className="truncate font-mono text-[0.6rem] text-mist-600">
                    {identityName} · 直连线
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-mist-100/[0.1] px-2.5 py-1 font-mono text-[0.6rem] text-mist-500">
                  <Radio className="size-3 text-jade-300" />
                  不经过 QQ
                </span>
              </div>
            </header>

            <div
              ref={scrollRef}
              className="mind-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5"
            >
              {directQuery.isPending || (direct && messagesQuery.isPending) ? (
                <div className="grid h-full min-h-[16rem] place-items-center">
                  <LoaderCircle className="size-5 animate-spin text-brass-300" />
                </div>
              ) : directQuery.isError ? (
                <div className="grid h-full min-h-[16rem] place-items-center">
                  <div className="max-w-md text-center">
                    <p className="text-[0.78rem] leading-6 text-signal-400">
                      {directQuery.error instanceof ApiError
                        ? directQuery.error.message
                        : '直连会话没有打开'}
                    </p>
                    <button
                      type="button"
                      onClick={() => void directQuery.refetch()}
                      className="mt-3 rounded-full border border-mist-100/[0.1] px-3 py-1.5 text-[0.7rem] text-mist-400 transition hover:border-brass-400/30 hover:text-brass-200"
                    >
                      重试
                    </button>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="grid h-full min-h-[16rem] place-items-center">
                  <div className="max-w-md text-center">
                    <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-brass-400/20 bg-brass-400/[0.07]">
                      <Sparkles className="size-6 text-brass-300" strokeWidth={1.4} />
                    </span>
                    <h2 className="mt-4 font-display text-lg font-semibold text-mist-100">
                      直接和 {personaName} 说第一句
                    </h2>
                    <p className="mt-2 text-[0.78rem] leading-6 text-mist-500">
                      这条线是生产会话。TA 会按 {identityName} 的关系和记忆思考，
                      回复只留在这里。
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {['在吗', '今天过得怎么样', '我刚忙完，过来看看你'].map((text) => (
                        <button
                          key={text}
                          type="button"
                          onClick={() => sendText(text)}
                          disabled={!direct || send.isPending}
                          className="rounded-full border border-mist-100/[0.1] px-3 py-1.5 text-[0.72rem] text-mist-400 transition hover:border-brass-400/30 hover:text-brass-200 disabled:opacity-40"
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <DirectMessage
                    key={message.id}
                    message={message}
                    personaName={personaName}
                    identityName={identityName}
                  />
                ))
              )}
              {waiting ? (
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-jade-400/30 to-brass-400/20 font-display text-[0.68rem] text-jade-200">
                    {Array.from(personaName)[0] ?? '人'}
                  </span>
                  <div className="rounded-2xl rounded-tl-md border border-mist-100/[0.08] bg-ink-950/45 px-4 py-3">
                    <span className="flex items-center gap-2 text-[0.72rem] text-mist-500">
                      <LoaderCircle className="size-3.5 animate-spin text-brass-300" />
                      {personaName} 正在想
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <footer className="border-t border-mist-100/[0.07] bg-ink-950/30 px-4 py-3 sm:px-5">
              {mode !== 'LIVE' ? (
                <p className="mb-2 text-[0.68rem] leading-5 text-brass-200/80">{modeHint(mode)}</p>
              ) : null}
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <textarea
                    ref={composerRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    rows={2}
                    maxLength={4000}
                    placeholder={`以${identityName}的身份对 ${personaName} 说点什么…`}
                    disabled={!direct || directQuery.isError}
                    className="wizard-textarea min-h-[3.4rem] resize-none text-[0.86rem] leading-6 disabled:opacity-50"
                  />
                  <p className="mt-1 font-mono text-[0.58rem] text-mist-600">
                    Enter 发送 · Shift + Enter 换行 · 真实运行，不经过 QQ
                  </p>
                </div>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!draft.trim() || !direct || send.isPending}
                  className="grid size-11 shrink-0 place-items-center rounded-xl border border-brass-400/30 bg-brass-400/15 text-brass-200 transition hover:bg-brass-400/25 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="发送"
                  title="发送"
                >
                  {send.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <ArrowUp className="size-4" strokeWidth={2} />
                  )}
                </button>
              </div>
            </footer>
          </motion.section>
        </div>
      )}
    </div>
  );
}

/** One bubble on the direct line, aligned by sender and rendering text, image or voice parts. */
function DirectMessage({
  message,
  personaName,
  identityName,
}: {
  message: ChatMessageSummary;
  personaName: string;
  identityName: string;
}) {
  const mine = !message.self;
  return (
    <div className={cn('flex items-start gap-3', mine ? 'justify-end' : 'justify-start')}>
      {!mine ? (
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-jade-400/30 to-brass-400/20 font-display text-[0.68rem] text-jade-200">
          {Array.from(personaName)[0] ?? '人'}
        </span>
      ) : null}
      <div className={cn('min-w-0 max-w-[86%] sm:max-w-[76%]', mine && 'text-right')}>
        <p className="mb-1 font-mono text-[0.58rem] text-mist-600">
          {mine ? identityName : personaName} · {formatTime(message.sentAt)}
        </p>
        <div
          className={cn(
            'inline-block max-w-full space-y-2 rounded-2xl border px-4 py-2.5 text-left text-[0.86rem] leading-6 text-mist-100',
            mine
              ? 'rounded-br-md border-brass-400/20 bg-brass-400/[0.08]'
              : 'rounded-tl-md border-jade-400/20 bg-jade-400/[0.07]',
          )}
        >
          {message.parts.length > 0 ? (
            message.parts.map((part, index) => (
              <MessagePart key={index} part={part} />
            ))
          ) : (
            <span className="whitespace-pre-wrap">{message.text || '（空消息）'}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Renders a single message part; unknown record types collapse to a forward marker. */
function MessagePart({ part }: { part: ChatMessagePart }) {
  if (part.type === 'text') {
    return <span className="block whitespace-pre-wrap">{part.text}</span>;
  }
  if (part.type === 'image') {
    return (
      <img
        src={part.image.url}
        alt="图片"
        loading="eager"
        className="max-h-64 max-w-[14rem] rounded-xl border border-mist-100/[0.08] object-contain"
      />
    );
  }
  if (part.type === 'voice') {
    return (
      <span className="block text-[0.76rem] text-mist-400">
        语音 {part.voice.duration ? `${Math.round(part.voice.duration)} 秒` : ''}
        {part.voice.description ? ` · ${part.voice.description}` : ''}
      </span>
    );
  }
  return <span className="block text-[0.76rem] text-mist-400">[聊天记录]</span>;
}

/** Explains what the current mind mode does with a message on this line. */
function modeHint(mode: ModeView): string {
  switch (mode) {
    case 'LIVE':
      return '直发模式：TA 会直接回到这条直连线。';
    case 'SHADOW':
      return '影子模式：会记录运行与判断，但回复不会出现在这里。';
    case 'APPROVAL':
      return '审批模式：TA 的回复会进入待审，在人格心智里批准后才会出现在这里。';
    default:
      return '心智关闭：消息会保存，但不会触发回复。';
  }
}

/** Clock time for a message stamp, blank when the timestamp is invalid. */
function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
}
