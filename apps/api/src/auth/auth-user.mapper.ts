import type { AuthUser } from '@inkseek/shared';
import type { User } from '../generated/prisma/client.js';

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}
