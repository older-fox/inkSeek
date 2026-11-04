import { ChevronRight, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

export function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
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

export function MindSection({
  title,
  count,
  children,
  className,
}: {
  title: string;
  count?: number | string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
          {title}
        </p>
        {count !== undefined ? (
          <span className="font-mono text-[0.68rem] text-mist-600">{count}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Right-side sheet used for details and editors, so a tab never has to show a
 * list and a full form side by side on small screens.
 */
export function MindDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  widthClassName = 'sm:max-w-[36rem]',
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="mind-drawer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[120] flex justify-end bg-[#05090e]/60 backdrop-blur-sm"
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(event) => event.stopPropagation()}
            initial={{ x: 36, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 36, opacity: 0.6 }}
            transition={{ duration: 0.28, ease: EASE }}
            className={cn(
              'flex h-full w-full flex-col overflow-hidden border-l border-mist-100/10 bg-ink-900 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.8)]',
              widthClassName,
            )}
          >
            <header className="flex items-start gap-3 border-b border-mist-100/[0.07] px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[0.58rem] uppercase tracking-[0.24em] text-brass-400/75">
                  Detail
                </p>
                <h2 className="mt-1 truncate font-display text-[1.2rem] font-semibold text-mist-100">
                  {title}
                </h2>
                {subtitle ? (
                  <p className="mt-0.5 truncate font-mono text-[0.6rem] text-mist-600">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭详情"
                className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/** Renders list items in batches as the mind scroll container approaches them. */
export function LazyList<T>({
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

export function NumberField({
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
        onChange={(event) => {
          if (event.target.value === '') {
            onChange(min);
            return;
          }
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? next : min);
        }}
        className={cn(
          'rounded-lg border border-mist-100/[0.1] bg-ink-950/50 px-2 py-1.5 text-center font-mono text-mist-200 outline-none focus:border-brass-400/40',
          compact ? 'w-14 text-[0.76rem]' : 'w-16 text-[0.82rem]',
        )}
      />
    </label>
  );
}

export function RangeField({
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

export function TextField({
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

export function TextAreaField({
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

export function ToggleRow({
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

export function StatusDot({ status }: { status: string }) {
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

export function StatusPill({ status }: { status: string }) {
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

export function TraceBlock({ title, value }: { title: string; value: unknown }) {
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

export function PromptBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-mist-600">{title}</p>
      <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-mist-100/[0.06] bg-ink-950/40 p-3 font-mono text-[0.7rem] leading-5 text-mist-400">
        {text}
      </pre>
    </div>
  );
}

export function renderPayload(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value ?? '');
  const record = value as Record<string, unknown>;
  if (typeof record['text'] === 'string') return record['text'];
  if (typeof record['stickerId'] === 'string') return `表情 ${record['stickerId']}`;
  return formatJson(value);
}

export function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
