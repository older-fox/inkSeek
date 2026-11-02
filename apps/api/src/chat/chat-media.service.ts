import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
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
}

interface MediaTarget {
  root: string;
  urlPrefix: string;
  defaultExtension: string;
}

const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 20_000;
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
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
const MEDIA_SEGMENTS = new Set(['image', 'mface', 'marketface']);
const VOICE_SEGMENTS = new Set(['record']);

const IMAGE_TARGET: MediaTarget = {
  root: CHAT_MEDIA_ROOT,
  urlPrefix: CHAT_MEDIA_URL_PREFIX,
  defaultExtension: 'jpg',
};

const VOICE_TARGET: MediaTarget = {
  root: CHAT_VOICE_ROOT,
  urlPrefix: CHAT_VOICE_URL_PREFIX,
  defaultExtension: 'mp3',
};

@Injectable()
export class ChatMediaService implements OnModuleInit {
  private readonly logger = new Logger(ChatMediaService.name);

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
      return this.saveBase64(file.slice('base64://'.length), directUrl || null, IMAGE_TARGET, null);
    }

    if (file.startsWith('data:image/')) {
      return this.saveDataUrl(file);
    }

    const fileUrl = /^https?:\/\//i.test(file) ? file : '';
    const remoteUrl = directUrl || fileUrl;

    if (remoteUrl) {
      return this.saveRemote(remoteUrl, IMAGE_TARGET, null);
    }

    this.logger.warn(`收到无法定位的 ${segment.type} 表情/图片，仅保留原始消息段`);
    return null;
  }

  /**
   * Mirrors image handling for `record` segments. When the event only carries a
   * local file name, NapCat's `get_record` action is asked for a playable mp3.
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

    if (file.startsWith('base64://')) {
      return this.saveBase64(file.slice('base64://'.length), directUrl || null, VOICE_TARGET, duration);
    }

    const dataUrlMatch = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(file);
    if (dataUrlMatch?.[1] && dataUrlMatch[2]) {
      return this.saveBase64(dataUrlMatch[2], null, VOICE_TARGET, duration, dataUrlMatch[1]);
    }

    if (directUrl) {
      return this.saveRemote(directUrl, VOICE_TARGET, duration);
    }

    const fileUrl = /^https?:\/\//i.test(file) ? file : '';
    if (fileUrl) {
      return this.saveRemote(fileUrl, VOICE_TARGET, duration);
    }

    if (client && (file || fileId)) {
      try {
        const record = await client.call<{ url?: string; base64?: string; file?: string }>(
          'get_record',
          { file, file_id: fileId, out_format: 'mp3' },
          20_000,
        );
        const encoded =
          typeof record?.base64 === 'string'
            ? record.base64.replace(/^base64:\/\//i, '')
            : '';
        if (encoded) {
          return this.saveBase64(encoded, null, VOICE_TARGET, duration);
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

    this.logger.warn(`收到无法定位的语音消息，仅保留原始消息段`);
    return null;
  }

  async saveDataUrl(dataUrl: string): Promise<StoredMedia | null> {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
    if (!match || !match[1] || !match[2]) {
      return null;
    }

    return this.saveBase64(match[2], null, IMAGE_TARGET, null, match[1]);
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

      const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? null;
      const fileName = this.writeMedia(buffer, mimeType, remoteUrl, target);
      await writeFile(`${target.root}${fileName}`, buffer);

      return {
        url: `${target.urlPrefix}/${encodeURIComponent(fileName)}`,
        fileName,
        mimeType,
        byteSize: buffer.byteLength,
        width: null,
        height: null,
        duration,
        remoteUrl,
      };
    } catch (error) {
      this.logger.warn(
        `媒体落盘失败，回退为远程地址：${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        url: remoteUrl,
        fileName: null,
        mimeType: null,
        byteSize: null,
        width: null,
        height: null,
        duration,
        remoteUrl,
      };
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

      const mimeType = mimeTypeHint ?? sniffMimeType(buffer);
      const fileName = this.writeMedia(buffer, mimeType, null, target);
      await writeFile(`${target.root}${fileName}`, buffer);

      return {
        url: `${target.urlPrefix}/${encodeURIComponent(fileName)}`,
        fileName,
        mimeType,
        byteSize: buffer.byteLength,
        width: null,
        height: null,
        duration,
        remoteUrl,
      };
    } catch (error) {
      this.logger.warn(
        `Base64 媒体落盘失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return remoteUrl
        ? {
            url: remoteUrl,
            fileName: null,
            mimeType: null,
            byteSize: null,
            width: null,
            height: null,
            duration,
            remoteUrl,
          }
        : null;
    }
  }

  private writeMedia(
    buffer: Buffer,
    mimeType: string | null,
    sourceUrl: string | null,
    target: MediaTarget,
  ): string {
    const fromMime = mimeType ? MIME_EXTENSIONS[mimeType.toLowerCase()] : undefined;
    const fromUrl = sourceUrl
      ? extname(new URL(sourceUrl).pathname).replace('.', '').toLowerCase()
      : '';
    const extension = sanitizeExtension(fromMime ?? fromUrl) ?? target.defaultExtension;
    return `${Date.now().toString(36)}-${randomUUID()}.${extension}`;
  }
}

function sanitizeExtension(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  return /^[a-z0-9]{1,5}$/i.test(value) ? value.toLowerCase() : null;
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
  if (buffer.toString('ascii', 0, 3) === 'ID3' || (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] ?? 0) >= 0xe0)) {
    return 'audio/mpeg';
  }
  if (buffer.includes('#!SILK')) {
    return 'audio/silk';
  }
  return null;
}
