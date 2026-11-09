import type { PersonaGroupStanceRecord, PersonaRelationshipRecord } from '@inkseek/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  RELATION_DIMENSIONS,
  STATE_FIELD_LABELS,
  STATE_SOURCE_LABELS,
  STANCE_DIMENSIONS,
  extrasRecord,
  formatStateValue,
  formatTime,
  listText,
  relationDraftOf,
  relationInputFromDraft,
  stanceDraftOf,
  type RelationDraft,
  type StanceDraft,
} from './mind-format';
import {
  EmptyState,
  LazyList,
  MindDrawer,
  MindSection,
  RangeField,
  TextAreaField,
  TextField,
  ToggleRow,
} from './mind-ui';

/**
 * Searchable list of per-contact relationships; selecting one opens the
 * editor drawer together with its recent change trail.
 */
export function MindRelationsTab({ personaId }: { personaId: string }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const relationshipsQuery = useQuery({
    queryKey: ['mind', 'relationships', personaId],
    queryFn: () => api.mindRelationships(personaId),
    enabled: Boolean(personaId),
    staleTime: 5_000,
  });
  const relationships = relationshipsQuery.data ?? [];
  const keyword = query.trim().toLowerCase();
  const filtered = relationships.filter((relationship) =>
    keyword
      ? [relationship.nickname, relationship.externalId, relationship.contactId]
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      : true,
  );
  const selected = relationships.find((relationship) => relationship.id === selectedId) ?? null;

  const update = useMutation({
    mutationFn: ({ contactId, draft }: { contactId: string; draft: RelationDraft }) =>
      api.updateMindRelationship(personaId, relationInputFromDraft(contactId, draft)),
    onSuccess: () => {
      toast.success('关系已更新');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '更新失败'),
  });

  return (
    <>
      <MindSection title={`Relationships · ${relationships.length}`} count="只显示已有关系">
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-mist-100/[0.1] bg-ink-950/40 px-2.5">
          <Search className="size-3.5 text-mist-600" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索昵称、QQ 或 ID"
            className="h-9 flex-1 bg-transparent text-[0.78rem] text-mist-200 outline-none placeholder:text-mist-600"
          />
        </div>
        {relationshipsQuery.isPending ? (
          <div className="grid place-items-center py-12">
            <LoaderCircle className="size-5 animate-spin text-brass-300" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            text={
              relationships.length === 0
                ? '还没有关系记录。在对话里和 TA 互动，或点开联系人头像后编辑。'
                : '没有匹配的人。'
            }
          />
        ) : (
          <div className="mt-2 space-y-1.5">
            <LazyList
              items={filtered}
              step={24}
              renderItem={(relationship) => (
                <button
                  key={relationship.id}
                  type="button"
                  onClick={() => setSelectedId(relationship.id)}
                  className="w-full rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2 text-left transition hover:border-brass-400/30 hover:bg-brass-400/[0.04]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[0.8rem] text-mist-200">
                      {relationship.nickname}
                    </span>
                    <span className="font-mono text-[0.66rem] text-mist-600">
                      {relationship.externalId}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[0.66rem] text-mist-500">
                    <span>好感 {relationship.affinity}</span>
                    <span>信任 {relationship.trust}</span>
                    <span>敌意 {relationship.hostility}</span>
                    <span>亏欠 {relationship.obligation}</span>
                    <span className="ml-auto text-mist-600">
                      {formatTime(relationship.updatedAt)}
                    </span>
                  </div>
                </button>
              )}
            />
          </div>
        )}
      </MindSection>

      <MindDrawer
        open={Boolean(selected)}
        title={selected?.nickname ?? '关系详情'}
        subtitle={selected ? `${selected.externalId} · ${selected.contactId}` : undefined}
        onClose={() => setSelectedId('')}
        widthClassName="sm:max-w-[42rem]"
      >
        {selected ? (
          <>
            <RelationEditor
              key={`${selected.id}-${selected.updatedAt}`}
              record={selected}
              saving={update.isPending}
              onSave={(draft) => update.mutate({ contactId: selected.contactId, draft })}
            />
            <RelationshipChangeList personaId={personaId} contactId={selected.contactId} />
          </>
        ) : null}
      </MindDrawer>
    </>
  );
}

const RELATIONSHIP_CHANGE_LIMIT = 12;

/** Recent relation-field changes for one contact, newest first. */
export function RelationshipChangeList({
  personaId,
  contactId,
}: {
  personaId: string;
  contactId: string;
}) {
  const changesQuery = useQuery({
    queryKey: ['mind', 'changes', personaId, 'RELATION', contactId],
    queryFn: () =>
      api.mindChanges(personaId, {
        scope: 'RELATION',
        targetId: contactId,
        limit: RELATIONSHIP_CHANGE_LIMIT,
        offset: 0,
      }),
    enabled: Boolean(personaId && contactId),
    staleTime: 5_000,
  });
  const changes = changesQuery.data ?? [];

  return (
    <div className="mt-5 border-t border-mist-100/[0.06] pt-4">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-mist-600">最近变动</p>
      {changesQuery.isPending ? (
        <div className="grid place-items-center py-4">
          <LoaderCircle className="size-4 animate-spin text-brass-300" />
        </div>
      ) : changes.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-mist-100/[0.1] px-3 py-3 text-center text-[0.68rem] text-mist-600">
          还没有变动记录。
        </p>
      ) : (
        <div className="mt-2 space-y-1">
          {changes.map((change) => (
            <div
              key={change.id}
              className="rounded-lg border border-mist-100/[0.06] bg-ink-950/25 px-2.5 py-1.5"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.68rem]">
                <span className="font-mono text-mist-600">{formatTime(change.createdAt)}</span>
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
              </div>
              <p className="mt-1 text-[0.68rem] leading-5 break-words text-mist-500">
                {change.reason || STATE_SOURCE_LABELS[change.source] || change.source}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Full relationship form: dimension sliders, free-text lists and extras JSON,
 * saved back through the parent mutation.
 */
export function RelationEditor({
  record,
  saving,
  onSave,
}: {
  record: PersonaRelationshipRecord;
  saving: boolean;
  onSave: (draft: RelationDraft) => void;
}) {
  const [draft, setDraft] = useState<RelationDraft>(() => relationDraftOf(record));

  return (
    <div>
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {RELATION_DIMENSIONS.map((dimension) => (
          <RangeField
            key={dimension.key}
            label={dimension.label}
            value={draft[dimension.key]}
            min={-100}
            max={100}
            onChange={(value) => setDraft((current) => ({ ...current, [dimension.key]: value }))}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <TextField
          label="关系标签"
          hint="用逗号分隔，例如：朋友、同事"
          value={draft.relationTags}
          onChange={(relationTags) => setDraft((current) => ({ ...current, relationTags }))}
        />
        <TextField
          label="可公开范围"
          hint="SCENE / CHANNEL / PUBLIC / PRIVATE"
          value={draft.disclosureScope}
          onChange={(disclosureScope) => setDraft((current) => ({ ...current, disclosureScope }))}
        />
        <TextAreaField
          label="各场合称呼"
          hint="一行一处，例如：私聊：周叙"
          value={draft.addressHere}
          onChange={(addressHere) => setDraft((current) => ({ ...current, addressHere }))}
        />
        <TextAreaField
          label="公开面具"
          hint="在别人面前表现出的态度"
          value={draft.publicMask}
          onChange={(publicMask) => setDraft((current) => ({ ...current, publicMask }))}
        />
        <TextAreaField
          label="边界"
          hint="一行一条，只能加严"
          value={draft.boundaries}
          onChange={(boundaries) => setDraft((current) => ({ ...current, boundaries }))}
        />
        <TextAreaField
          label="承诺清单"
          hint="一行一条，未兑现的承诺"
          value={draft.openPromises}
          onChange={(openPromises) => setDraft((current) => ({ ...current, openPromises }))}
        />
        <TextAreaField
          label="共同经历"
          hint="一行一条，可被回忆引用"
          value={draft.sharedEvents}
          onChange={(sharedEvents) => setDraft((current) => ({ ...current, sharedEvents }))}
        />
        <TextField
          label="静默截止"
          hint="ISO 时间，留空表示不静默"
          value={draft.mutedUntil}
          onChange={(mutedUntil) => setDraft((current) => ({ ...current, mutedUntil }))}
        />
        <div className="sm:col-span-2">
          <TextAreaField
            label="扩展档案（JSON）"
            hint="安全词、对象档案、已拒行为等旧字段都保存在这里。"
            value={draft.extrasText}
            onChange={(extrasText) => setDraft((current) => ({ ...current, extrasText }))}
          />
        </div>
      </div>
      <div className="mt-3">
        <ToggleRow
          label="拉黑"
          hint="彻底拒绝交流；仍会读取关系数值"
          checked={draft.blocked}
          onChange={(blocked) => setDraft((current) => ({ ...current, blocked }))}
        />
      </div>
      <button
        type="button"
        onClick={() => onSave(draft)}
        disabled={saving}
        className="mt-4 h-9 w-full rounded-lg border border-brass-400/25 bg-brass-400/10 text-[0.78rem] text-brass-200 transition hover:bg-brass-400/20 disabled:opacity-40"
      >
        {saving ? '保存中…' : '保存关系'}
      </button>
    </div>
  );
}

/**
 * Searchable list of per-group stances; selecting one opens the stance editor.
 */
export function MindGroupsTab({ personaId }: { personaId: string }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const stancesQuery = useQuery({
    queryKey: ['mind', 'group-stances', personaId],
    queryFn: () => api.mindGroupStances(personaId),
    enabled: Boolean(personaId),
    staleTime: 5_000,
  });
  const stances = stancesQuery.data ?? [];
  const keyword = query.trim().toLowerCase();
  const filtered = stances.filter((stance) =>
    keyword
      ? [stance.name, stance.externalId, stance.conversationId]
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      : true,
  );
  const selected = stances.find((stance) => stance.id === selectedId) ?? null;

  const update = useMutation({
    mutationFn: ({ conversationId, draft }: { conversationId: string; draft: StanceDraft }) =>
      api.updateMindGroupStance(personaId, {
        conversationId,
        comfort: draft.comfort,
        belonging: draft.belonging,
        attention: draft.attention,
        formality: draft.formality,
        speakRate: draft.speakRate,
        audienceRisk: draft.audienceRisk,
        role: draft.role,
        narrative: draft.narrative,
        sceneRules: draft.sceneRules,
        topic: draft.topic,
        phase: draft.phase,
        mentionOnly: draft.mentionOnly,
        boundaries: listText(draft.boundaries),
        tabooTopics: listText(draft.tabooTopics),
        extras: {
          ...extrasRecord(selected?.extras),
          scene_type: draft.sceneType,
          focus: draft.focus,
          explicit_cap: draft.explicitCap,
        },
      }),
    onSuccess: () => {
      toast.success('群态度已更新');
      void queryClient.invalidateQueries({ queryKey: ['mind'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '更新失败'),
  });

  return (
    <>
      <MindSection title={`Groups · ${stances.length}`} count="只显示已有群态度">
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-mist-100/[0.1] bg-ink-950/40 px-2.5">
          <Search className="size-3.5 text-mist-600" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索群名、群号或 ID"
            className="h-9 flex-1 bg-transparent text-[0.78rem] text-mist-200 outline-none placeholder:text-mist-600"
          />
        </div>
        {stancesQuery.isPending ? (
          <div className="grid place-items-center py-12">
            <LoaderCircle className="size-5 animate-spin text-brass-300" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            text={
              stances.length === 0
                ? '还没有群态度。在群聊里互动，或点开群头像后编辑。'
                : '没有匹配的群。'
            }
          />
        ) : (
          <div className="mt-2 space-y-1.5">
            <LazyList
              items={filtered}
              step={24}
              renderItem={(stance) => (
                <button
                  key={stance.id}
                  type="button"
                  onClick={() => setSelectedId(stance.id)}
                  className="w-full rounded-xl border border-mist-100/[0.06] bg-ink-950/25 px-3 py-2 text-left transition hover:border-brass-400/30 hover:bg-brass-400/[0.04]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[0.8rem] text-mist-200">{stance.name}</span>
                    <span className="font-mono text-[0.66rem] text-mist-600">
                      {stance.externalId}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[0.66rem] text-mist-500">
                    <span>自在 {stance.comfort}</span>
                    <span>归属 {stance.belonging}</span>
                    <span>关注 {stance.attention}</span>
                    <span>主动 {stance.speakRate}</span>
                    <span>{stance.mentionOnly ? '仅@回' : '自由发言'}</span>
                    <span className="ml-auto text-mist-600">{formatTime(stance.updatedAt)}</span>
                  </div>
                </button>
              )}
            />
          </div>
        )}
      </MindSection>

      <MindDrawer
        open={Boolean(selected)}
        title={selected?.name ?? '群态度详情'}
        subtitle={selected ? `${selected.externalId} · ${selected.conversationId}` : undefined}
        onClose={() => setSelectedId('')}
        widthClassName="sm:max-w-[42rem]"
      >
        {selected ? (
          <StanceEditor
            key={`${selected.id}-${selected.updatedAt}`}
            record={selected}
            saving={update.isPending}
            onSave={(draft) => update.mutate({ conversationId: selected.conversationId, draft })}
          />
        ) : null}
      </MindDrawer>
    </>
  );
}

/**
 * Group stance form: dimension sliders, scene fields, taboos and the
 * mention-only switch.
 */
function StanceEditor({
  record,
  saving,
  onSave,
}: {
  record: PersonaGroupStanceRecord;
  saving: boolean;
  onSave: (draft: StanceDraft) => void;
}) {
  const [draft, setDraft] = useState<StanceDraft>(() => stanceDraftOf(record));
  return (
    <div>
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {STANCE_DIMENSIONS.map((dimension) => (
          <RangeField
            key={dimension.key}
            label={dimension.label}
            value={draft[dimension.key]}
            min={0}
            max={100}
            onChange={(value) => setDraft((current) => ({ ...current, [dimension.key]: value }))}
          />
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <TextField
          label="群内角色"
          value={draft.role}
          onChange={(role) => setDraft((current) => ({ ...current, role }))}
        />
        <TextField
          label="当前话题"
          value={draft.topic}
          onChange={(topic) => setDraft((current) => ({ ...current, topic }))}
        />
        <TextField
          label="场景阶段"
          value={draft.phase}
          onChange={(phase) => setDraft((current) => ({ ...current, phase }))}
        />
        <TextField
          label="群规"
          value={draft.sceneRules}
          onChange={(sceneRules) => setDraft((current) => ({ ...current, sceneRules }))}
        />
        <TextField
          label="场合类型"
          value={draft.sceneType}
          onChange={(sceneType) => setDraft((current) => ({ ...current, sceneType }))}
        />
        <TextField
          label="是否指向我"
          hint="被 @、被回复、点名，还是旁观"
          value={draft.focus}
          onChange={(focus) => setDraft((current) => ({ ...current, focus }))}
        />
        <TextField
          label="尺度硬上限"
          hint="群聊通常为 none，不交模型裁量"
          value={draft.explicitCap}
          onChange={(explicitCap) => setDraft((current) => ({ ...current, explicitCap }))}
        />
        <TextAreaField
          label="本群边界"
          hint="一行一条，只能加严"
          value={draft.boundaries}
          onChange={(boundaries) => setDraft((current) => ({ ...current, boundaries }))}
        />
        <TextAreaField
          label="禁忌话题"
          hint="一行一条"
          value={draft.tabooTopics}
          onChange={(tabooTopics) => setDraft((current) => ({ ...current, tabooTopics }))}
        />
        <label className="sm:col-span-2">
          <span className="text-[0.72rem] text-mist-500">一句总纲</span>
          <textarea
            value={draft.narrative}
            onChange={(event) =>
              setDraft((current) => ({ ...current, narrative: event.target.value }))
            }
            rows={2}
            className="wizard-textarea mt-1 min-h-16"
          />
        </label>
      </div>
      <div className="mt-3">
        <ToggleRow
          label="仅被@才回"
          hint="开启后，没有点名就不主动说话"
          checked={draft.mentionOnly}
          onChange={(mentionOnly) => setDraft((current) => ({ ...current, mentionOnly }))}
        />
      </div>
      <button
        type="button"
        onClick={() => onSave(draft)}
        disabled={saving}
        className="mt-4 h-9 w-full rounded-lg border border-brass-400/25 bg-brass-400/10 text-[0.78rem] text-brass-200 transition hover:bg-brass-400/20 disabled:opacity-40"
      >
        {saving ? '保存中…' : '保存群态度'}
      </button>
    </div>
  );
}
