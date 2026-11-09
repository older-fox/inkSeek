import { cn } from '@/lib/cn';
import {
  PLATFORMS,
  type ChannelAccent,
  type ChannelStatus,
  type PlatformId,
} from '@/lib/connections';

const ACCENT_SURFACE: Record<ChannelAccent, string> = {
  brass:
    'border-brass-400/25 bg-gradient-to-br from-brass-400/25 via-brass-400/10 to-transparent text-brass-300',
  jade: 'border-jade-400/25 bg-gradient-to-br from-jade-400/25 via-jade-400/10 to-transparent text-jade-300',
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
  src?: string | null;
  title?: string;
  className?: string;
}

/**
 * Square channel avatar: remote image when available, otherwise the first
 * character of the initials on an accent-tinted surface.
 */
export function ChannelAvatar({
  initials,
  accent,
  size = 'md',
  src,
  title,
  className,
}: ChannelAvatarProps) {
  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden border font-display font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
        AVATAR_SIZE[size],
        ACCENT_SURFACE[accent],
        className,
      )}
      title={title}
      aria-hidden="true"
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : (
        initials.slice(0, 1)
      )}
    </span>
  );
}

interface PlatformChipProps {
  platform: PlatformId;
  connector?: boolean;
  className?: string;
}

/**
 * Compact platform badge; `connector` appends the bridge name (e.g. NapCat)
 * so rows make clear which adapter carries the channel.
 */
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

/** Jade pill with a pulsing dot used while a channel is syncing. */
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

const STATUS_SURFACE: Record<ChannelStatus, { label: string; className: string }> = {
  online: {
    label: '在线',
    className: 'border-jade-400/20 bg-jade-400/[0.07] text-jade-300',
  },
  connecting: {
    label: '连接中',
    className: 'border-brass-400/25 bg-brass-400/[0.08] text-brass-300',
  },
  offline: {
    label: '离线',
    className: 'border-mist-100/10 bg-ink-950/30 text-mist-500',
  },
  error: {
    label: '连接异常',
    className: 'border-signal-400/25 bg-signal-400/[0.08] text-signal-400',
  },
};

/**
 * Status pill for a channel connection, color-coded per state with a dot that
 * pulses only while online or connecting.
 */
export function ConnectionStatusPill({
  status,
  className,
}: {
  status: ChannelStatus;
  className?: string;
}) {
  const tone = STATUS_SURFACE[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5',
        'font-mono text-[0.52rem] uppercase tracking-[0.14em]',
        tone.className,
        className,
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          status === 'online' && 'animate-pulse bg-jade-400',
          status === 'connecting' && 'animate-pulse bg-brass-400',
          status === 'offline' && 'bg-mist-600',
          status === 'error' && 'bg-signal-400',
        )}
      />
      {tone.label}
    </span>
  );
}
