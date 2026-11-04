import { BadGatewayException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { LlmService } from '../ai/llm.service.js';
import { RedisCacheService } from '../redis/redis-cache.service.js';
import {
  PROMPT_COMPRESSION_DEFAULT_TTL_SECONDS,
  PROMPT_COMPRESSION_MAX_TTL_SECONDS,
  PROMPT_COMPRESSION_MIN_TTL_SECONDS,
  type PipelinePromptCompressionInput,
  type PipelinePromptCompressionResult,
} from './pipeline/pipeline-types.js';

/** Bump when the instruction changes so old cache rows stop matching. */
const COMPRESSION_VERSION = 'v1';
const CACHE_PREFIX = `inkseek:pipeline:prompt-compress:${COMPRESSION_VERSION}`;
const COMPRESSION_TEMPERATURE = 0.2;
const COMPRESSION_MAX_TOKENS = 4096;

const COMPRESSION_SYSTEM = [
  '你是提示词压缩器。把用户给出的详细提示词改写成更紧凑的一版：',
  '删除重复、客套、可合并的表述和多余举例，但必须保留全部事实、设定、约束、字段名、输出格式、语气与安全要求。',
  '不得新增原文没有的信息，不得改变语义，不得省略任何限制条件。',
  '直接输出压缩后的提示词正文，不要解释，不要使用 Markdown 代码块。',
].join('\n');

/**
 * Compresses long prompts once and keeps the result in Redis. The cache key
 * covers the input text, provider and model, so editing any of them lands on a
 * fresh key; the entry otherwise expires when its TTL lapses.
 */
@Injectable()
export class PromptCompressionService {
  constructor(
    private readonly llm: LlmService,
    private readonly cache: RedisCacheService,
  ) {}

  async compress(
    input: PipelinePromptCompressionInput,
  ): Promise<PipelinePromptCompressionResult> {
    const prompt = input.prompt.trim();
    if (prompt.length === 0) {
      throw new BadGatewayException('详细提示词为空');
    }

    const providerId = emptyToNull(input.providerId);
    const model = emptyToNull(input.model);
    const ttlSeconds = normalizeTtl(input.ttlSeconds);
    const key = cacheKey(prompt, providerId, model);

    const cached = parseCached(await this.cache.get(key));
    if (cached) {
      return { text: cached.text, cached: true, model: cached.model };
    }

    const completion = await this.llm.complete({
      prompt: compressionPrompt(prompt),
      system: COMPRESSION_SYSTEM,
      providerId,
      model,
      temperature: COMPRESSION_TEMPERATURE,
      maxTokens: COMPRESSION_MAX_TOKENS,
    });
    const text = completion.text.trim();
    if (text.length === 0) {
      throw new BadGatewayException('模型没有返回压缩后的提示词');
    }

    await this.cache.set(
      key,
      JSON.stringify({ text, model: completion.model }),
      ttlSeconds,
    );

    return { text, cached: false, model: completion.model };
  }
}

function compressionPrompt(prompt: string): string {
  return `请压缩下面这段提示词：\n\n${prompt}`;
}

function cacheKey(
  prompt: string,
  providerId: string | null,
  model: string | null,
): string {
  const digest = createHash('sha256')
    .update(COMPRESSION_SYSTEM)
    .update('\u0000')
    .update(prompt)
    .digest('hex');
  return `${CACHE_PREFIX}:${providerId ?? 'default'}:${model ?? 'default'}:${digest}`;
}

function normalizeTtl(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return PROMPT_COMPRESSION_DEFAULT_TTL_SECONDS;
  }
  return Math.min(
    PROMPT_COMPRESSION_MAX_TTL_SECONDS,
    Math.max(PROMPT_COMPRESSION_MIN_TTL_SECONDS, Math.round(value)),
  );
}

function parseCached(raw: string | null): { text: string; model: string | null } | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const text = typeof record['text'] === 'string' ? record['text'].trim() : '';
    if (text.length === 0) {
      return null;
    }
    return {
      text,
      model: typeof record['model'] === 'string' ? record['model'] : null,
    };
  } catch {
    return null;
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}
