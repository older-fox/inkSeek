import type { PersonaValue } from '@/lib/channel-persona';
import {
  readPersonaMetadata,
  writePersonaMetadata,
  type PersonaMetadata,
} from '@/lib/persona-metadata';

export type PrivateFieldKind = 'text' | 'paragraph' | 'tags' | 'list' | 'score' | 'boolean';

export interface PrivateField {
  key: string;
  label: string;
  hint: string;
  kind: PrivateFieldKind;
  wide?: boolean;
  placeholder?: string;
}

export interface PrivatePersonaGroup {
  id: string;
  title: string;
  tagline: string;
  description: string;
  fields: readonly PrivateField[];
}

/**
 * 私聊长期关系属性：一人一份，群聊与私聊共用同一份基线。
 * 关系数值 / 关系描述 / 边界与同意 / 对象档案，共 37 项。
 */
export const PRIVATE_PERSONA_GROUPS: readonly PrivatePersonaGroup[] = [
  {
    id: 'numbers',
    title: '关系数值',
    tagline: '长期关系',
    description: 'TA 对这个人长期积累下来的分寸与距离，跨场合稳定，不随单个群改变。',
    fields: [
      { key: 'affinity', label: '好感', hint: '语气柔和度与耐心', kind: 'score' },
      { key: 'trust', label: '信任度', hint: '采信程度与信息透露意愿', kind: 'score' },
      { key: 'intimacy', label: '亲密程度', hint: '距离感与私密话题接受度', kind: 'score' },
      { key: 'dependency', label: '依赖', hint: '寻求陪伴与情绪支持的倾向', kind: 'score' },
      { key: 'hostility', label: '仇恨值', hint: '敌意解读与接触回避', kind: 'score' },
      {
        key: 'possessiveness_obj',
        label: '占有欲',
        hint: '对该对象的排他与优先级在意',
        kind: 'score',
      },
      { key: 'respect', label: '尊重度', hint: '与好感正交，可喜欢但不尊重', kind: 'score' },
      { key: 'fear', label: '畏惧顾虑', hint: '敢不敢说不、是否怕失去', kind: 'score' },
      { key: 'friction', label: '沟通成本', hint: '误解与摩擦频率', kind: 'score' },
      {
        key: 'unresolved_conflict',
        label: '未解决冲突',
        hint: '争吵余量，随道歉消退',
        kind: 'score',
      },
    ],
  },
  {
    id: 'behavior',
    title: '关系描述',
    tagline: '行为与称呼',
    description: '关系处在哪个阶段、私下怎么称呼、答应过什么，以及哪些场合不能说什么。',
    fields: [
      {
        key: 'relation_tags',
        label: '关系描述',
        hint: '关系阶段文字标签，冲突时以它为准',
        kind: 'tags',
        wide: true,
      },
      {
        key: 'per_obj_shame',
        label: '对该对象的羞耻度',
        hint: '在此人面前的放松或拘谨',
        kind: 'score',
      },
      { key: 'nickname_for_obj', label: '私下称呼', hint: '角色私下如何称呼对方', kind: 'text' },
      {
        key: 'how_i_address_here',
        label: '各场合称呼',
        hint: '按场合分别记录称呼，一行一处',
        kind: 'list',
        wide: true,
        placeholder: '私聊：周叙\n旧书与雨群：周老板',
      },
      { key: 'reply_priority', label: '回复优先级', hint: '决定等待窗与抢占权', kind: 'score' },
      {
        key: 'open_promises',
        label: '承诺清单',
        hint: '未兑现的承诺，可被对方质问',
        kind: 'list',
        wide: true,
        placeholder: '一行一条',
      },
      {
        key: 'declined_actions_log',
        label: '已拒行为记录',
        hint: '曾被拒的行为，再提需重新明确同意',
        kind: 'list',
        wide: true,
        placeholder: '一行一条',
      },
      {
        key: 'shared_events',
        label: '共同经历索引',
        hint: '指向记忆条目的共同经历',
        kind: 'list',
        wide: true,
        placeholder: '一行一条',
      },
      {
        key: 'disclosure_scope',
        label: '可公开范围',
        hint: '按场合限制哪些事实可说，一行一处',
        kind: 'list',
        wide: true,
        placeholder: '私聊：全部\n旧书与雨：书与纸张',
      },
      { key: 'access.blocked', label: '是否拉黑', hint: '彻底拒绝交流', kind: 'boolean' },
      {
        key: 'access.muted_until',
        label: '静默截止',
        hint: '暂时不回复的截止时间',
        kind: 'text',
      },
    ],
  },
  {
    id: 'boundaries',
    title: '边界与同意',
    tagline: '底线',
    description: '这些项只能加严、不能削减，任何对话都不能越过这里的约定。',
    fields: [
      {
        key: 'safeword',
        label: '安全词',
        hint: '双方约定的停止信号，出现即停',
        kind: 'text',
      },
      {
        key: 'soft_limits',
        label: '软限制',
        hint: '需谨慎或需确认的事项',
        kind: 'list',
        wide: true,
        placeholder: '一行一条',
      },
      {
        key: 'preferences',
        label: '偏好',
        hint: '合意偏好类别，不等于许可',
        kind: 'tags',
      },
      {
        key: 'hard_limits_obj',
        label: '对象侧硬限制',
        hint: '仅可在全局之上追加，不可削减',
        kind: 'list',
        wide: true,
        placeholder: '一行一条',
      },
      {
        key: 'explicit_level_obj',
        label: '对象侧尺度上限',
        hint: '受角色卡级别与场合双重压制',
        kind: 'text',
      },
      {
        key: 'boundary_notes',
        label: '边界备注',
        hint: '触发点与禁忌话题',
        kind: 'paragraph',
        wide: true,
      },
      {
        key: 'adult_confirmed_obj',
        label: '对象成年确认',
        hint: '未知即按未确认处理',
        kind: 'text',
      },
    ],
  },
  {
    id: 'profile',
    title: '对象档案',
    tagline: '对方',
    description: '对方主动告知、并允许记住的信息，用来让称呼与话题自然贴合。',
    fields: [
      { key: 'obj_profile.display_name', label: '对方昵称', hint: '对方的显示名', kind: 'text' },
      {
        key: 'obj_profile.self_intro',
        label: '自称与关系说明',
        hint: '对方如何介绍自己',
        kind: 'text',
        wide: true,
      },
      {
        key: 'obj_profile.user_age_status',
        label: '年龄状态',
        hint: '对方是否已确认为成年人',
        kind: 'text',
      },
      {
        key: 'obj_profile.user_profile',
        label: '已知事实',
        hint: '对方主动告知的信息',
        kind: 'paragraph',
        wide: true,
      },
      {
        key: 'obj_profile.user_style',
        label: '表达风格',
        hint: '对方的消息长短与频率',
        kind: 'text',
      },
      {
        key: 'obj_profile.user_topics',
        label: '话题偏好',
        hint: '对方爱聊的话题',
        kind: 'tags',
        wide: true,
      },
      {
        key: 'obj_profile.user_dislikes',
        label: '回避话题',
        hint: '对方明确不聊的内容',
        kind: 'tags',
        wide: true,
      },
      {
        key: 'obj_profile.privacy_flags',
        label: '隐私开关',
        hint: '要求记住或忘记的项',
        kind: 'list',
        wide: true,
        placeholder: '一行一条',
      },
      {
        key: 'obj_profile.active_hours',
        label: '活跃时段',
        hint: '对方常在线的时间',
        kind: 'text',
      },
    ],
  },
];

export const PRIVATE_ATTRIBUTE_COUNT = PRIVATE_PERSONA_GROUPS.reduce(
  (total, group) => total + group.fields.length,
  0,
);

const PRIVATE_FALLBACK: Record<string, PersonaValue> = {
  affinity: 50,
  trust: 50,
  intimacy: 50,
  dependency: 50,
  hostility: 50,
  possessiveness_obj: 50,
  respect: 50,
  fear: 50,
  friction: 50,
  unresolved_conflict: 50,
  relation_tags: ['刚认识'],
  per_obj_shame: 50,
  nickname_for_obj: '对方',
  how_i_address_here: ['私聊：对方'],
  reply_priority: 50,
  open_promises: [],
  declined_actions_log: [],
  shared_events: [],
  disclosure_scope: ['私聊：全部'],
  'access.blocked': false,
  'access.muted_until': '未设置',
  safeword: '停一下',
  soft_limits: [],
  preferences: [],
  hard_limits_obj: [],
  explicit_level_obj: 'none',
  boundary_notes: '还没有记录触发点。',
  adult_confirmed_obj: 'none',
  'obj_profile.display_name': '对方',
  'obj_profile.self_intro': '还没有介绍过自己',
  'obj_profile.user_age_status': 'none',
  'obj_profile.user_profile': '还没有同步到已知事实。',
  'obj_profile.user_style': '未知',
  'obj_profile.user_topics': [],
  'obj_profile.user_dislikes': [],
  'obj_profile.privacy_flags': [],
  'obj_profile.active_hours': '未知',
};

export function privatePersonaDefaults(): Record<string, PersonaValue> {
  return { ...PRIVATE_FALLBACK };
}

const PRIVATE_META_STORAGE_KEY = 'inkseek-private-persona-meta';

const PRIVATE_META_FALLBACK: PersonaMetadata = {
  createdAt: '2026-08-14T21:06:00+08:00',
  updatedAt: '2026-11-02T20:44:00+08:00',
  history: [],
};

export function privatePersonaMetadata(): PersonaMetadata {
  return PRIVATE_META_FALLBACK;
}

export function readPrivatePersonaMeta(conversationId: string): PersonaMetadata | null {
  return readPersonaMetadata(PRIVATE_META_STORAGE_KEY, conversationId);
}

export function writePrivatePersonaMeta(conversationId: string, meta: PersonaMetadata): void {
  writePersonaMetadata(PRIVATE_META_STORAGE_KEY, conversationId, meta);
}

const PRIVATE_OVERRIDE_STORAGE_KEY = 'inkseek-private-persona-values';

function isPersonaValue(value: unknown): value is PersonaValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }

  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function readPrivatePersonaOverrides(conversationId: string): Record<string, PersonaValue> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PRIVATE_OVERRIDE_STORAGE_KEY);
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

export function writePrivatePersonaOverride(
  conversationId: string,
  key: string,
  value: PersonaValue,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const raw = window.localStorage.getItem(PRIVATE_OVERRIDE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    const store = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const current =
      store[conversationId] && typeof store[conversationId] === 'object'
        ? (store[conversationId] as Record<string, unknown>)
        : {};

    store[conversationId] = { ...current, [key]: value };
    window.localStorage.setItem(PRIVATE_OVERRIDE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    return;
  }
}
