import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

export function useClampedOverflow<T extends HTMLElement>(content: string) {
  const ref = useRef<T>(null);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      setOverflow(false);
      return undefined;
    }

    const measure = () => {
      setOverflow(element.scrollHeight - element.clientHeight > 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [content]);

  return { ref, overflow };
}

export function ExpandButton({
  active,
  onClick,
  className,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      tabIndex={active ? 0 : -1}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'shrink-0 rounded-sm font-mono text-[0.55rem] tracking-[0.08em] text-brass-300/85 transition hover:text-brass-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass-400/50',
        active ? 'pointer-events-auto' : 'pointer-events-none',
        className,
      )}
    >
      [ 展开 ]
    </button>
  );
}

export function PersonaTextDialog({
  open,
  title,
  text,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
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
  }, [open, onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="persona-text-dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[130] flex items-center justify-center bg-[#05090e]/70 p-4 backdrop-blur-sm"
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="glass-panel relative flex max-h-[min(82dvh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[1.4rem] border border-mist-100/10 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.75)] outline-none"
          >
            <div className="flex items-start justify-between gap-4 border-b border-mist-100/[0.07] px-5 py-4">
              <div className="min-w-0">
                <p className="font-mono text-[0.52rem] uppercase tracking-[0.22em] text-brass-400/70">
                  Persona Detail
                </p>
                <h3
                  id={titleId}
                  className="mt-1 truncate font-display text-[1.05rem] font-semibold tracking-tight text-mist-100"
                >
                  {title}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭完整内容"
                className="rounded-lg p-1.5 text-mist-500 transition hover:bg-mist-100/5 hover:text-mist-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/40"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
              <p className="whitespace-pre-wrap break-words text-[0.82rem] leading-7 text-mist-300">
                {text}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
