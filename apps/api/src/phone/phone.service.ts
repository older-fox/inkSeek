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
  menu: 82,
  enter: 66,
  delete: 67,
  tab: 61,
  escape: 111,
  space: 62,
  volume_up: 24,
  volume_down: 25,
  volume_mute: 164,
  power: 26,
  wakeup: 224,
  sleep: 223,
  camera: 27,
  search: 84,
  media_play_pause: 85,
  media_stop: 86,
  media_next: 87,
  media_previous: 88,
  media_play: 126,
  media_pause: 127,
  media_rewind: 89,
  media_fast_forward: 90,
  dpad_up: 19,
  dpad_down: 20,
  dpad_left: 21,
  dpad_right: 22,
  dpad_center: 23,
  page_up: 92,
  page_down: 93,
  move_home: 122,
  move_end: 123,
  ctrl: 113,
  ctrl_left: 113,
  ctrl_right: 114,
  shift: 59,
  shift_left: 59,
  alt: 57,
  alt_left: 57,
  meta: 117,
  capslock: 115,
};

/**
 * Package → everyday Chinese name. Labels live in APK resources, which adb
 * cannot read without pulling the whole APK; this small table keeps common
 * apps addressable by the names the persona would actually use.
 */
const APP_ALIASES: Record<string, string> = {
  'com.tencent.mm': '微信',
  'com.tencent.mobileqq': 'QQ',
  'com.eg.android.AlipayGphone': '支付宝',
  'com.taobao.taobao': '淘宝',
  'com.jingdong.app.mall': '京东',
  'com.xingin.xhs': '小红书',
  'com.ss.android.ugc.aweme': '抖音',
  'tv.danmaku.bili': '哔哩哔哩',
  'com.sina.weibo': '微博',
  'com.netease.cloudmusic': '网易云音乐',
  'com.tencent.qqmusic': 'QQ音乐',
  'com.android.settings': '设置',
  'com.android.camera': '相机',
  'com.miui.gallery': '相册',
  'com.android.mms': '短信',
  'com.android.contacts': '联系人',
  'com.android.dialer': '电话',
  'com.android.browser': '浏览器',
  'com.android.calendar': '日历',
  'com.miui.calculator': '计算器',
  'com.miui.weather2': '天气',
  'com.baidu.BaiduMap': '百度地图',
  'com.autonavi.minimap': '高德地图',
  'com.miui.video': '视频',
  'com.miui.player': '音乐',
  'com.android.fileexplorer': '文件管理',
  'com.xiaomi.market': '应用商店',
  'com.miui.notes': '笔记',
  'com.miui.screenrecorder': '录屏',
  'com.xiaomi.scanner': '扫一扫',
  'com.mi.health': '健康',
  'com.android.deskclock': '时钟',
  'com.miui.securitycenter': '安全中心',
  'com.happyelements.AndroidAnimal': '开心消消乐',
  'com.whatsapp': 'WhatsApp',
};

const MEDIA_ACTIONS: Record<string, string> = {
  play: 'play',
  pause: 'pause',
  'play-pause': 'play-pause',
  play_pause: 'play-pause',
  next: 'next',
  previous: 'previous',
  prev: 'previous',
  stop: 'stop',
  mute: 'mute',
  'fast-forward': 'fast-forward',
  fast_forward: 'fast-forward',
  rewind: 'rewind',
  record: 'record',
  headsethook: 'headsethook',
};

const MEDIA_STATES: Record<number, string> = {
  0: 'none',
  1: 'stopped',
  2: 'paused',
  3: 'playing',
  4: 'fast_forwarding',
  5: 'rewinding',
  6: 'buffering',
  7: 'error',
  8: 'connecting',
  9: 'skipping',
};

export interface PhoneScreen {
  device: string;
  size: string;
  package: string;
  elements: string[];
  note?: string;
}

export interface PhoneScreenshot {
  device: string;
  mimeType: 'image/png';
  /** Base64 payload without the `data:` prefix. */
  base64: string;
  width: number;
  height: number;
  bytes: number;
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
  keys?: string[];
  text?: string;
  target?: string;
  level?: number;
  direction?: string;
  stream?: string;
  mode?: string;
}

export interface PhoneApp {
  package: string;
  label: string;
  path: string;
}

export interface PhoneNotification {
  package: string;
  label: string;
  title: string;
  text: string;
  when: string;
}

export interface PhoneMediaSession {
  package: string;
  label: string;
  title: string;
  artist: string;
  album: string;
  state: string;
  positionMs: number;
}

export interface PhoneSystemState {
  battery: { level: number; charging: boolean } | null;
  brightness: { value: number; auto: boolean } | null;
  volume: { value: number; max: number } | null;
  ringerMode: string;
  wifi: { enabled: boolean; connected: boolean; ssid: string; ip: string } | null;
  airplane: boolean;
  storage: { total: string; available: string; usedPercent: number } | null;
  screen: { size: string; density: number; rotation: number; on: boolean | null } | null;
  currentApp: { package: string; activity: string } | null;
  location: { provider: string; lat: number; lng: number; age: string } | null;
}

export interface PhonePhoto {
  id: string;
  name: string;
  bucket: string;
  dateAdded: string;
  durationMs: number;
}

export interface PhonePhotoBytes {
  id: string;
  mimeType: string;
  base64: string;
  bytes: number;
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

  /** Runs adb once and reports availability plus the connected devices; never throws. */
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

  /** Device-picker payload: like status(), but without the adb binary diagnostics. */
  async devices(): Promise<PhoneDeviceList> {
    const status = await this.status();
    return {
      adbAvailable: status.adbAvailable,
      devices: status.devices,
      error: status.error,
    };
  }

  /** Connects over TCP and reports the authorization prompt as a distinct error. */
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

  /** Exchanges the wireless-debugging pairing code, then re-reads the device list. */
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

  /** Drops the given TCP device, or every device when no address is given. */
  async disconnect(address?: string): Promise<PhoneSettings> {
    await this.assertAdb();
    const target = address?.trim() ? normalizeAddress(address) : '';
    await this.runText(target ? ['disconnect', target] : ['disconnect'], 10_000);
    return this.status();
  }

  /** Non-throwing lookup used by autonomous focus and tool pre-checks. */
  async deviceFor(
    channelId: string,
  ): Promise<{ serial: string | null; online: boolean; error: string }> {
    const status = await this.status();
    if (!status.adbAvailable) {
      return { serial: null, online: false, error: status.error || '没有找到 adb' };
    }
    const row = await this.prisma.chatMindSettings.findUnique({
      where: { channelId },
      select: { phoneDevice: true },
    });
    const serial = row?.phoneDevice?.trim() ?? '';
    if (!serial) {
      return { serial: null, online: false, error: '这个渠道还没有选择手机' };
    }
    const device = status.devices.find(
      (item) => item.serial === serial && item.state === 'device',
    );
    return {
      serial,
      online: Boolean(device),
      error: device ? '' : `手机 ${serial} 不在线`,
    };
  }

  /** Dumps the accessibility tree; needs an unlocked, awake screen or the dump is useless. */
  async screen(channelId: string): Promise<PhoneScreen> {
    const serial = await this.requireDevice(channelId);
    if ((await this.readScreenOn(serial)) === false) {
      throw new Error('屏幕现在是熄的；先用 phone.act 的 screen 动作（mode=on）点亮');
    }
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

  /**
   * Raw PNG screencap. Canvas UIs (games, video, Flutter) expose no
   * accessibility nodes, so a picture is the only way to see them.
   */
  async screenshot(channelId: string): Promise<PhoneScreenshot> {
    const serial = await this.requireDevice(channelId);
    const buffer = await this.runBuffer(
      ['-s', serial, 'exec-out', 'screencap', '-p'],
      20_000,
    ).catch((error) => {
      throw new Error(`截屏失败：${messageOf(error)}`);
    });
    const size = pngSize(buffer);
    if (!size) {
      throw new Error('截屏失败：手机返回的不是 PNG 图片');
    }
    return {
      device: serial,
      mimeType: 'image/png',
      base64: buffer.toString('base64'),
      width: size.width,
      height: size.height,
      bytes: buffer.length,
    };
  }

  /**
   * Battery level is a fact the phone decision needs: running a game until the
   * device dies loses the session. Never blocks on failure — callers treat
   * null as "unknown".
   */
  async battery(
    channelId: string,
  ): Promise<{ level: number; charging: boolean } | null> {
    const serial = await this.requireDevice(channelId);
    return this.batteryOf(serial);
  }

  /** Installed apps. Labels are only known for the alias table; package names are authoritative. */
  async apps(
    channelId: string,
    options: { query?: string; includeSystem?: boolean; limit?: number } = {},
  ): Promise<PhoneApp[]> {
    const serial = await this.requireDevice(channelId);
    const query = (options.query ?? '').trim().toLowerCase();
    const limit = Math.max(1, Math.min(300, Math.round(options.limit ?? 80)));
    const apps = (await this.listApps(serial, options.includeSystem ?? false)).filter(
      (app) =>
        !query ||
        app.package.toLowerCase().includes(query) ||
        app.label.toLowerCase().includes(query),
    );
    return apps
      .sort((left, right) => {
        if (left.label !== right.label) {
          if (!left.label) return 1;
          if (!right.label) return -1;
          return left.label.localeCompare(right.label, 'zh');
        }
        return left.package.localeCompare(right.package);
      })
      .slice(0, limit);
  }

  /** Currently posted notifications, parsed from dumpsys (title/text are the useful bits). */
  async notifications(channelId: string, limit = 20): Promise<PhoneNotification[]> {
    const serial = await this.requireDevice(channelId);
    const output = await this.shell(serial, ['dumpsys', 'notification', '--noredact']);
    const records: PhoneNotification[] = [];
    let current: (PhoneNotification & { key: string }) | null = null;
    /** Closes the block being parsed; notifications with neither title nor text are noise. */
    const flush = () => {
      if (!current) {
        return;
      }
      const record = current;
      current = null;
      if (!record.title && !record.text) {
        return;
      }
      // Group summaries duplicate their children and are rarely what a person means.
      if (record.key.includes('ranker_group')) {
        return;
      }
      records.push({
        package: record.package,
        label: record.label,
        title: record.title,
        text: record.text,
        when: record.when,
      });
    };
    for (const raw of output.split(/\r?\n/u)) {
      const line = raw.trim();
      const start = /^NotificationRecord\(.*?\bpkg=([^\s]+)/u.exec(line);
      if (start) {
        flush();
        const pkg = start[1] ?? '';
        current = {
          package: pkg,
          label: APP_ALIASES[pkg] ?? '',
          title: '',
          text: '',
          when: '',
          key: '',
        };
        continue;
      }
      if (!current) {
        continue;
      }
      const key = /^key=([^\s]+)/u.exec(line);
      if (key) {
        current.key = key[1] ?? '';
        continue;
      }
      const when = /^when=(\d+)/u.exec(line);
      if (when) {
        const stamp = Number(when[1]);
        // Persistent notifications carry when=0; epoch 1970 helps nobody.
        if (stamp > 1_000_000_000_000) {
          current.when = new Date(stamp).toISOString();
        }
        continue;
      }
      const title = /^android\.title=String \((.*)\)$/u.exec(line);
      if (title) {
        current.title = title[1] ?? '';
        continue;
      }
      const text = /^android\.text=String \((.*)\)$/u.exec(line);
      if (text) {
        current.text = text[1] ?? '';
      }
    }
    flush();
    return records.slice(0, Math.max(1, Math.min(40, Math.round(limit))));
  }

  /** Active media sessions: enough for "what is playing" without opening the app. */
  async mediaSessions(channelId: string): Promise<PhoneMediaSession[]> {
    const serial = await this.requireDevice(channelId);
    const output = await this.shell(serial, ['dumpsys', 'media_session']);
    const sessions: PhoneMediaSession[] = [];
    let current: (PhoneMediaSession & { rawState: number }) | null = null;
    /** Closes the block being parsed; the framework's own server packages are not real sessions. */
    const flush = () => {
      if (!current) {
        return;
      }
      const record = current;
      current = null;
      if (!record.package || /^com\.android\.server\./u.test(record.package)) {
        return;
      }
      if (!record.title && record.rawState === 0) {
        return;
      }
      sessions.push({
        package: record.package,
        label: record.label,
        title: record.title,
        artist: record.artist,
        album: record.album,
        state: MEDIA_STATES[record.rawState] ?? 'unknown',
        positionMs: record.positionMs,
      });
    };
    for (const raw of output.split(/\r?\n/u)) {
      const line = raw.trim();
      const pkg = /^package=(.+)$/u.exec(line);
      if (pkg) {
        flush();
        const name = pkg[1]?.trim() ?? '';
        current = {
          package: name,
          label: APP_ALIASES[name] ?? '',
          title: '',
          artist: '',
          album: '',
          state: 'none',
          positionMs: 0,
          rawState: 0,
        };
        continue;
      }
      if (!current) {
        continue;
      }
      const title = /^title=(.+)$/u.exec(line);
      if (title) {
        current.title = title[1]?.trim() ?? '';
        continue;
      }
      const artist = /^artist=(.+)$/u.exec(line);
      if (artist) {
        current.artist = artist[1]?.trim() ?? '';
        continue;
      }
      const album = /^album=(.+)$/u.exec(line);
      if (album) {
        current.album = album[1]?.trim() ?? '';
        continue;
      }
      const state = /state=(\d+)/u.exec(line);
      if (state && line.includes('PlaybackState')) {
        current.rawState = Number(state[1]);
        continue;
      }
      const position = /position=(\d+)/u.exec(line);
      if (position && line.includes('PlaybackState')) {
        current.positionMs = Number(position[1]);
      }
    }
    flush();
    return sessions;
  }

  /** One compact snapshot of the things a person would glance at on their phone. */
  async system(channelId: string): Promise<PhoneSystemState> {
    const serial = await this.requireDevice(channelId);
    const [
      battery,
      brightnessRaw,
      brightnessMode,
      volumeRaw,
      audio,
      wifi,
      airplaneRaw,
      storage,
      screenSize,
      densityRaw,
      rotationRaw,
      screenStateRaw,
      wakefulnessRaw,
      focusLine,
      locationLine,
    ] = await Promise.all([
      this.batteryOf(serial),
      this.shell(serial, ['settings', 'get', 'system', 'screen_brightness']).catch(() => ''),
      this.shell(serial, ['settings', 'get', 'system', 'screen_brightness_mode']).catch(() => ''),
      this.shell(serial, ['cmd', 'media_session', 'volume', '--get']).catch(() => ''),
      this.shell(serial, ['dumpsys', 'audio']).catch(() => ''),
      this.shell(serial, ['cmd', 'wifi', 'status']).catch(() => ''),
      this.shell(serial, ['settings', 'get', 'global', 'airplane_mode_on']).catch(() => ''),
      this.shell(serial, ['df', '-h', '/sdcard']).catch(() => ''),
      this.shell(serial, ['wm', 'size']).catch(() => ''),
      this.shell(serial, ['wm', 'density']).catch(() => ''),
      this.shell(serial, ['dumpsys window displays | grep -m1 mRotation=']).catch(() => ''),
      this.shell(serial, ['dumpsys display | grep -m1 mScreenState=']).catch(() => ''),
      this.shell(serial, ['dumpsys power | grep -m1 mWakefulness=']).catch(() => ''),
      this.shell(serial, ['dumpsys window | grep -m1 mCurrentFocus']).catch(() => ''),
      this.shell(serial, ['dumpsys location | grep -m1 "last location="']).catch(() => ''),
    ]);

    const brightnessValue = Number(brightnessRaw.trim());
    const volumeMatch = /volume is (\d+) in range \[0\.\.(\d+)\]/u.exec(volumeRaw);
    const ringer = /mode \(external\) = (\w+)/u.exec(audio);
    const wifiEnabled = /^Wifi is enabled/mu.test(wifi);
    const wifiSsid = /connected to "([^"]+)"/u.exec(wifi)?.[1] ?? '';
    const wifiIp = /IP: \/([0-9.]+)/u.exec(wifi)?.[1] ?? '';
    // df -h columns: filesystem, size, used, available, use%, mount.
    const storageLine = storage
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.includes('%'))
      .at(-1);
    const storageTokens = storageLine?.split(/\s+/u) ?? [];
    const sizeMatch = /(\d+x\d+)/u.exec(screenSize);
    const density = Number(/Physical density: (\d+)/u.exec(densityRaw)?.[1] ?? 0);
    const rotation = Number(/mRotation=(\d+)/u.exec(rotationRaw)?.[1] ?? 0);
    const screenState = /mScreenState=(\w+)/u.exec(screenStateRaw)?.[1] ?? '';
    const wakefulness = /mWakefulness=(\w+)/u.exec(wakefulnessRaw)?.[1] ?? '';
    const screenOn = screenState
      ? screenState === 'ON'
      : wakefulness
        ? wakefulness === 'Awake'
        : null;
    const focus = /u0 ([^\s/}]+)\/([^\s}]+)/u.exec(focusLine);
    const locationResult = /Location\[(\w+) ([-\d.]+),([-\d.]+)[^\]]*et=\+([^\s\]]+)/u.exec(
      locationLine,
    );

    return {
      battery,
      brightness:
        Number.isFinite(brightnessValue) && brightnessValue >= 0
          ? { value: brightnessValue, auto: brightnessMode.trim() === '1' }
          : null,
      volume: volumeMatch
        ? { value: Number(volumeMatch[1]), max: Number(volumeMatch[2]) }
        : null,
      ringerMode: ringer?.[1]?.toLowerCase() ?? 'unknown',
      wifi: wifiEnabled
        ? {
            enabled: true,
            connected: Boolean(wifiSsid),
            ssid: wifiSsid,
            ip: wifiIp,
          }
        : { enabled: false, connected: false, ssid: '', ip: '' },
      airplane: airplaneRaw.trim() === '1',
      storage:
        storageTokens.length >= 5
          ? {
              total: storageTokens[1] ?? '',
              available: storageTokens[3] ?? '',
              usedPercent: Number((storageTokens[4] ?? '').replace('%', '')) || 0,
            }
          : null,
      screen: sizeMatch
        ? { size: sizeMatch[1] ?? '', density, rotation, on: screenOn }
        : null,
      currentApp: focus
        ? { package: focus[1] ?? '', activity: focus[2] ?? '' }
        : null,
      location: locationResult
        ? {
            provider: locationResult[1] ?? '',
            lat: Number(locationResult[2]),
            lng: Number(locationResult[3]),
            age: locationResult[4] ?? '',
          }
        : null,
    };
  }

  /** Recent gallery items straight from MediaStore; no file walking needed. */
  async photos(
    channelId: string,
    options: { kind?: 'image' | 'video'; limit?: number } = {},
  ): Promise<PhonePhoto[]> {
    const serial = await this.requireDevice(channelId);
    const kind = options.kind === 'video' ? 'video' : 'image';
    const collection = kind === 'video' ? 'videos' : 'images';
    const projection =
      kind === 'video'
        ? '_id:_display_name:date_added:bucket_display_name:duration'
        : '_id:_display_name:date_added:bucket_display_name';
    const output = await this.shell(serial, [
      `content query --uri content://media/external/${collection}/media --projection ${projection} --sort "date_added DESC"`,
    ]);
    const limit = Math.max(1, Math.min(60, Math.round(options.limit ?? 12)));
    const rows: PhonePhoto[] = [];
    for (const raw of output.split(/\r?\n/u)) {
      const line = raw.trim();
      if (!line.startsWith('Row:')) {
        continue;
      }
      /** Pulls one `key=value` column out of the raw `Row:` line; missing reads as empty. */
      const value = (key: string) => new RegExp(`${key}=([^,]+)`, 'u').exec(line)?.[1]?.trim() ?? '';
      const id = value('_id');
      if (!id) {
        continue;
      }
      const bucket = value('bucket_display_name');
      rows.push({
        id,
        name: value('_display_name'),
        bucket: bucket === 'NULL' ? '' : bucket,
        dateAdded: formatEpochSeconds(Number(value('date_added'))),
        durationMs: Number(value('duration')) || 0,
      });
      if (rows.length >= limit) {
        break;
      }
    }
    return rows;
  }

  /** Raw bytes of one gallery image, for vision. */
  async photo(channelId: string, id: string): Promise<PhonePhotoBytes> {
    const serial = await this.requireDevice(channelId);
    const clean = id.replace(/[^0-9]/gu, '');
    if (!clean) {
      throw new Error('照片 id 必须是数字（来自 phone.photos）');
    }
    const uri = `content://media/external/images/media/${clean}`;
    const mime = (await this.shell(serial, ['content', 'gettype', '--uri', uri]).catch(() => ''))
      .replace(/^Result:\s*/u, '')
      .trim();
    const buffer = await this.runBuffer(
      ['-s', serial, 'exec-out', 'content', 'read', '--uri', uri],
      25_000,
    );
    if (buffer.length === 0) {
      throw new Error('照片读取为空；可能已被删除或不在相册里');
    }
    if (buffer.length > 15 * 1024 * 1024) {
      throw new Error('照片过大（超过 15MB），换一张');
    }
    return {
      id: clean,
      mimeType: mime || 'image/jpeg',
      base64: buffer.toString('base64'),
      bytes: buffer.length,
    };
  }

  /**
   * Executes one input action, validating coordinates and key names first so adb
   * is never invoked with malformed arguments.
   */
  async act(channelId: string, input: PhoneActionInput): Promise<PhoneActionResult> {
    const serial = await this.requireDevice(channelId);
    const action = input.action.trim().toLowerCase();

    if (action === 'tap') {
      const x = coordinate(input.x, 'x');
      const y = coordinate(input.y, 'y');
      await this.shell(serial, ['input', 'tap', String(x), String(y)]);
      return actionDone(action, `点按 (${x}, ${y})`);
    }

    if (action === 'long_press') {
      const x = coordinate(input.x, 'x');
      const y = coordinate(input.y, 'y');
      const duration = Math.round(clamp(input.duration ?? 800, 500, 3000));
      // Android has no dedicated long-press input command; a same-point swipe
      // with a long duration is what the shell uses internally.
      await this.shell(serial, ['input', 'swipe', String(x), String(y), String(x), String(y), String(duration)]);
      return actionDone(action, `长按 (${x}, ${y}) ${duration}ms`);
    }

    if (action === 'drag') {
      const x1 = coordinate(input.x1, 'x1');
      const y1 = coordinate(input.y1, 'y1');
      const x2 = coordinate(input.x2, 'x2');
      const y2 = coordinate(input.y2, 'y2');
      const duration = Math.round(clamp(input.duration ?? 700, 200, 5000));
      await this.shell(serial, [
        'input',
        'draganddrop',
        String(x1),
        String(y1),
        String(x2),
        String(y2),
        String(duration),
      ]);
      return actionDone(action, `拖拽 (${x1}, ${y1}) → (${x2}, ${y2})`);
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
      const code = keyCodeOf(key);
      if (!code) {
        throw new Error(
          `不支持的按键：${key || '(空)'}；可用 ${Object.keys(KEY_CODES).join('/')} 或数字 keycode`,
        );
      }
      await this.shell(serial, ['input', 'keyevent', String(code)]);
      return actionDone(action, `按键 ${key || code}`);
    }

    if (action === 'combo') {
      const keys = (input.keys ?? []).map((key) => key.trim().toLowerCase()).filter(Boolean);
      const codes = keys.map((key) => keyCodeOf(key));
      if (keys.length < 2 || codes.some((code) => !code)) {
        throw new Error(
          `组合键需要至少两个有效按键；可用 ${Object.keys(KEY_CODES).join('/')} 或数字 keycode`,
        );
      }
      await this.shell(serial, [
        'input',
        'keycombination',
        ...codes.map((code) => String(code)),
      ]);
      return actionDone(action, `组合键 ${keys.join('+')}`);
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

    if (action === 'media') {
      const key = (input.key ?? '').trim().toLowerCase();
      const dispatch = MEDIA_ACTIONS[key];
      if (!dispatch) {
        throw new Error(
          `媒体键不支持：${key || '(空)'}；可用 ${Object.keys(MEDIA_ACTIONS).join('/')}`,
        );
      }
      await this.shell(serial, ['cmd', 'media_session', 'dispatch', dispatch]);
      return actionDone(action, `媒体 ${dispatch}`);
    }

    if (action === 'volume') {
      const stream = (input.stream ?? '').trim();
      const direction = (input.direction ?? '').trim().toLowerCase();
      const args = ['cmd', 'media_session', 'volume'];
      if (stream) {
        args.push('--stream', stream);
      }
      if (direction === 'raise' || direction === 'lower' || direction === 'same') {
        args.push('--adj', direction);
        await this.shell(serial, args);
        const label = direction === 'raise' ? '调高' : direction === 'lower' ? '调低' : '不变';
        return actionDone(action, `音量${label}`);
      }
      if (typeof input.level === 'number' && Number.isFinite(input.level)) {
        const level = Math.round(Math.max(0, Math.min(999, input.level)));
        await this.shell(serial, [...args, '--set', String(level)]);
        return actionDone(action, `音量设为 ${level}`);
      }
      const output = await this.shell(serial, [...args, '--get']);
      const read = /volume is (\d+) in range \[0\.\.(\d+)\]/u.exec(output);
      return actionDone(action, read ? `音量 ${read[1]}/${read[2]}` : '没有读到音量');
    }

    if (action === 'open') {
      const target = (input.target ?? '').trim();
      if (!target) {
        throw new Error('target 不能为空；传应用名、包名或 http 链接');
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
      } else {
        const pkg = await this.resolvePackage(serial, target);
        await this.shell(serial, [
          'monkey',
          '-p',
          pkg,
          '-c',
          'android.intent.category.LAUNCHER',
          '1',
        ]);
      }
      await delay(800);
      return actionDone(action, `打开 ${target}`);
    }

    if (action === 'stop') {
      const target = (input.target ?? '').trim();
      if (!target) {
        throw new Error('target 不能为空；传要关闭的应用名或包名');
      }
      const pkg = await this.resolvePackage(serial, target);
      await this.shell(serial, ['am', 'force-stop', pkg]);
      return actionDone(action, `关闭 ${pkg}`);
    }

    if (action === 'screen') {
      return this.screenPower(channelId, input.mode ?? 'toggle');
    }

    throw new Error(
      'action 不支持；可用 tap/long_press/swipe/drag/key/combo/type/open/stop/media/volume/screen',
    );
  }

  /** Wake, sleep or toggle the display without relying on the power dialog. */
  async screenPower(channelId: string, mode: string): Promise<PhoneActionResult> {
    const serial = await this.requireDevice(channelId);
    const normalized = mode.trim().toLowerCase();
    const key =
      normalized === 'on' || normalized === 'wake' || normalized === 'wakeup'
        ? 'wakeup'
        : normalized === 'off' || normalized === 'sleep'
          ? 'sleep'
          : normalized === 'toggle' || normalized === 'power' || !normalized
            ? 'power'
            : '';
    if (!key) {
      throw new Error('mode 不支持；可用 screen 动作配 mode=on/off/toggle');
    }
    await this.shell(serial, ['input', 'keyevent', String(KEY_CODES[key])]);
    await delay(500);
    const on = await this.readScreenOn(serial);
    const label = on === null ? '屏幕状态未知' : on ? '屏幕已点亮' : '屏幕已熄灭';
    return actionDone('screen', `${label}（${key}）`);
  }

  /** Cheap display check for callers that need to wake the phone first. */
  async displayOn(channelId: string): Promise<boolean | null> {
    return this.readScreenOn(await this.requireDevice(channelId));
  }

  /** Prefers mScreenState and falls back to wakefulness; null means the phone would not say. */
  private async readScreenOn(serial: string): Promise<boolean | null> {
    const state = /mScreenState=(\w+)/u.exec(
      await this.shell(serial, ['dumpsys display | grep -m1 mScreenState=']).catch(() => ''),
    )?.[1];
    if (state) {
      return state === 'ON';
    }
    const wakefulness = /mWakefulness=(\w+)/u.exec(
      await this.shell(serial, ['dumpsys power | grep -m1 mWakefulness=']).catch(() => ''),
    )?.[1];
    return wakefulness ? wakefulness === 'Awake' : null;
  }

  /** Reads installed packages from pm; -3 limits the listing to user-installed apps. */
  private async listApps(serial: string, includeSystem: boolean): Promise<PhoneApp[]> {
    const output = await this.shell(serial, [
      'pm',
      'list',
      'packages',
      '-f',
      ...(includeSystem ? [] : ['-3']),
    ]);
    const apps: PhoneApp[] = [];
    for (const raw of output.split(/\r?\n/u)) {
      const line = raw.trim();
      if (!line.startsWith('package:')) {
        continue;
      }
      const rest = line.slice('package:'.length);
      const separator = rest.lastIndexOf('=');
      const path = separator >= 0 ? rest.slice(0, separator) : '';
      const pkg = separator >= 0 ? rest.slice(separator + 1) : rest;
      if (pkg) {
        apps.push({ package: pkg, label: APP_ALIASES[pkg] ?? '', path });
      }
    }
    return apps;
  }

  /** "微信" / "settings" / com.tencent.mm all resolve to a package name. */
  private async resolvePackage(serial: string, target: string): Promise<string> {
    const raw = target.trim();
    if (/^[A-Za-z][A-Za-z0-9_.]+$/u.test(raw)) {
      const check = await this.shell(serial, ['pm', 'list', 'packages', raw]).catch(() => '');
      if (check.split(/\r?\n/u).some((line) => line.trim() === `package:${raw}`)) {
        return raw;
      }
    }
    const wanted = raw.toLowerCase();
    const apps = await this.listApps(serial, true);
    const exact = apps.filter((app) => app.label.toLowerCase() === wanted);
    if (exact.length === 1 && exact[0]) {
      return exact[0].package;
    }
    const partial = apps.filter(
      (app) =>
        (app.label && app.label.toLowerCase().includes(wanted)) ||
        app.package.toLowerCase().includes(wanted),
    );
    if (partial.length === 1 && partial[0]) {
      return partial[0].package;
    }
    if (partial.length > 1) {
      throw new Error(
        `“${raw}”匹配到多个应用：${partial
          .slice(0, 5)
          .map((app) => `${app.label || app.package}(${app.package})`)
          .join('、')}；请用包名`,
      );
    }
    throw new Error(`找不到应用“${raw}”；可用 phone.apps 查看已安装应用`);
  }

  /** Parses dumpsys battery; null rather than an exception when the output is unreadable. */
  private async batteryOf(
    serial: string,
  ): Promise<{ level: number; charging: boolean } | null> {
    const output = await this.shell(serial, ['dumpsys', 'battery']).catch(() => '');
    const level = Number(/level:\s*(\d+)/iu.exec(output)?.[1]);
    if (!Number.isFinite(level)) {
      return null;
    }
    const status = Number(/status:\s*(\d+)/iu.exec(output)?.[1]);
    const powered = /(AC|USB|Wireless) powered:\s*true/iu.test(output);
    return {
      level: Math.max(0, Math.min(100, level)),
      charging: powered || status === 2 || status === 5,
    };
  }

  /** Runs a device shell command against one serial with the shared adb timeout. */
  private async shell(serial: string, args: string[]): Promise<string> {
    return this.runText(['-s', serial, 'shell', ...args], ADB_TIMEOUT_MS);
  }

  /**
   * Resolves the channel's saved serial and enforces that it is a wireless device
   * currently in the connected state; every failure has a user-facing message.
   */
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

  /** Parses `adb devices -l`; USB serials are dropped because only wireless debugging is supported. */
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

  /** Caches the resolved adb binary so filesystem probing happens at most once. */
  private adbPath(): string {
    if (!this.adb) {
      this.adb = findAdb();
    }
    return this.adb;
  }

  /** Fails fast with an install hint when adb cannot be executed at all. */
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

  /** adb wrapper decoding stdout as UTF-8; rejects with adb's own stderr on failure. */
  private async runText(args: string[], timeout: number): Promise<string> {
    const { stdout } = await execFileAsync(this.adbPath(), args, {
      timeout,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: ADB_MAX_BUFFER,
    });
    return stdout;
  }

  /** adb wrapper for binary payloads such as screencap PNGs. */
  private async runBuffer(args: string[], timeout: number): Promise<Buffer> {
    const result = await execFileAsync(this.adbPath(), args, {
      timeout,
      encoding: 'buffer',
      windowsHide: true,
      maxBuffer: ADB_MAX_BUFFER,
    } as { encoding: 'buffer'; timeout: number; windowsHide: boolean; maxBuffer: number });
    const stdout: unknown = result.stdout;
    return Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout));
  }
}

/** Probes ADB_PATH and the usual Android SDK locations, falling back to a bare `adb` on PATH. */
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

/** Accepts a bare IPv4 by appending the default 5555 port; anything unparsable is a 400. */
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

/** Requires a finite number and clamps it into a plausible screen range. */
function coordinate(value: number | undefined, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`缺少坐标 ${name}`);
  }
  return Math.round(clamp(value, 0, 20_000));
}

/** Resolves an alias, single letter, digit or raw keycode; null means unsupported. */
function keyCodeOf(key: string): number | null {
  if (!key) {
    return null;
  }
  if (/^\d{1,3}$/u.test(key)) {
    const code = Number(key);
    return code > 0 ? code : null;
  }
  // Single letters/digits are useful in combos (ctrl+a); Android maps
  // KEYCODE_A=29..KEYCODE_Z=54 and KEYCODE_0=7..KEYCODE_9=16.
  if (/^[a-z]$/u.test(key)) {
    return 29 + key.charCodeAt(0) - 97;
  }
  if (/^[0-9]$/u.test(key)) {
    return 7 + Number(key);
  }
  return KEY_CODES[key] ?? null;
}

/** Formats MediaStore's seconds-since-epoch; zero or NaN becomes an empty string. */
function formatEpochSeconds(value: number): string {
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : '';
}

/** Constrains a number to the inclusive [min, max] range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** POSIX-single-quotes a value so spaces and metacharacters survive the remote shell. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Uniform success envelope; the note tells the agent to re-read the screen to confirm. */
function actionDone(action: string, detail: string): PhoneActionResult {
  return {
    ok: true,
    action,
    detail,
    note: '操作已发送；用 phone.screen 再看一次确认结果',
  };
}

/**
 * Converts uiautomator XML into numbered tappable lines: a node inherits its nearest
 * clickable ancestor's bounds so labels stay addressable. Output is capped at MAX_ELEMENTS.
 */
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
        ? { note: '当前界面没有可读元素（可能是游戏、视频或画布）；可改用 phone.screenshot 看画面' }
        : {}),
  };
}

/** Pulls key="value" pairs out of a single node tag, ignoring namespace prefixes. */
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

/** Parses the [left,top][right,bottom] form; null when the attribute is missing or malformed. */
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

/** Tap point for a rect, formatted as the "x,y" pair adb input expects. */
function center(bounds: Bounds): string {
  return `${Math.round((bounds.left + bounds.right) / 2)},${Math.round(
    (bounds.top + bounds.bottom) / 2,
  )}`;
}

/** Expands the XML entities and numeric character references uiautomator emits. */
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

/** Collapses whitespace and trims long adb output for use in error text. */
function compact(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().slice(0, 160);
}

/** PNG IHDR keeps width/height at fixed offsets after the 8-byte signature. */
function pngSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Prefers adb's own stderr over the generic exec message, trimmed for display. */
function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const candidate = error as Error & { stderr?: unknown };
    return typeof candidate.stderr === 'string' && candidate.stderr.trim()
      ? candidate.stderr.trim().slice(0, 200)
      : error.message;
  }
  return String(error);
}

/** Gives the device a moment to settle after an input command. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
