import { Injectable, Logger } from '@nestjs/common';
import { CONFIG_KEYS } from '../config/config-keys.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { RedisCacheService } from '../redis/redis-cache.service.js';
import { MindBrowserService } from './mind-browser.service.js';
import { normalizeAllowedHosts } from './web-allowlist.js';
import { assertPublicHost, normalizePublicUrl } from './web-url.js';

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
const FAILURE_TTL_MS = 60_000;
const FAILURE_CACHE_LIMIT = 200;
const READ_TIMEOUT_MS = 10_000;
const READ_MAX_BYTES = 1_000_000;
const READ_MAX_TEXT = 5000;
const READ_MAX_REDIRECTS = 3;
const UNAVAILABLE_NOTE = '网页搜索暂时不可用，稍后再试';

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  /** Query keys whose last attempt failed; retried only after a short TTL. */
  private readonly failures = new Map<string, number>();

  constructor(
    private readonly config: SystemConfigService,
    private readonly cache: RedisCacheService,
    private readonly browser: MindBrowserService,
  ) {}

  /**
   * Searches the live web through the headless browser's Bing results page and
   * caches hits in Redis for 15 minutes (best-effort). No endpoint needs to be
   * configured; failures are remembered briefly so one bad query cannot stall
   * every turn.
   */
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

    const failureUntil = this.failures.get(cacheKey);
    if (failureUntil && failureUntil > Date.now()) {
      return { enabled: false, results: [], note: UNAVAILABLE_NOTE };
    }
    this.failures.delete(cacheKey);

    try {
      const results = await this.browser.search(trimmed, limit);
      const response: WebSearchResponse = {
        enabled: true,
        results,
        ...(results.length === 0 ? { note: '没有找到结果' } : {}),
      };
      try {
        await this.cache.set(cacheKey, JSON.stringify(response), CACHE_TTL_SECONDS);
      } catch {
        // Ignore cache failures.
      }
      return response;
    } catch (error) {
      this.rememberFailure(cacheKey);
      this.logger.warn(`网页搜索失败：${error instanceof Error ? error.message : String(error)}`);
      return { enabled: false, results: [], note: UNAVAILABLE_NOTE };
    }
  }

  /**
   * Fetches a single public web page and returns readable text. Only http(s)
   * on standard ports is allowed, every redirect is re-validated, and hosts
   * that resolve to private/link-local addresses are rejected.
   */
  async read(rawUrl: string): Promise<WebReadResult> {
    let current = normalizePublicUrl(rawUrl);
    const allowedHosts = normalizeAllowedHosts(
      await this.config.get<string[]>(CONFIG_KEYS.mindWebAllowedHosts),
    );
    for (let redirects = 0; redirects <= READ_MAX_REDIRECTS; redirects += 1) {
      await assertPublicHost(current, allowedHosts);
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

  /** Records a failed query so the next attempts return immediately for a minute. */
  private rememberFailure(key: string): void {
    if (this.failures.size >= FAILURE_CACHE_LIMIT) {
      const now = Date.now();
      for (const [entryKey, until] of this.failures) {
        if (until <= now) {
          this.failures.delete(entryKey);
        }
      }
      if (this.failures.size >= FAILURE_CACHE_LIMIT) {
        this.failures.clear();
      }
    }
    this.failures.set(key, Date.now() + FAILURE_TTL_MS);
  }
}

/** Statuses that carry a Location header we must follow and re-validate ourselves. */
function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** Extracts and decodes the <title> tag text, falling back to an empty string. */
function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = match?.[1];
  return title
    ? decodeEntities(title.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

/** Crude html-to-text: drops script/style/comments and maps block ends to newlines. */
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

/** Expands the common named and numeric html entities left after tag stripping. */
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

/** Small base36 hash used to key cache entries by query text. */
function hashKey(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
