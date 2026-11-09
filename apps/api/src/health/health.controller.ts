import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthStatus } from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: '服务与数据库健康检查' })
  /** Cheap query so the probe fails when the database is unreachable. */
  async check(): Promise<HealthStatus> {
    await this.prisma.user.count();

    return {
      status: 'ok',
      service: 'inkseek-api',
      time: new Date().toISOString(),
    };
  }
}
