import {
  createDefaultPersonaAdvanced,
  createDefaultPersonaDraft,
  personaDraftSchema,
  type PersonaDraft,
} from '@inkseek/shared';

type Rec = Record<string, unknown>;

export function extractJsonObject(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenced?.[1] ?? raw).trim();
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');

  if (start < 0 || end <= start) {
    throw new Error('模型没有返回 JSON 对象');
  }

  return JSON.parse(source.slice(start, end + 1));
}

export function normalizePersonaDraft(input: unknown): PersonaDraft {
  const root = asRecord(input);
  const defaults = createDefaultPersonaDraft();
  const advancedInput = asRecord(root.advanced);
  const advancedDefaults = createDefaultPersonaAdvanced();

  const draft: PersonaDraft = {
    name: text(root.name, 20) || '未命名角色',
    aliases: strings(root.aliases, 5, 10),
    age: text(root.age, 10),
    identity: text(root.identity, 20),
    occupation: text(root.occupation, 20),
    race: text(root.race, 10),
    height_cm: text(root.height_cm, 10),
    weight_kg: text(root.weight_kg, 10),
    time_awareness: bool(root.time_awareness, defaults.time_awareness),

    body_type: text(root.body_type, 80),
    appearance: text(root.appearance, 300),

    hair: text(root.hair, 300),
    outfit: text(root.outfit, 300),

    voice: text(root.voice, 300),

    world_setting: text(root.world_setting, 500),
    backstory: text(root.backstory, 2000),
    knowledge_boundary: text(root.knowledge_boundary, 500),

    core_values: strings(root.core_values, 20, 20),
    taboos: strings(root.taboos, null, 20),
    fears: strings(root.fears, null, 20),
    soft_spots: strings(root.soft_spots, null, 20),
    non_negotiable: strings(root.non_negotiable, null, 20),

    long_term_motivation: text(root.long_term_motivation, 60),
    current_goal: text(root.current_goal, 60),
    doing_now: text(root.doing_now, 100),
    obstacle: text(root.obstacle, 60),
    location: text(root.location, 40),

    language_style: text(root.language_style, 200),
    conflict_style: text(root.conflict_style, 200) || defaults.conflict_style,
    humor_style: text(root.humor_style, 200) || defaults.humor_style,
    memory_bias: text(root.memory_bias, 200) || defaults.memory_bias,
    sentence_length: text(root.sentence_length, 200) || defaults.sentence_length,
    punctuation: text(root.punctuation, 200) || defaults.punctuation,
    typo_level: level(root.typo_level, defaults.typo_level),
    split_level: level(root.split_level, defaults.split_level),

    particles: strings(root.particles, null, 10),
    openers: strings(root.openers, null, 10),

    banned_words: strings(root.banned_words, null, 20),

    emoji_level: level(root.emoji_level, defaults.emoji_level),
    typing_level: level(root.typing_level, defaults.typing_level),
    time_zone: text(root.time_zone, 40) || defaults.time_zone,

    online_policy: text(root.online_policy, 200) || defaults.online_policy,
    sleep_depth: level(root.sleep_depth, defaults.sleep_depth),

    confidence: slider(root.confidence, defaults.confidence),
    self_control: slider(root.self_control, defaults.self_control),
    shame: slider(root.shame, defaults.shame),
    trust_bias: slider(root.trust_bias, defaults.trust_bias),

    attachment_style: slider(root.attachment_style, defaults.attachment_style),
    possessiveness_base: slider(root.possessiveness_base, defaults.possessiveness_base),
    agreeableness: slider(root.agreeableness, defaults.agreeableness),
    proactivity: slider(root.proactivity, defaults.proactivity),

    curiosity: slider(root.curiosity, defaults.curiosity),
    stamina_max: slider(root.stamina_max, defaults.stamina_max),
    strength: slider(root.strength, defaults.strength),
    agility: slider(root.agility, defaults.agility),

    pain_tolerance: slider(root.pain_tolerance, defaults.pain_tolerance),
    recovery_rate: slider(root.recovery_rate, defaults.recovery_rate),
    sensitivity: slider(root.sensitivity, defaults.sensitivity),

    advanced: {
      address_for_stranger:
        text(advancedInput.address_for_stranger, 40) || advancedDefaults.address_for_stranger,
      address_for_close:
        text(advancedInput.address_for_close, 40) || advancedDefaults.address_for_close,
      forbidden_addresses: strings(advancedInput.forbidden_addresses, 10, 20),
      allowed_addresses: strings(advancedInput.allowed_addresses, 10, 20),
      anchor_few_shot: text(advancedInput.anchor_few_shot, 1000),
      in_character_principle:
        text(advancedInput.in_character_principle, 500) || advancedDefaults.in_character_principle,
      in_character_triggers: strings(advancedInput.in_character_triggers, 10, 40),
      in_character_never: strings(advancedInput.in_character_never, 10, 40),
      in_character_recovery:
        text(advancedInput.in_character_recovery, 300) || advancedDefaults.in_character_recovery,
      in_character_allowed_meta: strings(advancedInput.in_character_allowed_meta, 10, 40),
      sensitivity_map: strings(advancedInput.sensitivity_map, 20, 40),
      touch_preference: text(advancedInput.touch_preference, 200),
      explicit_level_char:
        text(advancedInput.explicit_level_char, 200) || advancedDefaults.explicit_level_char,
      aftercare_need_base: slider(
        advancedInput.aftercare_need_base,
        advancedDefaults.aftercare_need_base,
      ),
      decline_response_style:
        text(advancedInput.decline_response_style, 500) || advancedDefaults.decline_response_style,
    },
  };

  return personaDraftSchema.parse(draft);
}

function asRecord(value: unknown): Rec {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {};
}

function text(value: unknown, max: number): string {
  if (typeof value === 'string') {
    return value.trim().slice(0, max);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).slice(0, max);
  }

  return '';
}

function strings(value: unknown, maxItems: number | null, perItem: number): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[，,、;；|/\n]+/)
      : [];
  const result: string[] = [];

  for (const entry of list) {
    if (typeof entry !== 'string') {
      continue;
    }

    const item = entry.trim().slice(0, perItem);

    if (!item || result.includes(item)) {
      continue;
    }

    result.push(item);

    if (maxItems !== null && result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const textValue = value.trim().toLowerCase();

    if (['true', '是', 'yes', '1'].includes(textValue)) {
      return true;
    }

    if (['false', '否', 'no', '0'].includes(textValue)) {
      return false;
    }
  }

  return fallback;
}

function level(value: unknown, fallback: number): number {
  return clampInt(value, 0, 4, fallback);
}

function slider(value: unknown, fallback: number): number {
  return clampInt(value, 0, 100, fallback);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').trim());

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}
