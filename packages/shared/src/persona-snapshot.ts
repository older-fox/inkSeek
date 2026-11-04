import type { PersonaDraft, PersonaSummary } from './persona.js';
import type { ChatChannelPersonaDraft, ChatPersonaValue } from './types.js';

const EXPERIENCE_LEVELS: Record<string, number> = {
  'Ⅰ': 1,
  'Ⅱ': 2,
  'Ⅲ': 3,
  'Ⅳ': 4,
  'Ⅴ': 5,
};

type SnapshotSource = Pick<
  PersonaSummary,
  'serial' | 'name' | 'occupation' | 'age' | 'profile' | 'data' | 'createdAt' | 'updatedAt'
> & { id: string };

/**
 * Builds the frozen channel copy from the latest persona card data. Kept in
 * shared so the server can snapshot at connect time and the contract stays the
 * same everywhere.
 */
export function buildChannelPersonaSnapshot(card: SnapshotSource): ChatChannelPersonaDraft {
  const { data, profile } = card;
  const values: Record<string, ChatPersonaValue> = {};
  const put = (key: string, value: ChatPersonaValue | undefined) => {
    if (value === undefined) {
      return;
    }

    if (typeof value === 'string') {
      if (value.trim()) {
        values[key] = value;
      }
      return;
    }

    if (Array.isArray(value)) {
      const items = value.map((item) => item.trim()).filter(Boolean);
      if (items.length > 0) {
        values[key] = items;
      }
      return;
    }

    values[key] = value;
  };

  put('name', data.name.trim() || card.name);
  put('aliases', data.aliases);
  put('keywords', profile.keywords);
  put('age', Number(data.age) > 0 ? Number(data.age) : card.age || undefined);
  put('gender', profile.gender);
  put('identity', data.identity.trim() || card.occupation);
  put('occupation', data.occupation.trim() || card.occupation);
  put('race', data.race);
  put('height_cm', data.height_cm);
  put('weight_kg', data.weight_kg);
  put('body_type', data.body_type);
  put('appearance', data.appearance);
  put('hair', data.hair);
  put('outfit', data.outfit);
  put('voice', data.voice);
  put('world_setting', data.world_setting);
  put('backstory', data.backstory);
  put('knowledge_boundary', data.knowledge_boundary);
  put('time_awareness', data.time_awareness);
  put('core_values', data.core_values);
  put('taboos', data.taboos);
  put('fears', data.fears);
  put('soft_spots', data.soft_spots);
  put('non_negotiable', data.non_negotiable);
  put('long_term_motivation', data.long_term_motivation);
  put('current_goal', data.current_goal);
  put('doing_now', data.doing_now);
  put('obstacle', data.obstacle);
  put('conflict_style', data.conflict_style);
  put('humor_style', data.humor_style);
  put('memory_bias', data.memory_bias);
  put('sentence_length', data.sentence_length);
  put('punctuation', data.punctuation);
  put('typo_level', data.typo_level);
  put('split_level', data.split_level);
  put('particles', data.particles);
  put('openers', data.openers);
  put('banned_words', data.banned_words);
  put('emoji_level', data.emoji_level);
  put('typing_level', data.typing_level);
  put('time_zone', data.time_zone);
  put('online_policy', data.online_policy);
  put('sleep_depth', data.sleep_depth);
  put('location', data.location);
  put('language_style', data.language_style || profile.languageStyle || derivedLanguageStyle(data));
  put('anchor_quote', profile.quote);

  const advanced = data.advanced;

  put('address_for_stranger', advanced.address_for_stranger);
  put('address_for_close', advanced.address_for_close);
  put('forbidden_addresses', advanced.forbidden_addresses);
  put('allowed_addresses', advanced.allowed_addresses);
  put('anchor_few_shot', advanced.anchor_few_shot);
  put('in_character_principle', advanced.in_character_principle);
  put('in_character_triggers', advanced.in_character_triggers);
  put('in_character_never', advanced.in_character_never);
  put('in_character_recovery', advanced.in_character_recovery);
  put('in_character_allowed_meta', advanced.in_character_allowed_meta);
  put('sensitivity_map', advanced.sensitivity_map);
  put('touch_preference', advanced.touch_preference);
  put('explicit_level_char', advanced.explicit_level_char);
  put('aftercare_need_base', advanced.aftercare_need_base);
  put('decline_response_style', advanced.decline_response_style);

  put('confidence', data.confidence);
  put('self_control', data.self_control);
  put('shame', data.shame);
  put('trust_bias', data.trust_bias);
  put('attachment_style', data.attachment_style);
  put('possessiveness_base', data.possessiveness_base);
  put('agreeableness', data.agreeableness);
  put('proactivity', data.proactivity);
  put('curiosity', data.curiosity);
  put('stamina_max', data.stamina_max);
  put('strength', data.strength);
  put('agility', data.agility);
  put('pain_tolerance', data.pain_tolerance);
  put('recovery_rate', data.recovery_rate);
  put('sensitivity', data.sensitivity);

  put('experience_level', EXPERIENCE_LEVELS[profile.experienceLevel] ?? 1);
  put('card_serial', card.serial);
  put('card_experience', `${profile.experienceLevel} · ${profile.experienceLabel}`);
  put('card_traits', [
    `自信 ${data.confidence}`,
    `自控 ${data.self_control}`,
    `主动 ${data.proactivity}`,
    `羞耻 ${data.shame}`,
    `亲和 ${data.attachment_style}`,
    `占有 ${data.possessiveness_base}`,
  ]);
  put('card_physical', [
    `体力 ${data.stamina_max}`,
    `力量 ${data.strength}`,
    `灵活 ${data.agility}`,
    `耐受 ${data.pain_tolerance}`,
    `敏感度 ${data.sensitivity}`,
    `自控力 ${data.self_control}`,
    `自信 ${data.confidence}`,
    `顺从度 ${data.agreeableness}`,
  ]);
  put('created_at', card.createdAt);
  put('updated_at', card.updatedAt);

  return {
    cardId: card.id,
    cardSerial: card.serial,
    name: data.name.trim() || card.name,
    identity: data.identity.trim() || card.occupation,
    quote: profile.quote,
    accent: profile.accent,
    values,
  };
}

export function derivedLanguageStyle(data: PersonaDraft): string {
  const style = data.language_style.trim();

  if (style) {
    return style;
  }

  return [data.sentence_length, data.punctuation, data.humor_style]
    .map((item) => item.trim())
    .filter(Boolean)
    .join('；');
}
