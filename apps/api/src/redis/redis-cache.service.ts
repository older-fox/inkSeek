import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { redisConnectionSchema, type RedisConnectionInput } from '@inkseek/shared';
import { Redis } from 'ioredis';
import { CONFIG_KEYS } from '../config/config-keys.js';
import { PrismaService } from '../database/prisma.service.js';

const CONNECT_TIMEOUT_MS = 3000;
const COMMAND_TIMEOUT_MS = 2000;

/**
 * Best-effort key/value cache backed by the Redis connection stored in
 * SystemConfig. Cache failures never surface to callers: misses and outages
 * both look like "not cached" so the caller can fall back to live work.
 */
@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: Redis | null = null;
  private signature = '';
  private connecting: Promise<Redis | null> | null = null;
  private warned = false;

  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    const client = await this.clientFor();
    if (!client) {
      return null;
    }

    try {
      const value = await withTimeout(client.get(key), COMMAND_TIMEOUT_MS);
      this.warned = false;
      return value;
    } catch (error) {
      this.resetClient(client);
      this.warnOnce(error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const client = await this.clientFor();
    if (!client) {
      return;
    }

    try {
      const ttl = Math.max(1, Math.round(ttlSeconds));
      await withTimeout(client.set(key, value, 'EX', ttl), COMMAND_TIMEOUT_MS);
      this.warned = false;
    } catch (error) {
      this.resetClient(client);
      this.warnOnce(error);
    }
  }

  onModuleDestroy(): void {
    this.client?.disconnect();
    this.client = null;
  }

  private async clientFor(): Promise<Redis | null> {
    const connection = await this.readConnection();
    if (!connection) {
      return null;
    }

    const signature = JSON.stringify(connection);
    if (this.client && this.signature === signature) {
      return this.client;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.client?.disconnect();
    this.client = null;
    this.signature = signature;
    this.connecting = this.connect(connection).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connect(connection: RedisConnectionInput): Promise<Redis | null> {
    const client = new Redis({
      host: connection.host,
      port: connection.port,
      db: connection.db,
      password: connection.password || undefined,
      tls: connection.tls ? {} : undefined,
      lazyConnect: true,
      connectTimeout: CONNECT_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });

    try {
      await withTimeout(client.connect(), CONNECT_TIMEOUT_MS);
      this.client = client;
      return client;
    } catch (error) {
      client.disconnect();
      this.signature = '';
      this.warnOnce(error);
      return null;
    }
  }

  private async readConnection(): Promise<RedisConnectionInput | null> {
    const record = await this.prisma.systemConfig.findUnique({
      where: { key: CONFIG_KEYS.redisConnection },
    });
    const parsed = redisConnectionSchema.safeParse(record?.value);
    return parsed.success ? parsed.data : null;
  }

  private resetClient(client: Redis): void {
    if (this.client === client) {
      client.disconnect();
      this.client = null;
      this.signature = '';
    }
  }

  private warnOnce(error: unknown): void {
    if (this.warned) {
      return;
    }
    this.warned = true;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Redis 缓存不可用，本次跳过缓存：${message}`);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Redis 命令超时')), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}
