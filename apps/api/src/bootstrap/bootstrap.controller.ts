import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  bootstrapSchema,
  redisConnectionSchema,
  type BootstrapInput,
  type BootstrapResult,
  type BootstrapStatus,
  type RedisConnectionInput,
  type RedisProbeResult,
} from '@inkseek/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { setSessionCookie } from '../auth/session-cookie.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { BootstrapService } from './bootstrap.service.js';

@ApiTags('bootstrap')
@Controller('bootstrap')
export class BootstrapController {
  constructor(private readonly bootstrap: BootstrapService) {}

  @Get('status')
  @ApiOperation({ summary: '查询系统是否已完成初始化' })
  /** Public probe the login page uses to decide between setup and sign-in. */
  status(): Promise<BootstrapStatus> {
    return this.bootstrap.getStatus();
  }

  @Post('test-redis')
  @HttpCode(200)
  @ApiOperation({ summary: '校验 Redis 连接参数' })
  /** Dry-run connection check so credentials can be corrected before committing setup. */
  testRedis(
    @Body(new ZodValidationPipe(redisConnectionSchema)) input: RedisConnectionInput,
  ): Promise<RedisProbeResult> {
    return this.bootstrap.probeRedis(input);
  }

  @Post()
  @ApiOperation({ summary: '完成首次初始化：写入 Redis 配置并创建管理员账户' })
  /** Creates the first admin and, on success, signs the caller in directly. */
  async initialize(
    @Body(new ZodValidationPipe(bootstrapSchema)) input: BootstrapInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<BootstrapResult> {
    const { user, token, expiresAt } = await this.bootstrap.initialize(input, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    setSessionCookie(reply, token, expiresAt, request.protocol === 'https');
    return { user };
  }
}
