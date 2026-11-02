import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, error, hint, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={htmlFor}
          className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-mist-500"
        >
          {label}
        </label>
        {hint && <span className="text-[0.68rem] text-mist-600">{hint}</span>}
      </div>
      {children}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-signal-400">
          <TriangleAlert className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

interface InputShellProps {
  icon?: ReactNode;
  trailing?: ReactNode;
  invalid?: boolean;
  children: ReactNode;
  className?: string;
}

export function InputShell({ icon, trailing, invalid, children, className }: InputShellProps) {
  return (
    <div className={cn('field-shell', className)} data-invalid={invalid ? 'true' : 'false'}>
      {icon && <span className="shrink-0 text-mist-500">{icon}</span>}
      {children}
      {trailing}
    </div>
  );
}
