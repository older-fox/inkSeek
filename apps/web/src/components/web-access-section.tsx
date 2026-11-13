import type { SettingsOverview } from '@inkseek/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe2, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { GhostButton, PrimaryButton } from '@/components/button';
import { ApiError, api } from '@/lib/api';
import { settingsQuery } from '@/lib/queries';

const HOST_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Accepts a pasted URL or wildcard and returns a bare hostname; null when unusable. */
function normalizeHost(raw: string): string | null {
  let host = raw.trim().toLowerCase();
  if (!host) {
    return null;
  }
  const scheme = host.indexOf('://');
  if (scheme >= 0) {
    host = host.slice(scheme + 3);
  }
  host = host.replace(/^[^@/]*@/, '');
  host = host.split(/[/?#]/)[0] ?? '';
  host = host.replace(/:\d+$/, '').replace(/^\.+/, '').replace(/^\*\./, '');
  return host && HOST_PATTERN.test(host) ? host : null;
}

/** Splits the textarea into valid hostnames plus the lines that cannot be used. */
function parseHosts(text: string): { hosts: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const hosts: string[] = [];
  const invalid: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const host = normalizeHost(line);
    if (!host) {
      invalid.push(line.trim());
      continue;
    }
    if (seen.has(host)) {
      continue;
    }
    seen.add(host);
    hosts.push(host);
  }
  return { hosts, invalid };
}

/**
 * Editor for the host allowlist that lets the mind read sites which only
 * resolve on the local network. Empty means the SSRF guard stays strict.
 */
export function WebAccessSection({ hosts }: { hosts: string[] }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(hosts.join('\n'));

  useEffect(() => {
    setText(hosts.join('\n'));
  }, [hosts]);

  const parsed = useMemo(() => parseHosts(text), [text]);
  const dirty = parsed.hosts.join('\n') !== hosts.join('\n');
  const tooMany = parsed.hosts.length > 100;

  const mutation = useMutation({
    mutationFn: api.updateWebAllowedHosts,
    onSuccess: (result) => {
      queryClient.setQueryData<SettingsOverview>(settingsQuery.queryKey, (current) =>
        current ? { ...current, webAllowedHosts: result.hosts } : current,
      );
      setText(result.hosts.join('\n'));
      toast.success(
        result.hosts.length > 0 ? `已保存 ${result.hosts.length} 个域名` : '已清空白名单',
      );
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '白名单保存失败');
    },
  });

  return (
    <section className="relative overflow-hidden rounded-2xl border border-mist-100/[0.07] bg-ink-900/40 p-5 backdrop-blur-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-signal-400/20 bg-signal-400/[0.06] text-signal-400">
            <Globe2 className="size-[1.1rem]" strokeWidth={1.6} />
          </span>
          <div>
            <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-mist-100">
              网页访问白名单
            </h2>
            <p className="mt-1 max-w-xl text-[0.78rem] leading-6 text-mist-500">
              心智的网页读取默认拒绝解析到内网的主机，避免被网页内容诱导去读本机服务。若站点只在
              内网解析（例如自己反向代理的博客），把域名写进这里即可放行；填写 example.com
              会同时覆盖它的所有子域。留空表示完全不放行。
            </p>
          </div>
        </div>

        <span className="rounded-full border border-mist-100/10 bg-ink-950/40 px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-mist-500">
          {parsed.hosts.length} hosts
        </span>
      </div>

      <label className="mt-5 block">
        <span className="sr-only">网页访问白名单域名</span>
        <textarea
          value={text}
          spellCheck={false}
          rows={6}
          onChange={(event) => setText(event.target.value)}
          placeholder={'每行一个域名，例如：\nolderfox.com\n*.olderfox.com'}
          className="wizard-textarea min-h-[9rem] font-sans text-[0.78rem] leading-6"
        />
      </label>

      {parsed.invalid.length > 0 && (
        <p className="mt-2 text-[0.7rem] text-signal-400">
          {parsed.invalid.length > 3
            ? `有 ${parsed.invalid.length} 行不是有效域名，请检查后再保存。`
            : `无法识别：${parsed.invalid.join('、')}`}
        </p>
      )}
      {tooMany && <p className="mt-2 text-[0.7rem] text-signal-400">最多保存 100 个域名。</p>}

      <div className="mt-4 flex flex-col gap-3 border-t border-mist-100/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.68rem] leading-5 text-mist-600">
          每行一个域名，可直接粘贴完整网址，会自动取出主机名；空表示不启用白名单。
        </p>
        <div className="flex items-center gap-2">
          <GhostButton
            type="button"
            disabled={!dirty || mutation.isPending}
            onClick={() => setText(hosts.join('\n'))}
            className="h-10 px-4 text-[0.72rem]"
          >
            <RotateCcw className="size-3.5" />
            重置
          </GhostButton>
          <PrimaryButton
            type="button"
            loading={mutation.isPending}
            disabled={!dirty || parsed.invalid.length > 0 || tooMany}
            onClick={() => mutation.mutate({ hosts: parsed.hosts })}
            className="h-10 px-5 text-[0.75rem]"
          >
            保存白名单
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}
