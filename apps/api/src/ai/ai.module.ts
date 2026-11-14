import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { LlmCallLogService } from './llm-call-log.service.js';
import { LlmService } from './llm.service.js';
import { TtsService } from './tts.service.js';
import { VisionModelService } from './vision-model.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, LlmService, LlmCallLogService, TtsService, VisionModelService],
  exports: [LlmService, TtsService, VisionModelService],
})
export class AiModule {}
