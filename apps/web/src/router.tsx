import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { AppLayout } from '@/components/app-layout';
import { AuthShell } from '@/components/auth-shell';
import { PrimaryButton } from '@/components/button';
import { ConnectionsLayout } from '@/components/connections-layout';
import { ConnectionsPage } from '@/pages/connections-page';
import { DirectChatPage } from '@/pages/direct-chat-page';
import { GroupChatsPage } from '@/pages/group-chats-page';
import { HomePage } from '@/pages/home-page';
import { LoginPage } from '@/pages/login-page';
import { MindPage } from '@/pages/mind-page';
import { PersonasPage } from '@/pages/personas-page';
import { PrivateChatsPage } from '@/pages/private-chats-page';
import { SettingsPage } from '@/pages/settings-page';
import { SetupPage } from '@/pages/setup-page';
import { queryClient } from '@/lib/query-client';
import { bootstrapStatusQuery, meQuery } from '@/lib/queries';

function RootLayout() {
  return <Outlet />;
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

async function requireSession() {
  const status = await queryClient.ensureQueryData(bootstrapStatusQuery);

  if (!status.initialized) {
    throw redirect({ to: '/setup' });
  }

  try {
    await queryClient.ensureQueryData(meQuery);
  } catch {
    throw redirect({ to: '/login' });
  }
}

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: requireSession,
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: HomePage,
});

const personasRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/personas',
  component: PersonasPage,
});

const mindRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/mind',
  validateSearch: (search: Record<string, unknown>): { channelId?: string; tab?: string } => ({
    channelId:
      typeof search.channelId === 'string' && search.channelId.length > 0
        ? search.channelId
        : undefined,
    tab: typeof search.tab === 'string' && search.tab.length > 0 ? search.tab : undefined,
  }),
  component: MindPage,
});

const directChatRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/direct',
  validateSearch: (
    search: Record<string, unknown>,
  ): { channelId?: string; identityId?: string } => ({
    channelId:
      typeof search.channelId === 'string' && search.channelId.length > 0
        ? search.channelId
        : undefined,
    identityId:
      typeof search.identityId === 'string' && search.identityId.length > 0
        ? search.identityId
        : undefined,
  }),
  component: DirectChatPage,
});

const connectionsLayoutRoute = createRoute({
  getParentRoute: () => appRoute,
  id: 'connections',
  component: ConnectionsLayout,
});

const connectionsRoute = createRoute({
  getParentRoute: () => connectionsLayoutRoute,
  path: '/connections',
  validateSearch: (search: Record<string, unknown>): { persona?: string } => ({
    persona:
      typeof search.persona === 'string' && search.persona.length > 0 ? search.persona : undefined,
  }),
  component: ConnectionsPage,
});

const privateChatsRoute = createRoute({
  getParentRoute: () => connectionsLayoutRoute,
  path: '/connections/private',
  component: PrivateChatsPage,
});

const groupChatsRoute = createRoute({
  getParentRoute: () => connectionsLayoutRoute,
  path: '/connections/groups',
  component: GroupChatsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsPage,
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

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    indexRoute,
    personasRoute,
    mindRoute,
    directChatRoute,
    connectionsLayoutRoute.addChildren([connectionsRoute, privateChatsRoute, groupChatsRoute]),
    settingsRoute,
  ]),
  loginRoute,
  setupRoute,
]);

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
