import { z } from 'zod';

export type ConflictStyle =
  | '回避'
  | '对抗'
  | '讲理'
  | '冷战'
  | '先退后解释'
  | '先听完再划界'
  | '先降温再划界';

export type HumorStyle = '冷幽默' | '自嘲' | '吐槽' | '不接梗' | '机锋';

export type MemoryBias = '均衡' | '记细节' | '记仇' | '健忘' | '偏记人' | '偏记声音';

export type SentenceLength = '短句' | '中句' | '长句' | '长短混用';

export type PunctuationStyle =
  | '极简'
  | '常规'
  | '柔软'
  | '严整'
  | '活泼'
  | '书卷'
  | '省略号偏多';

export type OnlinePolicy = '常在线' | '按作息' | '自适应';

export const CONFLICT_STYLES = [
  '回避',
  '对抗',
  '讲理',
  '冷战',
  '先退后解释',
  '先听完再划界',
  '先降温再划界',
] as const satisfies readonly ConflictStyle[];

export const HUMOR_STYLES = [
  '冷幽默',
  '自嘲',
  '吐槽',
  '不接梗',
  '机锋',
] as const satisfies readonly HumorStyle[];

export const MEMORY_BIASES = [
  '均衡',
  '记细节',
  '记仇',
  '健忘',
  '偏记人',
  '偏记声音',
] as const satisfies readonly MemoryBias[];

export const SENTENCE_LENGTHS = [
  '短句',
  '中句',
  '长句',
  '长短混用',
] as const satisfies readonly SentenceLength[];

export const PUNCTUATION_STYLES = [
  '极简',
  '常规',
  '柔软',
  '严整',
  '活泼',
  '书卷',
  '省略号偏多',
] as const satisfies readonly PunctuationStyle[];

export const ONLINE_POLICIES = [
  '常在线',
  '按作息',
  '自适应',
] as const satisfies readonly OnlinePolicy[];

const listSchema = (maxItems: number, perItem: number) =>
  z.array(z.string().max(perItem, '列表条目过长')).max(maxItems, '列表条目过多');

const numberField = z.number().int('需要填写整数').min(0).max(100);

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
  taboos: listSchema(5, 20),
  fears: listSchema(5, 20),
  soft_spots: listSchema(5, 20),
  non_negotiable: listSchema(5, 20),

  long_term_motivation: z.string().max(60, '长期目标最多 60 个字符'),
  current_goal: z.string().max(60, '当前目标最多 60 个字符'),
  doing_now: z.string().max(100, '正在做的事最多 100 个字符'),
  obstacle: z.string().max(60, '面临的困难最多 60 个字符'),

  conflict_style: z.enum(CONFLICT_STYLES),
  humor_style: z.enum(HUMOR_STYLES),
  memory_bias: z.enum(MEMORY_BIASES),
  sentence_length: z.enum(SENTENCE_LENGTHS),
  punctuation: z.enum(PUNCTUATION_STYLES),
  typo_level: numberField,
  split_level: numberField,

  particles: listSchema(10, 10),
  openers: listSchema(5, 10),

  banned_words: listSchema(20, 20),

  emoji_level: numberField,
  typing_level: numberField,
  time_zone: z.string().max(40),

  sleep_window: z.string().max(20),
  awake_window: z.string().max(20),
  online_policy: z.enum(ONLINE_POLICIES),
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

    conflict_style: '讲理',
    humor_style: '冷幽默',
    memory_bias: '均衡',
    sentence_length: '长短混用',
    punctuation: '常规',
    typo_level: 0,
    split_level: 2,

    particles: [''],
    openers: [''],

    banned_words: [''],

    emoji_level: 1,
    typing_level: 2,
    time_zone: '北京时间',

    sleep_window: '23:00-07:00',
    awake_window: '09:00-18:00',
    online_policy: '按作息',
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
  };
}

export type PersonaAccent = 'brass' | 'jade';

export type PersonaGender = '女' | '男' | '未设定';

export interface PersonaProfile {
  gender: PersonaGender;
  quote: string;
  keywords: string[];
  accent: PersonaAccent;
  experienceLevel: string;
  experienceLabel: string;
  languageStyle: string;
  addressStyle: string;
}

export const personaProfileSchema = z.object({
  gender: z.enum(['女', '男', '未设定']).default('未设定'),
  quote: z.string().max(400).default(''),
  keywords: z.array(z.string().max(40)).max(20).default([]),
  accent: z.enum(['brass', 'jade']).default('brass'),
  experienceLevel: z.enum(['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']).default('Ⅰ'),
  experienceLabel: z.string().max(20).default('初识'),
  languageStyle: z.string().max(2000).default(''),
  addressStyle: z.string().max(2000).default(''),
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

export const savePersonaSchema = z.object({
  data: personaDraftSchema,
});

export type SavePersonaInput = z.infer<typeof savePersonaSchema>;
