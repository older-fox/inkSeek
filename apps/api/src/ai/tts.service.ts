import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import {
  deepseekTtsVoices,
  ttsProviders,
  type DeepseekTtsSettings,
  type DeepseekTtsSettingsInput,
  type DeepseekTtsVoiceId,
  type TtsAudioFormat,
  type TtsOverview,
  type TtsProvider,
  type TtsProviderInput,
  type TtsSettings,
  type TtsSettingsInput,
  type TtsSettingsResult,
  type TtsTestInput,
  type TtsTestResult,
} from '@inkseek/shared';
import { CONFIG_KEYS } from '../config/config-keys.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { PrismaService } from '../database/prisma.service.js';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const PROBE_TEXT = '你好，这是一条语音合成测试。';
/** DeepSeek's built-in voices; the endpoint returns a WAV body. */
const DEEPSEEK_TTS_ENDPOINT = 'https://api.deepseek.com/v1/tools/tts';
const DEEPSEEK_MIME = 'audio/wav';

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

interface DeepseekConfig {
  /** Fixed official endpoint unless an override was stored for a compatible proxy. */
  endpoint: string;
  apiKey: string;
  /** Model provider whose key is reused; empty means a manually saved key. */
  providerId: string;
  voiceId: DeepseekTtsVoiceId;
}

/** The subset of a ModelProvider row needed to borrow its key. */
interface KeyProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}

interface SpeechResult {
  audio: Buffer;
  mimeType: string;
}

const PROVIDER_LABELS: Record<TtsProvider, string> = {
  openai: 'OpenAI 兼容',
  deepseek: 'DeepSeek 内置',
};

/**
 * Cloud text-to-speech with two engines that never run at once: an
 * OpenAI-compatible `/audio/speech` endpoint and DeepSeek's built-in TTS.
 * Both configurations are kept side by side; `tts.provider` selects the one
 * that synthesizes. Keys stay server-side and only masked hints reach the UI.
 */
@Injectable()
export class TtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SystemConfigService,
  ) {}

  /** Client-safe view of both engines plus which one is active. */
  async overview(): Promise<TtsOverview | null> {
    const [providerRecord, openaiRecord, deepseekRecord] = await Promise.all([
      this.configRow(CONFIG_KEYS.ttsProvider),
      this.configRow(CONFIG_KEYS.ttsSpeech),
      this.configRow(CONFIG_KEYS.ttsDeepseek),
    ]);
    const openai = readConfig(openaiRecord?.value);
    const deepseek = readDeepseekConfig(deepseekRecord?.value);
    if (!openai && !deepseek) {
      return null;
    }
    const bound = deepseek?.providerId ? await this.findProvider(deepseek.providerId) : null;
    const provider = readProvider(
      providerRecord?.value,
      Boolean(openai?.apiKey),
      hasDeepseekKey(deepseek, bound),
    );
    return {
      provider,
      openai: openai ? toSettings(openai, openaiRecord?.updatedAt ?? new Date()) : null,
      deepseek: deepseek
        ? toDeepseekSettings(deepseek, deepseekRecord?.updatedAt ?? new Date(), bound)
        : null,
      ready: provider === 'openai' ? Boolean(openai?.apiKey) : hasDeepseekKey(deepseek, bound),
    };
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
    const apiKey = input.clearKey ? '' : input.apiKey?.trim() || existing?.apiKey || '';

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
        tts: await this.requireOverview(),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }

    await this.config.set(CONFIG_KEYS.ttsSpeech, { ...candidate }, true);
    return { tts: await this.requireOverview(), latencyMs: 0 };
  }

  /**
   * Same lifecycle for the DeepSeek engine: reuse the key, probe, then persist.
   * The credential can be a manually entered key or a bound DeepSeek model
   * provider, whose key is read live so rotating it in one place is enough.
   */
  async saveDeepseek(input: DeepseekTtsSettingsInput): Promise<TtsSettingsResult> {
    const record = await this.configRow(CONFIG_KEYS.ttsDeepseek);
    const existing = readDeepseekConfig(record?.value);
    const manualKey = input.apiKey?.trim() ?? '';
    const bound = input.clearKey
      ? null
      : input.providerId?.trim()
        ? await this.requireDeepseekProvider(input.providerId.trim())
        : null;
    const providerId = input.clearKey
      ? ''
      : bound
        ? bound.id
        : manualKey
          ? ''
          : (existing?.providerId ?? '');
    const apiKey = input.clearKey || bound ? '' : manualKey || existing?.apiKey || '';
    const candidate: DeepseekConfig = {
      endpoint: existing?.endpoint ?? DEEPSEEK_TTS_ENDPOINT,
      apiKey,
      providerId,
      voiceId: input.voiceId,
    };

    if (!input.clearKey) {
      if (!bound && !apiKey) {
        throw new BadRequestException({
          code: 'TTS_KEY_REQUIRED',
          message:
            '还没有可用的 DeepSeek 凭据：请选择已接入的 DeepSeek 模型提供商，或手动填写 API Key',
          fieldErrors: { apiKey: ['请选择提供商或填写 API Key'] },
        });
      }
      const startedAt = performance.now();
      await this.requestDeepseek(
        bound ? { ...candidate, apiKey: bound.apiKey } : candidate,
        PROBE_TEXT,
      );
      await this.config.set(CONFIG_KEYS.ttsDeepseek, { ...candidate }, true);
      return {
        tts: await this.requireOverview(),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }

    await this.config.set(CONFIG_KEYS.ttsDeepseek, { ...candidate }, true);
    return { tts: await this.requireOverview(), latencyMs: 0 };
  }

  /**
   * Switches the active engine. Only an engine that already has a key can be
   * enabled; selecting DeepSeek before saving anything binds the first
   * configured DeepSeek model provider automatically, so an existing provider
   * key is enough to turn the engine on.
   */
  async setProvider(input: TtsProviderInput): Promise<{ tts: TtsOverview }> {
    const view = await this.overview();
    const configured =
      input.provider === 'openai' ? Boolean(view?.openai?.hasKey) : Boolean(view?.deepseek?.hasKey);
    if (!configured) {
      if (input.provider === 'deepseek' && (await this.autoBindDeepseek())) {
        await this.config.set(CONFIG_KEYS.ttsProvider, input.provider);
        return { tts: await this.requireOverview() };
      }
      throw new BadRequestException({
        code: 'TTS_PROVIDER_NOT_CONFIGURED',
        message:
          input.provider === 'deepseek'
            ? '还没有 DeepSeek 凭据：请先在设置 → 模型提供商里接入 DeepSeek（api.deepseek.com），或在语音合成里手动填写 API Key'
            : `请先填写并保存 ${PROVIDER_LABELS.openai} 的 API Key，再启用它`,
      });
    }
    await this.config.set(CONFIG_KEYS.ttsProvider, input.provider);
    return { tts: await this.requireOverview() };
  }

  /** Synthesizes the requested text with the active engine for preview playback. */
  async test(input: TtsTestInput): Promise<TtsTestResult> {
    const startedAt = performance.now();
    const active = await this.resolveActive();
    const { audio, mimeType } =
      active.provider === 'openai'
        ? await this.requestSpeech(active.config, input.text)
        : await this.requestDeepseek(active.config, input.text);
    return {
      audioBase64: audio.toString('base64'),
      mimeType,
      byteSize: audio.length,
      latencyMs: Math.round(performance.now() - startedAt),
      provider: active.provider,
    };
  }

  /** Synthesizes with the active engine; the entry point for voice messages. */
  async synthesize(text: string): Promise<SpeechResult> {
    if (!text.trim()) {
      throw new BadRequestException({ code: 'TTS_TEXT_EMPTY', message: '语音内容为空' });
    }
    const active = await this.resolveActive();
    return active.provider === 'openai'
      ? this.requestSpeech(active.config, text)
      : this.requestDeepseek(active.config, text);
  }

  /** True when the active engine has a key; used to decide whether to offer voice beats. */
  async isReady(): Promise<boolean> {
    const view = await this.overview();
    return view?.ready === true;
  }

  /** Loads the active engine's configuration or explains what is missing. */
  private async resolveActive(): Promise<
    { provider: 'openai'; config: TtsConfig } | { provider: 'deepseek'; config: DeepseekConfig }
  > {
    const [providerRecord, openaiRecord, deepseekRecord] = await Promise.all([
      this.configRow(CONFIG_KEYS.ttsProvider),
      this.configRow(CONFIG_KEYS.ttsSpeech),
      this.configRow(CONFIG_KEYS.ttsDeepseek),
    ]);
    const openai = readConfig(openaiRecord?.value);
    const deepseek = readDeepseekConfig(deepseekRecord?.value);
    const bound = deepseek?.providerId ? await this.findProvider(deepseek.providerId) : null;
    const provider = readProvider(
      providerRecord?.value,
      Boolean(openai?.apiKey),
      hasDeepseekKey(deepseek, bound),
    );
    if (provider === 'deepseek') {
      if (!deepseek) {
        throw notConfigured('DeepSeek 内置');
      }
      if (deepseek.providerId) {
        if (!bound) {
          throw new BadRequestException({
            code: 'TTS_PROVIDER_MISSING',
            message: '绑定的 DeepSeek 模型提供商已不存在，请回到设置重新选择',
          });
        }
        if (!bound.apiKey) {
          throw new BadRequestException({
            code: 'TTS_PROVIDER_KEY_MISSING',
            message: `模型提供商「${bound.name}」没有保存密钥，请先在模型提供商里补上`,
          });
        }
        return { provider, config: { ...deepseek, apiKey: bound.apiKey } };
      }
      if (!deepseek.apiKey) {
        throw notConfigured('DeepSeek 内置');
      }
      return { provider, config: deepseek };
    }
    if (!openai?.apiKey) {
      throw notConfigured('OpenAI 兼容');
    }
    return { provider, config: openai };
  }

  /** Re-reads after a save; a just-written row always yields a view. */
  private async requireOverview(): Promise<TtsOverview> {
    const view = await this.overview();
    if (!view) {
      throw new BadGatewayException({
        code: 'TTS_CONFIG_UNREADABLE',
        message: '语音配置写入后无法读取，请刷新设置页重试',
      });
    }
    return view;
  }

  private configRow(key: string) {
    return this.prisma.systemConfig.findUnique({ where: { key } });
  }

  private findProvider(id: string): Promise<KeyProvider | null> {
    return this.prisma.modelProvider.findUnique({
      where: { id },
      select: { id: true, name: true, baseUrl: true, apiKey: true },
    });
  }

  /** Loads a provider chosen for key reuse and rejects anything that cannot speak TTS. */
  private async requireDeepseekProvider(id: string): Promise<KeyProvider> {
    const provider = await this.findProvider(id);
    if (!provider) {
      throw new BadRequestException({
        code: 'TTS_PROVIDER_MISSING',
        message: '选择的模型提供商不存在，请刷新设置页后重新选择',
      });
    }
    if (!isDeepseekBaseUrl(provider.baseUrl)) {
      throw new BadRequestException({
        code: 'TTS_PROVIDER_INVALID',
        message: `「${provider.name}」的地址不是 DeepSeek，不能用于内置语音`,
      });
    }
    if (!provider.apiKey) {
      throw new BadRequestException({
        code: 'TTS_PROVIDER_KEY_MISSING',
        message: `模型提供商「${provider.name}」没有保存密钥`,
      });
    }
    return provider;
  }

  /** Configured model providers that point at DeepSeek and can lend their key. */
  private async deepseekProviders(): Promise<KeyProvider[]> {
    const rows = await this.prisma.modelProvider.findMany({
      select: { id: true, name: true, baseUrl: true, apiKey: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.filter((row) => Boolean(row.apiKey) && isDeepseekBaseUrl(row.baseUrl));
  }

  /**
   * Binds the oldest configured DeepSeek provider and probes it. Returns false
   * when no provider matches, leaving the caller to explain what is missing.
   */
  private async autoBindDeepseek(): Promise<boolean> {
    const candidate = (await this.deepseekProviders())[0];
    if (!candidate) {
      return false;
    }
    const record = await this.configRow(CONFIG_KEYS.ttsDeepseek);
    const existing = readDeepseekConfig(record?.value);
    const next: DeepseekConfig = {
      endpoint: existing?.endpoint ?? DEEPSEEK_TTS_ENDPOINT,
      apiKey: '',
      providerId: candidate.id,
      voiceId: existing?.voiceId ?? 'stella',
    };
    await this.requestDeepseek({ ...next, apiKey: candidate.apiKey }, PROBE_TEXT);
    await this.config.set(CONFIG_KEYS.ttsDeepseek, { ...next }, true);
    return true;
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

  /** DeepSeek's built-in TTS returns a WAV body; the request has no model/speed fields. */
  private async requestDeepseek(config: DeepseekConfig, text: string): Promise<SpeechResult> {
    let response: Response;

    try {
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          text,
          voice_id: config.voiceId,
          format: 'wav',
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      if (timedOut) {
        throw new GatewayTimeoutException({
          code: 'TTS_TIMEOUT',
          message: `DeepSeek 语音合成超时（${REQUEST_TIMEOUT_MS / 1000} 秒），请稍后重试`,
        });
      }
      throw new BadGatewayException({
        code: 'TTS_UNREACHABLE',
        message: '无法连接 DeepSeek 语音服务，请检查服务器网络',
      });
    }

    if (!response.ok) {
      const detail = await readErrorDetail(response, config.apiKey);
      const message =
        response.status === 401 || response.status === 403
          ? 'DeepSeek 语音服务拒绝了该密钥，请检查 API Key'
          : response.status === 429
            ? 'DeepSeek 语音服务触发限流，请稍后重试'
            : `DeepSeek 语音服务返回 HTTP ${response.status}`;
      throw new BadGatewayException({
        code: 'TTS_PROVIDER_ERROR',
        message: detail ? `${message}（${detail}）` : message,
        fieldErrors:
          response.status === 401 || response.status === 403 ? { apiKey: [message] } : undefined,
      });
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const detail = await readErrorDetail(response, config.apiKey);
      throw new BadGatewayException({
        code: 'TTS_BAD_RESPONSE',
        message: detail
          ? `DeepSeek 语音返回了错误信息（${detail}）`
          : 'DeepSeek 语音返回了 JSON 而非音频，请检查音色设置',
      });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length === 0) {
      throw new BadGatewayException({
        code: 'TTS_EMPTY',
        message: 'DeepSeek 语音返回了空音频',
      });
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      throw new BadGatewayException({
        code: 'TTS_TOO_LARGE',
        message: '语音合成结果超过 20MB，请缩短文本',
      });
    }

    return { audio, mimeType: DEEPSEEK_MIME };
  }
}

/** Shared empty-config rejection so both engines name what is missing. */
function notConfigured(label: string): BadRequestException {
  return new BadRequestException({
    code: 'TTS_NOT_CONFIGURED',
    message: `还没有可用的${label}语音配置，请先在设置中填写 API Key`,
  });
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
  const format = FORMAT_MIME[record.format as TtsAudioFormat]
    ? (record.format as TtsAudioFormat)
    : 'mp3';
  const speed =
    typeof record.speed === 'number' && Number.isFinite(record.speed) ? record.speed : 1;
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

/** Reads the DeepSeek block; a missing endpoint falls back to the official one. */
function readDeepseekConfig(value: unknown): DeepseekConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const endpoint =
    typeof record.endpoint === 'string' && record.endpoint.trim()
      ? record.endpoint.trim()
      : DEEPSEEK_TTS_ENDPOINT;
  const voiceId = deepseekTtsVoices.includes(record.voiceId as DeepseekTtsVoiceId)
    ? (record.voiceId as DeepseekTtsVoiceId)
    : 'stella';
  return {
    endpoint,
    apiKey: typeof record.apiKey === 'string' ? record.apiKey : '',
    providerId: typeof record.providerId === 'string' ? record.providerId.trim() : '',
    voiceId,
  };
}

/** Accepts a stored engine only if it is known; otherwise follows the configured keys. */
function readProvider(value: unknown, hasOpenaiKey: boolean, hasDeepseekKey: boolean): TtsProvider {
  if (typeof value === 'string' && ttsProviders.includes(value as TtsProvider)) {
    return value as TtsProvider;
  }
  if (!hasOpenaiKey && hasDeepseekKey) {
    return 'deepseek';
  }
  return 'openai';
}

/** Projects the DeepSeek configuration into its masked client view. */
function toDeepseekSettings(
  config: DeepseekConfig,
  updatedAt: Date,
  provider: KeyProvider | null,
): DeepseekTtsSettings {
  const key = provider ? provider.apiKey : config.apiKey;
  return {
    voiceId: config.voiceId,
    hasKey: Boolean(key),
    keyHint: hintOf(key),
    providerId: config.providerId || null,
    providerName: provider?.name ?? null,
    updatedAt: updatedAt.toISOString(),
  };
}

/** True when the bound provider has a key; a manual config falls back to its own. */
function hasDeepseekKey(config: DeepseekConfig | null, provider: KeyProvider | null): boolean {
  if (!config) {
    return false;
  }
  return config.providerId ? Boolean(provider?.apiKey) : Boolean(config.apiKey);
}

/** Recognizes DeepSeek's own endpoint, including api.deepseek.com. */
function isDeepseekBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.trim().toLowerCase();
    return host === 'deepseek.com' || host.endsWith('.deepseek.com');
  } catch {
    return false;
  }
}

/** Masks a key down to its last four characters for display. */
function hintOf(key: string): string {
  return key.length > 4 ? `••••${key.slice(-4)}` : '••••';
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
