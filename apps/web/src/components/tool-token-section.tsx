import {
  DEFAULT_TOOL_MAX_TOKENS,
  MIN_TOOL_MAX_TOKENS,
  type SettingsOverview,
} from '@inkseek/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { GhostButton, PrimaryButton } from '@/components/button';
import { Field, InputShell } from '@/components/field';
import { ApiError, api } from '@/lib/api';
import { settingsQuery } from '@/lib/queries';

const MAX_TOOL_TOKENS = 200_000;
const PRESETS = [4_000, 8_000, 20_000, 60_000, 200_000];

/**
 * Global ceiling for a single model call. Every caller (chat, vision,
 * screenshots, stickers, video frames) may ask for less, never more; calls
 * without a value use exactly this number.
 */
export function ToolTokenSection({ maxTokens }: { maxTokens: number }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(maxTokens));

  useEffect(() => {
    setValue(String(maxTokens));
  }, [maxTokens]);

  const parsed = Number.parseInt(value.trim(), 10);
  const valid =
    Number.isFinite(parsed) && parsed >= MIN_TOOL_MAX_TOKENS && parsed <= MAX_TOOL_TOKENS;
  const dirty = valid && parsed !== maxTokens;

  const mutation = useMutation({
    mutationFn: api.updateMaxTokens,
    onSuccess: (result) => {
      queryClient.setQueryData<SettingsOverview>(settingsQuery.queryKey, (current) =>
        current ? { ...current, maxTokens: result.maxTokens } : current,
      );
      toast.success(`单次调用上限已保存为 ${result.maxTokens.toLocaleString()} tokens`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'token 上限保存失败');
    },
  });

  return (
    <section className="relative overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5 backdrop-blur-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-brass-400/20 bg-brass-400/[0.06] text-brass-300">
            <Coins className="size-[1.1rem]" strokeWidth={1.6} />
          </span>
          <div>
            <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
              工具最大 token 数
            </h2>
            <p className="mt-1 max-w-xl text-[0.78rem] leading-6 text-mist-500">
              所有模型调用——对话、识图、识屏、网页截图、表情标注、视频抽帧——单次最多能使用的 token
              数。调用方可以请求更小的值，但不会超过这里的上限；没有指定时直接使用这个数。
              思考模型的推理 token 也计在这笔额度里。
            </p>
          </div>
        </div>

        <span className="rounded-full border border-mist-100/10 bg-ink-950/40 px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-mist-500">
          {maxTokens.toLocaleString()} tokens
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field
          label="单次调用上限"
          htmlFor="settings-max-tokens"
          hint={`${MIN_TOOL_MAX_TOKENS} - ${MAX_TOOL_TOKENS.toLocaleString()}`}
          error={!valid && value.trim() ? '请填写范围内的整数' : undefined}
        >
          <InputShell icon={<Coins className="size-4" strokeWidth={1.7} />} invalid={!valid}>
            <input
              id="settings-max-tokens"
              type="number"
              inputMode="numeric"
              min={MIN_TOOL_MAX_TOKENS}
              max={MAX_TOOL_TOKENS}
              step={256}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </InputShell>
        </Field>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setValue(String(preset))}
              className={[
                'rounded-lg border px-2.5 py-1.5 font-mono text-[0.66rem] transition',
                preset === parsed
                  ? 'border-brass-400/35 bg-brass-400/[0.08] text-brass-300'
                  : 'border-mist-100/[0.08] text-mist-600 hover:border-mist-100/20 hover:text-mist-300',
              ].join(' ')}
            >
              {preset >= 1000 ? `${preset / 1000}k` : preset}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-mist-100/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.68rem] leading-5 text-mist-600">
          默认 {DEFAULT_TOOL_MAX_TOKENS.toLocaleString()}
          。额度过小时思考模型会把整笔预算花在推理上，
          表现为“用尽额度没有正文”；遇到这种情况再调高即可。
        </p>
        <div className="flex items-center gap-2">
          <GhostButton
            type="button"
            disabled={!dirty || mutation.isPending}
            onClick={() => setValue(String(maxTokens))}
            className="h-10 px-4 text-[0.72rem]"
          >
            <RotateCcw className="size-3.5" />
            重置
          </GhostButton>
          <PrimaryButton
            type="button"
            loading={mutation.isPending}
            disabled={!dirty}
            onClick={() => {
              if (valid) {
                mutation.mutate({ maxTokens: parsed });
              }
            }}
            className="h-10 px-5 text-[0.75rem]"
          >
            保存上限
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}
