import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');

    if (!connectionString) {
      throw new Error('DATABASE_URL is required. Add it to the root .env file.');
    }

    super({ adapter: new PrismaPg({ connectionString }) });
  }

  /** Opens the pool at startup so the first request does not pay the handshake cost. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  /** Releases the pool on shutdown so restarts do not leak connections. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
