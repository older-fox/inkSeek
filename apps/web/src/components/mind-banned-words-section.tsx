import type { SettingsOverview } from '@inkseek/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { GhostButton, PrimaryButton } from '@/components/button';
import { ApiError, api } from '@/lib/api';
import { settingsQuery } from '@/lib/queries';

/**
 * Splits the textarea into one entry per line, trimming blanks and dropping
 * duplicates while keeping the first occurrence order.
 */
function parseWords(text: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const word = line.trim();
    if (!word || seen.has(word)) {
      continue;
    }
    seen.add(word);
    words.push(word);
  }
  return words;
}

/**
 * Editor for the global banned-word list applied to every channel. Keeps local
 * draft text, warns on oversized entries, and resets from the server copy on save.
 */
export function MindBannedWordsSection({ words }: { words: string[] }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(words.join('\n'));

  useEffect(() => {
    setText(words.join('\n'));
  }, [words]);

  const parsed = useMemo(() => parseWords(text), [text]);
  const dirty = parsed.join('\n') !== words.join('\n');
  const tooLong = parsed.find((word) => word.length > 60);
  const tooMany = parsed.length > 500;

  const mutation = useMutation({
    mutationFn: api.updateMindBannedWords,
    onSuccess: (result) => {
      queryClient.setQueryData<SettingsOverview>(settingsQuery.queryKey, (current) =>
        current ? { ...current, mindBannedWords: result.words } : current,
      );
      setText(result.words.join('\n'));
      toast.success(`已保存 ${result.words.length} 条全局禁用词`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '全局禁用词保存失败');
    },
  });

  return (
    <section className="relative overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5 backdrop-blur-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-signal-400/20 bg-signal-400/[0.06] text-signal-400">
            <Ban className="size-[1.1rem]" strokeWidth={1.6} />
          </span>
          <div>
            <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
              全局禁用词
            </h2>
            <p className="mt-1 max-w-xl text-[0.78rem] leading-6 text-mist-500">
              对所有渠道、所有角色生效。命中的词和句式不会出现在 TA
              发出的消息里，也不允许换同义说法绕回去；人设卡里的「禁用语」会在此基础上叠加。
            </p>
          </div>
        </div>

        <span className="rounded-full border border-mist-100/10 bg-ink-950/40 px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-mist-500">
          {parsed.length} words
        </span>
      </div>

      <label className="mt-5 block">
        <span className="sr-only">全局禁用词列表</span>
        <textarea
          value={text}
          spellCheck={false}
          rows={14}
          onChange={(event) => setText(event.target.value)}
          placeholder={'每行一条，例如：\n我记下了\n比之前都重\n行，我认'}
          className="wizard-textarea min-h-[18rem] font-sans text-[0.78rem] leading-6"
        />
      </label>

      {tooLong && (
        <p className="mt-2 text-[0.7rem] text-signal-400">「{tooLong}」超过 60 个字符，请拆短。</p>
      )}
      {tooMany && <p className="mt-2 text-[0.7rem] text-signal-400">最多保存 500 条。</p>}

      <div className="mt-4 flex flex-col gap-3 border-t border-mist-100/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.68rem] leading-5 text-mist-600">
          每行一条，`xx` 可当作任意内容的占位；清空并保存表示不启用全局禁用。
        </p>
        <div className="flex items-center gap-2">
          <GhostButton
            type="button"
            disabled={!dirty || mutation.isPending}
            onClick={() => setText(words.join('\n'))}
            className="h-10 px-4 text-[0.72rem]"
          >
            <RotateCcw className="size-3.5" />
            重置
          </GhostButton>
          <PrimaryButton
            type="button"
            loading={mutation.isPending}
            disabled={!dirty || Boolean(tooLong) || tooMany}
            onClick={() => mutation.mutate({ words: parsed })}
            className="h-10 px-5 text-[0.75rem]"
          >
            保存禁用词
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}
