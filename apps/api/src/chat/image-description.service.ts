import { BadGatewayException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { LlmService } from '../ai/llm.service.js';
import { isVisionRefusal } from '../ai/vision-guards.js';
import { readVisionTarget } from '../ai/vision-model.service.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { ChatMediaService } from './chat-media.service.js';
export interface ImageDescriptionInput {
  /** Channel that owns the referenced image; storage and reads are channel-scoped. */
  channelId: string;
  /** Stored media reference or data URL carried by an image port. */
  reference: string;
  prompt: string;
  providerId?: string | null;
  model?: string | null;
  /** Regenerate even when the blob already has a description. */
  force?: boolean;
}

export interface ImageDescriptionResult {
  sha256: string;
  /** Blob row to attach the description to; null when storage was unavailable. */
  mediaId: string | null;
  description: string;
  cached: boolean;
}

const MAX_PROMPT_LENGTH = 4_000;
const MAX_DESCRIPTION_LENGTH = 2_000;
const DESCRIPTION_TEMPERATURE = 0.3;
/** Thinking models spend a few hundred tokens reasoning before answering. */
const DESCRIPTION_MAX_TOKENS = 3_000;
/** Failed images are retried after this window instead of on every scene build. */
const FAILURE_TTL_MS = 120_000;
const FAILURE_CACHE_LIMIT = 500;
const SCENE_DESCRIPTION_PROMPT =
  '请用简洁的中文描述这张图片：先说明主体与场景，再补充关键细节（人物、动作、文字、表情、风格）；如果是表情包，说明它传达的情绪或含义。不要编造图片中没有的内容，控制在 120 字以内。';

/**
 * Vision descriptions are keyed by the image hash, so the same bytes are
 * described once no matter how many messages or channels reference them.
 */
@Injectable()
export class ImageDescriptionService {
  /** Recent failures and in-flight calls, keyed by channel + image hash. */
  private readonly failures = new Map<string, { message: string; until: number }>();
  private readonly inflight = new Map<string, Promise<ImageDescriptionResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: ChatMediaService,
    private readonly llm: LlmService,
    private readonly config: SystemConfigService,
  ) {}

  /**
   * Describes the image behind a reference, reusing the stored description
   * unless forced. Concurrent requests for the same bytes share one model call,
   * and a recent failure is replayed instead of burning tokens again.
   */
  async describe(
    input: ImageDescriptionInput & { source?: string },
  ): Promise<ImageDescriptionResult> {
    const prompt = input.prompt.trim();
    if (prompt.length === 0) {
      throw new BadGatewayException('图片描述提示词为空');
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new BadGatewayException(`图片描述提示词不能超过 ${MAX_PROMPT_LENGTH} 个字符`);
    }

    const dataUrl = await this.media.toDataUrl(input.channelId, input.reference);
    const image = parseImageDataUrl(dataUrl);
    const sha256 = createHash('sha256').update(image.buffer).digest('hex');
    const key = `${input.channelId}:${sha256}`;

    const failure = this.failures.get(key);
    if (failure && failure.until > Date.now()) {
      throw new BadGatewayException(failure.message);
    }
    this.failures.delete(key);

    const running = this.inflight.get(key);
    if (running) {
      return running;
    }

    const task = this.describeOnce(input, prompt, image, sha256);
    const tracked = task.finally(() => {
      if (this.inflight.get(key) === tracked) {
        this.inflight.delete(key);
      }
    });
    this.inflight.set(key, tracked);
    try {
      return await tracked;
    } catch (error) {
      this.rememberFailure(key, error);
      throw error;
    }
  }

  /** One real attempt: cached description, blob row, then the vision call. */
  private async describeOnce(
    input: ImageDescriptionInput & { source?: string },
    prompt: string,
    image: { mimeType: string; base64: string; buffer: Buffer },
    sha256: string,
  ): Promise<ImageDescriptionResult> {
    const dataUrl = `data:${image.mimeType};base64,${image.base64}`;
    const existing = await this.prisma.chatMediaObject.findUnique({
      where: { sha256 },
      select: { id: true, description: true },
    });

    if (!input.force && existing?.description?.trim()) {
      return {
        sha256,
        mediaId: existing.id,
        description: existing.description,
        cached: true,
      };
    }

    // Legacy or ad-hoc references may not have a blob row yet; store the bytes
    // first so the generated description has somewhere to live.
    let mediaId = existing?.id ?? null;
    if (!mediaId) {
      const stored = await this.media.saveDataUrl(input.channelId, dataUrl);
      mediaId = stored?.mediaId ?? null;
    }

    const vision = await readVisionTarget(this.config);
    const completion = await this.llm.complete({
      prompt,
      images: [{ mimeType: image.mimeType, base64: image.base64 }],
      providerId: emptyToNull(input.providerId) ?? vision.providerId,
      model: emptyToNull(input.model) ?? vision.model,
      temperature: DESCRIPTION_TEMPERATURE,
      maxTokens: DESCRIPTION_MAX_TOKENS,
      source: input.source?.trim() || 'chat.image-description',
      channelId: input.channelId,
    });
    const raw = completion.text.trim();
    // "抱歉，我无法查看这张图片" is not a description; storing it would be
    // cached forever and poison every later scene that shows the image.
    if (isVisionRefusal(raw)) {
      throw new BadGatewayException(
        raw ? `识图模型没有描述图片：${truncate(raw, 60)}` : '模型没有返回图片描述',
      );
    }
    const description = truncate(raw, MAX_DESCRIPTION_LENGTH);

    return { sha256, mediaId, description, cached: false };
  }

  /** Short-lived negative cache so a broken image is not re-billed every turn. */
  private rememberFailure(key: string, error: unknown): void {
    if (this.failures.size >= FAILURE_CACHE_LIMIT) {
      const now = Date.now();
      for (const [entryKey, entry] of this.failures) {
        if (entry.until <= now) {
          this.failures.delete(entryKey);
        }
      }
      if (this.failures.size >= FAILURE_CACHE_LIMIT) {
        this.failures.clear();
      }
    }
    this.failures.set(key, {
      message: error instanceof Error ? error.message : String(error),
      until: Date.now() + FAILURE_TTL_MS,
    });
  }

  /** Describes an image for the persona mind and persists the result. */
  async describeForScene(
    channelId: string,
    reference: string,
    prompt?: string,
  ): Promise<{
    mediaId: string | null;
    description: string;
    cached: boolean;
  }> {
    const result = await this.describe({
      channelId,
      reference,
      prompt: prompt?.trim() || SCENE_DESCRIPTION_PROMPT,
      source: 'mind.image-description',
    });
    if (!result.cached && result.mediaId) {
      await this.prisma.chatMediaObject.updateMany({
        where: { id: result.mediaId },
        data: { description: result.description },
      });
    }
    return {
      mediaId: result.mediaId,
      description: result.description,
      cached: result.cached,
    };
  }
}

/** Splits a data: image URL into mime type and raw bytes; anything else is rejected. */
function parseImageDataUrl(dataUrl: string): {
  mimeType: string;
  base64: string;
  buffer: Buffer;
} {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match?.[1] || !match[2]) {
    throw new BadGatewayException('图片引用无法解析为 data URL');
  }
  return {
    mimeType: match[1],
    base64: match[2],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

/** Treats blank provider/model overrides as "use the configured default". */
function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Counts code points rather than UTF-16 units, so emoji are never split mid-character. */
function truncate(value: string, length: number): string {
  const chars = Array.from(value);
  return chars.length > length ? `${chars.slice(0, length).join('')}…` : value;
}
