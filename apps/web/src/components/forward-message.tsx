import type { ChatForwardSummary, ChatForwardNodeSummary, ChatMessagePart } from '@inkseek/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, Layers, LoaderCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChannelAvatar } from '@/components/connection-bits';
import { ImageLightbox } from '@/components/image-lightbox';
import { VoiceBar } from '@/components/voice-bar';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

const nodeTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Short human-readable summary of a merged forward's sync state and size. */
function statusText(forward: ChatForwardSummary): string {
  if (forward.status === 'PENDING') {
    return '内容尚未展开，打开后同步';
  }
  if (forward.status === 'FAILED') {
    return '内容无法展开';
  }
  if (forward.status === 'TRUNCATED') {
    return `已展开 ${forward.nodeCount} 条，部分内容未同步`;
  }
  return `${forward.nodeCount} 条消息`;
}

/** Badge label for the node count, replaced by a pending marker until expanded. */
function countText(forward: ChatForwardSummary): string {
  return forward.status === 'PENDING' ? '待同步' : `${forward.nodeCount} 条`;
}

/**
 * Chat bubble standing in for a merged forward; clicking it opens the drawer
 * that lazily loads the forwarded conversation.
 */
export function ForwardMessageCard({
  messageId,
  forward,
  self,
}: {
  messageId: string;
  forward: ChatForwardSummary;
  self: boolean;
}) {
  const [open, setOpen] = useState(false);
  const failed = forward.status === 'FAILED';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group relative w-[16.5rem] overflow-hidden rounded-2xl border text-left transition',
          self
            ? 'border-brass-400/20 bg-brass-400/[0.08] hover:bg-brass-400/[0.12]'
            : 'border-mist-100/[0.09] bg-ink-950/45 hover:border-jade-400/25 hover:bg-ink-950/65',
        )}
        aria-label={`打开合并转发：${forward.title}，${statusText(forward)}`}
      >
        <div className="relative flex items-center justify-between gap-3 border-b border-mist-100/[0.07] px-3.5 py-2.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <Layers className="size-3.5 shrink-0 text-brass-300" strokeWidth={1.7} />
            <span className="truncate text-[0.72rem] text-mist-200">{forward.title}</span>
          </span>
          <span className="shrink-0 font-mono text-[0.52rem] uppercase tracking-[0.14em] text-mist-600">
            {countText(forward)}
          </span>
        </div>
        <div className="relative px-3.5 py-3">
          <p
            className={cn(
              'text-[0.7rem] leading-5',
              failed ? 'text-signal-400' : 'text-mist-400',
            )}
          >
            {statusText(forward)}
          </p>
          <p className="mt-1.5 flex items-center gap-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-brass-400/70 transition group-hover:text-brass-300">
            查看聊天记录
            <span aria-hidden>→</span>
          </p>
        </div>
      </button>

      <ForwardDrawer
        open={open}
        onClose={() => setOpen(false)}
        messageId={messageId}
        forward={forward}
      />
    </>
  );
}

/**
 * Drawer listing the forwarded nodes, fetched on first open. Escape is ignored
 * while an image preview is stacked above it, and expanding a legacy pending
 * card refreshes the message list so the summary updates itself.
 */
function ForwardDrawer({
  open,
  onClose,
  messageId,
  forward,
}: {
  open: boolean;
  onClose: () => void;
  messageId: string;
  forward: ChatForwardSummary;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `forward-title-${messageId}`;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['chat', 'forward', messageId],
    queryFn: () => api.chatForwardDetail(messageId),
    enabled: open,
    staleTime: 60_000,
  });

  // A legacy card is expanded on first open; refresh the list so it switches
  // from "待同步" to the real summary without a manual reload.
  useEffect(() => {
    if (forward.status === 'PENDING' && query.isSuccess) {
      void queryClient.invalidateQueries({ queryKey: ['chat', 'messages'] });
    }
  }, [forward.status, query.isSuccess, queryClient]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    /** Escape closes the card, deferring to an image preview nested inside it. */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // An image preview opened from inside the forward list owns Escape.
        if (document.querySelector('[data-image-lightbox="true"]')) {
          return;
        }
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  const nodes = query.data?.nodes ?? [];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[130] flex items-end justify-center bg-[#05090e]/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="glass-panel relative flex max-h-[86dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[1.4rem] border border-mist-100/10 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.75)] outline-none sm:max-h-[min(82dvh,44rem)] sm:rounded-[1.4rem]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-mist-100/[0.07] px-5 py-4">
              <div className="min-w-0">
                <p className="font-mono text-[0.52rem] uppercase tracking-[0.22em] text-brass-400/70">
                  Merged Forward
                </p>
                <h3
                  id={titleId}
                  className="mt-1 truncate font-display text-[1.05rem] font-semibold tracking-tight text-mist-100"
                >
                  {forward.title}
                </h3>
                <p className="mt-1 text-[0.68rem] text-mist-500">{statusText(forward)}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭转发内容"
                className="rounded-lg border border-mist-100/10 bg-mist-100/5 p-1.5 text-mist-400 transition hover:bg-mist-100/10 hover:text-mist-200"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {query.isPending && (
                <div className="grid min-h-32 place-items-center">
                  <LoaderCircle className="size-5 animate-spin text-brass-400" />
                </div>
              )}

              {query.isError && (
                <div className="flex items-start gap-2 rounded-xl border border-signal-400/25 bg-signal-400/[0.06] px-4 py-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-signal-400" strokeWidth={1.7} />
                  <p className="text-[0.72rem] leading-5 text-signal-400">
                    转发内容读取失败，稍后重试。
                  </p>
                </div>
              )}

              {query.isSuccess && nodes.length === 0 && (
                <p className="py-8 text-center text-[0.74rem] text-mist-500">
                  这条转发没有可展示的内容。
                </p>
              )}

              {query.isSuccess && nodes.length > 0 && (
                <ol className="space-y-4">
                  {nodes.map((node) => (
                    <ForwardNodeRow key={node.id} node={node} />
                  ))}
                </ol>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** One forwarded message line: sender, timestamp, body parts and nested forwards. */
function ForwardNodeRow({ node }: { node: ChatForwardNodeSummary }) {
  const time = node.sentAt ? nodeTimeFormatter.format(new Date(node.sentAt)) : null;

  return (
    <li className="flex items-start gap-2.5">
      <ChannelAvatar
        src={node.avatarUrl}
        initials={Array.from(node.senderName.trim())[0] ?? '?'}
        accent="jade"
        size="sm"
        title={node.senderExternalId ? `QQ ${node.senderExternalId}` : node.senderName}
        className="mt-0.5 size-6 rounded-full text-[0.52rem]"
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.6rem] text-mist-500">
          <span className="text-mist-300">{node.senderName}</span>
          {node.senderExternalId && (
            <span className="font-mono text-[0.5rem] text-mist-600">QQ {node.senderExternalId}</span>
          )}
          {time && <span className="font-mono text-[0.5rem] text-mist-600">{time}</span>}
        </p>
        <div className="mt-1 flex flex-col items-start gap-1.5">
          {node.parts.length === 0 && node.children.length === 0 ? (
            <p className="text-[0.72rem] leading-6 text-mist-600">[空消息]</p>
          ) : (
            node.parts.map((part, index) => (
              <ForwardNodePart key={`${node.id}-part-${index}`} part={part} />
            ))
          )}
          {node.children.length > 0 && <NestedForwardBlock nodes={node.children} />}
        </div>
      </div>
    </li>
  );
}

/** Collapsible block for a forward nested inside another forward's nodes. */
function NestedForwardBlock({ nodes }: { nodes: ChatForwardNodeSummary[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full max-w-[20rem] overflow-hidden rounded-xl border border-brass-400/15 bg-brass-400/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-brass-400/[0.06]"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Layers className="size-3 shrink-0 text-brass-300/80" strokeWidth={1.7} />
          <span className="truncate text-[0.68rem] text-mist-300">嵌套聊天记录</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-[0.5rem] uppercase tracking-[0.14em] text-mist-500">
          {nodes.length} 条
          {open ? (
            <ChevronDown className="size-3" strokeWidth={1.7} />
          ) : (
            <ChevronRight className="size-3" strokeWidth={1.7} />
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="overflow-hidden border-t border-mist-100/[0.06]"
          >
            <ol className="space-y-3 px-3 py-2.5">
              {nodes.map((node) => (
                <ForwardNodeRow key={node.id} node={node} />
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Renders a single forwarded part by type: text, playable voice, image with
 * lightbox, or a compact reference to a further nested forward.
 */
function ForwardNodePart({ part }: { part: ChatMessagePart }) {
  const [viewer, setViewer] = useState<{ src: string; alt: string } | null>(null);

  if (part.type === 'text') {
    return (
      <p className="whitespace-pre-wrap rounded-xl border border-mist-100/[0.06] bg-ink-950/35 px-3 py-1.5 text-left text-[0.74rem] leading-6 text-mist-200">
        {part.text}
      </p>
    );
  }

  if (part.type === 'voice') {
    return <VoiceBar voice={part.voice} self={false} />;
  }

  if (part.type === 'image') {
    return (
      <>
        <button
          type="button"
          onClick={() =>
            setViewer({ src: part.image.url, alt: `转发图片 ${part.image.position + 1}` })
          }
          aria-label={`预览转发图片 ${part.image.position + 1}`}
          className="block cursor-zoom-in"
        >
          <img
            src={part.image.url}
            alt={`转发图片 ${part.image.position + 1}`}
            loading="lazy"
            className="max-h-48 max-w-[15rem] rounded-xl border border-mist-100/10 object-cover"
          />
        </button>
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

  return (
    <p className="rounded-xl border border-mist-100/[0.06] bg-ink-950/35 px-3 py-1.5 text-[0.72rem] text-mist-400">
      {part.forward.title} · {part.forward.nodeCount} 条
    </p>
  );
}
