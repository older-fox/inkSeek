import { cn } from '@/lib/cn';
import { PLATFORMS, type ChannelAccent, type PlatformId } from '@/lib/connections';

const ACCENT_SURFACE: Record<ChannelAccent, string> = {
  brass:
    'border-brass-400/25 bg-gradient-to-br from-brass-400/25 via-brass-400/10 to-transparent text-brass-300',
  jade:
    'border-jade-400/25 bg-gradient-to-br from-jade-400/25 via-jade-400/10 to-transparent text-jade-300',
};

const AVATAR_SIZE = {
  sm: 'size-9 rounded-xl text-[0.78rem]',
  md: 'size-12 rounded-2xl text-[1.05rem]',
  lg: 'size-14 rounded-[1.1rem] text-xl',
} as const;

interface ChannelAvatarProps {
  initials: string;
  accent: ChannelAccent;
  size?: keyof typeof AVATAR_SIZE;
  online?: boolean;
  className?: string;
}

export function ChannelAvatar({
  initials,
  accent,
  size = 'md',
  online = false,
  className,
}: ChannelAvatarProps) {
  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center border font-display font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
        AVATAR_SIZE[size],
        ACCENT_SURFACE[accent],
        className,
      )}
      aria-hidden="true"
    >
      {initials.slice(0, 1)}
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full border-2 border-ink-900 bg-jade-400">
          <span className="size-1 rounded-full bg-ink-950/70" />
        </span>
      )}
    </span>
  );
}

interface PlatformChipProps {
  platform: PlatformId;
  connector?: boolean;
  className?: string;
}

export function PlatformChip({ platform, connector = false, className }: PlatformChipProps) {
  const definition = PLATFORMS[platform];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-mist-100/10 bg-ink-950/30 px-2 py-0.5',
        'font-mono text-[0.52rem] uppercase tracking-[0.12em] text-mist-500',
        className,
      )}
    >
      <span
        className={cn(
          'grid size-4 place-items-center rounded-[0.3rem] border text-[0.44rem] font-semibold tracking-normal',
          definition.accent === 'jade'
            ? 'border-jade-400/25 bg-jade-400/10 text-jade-300'
            : 'border-brass-400/25 bg-brass-400/10 text-brass-300',
        )}
      >
        {definition.short}
      </span>
      <span className="text-mist-400">{definition.name}</span>
      {connector && <span className="text-mist-600">· {definition.connector}</span>}
    </span>
  );
}

export function SyncPill({ label = '同步中', className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-jade-400/20 bg-jade-400/[0.07] px-2 py-0.5',
        'font-mono text-[0.52rem] uppercase tracking-[0.14em] text-jade-300',
        className,
      )}
    >
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-jade-400 opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-jade-400" />
      </span>
      {label}
    </span>
  );
}
