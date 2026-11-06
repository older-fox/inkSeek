import { BadRequestException, Injectable } from '@nestjs/common';
import type { BilibiliSettings, BilibiliSettingsInput } from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import { CONFIG_KEYS } from './config-keys.js';
import { SystemConfigService } from './system-config.service.js';

const NAV_URL = 'https://api.bilibili.com/x/web-interface/nav';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const REFERER = 'https://www.bilibili.com/';
const PROBE_TIMEOUT_MS = 10_000;

interface BilibiliCookieRecord {
  sessdata?: string;
  uname?: string;
}

interface NavResponse {
  code: number;
  message?: string;
  data?: { isLogin?: boolean; uname?: string };
}

/**
 * Keeps the optional Bilibili login cookie server-side. Only SESSDATA is
 * stored: it is the minimum needed for logged-in-only endpoints such as AI
 * subtitles, and the value never leaves the server.
 */
@Injectable()
export class BilibiliAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SystemConfigService,
  ) {}

  async getCookie(): Promise<string | null> {
    const record = await this.prisma.systemConfig.findUnique({
      where: { key: CONFIG_KEYS.bilibiliCookie },
    });
    const sessdata = readSessdata(record?.value);
    return sessdata ? `SESSDATA=${sessdata}` : null;
  }

  async overview(): Promise<BilibiliSettings | null> {
    const record = await this.prisma.systemConfig.findUnique({
      where: { key: CONFIG_KEYS.bilibiliCookie },
    });
    if (!record) {
      return null;
    }
    const stored = record.value as BilibiliCookieRecord | null;
    return {
      hasCookie: Boolean(stored?.sessdata?.trim()),
      loginName: stored?.uname?.trim() ?? '',
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async save(input: BilibiliSettingsInput): Promise<BilibiliSettings> {
    const record = await this.prisma.systemConfig.findUnique({
      where: { key: CONFIG_KEYS.bilibiliCookie },
    });
    const stored = record?.value as BilibiliCookieRecord | null;
    const existing = stored?.sessdata?.trim() ?? '';

    if (input.clearCookie) {
      await this.config.set(CONFIG_KEYS.bilibiliCookie, { sessdata: '', uname: '' }, true);
      return {
        hasCookie: false,
        loginName: '',
        updatedAt: new Date().toISOString(),
      };
    }

    const incoming = input.sessdata?.trim() ? extractSessdata(input.sessdata) : '';
    const sessdata = incoming || existing;
    if (!sessdata) {
      throw new BadRequestException({
        code: 'BILIBILI_COOKIE_REQUIRED',
        message: '请填写 B 站 Cookie 中的 SESSDATA',
        fieldErrors: { sessdata: ['请填写 B 站 Cookie 中的 SESSDATA'] },
      });
    }

    const nav = await probeLogin(sessdata);
    if (!nav.isLogin) {
      throw new BadRequestException({
        code: 'BILIBILI_COOKIE_INVALID',
        message: 'SESSDATA 无效或已过期，请重新登录 B 站后复制',
        fieldErrors: { sessdata: ['SESSDATA 无效或已过期'] },
      });
    }

    await this.config.set(
      CONFIG_KEYS.bilibiliCookie,
      { sessdata, uname: nav.uname ?? stored?.uname ?? '' },
      true,
    );
    return {
      hasCookie: true,
      loginName: nav.uname ?? stored?.uname ?? '',
      updatedAt: new Date().toISOString(),
    };
  }
}

async function probeLogin(sessdata: string): Promise<{ isLogin: boolean; uname?: string }> {
  let response: Response;
  try {
    response = await fetch(NAV_URL, {
      headers: {
        'user-agent': USER_AGENT,
        referer: REFERER,
        cookie: `SESSDATA=${sessdata}`,
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new BadRequestException({
      code: 'BILIBILI_PROBE_FAILED',
      message: `无法连接 B 站校验登录状态：${error instanceof Error ? error.message : String(error)}`,
    });
  }
  if (!response.ok) {
    throw new BadRequestException({
      code: 'BILIBILI_PROBE_FAILED',
      message: `B 站返回 ${response.status}，请稍后重试`,
    });
  }
  const json = (await response.json().catch(() => null)) as NavResponse | null;
  return {
    isLogin: json?.data?.isLogin === true,
    uname: json?.data?.uname,
  };
}

function readSessdata(value: unknown): string {
  const record = value as BilibiliCookieRecord | null;
  return typeof record?.sessdata === 'string' ? record.sessdata.trim() : '';
}

function extractSessdata(input: string): string {
  const text = input.trim();
  const match = text.match(/(?:^|[;\s])SESSDATA=([^;\s]+)/i);
  if (match?.[1]) {
    return match[1].trim();
  }
  if (/[;=]/.test(text)) {
    throw new BadRequestException({
      code: 'BILIBILI_COOKIE_INVALID',
      message: '请从浏览器 Cookie 中复制 SESSDATA 的值，不要粘贴整段 Cookie',
      fieldErrors: { sessdata: ['只需要 SESSDATA 的值'] },
    });
  }
  if (!/^[\x21-\x7e]+$/.test(text)) {
    throw new BadRequestException({
      code: 'BILIBILI_COOKIE_INVALID',
      message: 'SESSDATA 含有无效字符，请重新复制',
      fieldErrors: { sessdata: ['SESSDATA 含有无效字符'] },
    });
  }
  return text;
}
