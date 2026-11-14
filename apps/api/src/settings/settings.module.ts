import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../chat/media.module.js';
import { PhoneModule } from '../phone/phone.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { ModelProviderProbeService } from './model-provider-probe.service.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Module({
  imports: [AuthModule, RedisModule, PhoneModule, AiModule, MediaModule],
  controllers: [SettingsController],
  providers: [SettingsService, ModelProviderProbeService],
})
export class SettingsModule {}
