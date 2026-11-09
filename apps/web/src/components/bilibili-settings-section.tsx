import { zodResolver } from '@hookform/resolvers/zod';
import type { BilibiliSettings, SettingsOverview } from '@inkseek/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clapperboard, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PrimaryButton } from '@/components/button';
import { Field, InputShell } from '@/components/field';
import { ApiError, api } from '@/lib/api';
import { applyApiFieldErrors } from '@/lib/form-errors';
import { settingsQuery } from '@/lib/queries';

const bilibiliFormSchema = z.object({
  sessdata: z.string().trim().max(2048, 'SESSDATA 过长').optional(),
});

type BilibiliFormValues = z.infer<typeof bilibiliFormSchema>;

const timestampFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

interface BilibiliSettingsSectionProps {
  bilibili: BilibiliSettings | null;
}

/**
 * Settings card for the Bilibili subtitle credential. The cookie is verified
 * server-side before saving, never echoed back, and can be cleared explicitly.
 */
export function BilibiliSettingsSection({ bilibili }: BilibiliSettingsSectionProps) {
  const queryClient = useQueryClient();
  const [showCookie, setShowCookie] = useState(false);
  const [clearCookie, setClearCookie] = useState(false);

  const form = useForm<BilibiliFormValues>({
    resolver: zodResolver(bilibiliFormSchema),
    defaultValues: { sessdata: '' },
  });

  const mutation = useMutation({
    mutationFn: api.updateBilibiliSettings,
    onSuccess: (result) => {
      queryClient.setQueryData<SettingsOverview>(settingsQuery.queryKey, (current) =>
        current ? { ...current, bilibili: result.bilibili } : current,
      );
      setClearCookie(false);
      form.reset({ sessdata: '' });
      toast.success(
        result.bilibili.hasCookie ? 'B 站登录状态校验通过，凭据已保存' : '已清除 B 站字幕凭据',
      );
    },
    onError: (error) => {
      applyApiFieldErrors(form.setError, error, ['sessdata']);
      toast.error(error instanceof ApiError ? error.message : 'B 站字幕凭据保存失败');
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    mutation.mutate({
      sessdata: values.sessdata ?? '',
      clearCookie,
    });
  });

  const errors = form.formState.errors;
  const cookieHint = clearCookie
    ? '保存后将清除凭据，视频改为使用封面分镜与热评'
    : bilibili?.hasCookie
      ? '已保存，留空保持不变'
      : '从 bilibili.com 的 Cookie 中复制 SESSDATA';

  return (
    <section className="relative overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5 backdrop-blur-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-mist-100/[0.07] bg-ink-950/50 text-brass-300">
            <Clapperboard className="size-[1.1rem]" strokeWidth={1.6} />
          </span>
          <div>
            <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
              B 站字幕
            </h2>
            <p className="mt-1 max-w-xl text-[0.78rem] leading-6 text-mist-500">
              {'B 站的自动字幕只对登录用户开放。填入浏览器 Cookie 中的 SESSDATA 后，心智观看 B 站视频时会优先读取自动字幕；凭据只保存在服务端，不会回显。'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {bilibili?.hasCookie ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-jade-400/25 bg-jade-400/[0.07] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-jade-300">
              <CheckCircle2 className="size-3" />
              {bilibili.loginName || 'Configured'}
            </span>
          ) : (
            <span className="rounded-full border border-signal-400/25 bg-signal-400/[0.07] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-signal-400">
              Not configured
            </span>
          )}
          {bilibili && (
            <span className="text-[0.66rem] text-mist-600">
              {timestampFormatter.format(new Date(bilibili.updatedAt))}
            </span>
          )}
        </div>
      </div>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
        <Field
          label="SESSDATA"
          htmlFor="settings-bilibili-sessdata"
          hint={cookieHint}
          error={errors.sessdata?.message}
        >
          <InputShell
            icon={<LockKeyhole className="size-4" strokeWidth={1.7} />}
            invalid={Boolean(errors.sessdata)}
            trailing={
              <button
                type="button"
                onClick={() => setShowCookie((value) => !value)}
                className="-mr-1 rounded-md p-1.5 text-mist-600 transition hover:text-mist-200"
                aria-label={showCookie ? '隐藏 SESSDATA' : '显示 SESSDATA'}
              >
                {showCookie ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          >
            <input
              id="settings-bilibili-sessdata"
              type={showCookie ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              disabled={clearCookie}
              placeholder={
                bilibili?.hasCookie && !clearCookie
                  ? '留空保持已保存凭据'
                  : '粘贴 SESSDATA 的值'
              }
              {...form.register('sessdata')}
            />
          </InputShell>
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.68rem] leading-5 text-mist-600">
            保存前会请求 B 站登录态接口校验，有效才会写入。
          </p>

          {bilibili?.hasCookie && (
            <button
              type="button"
              onClick={() => setClearCookie((value) => !value)}
              className={[
                'rounded-lg border px-3 py-1.5 text-[0.68rem] transition',
                clearCookie
                  ? 'border-brass-400/30 bg-brass-400/[0.08] text-brass-300'
                  : 'border-mist-100/[0.08] text-mist-600 hover:border-signal-400/30 hover:text-signal-400',
              ].join(' ')}
            >
              {clearCookie ? '恢复保留凭据' : '清除已保存凭据'}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-mist-100/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.68rem] leading-5 text-mist-600">
            缺少凭据时仍可观看视频，只是读不到自动字幕。
          </p>
          <PrimaryButton
            type="submit"
            loading={mutation.isPending}
            className="h-11 w-full sm:w-auto sm:px-6"
          >
            {clearCookie ? '清除凭据' : '验证并保存'}
          </PrimaryButton>
        </div>
      </form>
    </section>
  );
}
