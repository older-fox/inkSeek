import { BadRequestException, Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { PhoneDeviceInfo, PhoneDeviceList, PhoneSettings } from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';

const execFileAsync = promisify(execFile);
const ADB_TIMEOUT_MS = 15_000;
const ADB_MAX_BUFFER = 20 * 1024 * 1024;
const MAX_ELEMENTS = 60;

const KEY_CODES: Record<string, number> = {
  back: 4,
  home: 3,
  recents: 187,
  enter: 66,
  delete: 67,
  tab: 61,
  escape: 111,
  volume_up: 24,
  volume_down: 25,
  power: 26,
  wakeup: 224,
  sleep: 223,
};

export interface PhoneScreen {
  device: string;
  size: string;
  package: string;
  elements: string[];
  note?: string;
}

export interface PhoneActionInput {
  action: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  duration?: number;
  key?: string;
  text?: string;
  target?: string;
}

export interface PhoneActionResult {
  ok: true;
  action: string;
  detail: string;
  note: string;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface OpenNode {
  clickable: boolean;
  bounds: Bounds | null;
}

/**
 * Thin gateway over the local adb binary. The phone stays a separate device:
 * the platform only discovers it, remembers the chosen serial, and exposes
 * screen reading plus a small set of input actions to the agent.
 */
@Injectable()
export class PhoneService {
  private adb: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async status(): Promise<PhoneSettings> {
    const adbPath = this.adbPath();
    let version: string;
    try {
      const output = await this.runText(['version'], 8_000);
      version = output.split(/\r?\n/u)[0]?.trim() ?? '';
    } catch (error) {
      return {
        adbAvailable: false,
        adbPath,
        adbVersion: '',
        devices: [],
        error: `无法运行 adb：${messageOf(error)}`,
      };
    }

    try {
      const devices = await this.listDevices();
      return {
        adbAvailable: true,
        adbPath,
        adbVersion: version,
        devices,
        error: '',
      };
    } catch (error) {
      return {
        adbAvailable: true,
        adbPath,
        adbVersion: version,
        devices: [],
        error: `读取设备列表失败：${messageOf(error)}`,
      };
    }
  }

  async devices(): Promise<PhoneDeviceList> {
    const status = await this.status();
    return {
      adbAvailable: status.adbAvailable,
      devices: status.devices,
      error: status.error,
    };
  }

  async connect(address: string): Promise<PhoneSettings> {
    await this.assertAdb();
    const target = normalizeAddress(address);
    const output = await this.runText(['connect', target], 20_000).catch((error) => {
      throw new BadRequestException({
        code: 'PHONE_CONNECT_FAILED',
        message: `连接失败：${messageOf(error)}`,
      });
    });
    if (/failed|cannot|unable|error/iu.test(output)) {
      throw new BadRequestException({
        code: 'PHONE_CONNECT_FAILED',
        message: output.trim() || '连接失败，请检查 IP 和端口',
      });
    }

    await delay(400);
    const devices = await this.listDevices();
    const device = devices.find((item) => item.serial === target);
    if (device?.state === 'unauthorized') {
      throw new BadRequestException({
        code: 'PHONE_UNAUTHORIZED',
        message: '已连接但未授权：请在手机上确认无线调试授权',
      });
    }
    return this.status();
  }

  async pair(address: string, code: string): Promise<PhoneSettings> {
    await this.assertAdb();
    const target = normalizeAddress(address);
    const output = await this.runText(['pair', target, code], 30_000).catch((error) => {
      throw new BadRequestException({
        code: 'PHONE_PAIR_FAILED',
        message: `配对失败：${messageOf(error)}`,
      });
    });
    if (/failed|error|cannot|unable/iu.test(output)) {
      throw new BadRequestException({
        code: 'PHONE_PAIR_FAILED',
        message: output.trim() || '配对失败，请检查配对地址和 6 位配对码',
      });
    }
    return this.status();
  }

  async disconnect(address?: string): Promise<PhoneSettings> {
    await this.assertAdb();
    const target = address?.trim() ? normalizeAddress(address) : '';
    await this.runText(target ? ['disconnect', target] : ['disconnect'], 10_000);
    return this.status();
  }

  async screen(channelId: string): Promise<PhoneScreen> {
    const serial = await this.requireDevice(channelId);
    const remote = `/sdcard/inkseek-ui-${Date.now()}.xml`;
    const dump = await this.runText(
      ['-s', serial, 'shell', 'uiautomator', 'dump', remote],
      25_000,
    ).catch((error) => {
      throw new Error(`读取界面失败：${messageOf(error)}`);
    });
    if (!/dumped to/iu.test(dump)) {
      throw new Error(`读取界面失败：${compact(dump) || '当前界面没有返回结构'}`);
    }
    const xml = await this.runText(['-s', serial, 'exec-out', 'cat', remote], 15_000).catch(
      () => '',
    );
    await this.runText(['-s', serial, 'shell', 'rm', '-f', remote], 5_000).catch(
      () => undefined,
    );
    if (!xml.includes('<hierarchy')) {
      throw new Error('没有读到界面结构；确认手机已解锁，并允许调试');
    }
    return summarizeUiDump(xml, serial);
  }

  async act(channelId: string, input: PhoneActionInput): Promise<PhoneActionResult> {
    const serial = await this.requireDevice(channelId);
    const action = input.action.trim().toLowerCase();

    if (action === 'tap') {
      const x = coordinate(input.x, 'x');
      const y = coordinate(input.y, 'y');
      await this.shell(serial, ['input', 'tap', String(x), String(y)]);
      return actionDone(action, `点按 (${x}, ${y})`);
    }

    if (action === 'swipe') {
      const x1 = coordinate(input.x1, 'x1');
      const y1 = coordinate(input.y1, 'y1');
      const x2 = coordinate(input.x2, 'x2');
      const y2 = coordinate(input.y2, 'y2');
      const duration = Math.round(clamp(input.duration ?? 300, 100, 2000));
      await this.shell(serial, [
        'input',
        'swipe',
        String(x1),
        String(y1),
        String(x2),
        String(y2),
        String(duration),
      ]);
      return actionDone(action, `从 (${x1}, ${y1}) 滑到 (${x2}, ${y2})`);
    }

    if (action === 'key') {
      const key = (input.key ?? '').trim().toLowerCase();
      const code = /^\d{1,3}$/u.test(key) ? Number(key) : KEY_CODES[key];
      if (!code) {
        throw new Error(
          `不支持的按键：${key || '(空)'}；可用 ${Object.keys(KEY_CODES).join('/')} 或数字 keycode`,
        );
      }
      await this.shell(serial, ['input', 'keyevent', String(code)]);
      return actionDone(action, `按键 ${key || code}`);
    }

    if (action === 'type') {
      const text = (input.text ?? '').slice(0, 500);
      if (!text) {
        throw new Error('text 不能为空');
      }
      if (!/^[\x20-\x7e]+$/u.test(text)) {
        throw new Error('adb 直接输入只支持英文、数字和符号；中文请用手机自带的输入法输入');
      }
      const payload = text.replaceAll(' ', '%s');
      await this.shell(serial, ['input', 'text', shellQuote(payload)]);
      return actionDone(action, `输入 ${text.length} 个字符`);
    }

    if (action === 'open') {
      const target = (input.target ?? '').trim();
      if (!target) {
        throw new Error('target 不能为空；传应用包名或 http 链接');
      }
      if (/^https?:\/\//iu.test(target)) {
        await this.shell(serial, [
          'am',
          'start',
          '-a',
          'android.intent.action.VIEW',
          '-d',
          shellQuote(target),
        ]);
      } else if (/^[A-Za-z][A-Za-z0-9_.]+$/u.test(target)) {
        await this.shell(serial, [
          'monkey',
          '-p',
          target,
          '-c',
          'android.intent.category.LAUNCHER',
          '1',
        ]);
      } else {
        throw new Error('target 只支持应用包名（如 com.android.settings）或 http(s) 链接');
      }
      await delay(800);
      return actionDone(action, `打开 ${target}`);
    }

    throw new Error(
      'action 不支持；可用 tap/swipe/key/type/open',
    );
  }

  private async shell(serial: string, args: string[]): Promise<string> {
    return this.runText(['-s', serial, 'shell', ...args], ADB_TIMEOUT_MS);
  }

  private async requireDevice(channelId: string): Promise<string> {
    const status = await this.status();
    if (!status.adbAvailable) {
      throw new Error(status.error || '没有找到 adb');
    }
    const row = await this.prisma.chatMindSettings.findUnique({
      where: { channelId },
      select: { phoneDevice: true },
    });
    const serial = row?.phoneDevice?.trim() ?? '';
    if (!serial) {
      throw new Error(
        '这个渠道还没有选择手机：请在渠道人格面板 → 心智设置 → 手机设备里选择',
      );
    }
    if (!isWirelessSerial(serial)) {
      throw new Error('这个渠道保存的不是无线 ADB 设备，请重新选择（USB 设备不可用）');
    }
    const device = status.devices.find(
      (item) => item.serial === serial && item.state === 'device',
    );
    if (!device) {
      throw new Error(
        `这个渠道选择的手机 ${serial} 不在线：开启无线调试并重新连接后再试`,
      );
    }
    return serial;
  }

  private async listDevices(): Promise<PhoneDeviceInfo[]> {
    const output = await this.runText(['devices', '-l'], 10_000);
    const devices: PhoneDeviceInfo[] = [];
    for (const line of output.split(/\r?\n/u).slice(1)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('*')) {
        continue;
      }
      const parts = trimmed.split(/\s+/u);
      const serial = parts[0];
      const state = parts[1];
      if (!serial || !state || !isWirelessSerial(serial)) {
        continue;
      }
      const attributes: Record<string, string> = {};
      for (const part of parts.slice(2)) {
        const separator = part.indexOf(':');
        if (separator > 0) {
          attributes[part.slice(0, separator)] = part.slice(separator + 1);
        }
      }
      devices.push({
        serial,
        state,
        model: attributes['model'] ?? '',
        product: attributes['product'] ?? '',
      });
    }
    return devices;
  }

  private adbPath(): string {
    if (!this.adb) {
      this.adb = findAdb();
    }
    return this.adb;
  }

  private async assertAdb(): Promise<void> {
    try {
      await this.runText(['version'], 8_000);
    } catch {
      throw new BadRequestException({
        code: 'ADB_NOT_FOUND',
        message: '没有找到可用的 adb，请安装 Android SDK Platform-Tools',
      });
    }
  }

  private async runText(args: string[], timeout: number): Promise<string> {
    const { stdout } = await execFileAsync(this.adbPath(), args, {
      timeout,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: ADB_MAX_BUFFER,
    });
    return stdout;
  }
}

function findAdb(): string {
  const name = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [
    process.env['ADB_PATH'],
    process.env['ANDROID_HOME']
      ? join(process.env['ANDROID_HOME'], 'platform-tools', name)
      : '',
    process.env['ANDROID_SDK_ROOT']
      ? join(process.env['ANDROID_SDK_ROOT'], 'platform-tools', name)
      : '',
    process.env['LOCALAPPDATA']
      ? join(process.env['LOCALAPPDATA'], 'Android', 'Sdk', 'platform-tools', name)
      : '',
    process.env['HOME']
      ? join(process.env['HOME'], 'Library', 'Android', 'sdk', 'platform-tools', name)
      : '',
    process.env['HOME'] ? join(process.env['HOME'], 'Android', 'Sdk', 'platform-tools', name) : '',
    '/usr/local/bin/adb',
    '/usr/bin/adb',
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return name;
}

/** Wireless debug devices appear either as host:port or as an mDNS service name. */
function isWirelessSerial(serial: string): boolean {
  return (
    /^[A-Za-z0-9.-]+:\d{1,5}$/u.test(serial) ||
    /\._adb-tls-connect\._tcp$/u.test(serial)
  );
}

function normalizeAddress(input: string): string {
  const text = input.trim();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(text)) {
    return `${text}:5555`;
  }
  if (/^[A-Za-z0-9.-]+:\d{1,5}$/u.test(text)) {
    return text;
  }
  throw new BadRequestException({
    code: 'PHONE_ADDRESS_INVALID',
    message: '地址格式不对，请填写 IP:端口，例如 192.168.1.23:37105',
  });
}

function coordinate(value: number | undefined, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`缺少坐标 ${name}`);
  }
  return Math.round(clamp(value, 0, 20_000));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function actionDone(action: string, detail: string): PhoneActionResult {
  return {
    ok: true,
    action,
    detail,
    note: '操作已发送；用 phone.screen 再看一次确认结果',
  };
}

function summarizeUiDump(xml: string, device: string): PhoneScreen {
  const tagPattern = /<node\b([^>]*?)(\/?)>|<\/node>/gu;
  const stack: OpenNode[] = [];
  const seen = new Set<string>();
  const elements: string[] = [];
  let packageName = '';
  let width = 0;
  let height = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(xml))) {
    if (match[0] === '</node>') {
      stack.pop();
      continue;
    }
    const attributes = parseAttributes(match[1] ?? '');
    const bounds = parseBounds(attributes['bounds']);
    const clickable = attributes['clickable'] === 'true';
    if (bounds) {
      width = Math.max(width, bounds.right);
      height = Math.max(height, bounds.bottom);
    }
    if (!packageName && attributes['package']) {
      packageName = attributes['package'];
    }

    let tapBounds: Bounds | null = bounds;
    if (!clickable) {
      tapBounds = null;
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const ancestor = stack[index];
        if (ancestor?.clickable && ancestor.bounds) {
          tapBounds = ancestor.bounds;
          break;
        }
      }
      tapBounds ??= bounds;
    }

    const text = decodeEntities(attributes['text'] ?? '').replace(/\s+/gu, ' ').trim();
    const description = decodeEntities(attributes['content-desc'] ?? '')
      .replace(/\s+/gu, ' ')
      .trim();
    const className = attributes['class'] ?? '';
    const editable = /EditText/u.test(className);
    const password = attributes['password'] === 'true';
    const resourceId = (attributes['resource-id'] ?? '').split('/').pop() ?? '';
    let label = password ? '密码输入框' : text || description;
    if (!label && clickable && resourceId) {
      label = resourceId;
    }
    if (label) {
      label = label.slice(0, 60);
      const kind = editable ? '输入框' : clickable ? '按钮' : '文本';
      const point = tapBounds ? `${center(tapBounds)}` : '无';
      const flags = [attributes['scrollable'] === 'true' ? '可滚动' : '']
        .filter(Boolean)
        .join('｜');
      const line = `${elements.length + 1}. ${label}｜${kind}｜点按(${point})${flags ? `｜${flags}` : ''}`;
      const key = `${label}|${point}`;
      if (!seen.has(key)) {
        seen.add(key);
        elements.push(line);
      }
    }

    if (!match[2]) {
      stack.push({ clickable, bounds });
    }
  }

  const trimmed = elements.slice(0, MAX_ELEMENTS);
  const hidden = elements.length - trimmed.length;
  return {
    device,
    size: width && height ? `${width}x${height}` : '未知',
    package: packageName,
    elements: trimmed,
    ...(hidden > 0
      ? { note: `界面元素较多，只显示前 ${MAX_ELEMENTS} 个；可以先滑动再看` }
      : trimmed.length === 0
        ? { note: '当前界面没有可读元素（可能是锁屏、游戏或视频）；可以先解锁或返回桌面' }
        : {}),
  };
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z][\w-]*)\s*=\s*"([^"]*)"/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const key = match[1];
    if (key) {
      attributes[key] = match[2] ?? '';
    }
  }
  return attributes;
}

function parseBounds(value: string | undefined): Bounds | null {
  const match = value?.match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/u);
  if (!match) {
    return null;
  }
  const [left, top, right, bottom] = match.slice(1).map(Number);
  if (left === undefined || top === undefined || right === undefined || bottom === undefined) {
    return null;
  }
  return { left, top, right, bottom };
}

function center(bounds: Bounds): string {
  return `${Math.round((bounds.left + bounds.right) / 2)},${Math.round(
    (bounds.top + bounds.bottom) / 2,
  )}`;
}

function decodeEntities(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function compact(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().slice(0, 160);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const candidate = error as Error & { stderr?: unknown };
    return typeof candidate.stderr === 'string' && candidate.stderr.trim()
      ? candidate.stderr.trim().slice(0, 200)
      : error.message;
  }
  return String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
