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
import { LlmPromptLogService } from './llm-prompt-log.service.js';

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
  /** Per-call timeout; defaults to the shared request timeout. */
  timeoutMs?: number;
  /** Caller label shown in the prompt log, e.g. `mind.planner`. */
  source?: string;
  /** Mind run that owns this call; lets the run detail show its prompts. */
  runId?: string | null;
  /** Simulation calls run for real but must not leave prompt logs behind. */
  log?: boolean;
  /** Aborts the HTTP request when the owning turn is superseded. */
  signal?: AbortSignal;
}

export interface LlmCompletion {
  text: string;
  providerId: string;
  providerName: string;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

interface LlmUsage {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
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
 * persona mind consumes this service; persona authoring keeps its own JSON flow.
 */
@Injectable()
export class LlmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promptLogs: LlmPromptLogService,
  ) {}

  async complete(input: LlmCompletionInput): Promise<LlmCompletion> {
    if (input.prompt.trim().length === 0) {
      throw new BadRequestException({ code: 'AI_PROMPT_EMPTY', message: '提示词不能为空' });
    }

    const startedAt = performance.now();
    let provider: ResolvedProvider | null = null;
    let model: string | null = null;

    try {
      provider = await this.resolveProvider(input.providerId);
      model = this.resolveModel(provider, input.model);
      const result = await this.requestCompletion(provider, model, input);
      const latencyMs = Math.round(performance.now() - startedAt);
      const completion: LlmCompletion = {
        text: result.text,
        providerId: provider.id,
        providerName: provider.name,
        model,
        latencyMs,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      };
      if (input.log !== false) {
        await this.promptLogs.record({
          runId: input.runId ?? null,
          source: input.source?.trim() || 'llm',
          providerId: provider.id,
          providerName: provider.name,
          model,
          system: input.system ?? '',
          prompt: input.prompt,
          response: result.text,
          imageCount: input.images?.length ?? 0,
          promptTokens: result.promptTokens ?? null,
          completionTokens: result.completionTokens ?? null,
          latencyMs,
          error: null,
        });
      }
      return completion;
    } catch (error) {
      if (input.log !== false) {
        await this.promptLogs.record({
          runId: input.runId ?? null,
          source: input.source?.trim() || 'llm',
          providerId: provider?.id ?? null,
          providerName: provider?.name ?? null,
          model,
          system: input.system ?? '',
          prompt: input.prompt,
          response: '',
          imageCount: input.images?.length ?? 0,
          promptTokens: null,
          completionTokens: null,
          latencyMs: Math.round(performance.now() - startedAt),
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
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
  ): Promise<LlmUsage> {
    const images = input.images ?? [];
    const temperature = input.temperature ?? 0.3;
    const maxTokens = input.maxTokens ?? 1024;
    const timeoutMs = input.timeoutMs ?? REQUEST_TIMEOUT_MS;

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
        timeoutMs,
        input.signal,
      );

      const usage = asRecord(asRecord(payload).usage);
      return {
        text: joinTextBlocks(asRecord(payload).content),
        promptTokens: readUsageNumber(usage['input_tokens']),
        completionTokens: readUsageNumber(usage['output_tokens']),
      };
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
          ...(input.system ? { systemInstruction: { parts: [{ text: input.system }] } } : {}),
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
        timeoutMs,
        input.signal,
      );

      const candidate = asRecord((asRecord(payload).candidates as unknown[] | undefined)?.[0]);
      const usage = asRecord(asRecord(payload).usageMetadata);
      return {
        text: joinTextBlocks(asRecord(candidate.content).parts),
        promptTokens: readUsageNumber(usage['promptTokenCount']),
        completionTokens: readUsageNumber(usage['candidatesTokenCount']),
      };
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
      timeoutMs,
      input.signal,
    );

    const choice = asRecord((asRecord(payload).choices as unknown[] | undefined)?.[0]);
    const usage = asRecord(asRecord(payload).usage);
    return {
      text: joinTextBlocks(asRecord(choice.message).content),
      promptTokens: readUsageNumber(usage['prompt_tokens']),
      completionTokens: readUsageNumber(usage['completion_tokens']),
    };
  }

  private async postJson(
    provider: ResolvedProvider,
    url: string,
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { accept: 'application/json', ...headers },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';

      if (timedOut) {
        throw new GatewayTimeoutException({
          code: 'AI_TIMEOUT',
          message: `模型响应超时（${Math.round(timeoutMs / 1000)} 秒），请稍后重试或换用更快的模型`,
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

function readUsageNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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
