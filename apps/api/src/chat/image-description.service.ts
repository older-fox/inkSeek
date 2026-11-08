import { BadGatewayException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { LlmService } from '../ai/llm.service.js';
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
const DESCRIPTION_MAX_TOKENS = 800;
const SCENE_DESCRIPTION_PROMPT =
  '请用简洁的中文描述这张图片：先说明主体与场景，再补充关键细节（人物、动作、文字、表情、风格）；如果是表情包，说明它传达的情绪或含义。不要编造图片中没有的内容，控制在 120 字以内。';

/**
 * Vision descriptions are keyed by the image hash, so the same bytes are
 * described once no matter how many messages or channels reference them.
 */
@Injectable()
export class ImageDescriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: ChatMediaService,
    private readonly llm: LlmService,
  ) {}

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

    const completion = await this.llm.complete({
      prompt,
      images: [{ mimeType: image.mimeType, base64: image.base64 }],
      providerId: emptyToNull(input.providerId),
      model: emptyToNull(input.model),
      temperature: DESCRIPTION_TEMPERATURE,
      maxTokens: DESCRIPTION_MAX_TOKENS,
      source: input.source?.trim() || 'chat.image-description',
    });
    const description = truncate(completion.text.trim(), MAX_DESCRIPTION_LENGTH);
    if (description.length === 0) {
      throw new BadGatewayException('模型没有返回图片描述');
    }

    return { sha256, mediaId, description, cached: false };
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

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function truncate(value: string, length: number): string {
  const chars = Array.from(value);
  return chars.length > length ? `${chars.slice(0, length).join('')}…` : value;
}
