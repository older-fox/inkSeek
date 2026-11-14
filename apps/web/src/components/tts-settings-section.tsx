import { zodResolver } from '@hookform/resolvers/zod';
import {
  deepseekTtsVoices,
  ttsAudioFormats,
  ttsProviders,
  ttsTestSchema,
  type DeepseekTtsVoiceId,
  type SettingsOverview,
  type TtsAudioFormat,
  type TtsOverview,
  type TtsProvider,
  type TtsTestInput,
} from '@inkseek/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AudioLines,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Eye,
  EyeOff,
  FileAudio,
  Gauge,
  KeyRound,
  Link2,
  Mic,
  Volume2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { GhostButton, PrimaryButton } from '@/components/button';
import { Field, InputShell } from '@/components/field';
import { ApiError, api } from '@/lib/api';
import { applyApiFieldErrors } from '@/lib/form-errors';
import { settingsQuery } from '@/lib/queries';

const ttsFormSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .min(1, '请填写 Endpoint')
    .max(300, 'Endpoint 过长')
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    }, '请输入有效的 http(s) 地址'),
  apiKey: z.string().trim().max(512, 'API Key 过长').optional(),
  model: z.string().trim().min(1, '请填写模型名称').max(120, '模型名称过长'),
  voice: z.string().trim().min(1, '请填写音色').max(120, '音色过长'),
  format: z.enum(ttsAudioFormats),
  speed: z.number().min(0.5, '速度范围为 0.5-2').max(2, '速度范围为 0.5-2'),
});

type TtsFormValues = z.infer<typeof ttsFormSchema>;

const FORMAT_LABELS: Record<TtsAudioFormat, string> = {
  mp3: 'MP3',
  wav: 'WAV',
  opus: 'Opus',
  aac: 'AAC',
  flac: 'FLAC',
};

const PROVIDER_LABELS: Record<TtsProvider, string> = {
  openai: 'OpenAI 兼容',
  deepseek: 'DeepSeek 内置',
};

const VOICE_LABELS: Record<DeepseekTtsVoiceId, string> = {
  stella: '海星 Stella',
  tide: '暗潮 Tide',
};

const timestampFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

interface TtsSettingsSectionProps {
  tts: TtsOverview | null;
}

/**
 * Speech synthesis settings for two interchangeable engines. The dropdown
 * picks which one is active; both configurations stay saved, and every save
 * synthesizes a probe clip before persisting, so a broken setup never lands.
 */
export function TtsSettingsSection({ tts }: TtsSettingsSectionProps) {
  const queryClient = useQueryClient();
  const [showKey, setShowKey] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [deepseekKey, setDeepseekKey] = useState('');
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [clearDeepseekKey, setClearDeepseekKey] = useState(false);
  const [deepseekVoice, setDeepseekVoice] = useState<DeepseekTtsVoiceId>(
    tts?.deepseek?.voiceId ?? 'stella',
  );
  const [preview, setPreview] = useState<{
    src: string;
    latencyMs: number;
    byteSize: number;
    provider: TtsProvider;
  } | null>(null);

  const provider = tts?.provider ?? 'openai';
  const openai = tts?.openai ?? null;
  const deepseek = tts?.deepseek ?? null;

  const form = useForm<TtsFormValues>({
    resolver: zodResolver(ttsFormSchema),
    defaultValues: {
      endpoint: openai?.endpoint ?? '',
      apiKey: '',
      model: openai?.model ?? '',
      voice: openai?.voice ?? '',
      format: openai?.format ?? 'mp3',
      speed: openai?.speed ?? 1,
    },
  });

  const testForm = useForm<TtsTestInput>({
    resolver: zodResolver(ttsTestSchema),
    defaultValues: { text: '你好，这是一条语音合成试听。' },
  });

  useEffect(() => {
    form.reset({
      endpoint: openai?.endpoint ?? '',
      apiKey: '',
      model: openai?.model ?? '',
      voice: openai?.voice ?? '',
      format: openai?.format ?? 'mp3',
      speed: openai?.speed ?? 1,
    });
    setClearKey(false);
    setPreview(null);
  }, [openai, form]);

  useEffect(() => {
    setDeepseekKey('');
    setShowDeepseekKey(false);
    setClearDeepseekKey(false);
    setDeepseekVoice(tts?.deepseek?.voiceId ?? 'stella');
  }, [tts?.deepseek]);

  useEffect(() => {
    setPreview(null);
  }, [provider]);

  const saveMutation = useMutation({
    mutationFn: api.updateTtsSettings,
    onSuccess: (result) => {
      queryClient.setQueryData<SettingsOverview>(settingsQuery.queryKey, (current) =>
        current ? { ...current, tts: result.tts } : current,
      );
      toast.success(
        result.tts.openai?.hasKey
          ? `OpenAI 兼容语音测试通过 · ${result.latencyMs}ms，配置已保存`
          : '已清除 OpenAI 兼容语音密钥',
      );
    },
    onError: (error) => {
      applyApiFieldErrors(form.setError, error);
      toast.error(error instanceof ApiError ? error.message : '语音合成配置保存失败');
    },
  });

  const saveDeepseekMutation = useMutation({
    mutationFn: api.updateDeepseekTts,
    onSuccess: (result) => {
      queryClient.setQueryData<SettingsOverview>(settingsQuery.queryKey, (current) =>
        current ? { ...current, tts: result.tts } : current,
      );
      toast.success(
        result.tts.deepseek?.hasKey
          ? `DeepSeek 语音测试通过 · ${result.latencyMs}ms，配置已保存`
          : '已清除 DeepSeek 语音密钥',
      );
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'DeepSeek 语音配置保存失败');
    },
  });

  const providerMutation = useMutation({
    mutationFn: api.updateTtsProvider,
    onSuccess: (result) => {
      queryClient.setQueryData<SettingsOverview>(settingsQuery.queryKey, (current) =>
        current ? { ...current, tts: result.tts } : current,
      );
      toast.success(`已启用 ${PROVIDER_LABELS[result.tts.provider]}`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '切换语音服务失败');
    },
  });

  const testMutation = useMutation({
    mutationFn: api.testTts,
    onSuccess: (result) => {
      setPreview({
        src: `data:${result.mimeType};base64,${result.audioBase64}`,
        latencyMs: result.latencyMs,
        byteSize: result.byteSize,
        provider: result.provider,
      });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '试听失败，请稍后重试');
    },
  });

  const handleSave = form.handleSubmit((values) => {
    saveMutation.mutate({
      endpoint: values.endpoint,
      apiKey: values.apiKey ?? '',
      model: values.model,
      voice: values.voice,
      format: values.format,
      speed: values.speed,
      clearKey,
    });
  });

  const handleSaveDeepseek = () => {
    if (!deepseek?.hasKey && !deepseekKey.trim() && !clearDeepseekKey) {
      toast.error('请填写 DeepSeek API Key');
      return;
    }
    saveDeepseekMutation.mutate({
      apiKey: deepseekKey,
      voiceId: deepseekVoice,
      clearKey: clearDeepseekKey,
    });
  };

  const handleTest = testForm.handleSubmit((values) => {
    testMutation.mutate(values);
  });

  const errors = form.formState.errors;
  const testErrors = testForm.formState.errors;
  const keyHint = clearKey
    ? '保存后将清除密钥，语音合成暂停使用'
    : openai?.hasKey
      ? '已保存，留空保持不变'
      : '仅保存在服务端，不会回显';
  const deepseekKeyHint = clearDeepseekKey
    ? '保存后将清除密钥'
    : deepseek?.hasKey
      ? '已保存，留空保持不变'
      : '使用 DeepSeek 官方 API Key';
  const activeUpdatedAt = (provider === 'openai' ? openai : deepseek)?.updatedAt;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5 backdrop-blur-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-mist-100/[0.07] bg-ink-950/50 text-brass-300">
            <AudioLines className="size-[1.1rem]" strokeWidth={1.6} />
          </span>
          <div>
            <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
              语音合成
            </h2>
            <p className="mt-1 max-w-xl text-[0.78rem] leading-6 text-mist-500">
              {
                '两种引擎任选其一：OpenAI 兼容的 /audio/speech，或 DeepSeek 内置 TTS。切换不会删除另一份配置，心智发语音时只使用当前启用的一项。每次保存都会先真实合成一段测试音频，通过才会落库；密钥只保存在服务端。'
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {tts?.ready ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-jade-400/25 bg-jade-400/[0.07] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-jade-300">
              <CheckCircle2 className="size-3" />
              {PROVIDER_LABELS[provider]}
            </span>
          ) : (
            <span className="rounded-full border border-signal-400/25 bg-signal-400/[0.07] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-signal-400">
              Not configured
            </span>
          )}
          {activeUpdatedAt && (
            <span className="text-[0.66rem] text-mist-600">
              {timestampFormatter.format(new Date(activeUpdatedAt))}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 max-w-xs">
        <Field label="语音服务" htmlFor="settings-tts-provider" hint="同一时间只启用一项">
          <div className="relative">
            <select
              id="settings-tts-provider"
              className="wizard-input wizard-select"
              value={provider}
              disabled={providerMutation.isPending}
              onChange={(event) => {
                const next = event.target.value as TtsProvider;
                if (next !== provider) {
                  providerMutation.mutate({ provider: next });
                }
              }}
            >
              {ttsProviders.map((item) => (
                <option key={item} value={item}>
                  {PROVIDER_LABELS[item]}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mist-600" />
          </div>
        </Field>
      </div>

      {provider === 'openai' ? (
        <form className="mt-6 space-y-5" onSubmit={handleSave} noValidate>
          <Field
            label="Endpoint"
            htmlFor="settings-tts-endpoint"
            hint="含版本路径，如 /v1"
            error={errors.endpoint?.message}
          >
            <InputShell
              icon={<Link2 className="size-4" strokeWidth={1.7} />}
              invalid={Boolean(errors.endpoint)}
            >
              <input
                id="settings-tts-endpoint"
                type="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://api.openai.com/v1"
                {...form.register('endpoint')}
              />
            </InputShell>
          </Field>

          <Field
            label="API Key"
            htmlFor="settings-tts-api-key"
            hint={keyHint}
            error={errors.apiKey?.message}
          >
            <InputShell
              icon={<KeyRound className="size-4" strokeWidth={1.7} />}
              invalid={Boolean(errors.apiKey)}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowKey((value) => !value)}
                  className="-mr-1 rounded-md p-1.5 text-mist-600 transition hover:text-mist-200"
                  aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            >
              <input
                id="settings-tts-api-key"
                type={showKey ? 'text' : 'password'}
                autoComplete="new-password"
                spellCheck={false}
                disabled={clearKey}
                placeholder={openai?.hasKey && !clearKey ? '留空保持已保存密钥' : 'sk-...'}
                {...form.register('apiKey')}
              />
            </InputShell>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="模型" htmlFor="settings-tts-model" error={errors.model?.message}>
              <InputShell
                icon={<Cpu className="size-4" strokeWidth={1.7} />}
                invalid={Boolean(errors.model)}
              >
                <input
                  id="settings-tts-model"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="例如：tts-1 / cosyvoice-v1"
                  {...form.register('model')}
                />
              </InputShell>
            </Field>

            <Field label="音色" htmlFor="settings-tts-voice" error={errors.voice?.message}>
              <InputShell
                icon={<Mic className="size-4" strokeWidth={1.7} />}
                invalid={Boolean(errors.voice)}
              >
                <input
                  id="settings-tts-voice"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="例如：alloy / 音色名称"
                  {...form.register('voice')}
                />
              </InputShell>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-mist-500">
                  音频格式
                </span>
                <span className="flex items-center gap-1 text-[0.68rem] text-mist-600">
                  <FileAudio className="size-3" />
                  response_format
                </span>
              </div>
              <div className="relative">
                <select
                  id="settings-tts-format"
                  aria-label="音频格式"
                  className="wizard-input wizard-select"
                  {...form.register('format')}
                >
                  {ttsAudioFormats.map((format) => (
                    <option key={format} value={format}>
                      {FORMAT_LABELS[format]}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mist-600" />
              </div>
              {errors.format && <p className="text-xs text-signal-400">{errors.format.message}</p>}
            </div>

            <Field
              label="语速"
              htmlFor="settings-tts-speed"
              hint="0.5 - 2"
              error={errors.speed?.message}
            >
              <InputShell
                icon={<Gauge className="size-4" strokeWidth={1.7} />}
                invalid={Boolean(errors.speed)}
              >
                <input
                  id="settings-tts-speed"
                  type="number"
                  inputMode="decimal"
                  step={0.1}
                  min={0.5}
                  max={2}
                  {...form.register('speed', { valueAsNumber: true })}
                />
              </InputShell>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.68rem] leading-5 text-mist-600">
              保存前会向{' '}
              <span className="font-mono text-mist-500">{'{Endpoint}'}/audio/speech</span>{' '}
              发起一次真实合成，成功才会写入。
            </p>

            {openai?.hasKey && (
              <button
                type="button"
                onClick={() => setClearKey((value) => !value)}
                className={[
                  'rounded-lg border px-3 py-1.5 text-[0.68rem] transition',
                  clearKey
                    ? 'border-brass-400/30 bg-brass-400/[0.08] text-brass-300'
                    : 'border-mist-100/[0.08] text-mist-600 hover:border-signal-400/30 hover:text-signal-400',
                ].join(' ')}
              >
                {clearKey ? '恢复保留密钥' : '清除已保存密钥'}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-mist-100/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[0.68rem] leading-5 text-mist-600">
              密钥不会返回前端，清除后语音合成将暂停使用。
            </p>
            <PrimaryButton
              type="submit"
              loading={saveMutation.isPending}
              className="h-11 w-full sm:w-auto sm:px-6"
            >
              {clearKey ? '清除密钥' : '测试并保存'}
            </PrimaryButton>
          </div>
        </form>
      ) : (
        <div className="mt-6 space-y-5">
          <p className="text-[0.72rem] leading-6 text-mist-500">
            {'DeepSeek 内置语音使用官方地址 '}
            <span className="font-mono text-mist-400">api.deepseek.com/v1/tools/tts</span>
            {'，固定输出 WAV，单次最多 10,000 字；无需填写 Endpoint、模型或格式。'}
          </p>

          <Field label="API Key" htmlFor="settings-deepseek-tts-key" hint={deepseekKeyHint}>
            <InputShell
              icon={<KeyRound className="size-4" strokeWidth={1.7} />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowDeepseekKey((value) => !value)}
                  className="-mr-1 rounded-md p-1.5 text-mist-600 transition hover:text-mist-200"
                  aria-label={showDeepseekKey ? '隐藏 API Key' : '显示 API Key'}
                >
                  {showDeepseekKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            >
              <input
                id="settings-deepseek-tts-key"
                type={showDeepseekKey ? 'text' : 'password'}
                autoComplete="new-password"
                spellCheck={false}
                value={deepseekKey}
                disabled={clearDeepseekKey}
                onChange={(event) => setDeepseekKey(event.target.value)}
                placeholder={
                  deepseek?.hasKey && !clearDeepseekKey ? '留空保持已保存密钥' : 'sk-...'
                }
              />
            </InputShell>
          </Field>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-mist-500">
                音色
              </span>
              <span className="flex items-center gap-1 text-[0.68rem] text-mist-600">
                <Mic className="size-3" />
                voice_id
              </span>
            </div>
            <div className="relative">
              <select
                id="settings-deepseek-tts-voice"
                aria-label="DeepSeek 音色"
                className="wizard-input wizard-select"
                value={deepseekVoice}
                disabled={clearDeepseekKey}
                onChange={(event) => setDeepseekVoice(event.target.value as DeepseekTtsVoiceId)}
              >
                {deepseekTtsVoices.map((voice) => (
                  <option key={voice} value={voice}>
                    {VOICE_LABELS[voice]}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mist-600" />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.68rem] leading-5 text-mist-600">
              保存前会调用一次真实合成，成功才会写入。
            </p>

            {deepseek?.hasKey && (
              <button
                type="button"
                onClick={() => setClearDeepseekKey((value) => !value)}
                className={[
                  'rounded-lg border px-3 py-1.5 text-[0.68rem] transition',
                  clearDeepseekKey
                    ? 'border-brass-400/30 bg-brass-400/[0.08] text-brass-300'
                    : 'border-mist-100/[0.08] text-mist-600 hover:border-signal-400/30 hover:text-signal-400',
                ].join(' ')}
              >
                {clearDeepseekKey ? '恢复保留密钥' : '清除已保存密钥'}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-mist-100/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[0.68rem] leading-5 text-mist-600">
              密钥不会返回前端，清除后语音合成将暂停使用。
            </p>
            <PrimaryButton
              type="button"
              onClick={handleSaveDeepseek}
              loading={saveDeepseekMutation.isPending}
              className="h-11 w-full sm:w-auto sm:px-6"
            >
              {clearDeepseekKey ? '清除密钥' : '测试并保存'}
            </PrimaryButton>
          </div>
        </div>
      )}

      <form
        className="mt-5 space-y-3 rounded-xl border border-mist-100/[0.07] bg-ink-950/40 p-4 sm:p-5"
        onSubmit={handleTest}
        noValidate
      >
        <div className="flex items-center gap-2">
          <Volume2 className="size-4 text-brass-300" strokeWidth={1.7} />
          <h3 className="text-[0.82rem] font-medium text-mist-200">试听</h3>
          <span className="text-[0.66rem] text-mist-600">使用已保存的配置合成</span>
        </div>

        <Field label="试听文本" htmlFor="settings-tts-test-text" error={testErrors.text?.message}>
          <textarea
            id="settings-tts-test-text"
            rows={2}
            maxLength={500}
            spellCheck={false}
            disabled={!tts?.ready}
            placeholder={tts?.ready ? '输入要试听的内容' : '保存并启用配置后即可试听'}
            className="field-shell min-h-[3.5rem] w-full resize-y px-3 py-2.5 text-[0.82rem] leading-6 disabled:opacity-50"
            {...testForm.register('text')}
          />
        </Field>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {preview ? (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <audio controls src={preview.src} className="h-9 w-full" />
              <span className="font-mono text-[0.62rem] text-mist-600">
                {PROVIDER_LABELS[preview.provider]} · {preview.latencyMs}ms ·{' '}
                {(preview.byteSize / 1024).toFixed(1)} KB
              </span>
            </div>
          ) : (
            <p className="text-[0.68rem] leading-5 text-mist-600">
              {tts?.ready ? '合成结果会在这里播放。' : '请先保存并启用一份可用配置。'}
            </p>
          )}
          <GhostButton
            type="submit"
            disabled={!tts?.ready || testMutation.isPending}
            className="h-10 w-full shrink-0 px-5 text-[0.78rem] sm:w-auto"
          >
            <Volume2 className="size-3.5" />
            {testMutation.isPending ? '合成中…' : '合成试听'}
          </GhostButton>
        </div>
      </form>
    </section>
  );
}
