import type { ChatChannelPersonaStateSnapshot, PersonaStateUpdateInput } from '@inkseek/shared';
import type { Channel, ChannelAccent } from '@/lib/connections';
import { LEVEL_OPTIONS } from '@/lib/persona-draft';

export type PersonaValueKind =
  | 'text'
  | 'paragraph'
  | 'quote'
  | 'tags'
  | 'list'
  | 'score'
  | 'number'
  | 'duration'
  | 'boolean'
  | 'code'
  | 'level'
  | 'timezone';

export type PersonaValue = string | number | boolean | readonly string[];

export interface PersonaField {
  key: string;
  label: string;
  hint: string;
  kind: PersonaValueKind;
  wide?: boolean;
  suffix?: string;
  levels?: readonly string[];
  /** Live PersonaState projections (or derived values) cannot be written to the card. */
  readonly?: boolean;
}

export interface PersonaSection {
  id: string;
  title: string;
  fields: readonly PersonaField[];
}

export interface PersonaGroup {
  id: string;
  title: string;
  description: string;
  sections: readonly PersonaSection[];
}

export interface ChannelPersona {
  id: string;
  name: string;
  identity: string;
  quote: string;
  accent: ChannelAccent;
  values: Record<string, PersonaValue>;
}

type StateSnapshot = ChatChannelPersonaStateSnapshot;

interface StateFieldBinding {
  read: (state: StateSnapshot) => PersonaValue;
  input?: (value: PersonaValue) => PersonaStateUpdateInput;
}

const numericValue = (value: PersonaValue): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

/**
 * PersonaState is the only live state row. Keys below are projected into the
 * card editor for display and edits are routed back to PersonaState instead of
 * writing a second copy into ChatChannelPersona.values.
 */
const STATE_FIELD_BINDINGS: Record<string, StateFieldBinding> = {
  doing_now: {
    read: (state) => state.currentActivity,
    input: (value) => ({ currentActivity: String(value).slice(0, 200) }),
  },
  mood_tags: { read: (state) => stateMoodLabel(state) },
  mood_valence: {
    read: (state) => state.moodValence,
    input: (value) => ({ moodValence: numericValue(value) }),
  },
  mood_arousal: {
    read: (state) => state.moodArousal,
    input: (value) => ({ moodArousal: numericValue(value) }),
  },
  mood_dominance: {
    read: (state) => state.moodDominance,
    input: (value) => ({ moodDominance: numericValue(value) }),
  },
  energy: {
    read: (state) => state.energy,
    input: (value) => ({ energy: numericValue(value) }),
  },
  health: {
    read: (state) => state.health,
    input: (value) => ({ health: numericValue(value) }),
  },
  stress: {
    read: (state) => state.stress,
    input: (value) => ({ stress: numericValue(value) }),
  },
  social_battery: {
    read: (state) => state.socialBattery,
    input: (value) => ({ socialBattery: numericValue(value) }),
  },
  attention: {
    read: (state) => state.attention,
    input: (value) => ({ attention: numericValue(value) }),
  },
  sleep_debt: {
    read: (state) => state.sleepDebt,
    input: (value) => ({ sleepDebt: numericValue(value) }),
  },
  grooming: {
    read: (state) => state.grooming,
    input: (value) => ({ grooming: numericValue(value) }),
  },
  location: {
    read: (state) => state.location,
    input: (value) => ({ location: String(value).slice(0, 100) }),
  },
};

export function isStateField(key: string): boolean {
  return key in STATE_FIELD_BINDINGS;
}

export function stateFieldInput(key: string, value: PersonaValue): PersonaStateUpdateInput | null {
  return STATE_FIELD_BINDINGS[key]?.input?.(value) ?? null;
}

export function mergeStateValues(
  values: Record<string, PersonaValue>,
  state: StateSnapshot | null,
): Record<string, PersonaValue> {
  if (!state) {
    return values;
  }
  const merged = { ...values };
  for (const [key, binding] of Object.entries(STATE_FIELD_BINDINGS)) {
    merged[key] = binding.read(state);
  }
  return merged;
}

export function stateMoodLabel(state: Pick<StateSnapshot, 'moodValence' | 'moodArousal'>): string {
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

const EMPTY_SECTION = '';

export const PERSONA_GROUPS: readonly PersonaGroup[] = [
  {
    id: 'identity',
    title: '身份与外观',
    description: '角色的稳定外在设定，用于称呼、画面描写与空间感校准。',
    sections: [
      {
        id: 'identity-core',
        title: EMPTY_SECTION,
        fields: [
          { key: 'name', label: '姓名', hint: '角色正式名称，用于称呼与识别', kind: 'text' },
          { key: 'aliases', label: '化名与绰号', hint: '除正式姓名外的其他称呼', kind: 'tags' },
          {
            key: 'keywords',
            label: '关键词',
            hint: '来自角色卡的卡面关键词',
            kind: 'tags',
            wide: true,
          },
          {
            key: 'age',
            label: '年龄',
            hint: '角色的外表与心理年龄参考',
            kind: 'number',
            suffix: '岁',
          },
          {
            key: 'gender',
            label: '性别',
            hint: '角色的性别设定',
            kind: 'text',
          },
          {
            key: 'identity',
            label: '身份',
            hint: '角色在社会中的定位',
            kind: 'text',
            wide: true,
          },
          {
            key: 'occupation',
            label: '职业',
            hint: '长期从事的工作，影响作息与话题',
            kind: 'text',
            wide: true,
          },
          { key: 'race', label: '种族', hint: '物种设定，非人类需补生理差异', kind: 'text' },
          {
            key: 'height_cm',
            label: '身高',
            hint: '空间感与体型对比参考',
            kind: 'number',
            suffix: '厘米',
          },
          {
            key: 'weight_kg',
            label: '体重',
            hint: '外观与体能参考，不作价值评判',
            kind: 'number',
            suffix: '千克',
          },
          { key: 'body_type', label: '体型描述', hint: '身体轮廓的中性描述', kind: 'text' },
          {
            key: 'appearance',
            label: '外貌描述',
            hint: '肤色、五官、眼神等稳定特征',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'hair',
            label: '发型描述',
            hint: '发型、发色、发质与打理方式',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'outfit',
            label: '服装描述',
            hint: '常服风格与场合着装',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'voice',
            label: '声音描述',
            hint: '音高、音色、语速与口癖',
            kind: 'paragraph',
            wide: true,
          },
        ],
      },
    ],
  },
  {
    id: 'world',
    title: '世界与背景',
    description: '角色所处的世界、经历与能力边界，是叙事与知识范围的依据。',
    sections: [
      {
        id: 'world-core',
        title: EMPTY_SECTION,
        fields: [
          {
            key: 'world_setting',
            label: '世界观设定',
            hint: '时代、地理与科技水平',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'backstory',
            label: '背景经历',
            hint: '性格与动机的形成原因',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'knowledge_boundary',
            label: '知识边界',
            hint: '知道什么、不知道什么',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'time_awareness',
            label: '时间感知',
            hint: '决定人格是否可以感知当前时间',
            kind: 'boolean',
          },
        ],
      },
    ],
  },
  {
    id: 'values',
    title: '价值与动机',
    description: '模糊情境下的默认取向、不可谈判项，以及行为的总方向。',
    sections: [
      {
        id: 'values-core',
        title: EMPTY_SECTION,
        fields: [
          {
            key: 'core_values',
            label: '核心价值观',
            hint: '模糊情境下的默认取向，数量不限',
            kind: 'list',
            wide: true,
          },
          {
            key: 'taboos',
            label: '禁忌',
            hint: '会引发不适的话题或行为',
            kind: 'tags',
            wide: true,
          },
          {
            key: 'fears',
            label: '恐惧',
            hint: '被逼近时的退缩来源',
            kind: 'tags',
            wide: true,
          },
          {
            key: 'soft_spots',
            label: '软肋',
            hint: '能打动 TA、让道歉生效的点',
            kind: 'tags',
            wide: true,
          },
          {
            key: 'non_negotiable',
            label: '绝对红线',
            hint: 'TA 绝不让步的原则',
            kind: 'list',
            wide: true,
          },
          {
            key: 'long_term_motivation',
            label: '长期目标',
            hint: '所有行为的总方向',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'current_goal',
            label: '当前目标',
            hint: '近期最想完成的事，完成或失败后应替换',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'doing_now',
            label: '正在做的事',
            hint: '实时状态：读取 PersonaState，编辑会直接更新正在做的事',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'obstacle',
            label: '面临的困难',
            hint: '烦躁、疲惫与欲言又止的具体来源',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'conflict_style',
            label: '冲突风格',
            hint: '一句话描述被冒犯时的反应方式',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'humor_style',
            label: '幽默风格',
            hint: '一句话描述开玩笑的方式与频率',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'memory_bias',
            label: '记忆倾向',
            hint: '一句话描述记住什么、忘记什么',
            kind: 'paragraph',
            wide: true,
          },
        ],
      },
    ],
  },
  {
    id: 'voice',
    title: '说话与称呼',
    description: '决定消息读起来像谁的说话习惯、称呼规则与防破面策略。',
    sections: [
      {
        id: 'voice-speaking',
        title: '说话方式',
        fields: [
          {
            key: 'language_style',
            label: '说话风格',
            hint: '一句话描述 TA 的消息读起来是什么感觉',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'sentence_length',
            label: '句长偏好',
            hint: '一句话描述回复的句子长短倾向',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'punctuation',
            label: '标点习惯',
            hint: '一句话描述标点使用习惯，区分度极高',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'particles',
            label: '语气词',
            hint: '口语感来源，有密度上限',
            kind: 'tags',
          },
          {
            key: 'openers',
            label: '常用开头',
            hint: '开场惯用语',
            kind: 'tags',
          },
          {
            key: 'typo_level',
            label: '口胡概率',
            hint: '打字出错的比例，影响随意感',
            kind: 'level',
            levels: LEVEL_OPTIONS.typo,
          },
          {
            key: 'split_level',
            label: '分条发送',
            hint: '按语义拆成多条发送的偏好',
            kind: 'level',
            levels: LEVEL_OPTIONS.split,
          },
          {
            key: 'emoji_level',
            label: '表情偏向',
            hint: '表情与颜文字的使用频率',
            kind: 'level',
            levels: LEVEL_OPTIONS.emoji,
          },
          {
            key: 'typing_level',
            label: '打字速度',
            hint: '打字速度与停顿带来的节奏感',
            kind: 'level',
            levels: LEVEL_OPTIONS.typing,
          },
        ],
      },
      {
        id: 'voice-address',
        title: '称呼规则',
        fields: [
          {
            key: 'address_for_stranger',
            label: '对陌生人的称呼',
            hint: '初次接触时的称呼方式',
            kind: 'text',
          },
          {
            key: 'address_for_close',
            label: '对熟人的称呼',
            hint: '关系亲近后的称呼方式',
            kind: 'text',
          },
          {
            key: 'forbidden_addresses',
            label: '禁忌称呼',
            hint: '令其不适、不可使用的称呼',
            kind: 'tags',
          },
          {
            key: 'allowed_addresses',
            label: '允许他人对我的称呼',
            hint: '对方可以怎么叫 TA',
            kind: 'tags',
            wide: true,
          },
        ],
      },
      {
        id: 'voice-anchors',
        title: '台词锚点',
        fields: [
          {
            key: 'anchor_quote',
            label: '人格台词',
            hint: '一句话立住人设，卡面用',
            kind: 'quote',
            wide: true,
          },
          {
            key: 'anchor_few_shot',
            label: '风格样本对白',
            hint: '2 至 4 组问答，锚定说话风格',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'banned_words',
            label: '禁用语',
            hint: '绝不出口的词句',
            kind: 'tags',
            wide: true,
          },
        ],
      },
      {
        id: 'voice-in-character',
        title: '防破面规则',
        fields: [
          {
            key: 'in_character_principle',
            label: '防破面总纲',
            hint: '面对第四面墙时的总态度',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'in_character_triggers',
            label: '触发场景与应对',
            hint: '每种撞击对应的处理方式',
            kind: 'tags',
            wide: true,
          },
          {
            key: 'in_character_never',
            label: '人格级绝不做',
            hint: '人格层禁令，不含平台红线',
            kind: 'tags',
            wide: true,
          },
          {
            key: 'in_character_recovery',
            label: '出戏后如何拉回',
            hint: '说漏之后的收场方式',
            kind: 'code',
          },
          {
            key: 'in_character_allowed_meta',
            label: '允许的元话题',
            hint: '可以公开聊的元层内容',
            kind: 'tags',
          },
        ],
      },
    ],
  },
  {
    id: 'rhythm',
    title: '在线状态',
    description: '时区、在线策略与主动性，决定 TA 何时出现、如何回应。',
    sections: [
      {
        id: 'rhythm-core',
        title: EMPTY_SECTION,
        fields: [
          {
            key: 'time_zone',
            label: '时区',
            hint: '决定时间判断的基准时区',
            kind: 'timezone',
          },
          {
            key: 'online_policy',
            label: '在线策略',
            hint: '一句话描述在线状态如何计算',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'sleep_depth',
            label: '睡眠深度',
            hint: '被消息吵醒的概率与反应',
            kind: 'level',
            levels: LEVEL_OPTIONS.sleepDepth,
          },
          {
            key: 'proactivity',
            label: '主动性',
            hint: '发起话题与行动的倾向强度',
            kind: 'score',
          },
          {
            key: 'location',
            label: '当前位置',
            hint: '实时状态：读取 PersonaState，编辑会直接更新当前位置',
            kind: 'text',
          },
        ],
      },
    ],
  },
  {
    id: 'baselines',
    title: '数值基线',
    description: '心理与身体的基线、当前状态，以及情绪、好感的衰减动力学。',
    sections: [
      {
        id: 'baselines-core',
        title: '心理与能力基线',
        fields: [
          {
            key: 'confidence',
            label: '自信',
            hint: '语气肯定度与是否寻求确认',
            kind: 'score',
          },
          {
            key: 'self_control',
            label: '自控力',
            hint: '克制冲动与情绪外露的程度',
            kind: 'score',
          },
          {
            key: 'shame',
            label: '羞耻感',
            hint: '对亲密话题与暴露的敏感度',
            kind: 'score',
          },
          {
            key: 'trust_bias',
            label: '信任倾向',
            hint: '对陌生对象的初始信任',
            kind: 'score',
          },
          {
            key: 'attachment_style',
            label: '依恋程度',
            hint: '一般性依恋倾向与怕疏离程度',
            kind: 'score',
          },
          {
            key: 'possessiveness_base',
            label: '占有欲基线',
            hint: '一般性排他与在意关注分配',
            kind: 'score',
          },
          {
            key: 'agreeableness',
            label: '顺从度',
            hint: '配合与让步倾向，不表示放弃同意权',
            kind: 'score',
          },
          {
            key: 'curiosity',
            label: '好奇心',
            hint: '是否追问与主动挖信息',
            kind: 'score',
          },
          {
            key: 'stamina_max',
            label: '体力上限',
            hint: '持续行动与抗疲劳的天花板',
            kind: 'score',
          },
          { key: 'strength', label: '力量', hint: '搬运、推拉、压制等物理能力', kind: 'score' },
          {
            key: 'agility',
            label: '灵活度',
            hint: '协调、闪避与精细动作',
            kind: 'score',
          },
          {
            key: 'pain_tolerance',
            label: '疼痛耐受度',
            hint: '忍痛时的表现强度',
            kind: 'score',
          },
          {
            key: 'recovery_rate',
            label: '恢复速度',
            hint: '体力与情绪的恢复快慢',
            kind: 'score',
          },
          {
            key: 'sensitivity',
            label: '敏感度',
            hint: '身体刺激的抽象感受倾向，仅叙事参考',
            kind: 'score',
          },
          {
            key: 'sensitivity_map',
            label: '敏感度映射',
            hint: '具体部位或情境的强度表',
            kind: 'tags',
            wide: true,
          },
          {
            key: 'touch_preference',
            label: '触碰偏好',
            hint: '一句话描述喜欢、排斥或需确认的接触',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'physique_effect_cap',
            label: '体型影响上限',
            hint: '体型对能力的最大影响，防高大即无敌',
            kind: 'score',
          },
        ],
      },
      {
        id: 'baselines-state',
        title: '当前状态 · 实时',
        fields: [
          {
            key: 'mood_tags',
            label: '当前情绪',
            hint: '由情绪好坏与唤醒实时推导，只读',
            kind: 'text',
            readonly: true,
          },
          {
            key: 'mood_valence',
            label: '情绪好坏',
            hint: '范围为 -100 到 100，实时同步 PersonaState',
            kind: 'number',
          },
          {
            key: 'mood_arousal',
            label: '情绪唤醒',
            hint: '0 到 100，越高越亢奋',
            kind: 'score',
          },
          {
            key: 'mood_dominance',
            label: '掌控感',
            hint: '范围为 -100 到 100，实时同步 PersonaState',
            kind: 'number',
          },
          {
            key: 'energy',
            label: '精力',
            hint: '0 到 100，直接更新 PersonaState',
            kind: 'score',
          },
          {
            key: 'health',
            label: '健康度',
            hint: '0 到 100，睡眠不足或被强行叫醒会下降',
            kind: 'score',
          },
          {
            key: 'stress',
            label: '压力',
            hint: '0 到 100，有恢复途径',
            kind: 'score',
          },
          {
            key: 'social_battery',
            label: '社交电量',
            hint: '0 到 100，耗尽后回复变短',
            kind: 'score',
          },
          {
            key: 'attention',
            label: '注意力',
            hint: '0 到 100，当前对话的关注度',
            kind: 'score',
          },
          {
            key: 'sleep_debt',
            label: '睡眠债',
            hint: '0 到 100，越高越困',
            kind: 'score',
          },
          {
            key: 'health_tags',
            label: '健康状态',
            hint: '身体状况标签，优先于体能数值',
            kind: 'tags',
          },
          {
            key: 'grooming',
            label: '整洁程度',
            hint: '对仪容与环境整洁的当前状态',
            kind: 'score',
          },
        ],
      },
      {
        id: 'baselines-dynamics',
        title: '动态参数',
        fields: [
          {
            key: 'emotional_inertia_sec',
            label: '情绪惯性',
            hint: '情绪受影响后维持时长',
            kind: 'duration',
          },
          {
            key: 'mood_decay_halflife_sec',
            label: '心情衰减半衰期',
            hint: '心情回落速度',
            kind: 'duration',
          },
          {
            key: 'affinity_halflife_day',
            label: '好感半衰期',
            hint: '长期不互动时关系回归速度',
            kind: 'number',
            suffix: '天',
          },
          {
            key: 'stress_recovery_halflife_sec',
            label: '压力恢复半衰期',
            hint: '压力消退速度',
            kind: 'duration',
          },
        ],
      },
    ],
  },
  {
    id: 'boundaries',
    title: '边界与同意',
    description: '不可越过的硬限制、可承载尺度与拒绝方式，只可加严不可削减。',
    sections: [
      {
        id: 'boundaries-core',
        title: EMPTY_SECTION,
        fields: [
          {
            key: 'hard_limits_global',
            label: '全局硬限制',
            hint: '人格绝对禁止项，只可加严不可削减',
            kind: 'tags',
            wide: true,
          },
          {
            key: 'explicit_level_char',
            label: '角色尺度上限',
            hint: '一句话描述角色自身可承载的内容尺度',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'scene_style',
            label: '场景写法',
            hint: '详细场景模式下的视角、详略、节奏与用词；留空用默认写法',
            kind: 'paragraph',
            wide: true,
          },
          {
            key: 'experience_level',
            label: '经验等级',
            hint: '相关互动的经验程度，不改变同意规则',
            kind: 'number',
            suffix: '级',
          },
          {
            key: 'aftercare_need_base',
            label: '事后照护基线',
            hint: '亲密后对安抚与复盘的需求',
            kind: 'score',
          },
          {
            key: 'decline_response_style',
            label: '拒绝行为模板',
            hint: '拒绝或被拒时的表现方式',
            kind: 'paragraph',
            wide: true,
          },
        ],
      },
    ],
  },
  {
    id: 'meta',
    title: '元信息',
    description: '卡片的创建、修订与校验记录，用于版本追踪与印刷检索。',
    sections: [
      {
        id: 'meta-core',
        title: EMPTY_SECTION,
        fields: [
          { key: 'card_serial', label: '角色卡编号', hint: '复制来源的角色卡编号', kind: 'code' },
          {
            key: 'card_experience',
            label: '卡面经验',
            hint: '角色卡记录的经验等级',
            kind: 'code',
          },
          {
            key: 'card_traits',
            label: '卡面特质',
            hint: '角色卡上的全部特质数值',
            kind: 'tags',
            wide: true,
          },
          {
            key: 'card_physical',
            label: '卡面体能',
            hint: '角色卡上的全部体能数值',
            kind: 'tags',
            wide: true,
          },
          { key: 'created_at', label: '创建时间', hint: '卡片首次保存时间', kind: 'code' },
          { key: 'updated_at', label: '修订时间', hint: '最近一次修改时间', kind: 'code' },
        ],
      },
    ],
  },
];

export const PERSONA_FIELD_LABELS: ReadonlyMap<string, string> = new Map(
  PERSONA_GROUPS.flatMap((group) =>
    group.sections.flatMap((section) =>
      section.fields.map((field) => [field.key, field.label] as const),
    ),
  ),
);

export const PERSONA_ATTRIBUTE_COUNT = PERSONA_GROUPS.reduce(
  (total, group) =>
    total +
    group.sections.reduce((sectionTotal, section) => sectionTotal + section.fields.length, 0),
  0,
);

const EMPTY_PERSONA_VALUES: Record<string, PersonaValue> = {
  name: '未命名人格',
  identity: '尚未导入角色卡',
  anchor_quote: '角色卡尚未导入',
};

export function personaForChannel(channel: Channel): ChannelPersona {
  const snapshot = channel.persona;

  if (snapshot) {
    return {
      id: snapshot.id,
      name: snapshot.name,
      identity: snapshot.identity || snapshot.name,
      quote: snapshot.quote,
      accent: snapshot.accent,
      values: {
        ...snapshot.values,
        name: snapshot.name,
        anchor_quote: snapshot.quote || String(snapshot.values['anchor_quote'] ?? ''),
      },
    };
  }

  return {
    id: `channel-${channel.id}`,
    name: '未命名人格',
    identity: '尚未导入角色卡',
    quote: '角色卡尚未导入',
    accent: channel.accent,
    values: { ...EMPTY_PERSONA_VALUES },
  };
}

const PERSONA_OVERRIDE_STORAGE_KEY = 'inkseek-channel-persona-values';

const LEGACY_OVERRIDE_KEYS: Record<string, string> = {
  social_battery_max: 'social_battery',
};

function isPersonaValue(value: unknown): value is PersonaValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }

  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function readChannelPersonaOverrides(channelId: string): Record<string, PersonaValue> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PERSONA_OVERRIDE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const stored = (parsed as Record<string, unknown>)[channelId];
    if (!stored || typeof stored !== 'object') {
      return {};
    }

    const result: Record<string, PersonaValue> = {};
    Object.entries(stored as Record<string, unknown>).forEach(([key, value]) => {
      if (isPersonaValue(value)) {
        result[key] = value;
      }
    });

    Object.entries(LEGACY_OVERRIDE_KEYS).forEach(([legacy, canonical]) => {
      const legacyValue = result[legacy];
      if (legacyValue !== undefined) {
        result[canonical] ??= legacyValue;
        delete result[legacy];
      }
    });
    return result;
  } catch {
    return {};
  }
}

export function clearChannelPersonaOverrides(channelId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const raw = window.localStorage.getItem(PERSONA_OVERRIDE_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return;
    }

    const store = parsed as Record<string, unknown>;
    if (!(channelId in store)) {
      return;
    }

    delete store[channelId];
    window.localStorage.setItem(PERSONA_OVERRIDE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    return;
  }
}
