import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  useRouterState,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { AuthShell } from '@/components/auth-shell';
import { PrimaryButton } from '@/components/button';
import { HomePage } from '@/pages/home-page';
import { LoginPage } from '@/pages/login-page';
import { SetupPage } from '@/pages/setup-page';
import { queryClient } from '@/lib/query-client';
import { bootstrapStatusQuery, meQuery } from '@/lib/queries';

function RootLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="min-h-screen"
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );
}

function RootErrorComponent({ error }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    <AuthShell
      eyebrow="Connection Lost"
      title={
        <>
          暂时无法
          <br />
          连接到<span className="text-brass-300">控制面</span>。
        </>
      }
      description="前端已启动，但 API 或数据库暂时不可用。确认服务运行后重试。"
      features={[]}
      footerNote="inkSeek · 服务连接异常"
    >
      <div className="glass-panel rounded-[1.6rem] p-7 text-center sm:p-8">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-signal-400">
          API Unreachable
        </p>
        <p className="mt-4 text-sm leading-6 text-mist-500">
          {message || '请求失败，请检查 API 服务是否已启动。'}
        </p>
        <PrimaryButton className="mt-6" onClick={() => window.location.reload()}>
          重新连接
        </PrimaryButton>
      </div>
    </AuthShell>
  );
}

function NotFoundComponent() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="glass-panel w-full max-w-md rounded-[1.6rem] p-8 text-center">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-brass-400/70">404</p>
        <h1 className="mt-4 font-display text-2xl font-semibold text-mist-100">页面不存在</h1>
        <p className="mt-3 text-sm text-mist-500">你访问的路径不在控制台内。</p>
        <Link
          to="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-brass-400/30 bg-brass-400/10 px-5 text-sm text-brass-200 transition hover:bg-brass-400/20"
        >
          返回概览
        </Link>
      </div>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    const status = await queryClient.ensureQueryData(bootstrapStatusQuery);

    if (!status.initialized) {
      throw redirect({ to: '/setup' });
    }

    try {
      await queryClient.ensureQueryData(meQuery);
    } catch {
      throw redirect({ to: '/login' });
    }
  },
  component: HomePage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: async () => {
    const status = await queryClient.ensureQueryData(bootstrapStatusQuery);

    if (!status.initialized) {
      throw redirect({ to: '/setup' });
    }

    const user = await queryClient.ensureQueryData(meQuery).catch(() => null);

    if (user) {
      throw redirect({ to: '/' });
    }
  },
  component: LoginPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  beforeLoad: async () => {
    const status = await queryClient.ensureQueryData(bootstrapStatusQuery);

    if (status.initialized) {
      throw redirect({ to: '/login' });
    }
  },
  component: SetupPage,
});

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, setupRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
