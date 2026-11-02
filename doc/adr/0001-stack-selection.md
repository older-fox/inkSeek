# ADR 0001：技术栈选型

- 状态：已采纳
- 日期：2026-11-02

## 背景

需要从零搭建一个 TypeScript 前后端一体的 Agent 控制平台，要求：

1. 框架尽量使用最新版本。
2. `.env` 只保留数据库 URL，其余配置入库。
3. 全项目 ORM 读写，禁止拼装 SQL。
4. 前端需要定制视觉与动画，不使用默认主题。

## 决策

### 构建与语言

- **pnpm 12 workspace + Turborepo 2**：依赖去重、任务图与缓存；单仓多包便于共享类型。
- **TypeScript 6.0.3**：官方最新为 7.0.x，但 Nest CLI 12 依赖 `~6.0.2`，typescript-eslint 8.72 要求 `<6.1`。选择 6.0.3 以满足工具链兼容。

### 后端

- **NestJS 12 + Fastify 5**：模块化与依赖注入适合后续多模块扩展；Fastify 性能更好，并支持 SSE。
- **Prisma 7**（`prisma-client` 生成器 + `PrismaPg` 适配器）：类型安全 ORM；应用代码零 SQL 字符串；生成 ESM 客户端以匹配 Nest 12 的 ESM-only 要求。
- **Cookie 会话而非 JWT**：无需新增密钥配置，符合"配置入库"约束；数据库存储 token 哈希，可主动吊销。

### 前端

- **React 19 + Vite 8**：最新稳定组合，构建快。
- **TanStack Router 1.170**：类型安全路由，`beforeLoad` 适合做初始化与登录守卫。
- **TanStack Query 5**：服务端状态缓存，守卫与页面共享同一缓存。
- **Tailwind CSS 4 + Motion 14**：Tailwind 4 的 `@theme` 便于建立自定义设计令牌；Motion 负责页面与步骤过渡。
- **React Hook Form + Zod**：与 `packages/shared` 的 schema 复用，前后端校验一致。
- **Fontsource 自托管字体**：无外部 CDN 依赖，避免默认字体。

### 共享包

- **`@inkseek/shared`**：Zod schema 与 DTO 类型单一来源；两端构建为 ESM。

## 后果

### 正面

- 类型在前后端之间端到端一致，减少接口漂移。
- 配置集中在数据库，部署侧只需注入 `DATABASE_URL`。
- 会话可吊销，安全性优于不可撤销的 JWT。

### 负面 / 约束

- Nest 12 为 ESM-only：所有相对导入需带 `.js` 扩展名，Prisma 需 `moduleFormat = "esm"`。
- Fastify 版本必须与 Nest 内部固定版本一致（5.12.7），否则类型不兼容。
- 暂无多用户角色管理，`MEMBER` 角色仅预留。
- TanStack Router 的文件路由未启用，当前为代码式路由。

## 备选方案

| 方案 | 未采用原因 |
| --- | --- |
| Next.js 全栈 | 后端需要长驻队列/SSE 与独立部署；Nest 更适合任务调度扩展 |
| Express + 手写 DI | 缺少模块边界与生态整合 |
| Drizzle ORM | 类型好，但 Prisma 的迁移与 Studio 更完整 |
| JWT 会话 | 需要额外密钥配置，且无法服务端即时吊销 |
| Ant Design / shadcn 默认主题 | 与定制视觉目标冲突 |
