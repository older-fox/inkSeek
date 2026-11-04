import type {
  PersonaGroupStanceRecord,
  PersonaGroupStanceUpdateInput,
  PersonaRelationshipRecord,
  PersonaRelationshipUpdateInput,
} from './mind.js';
export type ConversationPersonaValue = string | number | boolean | readonly string[];
export type ConversationPersonaValues = Record<string, ConversationPersonaValue>;

const RELATIONSHIP_NUMBERS = {
  affinity: 'affinity',
  trust: 'trust',
  intimacy: 'intimacy',
  dependency: 'dependency',
  hostility: 'hostility',
  possessiveness_obj: 'possessiveness',
  respect: 'respect',
  fear: 'fear',
  friction: 'friction',
  unresolved_conflict: 'unresolvedConflict',
} as const;

const RELATIONSHIP_EXTRAS = [
  'per_obj_shame',
  'nickname_for_obj',
  'reply_priority',
  'declined_actions_log',
  'safeword',
  'soft_limits',
  'preferences',
  'hard_limits_obj',
  'explicit_level_obj',
  'boundary_notes',
  'adult_confirmed_obj',
  'obj_profile.display_name',
  'obj_profile.self_intro',
  'obj_profile.user_age_status',
  'obj_profile.user_profile',
  'obj_profile.user_style',
  'obj_profile.user_topics',
  'obj_profile.user_dislikes',
  'obj_profile.privacy_flags',
  'obj_profile.active_hours',
] as const;

const STANCE_EXTRAS = ['scene_type', 'focus', 'explicit_cap'] as const;

/** Flat legacy-editor view of the single PersonaRelationship row. */
export function relationshipToPersonaValues(
  record: PersonaRelationshipRecord,
): ConversationPersonaValues {
  const extras = asRecord(record.extras);
  const values: ConversationPersonaValues = {};
  for (const [key, field] of Object.entries(RELATIONSHIP_NUMBERS)) {
    values[key] = readNumber(record[field], 50);
  }
  values['relation_tags'] = asStringArray(record.relationTags);
  values['how_i_address_here'] = asStringArray(record.addressHere);
  values['open_promises'] = asStringArray(record.openPromises);
  values['shared_events'] = asStringArray(record.sharedEvents);
  values['disclosure_scope'] = record.disclosureScope ? [record.disclosureScope] : [];
  values['access.blocked'] = record.blocked;
  values['access.muted_until'] = record.mutedUntil ?? '未设置';
  for (const key of RELATIONSHIP_EXTRAS) {
    if (extras[key] !== undefined) {
      values[key] = toPersonaValue(extras[key]);
    }
  }
  return values;
}

/** Flat legacy-editor view of the single PersonaGroupStance row. */
export function stanceToPersonaValues(record: PersonaGroupStanceRecord): ConversationPersonaValues {
  const extras = asRecord(record.extras);
  const values: ConversationPersonaValues = {
    scene_type: readString(extras['scene_type']),
    narrative: record.narrative,
    group_persona: record.role,
    comfort: record.comfort,
    boundary_here: asStringArray(record.boundaries),
    topic: record.topic,
    focus: readString(extras['focus']),
    phase: record.phase,
    explicit_cap: readString(extras['explicit_cap']) || 'none',
    formality: roundRatio(record.formality / 100),
    scene_rules: splitRules(record.sceneRules),
    mention_only: record.mentionOnly,
    speak_rate_target: roundRatio(record.speakRate / 100),
  };
  for (const key of STANCE_EXTRAS) {
    if (values[key] === undefined && extras[key] !== undefined) {
      values[key] = toPersonaValue(extras[key]);
    }
  }
  return values;
}

/** Complete update patch, so saving one field never drops the others. */
export function relationshipPatchFromValues(
  values: ConversationPersonaValues,
): PersonaRelationshipUpdateInput {
  const patch: PersonaRelationshipUpdateInput = { contactId: '' };
  for (const [key, field] of Object.entries(RELATIONSHIP_NUMBERS)) {
    patch[field] = clampScore(values[key]);
  }
  patch.relationTags = readArray(values['relation_tags']);
  patch.addressHere = readArray(values['how_i_address_here']);
  patch.openPromises = readArray(values['open_promises']);
  patch.sharedEvents = readArray(values['shared_events']);
  patch.disclosureScope = disclosureScope(values['disclosure_scope']);
  patch.blocked = values['access.blocked'] === true;
  patch.mutedUntil = mutedUntil(values['access.muted_until']);
  patch.extras = extrasOf(values, RELATIONSHIP_EXTRAS);
  return patch;
}

export function stancePatchFromValues(
  values: ConversationPersonaValues,
): PersonaGroupStanceUpdateInput {
  return {
    conversationId: '',
    comfort: clampPercent(values['comfort']),
    formality: ratioPercent(values['formality']),
    speakRate: ratioPercent(values['speak_rate_target']),
    role: readString(values['group_persona']),
    narrative: readString(values['narrative']),
    boundaries: readArray(values['boundary_here']),
    sceneRules: readArray(values['scene_rules']).join('、'),
    mentionOnly: values['mention_only'] === true,
    topic: readString(values['topic']),
    phase: readString(values['phase']),
    extras: extrasOf(values, STANCE_EXTRAS),
  };
}

function extrasOf(
  values: ConversationPersonaValues,
  keys: readonly string[],
): Record<string, ConversationPersonaValue> {
  const extras: Record<string, ConversationPersonaValue> = {};
  for (const key of keys) {
    if (values[key] !== undefined) {
      extras[key] = values[key];
    }
  }
  return extras;
}

function disclosureScope(value: ConversationPersonaValue | undefined): string {
  const parts = readArray(value);
  return (parts.join(',') || 'SCENE').slice(0, 32);
}

function mutedUntil(value: ConversationPersonaValue | undefined): string | null {
  const text = readString(value);
  if (!text || text === '未设置') {
    return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ratioPercent(value: ConversationPersonaValue | undefined): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, Math.round(number * 100)))
    : 50;
}

function clampPercent(value: ConversationPersonaValue | undefined): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 50;
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

function splitRules(value: string): string[] {
  return value
    .split(/[、,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function clampScore(value: ConversationPersonaValue | undefined): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.max(-100, Math.min(100, Math.round(number))) : 50;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readArray(value: ConversationPersonaValue | undefined): string[] {
  return asStringArray(value);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toPersonaValue(value: unknown): ConversationPersonaValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return asStringArray(value);
}
