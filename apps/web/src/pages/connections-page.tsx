import { Link } from '@tanstack/react-router';
import { MessageCircle, Plus, Trash2, UsersRound, Waypoints } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { GhostButton, PrimaryButton } from '@/components/button';
import { ConnectChannelDialog } from '@/components/connect-channel-dialog';
import { ChannelAvatar, PlatformChip, SyncPill } from '@/components/connection-bits';
import { cn } from '@/lib/cn';
import {
  addChannel,
  channelConversationStats,
  PLATFORMS,
  removeChannel,
  useChannels,
  type Channel,
} from '@/lib/connections';

const EASE = [0.22, 1, 0.36, 1] as const;

function ChannelCard({ channel, onRemove }: { channel: Channel; onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const stats = channelConversationStats(channel.platform);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="glass-panel relative flex h-full flex-col overflow-clip rounded-[1.5rem] p-5"
    >
      <div
        className="pointer-events-none absolute -right-20 -top-24 size-52 rounded-full opacity-70 blur-2xl"
        style={{
          background:
            channel.accent === 'jade'
              ? 'radial-gradient(circle, var(--orb-jade), transparent 68%)'
              : 'radial-gradient(circle, var(--orb-brass), transparent 68%)',
        }}
      />
      <div className="absolute inset-x-5 top-0 h-px hairline" />

      <div className="relative flex items-start gap-3.5">
        <ChannelAvatar
          initials={channel.initials}
          accent={channel.accent}
          size="lg"
          online={channel.status === 'online'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
              {channel.displayName}
            </h2>
            <SyncPill label="在线" />
          </div>
          <p className="mt-1 font-mono text-[0.62rem] tracking-[0.06em] text-mist-500">
            {PLATFORMS[channel.platform].name} {channel.accountId}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <PlatformChip platform={channel.platform} connector />
            <span className="font-mono text-[0.52rem] uppercase tracking-[0.12em] text-mist-600">
              已接入 {new Date(channel.connectedAt).toLocaleDateString('zh-CN')}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`移除 ${channel.displayName} 的 ${PLATFORMS[channel.platform].name} 渠道`}
          className="rounded-lg p-2 text-mist-600 transition hover:bg-signal-400/10 hover:text-signal-400"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <p className="mt-4 border-l-2 border-brass-400/40 pl-3 text-[0.72rem] leading-6 text-mist-400">
        「{channel.signature}」
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: '私聊', value: stats.private },
          { label: '群聊', value: stats.groups },
          { label: '消息', value: stats.messages },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-mist-100/[0.07] bg-ink-950/25 px-3 py-2"
          >
            <p className="font-display text-[1.05rem] font-semibold text-mist-200">{item.value}</p>
            <p className="mt-0.5 font-mono text-[0.5rem] uppercase tracking-[0.14em] text-mist-600">
              {item.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-mist-100/[0.06] pt-4">
        <Link
          to="/connections/private"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brass-400/25 bg-brass-400/[0.07] px-3 text-[0.7rem] text-brass-300 transition hover:bg-brass-400/[0.14]"
        >
          <MessageCircle className="size-3.5" strokeWidth={1.8} />
          查看私聊
        </Link>
        <Link
          to="/connections/groups"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-mist-100/10 px-3 text-[0.7rem] text-mist-400 transition hover:border-jade-400/25 hover:bg-jade-400/[0.06] hover:text-jade-300"
        >
          <UsersRound className="size-3.5" strokeWidth={1.8} />
          查看群聊
        </Link>
        <span className="ml-auto font-mono text-[0.5rem] uppercase tracking-[0.14em] text-mist-600">
          自动同步
        </span>
      </div>

      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-10 grid place-items-center bg-ink-950/85 p-5 backdrop-blur-sm"
          >
            <div className="text-center">
              <p className="text-[0.84rem] font-medium text-mist-100">移除这个渠道？</p>
              <p className="mx-auto mt-1.5 max-w-[16rem] text-[0.66rem] leading-5 text-mist-600">
                移除后将停止接收消息，需要重新接入 {PLATFORMS[channel.platform].connector}。
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <GhostButton
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-9 px-3 text-[0.7rem]"
                >
                  取消
                </GhostButton>
                <button
                  type="button"
                  onClick={onRemove}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-signal-400/30 bg-signal-400/10 px-3 text-[0.7rem] text-signal-400 transition hover:bg-signal-400/[0.18]"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.8} />
                  确认移除
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function AddChannelTile({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        'group flex min-h-[15rem] flex-col items-center justify-center gap-3 rounded-[1.5rem]',
        'border border-dashed border-mist-100/15 bg-ink-900/20 text-mist-600 transition',
        'hover:border-brass-400/35 hover:bg-ink-900/40 hover:text-brass-300',
      )}
    >
      <span className="grid size-12 place-items-center rounded-2xl border border-mist-100/10 bg-ink-950/40 transition duration-300 group-hover:rotate-90 group-hover:border-brass-400/30">
        <Plus className="size-5" strokeWidth={1.5} />
      </span>
      <span className="text-[0.8rem]">添加消息渠道</span>
      <span className="font-mono text-[0.52rem] uppercase tracking-[0.18em] text-mist-600">
        QQ · NAPCAT
      </span>
    </button>
  );
}

function BridgeSketch() {
  return (
    <div className="relative mx-auto w-full max-w-[17rem] rounded-2xl border border-mist-100/[0.07] bg-ink-950/25 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-brass-400/25 bg-gradient-to-br from-brass-400/25 via-brass-400/10 to-transparent font-display text-[0.95rem] font-semibold text-brass-300">
            砚
          </span>
          <p className="mt-1.5 text-[0.6rem] text-mist-500">人格</p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="font-mono text-[0.46rem] uppercase tracking-[0.2em] text-mist-600">
            Bridge
          </span>
          <span className="h-px w-full bg-gradient-to-r from-transparent via-brass-400/45 to-transparent" />
          <span className="font-mono text-[0.5rem] text-mist-600">实时同步</span>
        </div>

        <div className="text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-jade-400/25 bg-gradient-to-br from-jade-400/25 via-jade-400/10 to-transparent font-display text-[0.8rem] font-semibold text-jade-300">
            QQ
          </span>
          <p className="mt-1.5 text-[0.6rem] text-mist-500">现实世界</p>
        </div>
      </div>
      <p className="mt-4 rounded-lg border border-mist-100/[0.06] bg-ink-950/40 px-3 py-2 text-center font-mono text-[0.5rem] uppercase tracking-[0.16em] text-mist-600">
        Private · Group · Messages
      </p>
    </div>
  );
}

function EmptyChannels({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="glass-panel relative overflow-hidden rounded-[1.6rem]"
    >
      <div
        className="pointer-events-none absolute -left-24 -top-28 size-72 rounded-full opacity-70 blur-3xl"
        style={{
          background: 'radial-gradient(circle, var(--orb-brass), transparent 68%)',
        }}
      />
      <div className="absolute inset-x-7 top-0 h-px hairline" />

      <div className="relative grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <span className="grid size-12 place-items-center rounded-2xl border border-brass-400/25 bg-brass-400/10 text-brass-300">
            <Waypoints className="size-5" strokeWidth={1.6} />
          </span>
          <h2 className="mt-5 font-display text-[1.55rem] font-semibold tracking-tight text-mist-100 sm:text-[1.8rem]">
            还没有接入消息渠道
          </h2>
          <p className="mt-3 max-w-lg text-[0.84rem] leading-7 text-mist-500">
            互联中心是 TA
            与现实世界之间的桥。接入 QQ、微信或 Telegram 后，登录账号会自动同步，收到的私聊与群聊也会在这里归档。
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <PrimaryButton
              type="button"
              onClick={onAdd}
              icon={<Plus className="size-4" strokeWidth={2} />}
              className="h-11 w-auto px-5"
            >
              添加消息渠道
            </PrimaryButton>
            <Link
              to="/personas"
              className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-[0.74rem] text-mist-500 transition hover:text-brass-300"
            >
              先去认识 TA
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            <PlatformChip platform="qq" connector />
            <PlatformChip platform="wechat" />
            <PlatformChip platform="telegram" />
          </div>
        </div>

        <div aria-hidden="true" className="hidden sm:block">
          <BridgeSketch />
        </div>
      </div>
    </motion.section>
  );
}

export function ConnectionsPage() {
  const channels = useChannels();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleConnected = (channel: Channel) => {
    addChannel(channel);
    toast.success(`已接入 ${PLATFORMS[channel.platform].name} · ${channel.displayName}`, {
      description: '账号资料与最近会话已同步到互联中心。',
    });
  };

  const handleRemove = (channel: Channel) => {
    removeChannel(channel.id);
    toast.success(`已移除 ${channel.displayName} 的 ${PLATFORMS[channel.platform].name} 渠道`);
  };

  return (
    <>
      {channels.length === 0 ? (
        <EmptyChannels onAdd={() => setDialogOpen(true)} />
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.72rem] text-mist-600">
              {channels.length} 个渠道 · 消息按私聊与群聊自动归档
            </p>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brass-400/30 bg-brass-400/[0.08] px-3 text-[0.7rem] text-brass-300 transition hover:bg-brass-400/[0.16]"
            >
              <Plus className="size-3.5" strokeWidth={2} />
              添加消息渠道
            </button>
          </div>

          <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-2">
            <AnimatePresence initial={false}>
              {channels.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  onRemove={() => handleRemove(channel)}
                />
              ))}
            </AnimatePresence>
            <AddChannelTile onAdd={() => setDialogOpen(true)} />
          </div>
        </motion.div>
      )}

      <ConnectChannelDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConnected={handleConnected}
        connectedPlatforms={channels.map((channel) => channel.platform)}
      />
    </>
  );
}
