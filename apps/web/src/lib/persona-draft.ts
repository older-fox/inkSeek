import {
  createDefaultPersonaDraft,
  personaAdvancedSchema,
  type PersonaDraft,
} from '@inkseek/shared';

export type { PersonaDraft } from '@inkseek/shared';

export type NumericKey =
  | 'typo_level'
  | 'split_level'
  | 'emoji_level'
  | 'typing_level'
  | 'sleep_depth'
  | 'confidence'
  | 'self_control'
  | 'shame'
  | 'trust_bias'
  | 'attachment_style'
  | 'possessiveness_base'
  | 'agreeableness'
  | 'proactivity'
  | 'curiosity'
  | 'stamina_max'
  | 'strength'
  | 'agility'
  | 'pain_tolerance'
  | 'recovery_rate'
  | 'sensitivity';

export const DRAFT_STORAGE_KEY = 'inkseek-persona-draft';

export const createDefaultDraft = createDefaultPersonaDraft;

export interface PhaseMeta {
  name: string;
  caption: string;
}

export const PHASES: readonly PhaseMeta[] = [
  { name: '基础档案', caption: '姓名 · 外观 · 声音' },
  { name: '世界与背景', caption: '世界 · 来处 · 知识' },
  { name: '价值内核', caption: '价值 · 禁忌 · 红线' },
  { name: '动机与行动', caption: '目标 · 当下 · 困难' },
  { name: '表达方式', caption: '冲突 · 幽默 · 口癖' },
  { name: '在线习惯', caption: '禁用词 · 在线 · 节奏' },
  { name: '性格参数', caption: '自我 · 依恋 · 身体' },
];

interface Milestone {
  title: string;
  description: string;
}

export interface StepMeta {
  id: number;
  phase: number;
  title: string;
  caption: string;
  milestone?: Milestone;
}

export const STEPS: readonly StepMeta[] = [
  {
    id: 1,
    phase: 0,
    title: '基础档案',
    caption: '先记下 TA 是谁。带 * 的信息会直接进入卡面。',
  },
  {
    id: 2,
    phase: 0,
    title: '体态与外貌',
    caption: '这是生成人设图与头像的参照，写得具体一些。',
  },
  {
    id: 3,
    phase: 0,
    title: '发型与服装',
    caption: '发型与服装决定 TA 第一眼的样子。',
  },
  {
    id: 4,
    phase: 0,
    title: '声音',
    caption: '音高、口音、笑声与语速，这是 TTS 的第一印象。',
    milestone: {
      title: '基本信息完成',
      description: '名字、样子与声音都已归档。接下来，为 TA 补上世界与来处。',
    },
  },
  {
    id: 5,
    phase: 1,
    title: '世界观',
    caption: 'TA 生活在什么时代、什么地方，科技走到了哪一步。',
  },
  {
    id: 6,
    phase: 1,
    title: '背景故事',
    caption: 'TA 的来处，决定 TA 如何回应现在。',
  },
  {
    id: 7,
    phase: 1,
    title: '知识边界',
    caption: '明确 TA 该知道什么，也明确 TA 不该知道什么。',
    milestone: {
      title: '背景信息完成',
      description: '世界观、经历与知识边界已归档。接下来进入 TA 的价值内核。',
    },
  },
  {
    id: 8,
    phase: 2,
    title: '核心价值观',
    caption: '模糊情境下，TA 会默认站在哪一边。',
  },
  {
    id: 9,
    phase: 2,
    title: '禁忌',
    caption: '被触碰时，TA 会警觉、回避、冷淡或反驳。',
  },
  {
    id: 10,
    phase: 2,
    title: '恐惧来源',
    caption: '越靠近这些事，TA 越会害怕。',
  },
  {
    id: 11,
    phase: 2,
    title: '软肋',
    caption: '什么是 TA 无法拒绝的温柔，也是道歉能生效的依据。',
  },
  {
    id: 12,
    phase: 2,
    title: '绝对红线',
    caption: 'TA 不会让步的事。输出与之冲突时，应当被打回或改写。',
    milestone: {
      title: '核心价值观完成',
      description: '底线、恐惧与软肋已经清晰。现在，给 TA 一个方向。',
    },
  },
  {
    id: 13,
    phase: 3,
    title: '动机与行动',
    caption: 'TA 想去哪、此刻在做什么，又被什么绊住。',
    milestone: {
      title: '行动方向完成',
      description: 'TA 知道自己要去哪，也知道此刻在做什么。接下来定义 TA 的说话方式。',
    },
  },
  {
    id: 14,
    phase: 4,
    title: '表达倾向',
    caption: 'TA 如何冲突、如何幽默、如何记忆，以及如何断句。',
  },
  {
    id: 15,
    phase: 4,
    title: '口癖与开场',
    caption: '让 TA 开口的第一秒就像 TA。',
    milestone: {
      title: '语言风格定义完成',
      description: '语气、口癖与表达偏好都记录在案。接下来是 TA 的在线习惯。',
    },
  },
  {
    id: 16,
    phase: 5,
    title: '禁用词汇',
    caption: '这些词，TA 不会说。',
  },
  {
    id: 17,
    phase: 5,
    title: '线上节奏',
    caption: '表情、打字速度与时差，决定消息落地的质感。',
  },
  {
    id: 18,
    phase: 5,
    title: '在线与位置',
    caption: 'TA 在哪里、如何在线，被打扰时是什么反应。',
    milestone: {
      title: '交互风格定义完成',
      description: '在线节奏与当前位置已设定。最后，校准 TA 的性格参数。',
    },
  },
  {
    id: 19,
    phase: 6,
    title: '自我与信任',
    caption: 'TA 如何看待自己，也如何看待陌生人。',
  },
  {
    id: 20,
    phase: 6,
    title: '依恋与主动',
    caption: 'TA 如何靠近，如何让位，如何开口。',
  },
  {
    id: 21,
    phase: 6,
    title: '行动能力',
    caption: 'TA 能走多远、扛多重、有多灵活。',
  },
  {
    id: 22,
    phase: 6,
    title: '身体反馈',
    caption: '疼痛、恢复与感受，决定 TA 的反应强度。',
  },
];

export const TOTAL_STEPS = STEPS.length;

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
  example?: string;
}

export const PERSONA_TIMEZONE_OPTIONS = [
  { value: '北京时间', label: '北京时间 · 东八区' },
  { value: '东京时间', label: '东京时间 · 东九区' },
  { value: '首尔时间', label: '首尔时间 · 东九区' },
  { value: '悉尼时间', label: '悉尼时间 · 东十区' },
  { value: '伦敦时间', label: '伦敦时间 · 零时区' },
  { value: '巴黎时间', label: '巴黎时间 · 东一区' },
  { value: '纽约时间', label: '纽约时间 · 西五区' },
  { value: '洛杉矶时间', label: '洛杉矶时间 · 西八区' },
] as const;

export const LEVEL_OPTIONS = {
  typo: ['从不出错', '极少手滑', '偶尔打错', '经常打错', '容易打错'],
  split: ['单条长文', '偶尔分条', '均衡（推荐）', '偏好分条', '分条连发'],
  emoji: ['从不使用', '很少使用', '偶尔使用', '经常使用', '很爱使用'],
  typing: ['一指禅', '慢悠悠', '熟练', '快速', '高手'],
  sleepDepth: ['易醒', '浅眠', '安稳', '沉睡', '雷打不动'],
} as const;

export interface SliderMeta {
  key: NumericKey;
  label: string;
  hint: string;
}

export const SLIDER_GROUPS: Record<number, readonly SliderMeta[]> = {
  19: [
    {
      key: 'confidence',
      label: '自信',
      hint: '决定 TA 在压力下是否仍然相信自己。',
    },
    {
      key: 'self_control',
      label: '自控力',
      hint: '抵御诱惑与蛊惑、守住分寸的能力。',
    },
    {
      key: 'shame',
      label: '羞耻感',
      hint: '亲密话题的回避度、措辞谨慎度与脸红。',
    },
    {
      key: 'trust_bias',
      label: '信任倾向',
      hint: '对陌生对象的初始信任，关系值未设时的回退。',
    },
  ],
  20: [
    {
      key: 'attachment_style',
      label: '粘人程度',
      hint: '一般性依恋倾向，影响 TA 对疏离的敏感度。',
    },
    {
      key: 'possessiveness_base',
      label: '占有欲望',
      hint: '低：不在意关注分配；高：在意优先级。',
    },
    {
      key: 'agreeableness',
      label: '顺从程度',
      hint: '低：坚持己见、易质疑；高：配合、少反驳。',
    },
    {
      key: 'proactivity',
      label: '主动性',
      hint: '低：等待与回应；高：主动开场、提问。',
    },
  ],
  21: [
    {
      key: 'curiosity',
      label: '好奇程度',
      hint: '低：不问私事；高：爱追问细节。',
    },
    {
      key: 'stamina_max',
      label: '体力上限',
      hint: '持续行动与抗疲劳的天花板，低：易累、需休息。',
    },
    {
      key: 'strength',
      label: '力量上限',
      hint: '搬运、推拉、拥抱等物理能力。',
    },
    {
      key: 'agility',
      label: '灵活度',
      hint: '身体协调与反应速度。',
    },
  ],
  22: [
    {
      key: 'pain_tolerance',
      label: '疼痛耐受度',
      hint: '低：反应明显；高：少抱怨。不美化伤害。',
    },
    {
      key: 'recovery_rate',
      label: '回复速度',
      hint: '体力、情绪与轻伤的恢复快慢。低：需长休。',
    },
    {
      key: 'sensitivity',
      label: '敏感度',
      hint: '身体刺激的抽象感受倾向。',
    },
  ],
};

export function charCount(value: string): number {
  return Array.from(value).length;
}

export function clampChars(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join('') : value;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function filledLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean);
}

/** Structural comparison so a fresh default `advanced` object is not "content". */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((item, index) => sameValue(item, right[index]))
    );
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = Object.keys(leftRecord);
    return (
      keys.length === Object.keys(rightRecord).length &&
      keys.every((key) => sameValue(leftRecord[key], rightRecord[key]))
    );
  }
  return false;
}

export function hasDraftContent(draft: PersonaDraft): boolean {
  const defaults = createDefaultDraft();

  return (Object.keys(defaults) as Array<keyof PersonaDraft>).some(
    (key) => !sameValue(draft[key], defaults[key]),
  );
}

export type StepErrors = Record<string, string>;

function checkText(
  errors: StepErrors,
  value: string,
  key: string,
  label: string,
  max: number,
  required = false,
): void {
  const trimmed = value.trim();

  if (required && !trimmed) {
    errors[key] = `请填写${label}`;
    return;
  }

  if (trimmed && charCount(trimmed) > max) {
    errors[key] = `${label}最多 ${max} 个字符`;
  }
}

function checkNumber(
  errors: StepErrors,
  value: string,
  key: string,
  label: string,
  min: number,
  max: number | null,
  required: boolean,
  unit: string,
): void {
  const trimmed = value.trim();

  if (!trimmed) {
    if (required) {
      errors[key] = `请填写${label}`;
    }
    return;
  }

  const number = Number(trimmed);

  if (!Number.isFinite(number)) {
    errors[key] = `${label}需要填写数字`;
    return;
  }

  if (min !== null && number < min) {
    errors[key] = `${label}不能小于 ${min}${unit}`;
    return;
  }

  if (max !== null && number > max) {
    errors[key] = `${label}不能大于 ${max}${unit}`;
  }
}

function checkList(
  errors: StepErrors,
  lines: readonly string[],
  key: string,
  label: string,
  max: number | null,
  perLine: number,
  min = 0,
): void {
  const items = filledLines(lines);

  if (items.length < min) {
    errors[key] = `${label}至少填写 ${min} 条`;
    return;
  }

  if (max !== null && items.length > max) {
    errors[key] = `${label}最多 ${max} 条`;
    return;
  }

  if (items.some((item) => charCount(item) > perLine)) {
    errors[key] = `${label}每条不能超过 ${perLine} 个字符`;
  }
}

export function validateStep(step: number, draft: PersonaDraft): StepErrors {
  const errors: StepErrors = {};

  switch (step) {
    case 1:
      checkText(errors, draft.name, 'name', '姓名', 20, true);
      checkList(errors, draft.aliases, 'aliases', '化名与绰号', 5, 10);
      checkText(errors, draft.identity, 'identity', '身份', 20);
      checkText(errors, draft.occupation, 'occupation', '职业', 20, true);
      checkText(errors, draft.race, 'race', '种族', 10, true);
      checkNumber(errors, draft.age, 'age', '年龄', 10, null, true, ' 岁');
      checkNumber(errors, draft.height_cm, 'height_cm', '身高', 100, 400, true, ' cm');
      checkNumber(errors, draft.weight_kg, 'weight_kg', '体重', 20, 300, true, ' kg');
      break;

    case 2:
      checkText(errors, draft.body_type, 'body_type', '体型描述', 80);
      checkText(errors, draft.appearance, 'appearance', '外貌描述', 300, true);
      break;

    case 3:
      checkText(errors, draft.hair, 'hair', '发型描述', 300, true);
      checkText(errors, draft.outfit, 'outfit', '服装描述', 300, true);
      break;

    case 4:
      checkText(errors, draft.voice, 'voice', '声音描述', 300, true);
      break;

    case 5:
      checkText(errors, draft.world_setting, 'world_setting', '世界观', 500);
      break;

    case 6:
      checkText(errors, draft.backstory, 'backstory', '背景故事', 2000);
      break;

    case 7:
      checkText(errors, draft.knowledge_boundary, 'knowledge_boundary', '知识边界', 500);
      break;

    case 8:
      checkList(errors, draft.core_values, 'core_values', '核心价值观', null, 20, 1);
      break;

    case 9:
      checkList(errors, draft.taboos, 'taboos', '禁忌', null, 20, 1);
      break;

    case 10:
      checkList(errors, draft.fears, 'fears', '恐惧来源', null, 20);
      break;

    case 11:
      checkList(errors, draft.soft_spots, 'soft_spots', '软肋', null, 20);
      break;

    case 12:
      checkList(errors, draft.non_negotiable, 'non_negotiable', '绝对红线', null, 20);
      break;

    case 13:
      checkText(errors, draft.long_term_motivation, 'long_term_motivation', '长期目标', 60);
      checkText(errors, draft.current_goal, 'current_goal', '当前目标', 60);
      checkText(errors, draft.doing_now, 'doing_now', '正在做的事', 100);
      checkText(errors, draft.obstacle, 'obstacle', '面临的困难', 60);
      break;

    case 14:
      checkText(errors, draft.language_style, 'language_style', '说话风格', 200);
      checkText(errors, draft.conflict_style, 'conflict_style', '冲突风格', 200);
      checkText(errors, draft.humor_style, 'humor_style', '幽默风格', 200);
      checkText(errors, draft.memory_bias, 'memory_bias', '记忆倾向', 200);
      checkText(errors, draft.sentence_length, 'sentence_length', '句长偏好', 200);
      checkText(errors, draft.punctuation, 'punctuation', '标点习惯', 200);
      break;

    case 15:
      checkList(errors, draft.particles, 'particles', '语气词', null, 10);
      checkList(errors, draft.openers, 'openers', '常用开头', null, 10);
      break;

    case 16:
      checkList(errors, draft.banned_words, 'banned_words', '禁用语', null, 20);
      break;

    case 17:
      break;

    case 18:
      checkText(errors, draft.location, 'location', '当前位置', 40);
      checkText(errors, draft.online_policy, 'online_policy', '在线策略', 200);
      break;

    default:
      break;
  }

  return errors;
}

export interface DraftSnapshot {
  data: PersonaDraft;
  step: number;
  updatedAt: string;
  completedAt?: string;
}

const DRAFT_VERSION = 1;

export function loadDraft(): DraftSnapshot | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version !== DRAFT_VERSION || typeof parsed.data !== 'object') {
      return null;
    }

    const step = typeof parsed.step === 'number' ? Math.round(parsed.step) : 1;

    return {
      data: hydrateDraft(parsed.data),
      step: Math.min(TOTAL_STEPS, Math.max(1, step)),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : undefined,
    };
  } catch {
    return null;
  }
}

export function saveDraft(
  data: PersonaDraft,
  step: number,
  completed = false,
): DraftSnapshot | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const now = new Date().toISOString();
  const snapshot: DraftSnapshot = {
    data,
    step,
    updatedAt: now,
    ...(completed ? { completedAt: now } : {}),
  };

  try {
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ version: DRAFT_VERSION, ...snapshot }),
    );
    return snapshot;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private modes; the draft is best-effort.
  }
}

const LEGACY_KEY_MAP: Record<string, string> = {
  species: 'race',
  height: 'height_cm',
  weight: 'weight_kg',
  bodyDescription: 'body_type',
  hairstyle: 'hair',
  worldview: 'world_setting',
  knowledgeBoundary: 'knowledge_boundary',
  timeAwareness: 'time_awareness',
  coreValues: 'core_values',
  weaknesses: 'soft_spots',
  redLines: 'non_negotiable',
  longTermGoal: 'long_term_motivation',
  currentGoal: 'current_goal',
  doingNow: 'doing_now',
  conflictStyle: 'conflict_style',
  humorStyle: 'humor_style',
  memoryBias: 'memory_bias',
  sentenceLength: 'sentence_length',
  typoLevel: 'typo_level',
  splitLevel: 'split_level',
  emojiLevel: 'emoji_level',
  typingLevel: 'typing_level',
  onlinePolicy: 'online_policy',
  sleepDepth: 'sleep_depth',
  selfControl: 'self_control',
  trustBias: 'trust_bias',
  attachment: 'attachment_style',
  possessiveness: 'possessiveness_base',
  stamina: 'stamina_max',
  painTolerance: 'pain_tolerance',
  recovery: 'recovery_rate',
};

const LEGACY_CHOICE_MAP: Record<string, Record<string, string>> = {
  conflict_style: {
    avoid: '回避',
    confront: '对抗',
    reason: '讲理',
    cold_war: '冷战',
    withdraw_then_explain: '先退后解释',
  },
  humor_style: {
    dry: '冷幽默',
    self_deprecating: '自嘲',
    roast: '吐槽',
    none: '不接梗',
  },
  memory_bias: {
    balanced: '均衡',
    detail: '记细节',
    grudge: '记仇',
    forgetful: '健忘',
  },
  sentence_length: {
    short: '短句',
    medium: '中句',
    long: '长句',
    mixed: '长短混用',
  },
  punctuation: {
    minimal: '极简',
    plain: '常规',
    soft: '柔软',
    strict: '严整',
    lively: '活泼',
    bookish: '书卷',
  },
  online_policy: {
    always: '常在线',
    rhythm: '按作息',
    adaptive: '自适应',
  },
};

const TIME_OFFSET_ZONE: Record<number, string> = {
  [-8]: '洛杉矶时间',
  [-5]: '纽约时间',
  0: '伦敦时间',
  1: '巴黎时间',
  8: '北京时间',
  9: '东京时间',
};

function migrateLegacyDraft(source: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...source };

  if (next.aliases === undefined && typeof next.nickname === 'string') {
    const nickname = next.nickname.trim();
    next.aliases = nickname ? [nickname] : [''];
  }

  if (next.banned_words === undefined && typeof next.bannedWords === 'string') {
    const words = next.bannedWords
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    next.banned_words = words.length > 0 ? words : [''];
  }

  if (next.time_zone === undefined && typeof next.timeOffset === 'number') {
    next.time_zone = TIME_OFFSET_ZONE[next.timeOffset] ?? '北京时间';
  }

  for (const [legacy, current] of Object.entries(LEGACY_KEY_MAP)) {
    if (next[current] === undefined && next[legacy] !== undefined) {
      next[current] = next[legacy];
    }
  }

  for (const [key, valueMap] of Object.entries(LEGACY_CHOICE_MAP)) {
    const value = next[key];
    if (typeof value === 'string' && value in valueMap) {
      next[key] = valueMap[value];
    }
  }

  return next;
}

function hydrateDraft(raw: unknown): PersonaDraft {
  const defaults = createDefaultDraft();
  const source = migrateLegacyDraft((raw ?? {}) as Record<string, unknown>);
  const merged: Record<string, unknown> = {};

  for (const [key, fallback] of Object.entries(defaults)) {
    const value = source[key];

    if (key === 'advanced') {
      const parsed = personaAdvancedSchema.safeParse(value);
      merged.advanced = parsed.success ? parsed.data : fallback;
    } else if (Array.isArray(fallback)) {
      merged[key] = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : fallback;
    } else if (typeof fallback === 'number') {
      merged[key] = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    } else if (typeof fallback === 'boolean') {
      merged[key] = typeof value === 'boolean' ? value : fallback;
    } else {
      merged[key] = typeof value === 'string' ? value : fallback;
    }
  }

  const draft = merged as unknown as PersonaDraft;

  (['typo_level', 'split_level', 'emoji_level', 'typing_level', 'sleep_depth'] as const).forEach(
    (key) => {
      draft[key] = Math.min(4, Math.max(0, Math.round(draft[key])));
    },
  );

  Object.values(SLIDER_GROUPS).forEach((sliders) => {
    sliders.forEach((slider) => {
      draft[slider.key] = clampNumber(Math.round(draft[slider.key]), 0, 100);
    });
  });

  return draft;
}
