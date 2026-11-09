import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  mindInsightAskSchema,
  mindInsightQuerySchema,
  type MindInsightAskInput,
  type MindInsightAskResult,
  type MindInsightFeed,
  type MindInsightQueryInput,
} from '@inkseek/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { InsightsService } from './insights.service.js';

@ApiTags('insights')
@ApiCookieAuth()
@Controller('insights')
@UseGuards(AuthGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  @ApiOperation({ summary: '读取渠道的纵向洞察流' })
  /** Returns the detector output for one channel; ordering is stable so the UI can diff. */
  feed(
    @Query(new ZodValidationPipe(mindInsightQuerySchema)) query: MindInsightQueryInput,
  ): Promise<MindInsightFeed> {
    return this.insights.getFeed(query);
  }

  @Post('ask')
  @HttpCode(200)
  @ApiOperation({ summary: '针对一条洞察追问，回答只基于卡片证据' })
  /** Single-turn follow-up; the answer is deliberately limited to the card's evidence. */
  ask(
    @Body(new ZodValidationPipe(mindInsightAskSchema)) input: MindInsightAskInput,
  ): Promise<MindInsightAskResult> {
    return this.insights.ask(input);
  }
}
