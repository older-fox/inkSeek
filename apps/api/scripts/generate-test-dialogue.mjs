#!/usr/bin/env node
/**
 * 读取在线 NapCat 渠道的人格全属性，调用当前配置的模型提供商生成一段测试对白。
 *
 * 用法（仓库根目录）：
 *   node apps/api/scripts/generate-test-dialogue.mjs
 *
 * 可选环境变量：
 *   TEST_PROVIDER  指定模型提供商名称（默认取最早创建的可用提供商）
 *   TEST_MODEL     指定模型 ID（默认自动挑选对话模型）
 *
 * 只读取 DATABASE_URL，不打印任何 API Key。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const REQUEST_TIMEOUT_MS = 60000;

for (const candidate of [resolve(repoRoot, '.env'), resolve(scriptDir, '../.env')]) {
  if (!existsSync(candidate)) {
    continue;
  }

  try {
    loadEnvFile(candidate);
    break;
  } catch {
    // Try the next candidate.
  }
}

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  console.error('缺少 DATABASE_URL：请在仓库根目录 .env 中配置。');
  process.exit(1);
}

const personaLabelFiles = {
  channel: resolve(repoRoot, 'apps/web/src/lib/channel-persona.ts'),
  group: resolve(repoRoot, 'apps/web/src/lib/group-persona.ts'),
};

function readPersonaLabels(file) {
  const labels = new Map();
  const order = [];

  try {
    const source = readFileSync(file, 'utf8');
    const pattern = /key:\s*'([^']+)'[\s\S]{0,160}?label:\s*'([^']+)'/g;

    for (const match of source.matchAll(pattern)) {
      const [, key, label] = match;

      if (!labels.has(key)) {
        labels.set(key, label);
        order.push(key);
      }
    }
  } catch {
    // 标签仅用于提升对白可读性，缺失时回退到原始字段名。
  }

  return { labels, order };
}

function pickValues(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const values = {};

  for (const [key, value] of Object.entries(raw)) {
    const valid =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      (Array.isArray(value) && value.every((item) => typeof item === 'string'));

    if (valid) {
      values[key] = value;
    }
  }

  return values;
}

function formatValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join('、') : '未填写';
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }

  const text = String(value).trim();
  return text || '未填写';
}

function formatAttributeSheet(values, { labels, order }) {
  const keys = order.filter((key) => key in values);

  for (const key of Object.keys(values)) {
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }

  return keys.map((key) => `- ${labels.get(key) ?? key}：${formatValue(values[key])}`).join('\n');
}

function readModels(raw) {
  return Array.isArray(raw) ? raw.filter((model) => typeof model === 'string') : [];
}

const NOISY_MODEL =
  /embed|whisper|tts|speech|voice|image|dall-e|moderation|rerank|guard|stable-diffusion/i;

function pickModel(models) {
  const preferred = process.env.TEST_MODEL?.trim();

  if (preferred) {
    return preferred;
  }

  const candidates = models.filter((model) => !NOISY_MODEL.test(model));
  const ordered = [
    ...candidates.filter((model) => /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4/i.test(model)),
    ...candidates.filter((model) => /claude/i.test(model)),
    ...candidates.filter((model) => /gemini/i.test(model)),
    ...candidates.filter((model) => /deepseek/i.test(model) && /pro|chat/i.test(model)),
    ...candidates.filter((model) => /qwen|glm|moonshot|kimi/i.test(model)),
    ...candidates.filter((model) => /deepseek/i.test(model)),
    ...candidates,
  ];

  return ordered[0] ?? models[0];
}

function trimBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

async function callProvider({ provider, model, system, user }) {
  const baseUrl = trimBaseUrl(provider.baseUrl);
  const apiKey = provider.apiKey;
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let url;
  let headers;
  let body;

  if (provider.protocol === 'openai') {
    url = `${baseUrl}/chat/completions`;
    headers = {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
    };
    body = {
      model,
      temperature: 0.9,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
  } else if (provider.protocol === 'anthropic') {
    url = `${baseUrl}/messages`;
    headers = {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    body = {
      model,
      max_tokens: 4096,
      temperature: 0.9,
      system,
      messages: [{ role: 'user', content: user }],
    };
  } else if (provider.protocol === 'gemini') {
    url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    headers = { 'content-type': 'application/json', accept: 'application/json' };
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
    };
  } else {
    throw new Error(`不支持的协议：${provider.protocol}`);
  }

  let response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`模型请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`);
    }

    throw new Error(
      `无法连接模型提供商：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const raw = await response.text();
  const safeRaw = raw.split(apiKey).join('••••');

  if (!response.ok) {
    throw new Error(`模型提供商返回 HTTP ${response.status}：${safeRaw.slice(0, 500)}`);
  }

  let payload;

  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`模型返回内容不是 JSON：${safeRaw.slice(0, 300)}`);
  }

  return extractText(provider.protocol, payload);
}

function extractText(protocol, payload) {
  if (protocol === 'openai') {
    const content = payload?.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
        .trim();
    }

    return '';
  }

  if (protocol === 'anthropic') {
    return (payload?.content ?? [])
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('')
      .trim();
  }

  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

function maskKey(apiKey) {
  return apiKey.length > 4 ? `••••${apiKey.slice(-4)}` : '••••';
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const channels = await prisma.chatChannel.findMany({
    where: { connector: 'NapCat' },
    include: { persona: true },
    orderBy: [{ lastConnectedAt: { sort: 'desc', nulls: 'last' } }],
  });
  const channel = channels.find((item) => item.status === 'ONLINE') ?? channels[0];

  if (!channel) {
    throw new Error('尚未连接任何 NapCat 渠道，请先在设置中完成连接。');
  }

  if (!channel.persona) {
    throw new Error(`渠道「${channel.displayName}」还没有绑定人格卡。`);
  }

  if (channel.status !== 'ONLINE') {
    console.warn(
      `注意：渠道「${channel.displayName}」当前状态为 ${channel.status}，继续使用已保存的人格。`,
    );
  }

  const channelValues = pickValues(channel.persona.values);
  const channelLabels = readPersonaLabels(personaLabelFiles.channel);
  const channelSheet = formatAttributeSheet(channelValues, channelLabels);

  const conversation = await prisma.chatConversation.findFirst({
    where: { channelId: channel.id, kind: 'GROUP' },
    include: {
      groupPersona: true,
      members: {
        include: { contact: true },
        orderBy: { lastSeenAt: 'desc' },
        take: 6,
      },
    },
    orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
  });

  let groupSection = '';

  if (conversation?.groupPersona) {
    const groupValues = pickValues(conversation.groupPersona.values);
    groupSection = `\n## 当前群聊人格（群：${conversation.name}）\n${formatAttributeSheet(
      groupValues,
      readPersonaLabels(personaLabelFiles.group),
    )}\n`;
  }

  const memberNames = (conversation?.members ?? [])
    .filter((member) => !member.contact.isSelf)
    .map((member) => member.card?.trim() || member.contact.nickname)
    .filter(Boolean)
    .slice(0, 3);
  const sceneMembers = memberNames.length > 0 ? memberNames : ['群友甲', '群友乙'];

  const providers = await prisma.modelProvider.findMany({ orderBy: { createdAt: 'asc' } });
  const requestedProvider = process.env.TEST_PROVIDER?.trim();
  const provider =
    (requestedProvider ? providers.find((item) => item.name === requestedProvider) : null) ??
    providers.find((item) => readModels(item.models).length > 0);

  if (!provider) {
    throw new Error('尚未配置可用的模型提供商，请先在设置中完成添加。');
  }

  if (requestedProvider && provider.name !== requestedProvider) {
    console.warn(`未找到模型提供商「${requestedProvider}」，改用「${provider.name}」。`);
  }

  const models = readModels(provider.models);
  const model = pickModel(models);

  if (!model) {
    throw new Error(`模型提供商「${provider.name}」没有可用模型，请先重新测试连接。`);
  }

  const system = [
    '你是一个中文角色扮演对白生成器，用于验证人格设定在群聊中的表现。',
    '严格遵循角色人格与群聊人格中的全部设定：不 OOC，不突破边界，符合语气、口癖、作息与关系分寸。',
    '输出 8 到 12 行 QQ 群聊对白，每行格式为「昵称：内容」，可含少量括号动作描写。',
    '这是一段多人对话：其他成员负责抛话题、追问、打趣或附和，至少 4 行由其他成员说出；TA 的发言不超过 6 行，且不要连续超过 2 行。',
    '只输出对白本身，不要标题、解释、列表符号或 Markdown 代码块。',
  ].join('\n');

  const user = [
    '## 角色人格（全部属性）',
    channelSheet,
    groupSection,
    `## 场景
QQ 群「${conversation?.name ?? '测试群'}」，在场成员：${sceneMembers.join('、')} 以及 TA。
时间是晚上九点多，群里刚有人聊到今天的天气和晚饭。`,
    `## 任务
把「${channel.persona.name}」放进这个群的日常闲聊里。先由其他成员开启话题，TA 再按人格自然接话；对白内容随意，但要能体现上面的人格全属性。`,
  ]
    .filter(Boolean)
    .join('\n\n');

  console.log('■ 测试对象');
  console.log(`  渠道：${channel.displayName}（${channel.accountId}）· ${channel.status}`);
  console.log(`  角色：${channel.persona.name}（${channel.persona.cardSerial}）`);
  console.log(`  群聊：${conversation?.name ?? '无群聊，使用默认场景'}`);
  console.log(
    `  人格属性：渠道 ${Object.keys(channelValues).length} 项${
      conversation?.groupPersona
        ? ` + 群聊 ${Object.keys(pickValues(conversation.groupPersona.values)).length} 项`
        : ''
    }`,
  );
  console.log('■ 模型');
  console.log(
    `  提供商：${provider.name}（${provider.protocol} · ${provider.baseUrl} · ${maskKey(provider.apiKey)}）`,
  );
  console.log(`  模型：${model}`);
  console.log('■ 生成结果\n');

  const dialogue = await callProvider({ provider, model, system, user });

  if (!dialogue) {
    throw new Error('模型返回了空内容，请尝试更换模型。');
  }

  console.log(dialogue);
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
