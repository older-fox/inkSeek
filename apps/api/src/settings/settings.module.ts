import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { ModelProviderProbeService } from './model-provider-probe.service.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Module({
  imports: [AuthModule, RedisModule],
  controllers: [SettingsController],
  providers: [SettingsService, ModelProviderProbeService],
})
export class SettingsModule {}
