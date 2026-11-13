import { useQuery } from '@tanstack/react-query';
import { LoaderCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { BilibiliSettingsSection } from '@/components/bilibili-settings-section';
import { GhostButton } from '@/components/button';
import { MindBannedWordsSection } from '@/components/mind-banned-words-section';
import { ModelProviderSection } from '@/components/model-provider-section';
import { PhoneSettingsSection } from '@/components/phone-settings-section';
import { RedisSettingsSection } from '@/components/redis-settings-section';
import { TtsSettingsSection } from '@/components/tts-settings-section';
import { WebAccessSection } from '@/components/web-access-section';
import { ApiError } from '@/lib/api';
import { meQuery, settingsQuery } from '@/lib/queries';

const EMPTY_PHONE = {
  adbAvailable: false,
  adbPath: '',
  adbVersion: '',
  devices: [],
  error: '',
};

/** Admin-only settings screen: cache, phone bridge, Bilibili, banned words, speech synthesis and model providers. */
export function SettingsPage() {
  const { data: user } = useQuery(meQuery);
  const settings = useQuery(settingsQuery);

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <LoaderCircle className="size-5 animate-spin text-brass-400" />
      </div>
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <div className="relative mx-auto w-full max-w-3xl px-6 py-16 sm:px-8">
        <div className="glass-panel rounded-2xl p-8 text-center">
          <ShieldAlert className="mx-auto size-7 text-signal-400" strokeWidth={1.6} />
          <h1 className="mt-4 font-display text-xl font-semibold text-mist-100">仅管理员可访问</h1>
          <p className="mt-2 text-sm text-mist-500">
            系统设置包含缓存凭据与模型密钥，当前账户没有管理权限。
          </p>
        </div>
      </div>
    );
  }

  const overview = settings.data;
  const providers = overview?.providers ?? [];
  const queryError = settings.error;

  return (
    <div className="relative mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-12">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[0.63rem] uppercase tracking-[0.3em] text-brass-400/75">
            System Settings
          </span>
          <span className="h-px w-12 bg-brass-400/25" />
          <span className="text-[0.72rem] text-mist-600">配置写入数据库，密钥不回显</span>
        </div>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-[clamp(2rem,3.4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-mist-100">
              设置
            </h1>
            <p className="mt-3 max-w-2xl text-[0.9rem] leading-7 text-mist-500">
              维护缓存连接、手机控制、全局禁用词、语音合成与模型接入。所有保存动作都会先进行真实连通性测试，
              通过后才会落库。
            </p>
          </div>

          <div className="flex items-center gap-2 self-start rounded-full border border-jade-400/15 bg-jade-400/[0.06] px-3 py-1.5 sm:self-auto">
            <ShieldAlert className="size-3.5 text-jade-300" strokeWidth={1.7} />
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-jade-300">
              Admin only
            </span>
          </div>
        </div>
      </motion.header>

      <div className="mt-10 space-y-6">
        {settings.isPending ? (
          <>
            <div className="h-64 animate-pulse rounded-2xl border border-mist-100/[0.06] bg-ink-900/30" />
            <div className="h-56 animate-pulse rounded-2xl border border-mist-100/[0.06] bg-ink-900/30" />
          </>
        ) : queryError ? (
          <div className="rounded-2xl border border-signal-400/20 bg-ink-900/40 p-6 backdrop-blur-sm">
            <p className="text-sm text-signal-400">
              {queryError instanceof ApiError ? queryError.message : '设置加载失败，请稍后重试'}
            </p>
            <GhostButton
              type="button"
              onClick={() => void settings.refetch()}
              className="mt-4 h-9 px-4 text-[0.72rem]"
            >
              <RefreshCw className="size-3.5" />
              重新加载
            </GhostButton>
          </div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              <RedisSettingsSection redis={overview?.redis ?? null} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <PhoneSettingsSection phone={overview?.phone ?? EMPTY_PHONE} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <BilibiliSettingsSection bilibili={overview?.bilibili ?? null} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <MindBannedWordsSection words={overview?.mindBannedWords ?? []} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.23, ease: [0.22, 1, 0.36, 1] }}
            >
              <WebAccessSection hosts={overview?.webAllowedHosts ?? []} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <TtsSettingsSection tts={overview?.tts ?? null} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.27, ease: [0.22, 1, 0.36, 1] }}
            >
              <ModelProviderSection providers={providers} />
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
