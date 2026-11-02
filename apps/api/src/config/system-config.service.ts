import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { CONFIG_KEYS } from './config-keys.js';

@Injectable()
export class SystemConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T>(key: string): Promise<T | null> {
    const record = await this.prisma.systemConfig.findUnique({ where: { key } });
    return record ? (record.value as T) : null;
  }

  async set(key: string, value: Prisma.InputJsonValue, isSecret = false): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value, isSecret },
      update: { value, isSecret },
    });
  }

  async isInitialized(): Promise<boolean> {
    return (await this.get<boolean>(CONFIG_KEYS.onboardingCompleted)) === true;
  }
}
