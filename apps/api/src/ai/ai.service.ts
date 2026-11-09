import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ModelProviderProtocol,
  PersonaAiGenerateInput,
  PersonaAiGeneration,
  PersonaAiProviderOption,
  PersonaDraft,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { ModelProvider } from '../generated/prisma/client.js';
import { LlmCallLogService } from './llm-call-log.service.js';
import { extractJsonObject, normalizePersonaDraft } from './persona-ai.normalize.js';
import { buildPersonaAiMessages } from './persona-ai.prompt.js';

const REQUEST_TIMEOUT_MS = 120_000;
const PROVIDER_MODEL_OPTION_LIMIT = 60;
const ANTHROPIC_VERSION = '2023-06-01';

interface ResolvedProvider {
  id: string;
  name: string;
  protocol: ModelProviderProtocol;
  baseUrl: string;
  apiKey: string;
  models: string[];
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promptLogs: LlmCallLogService,
  ) {}

  async listProviders(): Promise<PersonaAiProviderOption[]> {
    const records = await this.prisma.modelProvider.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return records.map((record) => ({
      id: record.id,
      name: record.name,
      protocol: record.protocol as ModelProviderProtocol,
      models: modelList(record).slice(0, PROVIDER_MODEL_OPTION_LIMIT),
    }));
  }

  async generatePersonaDraft(input: PersonaAiGenerateInput): Promise<PersonaAiGeneration> {
    const provider = await this.resolveProvider(input.providerId);
    const model = this.resolveModel(provider, input.model);
    const startedAt = performance.now();
    const messages = buildPersonaAiMessages(input.prompt);
    let content: string;

    try {
      content = await this.requestCompletion(provider, model, input.prompt);
    } catch (error) {
      await this.promptLogs.record({
        source: 'persona.ai',
        providerId: provider.id,
        providerName: provider.name,
        model,
        system: messages.system,
        prompt: messages.user,
        response: '',
        imageCount: 0,
        promptTokens: null,
        completionTokens: null,
        latencyMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const latencyMs = Math.round(performance.now() - startedAt);
    await this.promptLogs.record({
      source: 'persona.ai',
      providerId: provider.id,
      providerName: provider.name,
      model,
      system: messages.system,
      prompt: messages.user,
      response: content,
      imageCount: 0,
      promptTokens: null,
      completionTokens: null,
      latencyMs,
      error: null,
    });

    let draft: PersonaDraft;

    try {
      draft = normalizePersonaDraft(extractJsonObject(content));
    } catch {
      throw new BadGatewayException({
        code: 'AI_BAD_RESPONSE',
        message: '模型返回的内容无法解析为人格卡，请重试或换用更强的模型',
      });
    }

    return {
      draft,
      providerId: provider.id,
      providerName: provider.name,
      model,
      latencyMs,
    };
  }

  private async resolveProvider(providerId?: string): Promise<ResolvedProvider> {
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

  private resolveModel(provider: ResolvedProvider, requested?: string): string {
    if (requested) {
      if (provider.models.length === 0 || provider.models.includes(requested)) {
        return requested;
      }

      throw new BadRequestException({
        code: 'AI_MODEL_UNAVAILABLE',
        message: '所选模型不在该提供商的可用列表中，请重新选择',
        fieldErrors: { model: ['请从可用模型列表中选择'] },
      });
    }

    const [first] = provider.models;

    if (!first) {
      throw new BadRequestException({
        code: 'AI_MODEL_MISSING',
        message: '该提供商没有可用模型，请先到设置中重新检测',
        fieldErrors: { providerId: ['请选择一个已检测出模型的提供商'] },
      });
    }

    return first;
  }

  private async requestCompletion(
    provider: ResolvedProvider,
    model: string,
    prompt: string,
  ): Promise<string> {
    const messages = buildPersonaAiMessages(prompt);

    if (provider.protocol === 'anthropic') {
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
          max_tokens: 8192,
          temperature: 0.8,
          system: messages.system,
          messages: [{ role: 'user', content: messages.user }],
        },
      );

      const content = asRecord(payload).content;

      return Array.isArray(content)
        ? content
            .flatMap((block) => {
              const record = asRecord(block);
              return record.type === 'text' && typeof record.text === 'string' ? [record.text] : [];
            })
            .join('')
        : '';
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
          systemInstruction: { parts: [{ text: messages.system }] },
          contents: [{ role: 'user', parts: [{ text: messages.user }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 8192 },
        },
      );

      const candidate = asRecord((asRecord(payload).candidates as unknown[] | undefined)?.[0]);
      const parts = asRecord(candidate.content).parts;

      return Array.isArray(parts)
        ? parts
            .flatMap((part) => {
              const textValue = asRecord(part).text;
              return typeof textValue === 'string' ? [textValue] : [];
            })
            .join('')
        : '';
    }

    const payload = await this.postJson(
      provider,
      `${trimBase(provider.baseUrl)}/chat/completions`,
      {
        'content-type': 'application/json',
        authorization: `Bearer ${provider.apiKey}`,
      },
      {
        model,
        temperature: 0.8,
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
      },
    );

    const choice = asRecord((asRecord(payload).choices as unknown[] | undefined)?.[0]);
    const content = asRecord(choice.message).content;

    if (typeof content === 'string') {
      return content;
    }

    return Array.isArray(content)
      ? content
          .flatMap((part) => {
            const textValue = asRecord(part).text;
            return typeof textValue === 'string' ? [textValue] : [];
          })
          .join('')
      : '';
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
