import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import type { StickerImageCandidate, StickerImportInput, StickerRecord } from '@inkseek/shared';
import { LlmService } from '../ai/llm.service.js';
import {
  CHAT_MEDIA_ROOT,
  CHAT_MEDIA_URL_PREFIX,
  CHAT_STICKER_ROOT,
} from '../chat/chat-paths.js';
import { PrismaService } from '../database/prisma.service.js';
import type { ChatMediaObject, StickerAsset } from '../generated/prisma/client.js';
import { embedText, cosineSimilarity } from './mind-vector.js';

const STICKER_ROOT = CHAT_STICKER_ROOT;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
const MAX_DATA_URL_BYTES = 12_000_000;

@Injectable()
export class StickerService implements OnModuleInit {
  private readonly logger = new Logger(StickerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async onModuleInit(): Promise<void> {
    await mkdir(STICKER_ROOT, { recursive: true }).catch(() => undefined);
  }

  async scan(describe = false): Promise<{ scanned: number; created: number; described: number }> {
    const files = await this.listFiles(STICKER_ROOT);
    let created = 0;
    let described = 0;
    for (const absolutePath of files) {
      const extension = extname(absolutePath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) {
        continue;
      }
      const buffer = await readFile(absolutePath);
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const filePath = relative(STICKER_ROOT, absolutePath).split('\\').join('/');
      const existing = await this.prisma.stickerAsset.findUnique({ where: { sha256 } });
      const tags = filenameTags(filePath);
      let description = existing?.description ?? '';
      if (describe && !description) {
        description = await this.describeImage(buffer, mimeForExtension(extension)).catch(() => '');
        if (description) described += 1;
      }
      const embedding = embedText([description, ...tags].filter(Boolean).join('\n'));
      await this.prisma.stickerAsset.upsert({
        where: { sha256 },
        create: {
          sha256,
          filePath,
          mimeType: mimeForExtension(extension),
          byteSize: buffer.byteLength,
          tags,
          description,
          embedding,
        },
        update: {
          filePath,
          mimeType: mimeForExtension(extension),
          byteSize: buffer.byteLength,
          tags,
          description,
          embedding,
        },
      });
      if (!existing) created += 1;
    }
    return { scanned: files.length, created, described };
  }

  async list(): Promise<StickerRecord[]> {
    const rows = await this.prisma.stickerAsset.findMany({
      where: { enabled: true },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return rows.map(toRecord);
  }

  async recentImages(channelId: string, limit = 48): Promise<StickerImageCandidate[]> {
    const messages = await this.prisma.chatMessageRecord.findMany({
      where: { channelId, isSelf: false, images: { some: {} } },
      orderBy: { sentAt: 'desc' },
      take: Math.max(limit, 24) * 3,
      include: {
        images: { include: { media: true }, orderBy: { position: 'asc' } },
      },
    });
    const seen = new Set<string>();
    const entries: { candidate: StickerImageCandidate; sha256: string }[] = [];
    for (const message of messages) {
      for (const image of message.images) {
        if (!image.media || seen.has(image.media.sha256)) {
          continue;
        }
        seen.add(image.media.sha256);
        entries.push({
          sha256: image.media.sha256,
          candidate: {
            id: image.id,
            mediaId: image.media.id,
            url: image.url,
            width: image.width ?? image.media.width,
            height: image.height ?? image.media.height,
            mimeType: image.mimeType ?? image.media.mimeType,
            description: image.media.description,
            author: message.isSelf ? '我' : message.senderName,
            sentAt: message.sentAt.toISOString(),
            collected: false,
          },
        });
        if (entries.length >= limit) {
          break;
        }
      }
      if (entries.length >= limit) {
        break;
      }
    }
    const hashes = await this.prisma.stickerAsset.findMany({
      where: { sha256: { in: [...seen] } },
      select: { sha256: true },
    });
    const collected = new Set(hashes.map((row) => row.sha256));
    return entries.map((entry) => ({
      ...entry.candidate,
      collected: collected.has(entry.sha256),
    }));
  }

  async importFromReceived(input: StickerImportInput): Promise<StickerRecord> {
    const media = await this.findReceivedMedia(input.mediaId, input.imageUrl);
    if (!media) {
      throw new NotFoundException({ code: 'IMAGE_NOT_FOUND', message: '找不到这张图片' });
    }
    const source = resolve(CHAT_MEDIA_ROOT, ...media.storagePath.split('/'));
    if (!source.startsWith(resolve(CHAT_MEDIA_ROOT))) {
      throw new NotFoundException({ code: 'IMAGE_NOT_FOUND', message: '图片路径非法' });
    }
    let buffer: Buffer;
    try {
      buffer = await readFile(source);
    } catch {
      throw new NotFoundException({ code: 'IMAGE_NOT_FOUND', message: '图片文件已被清理' });
    }
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const extension = (extname(media.storagePath) || '.png').toLowerCase();
    const mimeType = media.mimeType ?? mimeForExtension(extension);
    let description = (media.description ?? '').trim().slice(0, 200);
    if (!description && input.describe) {
      description = await this.describeImage(buffer, mimeType).catch(() => '');
    }
    const tags = (input.tags ?? [])
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
    const filePath = `received/${sha256.slice(0, 2)}/${sha256}${extension}`;
    const target = resolve(STICKER_ROOT, ...filePath.split('/'));
    if (!(await exists(target))) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, buffer);
    }
    const embedding = embedText([description, ...tags].filter(Boolean).join('\n'));
    const row = await this.prisma.stickerAsset.upsert({
      where: { sha256 },
      create: {
        sha256,
        filePath,
        mimeType,
        byteSize: buffer.byteLength,
        width: media.width,
        height: media.height,
        tags,
        description,
        embedding,
      },
      update: {
        filePath,
        mimeType,
        byteSize: buffer.byteLength,
        width: media.width,
        height: media.height,
        tags,
        description,
        embedding,
        enabled: true,
      },
    });
    return toRecord(row);
  }

  private async findReceivedMedia(
    mediaId: string | undefined,
    imageUrl: string | undefined,
  ): Promise<ChatMediaObject | null> {
    if (mediaId) {
      const media = await this.prisma.chatMediaObject.findUnique({ where: { id: mediaId } });
      if (media) {
        return media;
      }
    }
    const url = (imageUrl ?? '').trim();
    if (!url) {
      return null;
    }
    const asset = await this.prisma.chatImageAsset.findFirst({
      where: { url },
      include: { media: true },
    });
    if (asset?.media) {
      return asset.media;
    }
    if (!url.startsWith(`${CHAT_MEDIA_URL_PREFIX}/`)) {
      return null;
    }
    const encoded = url.slice(CHAT_MEDIA_URL_PREFIX.length + 1).split('?')[0] ?? '';
    let storagePath: string;
    try {
      storagePath = decodeURIComponent(encoded);
    } catch {
      return null;
    }
    if (!/^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}\.[a-z0-9]+$/.test(storagePath)) {
      return null;
    }
    return this.prisma.chatMediaObject.findFirst({ where: { storagePath } });
  }

  async search(query: string, limit = 5): Promise<StickerRecord[]> {
    const rows = await this.prisma.stickerAsset.findMany({
      where: { enabled: true },
      take: 500,
    });
    if (rows.length === 0) {
      return [];
    }
    const embedding = embedText(query);
    return rows
      .map((row) => ({
        row,
        score: cosineSimilarity(embedding, row.embedding),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .filter((entry) => entry.score > 0.02)
      .map((entry) => ({ ...toRecord(entry.row), score: Math.round(entry.score * 1000) / 1000 }));
  }

  async get(id: string): Promise<StickerRecord> {
    const row = await this.prisma.stickerAsset.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ code: 'STICKER_NOT_FOUND', message: '表情不存在' });
    }
    return toRecord(row);
  }

  /**
   * Re-run vision on a stored sticker and persist the fresh description.
   * The embedding is rebuilt so retrieval follows the new wording.
   */
  async review(id: string, focus?: string): Promise<StickerRecord> {
    const row = await this.prisma.stickerAsset.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ code: 'STICKER_NOT_FOUND', message: '表情不存在' });
    }
    const absolute = resolve(STICKER_ROOT, row.filePath);
    if (!absolute.startsWith(resolve(STICKER_ROOT))) {
      throw new NotFoundException({ code: 'STICKER_NOT_FOUND', message: '表情路径非法' });
    }
    const info = await stat(absolute).catch(() => null);
    if (!info) {
      throw new NotFoundException({ code: 'STICKER_NOT_FOUND', message: '表情文件已被清理' });
    }
    if (info.size > MAX_DATA_URL_BYTES) {
      throw new NotFoundException({ code: 'STICKER_TOO_LARGE', message: '表情文件过大' });
    }
    const buffer = await readFile(absolute);
    const mimeType = row.mimeType ?? mimeForExtension(extname(row.filePath));
    const description = await this.describeImage(buffer, mimeType, focus);
    if (!description) {
      throw new Error('视觉模型没有返回描述，表情库未更新');
    }
    const embedding = embedText([description, ...row.tags].filter(Boolean).join('\n'));
    const updated = await this.prisma.stickerAsset.update({
      where: { id },
      data: { description, embedding },
    });
    return toRecord(updated);
  }

  async toDataUrl(id: string): Promise<string> {
    const row = await this.prisma.stickerAsset.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ code: 'STICKER_NOT_FOUND', message: '表情不存在' });
    }
    const absolute = resolve(STICKER_ROOT, row.filePath);
    if (!absolute.startsWith(resolve(STICKER_ROOT))) {
      throw new NotFoundException({ code: 'STICKER_NOT_FOUND', message: '表情路径非法' });
    }
    const info = await stat(absolute);
    if (info.size > MAX_DATA_URL_BYTES) {
      throw new NotFoundException({ code: 'STICKER_TOO_LARGE', message: '表情文件过大' });
    }
    const buffer = await readFile(absolute);
    return `data:${row.mimeType ?? 'image/png'};base64,${buffer.toString('base64')}`;
  }

  async recordUsage(id: string): Promise<void> {
    await this.prisma.stickerAsset.updateMany({
      where: { id },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }

  private async listFiles(root: string): Promise<string[]> {
    const files: string[] = [];
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return files;
    }
    for (const entry of entries) {
      const absolute = join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.listFiles(absolute)));
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
    return files;
  }

  private async describeImage(buffer: Buffer, mimeType: string, focus?: string): Promise<string> {
    const prompt = focus
      ? `重新观察这个表情包，重点确认：${focus}。用一句简短中文描述它的内容、情绪和使用场景。只输出描述，不要解释。`
      : '用一句简短中文描述这个表情包的内容、情绪和使用场景。只输出描述，不要解释。';
    const completion = await this.llm.complete({
      prompt,
      system: '你是表情包标注器，输出一行中文。',
      images: [{ mimeType, base64: buffer.toString('base64') }],
      temperature: 0.2,
      maxTokens: 100,
      source: 'mind.sticker',
    });
    return completion.text.trim().slice(0, 200);
  }
}

function filenameTags(filePath: string): string[] {  const base = filePath.replace(/\.[^.]+$/, '');
  return base
    .split(/[\\/_\-\s.]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 12);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function mimeForExtension(extension: string): string {  switch (extension) {
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'image/jpeg';
  }
}

function toRecord(row: StickerAsset): StickerRecord {
  return {
    id: row.id,
    sha256: row.sha256,
    filePath: row.filePath,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    tags: row.tags,
    description: row.description,
    scope: row.scope,
    enabled: row.enabled,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
