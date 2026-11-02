export type ConflictStyle =
  '回避' | '对抗' | '讲理' | '冷战' | '先退后解释' | '先听完再划界' | '先降温再划界';
export type HumorStyle = '冷幽默' | '自嘲' | '吐槽' | '不接梗' | '机锋';
export type MemoryBias = '均衡' | '记细节' | '记仇' | '健忘' | '偏记人' | '偏记声音';
export type SentenceLength = '短句' | '中句' | '长句' | '长短混用';
export type PunctuationStyle = '极简' | '常规' | '柔软' | '严整' | '活泼' | '书卷' | '省略号偏多';
export type OnlinePolicy = '常在线' | '按作息' | '自适应';

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

export interface PersonaDraft {
  name: string;
  aliases: string[];
  age: string;
  identity: string;
  occupation: string;
  race: string;
  height_cm: string;
  weight_kg: string;
  time_awareness: boolean;

  body_type: string;
  appearance: string;

  hair: string;
  outfit: string;

  voice: string;

  world_setting: string;
  backstory: string;
  knowledge_boundary: string;

  core_values: string[];
  taboos: string[];
  fears: string[];
  soft_spots: string[];
  non_negotiable: string[];

  long_term_motivation: string;
  current_goal: string;
  doing_now: string;
  obstacle: string;

  conflict_style: ConflictStyle;
  humor_style: HumorStyle;
  memory_bias: MemoryBias;
  sentence_length: SentenceLength;
  punctuation: PunctuationStyle;
  typo_level: number;
  split_level: number;

  particles: string[];
  openers: string[];

  banned_words: string[];

  emoji_level: number;
  typing_level: number;
  time_zone: string;

  sleep_window: string;
  awake_window: string;
  online_policy: OnlinePolicy;
  sleep_depth: number;

  confidence: number;
  self_control: number;
  shame: number;
  trust_bias: number;

  attachment_style: number;
  possessiveness_base: number;
  agreeableness: number;
  proactivity: number;

  curiosity: number;
  stamina_max: number;
  strength: number;
  agility: number;

  pain_tolerance: number;
  recovery_rate: number;
  sensitivity: number;
}

export const DRAFT_STORAGE_KEY = 'inkseek-persona-draft';

export function createDefaultDraft(): PersonaDraft {
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
  { name: '在线习惯', caption: '禁用词 · 作息 · 节奏' },
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
    caption: '越靠近，TA 越会退到哪里。',
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
    title: '长期目标',
    caption: '给所有行为一个总方向，避免长对话后失去焦点。',
  },
  {
    id: 14,
    phase: 3,
    title: '当前目标',
    caption: '近期的紧迫感与话题。完成或失败后应被替换。',
  },
  {
    id: 15,
    phase: 3,
    title: '正在做的事',
    caption: '决定被打扰时，是短回还是多话。',
  },
  {
    id: 16,
    phase: 3,
    title: '面临的困难',
    caption: '让烦躁、疲惫与欲言又止有具体来源。',
    milestone: {
      title: '行动方向和基本信息完成',
      description: 'TA 知道自己要去哪，也知道此刻在做什么。接下来定义 TA 的说话方式。',
    },
  },
  {
    id: 17,
    phase: 4,
    title: '表达倾向',
    caption: 'TA 如何冲突、如何幽默、如何记忆，以及如何断句。',
  },
  {
    id: 18,
    phase: 4,
    title: '口癖与开场',
    caption: '让 TA 开口的第一秒就像 TA。',
    milestone: {
      title: '语言风格定义完成',
      description: '语气、口癖与表达偏好都记录在案。接下来是 TA 的在线习惯。',
    },
  },
  {
    id: 19,
    phase: 5,
    title: '禁用词汇',
    caption: '这些词，TA 不会说。',
  },
  {
    id: 20,
    phase: 5,
    title: '线上节奏',
    caption: '表情、打字速度与时差，决定消息落地的质感。',
  },
  {
    id: 21,
    phase: 5,
    title: '作息与在线',
    caption: 'TA 什么时候睡、什么时候醒、什么时候在线。',
    milestone: {
      title: '交互风格定义完成',
      description: '作息与在线节奏已设定。最后，校准 TA 的性格参数。',
    },
  },
  {
    id: 22,
    phase: 6,
    title: '自我与信任',
    caption: 'TA 如何看待自己，也如何看待陌生人。',
  },
  {
    id: 23,
    phase: 6,
    title: '依恋与主动',
    caption: 'TA 如何靠近，如何让位，如何开口。',
  },
  {
    id: 24,
    phase: 6,
    title: '行动能力',
    caption: 'TA 能走多远、扛多重、有多灵活。',
  },
  {
    id: 25,
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

export const CONFLICT_OPTIONS: readonly ChoiceOption<ConflictStyle>[] = [
  { value: '回避', label: '回避', hint: '先退开，避开正面冲突' },
  { value: '对抗', label: '对抗', hint: '正面顶回去，不轻易让步' },
  { value: '讲理', label: '讲理', hint: '把逻辑与事实摆出来' },
  { value: '冷战', label: '冷战', hint: '不吵，但态度明显降温' },
  { value: '先退后解释', label: '先退后解释', hint: '先离开现场，冷静后再说明' },
  { value: '先听完再划界', label: '先听完再划界', hint: '先让对方说完，再明确边界' },
  { value: '先降温再划界', label: '先降温再划界', hint: '先把气氛缓下来，再谈边界' },
];

export const HUMOR_OPTIONS: readonly ChoiceOption<HumorStyle>[] = [
  { value: '冷幽默', label: '冷幽默', hint: '冷不丁来一句' },
  { value: '自嘲', label: '自嘲', hint: '先拿自己开刀' },
  { value: '吐槽', label: '吐槽', hint: '嘴上不饶人' },
  { value: '不接梗', label: '不接梗', hint: '很少开玩笑' },
  { value: '机锋', label: '机锋', hint: '话里带钩，点到为止' },
];

export const MEMORY_OPTIONS: readonly ChoiceOption<MemoryBias>[] = [
  { value: '均衡', label: '均衡', hint: '记住重要的，也放过琐碎的' },
  { value: '记细节', label: '记细节', hint: '你说过的小事 TA 都会记得' },
  { value: '记仇', label: '记仇', hint: '被冒犯的事会留很久' },
  { value: '健忘', label: '健忘', hint: '需要你提醒，才想得起来' },
  { value: '偏记人', label: '偏记人', hint: '更记得人与关系，而不是事件细节' },
  { value: '偏记声音', label: '偏记声音', hint: '更记得语气、声线与说话方式' },
];

export const SENTENCE_OPTIONS: readonly ChoiceOption<SentenceLength>[] = [
  { value: '短句', label: '短句', hint: '一句一口气，少用连接词' },
  { value: '中句', label: '中句', hint: '长度适中，表达完整' },
  { value: '长句', label: '长句', hint: '习惯把话讲透' },
  { value: '长短混用', label: '长短混用', hint: '随情绪与场景变化' },
];

export const PUNCTUATION_OPTIONS: readonly ChoiceOption<PunctuationStyle>[] = [
  { value: '极简', label: '极简', example: '「在」「嗯 你说」' },
  { value: '常规', label: '常规', example: '「在的，你说吧。」' },
  { value: '柔软', label: '柔软', example: '「在的～」「你说吧…」' },
  { value: '严整', label: '严整', example: '「在。你说吧，我听着。」' },
  { value: '活泼', label: '活泼', example: '「在在在！！」「你说你说？」' },
  { value: '书卷', label: '书卷', example: '「在——你说吧；我这边正好空着。」' },
  { value: '省略号偏多', label: '省略号偏多', example: '「在的……你说吧……」' },
];

export const ONLINE_OPTIONS: readonly ChoiceOption<OnlinePolicy>[] = [
  { value: '常在线', label: '常在线', hint: '消息几乎总能及时收到' },
  { value: '按作息', label: '按作息', hint: '醒着就在，睡后不回' },
  { value: '自适应', label: '自适应', hint: '根据对话与关系调整上线频率' },
];

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
  min: number;
  max: number;
  defaultValue: number;
}

export const SLIDER_GROUPS: Record<number, readonly SliderMeta[]> = {
  22: [
    {
      key: 'confidence',
      label: '自信',
      hint: '决定 TA 在压力下是否仍然相信自己。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
    {
      key: 'self_control',
      label: '自控力',
      hint: '抵御诱惑与蛊惑、守住分寸的能力。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
    {
      key: 'shame',
      label: '羞耻感',
      hint: '亲密话题的回避度、措辞谨慎度与脸红。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
    {
      key: 'trust_bias',
      label: '信任倾向',
      hint: '对陌生对象的初始信任，关系值未设时的回退。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
  ],
  23: [
    {
      key: 'attachment_style',
      label: '粘人程度',
      hint: '一般性依恋倾向，影响 TA 对疏离的敏感度。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
    {
      key: 'possessiveness_base',
      label: '占有欲望',
      hint: '低：不在意关注分配；高：在意优先级。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
    {
      key: 'agreeableness',
      label: '顺从程度',
      hint: '低：坚持己见、易质疑；高：配合、少反驳。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
    {
      key: 'proactivity',
      label: '主动性',
      hint: '低：等待与回应；高：主动开场、提问。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
  ],
  24: [
    {
      key: 'curiosity',
      label: '好奇程度',
      hint: '低：不问私事；高：爱追问细节。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
    {
      key: 'stamina_max',
      label: '体力上限',
      hint: '持续行动与抗疲劳的天花板，低：易累、需休息。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
    {
      key: 'strength',
      label: '力量上限',
      hint: '搬运、推拉、拥抱等物理能力。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
    {
      key: 'agility',
      label: '灵活度',
      hint: '身体协调与反应速度。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
  ],
  25: [
    {
      key: 'pain_tolerance',
      label: '疼痛耐受度',
      hint: '低：反应明显；高：少抱怨。不美化伤害。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
    {
      key: 'recovery_rate',
      label: '回复速度',
      hint: '体力、情绪与轻伤的恢复快慢。低：需长休。',
      min: 20,
      max: 80,
      defaultValue: 50,
    },
    {
      key: 'sensitivity',
      label: '敏感度',
      hint: '身体刺激的抽象感受倾向。',
      min: 10,
      max: 80,
      defaultValue: 30,
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

export function hasDraftContent(draft: PersonaDraft): boolean {
  const defaults = createDefaultDraft();

  return (Object.keys(defaults) as Array<keyof PersonaDraft>).some((key) => {
    const value = draft[key];
    const fallback = defaults[key];

    if (Array.isArray(value) && Array.isArray(fallback)) {
      return (
        value.length !== fallback.length || value.some((item, index) => item !== fallback[index])
      );
    }

    return value !== fallback;
  });
}

export function rangeDurationMinutes(start: string, end: string): number | null {
  const from = toMinutes(start);
  const to = toMinutes(end);

  if (from === null || to === null) {
    return null;
  }

  const duration = to - from;
  return duration <= 0 ? duration + 24 * 60 : duration;
}

export function parseWindow(value: string): { start: string; end: string } | null {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const [, startHour, startMinute, endHour, endMinute] = match;

  if (!startHour || !startMinute || !endHour || !endMinute) {
    return null;
  }

  const start = `${startHour}:${startMinute}`;
  const end = `${endHour}:${endMinute}`;

  if (toMinutes(start) === null || toMinutes(end) === null) {
    return null;
  }

  return { start, end };
}

export function joinWindow(start: string, end: string): string {
  return `${start}-${end}`;
}

export function minutesLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
}

function toMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function windowSegments(start: string, duration: number): Array<[number, number]> {
  const from = toMinutes(start);

  if (from === null) {
    return [];
  }

  const to = from + duration;

  if (to <= 24 * 60) {
    return [[from, to]];
  }

  return [
    [from, 24 * 60],
    [0, to - 24 * 60],
  ];
}

function windowsOverlap(
  startA: string,
  durationA: number,
  startB: string,
  durationB: number,
): boolean {
  const segmentsA = windowSegments(startA, durationA);
  const segmentsB = windowSegments(startB, durationB);

  return segmentsA.some(([aStart, aEnd]) =>
    segmentsB.some(([bStart, bEnd]) => aStart < bEnd && bStart < aEnd),
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
      checkList(errors, draft.taboos, 'taboos', '禁忌', 5, 20, 1);
      break;

    case 10:
      checkList(errors, draft.fears, 'fears', '恐惧来源', 5, 20);
      break;

    case 11:
      checkList(errors, draft.soft_spots, 'soft_spots', '软肋', 5, 20);
      break;

    case 12:
      checkList(errors, draft.non_negotiable, 'non_negotiable', '绝对红线', 5, 20);
      break;

    case 13:
      checkText(errors, draft.long_term_motivation, 'long_term_motivation', '长期目标', 60);
      break;

    case 14:
      checkText(errors, draft.current_goal, 'current_goal', '当前目标', 60);
      break;

    case 15:
      checkText(errors, draft.doing_now, 'doing_now', '正在做的事', 100);
      break;

    case 16:
      checkText(errors, draft.obstacle, 'obstacle', '面临的困难', 60);
      break;

    case 17:
      break;

    case 18:
      checkList(errors, draft.particles, 'particles', '语气词', 10, 10);
      checkList(errors, draft.openers, 'openers', '常用开头', 5, 10);
      break;

    case 19:
      checkList(errors, draft.banned_words, 'banned_words', '禁用语', 20, 20);
      break;

    case 20:
      break;

    case 21: {
      const sleep = parseWindow(draft.sleep_window);
      if (!sleep) {
        errors.sleep_window = '请填写完整的睡眠时间段';
      } else {
        const sleepDuration = rangeDurationMinutes(sleep.start, sleep.end);
        if (sleepDuration === null || sleepDuration < 180 || sleepDuration > 720) {
          errors.sleep_window = '睡眠跨度需在 3–12 小时之间';
        }
      }

      const awake = parseWindow(draft.awake_window);
      if (!awake) {
        errors.awake_window = '请填写完整的清醒时间段';
      } else {
        const awakeDuration = rangeDurationMinutes(awake.start, awake.end);
        if (awakeDuration === null || awakeDuration < 180 || awakeDuration > 720) {
          errors.awake_window = '清醒跨度需在 3–12 小时之间';
        } else if (sleep) {
          const sleepDuration = rangeDurationMinutes(sleep.start, sleep.end);
          if (
            sleepDuration !== null &&
            windowsOverlap(sleep.start, sleepDuration, awake.start, awakeDuration)
          ) {
            errors.awake_window = '清醒时段不能与睡眠时段重叠';
          }
        }
      }
      break;
    }

    default: {
      const sliders = SLIDER_GROUPS[step] ?? [];
      sliders.forEach((slider) => {
        const value = draft[slider.key];
        if (value < slider.min || value > slider.max) {
          errors[slider.key] = `${slider.label}需在 ${slider.min}–${slider.max} 之间`;
        }
      });
    }
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

  if (next.sleep_window === undefined) {
    const start = typeof next.sleepStart === 'string' ? next.sleepStart : '23:00';
    const end = typeof next.sleepEnd === 'string' ? next.sleepEnd : '07:00';
    next.sleep_window = joinWindow(start, end);
  }

  if (next.awake_window === undefined) {
    const start = typeof next.awakeStart === 'string' ? next.awakeStart : '09:00';
    const end = typeof next.awakeEnd === 'string' ? next.awakeEnd : '18:00';
    next.awake_window = joinWindow(start, end);
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

    if (Array.isArray(fallback)) {
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
      draft[slider.key] = clampNumber(Math.round(draft[slider.key]), slider.min, slider.max);
    });
  });

  return draft;
}
