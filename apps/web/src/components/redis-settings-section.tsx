import { zodResolver } from '@hookform/resolvers/zod';
import type { RedisSettings, SettingsOverview } from '@inkseek/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  LockKeyhole,
  Server,
  ShieldCheck,
  Waves,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PrimaryButton } from '@/components/button';
import { Field, InputShell } from '@/components/field';
import { ApiError, api } from '@/lib/api';
import { applyApiFieldErrors } from '@/lib/form-errors';
import { settingsQuery } from '@/lib/queries';

const redisFormSchema = z.object({
  host: z.string().trim().min(1, '请填写 Redis 主机地址'),
  port: z
    .number()
    .int('端口必须是整数')
    .min(1, '端口范围为 1-65535')
    .max(65535, '端口范围为 1-65535'),
  db: z.number().int('数据库编号必须是整数').min(0, '数据库编号不能小于 0'),
  password: z.string().max(256, '密码过长').optional(),
  tls: z.boolean(),
});

type RedisFormValues = z.infer<typeof redisFormSchema>;

const timestampFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

interface RedisSettingsSectionProps {
  redis: RedisSettings | null;
}

/**
 * Settings card for the Redis connection used by cache, queues and event
 * broadcast. Saving first runs a live PING and only persists on success.
 */
export function RedisSettingsSection({ redis }: RedisSettingsSectionProps) {
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);

  const form = useForm<RedisFormValues>({
    resolver: zodResolver(redisFormSchema),
    defaultValues: {
      host: redis?.host ?? '',
      port: redis?.port ?? 6379,
      db: redis?.db ?? 0,
      password: '',
      tls: redis?.tls ?? false,
    },
  });

  useEffect(() => {
    form.reset({
      host: redis?.host ?? '',
      port: redis?.port ?? 6379,
      db: redis?.db ?? 0,
      password: '',
      tls: redis?.tls ?? false,
    });
    setClearPassword(false);
  }, [redis, form]);

  const mutation = useMutation({
    mutationFn: api.updateRedisSettings,
    onSuccess: (result) => {
      queryClient.setQueryData<SettingsOverview>(settingsQuery.queryKey, (current) =>
        current ? { ...current, redis: result.redis } : current,
      );
      setClearPassword(false);
      form.reset((values) => ({ ...values, password: '' }));
      toast.success(`Redis 连接成功 · ${result.latencyMs}ms，配置已保存`);
    },
    onError: (error) => {
      applyApiFieldErrors(form.setError, error, ['redis']);
      toast.error(error instanceof ApiError ? error.message : 'Redis 配置保存失败');
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    mutation.mutate({
      host: values.host,
      port: values.port,
      db: values.db,
      tls: values.tls,
      password: values.password ?? '',
      clearPassword,
    });
  });

  const errors = form.formState.errors;
  const passwordHint = clearPassword
    ? '保存后将清空密码'
    : redis?.hasPassword
      ? '已保存，留空保持不变'
      : '可选';

  return (
    <section className="relative overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5 backdrop-blur-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-mist-100/[0.07] bg-ink-950/50 text-jade-300">
            <Database className="size-[1.1rem]" strokeWidth={1.6} />
          </span>
          <div>
            <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
              Redis 缓存
            </h2>
            <p className="mt-1 text-[0.78rem] leading-6 text-mist-500">
              用于缓存、队列与跨实例事件广播。保存前会实际执行 PING 测试。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {redis ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-jade-400/25 bg-jade-400/[0.07] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-jade-300">
              <CheckCircle2 className="size-3" />
              Configured
            </span>
          ) : (
            <span className="rounded-full border border-signal-400/25 bg-signal-400/[0.07] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-signal-400">
              Not configured
            </span>
          )}
          {redis && (
            <span className="text-[0.66rem] text-mist-600">
              {timestampFormatter.format(new Date(redis.updatedAt))}
            </span>
          )}
        </div>
      </div>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
        <Field label="主机地址" htmlFor="settings-host" error={errors.host?.message}>
          <InputShell
            icon={<Server className="size-4" strokeWidth={1.7} />}
            invalid={Boolean(errors.host)}
          >
            <input
              id="settings-host"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="redis.internal 或 127.0.0.1"
              {...form.register('host')}
            />
          </InputShell>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="端口" htmlFor="settings-port" error={errors.port?.message}>
            <InputShell
              icon={<Waves className="size-4" strokeWidth={1.7} />}
              invalid={Boolean(errors.port)}
            >
              <input
                id="settings-port"
                type="number"
                inputMode="numeric"
                {...form.register('port', { valueAsNumber: true })}
              />
            </InputShell>
          </Field>

          <Field label="数据库编号" htmlFor="settings-db" error={errors.db?.message}>
            <InputShell
              icon={<Database className="size-4" strokeWidth={1.7} />}
              invalid={Boolean(errors.db)}
            >
              <input
                id="settings-db"
                type="number"
                inputMode="numeric"
                {...form.register('db', { valueAsNumber: true })}
              />
            </InputShell>
          </Field>
        </div>

        <Field
          label="密码"
          htmlFor="settings-redis-password"
          hint={passwordHint}
          error={errors.password?.message}
        >
          <InputShell
            icon={<LockKeyhole className="size-4" strokeWidth={1.7} />}
            invalid={Boolean(errors.password)}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="-mr-1 rounded-md p-1.5 text-mist-600 transition hover:text-mist-200"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          >
            <input
              id="settings-redis-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              disabled={clearPassword}
              placeholder={
                redis?.hasPassword && !clearPassword ? '留空保持已保存密码' : '留空表示无密码'
              }
              {...form.register('password')}
            />
          </InputShell>
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Controller
            control={form.control}
            name="tls"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-4 text-jade-400" strokeWidth={1.7} />
                <div>
                  <p className="text-[0.82rem] text-mist-200">启用 TLS</p>
                  <p className="text-[0.66rem] text-mist-600">云托管 Redis 通常需要开启</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={field.value}
                  aria-label="启用 TLS"
                  onClick={() => field.onChange(!field.value)}
                  className={[
                    'relative ml-2 h-6 w-11 shrink-0 rounded-full border transition',
                    field.value
                      ? 'border-brass-400/50 bg-brass-400/80'
                      : 'border-mist-100/10 bg-ink-700',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'absolute top-0.5 size-[1.1rem] rounded-full bg-switch-knob shadow transition-all',
                      field.value ? 'left-[1.4rem]' : 'left-0.5',
                    ].join(' ')}
                  />
                </button>
              </div>
            )}
          />

          {redis?.hasPassword && (
            <button
              type="button"
              onClick={() => setClearPassword((value) => !value)}
              className={[
                'rounded-lg border px-3 py-1.5 text-[0.68rem] transition',
                clearPassword
                  ? 'border-brass-400/30 bg-brass-400/[0.08] text-brass-300'
                  : 'border-mist-100/[0.08] text-mist-600 hover:border-signal-400/30 hover:text-signal-400',
              ].join(' ')}
            >
              {clearPassword ? '恢复保留密码' : '清除已保存密码'}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-mist-100/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.68rem] leading-5 text-mist-600">
            测试通过后才会写入数据库，密码不会返回前端。
          </p>
          <PrimaryButton
            type="submit"
            loading={mutation.isPending}
            className="h-11 w-full sm:w-auto sm:px-6"
          >
            测试并保存
          </PrimaryButton>
        </div>
      </form>
    </section>
  );
}
