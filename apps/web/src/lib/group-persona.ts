import type { PersonaValue } from '@/lib/channel-persona';
import {
  readPersonaMetadata,
  writePersonaMetadata,
  type PersonaMetadata,
} from '@/lib/persona-metadata';

export type GroupFieldKind = 'text' | 'paragraph' | 'tags' | 'score' | 'ratio' | 'boolean';

export interface GroupField {
  key: string;
  label: string;
  hint: string;
  kind: GroupFieldKind;
  wide?: boolean;
  step?: number;
  display?: 'percent';
}

export interface GroupPersonaGroup {
  id: string;
  title: string;
  tagline: string;
  description: string;
  transient?: boolean;
  fields: readonly GroupField[];
}

/**
 * 群聊极简版属性表：只描述"她在这个群"，不含成员级属性。
 * 对群态度 / 实时状态 / 群规则，共 13 项。
 */
export const GROUP_PERSONA_GROUPS: readonly GroupPersonaGroup[] = [
  {
    id: 'scene',
    title: '对群态度',
    tagline: '人格 × 群',
    description: '这个群本身带给 TA 的分寸与角色，决定默认的正式度和说话的松紧。',
    fields: [
      {
        key: 'scene_type',
        label: '场合类型',
        hint: '决定默认分寸、称呼与正式度',
        kind: 'text',
      },
      {
        key: 'narrative',
        label: '一句总纲',
        hint: '模型唯一真正读懂的字段，压倒所有数值',
        kind: 'paragraph',
        wide: true,
      },
      {
        key: 'group_persona',
        label: '我在群里的角色',
        hint: '群里的位置，决定发言倾向与存在感',
        kind: 'text',
      },
      {
        key: 'comfort',
        label: '自在度',
        hint: '说话是否放松、会不会反复删改',
        kind: 'score',
      },
      {
        key: 'boundary_here',
        label: '本群额外边界',
        hint: '该群特有的禁忌，只能加严',
        kind: 'tags',
        wide: true,
      },
    ],
  },
  {
    id: 'session',
    title: '实时状态',
    tagline: '人格 × 会话',
    description: '只属于当前这次群会话，随会话销毁，不作为长期记忆。',
    transient: true,
    fields: [
      {
        key: 'topic',
        label: '当前话题',
        hint: 'TA 此刻在接什么',
        kind: 'text',
        wide: true,
      },
      {
        key: 'focus',
        label: '是否指向我',
        hint: '被 @、被回复、点名擅长的领域，还是旁观',
        kind: 'text',
      },
      {
        key: 'phase',
        label: '场景阶段',
        hint: '当前群聊处于什么节奏，决定回应的分量',
        kind: 'text',
      },
      {
        key: 'explicit_cap',
        label: '群聊尺度硬上限',
        hint: '群聊恒为 none，不交模型裁量',
        kind: 'text',
      },
    ],
  },
  {
    id: 'binding',
    title: '群规则',
    tagline: '人格 × 群',
    description: '作者为该群设定的长期参数，用于校准语气与发言频率。',
    fields: [
      {
        key: 'formality',
        label: '严肃程度',
        hint: '0 至 1，下调句长与表情使用率',
        kind: 'ratio',
        step: 0.05,
      },
      {
        key: 'scene_rules',
        label: '群规',
        hint: '管理员设定的禁词与限制',
        kind: 'tags',
        wide: true,
      },
      {
        key: 'mention_only',
        label: '仅被@才回',
        hint: '是否进入纯被动模式',
        kind: 'boolean',
      },
      {
        key: 'speak_rate_target',
        label: '主动程度',
        hint: '长期统计目标占比，用于校准',
        kind: 'ratio',
        step: 0.01,
        display: 'percent',
      },
    ],
  },
];

export const GROUP_ATTRIBUTE_COUNT = GROUP_PERSONA_GROUPS.reduce(
  (total, group) => total + group.fields.length,
  0,
);

const GROUP_FALLBACK: Record<string, PersonaValue> = {
  scene_type: '陌生人局',
  narrative: '彼此还不熟，先端着，别抢话，也别急着走。',
  group_persona: '边缘人',
  comfort: 40,
  boundary_here: ['不聊私事', '不接玩笑式暧昧'],
  topic: '还没有明确的话题',
  focus: '旁观',
  phase: '普通',
  explicit_cap: 'none',
  formality: 0.6,
  scene_rules: ['禁政治'],
  mention_only: false,
  speak_rate_target: 0.08,
};

const GROUP_PERSONAS: Record<string, Record<string, PersonaValue>> = {
  'qq-group-oldbooks': {
    scene_type: '兴趣群',
    narrative: '熟客们的闲聊场，不必端着，但别抢话，接住话头就退半步。',
    group_persona: '调解者',
    comfort: 72,
    boundary_here: ['不接玩笑式暧昧', '不替人估价旧书'],
    topic: '周末去城南旧货市场淘线装',
    focus: '被回复',
    phase: '普通',
    explicit_cap: 'none',
    formality: 0.25,
    scene_rules: ['不刷屏', '禁政治'],
    mention_only: false,
    speak_rate_target: 0.18,
  },
  'qq-group-radio': {
    scene_type: '兴趣群',
    narrative: '听众守着节目，她是客人也是常驻，可以接话，但别抢主播的位置。',
    group_persona: '潜水者',
    comfort: 64,
    boundary_here: ['不透露电台外的事', '不接午夜点歌的私人请求'],
    topic: '今晚会读听众来信',
    focus: '旁观',
    phase: '安静',
    explicit_cap: 'none',
    formality: 0.35,
    scene_rules: ['不讨论工资', '禁政治'],
    mention_only: false,
    speak_rate_target: 0.08,
  },
  'qq-group-craft': {
    scene_type: '兴趣群',
    narrative: '手艺人的交流场，懂就多说两句，不懂就问，不装懂。',
    group_persona: '活跃者',
    comfort: 58,
    boundary_here: ['不评价他人作品价格', '不接来图代做'],
    topic: '柿染做书衣的教程',
    focus: '点名领域',
    phase: '普通',
    explicit_cap: 'none',
    formality: 0.4,
    scene_rules: ['不发广告', '不放外链'],
    mention_only: false,
    speak_rate_target: 0.14,
  },
};

export function groupPersonaDefaults(conversationId: string): Record<string, PersonaValue> {
  return { ...GROUP_FALLBACK, ...(GROUP_PERSONAS[conversationId] ?? {}) };
}

const GROUP_OVERRIDE_STORAGE_KEY = 'inkseek-group-persona-values';

function isPersonaValue(value: unknown): value is PersonaValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }

  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function readGroupPersonaOverrides(conversationId: string): Record<string, PersonaValue> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(GROUP_OVERRIDE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const stored = (parsed as Record<string, unknown>)[conversationId];
    if (!stored || typeof stored !== 'object') {
      return {};
    }

    const result: Record<string, PersonaValue> = {};
    Object.entries(stored as Record<string, unknown>).forEach(([key, value]) => {
      if (isPersonaValue(value)) {
        result[key] = value;
      }
    });
    return result;
  } catch {
    return {};
  }
}

const GROUP_META_STORAGE_KEY = 'inkseek-group-persona-meta';

const GROUP_META_FALLBACK: PersonaMetadata = {
  createdAt: '2026-09-05T10:20:00+08:00',
  updatedAt: '2026-11-02T19:30:00+08:00',
  history: [],
};

const GROUP_METADATA: Record<string, PersonaMetadata> = {
  'qq-group-oldbooks': {
    createdAt: '2026-09-05T10:20:00+08:00',
    updatedAt: '2026-11-02T19:30:00+08:00',
    history: [
      {
        id: 'g-oldbooks-1',
        time: '2026-11-02T19:30:00+08:00',
        field: '自在度',
        from: '68',
        to: '72',
        reason: '常驻群聊后更放松',
      },
      {
        id: 'g-oldbooks-2',
        time: '2026-10-27T21:14:00+08:00',
        field: '主动程度',
        from: '0.14',
        to: '0.18',
        reason: '群里话题变多',
      },
      {
        id: 'g-oldbooks-3',
        time: '2026-10-21T20:05:00+08:00',
        field: '群规',
        from: '禁政治',
        to: '不刷屏、禁政治',
        reason: '群主补充规则',
      },
      {
        id: 'g-oldbooks-4',
        time: '2026-10-15T19:48:00+08:00',
        field: '本群额外边界',
        from: '不接玩笑式暧昧',
        to: '不接玩笑式暧昧、不替人估价旧书',
        reason: '曾被追问估价',
      },
      {
        id: 'g-oldbooks-5',
        time: '2026-10-09T22:31:00+08:00',
        field: '一句总纲',
        from: '熟客们的闲聊场，不必端着。',
        to: '熟客们的闲聊场，不必端着，但别抢话，接住话头就退半步。',
        reason: '收敛抢话倾向',
      },
      {
        id: 'g-oldbooks-6',
        time: '2026-10-03T20:22:00+08:00',
        field: '我在群里的角色',
        from: '边缘人',
        to: '调解者',
        reason: '发言被多次接住',
      },
      {
        id: 'g-oldbooks-7',
        time: '2026-09-24T19:16:00+08:00',
        field: '场合类型',
        from: '陌生人局',
        to: '兴趣群',
        reason: '群定位明确',
      },
      {
        id: 'g-oldbooks-8',
        time: '2026-09-16T21:42:00+08:00',
        field: '仅被@才回',
        from: '开启',
        to: '关闭',
        reason: '开始主动接话',
      },
      {
        id: 'g-oldbooks-9',
        time: '2026-09-05T10:20:00+08:00',
        field: '群规',
        from: '未同步',
        to: '禁政治',
        reason: '初次建立群快照',
      },
    ],
  },
  'qq-group-radio': {
    createdAt: '2026-09-12T22:05:00+08:00',
    updatedAt: '2026-10-30T23:12:00+08:00',
    history: [
      {
        id: 'g-radio-1',
        time: '2026-10-30T23:12:00+08:00',
        field: '本群额外边界',
        from: '不透露电台外的事',
        to: '不透露电台外的事、不接午夜点歌的私人请求',
        reason: '出现越界私信',
      },
      {
        id: 'g-radio-2',
        time: '2026-10-22T22:48:00+08:00',
        field: '自在度',
        from: '58',
        to: '64',
        reason: '和听众熟悉起来',
      },
      {
        id: 'g-radio-3',
        time: '2026-10-11T23:30:00+08:00',
        field: '当前话题',
        from: '节目预告',
        to: '今晚会读听众来信',
        reason: '节目形式调整',
      },
      {
        id: 'g-radio-4',
        time: '2026-10-02T21:20:00+08:00',
        field: '群规',
        from: '不讨论工资',
        to: '不讨论工资、禁政治',
        reason: '群主补充规则',
      },
      {
        id: 'g-radio-5',
        time: '2026-09-20T22:10:00+08:00',
        field: '我在群里的角色',
        from: '常驻听众',
        to: '潜水者',
        reason: '减少存在感',
      },
      {
        id: 'g-radio-6',
        time: '2026-09-12T22:05:00+08:00',
        field: '场合类型',
        from: '未同步',
        to: '兴趣群',
        reason: '初次建立群快照',
      },
    ],
  },
  'qq-group-craft': {
    createdAt: '2026-09-18T14:40:00+08:00',
    updatedAt: '2026-11-01T16:26:00+08:00',
    history: [
      {
        id: 'g-craft-1',
        time: '2026-11-01T16:26:00+08:00',
        field: '主动程度',
        from: '0.1',
        to: '0.14',
        reason: '教程讨论变多',
      },
      {
        id: 'g-craft-2',
        time: '2026-10-24T15:02:00+08:00',
        field: '本群额外边界',
        from: '不评价他人作品价格',
        to: '不评价他人作品价格、不接来图代做',
        reason: '收到代做请求',
      },
      {
        id: 'g-craft-3',
        time: '2026-10-14T16:48:00+08:00',
        field: '我在群里的角色',
        from: '潜水者',
        to: '活跃者',
        reason: '开始分享教程',
      },
      {
        id: 'g-craft-4',
        time: '2026-10-05T14:18:00+08:00',
        field: '自在度',
        from: '50',
        to: '58',
        reason: '被认可手艺',
      },
      {
        id: 'g-craft-5',
        time: '2026-09-26T15:35:00+08:00',
        field: '群规',
        from: '不发广告',
        to: '不发广告、不放外链',
        reason: '群主补充规则',
      },
      {
        id: 'g-craft-6',
        time: '2026-09-18T14:40:00+08:00',
        field: '场合类型',
        from: '未同步',
        to: '兴趣群',
        reason: '初次建立群快照',
      },
    ],
  },
};

export function groupPersonaMetadata(conversationId: string): PersonaMetadata {
  return GROUP_METADATA[conversationId] ?? GROUP_META_FALLBACK;
}

export function readGroupPersonaMeta(conversationId: string): PersonaMetadata | null {
  return readPersonaMetadata(GROUP_META_STORAGE_KEY, conversationId);
}

export function writeGroupPersonaMeta(conversationId: string, meta: PersonaMetadata): void {
  writePersonaMetadata(GROUP_META_STORAGE_KEY, conversationId, meta);
}

export function writeGroupPersonaOverride(
  conversationId: string,
  key: string,
  value: PersonaValue,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const raw = window.localStorage.getItem(GROUP_OVERRIDE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    const store = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const current =
      store[conversationId] && typeof store[conversationId] === 'object'
        ? (store[conversationId] as Record<string, unknown>)
        : {};

    store[conversationId] = { ...current, [key]: value };
    window.localStorage.setItem(GROUP_OVERRIDE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    return;
  }
}
