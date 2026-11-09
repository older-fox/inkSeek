import type { AuthUser } from '@inkseek/shared';
import type { User } from '../generated/prisma/client.js';

/** Strips the password hash and other internals so the user record is safe to return over HTTP. */
export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}
