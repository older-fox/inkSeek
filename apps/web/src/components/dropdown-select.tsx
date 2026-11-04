import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownCreate {
  /** Section label above the input, e.g. 新建变量. */
  label?: string;
  placeholder?: string;
  maxLength?: number;
  /** Returns an error message, or `null` when the value is acceptable. */
  validate?: (value: string) => string | null;
  /** Persist the option here; the dropdown selects it right after. */
  onCreate: (value: string) => void;
}

interface DropdownSelectProps {
  value: string;
  options: readonly DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  /** `card` is a compact trigger; `field` fills a form row. */
  variant?: 'card' | 'field';
  menuTitle?: string;
  menuWidth?: number;
  className?: string;
  /** Shown when no option is selected; defaults to 未设置. */
  placeholder?: string;
  /** Show the raw value under each label. Disable for id/value pairs. */
  showValue?: boolean;
  /** Renders an inline create row at the bottom of the menu. */
  create?: DropdownCreate;
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
export function DropdownSelect({
  value,
  options,
  onChange,
  ariaLabel,
  variant = 'field',
  menuTitle,
  menuWidth = 280,
  className,
  placeholder = '未设置',
  showValue = true,
  create,
}: DropdownSelectProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);

  const items = useMemo(() => {
    if (value === '' || options.some((option) => option.value === value)) {
      return options;
    }
    return [...options, { value, label: `${value}（自定义）` }];
  }, [options, value]);

  /** Long catalogs (e.g. persona parameters) get a filter box above the list. */
  const searchable = items.length > 14;
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!searchable || keyword.length === 0) {
      return items;
    }
    return items.filter(
      (option) =>
        option.label.toLowerCase().includes(keyword) ||
        option.value.toLowerCase().includes(keyword),
    );
  }, [items, query, searchable]);

  const current = items.find((option) => option.value === value) ?? null;

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const width = Math.min(Math.max(Math.round(rect.width), menuWidth), window.innerWidth - 16);
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
    setQuery('');
    setActive(
      Math.max(
        0,
        items.findIndex((option) => option.value === value),
      ),
    );
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (refocus) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  };

  const commit = (option: DropdownOption | undefined) => {
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
    if (searchable) {
      searchRef.current?.focus({ preventScroll: true });
      return;
    }
    menuRef.current?.focus({ preventScroll: true });
  }, [open, searchable]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const node = menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active, open, filtered]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (filtered.length === 0) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((index) => (index + 1) % filtered.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((index) => (index - 1 + filtered.length) % filtered.length);
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(filtered.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(filtered[active]);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        break;
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // The search box owns the keyboard while focused; without this the menu's
    // own handler would apply the same arrow/enter a second time.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close(false);
      return;
    }
    if (filtered.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((index) => (index + 1) % filtered.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((index) => (index - 1 + filtered.length) % filtered.length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        commit(filtered[active]);
      }
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
        <span className={cn('min-w-0 flex-1 truncate', current === null && 'text-mist-600')}>
          {current?.label ?? (value === '' ? placeholder : value)}
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
            {searchable && (
              <div className="sticky top-0 z-10 -mx-2 -mt-2 mb-1 border-b border-mist-100/[0.08] bg-ink-900/95 px-2 pb-2 pt-2 backdrop-blur-xl">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-mist-600"
                    strokeWidth={1.9}
                  />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActive(0);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="搜索选项"
                    aria-label={`搜索${ariaLabel}`}
                    spellCheck={false}
                    className="w-full rounded-md border border-mist-100/[0.12] bg-ink-950/70 py-1.5 pl-7 pr-2 text-[0.74rem] text-mist-200 outline-none transition placeholder:text-mist-600 focus:border-brass-400/45"
                  />
                </div>
              </div>
            )}
            {menuTitle && (
              <p className="px-2 pb-1.5 pt-1 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-mist-600">
                {menuTitle}
              </p>
            )}
            {searchable && filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-[0.66rem] text-mist-600">没有匹配的选项</p>
            )}
            {filtered.map((option, index) => {
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
                    <span className="block truncate text-[0.84rem] leading-5">{option.label}</span>
                    {showValue && option.value !== '' && (
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
            {create && (
              <CreateRow
                create={create}
                onCommit={(next) => {
                  onChange(next);
                  close(true);
                }}
              />
            )}
          </motion.div>,
          document.body,
        )}
    </>
  );
}

function CreateRow({
  create,
  onCommit,
}: {
  create: DropdownCreate;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const value = draft.trim();
    if (value === '') {
      setError('请输入名称');
      return;
    }
    const message = create.validate?.(value) ?? null;
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    create.onCreate(value);
    onCommit(value);
  };

  return (
    <div
      className="sticky bottom-0 -mx-2 -mb-2 mt-1 border-t border-mist-100/[0.08] bg-ink-900/95 px-2 pb-2 pt-2 backdrop-blur-xl"
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          // Let the menu's own handlers close it and move focus.
          return;
        }
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      }}
    >
      <p className="px-1 pb-1.5 font-mono text-[0.52rem] uppercase tracking-[0.18em] text-mist-600">
        {create.label ?? '新建'}
      </p>
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          placeholder={create.placeholder ?? '输入名称'}
          maxLength={create.maxLength}
          spellCheck={false}
          aria-label={create.label ?? '新建选项'}
          className={cn(
            'min-w-0 flex-1 rounded-md border bg-ink-950/70 px-2 py-1.5 font-mono text-[0.72rem] text-mist-200 outline-none transition placeholder:text-mist-600',
            error ? 'border-signal-400/50' : 'border-mist-100/[0.12] focus:border-brass-400/45',
          )}
        />
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={submit}
          className="flex shrink-0 items-center gap-1 rounded-md border border-brass-400/30 bg-brass-400/[0.08] px-2 py-1.5 text-[0.62rem] text-brass-200 transition hover:border-brass-400/60 hover:bg-brass-400/[0.14]"
        >
          <Plus className="size-3" strokeWidth={2} />
          创建
        </button>
      </div>
      {error && <p className="mt-1 px-1 text-[0.55rem] text-signal-400">{error}</p>}
    </div>
  );
}
