import { BadGatewayException, Injectable } from '@nestjs/common';
import type { VisionModelInput, VisionModelResult, VisionModelSettings } from '@inkseek/shared';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CONFIG_KEYS } from '../config/config-keys.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { LlmService } from './llm.service.js';
import { isVisionRefusal } from './vision-guards.js';

/** Bundled card image ("INK 42"); the probe only passes when the model reads it. */
const PROBE_IMAGE_PATH = fileURLToPath(new URL('./assets/vision-probe.png', import.meta.url));
const PROBE_PROMPT = '这张图里写了什么？用一句中文回答，只写你看到的内容。';
const PROBE_MAX_TOKENS = 1200;
const LAST_DESCRIPTION_LIMIT = 200;

export interface VisionTarget {
  providerId: string | null;
  model: string | null;
}

/** Stored target used by every image call; empty values mean "follow the default model". */
export async function readVisionTarget(config: SystemConfigService): Promise<VisionTarget> {
  const stored = await config.get<Record<string, unknown>>(CONFIG_KEYS.aiVisionModel);
  return {
    providerId: readOptional(stored?.['providerId']),
    model: readOptional(stored?.['model']),
  };
}

/**
 * The operator can point image reading at a specific provider/model instead of
 * reusing whatever the conversation default happens to be. Saving runs a real
 * probe with a bundled picture, so a text-only model cannot be stored silently.
 */
@Injectable()
export class VisionModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SystemConfigService,
    private readonly llm: LlmService,
  ) {}

  /** Current target plus the provider's display name for the settings card. */
  async overview(): Promise<VisionModelSettings> {
    const stored = await this.config.get<Record<string, unknown>>(CONFIG_KEYS.aiVisionModel);
    const providerId = readOptional(stored?.['providerId']);
    const provider = providerId
      ? await this.prisma.modelProvider.findUnique({ where: { id: providerId } })
      : null;
    return {
      providerId,
      providerName: provider?.name ?? null,
      model: readOptional(stored?.['model']),
      verifiedAt: readOptional(stored?.['verifiedAt']),
      lastDescription: readOptional(stored?.['lastDescription']),
    };
  }

  /** Probes with the bundled image and persists the target only when it worked. */
  async save(input: VisionModelInput): Promise<VisionModelResult> {
    const providerId = input.providerId.trim() || null;
    const model = input.model.trim() || null;
    const image = await readFile(PROBE_IMAGE_PATH);
    const completion = await this.llm.complete({
      prompt: PROBE_PROMPT,
      images: [{ mimeType: 'image/png', base64: image.toString('base64') }],
      providerId,
      model,
      temperature: 0.2,
      maxTokens: PROBE_MAX_TOKENS,
      source: 'settings.vision-probe',
    });
    const description = completion.text.trim();
    if (isVisionRefusal(description)) {
      throw new BadGatewayException({
        code: 'AI_VISION_UNAVAILABLE',
        message: description
          ? `这个模型看不了图：${description.slice(0, 80)}`
          : '这个模型没有返回图片内容，请换一个支持视觉的模型',
      });
    }
    const settings: VisionModelSettings = {
      providerId,
      providerName: completion.providerName,
      model,
      verifiedAt: new Date().toISOString(),
      lastDescription: description.slice(0, LAST_DESCRIPTION_LIMIT),
    };
    await this.config.set(CONFIG_KEYS.aiVisionModel, settings as unknown as Prisma.InputJsonValue);
    return {
      visionModel: settings,
      description,
      latencyMs: completion.latencyMs,
      completionTokens: completion.completionTokens ?? null,
      reasoningTokens: completion.reasoningTokens ?? null,
    };
  }
}

function readOptional(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
