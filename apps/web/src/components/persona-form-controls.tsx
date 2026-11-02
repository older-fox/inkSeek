import { Check, ChevronDown, Clock, Plus, TriangleAlert, X } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import {
  charCount,
  clampChars,
  minutesLabel,
  rangeDurationMinutes,
  type ChoiceOption,
} from '@/lib/persona-draft';

interface FieldFrameProps {
  id?: string;
  label: string;
  required?: boolean;
  hint?: string;
  counter?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function FieldFrame({
  id,
  label,
  required,
  hint,
  counter,
  error,
  children,
  className,
}: FieldFrameProps) {
  const labelNode = (
    <span className="flex items-center gap-1.5 text-[0.72rem] font-medium tracking-[0.04em] text-mist-300">
      {label}
      {required ? (
        <span className="text-brass-400">*</span>
      ) : (
        <span className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-mist-600">
          选填
        </span>
      )}
    </span>
  );

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        {id ? (
          <label htmlFor={id} className="cursor-pointer">
            {labelNode}
          </label>
        ) : (
          labelNode
        )}
        {counter && <span className="font-mono text-[0.55rem] text-mist-600">{counter}</span>}
      </div>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-[0.68rem] leading-5 text-signal-400">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        hint && <p className="text-[0.64rem] leading-5 text-mist-600">{hint}</p>
      )}
    </div>
  );
}

interface TextControlProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  error?: string;
  inputMode?: 'text' | 'numeric';
}

export function TextControl({
  id,
  label,
  value,
  onChange,
  max,
  required,
  hint,
  placeholder,
  error,
  inputMode = 'text',
}: TextControlProps) {
  return (
    <FieldFrame
      id={id}
      label={label}
      required={required}
      hint={hint}
      counter={`${charCount(value)} / ${max}`}
      error={error}
    >
      <input
        id={id}
        className="wizard-input"
        value={value}
        onChange={(event) => onChange(clampChars(event.target.value, max))}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : 'false'}
        autoComplete="off"
        inputMode={inputMode}
      />
    </FieldFrame>
  );
}

interface TextAreaControlProps extends Omit<TextControlProps, 'inputMode' | 'placeholder'> {
  rows?: number;
  placeholder?: string;
}

export function TextAreaControl({
  id,
  label,
  value,
  onChange,
  max,
  required,
  hint,
  placeholder,
  error,
  rows = 5,
}: TextAreaControlProps) {
  return (
    <FieldFrame
      id={id}
      label={label}
      required={required}
      hint={hint}
      counter={`${charCount(value)} / ${max}`}
      error={error}
    >
      <textarea
        id={id}
        className="wizard-textarea"
        rows={rows}
        value={value}
        onChange={(event) => onChange(clampChars(event.target.value, max))}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : 'false'}
      />
    </FieldFrame>
  );
}

interface NumberControlProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  unit: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  error?: string;
}

export function NumberControl({
  id,
  label,
  value,
  onChange,
  min,
  max,
  unit,
  required,
  hint,
  placeholder,
  error,
}: NumberControlProps) {
  return (
    <FieldFrame id={id} label={label} required={required} hint={hint} error={error}>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className="wizard-input pr-14"
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-invalid={error ? 'true' : 'false'}
          autoComplete="off"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-mist-600">
          {unit}
        </span>
      </div>
    </FieldFrame>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectControlProps {
  id: string;
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
}

export function SelectControl({
  id,
  label,
  value,
  options,
  onChange,
  required,
  hint,
  error,
}: SelectControlProps) {
  return (
    <FieldFrame id={id} label={label} required={required} hint={hint} error={error}>
      <div className="relative">
        <select
          id={id}
          className="wizard-input wizard-select"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? 'true' : 'false'}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mist-600" />
      </div>
    </FieldFrame>
  );
}

interface ChoiceControlProps<T extends string> {
  label: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  required?: boolean;
  hint?: string;
  error?: string;
  columns?: 1 | 2;
}

export function ChoiceControl<T extends string>({
  label,
  value,
  options,
  onChange,
  required,
  hint,
  error,
  columns = 2,
}: ChoiceControlProps<T>) {
  return (
    <FieldFrame label={label} required={required} hint={hint} error={error}>
      <div
        role="group"
        aria-label={label}
        className={cn('grid gap-2', columns === 2 && 'sm:grid-cols-2')}
      >
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                'group rounded-xl border px-3 py-2.5 text-left transition',
                selected
                  ? 'border-brass-400/50 bg-brass-400/10 shadow-[0_0_0_1px_var(--field-focus-shadow)]'
                  : 'border-mist-100/[0.08] bg-ink-950/25 hover:border-mist-100/20 hover:bg-ink-950/45',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'text-[0.78rem] font-medium',
                    selected ? 'text-brass-200' : 'text-mist-200',
                  )}
                >
                  {option.label}
                </span>
                <span
                  className={cn(
                    'size-1.5 rounded-full transition',
                    selected ? 'bg-brass-300' : 'bg-mist-100/15',
                  )}
                />
              </span>
              {option.hint && (
                <span className="mt-0.5 block text-[0.64rem] leading-5 text-mist-600">
                  {option.hint}
                </span>
              )}
              {option.example && (
                <span
                  className={cn(
                    'mt-1 block font-mono text-[0.6rem] leading-5',
                    selected ? 'text-brass-300/90' : 'text-mist-600',
                  )}
                >
                  {option.example}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </FieldFrame>
  );
}

interface LevelControlProps {
  label: string;
  value: number;
  options: readonly string[];
  onChange: (value: number) => void;
  required?: boolean;
  hint?: string;
  error?: string;
}

export function LevelControl({
  label,
  value,
  options,
  onChange,
  required,
  hint,
  error,
}: LevelControlProps) {
  const max = options.length - 1;
  const percent = max === 0 ? 0 : (value / max) * 100;
  const current = options[value] ?? '';

  return (
    <FieldFrame
      label={label}
      required={required}
      hint={hint}
      counter={`${value + 1} / ${options.length}`}
      error={error}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.82rem] text-mist-200">{current}</span>
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-mist-600">
          Level {value + 1}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="wizard-range mt-2"
        style={{ '--range-track': levelTrack(percent) } as CSSProperties}
        aria-label={label}
        aria-valuetext={current}
      />
      <div
        className="mt-1.5 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option, index) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(index)}
            className={cn(
              'rounded py-0.5 text-center text-[0.55rem] leading-4 transition',
              index === value
                ? 'bg-brass-400/10 font-medium text-brass-300'
                : 'text-mist-600 hover:text-mist-400',
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </FieldFrame>
  );
}

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  hint?: string;
  required?: boolean;
  error?: string;
}

export function SliderControl({
  label,
  value,
  min,
  max,
  onChange,
  hint,
  required = true,
  error,
}: SliderControlProps) {
  const clamped = Math.min(max, Math.max(min, value));

  return (
    <FieldFrame label={label} required={required} hint={hint} error={error}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-xl font-semibold tracking-tight text-mist-100">
          {clamped}
        </span>
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-mist-600">
          0 — 100
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={clamped}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Math.min(max, Math.max(min, next)));
        }}
        className="wizard-range mt-2"
        style={{ '--range-track': sliderTrack(min, max, clamped) } as CSSProperties}
        aria-label={label}
        aria-valuetext={`${clamped}，可调范围 ${min} 到 ${max}`}
      />
      <div className="mt-1 flex items-center justify-between font-mono text-[0.54rem] text-mist-600">
        <span>0</span>
        <span className="rounded-full border border-mist-100/[0.08] bg-ink-950/30 px-2 py-0.5">
          限制 {min}–{max}
        </span>
        <span>100</span>
      </div>
    </FieldFrame>
  );
}

interface SwitchControlProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function SwitchControl({ label, description, checked, onChange }: SwitchControlProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-mist-100/[0.08] bg-ink-950/25 p-4 text-left transition hover:border-mist-100/20 hover:bg-ink-950/40"
    >
      <span className="min-w-0">
        <span className="block text-[0.8rem] font-medium text-mist-200">{label}</span>
        <span className="mt-1 block text-[0.65rem] leading-5 text-mist-600">{description}</span>
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-brass-400/50 bg-brass-400/70' : 'border-mist-100/15 bg-ink-950/60',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-[1.1rem] rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[1.3rem]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

interface LinesControlProps {
  id: string;
  label: string;
  lines: string[];
  onChange: (lines: string[]) => void;
  max: number;
  perLineMax: number;
  required?: boolean;
  hint?: string;
  error?: string;
  placeholder?: string;
  addLabel?: string;
}

export function LinesControl({
  id,
  label,
  lines,
  onChange,
  max,
  perLineMax,
  required,
  hint,
  error,
  placeholder,
  addLabel = '添加一条',
}: LinesControlProps) {
  const filled = lines.filter((line) => line.trim()).length;

  const updateLine = (index: number, value: string) => {
    const next = [...lines];
    next[index] = clampChars(value, perLineMax);
    onChange(next);
  };

  const removeLine = (index: number) => {
    onChange(lines.filter((_, lineIndex) => lineIndex !== index));
  };

  return (
    <FieldFrame
      label={label}
      required={required}
      hint={hint}
      counter={`${filled} / ${max} 条`}
      error={error}
    >
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-5 shrink-0 font-mono text-[0.55rem] text-mist-600">
              {String(index + 1).padStart(2, '0')}
            </span>
            <input
              id={index === 0 ? id : undefined}
              className="wizard-input wizard-input-compact"
              value={line}
              onChange={(event) => updateLine(index, event.target.value)}
              placeholder={placeholder}
              maxLength={perLineMax}
              aria-label={`${label}第 ${index + 1} 条`}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => removeLine(index)}
              aria-label={`删除${label}第 ${index + 1} 条`}
              className="shrink-0 rounded-lg p-2 text-mist-600 transition hover:bg-signal-400/10 hover:text-signal-400"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}

        {lines.length < max && (
          <button
            type="button"
            onClick={() => onChange([...lines, ''])}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-mist-100/15 text-[0.65rem] text-mist-600 transition hover:border-brass-400/35 hover:text-brass-300"
          >
            <Plus className="size-3.5" />
            {addLabel}
          </button>
        )}
      </div>
    </FieldFrame>
  );
}

interface TimeRangeControlProps {
  label: string;
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
}

export function TimeRangeControl({
  label,
  start,
  end,
  onStartChange,
  onEndChange,
  required,
  hint,
  error,
}: TimeRangeControlProps) {
  const duration = rangeDurationMinutes(start, end);

  return (
    <FieldFrame label={label} required={required} hint={hint} error={error}>
      <div className="flex items-center gap-2">
        <TimeField
          value={start}
          onChange={onStartChange}
          ariaLabel={`${label}开始时间`}
          invalid={Boolean(error)}
        />
        <span className="shrink-0 text-[0.7rem] text-mist-600">→</span>
        <TimeField
          value={end}
          onChange={onEndChange}
          ariaLabel={`${label}结束时间`}
          invalid={Boolean(error)}
        />
      </div>
      <p className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-mist-600">
        {duration === null ? '跨度 —' : `跨度 ${minutesLabel(duration)}`}
      </p>
    </FieldFrame>
  );
}

const POPOVER_MAX_HEIGHT = 300;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

interface PickerPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  minWidth?: number;
  maxWidth?: number;
  children: ReactNode;
}

function PickerPopover({
  open,
  onClose,
  anchorRef,
  minWidth = 232,
  maxWidth = 420,
  children,
}: PickerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }

    const anchor = anchorRef.current;

    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const width = Math.min(
      Math.max(rect.width, minWidth),
      maxWidth,
      window.innerWidth - 24,
    );
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const openAbove = spaceBelow < POPOVER_MAX_HEIGHT && rect.top > spaceBelow;

    setStyle(
      openAbove
        ? { bottom: window.innerHeight - rect.top + 8, left, width }
        : { top: rect.bottom + 8, left, width },
    );
  }, [open, anchorRef, minWidth, maxWidth]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleDismiss = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) {
        return;
      }

      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !style) {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      style={style}
      className="glass-panel fixed z-[120] rounded-2xl p-3 shadow-panel"
    >
      {children}
    </div>,
    document.body,
  );
}

interface TimeFieldProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  invalid?: boolean;
}

export function TimeField({ value, onChange, ariaLabel, invalid }: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const selectedMinuteRef = useRef<HTMLButtonElement>(null);
  const [hour = '00', minute = '00'] = value.split(':');

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      selectedHourRef.current?.scrollIntoView({ block: 'nearest' });
      selectedMinuteRef.current?.scrollIntoView({ block: 'nearest' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid ? 'true' : 'false'}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'wizard-input wizard-time flex items-center justify-between gap-2 text-left',
          open &&
            'border-[var(--field-focus-border)] bg-[var(--field-bg-focus)] shadow-[0_0_0_4px_var(--field-focus-shadow)]',
        )}
      >
        <span className="font-mono tracking-[0.06em]">
          {hour}:{minute}
        </span>
        <Clock className="size-3.5 shrink-0 text-mist-600" strokeWidth={1.7} />
      </button>

      <PickerPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        minWidth={280}
        maxWidth={340}
      >
        <div className="flex items-center justify-between gap-3 px-1 pb-2.5">
          <span className="font-mono text-[0.54rem] uppercase tracking-[0.2em] text-mist-600">
            Select Time
          </span>
          <span className="font-mono text-[0.72rem] text-brass-300">
            {hour}:{minute}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div
            role="listbox"
            aria-label="小时"
            className="h-48 overflow-y-auto overscroll-contain rounded-xl border border-mist-100/[0.07] bg-ink-950/40 p-1"
          >
            {HOUR_OPTIONS.map((option) => (
              <button
                key={option}
                ref={option === hour ? selectedHourRef : undefined}
                type="button"
                role="option"
                aria-selected={option === hour}
                onClick={() => onChange(`${option}:${minute}`)}
                className={cn(
                  'flex h-8 w-full items-center justify-center rounded-lg font-mono text-[0.72rem] transition',
                  option === hour
                    ? 'bg-brass-400/15 text-brass-200'
                    : 'text-mist-500 hover:bg-mist-100/[0.06] hover:text-mist-100',
                )}
              >
                {option}
              </button>
            ))}
          </div>

          <div
            role="listbox"
            aria-label="分钟"
            className="h-48 overflow-y-auto overscroll-contain rounded-xl border border-mist-100/[0.07] bg-ink-950/40 p-1"
          >
            {MINUTE_OPTIONS.map((option) => (
              <button
                key={option}
                ref={option === minute ? selectedMinuteRef : undefined}
                type="button"
                role="option"
                aria-selected={option === minute}
                onClick={() => onChange(`${hour}:${option}`)}
                className={cn(
                  'flex h-8 w-full items-center justify-center rounded-lg font-mono text-[0.72rem] transition',
                  option === minute
                    ? 'bg-brass-400/15 text-brass-200'
                    : 'text-mist-500 hover:bg-mist-100/[0.06] hover:text-mist-100',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="pl-1 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-mist-600">
            24 小时制
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-brass-400/30 bg-brass-400/10 px-3 py-1.5 text-[0.68rem] text-brass-200 transition hover:bg-brass-400/20"
          >
            完成
          </button>
        </div>
      </PickerPopover>
    </>
  );
}

interface TimeZonePickerProps {
  id: string;
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
}

export function TimeZonePicker({
  id,
  label,
  value,
  options,
  onChange,
  required,
  hint,
  error,
}: TimeZonePickerProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      selectedRef.current?.scrollIntoView({ block: 'nearest' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <FieldFrame id={id} label={label} required={required} hint={hint} error={error}>
      <button
        id={id}
        ref={anchorRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={error ? 'true' : 'false'}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'wizard-input flex items-center justify-between gap-3 text-left',
          open &&
            'border-[var(--field-focus-border)] bg-[var(--field-bg-focus)] shadow-[0_0_0_4px_var(--field-focus-shadow)]',
        )}
      >
        <span className="truncate text-[0.86rem] text-mist-200">{selected?.label ?? '—'}</span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-mist-600 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      <PickerPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        minWidth={240}
        maxWidth={320}
      >
        <div
          role="listbox"
          aria-label={label}
          className="max-h-64 overflow-y-auto overscroll-contain p-0.5"
        >
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                ref={isSelected ? selectedRef : undefined}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[0.76rem] transition',
                  isSelected
                    ? 'bg-brass-400/12 text-brass-200'
                    : 'text-mist-400 hover:bg-mist-100/[0.05] hover:text-mist-100',
                )}
              >
                <span>{option.label}</span>
                {isSelected && <Check className="size-3.5 shrink-0 text-brass-300" />}
              </button>
            );
          })}
        </div>
      </PickerPopover>
    </FieldFrame>
  );
}

function baseTrack(): string {
  return 'color-mix(in srgb, var(--color-mist-500) 22%, transparent)';
}

function levelTrack(percent: number): string {
  return `linear-gradient(to right, var(--color-brass-400) 0%, var(--color-brass-300) ${percent}%, ${baseTrack()} ${percent}%, ${baseTrack()} 100%)`;
}

function sliderTrack(min: number, max: number, value: number): string {
  return [
    `linear-gradient(to right,`,
    `${baseTrack()} 0%, ${baseTrack()} ${min}%,`,
    `var(--color-brass-400) ${min}%, var(--color-brass-300) ${value}%,`,
    `color-mix(in srgb, var(--color-brass-400) 22%, transparent) ${value}%,`,
    `color-mix(in srgb, var(--color-brass-400) 22%, transparent) ${max}%,`,
    `${baseTrack()} ${max}%, ${baseTrack()} 100%)`,
  ].join(' ');
}
