import type {
  ModelProviderSummary,
  SettingsOverview,
  VisionModelResult,
  VisionModelSettings,
} from '@inkseek/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Eye, ImageOff, RefreshCw, ScanEye, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { GhostButton, PrimaryButton } from '@/components/button';
import { Field, InputShell } from '@/components/field';
import { ApiError, api } from '@/lib/api';
import { settingsQuery } from '@/lib/queries';

const timestampFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

interface VisionModelSectionProps {
  visionModel: VisionModelSettings;
  providers: ModelProviderSummary[];
}

/**
 * Pins image reading to one provider/model. Saving runs a real probe with a
 * bundled picture, so a text-only model is rejected instead of silently
 * returning "无法查看这张图片" for every image afterwards.
 */
export function VisionModelSection({ visionModel, providers }: VisionModelSectionProps) {
  const queryClient = useQueryClient();
  const [providerId, setProviderId] = useState(visionModel.providerId ?? '');
  const [model, setModel] = useState(visionModel.model ?? '');
  const [result, setResult] = useState<VisionModelResult | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [sweep, setSweep] = useState<{
    processed: number;
    failed: number;
    remaining: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    setProviderId(visionModel.providerId ?? '');
    setModel(visionModel.model ?? '');
    setResult(null);
  }, [visionModel]);

  /** Walks the stored descriptions in small batches so no single request runs for minutes. */
  const runRedescribe = async () => {
    if (sweeping) {
      return;
    }
    setSweeping(true);
    setSweep(null);
    let cursor = '';
    let processed = 0;
    let failed = 0;
    let total = 0;
    try {
      for (;;) {
        const batch = await api.redescribeVisionImages({ cursor, limit: 5 });
        processed += batch.processed;
        failed += batch.failures.length;
        if (total === 0) {
          total = processed + batch.skipped + failed + batch.remaining;
        }
        cursor = batch.nextCursor ?? '';
        setSweep({ processed, failed, remaining: batch.remaining, total });
        if (!batch.nextCursor || batch.remaining === 0) {
          break;
        }
      }
      toast.success(
        total === 0
          ? '没有已有描述的图片需要重新识别'
          : `重新识别完成：${processed} 张${failed > 0 ? `，失败 ${failed} 张` : ''}`,
      );
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '重新识别失败，请稍后重试');
    } finally {
      setSweeping(false);
    }
  };

  const provider = providers.find((item) => item.id === providerId);
  const suggestions = provider?.models ?? [];
  const configured = Boolean(visionModel.providerId || visionModel.model);
  const dirty =
    (providerId || '') !== (visionModel.providerId ?? '') || model !== (visionModel.model ?? '');

  const mutation = useMutation({
    mutationFn: api.updateVisionModel,
    onSuccess: (saved) => {
      queryClient.setQueryData<SettingsOverview>(settingsQuery.queryKey, (current) =>
        current ? { ...current, visionModel: saved.visionModel } : current,
      );
      setResult(saved);
      setProviderId(saved.visionModel.providerId ?? '');
      setModel(saved.visionModel.model ?? '');
      toast.success(`识图探针通过 · ${saved.latencyMs}ms，配置已保存`);
    },
    onError: (error) => {
      setResult(null);
      toast.error(error instanceof ApiError ? error.message : '识图模型探测失败');
    },
  });

  return (
    <section className="relative overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5 backdrop-blur-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-mist-100/[0.07] bg-ink-950/50 text-brass-300">
            <ScanEye className="size-[1.1rem]" strokeWidth={1.6} />
          </span>
          <div>
            <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
              识图模型
            </h2>
            <p className="mt-1 max-w-xl text-[0.78rem] leading-6 text-mist-500">
              图片描述、手机识屏、网页截图、表情标注和视频抽帧都走这里指定的模型。保存时会用一张内置图片
              真实识别一次，读不出内容的模型（包括只回一句“无法查看这张图片”的文本模型）不会被保存。
              留空表示跟随默认模型。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {configured ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-jade-400/25 bg-jade-400/[0.07] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-jade-300">
              <ShieldCheck className="size-3" />
              Pinned
            </span>
          ) : (
            <span className="rounded-full border border-mist-100/10 bg-ink-950/40 px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-mist-500">
              Follows default
            </span>
          )}
          {visionModel.verifiedAt && (
            <span className="text-[0.66rem] text-mist-600">
              探针 {timestampFormatter.format(new Date(visionModel.verifiedAt))}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="提供商" htmlFor="settings-vision-provider" hint="留空跟随默认">
          <div className="relative">
            <select
              id="settings-vision-provider"
              className="wizard-input wizard-select"
              value={providerId}
              onChange={(event) => {
                setProviderId(event.target.value);
                setModel('');
                setResult(null);
              }}
            >
              <option value="">跟随默认提供商</option>
              {providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.protocol}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mist-600" />
          </div>
        </Field>

        <Field
          label="模型"
          htmlFor="settings-vision-model"
          hint={provider ? `${suggestions.length} 个已检测模型` : '跟随默认模型'}
        >
          <InputShell icon={<Sparkles className="size-4" strokeWidth={1.7} />}>
            <input
              id="settings-vision-model"
              type="text"
              autoComplete="off"
              spellCheck={false}
              list="settings-vision-model-options"
              placeholder={suggestions[0] ?? '留空使用提供商默认模型'}
              value={model}
              onChange={(event) => {
                setModel(event.target.value);
                setResult(null);
              }}
            />
            <datalist id="settings-vision-model-options">
              {suggestions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </InputShell>
        </Field>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {suggestions.slice(0, 8).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setModel(item);
                setResult(null);
              }}
              className={[
                'rounded-full border px-2.5 py-1 font-mono text-[0.62rem] transition',
                item === model
                  ? 'border-brass-400/35 bg-brass-400/[0.08] text-brass-300'
                  : 'border-mist-100/[0.08] text-mist-600 hover:border-mist-100/20 hover:text-mist-300',
              ].join(' ')}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-mist-100/[0.07] bg-ink-950/40 p-4">
        <div className="flex items-center gap-2 text-[0.62rem] font-medium tracking-[0.04em] text-mist-500">
          <Eye className="size-3.5 text-brass-300" strokeWidth={1.7} />
          探针结果
        </div>
        {result ? (
          <div className="mt-2 space-y-1.5">
            <p className="text-[0.8rem] leading-6 text-mist-200">{result.description}</p>
            <p className="font-mono text-[0.62rem] text-mist-600">
              {result.visionModel.providerName ?? '默认提供商'} · {result.latencyMs}ms · 输出{' '}
              {result.completionTokens ?? '?'} tokens
              {result.reasoningTokens ? `（推理 ${result.reasoningTokens}）` : ''}
            </p>
          </div>
        ) : visionModel.lastDescription ? (
          <div className="mt-2 space-y-1.5">
            <p className="text-[0.8rem] leading-6 text-mist-300">{visionModel.lastDescription}</p>
            <p className="font-mono text-[0.62rem] text-mist-600">
              {visionModel.providerName ?? '默认提供商'}
              {visionModel.model ? ` · ${visionModel.model}` : ''} · 上次探针
            </p>
          </div>
        ) : (
          <p className="mt-2 flex items-center gap-1.5 text-[0.72rem] text-mist-600">
            <ImageOff className="size-3.5" />
            还没有探测过。保存时会用内置图片实际识别一次。
          </p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-mist-100/[0.07] bg-ink-950/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.78rem] text-mist-200">历史图片描述</p>
            <p className="mt-1 max-w-lg text-[0.68rem] leading-5 text-mist-600">
              用当前识图模型把已有描述逐张重新识别并覆盖，适合修正旧提示词留下的错误描述。会消耗识图
              token；没有关联消息的旧图片会跳过，失败的单张保留原描述。
            </p>
          </div>
          <GhostButton
            type="button"
            disabled={sweeping}
            onClick={() => void runRedescribe()}
            className="h-9 shrink-0 px-3 text-[0.72rem]"
          >
            <RefreshCw className={`size-3.5 ${sweeping ? 'animate-spin' : ''}`} />
            {sweeping ? '重新识别中…' : '重新识别全部'}
          </GhostButton>
        </div>
        {sweep && (
          <p className="mt-2 font-mono text-[0.62rem] text-mist-500">
            {sweeping ? '进行中' : '已完成'} {sweep.processed}
            {sweep.total > 0 ? `/${sweep.total}` : ''}
            {sweep.failed > 0 ? ` · 失败 ${sweep.failed}` : ''}
            {sweeping && sweep.remaining > 0 ? ` · 剩余 ${sweep.remaining}` : ''}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-mist-100/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.68rem] leading-5 text-mist-600">
          探测只发一张内置图片，不会带上任何渠道的图片或聊天内容。
        </p>
        <PrimaryButton
          type="button"
          loading={mutation.isPending}
          disabled={!dirty || mutation.isPending}
          onClick={() =>
            mutation.mutate({
              providerId: providerId.trim(),
              model: model.trim(),
            })
          }
          className="h-10 w-full px-5 text-[0.75rem] sm:w-auto"
        >
          保存并测试
        </PrimaryButton>
      </div>
    </section>
  );
}
