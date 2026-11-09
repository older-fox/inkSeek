import {
  ChevronRight,
  Heart,
  MessagesSquare,
  ShieldCheck,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChannelAvatar, PlatformChip } from '@/components/connection-bits';
import { PersonaFieldCard } from '@/components/persona-field-controls';
import { cn } from '@/lib/cn';
import { useConversationPersona } from '@/lib/conversation-persona';
import { PRIVATE_ATTRIBUTE_COUNT, PRIVATE_PERSONA_GROUPS } from '@/lib/private-persona';
import { personaForChannel, type PersonaValue } from '@/lib/channel-persona';
import type { Channel, SourcedConversation } from '@/lib/connections';

const EASE = [0.22, 1, 0.36, 1] as const;

const PRIVATE_ICONS: Record<string, LucideIcon> = {
  numbers: Heart,
  behavior: MessagesSquare,
  boundaries: ShieldCheck,
  profile: User,
};

/** Joins the relation tags into a readable label, or a placeholder when unset. */
function relationLabel(values: Record<string, PersonaValue> | null): string {
  const tags = values?.relation_tags;
  if (Array.isArray(tags) && tags.length > 0) {
    return tags.join('、');
  }
  return '还没有立住这段关系';
}

/**
 * Dialog for the per-contact persona snapshot of a private chat: grouped
 * fields, live saving, and the relationship summary in the header. Editing is
 * held back until the server copy loads so nothing overwrites it blind.
 */
export function PrivatePersonaPanel({
  conversation,
  channel,
  onClose,
}: {
  conversation: SourcedConversation | null;
  channel: Channel | null;
  onClose: () => void;
}) {
  const [activeGroupId, setActiveGroupId] = useState(PRIVATE_PERSONA_GROUPS[0]?.id ?? '');
  const contentRef = useRef<HTMLDivElement>(null);
  const conversationId = conversation?.id ?? null;
  const persona = channel ? personaForChannel(channel) : null;
  const { values, ready, error, syncState, update, flush } = useConversationPersona(
    conversation,
    'PRIVATE',
  );
  const activeGroup =
    PRIVATE_PERSONA_GROUPS.find((group) => group.id === activeGroupId) ?? PRIVATE_PERSONA_GROUPS[0];

  useEffect(() => {
    if (conversationId) {
      setActiveGroupId(PRIVATE_PERSONA_GROUPS[0]?.id ?? '');
    }
  }, [conversationId]);

  /** Closes the panel, flushing any pending debounced edits first. */
  const close = useCallback(() => {
    flush();
    onClose();
  }, [flush, onClose]);

  useEffect(() => {
    if (!conversation) {
      return undefined;
    }

    /** Escape closes and flushes pending edits, but is skipped while an input or textarea has focus so typing can't lose work. */
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [conversation, close]);

  useEffect(() => {
    const element = contentRef.current;
    if (element) {
      element.scrollTop = 0;
    }
  }, [activeGroupId]);

  if (typeof document === 'undefined' || !activeGroup) {
    return null;
  }

  /** Adapter for the field controls; update() itself drops writes until the server copy and contact record exist. */
  const handleChange = (key: string, value: PersonaValue) => {
    update(key, value);
  };

  return createPortal(
    <AnimatePresence>
      {conversation && channel && persona && values && (
        <motion.div
          key="private-persona"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={close}
          className="fixed inset-0 z-[110] flex items-stretch justify-center bg-[#05090e]/70 backdrop-blur-sm sm:items-center sm:p-6"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="private-persona-title"
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.99 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="relative flex h-dvh w-full flex-col overflow-hidden bg-ink-900 text-mist-100 sm:h-[min(90dvh,50rem)] sm:max-w-5xl sm:rounded-[1.6rem] sm:border sm:border-mist-100/10 sm:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.75)]"
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-44 opacity-70"
              style={{
                background:
                  conversation.accent === 'jade'
                    ? 'radial-gradient(30rem 12rem at 16% 0%, var(--orb-jade), transparent 70%)'
                    : 'radial-gradient(30rem 12rem at 16% 0%, var(--orb-brass), transparent 70%)',
              }}
            />
            <div className="absolute inset-x-6 top-0 h-px hairline" />

            <header className="relative flex items-start gap-3.5 px-5 pb-4 pt-5 sm:items-center sm:px-7">
              <ChannelAvatar
                initials={conversation.initials}
                accent={conversation.accent}
                size="lg"
                className="hidden sm:grid"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.26em] text-brass-400/75">
                    私聊人格
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-jade-400/20 bg-jade-400/[0.07] px-2 py-0.5 font-mono text-[0.56rem] tracking-[0.12em] text-jade-300">
                    <span className="size-1 rounded-full bg-jade-400" aria-hidden="true" />
                    一人一份
                  </span>
                </div>

                <h2
                  id="private-persona-title"
                  className="mt-1.5 font-display text-[1.45rem] font-semibold leading-tight tracking-tight text-mist-100"
                >
                  {conversation.name}
                </h2>
                <p className="mt-1 text-[0.82rem] leading-7 text-mist-500">
                  {`${persona.name} 与 ${conversation.name} · 「${relationLabel(values)}」`}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <PlatformChip platform={conversation.platform} connector />
                  <span className="font-mono text-[0.6rem] tracking-[0.04em] text-mist-500">
                    {conversation.handle}
                  </span>
                  <span className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-mist-600">
                    {PRIVATE_ATTRIBUTE_COUNT} 项属性 · {PRIVATE_PERSONA_GROUPS.length} 组
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={close}
                aria-label="关闭私聊人格面板"
                className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="relative flex min-h-0 flex-1 flex-col border-t border-mist-100/[0.06] md:flex-row">
              <nav
                aria-label="私聊人格属性分组"
                className="flex shrink-0 gap-1 overflow-x-auto border-b border-mist-100/[0.06] px-2.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:w-[14.5rem] md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:px-2.5 md:py-3"
              >
                {PRIVATE_PERSONA_GROUPS.map((group) => {
                  const Icon = PRIVATE_ICONS[group.id] ?? User;
                  const active = group.id === activeGroup.id;

                  return (
                    <button
                      key={group.id}
                      type="button"
                      data-active={active ? 'true' : 'false'}
                      onClick={() => setActiveGroupId(group.id)}
                      className={cn(
                        'group flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition md:w-full',
                        active
                          ? 'bg-brass-400/[0.09] text-brass-200'
                          : 'text-mist-500 hover:bg-mist-100/[0.04] hover:text-mist-300',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-7 shrink-0 place-items-center rounded-lg border transition',
                          active
                            ? 'border-brass-400/30 bg-brass-400/10 text-brass-300'
                            : 'border-mist-100/[0.07] bg-ink-950/30 text-mist-600 group-hover:text-mist-400',
                        )}
                      >
                        <Icon className="size-3.5" strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block whitespace-nowrap text-[0.78rem] md:truncate">
                          {group.title}
                        </span>
                        <span className="mt-0.5 hidden font-mono text-[0.54rem] tracking-[0.12em] text-mist-600 md:block">
                          {group.tagline} · {group.fields.length} 项
                        </span>
                      </span>
                      <ChevronRight
                        className={cn(
                          'hidden size-3 shrink-0 md:block',
                          active ? 'text-brass-300' : 'text-mist-600/60',
                        )}
                        strokeWidth={2}
                      />
                    </button>
                  );
                })}
              </nav>

              <div
                ref={contentRef}
                className="min-h-0 flex-1 overflow-y-auto px-4 py-5 [scrollbar-width:thin] sm:px-7 sm:py-6"
              >
                {!ready ? (
                  <div className="flex min-h-[18rem] flex-col items-center justify-center gap-2 px-6 text-center">
                    <span className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-brass-400/70">
                      {error ? '读取失败' : '正在同步'}
                    </span>
                    <p className="font-display text-[1rem] text-mist-200">
                      {error ? '暂时无法读取这个人的关系属性' : '正在读取私聊人格快照…'}
                    </p>
                    <p className="max-w-sm text-[0.78rem] leading-6 text-mist-500">
                      {error
                        ? '请确认 API 服务在线后重新打开面板，读取成功前不开放编辑，以免覆盖数据库内容。'
                        : '读取完成后即可继续编辑，所有修改都会保存到数据库。'}
                    </p>
                  </div>
                ) : (
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={activeGroup.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: EASE }}
                    >
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-[1.2rem] font-semibold tracking-tight text-mist-100">
                              {activeGroup.title}
                            </h3>
                            <span className="font-mono text-[0.56rem] uppercase tracking-[0.16em] text-brass-400/70">
                              {activeGroup.tagline}
                            </span>
                          </div>
                          <p className="mt-1 max-w-2xl text-[0.8rem] leading-7 text-mist-500">
                            {activeGroup.description}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-mist-100/[0.08] bg-ink-950/30 px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-mist-500">
                          {activeGroup.fields.length} 项
                        </span>
                      </div>

                      <div className="mt-4 grid grid-flow-row-dense gap-2 md:grid-cols-2">
                        {activeGroup.fields.map((field) => (
                          <PersonaFieldCard
                            key={field.key}
                            field={field}
                            value={values[field.key]}
                            onChange={(next) => handleChange(field.key, next)}
                          />
                        ))}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </div>

            <footer className="relative flex flex-wrap items-center justify-between gap-2 border-t border-mist-100/[0.06] px-5 py-3 sm:px-7">
              <p className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-mist-600">
                对象快照 · {PRIVATE_ATTRIBUTE_COUNT} 项属性
              </p>
              <p
                className={cn(
                  'text-[0.68rem]',
                  syncState === 'error' ? 'text-signal-400' : 'text-mist-600',
                )}
              >
                {syncState === 'saving'
                  ? '正在保存…'
                  : syncState === 'error'
                    ? '保存失败，请重试'
                    : syncState === 'saved'
                      ? '已保存至数据库'
                      : '一人一份 · 编辑自动保存至数据库'}
              </p>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
