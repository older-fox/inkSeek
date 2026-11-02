import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SESSION_COOKIE_NAME } from './session-cookie.js';
import { SessionService } from './session.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = request.cookies?.[SESSION_COOKIE_NAME];

    if (!token) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '请先登录' });
    }

    const user = await this.sessions.resolve(token);

    if (!user) {
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: '登录已失效，请重新登录' });
    }

    request.currentUser = user;
    request.sessionToken = token;
    return true;
  }
}
