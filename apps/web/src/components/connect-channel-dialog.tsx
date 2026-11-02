import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  LoaderCircle,
  RadioTower,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { GhostButton, PrimaryButton } from '@/components/button';
import { ChannelAvatar, PlatformChip } from '@/components/connection-bits';
import { Field, InputShell } from '@/components/field';
import { cn } from '@/lib/cn';
import {
  DEFAULT_NAPCAT_SERVER_URL,
  PLATFORMS,
  PLATFORM_LIST,
  createNapCatChannel,
  maskAccessToken,
  previewNapCatAccount,
  type Channel,
  type NapCatAccount,
  type PlatformDefinition,
  type PlatformId,
} from '@/lib/connections';

interface ConnectChannelDialogProps {
  open: boolean;
  onClose: () => void;
  onConnected: (channel: Channel) => void;
}

type Phase = 'choose' | 'configure' | 'connecting' | 'ready';

interface FormErrors {
  serverUrl?: string;
  accessToken?: string;
}

const CONNECT_STEPS = ['通过 WebSocket 连接 NapCat', '读取当前登录账号资料', '同步全部私聊与群聊'];

const EYEBROW: Record<Phase, string> = {
  choose: 'Connect Channel',
  configure: 'Connection Setup',
  connecting: 'Handshake',
  ready: 'Account Found',
};

const EASE = [0.22, 1, 0.36, 1] as const;

function isValidWebSocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
}

export function ConnectChannelDialog({ open, onClose, onConnected }: ConnectChannelDialogProps) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [progress, setProgress] = useState(0);
  const [activePlatform, setActivePlatform] = useState<PlatformId>('qq');
  const [serverUrl, setServerUrl] = useState(DEFAULT_NAPCAT_SERVER_URL);
  const [accessToken, setAccessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [account, setAccount] = useState<NapCatAccount | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isDesktop, setIsDesktop] = useState(false);
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setPhase('choose');
      setProgress(0);
      setServerUrl(DEFAULT_NAPCAT_SERVER_URL);
      setAccessToken('');
      setShowToken(false);
      setAccount(null);
      setErrors({});
      setFrameHeight(null);
    }
  }, [open]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 640px)');
    const sync = () => setIsDesktop(query.matches);

    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }

    const shell = shellRef.current;
    const header = headerRef.current;
    const content = contentRef.current;
    if (!shell || !header || !content) {
      return undefined;
    }

    const measure = () => {
      const styles = window.getComputedStyle(shell);
      const border =
        Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth);
      // offsetHeight ignores the entrance scale transform; the extra pixel absorbs rounding.
      const next =
        header.offsetHeight + content.offsetHeight + (Number.isFinite(border) ? border : 0) + 1;
      setFrameHeight(next > 0 ? next : null);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(content);
    return () => observer.disconnect();
  }, [open, isDesktop]);

  useEffect(() => {
    if (!open || phase !== 'connecting') {
      return undefined;
    }

    setProgress(0);
    const timers = [
      window.setTimeout(() => setProgress(1), 480),
      window.setTimeout(() => setProgress(2), 1020),
      window.setTimeout(() => setPhase('ready'), 1680),
    ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [open, phase]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleSelect = (platform: PlatformDefinition) => {
    if (!platform.available) {
      return;
    }

    setActivePlatform(platform.id);
    setPhase('configure');
  };

  const handleConnect = () => {
    const trimmedServerUrl = serverUrl.trim();
    const trimmedToken = accessToken.trim();
    const nextErrors: FormErrors = {};

    if (!isValidWebSocketUrl(trimmedServerUrl)) {
      nextErrors.serverUrl = '请输入以 ws:// 或 wss:// 开头的有效地址';
    }
    if (!trimmedToken) {
      nextErrors.accessToken = '请输入 NapCat 的授权密钥';
    }

    setErrors(nextErrors);
    if (nextErrors.serverUrl || nextErrors.accessToken) {
      return;
    }

    setServerUrl(trimmedServerUrl);
    setAccessToken(trimmedToken);
    setAccount(previewNapCatAccount());
    setPhase('connecting');
  };

  const handleConfirm = () => {
    onConnected(createNapCatChannel({ serverUrl, accessToken }, account ?? previewNapCatAccount()));
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleConnect();
  };

  const platform = PLATFORMS[activePlatform];
  const readyAccount = account ?? previewNapCatAccount();

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="connect-channel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[110] flex items-stretch justify-center bg-[#05090e]/70 backdrop-blur-sm sm:items-center sm:p-6"
        >
          <motion.div
            ref={shellRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="connect-channel-title"
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.99 }}
            transition={{ duration: 0.32, ease: EASE }}
            style={isDesktop && frameHeight ? { height: frameHeight } : undefined}
            className="relative flex h-dvh w-full flex-col overflow-hidden bg-ink-900 text-mist-100 transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:h-auto sm:max-h-[min(92dvh,46rem)] sm:max-w-2xl sm:rounded-[1.6rem] sm:border sm:border-mist-100/10 sm:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.75)]"
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-36 opacity-70"
              style={{
                background:
                  'radial-gradient(26rem 11rem at 18% 0%, var(--orb-brass), transparent 70%)',
              }}
            />

            <div
              ref={headerRef}
              className="relative flex items-center justify-between gap-4 px-6 pt-6 sm:px-8"
            >
              <span className="font-mono text-[0.58rem] uppercase tracking-[0.3em] text-brass-400/75">
                {EYEBROW[phase]}
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto">
              <div ref={contentRef} className="relative px-6 pb-7 pt-4 sm:px-8 sm:pb-8">
                <AnimatePresence mode="popLayout" initial={false}>
                  {phase === 'choose' && (
                    <motion.div
                      key="choose"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: EASE }}
                      className="w-full"
                    >
                      <h2
                        id="connect-channel-title"
                        className="font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-mist-100"
                      >
                        把 TA 接到现实世界
                      </h2>
                      <p className="mt-3 max-w-lg text-[0.82rem] leading-6 text-mist-500">
                        选择一个即时通讯平台。接入后，登录账号资料会自动同步，收到的私聊与群聊消息也会汇入互联中心。
                      </p>

                      <div className="mt-6 space-y-2.5">
                        {PLATFORM_LIST.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            disabled={!item.available}
                            onClick={() => handleSelect(item)}
                            className={cn(
                              'group flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition',
                              item.available
                                ? 'border-mist-100/[0.08] bg-ink-950/25 hover:border-brass-400/35 hover:bg-ink-950/45'
                                : 'cursor-not-allowed border-mist-100/[0.06] bg-ink-950/20 opacity-55',
                            )}
                          >
                            <span
                              className={cn(
                                'grid size-11 shrink-0 place-items-center rounded-xl border font-display text-[0.9rem] font-semibold',
                                item.accent === 'jade'
                                  ? 'border-jade-400/25 bg-gradient-to-br from-jade-400/25 to-transparent text-jade-300'
                                  : 'border-brass-400/25 bg-gradient-to-br from-brass-400/25 to-transparent text-brass-300',
                              )}
                            >
                              {item.short}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-[0.86rem] font-medium text-mist-200">
                                  {item.name}
                                </span>
                                <span className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-mist-600">
                                  {item.connector}
                                </span>
                              </span>
                              <span className="mt-1 block text-[0.66rem] leading-5 text-mist-600">
                                {item.description}
                              </span>
                            </span>
                            <span
                              className={cn(
                                'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.12em]',
                                item.available
                                  ? 'border-brass-400/25 bg-brass-400/[0.08] text-brass-300'
                                  : 'border-mist-100/10 text-mist-600',
                              )}
                            >
                              {item.available ? '可接入' : '规划中'}
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-mist-600 transition group-hover:text-brass-300" />
                          </button>
                        ))}
                      </div>

                      <p className="mt-5 flex items-start gap-2 rounded-xl border border-mist-100/[0.06] bg-ink-950/20 px-3.5 py-2.5 text-[0.64rem] leading-5 text-mist-600">
                        <RadioTower className="mt-0.5 size-3.5 shrink-0 text-brass-400/70" />
                        同一平台可以接入多个渠道，例如不同的 QQ 号或 NapCat
                        实例。账号资料与消息均为模拟数据。
                      </p>
                    </motion.div>
                  )}

                  {phase === 'configure' && (
                    <motion.div
                      key="configure"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: EASE }}
                      className="w-full"
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid size-12 place-items-center rounded-2xl border border-brass-400/25 bg-brass-400/10 text-brass-300">
                          <Link2 className="size-5" strokeWidth={1.8} />
                        </span>
                        <div>
                          <h2
                            id="connect-channel-title"
                            className="font-display text-[1.35rem] font-semibold text-mist-100"
                          >
                            连接 {platform.connector}
                          </h2>
                          <p className="mt-1 text-[0.7rem] leading-5 text-mist-600">
                            填写 NapCat 的 WebSocket 服务地址与授权密钥，TA 才能收到 {platform.name}{' '}
                            的消息。
                          </p>
                        </div>
                      </div>

                      <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
                        <Field
                          label="WebSocket 地址"
                          htmlFor="napcat-server-url"
                          hint="ws:// 或 wss://"
                          error={errors.serverUrl}
                        >
                          <InputShell
                            icon={<Link2 className="size-4" strokeWidth={1.7} />}
                            invalid={Boolean(errors.serverUrl)}
                          >
                            <input
                              id="napcat-server-url"
                              type="text"
                              inputMode="url"
                              autoComplete="off"
                              spellCheck={false}
                              value={serverUrl}
                              onChange={(event) => {
                                setServerUrl(event.target.value);
                                if (errors.serverUrl) {
                                  setErrors((previous) => ({ ...previous, serverUrl: undefined }));
                                }
                              }}
                              placeholder="ws://127.0.0.1:3001"
                            />
                          </InputShell>
                        </Field>

                        <Field
                          label="授权密钥"
                          htmlFor="napcat-access-token"
                          hint="在 NapCat 配置中查看"
                          error={errors.accessToken}
                        >
                          <InputShell
                            icon={<KeyRound className="size-4" strokeWidth={1.7} />}
                            invalid={Boolean(errors.accessToken)}
                            trailing={
                              <button
                                type="button"
                                onClick={() => setShowToken((value) => !value)}
                                aria-label={showToken ? '隐藏授权密钥' : '显示授权密钥'}
                                className="-mr-1 rounded-md p-1.5 text-mist-600 transition hover:text-mist-200"
                              >
                                {showToken ? (
                                  <EyeOff className="size-4" />
                                ) : (
                                  <Eye className="size-4" />
                                )}
                              </button>
                            }
                          >
                            <input
                              id="napcat-access-token"
                              type={showToken ? 'text' : 'password'}
                              autoComplete="off"
                              spellCheck={false}
                              value={accessToken}
                              onChange={(event) => {
                                setAccessToken(event.target.value);
                                if (errors.accessToken) {
                                  setErrors((previous) => ({
                                    ...previous,
                                    accessToken: undefined,
                                  }));
                                }
                              }}
                              placeholder="NapCat WebSocket Token"
                            />
                          </InputShell>
                        </Field>

                        <p className="text-[0.62rem] leading-5 text-mist-600">
                          NapCat 需先开启 WebSocket 服务，默认端口通常为
                          3001。当前为前端演示，任意非空密钥均可通过校验。
                        </p>

                        <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-between">
                          <GhostButton
                            type="button"
                            onClick={() => setPhase('choose')}
                            className="h-11 px-4 text-[0.75rem]"
                          >
                            <ArrowLeft className="size-3.5" />
                            返回平台
                          </GhostButton>
                          <PrimaryButton
                            type="submit"
                            icon={<RadioTower className="size-4" strokeWidth={1.9} />}
                            className="h-11 sm:w-auto sm:px-6"
                          >
                            连接并读取账号
                          </PrimaryButton>
                        </div>
                      </form>
                    </motion.div>
                  )}

                  {phase === 'connecting' && (
                    <motion.div
                      key="connecting"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: EASE }}
                      className="w-full py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid size-12 place-items-center rounded-2xl border border-brass-400/25 bg-brass-400/10">
                          <LoaderCircle className="size-5 animate-spin text-brass-300" />
                        </span>
                        <div className="min-w-0">
                          <h2
                            id="connect-channel-title"
                            className="font-display text-[1.35rem] font-semibold text-mist-100"
                          >
                            正在连接 {platform.connector}
                          </h2>
                          <p className="mt-0.5 truncate text-[0.7rem] text-mist-600">
                            正在通过 {serverUrl} 读取 {platform.name} 当前登录的账号…
                          </p>
                        </div>
                      </div>

                      <ol className="mt-6 space-y-2.5">
                        {CONNECT_STEPS.map((step, index) => {
                          const done = index < progress;
                          const active = index === progress;

                          return (
                            <li
                              key={step}
                              className={cn(
                                'flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition',
                                done
                                  ? 'border-jade-400/20 bg-jade-400/[0.05]'
                                  : active
                                    ? 'border-brass-400/25 bg-brass-400/[0.06]'
                                    : 'border-mist-100/[0.06] bg-ink-950/20',
                              )}
                            >
                              <span className="grid size-5 shrink-0 place-items-center">
                                {done ? (
                                  <Check className="size-3.5 text-jade-400" strokeWidth={2.4} />
                                ) : active ? (
                                  <LoaderCircle className="size-3.5 animate-spin text-brass-300" />
                                ) : (
                                  <span className="size-1.5 rounded-full bg-mist-600/50" />
                                )}
                              </span>
                              <span
                                className={cn(
                                  'text-[0.72rem]',
                                  done
                                    ? 'text-mist-400'
                                    : active
                                      ? 'text-mist-200'
                                      : 'text-mist-600',
                                )}
                              >
                                {step}
                              </span>
                            </li>
                          );
                        })}
                      </ol>

                      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-mist-100/[0.06] bg-ink-950/20 p-3.5">
                        <span className="size-11 shrink-0 animate-pulse rounded-xl bg-mist-100/[0.06]" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <span className="block h-2.5 w-24 animate-pulse rounded-full bg-mist-100/[0.08]" />
                          <span className="block h-2 w-40 animate-pulse rounded-full bg-mist-100/[0.05]" />
                        </div>
                        <PlatformChip platform={activePlatform} connector />
                      </div>

                      <div className="mt-5 flex justify-end">
                        <GhostButton
                          type="button"
                          onClick={onClose}
                          className="h-9 px-3 text-[0.7rem]"
                        >
                          取消
                        </GhostButton>
                      </div>
                    </motion.div>
                  )}

                  {phase === 'ready' && (
                    <motion.div
                      key="ready"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: EASE }}
                      className="w-full"
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid size-12 place-items-center rounded-2xl border border-jade-400/25 bg-jade-400/10 text-jade-400">
                          <Check className="size-5" strokeWidth={2.2} />
                        </span>
                        <div>
                          <h2
                            id="connect-channel-title"
                            className="font-display text-[1.35rem] font-semibold text-mist-100"
                          >
                            已找到登录账号
                          </h2>
                          <p className="mt-1 text-[0.7rem] leading-5 text-mist-600">
                            资料由 {platform.connector} 自动读取。确认后即可开始接收消息。
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 rounded-2xl border border-mist-100/[0.08] bg-ink-950/25 p-4">
                        <div className="flex items-start gap-3.5">
                          <ChannelAvatar
                            initials={readyAccount.initials}
                            accent={platform.accent}
                            size="lg"
                            online
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-display text-[1.05rem] font-semibold text-mist-100">
                                {readyAccount.displayName}
                              </p>
                              <PlatformChip platform={activePlatform} connector />
                            </div>
                            <p className="mt-1 font-mono text-[0.62rem] tracking-[0.08em] text-mist-500">
                              QQ {readyAccount.accountId}
                            </p>
                            <p className="mt-2 border-l-2 border-brass-400/40 pl-2.5 text-[0.68rem] leading-5 text-mist-500">
                              {readyAccount.signature}
                            </p>
                          </div>
                        </div>

                        <dl className="mt-4 grid gap-2 border-t border-mist-100/[0.06] pt-3.5 sm:grid-cols-2">
                          {[
                            { term: '登录状态', value: '在线 · 已授权' },
                            { term: '接入方式', value: `${platform.name} · ${platform.connector}` },
                            { term: 'WebSocket', value: serverUrl },
                            { term: '授权密钥', value: maskAccessToken(accessToken) },
                            { term: '消息范围', value: '全部私聊与群聊' },
                            { term: '连接位置', value: '本机控制面' },
                          ].map((item) => (
                            <div
                              key={item.term}
                              className="flex items-center justify-between gap-3"
                            >
                              <dt className="shrink-0 text-[0.6rem] text-mist-600">{item.term}</dt>
                              <dd
                                className="max-w-[10rem] truncate text-right text-[0.64rem] text-mist-300"
                                title={item.value}
                              >
                                {item.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>

                      <p className="mt-4 text-[0.64rem] leading-5 text-mist-600">
                        确认接入后，互联中心会保持这条通道，并把收到的消息按私聊与群聊归档。
                      </p>

                      <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                        <GhostButton
                          type="button"
                          onClick={() => {
                            setAccount(previewNapCatAccount());
                            setPhase('connecting');
                          }}
                          className="h-11 px-4 text-[0.75rem]"
                        >
                          重新检测
                        </GhostButton>
                        <PrimaryButton
                          type="button"
                          onClick={handleConfirm}
                          icon={<Check className="size-4" strokeWidth={2.2} />}
                          className="h-11 sm:w-auto sm:px-6"
                        >
                          确认接入
                        </PrimaryButton>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
