import type { ChatPipelineMessageValue } from '@inkseek/shared';
import type { PipelineGraph } from './pipeline-graph.js';
import {
  PROMPT_COMPRESSION_DEFAULT_TTL_SECONDS,
  PROMPT_COMPRESSION_MAX_TTL_SECONDS,
  PROMPT_COMPRESSION_MIN_TTL_SECONDS,
  type PipelineEffect,
  type PipelineInputs,
  type PipelineMessage,
  type PipelineNodeContext,
  type PipelineNodeDefinition,
  type PipelineOutputs,
} from './pipeline-types.js';

/** Segments accept any language so `$vars.白名单` style keys stay referenceable. */
const REFERENCE = /^\$([\p{L}\p{N}\p{M}_-]+(?:\.[\p{L}\p{N}\p{M}_-]+)*)$/u;
const TEMPLATE = /\{\{\s*([\p{L}\p{N}\p{M}_-]+(?:\.[\p{L}\p{N}\p{M}_-]+)*)\s*\}\}/gu;
const MAX_REPLY_LENGTH = 4000;
const MAX_REPLY_IMAGES = 4;
const MAX_DELAY_MS = 60_000;
const MAX_IMAGE_INDEX = 99;
const MAX_DESCRIPTION_PROMPT = 4000;
const MAX_CARD_TEXT = 4000;
const MAX_WHITELIST_TEXT = 4000;
const MAX_CHAT_TOKENS = 8192;
const MAX_CHAT_TEMPERATURE = 2;
/** Appended to the system prompt in JSON mode so the model returns an envelope. */
const JSON_ENVELOPE_HINT =
  '只输出一个 JSON 对象，不要使用 Markdown 代码块或额外解释。格式：{"action":"要执行的动作，没有动作时为空字符串","args":{"参数":"值"},"reply":"给用户的最终回复"}。args 必须是对象，没有参数时用空对象。';

function readPath(root: unknown, path: string): unknown {
  if (!path) {
    return root;
  }

  return path.split('.').reduce<unknown>((current, key) => {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, root);
}

type PipelineVariables = ReadonlyMap<string, unknown>;

function readReference(
  reference: string,
  message: PipelineMessage,
  outputs: PipelineOutputs,
  inputs: PipelineInputs,
  variables: PipelineVariables,
): unknown {
  const [root, ...rest] = reference.split('.');
  if (!root) {
    return undefined;
  }

  if (root === 'vars') {
    const [key, ...fieldPath] = rest;
    return readPath(key ? variables.get(key) : undefined, fieldPath.join('.'));
  }

  const base =
    root === 'message' ? message : root === 'input' ? inputs : outputs.get(root);
  return readPath(base, rest.join('.'));
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Text ports carry strings, but tolerate scalars so references stay usable. */
function asText(value: unknown): string {
  return typeof value === 'string' ? value : stringify(value);
}

function createHelpers(
  message: PipelineMessage,
  outputs: PipelineOutputs,
  inputs: PipelineInputs,
  variables: PipelineVariables,
) {
  const template = (text: string): string =>
    text.replace(TEMPLATE, (_match, reference: string) =>
      stringify(readReference(reference, message, outputs, inputs, variables)),
    );

  const resolve = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const exact = REFERENCE.exec(value);
      if (exact?.[1]) {
        return readReference(exact[1], message, outputs, inputs, variables);
      }
      if (value.includes('{{')) {
        return template(value);
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(resolve);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
          key,
          resolve(entry),
        ]),
      );
    }
    return value;
  };

  return { resolve, template };
}

function readString(config: Record<string, unknown> | undefined, key: string): string {
  const value = config?.[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`节点配置缺少字符串字段：${key}`);
  }
  return value;
}

function readOptionalString(config: Record<string, unknown> | undefined, key: string): string | null {
  const value = config?.[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`节点配置字段必须是字符串：${key}`);
  }
  return value;
}

function readBoolean(config: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = config?.[key];
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`节点配置字段必须是布尔值：${key}`);
  }
  return value;
}

function readDescriptionPrompt(config: Record<string, unknown> | undefined): string {
  const prompt = readString(config, 'prompt').trim();
  if (prompt.length === 0) {
    throw new Error('图片描述提示词不能为空');
  }
  if (prompt.length > MAX_DESCRIPTION_PROMPT) {
    throw new Error(`图片描述提示词不能超过 ${MAX_DESCRIPTION_PROMPT} 个字符`);
  }
  return prompt;
}

function readImageIndex(config: Record<string, unknown> | undefined): number {
  const value = config?.['imageIndex'];
  if (value === undefined) {
    return 0;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_IMAGE_INDEX
  ) {
    throw new Error(`第几张图片必须是 0–${MAX_IMAGE_INDEX} 之间的整数`);
  }
  return value;
}

type DescriptionMode = 'single' | 'all';

function readDescriptionMode(config: Record<string, unknown> | undefined): DescriptionMode {
  const value = config?.['mode'];
  if (value === undefined) {
    return 'single';
  }
  if (value !== 'single' && value !== 'all') {
    throw new Error('描述范围必须是 single 或 all');
  }
  return value;
}

function readDelayMs(config: Record<string, unknown> | undefined): number {
  const value = config?.['delayMs'];
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > MAX_DELAY_MS
  ) {
    throw new Error(`等待时长必须是 0–${MAX_DELAY_MS} 之间的毫秒数`);
  }
  return Math.round(value);
}

type ChatOutputFormat = 'text' | 'json';

function readChatFormat(config: Record<string, unknown> | undefined): ChatOutputFormat {
  const value = config?.['format'];
  if (value === undefined || value === null || value === '') {
    return 'text';
  }
  if (value !== 'text' && value !== 'json') {
    throw new Error('AI 输出格式必须是 text 或 json');
  }
  return value;
}

/** Text carried by an input port; empty when the port is not wired. */
function readChatInput(inputs: Record<string, unknown>, key: string): string {
  const value = inputs[key];
  return value === undefined || value === null ? '' : asText(value).trim();
}

function readChatTemperature(config: Record<string, unknown> | undefined): number {
  const value = config?.['temperature'];
  if (value === undefined || value === null) {
    return 0.7;
  }
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > MAX_CHAT_TEMPERATURE
  ) {
    throw new Error(`温度必须是 0–${MAX_CHAT_TEMPERATURE} 之间的数字`);
  }
  return value;
}

function readChatMaxTokens(config: Record<string, unknown> | undefined): number {
  const value = config?.['maxTokens'];
  if (value === undefined || value === null) {
    return 1024;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_CHAT_TOKENS
  ) {
    throw new Error(`最大 tokens 必须是 1–${MAX_CHAT_TOKENS} 之间的整数`);
  }
  return value;
}

function readCompressionTtl(config: Record<string, unknown> | undefined): number {
  const value = config?.['ttlSeconds'];
  if (value === undefined || value === null) {
    return PROMPT_COMPRESSION_DEFAULT_TTL_SECONDS;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < PROMPT_COMPRESSION_MIN_TTL_SECONDS ||
    value > PROMPT_COMPRESSION_MAX_TTL_SECONDS
  ) {
    throw new Error(
      `缓存 TTL 必须是 ${PROMPT_COMPRESSION_MIN_TTL_SECONDS}–${PROMPT_COMPRESSION_MAX_TTL_SECONDS} 秒之间的整数`,
    );
  }
  return value;
}

/** Accepts fenced or bare JSON and returns the first object it can parse. */
function parseChatEnvelope(text: string): Record<string, unknown> | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function chatErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    if (response && typeof response === 'object') {
      const message = (response as Record<string, unknown>).message;
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads the variable a card targets. An empty value is allowed so a freshly
 * added card can be saved before the user picks one; a non-empty key must be
 * declared on the graph, otherwise the save is rejected.
 */
function readVariableKey(
  config: Record<string, unknown> | undefined,
  graph: PipelineGraph,
): string | null {
  const raw = config?.['variable'];
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new Error('管线变量字段必须是字符串');
  }
  const key = raw.trim();
  if (key.length === 0) {
    return null;
  }
  if (!graph.variables.some((variable) => variable.key === key)) {
    throw new Error(`管线变量 ${key} 未声明，请先在图的变量列表里添加`);
  }
  return key;
}

type ConstantKind = 'text' | 'number' | 'boolean';

function readConstantKind(config: Record<string, unknown> | undefined): ConstantKind {
  const value = config?.['kind'];
  if (value === undefined) {
    return 'text';
  }
  if (value !== 'text' && value !== 'number' && value !== 'boolean') {
    throw new Error('固定内容的类型必须是 text、number 或 boolean');
  }
  return value;
}

function readConstantValue(config: Record<string, unknown> | undefined): string | number | boolean {
  const raw = readOptionalString(config, 'value') ?? '';
  switch (readConstantKind(config)) {
    case 'text':
      return raw;
    case 'number': {
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        throw new Error('固定内容缺少数字');
      }
      const value = Number(trimmed);
      if (!Number.isFinite(value)) {
        throw new Error(`固定内容不是有效数字：${raw}`);
      }
      return value;
    }
    default: {
      const trimmed = raw.trim().toLowerCase();
      if (trimmed === '' || trimmed === 'false') {
        return false;
      }
      if (trimmed === 'true') {
        return true;
      }
      throw new Error('布尔固定内容只能填 true 或 false');
    }
  }
}

type SourceListMode = 'off' | 'whitelist' | 'blacklist';

function readSourceListMode(config: Record<string, unknown> | undefined): SourceListMode {
  const value = config?.['mode'];
  if (value === undefined) {
    return 'off';
  }
  if (value !== 'off' && value !== 'whitelist' && value !== 'blacklist') {
    throw new Error('来源过滤方式必须是 off、whitelist 或 blacklist');
  }
  return value;
}

type SourceWhitelistKey = 'groupWhitelist' | 'privateWhitelist';

const SOURCE_WHITELIST_LABELS: Record<SourceWhitelistKey, string> = {
  groupWhitelist: '群号名单',
  privateWhitelist: 'QQ 号名单',
};

/** Reads the conversation source carried by a connected message object. */
function readSourceMessage(input: unknown): {
  conversationKind: 'PRIVATE' | 'GROUP';
  conversationExternalId: string;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('「来源白名单」需要消息对象输入');
  }
  const record = input as Record<string, unknown>;
  const kind = record['conversationKind'];
  if (kind !== 'PRIVATE' && kind !== 'GROUP') {
    throw new Error('「来源白名单」的输入不是消息对象：缺少会话类型');
  }
  const externalId = record['conversationExternalId'];
  return {
    conversationKind: kind,
    conversationExternalId: typeof externalId === 'string' ? externalId.trim() : '',
  };
}

/** One ID per entry; commas, spaces and line breaks all separate entries. */
function readSourceWhitelist(
  config: Record<string, unknown> | undefined,
  key: SourceWhitelistKey,
): string[] {
  const raw = readOptionalString(config, key) ?? '';
  if (raw.length > MAX_WHITELIST_TEXT) {
    throw new Error(`${SOURCE_WHITELIST_LABELS[key]}不能超过 ${MAX_WHITELIST_TEXT} 个字符`);
  }
  return raw
    .split(/[\s,，、;；]+/u)
    .filter((entry) => entry.length > 0);
}

function readImages(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return list.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
  );
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function messageValueOf(message: PipelineMessage): ChatPipelineMessageValue {
  const quote = message.quote;
  return {
    id: message.messageId,
    externalId: message.externalId,
    channelId: message.channelId,
    conversationId: message.conversationId,
    conversationKind: message.conversationKind,
    conversationExternalId: message.conversationExternalId,
    isSelf: message.isSelf,
    sender: { id: message.senderId, name: message.senderName },
    text: message.text,
    kind: message.kind,
    hasQuote: quote !== null,
    quote: quote
      ? {
          messageId: quote.messageId,
          externalId: quote.externalId,
          author: { id: quote.authorId, name: quote.authorName },
          text: quote.text,
          kind: quote.kind,
          sentAt: quote.sentAt,
          images: quote.images,
          imageCount: quote.images.length,
        }
      : null,
    images: message.images,
    imageCount: message.imageCount,
    voices: message.voices,
    voiceCount: message.voiceCount,
    isForward: message.kind === 'FORWARD',
    sentAt: message.sentAt.toISOString(),
  };
}

const messageInput: PipelineNodeDefinition = {
  type: 'message.input',
  version: 2,
  label: '消息输入',
  category: 'system',
  description:
    '每条入站消息的入口：完整消息对象从 message 流出，正文与图片另有快捷端口。',
  system: true,
  defaultConfig: {},
  fields: [],
  inputs: [],
  outputs: [
    {
      key: 'message',
      label: '消息对象',
      kind: 'json',
      description:
        '包含发送者、正文、引用（含引用图片）、图片、语音（含转写）、来源群号/QQ 号等全部字段；配合「消息对象取值」按需读取。',
    },
    { key: 'text', label: '消息正文', kind: 'text', description: '一根线直连消息输出即可复读。' },
    {
      key: 'images',
      label: '消息图片',
      kind: 'image',
      description: '按消息顺序排列的图片引用，可直接接入消息输出卡片。',
    },
  ],
  run: ({ message }) => ({
    outputs: {
      message: messageValueOf(message),
      text: message.text,
      images: message.images,
    },
  }),
};

const MESSAGE_FIELD_OPTIONS = [
  { value: 'sender.name', label: '发送者昵称' },
  { value: 'sender.id', label: '发送者 ID' },
  { value: 'text', label: '消息正文' },
  { value: 'kind', label: '消息类型' },
  { value: 'isForward', label: '是否合并转发' },
  { value: 'hasQuote', label: '是否带引用' },
  { value: 'quote', label: '引用对象' },
  { value: 'quote.author.name', label: '引用作者昵称' },
  { value: 'quote.author.id', label: '引用作者 ID' },
  { value: 'quote.text', label: '引用正文' },
  { value: 'quote.images', label: '引用图片（数组）' },
  { value: 'quote.images.0', label: '引用第一张图片' },
  { value: 'quote.imageCount', label: '引用图片数量' },
  { value: 'images', label: '消息图片（数组）' },
  { value: 'imageCount', label: '消息图片数量' },
  { value: 'voices', label: '语音（数组）' },
  { value: 'voices.0', label: '第一条语音' },
  { value: 'voices.0.transcript', label: '语音转写' },
  { value: 'voices.0.url', label: '语音地址' },
  { value: 'voices.0.duration', label: '语音时长（秒）' },
  { value: 'voiceCount', label: '语音数量' },
  { value: 'sentAt', label: '发送时间' },
  { value: 'id', label: '消息 ID' },
  { value: 'externalId', label: '渠道消息 ID' },
  { value: 'channelId', label: '渠道 ID' },
  { value: 'conversationId', label: '会话 ID' },
  { value: 'conversationKind', label: '会话类型' },
  { value: 'conversationExternalId', label: '来源群号/QQ 号' },
  { value: 'isSelf', label: '是否自己发送' },
  { value: '', label: '整个消息对象' },
];

const getObjectField: PipelineNodeDefinition = {
  type: 'object.get',
  version: 2,
  label: '消息对象取值',
  category: 'data',
  description:
    '从消息对象中选取一个字段，输出 value / text / found；选「整个消息对象」可继续向下游传递。',
  defaultConfig: { path: 'sender.name' },
  fields: [
    {
      key: 'path',
      label: '取值字段',
      kind: 'select',
      options: MESSAGE_FIELD_OPTIONS,
      hint: '下拉选择要取出的字段；卡片上也可直接切换。',
    },
  ],
  inputs: [
    {
      key: 'value',
      label: '消息对象',
      kind: 'json',
      description: '从消息输入的 message 端口或其它 json 输出接入。',
    },
  ],
  outputs: [
    { key: 'value', label: '取值结果', kind: 'any', description: '对象或数组可直接接入 any 端口。' },
    {
      key: 'text',
      label: '文本形式',
      kind: 'text',
      description: '字符串原样输出，其它值转成 JSON 文本。',
    },
    {
      key: 'found',
      label: '是否存在',
      kind: 'boolean',
      description: '值为 null / undefined 时为 false，可直接用于分支条件。',
    },
  ],
  run: (context) => {
    const path = (readOptionalString(context.node.config, 'path') ?? '').trim();
    const value = readPath(context.inputs['value'], path);
    return {
      outputs: {
        value: value === undefined ? null : value,
        text: stringify(value),
        found: value !== undefined && value !== null,
      },
    };
  },
};

/**
 * Keys mirror the values produced by `buildChannelPersonaSnapshot`, so
 * template placeholders and the runtime read the same normalized persona shape.
 */
const PERSONA_PARAMETER_GROUPS: { title: string; keys: string[] }[] = [
  {
    title: '基础',
    keys: [
      'name', 'aliases', 'keywords', 'age', 'gender', 'identity', 'occupation', 'race',
      'height_cm', 'weight_kg', 'location', 'time_zone', 'time_awareness',
    ],
  },
  {
    title: '外形',
    keys: ['body_type', 'appearance', 'hair', 'outfit', 'voice'],
  },
  {
    title: '设定',
    keys: ['world_setting', 'backstory', 'knowledge_boundary'],
  },
  {
    title: '内在',
    keys: [
      'core_values', 'taboos', 'fears', 'soft_spots', 'non_negotiable',
      'long_term_motivation', 'current_goal', 'doing_now', 'obstacle',
    ],
  },
  {
    title: '表达',
    keys: [
      'language_style', 'conflict_style', 'humor_style', 'memory_bias', 'sentence_length',
      'punctuation', 'typo_level', 'split_level', 'particles', 'openers', 'banned_words',
      'emoji_level', 'typing_level', 'online_policy', 'sleep_depth', 'anchor_few_shot',
    ],
  },
  {
    title: '称呼',
    keys: [
      'address_for_stranger', 'address_for_close', 'forbidden_addresses',
      'allowed_addresses', 'anchor_quote',
    ],
  },
  {
    title: '破面',
    keys: [
      'in_character_principle', 'in_character_triggers', 'in_character_never',
      'in_character_recovery', 'in_character_allowed_meta',
    ],
  },
  {
    title: '亲密',
    keys: [
      'sensitivity_map', 'touch_preference', 'explicit_level_char', 'aftercare_need_base',
      'decline_response_style',
    ],
  },
  {
    title: '数值',
    keys: [
      'confidence', 'self_control', 'shame', 'trust_bias', 'attachment_style',
      'possessiveness_base', 'agreeableness', 'proactivity', 'curiosity', 'stamina_max',
      'strength', 'agility', 'pain_tolerance', 'recovery_rate', 'sensitivity',
    ],
  },
  {
    title: '卡片',
    keys: [
      'experience_level', 'card_serial', 'card_experience', 'card_traits',
      'card_physical', 'created_at', 'updated_at',
    ],
  },
];

const PERSONA_PARAMETER_KEYS = new Set(PERSONA_PARAMETER_GROUPS.flatMap((group) => group.keys));

/** `{name}` / `{ age }` placeholders; braces around unknown names stay literal. */
const PERSONA_PLACEHOLDER = /\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}/g;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const CHINESE_ZONE_HOURS: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
};

/** Minutes east of UTC from the card's free-text time zone; null when unrecognized. */
function parseTimeZoneOffset(zone: string): number | null {
  const utc = /^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(zone);
  if (utc) {
    const [, sign = '+', hours = '0', minutes = '0'] = utc;
    const total = Number(hours) * 60 + Number(minutes);
    return sign === '-' ? -total : total;
  }

  const chinese = /^(东|西)\s*([一二三四五六七八九十]+|\d{1,2})\s*区$/.exec(zone);
  if (chinese) {
    const [, side = '东', amount = ''] = chinese;
    const hours = /^\d+$/.test(amount) ? Number(amount) : (CHINESE_ZONE_HOURS[amount] ?? NaN);
    if (!Number.isFinite(hours)) {
      return null;
    }
    return (side === '西' ? -hours : hours) * 60;
  }

  return null;
}

function padTime(value: number): string {
  return String(value).padStart(2, '0');
}

/** Wall-clock time in the persona's time zone, e.g. 2026-11-04 14:36（周三）. */
function personaCurrentTime(values: Readonly<Record<string, unknown>>): string {
  const zone = typeof values['time_zone'] === 'string' ? values['time_zone'].trim() : '';
  const offset = zone ? parseTimeZoneOffset(zone) : null;
  if (offset !== null) {
    const shifted = new Date(Date.now() + offset * 60_000);
    return `${shifted.getUTCFullYear()}-${padTime(shifted.getUTCMonth() + 1)}-${padTime(shifted.getUTCDate())} ${padTime(shifted.getUTCHours())}:${padTime(shifted.getUTCMinutes())}（${WEEKDAYS[shifted.getUTCDay()]}）`;
  }

  if (zone) {
    try {
      const parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        weekday: 'short',
      }).formatToParts(new Date());
      const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
      return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}（${part('weekday')}）`;
    } catch {
      // Unrecognized zone name: fall back to the server's local time.
    }
  }

  const now = new Date();
  return `${now.getFullYear()}-${padTime(now.getMonth() + 1)}-${padTime(now.getDate())} ${padTime(now.getHours())}:${padTime(now.getMinutes())}（${WEEKDAYS[now.getDay()]}）`;
}

function renderPersonaTemplate(
  template: string,
  values: Readonly<Record<string, unknown>> | null | undefined,
): string {
  return template.replace(PERSONA_PLACEHOLDER, (match, key: string) => {
    if (!PERSONA_PARAMETER_KEYS.has(key)) {
      return match;
    }
    if (key === 'time_awareness') {
      if (!values) {
        return '';
      }
      return values['time_awareness'] === false ? '你无法感知时间' : personaCurrentTime(values);
    }
    return stringify(values?.[key]);
  });
}

const callPersona: PipelineNodeDefinition = {
  type: 'persona.call',
  version: 1,
  label: '人格调用',
  category: 'data',
  description:
    '把文本里的 {name}、{age} 等占位符自动替换成本次运行绑定的人格卡参数，直接输出填充后的文本；没有左侧输入，未绑定人格时占位符为空。',
  resizable: true,
  help: {
    notes: [
      '占位符写作 {name} 或 { age }；参数名区分大小写，未列出的名称会保持原样。',
      '读取本次运行绑定的人格卡：渠道运行与渠道作用域调试取渠道当前绑定的人格卡，人格作用域调试取该人格卡，全局作用域调试没有绑定人格。',
      '人格卡里为空的项不会出现在快照中，写进模板后会被替换为空字符串；未绑定人格时所有已知参数同样为空。',
      '{time_awareness} 不输出 true 或 false：人格卡开启「时间感知」时替换成当前日期时间（按卡里的时区换算，识别不了时区名就用服务器本地时间，格式如 2026-11-04 14:36（周三））；关闭时替换成「你无法感知时间」。',
    ],
    keyGroups: PERSONA_PARAMETER_GROUPS,
  },
  defaultConfig: { template: '' },
  fields: [
    {
      key: 'template',
      label: '人格文本',
      kind: 'text',
      placeholder: '你将扮演{name}，年龄{age}，外貌{appearance}。',
      hint: '用 {参数名} 占位符填入人格参数，例如 {name}、{age}、{appearance}；参数名与人格卡快照一致。',
    },
  ],
  inputs: [],
  outputs: [
    {
      key: 'text',
      label: '填充后的文本',
      kind: 'text',
      description: '模板里的 {参数名} 已替换为人格卡的值；未绑定人格或参数为空时替换为空字符串。',
    },
  ],
  validateConfig: (config) => {
    const template = config?.['template'];
    if (template !== undefined && typeof template !== 'string') {
      throw new Error('人格文本必须是字符串');
    }
    if (typeof template === 'string' && template.length > MAX_CARD_TEXT) {
      throw new Error(`人格文本不能超过 ${MAX_CARD_TEXT} 个字符`);
    }
  },
  run: (context) => ({
    outputs: {
      text: renderPersonaTemplate(
        readOptionalString(context.node.config, 'template') ?? '',
        context.personaValues,
      ),
    },
  }),
};

type ConversationPersonaFieldGroup = {
  title: string;
  fields: readonly { key: string; label: string }[];
};

/** Mirrors the group-persona panel fields and their Chinese labels. */
const GROUP_PERSONA_FIELD_GROUPS: readonly ConversationPersonaFieldGroup[] = [
  {
    title: '对群态度',
    fields: [
      { key: 'scene_type', label: '场合类型' },
      { key: 'narrative', label: '一句总纲' },
      { key: 'group_persona', label: '我在群里的角色' },
      { key: 'comfort', label: '自在度' },
      { key: 'boundary_here', label: '本群额外边界' },
    ],
  },
  {
    title: '实时状态',
    fields: [
      { key: 'topic', label: '当前话题' },
      { key: 'focus', label: '是否指向我' },
      { key: 'phase', label: '场景阶段' },
      { key: 'explicit_cap', label: '群聊尺度硬上限' },
    ],
  },
  {
    title: '群规则',
    fields: [
      { key: 'formality', label: '严肃程度' },
      { key: 'scene_rules', label: '群规' },
      { key: 'mention_only', label: '仅被@才回' },
      { key: 'speak_rate_target', label: '主动程度' },
    ],
  },
];

/** Mirrors the private-persona panel fields and their Chinese labels. */
const PRIVATE_PERSONA_FIELD_GROUPS: readonly ConversationPersonaFieldGroup[] = [
  {
    title: '关系数值',
    fields: [
      { key: 'affinity', label: '好感' },
      { key: 'trust', label: '信任度' },
      { key: 'intimacy', label: '亲密程度' },
      { key: 'dependency', label: '依赖' },
      { key: 'hostility', label: '仇恨值' },
      { key: 'possessiveness_obj', label: '占有欲' },
      { key: 'respect', label: '尊重度' },
      { key: 'fear', label: '畏惧顾虑' },
      { key: 'friction', label: '沟通成本' },
      { key: 'unresolved_conflict', label: '未解决冲突' },
    ],
  },
  {
    title: '关系描述',
    fields: [
      { key: 'relation_tags', label: '关系描述' },
      { key: 'per_obj_shame', label: '对该对象的羞耻度' },
      { key: 'nickname_for_obj', label: '私下称呼' },
      { key: 'how_i_address_here', label: '各场合称呼' },
      { key: 'reply_priority', label: '回复优先级' },
      { key: 'open_promises', label: '承诺清单' },
      { key: 'declined_actions_log', label: '已拒行为记录' },
      { key: 'shared_events', label: '共同经历索引' },
      { key: 'disclosure_scope', label: '可公开范围' },
      { key: 'access.blocked', label: '是否拉黑' },
      { key: 'access.muted_until', label: '静默截止' },
    ],
  },
  {
    title: '边界与同意',
    fields: [
      { key: 'safeword', label: '安全词' },
      { key: 'soft_limits', label: '软限制' },
      { key: 'preferences', label: '偏好' },
      { key: 'hard_limits_obj', label: '对象侧硬限制' },
      { key: 'explicit_level_obj', label: '对象侧尺度上限' },
      { key: 'boundary_notes', label: '边界备注' },
      { key: 'adult_confirmed_obj', label: '对象成年确认' },
    ],
  },
  {
    title: '对象档案',
    fields: [
      { key: 'obj_profile.display_name', label: '对方昵称' },
      { key: 'obj_profile.self_intro', label: '自称与关系说明' },
      { key: 'obj_profile.user_age_status', label: '年龄状态' },
      { key: 'obj_profile.user_profile', label: '已知事实' },
      { key: 'obj_profile.user_style', label: '表达风格' },
      { key: 'obj_profile.user_topics', label: '话题偏好' },
      { key: 'obj_profile.user_dislikes', label: '回避话题' },
      { key: 'obj_profile.privacy_flags', label: '隐私开关' },
      { key: 'obj_profile.active_hours', label: '活跃时段' },
    ],
  },
];

function conversationPersonaText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim().length > 0 ? value : '';
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => stringify(entry).trim())
      .filter((entry) => entry.length > 0)
      .join('、');
  }
  return stringify(value);
}

function conversationPersonaSheet(
  values: Readonly<Record<string, unknown>>,
  groups: readonly ConversationPersonaFieldGroup[],
): string {
  return groups
    .flatMap((group) =>
      group.fields.flatMap((field) => {
        const text = conversationPersonaText(values[field.key]);
        return text.length > 0 ? [`${field.label}：${text}`] : [];
      }),
    )
    .join('\n');
}

function conversationPersonaNode(options: {
  type: string;
  label: string;
  description: string;
  notes: string[];
  kind: 'group' | 'private';
  groups: readonly ConversationPersonaFieldGroup[];
}): PipelineNodeDefinition {
  const fieldOptions = [
    { value: '', label: '整个快照' },
    ...options.groups.flatMap((group) =>
      group.fields.map((field) => ({ value: field.key, label: field.label })),
    ),
  ];
  const fieldKeys = new Set(fieldOptions.map((option) => option.value));

  return {
    type: options.type,
    version: 1,
    label: options.label,
    category: 'data',
    description: options.description,
    help: {
      notes: options.notes,
      keyGroups: options.groups.map((group) => ({
        title: group.title,
        keys: group.fields.map((field) => field.key),
      })),
    },
    defaultConfig: { variable: '', field: '' },
    fields: [
      {
        key: 'variable',
        label: '会话变量',
        kind: 'select',
        optionsSource: 'pipeline-variables',
        hint: '选择保存「来源群号 / QQ 号」的管线变量；变量为空或未选择时输出空文本。',
      },
      {
        key: 'field',
        label: '读取属性',
        kind: 'select',
        options: fieldOptions,
        hint: '选「整个快照」输出按中文名逐行的全部已填属性；也可只取单项。',
      },
    ],
    inputs: [],
    outputs: [
      {
        key: 'value',
        label: '属性值',
        kind: 'any',
        description: '选中属性的原始值；整个快照时是对象。变量为空或没有记录时为 null。',
      },
      {
        key: 'text',
        label: '文本形式',
        kind: 'text',
        description: '选中属性的文本；整个快照按中文名逐行输出。为空时输出空字符串。',
      },
      {
        key: 'found',
        label: '是否存在',
        kind: 'boolean',
        description: '有值时为 true；变量为空、没有记录或属性为空时为 false。',
      },
    ],
    validateConfig: (config, graph) => {
      readVariableKey(config, graph);
      const field = readOptionalString(config, 'field')?.trim() ?? '';
      if (!fieldKeys.has(field)) {
        throw new Error(`「${options.label}」的读取属性不在可选范围内：${field}`);
      }
    },
    run: async (context) => {
      const variable = readVariableKey(context.node.config, context.graph);
      const externalId = variable
        ? stringify(context.getVariable(variable)).trim()
        : '';
      const field = readOptionalString(context.node.config, 'field')?.trim() ?? '';
      const empty = { outputs: { value: null, text: '', found: false } };

      if (!externalId) {
        return empty;
      }

      const values = await context.readConversationPersona(options.kind, externalId);
      if (!values) {
        return empty;
      }

      if (!field) {
        const text = conversationPersonaSheet(values, options.groups);
        return { outputs: { value: values, text, found: text.length > 0 } };
      }

      const value = values[field];
      const text = conversationPersonaText(value);
      return { outputs: { value: value ?? null, text, found: text.length > 0 } };
    },
  };
}

const groupPersona: PipelineNodeDefinition = conversationPersonaNode({
  type: 'persona.group',
  label: '群聊人格',
  description:
    '按管线变量里的群号读取该群的人格快照；变量为空或没有记录时输出空文本，不会根据消息类型自动切换。',
  notes: [
    '会话标识必须来自管线变量：用「写入变量」把消息对象的「来源群号/QQ 号」（conversationExternalId）写进去，再在这里选择该变量；没有选择变量或值为空时输出空文本。',
    '只读本渠道内的群会话，不会隐式读取当前消息的 conversationKind，也不会在找不到时回退到私聊人格。',
    '读取的是群聊人格面板已保存的属性；该群从未保存过人格记录时同样输出空文本。',
    '选「整个快照」时 text 按中文名逐行输出全部已填属性；也可选单项属性直接输出。',
  ],
  kind: 'group',
  groups: GROUP_PERSONA_FIELD_GROUPS,
});

const privatePersona: PipelineNodeDefinition = conversationPersonaNode({
  type: 'persona.private',
  label: '私聊人格',
  description:
    '按管线变量里的 QQ 号读取该联系人的私聊人格快照；变量为空或没有记录时输出空文本，不会根据消息类型自动切换。',
  notes: [
    '会话标识必须来自管线变量：用「写入变量」把消息对象的「来源群号/QQ 号」（conversationExternalId）写进去，再在这里选择该变量；没有选择变量或值为空时输出空文本。',
    '只读本渠道内的私聊联系人，不会隐式读取当前消息的 conversationKind，也不会在找不到时回退到群聊人格。',
    '读取的是私聊人格面板已保存的属性；该联系人从未保存过人格记录时同样输出空文本。',
    '选「整个快照」时 text 按中文名逐行输出全部已填属性；也可选单项属性直接输出。',
  ],
  kind: 'private',
  groups: PRIVATE_PERSONA_FIELD_GROUPS,
});

const chatCompletion: PipelineNodeDefinition = {
  type: 'ai.chat',
  version: 1,
  label: 'AI 对话',
  category: 'ai',
  resizable: true,
  description:
    '把提示词发给设置里的模型并取回文本；「JSON 指令」模式会让模型输出 action / args / reply，供下游分支决定执行哪张能力卡。',
  help: {
    notes: [
      '提示词和系统提示词都由输入端口提供：把上游文本接到「提示词」端口，系统提示词可选接到「系统提示词」端口；配置里不再保存这两段文本，想组合内容请先用「拼接文本」等卡片生成再接入。',
      '「提示词」端口必须接线，否则这张卡会被跳过；「系统提示词」端口可留空。',
      '「JSON 指令」会在系统提示里追加固定格式要求：模型输出 {"action":"...","args":{...},"reply":"..."}；解析失败时 reply 自动回退为模型原文，parsed 为 false。',
      '分发指令用「包含判断」或「值比较」比对 action，再把每条分支接到对应的能力卡；能力卡的结果可以继续接给下一张 AI 对话生成最终回复。',
      '模型来自设置中的提供商；留空使用第一个可用提供商。调试运行同样会真实调用模型，但不会发送消息。',
    ],
  },
  defaultConfig: {
    format: 'text',
    temperature: 0.7,
    maxTokens: 1024,
    providerId: '',
    model: '',
  },
  fields: [
    {
      key: 'format',
      label: '输出格式',
      kind: 'select',
      options: [
        { value: 'text', label: '文本' },
        { value: 'json', label: 'JSON 指令' },
      ],
      hint: '「JSON 指令」自动追加格式要求，输出 action / args / reply；解析失败时 reply 回退为原文。',
    },
    {
      key: 'temperature',
      label: '温度',
      kind: 'number',
      placeholder: '0.7',
      width: 'half',
      hint: `0–${MAX_CHAT_TEMPERATURE}，越高越发散；做指令判断建议 0–0.3。`,
    },
    {
      key: 'maxTokens',
      label: '最大 tokens',
      kind: 'number',
      placeholder: '1024',
      width: 'half',
      hint: `1–${MAX_CHAT_TOKENS}，太小会截断 JSON。`,
    },
    {
      key: 'providerId',
      label: '提供商',
      kind: 'select',
      optionsSource: 'model-providers',
      hint: '留空使用设置中的首个可用提供商。',
    },
    {
      key: 'model',
      label: '模型',
      kind: 'select',
      optionsSource: 'provider-models',
      dependsOn: 'providerId',
      hint: '留空使用该提供商的第一个模型。',
    },
  ],
  inputs: [
    {
      key: 'text',
      label: '提示词',
      kind: 'text',
      description: '接入的文本原样作为提示词发送给模型，没有其他配置可覆盖。',
    },
    {
      key: 'system',
      label: '系统提示词',
      kind: 'text',
      optional: true,
      description: '接入的文本作为 system 角色内容；不接线时只发送提示词。',
    },
  ],
  outputs: [
    {
      key: 'reply',
      label: '回复文本',
      kind: 'text',
      description:
        'JSON 模式下取 reply 字段；解析失败时回退为模型原文。可直接接入消息输出。',
    },
    {
      key: 'text',
      label: '模型原文',
      kind: 'text',
      description: '模型返回的原始文本，已去除首尾空白。',
    },
    {
      key: 'action',
      label: '指令动作',
      kind: 'text',
      description: 'JSON 模式下解析出的 action；文本模式为空字符串。',
    },
    {
      key: 'args',
      label: '指令参数',
      kind: 'json',
      description: 'JSON 模式下解析出的 args 对象；缺少或不是对象时为 null。',
    },
    {
      key: 'json',
      label: '完整 JSON',
      kind: 'json',
      description: '成功解析为对象时的完整信封，否则为 null。',
    },
    {
      key: 'parsed',
      label: '解析成功',
      kind: 'boolean',
      description: 'JSON 模式且成功解析为对象时为 true。',
    },
    {
      key: 'model',
      label: '实际模型',
      kind: 'text',
      description: '本次调用实际使用的模型名称。',
    },
    {
      key: 'latencyMs',
      label: '耗时',
      kind: 'number',
      description: '模型调用耗时，毫秒。',
    },
  ],
  validateConfig: (config) => {
    readChatFormat(config);
    readChatTemperature(config);
    readChatMaxTokens(config);
  },
  run: async (context) => {
    const config = context.node.config;
    const prompt = readChatInput(context.inputs, 'text');
    if (prompt.length === 0) {
      throw new Error('AI 提示词为空：请把上游文本接到「提示词」输入');
    }

    const format = readChatFormat(config);
    const system = [readChatInput(context.inputs, 'system'), format === 'json' ? JSON_ENVELOPE_HINT : '']
      .filter((part) => part.length > 0)
      .join('\n\n');

    let completion;
    try {
      completion = await context.chat({
        prompt,
        system: system.length > 0 ? system : null,
        providerId: readOptionalString(config, 'providerId'),
        model: readOptionalString(config, 'model'),
        temperature: readChatTemperature(config),
        maxTokens: readChatMaxTokens(config),
      });
    } catch (error) {
      throw new Error(chatErrorMessage(error), { cause: error });
    }

    const text = completion.text.trim();
    if (text.length === 0) {
      throw new Error('模型没有返回内容');
    }

    const common = {
      text,
      model: completion.model,
      latencyMs: completion.latencyMs,
    };

    if (format === 'text') {
      return {
        outputs: {
          ...common,
          reply: text,
          action: '',
          args: null,
          json: null,
          parsed: false,
        },
      };
    }

    const envelope = parseChatEnvelope(text);
    const action =
      envelope && typeof envelope.action === 'string' ? envelope.action.trim() : '';
    const args =
      envelope && envelope.args !== null && typeof envelope.args === 'object' && !Array.isArray(envelope.args)
        ? envelope.args
        : null;
    const reply =
      envelope && typeof envelope.reply === 'string' ? envelope.reply.trim() : '';

    return {
      outputs: {
        ...common,
        // A parse failure still owes the user a readable reply.
        reply: envelope ? reply : text,
        action,
        args,
        json: envelope,
        parsed: envelope !== null,
      },
    };
  },
};

const promptCompression: PipelineNodeDefinition = {
  type: 'ai.compress',
  version: 1,
  label: '提示词压缩',
  category: 'ai',
  resizable: true,
  description:
    '把一段冗长的详细提示词交给模型压缩成更紧凑的版本；结果缓存在 Redis，TTL 内或输入未变化时直接复用，不再调用模型。',
  help: {
    notes: [
      '「详细提示词」端口必须接线：接进来的整段文本（例如人格提示词、规则集合）会作为压缩对象；没接线或为空时这张卡会被记为失败。',
      '压缩由固定指令驱动：保留全部事实、约束、字段名、输出格式、语气与安全要求，只删除重复、客套和冗余表述，不新增原文没有的内容。',
      '缓存 key 由「详细提示词 + 提供商 + 模型 + 压缩指令版本」计算 SHA-256 得到，写入设置里配置的 Redis，键名前缀为 inkseek:pipeline:prompt-compress:v1:。命中时 cached 为 true，且不会调用模型。',
      'TTL 到期、缓存键不存在或 Redis 不可用时都会重新调用模型生成；修改提示词或切换模型会落到新 key，不会读到旧结果。Redis 未配置或连接失败时自动跳过缓存，管线继续运行。',
      'TTL 单位为秒，默认 86400（24 小时），范围 60–2592000（30 天）。',
    ],
  },
  defaultConfig: {
    providerId: '',
    model: '',
    ttlSeconds: PROMPT_COMPRESSION_DEFAULT_TTL_SECONDS,
  },
  fields: [
    {
      key: 'providerId',
      label: '提供商',
      kind: 'select',
      optionsSource: 'model-providers',
      hint: '留空使用设置中的首个可用提供商。',
    },
    {
      key: 'model',
      label: '模型',
      kind: 'select',
      optionsSource: 'provider-models',
      dependsOn: 'providerId',
      hint: '留空使用该提供商的第一个模型。',
    },
    {
      key: 'ttlSeconds',
      label: '缓存 TTL（秒）',
      kind: 'number',
      placeholder: String(PROMPT_COMPRESSION_DEFAULT_TTL_SECONDS),
      hint: `缓存保留时长，默认 86400（24 小时），范围 ${PROMPT_COMPRESSION_MIN_TTL_SECONDS}–${PROMPT_COMPRESSION_MAX_TTL_SECONDS} 秒。`,
    },
  ],
  inputs: [
    {
      key: 'text',
      label: '详细提示词',
      kind: 'text',
      description: '接入需要压缩的完整提示词；内容与提供商、模型共同决定缓存 key。',
    },
  ],
  outputs: [
    {
      key: 'text',
      label: '压缩提示词',
      kind: 'text',
      description: '压缩后的提示词正文；可直接接入 AI 对话或消息输出。',
    },
    {
      key: 'cached',
      label: '命中缓存',
      kind: 'boolean',
      description: '本次结果来自 Redis 缓存时为 true，重新调用模型时为 false。',
    },
    {
      key: 'model',
      label: '实际模型',
      kind: 'text',
      description: '生成该压缩结果所用模型；来自旧缓存时可能为空字符串。',
    },
  ],
  validateConfig: (config) => {
    readCompressionTtl(config);
  },
  run: async (context) => {
    const prompt = readChatInput(context.inputs, 'text');
    if (prompt.length === 0) {
      throw new Error('详细提示词为空：请把上游文本接到「详细提示词」输入');
    }

    let result;
    try {
      result = await context.compressPrompt({
        prompt,
        providerId: readOptionalString(context.node.config, 'providerId'),
        model: readOptionalString(context.node.config, 'model'),
        ttlSeconds: readCompressionTtl(context.node.config),
      });
    } catch (error) {
      throw new Error(chatErrorMessage(error), { cause: error });
    }

    return {
      outputs: {
        text: result.text,
        cached: result.cached,
        model: result.model ?? '',
      },
    };
  },
};

const constantValue: PipelineNodeDefinition = {
  type: 'value.constant',
  version: 1,
  label: '固定内容',
  category: 'data',
  description:
    '无需上级激活，直接输出一段固定的文本、数字或布尔值，用来做阈值、固定回复或与上游取值比较。',
  defaultConfig: { kind: 'text', value: '' },
  fields: [
    {
      key: 'kind',
      label: '内容类型',
      kind: 'select',
      options: [
        { value: 'text', label: '文本' },
        { value: 'number', label: '数字' },
        { value: 'boolean', label: '布尔' },
      ],
    },
    {
      key: 'value',
      label: '内容',
      kind: 'string',
      placeholder: '固定内容',
      hint: '数字直接填如 42；布尔填 true 或 false。',
    },
  ],
  inputs: [],
  outputs: [
    { key: 'value', label: '固定值', kind: 'any', description: '保持所选类型：文本、数字或布尔。' },
    { key: 'text', label: '文本形式', kind: 'text', description: '固定内容的字符串形式。' },
  ],
  run: (context) => {
    const value = readConstantValue(context.node.config);
    return { outputs: { value, text: stringify(value) } };
  },
};

const getVariable: PipelineNodeDefinition = {
  type: 'vars.get',
  version: 2,
  label: '读取变量',
  category: 'variable',
  description:
    '读取管线变量的当前值；默认直接执行，把「写入变量」的 value 接到顺序端口即可保证先写后读。',
  alwaysRun: true,
  defaultConfig: { variable: '' },
  fields: [
    {
      key: 'variable',
      label: '管线变量',
      kind: 'select',
      optionsSource: 'pipeline-variables',
      hint: '先在画布「管线变量」里声明；这里选中的变量会在每次运行开始时重置。',
    },
  ],
  inputs: [
    {
      key: 'after',
      label: '顺序（可选）',
      kind: 'any',
      optional: true,
      description:
        '只用于约束执行顺序：把「写入变量」的 value 接进来，读取就会发生在写入之后。',
    },
  ],
  outputs: [
    { key: 'value', label: '变量值', kind: 'any' },
    { key: 'text', label: '文本形式', kind: 'text' },
    { key: 'exists', label: '是否存在', kind: 'boolean', description: '未选择或未声明时为 false。' },
  ],
  validateConfig: (config, graph) => {
    readVariableKey(config, graph);
  },
  run: (context) => {
    const key = readVariableKey(context.node.config, context.graph);
    const value = key === null ? undefined : context.getVariable(key);
    return {
      outputs: {
        value: value === undefined ? null : value,
        text: stringify(value),
        exists: value !== undefined,
      },
    };
  },
};

const setVariable: PipelineNodeDefinition = {
  type: 'vars.set',
  version: 1,
  label: '写入变量',
  category: 'variable',
  description:
    '把接入的值写入管线变量并原样传给下游；把 value 接到「读取变量」的顺序端口，就能保证读取在写入之后。',
  defaultConfig: { variable: '' },
  fields: [
    {
      key: 'variable',
      label: '管线变量',
      kind: 'select',
      optionsSource: 'pipeline-variables',
      hint: '只能写入已声明的变量；写入只影响本次运行，不会改动声明值。',
    },
  ],
  inputs: [
    {
      key: 'value',
      label: '要写入的值',
      kind: 'any',
      description: '任意类型的值，写入变量后原样从 value 端口流出。',
    },
  ],
  outputs: [
    { key: 'value', label: '写入的值', kind: 'any' },
    { key: 'text', label: '文本形式', kind: 'text' },
    { key: 'variable', label: '变量名', kind: 'text' },
  ],
  validateConfig: (config, graph) => {
    readVariableKey(config, graph);
  },
  run: (context) => {
    const key = readVariableKey(context.node.config, context.graph);
    if (key === null) {
      throw new Error('请选择要写入的管线变量');
    }
    const value = context.inputs['value'] ?? null;
    context.setVariable(key, value);
    return { outputs: { value, text: stringify(value), variable: key } };
  },
};

const messageOutput: PipelineNodeDefinition = {
  type: 'message.output',
  version: 1,
  label: '消息输出',
  category: 'system',
  description:
    '把汇总后的文本与图片作为回复发回当前会话；关闭「启用发送」时只演练不发送。',
  system: true,
  defaultConfig: { enabled: false },
  fields: [
    {
      key: 'enabled',
      label: '启用发送',
      kind: 'boolean',
      hint: '关闭时管线只计算回复内容并记录在运行轨迹里，不会调用 NapCat。',
    },
  ],
  inputs: [
    {
      key: 'text',
      label: '回复正文',
      kind: 'text',
      optional: true,
      description: '最终汇总后的回复文本；一条输入连线即可实现直接复读。',
    },
    {
      key: 'images',
      label: '回复图片',
      kind: 'image',
      optional: true,
      description: `图片引用或 data URL，最多 ${MAX_REPLY_IMAGES} 张；与文本至少有一项非空。`,
    },
  ],
  outputs: [
    { key: 'sent', label: '是否已发送', kind: 'boolean' },
    { key: 'length', label: '回复长度', kind: 'number' },
    { key: 'imageCount', label: '图片数量', kind: 'number' },
  ],
  run: (context) => {
    const text = asText(context.inputs['text']).trim();
    const images = readImages(context.inputs['images']);
    const length = Array.from(text).length;

    if (text.length === 0 && images.length === 0) {
      return { outputs: { sent: false, length: 0, imageCount: 0 } };
    }

    if (images.length > MAX_REPLY_IMAGES) {
      throw new Error(`一条回复最多 ${MAX_REPLY_IMAGES} 张图片`);
    }

    if (!readBoolean(context.node.config, 'enabled', false)) {
      return { outputs: { sent: false, length, imageCount: images.length } };
    }

    if (length > MAX_REPLY_LENGTH) {
      throw new Error(`回复内容超过 ${MAX_REPLY_LENGTH} 个字符`);
    }

    return {
      outputs: { sent: true, length, imageCount: images.length },
      effects: [{ type: 'reply', text, images }],
    };
  },
};

const constantText: PipelineNodeDefinition = {
  type: 'text.constant',
  version: 1,
  label: '固定文本',
  category: 'text',
  description:
    '无需上游激活，直接输出一段固定文本；可以用 {{vars.名称}}、{{message.text}} 等模板引用，再接进任意文本输入。',
  defaultConfig: { text: '' },
  fields: [
    {
      key: 'text',
      label: '固定文本',
      kind: 'text',
      placeholder: '例如：抱歉，我现在不在，稍后回复你。',
      hint: '没有输入端口，每次运行都会执行；模板里可以引用变量或当前消息。',
    },
  ],
  inputs: [],
  outputs: [
    { key: 'text', label: '文本', kind: 'text', description: '按模板渲染后的固定文本。' },
  ],
  validateConfig: (config) => {
    const text = config?.['text'];
    if (text !== undefined && typeof text !== 'string') {
      throw new Error('固定文本必须是字符串');
    }
    if (typeof text === 'string' && text.length > MAX_CARD_TEXT) {
      throw new Error(`固定文本不能超过 ${MAX_CARD_TEXT} 个字符`);
    }
  },
  run: (context) => ({
    outputs: { text: context.template(readOptionalString(context.node.config, 'text') ?? '') },
  }),
};

const templateText: PipelineNodeDefinition = {
  type: 'text.template',
  version: 1,
  label: '模板文本',
  category: 'text',
  description:
    '用 {{input.text}}、{{input.object.sender.name}} 或 {{节点.字段}} 模板把上游内容拼成一段新文本。',
  defaultConfig: { template: '收到：{{input.text}}' },
  fields: [
    {
      key: 'template',
      label: '模板',
      kind: 'text',
      placeholder: '收到：{{input.text}}',
      hint: '{{input.text}} 读接入的文本；{{input.object.sender.name}} 读对象字段；{{节点.字段}} 读任意上游输出。',
    },
  ],
  inputs: [
    {
      key: 'text',
      label: '输入文本',
      kind: 'text',
      optional: true,
      description: '模板中的 {{input.text}} 指向这条连线带来的文本。',
    },
    {
      key: 'object',
      label: '对象',
      kind: 'json',
      optional: true,
      description: '接入消息对象后，模板里可用 {{input.object.sender.name}} 等路径取值。',
    },
  ],
  outputs: [{ key: 'text', label: '拼出的文本', kind: 'text' }],
  run: (context) => ({
    outputs: { text: context.template(readString(context.node.config, 'template')) },
  }),
};

const transformText: PipelineNodeDefinition = {
  type: 'text.transform',
  version: 1,
  label: '文本整形',
  category: 'text',
  description: '对文本做去空白、折叠空格、大小写或前后缀处理。',
  defaultConfig: { mode: 'trim', argument: '' },
  fields: [
    {
      key: 'mode',
      label: '处理方式',
      kind: 'select',
      options: [
        { value: 'trim', label: '去除首尾空白' },
        { value: 'collapse', label: '折叠连续空白' },
        { value: 'upper', label: '转大写' },
        { value: 'lower', label: '转小写' },
        { value: 'prefix', label: '添加前缀' },
        { value: 'suffix', label: '添加后缀' },
      ],
    },
    {
      key: 'argument',
      label: '前缀 / 后缀',
      kind: 'string',
      placeholder: '复读：',
      hint: '仅「添加前缀」「添加后缀」使用。',
    },
  ],
  inputs: [{ key: 'text', label: '输入文本', kind: 'text' }],
  outputs: [{ key: 'text', label: '处理后的文本', kind: 'text' }],
  run: (context) => {
    const mode = readString(context.node.config, 'mode');
    const argument = readOptionalString(context.node.config, 'argument') ?? '';
    const source = asText(context.inputs['text']);

    switch (mode) {
      case 'trim':
        return { outputs: { text: source.trim() } };
      case 'collapse':
        return { outputs: { text: source.replace(/\s+/g, ' ').trim() } };
      case 'upper':
        return { outputs: { text: source.toUpperCase() } };
      case 'lower':
        return { outputs: { text: source.toLowerCase() } };
      case 'prefix':
        return { outputs: { text: `${argument}${source}` } };
      case 'suffix':
        return { outputs: { text: `${source}${argument}` } };
      default:
        throw new Error(`不支持的文本处理方式：${mode}`);
    }
  },
};

const regexText: PipelineNodeDefinition = {
  type: 'text.regex',
  version: 1,
  label: '正则提取',
  category: 'text',
  description: '用正则匹配输入文本，并输出首个匹配与捕获组。',
  defaultConfig: { pattern: '', flags: '' },
  fields: [
    { key: 'pattern', label: '表达式', kind: 'string', placeholder: '^\\d+$' },
    { key: 'flags', label: '标志', kind: 'string', placeholder: 'imsu' },
  ],
  inputs: [
    {
      key: 'text',
      label: '输入文本',
      kind: 'text',
      description: '被匹配的文本；命中结果同时带出原文本便于继续连线。',
    },
  ],
  outputs: [
    { key: 'matched', label: '是否命中', kind: 'boolean' },
    { key: 'match', label: '首个匹配', kind: 'text' },
    { key: 'groups', label: '捕获组', kind: 'json' },
    { key: 'text', label: '原文本', kind: 'text' },
  ],
  run: (context) => {
    const pattern = readString(context.node.config, 'pattern');
    const flags = readOptionalString(context.node.config, 'flags') ?? '';
    if (!/^[imsu]*$/.test(flags)) {
      throw new Error(`不支持的表达式标志：${flags}`);
    }

    const source = asText(context.inputs['text']);
    const match = new RegExp(pattern, flags).exec(source);

    return {
      outputs: {
        matched: match !== null,
        match: match?.[0] ?? '',
        groups: match ? match.slice(1) : [],
        text: source,
      },
    };
  },
};

const joinText: PipelineNodeDefinition = {
  type: 'text.join',
  version: 1,
  label: '文本汇合',
  category: 'text',
  description: '把多个分支的文本汇合，取第一个非空结果；分支汇合到消息输出前常用。',
  defaultJoin: 'any',
  defaultConfig: {},
  fields: [],
  inputs: [
    {
      key: 'values',
      label: '候选文本',
      kind: 'text',
      multiple: true,
      description: '可接入多根文本连线，按连线顺序取第一个非空值。',
    },
  ],
  outputs: [
    { key: 'text', label: '汇合文本', kind: 'text' },
    { key: 'picked', label: '命中序号', kind: 'number' },
  ],
  run: (context) => {
    const raw = context.inputs['values'];
    const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    const picked = values.findIndex((value) => asText(value).trim().length > 0);

    return {
      outputs: { text: picked >= 0 ? asText(values[picked]) : '', picked },
    };
  },
};

const classifyContains: PipelineNodeDefinition = {
  type: 'logic.contains',
  version: 1,
  label: '包含判断',
  category: 'logic',
  description: '判断输入文本是否包含指定内容，并原样带出文本供条件分支继续传递。',
  defaultConfig: { value: '复读', caseSensitive: false },
  fields: [
    { key: 'value', label: '包含内容', kind: 'string', placeholder: '复读' },
    { key: 'caseSensitive', label: '区分大小写', kind: 'boolean' },
  ],
  inputs: [
    {
      key: 'text',
      label: '输入文本',
      kind: 'text',
      description: '被判断的文本；原样从 text 输出，便于用 matched 作为连线条件。',
    },
  ],
  outputs: [
    { key: 'matched', label: '是否命中', kind: 'boolean' },
    { key: 'text', label: '原文本', kind: 'text' },
  ],
  run: (context) => {
    const source = asText(context.inputs['text']);
    const value = readString(context.node.config, 'value');
    const caseSensitive = readBoolean(context.node.config, 'caseSensitive', true);
    const matched = (caseSensitive ? source : source.toLowerCase()).includes(
      caseSensitive ? value : value.toLowerCase(),
    );

    return { outputs: { matched, text: source } };
  },
};

const compareValues: PipelineNodeDefinition = {
  type: 'logic.compare',
  version: 1,
  label: '值比较',
  category: 'logic',
  description: '比较两个任意类型的值，产出一个布尔结果用于分支。',
  defaultConfig: { operator: 'eq', right: '' },
  fields: [
    {
      key: 'operator',
      label: '运算符',
      kind: 'select',
      options: [
        { value: 'eq', label: '等于' },
        { value: 'neq', label: '不等于' },
        { value: 'gt', label: '大于' },
        { value: 'gte', label: '大于等于' },
        { value: 'lt', label: '小于' },
        { value: 'lte', label: '小于等于' },
        { value: 'contains', label: '包含' },
        { value: 'notContains', label: '不包含' },
      ],
    },
    { key: 'left', label: '左值引用（未连线时）', kind: 'string', placeholder: '$input.text' },
    { key: 'right', label: '右值（未连线时）', kind: 'string', placeholder: '0' },
  ],
  inputs: [
    { key: 'left', label: '左侧值', kind: 'any' },
    { key: 'right', label: '右侧值', kind: 'any', optional: true },
  ],
  outputs: [
    { key: 'matched', label: '比较结果', kind: 'boolean' },
    { key: 'left', label: '左侧实际值', kind: 'any' },
    { key: 'right', label: '右侧实际值', kind: 'any' },
  ],
  run: (context) => {
    const operator = readString(context.node.config, 'operator');
    const left =
      context.inputs['left'] !== undefined
        ? context.inputs['left']
        : context.resolve(context.node.config?.['left']);
    const right =
      context.inputs['right'] !== undefined
        ? context.inputs['right']
        : context.resolve(context.node.config?.['right']);

    let matched: boolean;
    switch (operator) {
      case 'eq':
        matched = deepEqual(left, right);
        break;
      case 'neq':
        matched = !deepEqual(left, right);
        break;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        const a = Number(left);
        const b = Number(right);
        if (Number.isNaN(a) || Number.isNaN(b)) {
          throw new Error(`比较运算需要数字：${String(left)} ${operator} ${String(right)}`);
        }
        matched =
          operator === 'gt'
            ? a > b
            : operator === 'gte'
              ? a >= b
              : operator === 'lt'
                ? a < b
                : a <= b;
        break;
      }
      case 'contains':
        matched = stringify(left).includes(stringify(right));
        break;
      case 'notContains':
        matched = !stringify(left).includes(stringify(right));
        break;
      default:
        throw new Error(`不支持的比较运算：${operator}`);
    }

    return { outputs: { matched, left, right } };
  },
};

type CalcMode = 'number' | 'append' | 'math';

function readCalcMode(config: Record<string, unknown> | undefined): CalcMode {
  const value = config?.['mode'];
  if (value === undefined) {
    return 'number';
  }
  if (value !== 'number' && value !== 'append' && value !== 'math') {
    throw new Error('计算方式必须是 number、append 或 math');
  }
  return value;
}

const CALC_OPERATORS = ['add', 'subtract', 'multiply', 'divide', 'modulo', 'power'] as const;

type CalcOperator = (typeof CALC_OPERATORS)[number];

function readCalcOperator(config: Record<string, unknown> | undefined): CalcOperator {
  const value = config?.['operator'];
  if (value === undefined) {
    return 'add';
  }
  if (!CALC_OPERATORS.includes(value as CalcOperator)) {
    throw new Error('数字计算的运算符必须是 add、subtract、multiply、divide、modulo 或 power');
  }
  return value as CalcOperator;
}

const MAX_CALC_EXPRESSION = 1000;
const MAX_CALC_SEPARATOR = 200;

const CALC_SEPARATOR_MODES = ['newline', 'custom'] as const;

type CalcSeparatorMode = (typeof CALC_SEPARATOR_MODES)[number];

function readCalcExpression(config: Record<string, unknown> | undefined): string {
  const expression = (readOptionalString(config, 'expression') ?? '').trim();
  if (expression.length === 0) {
    throw new Error('Math 计算表达式不能为空');
  }
  if (expression.length > MAX_CALC_EXPRESSION) {
    throw new Error(`Math 计算表达式不能超过 ${MAX_CALC_EXPRESSION} 个字符`);
  }
  return expression;
}

function readCalcSeparatorMode(config: Record<string, unknown> | undefined): CalcSeparatorMode {
  const value = config?.['separatorMode'];
  if (value === undefined) {
    return 'newline';
  }
  if (!CALC_SEPARATOR_MODES.includes(value as CalcSeparatorMode)) {
    throw new Error('追加分隔符方式必须是 newline 或 custom');
  }
  return value as CalcSeparatorMode;
}

function readCalcSeparator(config: Record<string, unknown> | undefined): string {
  if (readCalcSeparatorMode(config) === 'newline') {
    return '\n';
  }
  const separator = readOptionalString(config, 'separator') ?? '';
  if (separator.length > MAX_CALC_SEPARATOR) {
    throw new Error(`追加分隔符不能超过 ${MAX_CALC_SEPARATOR} 个字符`);
  }
  return separator;
}

const CALC_INPUT_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;
const DEFAULT_CALC_INPUT_KEYS = ['a', 'b', 'c'];

/** Left-to-right input ports, stored in `config.inputs` so the card can grow them. */
function readCalcInputKeys(config: Record<string, unknown> | undefined): string[] {
  const raw = config?.['inputs'];
  if (raw === undefined) {
    return [...DEFAULT_CALC_INPUT_KEYS];
  }
  if (!Array.isArray(raw) || !raw.every((key) => typeof key === 'string')) {
    throw new Error('输入端口列表必须是端口名字符串数组');
  }
  if (raw.length === 0) {
    return [...DEFAULT_CALC_INPUT_KEYS];
  }
  for (const key of raw as string[]) {
    if (!CALC_INPUT_KEY.test(key)) {
      throw new Error(`输入端口名「${key}」只能由字母、数字和下划线组成，并且以字母开头`);
    }
  }
  if (new Set(raw).size !== raw.length) {
    throw new Error('输入端口名不能重复');
  }
  return raw as string[];
}

function toCalcNumber(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  throw new Error(`${label}需要数字，实际是：${stringify(value) || '空'}`);
}

type CalcToken =
  | { type: 'number'; value: number; index: number }
  | { type: 'name'; value: string; index: number }
  | { type: 'symbol'; value: string; index: number };

function tokenizeCalcExpression(expression: string): CalcToken[] {
  const tokens: CalcToken[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index] ?? '';
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const rest = expression.slice(index);
    const number = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      tokens.push({ type: 'number', value: Number(number[0]), index });
      index += number[0].length;
      continue;
    }

    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (name) {
      tokens.push({ type: 'name', value: name[0], index });
      index += name[0].length;
      continue;
    }

    if (rest.startsWith('**')) {
      tokens.push({ type: 'symbol', value: '**', index });
      index += 2;
      continue;
    }
    if ('+-*/%(),.'.includes(char)) {
      tokens.push({ type: 'symbol', value: char, index });
      index += 1;
      continue;
    }

    throw new Error(`Math 计算表达式第 ${index + 1} 个字符无法识别：${char}`);
  }

  return tokens;
}

type CalcFunctionName =
  | 'abs'
  | 'ceil'
  | 'floor'
  | 'round'
  | 'trunc'
  | 'sign'
  | 'sqrt'
  | 'cbrt'
  | 'exp'
  | 'log'
  | 'log2'
  | 'log10'
  | 'sin'
  | 'cos'
  | 'tan'
  | 'asin'
  | 'acos'
  | 'atan'
  | 'atan2'
  | 'pow'
  | 'min'
  | 'max'
  | 'hypot';

const CALC_FUNCTION_NAMES: readonly CalcFunctionName[] = [
  'abs',
  'ceil',
  'floor',
  'round',
  'trunc',
  'sign',
  'sqrt',
  'cbrt',
  'exp',
  'log',
  'log2',
  'log10',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'pow',
  'min',
  'max',
  'hypot',
];

const CALC_FUNCTION_SET = new Set<string>(CALC_FUNCTION_NAMES);

type CalcExpression =
  | { kind: 'number'; value: number }
  | { kind: 'variable'; name: string }
  | { kind: 'constant'; name: 'PI' | 'E' }
  | { kind: 'unary'; operator: '+' | '-'; operand: CalcExpression }
  | {
      kind: 'binary';
      operator: '+' | '-' | '*' | '/' | '%' | '**';
      left: CalcExpression;
      right: CalcExpression;
    }
  | { kind: 'call'; name: CalcFunctionName; args: CalcExpression[] };

class CalcParser {
  private readonly tokens: CalcToken[];
  private position = 0;

  constructor(expression: string) {
    this.tokens = tokenizeCalcExpression(expression);
  }

  parse(): CalcExpression {
    if (this.tokens.length === 0) {
      throw new Error('Math 计算表达式不能为空');
    }
    const expression = this.parseSum();
    const extra = this.peek();
    if (extra) {
      throw new Error(`Math 计算表达式在第 ${extra.index + 1} 个字符处有多余内容`);
    }
    return expression;
  }

  private peek(offset = 0): CalcToken | undefined {
    return this.tokens[this.position + offset];
  }

  private take(): CalcToken {
    const token = this.tokens[this.position];
    if (!token) {
      throw new Error('Math 计算表达式意外结束');
    }
    this.position += 1;
    return token;
  }

  private takeSymbol(value: string): boolean {
    const token = this.peek();
    if (token?.type === 'symbol' && token.value === value) {
      this.position += 1;
      return true;
    }
    return false;
  }

  private requireSymbol(value: string): void {
    if (this.takeSymbol(value)) {
      return;
    }
    const token = this.peek();
    throw new Error(
      token
        ? `Math 计算表达式在第 ${token.index + 1} 个字符处缺少「${value}」`
        : `Math 计算表达式结尾缺少「${value}」`,
    );
  }

  private parseSum(): CalcExpression {
    let left = this.parseProduct();
    for (;;) {
      const token = this.peek();
      if (token?.type !== 'symbol' || (token.value !== '+' && token.value !== '-')) {
        return left;
      }
      this.position += 1;
      const operator = token.value as '+' | '-';
      left = { kind: 'binary', operator, left, right: this.parseProduct() };
    }
  }

  private parseProduct(): CalcExpression {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (
        token?.type !== 'symbol' ||
        (token.value !== '*' && token.value !== '/' && token.value !== '%')
      ) {
        return left;
      }
      this.position += 1;
      const operator = token.value as '*' | '/' | '%';
      left = { kind: 'binary', operator, left, right: this.parseUnary() };
    }
  }

  private parseUnary(): CalcExpression {
    const token = this.peek();
    if (token?.type === 'symbol' && (token.value === '+' || token.value === '-')) {
      this.position += 1;
      const operator = token.value as '+' | '-';
      return { kind: 'unary', operator, operand: this.parseUnary() };
    }
    return this.parsePower();
  }

  private parsePower(): CalcExpression {
    const left = this.parsePrimary();
    if (this.takeSymbol('**')) {
      return { kind: 'binary', operator: '**', left, right: this.parseUnary() };
    }
    return left;
  }

  private parsePrimary(): CalcExpression {
    const token = this.peek();
    if (!token) {
      throw new Error('Math 计算表达式意外结束');
    }
    if (token.type === 'number') {
      this.position += 1;
      return { kind: 'number', value: token.value };
    }
    if (token.type === 'name') {
      this.position += 1;
      return this.parseName(token.value);
    }
    if (token.type === 'symbol' && token.value === '(') {
      this.position += 1;
      const expression = this.parseSum();
      this.requireSymbol(')');
      return expression;
    }
    throw new Error(
      `Math 计算表达式在第 ${token.index + 1} 个字符处需要数字、变量或函数`,
    );
  }

  private parseName(name: string): CalcExpression {
    if (name === 'Math') {
      this.requireSymbol('.');
      const member = this.take();
      if (member.type !== 'name') {
        throw new Error('Math 后需要函数名或常量，例如 Math.round(a)');
      }
      if (member.value === 'PI') {
        return { kind: 'constant', name: 'PI' };
      }
      if (member.value === 'E') {
        return { kind: 'constant', name: 'E' };
      }
      return this.parseCall(member.value);
    }
    if (name === 'PI') {
      return { kind: 'constant', name: 'PI' };
    }
    if (name === 'E') {
      return { kind: 'constant', name: 'E' };
    }
    const next = this.peek();
    if (next?.type === 'symbol' && next.value === '(') {
      return this.parseCall(name);
    }
    return { kind: 'variable', name };
  }

  private parseCall(name: string): CalcExpression {
    if (!CALC_FUNCTION_SET.has(name)) {
      throw new Error(`Math 计算不支持函数「${name}」`);
    }
    this.requireSymbol('(');
    const args: CalcExpression[] = [];
    if (!this.takeSymbol(')')) {
      for (;;) {
        args.push(this.parseSum());
        if (this.takeSymbol(',')) {
          continue;
        }
        this.requireSymbol(')');
        break;
      }
    }
    return { kind: 'call', name: name as CalcFunctionName, args };
  }
}

function applyCalcFunction(name: CalcFunctionName, args: number[]): number {
  if (name === 'min' || name === 'max' || name === 'hypot') {
    if (args.length === 0) {
      throw new Error(`Math.${name} 至少需要一个参数`);
    }
  } else if (name === 'atan2' || name === 'pow') {
    if (args.length !== 2) {
      throw new Error(`Math.${name} 需要两个参数`);
    }
  } else if (args.length !== 1) {
    throw new Error(`Math.${name} 需要一个参数`);
  }

  const first = args[0] ?? 0;
  const second = args[1] ?? 0;

  switch (name) {
    case 'abs':
      return Math.abs(first);
    case 'ceil':
      return Math.ceil(first);
    case 'floor':
      return Math.floor(first);
    case 'round':
      return Math.round(first);
    case 'trunc':
      return Math.trunc(first);
    case 'sign':
      return Math.sign(first);
    case 'sqrt':
      return Math.sqrt(first);
    case 'cbrt':
      return Math.cbrt(first);
    case 'exp':
      return Math.exp(first);
    case 'log':
      return Math.log(first);
    case 'log2':
      return Math.log2(first);
    case 'log10':
      return Math.log10(first);
    case 'sin':
      return Math.sin(first);
    case 'cos':
      return Math.cos(first);
    case 'tan':
      return Math.tan(first);
    case 'asin':
      return Math.asin(first);
    case 'acos':
      return Math.acos(first);
    case 'atan':
      return Math.atan(first);
    case 'atan2':
      return Math.atan2(first, second);
    case 'pow':
      return first ** second;
    case 'min':
      return Math.min(...args);
    case 'max':
      return Math.max(...args);
    case 'hypot':
      return Math.hypot(...args);
    default:
      throw new Error(`Math 计算不支持函数：${name}`);
  }
}

function evaluateCalc(expression: CalcExpression, variables: Record<string, unknown>): number {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'constant':
      return expression.name === 'PI' ? Math.PI : Math.E;
    case 'variable':
      return toCalcNumber(variables[expression.name], `Math 计算的变量 ${expression.name} `);
    case 'unary': {
      const operand = evaluateCalc(expression.operand, variables);
      return expression.operator === '-' ? -operand : operand;
    }
    case 'binary': {
      const left = evaluateCalc(expression.left, variables);
      const right = evaluateCalc(expression.right, variables);
      switch (expression.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          if (right === 0) {
            throw new Error('Math 计算的除法不能除以 0');
          }
          return left / right;
        case '%':
          if (right === 0) {
            throw new Error('Math 计算的取余不能除以 0');
          }
          return left % right;
        case '**':
          return left ** right;
      }
      break;
    }
    case 'call': {
      const args = expression.args.map((argument) => evaluateCalc(argument, variables));
      return applyCalcFunction(expression.name, args);
    }
  }

  throw new Error('Math 表达式无法求值');
}

function collectCalcVariables(expression: CalcExpression, found = new Set<string>()): Set<string> {
  switch (expression.kind) {
    case 'variable':
      found.add(expression.name);
      break;
    case 'unary':
      collectCalcVariables(expression.operand, found);
      break;
    case 'binary':
      collectCalcVariables(expression.left, found);
      collectCalcVariables(expression.right, found);
      break;
    case 'call':
      for (const argument of expression.args) {
        collectCalcVariables(argument, found);
      }
      break;
    default:
      break;
  }
  return found;
}

/** Every expression variable must be one of the card's left-side ports. */
function assertCalcVariables(expression: CalcExpression, portKeys: readonly string[]): void {
  const missing = [...collectCalcVariables(expression)].filter((name) => !portKeys.includes(name));
  if (missing.length === 0) {
    return;
  }
  throw new Error(
    `Math 计算用到了未定义的变量「${missing[0]}」；当前左侧输入为 ${portKeys.join('、') || '（无）'}`,
  );
}

function computeCalcExpression(
  expressionText: string,
  variables: Record<string, unknown>,
  portKeys: readonly string[],
): number {
  const expression = new CalcParser(expressionText).parse();
  assertCalcVariables(expression, portKeys);
  const value = evaluateCalc(expression, variables);
  if (!Number.isFinite(value)) {
    throw new Error(`Math 计算结果不是有效数字：${expressionText}`);
  }
  return value;
}

/** Number mode reads the first two ports; unconnected ports fall back to config. */
function computeNumberCalc(context: PipelineNodeContext): number {
  const config = context.node.config;
  const operator = readCalcOperator(config);
  const [leftKey, rightKey] = readCalcInputKeys(config);
  const connected = (key: string | undefined) =>
    key !== undefined && context.inputs[key] !== undefined;
  const leftSource = connected(leftKey)
    ? context.inputs[leftKey as string]
    : context.resolve(readOptionalString(config, 'left') ?? '');
  const rightSource = connected(rightKey)
    ? context.inputs[rightKey as string]
    : context.resolve(readOptionalString(config, 'right') ?? '');
  const left = toCalcNumber(leftSource, '数字计算的左值');
  const right = toCalcNumber(
    rightSource,
    '数字计算的右值（接到值 B，或在「右值」里填数字）',
  );

  let value: number;
  switch (operator) {
    case 'add':
      value = left + right;
      break;
    case 'subtract':
      value = left - right;
      break;
    case 'multiply':
      value = left * right;
      break;
    case 'divide':
      if (right === 0) {
        throw new Error('数字计算不能除以 0');
      }
      value = left / right;
      break;
    case 'modulo':
      if (right === 0) {
        throw new Error('数字计算的取余不能除以 0');
      }
      value = left % right;
      break;
    case 'power':
      value = left ** right;
      break;
    default:
      throw new Error(`不支持的数字运算：${String(operator)}`);
  }

  if (!Number.isFinite(value)) {
    throw new Error('数字计算结果不是有效数字');
  }
  return value;
}

const calculateValue: PipelineNodeDefinition = {
  type: 'logic.calc',
  version: 1,
  label: '逻辑计算',
  category: 'logic',
  description:
    '按所选方式计算：数字计算对前两个左侧输入做四则运算；文本追加按左侧输入顺序拼接，可选换行或自定义分隔符；Math 计算执行以左侧输入为变量的表达式，支持 Math.* 白名单函数。',
  dynamicInputs: 'values',
  defaultConfig: {
    mode: 'number',
    operator: 'add',
    left: '',
    right: '',
    separatorMode: 'newline',
    separator: '',
    expression: 'Math.round(a)',
    inputs: ['a', 'b', 'c'],
  },
  fields: [
    {
      key: 'mode',
      label: '计算方式',
      kind: 'select',
      options: [
        { value: 'number', label: '数字计算' },
        { value: 'append', label: '文本追加' },
        { value: 'math', label: 'Math 计算' },
      ],
      hint: '数字计算用前两个输入；文本追加按左侧输入顺序拼接；Math 计算把每个左侧输入当作变量。',
    },
    {
      key: 'operator',
      label: '运算符',
      kind: 'select',
      options: [
        { value: 'add', label: '加（+）' },
        { value: 'subtract', label: '减（−）' },
        { value: 'multiply', label: '乘（×）' },
        { value: 'divide', label: '除（÷）' },
        { value: 'modulo', label: '取余（%）' },
        { value: 'power', label: '幂（**）' },
      ],
      hint: '除数和取余数为 0 时节点失败。',
      visibleWhen: [{ key: 'mode', equals: 'number' }],
    },
    {
      key: 'left',
      label: '左值（未连线时）',
      kind: 'string',
      width: 'half',
      placeholder: '50 或 $vars.好感度',
      hint: '第一个输入有连线时优先用连线值。',
      visibleWhen: [{ key: 'mode', equals: 'number' }],
    },
    {
      key: 'right',
      label: '右值（未连线时）',
      kind: 'string',
      width: 'half',
      placeholder: '5',
      hint: '第二个输入有连线时优先用连线值。',
      visibleWhen: [{ key: 'mode', equals: 'number' }],
    },
    {
      key: 'separatorMode',
      label: '分隔符',
      kind: 'select',
      options: [
        { value: 'newline', label: '换行符' },
        { value: 'custom', label: '自定义' },
      ],
      hint: '插在每一段之间。',
      visibleWhen: [{ key: 'mode', equals: 'append' }],
    },
    {
      key: 'separator',
      label: '自定义分隔符',
      kind: 'string',
      placeholder: '留空直接相连',
      hint: '仅「自定义」时使用。',
      visibleWhen: [
        { key: 'mode', equals: 'append' },
        { key: 'separatorMode', equals: 'custom' },
      ],
    },
    {
      key: 'expression',
      label: 'Math 表达式',
      kind: 'string',
      placeholder: 'Math.max(a, b) * 2',
      hint: '左侧输入的端口名就是变量名，可用 Math.PI / Math.E，以及 abs、round、floor、ceil、min、max、pow、sqrt、hypot 等函数。',
      visibleWhen: [{ key: 'mode', equals: 'math' }],
    },
  ],
  inputs: [
    {
      key: 'a',
      label: '值 A',
      kind: 'any',
      optional: true,
      description: '数字计算的左值、文本追加的第一段，或 Math 表达式里的变量 a。',
    },
    {
      key: 'b',
      label: '值 B',
      kind: 'any',
      optional: true,
      description: '数字计算的右值、文本追加的第二段，或 Math 表达式里的变量 b。',
    },
    {
      key: 'c',
      label: '值 C',
      kind: 'any',
      optional: true,
      description: '文本追加的第三段，或 Math 表达式里的变量 c；数字计算不用。',
    },
  ],
  outputs: [
    {
      key: 'value',
      label: '计算结果',
      kind: 'any',
      description: '数字计算与 Math 输出数字；文本追加输出拼接后的字符串。',
    },
    {
      key: 'text',
      label: '文本形式',
      kind: 'text',
      description: '计算结果的字符串形式，可直接接入回复正文。',
    },
  ],
  validateConfig: (config) => {
    const mode = readCalcMode(config);
    const portKeys = readCalcInputKeys(config);
    if (mode === 'number') {
      readCalcOperator(config);
    }
    if (mode === 'append') {
      readCalcSeparator(config);
    }
    if (mode === 'math') {
      const expression = new CalcParser(readCalcExpression(config)).parse();
      assertCalcVariables(expression, portKeys);
    }
  },
  run: (context) => {
    const mode = readCalcMode(context.node.config);
    const portKeys = readCalcInputKeys(context.node.config);

    if (mode === 'append') {
      const separator = readCalcSeparator(context.node.config);
      const text = portKeys
        .map((key) => asText(context.inputs[key]))
        .filter((part) => part !== '')
        .join(separator);
      return { outputs: { value: text, text } };
    }

    if (mode === 'number') {
      const value = computeNumberCalc(context);
      return { outputs: { value, text: stringify(value) } };
    }

    const variables = Object.fromEntries(portKeys.map((key) => [key, context.inputs[key]]));
    const value = computeCalcExpression(
      readCalcExpression(context.node.config),
      variables,
      portKeys,
    );
    return { outputs: { value, text: stringify(value) } };
  },
};

const sourceWhitelist: PipelineNodeDefinition = {
  type: 'logic.whitelist',
  version: 6,
  label: '来源过滤',
  category: 'logic',
  description:
    '闸门：白名单只放行名单内的来源，黑名单只拦截名单内的来源，也可以不启用。被拦截时不输出消息对象，下游整条分支停止执行。群聊只比对群号，私聊只比对 QQ 号，两列互不相通。',
  defaultConfig: {
    mode: 'off',
    groupWhitelist: '',
    privateWhitelist: '',
  },
  fields: [
    {
      key: 'mode',
      label: '过滤方式',
      kind: 'select',
      options: [
        { value: 'off', label: '不启用' },
        { value: 'whitelist', label: '白名单' },
        { value: 'blacklist', label: '黑名单' },
      ],
      hint: '白名单：只有名单内的来源放行；黑名单：名单内的来源不放行；不启用：全部放行。',
    },
    {
      key: 'groupWhitelist',
      label: '群号名单',
      kind: 'text',
      width: 'half',
      placeholder: '每行一个群号',
      hint: '只比对群聊的群号。白名单模式下留空表示所有群聊都不放行；黑名单模式下留空表示都不拦截。',
    },
    {
      key: 'privateWhitelist',
      label: 'QQ 号名单',
      kind: 'text',
      width: 'half',
      placeholder: '每行一个 QQ 号',
      hint: '只比对私聊对方的 QQ 号。白名单模式下留空表示所有私聊都不放行；黑名单模式下留空表示都不拦截。',
    },
  ],
  inputs: [
    {
      key: 'message',
      label: '消息对象',
      kind: 'json',
      description:
        '从「消息输入」的 message 端口接入；来源过滤读取其中的 conversationKind 与 conversationExternalId。',
    },
  ],
  outputs: [
    {
      key: 'value',
      label: '原消息对象',
      kind: 'any',
      description: '放行时原样输出；被拦截时没有输出，下游连线和卡片都不会执行。',
    },
  ],
  validateConfig: (config) => {
    readSourceListMode(config);
    readSourceWhitelist(config, 'groupWhitelist');
    readSourceWhitelist(config, 'privateWhitelist');
  },
  run: (context) => {
    const mode = readSourceListMode(context.node.config);
    const { conversationKind, conversationExternalId } = readSourceMessage(
      context.inputs['message'],
    );

    if (mode === 'off') {
      return { outputs: { value: context.inputs['message'] } };
    }

    const list = readSourceWhitelist(
      context.node.config,
      conversationKind === 'GROUP' ? 'groupWhitelist' : 'privateWhitelist',
    );
    const listed = list.includes(conversationExternalId);
    const allowed = mode === 'whitelist' ? listed : !listed;

    return allowed
      ? { outputs: { value: context.inputs['message'] } }
      : { outputs: {}, blocked: true };
  },
};

const delayFlow: PipelineNodeDefinition = {
  type: 'flow.delay',
  version: 1,
  label: '延时等待',
  category: 'flow',
  description:
    '把收到的数据等待一段时间后原样交给下游；等待期间本次运行停在这张卡上，同一次运行里排在其后的分支也会被推迟。',
  defaultConfig: { delayMs: 3000 },
  fields: [
    {
      key: 'delayMs',
      label: '等待时长',
      kind: 'number',
      placeholder: '3000',
      hint: `毫秒，范围 0–${MAX_DELAY_MS}；等待计入运行时长，进程重启会中断等待。`,
    },
  ],
  inputs: [
    {
      key: 'value',
      label: '待延时数据',
      kind: 'any',
      description: '任意类型的值，等待结束后原样从 value 端口流出。',
    },
  ],
  outputs: [
    { key: 'value', label: '延时后的数据', kind: 'any' },
    { key: 'delayedAt', label: '完成时间', kind: 'text' },
    { key: 'waitedMs', label: '实际等待', kind: 'number' },
  ],
  validateConfig: (config) => {
    readDelayMs(config);
  },
  run: async (context) => {
    const delayMs = readDelayMs(context.node.config);
    const startedAt = Date.now();
    await context.wait(delayMs);
    return {
      outputs: {
        value: context.inputs['value'] ?? null,
        delayedAt: new Date().toISOString(),
        waitedMs: Date.now() - startedAt,
      },
    };
  },
};

const describeImage: PipelineNodeDefinition = {
  type: 'media.describe',
  version: 2,
  label: '图片描述',
  category: 'media',
  description:
    '按图片哈希查库中已有描述；缺失时用卡片提示词调用视觉模型并写回媒体库。可只描述一张，也可为消息里的每张图片逐张生成。',
  defaultConfig: {
    mode: 'single',
    prompt:
      '请用简洁的中文描述这张图片：先说明主体与场景，再补充关键细节（人物、动作、文字、风格）。不要编造图片中没有的内容，控制在 120 字以内。',
    imageIndex: 0,
    force: false,
    providerId: '',
    model: '',
  },
  fields: [
    {
      key: 'mode',
      label: '描述范围',
      kind: 'select',
      options: [
        { value: 'single', label: '仅一张' },
        { value: 'all', label: '全部图片' },
      ],
      hint: '「全部图片」会按输入顺序逐张查询缓存并为缺失描述调用模型，单张失败不影响其他图片。',
    },
    {
      key: 'prompt',
      label: '描述提示词',
      kind: 'text',
      hint: '只在库中没有该图片描述时调用模型；已有描述会直接复用。',
    },
    {
      key: 'imageIndex',
      label: '第几张图片',
      kind: 'number',
      placeholder: '0',
      hint: `仅在「仅一张」模式使用，从 0 开始，最大 ${MAX_IMAGE_INDEX}。`,
    },
    {
      key: 'force',
      label: '强制重新描述',
      kind: 'boolean',
      hint: '开启后即使已有描述也会重新调用模型，并用新结果覆盖。',
    },
    {
      key: 'providerId',
      label: '提供商',
      kind: 'select',
      optionsSource: 'model-providers',
      hint: '留空使用设置中的首个提供商；需要支持图片输入的视觉模型。',
    },
    {
      key: 'model',
      label: '模型',
      kind: 'select',
      optionsSource: 'provider-models',
      dependsOn: 'providerId',
      hint: '只列出所选提供商已配置的模型；留空使用其首个模型。',
    },
  ],
  inputs: [
    {
      key: 'image',
      label: '图片',
      kind: 'image',
      description: '接入消息图片或引用图片；传入数组时按所选范围逐张处理。',
    },
  ],
  outputs: [
    {
      key: 'description',
      label: '图片描述',
      kind: 'text',
      description: '仅一张时是该图的描述；全部图片时按输入顺序用空行拼接。',
    },
    {
      key: 'descriptions',
      label: '逐张描述',
      kind: 'json',
      description: '数组，每项含 sha256 / description / cached / image，按输入顺序排列。',
    },
    {
      key: 'failed',
      label: '失败图片',
      kind: 'json',
      description: '「全部图片」模式下单张失败的记录，含 image 与 message；其他图片仍会生成描述。',
    },
    {
      key: 'found',
      label: '是否找到图片',
      kind: 'boolean',
      description: '输入没有图片时为 false，可据此跳过下游分支。',
    },
    {
      key: 'cached',
      label: '命中缓存',
      kind: 'boolean',
      description: 'true 表示本次没有任何图片调用模型，描述全部来自媒体库。',
    },
    {
      key: 'count',
      label: '图片数量',
      kind: 'number',
      description: '本次输入的图片总数，包含生成失败的张数。',
    },
    {
      key: 'sha256',
      label: '图片哈希',
      kind: 'text',
      description: '仅一张时是该图哈希；全部图片时是首张成功图片的哈希。',
    },
    {
      key: 'image',
      label: '原图片',
      kind: 'image',
      description: '仅一张时是该图；全部图片时按原顺序输出图片数组。',
    },
  ],
  validateConfig: (config) => {
    readDescriptionPrompt(config);
    if (readDescriptionMode(config) === 'single') {
      readImageIndex(config);
    }
  },
  run: async (context) => {
    const images = readImages(context.inputs['image']);
    if (images.length === 0) {
      return {
        outputs: {
          description: '',
          descriptions: [],
          failed: [],
          found: false,
          cached: false,
          count: 0,
          sha256: '',
          image: null,
        },
      };
    }

    const config = context.node.config;
    const prompt = readDescriptionPrompt(config);
    const providerId = readOptionalString(config, 'providerId');
    const model = readOptionalString(config, 'model');
    const force = readBoolean(config, 'force', false);

    if (readDescriptionMode(config) === 'all') {
      const descriptions: Array<{
        sha256: string;
        description: string;
        cached: boolean;
        image: string;
      }> = [];
      const failed: Array<{ image: string; message: string }> = [];
      const effects: PipelineEffect[] = [];
      // Same reference twice in one message should cost one model call; the
      // effect is emitted once because the media row is shared by hash.
      const seen = new Map<string, Awaited<ReturnType<typeof context.describeImage>>>();
      let cached = true;

      // Sequential on purpose: one model call at a time keeps provider rate
      // limits predictable and preserves the input order in `descriptions`.
      for (const reference of images) {
        try {
          let result = seen.get(reference);
          if (!result) {
            result = await context.describeImage({ reference, prompt, providerId, model, force });
            seen.set(reference, result);
            if (result.mediaId && !result.cached) {
              effects.push({
                type: 'media.description',
                mediaId: result.mediaId,
                description: result.description,
              });
            }
          }
          descriptions.push({
            sha256: result.sha256,
            description: result.description,
            cached: result.cached,
            image: reference,
          });
          cached = cached && result.cached;
        } catch (error) {
          cached = false;
          failed.push({
            image: reference,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        outputs: {
          description: descriptions.map((entry) => entry.description).join('\n\n'),
          descriptions,
          failed,
          found: true,
          cached: descriptions.length > 0 && cached,
          count: images.length,
          sha256: descriptions[0]?.sha256 ?? '',
          image: images,
        },
        effects,
      };
    }

    const index = readImageIndex(config);
    const reference = images[index];
    if (reference === undefined) {
      throw new Error(`输入只有 ${images.length} 张图片，取不到第 ${index} 张`);
    }

    const result = await context.describeImage({ reference, prompt, providerId, model, force });
    const effects: PipelineEffect[] =
      result.mediaId && !result.cached
        ? [
            {
              type: 'media.description',
              mediaId: result.mediaId,
              description: result.description,
            },
          ]
        : [];

    return {
      outputs: {
        description: result.description,
        descriptions: [
          {
            sha256: result.sha256,
            description: result.description,
            cached: result.cached,
            image: reference,
          },
        ],
        failed: [],
        found: true,
        cached: result.cached,
        count: images.length,
        sha256: result.sha256,
        image: reference,
      },
      effects,
    };
  },
};

const noteText: PipelineNodeDefinition = {
  type: 'note.text',
  version: 1,
  label: '文字描述',
  category: 'note',
  description:
    '画布上的说明文字，用来标注分支用途或留备忘；不参与运行，也没有可连接的端口。',
  layout: true,
  defaultConfig: { text: '' },
  fields: [
    {
      key: 'text',
      label: '说明文字',
      kind: 'text',
      placeholder: '写一段注释，例如：这个分支只处理带引用的消息……',
      hint: '只出现在画布上，不会进入消息或运行结果；双击卡片可以直接编辑。',
    },
  ],
  inputs: [],
  outputs: [],
  validateConfig: (config) => {
    const text = config?.['text'];
    if (text !== undefined && typeof text !== 'string') {
      throw new Error('说明文字必须是字符串');
    }
    if (typeof text === 'string' && text.length > MAX_CARD_TEXT) {
      throw new Error(`说明文字不能超过 ${MAX_CARD_TEXT} 个字符`);
    }
  },
  // Layout-only cards are filtered out by the runner; this keeps the contract total.
  run: () => ({ outputs: {} }),
};

const DEFINITIONS: readonly PipelineNodeDefinition[] = [
  messageInput,
  messageOutput,
  getObjectField,
  callPersona,
  groupPersona,
  privatePersona,
  chatCompletion,
  promptCompression,
  constantValue,
  getVariable,
  setVariable,
  constantText,
  templateText,
  transformText,
  regexText,
  joinText,
  classifyContains,
  compareValues,
  calculateValue,
  sourceWhitelist,
  describeImage,
  delayFlow,
  noteText,
];

const REGISTRY = new Map(DEFINITIONS.map((definition) => [definition.type, definition]));

export function getPipelineNode(type: string): PipelineNodeDefinition {
  const definition = REGISTRY.get(type);
  if (!definition) {
    throw new Error(`未注册的管线节点类型：${type}`);
  }
  return definition;
}

export function listPipelineNodes(): PipelineNodeDefinition[] {
  return [...DEFINITIONS];
}

export function createPipelineHelpers(
  message: PipelineMessage,
  outputs: PipelineOutputs,
  inputs: PipelineInputs,
  variables: PipelineVariables,
): {
  resolve: (value: unknown) => unknown;
  template: (text: string) => string;
} {
  return createHelpers(message, outputs, inputs, variables);
}

export type { PipelineNodeContext };
