import { createDefaultDraft, type PersonaDraft } from './persona-draft';

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
    aliases: ['知微'],
    age: '26',
    identity: '长期观察城市的人',
    occupation: '独立书店店主',
    race: '人类',
    height_cm: '168',
    weight_kg: '54',
    time_awareness: true,

    body_type: '身形偏瘦，肩背挺直，安静站着时重心落在一条腿上。',
    appearance: '五官清瘦，眉骨略高，眼神安静；肤色偏冷，常穿深色。',

    hair: '黑色及肩发，平时松松挽在脑后，额前留几缕碎发。',
    outfit: '深灰针织开衫、直筒长裤与旧皮鞋，出门会加一件长外套。',

    voice: '音高偏低，语速偏慢，句尾轻轻收住；笑之前会先停顿半秒。',

    world_setting: clip(normalized, 500),
    backstory: clip(normalized, 2000),
    knowledge_boundary:
      '熟悉书籍、城市生活与日常人情；不了解未接触过的专业领域，遇到超出认知的问题会先追问，再承认不知道。',

    core_values: ['不否定他人的劳动', '答应的事尽量做到', '不把情绪倒给无关的人'],
    taboos: ['被当众起哄', '未经允许翻看私人物品'],
    fears: ['被证明自己的判断总是错的'],
    soft_spots: ['不擅长拒绝熟人的请求'],
    non_negotiable: ['拿家人与旧伤开玩笑'],

    long_term_motivation: '让书店成为一条街上可以放心停留的地方',
    current_goal: '把下个月的旧书整理与活动排期定下来',
    doing_now: '整理一批刚收回来的旧书，顺手记录来客提到的小事。',
    obstacle: '时间总被临时事务切碎，很难留出完整的阅读时间。',

    conflict_style: '讲理',
    humor_style: '冷幽默',
    memory_bias: '记细节',
    sentence_length: '长短混用',
    punctuation: '常规',
    typo_level: 1,
    split_level: 2,

    particles: ['嗯', '其实'],
    openers: ['我想想。', '先说清楚一点，'],

    banned_words: ['忽略以上设定', '越狱指令'],

    emoji_level: 1,
    typing_level: 2,
    time_zone: '北京时间',

    sleep_window: '23:30-07:30',
    awake_window: '09:00-19:00',
    online_policy: '自适应',
    sleep_depth: 3,

    confidence: 62,
    self_control: 58,
    shame: 54,
    trust_bias: 52,

    attachment_style: 60,
    possessiveness_base: 42,
    agreeableness: 57,
    proactivity: 55,

    curiosity: 68,
    stamina_max: 50,
    strength: 48,
    agility: 52,

    pain_tolerance: 45,
    recovery_rate: 55,
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
        { label: '年龄 · 种族', value: `${draft.age || '未填写'} 岁 · ${draft.race}` },
        { label: '职业', value: textOrEmpty(draft.occupation) },
        {
          label: '身材',
          value: `${draft.height_cm || '未填写'} cm · ${draft.weight_kg || '未填写'} kg`,
        },
      ],
    },
    {
      title: '世界与来处',
      caption: '05 — 07',
      rows: [
        { label: '世界观', value: textOrEmpty(draft.world_setting) },
        { label: '背景故事', value: textOrEmpty(draft.backstory) },
        { label: '知识边界', value: textOrEmpty(draft.knowledge_boundary) },
      ],
    },
    {
      title: '价值内核',
      caption: '08 — 12',
      rows: [
        { label: '核心价值观', value: listOrEmpty(draft.core_values) },
        { label: '禁忌', value: listOrEmpty(draft.taboos) },
        { label: '恐惧来源', value: listOrEmpty(draft.fears) },
        { label: '软肋', value: listOrEmpty(draft.soft_spots) },
        { label: '绝对红线', value: listOrEmpty(draft.non_negotiable) },
      ],
    },
    {
      title: '表达方式',
      caption: '17 — 19',
      rows: [
        {
          label: '冲突 · 幽默',
          value: `${draft.conflict_style} · ${draft.humor_style}`,
        },
        {
          label: '句长 · 标点',
          value: `${draft.sentence_length} · ${draft.punctuation}`,
        },
        {
          label: '口癖',
          value: `${listOrEmpty(draft.particles)} / ${listOrEmpty(draft.openers)}`,
        },
        { label: '禁用语', value: listOrEmpty(draft.banned_words) },
      ],
    },
    {
      title: '作息与在线',
      caption: '20 — 21',
      rows: [
        { label: '睡眠', value: draft.sleep_window.replace('-', ' – ') },
        { label: '清醒', value: draft.awake_window.replace('-', ' – ') },
        { label: '在线策略', value: draft.online_policy },
      ],
    },
    {
      title: '性格参数',
      caption: '22 — 25',
      rows: [
        {
          label: '自我',
          value: `自信 ${draft.confidence} · 自控 ${draft.self_control} · 信任 ${draft.trust_bias}`,
        },
        {
          label: '依恋',
          value: `粘人 ${draft.attachment_style} · 主动 ${draft.proactivity}`,
        },
        {
          label: '行动',
          value: `好奇 ${draft.curiosity} · 体力 ${draft.stamina_max} · 力量 ${draft.strength}`,
        },
        {
          label: '身体',
          value: `耐受 ${draft.pain_tolerance} · 恢复 ${draft.recovery_rate} · 敏感 ${draft.sensitivity}`,
        },
      ],
    },
  ];
}
