import { Check, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

export interface PipelineSelectOption {
  value: string;
  label: string;
}

interface PipelineSelectProps {
  value: string;
  options: readonly PipelineSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  /** `card` is the compact trigger living on a canvas card; `field` fills a form row. */
  variant?: 'card' | 'field';
  menuTitle?: string;
  menuWidth?: number;
  className?: string;
}

interface MenuPlacement {
  left: number;
  width: number;
  maxHeight: number;
  dropUp: boolean;
  top?: number;
  bottom?: number;
}

/**
 * Custom dropdown that mirrors the app's glass panels. The menu renders in a
 * portal with fixed positioning so the canvas zoom transform cannot scale or
 * clip it.
 */
export function PipelineSelect({
  value,
  options,
  onChange,
  ariaLabel,
  variant = 'field',
  menuTitle,
  menuWidth = 280,
  className,
}: PipelineSelectProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);

  const items = useMemo(() => {
    if (value === '' || options.some((option) => option.value === value)) {
      return options;
    }
    return [...options, { value, label: `${value}（自定义）` }];
  }, [options, value]);

  const current = items.find((option) => option.value === value) ?? null;

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const width = Math.min(
      Math.max(Math.round(rect.width), menuWidth),
      window.innerWidth - 16,
    );
    const left = Math.min(
      Math.max(8, Math.round(rect.left)),
      Math.max(8, window.innerWidth - width - 8),
    );
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const dropUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(320, dropUp ? spaceAbove : spaceBelow));
    setPlacement(
      dropUp
        ? { left, bottom: window.innerHeight - rect.top + 8, width, maxHeight, dropUp }
        : { left, top: rect.bottom + 8, width, maxHeight, dropUp },
    );
    setActive(Math.max(0, items.findIndex((option) => option.value === value)));
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  };

  const commit = (option: PipelineSelectOption | undefined) => {
    if (!option) {
      return;
    }
    onChange(option.value);
    close(true);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close(true);
      }
    };
    const handleViewportChange = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('wheel', handleViewportChange, { passive: true });
    window.addEventListener('resize', handleViewportChange);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('wheel', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    menuRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const node = menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((index) => (index + 1) % items.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((index) => (index - 1 + items.length) % items.length);
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(items.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(items[active]);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        break;
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => (open ? close(true) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            openMenu();
          }
        }}
        className={cn(
          'group/select flex min-w-0 items-center gap-1.5 text-left outline-none transition',
          variant === 'card'
            ? 'h-8 w-full rounded-md border border-mist-100/[0.12] bg-ink-950/70 px-2.5 text-[0.74rem] font-medium text-mist-200 hover:border-mist-100/[0.24] hover:text-mist-100'
            : 'w-full justify-between rounded-lg border border-mist-100/[0.1] bg-ink-950/50 px-2.5 py-2 text-[0.8rem] text-mist-200 hover:border-mist-100/[0.18]',
          open &&
            (variant === 'card'
              ? 'border-brass-400/50 bg-ink-950/95 text-mist-100 shadow-[0_0_0_3px_rgba(230,189,122,0.07)]'
              : 'border-brass-400/45 bg-ink-950/80 shadow-[0_0_0_3px_rgba(230,189,122,0.08)]'),
          className,
        )}
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            current === null && 'text-mist-600',
          )}
        >
          {current?.label ?? (value === '' ? '未设置' : value)}
        </span>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-mist-600 transition-transform duration-200 group-hover/select:text-mist-400',
            open && 'rotate-180 text-brass-300',
          )}
          strokeWidth={2}
        />
      </button>

      {open &&
        placement &&
        createPortal(
          <motion.div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={handleMenuKeyDown}
            style={{
              left: placement.left,
              width: placement.width,
              maxHeight: placement.maxHeight,
              ...(placement.top !== undefined
                ? { top: placement.top }
                : { bottom: placement.bottom }),
            }}
            className={cn(
              'fixed z-[80] overflow-y-auto overscroll-contain rounded-xl border border-mist-100/[0.12] bg-ink-900/95 p-2 shadow-[0_28px_80px_-24px_rgba(0,0,0,0.95)] outline-none backdrop-blur-xl',
              placement.dropUp ? 'origin-bottom' : 'origin-top',
            )}
          >
            {menuTitle && (
              <p className="px-2 pb-1.5 pt-1 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-mist-600">
                {menuTitle}
              </p>
            )}
            {items.map((option, index) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value === '' ? '__empty' : option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-index={index}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => commit(option)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition',
                    selected
                      ? 'bg-brass-400/[0.12] text-brass-200'
                      : active === index
                        ? 'bg-mist-100/[0.06] text-mist-100'
                        : 'text-mist-300',
                  )}
                >
                  <span
                    className={cn(
                      'h-7 w-0.5 shrink-0 rounded-full transition',
                      selected ? 'bg-brass-300' : 'bg-transparent',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.84rem] leading-5">
                      {option.label}
                    </span>
                    {option.value !== '' && (
                      <span
                        className={cn(
                          'mt-0.5 block truncate font-mono text-[0.64rem] leading-4',
                          selected ? 'text-brass-200/70' : 'text-mist-600',
                        )}
                      >
                        {option.value}
                      </span>
                    )}
                  </span>
                  <Check
                    className={cn(
                      'size-3.5 shrink-0',
                      selected ? 'text-brass-300' : 'text-transparent',
                    )}
                    strokeWidth={2.2}
                  />
                </button>
              );
            })}
          </motion.div>,
          document.body,
        )}
    </>
  );
}
