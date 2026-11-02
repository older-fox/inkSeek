import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { BootstrapController } from './bootstrap.controller.js';
import { BootstrapService } from './bootstrap.service.js';

@Module({
  imports: [AuthModule, RedisModule],
  controllers: [BootstrapController],
  providers: [BootstrapService],
})
export class BootstrapModule {}
