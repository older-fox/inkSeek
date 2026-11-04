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
  Pencil,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import type { ChatChannelPersonaStateSnapshot, ChatPersonaValue } from '@inkseek/shared';
import { ChannelAvatar, PlatformChip } from '@/components/connection-bits';
import { TimeZonePicker } from '@/components/persona-form-controls';
import { PersonaRevisionList } from '@/components/persona-revision-list';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  PERSONA_ATTRIBUTE_COUNT,
  PERSONA_FIELD_LABELS,
  PERSONA_GROUPS,
  isStateField,
  mergeStateValues,
  personaForChannel,
  readChannelPersonaOverrides,
  clearChannelPersonaOverrides,
  stateFieldInput,
  stateMoodLabel,
  type PersonaField,
  type PersonaGroup,
  type PersonaValue,
} from '@/lib/channel-persona';
import type { Channel } from '@/lib/connections';
import { PERSONA_TIMEZONE_OPTIONS } from '@/lib/persona-draft';
import { chatChannelsQuery } from '@/lib/queries';
import {
  appendPersonaHistory,
  formatPersonaValue,
  type PersonaMetadata,
} from '@/lib/persona-metadata';

const EASE = [0.22, 1, 0.36, 1] as const;

const EDITOR_INPUT =
  'w-full rounded-lg border border-brass-400/25 bg-ink-950/40 px-2.5 py-1.5 text-[0.8rem] leading-6 text-mist-100 outline-none transition placeholder:text-mist-600 focus:border-brass-400/50';

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

function textValue(
  values: Record<string, PersonaValue> | null,
  key: string,
  fallback: string,
): string {
  const value = values?.[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function EditorActions({
  disabled = false,
  onCancel,
  onCommit,
}: {
  disabled?: boolean;
  onCancel: () => void;
  onCommit: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-2 py-1 text-[0.7rem] text-mist-500 transition hover:bg-mist-100/[0.06] hover:text-mist-300"
      >
        取消
      </button>
      <button
        type="button"
        onClick={onCommit}
        disabled={disabled}
        className="rounded-md border border-brass-400/30 bg-brass-400/10 px-2.5 py-1 text-[0.7rem] text-brass-300 transition hover:bg-brass-400/[0.18] disabled:cursor-not-allowed disabled:opacity-40"
      >
        保存
      </button>
    </div>
  );
}

function PersonaFieldEditor({
  field,
  value,
  onCancel,
  onCommit,
}: {
  field: PersonaField;
  value: PersonaValue | undefined;
  onCancel: () => void;
  onCommit: (value: PersonaValue) => void;
}) {
  const [text, setText] = useState(() => {
    if (Array.isArray(value)) {
      return value.join(field.kind === 'list' ? '\n' : '，');
    }
    return value === undefined ? '' : String(value);
  });

  const numeric = Number(text);
  const numericValid = text.trim() !== '' && Number.isFinite(numeric);

  const commit = () => {
    switch (field.kind) {
      case 'tags':
        onCommit(
          text
            .split(/[,，]/)
            .map((item) => item.trim())
            .filter(Boolean),
        );
        return;
      case 'list':
        onCommit(
          text
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean),
        );
        return;
      case 'score':
        if (!numericValid) {
          return;
        }
        onCommit(Math.max(0, Math.min(100, Math.round(numeric))));
        return;
      case 'duration':
        if (!numericValid || numeric < 0) {
          return;
        }
        onCommit(Math.round(numeric));
        return;
      case 'number':
        if (!numericValid) {
          return;
        }
        onCommit(numeric);
        return;
      default:
        onCommit(text);
    }
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  };

  const handleTextareaKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit();
    }
  };

  if (field.kind === 'score') {
    const score = numericValid ? Math.max(0, Math.min(100, Math.round(numeric))) : 0;

    return (
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-2.5">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={score}
            aria-label={`${field.label}数值`}
            onChange={(event) => setText(event.target.value)}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-brass-400"
          />
          <span className="w-8 shrink-0 text-right font-display text-[1.05rem] font-semibold tabular-nums text-mist-100">
            {score}
          </span>
        </div>
        <EditorActions onCancel={onCancel} onCommit={commit} />
      </div>
    );
  }

  if (field.kind === 'number' || field.kind === 'duration') {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="any"
            min={field.kind === 'duration' ? 0 : undefined}
            value={text}
            autoFocus
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleInputKeyDown}
            className={EDITOR_INPUT}
          />
          {field.kind === 'duration' ? (
            <span className="shrink-0 text-[0.74rem] text-mist-500">秒</span>
          ) : field.suffix ? (
            <span className="shrink-0 text-[0.74rem] text-mist-500">{field.suffix}</span>
          ) : null}
        </div>
        <EditorActions
          disabled={!numericValid || (field.kind === 'duration' && numeric < 0)}
          onCancel={onCancel}
          onCommit={commit}
        />
      </div>
    );
  }

  if (field.kind === 'paragraph' || field.kind === 'code' || field.kind === 'list') {
    return (
      <div className="mt-2 space-y-2">
        <textarea
          rows={field.kind === 'list' ? 4 : 3}
          value={text}
          autoFocus
          placeholder={field.kind === 'list' ? '每行一条' : undefined}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          className={cn(
            EDITOR_INPUT,
            'resize-none',
            field.kind === 'code' && 'font-mono text-[0.78rem]',
          )}
        />
        <EditorActions onCancel={onCancel} onCommit={commit} />
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <input
        type="text"
        value={text}
        autoFocus
        placeholder={field.kind === 'tags' ? '用逗号分隔' : undefined}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleInputKeyDown}
        className={EDITOR_INPUT}
      />
      <EditorActions onCancel={onCancel} onCommit={commit} />
    </div>
  );
}

function SwitchFieldControl({
  field,
  value,
  onChange,
}: {
  field: PersonaField;
  value: PersonaValue | undefined;
  onChange: (value: PersonaValue) => void;
}) {
  const checked = value === true || value === 'true';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={field.label}
      onClick={() => onChange(!checked)}
      className={cn(
        'mt-2.5 flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-left transition',
        checked
          ? 'border-brass-400/35 bg-brass-400/[0.08] hover:bg-brass-400/[0.12]'
          : 'border-mist-100/[0.08] bg-ink-950/30 hover:border-mist-100/20',
      )}
    >
      <span
        className={cn(
          'text-[0.8rem] font-medium transition',
          checked ? 'text-brass-200' : 'text-mist-500',
        )}
      >
        {checked ? '开启' : '关闭'}
      </span>
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-brass-400/50 bg-brass-400/70' : 'border-mist-100/15 bg-ink-950/60',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

function LevelFieldControl({
  field,
  value,
  onChange,
}: {
  field: PersonaField;
  value: PersonaValue | undefined;
  onChange: (value: PersonaValue) => void;
}) {
  const levels = field.levels ?? [];

  if (levels.length === 0) {
    return null;
  }

  const max = levels.length - 1;
  const numeric = typeof value === 'number' ? value : Number(value);
  const index = Number.isFinite(numeric) ? Math.min(max, Math.max(0, Math.round(numeric))) : 0;
  const current = levels[index] ?? '';

  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.84rem] font-medium text-mist-200">{current}</span>
        <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-mist-600">
          {index + 1} / {levels.length}
        </span>
      </div>
      <div
        role="group"
        aria-label={field.label}
        className="mt-2 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` }}
      >
        {levels.map((label, levelIndex) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={levelIndex === index}
            onClick={() => onChange(levelIndex)}
            className={cn(
              'h-1.5 rounded-full transition',
              levelIndex <= index
                ? 'bg-gradient-to-r from-brass-400/80 to-brass-300'
                : 'bg-mist-100/12 hover:bg-mist-100/25',
            )}
          />
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[0.56rem] leading-4 text-mist-600">
        <span className="truncate">{levels[0]}</span>
        <span className="truncate text-right">{levels[max]}</span>
      </div>
    </div>
  );
}

function TimezoneFieldControl({
  field,
  value,
  onChange,
}: {
  field: PersonaField;
  value: PersonaValue | undefined;
  onChange: (value: PersonaValue) => void;
}) {
  return (
    <div className="mt-2.5">
      <TimeZonePicker
        id={`persona-inline-${field.key}`}
        label={field.label}
        value={typeof value === 'string' ? value : ''}
        options={PERSONA_TIMEZONE_OPTIONS}
        onChange={onChange}
        bare
      />
    </div>
  );
}

function PersonaFieldValue({
  field,
  value,
}: {
  field: PersonaField;
  value: PersonaValue | undefined;
}) {
  if (value === undefined) {
    return <p className="mt-1.5 text-[0.76rem] text-mist-600">未同步</p>;
  }

  switch (field.kind) {
    case 'score': {
      const numeric = typeof value === 'number' ? value : Number(value);
      const score = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;

      return (
        <div className="mt-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-[1.15rem] font-semibold leading-none tabular-nums text-mist-100">
              {score}
            </span>
            <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-mist-600">
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
              className="rounded-md border border-mist-100/[0.07] bg-ink-950/30 px-1.5 py-0.5 text-[0.7rem] leading-5 text-mist-400"
            >
              {item}
            </span>
          ))}
        </div>
      );
    }
    case 'list': {
      const items = Array.isArray(value) ? value : [String(value)];

      return (
        <ol className="mt-2 space-y-1">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="flex items-start gap-2 text-[0.8rem] leading-6 text-mist-300"
            >
              <span
                aria-hidden="true"
                className="mt-2 size-1 shrink-0 rounded-full bg-brass-400/70"
              />
              <span className="min-w-0 break-words">{item}</span>
            </li>
          ))}
        </ol>
      );
    }
    case 'duration': {
      const numeric = typeof value === 'number' ? value : Number(value);

      return (
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="font-display text-[1.05rem] font-semibold tabular-nums text-mist-100">
            {formatDuration(numeric)}
          </span>
          <span className="font-mono text-[0.56rem] text-mist-600">{numeric} 秒</span>
        </div>
      );
    }
    case 'number': {
      const numeric = typeof value === 'number' ? value : Number(value);

      if (!Number.isFinite(numeric)) {
        return <p className="mt-1.5 text-[0.8rem] text-mist-300">{String(value)}</p>;
      }

      return (
        <p className="mt-1.5 flex items-baseline gap-1 font-display text-[1.08rem] font-semibold tabular-nums text-mist-100">
          {numeric}
          {field.suffix ? (
            <span className="font-mono text-[0.6rem] font-normal text-mist-600">
              {field.suffix}
            </span>
          ) : null}
        </p>
      );
    }
    case 'quote':
      return (
        <p className="mt-2 border-l-2 border-brass-400/45 pl-3 text-[0.88rem] leading-7 text-mist-200">
          「{String(value)}」
        </p>
      );
    case 'paragraph':
      return (
        <p className="mt-1.5 whitespace-pre-line text-[0.8rem] leading-7 text-mist-400">
          {String(value)}
        </p>
      );
    case 'code':
      return (
        <p className="mt-1.5 break-words font-mono text-[0.76rem] leading-6 tracking-[0.02em] text-brass-300/90">
          {String(value)}
        </p>
      );
    default:
      return <p className="mt-1.5 text-[0.8rem] leading-6 text-mist-300">{String(value)}</p>;
  }
}

function PersonaFieldCard({
  field,
  value,
  onChange,
}: {
  field: PersonaField;
  value: PersonaValue | undefined;
  onChange: (value: PersonaValue) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inlineControl =
    field.kind === 'boolean' || field.kind === 'level' || field.kind === 'timezone';

  return (
    <div
      title={`${field.label} · ${field.hint}`}
      className={cn(
        'rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-4 py-3.5 transition hover:border-mist-100/[0.12]',
        field.wide && 'md:col-span-2',
        editing && 'border-brass-400/30 bg-ink-950/40',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="shrink-0 text-[0.74rem] font-medium text-mist-300">{field.label}</span>
        <div className="flex min-w-0 items-center justify-end gap-1">
          <code className="min-w-0 break-all text-right font-mono text-[0.54rem] leading-5 text-mist-600">
            {field.key}
          </code>
          {isStateField(field.key) ? (
            <span className="shrink-0 rounded border border-jade-400/20 bg-jade-400/[0.07] px-1 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-jade-300/80">
              实时
            </span>
          ) : null}
          {!editing && !inlineControl && !field.readonly && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`编辑 ${field.label}`}
              title="编辑"
              className="shrink-0 rounded-md p-1 text-mist-600 transition hover:bg-brass-400/10 hover:text-brass-300"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {field.kind === 'boolean' ? (
        <SwitchFieldControl field={field} value={value} onChange={onChange} />
      ) : field.kind === 'level' ? (
        <LevelFieldControl field={field} value={value} onChange={onChange} />
      ) : field.kind === 'timezone' ? (
        <TimezoneFieldControl field={field} value={value} onChange={onChange} />
      ) : editing ? (
        <PersonaFieldEditor
          field={field}
          value={value}
          onCancel={() => setEditing(false)}
          onCommit={(next) => {
            onChange(next);
            setEditing(false);
          }}
        />
      ) : (
        <PersonaFieldValue field={field} value={value} />
      )}
    </div>
  );
}

function GroupSection({
  group,
  values,
  onChange,
}: {
  group: PersonaGroup;
  values: Record<string, PersonaValue>;
  onChange: (key: string, value: PersonaValue) => void;
}) {
  return (
    <div className="space-y-5">
      {group.sections.map((section) => (
        <section key={section.id}>
          {section.title ? (
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-mist-600">
                {section.title}
              </span>
              <span className="h-px flex-1 bg-mist-100/[0.06]" />
            </div>
          ) : null}
          <div className="grid grid-flow-row-dense gap-2 md:grid-cols-2 xl:grid-cols-3">
            {section.fields.map((field) => (
              <PersonaFieldCard
                key={field.key}
                field={field}
                value={values[field.key]}
                onChange={(next) => onChange(field.key, next)}
              />
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
  const [values, setValues] = useState<Record<string, PersonaValue> | null>(null);
  const [liveState, setLiveState] = useState<ChatChannelPersonaStateSnapshot | null>(null);
  const [meta, setMeta] = useState<PersonaMetadata | null>(null);
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const contentRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef<{
    channelId: string;
    values: Record<string, PersonaValue>;
    meta: PersonaMetadata;
    clearLegacy: boolean;
  } | null>(null);
  const queryClient = useQueryClient();
  const persona = channel ? personaForChannel(channel) : null;
  const activeGroup =
    PERSONA_GROUPS.find((group) => group.id === activeGroupId) ?? PERSONA_GROUPS[0];
  const activeCount = activeGroup ? (GROUP_FIELD_COUNTS[activeGroup.id] ?? 0) : 0;
  const displayValues = values ? mergeStateValues(values, liveState) : null;

  const saveNow = useCallback(async () => {
    if (savingRef.current) {
      return;
    }
    const pending = pendingRef.current;
    if (!pending) {
      return;
    }
    pendingRef.current = null;
    savingRef.current = true;
    setSyncState('saving');
    try {
      const summary = await api.saveChannelPersona(pending.channelId, {
        values: toChatValues(pending.values),
        history: pending.meta.history.map((entry) => ({ ...entry })),
      });
      queryClient.setQueryData(chatChannelsQuery.queryKey, (current) =>
        current?.map((item) => (item.id === summary.id ? summary : item)),
      );
      if (pending.clearLegacy) {
        clearChannelPersonaOverrides(pending.channelId);
      }
      setSyncState('saved');
    } catch (error) {
      setSyncState('error');
      toast.error(error instanceof ApiError ? error.message : '人格属性保存失败，请稍后重试');
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        void saveNow();
      }
    }
  }, [queryClient]);

  const queueSave = useCallback(
    (channelId: string, next: Record<string, PersonaValue>, nextMeta: PersonaMetadata) => {
      pendingRef.current = {
        channelId,
        values: next,
        meta: nextMeta,
        clearLegacy: pendingRef.current?.clearLegacy ?? false,
      };
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void saveNow();
      }, 450);
    },
    [saveNow],
  );

  useEffect(() => {
    const snapshot = channel?.persona;
    if (!snapshot) {
      setLiveState(null);
      return;
    }
    setLiveState(snapshot.state ?? null);
    let cancelled = false;
    void api
      .mindState(snapshot.id)
      .then((state) => {
        if (!cancelled) {
          setLiveState(state);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [channel?.id, channel?.persona?.id]);

  const saveStateField = useCallback(
    async (key: string, value: PersonaValue) => {
      const channelId = channel?.id;
      const personaId = channel?.persona?.id;
      const input = stateFieldInput(key, value);
      if (!channelId || !personaId || !input) {
        return;
      }
      setSyncState('saving');
      try {
        const next = await api.updateMindState(personaId, input);
        setLiveState(next);
        queryClient.setQueryData(chatChannelsQuery.queryKey, (current) =>
          current?.map((item) =>
            item.id === channelId && item.persona
              ? { ...item, persona: { ...item.persona, state: next } }
              : item,
          ),
        );
        void queryClient.invalidateQueries({ queryKey: ['mind', 'overview', channelId] });
        setSyncState('saved');
      } catch (error) {
        setSyncState('error');
        toast.error(error instanceof ApiError ? error.message : '实时状态保存失败，请稍后重试');
      }
    },
    [channel?.id, channel?.persona?.id, queryClient],
  );

  useEffect(() => {
    if (channel?.id) {
      setActiveGroupId(PERSONA_GROUPS[0]?.id ?? '');
    }
  }, [channel?.id]);

  useEffect(() => {
    if (!channel?.persona) {
      setValues(null);
      setMeta(null);
      return;
    }
    if (pendingRef.current || savingRef.current) {
      return;
    }
    const snapshot = channel.persona;
    const legacy = readChannelPersonaOverrides(channel.id);
    const next = { ...snapshot.values, ...legacy };
    setValues(next);
    setMeta(snapshot.meta);
    if (Object.keys(legacy).length > 0) {
      pendingRef.current = {
        channelId: channel.id,
        values: next,
        meta: snapshot.meta,
        clearLegacy: true,
      };
      void saveNow();
    }
  }, [channel?.id, channel?.persona?.meta.updatedAt, saveNow]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void saveNow();
    };
  }, [saveNow]);

  const close = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void saveNow();
    onClose();
  }, [saveNow, onClose]);

  useEffect(() => {
    if (!channel) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [channel, close]);

  useEffect(() => {
    const element = contentRef.current;
    if (element) {
      element.scrollTop = 0;
    }
  }, [activeGroupId]);

  if (typeof document === 'undefined' || !activeGroup) {
    return null;
  }

  const handleChange = (key: string, value: PersonaValue) => {
    if (!channel || !values || !meta) {
      return;
    }
    if (isStateField(key)) {
      void saveStateField(key, value);
      return;
    }
    const label = PERSONA_FIELD_LABELS.get(key) ?? key;
    const next = { ...values, [key]: value };
    const nextMeta = appendPersonaHistory(meta, {
      field: label,
      from: formatPersonaValue(values[key]),
      to: formatPersonaValue(value),
    });
    setValues(next);
    setMeta(nextMeta);
    queueSave(channel.id, next, nextMeta);
  };

  return createPortal(
    <AnimatePresence>
      {channel && persona && values && displayValues && (
        <motion.div
          key="channel-persona"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={close}
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
                initials={Array.from(persona.name)[0] ?? channel.initials}
                accent={persona.accent}
                size="lg"
                className="hidden sm:grid"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.26em] text-brass-400/75">
                    渠道人格
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-jade-400/20 bg-jade-400/[0.07] px-2 py-0.5 font-mono text-[0.56rem] tracking-[0.12em] text-jade-300">
                    <span className="size-1 rounded-full bg-jade-400" aria-hidden="true" />
                    渠道独立快照
                    {channel.persona ? ` · ${channel.persona.cardSerial}` : null}
                  </span>
                  {liveState ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-brass-400/20 bg-brass-400/[0.07] px-2 py-0.5 font-mono text-[0.56rem] text-brass-200">
                      此刻 {stateMoodLabel(liveState)}
                      {liveState.currentActivity ? ` · ${liveState.currentActivity}` : ''}
                    </span>
                  ) : null}
                </div>

                <h2
                  id="channel-persona-title"
                  className="mt-1.5 font-display text-[1.45rem] font-semibold leading-tight tracking-tight text-mist-100"
                >
                  {textValue(values, 'name', persona.name)}
                </h2>
                <p className="mt-1 text-[0.82rem] leading-7 text-mist-500">
                  {`${textValue(values, 'identity', persona.identity)} · 「${textValue(
                    values,
                    'anchor_quote',
                    persona.quote,
                  )}」`}
                </p>

                {liveState ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[
                      ['心情', liveState.moodValence],
                      ['唤醒', liveState.moodArousal],
                      ['掌控', liveState.moodDominance],
                      ['精力', liveState.energy],
                      ['健康', liveState.health],
                      ['压力', liveState.stress],
                      ['社交电量', liveState.socialBattery],
                      ['注意力', liveState.attention],
                      ['睡眠债', liveState.sleepDebt],
                      ['整洁', liveState.grooming],
                    ].map(([label, value]) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1 rounded-full border border-mist-100/[0.08] bg-ink-950/30 px-2 py-0.5 font-mono text-[0.56rem] text-mist-500"
                      >
                        {label}
                        <span className="text-mist-200">{value}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <PlatformChip platform={channel.platform} connector />
                  <span className="font-mono text-[0.6rem] tracking-[0.04em] text-mist-500">
                    接入账号 {channel.displayName} · {channel.accountId}
                  </span>
                  <span className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-mist-600">
                    {PERSONA_ATTRIBUTE_COUNT} 项属性 · {PERSONA_GROUPS.length} 组
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={close}
                aria-label="关闭人格数据面板"
                className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="relative flex min-h-0 flex-1 flex-col border-t border-mist-100/[0.06] md:flex-row">
              <nav
                aria-label="人格属性分组"
                className="flex shrink-0 gap-1 overflow-x-auto border-b border-mist-100/[0.06] px-2.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:w-[14.5rem] md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:px-2.5 md:py-3"
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
                        <span className="block whitespace-nowrap text-[0.78rem] md:truncate">
                          {group.title}
                        </span>
                        <span className="mt-0.5 hidden font-mono text-[0.54rem] tracking-[0.12em] text-mist-600 md:block">
                          {GROUP_FIELD_COUNTS[group.id] ?? 0} 项
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
                        <h3 className="font-display text-[1.2rem] font-semibold tracking-tight text-mist-100">
                          {activeGroup.title}
                        </h3>
                        <p className="mt-1 max-w-2xl text-[0.8rem] leading-7 text-mist-500">
                          {activeGroup.description}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-mist-100/[0.08] bg-ink-950/30 px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-mist-500">
                        {activeCount} 项
                      </span>
                    </div>

                    <div className="mt-4">
                      <GroupSection
                        group={activeGroup}
                        values={displayValues}
                        onChange={handleChange}
                      />
                    </div>

                    {activeGroup.id === 'meta' ? (
                      <PersonaRevisionList channel={channel} scrollRootRef={contentRef} />
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <footer className="relative flex flex-wrap items-center justify-between gap-2 border-t border-mist-100/[0.06] px-5 py-3 sm:px-7">
              <p className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-mist-600">
                渠道人格 · {PERSONA_ATTRIBUTE_COUNT} 项属性
              </p>
              <p className="text-[0.68rem] text-mist-600">
                仅属于该渠道 ·{' '}
                {syncState === 'saving'
                  ? '正在保存…'
                  : syncState === 'error'
                    ? '保存失败，稍后重试'
                    : '编辑即时保存到服务端'}
              </p>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function toChatValues(values: Record<string, PersonaValue>): Record<string, ChatPersonaValue> {
  const result: Record<string, ChatPersonaValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      result[key] = [...(value as readonly string[])];
    } else {
      result[key] = value as string | number | boolean;
    }
  }
  return result;
}
