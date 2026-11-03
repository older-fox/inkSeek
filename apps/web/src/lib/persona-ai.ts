import type { PersonaDraft } from './persona-draft';

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
    {
      title: '进阶档案',
      caption: '20 fields',
      rows: [
        {
          label: '称呼',
          value: `陌生 ${draft.advanced.address_for_stranger} · 亲近 ${draft.advanced.address_for_close}`,
        },
        { label: '社交圈', value: listOrEmpty(draft.advanced.social_circle) },
        { label: '技能', value: listOrEmpty(draft.advanced.skills) },
        { label: '防破面', value: textOrEmpty(draft.advanced.in_character_principle) },
        {
          label: '工作 · 免打扰',
          value: `${draft.advanced.work_window} · ${draft.advanced.do_not_disturb}`,
        },
        { label: '敏感点', value: listOrEmpty(draft.advanced.sensitivity_map) },
        { label: '格调尺度', value: draft.advanced.explicit_level_char },
      ],
    },
  ];
}
