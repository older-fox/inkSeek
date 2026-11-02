import {
  ChevronRight,
  Compass,
  FileCode2,
  Fingerprint,
  Gauge,
  Globe2,
  Layers,
  MessageSquareQuote,
  MoonStar,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChannelAvatar, PlatformChip } from '@/components/connection-bits';
import { cn } from '@/lib/cn';
import {
  PERSONA_ATTRIBUTE_COUNT,
  PERSONA_GROUPS,
  personaForChannel,
  type ChannelPersona,
  type PersonaField,
  type PersonaGroup,
  type PersonaValue,
} from '@/lib/channel-persona';
import type { Channel } from '@/lib/connections';

const EASE = [0.22, 1, 0.36, 1] as const;

const GROUP_ICONS: Record<string, LucideIcon> = {
  identity: Fingerprint,
  world: Globe2,
  values: Compass,
  voice: MessageSquareQuote,
  rhythm: MoonStar,
  baselines: Gauge,
  boundaries: ShieldCheck,
  meta: FileCode2,
};

const GROUP_FIELD_COUNTS: Record<string, number> = Object.fromEntries(
  PERSONA_GROUPS.map((group) => [
    group.id,
    group.sections.reduce((total, section) => total + section.fields.length, 0),
  ]),
);

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '—';
  }
  if (seconds >= 86400) {
    const days = seconds / 86400;
    return `${Number.isInteger(days) ? days : days.toFixed(1)} 天`;
  }
  if (seconds >= 3600) {
    const hours = seconds / 3600;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`;
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)} 分钟`;
  }
  return `${seconds} 秒`;
}

function PersonaFieldValue({
  field,
  value,
}: {
  field: PersonaField;
  value: PersonaValue | undefined;
}) {
  if (value === undefined) {
    return <p className="mt-1.5 text-[0.68rem] text-mist-600">未同步</p>;
  }

  switch (field.kind) {
    case 'score': {
      const numeric = typeof value === 'number' ? value : Number(value);
      const score = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;

      return (
        <div className="mt-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-[1.05rem] font-semibold leading-none tabular-nums text-mist-100">
              {score}
            </span>
            <span className="font-mono text-[0.44rem] uppercase tracking-[0.14em] text-mist-600">
              / 100
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-950/60">
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 0.5, ease: EASE }}
              className={cn(
                'block h-full rounded-full',
                score >= 65
                  ? 'bg-gradient-to-r from-jade-400/70 to-jade-300'
                  : 'bg-gradient-to-r from-brass-400/70 to-brass-300',
              )}
            />
          </div>
        </div>
      );
    }
    case 'tags': {
      const items = Array.isArray(value) ? value : [String(value)];

      return (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="rounded-md border border-mist-100/[0.07] bg-ink-950/30 px-1.5 py-0.5 text-[0.62rem] leading-5 text-mist-400"
            >
              {item}
            </span>
          ))}
        </div>
      );
    }
    case 'duration': {
      const numeric = typeof value === 'number' ? value : Number(value);

      return (
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="font-display text-[0.95rem] font-semibold tabular-nums text-mist-100">
            {formatDuration(numeric)}
          </span>
          <span className="font-mono text-[0.46rem] text-mist-600">{numeric}s</span>
        </div>
      );
    }
    case 'number': {
      const numeric = typeof value === 'number' ? value : Number(value);

      if (!Number.isFinite(numeric)) {
        return <p className="mt-1.5 text-[0.72rem] text-mist-300">{String(value)}</p>;
      }

      return (
        <p className="mt-1.5 flex items-baseline gap-1 font-display text-[1rem] font-semibold tabular-nums text-mist-100">
          {numeric}
          {field.suffix ? (
            <span className="font-mono text-[0.5rem] font-normal text-mist-600">
              {field.suffix}
            </span>
          ) : null}
        </p>
      );
    }
    case 'boolean': {
      const active = value === true || value === 'true';

      return (
        <span
          className={cn(
            'mt-2 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.1em]',
            active
              ? 'border-jade-400/25 bg-jade-400/[0.08] text-jade-300'
              : 'border-mist-100/[0.08] bg-ink-950/30 text-mist-500',
          )}
        >
          <span
            className={cn('size-1 rounded-full', active ? 'bg-jade-400' : 'bg-mist-600')}
            aria-hidden="true"
          />
          {active ? '是' : '否'}
        </span>
      );
    }
    case 'quote':
      return (
        <p className="mt-2 border-l-2 border-brass-400/45 pl-3 text-[0.8rem] leading-6 text-mist-200">
          「{String(value)}」
        </p>
      );
    case 'paragraph':
      return (
        <p className="mt-1.5 whitespace-pre-line text-[0.72rem] leading-6 text-mist-400">
          {String(value)}
        </p>
      );
    case 'code':
      return (
        <p className="mt-1.5 break-words font-mono text-[0.68rem] leading-5 tracking-[0.02em] text-brass-300/90">
          {String(value)}
        </p>
      );
    default:
      return <p className="mt-1.5 text-[0.72rem] leading-5 text-mist-300">{String(value)}</p>;
  }
}

function PersonaFieldCard({
  field,
  value,
}: {
  field: PersonaField;
  value: PersonaValue | undefined;
}) {
  return (
    <div
      title={`${field.label} · ${field.hint}`}
      className={cn(
        'rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3.5 py-3 transition hover:border-mist-100/[0.12]',
        field.wide && 'md:col-span-2',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="shrink-0 text-[0.66rem] font-medium text-mist-400">{field.label}</span>
        <code className="min-w-0 break-all text-right font-mono text-[0.44rem] leading-4 text-mist-600">
          {field.key}
        </code>
      </div>
      <PersonaFieldValue field={field} value={value} />
    </div>
  );
}

function GroupSection({ group, persona }: { group: PersonaGroup; persona: ChannelPersona }) {
  return (
    <div className="space-y-5">
      {group.sections.map((section) => (
        <section key={section.id}>
          {section.title ? (
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[0.5rem] uppercase tracking-[0.2em] text-mist-600">
                {section.title}
              </span>
              <span className="h-px flex-1 bg-mist-100/[0.06]" />
            </div>
          ) : null}
          <div className="grid grid-flow-row-dense gap-2 md:grid-cols-2 xl:grid-cols-3">
            {section.fields.map((field) => (
              <PersonaFieldCard key={field.key} field={field} value={persona.values[field.key]} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ChannelPersonaPanel({
  channel,
  onClose,
}: {
  channel: Channel | null;
  onClose: () => void;
}) {
  const [activeGroupId, setActiveGroupId] = useState(PERSONA_GROUPS[0]?.id ?? '');
  const contentRef = useRef<HTMLDivElement>(null);
  const persona = channel ? personaForChannel(channel) : null;
  const activeGroup =
    PERSONA_GROUPS.find((group) => group.id === activeGroupId) ?? PERSONA_GROUPS[0];
  const activeCount = activeGroup ? (GROUP_FIELD_COUNTS[activeGroup.id] ?? 0) : 0;

  useEffect(() => {
    if (channel) {
      setActiveGroupId(PERSONA_GROUPS[0]?.id ?? '');
    }
  }, [channel]);

  useEffect(() => {
    if (!channel) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [channel, onClose]);

  useEffect(() => {
    const element = contentRef.current;
    if (element) {
      element.scrollTop = 0;
    }
  }, [activeGroupId]);

  if (typeof document === 'undefined' || !activeGroup) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {channel && persona && (
        <motion.div
          key="channel-persona"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[110] flex items-stretch justify-center bg-[#05090e]/70 backdrop-blur-sm sm:items-center sm:p-6"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="channel-persona-title"
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.99 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="relative flex h-dvh w-full flex-col overflow-hidden bg-ink-900 text-mist-100 sm:h-[min(92dvh,54rem)] sm:max-w-6xl sm:rounded-[1.6rem] sm:border sm:border-mist-100/10 sm:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.75)]"
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-44 opacity-70"
              style={{
                background:
                  channel.accent === 'jade'
                    ? 'radial-gradient(30rem 12rem at 16% 0%, var(--orb-jade), transparent 70%)'
                    : 'radial-gradient(30rem 12rem at 16% 0%, var(--orb-brass), transparent 70%)',
              }}
            />
            <div className="absolute inset-x-6 top-0 h-px hairline" />

            <header className="relative flex items-start gap-3.5 px-5 pb-4 pt-5 sm:items-center sm:px-7">
              <ChannelAvatar
                initials={channel.initials}
                accent={persona.accent}
                size="lg"
                online={channel.status === 'online'}
                className="hidden sm:grid"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[0.52rem] uppercase tracking-[0.26em] text-brass-400/75">
                    Channel Persona
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-jade-400/20 bg-jade-400/[0.07] px-2 py-0.5 font-mono text-[0.48rem] uppercase tracking-[0.12em] text-jade-300">
                    <span className="size-1 rounded-full bg-jade-400" aria-hidden="true" />
                    渠道独立快照
                  </span>
                </div>

                <h2
                  id="channel-persona-title"
                  className="mt-1.5 font-display text-[1.35rem] font-semibold leading-tight tracking-tight text-mist-100"
                >
                  {persona.name}
                  <span className="ml-2 align-middle font-mono text-[0.5rem] font-normal uppercase tracking-[0.14em] text-mist-600">
                    {persona.id}
                  </span>
                </h2>
                <p className="mt-1 text-[0.74rem] leading-6 text-mist-500">
                  {persona.identity} · 「{persona.quote}」
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <PlatformChip platform={channel.platform} connector />
                  <span className="font-mono text-[0.52rem] tracking-[0.04em] text-mist-500">
                    {channel.displayName} · {channel.accountId}
                  </span>
                  <span className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-mist-600">
                    {PERSONA_ATTRIBUTE_COUNT} 项属性 · {PERSONA_GROUPS.length} 组
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="关闭人格数据面板"
                className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="relative flex min-h-0 flex-1 flex-col border-t border-mist-100/[0.06] md:flex-row">
              <nav
                aria-label="人格属性分组"
                className="flex shrink-0 gap-1 overflow-x-auto border-b border-mist-100/[0.06] px-2.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:w-[13.5rem] md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:px-2.5 md:py-3"
              >
                {PERSONA_GROUPS.map((group) => {
                  const Icon = GROUP_ICONS[group.id] ?? Layers;
                  const active = group.id === activeGroup.id;

                  return (
                    <button
                      key={group.id}
                      type="button"
                      data-active={active ? 'true' : 'false'}
                      onClick={() => setActiveGroupId(group.id)}
                      className={cn(
                        'group flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition md:w-full',
                        active
                          ? 'bg-brass-400/[0.09] text-brass-200'
                          : 'text-mist-500 hover:bg-mist-100/[0.04] hover:text-mist-300',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-7 shrink-0 place-items-center rounded-lg border transition',
                          active
                            ? 'border-brass-400/30 bg-brass-400/10 text-brass-300'
                            : 'border-mist-100/[0.07] bg-ink-950/30 text-mist-600 group-hover:text-mist-400',
                        )}
                      >
                        <Icon className="size-3.5" strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block whitespace-nowrap text-[0.7rem] md:truncate">
                          {group.title}
                        </span>
                        <span className="mt-0.5 hidden font-mono text-[0.46rem] uppercase tracking-[0.12em] text-mist-600 md:block">
                          {group.code} · {GROUP_FIELD_COUNTS[group.id] ?? 0} 项
                        </span>
                      </span>
                      <ChevronRight
                        className={cn(
                          'hidden size-3 shrink-0 md:block',
                          active ? 'text-brass-300' : 'text-mist-600/60',
                        )}
                        strokeWidth={2}
                      />
                    </button>
                  );
                })}
              </nav>

              <div
                ref={contentRef}
                className="min-h-0 flex-1 overflow-y-auto px-4 py-5 [scrollbar-width:thin] sm:px-7 sm:py-6"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={activeGroup.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, ease: EASE }}
                  >
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[0.52rem] uppercase tracking-[0.24em] text-brass-400/75">
                          {activeGroup.code} — {activeGroup.eyebrow}
                        </p>
                        <h3 className="mt-1.5 font-display text-[1.2rem] font-semibold tracking-tight text-mist-100">
                          {activeGroup.title}
                        </h3>
                        <p className="mt-1 max-w-2xl text-[0.72rem] leading-6 text-mist-500">
                          {activeGroup.description}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-mist-100/[0.08] bg-ink-950/30 px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-mist-500">
                        {activeCount} 项
                      </span>
                    </div>

                    <div className="mt-4">
                      <GroupSection group={activeGroup} persona={persona} />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <footer className="relative flex flex-wrap items-center justify-between gap-2 border-t border-mist-100/[0.06] px-5 py-3 sm:px-7">
              <p className="font-mono text-[0.47rem] uppercase tracking-[0.16em] text-mist-600">
                Mock snapshot · A2–A9 · {PERSONA_ATTRIBUTE_COUNT} attributes
              </p>
              <p className="text-[0.6rem] text-mist-600">仅属于该渠道，不与其他渠道共享</p>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
