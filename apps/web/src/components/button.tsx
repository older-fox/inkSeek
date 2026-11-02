import { LoaderCircle } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ButtonProps extends ComponentProps<'button'> {
  loading?: boolean;
  icon?: ReactNode;
}

export function PrimaryButton({
  children,
  className,
  loading = false,
  disabled,
  icon,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl',
        'bg-gradient-to-r from-brass-soft via-brass-mid to-brass-deep',
        'font-display text-sm font-semibold tracking-wide text-on-brass',
        'shadow-[0_18px_38px_-18px_rgba(230,189,122,0.65)] transition',
        'hover:brightness-105 active:translate-y-px',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0',
        className,
      )}
    >
      {!loading && (
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-0 transition group-hover:translate-x-full group-hover:opacity-100 group-hover:duration-700" />
      )}
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}

export function GhostButton({ children, className, disabled, ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={cn(
        'flex h-10 items-center justify-center gap-2 rounded-lg border border-mist-100/10 px-3 text-sm text-mist-300',
        'transition hover:border-brass-400/30 hover:bg-mist-100/5 hover:text-mist-100 disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}
