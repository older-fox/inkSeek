import { ConflictException, HttpException, Injectable } from '@nestjs/common';
import {
  type BootstrapInput,
  type BootstrapStatus,
  type RedisConnectionInput,
  type RedisProbeResult,
} from '@inkseek/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PasswordService } from '../common/crypto/password.service.js';
import { CONFIG_KEYS } from '../config/config-keys.js';
import { SystemConfigService } from '../config/system-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { toAuthUser } from '../auth/auth-user.mapper.js';
import { SessionService, type IssuedSession, type SessionMeta } from '../auth/session.service.js';
import { RedisProbeService } from './redis-probe.service.js';

export interface InitializeResult extends IssuedSession {
  user: ReturnType<typeof toAuthUser>;
}

@Injectable()
export class BootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SystemConfigService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly redis: RedisProbeService,
  ) {}

  async getStatus(): Promise<BootstrapStatus> {
    return { initialized: await this.config.isInitialized() };
  }

  async probeRedis(connection: RedisConnectionInput): Promise<RedisProbeResult> {
    await this.assertNotInitialized();
    return this.redis.probe(connection);
  }

  async initialize(input: BootstrapInput, meta: SessionMeta = {}): Promise<InitializeResult> {
    await this.assertNotInitialized();
    await this.redis.probe(input.redis);

    const username = input.admin.username.trim().toLowerCase();
    const displayName = input.admin.displayName?.trim() || input.admin.username.trim();
    const passwordHash = await this.passwords.hash(input.admin.password);

    let user;

    try {
      user = await this.prisma.$transaction(
        async (tx) => {
          const existingUser = await tx.user.findFirst({ select: { id: true } });

          if (existingUser) {
            throw new ConflictException({
              code: 'ALREADY_INITIALIZED',
              message: '系统已存在账户，请直接登录',
            });
          }

          const created = await tx.user.create({
            data: {
              username,
              displayName,
              passwordHash,
              role: 'ADMIN',
            },
          });

          await tx.systemConfig.upsert({
            where: { key: CONFIG_KEYS.redisConnection },
            create: {
              key: CONFIG_KEYS.redisConnection,
              value: input.redis as unknown as Prisma.InputJsonValue,
              isSecret: true,
            },
            update: {
              value: input.redis as unknown as Prisma.InputJsonValue,
              isSecret: true,
            },
          });

          await tx.systemConfig.upsert({
            where: { key: CONFIG_KEYS.onboardingCompleted },
            create: { key: CONFIG_KEYS.onboardingCompleted, value: true },
            update: { value: true },
          });

          return created;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException({
          code: 'USERNAME_TAKEN',
          message: '该用户名已被占用，请更换后重试',
          fieldErrors: { 'admin.username': ['该用户名已被占用'] },
        });
      }

      throw error;
    }

    const session = await this.sessions.create(user.id, meta);
    return { user: toAuthUser(user), ...session };
  }

  private async assertNotInitialized(): Promise<void> {
    if (await this.config.isInitialized()) {
      throw new ConflictException({
        code: 'ALREADY_INITIALIZED',
        message: '系统已完成初始化，无需重复操作',
      });
    }
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
