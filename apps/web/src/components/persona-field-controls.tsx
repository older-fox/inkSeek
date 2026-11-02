import { Pencil } from 'lucide-react';
import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import type { PersonaValue } from '@/lib/channel-persona';

export type PersonaFieldKind =
  'text' | 'paragraph' | 'tags' | 'list' | 'score' | 'ratio' | 'boolean';

export interface PersonaFieldShape {
  key: string;
  label: string;
  hint?: string;
  kind: PersonaFieldKind;
  wide?: boolean;
  step?: number;
  display?: 'percent';
  placeholder?: string;
}

const EDITOR_INPUT =
  'w-full rounded-lg border border-brass-400/25 bg-ink-950/40 px-2.5 py-1.5 text-[0.8rem] leading-6 text-mist-100 outline-none transition placeholder:text-mist-600 focus:border-brass-400/50';

function numericValue(value: PersonaValue | undefined): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function ratioLabel(field: PersonaFieldShape, ratio: number): string {
  return field.display === 'percent' ? `${(ratio * 100).toFixed(1)}%` : ratio.toFixed(2);
}

export function EditorActions({
  onCancel,
  onCommit,
}: {
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
        className="rounded-md border border-brass-400/30 bg-brass-400/10 px-2.5 py-1 text-[0.7rem] text-brass-300 transition hover:bg-brass-400/[0.18]"
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
  field: PersonaFieldShape;
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

  const commit = () => {
    if (field.kind === 'tags') {
      onCommit(
        text
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
      );
      return;
    }
    if (field.kind === 'list') {
      onCommit(
        text
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean),
      );
      return;
    }
    onCommit(text.trim());
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    const multiline = field.kind === 'paragraph' || field.kind === 'list';
    if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit();
    }
  };

  if (field.kind === 'paragraph' || field.kind === 'list') {
    return (
      <div className="mt-2 space-y-2">
        <textarea
          rows={field.kind === 'list' ? 4 : 3}
          value={text}
          autoFocus
          placeholder={field.placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(EDITOR_INPUT, 'resize-none')}
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
        placeholder={field.placeholder ?? (field.kind === 'tags' ? '用逗号分隔' : undefined)}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        className={EDITOR_INPUT}
      />
      <EditorActions onCancel={onCancel} onCommit={commit} />
    </div>
  );
}

export function PersonaSlider({
  field,
  value,
  onChange,
}: {
  field: PersonaFieldShape;
  value: PersonaValue | undefined;
  onChange: (value: PersonaValue) => void;
}) {
  const numeric = numericValue(value);

  if (field.kind === 'score') {
    const score = numeric === null ? 0 : Math.max(0, Math.min(100, Math.round(numeric)));

    return (
      <div className="mt-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[1.15rem] font-semibold leading-none tabular-nums text-mist-100">
            {score}
          </span>
          <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-mist-600">
            / 100
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={score}
          aria-label={`${field.label}数值`}
          aria-valuetext={`${score} / 100`}
          onChange={(event) => onChange(Number(event.target.value))}
          className="mt-2 h-1.5 w-full cursor-pointer accent-brass-400"
        />
        <div className="mt-1 flex justify-between font-mono text-[0.54rem] uppercase tracking-[0.14em] text-mist-600">
          <span>0</span>
          <span>100</span>
        </div>
      </div>
    );
  }

  const ratio = numeric === null ? 0 : Math.max(0, Math.min(1, numeric));
  const label = ratioLabel(field, ratio);

  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-[1.15rem] font-semibold leading-none tabular-nums text-mist-100">
          {label}
        </span>
        <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-mist-600">
          {field.display === 'percent' ? '占比' : '0 — 1'}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={field.step ?? 0.01}
        value={ratio}
        aria-label={`${field.label}数值`}
        aria-valuetext={label}
        onChange={(event) => onChange(Math.round(Number(event.target.value) * 100) / 100)}
        className="mt-2 h-1.5 w-full cursor-pointer accent-brass-400"
      />
      <div className="mt-1 flex justify-between font-mono text-[0.54rem] uppercase tracking-[0.14em] text-mist-600">
        <span>0</span>
        <span>{field.display === 'percent' ? '100%' : '1'}</span>
      </div>
    </div>
  );
}

export function PersonaSwitch({
  field,
  value,
  onChange,
}: {
  field: PersonaFieldShape;
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

export function PersonaFieldValue({
  field,
  value,
}: {
  field: PersonaFieldShape;
  value: PersonaValue | undefined;
}) {
  if (value === undefined) {
    return <p className="mt-1.5 text-[0.76rem] text-mist-600">未同步</p>;
  }

  switch (field.kind) {
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
              className="flex items-start gap-2 text-[0.78rem] leading-6 text-mist-300"
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
    case 'paragraph':
      return (
        <p className="mt-1.5 whitespace-pre-line text-[0.8rem] leading-7 text-mist-400">
          {String(value)}
        </p>
      );
    default:
      return <p className="mt-1.5 text-[0.82rem] leading-6 text-mist-300">{String(value)}</p>;
  }
}

export function PersonaFieldCard({
  field,
  value,
  onChange,
}: {
  field: PersonaFieldShape;
  value: PersonaValue | undefined;
  onChange: (value: PersonaValue) => void;
}) {
  const [editing, setEditing] = useState(false);
  const numeric = field.kind === 'score' || field.kind === 'ratio';
  const inline = field.kind === 'boolean' || numeric;

  return (
    <div
      title={field.hint ? `${field.label} · ${field.hint}` : field.label}
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
          {!editing && !inline && (
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
      {numeric ? (
        <PersonaSlider field={field} value={value} onChange={onChange} />
      ) : field.kind === 'boolean' ? (
        <PersonaSwitch field={field} value={value} onChange={onChange} />
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
