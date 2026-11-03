import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { LlmService } from './llm.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, LlmService],
  exports: [LlmService],
})
export class AiModule {}
