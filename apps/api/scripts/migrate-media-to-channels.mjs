#!/usr/bin/env node
/**
 * 一次性迁移：把旧的共享媒体目录复制到按渠道隔离的
 * `data/chat/channels/<channelId>/{images,voices,stickers}`，并重写数据库里的
 * 本地媒体 URL（图片/语音资产、转发节点、消息引用快照与归档消息段）。
 *
 * 迁移前会把相关表转储到 data/backup/media-channels-<timestamp>/tables.json。
 * 旧目录只复制不删除；脚本幂等，可重复执行。
 *
 * 用法（仓库根目录）：
 *   pnpm --filter @inkseek/api build
 *   node apps/api/scripts/migrate-media-to-channels.mjs
 */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { PrismaService } from '../dist/database/prisma.service.js';
import {
  CHAT_CHANNEL_ROOT,
  CHAT_MEDIA_ROOT,
  CHAT_STICKER_ROOT,
  CHAT_VOICE_ROOT,
  channelMediaPath,
  channelMediaUrl,
  splitChannelMediaUrl,
} from '../dist/chat/chat-paths.js';

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

if (!process.env.DATABASE_URL?.trim()) {
  console.error('缺少 DATABASE_URL：请在仓库根目录 .env 中配置。');
  process.exit(1);
}

const LEGACY_IMAGE_PREFIX = '/api/v1/media/images/';
const LEGACY_VOICE_PREFIX = '/api/v1/media/voices/';
const HASH_PATH = /^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}\.[a-z0-9]+$/;
const STICKER_PATH = /^received\/[0-9a-f]{2}\/[0-9a-f]{64}\.[a-z0-9]+$/;

const prisma = new PrismaService({ get: (key) => process.env[key] });
await prisma.$connect();
await mkdir(CHAT_CHANNEL_ROOT, { recursive: true });
await backupTables();

const stats = {
  images: await migrateAssets('ChatImageAsset', prisma.chatImageAsset, 'images'),
  forwardImages: await migrateForwardAssets(),
  voices: await migrateAssets('ChatVoiceAsset', prisma.chatVoiceAsset, 'voices'),
  stickers: await migrateStickers(),
  messages: await migrateJsonColumn(prisma.chatMessageRecord, '聊天消息'),
  forwardNodes: await migrateJsonColumn(prisma.chatForwardNode, '转发节点'),
};

const verification = await verify();
console.log('迁移完成：');
for (const [key, value] of Object.entries(stats)) {
  console.log(`  ${key.padEnd(14)} ${JSON.stringify(value)}`);
}
console.log('校验：', JSON.stringify(verification, null, 2));

await prisma.$disconnect();
process.exit(verification.problems.length > 0 ? 1 : 0);

/**
 * Moves one media table onto per-channel storage: copies the blob, then points
 * url/fileName at the channel-scoped location. Remote URLs and orphans are
 * counted, not migrated.
 */
async function migrateAssets(tableName, delegate, kind) {
  const prefix = kind === 'images' ? LEGACY_IMAGE_PREFIX : LEGACY_VOICE_PREFIX;
  const rows = await delegate.findMany({
    select: {
      id: true,
      url: true,
      fileName: true,
      message: { select: { channelId: true } },
    },
  });
  const result = { rows: rows.length, copied: 0, updated: 0, missing: 0, remote: 0 };
  for (const row of rows) {
    const channelId = row.message?.channelId;
    if (!channelId) {
      result.missing += 1;
      continue;
    }
    const migrated = splitChannelMediaUrl(row.url);
    const relative = migrated?.kind === kind
      ? migrated.storagePath
      : hashPathOf(row.fileName, prefix, row.url);
    if (!relative) {
      result.remote += 1;
      continue;
    }
    const copy = await ensureChannelCopy(channelId, kind, relative);
    if (copy === 'missing') {
      result.missing += 1;
      continue;
    }
    if (copy === 'copied') {
      result.copied += 1;
    }
    const url = channelMediaUrl(channelId, kind, relative);
    if (row.url !== url || row.fileName !== relative) {
      await delegate.update({
        where: { id: row.id },
        data: { url, fileName: relative },
      });
      result.updated += 1;
    }
  }
  return result;
}

/** Same migration for forwarded nodes, whose channel lives two relations away. */
async function migrateForwardAssets() {
  const result = { images: { rows: 0, copied: 0, updated: 0, missing: 0, remote: 0 }, voices: { rows: 0, copied: 0, updated: 0, missing: 0, remote: 0 } };
  for (const [kind, delegate, includeKey] of [
    ['images', prisma.chatForwardNodeImage, 'images'],
    ['voices', prisma.chatForwardNodeVoice, 'voices'],
  ]) {
    const rows = await delegate.findMany({
      select: {
        id: true,
        url: true,
        fileName: true,
        node: {
          select: {
            forward: { select: { message: { select: { channelId: true } } } },
          },
        },
      },
    });
    result[includeKey].rows = rows.length;
    const prefix = kind === 'images' ? LEGACY_IMAGE_PREFIX : LEGACY_VOICE_PREFIX;
    for (const row of rows) {
      const channelId = row.node?.forward?.message?.channelId;
      if (!channelId) {
        result[includeKey].missing += 1;
        continue;
      }
      const migrated = splitChannelMediaUrl(row.url);
      const relative = migrated?.kind === kind
        ? migrated.storagePath
        : hashPathOf(row.fileName, prefix, row.url);
      if (!relative) {
        result[includeKey].remote += 1;
        continue;
      }
      const copy = await ensureChannelCopy(channelId, kind, relative);
      if (copy === 'missing') {
        result[includeKey].missing += 1;
        continue;
      }
      if (copy === 'copied') {
        result[includeKey].copied += 1;
      }
      const url = channelMediaUrl(channelId, kind, relative);
      if (row.url !== url || row.fileName !== relative) {
        await delegate.update({ where: { id: row.id }, data: { url, fileName: relative } });
        result[includeKey].updated += 1;
      }
    }
  }
  return result;
}

/** Stickers already carry their channel, so only the blob copy needs migrating. */
async function migrateStickers() {
  const rows = await prisma.stickerAsset.findMany({
    select: { id: true, channelId: true, filePath: true },
  });
  const result = { rows: rows.length, copied: 0, missing: 0, invalid: 0 };
  for (const row of rows) {
    if (!STICKER_PATH.test(row.filePath)) {
      result.invalid += 1;
      continue;
    }
    const copy = await ensureChannelCopy(row.channelId, 'stickers', row.filePath);
    if (copy === 'copied') {
      result.copied += 1;
    }
    if (copy === 'missing') {
      result.missing += 1;
    }
  }
  return result;
}

/** Rewrites legacy local URLs inside archived JSON columns for one channel. */
async function migrateJsonColumn(delegate, label) {
  const includeChannel = label === '聊天消息';
  const rows = await delegate.findMany({
    select: includeChannel
      ? { id: true, channelId: true, segments: true, replySnapshot: true }
      : {
          id: true,
          segments: true,
          forward: { select: { message: { select: { channelId: true } } } },
        },
  });
  const result = { rows: rows.length, updated: 0, rewritten: 0 };
  for (const row of rows) {
    const channelId = includeChannel ? row.channelId : row.forward?.message?.channelId;
    if (!channelId) {
      continue;
    }
    const data = {};
    const copies = [];
    let rewritten = 0;
    for (const field of includeChannel ? ['segments', 'replySnapshot'] : ['segments']) {
      const { value, count } = rewriteLocalUrls(row[field], channelId, copies);
      data[field] = value;
      rewritten += count;
    }
    if (rewritten > 0) {
      for (const copy of copies) {
        if (!existsSync(copy.target) && existsSync(copy.source)) {
          await mkdir(dirname(copy.target), { recursive: true });
          await copyFile(copy.source, copy.target);
        }
      }
      await delegate.update({ where: { id: row.id }, data });
      result.updated += 1;
      result.rewritten += rewritten;
    }
  }
  return result;
}

/**
 * Walks an archived JSON tree, rewriting every legacy local URL it finds.
 * Returns the original reference when nothing changed so Prisma can skip the write.
 */
function rewriteLocalUrls(value, channelId, copies, depth = 0) {
  if (depth > 12 || value === null || value === undefined) {
    return { value, count: 0 };
  }
  if (typeof value === 'string') {
    const rewritten = rewriteLocalUrl(value, channelId, copies);
    return rewritten === value
      ? { value, count: 0 }
      : { value: rewritten, count: 1 };
  }
  if (Array.isArray(value)) {
    let count = 0;
    const next = value.map((item) => {
      const result = rewriteLocalUrls(item, channelId, copies, depth + 1);
      count += result.count;
      return result.value;
    });
    return { value: count > 0 ? next : value, count };
  }
  if (typeof value === 'object') {
    let count = 0;
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      const result = rewriteLocalUrls(item, channelId, copies, depth + 1);
      count += result.count;
      next[key] = result.value;
    }
    return { value: count > 0 ? next : value, count };
  }
  return { value, count: 0 };
}

/**
 * Rewrites one URL string: hash paths move straight to the channel prefix,
 * pre-hash flat files get queued as copies under `legacy/`, and strings that
 * embed a whole JSON document are parsed and rewritten recursively.
 */
function rewriteLocalUrl(value, channelId, copies) {
  if (value.startsWith(LEGACY_IMAGE_PREFIX) || value.startsWith(LEGACY_VOICE_PREFIX)) {
    const kind = value.startsWith(LEGACY_IMAGE_PREFIX) ? 'images' : 'voices';
    const prefix = kind === 'images' ? LEGACY_IMAGE_PREFIX : LEGACY_VOICE_PREFIX;
    try {
      const relative = decodeURIComponent(value.slice(prefix.length).split('?')[0] ?? '');
      if (HASH_PATH.test(relative)) {
        return channelMediaUrl(channelId, kind, relative);
      }
      // Pre-hash flat files only survive inside archived message segments; move
      // them under `legacy/` so no channel reference points at the shared root.
      const name = relative.split('/').pop() ?? '';
      if (/^[a-z0-9][a-z0-9._-]*$/i.test(name) && !HASH_PATH.test(relative)) {
        const targetRelative = `legacy/${name}`;
        const source = legacyPath(kind, name);
        if (source) {
          copies.push({
            source,
            target: channelMediaPath(channelId, kind, targetRelative),
          });
        }
        return channelMediaUrl(channelId, kind, targetRelative);
      }
    } catch {
      return value;
    }
  }
  // Some cards carry a JSON document as a plain string; rewrite inside it too.
  if (value.includes(LEGACY_IMAGE_PREFIX) || value.includes(LEGACY_VOICE_PREFIX)) {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = rewriteLocalUrls(JSON.parse(value), channelId, copies);
        if (parsed.count > 0) {
          return JSON.stringify(parsed.value);
        }
      } catch {
        return value;
      }
    }
  }
  return value;
}

/** Returns `present` (already there), `copied`, or `missing` (no source bytes). */
async function ensureChannelCopy(channelId, kind, relative) {
  const target = channelMediaPath(channelId, kind, relative);
  if (existsSync(target)) {
    return 'present';
  }
  const source = legacyPath(kind, relative);
  if (!source || !existsSync(source)) {
    return 'missing';
  }
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  return 'copied';
}

/** Resolves a relative path under the old shared root; unknown kinds have no legacy home. */
function legacyPath(kind, relative) {
  if (kind === 'images') {
    return resolve(CHAT_MEDIA_ROOT, ...relative.split('/'));
  }
  if (kind === 'voices') {
    return resolve(CHAT_VOICE_ROOT, ...relative.split('/'));
  }
  if (kind === 'stickers') {
    return resolve(CHAT_STICKER_ROOT, ...relative.split('/'));
  }
  return null;
}

/** Finds the content-hash storage path from fileName first, then from the legacy URL. */
function hashPathOf(fileName, legacyPrefix, url) {
  if (typeof fileName === 'string' && HASH_PATH.test(fileName)) {
    return fileName;
  }
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw.startsWith(legacyPrefix)) {
    return null;
  }
  try {
    const relative = decodeURIComponent(raw.slice(legacyPrefix.length).split('?')[0] ?? '');
    return HASH_PATH.test(relative) ? relative : null;
  } catch {
    return null;
  }
}

/** Snapshots every affected table to data/backup before any rewrite runs. */
async function backupTables() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = resolve(repoRoot, 'data/backup', `media-channels-${stamp}`);
  const tables = {
    chatImageAsset: await prisma.chatImageAsset.findMany(),
    chatVoiceAsset: await prisma.chatVoiceAsset.findMany(),
    chatForwardNodeImage: await prisma.chatForwardNodeImage.findMany(),
    chatForwardNodeVoice: await prisma.chatForwardNodeVoice.findMany(),
    stickerAsset: await prisma.stickerAsset.findMany(),
    chatMediaObject: await prisma.chatMediaObject.findMany(),
    chatMessageRecord: await prisma.chatMessageRecord.findMany({
      select: { id: true, channelId: true, segments: true, replySnapshot: true },
    }),
    chatForwardNode: await prisma.chatForwardNode.findMany({
      select: { id: true, segments: true },
    }),
  };
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, 'tables.json');
  await writeFile(file, JSON.stringify(tables, null, 2));
  console.log(`已备份相关表：${file}`);
}

/** Post-run audit: every local row must point at its channel's own existing file. */
async function verify() {
  const problems = [];
  let checked = 0;
  const checks = [
    [
      'ChatImageAsset',
      await prisma.chatImageAsset.findMany({
        select: { id: true, url: true, message: { select: { channelId: true } } },
      }),
      'images',
    ],
    [
      'ChatVoiceAsset',
      await prisma.chatVoiceAsset.findMany({
        select: { id: true, url: true, message: { select: { channelId: true } } },
      }),
      'voices',
    ],
  ];
  for (const [table, rows, kind] of checks) {
    for (const row of rows) {
      const parsed = splitChannelMediaUrl(row.url);
      if (!parsed || parsed.kind !== kind) {
        if (row.url?.startsWith('/api/v1/media/')) {
          problems.push(`${table} ${row.id} 仍是旧 URL：${row.url}`);
        }
        continue;
      }
      checked += 1;
      if (parsed.channelId !== row.message?.channelId) {
        problems.push(`${table} ${row.id} 渠道不匹配：${parsed.channelId} != ${row.message?.channelId}`);
      }
      const file = channelMediaPath(parsed.channelId, kind, parsed.storagePath);
      if (!existsSync(file)) {
        problems.push(`${table} ${row.id} 文件缺失：${file}`);
      }
    }
  }
  const stickers = await prisma.stickerAsset.findMany({
    select: { id: true, channelId: true, filePath: true },
  });
  for (const row of stickers) {
    if (!STICKER_PATH.test(row.filePath)) {
      problems.push(`StickerAsset ${row.id} 路径非法：${row.filePath}`);
      continue;
    }
    if (!existsSync(channelMediaPath(row.channelId, 'stickers', row.filePath))) {
      problems.push(`StickerAsset ${row.id} 文件缺失`);
    }
  }
  return { checked, problems };
}
