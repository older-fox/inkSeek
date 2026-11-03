import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
