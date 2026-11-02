import { zodResolver } from '@hookform/resolvers/zod';
import {
  modelProviderSchema,
  type ModelProviderInput,
  type ModelProviderProtocol,
  type ModelProviderSummary,
  type SettingsOverview,
} from '@inkseek/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PrimaryButton } from '@/components/button';
import { Field, InputShell } from '@/components/field';
import { ApiError, api } from '@/lib/api';
import { applyApiFieldErrors } from '@/lib/form-errors';
import { settingsQuery } from '@/lib/queries';

interface ProtocolOption {
  value: ModelProviderProtocol;
  label: string;
  placeholder: string;
  hint: string;
}

const PROTOCOL_OPTIONS: ProtocolOption[] = [
  {
    value: 'openai',
    label: 'OpenAI 兼容',
    placeholder: 'https://api.openai.com/v1',
    hint: '适用于 OpenAI、DeepSeek、Moonshot、Ollama 等提供 /models 接口的服务。',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    placeholder: 'https://api.anthropic.com/v1',
    hint: '通过 x-api-key 与 anthropic-version 请求 Anthropic 模型列表。',
  },
  {
    value: 'gemini',
    label: 'Google Gemini',
    placeholder: 'https://generativelanguage.googleapis.com/v1beta',
    hint: '调用 Generative Language API，仅保留支持 generateContent 的模型。',
  },
];

const timestampFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

interface SavedProvider {
  name: string;
  modelCount: number;
  latencyMs: number;
}

interface ModelProviderSectionProps {
  providers: ModelProviderSummary[];
}

export function ModelProviderSection({ providers }: ModelProviderSectionProps) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [lastSaved, setLastSaved] = useState<SavedProvider | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const form = useForm<ModelProviderInput>({
    resolver: zodResolver(modelProviderSchema),
    defaultValues: { name: '', protocol: 'openai', baseUrl: '', apiKey: '' },
  });

  const selectedProtocol = form.watch('protocol');
  const protocolMeta =
    PROTOCOL_OPTIONS.find((option) => option.value === selectedProtocol) ??
    (PROTOCOL_OPTIONS[0] as ProtocolOption);

  const createMutation = useMutation({
    mutationFn: api.createModelProvider,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: settingsQuery.queryKey });
      setLastSaved({
        name: result.provider.name,
        modelCount: result.modelCount,
        latencyMs: result.latencyMs,
      });
      form.reset();
      setShowKey(false);
      setFormOpen(false);
      toast.success(`${result.provider.name} 已保存 · ${result.modelCount} 个可用模型`);
    },
    onError: (error) => {
      applyApiFieldErrors(form.setError, error);
      toast.error(error instanceof ApiError ? error.message : '模型提供商保存失败');
    },
  });

  const retestMutation = useMutation({
    mutationFn: api.retestModelProvider,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: settingsQuery.queryKey });
      toast.success(`重新检测完成 · ${result.modelCount} 个可用模型`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '重新检测失败');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteModelProvider,
    onSuccess: (_data, id) => {
      const removed = providers.find((item) => item.id === id);

      setLastSaved((current) =>
        current && removed && current.name === removed.name ? null : current,
      );
      queryClient.setQueryData<SettingsOverview>(settingsQuery.queryKey, (current) =>
        current
          ? { ...current, providers: current.providers.filter((item) => item.id !== id) }
          : current,
      );
      setPendingDeleteId(null);
      toast.success('模型提供商已删除');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '删除失败，请稍后重试');
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    createMutation.mutate(values);
  });

  const errors = form.formState.errors;
  const retestingId = retestMutation.isPending ? retestMutation.variables : null;
  const deletingId = deleteMutation.isPending ? deleteMutation.variables : null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5 backdrop-blur-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-mist-100/[0.07] bg-ink-950/50 text-brass-300">
            <Bot className="size-[1.1rem]" strokeWidth={1.6} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
                模型提供商
              </h2>
              <span className="rounded-full border border-mist-100/[0.08] bg-ink-950/40 px-2 py-0.5 font-mono text-[0.56rem] uppercase tracking-[0.14em] text-mist-600">
                {providers.length} linked
              </span>
            </div>
            <p className="mt-1 text-[0.78rem] leading-6 text-mist-500">
              添加时实时请求模型列表，测试通过才会入库，并展示可用模型数量。
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormOpen((value) => !value);
            setShowKey(false);
          }}
          className={[
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[0.72rem] transition',
            formOpen
              ? 'border-mist-100/[0.1] text-mist-500 hover:border-mist-100/20 hover:text-mist-300'
              : 'border-brass-400/30 bg-brass-400/[0.08] text-brass-300 hover:bg-brass-400/15',
          ].join(' ')}
        >
          {formOpen ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {formOpen ? '收起表单' : '添加提供商'}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {lastSaved && (
          <motion.div
            key={`saved-${lastSaved.name}`}
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border border-jade-400/20 bg-jade-400/[0.06] px-4 py-3">
              <CheckCircle2 className="size-4 shrink-0 text-jade-300" />
              <p className="min-w-0 flex-1 text-[0.78rem] text-mist-300">
                <span className="font-medium text-jade-300">{lastSaved.name}</span>{' '}
                测试通过并已保存
                <span className="ml-2 font-mono text-[0.62rem] text-mist-600">
                  {lastSaved.latencyMs}ms
                </span>
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-xl font-semibold text-jade-300">
                  {lastSaved.modelCount}
                </span>
                <span className="font-mono text-[0.56rem] uppercase tracking-[0.16em] text-mist-600">
                  可用模型
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLastSaved(null)}
                className="rounded-md p-1 text-mist-600 transition hover:text-mist-300"
                aria-label="关闭提示"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {formOpen && (
          <motion.div
            key="provider-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <form
              className="mt-5 space-y-4 rounded-xl border border-mist-100/[0.07] bg-ink-950/40 p-4 sm:p-5"
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="提供商名称" htmlFor="provider-name" error={errors.name?.message}>
                  <InputShell
                    icon={<Bot className="size-4" strokeWidth={1.7} />}
                    invalid={Boolean(errors.name)}
                  >
                    <input
                      id="provider-name"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="例如：OpenAI 主账号"
                      {...form.register('name')}
                    />
                  </InputShell>
                </Field>

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-mist-500">
                      协议
                    </span>
                    <span className="flex items-center gap-1 text-[0.68rem] text-mist-600">
                      模型列表接口
                      <ChevronDown className="size-3" />
                    </span>
                  </div>
                  <div className="relative">
                    <select
                      id="provider-protocol"
                      aria-label="模型提供商协议"
                      className="wizard-input wizard-select"
                      {...form.register('protocol')}
                    >
                      {PROTOCOL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mist-600" />
                  </div>
                </div>
              </div>

              <p className="text-[0.66rem] leading-5 text-mist-600">{protocolMeta.hint}</p>

              <Field label="Base URL" htmlFor="provider-base-url" error={errors.baseUrl?.message}>
                <InputShell
                  icon={<Link2 className="size-4" strokeWidth={1.7} />}
                  invalid={Boolean(errors.baseUrl)}
                >
                  <input
                    id="provider-base-url"
                    type="url"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={protocolMeta.placeholder}
                    {...form.register('baseUrl')}
                  />
                </InputShell>
              </Field>

              <Field
                label="API Key"
                htmlFor="provider-api-key"
                hint="仅保存在数据库中，不会回显"
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
                    id="provider-api-key"
                    type={showKey ? 'text' : 'password'}
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder={selectedProtocol === 'gemini' ? 'AIza...' : 'sk-...'}
                    {...form.register('apiKey')}
                  />
                </InputShell>
              </Field>

              <div className="flex flex-col gap-3 border-t border-mist-100/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[0.68rem] leading-5 text-mist-600">
                  保存时会请求 <span className="font-mono text-mist-500">{protocolMeta.placeholder}/models</span>
                </p>
                <PrimaryButton
                  type="submit"
                  loading={createMutation.isPending}
                  className="h-11 w-full sm:w-auto sm:px-6"
                >
                  测试并保存
                </PrimaryButton>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 space-y-3">
        {providers.length === 0 && !formOpen && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-mist-100/[0.09] bg-ink-950/20 px-5 py-8 text-center">
            <Bot className="size-6 text-mist-600" strokeWidth={1.5} />
            <p className="text-[0.82rem] text-mist-400">还没有接入模型提供商</p>
            <p className="max-w-sm text-[0.7rem] leading-5 text-mist-600">
              添加一个提供商后，这里会展示测试结果、可用模型数量与最近检测时间。
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {providers.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              retesting={retestingId === provider.id}
              deleting={deletingId === provider.id}
              confirmingDelete={pendingDeleteId === provider.id}
              onRetest={() => retestMutation.mutate(provider.id)}
              onRequestDelete={() => setPendingDeleteId(provider.id)}
              onCancelDelete={() => setPendingDeleteId(null)}
              onConfirmDelete={() => deleteMutation.mutate(provider.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

interface ProviderRowProps {
  provider: ModelProviderSummary;
  retesting: boolean;
  deleting: boolean;
  confirmingDelete: boolean;
  onRetest: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function ProviderRow({
  provider,
  retesting,
  deleting,
  confirmingDelete,
  onRetest,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: ProviderRowProps) {
  const protocolMeta =
    PROTOCOL_OPTIONS.find((option) => option.value === provider.protocol) ??
    (PROTOCOL_OPTIONS[0] as ProtocolOption);
  const previewModels = provider.models.slice(0, 8);
  const remaining = Math.max(provider.modelCount - previewModels.length, 0);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-xl border border-mist-100/[0.07] bg-ink-950/35 p-4 transition hover:border-mist-100/[0.12]"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-jade-400/20 bg-jade-400/[0.06] text-jade-300">
          <Bot className="size-4" strokeWidth={1.6} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[0.9rem] font-medium text-mist-200">{provider.name}</h3>
            <span className="rounded-full border border-mist-100/[0.08] px-2 py-0.5 font-mono text-[0.54rem] uppercase tracking-[0.14em] text-mist-600">
              {protocolMeta.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-jade-400/25 bg-jade-400/[0.07] px-2 py-0.5 text-[0.62rem] text-jade-300">
              <CheckCircle2 className="size-3" />
              {provider.modelCount} 个可用模型
            </span>
          </div>

          <p className="mt-1.5 truncate font-mono text-[0.68rem] text-mist-600">{provider.baseUrl}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.64rem] text-mist-600">
            <span className="inline-flex items-center gap-1">
              <KeyRound className="size-3" />
              {provider.keyHint}
            </span>
            <span>最近检测 {timestampFormatter.format(new Date(provider.lastTestedAt))}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRetest}
            disabled={retesting || deleting}
            className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-jade-300 disabled:opacity-50"
            aria-label={`重新检测 ${provider.name}`}
            title="重新检测"
          >
            {retesting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" strokeWidth={1.7} />
            )}
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            disabled={deleting}
            className="rounded-lg p-2 text-mist-600 transition hover:bg-mist-100/5 hover:text-signal-400 disabled:opacity-50"
            aria-label={`删除 ${provider.name}`}
            title="删除"
          >
            {deleting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" strokeWidth={1.7} />
            )}
          </button>
        </div>
      </div>

      {previewModels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-mist-100/[0.06] pt-3">
          {previewModels.map((model) => (
            <span
              key={model}
              className="rounded-md border border-mist-100/[0.07] bg-ink-900/50 px-2 py-0.5 font-mono text-[0.6rem] text-mist-500"
            >
              {model}
            </span>
          ))}
          {remaining > 0 && (
            <span className="rounded-md border border-brass-400/20 px-2 py-0.5 font-mono text-[0.6rem] text-brass-400/80">
              +{remaining}
            </span>
          )}
        </div>
      )}

      {confirmingDelete && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-signal-400/20 bg-signal-400/[0.05] px-3 py-2.5"
        >
          <TriangleAlert className="size-3.5 shrink-0 text-signal-400" />
          <p className="min-w-0 flex-1 text-[0.7rem] text-mist-500">
            删除后需要重新添加并测试，历史模型列表会一并移除。
          </p>
          <button
            type="button"
            onClick={onCancelDelete}
            className="rounded-md border border-mist-100/10 px-2.5 py-1 text-[0.66rem] text-mist-500 transition hover:text-mist-200"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1 rounded-md border border-signal-400/30 bg-signal-400/10 px-2.5 py-1 text-[0.66rem] text-signal-400 transition hover:bg-signal-400/20 disabled:opacity-60"
          >
            {deleting && <LoaderCircle className="size-3 animate-spin" />}
            确认删除
          </button>
        </motion.div>
      )}
    </motion.article>
  );
}
