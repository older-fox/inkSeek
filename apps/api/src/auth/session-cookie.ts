import type { FastifyReply } from 'fastify';

export const SESSION_COOKIE_NAME = 'inkseek_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
  secure = false,
): void {
  // Derive this from the request protocol (with trustProxy) rather than
  // NODE_ENV: the shipped deployment speaks plain HTTP, where a Secure cookie
  // would be dropped by the browser and login would silently fail.
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}
