import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { OverviewSnapshot } from '@inkseek/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { OverviewService } from './overview.service.js';

@ApiTags('overview')
@ApiCookieAuth()
@Controller('overview')
@UseGuards(AuthGuard)
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  @ApiOperation({ summary: '读取概览值班台：渠道现状、近 24 小时事件与待处理项' })
  /** Aggregate read for the duty desk; assembled deterministically in one request. */
  snapshot(): Promise<OverviewSnapshot> {
    return this.overview.getOverview();
  }
}
