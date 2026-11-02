import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@inkseek/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  CalendarClock,
  Eye,
  EyeOff,
  LockKeyhole,
  MessagesSquare,
  UserRound,
  Waves,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { AuthShell } from '@/components/auth-shell';
import { PrimaryButton } from '@/components/button';
import { Field, InputShell } from '@/components/field';
import { ApiError, api } from '@/lib/api';
import { applyApiFieldErrors } from '@/lib/form-errors';
import { meQuery } from '@/lib/queries';

const features = [
  { icon: MessagesSquare, label: '对话控制', detail: '流式输出 · 工具调用' },
  { icon: CalendarClock, label: '定时调度', detail: 'Cron · 执行历史' },
  { icon: Waves, label: '数据洞察', detail: '实时指标 · 可视化' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const { errors } = form.formState;

  const loginMutation = useMutation({
    mutationFn: api.login,
    onSuccess: ({ user }) => {
      queryClient.setQueryData(meQuery.queryKey, user);
      toast.success(`欢迎回来，${user.displayName}`);
      void navigate({ to: '/' });
    },
    onError: (error) => {
      applyApiFieldErrors(form.setError, error);
      toast.error(error instanceof ApiError ? error.message : '登录失败，请稍后重试');
    },
  });

  const onSubmit = form.handleSubmit((values) => loginMutation.mutate(values));

  return (
    <AuthShell
      eyebrow="Agent Control Plane"
      title={
        <>
          让智能体，
          <br />
          在你的<span className="text-brass-300">掌控</span>之中。
        </>
      }
      description="统一管理对话、定时任务与数据洞察。流式响应、执行轨迹与运行状态，都在同一个控制台里。"
      features={features}
    >
      <div className="glass-panel relative overflow-hidden rounded-[1.6rem] p-7 sm:p-8">
        <div className="absolute inset-x-8 top-0 h-px hairline" />

        <div className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-brass-400/75">
          <span className="size-1.5 rounded-full bg-brass-400 shadow-[0_0_12px_rgba(230,189,122,0.8)]" />
          Sign in
        </div>

        <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-mist-100">
          登录控制台
        </h2>
        <p className="mt-2 text-sm leading-6 text-mist-500">使用初始化时创建的管理员账户继续。</p>

        <form className="mt-7 space-y-5" onSubmit={onSubmit} noValidate>
          <Field label="用户名" htmlFor="username" error={errors.username?.message}>
            <InputShell
              icon={<UserRound className="size-4" strokeWidth={1.7} />}
              invalid={Boolean(errors.username)}
            >
              <input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="admin"
                spellCheck={false}
                {...form.register('username')}
              />
            </InputShell>
          </Field>

          <Field label="密码" htmlFor="password" error={errors.password?.message}>
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
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                {...form.register('password')}
              />
            </InputShell>
          </Field>

          <PrimaryButton
            type="submit"
            loading={loginMutation.isPending}
            icon={<ArrowRight className="size-4" />}
          >
            进入控制台
          </PrimaryButton>
        </form>

        <div className="mt-6 flex items-center gap-2.5 border-t border-mist-100/[0.06] pt-5 text-[0.7rem] text-mist-600">
          <span className="size-1.5 rounded-full bg-jade-400" />
          会话通过 HttpOnly Cookie 维持，7 天无操作后自动失效
        </div>
      </div>
    </AuthShell>
  );
}
