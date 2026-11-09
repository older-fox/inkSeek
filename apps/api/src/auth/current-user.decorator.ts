import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@inkseek/shared';
import type { FastifyRequest } from 'fastify';

/** Injects the authenticated user; only meaningful behind AuthGuard or AdminGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    return request.currentUser as AuthUser;
  },
);
