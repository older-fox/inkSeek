import {
  AtSign,
  LoaderCircle,
  MessageSquareQuote,
  Plus,
  Quote,
  RotateCw,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { TOTAL_STEPS } from '@/lib/persona-draft';
import { formatPersonaTimestamp } from '@/lib/persona-metadata';
import type { Persona, PersonaAccent, PersonaTrait } from '@/lib/personas';
import { ExpandButton, PersonaTextDialog, useClampedOverflow } from './persona-card-text';

const CARD_HEIGHT = 'h-[33rem]';
const ADDRESS_PREVIEW_MAX = 36;

/**
 * Shortens a long address-style string at a separator boundary and appends an
 * ellipsis so the preview keeps whole terms.
 */
function addressPreview(value: string): string {
  if (value.length <= ADDRESS_PREVIEW_MAX) {
    return value;
  }

  const clipped = value.slice(0, ADDRESS_PREVIEW_MAX);
  const boundary = clipped.lastIndexOf('、');

  return `${boundary > 0 ? clipped.slice(0, boundary) : clipped}…`;
}

/** Monogram avatar used on the front face of a persona card. */
function PersonaAvatar({ name, accent }: { name: string; accent: PersonaAccent }) {
  return (
    <span
      className={cn(
        'relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
        accent === 'jade'
          ? 'border-jade-400/25 bg-gradient-to-br from-jade-400/25 via-jade-400/10 to-transparent text-jade-300'
          : 'border-brass-400/25 bg-gradient-to-br from-brass-400/25 via-brass-400/10 to-transparent text-brass-300',
      )}
      aria-hidden="true"
    >
      <span className="font-display text-xl font-semibold tracking-wide">{name.slice(0, 1)}</span>
      <UserRound className="absolute bottom-1.5 right-1.5 size-3 opacity-45" strokeWidth={1.6} />
      <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
    </span>
  );
}

/** Labelled 0–100 bar that animates to the trait value on mount. */
function TraitMeter({ trait, tone }: { trait: PersonaTrait; tone: 'brass' | 'jade' }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.62rem] text-mist-500">{trait.label}</span>
        <span className="font-mono text-[0.56rem] text-mist-600">{trait.value}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-mist-100/[0.08]">
        <motion.span
          className={cn(
            'block h-full rounded-full',
            tone === 'jade' ? 'bg-jade-400/80' : 'bg-brass-400/80',
          )}
          initial={{ width: 0 }}
          animate={{ width: `${trait.value}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

/**
 * Shared card footer with the flip hint plus edit/delete links. Links stay
 * clickable only on the visible face, which callers mark via `active`.
 */
function CardFooter({
  hint,

  personaName,
  active,
  onEdit,
  onDelete,
}: {
  hint: string;

  personaName: string;
  active: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <p className="flex min-w-0 items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-mist-600">
        <RotateCw className="size-3 shrink-0" strokeWidth={1.7} />
        <span className="truncate">{hint}</span>
      </p>
      <div className="flex shrink-0 items-center gap-2.5">
        {onEdit && (
          <button
            type="button"
            tabIndex={active ? 0 : -1}
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            aria-label={`编辑 ${personaName} 的角色卡`}
            className={cn(
              'shrink-0 rounded-sm text-[0.66rem] tracking-[0.02em] text-brass-300/90 underline decoration-brass-400/40 decoration-1 underline-offset-4 transition hover:text-brass-200 hover:decoration-brass-300 focus-visible:outline-none focus-visible:text-brass-200 focus-visible:ring-2 focus-visible:ring-brass-400/40',
              active ? 'pointer-events-auto' : 'pointer-events-none',
            )}
          >
            编辑角色卡
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            tabIndex={active ? 0 : -1}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            aria-label={`删除 ${personaName} 的角色卡`}
            title="删除人格卡"
            className={cn(
              'shrink-0 rounded-sm text-mist-600 transition hover:text-signal-400 focus-visible:outline-none focus-visible:text-signal-400 focus-visible:ring-2 focus-visible:ring-signal-400/40',
              active ? 'pointer-events-auto' : 'pointer-events-none',
            )}
          >
            <Trash2 className="size-3.5" strokeWidth={1.7} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Front face: identity header, quote anchor, keywords, core traits and the
 * clamped language/address summaries with expand affordances.
 */
function PersonaFront({
  persona,
  active,
  onEdit,
  onDelete,
  onExpand,
}: {
  persona: Persona;
  active: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onExpand: (title: string, text: string) => void;
}) {
  const quote = useClampedOverflow<HTMLParagraphElement>(persona.quote);
  const languageStyle = useClampedOverflow<HTMLParagraphElement>(persona.languageStyle);
  const addressStyle = useClampedOverflow<HTMLParagraphElement>(persona.addressStyle);
  const addressText = addressPreview(persona.addressStyle);

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[1.5rem] p-5">
      <div
        className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full opacity-60 blur-2xl"
        style={{
          background:
            persona.accent === 'jade'
              ? 'radial-gradient(circle, var(--orb-jade), transparent 68%)'
              : 'radial-gradient(circle, var(--orb-brass), transparent 68%)',
        }}
      />
      <div className="absolute inset-x-5 top-0 h-px hairline" />

      <div className="relative flex items-start gap-3">
        <PersonaAvatar name={persona.name} accent={persona.accent} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[1.18rem] font-semibold tracking-tight text-mist-100">
            {persona.name}
          </h3>
          <p className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-brass-400/70">
            {persona.serial} · v{persona.currentVersion}
          </p>
          <p className="mt-1 text-[0.7rem] text-mist-500">
            {persona.occupation}
            <span className="mx-1.5 text-mist-600">·</span>
            {persona.age} 岁<span className="mx-1.5 text-mist-600">·</span>
            {persona.gender}
          </p>
        </div>
      </div>

      <div className="relative mt-4 border-l-2 border-brass-400/40 pl-3">
        {quote.overflow && (
          <span className="absolute -top-4 right-0">
            <ExpandButton
              active={active}
              onClick={() => onExpand(`${persona.name} · 台词锚点`, persona.quote)}
            />
          </span>
        )}
        {persona.quote ? (
          <p
            ref={quote.ref}
            className="line-clamp-2 font-display text-[0.92rem] leading-6 text-mist-200"
          >
            「{persona.quote}」
          </p>
        ) : (
          <p className="text-[0.8rem] leading-6 text-mist-600">尚未登记台词锚点。</p>
        )}
      </div>

      {persona.keywords.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {persona.keywords.map((keyword) => (
            <span
              key={keyword}
              className="rounded-full border border-mist-100/10 bg-ink-950/30 px-2 py-0.5 text-[0.62rem] text-mist-500"
            >
              {keyword}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-mist-600">
          核心倾向
        </span>
        <span className="font-mono text-[0.5rem] text-mist-600">0—100</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {persona.traits.map((trait) => (
          <TraitMeter key={trait.label} trait={trait} tone="brass" />
        ))}
      </div>

      <div className="mt-auto space-y-3 border-t border-mist-100/[0.06] pt-4">
        <div className="flex gap-2.5">
          <MessageSquareQuote
            className="mt-0.5 size-3.5 shrink-0 text-brass-400/75"
            strokeWidth={1.7}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-mist-600">
                语言风格
              </p>
              {languageStyle.overflow && (
                <ExpandButton
                  active={active}
                  onClick={() => onExpand(`${persona.name} · 语言风格`, persona.languageStyle)}
                />
              )}
            </div>
            <p
              ref={languageStyle.ref}
              className="mt-0.5 line-clamp-2 text-[0.68rem] leading-5 text-mist-400"
            >
              {persona.languageStyle || '尚未设定'}
            </p>
          </div>
        </div>
        <div className="flex gap-2.5">
          <AtSign className="mt-0.5 size-3.5 shrink-0 text-jade-400/75" strokeWidth={1.7} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-mist-600">
                称呼
              </p>
              {(addressStyle.overflow || addressText !== persona.addressStyle) && (
                <ExpandButton
                  active={active}
                  onClick={() => onExpand(`${persona.name} · 称呼`, persona.addressStyle)}
                />
              )}
            </div>
            <p
              ref={addressStyle.ref}
              className="mt-0.5 line-clamp-2 text-[0.68rem] leading-5 text-mist-400"
            >
              {addressText || '尚未设定'}
            </p>
          </div>
        </div>
      </div>

      <CardFooter
        hint={`点击翻面 · 更新于 ${formatPersonaTimestamp(persona.updatedAt, false)}`}
        personaName={persona.name}
        active={active}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

/** Back face: background story, taboos, physical parameters and experience tier. */
function PersonaBack({
  persona,
  active,
  onEdit,
  onDelete,
  onExpand,
}: {
  persona: Persona;
  active: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onExpand: (title: string, text: string) => void;
}) {
  const story = useClampedOverflow<HTMLParagraphElement>(persona.story);

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[1.5rem] p-5">
      <div className="absolute inset-x-5 top-0 h-px hairline" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-brass-400/70">
            Persona Dossier
          </p>
          <h3 className="mt-1.5 truncate font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
            {persona.name}
          </h3>
          <p className="mt-1 text-[0.68rem] text-mist-500">
            {persona.occupation}
            <span className="mx-1.5 text-mist-600">·</span>
            {persona.age} 岁<span className="mx-1.5 text-mist-600">·</span>
            {persona.gender}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-mist-600">
          {persona.serial} · v{persona.currentVersion}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-mist-100/[0.07] bg-ink-950/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="grid size-3.5 place-items-center">
            <Quote className="size-3.5 text-brass-400/70" strokeWidth={1.7} />
          </span>
          {story.overflow && (
            <ExpandButton
              active={active}
              onClick={() => onExpand(`${persona.name} · 背景故事`, persona.story)}
            />
          )}
        </div>
        <p ref={story.ref} className="mt-1.5 line-clamp-4 text-[0.76rem] leading-6 text-mist-300">
          {persona.story || '尚未补全背景故事。'}
        </p>
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-1.5">
          <span className="grid size-3.5 shrink-0 place-items-center">
            <ShieldAlert className="size-3.5 text-signal-400/80" strokeWidth={1.7} />
          </span>
          <span className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-mist-600">
            禁忌内容
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {persona.taboos.length > 0 ? (
            persona.taboos.map((taboo) => (
              <span
                key={taboo}
                className="rounded-full border border-signal-400/20 bg-signal-400/[0.06] px-2 py-0.5 text-[0.62rem] text-signal-400"
              >
                {taboo}
              </span>
            ))
          ) : (
            <span className="text-[0.62rem] text-mist-600">尚未登记禁忌。</span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-mist-600">
            身体参数
          </span>
          <span className="font-mono text-[0.5rem] text-mist-600">0—100</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
          {persona.physical.map((trait) => (
            <TraitMeter key={trait.label} trait={trait} tone="jade" />
          ))}
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-mist-100/[0.06] pt-4">
        <div>
          <p className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-mist-600">
            经验等级
          </p>
          <p className="mt-0.5 text-[0.62rem] text-mist-600">性经验</p>
        </div>
        <span className="rounded-full border border-brass-400/25 bg-brass-400/10 px-3 py-1 font-mono text-[0.62rem] text-brass-300">
          {persona.experience.level} · {persona.experience.label}
        </span>
      </div>

      <CardFooter
        hint={`点击返回正面 · 更新于 ${formatPersonaTimestamp(persona.updatedAt, false)}`}
        personaName={persona.name}
        active={active}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

/**
 * Confirmation dialog for deleting a persona, warning that version history is
 * permanent and noting how many channels still hold a copy of the snapshot.
 */
function PersonaDeleteDialog({
  open,
  personaName,
  boundChannelCount,
  deleting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  personaName: string;
  boundChannelCount: number;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    /** Escape is ignored once the deletion is in flight so it cannot be interrupted halfway. */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) {
        onCancel();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [open, deleting, onCancel]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="persona-delete-dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => {
            if (!deleting) {
              onCancel();
            }
          }}
          className="fixed inset-0 z-[130] flex items-center justify-center bg-[#05090e]/70 p-4 backdrop-blur-sm"
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel relative w-full max-w-md overflow-hidden rounded-[1.4rem] border border-mist-100/10 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.75)] outline-none"
          >
            <div className="flex items-start justify-between gap-4 border-b border-mist-100/[0.07] px-5 py-4">
              <div className="min-w-0">
                <p className="font-mono text-[0.52rem] uppercase tracking-[0.22em] text-signal-400/80">
                  Persona Center · Delete
                </p>
                <h3
                  id={titleId}
                  className="mt-1 truncate font-display text-[1.05rem] font-semibold tracking-tight text-mist-100"
                >
                  删除「{personaName}」？
                </h3>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={deleting}
                aria-label="关闭删除确认"
                className="rounded-lg p-1.5 text-mist-500 transition hover:bg-mist-100/5 hover:text-mist-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/40 disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              <div className="flex gap-3 rounded-xl border border-signal-400/20 bg-signal-400/[0.05] p-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-signal-400" strokeWidth={1.7} />
                <div className="min-w-0 space-y-2 text-[0.76rem] leading-6 text-mist-400">
                  <p>人格卡和它的全部版本历史会被永久删除，无法恢复。</p>
                  {boundChannelCount > 0 ? (
                    <p className="text-mist-500">
                      有 {boundChannelCount} 个渠道正在使用这张卡的快照。删除不会影响已绑定的渠道人格，
                      它们会继续保留自己的副本。
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-mist-100/[0.07] px-5 py-3.5">
              <button
                type="button"
                onClick={onCancel}
                disabled={deleting}
                className="rounded-lg border border-mist-100/10 px-3 py-1.5 text-[0.72rem] text-mist-400 transition hover:border-mist-100/20 hover:text-mist-200 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-signal-400/30 bg-signal-400/10 px-3 py-1.5 text-[0.72rem] text-signal-400 transition hover:bg-signal-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-400/40 disabled:opacity-60"
              >
                {deleting && <LoaderCircle className="size-3.5 animate-spin" />}
                确认删除
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Flip-card for one persona: click anywhere to turn it over, with expandable
 * text dialogs and a guarded delete flow layered on top.
 */
export function PersonaCard({
  persona,
  onEdit,
  onDelete,
  deleting = false,
  boundChannelCount = 0,
}: {
  persona: Persona;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  boundChannelCount?: number;
}) {
  const [flipped, setFlipped] = useState(false);
  const [expanded, setExpanded] = useState<{ title: string; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /** Opens the full-text dialog for a clamped field; replaces any preview already shown. */
  const handleExpand = (title: string, text: string) => setExpanded({ title, text });
  const handleDelete = onDelete ? () => setConfirmingDelete(true) : undefined;

  return (
    <>
      <div
        className={cn(
          'group relative',
          CARD_HEIGHT,
          'transition-transform duration-300 hover:-translate-y-1',
        )}
      >
        <button
          type="button"
          aria-pressed={flipped}
          aria-label={
            flipped
              ? `${persona.name} 的人格档案，当前为背面，点击返回正面`
              : `${persona.name} 的人格档案，点击查看背面`
          }
          onClick={() => setFlipped((value) => !value)}
          className="absolute inset-0 z-0 cursor-pointer rounded-[1.5rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/40"
        />
        <div className="pointer-events-none absolute inset-0 z-10 [perspective:1600px]">
          <div className="relative h-full w-full [transform-style:preserve-3d]">
            <motion.div
              initial={false}
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="glass-panel absolute inset-0 overflow-hidden rounded-[1.5rem] backdrop-blur-none [backface-visibility:hidden]"
            >
              <PersonaFront
                persona={persona}
                active={!flipped}
                onEdit={onEdit}
                onDelete={handleDelete}
                onExpand={handleExpand}
              />
            </motion.div>
            <motion.div
              initial={false}
              animate={{ rotateY: flipped ? 0 : -180 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="glass-panel absolute inset-0 overflow-hidden rounded-[1.5rem] backdrop-blur-none [backface-visibility:hidden]"
            >
              <PersonaBack
                persona={persona}
                active={flipped}
                onEdit={onEdit}
                onDelete={handleDelete}
                onExpand={handleExpand}
              />
            </motion.div>
          </div>
        </div>
      </div>
      <PersonaTextDialog
        open={expanded !== null}
        title={expanded?.title ?? ''}
        text={expanded?.text ?? ''}
        onClose={() => setExpanded(null)}
      />
      <PersonaDeleteDialog
        open={confirmingDelete}
        personaName={persona.name}
        boundChannelCount={boundChannelCount}
        deleting={deleting}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => onDelete?.()}
      />
    </>
  );
}

/** Dashed placeholder tile that starts the persona creation wizard. */
export function NewPersonaCard({ onCreate }: { onCreate: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      aria-label={`新建人格，共 ${TOTAL_STEPS} 步`}
      title="新建人格"
      className={cn(
        CARD_HEIGHT,
        'group flex w-full flex-col items-center justify-center gap-4 rounded-[1.5rem] border border-dashed border-mist-100/15 bg-ink-900/20 text-mist-600 transition',
        'hover:border-brass-400/35 hover:bg-ink-900/40 hover:text-brass-300',
      )}
    >
      <span className="grid size-14 place-items-center rounded-2xl border border-mist-100/10 bg-ink-950/40 transition duration-300 group-hover:rotate-90 group-hover:border-brass-400/30">
        <Plus className="size-6" strokeWidth={1.4} />
      </span>
      <span className="text-[0.8rem]">新建人格</span>
      <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-mist-600">
        {TOTAL_STEPS} steps · create
      </span>
    </button>
  );
}
