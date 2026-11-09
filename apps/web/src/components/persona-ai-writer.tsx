import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cpu,
  LoaderCircle,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PersonaAiGeneration, PersonaAiProviderOption } from '@inkseek/shared';
import { GhostButton, PrimaryButton } from '@/components/button';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  AI_GENERATION_STAGES,
  AI_PROMPT_EXAMPLE,
  AI_PROMPT_MAX,
  describeGeneratedDraft,
} from '@/lib/persona-ai';
import { charCount, clampChars, TOTAL_STEPS, type PersonaDraft } from '@/lib/persona-draft';

interface PersonaAiWriterProps {
  prompt: string;
  hasDraft: boolean;
  onPromptChange: (value: string) => void;
  onBack: () => void;
  onCancel: () => void;
  onApply: (draft: PersonaDraft) => void;
}

type AiStage = 'idle' | 'writing' | 'ready';
type ProviderState = 'loading' | 'ready' | 'error';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * AI-assisted first draft: takes a free-form character brief, picks an
 * available provider/model, shows staged progress while generating, and lets
 * the user preview the draft before applying it to the form. In-flight
 * requests and fake progress timers are abandoned on unmount or regeneration.
 */
export function PersonaAiWriter({
  prompt,
  hasDraft,
  onPromptChange,
  onBack,
  onCancel,
  onApply,
}: PersonaAiWriterProps) {
  const [stage, setStage] = useState<AiStage>('idle');
  const [progress, setProgress] = useState(0);
  const [generation, setGeneration] = useState<PersonaAiGeneration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<PersonaAiProviderOption[]>([]);
  const [providerState, setProviderState] = useState<ProviderState>('loading');
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const timers = useRef<number[]>([]);
  const requestId = useRef(0);
  const count = charCount(prompt);
  const writing = stage === 'writing';
  const sections = useMemo(
    () => (generation ? describeGeneratedDraft(generation.draft) : []),
    [generation],
  );

  const runnableProviders = useMemo(
    () => providers.filter((provider) => provider.models.length > 0),
    [providers],
  );
  const selectedProvider = runnableProviders.find((provider) => provider.id === providerId);
  const canGenerate = providerState === 'ready' && Boolean(selectedProvider) && model.length > 0;

  /** Clears the staged-progress timeouts so a cancelled run cannot keep moving the bar. */
  const stopTimers = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  useEffect(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    requestId.current += 1;

    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
      requestId.current += 1;
    };
  }, []);

  useEffect(() => {
    let active = true;

    api
      .personaAiProviders()
      .then((list) => {
        if (!active) {
          return;
        }

        setProviders(list);
        setProviderState('ready');

        const first = list.find((provider) => provider.models.length > 0);

        if (first) {
          setProviderId(first.id);
          setModel(first.models[0] ?? '');
        }
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        setProviderState('error');
        setProviderError(
          cause instanceof ApiError ? cause.message : '无法读取模型提供商，请稍后重试',
        );
      });

    return () => {
      active = false;
    };
  }, []);

  /** Resets the model to the new provider's first entry, or empty when it has none. */
  const handleProviderChange = (nextId: string) => {
    const next = runnableProviders.find((provider) => provider.id === nextId);
    setProviderId(nextId);
    setModel(next?.models[0] ?? '');
    setError(null);
  };

  /**
   * Requires a 20-char brief and a runnable provider before firing. Progress
   * stages are cosmetic timers; the requestId guard drops any response whose
   * request was superseded, cancelled, or unmounted.
   */
  const handleGenerate = async () => {
    if (charCount(prompt.trim()) < 20) {
      setError('请至少写下 20 个字，让 AI 知道 TA 大致是谁。');
      return;
    }

    if (!canGenerate) {
      setError('还没有可用的模型提供商，请先到设置中添加并测试连接。');
      return;
    }

    stopTimers();
    setError(null);
    setGeneration(null);
    setStage('writing');
    setProgress(0);

    let elapsed = 0;

    AI_GENERATION_STAGES.forEach((item, index) => {
      elapsed += item.delay;

      if (index === AI_GENERATION_STAGES.length - 1) {
        return;
      }

      timers.current.push(window.setTimeout(() => setProgress(index + 1), elapsed));
    });

    const currentRequest = ++requestId.current;

    try {
      const result = await api.generatePersonaDraft({
        prompt: prompt.trim(),
        providerId,
        model,
      });

      if (requestId.current !== currentRequest) {
        return;
      }

      stopTimers();
      setGeneration(result);
      setProgress(AI_GENERATION_STAGES.length);
      setStage('ready');
    } catch (cause) {
      if (requestId.current !== currentRequest) {
        return;
      }

      stopTimers();
      setStage('idle');
      setProgress(0);
      setError(cause instanceof ApiError ? cause.message : '生成失败，请检查网络后重试');
    }
  };

  /** Ignores edits while writing, and invalidates a ready preview so a stale draft can't be applied. */
  const handlePromptChange = (value: string) => {
    if (writing) {
      return;
    }

    onPromptChange(clampChars(value, AI_PROMPT_MAX));
    setError(null);

    if (stage === 'ready') {
      setStage('idle');
      setGeneration(null);
    }
  };

  /** Inserts the sample brief and discards any preview; blocked mid-generation so the request stays coherent. */
  const handleExample = () => {
    if (writing) {
      return;
    }

    onPromptChange(AI_PROMPT_EXAMPLE);
    setError(null);
    setStage('idle');
    setGeneration(null);
  };

  /** Aborts timers and invalidates the open request so a late reply cannot land on the previous step. */
  const handleBack = () => {
    stopTimers();
    requestId.current += 1;
    onBack();
  };

  /** Same abort as handleBack, then leaves the writer so nothing is applied. */
  const handleCancel = () => {
    stopTimers();
    requestId.current += 1;
    onCancel();
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-mist-100/[0.07] px-5 py-4 sm:px-8">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-[0.7rem] text-mist-500 transition hover:text-mist-200"
        >
          <ArrowLeft className="size-3.5" />
          返回说明
        </button>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[0.54rem] uppercase tracking-[0.24em] text-brass-400/70 sm:inline">
            AI Writer · Draft 01
          </span>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="取消并保存草稿"
            className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-mist-200"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-7 sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-brass-400/25 bg-brass-400/10 text-brass-300">
              <Sparkles className="size-5" strokeWidth={1.5} />
            </span>
            <div className="min-w-0">
              <h2
                id="persona-wizard-title"
                className="font-display text-[1.35rem] font-semibold tracking-tight text-mist-100"
              >
                让 AI 先写一版
              </h2>
              <p className="mt-0.5 text-[0.7rem] text-mist-500">
                写一段角色描述，AI 会整理成 {TOTAL_STEPS} 步档案，再逐项修改。
              </p>
            </div>
            <span className="ml-auto rounded-full border border-jade-400/25 bg-jade-400/[0.08] px-2.5 py-1 font-mono text-[0.52rem] uppercase tracking-[0.14em] text-jade-300">
              模型生成
            </span>
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label
                htmlFor="persona-ai-prompt"
                className="flex items-center gap-1.5 text-[0.72rem] font-medium tracking-[0.04em] text-mist-300"
              >
                角色提示词
                <span className="text-brass-400">*</span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleExample}
                  disabled={writing}
                  className="text-[0.6rem] text-brass-300/80 transition hover:text-brass-200 disabled:opacity-50"
                >
                  填入示例
                </button>
                <span
                  className={cn(
                    'font-mono text-[0.55rem]',
                    count >= AI_PROMPT_MAX ? 'text-signal-400' : 'text-mist-600',
                  )}
                >
                  {count.toLocaleString('zh-CN')} / {AI_PROMPT_MAX.toLocaleString('zh-CN')}
                </span>
              </div>
            </div>

            <textarea
              id="persona-ai-prompt"
              className="wizard-textarea min-h-[13rem]"
              rows={11}
              value={prompt}
              onChange={(event) => handlePromptChange(event.target.value)}
              readOnly={writing}
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby="persona-ai-prompt-hint"
              placeholder="例如：TA 叫什么、多大、做什么；生活在怎样的世界；在意什么、绝不接受什么；说话是短句还是分条，什么时候睡下……"
            />

            {error ? (
              <p className="flex items-start gap-1.5 text-[0.68rem] leading-5 text-signal-400">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </p>
            ) : (
              <p id="persona-ai-prompt-hint" className="text-[0.64rem] leading-5 text-mist-600">
                建议覆盖：身份 / 世界观 / 性格与禁忌 / 语言习惯 / 在线习惯。最多 10,000
                字，按中文字符计算。
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {['身份与外貌', '世界与来处', '价值与禁忌', '语言习惯', '在线与位置'].map((item) => (
              <span
                key={item}
                className="rounded-full border border-mist-100/[0.08] bg-ink-950/25 px-2.5 py-1 text-[0.6rem] text-mist-600"
              >
                {item}
              </span>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-mist-100/[0.07] bg-ink-950/25 p-3.5">
            <div className="flex items-center gap-1.5 text-[0.62rem] font-medium tracking-[0.04em] text-mist-400">
              <Cpu className="size-3.5 text-brass-300/80" />
              模型来源
            </div>
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[0.58rem] uppercase tracking-[0.12em] text-mist-600">
                  提供商
                </span>
                <select
                  value={providerId}
                  onChange={(event) => handleProviderChange(event.target.value)}
                  disabled={writing || providerState !== 'ready' || runnableProviders.length === 0}
                  className="h-9 w-full rounded-lg border border-mist-100/10 bg-ink-950/50 px-2.5 text-[0.7rem] text-mist-200 outline-none transition focus:border-brass-400/40 disabled:opacity-60"
                >
                  {providerState === 'loading' && <option value="">读取中…</option>}
                  {providerState !== 'loading' && runnableProviders.length === 0 && (
                    <option value="">暂无可用提供商</option>
                  )}
                  {runnableProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} · {provider.protocol}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[0.58rem] uppercase tracking-[0.12em] text-mist-600">
                  模型
                </span>
                <select
                  value={model}
                  onChange={(event) => {
                    setModel(event.target.value);
                    setError(null);
                  }}
                  disabled={writing || !selectedProvider}
                  className="h-9 w-full rounded-lg border border-mist-100/10 bg-ink-950/50 px-2.5 text-[0.7rem] text-mist-200 outline-none transition focus:border-brass-400/40 disabled:opacity-60"
                >
                  {!selectedProvider && <option value="">暂无可用模型</option>}
                  {selectedProvider?.models.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {providerState === 'error' ? (
              <p className="mt-2.5 flex items-start gap-1.5 text-[0.62rem] leading-5 text-signal-400">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {providerError ?? '无法读取模型提供商'}
              </p>
            ) : providerState === 'ready' && runnableProviders.length === 0 ? (
              <p className="mt-2.5 flex items-start gap-1.5 text-[0.62rem] leading-5 text-signal-400/90">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {providers.length === 0
                  ? '还没有可用的模型提供商。请先到「设置 · 模型提供商」添加并测试连接，再回来生成。'
                  : '已添加的提供商尚未检测出可用模型，请到设置中重新检测。'}
              </p>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <PrimaryButton
              type="button"
              onClick={handleGenerate}
              loading={writing}
              disabled={!canGenerate}
              className="h-11 w-full px-6 text-[0.78rem] sm:w-auto"
            >
              {stage === 'ready' ? '重新生成' : '生成属性'}
              <Sparkles className="size-4" />
            </PrimaryButton>
            {!writing && stage !== 'ready' && (
              <span className="text-[0.62rem] leading-5 text-mist-600">
                生成后不会直接保存，你可以先预览，再决定是否带入。
              </span>
            )}
          </div>

          <AnimatePresence initial={false}>
            {writing && (
              <motion.div
                key="ai-progress"
                role="status"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="mt-5 rounded-xl border border-brass-400/20 bg-brass-400/[0.05] p-4">
                  <div className="flex items-center gap-2 text-[0.72rem] text-brass-200">
                    <LoaderCircle className="size-4 animate-spin" />
                    AI 正在整理属性，请稍候… 大模型通常需要 20–60 秒。
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {AI_GENERATION_STAGES.map((item, index) => {
                      const done = progress > index;
                      const active = progress === index;

                      return (
                        <div
                          key={item.label}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[0.64rem] transition-colors',
                            done
                              ? 'border-jade-400/20 bg-jade-400/[0.04] text-jade-300'
                              : active
                                ? 'border-brass-400/30 bg-brass-400/[0.06] text-brass-200'
                                : 'border-mist-100/[0.06] text-mist-600',
                          )}
                        >
                          {done ? (
                            <Check className="size-3.5 shrink-0" strokeWidth={2.2} />
                          ) : active ? (
                            <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                          ) : (
                            <span className="size-1.5 shrink-0 rounded-full bg-mist-100/15" />
                          )}
                          <span className="truncate">{item.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-mist-100/[0.08]">
                    <motion.span
                      className="block h-full rounded-full bg-gradient-to-r from-brass-500 to-brass-300"
                      animate={{
                        width: `${(progress / AI_GENERATION_STAGES.length) * 100}%`,
                      }}
                      transition={{ duration: 0.4, ease: EASE }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {stage === 'ready' && generation && (
              <motion.div
                key="ai-result"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-brass-400/70">
                      Generated Draft
                    </p>
                    <h3 className="mt-1.5 font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
                      已生成「{generation.draft.name}」的档案草稿
                    </h3>
                    <p className="mt-1 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-mist-600">
                      {generation.providerName} · {generation.model} ·{' '}
                      {(generation.latencyMs / 1000).toFixed(1)}s
                    </p>
                  </div>
                  <span className="rounded-full border border-jade-400/25 bg-jade-400/[0.08] px-2.5 py-1 text-[0.6rem] text-jade-300">
                    可带入
                  </span>
                </div>

                <p className="mt-2 text-[0.64rem] leading-5 text-mist-600">
                  模型已根据提示词生成 {TOTAL_STEPS} 步档案、性格参数与 15 项进阶字段。带入后仍可逐项修改。
                </p>

                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {sections.map((section) => (
                    <div
                      key={section.title}
                      className="rounded-xl border border-mist-100/[0.07] bg-ink-950/25 p-3.5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[0.72rem] font-medium text-mist-200">{section.title}</p>
                        <span className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-mist-600">
                          {section.caption}
                        </span>
                      </div>
                      <dl className="mt-2 space-y-1.5">
                        {section.rows.map((row) => (
                          <div
                            key={row.label}
                            className="grid grid-cols-[4.2rem_minmax(0,1fr)] gap-2"
                          >
                            <dt className="text-[0.6rem] leading-5 text-mist-600">{row.label}</dt>
                            <dd
                              className="line-clamp-2 text-[0.66rem] leading-5 text-mist-400"
                              title={row.value}
                            >
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                  <PrimaryButton
                    type="button"
                    onClick={() => onApply(generation.draft)}
                    className="h-11 w-full px-6 text-[0.78rem] sm:w-auto"
                  >
                    带入表单并继续
                    <ArrowRight className="size-4" />
                  </PrimaryButton>
                  <GhostButton
                    type="button"
                    onClick={handleGenerate}
                    className="h-11 w-full px-4 text-[0.74rem] sm:w-auto"
                  >
                    重新生成
                  </GhostButton>
                </div>

                {hasDraft && (
                  <p className="mt-3 flex items-start gap-1.5 text-[0.62rem] leading-5 text-signal-400/90">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    带入会覆盖当前表单与草稿中已经填写的内容。
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
