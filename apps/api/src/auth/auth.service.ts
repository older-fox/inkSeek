import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthUser, LoginInput } from '@inkseek/shared';
import { PasswordService } from '../common/crypto/password.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { toAuthUser } from './auth-user.mapper.js';
import { SessionService, type IssuedSession, type SessionMeta } from './session.service.js';

export interface LoginResult extends IssuedSession {
  user: AuthUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  async login(input: LoginInput, meta: SessionMeta = {}): Promise<LoginResult> {
    const username = input.username.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { username } });
    const valid = user ? await this.passwords.verify(input.password, user.passwordHash) : false;

    if (!user || !valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '用户名或密码不正确',
      });
    }

    const session = await this.sessions.create(user.id, meta);
    return { user: toAuthUser(user), ...session };
  }

  async getProfile(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: '登录已失效，请重新登录',
      });
    }

    return toAuthUser(user);
  }

  async logout(token: string): Promise<void> {
    await this.sessions.revoke(token);
  }
}
