import type {
  ChatChannelPersona,
  ChatContact,
  ChatConversation,
  ChatMessageRecord,
  PersonaGroupStance,
  PersonaRelationship,
  PersonaState,
} from '../generated/prisma/client.js';
import type { PipelineMessage } from '../chat/pipeline/pipeline-types.js';

export type MindPersona = ChatChannelPersona;
export type MindState = PersonaState;
export type MindRelationship = PersonaRelationship & { contact: ChatContact };
export type MindGroupStance = PersonaGroupStance & { conversation: ChatConversation };
export type MindConversation = ChatConversation;
export type MindMessage = ChatMessageRecord;

export interface SceneMessage {
  id: string;
  senderId: string;
  senderName: string;
  isSelf: boolean;
  kind: string;
  text: string;
  sentAt: string;
  images: string[];
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
  anchor: PipelineMessage;
  messages: SceneMessage[];
  cast: SceneCastMember[];
  stance: MindGroupStance | null;
  startedAt: Date;
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
  }[];
  overnightMessages: SceneMessage[];
  recentMemories: {
    title: string;
    content: string;
    occurredAt: string;
  }[];
  unconsolidatedCount: number;
}

export interface ToolCall {
  thought?: string;
  tool?: string;
  input?: unknown;
  final?: unknown;
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

export const MIND_EMBEDDING_DIM = 256;
export const MIND_MAX_TOOL_STEPS = 6;
export const MIND_MAX_TOOL_MS = 25_000;
export const MIND_MAX_MEMORY_WRITES = 5;
export const MIND_MAX_TODOS = 3;
/** Hard per-turn cap; daily caps and cooldowns live in MindDriftService. */
export const MIND_MAX_RELATIONSHIP_DELTA = 5;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function scorePercent(value: unknown, fallback = 50): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 100) : fallback;
}

export function scoreSigned(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, -100, 100) : fallback;
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

export function formatSceneForPrompt(messages: readonly SceneMessage[]): string {
  return messages
    .map((message) => {
      const sender = message.isSelf ? '我' : message.senderName;
      const images = message.images.length > 0 ? ` [图片：${message.images.join('；')}]` : '';
      const text = message.text.trim() || (message.kind === 'FACE' ? '[表情]' : '[空消息]');
      return `[${message.sentAt}] ${sender}：${text}${images}`;
    })
    .join('\n');
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
