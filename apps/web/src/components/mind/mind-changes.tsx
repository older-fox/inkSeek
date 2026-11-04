import type { PersonaChangeRecord } from '@inkseek/shared';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  CHANGE_SCOPE_LABELS,
  STATE_FIELD_LABELS,
  STATE_SOURCE_LABELS,
  formatStateValue,
  formatTime,
} from './mind-format';
import { EmptyState, LazyList, MindSection } from './mind-ui';

const SCOPES = [
  { value: '', label: '全部' },
  { value: 'STATE', label: '自我状态' },
  { value: 'SELF', label: '自身属性' },
  { value: 'RELATION', label: '个人关系' },
  { value: 'GROUP', label: '群内态度' },
] as const;

export function MindChangesTab({ personaId }: { personaId: string }) {
  const [scope, setScope] = useState('');
  const [limit, setLimit] = useState(100);
  const changesQuery = useQuery({
    queryKey: ['mind', 'changes', personaId, scope, limit],
    queryFn: () =>
      api.mindChanges(personaId, {
        scope: scope || undefined,
        limit,
        offset: 0,
      }),
    staleTime: 5_000,
  });
  const changes: PersonaChangeRecord[] = changesQuery.data ?? [];
  const reachedEnd = changes.length < limit;

  return (
    <MindSection title={`Changes · ${changes.length}`} count={reachedEnd ? '到底了' : '可加载更多'}>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {SCOPES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setScope(item.value);
              setLimit(100);
            }}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[0.68rem] transition',
              scope === item.value
                ? 'border-brass-400/35 bg-brass-400/10 text-brass-200'
                : 'border-mist-100/[0.08] text-mist-500 hover:text-mist-300',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {changesQuery.isPending ? (
        <div className="grid place-items-center py-12">
          <LoaderCircle className="size-5 animate-spin text-brass-300" />
        </div>
      ) : changes.length === 0 ? (
        <EmptyState compact text="这个范围内还没有变动记录。" />
      ) : (
        <div className="mt-3 space-y-1.5">
          <LazyList
            items={changes}
            step={30}
            renderItem={(change) => (
              <div
                key={change.id}
                className="rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.7rem]">
                  <span className="font-mono text-mist-600">{formatTime(change.createdAt)}</span>
                  <span className="rounded-full border border-mist-100/[0.08] px-1.5 py-0.5 font-mono text-[0.6rem] text-mist-500">
                    {CHANGE_SCOPE_LABELS[change.scope] ?? change.scope}
                  </span>
                  <span className="text-mist-300">
                    {STATE_FIELD_LABELS[change.field] ?? change.field}
                  </span>
                  {change.beforeValue === null && change.afterValue === null ? null : (
                    <span className="font-mono text-mist-400">
                      {formatStateValue(change.beforeValue)} → {formatStateValue(change.afterValue)}
                    </span>
                  )}
                  {change.delta !== null ? (
                    <span
                      className={cn(
                        'font-mono',
                        change.delta >= 0 ? 'text-jade-300' : 'text-signal-400',
                      )}
                    >
                      {change.delta > 0 ? '+' : ''}
                      {change.delta}
                    </span>
                  ) : null}
                  <span className="ml-auto max-w-[16rem] truncate text-mist-500">
                    {change.reason || STATE_SOURCE_LABELS[change.source] || change.source}
                  </span>
                </div>
                {change.targetId ? (
                  <p className="mt-1 truncate font-mono text-[0.6rem] text-mist-600">
                    目标 {change.targetId}
                  </p>
                ) : null}
              </div>
            )}
          />
          {!reachedEnd ? (
            <button
              type="button"
              onClick={() => setLimit((current) => current + 100)}
              disabled={changesQuery.isFetching}
              className="mt-2 w-full rounded-lg border border-mist-100/[0.08] py-1.5 text-[0.72rem] text-mist-400 transition hover:border-mist-100/[0.16] hover:text-mist-200 disabled:opacity-50"
            >
              {changesQuery.isFetching ? '加载中…' : '加载更多'}
            </button>
          ) : null}
        </div>
      )}
    </MindSection>
  );
}
