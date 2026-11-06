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
  type RedisConnectionInput,
  type RedisSettings,
  type RedisSettingsInput,
  type RedisSettingsResult,
  type SettingsOverview,
} from '@inkseek/shared';
import { BilibiliAuthService } from '../config/bilibili-auth.service.js';
import { CONFIG_KEYS } from '../config/config-keys.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { ModelProvider, Prisma } from '../generated/prisma/client.js';
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
  ) {}

  async getOverview(): Promise<SettingsOverview> {
    const [redisRecord, providers, bilibili, phone] = await Promise.all([
      this.prisma.systemConfig.findUnique({ where: { key: CONFIG_KEYS.redisConnection } }),
      this.prisma.modelProvider.findMany({ orderBy: { createdAt: 'asc' } }),
      this.bilibili.overview(),
      this.phone.status(),
    ]);

    return {
      redis: toRedisSettings(redisRecord?.value, redisRecord?.updatedAt),
      bilibili,
      phone,
      providers: providers.map(toProviderSummary),
    };
  }

  async updateBilibili(input: BilibiliSettingsInput): Promise<BilibiliSettingsResult> {
    return { bilibili: await this.bilibili.save(input) };
  }

  async connectPhone(input: PhoneConnectInput): Promise<PhoneSettingsResult> {
    return { phone: await this.phone.connect(input.address) };
  }

  async pairPhone(input: PhonePairInput): Promise<PhoneSettingsResult> {
    return { phone: await this.phone.pair(input.address, input.code) };
  }

  async disconnectPhone(input: PhoneDisconnectInput): Promise<PhoneSettingsResult> {
    return { phone: await this.phone.disconnect(input.address) };
  }

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

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
