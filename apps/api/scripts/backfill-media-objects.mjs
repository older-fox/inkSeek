#!/usr/bin/env node
/**
 * 把历史聊天图片回填到内容寻址的 ChatMediaObject：按 SHA-256 复制到
 * `ab/cd/ef/<hash>.<ext>`，写入对象行，并回填消息/转发图片的 mediaId 与本地 URL。
 * 幂等：只处理 mediaId 为空、且文件仍在磁盘上的本地图片；旧文件保留不删。
 *
 * 用法（仓库根目录）：
 *   pnpm --filter @inkseek/api build
 *   node apps/api/scripts/backfill-media-objects.mjs
 */
import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { ChatMediaService } from '../dist/chat/chat-media.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { CHAT_MEDIA_ROOT, CHAT_MEDIA_URL_PREFIX } from '../dist/chat/chat-paths.js';

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

const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

if (!process.env.DATABASE_URL?.trim()) {
  console.error('缺少 DATABASE_URL：请在仓库根目录 .env 中配置。');
  process.exit(1);
}

const prisma = new PrismaService({ get: (key) => process.env[key] });
const media = new ChatMediaService(prisma);
await prisma.$connect();
await media.onModuleInit();

const storedBySha = new Map();
const stats = {
  assets: await backfill('ChatImageAsset', prisma.chatImageAsset),
  forwardImages: await backfill('ChatForwardNodeImage', prisma.chatForwardNodeImage),
};

console.log('回填完成：');
console.log(`  ChatImageAsset      ${JSON.stringify(stats.assets)}`);
console.log(`  ChatForwardNodeImage ${JSON.stringify(stats.forwardImages)}`);
console.log(`  ChatMediaObject     共 ${await prisma.chatMediaObject.count()} 行`);

await prisma.$disconnect();

async function backfill(tableName, delegate) {
  const rows = await delegate.findMany({
    where: { mediaId: null },
    select: {
      id: true,
      url: true,
      mimeType: true,
      fileName: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const result = {
    rows: rows.length,
    linked: 0,
    reused: 0,
    missingFile: 0,
    remote: 0,
    unsupported: 0,
    failed: 0,
  };

  for (const row of rows) {
    const relative = relativePathOf(row.url);
    if (relative === null) {
      result.remote += 1;
      continue;
    }

    const filePath = resolve(CHAT_MEDIA_ROOT, ...relative.split('/'));
    if (!existsSync(filePath)) {
      result.missingFile += 1;
      continue;
    }

    const mimeType = imageMimeOf(row, relative);
    if (!mimeType) {
      result.unsupported += 1;
      continue;
    }

    try {
      const buffer = await readFile(filePath);
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      let stored = storedBySha.get(sha256);

      if (stored) {
        result.reused += 1;
      } else {
        stored = await media.saveDataUrl(
          `data:${mimeType};base64,${buffer.toString('base64')}`,
        );
        if (!stored?.mediaId) {
          result.failed += 1;
          console.warn(`${tableName} ${row.id} 写入媒体对象失败，跳过`);
          continue;
        }
        storedBySha.set(sha256, stored);
      }

      await delegate.update({
        where: { id: row.id },
        data: {
          mediaId: stored.mediaId,
          url: stored.url,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          width: stored.width,
          height: stored.height,
        },
      });
      result.linked += 1;
    } catch (error) {
      result.failed += 1;
      console.warn(
        `${tableName} ${row.id} 回填失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return result;
}

function relativePathOf(url) {
  if (typeof url !== 'string' || !url.startsWith(`${CHAT_MEDIA_URL_PREFIX}/`)) {
    return null;
  }

  try {
    return (
      decodeURIComponent(url.slice(CHAT_MEDIA_URL_PREFIX.length + 1).split('?')[0] ?? '') || null
    );
  } catch {
    return null;
  }
}

function imageMimeOf(row, relative) {
  const fromColumn = typeof row.mimeType === 'string' ? row.mimeType.toLowerCase() : '';
  if (fromColumn.startsWith('image/') && fromColumn !== 'image/svg+xml') {
    return fromColumn;
  }

  const extension = extname(row.fileName ?? relative)
    .replace('.', '')
    .toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? null;
}
