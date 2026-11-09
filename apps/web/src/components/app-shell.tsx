import type { AuthUser } from '@inkseek/shared';
import { Link, useRouterState } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Brain,
  ChevronRight,
  Compass,
  LoaderCircle,
  LogOut,
  MessagesSquare,
  Settings2,
  UsersRound,
  Waypoints,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { cn } from '@/lib/cn';
import { routeSection } from '@/lib/route-section';

interface AppShellProps {
  user: AuthUser;
  onLogout: () => void;
  loggingOut: boolean;
  children: ReactNode;
}

interface NavItem {
  label: string;
  icon: LucideIcon;
  to?: '/' | '/personas' | '/connections' | '/mind' | '/direct' | '/insights';
  soon?: boolean;
}

const navItems: NavItem[] = [
  { label: '概览', icon: Compass, to: '/' },
  { label: '人格中心', icon: UsersRound, to: '/personas' },
  { label: '互联中心', icon: Waypoints, to: '/connections' },
  { label: '人格心智', icon: Brain, to: '/mind' },
  { label: '直接对话', icon: MessagesSquare, to: '/direct' },
  { label: '数据洞察', icon: BarChart3, to: '/insights' },
];

/**
 * Persistent console chrome: sidebar navigation and account block on desktop,
 * a compact header on narrow screens, and the scrollable content area that
 * resets to the top whenever the active section changes.
 */
export function AppShell({ user, onLogout, loggingOut, children }: AppShellProps) {
  const initial = (user.displayName || user.username).slice(0, 1).toUpperCase();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const section = routeSection(pathname);
  const mainRef = useRef<HTMLElement>(null);
  const sectionLabel =
    pathname === '/mind'
      ? '人格心智'
      : pathname === '/direct'
        ? '直接对话'
        : pathname === '/insights'
          ? '数据洞察'
          : pathname.startsWith('/connections')
            ? pathname === '/connections/private'
              ? '互联中心 · 私聊'
              : pathname === '/connections/groups'
                ? '互联中心 · 群聊'
                : '互联中心'
            : pathname === '/personas'
              ? '人格中心'
              : pathname === '/settings'
                ? '系统设置'
                : '概览';

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [section]);

  return (
    <div className="relative flex h-dvh overflow-hidden">
      <aside className="relative z-20 hidden w-[16.5rem] shrink-0 flex-col overflow-y-auto border-r border-mist-100/[0.06] bg-ink-900/55 backdrop-blur-2xl lg:flex">
        <div className="px-6 pb-5 pt-7">
          <BrandMark />
        </div>

        <div className="px-4">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl border border-mist-100/[0.07] bg-ink-950/50 px-3 py-2.5 text-left transition hover:border-brass-400/25 hover:bg-ink-950/80"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-brass-300/20 to-jade-400/10 font-display text-[0.72rem] font-semibold text-brass-200">
              IS
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8rem] font-medium text-mist-200">
                inkSeek Studio
              </span>
              <span className="block truncate font-mono text-[0.6rem] uppercase tracking-[0.18em] text-mist-600">
                Workspace
              </span>
            </span>
            <ChevronRight className="size-3.5 text-mist-600" />
          </button>
        </div>

        <nav className="mt-7 flex-1 space-y-1 px-3">
          <p className="px-3 pb-2 font-mono text-[0.6rem] uppercase tracking-[0.26em] text-mist-600">
            Control
          </p>
          {navItems.map(({ label, icon: Icon, to, soon }) => {
            const active =
              to === '/connections' ? pathname.startsWith('/connections') : pathname === to;
            const content = (
              <>
                <Icon className="size-[1.05rem]" strokeWidth={1.6} />
                <span className="flex-1">{label}</span>
                {soon && (
                  <span className="rounded border border-mist-100/[0.07] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.12em] text-mist-600">
                    soon
                  </span>
                )}
              </>
            );

            return to ? (
              <Link
                key={label}
                to={to}
                data-active={active ? 'true' : 'false'}
                className="nav-item w-full text-left"
              >
                {content}
              </Link>
            ) : (
              <button
                key={label}
                type="button"
                disabled={soon}
                data-active="false"
                className={cn('nav-item w-full text-left', soon && 'cursor-not-allowed')}
              >
                {content}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-mist-100/[0.06] p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brass-soft to-brass-deep font-display text-sm font-semibold text-on-brass">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.82rem] font-medium text-mist-200">
                {user.displayName}
              </p>
              <p className="truncate font-mono text-[0.6rem] uppercase tracking-[0.14em] text-mist-600">
                {user.role === 'ADMIN' ? 'Administrator' : 'Member'}
              </p>
            </div>
            <Link
              to="/settings"
              title="系统设置"
              aria-label="系统设置"
              className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-brass-300"
            >
              <Settings2 className="size-4" strokeWidth={1.7} />
            </Link>
            <button
              type="button"
              onClick={onLogout}
              disabled={loggingOut}
              className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-signal-400 disabled:opacity-50"
              aria-label="退出登录"
            >
              {loggingOut ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" strokeWidth={1.7} />
              )}
            </button>
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-16 shrink-0 items-center justify-between border-b border-mist-100/[0.06] bg-ink-950/40 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-4">
            <div className="lg:hidden">
              <BrandMark compact />
            </div>
            <div className="hidden items-center gap-2 text-[0.72rem] text-mist-600 sm:flex">
              <span className="font-mono uppercase tracking-[0.22em]">Console</span>
              <ChevronRight className="size-3" />
              <span className="text-mist-300">{sectionLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeSwitcher />

            <div className="hidden items-center gap-2 rounded-full border border-jade-400/15 bg-jade-400/[0.06] px-3 py-1.5 sm:flex">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-jade-400 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-jade-400" />
              </span>
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-jade-300">
                Ready
              </span>
            </div>

            <div className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-brass-soft to-brass-deep font-display text-xs font-semibold text-on-brass lg:hidden">
              {initial}
            </div>

            <Link
              to="/settings"
              title="系统设置"
              aria-label="系统设置"
              className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-brass-300 lg:hidden"
            >
              <Settings2 className="size-4" strokeWidth={1.7} />
            </Link>

            <button
              type="button"
              onClick={onLogout}
              disabled={loggingOut}
              className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-signal-400 lg:hidden"
              aria-label="退出登录"
            >
              <LogOut className="size-4" strokeWidth={1.7} />
            </button>
          </div>
        </header>

        <main ref={mainRef} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 ink-grid opacity-25" />
            <div
              className="absolute -right-40 -top-48 size-[34rem] rounded-full blur-3xl"
              style={{
                background:
                  'radial-gradient(circle at center, var(--panel-accent-glow), transparent 66%)',
              }}
            />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
