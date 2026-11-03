import type { PersonaSummary } from '@inkseek/shared';

export type PersonaAccent = 'brass' | 'jade';

export type PersonaGender = '女' | '男' | '未设定';

export interface PersonaTrait {
  label: string;
  value: number;
}

/** Card-face view built from a persisted persona record. */
export interface Persona {
  id: string;
  serial: string;
  name: string;
  occupation: string;
  age: number;
  gender: PersonaGender;
  quote: string;
  keywords: string[];
  accent: PersonaAccent;
  traits: PersonaTrait[];
  languageStyle: string;
  addressStyle: string;
  story: string;
  taboos: string[];
  physical: PersonaTrait[];
  experience: { level: string; label: string };
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export function personaViewOf(record: PersonaSummary): Persona {
  const { data, profile } = record;

  return {
    id: record.id,
    serial: record.serial,
    name: data.name.trim() || record.name,
    occupation: data.occupation.trim() || record.occupation,
    age: Number(data.age) > 0 ? Number(data.age) : record.age,
    gender: profile.gender,
    quote: profile.quote,
    keywords: profile.keywords,
    accent: profile.accent,
    traits: [
      { label: '自信', value: data.confidence },
      { label: '自控', value: data.self_control },
      { label: '主动', value: data.proactivity },
      { label: '羞耻', value: data.shame },
      { label: '亲和', value: data.attachment_style },
      { label: '占有', value: data.possessiveness_base },
    ],
    languageStyle: profile.languageStyle,
    addressStyle: profile.addressStyle,
    story: data.backstory,
    taboos: data.taboos.filter((item) => item.trim()),
    physical: [
      { label: '体力', value: data.stamina_max },
      { label: '力量', value: data.strength },
      { label: '灵活', value: data.agility },
      { label: '耐受', value: data.pain_tolerance },
      { label: '敏感度', value: data.sensitivity },
      { label: '自控力', value: data.self_control },
      { label: '自信', value: data.confidence },
      { label: '顺从度', value: data.agreeableness },
    ],
    experience: {
      level: profile.experienceLevel,
      label: profile.experienceLabel,
    },
    currentVersion: record.currentVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function matchesPersona(persona: Persona, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    persona.name,
    persona.serial,
    persona.occupation,
    persona.gender,
    persona.quote,
    persona.keywords.join(' '),
    persona.languageStyle,
    persona.addressStyle,
    persona.story,
    persona.taboos.join(' '),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}
