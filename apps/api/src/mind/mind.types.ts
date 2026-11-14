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

/** Where the persona last let this conversation end, and whether the person reopened it. */
export interface ConversationClosureRecord {
  closedAt: Date;
  reason: string | null;
  summary: string | null;
  nextOpening: string | null;
  reopenedAt: Date | null;
}

/** How long a reply keeps the same sender in an active exchange. */
export const MIND_ACTIVE_EXCHANGE_MINUTES = 10;

/** A newer message from the same sender in the same conversation replaced this turn. */
export class MindTurnInterruptedError extends Error {
  constructor() {
    super('同一个人发来更新的消息，这一轮改为重新规划');
    this.name = 'MindTurnInterruptedError';
  }
}

/** True for aborts and superseded turns; callers stop quietly instead of retrying. */
export function isMindTurnInterrupted(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }
  return (
    error instanceof MindTurnInterruptedError ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/** The model replied, but neither the JSON envelope nor a tool call could be recovered. */
export class MindPlannerProtocolError extends Error {
  constructor(
    message: string,
    readonly raw: string,
    readonly toolCalls: readonly ToolExecution[] = [],
  ) {
    super(message);
    this.name = 'MindPlannerProtocolError';
  }
}

export interface ParsedToolCall {
  name: string;
  input: unknown;
}

export interface SceneMessage {
  id: string;
  senderId: string;
  senderName: string;
  isSelf: boolean;
  kind: string;
  text: string;
  sentAt: string;
  images: string[];
  /** Stable asset ids rendered beside descriptions so tools can reference an image exactly. */
  imageRefs?: { id: string; description: string }[];
  /** Images present even when no description was generated. */
  imageCount: number;
  /** At-segment or poke targeting the persona's own account. */
  mentionedSelf: boolean;
  /** This message quotes one of the persona's own messages. */
  replyToSelf: boolean;
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
    /** Qualitative columns, normalized to prompt-safe text: junk objects are dropped. */
    relationTags?: string[] | null;
    addressHere?: string[] | null;
    publicMask?: string | null;
    boundaries?: string[] | null;
    openPromises?: string[] | null;
    sharedEvents?: string[] | null;
  } | null;
}

/** A group member the persona already knows from other conversations. */
export interface SceneKnownCastMember {
  contactId: string;
  nickname: string;
  memoryCount: number;
}

export interface SceneSelfMessage {
  id: string;
  text: string;
  sentAt: string;
}

export interface MindScene {
  persona: MindPersona;
  conversation: MindConversation;
  anchor: ChatMessageSnapshot;
  messages: SceneMessage[];
  cast: SceneCastMember[];
  /** Group turns only: present members with history elsewhere, without leaking it. */
  knownCast: SceneKnownCastMember[];
  stance: MindGroupStance | null;
  /**
   * The persona's own recent messages in this conversation. Busy chats push
   * them out of the prompt window, which made it re-announce what it already said.
   */
  recentSelf: SceneSelfMessage[];
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

/**
 * Compact view of everything still open, so the model can see its backlog on
 * every turn instead of only the few intentions that happen to be due.
 */
export interface MindActiveIntentionsBrief {
  total: number;
  pending: number;
  deferred: number;
  targets: {
    targetType: string;
    targetId: string;
    name: string;
    count: number;
    samples: {
      id: string;
      need: string;
      seed: string;
      urgency: number;
      createdAt: string;
    }[];
  }[];
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
/// Upper bound for one phone session; shared by the runner and the prompt so
/// the model always sees how far along it is.
export const PHONE_FOCUS_MAX_STEPS = 24;

export interface MindPhoneBattery {
  level: number;
  charging: boolean;
}

/** Passed to the next wake so the persona can digest the session and act. */
export interface MindPhoneOutcomeBrief {
  focusId: string;
  goal: string;
  status: 'SUCCEEDED' | 'FAILED';
  /** What actually happened, in the decision model's words. */
  summary: string;
  /** The one memorable line from the last round. */
  notable: string;
  /** Small impressions collected along the way. */
  notes: string[];
  /** Her own words for what got in the way; empty when nothing did. */
  problem: string;
  battery: MindPhoneBattery | null;
  error: string;
  steps: number;
  /** Conversation that requested the phone time, so help is asked in the right place. */
  conversationId?: string | null;
}

/// Compact "N 分钟 / N 小时 / N 天" label for how long ago something started
/// or ended. Shared by the situation paragraph, phone runner and phone.status.
export function elapsedLabel(value: Date | string): string {
  const started = typeof value === 'string' ? new Date(value).getTime() : value.getTime();
  const ms = Math.max(0, Date.now() - started);
  if (ms < 60_000) {
    return '不到 1 分钟';
  }
  if (ms < 3_600_000) {
    return `${Math.round(ms / 60_000)} 分钟`;
  }
  if (ms < 86_400_000) {
    return `${Math.round(ms / 3_600_000)} 小时`;
  }
  return `${Math.round(ms / 86_400_000)} 天`;
}

/** Rounds, then bounds a number into an inclusive range. */
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

/** Defensive read of loose persona JSON; non-strings yield the fallback. */
export function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Defensive read of loose persona JSON; non-numeric or non-finite values yield the fallback. */
export function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Filters a loose JSON value down to non-empty strings. */
export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/** Recovers the first JSON object from model text, tolerating fences and truncation. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = stripCodeFence(text);
  const start = trimmed.indexOf('{');
  if (start < 0) {
    return null;
  }
  const candidate = trimmed.slice(start);
  const balanced = extractFirstJsonObject(candidate);
  if (balanced) {
    const parsed = tryParseObject(balanced);
    if (parsed) {
      return parsed;
    }
  }
  const repaired = repairTruncatedJson(candidate);
  return repaired ? tryParseObject(repaired) : null;
}

/**
 * Models sometimes emit tool calls as XML envelopes instead of the documented
 * JSON. Besides `<tool_call>{"name":...}</tool_call>`, some split the name and
 * arguments into two envelopes: `<tool_call>sticker.search</tool_call>` followed
 * by `<tool_call>{"query":"..."}</tool_call>`.
 */
export function parseToolCallEnvelopes(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const pattern = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let pendingName: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const body = match[1]?.trim();
    if (!body) {
      continue;
    }

    const inline = splitToolNameAndArguments(body);
    if (inline) {
      calls.push({ name: inline.name, input: normalizeToolInput(inline.input) });
      pendingName = null;
      continue;
    }

    const parsed = parseJsonObject(body);
    if (parsed) {
      const explicitName = readString(parsed['name'] ?? parsed['tool']).trim();
      const name = explicitName || pendingName || '';
      if (!name) {
        continue;
      }
      calls.push({
        name,
        input: normalizeToolInput(
          explicitName ? (parsed['arguments'] ?? parsed['input'] ?? {}) : parsed,
        ),
      });
      pendingName = null;
      continue;
    }

    const bare = body.replace(/^["'`]+|["'`]+$/gu, '').trim();
    if (/^[A-Za-z_][\w.-]*\.[\w.-]+$/u.test(bare)) {
      pendingName = bare;
    }
  }
  return calls;
}

/** Splits the `name{...}` shorthand; a name without a dot is not a tool name. */
function splitToolNameAndArguments(body: string): { name: string; input: unknown } | null {
  const match = /^([A-Za-z_][\w.-]*)\s*(\{[\s\S]*)$/u.exec(body);
  const name = match?.[1];
  if (!name?.includes('.')) {
    return null;
  }
  const parsed = parseJsonObject(match?.[2] ?? '');
  return parsed ? { name, input: parsed } : null;
}

/** Arguments sometimes arrive as a JSON string; anything unparsable becomes an empty object. */
function normalizeToolInput(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value ?? {};
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

/**
 * DeepSeek models sometimes emit their native DSML markup instead of the
 * documented JSON:
 *
 * <｜｜DSML｜｜ calls>
 * <｜｜DSML｜｜ invoke name="memory.search">
 * <｜｜DSML｜｜ parameter name="query" string="true">年糕</｜｜DSML｜｜ parameter>
 * </｜｜DSML｜｜ invoke>
 * </｜｜DSML｜｜ calls>
 */
export function parseDsmlToolCalls(text: string): ParsedToolCall[] {
  if (!/DSML/iu.test(text)) {
    return [];
  }
  const calls: ParsedToolCall[] = [];
  const bar = String.raw`[|｜]{1,2}`;
  const invokePattern = new RegExp(
    `<${bar}\\s*DSML\\s*${bar}\\s*invoke\\s+name="([^"]+)"[^>]*>([\\s\\S]*?)<\\/${bar}\\s*DSML\\s*${bar}\\s*invoke\\s*>`,
    'giu',
  );
  const parameterPattern = new RegExp(
    `<${bar}\\s*DSML\\s*${bar}\\s*parameter\\s+name="([^"]+)"([^>]*?)>([\\s\\S]*?)<\\/${bar}\\s*DSML\\s*${bar}\\s*parameter\\s*>`,
    'giu',
  );
  let invoke: RegExpExecArray | null;
  while ((invoke = invokePattern.exec(text)) !== null) {
    const name = invoke[1];
    if (!name) {
      continue;
    }
    const input: Record<string, unknown> = {};
    const body = invoke[2] ?? '';
    parameterPattern.lastIndex = 0;
    let parameter: RegExpExecArray | null;
    while ((parameter = parameterPattern.exec(body)) !== null) {
      const key = parameter[1];
      if (!key) {
        continue;
      }
      input[key] = dsmlParameterValue(parameter[3] ?? '', parameter[2] ?? '');
    }
    calls.push({ name, input });
  }
  return calls;
}

/** `string="true"` parameters stay raw text; the rest are tried as JSON first. */
function dsmlParameterValue(raw: string, attributes: string): unknown {
  const value = raw.trim();
  if (/string\s*=\s*"true"/iu.test(attributes)) {
    return value;
  }
  if (!value) {
    return '';
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** Removes a surrounding markdown fence so the body can be parsed. */
function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

/** JSON.parse that only accepts plain objects, swallowing syntax errors. */
function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Returns the first complete `{...}` block, ignoring braces inside strings. */
function extractFirstJsonObject(text: string): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }
    if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return null;
}

/**
 * A truncated final `}` is the most common protocol failure. Try closing the
 * open string/objects first; if a key/value was cut mid-way, drop the last
 * incomplete property and close the remaining object.
 */
function repairTruncatedJson(text: string): string | null {
  let current = text.trim();
  for (let attempt = 0; attempt < 24 && current; attempt += 1) {
    const closed = closeTruncatedJson(current);
    if (closed && tryParseObject(closed)) {
      return closed;
    }
    const cut = lastTopLevelComma(current);
    if (cut < 0) {
      break;
    }
    current = current.slice(0, cut).trimEnd();
  }
  return null;
}

/** Balances unclosed strings and brackets, trimming a dangling comma or colon first. */
function closeTruncatedJson(text: string): string | null {
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  for (const char of text) {
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      stack.push('}');
    } else if (char === '[') {
      stack.push(']');
    } else if (char === '}' || char === ']') {
      const expected = stack.pop();
      if (expected !== char) {
        return null;
      }
    }
  }
  let result = text;
  if (inString) {
    if (escape) {
      result += '\\';
    }
    result += '"';
  }
  result = result.replace(/[\s,]+$/u, '');
  if (result.endsWith(':')) {
    result = result.slice(0, -1).replace(/[\s,]+$/u, '');
  }
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    result += stack[index];
  }
  return result;
}

/** Index of the last comma at the outermost object level, or -1 if there is none. */
function lastTopLevelComma(text: string): number {
  let inString = false;
  let escape = false;
  let depth = 0;
  let last = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') {
      depth += 1;
    } else if (char === '}' || char === ']') {
      depth -= 1;
    } else if (char === ',' && depth === 1) {
      last = index;
    }
  }
  return last;
}

/** First `[...]` slice of the text, returned only when it parses to an array. */
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

/** Promise-based delay; negative durations resolve on the next tick. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Zone used when a persona card has no usable `time_zone`. Never fall back to
 * the host timezone: the server usually runs in UTC, which would silently
 * override the persona's clock.
 */
export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

/** Persona zone with a deterministic default; never null. */
export function personaTimeZone(raw?: string | null): string {
  return normalizeTimeZone(raw) ?? DEFAULT_TIME_ZONE;
}

/** Formats in the resolved persona zone; unlike bare `Intl` it never reads the host zone. */
export function formatZoned(
  date: Date,
  timeZone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  locale = 'zh-CN',
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: personaTimeZone(timeZone),
  }).format(date);
}

/** Calendar day in the persona zone as YYYY-MM-DD. */
export function localDateKey(date: Date, timeZone?: string | null): string {
  return formatZoned(
    date,
    timeZone,
    { year: 'numeric', month: '2-digit', day: '2-digit' },
    'en-CA',
  );
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

/** Probes Intl for the zone name, which throws on anything unrecognised. */
function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Coarse part-of-day wording used in prompts, derived from the local hour. */
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

/** Hour of day in the persona zone. */
export function localHour(date: Date, timeZone?: string | null): number {
  return Number(formatZoned(date, timeZone, { hour: 'numeric', hour12: false }, 'en-US'));
}

/** Quiet windows wrap past midnight when start > end; missing config falls back to 0–7. */
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

/** Renders messages as sequential prompt lines, annotating day changes and long silences. */
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
      const sender = message.isSelf
        ? '我'
        : `${message.senderName}${message.replyToSelf ? '（回复我）' : ''}`;
      const images =
        message.imageRefs && message.imageRefs.length > 0
          ? message.imageRefs
              .map((ref) =>
                ref.description ? `[图片#${ref.id}：${ref.description}]` : `[图片#${ref.id}]`,
              )
              .join(' ')
          : message.images.length > 0
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

/** HH:MM in the persona zone. */
function formatLocalClock(date: Date, timeZone?: string | null): string {
  return formatZoned(date, timeZone, { hour: '2-digit', minute: '2-digit', hour12: false }, 'en-GB');
}

/** Short gap wording that promotes to the largest sensible unit. */
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

/** Renders a card value as prompt text; lists join with 、 and unknown shapes yield empty. */
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
