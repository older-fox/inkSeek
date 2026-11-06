import type {
  AgentTodoRecord,
  PersonaJournalRecord,
  PersonaMemoryKind,
  PersonaMemoryRecord,
  PersonaMemoryVisibility,
  StickerRecord,
} from '@inkseek/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Plus, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DropdownSelect } from '@/components/dropdown-select';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  MEMORY_KINDS,
  MEMORY_KIND_LABELS,
  VISIBILITIES,
  VISIBILITY_LABELS,
  formatTime,
  stickerUrl,
} from './mind-format';
import { EmptyState, LazyList, MindDrawer, MindSection } from './mind-ui';

export function MindMemoriesTab({ personaId }: { personaId: string }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<PersonaMemoryKind>('FACT');
  const [visibility, setVisibility] = useState<PersonaMemoryVisibility>('SCENE');

  const memoriesQuery = useQuery({
    queryKey: ['mind', 'memories', personaId, query.trim()],
    queryFn: () =>
      api.mindMemories({
        personaId,
        query: query.trim() || undefined,
        limit: 80,
        offset: 0,
      }),
    enabled: Boolean(personaId),
    staleTime: 4_000,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createMindMemory({
        personaId,
        content: draft.trim(),
        kind,
        scope: kind === 'EPISODE' ? 'SCENE' : 'RELATION',
        subjectType: 'SELF',
        visibility,
        sourceType: 'ADMIN',
      }),
    onSuccess: () => {
      setDraft('');
      setComposeOpen(false);
      toast.success('记忆已写入');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '写入失败'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteMindMemory(id),
    onSuccess: () => {
      toast.success('已遗忘');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
  });

  const rows = memoriesQuery.data ?? [];

  return (
    <>
      <MindSection
        title={`Memories · ${rows.length}`}
        count={query.trim() ? '搜索结果' : '最近 80 条'}
      >
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-mist-100/[0.1] bg-ink-950/40 px-2.5">
            <Search className="size-3.5 text-mist-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="按语义搜索记忆，例如「B 考试」「群里的冲突」"
              className="h-9 flex-1 bg-transparent text-[0.78rem] text-mist-200 outline-none placeholder:text-mist-600"
            />
          </div>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brass-400/30 bg-brass-400/10 px-3 text-[0.72rem] text-brass-200 transition hover:bg-brass-400/20"
          >
            <Plus className="size-3.5" />
            写入
          </button>
        </div>
        {memoriesQuery.isPending ? (
          <div className="grid place-items-center py-12">
            <LoaderCircle className="size-5 animate-spin text-brass-300" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState compact text={query.trim() ? '没有匹配的记忆。' : '还没有记忆。'} />
        ) : (
          <div className="mt-3 space-y-1.5">
            <LazyList
              items={rows}
              step={30}
              renderItem={(memory) => (
                <div
                  key={memory.id}
                  className="rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full border border-jade-400/20 px-1.5 py-0.5 font-mono text-[0.62rem] text-jade-300">
                      {MEMORY_KIND_LABELS[memory.kind]}
                    </span>
                    <span className="rounded-full border border-mist-100/[0.08] px-1.5 py-0.5 font-mono text-[0.62rem] text-mist-500">
                      {VISIBILITY_LABELS[memory.visibility]}
                    </span>
                    <span className="font-mono text-[0.62rem] text-mist-600">
                      {formatTime(memory.occurredAt)} · 重要度 {memory.importance}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove.mutate(memory.id)}
                      className="ml-auto rounded p-1 text-mist-600 hover:bg-signal-400/10 hover:text-signal-400"
                      aria-label="遗忘这条记忆"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                  <p className="mt-1.5 text-[0.78rem] leading-5 text-mist-300">{memory.content}</p>
                  <p className="mt-1 font-mono text-[0.62rem] text-mist-600">
                    {memory.subjectName || memory.subjectType} · 置信度 {memory.confidence} · 回忆{' '}
                    {memory.recallCount}
                  </p>
                </div>
              )}
            />
          </div>
        )}
      </MindSection>

      <MindDrawer
        open={composeOpen}
        title="写入记忆"
        subtitle="会影响未来判断的一条长期信息"
        onClose={() => setComposeOpen(false)}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={6}
          placeholder="比如：B 不喜欢被吊着。"
          className="wizard-textarea min-h-36"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <DropdownSelect
            value={kind}
            options={MEMORY_KINDS.map((item) => ({ value: item, label: MEMORY_KIND_LABELS[item] }))}
            onChange={(value) => setKind(value as PersonaMemoryKind)}
            ariaLabel="记忆类型"
            showValue={false}
          />
          <DropdownSelect
            value={visibility}
            options={VISIBILITIES.map((item) => ({ value: item, label: VISIBILITY_LABELS[item] }))}
            onChange={(value) => setVisibility(value as PersonaMemoryVisibility)}
            ariaLabel="记忆可见范围"
            showValue={false}
          />
        </div>
        <button
          type="button"
          disabled={!draft.trim() || create.isPending}
          onClick={() => create.mutate()}
          className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-brass-400/25 bg-brass-400/10 text-[0.76rem] text-brass-200 hover:bg-brass-400/20 disabled:opacity-40"
        >
          {create.isPending ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          写入记忆
        </button>
        <p className="mt-2 text-[0.66rem] leading-4 text-mist-600">
          PRIVATE 记忆只能作为内心判断，不会在群里被说出。SCENE 只在学到的会话里可用。
        </p>
      </MindDrawer>
    </>
  );
}

export function MindGrowthTab({ personaId }: { personaId: string }) {
  const knowledgeQuery = useQuery({
    queryKey: ['mind', 'memories', personaId, 'growth', 'world'],
    queryFn: () => api.mindMemories({ personaId, sourceType: 'WEB', limit: 100, offset: 0 }),
    enabled: Boolean(personaId),
    staleTime: 8_000,
  });
  const reflectionQuery = useQuery({
    queryKey: ['mind', 'memories', personaId, 'growth', 'self'],
    queryFn: () => api.mindMemories({ personaId, kind: 'REFLECTION', limit: 100, offset: 0 }),
    enabled: Boolean(personaId),
    staleTime: 8_000,
  });
  const knowledge = knowledgeQuery.data ?? [];
  const reflections = reflectionQuery.data ?? [];

  if (knowledgeQuery.isPending || reflectionQuery.isPending) {
    return (
      <div className="grid place-items-center py-16">
        <LoaderCircle className="size-5 animate-spin text-brass-300" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-jade-400/15 bg-jade-400/[0.04] px-3 py-2.5">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-jade-300/80">
            World Knowledge
          </p>
          <p className="mt-1 text-lg text-mist-100">{knowledge.length}</p>
          <p className="text-[0.66rem] text-mist-600">从网页读到、并留下来的内容</p>
        </div>
        <div className="rounded-xl border border-brass-400/15 bg-brass-400/[0.04] px-3 py-2.5">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-brass-300/80">
            Reflections
          </p>
          <p className="mt-1 text-lg text-mist-100">{reflections.length}</p>
          <p className="text-[0.66rem] text-mist-600">它对自己的看法和改变</p>
        </div>
      </div>

      <MindSection title={`World · ${knowledge.length}`} count="看过的世界">
        {knowledge.length === 0 ? (
          <EmptyState compact text="还没有从网页吸收的内容。等 TA 在空闲时自己去看点什么。" />
        ) : (
          <div className="mt-2 space-y-1.5">
            <LazyList
              items={knowledge}
              step={20}
              renderItem={(memory) => <GrowthCard key={memory.id} memory={memory} />}
            />
          </div>
        )}
      </MindSection>

      <MindSection title={`Self · ${reflections.length}`} count="缓慢发生的变化">
        {reflections.length === 0 ? (
          <EmptyState compact text="还没有自我反思。到点后 TA 会回看最近的经历。" />
        ) : (
          <div className="mt-2 space-y-1.5">
            <LazyList
              items={reflections}
              step={20}
              renderItem={(memory) => <GrowthCard key={memory.id} memory={memory} />}
            />
          </div>
        )}
      </MindSection>
    </div>
  );
}

function GrowthCard({ memory }: { memory: PersonaMemoryRecord }) {
  const source = memorySourceUrl(memory);
  return (
    <div className="rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-brass-400/20 px-1.5 py-0.5 font-mono text-[0.62rem] text-brass-300">
          {MEMORY_KIND_LABELS[memory.kind]}
        </span>
        <span className="font-mono text-[0.62rem] text-mist-600">
          {formatTime(memory.occurredAt)} · 置信度 {memory.confidence}
        </span>
      </div>
      <p className="mt-1.5 text-[0.78rem] leading-5 text-mist-300">{memory.content}</p>
      {source ? (
        <a
          href={source}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block truncate font-mono text-[0.62rem] text-jade-300/80 underline decoration-jade-400/30 hover:text-jade-200"
        >
          {sourceHost(source)}
        </a>
      ) : null}
    </div>
  );
}

function memorySourceUrl(memory: PersonaMemoryRecord): string {
  const structured = memory.structured;
  if (!structured || typeof structured !== 'object' || Array.isArray(structured)) {
    return '';
  }
  const url = (structured as Record<string, unknown>)['sourceUrl'];
  return typeof url === 'string' ? url : '';
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const INTENTION_NEED_LABELS: Record<string, string> = {
  care: '关心',
  connect: '想联系',
  share: '分享',
  followup: '跟进',
  play: '邀约',
  learn: '想了解',
};

export function MindPlansTab({
  personaId,
  proactiveEnabled,
}: {
  personaId: string;
  proactiveEnabled: boolean;
}) {
  const queryClient = useQueryClient();
  const todosQuery = useQuery({
    queryKey: ['mind', 'todos', personaId],
    queryFn: () => api.mindTodos(personaId),
    enabled: Boolean(personaId),
    staleTime: 5_000,
  });
  const intentionsQuery = useQuery({
    queryKey: ['mind', 'intentions', personaId],
    queryFn: () => api.mindIntentions(personaId),
    enabled: Boolean(personaId),
    staleTime: 5_000,
  });
  const complete = useMutation({
    mutationFn: (id: string) => api.updateMindTodo(id, { status: 'DONE' }),
    onSuccess: () => {
      toast.success('待办已完成');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
  });
  const heartbeat = useMutation({
    mutationFn: () => api.mindHeartbeat(personaId),
    onSuccess: () => toast.success('已安排一次心跳'),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '唤醒失败'),
  });

  const todos: AgentTodoRecord[] = todosQuery.data ?? [];
  const intentions = intentionsQuery.data ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <MindSection title={`Todos · ${todos.length}`}>
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={() => heartbeat.mutate()}
            disabled={heartbeat.isPending}
            className="flex items-center gap-1 rounded-full border border-mist-100/[0.1] px-2 py-0.5 text-[0.66rem] text-mist-400 hover:border-brass-400/30 hover:text-brass-200 disabled:opacity-40"
          >
            <RefreshCw className={cn('size-2.5', heartbeat.isPending && 'animate-spin')} />
            立即唤醒
          </button>
        </div>
        <div className="mt-2 space-y-1.5">
          {todosQuery.isPending ? (
            <div className="grid place-items-center py-10">
              <LoaderCircle className="size-5 animate-spin text-brass-300" />
            </div>
          ) : todos.length === 0 ? (
            <EmptyState compact text="没有待办。人格会在对话里自己创建。" />
          ) : (
            todos.map((todo) => (
              <div
                key={todo.id}
                className="rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[0.78rem] text-mist-200">{todo.title}</p>
                    <p className="mt-0.5 font-mono text-[0.62rem] text-mist-600">
                      {todo.status} · 优先级 {todo.priority}
                      {todo.dueAt ? ` · ${formatTime(todo.dueAt)}` : ''}
                    </p>
                  </div>
                  {todo.status !== 'DONE' ? (
                    <button
                      type="button"
                      onClick={() => complete.mutate(todo.id)}
                      className="rounded border border-jade-400/20 px-1.5 py-0.5 text-[0.64rem] text-jade-300 hover:bg-jade-400/10"
                    >
                      完成
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </MindSection>

      <MindSection title={`Intentions · ${intentions.length}`}>
        {!proactiveEnabled ? (
          <p className="mt-2 rounded-lg border border-signal-400/20 bg-signal-400/[0.05] px-2.5 py-2 text-[0.66rem] leading-4 text-signal-400">
            主动消息当前关闭。TA 会记录想做的事，但不会自己发出去。
          </p>
        ) : null}
        <div className="mt-2 space-y-1.5">
          {intentionsQuery.isPending ? (
            <div className="grid place-items-center py-10">
              <LoaderCircle className="size-5 animate-spin text-brass-300" />
            </div>
          ) : intentions.length === 0 ? (
            <EmptyState compact text="没有主动意图。" />
          ) : (
            intentions.map((intention) => (
              <div
                key={intention.id}
                className="rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.76rem] text-mist-200">
                    {intention.reason || '想找 TA 说话'}
                  </span>
                  <span className="font-mono text-[0.62rem] text-mist-600">{intention.status}</span>
                </div>
                <p className="mt-0.5 text-[0.66rem] leading-4 text-mist-500">{intention.seed}</p>
                <p className="mt-1 font-mono text-[0.62rem] text-mist-600">
                  {intention.need
                    ? `${INTENTION_NEED_LABELS[intention.need] ?? intention.need} · `
                    : ''}
                  紧急 {intention.urgency} · 把握 {intention.confidence} · 风险 {intention.risk} ·
                  尝试 {intention.attempts}
                </p>
                {intention.feedback ? (
                  <p className="mt-1 text-[0.62rem] leading-4 text-jade-300/80">
                    反馈：{intention.feedback}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </MindSection>
    </div>
  );
}

export function MindJournalTab({ personaId }: { personaId: string }) {
  const queryClient = useQueryClient();
  const journalQuery = useQuery({
    queryKey: ['mind', 'journal', personaId],
    queryFn: () => api.mindJournal(personaId, 60),
    enabled: Boolean(personaId),
    staleTime: 10_000,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteMindJournal(id),
    onSuccess: () => {
      toast.success('日记已删除');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : '删除失败'),
  });
  const journal: PersonaJournalRecord[] = journalQuery.data ?? [];

  if (journalQuery.isPending) {
    return (
      <div className="grid place-items-center py-16">
        <LoaderCircle className="size-5 animate-spin text-brass-300" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {journal.length === 0 ? (
        <EmptyState text="还没有日记。心跳整理记忆后会写一段第一人称日记。" />
      ) : (
        <LazyList
          items={journal}
          step={8}
          renderItem={(entry) => (
            <article
              key={entry.id}
              className="rounded-2xl border border-mist-100/[0.07] bg-ink-900/30 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[0.66rem] uppercase tracking-[0.16em] text-brass-300">
                  {entry.date}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[0.66rem] text-mist-600">{entry.mood}</span>
                  <button
                    type="button"
                    onClick={() => remove.mutate(entry.id)}
                    disabled={remove.isPending}
                    className="rounded p-1 text-mist-600 transition hover:bg-signal-400/10 hover:text-signal-400 disabled:opacity-40"
                    aria-label="删除这篇日记"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-line text-[0.82rem] leading-6 text-mist-300">
                {entry.content}
              </p>
            </article>
          )}
        />
      )}
    </div>
  );
}

export function MindStickersTab() {
  const stickersQuery = useQuery({
    queryKey: ['mind', 'stickers'],
    queryFn: api.mindStickers,
    staleTime: 30_000,
  });
  const stickers: StickerRecord[] = stickersQuery.data ?? [];

  if (stickersQuery.isPending) {
    return (
      <div className="grid place-items-center py-16">
        <LoaderCircle className="size-5 animate-spin text-brass-300" />
      </div>
    );
  }

  return (
    <MindSection title={`Sticker Library · ${stickers.length}`} count="TA 自己收藏">
      <p className="mt-1 text-[0.7rem] text-mist-500">
        只显示 TA 自己收藏进表情库的图片，按描述和标签做向量检索。
      </p>
      {stickers.length === 0 ? (
        <EmptyState compact text="表情库为空。等 TA 在聊天里收藏表情后会出现在这里。" />
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          <LazyList
            items={stickers}
            step={32}
            sentinelClassName="col-span-full"
            renderItem={(sticker) => (
              <div
                key={sticker.id}
                className="overflow-hidden rounded-xl border border-mist-100/[0.08] bg-ink-950/30"
              >
                <img
                  src={stickerUrl(sticker.filePath)}
                  alt={sticker.description || sticker.tags.join(' ')}
                  className="aspect-square w-full object-contain"
                  loading="lazy"
                />
                <p className="truncate px-1.5 py-1 font-mono text-[0.62rem] text-mist-600">
                  {sticker.description || sticker.tags.join(' / ') || '未标注'}
                </p>
              </div>
            )}
          />
        </div>
      )}
    </MindSection>
  );
}
