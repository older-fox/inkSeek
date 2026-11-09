import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { MessageCircle, PlugZap, UsersRound } from 'lucide-react';
import { motion } from 'motion/react';
import { useChatEvents } from '@/lib/chat-events';
import { cn } from '@/lib/cn';
import { useChannels } from '@/lib/connections';
import { chatConversationsQuery } from '@/lib/queries';

const TABS = [
  { to: '/connections', label: '渠道管理', icon: PlugZap },
  { to: '/connections/private', label: '私聊', icon: MessageCircle },
  { to: '/connections/groups', label: '群聊', icon: UsersRound },
] as const;

/**
 * Layout for the interconnect center: header with bridge status, tab bar with
 * live conversation counts, and the routed child page underneath.
 */
export function ConnectionsLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const channels = useChannels();
  const { data: privateConversations } = useQuery(chatConversationsQuery('PRIVATE'));
  const { data: groupConversations } = useQuery(chatConversationsQuery('GROUP'));
  const privateCount = privateConversations?.length ?? 0;
  const groupCount = groupConversations?.length ?? 0;
  const onlineCount = channels.filter((channel) => channel.status === 'online').length;

  useChatEvents();

  const counts: Record<(typeof TABS)[number]['to'], number> = {
    '/connections': channels.length,
    '/connections/private': privateCount,
    '/connections/groups': groupCount,
  };

  return (
    <div className="relative mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 lg:py-12">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[0.63rem] uppercase tracking-[0.3em] text-brass-400/75">
              Interconnect Center
            </span>
            <span className="h-px w-12 bg-brass-400/25" />
            <span className="text-[0.72rem] text-mist-600">
              {channels.length > 0 ? `桥接 ${channels.length} 个渠道` : '尚未接入渠道'}
            </span>
          </div>

          <h1 className="mt-4 font-display text-[clamp(2rem,3.4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-mist-100">
            互联中心
          </h1>
          <p className="mt-3 max-w-2xl text-[0.9rem] leading-7 text-mist-500">
            TA
            与现实世界之间的桥。接入即时通讯平台后，账号资料会自动同步，私聊与群聊也会按平台汇入这里。
          </p>
        </div>

        <div className="w-full shrink-0 rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 px-4 py-3 sm:w-[17rem]">
          <p className="font-mono text-[0.52rem] uppercase tracking-[0.2em] text-mist-600">
            Bridge
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="relative flex size-1.5">
              {onlineCount > 0 ? (
                <>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-jade-400 opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-jade-400" />
                </>
              ) : (
                <span className="relative inline-flex size-1.5 rounded-full bg-mist-600" />
              )}
            </span>
            <span className="text-[0.78rem] text-mist-200">
              {onlineCount > 0 ? `${onlineCount} 个渠道在线` : '等待首个渠道接入'}
            </span>
          </div>
          <p className="mt-1 text-[0.6rem] text-mist-600">QQ · NapCat 实时桥接</p>
        </div>
      </motion.header>

      <nav
        aria-label="互联中心分区"
        className="mt-7 flex flex-wrap items-center gap-1 border-b border-mist-100/[0.06]"
      >
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;

          return (
            <Link
              key={to}
              to={to}
              data-active={active ? 'true' : 'false'}
              className={cn(
                'relative inline-flex items-center gap-2 px-3.5 py-2.5 text-[0.74rem] transition',
                active ? 'text-brass-200' : 'text-mist-500 hover:text-mist-300',
              )}
            >
              <Icon className="size-3.5" strokeWidth={1.7} />
              {label}
              <span
                className={cn(
                  'rounded-full border px-1.5 py-0.5 font-mono text-[0.5rem] tracking-[0.08em] transition',
                  active
                    ? 'border-brass-400/30 bg-brass-400/10 text-brass-300'
                    : 'border-mist-100/[0.08] text-mist-600',
                )}
              >
                {counts[to]}
              </span>
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-px bg-gradient-to-r from-transparent via-brass-400 to-transparent" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
