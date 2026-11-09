# inkSeek Platform

> **注意：项目仍处于快速迭代期，接口、数据结构与行为可能随时变化，请注意使用。**

Agent 聊天控制平台。TypeScript 全栈 monorepo，通过 NapCat 接入 QQ，运行人格驱动的 Agent 对话与自主心智。当前已上线：渠道聊天、人格卡中心、人格心智、直连对话、数据洞察与概览值班台；定时任务与高级数据可视化仍在规划中。

## 技术栈

| 层   | 技术                                                                |
| ---- | ------------------------------------------------------------------- |
| 构建 | pnpm 12 workspace + Turborepo 2 + TypeScript 6                      |
| 后端 | NestJS 12 (ESM) + Fastify 5 + Prisma 7 + PostgreSQL                 |
| 前端 | React 19 + Vite 8 + TanStack Router/Query + Tailwind CSS 4 + Motion |
| 校验 | Zod（`packages/shared` 前后端共享）                                 |
| 字体 | Sora / Manrope / Noto Sans SC / JetBrains Mono（自托管）            |

## 快速开始

前置：Node >= 22.12、pnpm 12、可用的 PostgreSQL 与 Redis。

```bash
# 1. 配置数据库连接（.env 仅此一项）
cp .env.example .env
# 编辑 .env 中的 DATABASE_URL

# 2. 安装依赖并应用迁移
pnpm install
pnpm db:deploy

# 3. 启动
pnpm dev
```

打开 http://localhost:5173，首次访问会进入引导页：填写 Redis 连接 → 创建管理员账户 → 自动登录进入控制台。

- API：http://localhost:3100/api/v1
- Swagger：http://localhost:3100/api/docs

## 目录结构

```
apps/api        NestJS 后端（认证、引导、聊天、人格、心智、洞察、概览、手机、设置）
apps/web        React 前端（引导、登录、概览、聊天、人格中心、心智、洞察、设置）
packages/shared Zod schema 与共享类型
doc             架构、ADR、API 与开发手册
```

## 配置约定

- `.env` **只保存** `DATABASE_URL`。
- Redis 连接、管理员账户等运行配置存储于数据库 `SystemConfig` 表。
- 所有数据库访问使用 Prisma ORM，禁止拼接 SQL 字符串。

## 脚本

| 命令              | 说明                |
| ----------------- | ------------------- |
| `pnpm dev`        | 并行启动 API 与 Web |
| `pnpm build`      | 构建全部应用        |
| `pnpm typecheck`  | 全仓类型检查        |
| `pnpm lint`       | ESLint              |
| `pnpm format`     | Prettier 格式化     |
| `pnpm db:migrate` | 创建并应用开发迁移  |
| `pnpm db:deploy`  | 应用已有迁移        |
| `pnpm db:studio`  | Prisma Studio       |

## 文档

- [文档索引](./doc/README.md)
- [架构总览](./doc/architecture/overview.md)
- [技术选型 ADR](./doc/adr/0001-stack-selection.md)
- [API 契约](./doc/api/README.md)
- [本地开发手册](./doc/runbooks/local-development.md)
