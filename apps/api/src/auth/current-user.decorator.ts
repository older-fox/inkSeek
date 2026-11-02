import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@inkseek/shared';
import type { FastifyRequest } from 'fastify';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    return request.currentUser as AuthUser;
  },
);
