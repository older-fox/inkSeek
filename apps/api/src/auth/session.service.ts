import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@inkseek/shared';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { toAuthUser } from './auth-user.mapper.js';
import { SESSION_TTL_MS } from './session-cookie.js';

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, meta: SessionMeta = {}): Promise<IssuedSession> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        expiresAt,
        ip: meta.ip?.slice(0, 100),
        userAgent: meta.userAgent?.slice(0, 500),
      },
    });

    return { token, expiresAt };
  }

  async resolve(token: string): Promise<AuthUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return toAuthUser(session.user);
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
