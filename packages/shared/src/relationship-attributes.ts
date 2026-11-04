import type { PersonaRelationshipRecord, PersonaRelationshipUpdateInput } from './mind.js';

export const RELATIONSHIP_NUMERIC_FIELDS = [
  'affinity',
  'trust',
  'intimacy',
  'attraction',
  'hostility',
  'fear',
  'respect',
  'obligation',
  'dependency',
  'possessiveness',
  'friction',
  'unresolvedConflict',
  'familiarity',
] as const;

export type RelationshipNumericField = (typeof RELATIONSHIP_NUMERIC_FIELDS)[number];

export type RelationshipAttributeGroupId = 'numbers' | 'behavior' | 'boundaries' | 'profile';

export type RelationshipAttributeKind =
  'score' | 'tags' | 'list' | 'text' | 'paragraph' | 'boolean';

export interface RelationshipAttributeGroup {
  id: RelationshipAttributeGroupId;
  label: string;
}

export const RELATIONSHIP_ATTRIBUTE_GROUPS: readonly RelationshipAttributeGroup[] = [
  { id: 'numbers', label: '关系数值' },
  { id: 'behavior', label: '关系描述' },
  { id: 'boundaries', label: '边界与同意' },
  { id: 'profile', label: '对象档案' },
];

type RelationshipFieldKey =
  | 'relationTags'
  | 'addressHere'
  | 'openPromises'
  | 'sharedEvents'
  | 'disclosureScope'
  | 'blocked'
  | 'mutedUntil';

type RelationshipAttributeStorage =
  | { type: 'numeric'; field: RelationshipNumericField; min: number; max: number }
  | { type: 'field'; field: RelationshipFieldKey }
  | { type: 'extra'; key: string };

export interface RelationshipAttributeMeta {
  key: string;
  label: string;
  group: RelationshipAttributeGroupId;
  kind: RelationshipAttributeKind;
  storage: RelationshipAttributeStorage;
}

/**
 * Flat 37-attribute view used by the private-persona editor. Numeric scores
 * map to first-class columns; everything else either has its own column or
 * lives under `PersonaRelationship.extras`.
 */
export const RELATIONSHIP_ATTRIBUTES: readonly RelationshipAttributeMeta[] = [
  {
    key: 'affinity',
    label: '好感',
    group: 'numbers',
    kind: 'score',
    storage: { type: 'numeric', field: 'affinity', min: -100, max: 100 },
  },
  {
    key: 'trust',
    label: '信任度',
    group: 'numbers',
    kind: 'score',
    storage: { type: 'numeric', field: 'trust', min: -100, max: 100 },
  },
  {
    key: 'intimacy',
    label: '亲密程度',
    group: 'numbers',
    kind: 'score',
    storage: { type: 'numeric', field: 'intimacy', min: -100, max: 100 },
  },
  {
    key: 'dependency',
    label: '依赖',
    group: 'numbers',
    kind: 'score',
    storage: { type: 'numeric', field: 'dependency', min: -100, max: 100 },
  },
  {
    key: 'hostility',
    label: '仇恨值',
    group: 'numbers',
    kind: 'score',
    storage: { type: 'numeric', field: 'hostility', min: -100, max: 100 },
  },
  {
    key: 'possessiveness_obj',
    label: '占有欲',
    group: 'numbers',
    kind: 'score',
    storage: { type: 'numeric', field: 'possessiveness', min: -100, max: 100 },
  },
  {
    key: 'respect',
    label: '尊重度',
    group: 'numbers',
    kind: 'score',
    storage: { type: 'numeric', field: 'respect', min: -100, max: 100 },
  },
  {
    key: 'fear',
    label: '畏惧顾虑',
    group: 'numbers',
    kind: 'score',
    storage: { type: 'numeric', field: 'fear', min: -100, max: 100 },
  },
  {
    key: 'friction',
    label: '沟通成本',
    group: 'numbers',
    kind: 'score',
    storage: { type: 'numeric', field: 'friction', min: -100, max: 100 },
  },
  {
    key: 'unresolved_conflict',
    label: '未解决冲突',
    group: 'numbers',
    kind: 'score',
    storage: { type: 'numeric', field: 'unresolvedConflict', min: -100, max: 100 },
  },
  {
    key: 'relation_tags',
    label: '关系描述',
    group: 'behavior',
    kind: 'tags',
    storage: { type: 'field', field: 'relationTags' },
  },
  {
    key: 'per_obj_shame',
    label: '对该对象的羞耻度',
    group: 'behavior',
    kind: 'score',
    storage: { type: 'extra', key: 'per_obj_shame' },
  },
  {
    key: 'nickname_for_obj',
    label: '私下称呼',
    group: 'behavior',
    kind: 'text',
    storage: { type: 'extra', key: 'nickname_for_obj' },
  },
  {
    key: 'how_i_address_here',
    label: '各场合称呼',
    group: 'behavior',
    kind: 'list',
    storage: { type: 'field', field: 'addressHere' },
  },
  {
    key: 'reply_priority',
    label: '回复优先级',
    group: 'behavior',
    kind: 'score',
    storage: { type: 'extra', key: 'reply_priority' },
  },
  {
    key: 'open_promises',
    label: '承诺清单',
    group: 'behavior',
    kind: 'list',
    storage: { type: 'field', field: 'openPromises' },
  },
  {
    key: 'declined_actions_log',
    label: '已拒行为记录',
    group: 'behavior',
    kind: 'list',
    storage: { type: 'extra', key: 'declined_actions_log' },
  },
  {
    key: 'shared_events',
    label: '共同经历索引',
    group: 'behavior',
    kind: 'list',
    storage: { type: 'field', field: 'sharedEvents' },
  },
  {
    key: 'disclosure_scope',
    label: '可公开范围',
    group: 'behavior',
    kind: 'list',
    storage: { type: 'field', field: 'disclosureScope' },
  },
  {
    key: 'access.blocked',
    label: '是否拉黑',
    group: 'behavior',
    kind: 'boolean',
    storage: { type: 'field', field: 'blocked' },
  },
  {
    key: 'access.muted_until',
    label: '静默截止',
    group: 'behavior',
    kind: 'text',
    storage: { type: 'field', field: 'mutedUntil' },
  },
  {
    key: 'safeword',
    label: '安全词',
    group: 'boundaries',
    kind: 'text',
    storage: { type: 'extra', key: 'safeword' },
  },
  {
    key: 'soft_limits',
    label: '软限制',
    group: 'boundaries',
    kind: 'list',
    storage: { type: 'extra', key: 'soft_limits' },
  },
  {
    key: 'preferences',
    label: '偏好',
    group: 'boundaries',
    kind: 'tags',
    storage: { type: 'extra', key: 'preferences' },
  },
  {
    key: 'hard_limits_obj',
    label: '对象侧硬限制',
    group: 'boundaries',
    kind: 'list',
    storage: { type: 'extra', key: 'hard_limits_obj' },
  },
  {
    key: 'explicit_level_obj',
    label: '对象侧尺度上限',
    group: 'boundaries',
    kind: 'text',
    storage: { type: 'extra', key: 'explicit_level_obj' },
  },
  {
    key: 'boundary_notes',
    label: '边界备注',
    group: 'boundaries',
    kind: 'paragraph',
    storage: { type: 'extra', key: 'boundary_notes' },
  },
  {
    key: 'adult_confirmed_obj',
    label: '对象成年确认',
    group: 'boundaries',
    kind: 'text',
    storage: { type: 'extra', key: 'adult_confirmed_obj' },
  },
  {
    key: 'obj_profile.display_name',
    label: '对方昵称',
    group: 'profile',
    kind: 'text',
    storage: { type: 'extra', key: 'obj_profile.display_name' },
  },
  {
    key: 'obj_profile.self_intro',
    label: '自称与关系说明',
    group: 'profile',
    kind: 'text',
    storage: { type: 'extra', key: 'obj_profile.self_intro' },
  },
  {
    key: 'obj_profile.user_age_status',
    label: '年龄状态',
    group: 'profile',
    kind: 'text',
    storage: { type: 'extra', key: 'obj_profile.user_age_status' },
  },
  {
    key: 'obj_profile.user_profile',
    label: '已知事实',
    group: 'profile',
    kind: 'paragraph',
    storage: { type: 'extra', key: 'obj_profile.user_profile' },
  },
  {
    key: 'obj_profile.user_style',
    label: '表达风格',
    group: 'profile',
    kind: 'text',
    storage: { type: 'extra', key: 'obj_profile.user_style' },
  },
  {
    key: 'obj_profile.user_topics',
    label: '话题偏好',
    group: 'profile',
    kind: 'tags',
    storage: { type: 'extra', key: 'obj_profile.user_topics' },
  },
  {
    key: 'obj_profile.user_dislikes',
    label: '回避话题',
    group: 'profile',
    kind: 'tags',
    storage: { type: 'extra', key: 'obj_profile.user_dislikes' },
  },
  {
    key: 'obj_profile.privacy_flags',
    label: '隐私开关',
    group: 'profile',
    kind: 'list',
    storage: { type: 'extra', key: 'obj_profile.privacy_flags' },
  },
  {
    key: 'obj_profile.active_hours',
    label: '活跃时段',
    group: 'profile',
    kind: 'text',
    storage: { type: 'extra', key: 'obj_profile.active_hours' },
  },
];

export const RELATIONSHIP_ATTRIBUTE_COUNT = RELATIONSHIP_ATTRIBUTES.length;

export interface RelationshipAttributeEntry {
  key: string;
  label: string;
  group: string;
  kind: RelationshipAttributeKind;
  value: unknown;
}

export interface RelationshipAttributeRejection {
  key: string;
  reason: string;
}

export interface RelationshipAttributePatch {
  numeric: Partial<Record<RelationshipNumericField, number>>;
  fields: Omit<PersonaRelationshipUpdateInput, 'contactId'>;
  updated: string[];
  rejected: RelationshipAttributeRejection[];
}

const GROUP_LABELS = new Map(RELATIONSHIP_ATTRIBUTE_GROUPS.map((group) => [group.id, group.label]));
const ATTRIBUTE_MAP = new Map(
  RELATIONSHIP_ATTRIBUTES.map((attribute) => [attribute.key, attribute]),
);

/** Current value for every one of the 37 attributes, including empty ones. */
export function relationshipAttributes(
  record: PersonaRelationshipRecord,
): RelationshipAttributeEntry[] {
  const extras = asRecord(record.extras);
  return RELATIONSHIP_ATTRIBUTES.map((attribute) => ({
    key: attribute.key,
    label: attribute.label,
    group: GROUP_LABELS.get(attribute.group) ?? attribute.group,
    kind: attribute.kind,
    value: readAttribute(attribute, record, extras),
  }));
}

/**
 * Maps a flat attribute object back onto columns/extras. Numeric dimensions are
 * returned separately so the caller can keep drift limits; qualitative fields
 * write directly like the existing relationship.update parameters.
 */
export function relationshipAttributePatch(
  input: unknown,
  current: Pick<PersonaRelationshipRecord, 'extras'>,
): RelationshipAttributePatch {
  const record = asRecord(input);
  const numeric: Partial<Record<RelationshipNumericField, number>> = {};
  const fields: RelationshipAttributePatch['fields'] = {};
  const updated: string[] = [];
  const rejected: RelationshipAttributeRejection[] = [];
  const extraValues = new Map<string, unknown>();
  let touchesExtras = false;

  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = rawKey.trim();
    const attribute = ATTRIBUTE_MAP.get(key);
    if (!attribute) {
      rejected.push({ key, reason: '未知属性键；键取自 relationship.get 返回的 attributes' });
      continue;
    }

    const normalized = normalizeAttribute(attribute, rawValue);
    if (!normalized.ok) {
      rejected.push({ key, reason: normalized.reason });
      continue;
    }

    if (normalized.value === null && attribute.storage.type === 'extra') {
      touchesExtras = true;
      extraValues.set(attribute.storage.key, null);
      updated.push(key);
      continue;
    }

    if (attribute.storage.type === 'numeric') {
      numeric[attribute.storage.field] = normalized.value as number;
    } else if (attribute.storage.type === 'extra') {
      touchesExtras = true;
      extraValues.set(attribute.storage.key, normalized.value);
    } else {
      writeField(fields, attribute.storage.field, normalized.value);
    }
    updated.push(key);
  }

  if (touchesExtras) {
    const extras = { ...asRecord(current.extras) };
    for (const [key, value] of extraValues) {
      if (value === null) {
        delete extras[key];
      } else {
        extras[key] = value;
      }
    }
    fields.extras = extras;
  }

  return { numeric, fields, updated, rejected };
}

type NormalizedAttribute = { ok: true; value: unknown } | { ok: false; reason: string };

function normalizeAttribute(
  attribute: RelationshipAttributeMeta,
  raw: unknown,
): NormalizedAttribute {
  if (attribute.kind === 'boolean') {
    return typeof raw === 'boolean'
      ? { ok: true, value: raw }
      : { ok: false, reason: '需要 true/false' };
  }

  if (attribute.kind === 'score') {
    const value = readNumber(raw);
    if (value === null) {
      if (raw === null && attribute.storage.type === 'extra') {
        return { ok: true, value: null };
      }
      return { ok: false, reason: '需要数字' };
    }
    const min = attribute.storage.type === 'numeric' ? attribute.storage.min : 0;
    const max = attribute.storage.type === 'numeric' ? attribute.storage.max : 100;
    return { ok: true, value: Math.max(min, Math.min(max, Math.round(value))) };
  }

  if (attribute.kind === 'tags' || attribute.kind === 'list') {
    if (raw === null) {
      return { ok: true, value: attribute.storage.type === 'extra' ? null : [] };
    }
    const list = readTextList(raw);
    if (!list) {
      return { ok: false, reason: '需要字符串数组或逗号/换行分隔的字符串' };
    }
    return { ok: true, value: list };
  }

  if (attribute.storage.type === 'field' && attribute.storage.field === 'mutedUntil') {
    if (raw === null) {
      return { ok: true, value: null };
    }
    if (typeof raw !== 'string') {
      return { ok: false, reason: '静默截止需要 ISO 时间或 null' };
    }
    if (!raw.trim() || raw.trim() === '未设置') {
      return { ok: true, value: null };
    }
    const date = new Date(raw.trim());
    if (Number.isNaN(date.getTime())) {
      return { ok: false, reason: '静默截止需要 ISO 时间或 null' };
    }
    return { ok: true, value: date.toISOString() };
  }

  if (raw === null) {
    return { ok: true, value: attribute.storage.type === 'extra' ? null : '' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, reason: '需要字符串' };
  }
  return { ok: true, value: raw.slice(0, 4000) };
}

function writeField(
  fields: RelationshipAttributePatch['fields'],
  field: RelationshipFieldKey,
  value: unknown,
): void {
  switch (field) {
    case 'relationTags':
    case 'addressHere':
    case 'openPromises':
    case 'sharedEvents':
      fields[field] = Array.isArray(value) ? (value as string[]) : [];
      break;
    case 'disclosureScope':
      fields.disclosureScope = Array.isArray(value)
        ? (value as string[]).join(',').slice(0, 32) || 'SCENE'
        : String(value ?? '').slice(0, 32) || 'SCENE';
      break;
    case 'blocked':
      fields.blocked = value === true;
      break;
    case 'mutedUntil':
      fields.mutedUntil = typeof value === 'string' ? value : null;
      break;
  }
}

function readAttribute(
  attribute: RelationshipAttributeMeta,
  record: PersonaRelationshipRecord,
  extras: Record<string, unknown>,
): unknown {
  const storage = attribute.storage;
  if (storage.type === 'numeric') {
    return record[storage.field];
  }
  if (storage.type === 'extra') {
    const value = extras[storage.key];
    return value === undefined ? null : value;
  }
  switch (storage.field) {
    case 'relationTags':
    case 'addressHere':
    case 'openPromises':
    case 'sharedEvents':
      return asStringArray(record[storage.field]);
    case 'disclosureScope':
      return record.disclosureScope ?? '';
    case 'blocked':
      return record.blocked;
    case 'mutedUntil':
      return record.mutedUntil;
  }
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readTextList(value: unknown): string[] | null {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n|[,，、]/)
      : null;
  if (!items || !items.every((item) => typeof item === 'string')) {
    return null;
  }
  return items
    .map((item) => item.trim().slice(0, 400))
    .filter(Boolean)
    .slice(0, 50);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
