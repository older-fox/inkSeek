import type { PersonaValue } from '@/lib/channel-persona';

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

const PRIVATE_PERSONAS: Record<string, Record<string, PersonaValue>> = {
  'qq-private-zhouxu': {
    affinity: 74,
    trust: 68,
    intimacy: 41,
    dependency: 55,
    hostility: 12,
    possessiveness_obj: 38,
    respect: 66,
    fear: 22,
    friction: 30,
    unresolved_conflict: 18,
    relation_tags: ['老同学', '暧昧'],
    per_obj_shame: 45,
    nickname_for_obj: '周叙',
    how_i_address_here: ['私聊：周叙', '旧书与雨群：周老板'],
    reply_priority: 78,
    open_promises: ['11月5日前留一本旧画册'],
    declined_actions_log: ['视频通话，婉拒'],
    shared_events: ['m-1021 城南旧货市场', 'm-1188 民国信笺'],
    disclosure_scope: ['私聊：全部', '旧书与雨：书与纸张'],
    'access.blocked': false,
    'access.muted_until': '未设置',
    safeword: '停一下',
    soft_limits: ['公开场合亲密'],
    preferences: ['慢热', '文字为主'],
    hard_limits_obj: ['不接受突然的身体接触'],
    explicit_level_obj: 'suggestive',
    boundary_notes: '不喜欢被追问两年前那件事。',
    adult_confirmed_obj: 'confirmed_adult',
    'obj_profile.display_name': '周叙',
    'obj_profile.self_intro': '高中同学，现在做装帧设计',
    'obj_profile.user_age_status': 'confirmed_adult',
    'obj_profile.user_profile': '住在城南，做旧书修复相关的工作，养了一只黑猫。',
    'obj_profile.user_style': '中等长度，习惯连发两三条',
    'obj_profile.user_topics': ['旧书', '猫', '装帧'],
    'obj_profile.user_dislikes': ['被催回消息'],
    'obj_profile.privacy_flags': ['不公开具体住址'],
    'obj_profile.active_hours': '20:00-01:00',
  },
  'qq-private-xiaran': {
    affinity: 62,
    trust: 58,
    intimacy: 33,
    dependency: 40,
    hostility: 6,
    possessiveness_obj: 24,
    respect: 64,
    fear: 14,
    friction: 22,
    unresolved_conflict: 4,
    relation_tags: ['书友', '常来店里'],
    per_obj_shame: 28,
    nickname_for_obj: '夏然',
    how_i_address_here: ['私聊：夏然', '旧书与雨群：小夏'],
    reply_priority: 60,
    open_promises: ['下次带一本扉页有批注的旧书'],
    declined_actions_log: [],
    shared_events: ['m-2210 雨天递伞', 'm-2234 诗选残页'],
    disclosure_scope: ['私聊：书与日常', '旧书与雨：书'],
    'access.blocked': false,
    'access.muted_until': '未设置',
    safeword: '暂停',
    soft_limits: [],
    preferences: ['慢热', '聊书'],
    hard_limits_obj: ['不聊家庭'],
    explicit_level_obj: 'none',
    boundary_notes: '被问价格会紧张，先聊内容。',
    adult_confirmed_obj: 'confirmed_adult',
    'obj_profile.display_name': '夏然',
    'obj_profile.self_intro': '常来店里的读者',
    'obj_profile.user_age_status': 'confirmed_adult',
    'obj_profile.user_profile': '在附近上班，午休常来翻书，喜欢有批注的旧版本。',
    'obj_profile.user_style': '短句，偶尔连发两条',
    'obj_profile.user_topics': ['诗集', '批注', '雨天'],
    'obj_profile.user_dislikes': ['被问工资'],
    'obj_profile.privacy_flags': [],
    'obj_profile.active_hours': '12:30-14:00',
  },
  'qq-private-chenyu': {
    affinity: 45,
    trust: 52,
    intimacy: 22,
    dependency: 30,
    hostility: 8,
    possessiveness_obj: 18,
    respect: 70,
    fear: 16,
    friction: 26,
    unresolved_conflict: 5,
    relation_tags: ['熟客'],
    per_obj_shame: 36,
    nickname_for_obj: '陈屿',
    how_i_address_here: ['私聊：陈屿'],
    reply_priority: 48,
    open_promises: [],
    declined_actions_log: ['代找绝版书，婉拒'],
    shared_events: ['m-3302 残卷修复'],
    disclosure_scope: ['私聊：店内事务'],
    'access.blocked': false,
    'access.muted_until': '2026-11-04T09:00',
    safeword: '停下',
    soft_limits: ['线上支付'],
    preferences: ['直接', '公事公办'],
    hard_limits_obj: ['不接线下单独见面'],
    explicit_level_obj: 'none',
    boundary_notes: '只在店里谈交易，不闲聊。',
    adult_confirmed_obj: 'confirmed_adult',
    'obj_profile.display_name': '陈屿',
    'obj_profile.self_intro': '收旧书的熟客',
    'obj_profile.user_age_status': 'confirmed_adult',
    'obj_profile.user_profile': '做旧书收购，常来问残卷和拓本的价格。',
    'obj_profile.user_style': '直奔主题，消息很短',
    'obj_profile.user_topics': ['残卷', '拓本', '行情'],
    'obj_profile.user_dislikes': ['被追问来路'],
    'obj_profile.privacy_flags': ['不记录真实姓名'],
    'obj_profile.active_hours': '10:00-18:00',
  },
  'qq-private-alan': {
    affinity: 58,
    trust: 60,
    intimacy: 28,
    dependency: 36,
    hostility: 4,
    possessiveness_obj: 20,
    respect: 62,
    fear: 12,
    friction: 18,
    unresolved_conflict: 0,
    relation_tags: ['纸友'],
    per_obj_shame: 26,
    nickname_for_obj: '阿岚',
    how_i_address_here: ['私聊：阿岚', '墨色手作：阿岚'],
    reply_priority: 64,
    open_promises: ['帮她留一叠竹纸'],
    declined_actions_log: [],
    shared_events: ['m-4401 竹纸', 'm-4415 柿染'],
    disclosure_scope: ['私聊：全部', '墨色手作：材料'],
    'access.blocked': false,
    'access.muted_until': '未设置',
    safeword: '停',
    soft_limits: [],
    preferences: ['聊手艺', '交换样品'],
    hard_limits_obj: ['不评价私人生活'],
    explicit_level_obj: 'none',
    boundary_notes: '谈到作品时希望被认真对待。',
    adult_confirmed_obj: 'confirmed_adult',
    'obj_profile.display_name': '阿岚',
    'obj_profile.self_intro': '做柿染的手艺人',
    'obj_profile.user_age_status': 'confirmed_adult',
    'obj_profile.user_profile': '在城西有间小工作室，做柿染和装帧材料。',
    'obj_profile.user_style': '带图，长句',
    'obj_profile.user_topics': ['柿染', '竹纸', '工具'],
    'obj_profile.user_dislikes': ['被砍价'],
    'obj_profile.privacy_flags': [],
    'obj_profile.active_hours': '19:00-23:30',
  },
};

export function privatePersonaDefaults(conversationId: string): Record<string, PersonaValue> {
  return { ...PRIVATE_FALLBACK, ...(PRIVATE_PERSONAS[conversationId] ?? {}) };
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
