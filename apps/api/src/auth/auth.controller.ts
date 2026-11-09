import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { loginSchema, type AuthUser, type BootstrapResult, type LoginInput } from '@inkseek/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';
import type { SessionMeta } from './session.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Verifies credentials, then issues the session cookie once the session row exists. */
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '使用管理员账户登录' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<BootstrapResult> {
    const { user, token, expiresAt } = await this.auth.login(input, readSessionMeta(request));
    setSessionCookie(reply, token, expiresAt, request.protocol === 'https');
    return { user };
  }

  /** Echoes the guard-resolved user so the web client can bootstrap from one shape. */
  @Get('me')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: '获取当前登录用户' })
  me(@CurrentUser() user: AuthUser): BootstrapResult {
    return { user };
  }

  /** Revokes the session server-side; the cookie is cleared even when no token was sent. */
  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({ summary: '退出登录' })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    if (request.sessionToken) {
      await this.auth.logout(request.sessionToken);
    }
    clearSessionCookie(reply);
  }
}

/** Collects the request facts persisted on the session for later auditing. */
function readSessionMeta(request: FastifyRequest): SessionMeta {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  };
}
