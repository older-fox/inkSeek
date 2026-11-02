import type { ChatChannelPersonaSnapshot, ChatPersonaValue } from '@inkseek/shared';
import type { Persona } from './personas';

const TRAIT_KEYS: Record<string, string> = {
  自信: 'confidence',
  自控: 'self_control',
  主动: 'proactivity',
  羞耻: 'shame',
  亲和: 'attachment_style',
  占有: 'possessiveness_base',
};

const PHYSICAL_KEYS: Record<string, string> = {
  体力: 'stamina_max',
  力量: 'strength',
  灵活: 'agility',
  耐受: 'pain_tolerance',
  敏感度: 'sensitivity',
  顺从度: 'agreeableness',
};

const EXPERIENCE_LEVELS: Record<string, number> = {
  'Ⅰ': 1,
  'Ⅱ': 2,
  'Ⅲ': 3,
  'Ⅳ': 4,
  'Ⅴ': 5,
};

/**
 * Flattens a Persona Center card into channel persona field values. The result
 * is sent once at import time and stored under the new channel namespace, so
 * later edits to the source card never reach the channel copy.
 */
export function personaSnapshotOf(card: Persona): ChatChannelPersonaSnapshot {
  const values: Record<string, ChatPersonaValue> = {
    name: card.name,
    age: card.age,
    gender: card.gender,
    identity: card.occupation,
    occupation: card.occupation,
    keywords: [...card.keywords],
    backstory: card.story,
    taboos: [...card.taboos],
    anchor_quote: card.quote,
    language_style: card.languageStyle,
    address_style: card.addressStyle,
    experience_level: EXPERIENCE_LEVELS[card.experience.level] ?? 1,
    card_serial: card.serial,
    card_experience: `${card.experience.level} · ${card.experience.label}`,
    card_traits: card.traits.map((trait) => `${trait.label} ${trait.value}`),
    card_physical: card.physical.map((trait) => `${trait.label} ${trait.value}`),
  };

  card.traits.forEach((trait) => {
    const key = TRAIT_KEYS[trait.label];
    if (key) {
      values[key] = trait.value;
    }
  });

  card.physical.forEach((trait) => {
    const key = PHYSICAL_KEYS[trait.label];
    if (key) {
      values[key] = trait.value;
    }
  });

  return {
    cardId: card.id,
    cardSerial: card.serial,
    name: card.name,
    identity: card.occupation,
    quote: card.quote,
    accent: card.accent,
    values,
  };
}
