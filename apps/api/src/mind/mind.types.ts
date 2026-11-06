import type {
  ChatChannelPersona,
  ChatConversation,
  PersonaGroupStance,
  PersonaState,
} from '../generated/prisma/client.js';
import type { ChatMessageSnapshot } from '../chat/chat-message.types.js';

export type MindPersona = ChatChannelPersona;
export type MindState = PersonaState;
export type MindGroupStance = PersonaGroupStance & { conversation: ChatConversation };
export type MindConversation = ChatConversation;

export interface SceneMessage {
  id: string;
  senderId: string;
  senderName: string;
  isSelf: boolean;
  kind: string;
  text: string;
  sentAt: string;
  images: string[];
  /** Images present even when no description was generated. */
  imageCount: number;
  /** At-segment or poke targeting the persona's own account. */
  mentionedSelf: boolean;
}

export interface SceneCastMember {
  contactId: string;
  externalId: string;
  nickname: string;
  isSelf: boolean;
  role: string;
  relationship: {
    affinity: number;
    trust: number;
    hostility: number;
    attraction: number;
    intimacy: number;
    obligation: number;
    familiarity: number;
    fear: number;
    respect: number;
    dependency: number;
    possessiveness: number;
    friction: number;
    unresolvedConflict: number;
    blocked: boolean;
    mutedUntil: string | null;
    disclosureScope: string;
  } | null;
}

export interface MindScene {
  persona: MindPersona;
  conversation: MindConversation;
  anchor: ChatMessageSnapshot;
  messages: SceneMessage[];
  cast: SceneCastMember[];
  stance: MindGroupStance | null;
  startedAt: Date;
}

/** Non-binding rest reference: the model still decides whether and how long to leave. */
export interface MindSleepBrief {
  localTime: string;
  timeZone: string;
  /** 0 (very light sleeper) .. 4 (very deep sleeper). */
  sleepDepth: number;
  lastSleep: {
    kind: string;
    title: string;
    minutes: number;
    plannedMinutes: number | null;
    endedAt: string;
  } | null;
  awakeMinutes: number | null;
  sleepDebt: number;
  energy: number;
  health: number;
  stress: number;
  /** Only values already in a dangerous band; the model decides what to do. */
  criticalWarnings: string[];
  suggestion: {
    action: 'SLEEP' | 'NAP' | 'NONE';
    minutes: number | null;
    reason: string;
  };
}

export interface MindWakeBrief {
  now: Date;
  timeZone: string;
  state: MindState;
  dueTodos: {
    id: string;
    title: string;
    detail: string;
    kind: string;
    priority: number;
    dueAt: string | null;
  }[];
  dueIntentions: {
    id: string;
    targetType: string;
    targetId: string;
    reason: string;
    seed: string;
    urgency: number;
    need: string;
    confidence: number;
    risk: number;
    relationScore: number;
  }[];
  overnightMessages: SceneMessage[];
  unconsolidatedCount: number;
}

/** How a previous proactive attempt landed, shown to the model as feedback. */
export interface MindIntentionFeedback {
  need: string;
  seed: string;
  feedback: string;
  status: string;
  at: string;
}

export interface ToolExecution {
  name: string;
  input: unknown;
  output: unknown;
  error?: string;
  durationMs: number;
}

export interface MemoryPromptItem {
  id: string;
  content: string;
  kind: string;
  occurredAt: string;
  importance: number;
  visibility: string;
  secret: boolean;
}

/** How many memories exist for this persona, so the model knows the library is larger than the prompt. */
export interface MindMemoryStats {
  total: number;
  recent7d: number;
  lastAt: string | null;
}

export const MIND_EMBEDDING_DIM = 256;
export const MIND_MAX_TOOL_STEPS = 10;
export const MIND_MAX_TOOL_MS = 25_000;
/** Hard per-turn cap; daily caps and cooldowns live in MindDriftService. */
export const MIND_MAX_RELATIONSHIP_DELTA = 5;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * One comparable number for "how close is this person": liking first,
 * then intimacy, trust and a sense of owing. -100 .. 100.
 */
export function relationScoreOf(
  relationship: {
    affinity: number;
    intimacy: number;
    trust: number;
    obligation: number;
  } | null,
): number {
  if (!relationship) {
    return 0;
  }
  return Math.round(
    relationship.affinity * 0.4 +
      relationship.intimacy * 0.3 +
      relationship.trust * 0.2 +
      relationship.obligation * 0.1,
  );
}

export function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseJsonArray(text: string): unknown[] | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export function localDateKey(date: Date, timeZone?: string | null): string {
  try {
    if (timeZone) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date);
      const year = parts.find((part) => part.type === 'year')?.value;
      const month = parts.find((part) => part.type === 'month')?.value;
      const day = parts.find((part) => part.type === 'day')?.value;
      if (year && month && day) {
        return `${year}-${month}-${day}`;
      }
    }
  } catch {
    // Fall back to the server local date.
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const TIME_ZONE_ALIASES = new Map<string, string>([
  ['utc+8', 'Asia/Shanghai'],
  ['utc+08', 'Asia/Shanghai'],
  ['utc+8:00', 'Asia/Shanghai'],
  ['utc+08:00', 'Asia/Shanghai'],
  ['gmt+8', 'Asia/Shanghai'],
  ['gmt+08:00', 'Asia/Shanghai'],
  ['+8', 'Asia/Shanghai'],
  ['+08:00', 'Asia/Shanghai'],
  ['东八区', 'Asia/Shanghai'],
  ['北京时间', 'Asia/Shanghai'],
  ['中国标准时间', 'Asia/Shanghai'],
  ['beijing time', 'Asia/Shanghai'],
  ['china standard time', 'Asia/Shanghai'],
  ['asia/shanghai', 'Asia/Shanghai'],
  ['utc', 'UTC'],
  ['gmt', 'UTC'],
]);

/**
 * Persona cards often store "UTC+8（东八区）" instead of an IANA zone.
 * Intl silently falls back to server time on an invalid zone, which breaks
 * as soon as the server is not in that offset, so normalize before use.
 */
export function normalizeTimeZone(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) {
    return null;
  }
  if (isValidTimeZone(value)) {
    return value;
  }
  const compact = value
    .replace(/（[^）]*）/gu, '')
    .replace(/\([^)]*\)/gu, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  const alias = TIME_ZONE_ALIASES.get(compact);
  if (alias) {
    return alias;
  }
  return isValidTimeZone(compact) ? compact : null;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function timePeriodLabel(date: Date, timeZone?: string | null): string {
  const hour = localHour(date, timeZone);
  if (hour < 5) return '凌晨';
  if (hour < 8) return '清晨';
  if (hour < 11) return '上午';
  if (hour < 13) return '中午';
  if (hour < 18) return '下午';
  if (hour < 19) return '傍晚';
  if (hour < 23) return '晚上';
  return '深夜';
}

export function localHour(date: Date, timeZone?: string | null): number {
  try {
    if (timeZone) {
      return Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone,
          hour: 'numeric',
          hour12: false,
        }).format(date),
      );
    }
  } catch {
    // Fall back to the server local hour.
  }
  return date.getHours();
}

export function isQuietHour(hour: number, quietHours: unknown): boolean {
  if (!quietHours || typeof quietHours !== 'object' || Array.isArray(quietHours)) {
    return hour >= 0 && hour < 7;
  }
  const record = quietHours as Record<string, unknown>;
  const start = readNumber(record['start'], 0);
  const end = readNumber(record['end'], 7);
  if (start === end) {
    return false;
  }
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function formatSceneForPrompt(
  messages: readonly SceneMessage[],
  timeZone?: string | null,
): string {
  let previousDay = '';
  let previousAt: number | null = null;
  return messages
    .map((message) => {
      const at = new Date(message.sentAt);
      const valid = !Number.isNaN(at.getTime());
      const day = valid ? localDateKey(at, timeZone) : '';
      const clock = valid ? formatLocalClock(at, timeZone) : message.sentAt;
      const label = valid ? (day === previousDay ? clock : `${day.slice(5)} ${clock}`) : clock;
      const gap = previousAt !== null && valid ? at.getTime() - previousAt : 0;
      const gapLabel = gap >= 30 * 60_000 ? ` · 隔 ${formatElapsed(gap)}` : '';
      if (valid) {
        previousDay = day;
        previousAt = at.getTime();
      }
      const sender = message.isSelf ? '我' : message.senderName;
      const images =
        message.images.length > 0
          ? `[图片：${message.images.join('；')}]`
          : message.imageCount > 0
            ? '[图片]'
            : '';
      const text = message.text.trim();
      // Image-only messages are not empty; avoid prefixing them with [空消息].
      const body =
        [text, images].filter(Boolean).join(' ') ||
        (message.kind === 'FACE' ? '[表情]' : '[空消息]');
      return `[${label}${gapLabel}] ${sender}：${body}`;
    })
    .join('\n');
}

function formatLocalClock(date: Date, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || undefined,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
}

function formatElapsed(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) {
    return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
  }
  const days = Math.floor(hours / 24);
  const leftover = hours % 24;
  return leftover === 0 ? `${days} 天` : `${days} 天 ${leftover} 小时`;
}

export function personaValueText(
  values: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = values?.[key];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string').join('、');
  }
  return '';
}
