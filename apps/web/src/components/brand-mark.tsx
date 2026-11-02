import { useId } from 'react';
import { cn } from '@/lib/cn';

interface BrandMarkProps {
  className?: string;
  compact?: boolean;
}

export function BrandMark({ className, compact = false }: BrandMarkProps) {
  const gradientId = useId();

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="relative grid size-10 shrink-0 place-items-center rounded-[0.9rem] border border-brass-400/25 bg-ink-900/80 shadow-[inset_0_1px_0_rgba(244,239,230,0.08)]">
        <svg viewBox="0 0 32 32" className="size-6" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
              <stop stopColor="#F7E5BF" />
              <stop offset="1" stopColor="#B9853F" />
            </linearGradient>
          </defs>
          <path
            d="M16 4.5c4.6 5.4 8 9.6 8 13.8A8 8 0 0 1 8 18.3c0-4.2 3.4-8.5 8-13.8Z"
            fill={`url(#${gradientId})`}
          />
          <circle cx="16" cy="19" r="2.4" fill="#0B1118" opacity="0.5" />
        </svg>
        <span className="pointer-events-none absolute inset-0 rounded-[0.9rem] ring-1 ring-inset ring-mist-100/5" />
      </span>
      {!compact && (
        <span className="font-display text-[1.05rem] font-semibold tracking-[0.18em] text-mist-100">
          ink<span className="text-brass-400">seek</span>
        </span>
      )}
    </div>
  );
}
