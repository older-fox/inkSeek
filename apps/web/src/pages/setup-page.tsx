import { zodResolver } from '@hookform/resolvers/zod';
import {
  adminAccountSchema,
  type AdminAccountInput,
  type RedisConnectionInput,
} from '@inkseek/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  AnimatePresence,
  motion,
} from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  MessagesSquare,
  Server,
  ShieldCheck,
  UserRound,
  Waves,
} from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { GhostButton, PrimaryButton } from '@/components/button';
import { Field, InputShell } from '@/components/field';
import { ApiError, api } from '@/lib/api';
import { applyApiFieldErrors } from '@/lib/form-errors';
import { bootstrapStatusQuery, meQuery } from '@/lib/queries';

const redisFormSchema = z.object({
  host: z.string().trim().min(1, '请填写 Redis 主机地址'),
  port: z.number().int('端口必须是整数').min(1, '端口范围为 1-65535').max(65535, '端口范围为 1-65535'),
  db: z.number().int('数据库编号必须是整数').min(0, '数据库编号不能小于 0'),
  password: z.string().max(256, '密码过长').optional(),
  tls: z.boolean(),
});

type RedisFormValues = z.infer<typeof redisFormSchema>;

const adminFormSchema = adminAccountSchema
  .extend({
    confirmPassword: z.string().min(1, '请再次输入密码'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

type AdminFormValues = z.infer<typeof adminFormSchema>;

const features = [
  { icon: ShieldCheck, label: '安全初始化', detail: '配置只落库不落盘' },
  { icon: Database, label: '集中配置', detail: 'Redis 与账户入库' },
  { icon: Waves, label: '开箱即用', detail: '完成后自动登录' },
];

export function SetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const redisForm = useForm<RedisFormValues>({
    resolver: zodResolver(redisFormSchema),
    defaultValues: { host: '', port: 6379, db: 0, password: '', tls: false },
  });

  const adminForm = useForm<AdminFormValues>({
    resolver: zodResolver(adminFormSchema),
    defaultValues: {
      username: '',
      displayName: '',
      password: '',
      confirmPassword: '',
    },
  });

  const testRedisMutation = useMutation({
    mutationFn: api.testRedis,
    onSuccess: (result) => {
      toast.success(`Redis 连接成功 · ${result.latencyMs}ms`);
      setStep(2);
    },
    onError: (error) => {
      applyApiFieldErrors(redisForm.setError, error, ['redis']);
      toast.error(error instanceof ApiError ? error.message : 'Redis 连接失败');
    },
  });

  const bootstrapMutation = useMutation({
    mutationFn: api.bootstrap,
    onSuccess: ({ user }) => {
      queryClient.setQueryData(meQuery.queryKey, user);
      queryClient.setQueryData(bootstrapStatusQuery.queryKey, { initialized: true });
      toast.success('初始化完成，欢迎进入控制台');
      void navigate({ to: '/' });
    },
    onError: (error) => {
      applyApiFieldErrors(adminForm.setError, error, ['admin']);
      toast.error(error instanceof ApiError ? error.message : '初始化失败，请稍后重试');
    },
  });

  const handleRedisSubmit = redisForm.handleSubmit((values) => {
    const payload: RedisConnectionInput = { ...values, password: values.password ?? '' };
    testRedisMutation.mutate(payload);
  });

  const handleAdminSubmit = adminForm.handleSubmit((values) => {
    const { confirmPassword: _confirmPassword, ...admin } = values;
    const redis = redisForm.getValues();

    const payload = {
      redis: { ...redis, password: redis.password ?? '' } satisfies RedisConnectionInput,
      admin: admin satisfies AdminAccountInput,
    };

    bootstrapMutation.mutate(payload);
  });

  const redisErrors = redisForm.formState.errors;
  const adminErrors = adminForm.formState.errors;
  const busy = testRedisMutation.isPending || bootstrapMutation.isPending;

  return (
    <AuthShell
      eyebrow="First Run · Initial Setup"
      title={
        <>
          从一张<span className="text-brass-300">白纸</span>，
          <br />
          建立你的控制面。
        </>
      }
      description="数据库已就绪。接下来只需填入 Redis 连接信息并创建管理员账户，其余配置都会存入数据库。"
      features={features}
      footerNote="首次初始化仅执行一次 · 配置保存后可在数据库中管理"
    >
      <div className="glass-panel relative overflow-hidden rounded-[1.6rem] p-7 sm:p-8">
        <div className="absolute inset-x-8 top-0 h-px hairline" />

        <div className="flex items-center gap-3">
          {[
            { id: 1, label: 'Redis' },
            { id: 2, label: '管理员' },
          ].map((item) => {
            const active = step === item.id;
            const done = step > item.id;

            return (
              <div key={item.id} className="flex items-center gap-2">
                <span
                  className={[
                    'grid size-6 place-items-center rounded-full border font-mono text-[0.62rem] transition',
                    active
                      ? 'border-brass-400/60 bg-brass-400/15 text-brass-300'
                      : done
                        ? 'border-jade-400/40 bg-jade-400/10 text-jade-300'
                        : 'border-mist-100/10 text-mist-600',
                  ].join(' ')}
                >
                  {done ? <Check className="size-3" /> : `0${item.id}`}
                </span>
                <span
                  className={`text-[0.72rem] tracking-[0.12em] ${
                    active ? 'text-mist-200' : 'text-mist-600'
                  }`}
                >
                  {item.label}
                </span>
              </div>
            );
          })}

          <span className="ml-auto font-mono text-[0.65rem] tracking-[0.16em] text-mist-600">
            0{step} / 02
          </span>
        </div>

        <div className="mt-4 h-px w-full bg-mist-100/[0.06]">
          <motion.div
            className="h-px bg-gradient-to-r from-brass-400 to-jade-400"
            animate={{ width: `${(step / 2) * 100}%` }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        <div className="mt-6">
          <AnimatePresence mode="wait" initial={false}>
            {step === 1 ? (
              <motion.div
                key="redis"
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-brass-400/75">
                  Step 01
                </p>
                <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight text-mist-100">
                  连接 Redis
                </h2>
                <p className="mt-2 text-sm leading-6 text-mist-500">
                  用于队列、缓存与跨实例事件广播。连接信息将写入数据库。
                </p>

                <form className="mt-6 space-y-5" onSubmit={handleRedisSubmit} noValidate>
                  <Field label="主机地址" htmlFor="host" error={redisErrors.host?.message}>
                    <InputShell
                      icon={<Server className="size-4" strokeWidth={1.7} />}
                      invalid={Boolean(redisErrors.host)}
                    >
                      <input
                        id="host"
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="redis.internal 或 127.0.0.1"
                        {...redisForm.register('host')}
                      />
                    </InputShell>
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="端口" htmlFor="port" error={redisErrors.port?.message}>
                      <InputShell
                        icon={<Waves className="size-4" strokeWidth={1.7} />}
                        invalid={Boolean(redisErrors.port)}
                      >
                        <input
                          id="port"
                          type="number"
                          inputMode="numeric"
                          {...redisForm.register('port', { valueAsNumber: true })}
                        />
                      </InputShell>
                    </Field>

                    <Field label="数据库编号" htmlFor="db" error={redisErrors.db?.message}>
                      <InputShell
                        icon={<Database className="size-4" strokeWidth={1.7} />}
                        invalid={Boolean(redisErrors.db)}
                      >
                        <input
                          id="db"
                          type="number"
                          inputMode="numeric"
                          {...redisForm.register('db', { valueAsNumber: true })}
                        />
                      </InputShell>
                    </Field>
                  </div>

                  <Field
                    label="密码"
                    htmlFor="redisPassword"
                    hint="可选"
                    error={redisErrors.password?.message}
                  >
                    <InputShell
                      icon={<LockKeyhole className="size-4" strokeWidth={1.7} />}
                      invalid={Boolean(redisErrors.password)}
                    >
                      <input
                        id="redisPassword"
                        type="password"
                        autoComplete="new-password"
                        placeholder="留空表示无密码"
                        {...redisForm.register('password')}
                      />
                    </InputShell>
                  </Field>

                  <Controller
                    control={redisForm.control}
                    name="tls"
                    render={({ field }) => (
                      <div className="flex items-center justify-between rounded-xl border border-mist-100/[0.07] bg-ink-950/40 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="size-4 text-jade-400" strokeWidth={1.7} />
                          <div>
                            <p className="text-sm text-mist-200">启用 TLS</p>
                            <p className="text-[0.68rem] text-mist-600">
                              云托管 Redis 通常需要开启
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={field.value}
                          aria-label="启用 TLS"
                          onClick={() => field.onChange(!field.value)}
                          className={[
                            'relative h-6 w-11 shrink-0 rounded-full border transition',
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

                  <PrimaryButton
                    type="submit"
                    loading={testRedisMutation.isPending}
                    disabled={busy}
                    icon={<ArrowRight className="size-4" />}
                  >
                    测试连接并继续
                  </PrimaryButton>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="admin"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 18 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-brass-400/75">
                  Step 02
                </p>
                <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight text-mist-100">
                  创建管理员
                </h2>
                <p className="mt-2 text-sm leading-6 text-mist-500">
                  该账户拥有控制台全部权限，完成后将自动登录。
                </p>

                <form className="mt-6 space-y-5" onSubmit={handleAdminSubmit} noValidate>
                  <Field label="用户名" htmlFor="username" error={adminErrors.username?.message}>
                    <InputShell
                      icon={<UserRound className="size-4" strokeWidth={1.7} />}
                      invalid={Boolean(adminErrors.username)}
                    >
                      <input
                        id="username"
                        type="text"
                        autoComplete="username"
                        placeholder="admin"
                        spellCheck={false}
                        {...adminForm.register('username')}
                      />
                    </InputShell>
                  </Field>

                  <Field
                    label="显示名称"
                    htmlFor="displayName"
                    hint="可选"
                    error={adminErrors.displayName?.message}
                  >
                    <InputShell
                      icon={<KeyRound className="size-4" strokeWidth={1.7} />}
                      invalid={Boolean(adminErrors.displayName)}
                    >
                      <input
                        id="displayName"
                        type="text"
                        autoComplete="name"
                        placeholder="例如：墨客"
                        {...adminForm.register('displayName')}
                      />
                    </InputShell>
                  </Field>

                  <Field
                    label="密码"
                    htmlFor="password"
                    hint="8 位以上，含字母与数字"
                    error={adminErrors.password?.message}
                  >
                    <InputShell
                      icon={<LockKeyhole className="size-4" strokeWidth={1.7} />}
                      invalid={Boolean(adminErrors.password)}
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
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="••••••••"
                        {...adminForm.register('password')}
                      />
                    </InputShell>
                  </Field>

                  <Field
                    label="确认密码"
                    htmlFor="confirmPassword"
                    error={adminErrors.confirmPassword?.message}
                  >
                    <InputShell
                      icon={<LockKeyhole className="size-4" strokeWidth={1.7} />}
                      invalid={Boolean(adminErrors.confirmPassword)}
                      trailing={
                        <button
                          type="button"
                          onClick={() => setShowConfirm((value) => !value)}
                          className="-mr-1 rounded-md p-1.5 text-mist-600 transition hover:text-mist-200"
                          aria-label={showConfirm ? '隐藏密码' : '显示密码'}
                        >
                          {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      }
                    >
                      <input
                        id="confirmPassword"
                        type={showConfirm ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="再次输入密码"
                        {...adminForm.register('confirmPassword')}
                      />
                    </InputShell>
                  </Field>

                  <div className="flex gap-3">
                    <GhostButton
                      type="button"
                      onClick={() => setStep(1)}
                      disabled={busy}
                      className="h-12 px-4"
                      aria-label="返回 Redis 配置"
                    >
                      <ArrowLeft className="size-4" />
                    </GhostButton>
                    <PrimaryButton
                      type="submit"
                      loading={bootstrapMutation.isPending}
                      disabled={busy}
                      icon={<ArrowRight className="size-4" />}
                    >
                      创建账户并进入
                    </PrimaryButton>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center gap-2.5 border-t border-mist-100/[0.06] pt-5 text-[0.7rem] text-mist-600">
          <MessagesSquare className="size-3.5 text-mist-600" />
          完成后可在控制台继续配置智能体、定时任务与图表
          <CalendarClock className="ml-auto size-3.5 text-mist-600" />
        </div>
      </div>
    </AuthShell>
  );
}
