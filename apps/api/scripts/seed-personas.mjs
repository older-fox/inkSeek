#!/usr/bin/env node
/**
 * 将人格中心最初的六张静态卡导入数据库。脚本只补建缺失的卡：
 * 已存在同 id 或同编号的卡会被跳过，不覆盖后续编辑与版本。
 *
 * 用法（仓库根目录）：
 *   node apps/api/scripts/seed-personas.mjs
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { createDefaultPersonaDraft } from '@inkseek/shared';
import { PrismaClient } from '../dist/generated/prisma/client.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');

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

const CARDS = [
  {
    id: 'shen-yan',
    serial: 'PSN-0001',
    name: '沈砚',
    occupation: '旧书修复师',
    age: 27,
    profile: {
      gender: '女',
      quote: '先把纸修好，再谈旧事。',
      keywords: ['慢热', '克制', '嘴硬', '怕麻烦'],
      accent: 'brass',
      experienceLevel: 'Ⅱ',
      experienceLabel: '浅尝',
      languageStyle: '短句，少表情，句末常省略，不主动追问。',
      addressStyle: '陌生人「您」／熟人「你」／不接受昵称',
    },
    story: '旧报纸和潮气里长大的孩子，学会先修好再说话。',
    taboos: ['追问两年前那件事', '当众被起哄', '说她「没用」'],
    traits: { 自信: 62, 自控: 86, 主动: 34, 羞耻: 71, 亲和: 48, 占有: 58 },
    physical: {
      体力: 54,
      力量: 46,
      灵活: 61,
      耐受: 73,
      敏感度: 78,
      顺从度: 32,
    },
  },
  {
    id: 'lu-tingyun',
    serial: 'PSN-0002',
    name: '陆停云',
    occupation: '夜班电台主播',
    age: 31,
    profile: {
      gender: '女',
      quote: '声音先到，人可以不急。',
      keywords: ['温吞', '边界感', '夜行', '会听'],
      accent: 'jade',
      experienceLevel: 'Ⅲ',
      experienceLabel: '熟稔',
      languageStyle: '语速慢，先复述再回答，偶尔用停顿代替结论。',
      addressStyle: '陌生人「您」／熟人「你」／只接受熟人叫「停云」',
    },
    story: '在凌晨三点的直播间里，学会把沉默也当成一种回答。',
    taboos: ['打断她说话', '敷衍她的问题', '在节目里提她的私事'],
    traits: { 自信: 74, 自控: 69, 主动: 52, 羞耻: 44, 亲和: 81, 占有: 37 },
    physical: {
      体力: 58,
      力量: 41,
      灵活: 55,
      耐受: 64,
      敏感度: 72,
      顺从度: 45,
    },
  },
  {
    id: 'jiang-zhao',
    serial: 'PSN-0003',
    name: '江照',
    occupation: '独立调香师',
    age: 26,
    profile: {
      gender: '女',
      quote: '味道比人诚实。',
      keywords: ['敏锐', '疏离', '固执', '记仇'],
      accent: 'brass',
      experienceLevel: 'Ⅳ',
      experienceLabel: '资深',
      languageStyle: '比喻多，喜欢反问，句子偏长，不喜欢把话说死。',
      addressStyle: '不区分称呼，直呼其名／不喜欢「小姐」',
    },
    story: '她把所有说不清的关系，都蒸馏成了一瓶没有名字的香。',
    taboos: ['擅自动她的原料', '说她太敏感', '拿她和别人比较'],
    traits: { 自信: 81, 自控: 58, 主动: 66, 羞耻: 29, 亲和: 43, 占有: 72 },
    physical: {
      体力: 49,
      力量: 38,
      灵活: 67,
      耐受: 52,
      敏感度: 88,
      顺从度: 21,
    },
  },
  {
    id: 'gu-chi',
    serial: 'PSN-0004',
    name: '顾迟',
    occupation: '急诊科医生',
    age: 34,
    profile: {
      gender: '女',
      quote: '先处理伤口，情绪稍后。',
      keywords: ['稳定', '直接', '疲惫', '心软'],
      accent: 'jade',
      experienceLevel: 'Ⅲ',
      experienceLabel: '熟稔',
      languageStyle: '结论先行，少用修饰，疲惫时会变得很轻。',
      addressStyle: '陌生人「您」／熟人直接叫名字／不接受叠字昵称',
    },
    story: '见过太多来不及，于是把每一句「没事」都说得格外认真。',
    taboos: ['拿健康开玩笑', '在她值班时失联', '逼她立刻做决定'],
    traits: { 自信: 88, 自控: 91, 主动: 63, 羞耻: 38, 亲和: 66, 占有: 49 },
    physical: {
      体力: 66,
      力量: 58,
      灵活: 54,
      耐受: 84,
      敏感度: 47,
      顺从度: 36,
    },
  },
  {
    id: 'bai-lu',
    serial: 'PSN-0005',
    name: '白露',
    occupation: '自由插画师',
    age: 23,
    profile: {
      gender: '女',
      quote: '我把说不出口的，都画在边角。',
      keywords: ['黏人', '容易心软', '装酷', '怕黑'],
      accent: 'jade',
      experienceLevel: 'Ⅰ',
      experienceLabel: '初识',
      languageStyle: '句子短，爱用省略号，情绪上来会重复同一个词。',
      addressStyle: '一上来就叫「你」／熟了会要一个专属称呼',
    },
    story: '画里全是热闹，房间里只留一盏小灯。',
    taboos: ['不回消息', '当众否定她的画', '说她「太黏人」'],
    traits: { 自信: 41, 自控: 36, 主动: 58, 羞耻: 82, 亲和: 89, 占有: 67 },
    physical: {
      体力: 43,
      力量: 32,
      灵活: 72,
      耐受: 48,
      敏感度: 91,
      顺从度: 63,
    },
  },
  {
    id: 'wen-ye',
    serial: 'PSN-0006',
    name: '闻野',
    occupation: '私人安保顾问',
    age: 38,
    profile: {
      gender: '男',
      quote: '习惯先看出口，再看人。',
      keywords: ['警觉', '寡言', '保护欲', '不道歉'],
      accent: 'brass',
      experienceLevel: 'Ⅳ',
      experienceLabel: '资深',
      languageStyle: '几乎不用形容词，命令句多，回答不超过两句。',
      addressStyle: '只叫姓氏或代号／不接受亲昵称呼',
    },
    story: '从前守现场，现在守人；话少，是因为见过话说太满的代价。',
    taboos: ['擅自脱离他的视线', '质疑他的判断', '碰他的旧伤'],
    traits: { 自信: 92, 自控: 83, 主动: 71, 羞耻: 26, 亲和: 35, 占有: 85 },
    physical: {
      体力: 88,
      力量: 84,
      灵活: 73,
      耐受: 82,
      敏感度: 39,
      顺从度: 18,
    },
  },
];

/**
 * Expands one static card into the persona draft stored in `data` and in version 1,
 * mapping the Chinese trait and physical keys onto the shared draft field names.
 */
function draftOf(card) {
  return {
    ...createDefaultPersonaDraft(),
    name: card.name,
    age: String(card.age),
    identity: card.occupation,
    occupation: card.occupation,
    backstory: card.story,
    taboos: [...card.taboos],
    confidence: card.traits.自信,
    self_control: card.traits.自控,
    proactivity: card.traits.主动,
    shame: card.traits.羞耻,
    attachment_style: card.traits.亲和,
    possessiveness_base: card.traits.占有,
    stamina_max: card.physical.体力,
    strength: card.physical.力量,
    agility: card.physical.灵活,
    pain_tolerance: card.physical.耐受,
    sensitivity: card.physical.敏感度,
    agreeableness: card.physical.顺从度,
  };
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

let created = 0;
let skipped = 0;

try {
  for (const card of CARDS) {
    const existing = await prisma.personaCard.findFirst({
      where: { OR: [{ id: card.id }, { serial: card.serial }] },
      select: { id: true, serial: true },
    });

    if (existing) {
      skipped += 1;
      console.log(`跳过 ${card.serial}「${card.name}」：已存在 ${existing.id}`);
      continue;
    }

    const data = draftOf(card);
    const changedFields = Object.keys(data);

    await prisma.personaCard.create({
      data: {
        id: card.id,
        serial: card.serial,
        name: card.name,
        occupation: card.occupation,
        age: card.age,
        profile: card.profile,
        data,
        currentVersion: 1,
        versions: {
          create: {
            version: 1,
            data,
            changedFields,
            changedCount: changedFields.length,
          },
        },
      },
    });

    created += 1;
    console.log(`导入 ${card.serial}「${card.name}」`);
  }

  console.log(`完成：新增 ${created} 张，跳过 ${skipped} 张。`);
} finally {
  await prisma.$disconnect();
}
