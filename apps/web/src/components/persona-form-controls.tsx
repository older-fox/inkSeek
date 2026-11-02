import { ChevronDown, Plus, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
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
        style={{ background: levelTrack(percent) }}
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
        style={{ background: sliderTrack(min, max, clamped) }}
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
        <input
          type="time"
          className="wizard-input wizard-time"
          value={start}
          onChange={(event) => onStartChange(event.target.value)}
          aria-label={`${label}开始时间`}
          aria-invalid={error ? 'true' : 'false'}
        />
        <span className="shrink-0 text-[0.7rem] text-mist-600">→</span>
        <input
          type="time"
          className="wizard-input wizard-time"
          value={end}
          onChange={(event) => onEndChange(event.target.value)}
          aria-label={`${label}结束时间`}
          aria-invalid={error ? 'true' : 'false'}
        />
      </div>
      <p className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-mist-600">
        {duration === null ? '跨度 —' : `跨度 ${minutesLabel(duration)}`}
      </p>
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
