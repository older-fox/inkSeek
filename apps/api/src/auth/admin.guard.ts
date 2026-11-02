import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    if (request.currentUser?.role !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: '仅管理员可以访问系统设置',
      });
    }

    return true;
  }
}
