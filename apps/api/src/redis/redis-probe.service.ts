import { BadRequestException, Injectable } from '@nestjs/common';
import type { RedisConnectionInput, RedisProbeResult } from '@inkseek/shared';
import { Redis } from 'ioredis';

const CONNECT_TIMEOUT_MS = 5000;

@Injectable()
export class RedisProbeService {
  async probe(connection: RedisConnectionInput): Promise<RedisProbeResult> {
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

    const startedAt = performance.now();

    try {
      await this.connectAndPing(client);
      return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
    } catch {
      throw new BadRequestException({
        code: 'REDIS_UNREACHABLE',
        message: '无法连接 Redis，请检查地址、端口与密码',
        fieldErrors: {
          'redis.host': ['Redis 连接失败，请确认服务已启动且网络可达'],
        },
      });
    } finally {
      client.disconnect();
    }
  }

  private async connectAndPing(client: Redis): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        (async () => {
          await client.connect();
          await client.ping();
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Redis connection timed out')),
            CONNECT_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
