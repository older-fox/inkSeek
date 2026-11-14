import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { access } from 'node:fs/promises';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { LlmService } from '../ai/llm.service.js';
import { CONFIG_KEYS } from '../config/config-keys.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { readVisionTarget } from '../ai/vision-model.service.js';
import { normalizeAllowedHosts } from './web-allowlist.js';
import { assertPublicHost, normalizePublicUrl } from './web-url.js';

export interface BrowserSnapshot {
  title: string;
  url: string;
  text: string;
  elements: string[];
  scroll: { y: number; height: number; viewport: number };
}

export interface BrowserSearchHit {
  title: string;
  snippet: string;
  url: string;
}

export interface BrowserVisit {
  url: string;
  title: string;
  kind: string;
  at: string;
}

interface BrowserSession {
  context: BrowserContext;
  page: Page;
  lastUsed: number;
  visits: BrowserVisit[];
  queue: Promise<unknown>;
}

const IDLE_CLOSE_MS = 10 * 60_000;
const SWEEP_MS = 2 * 60_000;
const BROWSER_RETRY_MS = 30_000;
const NAV_TIMEOUT_MS = 30_000;
const MAX_VISITS = 60;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
/** Reserved session key so searches never mix with a persona's browsing tabs. */
const SEARCH_SESSION = '__web_search__';
const BING_SEARCH_URL = 'https://cn.bing.com/search?q=';
const SEARCH_RESULTS_SCRIPT = String.raw`(() => {
  const items = [...document.querySelectorAll('#b_results > li.b_algo')]
    .filter((item) => !item.classList.contains('b_ad'));
  return items.map((item) => {
    const anchor = item.querySelector('h2 a');
    const paragraph = item.querySelector('.b_caption p, .b_snippet, p');
    return {
      title: anchor ? anchor.innerText.trim() : '',
      url: anchor ? anchor.href : '',
      snippet: paragraph ? paragraph.innerText.trim() : '',
    };
  });
})()`;

const SNAPSHOT_SCRIPT = String.raw`(() => {
  for (const old of document.querySelectorAll('[data-mind-ref]')) {
    old.removeAttribute('data-mind-ref');
  }
  const selector = 'a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]';
  const elements = [];
  let ref = 0;
  for (const el of document.querySelectorAll(selector)) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) {
      continue;
    }
    const raw = el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') ||
      el.getAttribute('placeholder') || (typeof el.value === 'string' ? el.value : '') || '';
    const text = raw.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!text) continue;
    ref += 1;
    el.setAttribute('data-mind-ref', String(ref));
    elements.push('[' + ref + '] ' + el.tagName.toLowerCase() + ' ' + text);
    if (elements.length >= 120) break;
  }
  const body = document.body ? document.body.innerText : '';
  return {
    title: document.title,
    url: location.href,
    text: body.replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000),
    elements,
    scroll: {
      y: Math.round(window.scrollY),
      height: document.body ? document.body.scrollHeight : 0,
      viewport: window.innerHeight,
    },
  };
})()`;

const READ_SCRIPT = String.raw`(() => {
  const body = document.body ? document.body.innerText : '';
  return {
    title: document.title,
    url: location.href,
    text: body.replace(/\n{3,}/g, '\n\n').trim(),
  };
})()`;

/**
 * A real headless Chrome the persona can drive. It uses a dedicated context per
 * persona, so cookies and tabs from learning never leak into chat runs. Only
 * public http(s) pages are allowed; the browser is for reading the web, not
 * for reaching the local network.
 */
@Injectable()
export class MindBrowserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MindBrowserService.name);
  private browserPromise: Promise<Browser | null> | null = null;
  private browserFailedAt = 0;
  private readonly sessions = new Map<string, Promise<BrowserSession>>();
  private readonly live = new Map<string, BrowserSession>();
  /** Kept after close so a learning session can still cite what it read. */
  private readonly history = new Map<string, BrowserVisit[]>();
  private readonly lastUsed = new Map<string, number>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly llm: LlmService,
    private readonly config: SystemConfigService,
  ) {}

  /** Starts the idle-session sweep so abandoned contexts do not leak between runs. */
  onModuleInit(): void {
    this.sweepTimer = setInterval(() => {
      void this.sweep();
    }, SWEEP_MS);
  }

  /** Stops the sweep timer and closes every session before the module is torn down. */
  async onModuleDestroy(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    await this.closeAll();
  }

  /** Navigates to a public http(s) URL and returns its first snapshot; rejects local or non-web hosts. */
  async open(personaId: string, rawUrl: string): Promise<BrowserSnapshot> {
    const url = normalizePublicUrl(rawUrl);
    const allowedHosts = normalizeAllowedHosts(
      await this.config.get<string[]>(CONFIG_KEYS.mindWebAllowedHosts),
    );
    await assertPublicHost(url, allowedHosts);
    return this.run(personaId, async (session) => {
      await this.navigate(session, url.toString());
      return this.snapshotOf(session);
    });
  }

  /** Re-reads the current page's elements and text without navigating. */
  async snapshot(personaId: string): Promise<BrowserSnapshot> {
    return this.run(personaId, (session) => this.snapshotOf(session));
  }

  /**
   * Runs one query on Bing's public results page and returns title/link/snippet
   * hits. Search uses a reserved session so its tabs stay out of persona
   * browsing, and results are read from the live DOM rather than an API.
   */
  async search(query: string, limit = 5): Promise<BrowserSearchHit[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }
    const count = Math.min(20, Math.max(limit + 3, 8));
    const url = `${BING_SEARCH_URL}${encodeURIComponent(trimmed)}&count=${count}`;
    return this.run(SEARCH_SESSION, async (session) => {
      await session.page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      await session.page.waitForSelector('#b_results', { timeout: 10_000 }).catch(() => undefined);
      await session.page.waitForTimeout(500).catch(() => undefined);
      const raw = (await session.page.evaluate(SEARCH_RESULTS_SCRIPT)) as unknown;
      if (!Array.isArray(raw)) {
        return [];
      }
      const seen = new Set<string>();
      const results: BrowserSearchHit[] = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        const record = item as Record<string, unknown>;
        const title = typeof record['title'] === 'string' ? record['title'].trim() : '';
        const href = typeof record['url'] === 'string' ? record['url'].trim() : '';
        const snippet = typeof record['snippet'] === 'string' ? record['snippet'].trim() : '';
        if (!href || (!title && !snippet) || seen.has(href)) {
          continue;
        }
        seen.add(href);
        results.push({
          title: title.slice(0, 200),
          snippet: snippet.slice(0, 500),
          url: href,
        });
        if (results.length >= limit) {
          break;
        }
      }
      return results;
    });
  }

  /** Clicks a snapshotted element by ref or visible text, then re-snapshots once the page settles. */
  async click(personaId: string, input: { ref?: string; text?: string }): Promise<BrowserSnapshot> {
    return this.run(personaId, async (session) => {
      const ref = input.ref?.trim();
      const text = input.text?.trim();
      const page = session.page;
      if (ref) {
        await page
          .locator(`[data-mind-ref="${ref.replace(/[^0-9]/gu, '')}"]`)
          .first()
          .click({
            timeout: 8_000,
          });
      } else if (text) {
        await page.getByText(text, { exact: false }).first().click({ timeout: 8_000 });
      } else {
        throw new Error('click 需要 ref 或 text');
      }
      await this.settle(session);
      return this.snapshotOf(session);
    });
  }

  /** Fills a ref-targeted field (text capped at 500 chars), optionally pressing Enter, then re-snapshots. */
  async type(
    personaId: string,
    input: { ref: string; text: string; submit?: boolean },
  ): Promise<BrowserSnapshot> {
    return this.run(personaId, async (session) => {
      const ref = input.ref.replace(/[^0-9]/gu, '');
      if (!ref) {
        throw new Error('type 需要 ref');
      }
      const locator = session.page.locator(`[data-mind-ref="${ref}"]`).first();
      await locator.fill(input.text.slice(0, 500), { timeout: 8_000 });
      if (input.submit) {
        await locator.press('Enter');
      }
      await this.settle(session);
      return this.snapshotOf(session);
    });
  }

  /** Wheels the page by whole-viewport fractions, clamped to 1-8 pages per call. */
  async scroll(personaId: string, direction: 'down' | 'up', pages = 1): Promise<BrowserSnapshot> {
    return this.run(personaId, async (session) => {
      const page = session.page;
      const viewport = page.viewportSize()?.height ?? 800;
      const delta = Math.max(1, Math.min(8, pages)) * viewport * 0.85;
      await page.mouse.wheel(0, direction === 'up' ? -delta : delta);
      await this.settle(session);
      return this.snapshotOf(session);
    });
  }

  /** Steps back in history when possible; a missing previous entry is swallowed, not an error. */
  async back(personaId: string): Promise<BrowserSnapshot> {
    return this.run(personaId, async (session) => {
      await session.page
        .goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 })
        .catch(() => null);
      await this.settle(session);
      return this.snapshotOf(session);
    });
  }

  /** Returns the current page's visible body text, trimmed to a 1k-12k character budget. */
  async read(
    personaId: string,
    maxChars = 6000,
  ): Promise<{ title: string; url: string; text: string }> {
    return this.run(personaId, async (session) => {
      const raw = (await session.page.evaluate(READ_SCRIPT)) as {
        title?: string;
        url?: string;
        text?: string;
      };
      return {
        title: raw.title ?? '',
        url: raw.url ?? session.page.url(),
        text: (raw.text ?? '').slice(0, Math.max(1000, Math.min(12_000, maxChars))),
      };
    });
  }

  /** Screenshots the viewport and has the vision model describe it; returns a stub if the model returns nothing. */
  async screenshot(
    personaId: string,
    focus?: string,
  ): Promise<{ url: string; title: string; description: string }> {
    return this.run(personaId, async (session) => {
      const buffer = await session.page.screenshot({ type: 'png', fullPage: false });
      const prompt = focus
        ? `这是当前网页的截图。重点看：${focus.slice(0, 160)}。用中文描述可见内容、文字和可操作的位置，只输出描述。`
        : '这是当前网页的截图。用中文描述页面内容、可见文字和主要操作区域，只输出描述。';
      const vision = await readVisionTarget(this.config);
      const completion = await this.llm
        .complete({
          prompt,
          system: '你是网页截图观察器，输出中文描述。',
          images: [{ mimeType: 'image/png', base64: buffer.toString('base64') }],
          providerId: vision.providerId,
          model: vision.model,
          temperature: 0.2,
          maxTokens: 3_000,
          source: 'mind.browser',
          personaId,
        })
        .catch(() => ({ text: '' }));
      return {
        url: session.page.url(),
        title: await session.page.title().catch(() => ''),
        description:
          completion.text.trim().slice(0, 1500) || '截图已保存，但视觉模型没有返回描述。',
      };
    });
  }

  /** Closes a persona's session, keeping its visit history for later citation; true only when one existed. */
  async close(personaId: string): Promise<boolean> {
    const running = this.sessions.get(personaId);
    const live = this.live.get(personaId);
    this.sessions.delete(personaId);
    this.live.delete(personaId);
    this.lastUsed.delete(personaId);
    if (!running) {
      this.retainVisits(personaId, live?.visits ?? []);
      return false;
    }
    const session = await running.catch(() => null);
    await session?.context.close().catch(() => undefined);
    this.retainVisits(personaId, session?.visits ?? live?.visits ?? []);
    return Boolean(session);
  }

  /** Visits recorded during a learning session, even if the browser was closed. */
  recentVisits(personaId: string, since: Date): BrowserVisit[] {
    const live = this.live.get(personaId)?.visits ?? [];
    const kept = this.history.get(personaId) ?? [];
    const byUrl = new Map<string, BrowserVisit>();
    for (const visit of [...kept, ...live]) {
      if (Date.parse(visit.at) >= since.getTime()) {
        byUrl.set(visit.url, visit);
      }
    }
    return [...byUrl.values()].sort((left, right) => left.at.localeCompare(right.at));
  }

  /** Merges a session's visits into the per-persona history, de-duplicated by URL and capped at 120. */
  private retainVisits(personaId: string, visits: readonly BrowserVisit[]): void {
    if (visits.length === 0) {
      return;
    }
    const byUrl = new Map<string, BrowserVisit>();
    for (const visit of [...(this.history.get(personaId) ?? []), ...visits]) {
      byUrl.set(visit.url, visit);
    }
    this.history.set(personaId, [...byUrl.values()].slice(-120));
  }

  /** Serializes a task onto the persona's session queue and stamps last-use on success. */
  private run<T>(personaId: string, task: (session: BrowserSession) => Promise<T>): Promise<T> {
    return this.session(personaId).then((session) => {
      const run = session.queue
        .catch(() => undefined)
        .then(async () => {
          const result = await task(session);
          session.lastUsed = Date.now();
          this.lastUsed.set(personaId, session.lastUsed);
          return result;
        });
      session.queue = run.catch(() => undefined);
      return run;
    });
  }

  /** Returns the persona's session, launching it on demand; a failed launch is evicted so the next call retries. */
  private session(personaId: string): Promise<BrowserSession> {
    const existing = this.sessions.get(personaId);
    if (existing) {
      return existing;
    }
    const created = this.createSession();
    this.sessions.set(personaId, created);
    created
      .then((session) => {
        session.lastUsed = Date.now();
        this.live.set(personaId, session);
        this.lastUsed.set(personaId, session.lastUsed);
      })
      .catch(() => {
        // A failed launch must not pin a rejected promise forever; the next
        // tool call should be allowed to retry.
        if (this.sessions.get(personaId) === created) {
          this.sessions.delete(personaId);
        }
      });
    return created;
  }

  /** Opens a fresh context for one persona, blocking non-public hosts and media/font requests at the router. */
  private async createSession(): Promise<BrowserSession> {
    const browser = await this.ensureBrowser();
    if (!browser) {
      throw new Error(
        '没有找到可用的浏览器（Chrome/Edge/Chromium）；本机请先安装，容器部署请确认镜像内置 Chromium',
      );
    }
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      userAgent: USER_AGENT,
      acceptDownloads: false,
    });
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (!/^https?:/iu.test(requestUrl)) {
        await route.abort().catch(() => undefined);
        return;
      }
      const host = safeHostname(requestUrl);
      if (!host || isLocalHost(host)) {
        await route.abort().catch(() => undefined);
        return;
      }
      if (['media', 'font'].includes(route.request().resourceType())) {
        await route.abort().catch(() => undefined);
        return;
      }
      await route.continue().catch(() => undefined);
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const session: BrowserSession = {
      context,
      page,
      lastUsed: Date.now(),
      visits: [],
      queue: Promise.resolve(),
    };
    context.on('page', (opened) => {
      session.page = opened;
    });
    context.on('close', () => {
      this.logger.warn('浏览器上下文已关闭');
    });
    return session;
  }

  /** Lazily launches the shared browser; a dead or missing launch is retried only after the backoff window. */
  private async ensureBrowser(): Promise<Browser | null> {
    if (!this.browserPromise) {
      // No Chrome/Edge is an environment fact, not a transient failure: retry
      // later instead of recursing forever and hanging every browser tool.
      if (Date.now() - this.browserFailedAt < BROWSER_RETRY_MS) {
        return null;
      }
      this.browserPromise = this.launch();
    }
    const browser = await this.browserPromise;
    if (browser && browser.isConnected()) {
      return browser;
    }
    this.browserPromise = null;
    this.browserFailedAt = Date.now();
    return null;
  }

  /**
   * Launches headless. A system Chrome/Edge wins when present (dev machines);
   * otherwise Playwright's bundled Chromium is used, which is what the runtime
   * image installs. Returns null when neither can start.
   */
  private async launch(): Promise<Browser | null> {
    const executablePath = await findBrowserExecutable();
    try {
      const browser = await chromium.launch({
        ...(executablePath ? { executablePath } : {}),
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--disable-background-networking',
          '--lang=zh-CN',
        ],
      });
      this.logger.log(`无头浏览器已启动：${executablePath ?? 'Playwright 内置 Chromium'}`);
      return browser;
    } catch (error) {
      this.logger.warn(
        `无头浏览器启动失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /** Navigates to a URL and records the visit once the page has settled. */
  private async navigate(session: BrowserSession, url: string): Promise<void> {
    const page = session.page;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await this.settle(session);
  }

  /** Waits for the page to calm down, then appends or refreshes the current URL in the capped visit list. */
  private async settle(session: BrowserSession): Promise<void> {
    await session.page.waitForTimeout(900).catch(() => undefined);
    const title = await session.page.title().catch(() => '');
    const url = session.page.url();
    if (!url || !/^https?:/iu.test(url)) {
      return;
    }
    const last = session.visits.at(-1);
    if (last?.url === url && last.title === title) {
      last.at = new Date().toISOString();
      return;
    }
    session.visits.push({
      url,
      title: title.slice(0, 120),
      kind: 'browser',
      at: new Date().toISOString(),
    });
    if (session.visits.length > MAX_VISITS) {
      session.visits.splice(0, session.visits.length - MAX_VISITS);
    }
  }

  /** Evaluates the snapshot script and normalizes element/scroll output, capping the element list. */
  private async snapshotOf(session: BrowserSession): Promise<BrowserSnapshot> {
    const raw = (await session.page.evaluate(SNAPSHOT_SCRIPT)) as {
      title?: string;
      url?: string;
      text?: string;
      elements?: string[];
      scroll?: { y?: number; height?: number; viewport?: number };
    };
    return {
      title: raw.title ?? '',
      url: raw.url ?? session.page.url(),
      text: raw.text ?? '',
      elements: Array.isArray(raw.elements) ? raw.elements.slice(0, 120) : [],
      scroll: {
        y: Number(raw.scroll?.y ?? 0),
        height: Number(raw.scroll?.height ?? 0),
        viewport: Number(raw.scroll?.viewport ?? 0),
      },
    };
  }

  /** Periodically closes sessions idle past the timeout, retaining their visits before dropping them. */
  private async sweep(): Promise<void> {
    const now = Date.now();
    for (const [personaId, running] of this.sessions) {
      const used = this.lastUsed.get(personaId) ?? 0;
      if (now - used < IDLE_CLOSE_MS) {
        continue;
      }
      this.sessions.delete(personaId);
      this.live.delete(personaId);
      this.lastUsed.delete(personaId);
      const session = await running.catch(() => null);
      await session?.context.close().catch(() => undefined);
      this.retainVisits(personaId, session?.visits ?? []);
      this.logger.log(`浏览器会话空闲关闭：${personaId}`);
    }
  }

  /** Tears down every session and the shared browser during module shutdown, retaining all visits. */
  private async closeAll(): Promise<void> {
    const sessions = [...this.sessions.entries()];
    this.sessions.clear();
    this.live.clear();
    this.lastUsed.clear();
    for (const [personaId, running] of sessions) {
      const session = await running.catch(() => null);
      await session?.context.close().catch(() => undefined);
      this.retainVisits(personaId, session?.visits ?? []);
    }
    const browser = await this.browserPromise?.catch(() => null);
    this.browserPromise = null;
    await browser?.close().catch(() => undefined);
  }
}

/** Probes the platform's common Chrome/Edge install paths and returns the first executable found. */
async function findBrowserExecutable(): Promise<string | null> {
  const override = process.env['MIND_BROWSER_EXECUTABLE']?.trim();
  if (override) {
    try {
      await access(override);
      return override;
    } catch {
      // Fall through to the platform probe list.
    }
  }
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          `${process.env['LOCALAPPDATA'] ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
          ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next one.
    }
  }
  return null;
}

/** Lowercased host of a URL, or an empty string when it cannot be parsed. */
function safeHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.trim().toLowerCase();
  } catch {
    return '';
  }
}

/** True for localhost and private/link-reserved ranges that headless browsing must never reach. */
function isLocalHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }
  if (host === '::1' || host === '0.0.0.0') {
    return true;
  }
  if (/^127\./u.test(host) || /^10\./u.test(host) || /^192\.168\./u.test(host)) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./u.test(host)) {
    return true;
  }
  if (/^169\.254\./u.test(host)) {
    return true;
  }
  return false;
}
