import { cn } from '@/lib/cn';

interface InkBackdropProps {
  className?: string;
  subtle?: boolean;
}

/**
 * Decorative ink-wash background: drifting glow orbs, grid hairlines and a
 * faint concentric seal. Purely visual, so it stays hidden from assistive tech.
 */
export function InkBackdrop({ className, subtle = false }: InkBackdropProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <div className={cn('absolute inset-0 ink-grid', subtle ? 'opacity-30' : 'opacity-60')} />

      <div
        className={cn(
          'absolute -left-48 -top-56 size-[46rem] rounded-full blur-3xl animate-drift-a',
          subtle ? 'opacity-50' : 'opacity-100',
        )}
        style={{
          background:
            'radial-gradient(circle at center, var(--orb-brass), var(--orb-brass-inner) 46%, transparent 68%)',
        }}
      />

      <div
        className={cn(
          'absolute -right-56 top-[18%] size-[40rem] rounded-full blur-3xl animate-drift-b',
          subtle ? 'opacity-40' : 'opacity-90',
        )}
        style={{
          background:
            'radial-gradient(circle at center, var(--orb-jade), var(--orb-jade-inner) 48%, transparent 68%)',
        }}
      />

      <div
        className="absolute bottom-[-18rem] left-[30%] size-[34rem] rounded-full blur-3xl animate-drift-a"
        style={{
          background: 'radial-gradient(circle at center, var(--orb-amber), transparent 66%)',
          animationDelay: '-7s',
        }}
      />

      <div className="absolute inset-x-0 top-[16%] h-px hairline opacity-40" />
      <div className="absolute inset-y-0 left-[58%] hidden w-px bg-gradient-to-b from-transparent via-mist-100/5 to-transparent lg:block" />

      <svg
        className="absolute -right-24 top-1/2 hidden size-[34rem] -translate-y-1/2 text-brass-400/10 lg:block"
        viewBox="0 0 400 400"
        fill="none"
      >
        {[60, 96, 132, 168, 204].map((radius) => (
          <circle
            key={radius}
            cx="200"
            cy="200"
            r={radius}
            stroke="currentColor"
            strokeWidth="0.75"
            strokeDasharray={radius % 72 === 0 ? '2 6' : undefined}
          />
        ))}
        <circle cx="200" cy="200" r="3" fill="currentColor" />
      </svg>
    </div>
  );
}
