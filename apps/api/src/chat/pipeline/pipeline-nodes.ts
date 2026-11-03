import type { ChatPipelineMessageValue } from '@inkseek/shared';
import type {
  PipelineEffect,
  PipelineInputs,
  PipelineMessage,
  PipelineNodeContext,
  PipelineNodeDefinition,
  PipelineOutputs,
} from './pipeline-types.js';

const REFERENCE = /^\$([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)$/;
const TEMPLATE = /{{\s*([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\s*}}/g;
const MAX_REPLY_LENGTH = 4000;
const MAX_REPLY_IMAGES = 4;
const MAX_DELAY_MS = 60_000;
const MAX_IMAGE_INDEX = 99;
const MAX_DESCRIPTION_PROMPT = 4000;

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

function readReference(
  reference: string,
  message: PipelineMessage,
  outputs: PipelineOutputs,
  inputs: PipelineInputs,
): unknown {
  const [root, ...rest] = reference.split('.');
  if (!root) {
    return undefined;
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
) {
  const template = (text: string): string =>
    text.replace(TEMPLATE, (_match, reference: string) =>
      stringify(readReference(reference, message, outputs, inputs)),
    );

  const resolve = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const exact = REFERENCE.exec(value);
      if (exact?.[1]) {
        return readReference(exact[1], message, outputs, inputs);
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
        '包含发送者、正文、引用（含引用图片）、媒体计数等全部字段；配合「对象取值」按需读取。',
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
  { value: 'voiceCount', label: '语音数量' },
  { value: 'sentAt', label: '发送时间' },
  { value: 'id', label: '消息 ID' },
  { value: 'externalId', label: '渠道消息 ID' },
  { value: 'channelId', label: '渠道 ID' },
  { value: 'conversationId', label: '会话 ID' },
  { value: 'conversationKind', label: '会话类型' },
  { value: 'isSelf', label: '是否自己发送' },
  { value: '', label: '整个消息对象' },
];

const getObjectField: PipelineNodeDefinition = {
  type: 'object.get',
  version: 2,
  label: '对象取值',
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
      label: '对象',
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

const DEFINITIONS: readonly PipelineNodeDefinition[] = [
  messageInput,
  messageOutput,
  getObjectField,
  templateText,
  transformText,
  regexText,
  joinText,
  classifyContains,
  compareValues,
  describeImage,
  delayFlow,
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
): {
  resolve: (value: unknown) => unknown;
  template: (text: string) => string;
} {
  return createHelpers(message, outputs, inputs);
}

export type { PipelineNodeContext };
