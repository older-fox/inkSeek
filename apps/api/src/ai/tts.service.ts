import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import type {
  TtsAudioFormat,
  TtsSettings,
  TtsSettingsInput,
  TtsSettingsResult,
  TtsTestInput,
  TtsTestResult,
} from '@inkseek/shared';
import { CONFIG_KEYS } from '../config/config-keys.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { PrismaService } from '../database/prisma.service.js';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const PROBE_TEXT = '你好，这是一条语音合成测试。';

const FORMAT_MIME: Record<TtsAudioFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
};

interface TtsConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  voice: string;
  format: TtsAudioFormat;
  speed: number;
}

interface SpeechResult {
  audio: Buffer;
  mimeType: string;
}

/**
 * Cloud text-to-speech over the OpenAI-compatible `/audio/speech` protocol.
 * The endpoint, key, model and voice are stored server-side in SystemConfig;
 * only a masked hint ever reaches the client. Saving probes the endpoint with
 * a real synthesis so a broken configuration cannot be persisted.
 */
@Injectable()
export class TtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SystemConfigService,
  ) {}

  /** Client-safe view of the stored configuration; the key is reduced to a hint. */
  async overview(): Promise<TtsSettings | null> {
    const record = await this.prisma.systemConfig.findUnique({
      where: { key: CONFIG_KEYS.ttsSpeech },
    });
    const stored = readConfig(record?.value);
    if (!stored) {
      return null;
    }
    return toSettings(stored, record?.updatedAt ?? new Date());
  }

  /**
   * Reuses the stored key unless a new one is supplied or explicitly cleared,
   * validates the candidate by synthesizing a short phrase, then persists it.
   */
  async save(input: TtsSettingsInput): Promise<TtsSettingsResult> {
    const record = await this.prisma.systemConfig.findUnique({
      where: { key: CONFIG_KEYS.ttsSpeech },
    });
    const existing = readConfig(record?.value);
    const apiKey = input.clearKey ? '' : (input.apiKey?.trim() || existing?.apiKey || '');

    const candidate: TtsConfig = {
      endpoint: input.endpoint,
      apiKey,
      model: input.model,
      voice: input.voice,
      format: input.format,
      speed: input.speed,
    };

    if (!input.clearKey) {
      if (!apiKey) {
        throw new BadRequestException({
          code: 'TTS_KEY_REQUIRED',
          message: '请填写 API Key',
          fieldErrors: { apiKey: ['请填写 API Key'] },
        });
      }
      const startedAt = performance.now();
      await this.requestSpeech(candidate, PROBE_TEXT);
      await this.config.set(CONFIG_KEYS.ttsSpeech, { ...candidate }, true);
      return {
        tts: toSettings(candidate, new Date()),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }

    await this.config.set(CONFIG_KEYS.ttsSpeech, { ...candidate }, true);
    return { tts: toSettings(candidate, new Date()), latencyMs: 0 };
  }

  /** Synthesizes the requested text with the saved configuration for preview playback. */
  async test(input: TtsTestInput): Promise<TtsTestResult> {
    const stored = await this.requireConfig();
    const startedAt = performance.now();
    const { audio, mimeType } = await this.requestSpeech(stored, input.text);
    return {
      audioBase64: audio.toString('base64'),
      mimeType,
      byteSize: audio.length,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  /** Synthesizes text with the saved configuration; the entry point for future voice messages. */
  async synthesize(text: string): Promise<SpeechResult> {
    const stored = await this.requireConfig();
    return this.requestSpeech(stored, text);
  }

  /** Loads the stored configuration or rejects when speech synthesis is not set up. */
  private async requireConfig(): Promise<TtsConfig> {
    const record = await this.prisma.systemConfig.findUnique({
      where: { key: CONFIG_KEYS.ttsSpeech },
    });
    const stored = readConfig(record?.value);
    if (!stored || !stored.apiKey) {
      throw new BadRequestException({
        code: 'TTS_NOT_CONFIGURED',
        message: '还没有可用的语音合成配置，请先在设置中填写 Endpoint 与 API Key',
      });
    }
    return stored;
  }

  /** One POST to `/audio/speech` bounded by a timeout; maps transport and status errors. */
  private async requestSpeech(config: TtsConfig, text: string): Promise<SpeechResult> {
    const url = `${trimBase(config.endpoint)}/audio/speech`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          input: text,
          voice: config.voice,
          response_format: config.format,
          speed: config.speed,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      if (timedOut) {
        throw new GatewayTimeoutException({
          code: 'TTS_TIMEOUT',
          message: `语音合成超时（${REQUEST_TIMEOUT_MS / 1000} 秒），请稍后重试`,
        });
      }
      throw new BadGatewayException({
        code: 'TTS_UNREACHABLE',
        message: '无法连接语音合成服务，请检查 Endpoint 与服务器网络',
        fieldErrors: { endpoint: ['请确认地址可从服务器访问，并包含版本路径（如 /v1）'] },
      });
    }

    if (!response.ok) {
      const detail = await readErrorDetail(response, config.apiKey);
      const message =
        response.status === 401 || response.status === 403
          ? '语音合成服务拒绝了该密钥，请检查 API Key'
          : response.status === 404
            ? '未找到语音合成接口或模型，请检查 Endpoint、模型名称与音色'
            : response.status === 429
              ? '语音合成服务触发限流，请稍后重试'
              : `语音合成服务返回 HTTP ${response.status}`;
      throw new BadGatewayException({
        code: 'TTS_PROVIDER_ERROR',
        message: detail ? `${message}（${detail}）` : message,
        fieldErrors:
          response.status === 401 || response.status === 403
            ? { apiKey: [message] }
            : response.status === 404
              ? { model: [message] }
              : undefined,
      });
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const detail = await readErrorDetail(response, config.apiKey);
      throw new BadGatewayException({
        code: 'TTS_BAD_RESPONSE',
        message: detail
          ? `语音合成服务返回了错误信息（${detail}）`
          : '语音合成服务返回了 JSON 而非音频，请检查模型与音色',
      });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length === 0) {
      throw new BadGatewayException({
        code: 'TTS_EMPTY',
        message: '语音合成服务返回了空音频',
      });
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      throw new BadGatewayException({
        code: 'TTS_TOO_LARGE',
        message: '语音合成结果超过 20MB，请缩短文本',
      });
    }

    return { audio, mimeType: FORMAT_MIME[config.format] };
  }
}

/** Reads the stored configuration defensively; missing core fields read as unset. */
function readConfig(value: unknown): TtsConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const endpoint = typeof record.endpoint === 'string' ? record.endpoint.trim() : '';
  const model = typeof record.model === 'string' ? record.model.trim() : '';
  const voice = typeof record.voice === 'string' ? record.voice.trim() : '';
  if (!endpoint || !model || !voice) {
    return null;
  }
  const format = FORMAT_MIME[record.format as TtsAudioFormat] ? (record.format as TtsAudioFormat) : 'mp3';
  const speed = typeof record.speed === 'number' && Number.isFinite(record.speed) ? record.speed : 1;
  return {
    endpoint,
    apiKey: typeof record.apiKey === 'string' ? record.apiKey : '',
    model,
    voice,
    format,
    speed,
  };
}

/** Projects a configuration into its masked client view. */
function toSettings(config: TtsConfig, updatedAt: Date): TtsSettings {
  return {
    endpoint: config.endpoint,
    model: config.model,
    voice: config.voice,
    format: config.format,
    speed: config.speed,
    hasKey: Boolean(config.apiKey),
    keyHint: config.apiKey.length > 4 ? `••••${config.apiKey.slice(-4)}` : '••••',
    updatedAt: updatedAt.toISOString(),
  };
}

/** Strips trailing slashes so path concatenation yields exactly one separator. */
function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/** Extracts a short, redacted reason from a failed response body. */
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

/** Safe navigation helper for untyped provider payloads; anything else becomes `{}`. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Masks the API key in upstream error text; very short secrets are left alone. */
function redact(value: string, secret: string): string {
  return secret.length >= 8 ? value.split(secret).join('***') : value;
}