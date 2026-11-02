import { BadRequestException, Injectable } from '@nestjs/common';
import type { ModelProviderInput, ModelProviderProtocol } from '@inkseek/shared';

const REQUEST_TIMEOUT_MS = 8000;

export interface ProviderProbeOutcome {
  models: string[];
  latencyMs: number;
}

@Injectable()
export class ModelProviderProbeService {
  async probe(input: ModelProviderInput): Promise<ProviderProbeOutcome> {
    const startedAt = performance.now();
    const headers: Record<string, string> = { accept: 'application/json' };

    if (input.protocol === 'openai') {
      headers.authorization = `Bearer ${input.apiKey}`;
    } else if (input.protocol === 'anthropic') {
      headers['x-api-key'] = input.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    let response: Response;

    try {
      response = await fetch(this.buildUrl(input), {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';

      throw new BadRequestException({
        code: 'PROVIDER_UNREACHABLE',
        message: timedOut
          ? `连接模型提供商超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`
          : '无法连接模型提供商，请检查 Base URL 与网络',
        fieldErrors: {
          baseUrl: ['请确认地址可从服务器访问，并包含版本路径（如 /v1）'],
        },
      });
    }

    if (!response.ok) {
      const message =
        response.status === 401 || response.status === 403
          ? 'API Key 无效或没有访问权限'
          : response.status === 404
            ? '未找到模型列表接口，请检查 Base URL 是否包含版本路径'
            : `模型提供商返回 HTTP ${response.status}`;

      throw new BadRequestException({
        code: 'PROVIDER_REJECTED',
        message,
        fieldErrors:
          response.status === 401 || response.status === 403
            ? { apiKey: [message] }
            : { baseUrl: [message] },
      });
    }

    const payload: unknown = await response.json().catch(() => null);
    const models = extractModels(input.protocol, payload);

    if (models.length === 0) {
      throw new BadRequestException({
        code: 'PROVIDER_NO_MODELS',
        message: '连接成功，但没有读取到可用模型',
        fieldErrors: { apiKey: ['请确认该密钥可以访问模型列表接口'] },
      });
    }

    return { models, latencyMs: Math.round(performance.now() - startedAt) };
  }

  private buildUrl(input: ModelProviderInput): string {
    const base = input.baseUrl.replace(/\/+$/, '');

    if (input.protocol === 'gemini') {
      const url = new URL(`${base}/models`);
      url.searchParams.set('key', input.apiKey);
      return url.toString();
    }

    return `${base}/models`;
  }
}

function extractModels(protocol: ModelProviderProtocol, payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  if (protocol === 'gemini') {
    const models = (payload as { models?: unknown }).models;

    if (!Array.isArray(models)) {
      return [];
    }

    return unique(
      models.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') {
          return [];
        }

        const { name, supportedGenerationMethods } = entry as {
          name?: unknown;
          supportedGenerationMethods?: unknown;
        };

        if (typeof name !== 'string') {
          return [];
        }

        if (
          Array.isArray(supportedGenerationMethods) &&
          !supportedGenerationMethods.includes('generateContent')
        ) {
          return [];
        }

        return [name.replace(/^models\//, '')];
      }),
    );
  }

  const data = (payload as { data?: unknown }).data;

  if (!Array.isArray(data)) {
    return [];
  }

  return unique(
    data.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }

      const id = (entry as { id?: unknown }).id;
      return typeof id === 'string' && id.length > 0 ? [id] : [];
    }),
  );
}

function unique(models: string[]): string[] {
  return [...new Set(models)].sort((a, b) => a.localeCompare(b));
}
