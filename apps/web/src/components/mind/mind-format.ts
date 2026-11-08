import type {
  PersonaGroupStanceRecord,
  PersonaMemoryKind,
  PersonaMemoryVisibility,
  PersonaRelationshipRecord,
  PersonaRelationshipUpdateInput,
} from '@inkseek/shared';

export const MODES = [
  { value: 'OFF', label: '关闭', hint: '不做任何心智判断' },
  { value: 'SHADOW', label: '影子', hint: '记录心智轨迹，但不发送' },
  { value: 'APPROVAL', label: '审批', hint: '生成动作，人工批准后发送' },
  { value: 'LIVE', label: '直发', hint: '心智直接执行动作' },
] as const;

export const MIND_TABS = [
  { key: 'focus', label: '此刻' },
  { key: 'runs', label: '运行轨迹' },
  { key: 'changes', label: '变动历史' },
  { key: 'relations', label: '个人关系' },
  { key: 'groups', label: '群关系' },
  { key: 'memories', label: '记忆' },
  { key: 'growth', label: '成长' },
  { key: 'learning', label: '学习' },
  { key: 'plans', label: '待办与主动' },
  { key: 'journal', label: '日记' },
  { key: 'stickers', label: '表情库' },
] as const;

export type MindTabKey = (typeof MIND_TABS)[number]['key'];

export const REFRESH_OPTIONS = [
  { value: '0', label: '不自动刷新' },
  { value: '10000', label: '10 秒' },
  { value: '30000', label: '30 秒' },
  { value: '60000', label: '1 分钟' },
  { value: '300000', label: '5 分钟' },
] as const;
export const REFRESH_VALUES = REFRESH_OPTIONS.map((option) => Number(option.value));
export const REFRESH_STORAGE_KEY = 'mind.refreshMs';

export const MEMORY_KINDS: PersonaMemoryKind[] = [
  'EPISODE',
  'FACT',
  'PREFERENCE',
  'PROMISE',
  'BOUNDARY',
  'REFLECTION',
  'PROCEDURE',
];
export const VISIBILITIES: PersonaMemoryVisibility[] = ['PRIVATE', 'SCENE', 'CHANNEL', 'PUBLIC'];

export const BASE_METRIC_LABELS: Record<string, string> = {
  age: '年龄',
  height_cm: '身高',
  weight_kg: '体重',
  typo_level: '错字习惯',
  split_level: '分段倾向',
  emoji_level: '表情频率',
  typing_level: '打字速度',
  sleep_depth: '睡眠深度',
  confidence: '自信',
  self_control: '自控',
  shame: '羞耻',
  trust_bias: '信任倾向',
  attachment_style: '依恋类型',
  possessiveness_base: '占有欲',
  agreeableness: '亲和',
  proactivity: '主动性',
  curiosity: '好奇心',
  stamina_max: '体力',
  strength: '力量',
  agility: '灵活',
  pain_tolerance: '疼痛耐受',
  recovery_rate: '恢复速度',
  sensitivity: '敏感度',
  physique_effect_cap: '体型影响上限',
  emotional_inertia_sec: '情绪惯性',
  mood_decay_halflife_sec: '心情衰减半衰期',
  affinity_halflife_day: '好感半衰期',
  stress_recovery_halflife_sec: '压力恢复半衰期',
  aftercare_need_base: '事后安抚需求',
  experience_level: '经验等级',
};

export const STATE_FIELD_LABELS: Record<string, string> = {
  moodValence: '心情好坏',
  moodArousal: '情绪唤醒',
  moodDominance: '掌控感',
  energy: '精力',
  health: '健康度',
  stress: '压力',
  socialBattery: '社交电量',
  attention: '注意力',
  sleepDebt: '睡眠债',
  grooming: '整洁程度',
  currentActivity: '正在做',
  location: '位置',
  affinity: '好感',
  trust: '信任',
  intimacy: '亲密',
  attraction: '心动',
  hostility: '敌意',
  fear: '恐惧',
  respect: '尊重',
  obligation: '亏欠',
  dependency: '依赖',
  possessiveness: '占有欲',
  friction: '摩擦',
  unresolvedConflict: '未解冲突',
  familiarity: '熟悉度',
  comfort: '自在',
  belonging: '归属',
  formality: '严肃',
  speakRate: '主动',
  audienceRisk: '观众风险',
  role: '群内角色',
  narrative: '群内总纲',
  topic: '当前话题',
  phase: '场景阶段',
  sceneRules: '群规',
  mentionOnly: '仅被@才回',
  disclosureScope: '可公开范围',
  blocked: '拉黑',
  mutedUntil: '静默截止',
  relationTags: '关系标签',
  addressHere: '各场合称呼',
  publicMask: '公开面具',
  boundaries: '边界',
  openPromises: '承诺清单',
  sharedEvents: '共同经历',
  tabooTopics: '禁忌话题',
  extras: '扩展档案',
};

export const STATE_SOURCE_LABELS: Record<string, string> = {
  EVENT: '长时事件',
  DRIFT: '自然漂移',
  EMOTION: '情绪',
  TURN: '对话消耗',
  TOOL: 'Agent 工具',
  AGENT: 'Agent 调整',
  MANUAL: '手动调整',
  ADMIN_EDIT: '手动调整',
  MIND_TOOL: 'Agent 工具',
  WAKE: '醒来',
  SCHEDULE: '唤醒安排',
};

export const STATE_EVENT_KIND_LABELS: Record<string, string> = {
  SLEEP: '睡觉',
  NAP: '打盹',
  REST: '休息',
  FOCUS: '专注',
  AWAY: '离开',
};

export const STATE_WAKE_REASON_LABELS: Record<string, string> = {
  PLANNED: '到点自然醒',
  MENTIONS: '被反复点名叫醒',
  KEYWORD: '被在意的话叫醒',
  JUDGMENT: '自己判断醒来',
  MANUAL: '手动结束',
  AGENT_END: '主动结束',
  REPLACED: '被新活动替换',
};

export function sleepDifficultyLabel(depth: number): string {
  if (depth >= 4) return '极难';
  if (depth === 3) return '偏难';
  if (depth === 1) return '偏易';
  if (depth <= 0) return '很浅';
  return '一般';
}

export const MEMORY_KIND_LABELS: Record<PersonaMemoryKind, string> = {
  EPISODE: '情景',
  FACT: '事实',
  PREFERENCE: '偏好',
  PROMISE: '承诺',
  BOUNDARY: '边界',
  REFLECTION: '反思',
  PROCEDURE: '流程',
};

export const VISIBILITY_LABELS: Record<PersonaMemoryVisibility, string> = {
  PRIVATE: '私密',
  SCENE: '本场景',
  CHANNEL: '本渠道',
  PUBLIC: '公开',
};

export const CHANGE_SCOPE_LABELS: Record<string, string> = {
  STATE: '自我状态',
  SELF: '自身属性',
  RELATION: '个人关系',
  GROUP: '群内态度',
};

export const RELATION_DIMENSIONS = [
  { key: 'affinity', label: '好感' },
  { key: 'trust', label: '信任' },
  { key: 'intimacy', label: '亲密' },
  { key: 'attraction', label: '心动' },
  { key: 'hostility', label: '敌意' },
  { key: 'fear', label: '恐惧' },
  { key: 'respect', label: '尊重' },
  { key: 'obligation', label: '亏欠' },
  { key: 'dependency', label: '依赖' },
  { key: 'possessiveness', label: '占有欲' },
  { key: 'friction', label: '摩擦' },
  { key: 'unresolvedConflict', label: '未解冲突' },
  { key: 'familiarity', label: '熟悉度' },
] as const;

export const STANCE_DIMENSIONS = [
  { key: 'comfort', label: '自在' },
  { key: 'belonging', label: '归属' },
  { key: 'attention', label: '关注' },
  { key: 'formality', label: '严肃' },
  { key: 'speakRate', label: '主动' },
  { key: 'audienceRisk', label: '观众风险' },
] as const;

export type RelationDimension = (typeof RELATION_DIMENSIONS)[number]['key'];
export type RelationDraft = Record<RelationDimension, number> & {
  relationTags: string;
  addressHere: string;
  publicMask: string;
  boundaries: string;
  openPromises: string;
  sharedEvents: string;
  disclosureScope: string;
  blocked: boolean;
  mutedUntil: string;
  extrasText: string;
};

export type StanceDimension = (typeof STANCE_DIMENSIONS)[number]['key'];
export type StanceDraft = Record<StanceDimension, number> & {
  role: string;
  narrative: string;
  sceneRules: string;
  topic: string;
  phase: string;
  mentionOnly: boolean;
  boundaries: string;
  tabooTopics: string;
  sceneType: string;
  focus: string;
  explicitCap: string;
};

export function jsonText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').join('\n');
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return '';
}

export function listText(value: string): string[] {
  return value
    .split(/\r?\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function jsonValue(value: string): unknown {
  const text = value.trim();
  if (!text) {
    return [];
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function jsonObject(value: string): Record<string, unknown> | null {
  const text = value.trim();
  if (!text) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function extrasRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function toIsoOrNull(value: string): string | null {
  const text = value.trim();
  if (!text) {
    return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function relationDraftOf(record: PersonaRelationshipRecord | null): RelationDraft {
  return {
    ...(Object.fromEntries(
      RELATION_DIMENSIONS.map(({ key }) => [key, record?.[key] ?? 0]),
    ) as Record<RelationDimension, number>),
    relationTags: jsonText(record?.relationTags),
    addressHere: jsonText(record?.addressHere),
    publicMask: jsonText(record?.publicMask),
    boundaries: jsonText(record?.boundaries),
    openPromises: jsonText(record?.openPromises),
    sharedEvents: jsonText(record?.sharedEvents),
    disclosureScope: record?.disclosureScope ?? 'SCENE',
    blocked: record?.blocked ?? false,
    mutedUntil: record?.mutedUntil ?? '',
    extrasText: JSON.stringify(extrasRecord(record?.extras), null, 2),
  };
}

export function relationInputFromDraft(
  contactId: string,
  draft: RelationDraft,
): PersonaRelationshipUpdateInput {
  const extras = jsonObject(draft.extrasText);
  if (draft.extrasText.trim() && extras === null) {
    throw new Error('扩展档案不是合法的 JSON 对象');
  }
  return {
    contactId,
    affinity: draft.affinity,
    trust: draft.trust,
    intimacy: draft.intimacy,
    attraction: draft.attraction,
    hostility: draft.hostility,
    fear: draft.fear,
    respect: draft.respect,
    obligation: draft.obligation,
    dependency: draft.dependency,
    possessiveness: draft.possessiveness,
    friction: draft.friction,
    unresolvedConflict: draft.unresolvedConflict,
    familiarity: draft.familiarity,
    relationTags: listText(draft.relationTags),
    addressHere: listText(draft.addressHere),
    publicMask: jsonValue(draft.publicMask),
    boundaries: listText(draft.boundaries),
    openPromises: listText(draft.openPromises),
    sharedEvents: listText(draft.sharedEvents),
    disclosureScope: (draft.disclosureScope || 'SCENE').slice(0, 32),
    blocked: draft.blocked,
    mutedUntil: toIsoOrNull(draft.mutedUntil),
    extras: extras ?? undefined,
  };
}

export function stanceDraftOf(record: PersonaGroupStanceRecord | null): StanceDraft {
  const extras = extrasRecord(record?.extras);
  return {
    ...(Object.fromEntries(
      STANCE_DIMENSIONS.map(({ key }) => [key, Math.max(0, Math.min(100, record?.[key] ?? 0))]),
    ) as Record<StanceDimension, number>),
    role: record?.role ?? '',
    narrative: record?.narrative ?? '',
    sceneRules: record?.sceneRules ?? '',
    topic: record?.topic ?? '',
    phase: record?.phase ?? '',
    mentionOnly: record?.mentionOnly ?? false,
    boundaries: jsonText(record?.boundaries),
    tabooTopics: jsonText(record?.tabooTopics),
    sceneType: typeof extras['scene_type'] === 'string' ? extras['scene_type'] : '',
    focus: typeof extras['focus'] === 'string' ? extras['focus'] : '',
    explicitCap: typeof extras['explicit_cap'] === 'string' ? extras['explicit_cap'] : '',
  };
}

export function stateMoodLabel(state: { moodValence: number; moodArousal: number }): string {
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

export function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatStateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

