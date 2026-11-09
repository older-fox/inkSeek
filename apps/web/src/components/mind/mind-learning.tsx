import type {
  MindLearningItemRecord,
  MindLearningLogRecord,
  MindLearningOverview,
  PersonaStyleNoteRecord,
} from '@inkseek/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ExternalLink, LoaderCircle, Pause, Play, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatTime } from './mind-format';
import { EmptyState, MindSection } from './mind-ui';

const DIMENSION_LABELS: Record<string, string> = {
  length: '长度',
  punctuation: '标点',
  particles: '语气词',
  openings: '开场',
  humor: '幽默',
  rhythm: '节奏',
  vocabulary: '用词',
  tone: '语气',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '使用中',
  PAUSED: '已暂停',
  PROMOTED: '已固化',
  RUNNING: '进行中',
  SUCCEEDED: '已完成',
  FAILED: '失败',
};

/**
 * Learning tab: enablement summary with a manual trigger, editable
 * speaking-style notes, and the history of learning runs.
 */
export function MindLearningTab({
  personaId,
  channelId,
}: {
  personaId: string;
  channelId: string;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const learningQuery = useQuery({
    queryKey: ['mind', 'learning', personaId, channelId],
    queryFn: () => api.mindLearning(personaId, channelId, 16),
    enabled: Boolean(personaId && channelId),
    staleTime: 10_000,
  });
  const start = useMutation({
    mutationFn: () => api.startMindLearning(personaId),
    onSuccess: async (result) => {
      toast.success(result?.plan ? result.reason || '这一轮学完了' : '这次没有留下新东西');
      await queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '学习失败'),
  });
  const updateNote = useMutation({
    mutationFn: (input: { id: string; status?: 'ACTIVE' | 'PAUSED' }) =>
      api.updateMindStyleNote(input.id, { status: input.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mind', 'learning', personaId, channelId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '更新失败'),
  });
  const removeNote = useMutation({
    mutationFn: (id: string) => api.deleteMindStyleNote(id),
    onSuccess: async () => {
      toast.success('已删除这条说话方式');
      await queryClient.invalidateQueries({ queryKey: ['mind', 'learning', personaId, channelId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '删除失败'),
  });

  if (learningQuery.isPending) {
    return (
      <div className="grid place-items-center py-16">
        <LoaderCircle className="size-5 animate-spin text-brass-300" />
      </div>
    );
  }
  if (!learningQuery.data) {
    return <EmptyState compact text="暂时读不到学习状态。" />;
  }
  const data: MindLearningOverview = learningQuery.data;
  const activeNotes = data.notes.filter((note) => note.status === 'ACTIVE').length;
  const promotedNotes = data.notes.filter((note) => note.status === 'PROMOTED').length;
  const busy = start.isPending;

  return (
    <div className="space-y-4">
      <MindSection title="Learning Loop" count={data.enabled ? '开启' : '关闭'}>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.82rem] text-mist-200">
              {data.enabled
                ? `每 ${data.intervalHours > 0 ? `${data.intervalHours} 小时` : '—'} 自己去学点东西`
                : '自主学习已关闭'}
            </p>
            <p className="mt-1 text-[0.68rem] text-mist-500">
              上次学习 {formatTime(data.lastRunAt)} · 今天已收集 {data.sourcesToday}
              {data.dailySourceLimit > 0 ? ` / ${data.dailySourceLimit}` : ''} 个来源
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => start.mutate()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brass-400/30 bg-brass-400/10 px-3 text-[0.72rem] text-brass-200 transition hover:bg-brass-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {busy ? '学习进行中…' : '立刻学一轮'}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[0.62rem]">
          <Badge tone={data.browserEnabled ? 'jade' : 'muted'}>
            无头浏览器 {data.browserEnabled ? '开' : '关'}
          </Badge>
          <Badge tone={data.styleLearningEnabled ? 'jade' : 'muted'}>
            表达学习 {data.styleLearningEnabled ? '开' : '关'}
          </Badge>
          <Badge tone={data.stylePromotionEnabled ? 'jade' : 'muted'}>
            人格慢固化 {data.stylePromotionEnabled ? '开' : '关'}
          </Badge>
          <Badge tone="brass">{activeNotes} 条在用</Badge>
          {promotedNotes > 0 ? <Badge tone="muted">{promotedNotes} 条已固化</Badge> : null}
        </div>
        <p className="mt-3 text-[0.66rem] leading-5 text-mist-600">
          只读网页、B 站视频和评论，不登录、不发帖、不评论、不购买。学到的知识写进记忆；说话方式先作为临时笔记注入对话，反复出现且反思认为合适时，才会慢慢写进人格卡。
        </p>
      </MindSection>

      <MindSection title="Ways of Speaking" count={data.notes.length}>
        {data.notes.length === 0 ? (
          <EmptyState compact text="还没有学到说话方式。等 TA 读到别人的表达后会出现。" />
        ) : (
          <div className="mt-3 space-y-2">
            {data.notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                busy={updateNote.isPending || removeNote.isPending}
                onToggle={() =>
                  updateNote.mutate({
                    id: note.id,
                    status: note.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                  })
                }
                onRemove={() => removeNote.mutate(note.id)}
              />
            ))}
          </div>
        )}
      </MindSection>

      <MindSection title="Learning Runs" count={data.logs.length}>
        {data.logs.length === 0 ? (
          <EmptyState compact text="还没有学习记录。等下一次空闲心跳到期，或点上面的「立刻学一轮」。" />
        ) : (
          <div className="mt-3 space-y-2">
            {data.logs.map((log) => (
              <LogCard
                key={log.id}
                log={log}
                open={expanded === log.id}
                onToggle={() => setExpanded(expanded === log.id ? null : log.id)}
              />
            ))}
          </div>
        )}
      </MindSection>
    </div>
  );
}

/**
 * One speaking-style note with confidence, evidence and sources; can be
 * toggled between active and paused, or deleted.
 */
function NoteCard({
  note,
  busy,
  onToggle,
  onRemove,
}: {
  note: PersonaStyleNoteRecord;
  busy: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <article
      className={cn(
        'rounded-xl border px-3 py-2.5 transition',
        note.status === 'ACTIVE'
          ? 'border-mist-100/[0.08] bg-ink-950/30'
          : 'border-mist-100/[0.05] bg-ink-950/15 opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="brass">{DIMENSION_LABELS[note.dimension] ?? note.dimension}</Badge>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-mist-600">
              {STATUS_LABELS[note.status] ?? note.status}
            </span>
            <span className="font-mono text-[0.6rem] text-mist-600">把握 {note.confidence}</span>
            {note.evidenceCount > 1 ? (
              <span className="font-mono text-[0.6rem] text-mist-600">×{note.evidenceCount}</span>
            ) : null}
            {note.appliedCount > 0 ? (
              <span className="font-mono text-[0.6rem] text-mist-600">用过 {note.appliedCount}</span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[0.78rem] leading-5 text-mist-200">{note.content}</p>
          {note.samples.length > 0 ? (
            <p className="mt-1 line-clamp-2 text-[0.66rem] leading-4 text-mist-500">
              原句：{note.samples.join(' / ')}
            </p>
          ) : null}
          {note.sources.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {note.sources.slice(0, 3).map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-[16rem] items-center gap-1 truncate text-[0.62rem] text-brass-300/80 hover:text-brass-200"
                  title={source.title || source.url}
                >
                  <ExternalLink className="size-2.5 shrink-0" />
                  <span className="truncate">{source.title || source.url}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={busy || note.status === 'PROMOTED'}
            onClick={onToggle}
            className="rounded-md border border-mist-100/[0.1] bg-ink-950/40 p-1 text-mist-400 transition hover:border-brass-400/30 hover:text-brass-200 disabled:opacity-30"
            aria-label={note.status === 'ACTIVE' ? '暂停这条说话方式' : '重新启用'}
            title={note.status === 'ACTIVE' ? '暂停使用' : '重新启用'}
          >
            {note.status === 'ACTIVE' ? <Pause className="size-3" /> : <Play className="size-3" />}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="rounded-md border border-mist-100/[0.1] bg-ink-950/40 p-1 text-mist-400 transition hover:border-signal-400/30 hover:text-signal-400 disabled:opacity-30"
            aria-label="删除这条说话方式"
            title="删除"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    </article>
  );
}

/** Collapsible learning-run card summarizing sources, memories and style notes. */
function LogCard({
  log,
  open,
  onToggle,
}: {
  log: MindLearningLogRecord;
  open: boolean;
  onToggle: () => void;
}) {
  const failed = log.status === 'FAILED';
  return (
    <article
      className={cn(
        'rounded-xl border px-3 py-2.5 transition',
        failed
          ? 'border-signal-400/20 bg-signal-400/[0.04]'
          : 'border-mist-100/[0.08] bg-ink-950/30',
      )}
    >
      <button type="button" onClick={onToggle} className="block w-full text-left">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="size-3 text-mist-500" />
            <span className="text-[0.76rem] text-mist-200">
              {log.reason || (log.trigger === 'MANUAL' ? '手动学习' : '定时学习')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={failed ? 'signal' : log.status === 'RUNNING' ? 'brass' : 'jade'}>
              {STATUS_LABELS[log.status] ?? log.status}
            </Badge>
            <span className="font-mono text-[0.62rem] text-mist-600">{formatTime(log.startedAt)}</span>
          </div>
        </div>
        <p className="mt-1 text-[0.66rem] text-mist-500">
          {log.sources.length} 个来源 · {log.learned.length} 条记忆 · {log.styleNotes.length} 条表达
          {log.summary ? ` · ${log.summary}` : ''}
        </p>
      </button>
      {open ? (
        <div className="mt-2 space-y-2 border-t border-mist-100/[0.06] pt-2">
          {log.error ? (
            <p className="text-[0.68rem] text-signal-300">失败原因：{log.error}</p>
          ) : null}
          {log.sources.length > 0 ? (
            <ItemList
              title="看过"
              items={log.sources.map((source) => ({
                kind: source.kind ?? 'web',
                content: source.title || source.url,
                sourceUrl: source.url,
              }))}
            />
          ) : null}
          {log.learned.length > 0 ? <ItemList title="记住" items={log.learned} /> : null}
          {log.styleNotes.length > 0 ? <ItemList title="表达" items={log.styleNotes} /> : null}
        </div>
      ) : null}
    </article>
  );
}

/** Short list of learned items with optional source links. */
function ItemList({ title, items }: { title: string; items: MindLearningItemRecord[] }) {
  return (
    <div>
      <p className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-mist-600">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item, index) => (
          <li key={`${item.content}-${index}`} className="text-[0.68rem] leading-4 text-mist-400">
            <span className="mr-1 font-mono text-[0.58rem] text-mist-600">{item.kind}</span>
            {item.sourceUrl ? (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-mist-600/40 underline-offset-2 hover:text-brass-200"
              >
                {item.content}
              </a>
            ) : (
              item.content
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tiny tone-colored pill used for learning statuses and counters. */
function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'brass' | 'jade' | 'signal' | 'muted';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.08em]',
        tone === 'brass' && 'border-brass-400/25 bg-brass-400/10 text-brass-200',
        tone === 'jade' && 'border-jade-400/25 bg-jade-400/10 text-jade-300',
        tone === 'signal' && 'border-signal-400/25 bg-signal-400/10 text-signal-300',
        tone === 'muted' && 'border-mist-100/[0.08] bg-ink-950/30 text-mist-500',
      )}
    >
      {children}
    </span>
  );
}

