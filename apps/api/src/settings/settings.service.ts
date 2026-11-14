import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  redisConnectionSchema,
  type BilibiliSettingsInput,
  type BilibiliSettingsResult,
  type ModelProviderInput,
  type PhoneConnectInput,
  type PhoneDisconnectInput,
  type PhonePairInput,
  type PhoneSettingsResult,
  type ModelProviderProtocol,
  type ModelProviderSaveResult,
  type ModelProviderSummary,
  type MindBannedWordsInput,
  type MindBannedWordsResult,
  type RedisConnectionInput,
  type RedisSettings,
  type RedisSettingsInput,
  type RedisSettingsResult,
  type SettingsOverview,
  type TtsSettingsInput,
  type TtsSettingsResult,
  type TtsTestInput,
  type TtsTestResult,
  type DeepseekTtsSettingsInput,
  type TtsProviderInput,
  type TtsProviderResult,
  type ToolMaxTokensInput,
  type ToolTokenResult,
  type VisionModelInput,
  type VisionModelResult,
  type WebAllowedHostsInput,
  type WebAllowedHostsResult,
  type WebSearchSettings,
  type WebSearchSettingsInput,
  type WebSearchSettingsResult,
} from '@inkseek/shared';
import { readToolMaxTokens } from '../ai/tool-tokens.js';
import { TtsService } from '../ai/tts.service.js';
import { VisionModelService } from '../ai/vision-model.service.js';
import { BilibiliAuthService } from '../config/bilibili-auth.service.js';
import { CONFIG_KEYS } from '../config/config-keys.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { ModelProvider, Prisma } from '../generated/prisma/client.js';
import { normalizeMindBannedWords, readMindBannedWords } from '../mind/mind-banned-words.js';
import { normalizeAllowedHosts } from '../mind/web-allowlist.js';
import { PhoneService } from '../phone/phone.service.js';
import { RedisProbeService } from '../redis/redis-probe.service.js';
import { ModelProviderProbeService } from './model-provider-probe.service.js';

const STORED_MODEL_LIMIT = 200;
const PREVIEW_MODEL_LIMIT = 12;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SystemConfigService,
    private readonly redisProbe: RedisProbeService,
    private readonly providerProbe: ModelProviderProbeService,
    private readonly bilibili: BilibiliAuthService,
    private readonly phone: PhoneService,
    private readonly tts: TtsService,
    private readonly visionModel: VisionModelService,
  ) {}

  /** Reads every settings block in parallel; secrets are reduced to hints before returning. */
  async getOverview(): Promise<SettingsOverview> {
    const [
      redisRecord,
      providers,
      bilibili,
      phone,
      bannedRecord,
      allowedRecord,
      tts,
      maxTokens,
      visionModel,
      searchRecord,
    ] = await Promise.all([
      this.prisma.systemConfig.findUnique({ where: { key: CONFIG_KEYS.redisConnection } }),
      this.prisma.modelProvider.findMany({ orderBy: { createdAt: 'asc' } }),
      this.bilibili.overview(),
      this.phone.status(),
      this.prisma.systemConfig.findUnique({
        where: { key: CONFIG_KEYS.mindGlobalBannedWords },
      }),
      this.prisma.systemConfig.findUnique({
        where: { key: CONFIG_KEYS.mindWebAllowedHosts },
      }),
      this.tts.overview(),
      readToolMaxTokens(this.config),
      this.visionModel.overview(),
      this.prisma.systemConfig.findUnique({ where: { key: CONFIG_KEYS.mindWebSearch } }),
    ]);

    return {
      redis: toRedisSettings(redisRecord?.value, redisRecord?.updatedAt),
      bilibili,
      phone,
      providers: providers.map(toProviderSummary),
      tts,
      maxTokens,
      visionModel,
      webSearch: toWebSearchSettings(searchRecord?.value, searchRecord?.updatedAt),
      mindBannedWords: readMindBannedWords(bannedRecord?.value),
      webAllowedHosts: normalizeAllowedHosts(allowedRecord?.value),
    };
  }

  /** Stores the per-call ceiling; every other caller is clamped to it. */
  async updateMaxTokens(input: ToolMaxTokensInput): Promise<ToolTokenResult> {
    await this.config.set(CONFIG_KEYS.aiMaxTokens, input.maxTokens);
    return { maxTokens: await readToolMaxTokens(this.config) };
  }

  /** Runs a bundled-image probe and stores the target only when the model can see. */
  async updateVisionModel(input: VisionModelInput): Promise<VisionModelResult> {
    return this.visionModel.save(input);
  }

  /** Normalizes and stores the list; an empty list is persisted and disables filtering. */
  async updateMindBannedWords(input: MindBannedWordsInput): Promise<MindBannedWordsResult> {
    const words = normalizeMindBannedWords(input.words) ?? [];
    await this.config.set(CONFIG_KEYS.mindGlobalBannedWords, words);
    return { words };
  }

  /** Normalizes and stores the host allowlist; an empty list keeps the SSRF guard strict. */
  async updateWebAllowedHosts(input: WebAllowedHostsInput): Promise<WebAllowedHostsResult> {
    const hosts = normalizeAllowedHosts(input.hosts);
    await this.config.set(CONFIG_KEYS.mindWebAllowedHosts, hosts);
    return { hosts };
  }

  /**
   * Stores the search endpoint used by `web.search`. An empty endpoint turns the
   * tool off; the previously saved key is reused unless cleared, and clearing
   * the endpoint drops the key with it.
   */
  async updateWebSearch(input: WebSearchSettingsInput): Promise<WebSearchSettingsResult> {
    const record = await this.prisma.systemConfig.findUnique({
      where: { key: CONFIG_KEYS.mindWebSearch },
    });
    const existing = readWebSearchConfig(record?.value);
    const endpoint = input.endpoint.trim();
    const apiKey = endpoint ? (input.clearKey ? '' : input.apiKey?.trim() || existing.apiKey) : '';
    const savedAt = new Date();
    await this.config.set(CONFIG_KEYS.mindWebSearch, { endpoint, apiKey }, true);
    return {
      webSearch: {
        endpoint,
        hasKey: Boolean(apiKey),
        updatedAt: savedAt.toISOString(),
      },
    };
  }

  /** Delegates validation and storage to the Bilibili service. */
  async updateBilibili(input: BilibiliSettingsInput): Promise<BilibiliSettingsResult> {
    return { bilibili: await this.bilibili.save(input) };
  }

  /** Probes the cloud speech endpoint before persisting the OpenAI-compatible setup. */
  async updateTts(input: TtsSettingsInput): Promise<TtsSettingsResult> {
    return this.tts.save(input);
  }

  /** Probes DeepSeek's built-in TTS before persisting its key and voice. */
  async updateDeepseekTts(input: DeepseekTtsSettingsInput): Promise<TtsSettingsResult> {
    return this.tts.saveDeepseek(input);
  }

  /** Switches which engine synthesizes; the other configuration is kept. */
  async updateTtsProvider(input: TtsProviderInput): Promise<TtsProviderResult> {
    return this.tts.setProvider(input);
  }

  /** Synthesizes a preview clip with the saved configuration for playback. */
  async testTts(input: TtsTestInput): Promise<TtsTestResult> {
    return this.tts.test(input);
  }

  /** Pass-through to adb over the address saved in settings. */
  async connectPhone(input: PhoneConnectInput): Promise<PhoneSettingsResult> {
    return { phone: await this.phone.connect(input.address) };
  }

  /** Pass-through pairing call; the one-time code is consumed by adb. */
  async pairPhone(input: PhonePairInput): Promise<PhoneSettingsResult> {
    return { phone: await this.phone.pair(input.address, input.code) };
  }

  /** Pass-through disconnect; the paired device stays trusted. */
  async disconnectPhone(input: PhoneDisconnectInput): Promise<PhoneSettingsResult> {
    return { phone: await this.phone.disconnect(input.address) };
  }

  /**
   * Reuses the stored password unless explicitly cleared, probes the new config,
   * and only then persists it so a typo cannot take the cache offline.
   */
  async updateRedis(input: RedisSettingsInput): Promise<RedisSettingsResult> {
    const record = await this.prisma.systemConfig.findUnique({
      where: { key: CONFIG_KEYS.redisConnection },
    });
    const existing = redisConnectionSchema.safeParse(record?.value);
    const existingPassword = existing.success ? (existing.data.password ?? '') : '';

    const connection: RedisConnectionInput = {
      host: input.host,
      port: input.port,
      db: input.db,
      tls: input.tls,
      password: input.clearPassword ? '' : input.password || existingPassword,
    };

    const probe = await this.redisProbe.probe(connection);

    await this.config.set(
      CONFIG_KEYS.redisConnection,
      connection as unknown as Prisma.InputJsonValue,
      true,
    );

    return {
      redis: toRedisSettings(connection, new Date()) as RedisSettings,
      latencyMs: probe.latencyMs,
    };
  }

  /** Probes before insert; the stored model list is capped and the true count kept separately. */
  async createProvider(input: ModelProviderInput): Promise<ModelProviderSaveResult> {
    const probe = await this.providerProbe.probe(input);
    const models = probe.models.slice(0, STORED_MODEL_LIMIT);

    let record: ModelProvider;

    try {
      record = await this.prisma.modelProvider.create({
        data: {
          name: input.name,
          protocol: input.protocol,
          baseUrl: input.baseUrl,
          apiKey: input.apiKey,
          models,
          modelCount: probe.models.length,
          lastTestedAt: new Date(),
        },
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException({
          code: 'PROVIDER_NAME_TAKEN',
          message: '已存在同名模型提供商',
          fieldErrors: { name: ['该名称已被使用，请换一个名称'] },
        });
      }

      throw error;
    }

    return {
      provider: toProviderSummary(record),
      latencyMs: probe.latencyMs,
      modelCount: probe.models.length,
      models: models.slice(0, PREVIEW_MODEL_LIMIT),
    };
  }

  /** Re-runs the probe against the stored credentials and refreshes the model list. */
  async retestProvider(id: string): Promise<ModelProviderSaveResult> {
    const existing = await this.prisma.modelProvider.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException({
        code: 'PROVIDER_NOT_FOUND',
        message: '模型提供商不存在或已被删除',
      });
    }

    const probe = await this.providerProbe.probe({
      name: existing.name,
      protocol: existing.protocol,
      baseUrl: existing.baseUrl,
      apiKey: existing.apiKey,
    });
    const models = probe.models.slice(0, STORED_MODEL_LIMIT);

    const record = await this.prisma.modelProvider.update({
      where: { id },
      data: {
        models,
        modelCount: probe.models.length,
        lastTestedAt: new Date(),
      },
    });

    return {
      provider: toProviderSummary(record),
      latencyMs: probe.latencyMs,
      modelCount: probe.models.length,
      models: models.slice(0, PREVIEW_MODEL_LIMIT),
    };
  }

  /** Deletes by id and reports a missing row as 404 instead of a raw Prisma error. */
  async deleteProvider(id: string): Promise<void> {
    try {
      await this.prisma.modelProvider.delete({ where: { id } });
    } catch (error) {
      if (hasPrismaCode(error, 'P2025')) {
        throw new NotFoundException({
          code: 'PROVIDER_NOT_FOUND',
          message: '模型提供商不存在或已被删除',
        });
      }

      throw error;
    }
  }
}

/** Projects the stored connection into its masked settings view; invalid data reads as unset. */
function toRedisSettings(value: unknown, updatedAt?: Date): RedisSettings | null {
  const parsed = redisConnectionSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  const { host, port, db, tls, password } = parsed.data;

  return {
    host,
    port,
    db,
    tls,
    hasPassword: Boolean(password),
    updatedAt: (updatedAt ?? new Date()).toISOString(),
  };
}

/** Masks the API key down to its last four characters. */
function toProviderSummary(record: ModelProvider): ModelProviderSummary {
  const models = Array.isArray(record.models)
    ? record.models.filter((model): model is string => typeof model === 'string')
    : [];

  return {
    id: record.id,
    name: record.name,
    protocol: record.protocol as ModelProviderProtocol,
    baseUrl: record.baseUrl,
    keyHint: record.apiKey.length > 4 ? `••••${record.apiKey.slice(-4)}` : '••••',
    modelCount: record.modelCount,
    models: models.slice(0, PREVIEW_MODEL_LIMIT),
    lastTestedAt: (record.lastTestedAt ?? record.updatedAt).toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

/** Structural check instead of `instanceof`, since Prisma errors arrive as plain objects. */
function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

interface WebSearchConfig {
  endpoint: string;
  apiKey: string;
}

/** Tolerates malformed stored values; missing fields read as empty strings. */
function readWebSearchConfig(value: unknown): WebSearchConfig {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    endpoint: typeof record['endpoint'] === 'string' ? record['endpoint'].trim() : '',
    apiKey: typeof record['apiKey'] === 'string' ? record['apiKey'].trim() : '',
  };
}

/** Returns null when no endpoint is stored, which the UI renders as "off". */
function toWebSearchSettings(value: unknown, updatedAt?: Date): WebSearchSettings | null {
  const config = readWebSearchConfig(value);
  if (!config.endpoint) {
    return null;
  }
  return {
    endpoint: config.endpoint,
    hasKey: Boolean(config.apiKey),
    updatedAt: (updatedAt ?? new Date()).toISOString(),
  };
}
