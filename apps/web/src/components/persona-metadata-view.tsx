import { ArrowRight, CalendarPlus, History, RefreshCw, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  formatPersonaTimestamp,
  type PersonaHistoryEntry,
  type PersonaMetadata,
} from '@/lib/persona-metadata';
import { cn } from '@/lib/cn';

const INITIAL_ROWS = 5;
const PAGE_SIZE = 5;

function MetaCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md border border-brass-400/20 bg-brass-400/[0.07] text-brass-300">
          <Icon className="size-3.5" strokeWidth={1.7} />
        </span>
        <span className="text-[0.72rem] text-mist-400">{label}</span>
      </div>
      <p className="mt-2 font-display text-[1.02rem] font-semibold leading-none tabular-nums text-mist-100">
        {value}
      </p>
      <p className="mt-1.5 text-[0.64rem] text-mist-600">{note}</p>
    </div>
  );
}

function ChangeCell({ entry }: { entry: PersonaHistoryEntry }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="max-w-[9rem] truncate text-mist-500" title={entry.from}>
        {entry.from}
      </span>
      <ArrowRight className="size-3 shrink-0 text-brass-400/70" strokeWidth={2} />
      <span className="max-w-[9rem] truncate text-mist-200" title={entry.to}>
        {entry.to}
      </span>
    </span>
  );
}

export function PersonaMetadataView({ meta }: { meta: PersonaMetadata }) {
  const [visible, setVisible] = useState(INITIAL_ROWS);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = meta.history.length;
  const remaining = Math.max(total - visible, 0);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const loadMore = () => {
    if (loading || remaining === 0) {
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(() => {
      setVisible((current) => current + PAGE_SIZE);
      setLoading(false);
      timerRef.current = null;
    }, 360);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[1.2rem] font-semibold tracking-tight text-mist-100">
              元数据
            </h3>
            <span className="font-mono text-[0.56rem] uppercase tracking-[0.16em] text-brass-400/70">
              快照信息
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-[0.8rem] leading-7 text-mist-500">
            这份人格快照的创建、更新与变更记录，只保存在本地。
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-mist-100/[0.08] bg-ink-950/30 px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-mist-500">
          {total} 条变更
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <MetaCard
          icon={CalendarPlus}
          label="创建时间"
          value={formatPersonaTimestamp(meta.createdAt)}
          note="首次建立人格快照"
        />
        <MetaCard
          icon={RefreshCw}
          label="更新时间"
          value={formatPersonaTimestamp(meta.updatedAt)}
          note="最近一次变更写入"
        />
        <MetaCard icon={History} label="变更记录" value={`${total} 条`} note="按时间倒序排列" />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-mist-500">
            更新历史
          </h4>
          <span className="font-mono text-[0.56rem] tabular-nums text-mist-600">
            已显示 {Math.min(visible, total)} / {total}
          </span>
        </div>

        <div className="mt-2 overflow-x-auto rounded-xl border border-mist-100/[0.06] bg-ink-950/25">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-mist-100/[0.06]">
                <th className="whitespace-nowrap px-4 py-2.5 font-mono text-[0.54rem] font-normal uppercase tracking-[0.14em] text-mist-600">
                  时间
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 font-mono text-[0.54rem] font-normal uppercase tracking-[0.14em] text-mist-600">
                  属性
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 font-mono text-[0.54rem] font-normal uppercase tracking-[0.14em] text-mist-600">
                  变更
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 font-mono text-[0.54rem] font-normal uppercase tracking-[0.14em] text-mist-600">
                  原因
                </th>
              </tr>
            </thead>
            <tbody>
              {total === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[0.74rem] text-mist-600">
                    还没有变更记录
                  </td>
                </tr>
              )}
              {meta.history.slice(0, visible).map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-mist-100/[0.04] transition last:border-b-0 hover:bg-mist-100/[0.02]"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[0.62rem] tabular-nums text-mist-500">
                    {formatPersonaTimestamp(entry.time, false)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[0.76rem] text-mist-300">
                    {entry.field}
                  </td>
                  <td className="px-4 py-2.5 text-[0.72rem]">
                    <ChangeCell entry={entry} />
                  </td>
                  <td className="px-4 py-2.5 text-[0.72rem] text-mist-500">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {remaining > 0 && (
          <div className="mt-2 flex items-center justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 font-mono text-[0.58rem] tracking-[0.08em] transition',
                loading
                  ? 'cursor-wait border-mist-100/[0.06] text-mist-600'
                  : 'border-brass-400/25 bg-brass-400/[0.07] text-brass-300 hover:bg-brass-400/[0.14]',
              )}
            >
              {loading ? '加载中…' : `加载更多 · 剩余 ${remaining} 条`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
