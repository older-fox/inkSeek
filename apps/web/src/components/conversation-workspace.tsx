import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ImagePlus,
  Layers,
  ListFilter,
  MessagesSquare,
  Plus,
  Search,
  Send,
  Waypoints,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { InputShell } from '@/components/field';
import { ChannelAvatar, PlatformChip, SyncPill } from '@/components/connection-bits';
import { cn } from '@/lib/cn';
import {
  PLATFORMS,
  conversationSources,
  conversationsFor,
  useChannels,
  type ChatMessage,
  type Conversation,
  type ConversationKind,
  type ConversationSourceSummary,
} from '@/lib/connections';

const EASE = [0.22, 1, 0.36, 1] as const;
const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function MessageBubble({
  message,
  kind,
  selfInitial,
}: {
  message: ChatMessage;
  kind: ConversationKind;
  selfInitial: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE }}
      className={cn('flex items-end gap-2', message.self ? 'justify-end' : 'justify-start')}
    >
      {!message.self && (
        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-jade-400/20 bg-jade-400/10 font-display text-[0.58rem] text-jade-300">
          {message.author.slice(0, 1)}
        </span>
      )}

      <div className={cn('max-w-[78%]', message.self && 'flex flex-col items-end')}>
        {!message.self && kind === 'group' && (
          <p className="mb-1 pl-1 text-[0.56rem] text-mist-600">{message.author}</p>
        )}
        {message.text && (
          <div
            className={cn(
              'rounded-2xl px-3.5 py-2 text-left text-[0.76rem] leading-6',
              message.self
                ? 'rounded-br-md border border-brass-400/20 bg-brass-400/[0.12] text-mist-100'
                : 'rounded-bl-md border border-mist-100/[0.07] bg-ink-950/35 text-mist-200',
            )}
          >
            {message.text}
          </div>
        )}
        {message.images && message.images.length > 0 && (
          <div
            className={cn(
              'flex flex-wrap gap-1.5',
              message.self ? 'justify-end' : 'justify-start',
              message.text && 'mt-1.5',
            )}
          >
            {message.images.map((source, index) => (
              <img
                key={`${message.id}-image-${index}`}
                src={source}
                alt={`图片 ${index + 1}`}
                loading="lazy"
                className="max-h-64 max-w-[16rem] rounded-xl border border-mist-100/10 object-cover"
              />
            ))}
          </div>
        )}
        <p className="mt-1 px-1 font-mono text-[0.48rem] text-mist-600">{message.time}</p>
      </div>

      {message.self && (
        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-brass-400/20 bg-brass-400/10 font-display text-[0.58rem] text-brass-300">
          {selfInitial}
        </span>
      )}
    </motion.div>
  );
}

function ConversationRow({
  conversation,
  active,
  kind,
  onSelect,
}: {
  conversation: Conversation;
  active: boolean;
  kind: ConversationKind;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition',
        active ? 'bg-brass-400/[0.09]' : 'hover:bg-mist-100/[0.04]',
      )}
    >
      <ChannelAvatar initials={conversation.initials} accent={conversation.accent} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              'truncate text-[0.78rem] font-medium',
              active ? 'text-brass-200' : 'text-mist-200',
            )}
          >
            {conversation.name}
          </span>
          <span className="shrink-0 font-mono text-[0.5rem] text-mist-600">
            {conversation.lastTime}
          </span>
        </span>

        <span className="mt-1 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-mist-600">
            <span
              className={cn(
                'size-1 rounded-full',
                PLATFORMS[conversation.platform].accent === 'jade'
                  ? 'bg-jade-400/80'
                  : 'bg-brass-400/80',
              )}
            />
            {PLATFORMS[conversation.platform].name}
          </span>
          {kind === 'group' && conversation.members !== undefined && (
            <span className="font-mono text-[0.5rem] text-mist-600">{conversation.members} 人</span>
          )}
          {conversation.unread > 0 && (
            <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-brass-400/20 px-1 font-mono text-[0.48rem] text-brass-300">
              {conversation.unread}
            </span>
          )}
        </span>

        <span className="mt-1 block truncate text-[0.64rem] leading-5 text-mist-600">
          {conversation.lastMessage}
        </span>
      </span>
    </button>
  );
}

function SourceFilter({
  sources,
  value,
  total,
  onChange,
}: {
  sources: readonly ConversationSourceSummary[];
  value: string | null;
  total: number;
  onChange: (sourceId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = sources.find((source) => source.id === value) ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const select = (sourceId: string | null) => {
    onChange(sourceId);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={active ? `当前来源：${active.displayName}` : '筛选消息来源'}
        title="筛选消息来源"
        onClick={() => setOpen((previous) => !previous)}
        className={cn(
          'inline-flex h-7 max-w-[10.5rem] items-center gap-1.5 rounded-full border px-2.5 text-[0.62rem] transition',
          open || active
            ? 'border-brass-400/35 bg-brass-400/[0.09] text-brass-200'
            : 'border-mist-100/[0.08] bg-ink-950/25 text-mist-400 hover:border-brass-400/25 hover:text-brass-200',
        )}
      >
        <ListFilter className="size-3.5 shrink-0" strokeWidth={1.8} />
        <span className="truncate">{active ? active.displayName : '全部来源'}</span>
        <ChevronDown
          className={cn('size-3 shrink-0 transition-transform duration-200', open && 'rotate-180')}
          strokeWidth={2}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label="消息来源"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="glass-panel absolute right-0 top-[calc(100%+0.45rem)] z-40 w-[14.5rem] origin-top-right rounded-2xl p-1.5 shadow-[0_28px_60px_-32px_rgba(0,0,0,0.85)]"
          >
            <p className="px-2 pb-1 pt-1.5 font-mono text-[0.48rem] uppercase tracking-[0.22em] text-mist-600">
              Message Source
            </p>

            <button
              type="button"
              role="option"
              aria-selected={!active}
              onClick={() => select(null)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition',
                !active ? 'bg-mist-100/[0.07]' : 'hover:bg-mist-100/[0.04]',
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-mist-100/10 bg-ink-950/40 text-mist-400">
                <Layers className="size-3.5" strokeWidth={1.7} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.72rem] text-mist-200">全部来源</span>
                <span className="mt-0.5 block truncate font-mono text-[0.5rem] tracking-[0.08em] text-mist-600">
                  {sources.length} 个账号汇总
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-mist-100/[0.06] bg-ink-950/40 px-1.5 py-0.5 font-mono text-[0.5rem] text-mist-500">
                {total}
              </span>
              {!active && <Check className="size-3.5 shrink-0 text-brass-300" strokeWidth={2.2} />}
            </button>

            {sources.map((source) => {
              const selected = source.id === value;

              return (
                <button
                  key={source.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => select(source.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition',
                    selected ? 'bg-mist-100/[0.07]' : 'hover:bg-mist-100/[0.04]',
                  )}
                >
                  <ChannelAvatar
                    initials={source.initials}
                    accent={source.accent}
                    size="sm"
                    className="size-7 rounded-lg text-[0.62rem]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.72rem] text-mist-200">
                      {source.displayName}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[0.5rem] tracking-[0.08em] text-mist-600">
                      {PLATFORMS[source.platform].name} {source.accountId}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-mist-100/[0.06] bg-ink-950/40 px-1.5 py-0.5 font-mono text-[0.5rem] text-mist-500">
                    {source.count}
                  </span>
                  {selected && (
                    <Check className="size-3.5 shrink-0 text-brass-300" strokeWidth={2.2} />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChannelRequired({ kind }: { kind: ConversationKind }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="glass-panel relative overflow-hidden rounded-[1.6rem] p-8 sm:p-10"
    >
      <div
        className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full opacity-70 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--orb-jade), transparent 68%)' }}
      />
      <div className="absolute inset-x-7 top-0 h-px hairline" />

      <div className="relative mx-auto max-w-xl text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-jade-400/25 bg-jade-400/10 text-jade-300">
          <Waypoints className="size-5" strokeWidth={1.6} />
        </span>
        <h2 className="mt-5 font-display text-[1.45rem] font-semibold tracking-tight text-mist-100">
          {kind === 'private' ? '还没有可查看的私聊' : '还没有可查看的群聊'}
        </h2>
        <p className="mt-3 text-[0.82rem] leading-7 text-mist-500">
          接入消息渠道后，来自各平台的{kind === 'private' ? '私聊' : '群聊'}
          会自动汇入这里，并按平台归档对话记录。
        </p>
        <Link
          to="/connections"
          className="mt-6 inline-flex h-11 items-center gap-1.5 rounded-xl bg-gradient-to-r from-brass-soft via-brass-mid to-brass-deep px-5 font-display text-sm font-semibold text-on-brass shadow-[0_18px_38px_-18px_rgba(230,189,122,0.65)] transition hover:brightness-105"
        >
          <Plus className="size-4" strokeWidth={2.2} />
          前往添加渠道
        </Link>
      </div>
    </motion.div>
  );
}

export function ConversationWorkspace({ kind }: { kind: ConversationKind }) {
  const channels = useChannels();
  const [query, setQuery] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [localMessages, setLocalMessages] = useState<Record<string, ChatMessage[]>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversations = useMemo(() => conversationsFor(channels, kind), [channels, kind]);
  const sources = useMemo(() => conversationSources(channels, kind), [channels, kind]);

  useEffect(() => {
    setSourceId((current) =>
      current && !sources.some((source) => source.id === current) ? null : current,
    );
  }, [sources]);

  const visibleConversations = useMemo(
    () =>
      sourceId
        ? conversations.filter((conversation) => conversation.source.id === sourceId)
        : conversations,
    [conversations, sourceId],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return visibleConversations;
    }

    return visibleConversations.filter((conversation) =>
      [
        conversation.name,
        conversation.handle,
        conversation.lastMessage,
        conversation.messages.at(-1)?.text ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [visibleConversations, query]);

  const activeConversation =
    visibleConversations.find((conversation) => conversation.id === selectedId) ?? null;

  const activeMessages = activeConversation
    ? [...activeConversation.messages, ...(localMessages[activeConversation.id] ?? [])]
    : [];

  const selfChannel =
    channels.find((channel) => channel.id === activeConversation?.source.id) ?? channels[0];
  const selfName = selfChannel?.displayName ?? '我';
  const selfInitial = selfChannel?.initials.slice(0, 1) ?? '我';

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [selectedId, activeMessages.length]);

  useEffect(() => {
    setAttachments([]);
  }, [selectedId]);

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();

    const available = MAX_IMAGE_COUNT - attachments.length;
    if (available <= 0) {
      toast.error(`一次最多附带 ${MAX_IMAGE_COUNT} 张图片`);
      return;
    }

    imageFiles.slice(0, available).forEach((file) => {
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error('单张图片不能超过 8 MB');
        return;
      }

      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          return;
        }
        setAttachments((previous) =>
          previous.length >= MAX_IMAGE_COUNT ? previous : [...previous, result],
        );
      });
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const text = draft.trim();
    if ((!text && attachments.length === 0) || !activeConversation) {
      return;
    }

    const now = new Date();
    const message: ChatMessage = {
      id: `local-${now.getTime()}`,
      self: true,
      author: selfName,
      text,
      time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      images: attachments.length > 0 ? attachments : undefined,
    };

    setLocalMessages((previous) => ({
      ...previous,
      [activeConversation.id]: [...(previous[activeConversation.id] ?? []), message],
    }));
    setDraft('');
    setAttachments([]);
  };

  if (channels.length === 0) {
    return <ChannelRequired kind={kind} />;
  }

  if (conversations.length === 0) {
    return (
      <div className="glass-panel rounded-[1.6rem] p-8 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-mist-100/10 bg-ink-950/30 text-mist-600">
          <MessagesSquare className="size-5" strokeWidth={1.6} />
        </span>
        <h2 className="mt-4 font-display text-[1.3rem] font-semibold text-mist-100">
          {kind === 'private' ? '暂时没有同步到私聊' : '暂时没有同步到群聊'}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[0.76rem] leading-6 text-mist-500">
          已接入的渠道还没有返回该类型的会话。新的消息到达后，会按平台自动出现在这里。
        </p>
        <Link
          to="/connections"
          className="mt-5 inline-flex h-10 items-center rounded-lg border border-brass-400/30 bg-brass-400/[0.08] px-4 text-[0.72rem] text-brass-300 transition hover:bg-brass-400/[0.16]"
        >
          返回渠道管理
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:h-[38rem] lg:grid-cols-[20.5rem_minmax(0,1fr)]">
      <aside
        className={cn(
          'glass-panel flex h-[30rem] min-h-0 flex-col overflow-hidden rounded-[1.4rem] lg:h-full',
          activeConversation && 'hidden lg:flex',
        )}
      >
        <div className="border-b border-mist-100/[0.06] p-3">
          <InputShell
            icon={<Search className="size-4" strokeWidth={1.7} />}
            trailing={
              query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="-mr-1 rounded-md p-1.5 text-mist-600 transition hover:text-mist-200"
                  aria-label="清除搜索"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <span className="shrink-0 whitespace-nowrap font-mono text-[0.5rem] uppercase tracking-[0.14em] text-mist-600">
                  {filtered.length} 会话
                </span>
              )
            }
          >
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={kind === 'private' ? '搜索联系人…' : '搜索群聊…'}
              aria-label={kind === 'private' ? '搜索联系人' : '搜索群聊'}
            />
          </InputShell>
        </div>

        <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-1">
          <span className="font-mono text-[0.5rem] uppercase tracking-[0.16em] text-mist-600">
            {kind === 'private' ? 'Direct Messages' : 'Group Chats'}
          </span>
          <SourceFilter
            sources={sources}
            value={sourceId}
            total={conversations.length}
            onChange={setSourceId}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {filtered.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeConversation?.id}
              kind={kind}
              onSelect={() => setSelectedId(conversation.id)}
            />
          ))}

          {filtered.length === 0 && (
            <div className="px-3 py-10 text-center">
              <p className="text-[0.7rem] leading-6 text-mist-600">
                {query.trim()
                  ? `没有匹配的${kind === 'private' ? '联系人' : '群聊'}。`
                  : `该来源暂时没有${kind === 'private' ? '私聊' : '群聊'}。`}
              </p>
              {sourceId && (
                <button
                  type="button"
                  onClick={() => setSourceId(null)}
                  className="mt-2 rounded-full border border-mist-100/[0.08] px-2.5 py-1 font-mono text-[0.52rem] text-mist-500 transition hover:border-brass-400/30 hover:text-brass-300"
                >
                  查看全部来源
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      <section
        className={cn(
          'glass-panel flex h-[34rem] min-h-0 flex-col overflow-hidden rounded-[1.4rem] lg:h-full',
          !activeConversation && 'hidden lg:flex',
        )}
      >
        {activeConversation ? (
          <>
            <header className="flex items-center gap-3 border-b border-mist-100/[0.06] px-3.5 py-3">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="返回会话列表"
                className="rounded-lg p-1.5 text-mist-500 transition hover:bg-mist-100/5 hover:text-mist-200 lg:hidden"
              >
                <ArrowLeft className="size-4" />
              </button>

              <ChannelAvatar
                initials={activeConversation.initials}
                accent={activeConversation.accent}
                size="sm"
                online
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="truncate font-display text-[0.92rem] font-semibold text-mist-100">
                    {activeConversation.name}
                  </p>
                  {kind === 'group' && activeConversation.members !== undefined && (
                    <span className="font-mono text-[0.52rem] text-mist-600">
                      {activeConversation.members} 人
                    </span>
                  )}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-2">
                  <PlatformChip
                    platform={activeConversation.platform}
                    connector
                    className="px-1.5 py-0"
                  />
                  <span className="font-mono text-[0.55rem] text-mist-600">
                    {activeConversation.handle}
                  </span>
                  {sources.length > 1 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-mist-100/[0.08] bg-ink-950/25 px-1.5 py-0 font-mono text-[0.5rem] tracking-[0.06em] text-mist-500">
                      <span
                        className={cn(
                          'size-1 rounded-full',
                          activeConversation.source.accent === 'jade'
                            ? 'bg-jade-400/80'
                            : 'bg-brass-400/80',
                        )}
                      />
                      来自 {activeConversation.source.displayName}
                    </span>
                  )}
                </p>
              </div>

              <SyncPill label="实时同步" className="hidden sm:inline-flex" />
            </header>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
              <div className="mb-5 text-center">
                <span className="rounded-full border border-mist-100/[0.07] bg-ink-950/30 px-3 py-1 font-mono text-[0.5rem] uppercase tracking-[0.16em] text-mist-600">
                  今天
                </span>
              </div>

              <div className="space-y-4">
                {activeMessages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    kind={kind}
                    selfInitial={selfInitial}
                  />
                ))}
              </div>

              <p className="mt-6 text-center font-mono text-[0.48rem] uppercase tracking-[0.18em] text-mist-600">
                已同步全部历史消息 · 演示数据
              </p>
            </div>

            <div className="border-t border-mist-100/[0.06] px-3.5 py-3">
              <form onSubmit={handleSubmit} className="space-y-2">
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((source, index) => (
                      <div key={`${source.slice(0, 32)}-${index}`} className="relative">
                        <img
                          src={source}
                          alt={`待发送图片 ${index + 1}`}
                          className="size-16 rounded-xl border border-mist-100/10 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((previous) =>
                              previous.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                          aria-label={`移除第 ${index + 1} 张图片`}
                          className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-ink-900 bg-ink-800 text-mist-300 transition hover:bg-signal-400/20 hover:text-signal-400"
                        >
                          <X className="size-3" strokeWidth={2} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onPaste={handlePaste}
                    placeholder={`以 ${selfName} 的身份回复…`}
                    aria-label="消息输入"
                    autoComplete="off"
                    className="wizard-input h-10 text-[0.78rem]"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() && attachments.length === 0}
                    aria-label="发送消息"
                    className="grid size-10 shrink-0 place-items-center rounded-xl border border-brass-400/30 bg-brass-400/10 text-brass-300 transition hover:bg-brass-400/[0.18] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send className="size-4" strokeWidth={1.8} />
                  </button>
                </div>
              </form>
              <p className="mt-2 flex items-center justify-center gap-1 font-mono text-[0.48rem] uppercase tracking-[0.14em] text-mist-600">
                <ImagePlus className="size-3" strokeWidth={1.8} />
                支持粘贴图片 · 仅前端演示，消息不会真正发送
              </p>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-mist-100/10 bg-ink-950/30 text-mist-600">
                <MessagesSquare className="size-5" strokeWidth={1.6} />
              </span>
              <p className="mt-3 text-[0.8rem] text-mist-400">
                选择左侧的{kind === 'private' ? '联系人' : '群聊'}
              </p>
              <p className="mt-1 text-[0.64rem] text-mist-600">对话记录会显示在这里。</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
