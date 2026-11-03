import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { PrismaService } from '../database/prisma.service.js';
import {
  CHAT_MEDIA_ROOT,
  CHAT_MEDIA_URL_PREFIX,
  CHAT_VOICE_ROOT,
  CHAT_VOICE_URL_PREFIX,
} from './chat-paths.js';
import type { OneBotRequester, OneBotSegment } from './onebot.js';

export interface StoredMedia {
  url: string;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  remoteUrl: string | null;
  /** Blob row for content-addressed images; null for voices and remote fallbacks. */
  mediaId: string | null;
  sha256: string | null;
}

interface MediaTarget {
  root: string;
  urlPrefix: string;
  defaultExtension: string;
}

const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
/** Matches the chat send schema: one data URL may not exceed 12,000,000 chars. */
const MAX_IMAGE_DATA_URL = 12_000_000;
const REMOTE_TIMEOUT_MS = 20_000;
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/amr': 'amr',
  'audio/silk': 'silk',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/opus': 'opus',
  'audio/webm': 'weba',
  'audio/weba': 'weba',
};
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
};
const MEDIA_SEGMENTS = new Set(['image', 'mface', 'marketface']);
const VOICE_SEGMENTS = new Set(['record']);
/** `ab/cd/ef/<sha256>.<ext>` — the only new layout this service writes. */
const CONTENT_PATH_PATTERN =
  /^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}\.(?:jpg|png|gif|webp|bmp|avif|bin)$/;
/** Files written before content addressing existed, e.g. `m1abc-<uuid>.jpg`. */
const LEGACY_FILE_PATTERN = /^[a-z0-9-]+\.(?:jpg|jpeg|png|gif|webp|bmp|avif)$/i;

const VOICE_TARGET: MediaTarget = {
  root: CHAT_VOICE_ROOT,
  urlPrefix: CHAT_VOICE_URL_PREFIX,
  defaultExtension: 'mp3',
};

@Injectable()
export class ChatMediaService implements OnModuleInit {
  private readonly logger = new Logger(ChatMediaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await mkdir(CHAT_MEDIA_ROOT, { recursive: true });
    await mkdir(CHAT_VOICE_ROOT, { recursive: true });
  }

  isMediaSegment(segment: OneBotSegment): boolean {
    return MEDIA_SEGMENTS.has(segment.type);
  }

  isVoiceSegment(segment: OneBotSegment): boolean {
    return VOICE_SEGMENTS.has(segment.type);
  }

  async saveSegment(segment: OneBotSegment): Promise<StoredMedia | null> {
    if (!this.isMediaSegment(segment)) {
      return null;
    }

    const data = segment.data;
    const file = typeof data['file'] === 'string' ? data['file'] : '';
    const directUrl =
      typeof data['url'] === 'string' && /^https?:\/\//i.test(data['url']) ? data['url'] : '';

    if (file.startsWith('base64://')) {
      return this.storeImage(
        Buffer.from(file.slice('base64://'.length), 'base64'),
        null,
        directUrl || null,
      );
    }

    const dataUrlMatch = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(file);
    if (dataUrlMatch?.[1] && dataUrlMatch[2]) {
      return this.storeImage(
        Buffer.from(dataUrlMatch[2], 'base64'),
        dataUrlMatch[1],
        directUrl || null,
      );
    }

    const fileUrl = /^https?:\/\//i.test(file) ? file : '';
    const remoteUrl = directUrl || fileUrl;

    if (remoteUrl) {
      return this.saveRemoteImage(remoteUrl);
    }

    this.logger.warn(`收到无法定位的 ${segment.type} 表情/图片，仅保留原始消息段`);
    return null;
  }

  /**
   * Mirrors image handling for `record` segments. NapCat is always asked for an
   * mp3 first: Tencent's record URLs serve AMR/SILK bytes while advertising
   * `audio/mp3`, which no browser can decode.
   */
  async saveVoiceSegment(
    segment: OneBotSegment,
    client?: OneBotRequester,
  ): Promise<StoredMedia | null> {
    if (!this.isVoiceSegment(segment)) {
      return null;
    }

    const data = segment.data;
    const file = typeof data['file'] === 'string' ? data['file'] : '';
    const fileId = typeof data['file_id'] === 'string' ? data['file_id'] : '';
    const duration = readDurationSeconds(data);
    const directUrl =
      typeof data['url'] === 'string' && /^https?:\/\//i.test(data['url']) ? data['url'] : '';
    const fileUrl = /^https?:\/\//i.test(file) ? file : '';

    if (file.startsWith('base64://')) {
      return this.saveBase64(
        file.slice('base64://'.length),
        directUrl || null,
        VOICE_TARGET,
        duration,
      );
    }

    const dataUrlMatch = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(file);
    if (dataUrlMatch?.[1] && dataUrlMatch[2]) {
      return this.saveBase64(dataUrlMatch[2], null, VOICE_TARGET, duration, dataUrlMatch[1]);
    }

    if (client && !fileUrl && (file || fileId)) {
      const params: Record<string, unknown> = { out_format: 'mp3' };
      if (file) {
        params['file'] = file;
      }
      if (fileId) {
        params['file_id'] = fileId;
      }

      try {
        const record = await client.call<{ url?: string; base64?: string; file?: string }>(
          'get_record',
          params,
          20_000,
        );
        const encoded =
          typeof record?.base64 === 'string' ? record.base64.replace(/^base64:\/\//i, '') : '';
        if (encoded) {
          return this.saveBase64(encoded, directUrl || null, VOICE_TARGET, duration);
        }

        const recordUrl =
          typeof record?.url === 'string' && /^https?:\/\//i.test(record.url)
            ? record.url
            : typeof record?.file === 'string' && /^https?:\/\//i.test(record.file)
              ? record.file
              : '';
        if (recordUrl) {
          return this.saveRemote(recordUrl, VOICE_TARGET, duration);
        }
      } catch (error) {
        this.logger.warn(
          `get_record 获取语音失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (directUrl) {
      return this.saveRemote(directUrl, VOICE_TARGET, duration);
    }
    if (fileUrl) {
      return this.saveRemote(fileUrl, VOICE_TARGET, duration);
    }

    this.logger.warn(`收到无法定位的语音消息，仅保留原始消息段`);
    return null;
  }

  /**
   * Turns a stored media reference (local `/api/v1/media/images/...` path, a
   * data URL, or a remote http(s) URL) into a data URL that the NapCat send
   * path accepts. Pipeline image ports carry these references, never bytes.
   */
  async toDataUrl(reference: string): Promise<string> {
    const trimmed = reference.trim();
    if (trimmed.startsWith('data:image/')) {
      if (trimmed.length > MAX_IMAGE_DATA_URL) {
        throw new Error('图片超过发送大小限制');
      }
      return trimmed;
    }

    if (trimmed.startsWith(`${CHAT_MEDIA_URL_PREFIX}/`)) {
      const encoded = trimmed.slice(CHAT_MEDIA_URL_PREFIX.length + 1).split('?')[0] ?? '';
      let relative: string;
      try {
        relative = decodeURIComponent(encoded);
      } catch {
        throw new Error(`图片引用无效：${trimmed}`);
      }
      const allowed =
        CONTENT_PATH_PATTERN.test(relative) ||
        (!relative.includes('/') && LEGACY_FILE_PATTERN.test(relative));
      if (!allowed) {
        throw new Error(`图片引用无效：${trimmed}`);
      }

      let buffer: Buffer;
      try {
        buffer = await readFile(localPathOf(relative));
      } catch {
        throw new Error(`图片文件无法读取：${relative}`);
      }
      return this.toImageDataUrl(buffer, relative);
    }

    if (/^https?:\/\//i.test(trimmed)) {
      const response = await fetch(trimmed, {
        signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (!response.ok) {
        throw new Error(`图片下载失败：HTTP ${response.status}`);
      }
      const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? null;
      if (mimeType && !mimeType.startsWith('image/')) {
        throw new Error(`图片地址返回了 ${mimeType}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      return this.toImageDataUrl(buffer, null, mimeType);
    }

    throw new Error(`不支持的图片引用：${trimmed.slice(0, 120)}`);
  }

  private toImageDataUrl(
    buffer: Buffer,
    fileName: string | null,
    mimeTypeHint?: string | null,
  ): string {
    if (buffer.byteLength === 0) {
      throw new Error('图片内容为空');
    }
    if (buffer.byteLength > MAX_MEDIA_BYTES) {
      throw new Error('图片超过发送大小限制');
    }

    const mimeType =
      mimeTypeHint ?? sniffMimeType(buffer) ?? mimeTypeOfFile(fileName) ?? 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    if (dataUrl.length > MAX_IMAGE_DATA_URL) {
      throw new Error('图片超过发送大小限制');
    }
    return dataUrl;
  }

  async saveDataUrl(dataUrl: string): Promise<StoredMedia | null> {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
    if (!match || !match[1] || !match[2]) {
      return null;
    }

    return this.storeImage(Buffer.from(match[2], 'base64'), match[1], null);
  }

  private async saveRemoteImage(remoteUrl: string): Promise<StoredMedia | null> {
    try {
      const response = await fetch(remoteUrl, {
        signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MAX_MEDIA_BYTES) {
        throw new Error('文件超过 64 MB');
      }

      const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? null;
      const stored = await this.storeImage(buffer, mimeType, remoteUrl);
      return stored ?? remoteFallback(remoteUrl, null);
    } catch (error) {
      this.logger.warn(
        `媒体落盘失败，回退为远程地址：${error instanceof Error ? error.message : String(error)}`,
      );
      return remoteFallback(remoteUrl, null);
    }
  }

  /**
   * Persists image bytes once per SHA-256. Files are written atomically into
   * `ab/cd/ef/<hash>.<ext>` and the blob row is upserted; mappings keep their
   * own position, so the same file can appear in many messages.
   */
  private async storeImage(
    buffer: Buffer,
    mimeTypeHint: string | null,
    remoteUrl: string | null,
  ): Promise<StoredMedia | null> {
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_MEDIA_BYTES) {
      return null;
    }
    if (isSvg(buffer, mimeTypeHint)) {
      this.logger.warn('聊天图片拒收 SVG');
      return remoteUrl ? remoteFallback(remoteUrl, null) : null;
    }

    const mimeType = sniffMimeType(buffer) ?? normalizeImageMime(mimeTypeHint);
    const extension = mimeType ? IMAGE_EXTENSIONS[mimeType] : undefined;
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const storagePath = `${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256.slice(4, 6)}/${sha256}.${extension ?? 'bin'}`;
    const target = localPathOf(storagePath);
    const size = sniffImageSize(buffer, mimeType);

    try {
      await this.writeBlob(target, buffer);
    } catch (error) {
      this.logger.warn(
        `图片落盘失败，回退为远程地址：${error instanceof Error ? error.message : String(error)}`,
      );
      return remoteUrl ? remoteFallback(remoteUrl, sha256) : null;
    }

    const mediaId = await this.upsertBlob({
      sha256,
      storagePath,
      mimeType,
      byteSize: buffer.byteLength,
      width: size?.width ?? null,
      height: size?.height ?? null,
    });

    return {
      url: `${CHAT_MEDIA_URL_PREFIX}/${storagePath}`,
      fileName: storagePath,
      mimeType,
      byteSize: buffer.byteLength,
      width: size?.width ?? null,
      height: size?.height ?? null,
      duration: null,
      remoteUrl,
      mediaId,
      sha256,
    };
  }

  private async writeBlob(target: string, buffer: Buffer): Promise<void> {
    await mkdir(dirname(target), { recursive: true });

    if (await exists(target)) {
      return;
    }

    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, buffer, { flag: 'wx' });
    try {
      await rename(temporary, target);
    } catch (error) {
      // Another ingest may have written the same hash between the check and the
      // rename; identical bytes make that harmless.
      if (!(await exists(target))) {
        void unlink(temporary).catch(() => undefined);
        throw error;
      }
      void unlink(temporary).catch(() => undefined);
    }
  }

  private async upsertBlob(input: {
    sha256: string;
    storagePath: string;
    mimeType: string | null;
    byteSize: number;
    width: number | null;
    height: number | null;
  }): Promise<string | null> {
    try {
      const row = await this.prisma.chatMediaObject.upsert({
        where: { sha256: input.sha256 },
        update: {},
        create: input,
        select: { id: true },
      });
      return row.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        const row = await this.prisma.chatMediaObject.findUnique({
          where: { sha256: input.sha256 },
          select: { id: true },
        });
        return row?.id ?? null;
      }

      this.logger.warn(
        `媒体元数据写入失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async saveRemote(
    remoteUrl: string,
    target: MediaTarget,
    duration: number | null,
  ): Promise<StoredMedia> {
    try {
      const response = await fetch(remoteUrl, {
        signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MAX_MEDIA_BYTES) {
        throw new Error('文件超过 64 MB');
      }

      // Remote voice hosts label AMR payloads as audio/mp3; trust magic bytes.
      const mimeType =
        sniffMimeType(buffer) ??
        response.headers.get('content-type')?.split(';')[0]?.trim() ??
        null;
      return await this.storeMedia(buffer, target, mimeType, remoteUrl, duration);
    } catch (error) {
      this.logger.warn(
        `媒体落盘失败，回退为远程地址：${error instanceof Error ? error.message : String(error)}`,
      );

      return remoteFallback(remoteUrl, null, duration);
    }
  }

  private async saveBase64(
    base64: string,
    remoteUrl: string | null,
    target: MediaTarget,
    duration: number | null,
    mimeTypeHint?: string,
  ): Promise<StoredMedia | null> {
    try {
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_MEDIA_BYTES) {
        return null;
      }

      const mimeType = sniffMimeType(buffer) ?? mimeTypeHint ?? null;
      return await this.storeMedia(buffer, target, mimeType, remoteUrl, duration);
    } catch (error) {
      this.logger.warn(
        `Base64 媒体落盘失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return remoteUrl ? remoteFallback(remoteUrl, null, duration) : null;
    }
  }

  /**
   * Persists voice bytes once per SHA-256 into `ab/cd/ef/<hash>.<ext>`, the
   * same sharded layout images use, so a long-running inbox never turns the
   * voice directory into one oversized flat listing.
   */
  private async storeMedia(
    buffer: Buffer,
    target: MediaTarget,
    mimeType: string | null,
    sourceUrl: string | null,
    duration: number | null,
  ): Promise<StoredMedia> {
    const extension = mediaExtension(mimeType, sourceUrl, target.defaultExtension);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const storagePath = `${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256.slice(4, 6)}/${sha256}.${extension}`;
    await this.writeBlob(resolve(target.root, ...storagePath.split('/')), buffer);

    return {
      url: `${target.urlPrefix}/${storagePath}`,
      fileName: storagePath,
      mimeType,
      byteSize: buffer.byteLength,
      width: null,
      height: null,
      duration,
      remoteUrl: sourceUrl,
      mediaId: null,
      sha256,
    };
  }
}

function remoteFallback(
  remoteUrl: string,
  sha256: string | null,
  duration: number | null = null,
): StoredMedia {
  return {
    url: remoteUrl,
    fileName: null,
    mimeType: null,
    byteSize: null,
    width: null,
    height: null,
    duration,
    remoteUrl,
    mediaId: null,
    sha256,
  };
}

function localPathOf(relative: string): string {
  return resolve(CHAT_MEDIA_ROOT, ...relative.split('/'));
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

function normalizeImageMime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const mime = value.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime === 'image/jpg') {
    return 'image/jpeg';
  }
  return mime.startsWith('image/') ? mime : null;
}

function isSvg(buffer: Buffer, mimeTypeHint: string | null): boolean {
  if (normalizeImageMime(mimeTypeHint) === 'image/svg+xml') {
    return true;
  }
  const head = buffer.toString('utf8', 0, Math.min(buffer.length, 256)).trimStart().toLowerCase();
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
}

function mimeTypeOfFile(fileName: string | null): string | null {
  if (!fileName) {
    return null;
  }
  const extension = extname(fileName).replace('.', '').toLowerCase();
  if (!extension) {
    return null;
  }
  const match = Object.entries(MIME_EXTENSIONS).find(
    ([mime, mapped]) => mapped === extension && mime.startsWith('image/'),
  );
  return match?.[0] ?? null;
}

function sanitizeExtension(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  return /^[a-z0-9]{1,5}$/i.test(value) ? value.toLowerCase() : null;
}

function mediaExtension(
  mimeType: string | null,
  sourceUrl: string | null,
  fallback: string,
): string {
  const fromMime = mimeType ? MIME_EXTENSIONS[mimeType.toLowerCase()] : undefined;
  const fromUrl = sourceUrl
    ? extname(new URL(sourceUrl).pathname).replace('.', '').toLowerCase()
    : '';
  return sanitizeExtension(fromMime ?? fromUrl) ?? fallback;
}

function readDurationSeconds(data: Record<string, unknown>): number | null {
  for (const key of ['duration', 'seconds', 'length']) {
    const value = data[key];
    const numeric =
      typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Math.round(numeric);
    }
  }
  return null;
}

function sniffImageSize(
  buffer: Buffer,
  mimeType: string | null,
): { width: number; height: number } | null {
  if (!mimeType) {
    return null;
  }

  if (mimeType === 'image/png' && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (mimeType === 'image/gif' && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }

  if (mimeType === 'image/bmp' && buffer.length >= 26) {
    return {
      width: Math.abs(buffer.readInt32LE(18)),
      height: Math.abs(buffer.readInt32LE(22)),
    };
  }

  if (mimeType === 'image/webp' && buffer.length >= 30) {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (chunk === 'VP8 ' && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === 'VP8L' && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  if (mimeType === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1] ?? 0;
      if (
        marker === 0xd8 ||
        marker === 0xd9 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) {
        break;
      }
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }

  return null;
}

function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'image/bmp';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(buffer.toString('ascii', 8, 12))
  ) {
    return 'image/avif';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  ) {
    return 'audio/wav';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.toString('ascii', 0, 5) === '#!AMR') {
    return 'audio/amr';
  }
  if (buffer.toString('ascii', 0, 4) === 'OggS') {
    return 'audio/ogg';
  }
  if (buffer.toString('ascii', 0, 4) === 'fLaC') {
    return 'audio/flac';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return 'audio/mp4';
  }
  if (
    buffer.toString('ascii', 0, 3) === 'ID3' ||
    (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] ?? 0) >= 0xe0)
  ) {
    return 'audio/mpeg';
  }
  if (buffer.includes('#!SILK')) {
    return 'audio/silk';
  }
  return null;
}
