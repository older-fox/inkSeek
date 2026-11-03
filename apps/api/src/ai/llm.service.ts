import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ModelProviderProtocol } from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { ModelProvider } from '../generated/prisma/client.js';

const REQUEST_TIMEOUT_MS = 120_000;
const ANTHROPIC_VERSION = '2023-06-01';

export interface LlmImageInput {
  mimeType: string;
  /** Base64 payload without the `data:` prefix. */
  base64: string;
}

export interface LlmCompletionInput {
  prompt: string;
  system?: string;
  images?: LlmImageInput[];
  /** Empty values fall back to the first configured provider / its first model. */
  providerId?: string | null;
  model?: string | null;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmCompletion {
  text: string;
  providerId: string;
  providerName: string;
  model: string;
  latencyMs: number;
}

interface ResolvedProvider {
  id: string;
  name: string;
  protocol: ModelProviderProtocol;
  baseUrl: string;
  apiKey: string;
  models: string[];
}

/**
 * Text and vision completions against the configured model providers. The
 * pipeline consumes this service; persona authoring keeps its own JSON flow.
 */
@Injectable()
export class LlmService {
  constructor(private readonly prisma: PrismaService) {}

  async complete(input: LlmCompletionInput): Promise<LlmCompletion> {
    if (input.prompt.trim().length === 0) {
      throw new BadRequestException({ code: 'AI_PROMPT_EMPTY', message: '提示词不能为空' });
    }

    const provider = await this.resolveProvider(input.providerId);
    const model = this.resolveModel(provider, input.model);
    const startedAt = performance.now();
    const text = await this.requestCompletion(provider, model, input);

    return {
      text,
      providerId: provider.id,
      providerName: provider.name,
      model,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  private async resolveProvider(providerId?: string | null): Promise<ResolvedProvider> {
    const records = await this.prisma.modelProvider.findMany({
      orderBy: { createdAt: 'asc' },
    });

    if (providerId) {
      const record = records.find((item) => item.id === providerId);
      if (!record) {
        throw new NotFoundException({
          code: 'AI_PROVIDER_NOT_FOUND',
          message: '模型提供商不存在或已被删除',
        });
      }
      return toResolvedProvider(record);
    }

    const record = records.find((item) => modelList(item).length > 0) ?? records[0];
    if (!record) {
      throw new BadRequestException({
        code: 'AI_PROVIDER_MISSING',
        message: '还没有可用的模型提供商，请先在设置中添加并测试连接',
      });
    }

    return toResolvedProvider(record);
  }

  private resolveModel(provider: ResolvedProvider, requested?: string | null): string {
    if (requested) {
      if (provider.models.length === 0 || provider.models.includes(requested)) {
        return requested;
      }
      throw new BadRequestException({
        code: 'AI_MODEL_UNAVAILABLE',
        message: '所选模型不在该提供商的可用列表中，请重新选择',
      });
    }

    const first = provider.models[0];
    if (!first) {
      throw new BadRequestException({
        code: 'AI_MODEL_MISSING',
        message: '该提供商没有可用模型，请先到设置中重新检测',
      });
    }

    return first;
  }

  private async requestCompletion(
    provider: ResolvedProvider,
    model: string,
    input: LlmCompletionInput,
  ): Promise<string> {
    const images = input.images ?? [];
    const temperature = input.temperature ?? 0.3;
    const maxTokens = input.maxTokens ?? 1024;

    if (provider.protocol === 'anthropic') {
      const content = [
        ...images.map((image) => ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mimeType,
            data: image.base64,
          },
        })),
        { type: 'text', text: input.prompt },
      ];
      const payload = await this.postJson(
        provider,
        `${trimBase(provider.baseUrl)}/messages`,
        {
          'content-type': 'application/json',
          'x-api-key': provider.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        {
          model,
          max_tokens: maxTokens,
          temperature,
          ...(input.system ? { system: input.system } : {}),
          messages: [{ role: 'user', content }],
        },
      );

      return joinTextBlocks(asRecord(payload).content);
    }

    if (provider.protocol === 'gemini') {
      const url = new URL(
        `${trimBase(provider.baseUrl)}/models/${encodeURIComponent(model)}:generateContent`,
      );
      url.searchParams.set('key', provider.apiKey);

      const payload = await this.postJson(
        provider,
        url.toString(),
        { 'content-type': 'application/json' },
        {
          ...(input.system
            ? { systemInstruction: { parts: [{ text: input.system }] } }
            : {}),
          contents: [
            {
              role: 'user',
              parts: [
                ...images.map((image) => ({
                  inline_data: { mime_type: image.mimeType, data: image.base64 },
                })),
                { text: input.prompt },
              ],
            },
          ],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        },
      );

      const candidate = asRecord(
        (asRecord(payload).candidates as unknown[] | undefined)?.[0],
      );
      return joinTextBlocks(asRecord(candidate.content).parts);
    }

    const content =
      images.length > 0
        ? [
            { type: 'text', text: input.prompt },
            ...images.map((image) => ({
              type: 'image_url',
              image_url: {
                url: `data:${image.mimeType};base64,${image.base64}`,
              },
            })),
          ]
        : input.prompt;

    const payload = await this.postJson(
      provider,
      `${trimBase(provider.baseUrl)}/chat/completions`,
      {
        'content-type': 'application/json',
        authorization: `Bearer ${provider.apiKey}`,
      },
      {
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          ...(input.system ? [{ role: 'system', content: input.system }] : []),
          { role: 'user', content },
        ],
      },
    );

    const choice = asRecord((asRecord(payload).choices as unknown[] | undefined)?.[0]);
    return joinTextBlocks(asRecord(choice.message).content);
  }

  private async postJson(
    provider: ResolvedProvider,
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { accept: 'application/json', ...headers },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';

      if (timedOut) {
        throw new GatewayTimeoutException({
          code: 'AI_TIMEOUT',
          message: `模型响应超时（${REQUEST_TIMEOUT_MS / 1000} 秒），请稍后重试或换用更快的模型`,
        });
      }

      throw new BadGatewayException({
        code: 'AI_UNREACHABLE',
        message: '无法连接模型提供商，请检查服务器网络与 Base URL',
      });
    }

    if (!response.ok) {
      const detail = await readErrorDetail(response, provider.apiKey);
      const message =
        response.status === 401 || response.status === 403
          ? `${provider.name} 拒绝了该密钥，请到设置中更新 API Key`
          : response.status === 404
            ? `${provider.name} 未找到该模型或接口，请检查 Base URL 与模型名称`
            : response.status === 429
              ? `${provider.name} 触发限流，请稍后重试`
              : `${provider.name} 返回 HTTP ${response.status}`;

      throw new BadGatewayException({
        code: 'AI_PROVIDER_ERROR',
        message: detail ? `${message}（${detail}）` : message,
      });
    }

    const payload = (await response.json().catch(() => undefined)) as unknown;
    if (payload === undefined) {
      throw new BadGatewayException({
        code: 'AI_BAD_RESPONSE',
        message: '模型提供商的响应不是有效 JSON',
      });
    }

    return payload;
  }
}

/** OpenAI content arrays, Anthropic text blocks and Gemini parts all expose `text`. */
function joinTextBlocks(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .flatMap((block) => {
      const text = asRecord(block).text;
      return typeof text === 'string' ? [text] : [];
    })
    .join('');
}

function toResolvedProvider(record: ModelProvider): ResolvedProvider {
  return {
    id: record.id,
    name: record.name,
    protocol: record.protocol as ModelProviderProtocol,
    baseUrl: record.baseUrl,
    apiKey: record.apiKey,
    models: modelList(record),
  };
}

function modelList(record: ModelProvider): string[] {
  return Array.isArray(record.models)
    ? record.models.filter((model): model is string => typeof model === 'string')
    : [];
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readErrorDetail(response: Response, secret: string): Promise<string> {
  const raw = await response.text().catch(() => '');

  if (!raw) {
    return '';
  }

  try {
    const payload: unknown = JSON.parse(raw);
    const error = asRecord(asRecord(payload).error);
    const message = error.message ?? asRecord(payload).message;

    if (typeof message === 'string') {
      return redact(message.slice(0, 200), secret);
    }
  } catch {
    // fall through to raw text
  }

  return redact(raw.replace(/\s+/g, ' ').trim().slice(0, 200), secret);
}

function redact(value: string, secret: string): string {
  return secret.length >= 8 ? value.split(secret).join('***') : value;
}
