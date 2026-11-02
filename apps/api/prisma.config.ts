import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { defineConfig, env } from 'prisma/config';

for (const candidate of [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')]) {
  try {
    loadEnvFile(candidate);
    break;
  } catch {
    // Try the next candidate location.
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
