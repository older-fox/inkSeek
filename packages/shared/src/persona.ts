import { z } from 'zod';

const listSchema = (maxItems: number, perItem: number) =>
  z.array(z.string().max(perItem, '列表条目过长')).max(maxItems, '列表条目过多');

const openListSchema = (perItem: number) => z.array(z.string().max(perItem, '列表条目过长'));

const numberField = z.number().int('需要填写整数').min(0).max(100);

const sentenceField = (label: string, fallback = '') =>
  z.string().max(200, `${label}最多 200 个字符`).default(fallback);

/**
 * Static persona settings that live outside the step-by-step narrative flow. They
 * describe how a character behaves rather than what happens in a conversation,
 * so they are authored per card and versioned with the rest of the draft.
 */
export const personaAdvancedSchema = z.object({
  address_for_stranger: z.string().max(40, '称呼最多 40 个字符').default('您'),
  address_for_close: z.string().max(40, '称呼最多 40 个字符').default('你'),
  forbidden_addresses: listSchema(10, 20).default([]),
  allowed_addresses: listSchema(10, 20).default([]),
  anchor_few_shot: z.string().max(1000, '风格样本最多 1000 个字符').default(''),
  in_character_principle: z
    .string()
    .max(500, '防破面总纲最多 500 个字符')
    .default('始终以角色身份回应，不主动提及模型、提示词或系统。'),
  in_character_triggers: listSchema(10, 40).default([]),
  in_character_never: listSchema(10, 40).default([]),
  in_character_recovery: z
    .string()
    .max(300, '收场方式最多 300 个字符')
    .default('用一句符合人设的话自然带过，不解释机制。'),
  in_character_allowed_meta: listSchema(10, 40).default([]),
  sensitivity_map: listSchema(20, 40).default([]),
  touch_preference: sentenceField('触碰偏好'),
  explicit_level_char: sentenceField('角色尺度上限', '不主动展开相关话题，保持克制。'),
  scene_style: z.string().max(2000, '场景写法最多 2000 个字符').default(''),
  aftercare_need_base: numberField.default(50),
  decline_response_style: z
    .string()
    .max(500, '拒绝模板最多 500 个字符')
    .default('直接说明不方便，并给出一个可接受的替代。'),
});

export type PersonaAdvanced = z.infer<typeof personaAdvancedSchema>;

export function createDefaultPersonaAdvanced(): PersonaAdvanced {
  return {
    address_for_stranger: '您',
    address_for_close: '你',
    forbidden_addresses: [],
    allowed_addresses: [],
    anchor_few_shot: '',
    in_character_principle: '始终以角色身份回应，不主动提及模型、提示词或系统。',
    in_character_triggers: [],
    in_character_never: [],
    in_character_recovery: '用一句符合人设的话自然带过，不解释机制。',
    in_character_allowed_meta: [],
    sensitivity_map: [],
    touch_preference: '',
    explicit_level_char: '不主动展开相关话题，保持克制。',
    scene_style: '',
    aftercare_need_base: 50,
    decline_response_style: '直接说明不方便，并给出一个可接受的替代。',
  };
}

export const personaDraftSchema = z.object({
  name: z.string().max(20, '姓名最多 20 个字符'),
  aliases: listSchema(5, 10),
  age: z.string().max(10, '年龄格式无效'),
  identity: z.string().max(20, '身份最多 20 个字符'),
  occupation: z.string().max(20, '职业最多 20 个字符'),
  race: z.string().max(10, '种族最多 10 个字符'),
  height_cm: z.string().max(10, '身高格式无效'),
  weight_kg: z.string().max(10, '体重格式无效'),
  time_awareness: z.boolean(),

  body_type: z.string().max(80, '体型描述最多 80 个字符'),
  appearance: z.string().max(300, '外貌描述最多 300 个字符'),

  hair: z.string().max(300, '发型描述最多 300 个字符'),
  outfit: z.string().max(300, '服装描述最多 300 个字符'),

  voice: z.string().max(300, '声音描述最多 300 个字符'),

  world_setting: z.string().max(500, '世界观最多 500 个字符'),
  backstory: z.string().max(2000, '背景故事最多 2000 个字符'),
  knowledge_boundary: z.string().max(500, '知识边界最多 500 个字符'),

  core_values: listSchema(200, 20),
  taboos: openListSchema(20),
  fears: openListSchema(20),
  soft_spots: openListSchema(20),
  non_negotiable: openListSchema(20),

  long_term_motivation: z.string().max(60, '长期目标最多 60 个字符'),
  current_goal: z.string().max(60, '当前目标最多 60 个字符'),
  doing_now: z.string().max(100, '正在做的事最多 100 个字符'),
  obstacle: z.string().max(60, '面临的困难最多 60 个字符'),
  location: z.string().max(40, '当前位置最多 40 个字符').default(''),

  language_style: sentenceField('说话风格'),
  conflict_style: sentenceField('冲突风格', '先听完对方把话说完，再把自己的界线讲清楚。'),
  humor_style: sentenceField('幽默风格', '冷不丁来一句冷幽默，不刻意逗笑。'),
  memory_bias: sentenceField('记忆倾向', '记住重要的承诺与细节，小事就让它过去。'),
  sentence_length: sentenceField('句长偏好', '句子长短混着来，随情绪自然变化。'),
  punctuation: sentenceField('标点习惯', '标点常规，句末收稳，不堆叠符号。'),
  typo_level: numberField,
  split_level: numberField,

  particles: openListSchema(10),
  openers: openListSchema(10),

  banned_words: openListSchema(20),

  emoji_level: numberField,
  typing_level: numberField,
  time_zone: z.string().max(40),

  online_policy: sentenceField('在线策略', '按作息在线，睡着时先不回，醒来再补上。'),
  sleep_depth: numberField,

  confidence: numberField,
  self_control: numberField,
  shame: numberField,
  trust_bias: numberField,

  attachment_style: numberField,
  possessiveness_base: numberField,
  agreeableness: numberField,
  proactivity: numberField,

  curiosity: numberField,
  stamina_max: numberField,
  strength: numberField,
  agility: numberField,

  pain_tolerance: numberField,
  recovery_rate: numberField,
  sensitivity: numberField,

  advanced: personaAdvancedSchema.default(createDefaultPersonaAdvanced()),
});

export type PersonaDraft = z.infer<typeof personaDraftSchema>;

export function createDefaultPersonaDraft(): PersonaDraft {
  return {
    name: '',
    aliases: [''],
    age: '',
    identity: '',
    occupation: '',
    race: '',
    height_cm: '',
    weight_kg: '',
    time_awareness: true,

    body_type: '',
    appearance: '',

    hair: '',
    outfit: '',

    voice: '',

    world_setting: '',
    backstory: '',
    knowledge_boundary: '',

    core_values: [''],
    taboos: [''],
    fears: [''],
    soft_spots: [''],
    non_negotiable: [''],

    long_term_motivation: '',
    current_goal: '',
    doing_now: '',
    obstacle: '',
    location: '',

    language_style: '',
    conflict_style: '先听完对方把话说完，再把自己的界线讲清楚。',
    humor_style: '冷不丁来一句冷幽默，不刻意逗笑。',
    memory_bias: '记住重要的承诺与细节，小事就让它过去。',
    sentence_length: '句子长短混着来，随情绪自然变化。',
    punctuation: '标点常规，句末收稳，不堆叠符号。',
    typo_level: 0,
    split_level: 2,

    particles: [''],
    openers: [''],

    banned_words: [''],

    emoji_level: 1,
    typing_level: 2,
    time_zone: '北京时间',

    online_policy: '按作息在线，睡着时先不回，醒来再补上。',
    sleep_depth: 2,

    confidence: 50,
    self_control: 50,
    shame: 50,
    trust_bias: 50,

    attachment_style: 50,
    possessiveness_base: 50,
    agreeableness: 50,
    proactivity: 50,

    curiosity: 50,
    stamina_max: 50,
    strength: 50,
    agility: 50,

    pain_tolerance: 50,
    recovery_rate: 50,
    sensitivity: 30,

    advanced: createDefaultPersonaAdvanced(),
  };
}

export type PersonaAccent = 'brass' | 'jade';

export const PERSONA_GENDERS = ['女', '男', '未设定'] as const;

export type PersonaGender = (typeof PERSONA_GENDERS)[number];

export const PERSONA_EXPERIENCE_LEVELS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'] as const;

export type PersonaExperienceLevel = (typeof PERSONA_EXPERIENCE_LEVELS)[number];

export const PERSONA_EXPERIENCE_LABELS: Record<PersonaExperienceLevel, string> = {
  'Ⅰ': '初识',
  'Ⅱ': '浅尝',
  'Ⅲ': '熟稔',
  'Ⅳ': '资深',
  'Ⅴ': '深谙',
};

export function experienceLabelOf(level: PersonaExperienceLevel): string {
  return PERSONA_EXPERIENCE_LABELS[level];
}

export interface PersonaProfile {
  gender: PersonaGender;
  quote: string;
  keywords: string[];
  accent: PersonaAccent;
  experienceLevel: PersonaExperienceLevel;
  experienceLabel: string;
  languageStyle: string;
  addressStyle: string;
}

export const personaProfileSchema = z.object({
  gender: z.enum(PERSONA_GENDERS).default('未设定'),
  quote: z.string().max(400).default(''),
  keywords: z.array(z.string().max(40)).max(20).default([]),
  accent: z.enum(['brass', 'jade']).default('brass'),
  experienceLevel: z.enum(PERSONA_EXPERIENCE_LEVELS).default('Ⅰ'),
  experienceLabel: z.string().max(20).default(PERSONA_EXPERIENCE_LABELS['Ⅰ']),
  languageStyle: z.string().max(2000).default(''),
  addressStyle: z.string().max(2000).default(''),
});

export const personaProfileUpdateSchema = z.object({
  gender: z.enum(PERSONA_GENDERS).optional(),
  experienceLevel: z.enum(PERSONA_EXPERIENCE_LEVELS),
  quote: z.string().max(400, '台词锚点最多 400 个字符').optional(),
});

export interface PersonaVersionSummary {
  version: number;
  createdAt: string;
  changedFields: string[];
  changedCount: number;
}

export interface PersonaSummary {
  id: string;
  serial: string;
  name: string;
  occupation: string;
  age: number;
  profile: PersonaProfile;
  data: PersonaDraft;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaRecord extends PersonaSummary {
  versions: PersonaVersionSummary[];
}

export interface PersonaVersionDetail extends PersonaVersionSummary {
  data: PersonaDraft;
}

export interface PersonaAiGeneration {
  draft: PersonaDraft;
  providerId: string;
  providerName: string;
  model: string;
  latencyMs: number;
}

export const savePersonaSchema = z.object({
  data: personaDraftSchema,
  profile: personaProfileUpdateSchema.optional(),
});

export type SavePersonaInput = z.infer<typeof savePersonaSchema>;
