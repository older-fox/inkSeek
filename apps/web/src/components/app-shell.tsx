import type { AuthUser } from '@inkseek/shared';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bot,
  CalendarClock,
  ChevronRight,
  Compass,
  LoaderCircle,
  LogOut,
  MessageSquare,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { cn } from '@/lib/cn';

interface AppShellProps {
  user: AuthUser;
  onLogout: () => void;
  loggingOut: boolean;
  children: ReactNode;
}

interface NavItem {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  soon?: boolean;
}

const navItems: NavItem[] = [
  { label: '概览', icon: Compass, active: true },
  { label: '对话', icon: MessageSquare, soon: true },
  { label: '智能体', icon: Bot, soon: true },
  { label: '定时任务', icon: CalendarClock, soon: true },
  { label: '数据洞察', icon: BarChart3, soon: true },
];

export function AppShell({ user, onLogout, loggingOut, children }: AppShellProps) {
  const initial = (user.displayName || user.username).slice(0, 1).toUpperCase();

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      <aside className="relative z-20 hidden w-[16.5rem] shrink-0 flex-col border-r border-mist-100/[0.06] bg-ink-900/55 backdrop-blur-2xl lg:flex">
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
          {navItems.map(({ label, icon: Icon, active, soon }) => (
            <button
              key={label}
              type="button"
              disabled={soon}
              data-active={active ? 'true' : 'false'}
              className={cn('nav-item w-full text-left', soon && 'cursor-not-allowed')}
            >
              <Icon className="size-[1.05rem]" strokeWidth={1.6} />
              <span className="flex-1">{label}</span>
              {soon && (
                <span className="rounded border border-mist-100/[0.07] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.12em] text-mist-600">
                  soon
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-mist-100/[0.06] p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brass-300 to-brass-600 font-display text-sm font-semibold text-ink-950">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.82rem] font-medium text-mist-200">{user.displayName}</p>
              <p className="truncate font-mono text-[0.6rem] uppercase tracking-[0.14em] text-mist-600">
                {user.role === 'ADMIN' ? 'Administrator' : 'Member'}
              </p>
            </div>
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
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-mist-100/[0.06] bg-ink-950/40 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-4">
            <div className="lg:hidden">
              <BrandMark compact />
            </div>
            <div className="hidden items-center gap-2 text-[0.72rem] text-mist-600 sm:flex">
              <span className="font-mono uppercase tracking-[0.22em]">Console</span>
              <ChevronRight className="size-3" />
              <span className="text-mist-300">概览</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-jade-400/15 bg-jade-400/[0.06] px-3 py-1.5 sm:flex">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-jade-400 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-jade-400" />
              </span>
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-jade-300">
                Ready
              </span>
            </div>

            <div className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-brass-300 to-brass-600 font-display text-xs font-semibold text-ink-950 lg:hidden">
              {initial}
            </div>

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

        <main className="relative flex-1 overflow-x-hidden overflow-y-auto">
          <div className="pointer-events-none absolute inset-0 ink-grid opacity-25" />
          <div
            className="pointer-events-none absolute -right-40 -top-48 size-[34rem] rounded-full blur-3xl"
            style={{
              background:
                'radial-gradient(circle at center, rgba(230, 189, 122, 0.09), transparent 66%)',
            }}
          />
          {children}
        </main>
      </div>
    </div>
  );
}
