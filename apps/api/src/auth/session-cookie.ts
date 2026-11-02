import type { FastifyReply } from 'fastify';

export const SESSION_COOKIE_NAME = 'inkseek_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}
