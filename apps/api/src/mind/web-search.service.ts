import { Injectable, Logger } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
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

export interface WebReadResult {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

const CACHE_TTL_SECONDS = 900;
const READ_TIMEOUT_MS = 10_000;
const READ_MAX_BYTES = 1_000_000;
const READ_MAX_TEXT = 5000;
const READ_MAX_REDIRECTS = 3;

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
      this.logger.warn(`网页搜索失败：${error instanceof Error ? error.message : String(error)}`);
      return {
        enabled: false,
        results: [],
        note: '网页搜索不可用，当前没有配置可用的搜索服务',
      };
    }
  }

  /**
   * Fetches a single public web page and returns readable text. Only http(s)
   * on standard ports is allowed, every redirect is re-validated, and hosts
   * that resolve to private/link-local addresses are rejected.
   */
  async read(rawUrl: string): Promise<WebReadResult> {
    let current = normalizePublicUrl(rawUrl);
    for (let redirects = 0; redirects <= READ_MAX_REDIRECTS; redirects += 1) {
      await assertPublicHost(current);
      const response = await fetch(current.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
        headers: {
          'user-agent': 'InkSeekMind/1.0 (+persona reading)',
          accept: 'text/html,application/xhtml+xml,text/plain',
        },
      });
      if (isRedirect(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('网页重定向缺少目标地址');
        }
        current = normalizePublicUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) {
        throw new Error(`网页返回 ${response.status}`);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (
        contentType &&
        !/text\/html|application\/xhtml|text\/plain|text\/xml/i.test(contentType)
      ) {
        throw new Error(`不支持的内容类型：${contentType.slice(0, 80)}`);
      }
      const length = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(length) && length > READ_MAX_BYTES * 2) {
        throw new Error('网页太大，放弃阅读');
      }
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer).slice(0, READ_MAX_BYTES);
      const body = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const text = htmlToText(body);
      return {
        url: current.toString(),
        title: extractTitle(body) || current.hostname,
        text: text.slice(0, READ_MAX_TEXT),
        truncated: text.length > READ_MAX_TEXT || buffer.byteLength > READ_MAX_BYTES,
      };
    }
    throw new Error('网页重定向次数过多');
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

export function normalizePublicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('不是有效的网页地址');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只允许 http/https 地址');
  }
  if (url.username || url.password) {
    throw new Error('网页地址不能带登录信息');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('只允许标准网页端口');
  }
  url.hash = '';
  return url;
}

export async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.trim().toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('不能读取本地地址');
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error('无法解析网页地址');
  }
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('不能读取内网地址');
  }
}

function isPrivateAddress(address: string): boolean {
  const value = address.trim().toLowerCase();
  if (value.includes(':')) {
    if (value.includes('::ffff:')) {
      return true;
    }
    if (value === '::1' || value === '::') {
      return true;
    }
    if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value)) {
      return true;
    }
    return false;
  }
  const parts = value.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a = 0, b = 0] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  return a === 198 && (b === 18 || b === 19);
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = match?.[1];
  return title
    ? decodeEntities(title.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function hashKey(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
