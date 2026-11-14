import type { SettingsOverview, WebSearchSettings } from '@inkseek/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, EyeOff, KeyRound, Link2, PowerOff, Search } from 'lucide-react';
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

/** Accepts an http(s) URL, optionally with a `{query}` placeholder. */
function isValidEndpoint(value: string): boolean {
  if (!value.trim()) {
    return true;
  }
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

interface WebSearchSectionProps {
  webSearch: WebSearchSettings | null;
}

/**
 * Configures the HTTP endpoint behind the mind's `web.search` tool. Without an
 * endpoint the tool stays off; it never falls back to a public search service.
 */
export function WebSearchSection({ webSearch }: WebSearchSectionProps) {
  const queryClient = useQueryClient();
  const [endpoint, setEndpoint] = useState(webSearch?.endpoint ?? '');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [clearKey, setClearKey] = useState(false);

  useEffect(() => {
    setEndpoint(webSearch?.endpoint ?? '');
    setApiKey('');
    setShowKey(false);
    setClearKey(false);
  }, [webSearch]);

  const endpointValid = isValidEndpoint(endpoint);
  const dirty = endpoint.trim() !== (webSearch?.endpoint ?? '') || apiKey.trim() !== '' || clearKey;
  const keyHint = clearKey
    ? '保存后清除密钥（部分实例不需要密钥）'
    : webSearch?.hasKey
      ? '已保存，留空保持不变'
      : '仅保存在服务端，不会回显';

  const mutation = useMutation({
    mutationFn: api.updateWebSearchSettings,
    onSuccess: (result) => {
      queryClient.setQueryData<SettingsOverview>(settingsQuery.queryKey, (current) =>
        current
          ? {
              ...current,
              webSearch: result.webSearch.endpoint ? result.webSearch : null,
            }
          : current,
      );
      toast.success(result.webSearch.endpoint ? '网页搜索接口已保存' : '已关闭网页搜索');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '网页搜索配置保存失败');
    },
  });

  return (
    <section className="relative overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5 backdrop-blur-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-mist-100/[0.07] bg-ink-950/50 text-brass-300">
            <Search className="size-[1.1rem]" strokeWidth={1.6} />
          </span>
          <div>
            <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
              网页搜索
            </h2>
            <p className="mt-1 max-w-xl text-[0.78rem] leading-6 text-mist-500">
              心智的 web.search 走这里配置的接口。URL 可带 {'{query}'}
              占位符，否则自动追加 q 与 limit 参数；接口需返回 JSON 数组，或 results / items / data
              列表，每项包含 title、snippet、url。留空即关闭搜索，也不会请求任何公共搜索服务；
              直接读网页（web.read）不受影响。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {webSearch ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-jade-400/25 bg-jade-400/[0.07] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-jade-300">
              <CheckCircle2 className="size-3" />
              Configured
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-mist-100/10 bg-ink-950/40 px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-mist-500">
              <PowerOff className="size-3" />
              Off
            </span>
          )}
          {webSearch && (
            <span className="text-[0.66rem] text-mist-600">
              {timestampFormatter.format(new Date(webSearch.updatedAt))}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Field
          label="Endpoint"
          htmlFor="settings-web-search-endpoint"
          hint="留空即关闭"
          error={!endpointValid ? '请输入有效的 http(s) 地址' : undefined}
        >
          <InputShell
            icon={<Link2 className="size-4" strokeWidth={1.7} />}
            invalid={!endpointValid}
          >
            <input
              id="settings-web-search-endpoint"
              type="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://api.bing.microsoft.com/v7.0/search?q={query}"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
            />
          </InputShell>
        </Field>

        <Field label="API Key" htmlFor="settings-web-search-key" hint={keyHint}>
          <InputShell
            icon={<KeyRound className="size-4" strokeWidth={1.7} />}
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
              id="settings-web-search-key"
              type={showKey ? 'text' : 'password'}
              autoComplete="new-password"
              spellCheck={false}
              disabled={clearKey || !endpoint.trim()}
              placeholder={
                endpoint.trim()
                  ? webSearch?.hasKey && !clearKey
                    ? '留空保持已保存密钥'
                    : '可留空（自建实例）'
                  : '留空即关闭搜索'
              }
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </InputShell>
        </Field>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-mist-100/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[0.68rem] leading-5 text-mist-600">
            密钥不会返回前端；清空 Endpoint 保存会同时清除密钥并关闭搜索。
          </p>
          {webSearch?.hasKey && (
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
        <div className="flex items-center gap-2">
          <GhostButton
            type="button"
            disabled={!dirty || mutation.isPending}
            onClick={() => {
              setEndpoint(webSearch?.endpoint ?? '');
              setApiKey('');
              setClearKey(false);
            }}
            className="h-10 px-4 text-[0.72rem]"
          >
            重置
          </GhostButton>
          <PrimaryButton
            type="button"
            loading={mutation.isPending}
            disabled={!dirty || !endpointValid}
            onClick={() =>
              mutation.mutate({
                endpoint: endpoint.trim(),
                apiKey: apiKey.trim(),
                clearKey,
              })
            }
            className="h-10 px-5 text-[0.75rem]"
          >
            保存配置
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}
