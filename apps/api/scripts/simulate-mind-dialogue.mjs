#!/usr/bin/env node
/**
 * 只读心智对话试跑：用预制文本走真实的人格、状态、记忆和最近聊天，
 * 让规划模型真实生成回应，但不写运行轨迹、记忆、关系、待办、提示词日志或测试消息。
 *
 * 用法（仓库根目录）：
 *   pnpm --filter @inkseek/api test:mind
 *   pnpm --filter @inkseek/api test:mind -- --persona 余小满
 *   pnpm --filter @inkseek/api test:mind -- --file scripts/fixtures/mind-dialogue.txt
 *   pnpm --filter @inkseek/api test:mind -- --text "在吗？刚醒没"
 *
 * 会话默认取该渠道最近有消息的会话；每行预制文本视为一条用户消息，
 * 上一轮人格回复会作为临时上下文带回下一轮。
 *
 * 需要先构建（pnpm --filter @inkseek/api build），脚本直接复用 dist 中的心智模块。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

process.env.MIND_SCRIPT_CONTEXT = '1';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
for (const candidate of [resolve(repoRoot, '.env'), resolve(scriptDir, '../.env')]) {
  try {
    loadEnvFile(candidate);
    break;
  } catch {
    // Try the next candidate.
  }
}

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const texts = args.flatMap((arg, index) =>
  arg === '--text' && args[index + 1] ? [args[index + 1]] : [],
);
const personaArg = flag('--persona');
const conversationArg = flag('--conversation');
const senderArg = flag('--sender');
const fileArg = flag('--file');
const jsonMode = args.includes('--json');

const fixturePath = fileArg
  ? resolve(process.cwd(), fileArg)
  : resolve(scriptDir, 'fixtures/mind-dialogue.txt');

let lines;
if (texts.length > 0) {
  lines = texts;
} else {
  let raw;
  try {
    raw = readFileSync(fixturePath, 'utf8');
  } catch {
    console.error(`读不到预制文本：${fixturePath}`);
    process.exit(1);
  }
  lines = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

if (lines.length === 0) {
  console.error('预制文本为空：至少给一行用户消息。');
  process.exit(1);
}

await import('reflect-metadata');
const { Module } = await import('@nestjs/common');
const { ConfigModule } = await import('@nestjs/config');
const { NestFactory } = await import('@nestjs/core');
const { DatabaseModule } = await import('../dist/database/database.module.js');
const { SystemConfigModule } = await import('../dist/config/system-config.module.js');
const { PrismaService } = await import('../dist/database/prisma.service.js');
const { MindModule } = await import('../dist/mind/mind.module.js');
const { MindRuntimeService } = await import('../dist/mind/mind-runtime.service.js');

class RehearsalModule {}
Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(repoRoot, '.env'), resolve(scriptDir, '../.env')],
    }),
    DatabaseModule,
    SystemConfigModule,
    MindModule,
  ],
})(RehearsalModule);

const app = await NestFactory.createApplicationContext(RehearsalModule, {
  logger: ['error'],
});

try {
  const prisma = app.get(PrismaService);
  const runtime = app.get(MindRuntimeService);

  const personas = await prisma.chatChannelPersona.findMany({
    include: { channel: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const persona = personaArg
    ? personas.find((item) => item.id === personaArg || item.name === personaArg)
    : personas[0];
  if (!persona) {
    console.error(personaArg ? `找不到人格：${personaArg}` : '数据库里还没有渠道人格。');
    process.exit(1);
  }

  const conversation = conversationArg
    ? await prisma.chatConversation.findFirst({
        where: {
          channelId: persona.channelId,
          OR: [{ id: conversationArg }, { name: conversationArg }],
        },
      })
    : await prisma.chatConversation.findFirst({
        where: { channelId: persona.channelId },
        orderBy: { lastMessageAt: 'desc' },
      });
  if (!conversation) {
    console.error('这个渠道还没有可用会话，先收到一条真实消息再试跑。');
    process.exit(1);
  }

  const lastInbound = await prisma.chatMessageRecord.findFirst({
    where: { conversationId: conversation.id, isSelf: false },
    orderBy: { sentAt: 'desc' },
    include: { sender: true },
  });
  const senderName =
    senderArg || lastInbound?.sender?.nickname || lastInbound?.senderName || undefined;

  const audit = async () => {
    const [agentRun, agentStep, llmPromptLog, memory, message, heartbeat, todo, intention] =
      await Promise.all([
        prisma.agentRun.count(),
        prisma.agentStep.count(),
        prisma.llmPromptLog.count(),
        prisma.personaMemory.count(),
        prisma.chatMessageRecord.count(),
        prisma.mindHeartbeatLog.count(),
        prisma.agentTodo.count(),
        prisma.agentIntention.count(),
      ]);
    return { agentRun, agentStep, llmPromptLog, memory, message, heartbeat, todo, intention };
  };
  const before = await audit();

  console.log(
    `人格：${persona.name}（${persona.channel.displayName}）\n会话：${conversation.name}${senderName ? ` · 对方：${senderName}` : ''}\n预制文本：${lines.length} 条\n`,
  );

  const history = [];
  for (const [index, line] of lines.entries()) {
    const result = await runtime.simulate({
      personaId: persona.id,
      conversationId: conversation.id,
      text: line,
      senderName,
      history: [...history],
    });
    const text = result.plan.beats
      .filter((beat) => beat.kind === 'text' && typeof beat.text === 'string')
      .map((beat) => beat.text)
      .join('\n');
    const otherBeats =
      result.plan.beats.length - result.plan.beats.filter((beat) => beat.kind === 'text').length;

    console.log(`── 第 ${index + 1} 轮 ─────────────────────────────`);
    console.log(`用户：${line}`);
    if (result.plan.engage) {
      console.log(`人格：${text || `（${otherBeats} 个表情/其他表达）`}`);
    } else {
      console.log(`人格：（选择沉默）${result.plan.reason}`);
      if (text) {
        console.log(`草稿（不会发送）：${text}`);
      }
    }
    console.log(
      `判断：${result.decision.reason}\n模型：${result.model ?? '未知'} · ${result.latencyMs}ms · ${result.prompts.length} 次调用 · ${result.toolCalls.length} 次工具`,
    );
    for (const tool of result.toolCalls) {
      console.log(
        `  工具 ${tool.name}：${tool.error ? `失败 ${tool.error}` : tool.output?.blocked ? '试跑已拦截写入' : 'ok'}`,
      );
    }
    console.log('');

    history.push({ role: 'user', text: line });
    if (result.plan.engage && text) {
      history.push({ role: 'persona', text });
    }
    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    }
  }

  const after = await audit();
  const writable = [
    'agentRun',
    'llmPromptLog',
    'memory',
    'message',
    'heartbeat',
    'todo',
    'intention',
  ];
  const changed = writable.filter((key) => before[key] !== after[key]);
  if (changed.length > 0) {
    console.error(
      `警告：试跑期间这些表计数发生变化，请检查是否另有进程在写入：${changed.join('、')}`,
    );
    process.exitCode = 2;
  } else {
    console.log('只读校验：运行/提示词/记忆/消息/心跳/待办/意图计数均未变化，没有留下测试数据。');
  }
} finally {
  await app.close();
}
