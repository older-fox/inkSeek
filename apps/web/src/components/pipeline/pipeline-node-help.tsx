import type {
  ChatPipelineConfigFieldKind,
  ChatPipelineIoField,
  ChatPipelineNodeType,
} from '@inkseek/shared';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PERSONA_FIELD_LABELS } from '@/lib/channel-persona';
import { cn } from '@/lib/cn';
import { GROUP_PERSONA_GROUPS } from '@/lib/group-persona';
import { PRIVATE_PERSONA_GROUPS } from '@/lib/private-persona';
import { CATEGORY_STYLE, IO_KIND_STYLE } from './pipeline-ui';

/** Persona-card keys plus the conversation-level persona keys. */
const HELP_KEY_LABELS = new Map<string, string>([
  ...PERSONA_FIELD_LABELS,
  ...GROUP_PERSONA_GROUPS.flatMap((group) =>
    group.fields.map((field) => [field.key, field.label] as const),
  ),
  ...PRIVATE_PERSONA_GROUPS.flatMap((group) =>
    group.fields.map((field) => [field.key, field.label] as const),
  ),
]);

interface PipelineNodeHelpProps {
  entry: ChatPipelineNodeType;
  onClose: () => void;
}

const CONFIG_KIND_LABEL: Record<ChatPipelineConfigFieldKind, string> = {
  text: '多行文本',
  string: '单行文本',
  number: '数字',
  boolean: '开关',
  select: '下拉',
  json: 'JSON',
};

export function PipelineNodeHelp({ entry, onClose }: PipelineNodeHelpProps) {
  const style = CATEGORY_STYLE[entry.category];
  const Icon = style.icon;
  const keyGroups = entry.help?.keyGroups ?? [];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭帮助"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-950/70 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pipeline-node-help-title"
        className="relative flex max-h-[min(46rem,calc(100vh-2rem))] w-full max-w-[42rem] flex-col overflow-hidden rounded-2xl border border-mist-100/[0.12] bg-ink-950/95 shadow-[0_30px_90px_-30px_rgba(0,0,0,0.9)]"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-mist-100/[0.07] px-5 py-4">
          <span
            className={cn(
              'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border',
              style.border,
              style.background,
              style.text,
            )}
          >
            <Icon className="size-4" strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[0.64rem] uppercase tracking-[0.22em] text-brass-300">
              Card Guide
            </p>
            <h2
              id="pipeline-node-help-title"
              className="mt-1 text-[1.2rem] font-medium text-mist-100"
            >
              {entry.label}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[0.68rem] text-mist-600">
              <span>{entry.type}</span>
              <span>· v{entry.version}</span>
              {entry.system && (
                <span className="rounded border border-brass-400/30 px-1 py-px text-[0.6rem] uppercase tracking-[0.1em] text-brass-300">
                  系统
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-mist-100/[0.08] text-mist-500 transition hover:border-mist-100/[0.2] hover:text-mist-200"
          >
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <p className="text-[0.86rem] leading-6 text-mist-300">{entry.description}</p>

          {entry.help?.notes?.map((note) => (
            <p key={note} className="mt-2 text-[0.8rem] leading-6 text-mist-500">
              {note}
            </p>
          ))}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <IoColumn title="输入端口" fields={entry.inputs} />
            <IoColumn title="输出端口" fields={entry.outputs} />
          </div>

          {entry.fields.length > 0 && (
            <section className="mt-4">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
                配置字段
              </p>
              <ul className="mt-2 space-y-1.5">
                {entry.fields.map((field) => (
                  <li
                    key={field.key}
                    className="rounded-lg border border-mist-100/[0.06] bg-ink-900/50 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-[0.78rem] text-mist-200">
                        {field.key}
                      </span>
                      <span className="text-[0.78rem] text-mist-400">{field.label}</span>
                      <span className="ml-auto rounded border border-mist-100/[0.08] px-1 py-px font-mono text-[0.6rem] text-mist-600">
                        {CONFIG_KIND_LABEL[field.kind]}
                      </span>
                    </div>
                    {field.hint && (
                      <p className="mt-1 text-[0.72rem] leading-5 text-mist-500">
                        {field.hint}
                      </p>
                    )}
                    {field.placeholder && (
                      <p className="mt-1 break-words font-mono text-[0.7rem] leading-5 text-mist-600">
                        示例 {field.placeholder}
                      </p>
                    )}
                    {field.kind === 'select' && field.options && field.options.length > 0 && (
                      <p className="mt-1 text-[0.7rem] leading-5 text-mist-600">
                        选项 {field.options.length <= 8
                          ? field.options.map((option) => option.label).join(' / ')
                          : `${field.options.length} 个可选值`}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {keyGroups.length > 0 && (
            <section className="mt-4">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">
                可用参数
              </p>
              <p className="mt-1 text-[0.72rem] leading-5 text-mist-600">
                模板里用 {'{参数名}'} 引用，下方列出全部可用 key 及对应中文名。
              </p>
              <div className="mt-2 space-y-2">
                {keyGroups.map((group) => (
                  <div
                    key={group.title}
                    className="rounded-lg border border-mist-100/[0.06] bg-ink-900/50 px-3 py-2.5"
                  >
                    <p className="flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-mist-500">
                      {group.title}
                      <span className="text-mist-600">· {group.keys.length}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {group.keys.map((key) => {
                        const label = HELP_KEY_LABELS.get(key);
                        return (
                          <span
                            key={key}
                            className="inline-flex items-baseline gap-1.5 rounded border border-mist-100/[0.08] bg-ink-950/50 px-2 py-1"
                          >
                            <code className="font-mono text-[0.8rem] text-mist-200">{key}</code>
                            {label && <span className="text-[0.78rem] text-mist-500">{label}</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="mt-4 border-t border-mist-100/[0.06] pt-3 font-mono text-[0.66rem] leading-5 text-mist-600">
            内容与后端节点注册表同源；端口类型、配置字段变更后会自动同步到这里。
          </p>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function IoColumn({ title, fields }: { title: string; fields: ChatPipelineIoField[] }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-mist-600">{title}</p>
      {fields.length === 0 ? (
        <p className="mt-1.5 text-[0.72rem] text-mist-600">无</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {fields.map((field) => {
            const kind = IO_KIND_STYLE[field.kind];
            return (
              <li
                key={`${field.key}-${field.label}`}
                className="rounded-md border border-mist-100/[0.06] bg-ink-900/40 px-2 py-1.5"
              >
                <div className="flex flex-wrap items-center gap-1">
                  <span className="break-all font-mono text-[0.74rem] text-mist-200">
                    {field.key}
                  </span>
                  {field.optional && (
                    <span className="font-mono text-[0.6rem] text-mist-500">可选</span>
                  )}
                  {field.multiple && (
                    <span className="font-mono text-[0.6rem] text-jade-300">多路</span>
                  )}
                  <span
                    className={cn(
                      'ml-auto shrink-0 rounded border px-1 py-px font-mono text-[0.58rem]',
                      kind.className,
                    )}
                  >
                    {kind.label}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.7rem] leading-5 text-mist-500">{field.label}</p>
                {field.description && (
                  <p className="mt-0.5 text-[0.66rem] leading-5 text-mist-600">
                    {field.description}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
