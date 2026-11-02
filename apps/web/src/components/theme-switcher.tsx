import { Check, Palette } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { THEMES, getThemeDefinition, useTheme } from '@/lib/theme';

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = getThemeDefinition(theme);

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

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`切换颜色主题，当前${active.name}`}
        title="切换颜色主题"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'relative grid size-9 shrink-0 place-items-center rounded-full border border-mist-100/10 bg-ink-900/60 text-mist-300 backdrop-blur-md transition',
          'hover:border-brass-400/35 hover:text-brass-300',
          open && 'border-brass-400/40 text-brass-300',
        )}
      >
        <Palette className="size-4" strokeWidth={1.8} />
        <span
          className="absolute bottom-1.5 right-1.5 size-1.5 rounded-full ring-1 ring-ink-950/40"
          style={{ backgroundColor: active.preview.accent }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="颜色主题"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel absolute right-0 top-[2.85rem] z-50 w-[16.5rem] origin-top-right rounded-2xl p-1.5"
          >
            <p className="px-2.5 pb-1.5 pt-2 font-mono text-[0.56rem] uppercase tracking-[0.26em] text-mist-600">
              Appearance
            </p>

            {THEMES.map((item) => {
              const selected = item.id === theme;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    setTheme(item.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition',
                    selected ? 'bg-mist-100/[0.07]' : 'hover:bg-mist-100/[0.04]',
                  )}
                >
                  <span
                    className="relative size-8 shrink-0 overflow-hidden rounded-lg border border-mist-100/10 shadow-sm"
                    style={{ backgroundColor: item.preview.base }}
                  >
                    <span
                      className="absolute right-1 top-1 h-3.5 w-4 rounded-sm opacity-90"
                      style={{ backgroundColor: item.preview.panel }}
                    />
                    <span
                      className="absolute bottom-1 left-1 size-2 rounded-full"
                      style={{ backgroundColor: item.preview.accent }}
                    />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[0.8rem] font-medium text-mist-200">
                      {item.name}
                      <span className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-mist-600">
                        {item.scheme === 'light' ? 'Light' : 'Dark'}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[0.64rem] text-mist-600">
                      {item.description}
                    </span>
                  </span>

                  {selected && <Check className="size-3.5 shrink-0 text-brass-300" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
