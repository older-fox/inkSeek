import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// 镜像构建先装依赖、后拷 Prisma schema；此时跳过生成，由 Dockerfile 在 schema 到位后显式执行。
// 这样 schema / 迁移变更只让 generate 层失效，不会重装整套依赖。
if (existsSync('apps/api/prisma/schema.prisma')) {
  execSync('pnpm db:generate', { stdio: 'inherit' });
}
