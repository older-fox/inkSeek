import { Injectable, Logger } from '@nestjs/common';
import { SystemConfigService } from '../config/system-config.service.js';
import { RedisCacheService } from '../redis/redis-cache.service.js';
import { readString } from './mind.types.js';

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchResponse {
  enabled: boolean;
  results: WebSearchResult[];
  note?: string;
}

const CACHE_TTL_SECONDS = 900;

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  constructor(
    private readonly config: SystemConfigService,
    private readonly cache: RedisCacheService,
  ) {}

  async search(query: string, limit = 5): Promise<WebSearchResponse> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { enabled: true, results: [] };
    }
    const cacheKey = `inkseek:mind:web:${hashKey(trimmed)}:${limit}`;
    try {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as WebSearchResponse;
        return { ...parsed, note: '缓存结果' };
      }
    } catch {
      // Redis is best-effort.
    }

    try {
      const config = await this.config.get<Record<string, unknown>>('mind.webSearch');
      const endpoint = readString(config?.['endpoint']);
      const apiKey = readString(config?.['apiKey']);
      const results = endpoint
        ? await this.searchEndpoint(endpoint, apiKey, trimmed, limit)
        : await this.searchDuckDuckGo(trimmed, limit);
      const response: WebSearchResponse = { enabled: true, results };
      try {
        await this.cache.set(cacheKey, JSON.stringify(response), CACHE_TTL_SECONDS);
      } catch {
        // Ignore cache failures.
      }
      return response;
    } catch (error) {
      this.logger.warn(
        `网页搜索失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        enabled: false,
        results: [],
        note: '网页搜索不可用，当前没有配置可用的搜索服务',
      };
    }
  }

  private async searchEndpoint(
    endpoint: string,
    apiKey: string,
    query: string,
    limit: number,
  ): Promise<WebSearchResult[]> {
    const url = endpoint.includes('{query}')
      ? endpoint.replace('{query}', encodeURIComponent(query))
      : `${endpoint}${endpoint.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}&limit=${limit}`;
    const response = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`搜索接口返回 ${response.status}`);
    }
    const payload = (await response.json()) as unknown;
    return normalizeResults(payload).slice(0, limit);
  }

  private async searchDuckDuckGo(query: string, limit: number): Promise<WebSearchResult[]> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) {
      throw new Error(`DuckDuckGo 返回 ${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const results: WebSearchResult[] = [];
    const abstract = readString(payload['AbstractText']);
    if (abstract) {
      results.push({
        title: readString(payload['Heading'], query),
        snippet: abstract,
        url: readString(payload['AbstractURL']),
      });
    }
    const related = Array.isArray(payload['RelatedTopics']) ? payload['RelatedTopics'] : [];
    for (const item of related) {
      if (results.length >= limit) break;
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const text = readString(record['Text']);
      const firstUrl = readString(record['FirstURL']);
      if (text) {
        results.push({
          title: text.slice(0, 80),
          snippet: text,
          url: firstUrl,
        });
      }
    }
    return results.slice(0, limit);
  }
}

function normalizeResults(payload: unknown): WebSearchResult[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const title = readString(record['title'] ?? record['name']);
        const snippet = readString(record['snippet'] ?? record['description'] ?? record['content']);
        const url = readString(record['url'] ?? record['link']);
        return title || snippet ? { title, snippet, url } : null;
      })
      .filter((item): item is WebSearchResult => item !== null);
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const list = record['results'] ?? record['items'] ?? record['data'];
    if (Array.isArray(list)) {
      return normalizeResults(list);
    }
  }
  return [];
}

function hashKey(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
