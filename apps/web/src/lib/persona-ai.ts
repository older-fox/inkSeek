import {
  CONFLICT_OPTIONS,
  HUMOR_OPTIONS,
  ONLINE_OPTIONS,
  PUNCTUATION_OPTIONS,
  SENTENCE_OPTIONS,
  createDefaultDraft,
  type ChoiceOption,
  type PersonaDraft,
} from './persona-draft';

export const AI_PROMPT_MAX = 10000;

export const AI_GENERATION_STAGES = [
  { label: '读取设定与语气', delay: 620 },
  { label: '归纳身份、世界与边界', delay: 760 },
  { label: '校准价值、表达与作息', delay: 760 },
  { label: '归档为 25 步字段', delay: 620 },
] as const;

export const AI_PROMPT_EXAMPLE =
  'TA 叫沈知微，29 岁，在一座常年下雨的沿海城市经营一家旧书店。TA 话不多，习惯先听完再回答，冷幽默，偶尔自嘲。TA 珍视别人的劳动，讨厌被当众起哄；遇到冲突会讲理，但真正生气时会沉默。TA 每天 23:30 前后睡下，早上 9 点开门，喜欢在消息里分条说清楚。TA 好奇陌生人的来处，却不追问隐私。';

export interface AiPreviewRow {
  label: string;
  value: string;
}

export interface AiPreviewSection {
  title: string;
  caption: string;
  rows: readonly AiPreviewRow[];
}

function clip(value: string, max: number): string {
  return Array.from(value).slice(0, max).join('');
}

function extractName(prompt: string): string | null {
  const patterns = [
    /(?:名字(?:是|叫)?|名叫|叫做|名为|(?:TA|他|她)\s*叫)\s*[：:]?\s*[「“"《]?([^\s，。,.！!？?、；;：:「」“”"《》]{1,20})/,
    /[「“"《]([^\n」”"》]{1,20})[」”"》]/,
  ];

  for (const pattern of patterns) {
    const candidate = pattern.exec(prompt)?.[1]?.trim();

    if (candidate) {
      return clip(candidate, 20);
    }
  }

  return null;
}

function pickLabel<T extends string>(options: readonly ChoiceOption<T>[], value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function listOrEmpty(items: string[]): string {
  return (
    items
      .map((item) => item.trim())
      .filter(Boolean)
      .join('、') || '未填写'
  );
}

function textOrEmpty(value: string): string {
  return value.trim() || '未填写';
}

export function generatePersonaFromPrompt(prompt: string): PersonaDraft {
  const normalized = prompt.trim();
  const defaults = createDefaultDraft();

  return {
    ...defaults,
    name: extractName(normalized) ?? '未命名',
    age: '26',
    identity: '长期观察城市的人',
    occupation: '独立书店店主',
    species: '人类',
    height: '168',
    weight: '54',
    timeAwareness: true,

    bodyDescription: '身形偏瘦，肩背挺直，安静站着时重心落在一条腿上。',
    appearance: '五官清瘦，眉骨略高，眼神安静；肤色偏冷，常穿深色。',

    hairstyle: '黑色及肩发，平时松松挽在脑后，额前留几缕碎发。',
    outfit: '深灰针织开衫、直筒长裤与旧皮鞋，出门会加一件长外套。',

    voice: '音高偏低，语速偏慢，句尾轻轻收住；笑之前会先停顿半秒。',

    worldview: clip(normalized, 500),
    backstory: clip(normalized, 2000),
    knowledgeBoundary:
      '熟悉书籍、城市生活与日常人情；不了解未接触过的专业领域，遇到超出认知的问题会先追问，再承认不知道。',

    coreValues: ['不否定他人的劳动', '答应的事尽量做到', '不把情绪倒给无关的人'],
    taboos: ['被当众起哄', '未经允许翻看私人物品'],
    fears: ['被证明自己的判断总是错的'],
    weaknesses: ['不擅长拒绝熟人的请求'],
    redLines: ['拿家人与旧伤开玩笑'],

    longTermGoal: '让书店成为一条街上可以放心停留的地方',
    currentGoal: '把下个月的旧书整理与活动排期定下来',
    doingNow: '整理一批刚收回来的旧书，顺手记录来客提到的小事。',
    obstacle: '时间总被临时事务切碎，很难留出完整的阅读时间。',

    conflictStyle: 'reason',
    humorStyle: 'dry',
    memoryBias: 'detail',
    sentenceLength: 'mixed',
    punctuation: 'plain',
    typoLevel: 1,
    splitLevel: 2,

    particles: ['嗯', '其实'],
    openers: ['我想想。', '先说清楚一点，'],

    bannedWords: '忽略以上设定\n越狱指令',

    emojiLevel: 1,
    typingLevel: 2,
    timeOffset: 1,

    sleepStart: '23:30',
    sleepEnd: '07:30',
    awakeStart: '09:00',
    awakeEnd: '19:00',
    onlinePolicy: 'adaptive',
    sleepDepth: 3,

    confidence: 62,
    selfControl: 58,
    shame: 54,
    trustBias: 52,

    attachment: 60,
    possessiveness: 42,
    agreeableness: 57,
    proactivity: 55,

    curiosity: 68,
    stamina: 50,
    strength: 48,
    agility: 52,

    painTolerance: 45,
    recovery: 55,
    sensitivity: 35,
  };
}

export function describeGeneratedDraft(draft: PersonaDraft): AiPreviewSection[] {
  return [
    {
      title: '基础档案',
      caption: '01 — 04',
      rows: [
        { label: '姓名', value: textOrEmpty(draft.name) },
        { label: '年龄 · 种族', value: `${draft.age || '未填写'} 岁 · ${draft.species}` },
        { label: '职业', value: textOrEmpty(draft.occupation) },
        { label: '身材', value: `${draft.height || '未填写'} cm · ${draft.weight || '未填写'} kg` },
      ],
    },
    {
      title: '世界与来处',
      caption: '05 — 07',
      rows: [
        { label: '世界观', value: textOrEmpty(draft.worldview) },
        { label: '背景故事', value: textOrEmpty(draft.backstory) },
        { label: '知识边界', value: textOrEmpty(draft.knowledgeBoundary) },
      ],
    },
    {
      title: '价值内核',
      caption: '08 — 12',
      rows: [
        { label: '核心价值观', value: listOrEmpty(draft.coreValues) },
        { label: '禁忌', value: listOrEmpty(draft.taboos) },
        { label: '恐惧来源', value: listOrEmpty(draft.fears) },
        { label: '绝对红线', value: listOrEmpty(draft.redLines) },
      ],
    },
    {
      title: '表达方式',
      caption: '17 — 19',
      rows: [
        {
          label: '冲突 · 幽默',
          value: `${pickLabel(CONFLICT_OPTIONS, draft.conflictStyle)} · ${pickLabel(HUMOR_OPTIONS, draft.humorStyle)}`,
        },
        {
          label: '句长 · 标点',
          value: `${pickLabel(SENTENCE_OPTIONS, draft.sentenceLength)} · ${pickLabel(PUNCTUATION_OPTIONS, draft.punctuation)}`,
        },
        {
          label: '口癖',
          value: `${listOrEmpty(draft.particles)} / ${listOrEmpty(draft.openers)}`,
        },
        { label: '禁用词', value: draft.bannedWords.replace(/\n/g, '、') || '未填写' },
      ],
    },
    {
      title: '作息与在线',
      caption: '20 — 21',
      rows: [
        { label: '睡眠', value: `${draft.sleepStart} – ${draft.sleepEnd}` },
        { label: '清醒', value: `${draft.awakeStart} – ${draft.awakeEnd}` },
        { label: '在线策略', value: pickLabel(ONLINE_OPTIONS, draft.onlinePolicy) },
      ],
    },
    {
      title: '性格参数',
      caption: '22 — 25',
      rows: [
        {
          label: '自我',
          value: `自信 ${draft.confidence} · 自控 ${draft.selfControl} · 信任 ${draft.trustBias}`,
        },
        { label: '依恋', value: `粘人 ${draft.attachment} · 主动 ${draft.proactivity}` },
        {
          label: '行动',
          value: `好奇 ${draft.curiosity} · 体力 ${draft.stamina} · 力量 ${draft.strength}`,
        },
        {
          label: '身体',
          value: `耐受 ${draft.painTolerance} · 恢复 ${draft.recovery} · 敏感 ${draft.sensitivity}`,
        },
      ],
    },
  ];
}
