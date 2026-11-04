import type { PersonaState } from '../generated/prisma/client.js';
import type { MindPersona } from './mind.types.js';
import { describeTrait, isSelfTraitKey } from './mind-behavior.js';

export interface PersonaAttributeEntry {
  key: string;
  label: string;
  group: string;
  type: string;
  hasValue: boolean;
  source: 'persona' | 'state';
}

export interface PersonaAttributeValue extends PersonaAttributeEntry {
  value: unknown;
  behavior?: string;
}

const GROUP_IDENTITY = '身份与外观';
const GROUP_WORLD = '世界与背景';
const GROUP_VALUES = '价值与动机';
const GROUP_VOICE = '说话与称呼';
const GROUP_RHYTHM = '在线状态';
const GROUP_BASELINES = '数值基线';
const GROUP_BOUNDARIES = '边界与同意';
const GROUP_META = '元信息';

const group = (name: string, entries: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(entries).map(([key, label]) => [key, { label, group: name }]),
  ) as Record<string, { label: string; group: string }>;

/** Labels mirror the channel persona editor; key names are the storage contract. */
export const PERSONA_ATTRIBUTE_META: Record<string, { label: string; group: string }> = {
  ...group(GROUP_IDENTITY, {
    name: '姓名',
    aliases: '化名与绰号',
    keywords: '关键词',
    age: '年龄',
    gender: '性别',
    identity: '身份',
    occupation: '职业',
    race: '种族',
    height_cm: '身高',
    weight_kg: '体重',
    body_type: '体型描述',
    appearance: '外貌描述',
    hair: '发型描述',
    outfit: '服装描述',
    voice: '声音描述',
  }),
  ...group(GROUP_WORLD, {
    world_setting: '世界观设定',
    backstory: '背景经历',
    knowledge_boundary: '知识边界',
    time_awareness: '时间感知',
  }),
  ...group(GROUP_VALUES, {
    core_values: '核心价值观',
    taboos: '禁忌',
    fears: '恐惧',
    soft_spots: '软肋',
    non_negotiable: '绝对红线',
    long_term_motivation: '长期目标',
    current_goal: '当前目标',
    doing_now: '正在做的事',
    obstacle: '面临的困难',
    conflict_style: '冲突风格',
    humor_style: '幽默风格',
    memory_bias: '记忆倾向',
  }),
  ...group(GROUP_VOICE, {
    language_style: '说话风格',
    sentence_length: '句长偏好',
    punctuation: '标点习惯',
    particles: '语气词',
    openers: '常用开头',
    typo_level: '口胡概率',
    split_level: '分条发送',
    emoji_level: '表情偏向',
    typing_level: '打字速度',
    address_for_stranger: '对陌生人的称呼',
    address_for_close: '对熟人的称呼',
    forbidden_addresses: '禁忌称呼',
    allowed_addresses: '允许他人对我的称呼',
    anchor_quote: '人格台词',
    anchor_few_shot: '风格样本对白',
    banned_words: '禁用语',
    in_character_principle: '防破面总纲',
    in_character_triggers: '触发场景与应对',
    in_character_never: '人格级绝不做',
    in_character_recovery: '出戏后如何拉回',
    in_character_allowed_meta: '允许的元话题',
    quote: '人格台词',
  }),
  ...group(GROUP_RHYTHM, {
    time_zone: '时区',
    online_policy: '在线策略',
    sleep_depth: '睡眠深度',
    proactivity: '主动性',
    location: '当前位置',
  }),
  ...group(GROUP_BASELINES, {
    confidence: '自信',
    self_control: '自控力',
    shame: '羞耻感',
    trust_bias: '信任倾向',
    attachment_style: '依恋程度',
    possessiveness_base: '占有欲基线',
    agreeableness: '顺从度',
    curiosity: '好奇心',
    stamina_max: '体力上限',
    strength: '力量',
    agility: '灵活度',
    pain_tolerance: '疼痛耐受度',
    recovery_rate: '恢复速度',
    sensitivity: '敏感度',
    sensitivity_map: '敏感度映射',
    touch_preference: '触碰偏好',
    physique_effect_cap: '体型影响上限',
    mood_tags: '当前情绪标签',
    mood_intensity: '情绪强度',
    stress: '压力',
    health_tags: '健康状态',
    grooming: '整洁程度',
    social_battery: '社交电量',
    emotional_inertia_sec: '情绪惯性',
    mood_decay_halflife_sec: '心情衰减半衰期',
    affinity_halflife_day: '好感半衰期',
    stress_recovery_halflife_sec: '压力恢复半衰期',
  }),
  ...group(GROUP_BOUNDARIES, {
    hard_limits_global: '全局硬限制',
    explicit_level_char: '角色尺度上限',
    experience_level: '经验等级',
    aftercare_need_base: '事后照护基线',
    decline_response_style: '拒绝行为模板',
  }),
  ...group(GROUP_META, {
    card_serial: '角色卡编号',
    card_experience: '卡面经验',
    card_traits: '卡面特质',
    card_physical: '卡面体能',
    created_at: '创建时间',
    updated_at: '修订时间',
  }),
};

const GROUP_STATE = '实时状态';

const STATE_ATTRIBUTES: Record<
  string,
  { label: string; read: (state: PersonaState) => unknown; behavior?: (value: number) => string }
> = {
  mood_tags: { label: '当前情绪', read: (state) => moodLabel(state) },
  mood_intensity: {
    label: '情绪强度',
    read: (state) => state.moodArousal,
    behavior: (value) =>
      value >= 70 ? '情绪很强，容易影响语气' : value <= 30 ? '情绪偏淡，反应平' : '情绪强度一般',
  },
  mood_valence: {
    label: '情绪好坏',
    read: (state) => state.moodValence,
    behavior: (value) =>
      value >= 50 ? '心情很好，愿意示好' : value <= -50 ? '心情低落，容易冷淡' : '心情平稳',
  },
  mood_arousal: {
    label: '情绪唤醒',
    read: (state) => state.moodArousal,
    behavior: (value) =>
      value >= 70 ? '亢奋，动作和语气偏快' : value <= 30 ? '倦怠，反应慢' : '唤醒一般',
  },
  mood_dominance: {
    label: '掌控感',
    read: (state) => state.moodDominance,
    behavior: (value) =>
      value >= 40 ? '有掌控感，敢主动' : value <= -40 ? '被动，容易退让' : '掌控感一般',
  },
  energy: {
    label: '精力',
    read: (state) => state.energy,
    behavior: (value) =>
      value < 30 ? '没力气，回复会更短' : value >= 70 ? '有精神，愿意多聊' : '精力正常',
  },
  health: {
    label: '健康度',
    read: (state) => state.health,
    behavior: (value) =>
      value < 30 ? '身体很差，容易疲惫或不适' : value < 60 ? '身体有点虚' : '身体状态不错',
  },
  stress: {
    label: '压力',
    read: (state) => state.stress,
    behavior: (value) => (value >= 60 ? '紧绷，容易不耐烦' : value <= 25 ? '放松' : '压力一般'),
  },
  social_battery: {
    label: '社交电量',
    read: (state) => state.socialBattery,
    behavior: (value) =>
      value < 30 ? '不想社交，回复短或晚' : value >= 70 ? '社交状态好' : '一般',
  },
  attention: {
    label: '注意力',
    read: (state) => state.attention,
    behavior: (value) =>
      value < 30 ? '没太看消息' : value >= 70 ? '很关注当前对话' : '关注度一般',
  },
  sleep_debt: {
    label: '睡眠债',
    read: (state) => state.sleepDebt,
    behavior: (value) =>
      value >= 60 ? '很困，反应和耐心下降' : value <= 20 ? '休息得不错' : '有点累',
  },
  grooming: {
    label: '整洁程度',
    read: (state) => state.grooming,
    behavior: (value) =>
      value >= 80
        ? '清爽整洁，不介意靠近'
        : value >= 55
          ? '还算整洁'
          : value >= 30
            ? '有些乱或出汗，会下意识整理'
            : '明显邋遢或狼狈，不太想见人',
  },
  current_activity: { label: '正在做的事', read: (state) => state.currentActivity },
  doing_now: { label: '正在做的事', read: (state) => state.currentActivity },
  location: { label: '当前位置', read: (state) => state.location },
};

export type StateWriteField =
  | 'moodValence'
  | 'moodArousal'
  | 'moodDominance'
  | 'energy'
  | 'stress'
  | 'socialBattery'
  | 'attention'
  | 'sleepDebt'
  | 'health'
  | 'grooming'
  | 'currentActivity'
  | 'location';

export interface StateWriteRule {
  field: StateWriteField;
  kind: 'number' | 'string';
  min?: number;
  max?: number;
  maxLength?: number;
}

const STATE_ATTRIBUTE_WRITES: Record<string, StateWriteRule> = {
  mood_intensity: { field: 'moodArousal', kind: 'number', min: 0, max: 100 },
  mood_valence: { field: 'moodValence', kind: 'number', min: -100, max: 100 },
  mood_arousal: { field: 'moodArousal', kind: 'number', min: 0, max: 100 },
  mood_dominance: { field: 'moodDominance', kind: 'number', min: -100, max: 100 },
  energy: { field: 'energy', kind: 'number', min: 0, max: 100 },
  stress: { field: 'stress', kind: 'number', min: 0, max: 100 },
  social_battery: { field: 'socialBattery', kind: 'number', min: 0, max: 100 },
  attention: { field: 'attention', kind: 'number', min: 0, max: 100 },
  sleep_debt: { field: 'sleepDebt', kind: 'number', min: 0, max: 100 },
  health: { field: 'health', kind: 'number', min: 0, max: 100 },
  grooming: { field: 'grooming', kind: 'number', min: 0, max: 100 },
  current_activity: { field: 'currentActivity', kind: 'string', maxLength: 200 },
  doing_now: { field: 'currentActivity', kind: 'string', maxLength: 200 },
  location: { field: 'location', kind: 'string', maxLength: 100 },
};

export function stateAttributeWrite(key: string): StateWriteRule | null {
  return STATE_ATTRIBUTE_WRITES[key] ?? null;
}

export function personaAttributeLabel(key: string): string {
  return STATE_ATTRIBUTES[key]?.label ?? PERSONA_ATTRIBUTE_META[key]?.label ?? key;
}

const TOP_LEVEL_KEYS = new Set(['name', 'identity', 'quote']);
const MAX_GET_KEYS = 20;
const MAX_STRING = 4000;
const MAX_LIST_ITEMS = 50;

export function listPersonaAttributes(
  persona: MindPersona,
  state: PersonaState,
): PersonaAttributeEntry[] {
  const values = jsonObject(persona.values);
  const entries = new Map<string, PersonaAttributeEntry>();
  for (const [key, value] of Object.entries(values)) {
    entries.set(key, entryOf(key, value, 'persona'));
  }
  for (const [key, attribute] of Object.entries(STATE_ATTRIBUTES)) {
    entries.set(key, entryOf(key, attribute.read(state), 'state'));
  }
  for (const key of TOP_LEVEL_KEYS) {
    entries.set(key, entryOf(key, persona[key as 'name' | 'identity' | 'quote'], 'persona'));
  }
  return [...entries.values()].sort(compareEntries);
}

export function readPersonaAttributes(
  persona: MindPersona,
  state: PersonaState,
  keys: readonly string[],
): { attributes: Record<string, PersonaAttributeValue>; missing: string[] } {
  const values = jsonObject(persona.values);
  const attributes: Record<string, PersonaAttributeValue> = {};
  const missing: string[] = [];
  for (const key of keys) {
    const stateAttribute = STATE_ATTRIBUTES[key];
    const topLevel = TOP_LEVEL_KEYS.has(key);
    if (!stateAttribute && !topLevel && !(key in values)) {
      missing.push(key);
      continue;
    }
    const raw = stateAttribute
      ? stateAttribute.read(state)
      : topLevel
        ? persona[key as 'name' | 'identity' | 'quote']
        : values[key];
    const entry = entryOf(key, raw, stateAttribute ? 'state' : 'persona');
    const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    const behavior = !Number.isFinite(numeric)
      ? ''
      : stateAttribute?.behavior
        ? stateAttribute.behavior(numeric)
        : isSelfTraitKey(key)
          ? describeTrait(key, Math.round(numeric))
          : '';
    attributes[key] = {
      ...entry,
      value: compactValue(raw),
      ...(behavior ? { behavior } : {}),
    };
  }
  return { attributes, missing };
}

export function readAttributeKeys(input: Record<string, unknown>): string[] {
  const raw = input['keys'] ?? input['key'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,，、\s]+/) : [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') {
      continue;
    }
    const key = item.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
    if (keys.length >= MAX_GET_KEYS) {
      break;
    }
  }
  return keys;
}

function entryOf(key: string, value: unknown, source: 'persona' | 'state'): PersonaAttributeEntry {
  const stateMeta = source === 'state' ? STATE_ATTRIBUTES[key] : undefined;
  const meta = stateMeta
    ? { label: stateMeta.label, group: GROUP_STATE }
    : PERSONA_ATTRIBUTE_META[key];
  return {
    key,
    label: meta?.label ?? key,
    group: meta?.group ?? '未分组',
    type: valueType(value),
    hasValue: hasValue(value),
    source,
  };
}

const META_ORDER = new Map(Object.keys(PERSONA_ATTRIBUTE_META).map((key, index) => [key, index]));
const STATE_ORDER = new Map(Object.keys(STATE_ATTRIBUTES).map((key, index) => [key, index]));

function compareEntries(left: PersonaAttributeEntry, right: PersonaAttributeEntry): number {
  if (left.source !== right.source) {
    return left.source === 'state' ? 1 : -1;
  }
  const order = left.source === 'state' ? STATE_ORDER : META_ORDER;
  const leftOrder = order.get(left.key) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = order.get(right.key) ?? Number.MAX_SAFE_INTEGER;
  return leftOrder - rightOrder || left.key.localeCompare(right.key);
}

function valueType(value: unknown): string {
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'text';
  return value === null || value === undefined ? 'empty' : 'json';
}

function hasValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

function compactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_LIST_ITEMS)
      .map((item) =>
        typeof item === 'string' && item.length > MAX_STRING
          ? `${item.slice(0, MAX_STRING)}…`
          : item,
      );
  }
  return value;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function moodLabel(state: PersonaState): string {
  const base =
    state.moodValence > 30
      ? '愉快'
      : state.moodValence > 10
        ? '轻松'
        : state.moodValence < -30
          ? '低落'
          : state.moodValence < -10
            ? '烦闷'
            : '平静';
  if (state.moodArousal > 70) return `亢奋·${base}`;
  if (state.moodArousal < 30) return `倦怠·${base}`;
  return base;
}
