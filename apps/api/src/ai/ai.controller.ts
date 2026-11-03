import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  personaAiGenerateSchema,
  type PersonaAiGenerateInput,
  type PersonaAiGeneration,
  type PersonaAiProviderOption,
} from '@inkseek/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AiService } from './ai.service.js';

@ApiTags('ai')
@ApiCookieAuth()
@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('persona-providers')
  @ApiOperation({ summary: '列出可用于生成人格卡的模型提供商' })
  providers(): Promise<PersonaAiProviderOption[]> {
    return this.ai.listProviders();
  }

  @Post('persona-draft')
  @HttpCode(200)
  @ApiOperation({ summary: '根据提示词生成人格卡草稿' })
  generate(
    @Body(new ZodValidationPipe(personaAiGenerateSchema)) input: PersonaAiGenerateInput,
  ): Promise<PersonaAiGeneration> {
    return this.ai.generatePersonaDraft(input);
  }
}
