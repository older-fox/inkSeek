import { Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import type { StickerRecord } from '@inkseek/shared';
import { LlmService } from '../ai/llm.service.js';
import { CHAT_MEDIA_ROOT, CHAT_MEDIA_URL_PREFIX, CHAT_STICKER_ROOT } from '../chat/chat-paths.js';
import { PrismaService } from '../database/prisma.service.js';
import type { ChatMediaObject, StickerAsset } from '../generated/prisma/client.js';
import { embedText, cosineSimilarity } from './mind-vector.js';

const STICKER_ROOT = CHAT_STICKER_ROOT;
const MAX_DATA_URL_BYTES = 12_000_000;

export interface StickerCollectInput {
  imageUrl?: string;
  mediaId?: string;
  tags?: string[];
  describe?: boolean;
}

@Injectable()
export class StickerService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async onModuleInit(): Promise<void> {
    await mkdir(STICKER_ROOT, { recursive: true }).catch(() => undefined);
  }

  async list(channelId: string): Promise<StickerRecord[]> {
    const rows = await this.prisma.stickerAsset.findMany({
      where: { channelId, enabled: true },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return rows.map(toRecord);
  }

  async importFromReceived(
    input: StickerCollectInput,
    channelId: string,
  ): Promise<StickerRecord> {
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
      where: { channelId_sha256: { channelId, sha256 } },
      create: {
        channelId,
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

  async search(query: string, channelId: string, limit = 5): Promise<StickerRecord[]> {
    const rows = await this.prisma.stickerAsset.findMany({
      where: { channelId, enabled: true },
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

  /**
   * Re-run vision on a stored sticker and persist the fresh description.
   * The embedding is rebuilt so retrieval follows the new wording.
   */
  async review(id: string, channelId: string, focus?: string): Promise<StickerRecord> {
    const row = await this.prisma.stickerAsset.findFirst({ where: { id, channelId } });
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
      where: { id: row.id },
      data: { description, embedding },
    });
    return toRecord(updated);
  }

  async toDataUrl(id: string, channelId: string): Promise<string> {
    const row = await this.prisma.stickerAsset.findFirst({ where: { id, channelId } });
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

  /** Keeps the sent sticker meaningful in later chat context. */
  async descriptionOf(id: string, channelId: string): Promise<string> {
    const row = await this.prisma.stickerAsset.findFirst({
      where: { id, channelId },
      select: { description: true },
    });
    return row?.description.trim() ?? '';
  }

  async recordUsage(id: string, channelId: string): Promise<void> {
    await this.prisma.stickerAsset.updateMany({
      where: { id, channelId },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function mimeForExtension(extension: string): string {
  switch (extension) {
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
    channelId: row.channelId,
    sha256: row.sha256,
    filePath: row.filePath,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    tags: row.tags,
    description: row.description,
    enabled: row.enabled,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
