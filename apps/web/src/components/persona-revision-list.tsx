import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Channel } from '@/lib/connections';
import { formatPersonaTimestamp } from '@/lib/persona-metadata';

const INITIAL_REVISION_COUNT = 50;
const REVISION_PAGE_SIZE = 25;

const COLUMNS = ['时间', '来源', '内容', '原因'] as const;

/**
 * Read-only history of persona field edits for one channel, newest first.
 * Rows paginate automatically as the sentinel scrolls into view.
 */
export function PersonaRevisionList({
  channel,
  scrollRootRef,
}: {
  channel: Channel;
  scrollRootRef: RefObject<HTMLDivElement | null>;
}) {
  const revisions = useMemo(
    () =>
      (channel.persona?.meta.history ?? []).map((entry) => ({
        id: entry.id,
        time: formatPersonaTimestamp(entry.time),
        source: '手动修订',
        content: `${entry.field}：${entry.from} → ${entry.to}`,
        reason: entry.reason,
      })),
    [channel.persona?.meta.history],
  );
  const [visibleCount, setVisibleCount] = useState(INITIAL_REVISION_COUNT);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const total = revisions.length;

  useEffect(() => {
    if (visibleCount >= total) {
      return undefined;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(total, current + REVISION_PAGE_SIZE));
        }
      },
      { root: scrollRootRef.current, rootMargin: '180px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, total, scrollRootRef]);

  const visibleRevisions = revisions.slice(0, visibleCount);

  return (
    <section className="mt-7 border-t border-mist-100/[0.06] pt-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="font-display text-[1rem] font-semibold tracking-tight text-mist-100">
            修订历史
          </h4>
          <p className="mt-1 text-[0.74rem] leading-6 text-mist-500">
            来自渠道人格的唯一记录，按时间从新到旧排列。
          </p>
        </div>
        <span className="rounded-full border border-mist-100/[0.08] bg-ink-950/30 px-2 py-0.5 font-mono text-[0.58rem] text-mist-500">
          共 {total} 条
        </span>
      </div>

      {total === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-mist-100/[0.1] px-4 py-6 text-center text-[0.74rem] text-mist-600">
          还没有修订记录。编辑任意属性后会自动写入这里。
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-xl border border-mist-100/[0.06]">
            <div className="hidden grid-cols-[8.5rem_6.5rem_minmax(0,1.1fr)_minmax(0,0.9fr)] gap-3 border-b border-mist-100/[0.06] bg-ink-950/25 px-4 py-2 md:grid">
              {COLUMNS.map((column) => (
                <span key={column} className="font-mono text-[0.58rem] tracking-[0.16em] text-mist-600">
                  {column}
                </span>
              ))}
            </div>

            <ol>
              {visibleRevisions.map((revision) => (
                <li
                  key={revision.id}
                  className="grid gap-1.5 border-b border-mist-100/[0.05] px-4 py-3 last:border-b-0 md:grid-cols-[8.5rem_6.5rem_minmax(0,1.1fr)_minmax(0,0.9fr)] md:items-start md:gap-3"
                >
                  <div className="flex items-baseline gap-2 md:block">
                    <span className="text-[0.62rem] text-mist-600 md:hidden">时间</span>
                    <span className="font-mono text-[0.66rem] leading-6 text-mist-300">
                      {revision.time}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 md:block">
                    <span className="text-[0.62rem] text-mist-600 md:hidden">来源</span>
                    <span className="inline-flex rounded-full border border-mist-100/[0.08] bg-ink-950/30 px-2 py-0.5 text-[0.64rem] leading-5 text-mist-500">
                      {revision.source}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 md:block">
                    <span className="text-[0.62rem] text-mist-600 md:hidden">内容</span>
                    <p className="text-[0.76rem] leading-6 text-mist-300">{revision.content}</p>
                  </div>

                  <div className="flex items-baseline gap-2 md:block">
                    <span className="text-[0.62rem] text-mist-600 md:hidden">原因</span>
                    <p className="text-[0.74rem] leading-6 text-mist-500">{revision.reason}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div ref={sentinelRef} className="mt-2 flex justify-center">
            {visibleCount < total ? (
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((current) => Math.min(total, current + REVISION_PAGE_SIZE))
                }
                className="inline-flex h-8 items-center rounded-lg border border-brass-400/20 bg-brass-400/[0.06] px-3 text-[0.7rem] text-brass-300 transition hover:bg-brass-400/[0.12]"
              >
                加载更多修订
              </button>
            ) : (
              <span className="text-[0.68rem] text-mist-600">已加载全部 {total} 条修订</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
