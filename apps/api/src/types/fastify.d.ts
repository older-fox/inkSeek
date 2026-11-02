import type { AuthUser } from '@inkseek/shared';
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: AuthUser;
    sessionToken?: string;
  }
}
