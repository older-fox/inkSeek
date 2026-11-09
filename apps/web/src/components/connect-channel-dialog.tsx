import type { ChatChannelSummary, PersonaSummary } from '@inkseek/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Link2,
  LoaderCircle,
  RadioTower,
  TriangleAlert,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { GhostButton, PrimaryButton } from '@/components/button';
import { ChannelAvatar, PlatformChip } from '@/components/connection-bits';
import { Field, InputShell } from '@/components/field';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  DEFAULT_NAPCAT_SERVER_URL,
  PLATFORMS,
  PLATFORM_LIST,
  toChannel,
  type Channel,
  type PlatformDefinition,
  type PlatformId,
} from '@/lib/connections';
import { personasQuery } from '@/lib/queries';

interface ConnectChannelDialogProps {
  open: boolean;
  onClose: () => void;
  onConnected: (channel: Channel) => void;
}

type Phase = 'choose' | 'persona' | 'configure' | 'connecting' | 'ready';

interface FormErrors {
  serverUrl?: string;
  accessToken?: string;
}

const CONNECT_STEPS = ['通过 WebSocket 连接 NapCat', '读取当前登录账号资料', '开始接收全部私聊与群聊'];

const EYEBROW: Record<Phase, string> = {
  choose: 'Connect Channel',
  persona: 'Persona Import',
  configure: 'Connection Setup',
  connecting: 'Handshake',
  ready: 'Account Found',
};

const EASE = [0.22, 1, 0.36, 1] as const;

/** Accepts only absolute ws:// or wss:// URLs so a bogus address never reaches the server. */
function isValidWebSocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
}

/** First character of a persona or account name for avatar fallbacks, defaulting to 'Q'. */
function initialsOf(name: string): string {
  return Array.from(name.trim())[0] ?? 'Q';
}

/**
 * NapCat channel wizard: platform, role card, credentials, handshake, confirmed account.
 * Success invalidates the chat caches and reports the new channel exactly once, and on
 * desktop the shell animates to a measured content height instead of jumping.
 */
export function ConnectChannelDialog({ open, onClose, onConnected }: ConnectChannelDialogProps) {
  const queryClient = useQueryClient();
  const personaQuery = useQuery({ ...personasQuery, enabled: open });
  const personas = personaQuery.data ?? [];
  const [phase, setPhase] = useState<Phase>('choose');
  const [progress, setProgress] = useState(0);
  const [activePlatform, setActivePlatform] = useState<PlatformId>('qq');
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState(DEFAULT_NAPCAT_SERVER_URL);
  const [accessToken, setAccessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [result, setResult] = useState<ChatChannelSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isDesktop, setIsDesktop] = useState(false);
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reportedRef = useRef(false);

  const connectMutation = useMutation({
    mutationFn: api.connectChatChannel,
    onSuccess: (summary) => {
      setResult(summary);
      setPhase('ready');
      void queryClient.invalidateQueries({ queryKey: ['chat'] });
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof ApiError ? error.message : '连接 NapCat 失败，请检查地址与密钥',
      );
      setPhase('configure');
    },
  });

  useEffect(() => {
    if (!open) {
      setPhase('choose');
      setProgress(0);
      setActivePlatform('qq');
      setPersonaId(null);
      setServerUrl(DEFAULT_NAPCAT_SERVER_URL);
      setAccessToken('');
      setShowToken(false);
      setResult(null);
      setErrorMessage(null);
      setErrors({});
      setFrameHeight(null);
      reportedRef.current = false;
      connectMutation.reset();
    }
  }, [open]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 640px)');
    /** Tracks the sm breakpoint so the wizard can swap between mobile sheet and card. */
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

    /** Sums header, content and borders so the shell animates to its exact content height. */
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
      window.setTimeout(() => setProgress(1), 600),
      window.setTimeout(() => setProgress(2), 1400),
    ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [open, phase]);

  /** Hands the channel to the parent exactly once, then closes; repeat calls only close. */
  const finish = () => {
    if (result && !reportedRef.current) {
      reportedRef.current = true;
      onConnected(toChannel(result));
    }
    onClose();
  };

  /** Closes the dialog; from the ready step it routes through finish so the result sticks. */
  const dismiss = () => {
    if (phase === 'ready' && result) {
      finish();
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    /**
     * Escape dismisses the dialog. The listener rebinds on every render, so it always
     * sees the current phase and behaves exactly like the close button.
     */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismiss();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  /** Picks a platform and advances to the role-card step; planned ones stay inert. */
  const handleSelect = (platform: PlatformDefinition) => {
    if (!platform.available) {
      return;
    }

    setActivePlatform(platform.id);
    setPhase('persona');
  };

  /** Records the role card the channel will speak as, then opens the credentials step. */
  const handlePersonaSelect = (persona: PersonaSummary) => {
    setPersonaId(persona.id);
    setPhase('configure');
  };

  const selectedPersona = personaId
    ? (personas.find((persona) => persona.id === personaId) ?? null)
    : null;

  /**
   * Validates the trimmed credentials and starts the handshake. Bad input keeps its error
   * inline instead of calling the API, and a missing role card bounces the wizard back to
   * that step rather than connecting an account with no persona.
   */
  const handleConnect = () => {
    const trimmedServerUrl = serverUrl.trim();
    const trimmedToken = accessToken.trim();
    const nextErrors: FormErrors = {};

    if (!isValidWebSocketUrl(trimmedServerUrl)) {
      nextErrors.serverUrl = '请输入以 ws:// 或 wss:// 开头的有效地址';
    }
    if (trimmedToken.length > 512) {
      nextErrors.accessToken = '授权密钥过长';
    }

    setErrors(nextErrors);
    if (nextErrors.serverUrl || nextErrors.accessToken) {
      return;
    }

    if (!selectedPersona) {
      setPhase('persona');
      return;
    }

    setServerUrl(trimmedServerUrl);
    setAccessToken(trimmedToken);
    setErrorMessage(null);
    setPhase('connecting');
    connectMutation.mutate({
      serverUrl: trimmedServerUrl,
      accessToken: trimmedToken,
      personaId: selectedPersona.id,
    });
  };

  /** Stops the native submit so Enter inside the credential fields runs the connect flow. */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleConnect();
  };

  const platform = PLATFORMS[activePlatform];
  const connectedChannel = result ? toChannel(result) : null;

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
          onClick={dismiss}
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
                onClick={dismiss}
                aria-label="关闭"
                className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                        同一平台可以接入多个渠道，例如不同的 QQ
                        号或不同的 NapCat 实例。每个渠道拥有独立命名空间，会话、消息与人格记忆互不串扰。
                      </p>
                    </motion.div>
                  )}

                  {phase === 'persona' && (
                    <motion.div
                      key="persona"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: EASE }}
                      className="w-full"
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid size-12 place-items-center rounded-2xl border border-brass-400/25 bg-brass-400/10 text-brass-300">
                          <Fingerprint className="size-5" strokeWidth={1.8} />
                        </span>
                        <div>
                          <h2
                            id="connect-channel-title"
                            className="font-display text-[1.35rem] font-semibold text-mist-100"
                          >
                            选择要接入的角色卡
                          </h2>
                          <p className="mt-1 max-w-lg text-[0.7rem] leading-5 text-mist-600">
                            渠道建立时，服务端会读取所选角色卡的最新版本，并完整复制到渠道命名空间。
                            之后的修改只作用于渠道内的副本，源卡保持不变。
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                        {personaQuery.isPending &&
                          Array.from({ length: 4 }, (_, index) => (
                            <div
                              key={`persona-loading-${index}`}
                              className="h-[5.75rem] animate-pulse rounded-2xl border border-mist-100/[0.06] bg-ink-950/25"
                            />
                          ))}

                        {personaQuery.isError && (
                          <div className="col-span-full flex flex-wrap items-center gap-3 rounded-2xl border border-signal-400/25 bg-signal-400/[0.06] px-4 py-3">
                            <p className="min-w-0 flex-1 text-[0.68rem] text-signal-400">
                              读取人格卡失败，请稍后重试。
                            </p>
                            <button
                              type="button"
                              onClick={() => void personaQuery.refetch()}
                              className="rounded-lg border border-signal-400/30 bg-signal-400/[0.08] px-3 py-1.5 text-[0.66rem] text-signal-400 transition hover:bg-signal-400/[0.14]"
                            >
                              重新读取
                            </button>
                          </div>
                        )}

                        {!personaQuery.isPending &&
                          !personaQuery.isError &&
                          personas.length === 0 && (
                            <div className="col-span-full rounded-2xl border border-dashed border-mist-100/15 bg-ink-950/20 px-4 py-5 text-center">
                              <p className="text-[0.72rem] text-mist-400">人格中心还没有可用的角色卡。</p>
                              <p className="mt-1 text-[0.62rem] leading-5 text-mist-600">
                                先到人格中心创建或导入一张人格卡，再回来接入渠道。
                              </p>
                            </div>
                          )}

                        {personas.map((persona) => (
                          <button
                            key={persona.id}
                            type="button"
                            onClick={() => handlePersonaSelect(persona)}
                            className="group flex items-start gap-3 rounded-2xl border border-mist-100/[0.08] bg-ink-950/25 px-3.5 py-3 text-left transition hover:border-brass-400/35 hover:bg-ink-950/45"
                          >
                            <span
                              className={cn(
                                'grid size-10 shrink-0 place-items-center rounded-xl border font-display text-[0.9rem] font-semibold',
                                persona.profile.accent === 'jade'
                                  ? 'border-jade-400/25 bg-gradient-to-br from-jade-400/25 to-transparent text-jade-300'
                                  : 'border-brass-400/25 bg-gradient-to-br from-brass-400/25 to-transparent text-brass-300',
                              )}
                            >
                              {initialsOf(persona.name)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="text-[0.86rem] font-medium text-mist-200">
                                  {persona.name}
                                </span>
                                <span className="font-mono text-[0.52rem] tracking-[0.1em] text-mist-600">
                                  {persona.serial} · v{persona.currentVersion}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-[0.62rem] text-mist-600">
                                {persona.occupation || '未设定职业'} · {persona.age} 岁 ·{' '}
                                {persona.profile.gender}
                              </span>
                              {persona.profile.keywords.length > 0 && (
                                <span className="mt-1.5 flex flex-wrap gap-1">
                                  {persona.profile.keywords.slice(0, 3).map((keyword) => (
                                    <span
                                      key={keyword}
                                      className="rounded border border-mist-100/[0.07] bg-ink-950/40 px-1.5 py-0.5 text-[0.56rem] text-mist-500"
                                    >
                                      {keyword}
                                    </span>
                                  ))}
                                </span>
                              )}
                              {persona.profile.quote && (
                                <span className="mt-1.5 block text-[0.6rem] leading-5 text-mist-500">
                                  「{persona.profile.quote}」
                                </span>
                              )}
                            </span>
                            <ChevronRight className="mt-1 size-4 shrink-0 text-mist-600 transition group-hover:text-brass-300" />
                          </button>
                        ))}
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-3">
                        <GhostButton
                          type="button"
                          onClick={() => setPhase('choose')}
                          className="h-9 px-3 text-[0.7rem]"
                        >
                          <ArrowLeft className="size-3.5" />
                          返回平台
                        </GhostButton>
                        <p className="text-right text-[0.6rem] leading-5 text-mist-600">
                          选中后继续填写连接信息
                        </p>
                      </div>
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
                          {selectedPersona && (
                            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-jade-400/20 bg-jade-400/[0.07] px-2 py-0.5 font-mono text-[0.56rem] tracking-[0.08em] text-jade-300">
                              <Fingerprint className="size-3" strokeWidth={1.8} />
                              待复制 · {selectedPersona.name} · {selectedPersona.serial} · v
                              {selectedPersona.currentVersion}
                            </p>
                          )}
                        </div>
                      </div>

                      {errorMessage && (
                        <p className="mt-4 flex items-start gap-2 rounded-xl border border-signal-400/25 bg-signal-400/[0.07] px-3.5 py-2.5 text-[0.68rem] leading-5 text-signal-400">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} />
                          <span className="min-w-0 break-words">{errorMessage}</span>
                        </p>
                      )}

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
                          hint="未启用鉴权可留空"
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
                          NapCat 需先开启 WebSocket 服务，默认端口通常为 3001。密钥只会在服务端加密保存，页面仅展示掩码提示。
                        </p>

                        <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-between">
                          <GhostButton
                            type="button"
                            onClick={() => {
                              setErrorMessage(null);
                              setPhase('persona');
                            }}
                            className="h-11 px-4 text-[0.75rem]"
                          >
                            <ArrowLeft className="size-3.5" />
                            重选角色卡
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

                  {phase === 'ready' && connectedChannel && (
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
                            资料由 {platform.connector} 自动读取，渠道命名空间已建立。
                            {connectedChannel.persona
                              ? `「${connectedChannel.persona.name}」的角色卡已复制为渠道副本，源卡保持不变。`
                              : '消息会持续归档。'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 rounded-2xl border border-mist-100/[0.08] bg-ink-950/25 p-4">
                        <div className="flex items-start gap-3.5">
                          <ChannelAvatar
                            initials={initialsOf(connectedChannel.displayName)}
                            accent={platform.accent}
                            src={connectedChannel.avatarUrl}
                            size="lg"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-display text-[1.05rem] font-semibold text-mist-100">
                                {connectedChannel.displayName}
                              </p>
                              <PlatformChip platform={activePlatform} connector />
                            </div>
                            <p className="mt-1 font-mono text-[0.62rem] tracking-[0.08em] text-mist-500">
                              QQ {connectedChannel.accountId}
                            </p>
                          </div>
                        </div>

                        <dl className="mt-4 grid gap-2 border-t border-mist-100/[0.06] pt-3.5 sm:grid-cols-2">
                          {[
                            { term: '登录状态', value: '在线 · 已授权' },
                            { term: '接入方式', value: `${platform.name} · ${platform.connector}` },
                            { term: 'WebSocket', value: connectedChannel.serverUrl },
                            { term: '授权密钥', value: connectedChannel.tokenHint ?? '未设置' },
                            { term: '消息范围', value: '全部私聊与群聊' },
                            {
                              term: '人格快照',
                              value: connectedChannel.persona
                                ? `${connectedChannel.persona.name} · ${connectedChannel.persona.cardSerial}`
                                : '未导入',
                            },
                            { term: '命名空间', value: '按渠道独立隔离' },
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

                      <div className="mt-5 flex justify-end">
                        <PrimaryButton
                          type="button"
                          onClick={finish}
                          icon={<Check className="size-4" strokeWidth={2.2} />}
                          className="h-11 sm:w-auto sm:px-6"
                        >
                          完成
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
