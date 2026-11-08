import type { ChatMessagePart, ChatQuoteSummary } from '@inkseek/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ImagePlus,
  Layers,
  ListFilter,
  LoaderCircle,
  MessagesSquare,
  Plus,
  Search,
  Send,
  User,
  Users,
  Waypoints,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from 'react';
import { toast } from 'sonner';
import { InputShell } from '@/components/field';
import { ChannelAvatar, PlatformChip, SyncPill } from '@/components/connection-bits';
import { ForwardMessageCard } from '@/components/forward-message';
import { GroupPersonaPanel } from '@/components/group-persona-panel';
import { ImageLightbox } from '@/components/image-lightbox';
import {
  ContactRelationshipPanel,
  type ChatContactBrief,
} from '@/components/mind/contact-relationship-panel';
import { PersonaBriefPanel } from '@/components/mind/persona-brief-panel';
import { PrivatePersonaPanel } from '@/components/private-persona-panel';
import { VoiceBar } from '@/components/voice-bar';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  PLATFORMS,
  conversationSources,
  toChatMessage,
  toSourcedConversation,
  useChannelsState,
  type ChatMessage,
  type ConversationKind,
  type ConversationSourceSummary,
  type SourcedConversation,
} from '@/lib/connections';
import { chatConversationsQuery, chatMessagesQuery } from '@/lib/queries';

const EASE = [0.22, 1, 0.36, 1] as const;
const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
function initialsOf(name: string): string {
  return Array.from(name.trim())[0] ?? '我';
}

type MessagePartGroup =
  { kind: 'bubble'; parts: ChatMessagePart[] } | { kind: 'standalone'; part: ChatMessagePart };

function groupMessageParts(parts: ChatMessagePart[]): MessagePartGroup[] {
  const groups: MessagePartGroup[] = [];

  parts.forEach((part) => {
    if (part.type !== 'text' && part.type !== 'image') {
      groups.push({ kind: 'standalone', part });
      return;
    }

    const last = groups[groups.length - 1];
    if (last?.kind === 'bubble') {
      last.parts.push(part);
    } else {
      groups.push({ kind: 'bubble', parts: [part] });
    }
  });

  return groups;
}

function quotePreviewText(quote: ChatQuoteSummary): string {
  if (quote.status !== 'RESOLVED') {
    return '引用的消息已不可用';
  }

  if (quote.text.trim()) {
    return quote.text;
  }

  switch (quote.kind) {
    case 'IMAGE':
      return '[图片]';
    case 'VOICE':
      return '[语音]';
    case 'FACE':
      return '[表情]';
    case 'FORWARD':
      return '[聊天记录]';
    case 'SYSTEM':
      return '[系统消息]';
    default:
      return '[消息]';
  }
}

function QuoteStrip({ quote, self }: { quote: ChatQuoteSummary; self: boolean }) {
  const resolved = quote.status === 'RESOLVED';
  const content = (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-lg border-l-2 px-2.5 py-1.5 text-left',
        self ? 'border-brass-300/60 bg-ink-950/30' : 'border-jade-300/50 bg-ink-950/35',
      )}
    >
      {resolved && quote.authorName && (
        <span className="truncate text-[0.58rem] font-medium text-mist-300">
          {quote.authorName}
        </span>
      )}
      <span
        className={cn(
          'truncate text-[0.68rem] leading-5',
          resolved ? 'text-mist-400' : 'italic text-mist-500',
        )}
      >
        {quotePreviewText(quote)}
      </span>
    </div>
  );

  if (!quote.messageId) {
    return content;
  }

  return (
    <button
      type="button"
      title="跳转到引用消息"
      onClick={() => {
        const target = document.querySelector<HTMLElement>(
          `[data-message-id="${quote.messageId}"]`,
        );
        if (!target) {
          return;
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.animate(
          [{ backgroundColor: 'rgba(212, 175, 55, 0.16)' }, { backgroundColor: 'transparent' }],
          { duration: 1200, easing: 'ease-out' },
        );
      }}
      className="block max-w-full cursor-pointer text-left"
    >
      {content}
    </button>
  );
}

function MessageBubble({
  message,
  kind,
  selfAvatar,
  selfInitial,
  onAuthorClick,
  onSelfClick,
}: {
  message: ChatMessage;
  kind: ConversationKind;
  selfAvatar: string | null;
  selfInitial: string;
  onAuthorClick?: () => void;
  onSelfClick?: () => void;
}) {
  const avatarAccent = message.self ? 'brass' : kind === 'group' ? 'jade' : 'brass';
  const [viewer, setViewer] = useState<{ src: string; alt: string } | null>(null);
  const groups = groupMessageParts(message.parts);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24, ease: EASE }}
        data-message-id={message.id}
        className={cn('flex items-end gap-2', message.self ? 'justify-end' : 'justify-start')}
      >
        {!message.self &&
          (onAuthorClick ? (
            <button
              type="button"
              onClick={onAuthorClick}
              aria-label={`查看 TA 对 ${message.author} 的关系`}
              title={`查看对 ${message.author} 的关系`}
              className="shrink-0 rounded-full transition hover:ring-2 hover:ring-brass-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/40"
            >
              <ChannelAvatar
                src={message.avatarUrl}
                initials={initialsOf(message.author)}
                accent={avatarAccent}
                size="sm"
                title={`QQ ${message.authorId}`}
                className="size-7 rounded-full text-[0.58rem]"
              />
            </button>
          ) : (
            <ChannelAvatar
              src={message.avatarUrl}
              initials={initialsOf(message.author)}
              accent={avatarAccent}
              size="sm"
              title={`QQ ${message.authorId}`}
              className="size-7 shrink-0 rounded-full text-[0.58rem]"
            />
          ))}

        <div className={cn('max-w-[78%]', message.self && 'flex flex-col items-end')}>
          {!message.self && kind === 'group' && (
            <p className="mb-1 flex flex-wrap items-center gap-1.5 pl-1 text-[0.56rem] text-mist-600">
              <span className="text-mist-400">{message.authorCard || message.author}</span>
              {message.authorCard && <span>{message.author}</span>}
              <span className="font-mono text-[0.48rem] text-mist-600">QQ {message.authorId}</span>
            </p>
          )}
          {(message.parts.length > 0 || message.quote) && (
            <div
              className={cn('flex flex-col gap-1.5', message.self ? 'items-end' : 'items-start')}
            >
              {message.quote && groups[0]?.kind !== 'bubble' && (
                <QuoteStrip quote={message.quote} self={message.self} />
              )}
              {groups.map((group, groupIndex) => {
                if (group.kind === 'bubble') {
                  const hasText =
                    group.parts.some((part) => part.type === 'text') ||
                    (groupIndex === 0 && Boolean(message.quote));
                  return (
                    <div
                      key={`${message.id}-bubble-${groupIndex}`}
                      className={cn(
                        'flex max-w-full flex-col gap-1 overflow-hidden',
                        hasText ? 'px-3.5 py-2' : 'p-1',
                        message.self
                          ? 'rounded-2xl rounded-br-md border border-brass-400/20 bg-brass-400/[0.12]'
                          : 'rounded-2xl rounded-bl-md border border-mist-100/[0.07] bg-ink-950/35',
                      )}
                    >
                      {groupIndex === 0 && message.quote && (
                        <QuoteStrip quote={message.quote} self={message.self} />
                      )}
                      {group.parts.map((part, index) => {
                        const key = `${message.id}-part-${groupIndex}-${index}`;
                        if (part.type === 'text') {
                          return (
                            <p
                              key={key}
                              className={cn(
                                'whitespace-pre-wrap text-left text-[0.76rem] leading-6',
                                message.self ? 'text-mist-100' : 'text-mist-200',
                              )}
                            >
                              {part.text}
                            </p>
                          );
                        }
                        if (part.type !== 'image') {
                          return null;
                        }
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() =>
                              setViewer({
                                src: part.image.url,
                                alt: `图片 ${part.image.position + 1}`,
                              })
                            }
                            aria-label={`预览图片 ${part.image.position + 1}`}
                            className={cn(
                              'block cursor-zoom-in',
                              message.self ? 'self-end' : 'self-start',
                            )}
                          >
                            <img
                              src={part.image.url}
                              alt={`图片 ${part.image.position + 1}`}
                              loading="lazy"
                              className="max-h-64 max-w-[16rem] rounded-lg object-cover"
                            />
                          </button>
                        );
                      })}
                    </div>
                  );
                }

                const part = group.part;
                const key = `${message.id}-part-${groupIndex}`;
                if (part.type === 'forward') {
                  return (
                    <ForwardMessageCard
                      key={key}
                      messageId={message.id}
                      forward={part.forward}
                      self={message.self}
                    />
                  );
                }
                if (part.type === 'voice') {
                  return <VoiceBar key={key} voice={part.voice} self={message.self} />;
                }
                return null;
              })}
            </div>
          )}
          <p
            className="mt-1 px-1 font-mono text-[0.48rem] text-mist-600"
            title={`QQ ${message.authorId}`}
          >
            {message.time}
          </p>
        </div>

        {message.self &&
          (onSelfClick ? (
            <button
              type="button"
              onClick={onSelfClick}
              aria-label="查看人格简报"
              title="查看人格简报"
              className="shrink-0 rounded-full transition hover:ring-2 hover:ring-brass-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/40"
            >
              <ChannelAvatar
                src={message.avatarUrl ?? selfAvatar}
                initials={selfInitial}
                accent="brass"
                size="sm"
                title={`QQ ${message.authorId}`}
                className="size-7 rounded-full text-[0.58rem]"
              />
            </button>
          ) : (
            <ChannelAvatar
              src={message.avatarUrl ?? selfAvatar}
              initials={selfInitial}
              accent="brass"
              size="sm"
              title={`QQ ${message.authorId}`}
              className="size-7 shrink-0 rounded-full text-[0.58rem]"
            />
          ))}
      </motion.div>

      <AnimatePresence>
        {viewer && (
          <ImageLightbox
            key={viewer.src}
            src={viewer.src}
            alt={viewer.alt}
            onClose={() => setViewer(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function ConversationRow({
  conversation,
  active,
  kind,
  onSelect,
}: {
  conversation: SourcedConversation;
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
      <ChannelAvatar
        src={conversation.avatarUrl}
        initials={conversation.initials}
        accent={conversation.accent}
        size="sm"
        title={
          kind === 'group' ? `群号 ${conversation.externalId}` : `QQ ${conversation.externalId}`
        }
      />
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
          <span className="ml-auto font-mono text-[0.48rem] text-mist-600">
            {kind === 'group' ? `群 ${conversation.externalId}` : `QQ ${conversation.externalId}`}
          </span>
        </span>

        <span className="mt-1 block truncate text-[0.64rem] leading-5 text-mist-600">
          {conversation.lastMessage || '暂无消息'}
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
                  {sources.length} 个渠道汇总
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
                    src={source.avatarUrl}
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
          接入消息渠道后，来自各渠道的{kind === 'private' ? '私聊' : '群聊'}
          会自动汇入这里，并按渠道命名空间归档对话记录。
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

function LoadingPanel() {
  return (
    <div className="glass-panel grid min-h-[18rem] place-items-center rounded-[1.6rem] p-8">
      <div className="flex items-center gap-2 text-[0.72rem] text-mist-500">
        <LoaderCircle className="size-4 animate-spin text-brass-300" />
        正在读取渠道数据…
      </div>
    </div>
  );
}

export function ConversationWorkspace({ kind }: { kind: ConversationKind }) {
  const { channels, isLoading: channelsLoading } = useChannelsState();
  const queryClient = useQueryClient();
  const apiKind = kind === 'group' ? 'GROUP' : 'PRIVATE';
  const conversationsQuery = useQuery(chatConversationsQuery(apiKind));
  const [query, setQuery] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [contactBrief, setContactBrief] = useState<ChatContactBrief | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  // Auto-pinning pauses briefly after wheel/touch input so it never fights an
  // active scroll gesture, which reads as the transcript trembling.
  const scrollHoldUntilRef = useRef(0);

  const conversations = useMemo(
    () => (conversationsQuery.data ?? []).map(toSourcedConversation),
    [conversationsQuery.data],
  );
  const sources = useMemo(() => conversationSources(conversations), [conversations]);

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
      [conversation.name, conversation.handle, conversation.lastMessage, conversation.externalId]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [visibleConversations, query]);

  const activeConversation =
    visibleConversations.find((conversation) => conversation.id === selectedId) ?? null;
  const activeId = activeConversation?.id ?? null;

  const messagesQuery = useQuery({
    ...chatMessagesQuery(activeId ?? ''),
    enabled: Boolean(activeId),
  });
  const messages = useMemo(
    () => (messagesQuery.data?.messages ?? []).map(toChatMessage),
    [messagesQuery.data],
  );

  const activeChannel = channels.find((channel) => channel.id === activeConversation?.source.id);
  const persona = activeChannel?.persona ?? null;
  const selfName = activeConversation?.source.displayName ?? activeChannel?.displayName ?? '我';
  const selfInitial = initialsOf(selfName);
  const selfAvatar = activeConversation?.source.avatarUrl ?? activeChannel?.avatarUrl ?? null;
  const canSend = Boolean(activeConversation) && activeChannel?.status === 'online';

  const sendMutation = useMutation({
    mutationFn: (input: { conversationId: string; text: string; images: string[] }) =>
      api.sendChatMessage(input.conversationId, { text: input.text, images: input.images }),
    onSuccess: (_message, input) => {
      setDraft('');
      setAttachments([]);
      void queryClient.invalidateQueries({
        queryKey: ['chat', 'messages', input.conversationId],
      });
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '消息发送失败，请稍后重试');
    },
  });

  const lastMessageId = messages.at(-1)?.id ?? '';
  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  // Stick to the bottom while media lazy-loads and grows the transcript, but
  // never fight an active scroll: coalesce resize pins into one frame.
  useEffect(() => {
    const element = scrollRef.current;
    const content = scrollContentRef.current;

    if (!element || !content || typeof ResizeObserver === 'undefined') {
      return;
    }

    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current || performance.now() < scrollHoldUntilRef.current) {
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (
          stickToBottomRef.current &&
          performance.now() >= scrollHoldUntilRef.current
        ) {
          element.scrollTop = element.scrollHeight;
        }
      });
    });
    observer.observe(content);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [selectedId]);

  useEffect(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const handleScroll = () => {
      stickToBottomRef.current =
        element.scrollHeight - element.scrollTop - element.clientHeight < 32;
    };
    const holdAutoPin = () => {
      scrollHoldUntilRef.current = performance.now() + 180;
    };
    element.addEventListener('scroll', handleScroll, { passive: true });
    element.addEventListener('wheel', holdAutoPin, { passive: true });
    element.addEventListener('touchmove', holdAutoPin, { passive: true });
    element.addEventListener('pointerdown', holdAutoPin);

    return () => {
      element.removeEventListener('scroll', handleScroll);
      element.removeEventListener('wheel', holdAutoPin);
      element.removeEventListener('touchmove', holdAutoPin);
      element.removeEventListener('pointerdown', holdAutoPin);
    };
  }, [selectedId]);

  useLayoutEffect(() => {
    stickToBottomRef.current = true;
    scrollToBottom();
  }, [selectedId, scrollToBottom]);

  // A new message should only pull the view down when the reader is already
  // near the bottom; scrolling back through history must stay put.
  useLayoutEffect(() => {
    if (
      stickToBottomRef.current &&
      performance.now() >= scrollHoldUntilRef.current
    ) {
      scrollToBottom();
    }
  }, [lastMessageId, scrollToBottom]);

  useEffect(() => {
    setAttachments([]);
    setPersonaOpen(false);
    setContactBrief(null);
    setBriefOpen(false);
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

    sendMutation.mutate({
      conversationId: activeConversation.id,
      text,
      images: attachments,
    });
  };

  if (channelsLoading) {
    return <LoadingPanel />;
  }

  if (channels.length === 0) {
    return <ChannelRequired kind={kind} />;
  }

  if (conversationsQuery.isPending) {
    return <LoadingPanel />;
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
          已接入的渠道还没有返回该类型的会话。新的消息到达后，会按渠道命名空间自动出现在这里。
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

              {persona ? (
                <button
                  type="button"
                  onClick={() => setPersonaOpen(true)}
                  aria-label={
                    kind === 'group' ? '查看群关系立场与人格参数' : '查看对这个人的关系与人格参数'
                  }
                  title={kind === 'group' ? '群关系立场' : '关系与人格参数'}
                  className="shrink-0 rounded-full transition hover:ring-2 hover:ring-brass-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/40"
                >
                  <ChannelAvatar
                    src={activeConversation.avatarUrl}
                    initials={activeConversation.initials}
                    accent={activeConversation.accent}
                    size="sm"
                    title={
                      kind === 'group'
                        ? `群号 ${activeConversation.externalId}`
                        : `QQ ${activeConversation.externalId}`
                    }
                  />
                </button>
              ) : (
                <ChannelAvatar
                  src={activeConversation.avatarUrl}
                  initials={activeConversation.initials}
                  accent={activeConversation.accent}
                  size="sm"
                  title={
                    kind === 'group'
                      ? `群号 ${activeConversation.externalId}`
                      : `QQ ${activeConversation.externalId}`
                  }
                />
              )}

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

              <button
                type="button"
                onClick={() => setPersonaOpen(true)}
                aria-label={kind === 'group' ? '查看群聊人格参数' : '查看私聊人格参数'}
                title={kind === 'group' ? '群聊人格参数' : '私聊人格参数'}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-brass-400/30 bg-brass-400/[0.08] px-2.5 font-mono text-[0.58rem] tracking-[0.08em] text-brass-300 transition hover:bg-brass-400/[0.16]"
              >
                {kind === 'group' ? (
                  <Users className="size-3.5" strokeWidth={1.8} />
                ) : (
                  <User className="size-3.5" strokeWidth={1.8} />
                )}
                <span className="hidden sm:inline">{kind === 'group' ? '群人格' : '私人格'}</span>
              </button>

              <SyncPill label="实时同步" className="hidden sm:inline-flex" />
            </header>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 [scrollbar-gutter:stable]"
            >
              <div ref={scrollContentRef}>
                <div className="mb-5 text-center">
                  <span className="rounded-full border border-mist-100/[0.07] bg-ink-950/30 px-3 py-1 font-mono text-[0.5rem] uppercase tracking-[0.16em] text-mist-600">
                    最近消息
                  </span>
                </div>

                {messagesQuery.isPending ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-[0.7rem] text-mist-500">
                    <LoaderCircle className="size-4 animate-spin text-brass-300" />
                    正在读取消息记录…
                  </div>
                ) : messagesQuery.isError ? (
                  <p className="py-10 text-center text-[0.7rem] text-signal-400/90">
                    消息记录读取失败，请稍后重试。
                  </p>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-[0.7rem] text-mist-600">
                    这个会话还没有消息记录。
                  </p>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        kind={kind}
                        selfAvatar={selfAvatar}
                        selfInitial={selfInitial}
                        onAuthorClick={
                          persona
                            ? () =>
                                setContactBrief({
                                  externalId: message.authorId,
                                  name: message.author,
                                  avatarUrl: message.avatarUrl,
                                  accent: kind === 'group' ? 'jade' : 'brass',
                                })
                            : undefined
                        }
                        onSelfClick={persona ? () => setBriefOpen(true) : undefined}
                      />
                    ))}
                  </div>
                )}

                {messagesQuery.data?.hasMore && (
                  <p className="mt-6 text-center font-mono text-[0.48rem] uppercase tracking-[0.18em] text-mist-600">
                    已加载最近 100 条 · 更早消息已归档
                  </p>
                )}
              </div>
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
                    placeholder={
                      canSend ? `以 ${selfName} 的身份回复…` : '当前渠道离线，恢复连接后可发送'
                    }
                    aria-label="消息输入"
                    autoComplete="off"
                    className="wizard-input h-10 text-[0.78rem]"
                  />
                  <button
                    type="submit"
                    disabled={
                      sendMutation.isPending ||
                      !canSend ||
                      (!draft.trim() && attachments.length === 0)
                    }
                    aria-label="发送消息"
                    className="grid size-10 shrink-0 place-items-center rounded-xl border border-brass-400/30 bg-brass-400/10 text-brass-300 transition hover:bg-brass-400/[0.18] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sendMutation.isPending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" strokeWidth={1.8} />
                    )}
                  </button>
                </div>
              </form>
              <p className="mt-2 flex items-center justify-center gap-1 font-mono text-[0.48rem] uppercase tracking-[0.14em] text-mist-600">
                <ImagePlus className="size-3" strokeWidth={1.8} />
                支持粘贴图片 · 消息将通过 NapCat 发送并归档
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

      {kind === 'group' ? (
        <GroupPersonaPanel
          conversation={personaOpen ? activeConversation : null}
          channel={activeChannel ?? null}
          onClose={() => setPersonaOpen(false)}
        />
      ) : (
        <PrivatePersonaPanel
          conversation={personaOpen ? activeConversation : null}
          channel={activeChannel ?? null}
          onClose={() => setPersonaOpen(false)}
        />
      )}

      {persona && (
        <>
          <ContactRelationshipPanel
            personaId={persona.id}
            contact={contactBrief}
            onClose={() => setContactBrief(null)}
          />
          <PersonaBriefPanel
            open={briefOpen}
            channelId={activeChannel?.id ?? ''}
            personaId={persona.id}
            name={persona.name}
            identity={persona.identity}
            quote={persona.quote}
            onClose={() => setBriefOpen(false)}
          />
        </>
      )}
    </div>
  );
}
