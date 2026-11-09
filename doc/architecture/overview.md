# 架构总览

## 仓库结构

```
inkseek-platform/
├── apps/
│   ├── api/          # NestJS 12 + Fastify 5（ESM）
│   └── web/          # React 19 + Vite 8（TanStack Router / Query）
├── packages/
│   └── shared/       # 前后端共享的 Zod schema 与 TypeScript 类型
├── doc/              # 项目文档
├── .env              # 仅 DATABASE_URL（不提交）
└── pnpm-workspace.yaml
```

pnpm workspace + Turborepo 管理任务编排；`apps/*` 与 `packages/*` 均为独立包，`shared` 先构建再被两端消费。

## 分层与模块

### API（apps/api）

| 目录                    | 职责                                                                         |
| ----------------------- | ---------------------------------------------------------------------------- |
| `src/main.ts`           | Fastify 适配器、Cookie 插件、全局异常过滤、Swagger（`/api/docs`）、监听 3100 |
| `src/database/`         | `PrismaService`（全局模块），通过 `PrismaPg` 驱动适配器连接 PostgreSQL       |
| `src/config/`           | 系统配置读写服务（仅走 Prisma）、配置键常量、全局模块                        |
| `src/auth/`             | 登录、会话解析、Cookie 签发、`AuthGuard`、`@CurrentUser()`                   |
| `src/bootstrap/`        | 初始化状态、Redis 探活、首次初始化事务                                       |
| `src/health/`           | 健康检查（含数据库连通性）                                                   |
| `src/common/`           | Zod 校验管道、异常过滤器、scrypt 密码服务                                    |
| `src/ai/`               | 模型提供商与文本补全、人格 AI 写作、LLM 调用日志                             |
| `src/chat/`             | NapCat 桥接、消息持久化与分段、媒体落盘、语音转写、图片描述、直连对话        |
| `src/mind/`             | 人格心智运行时：裁决、规划器、工具、心跳、记忆/关系、长时事件、手机焦点、学习 |
| `src/personas/`         | 人格卡中心与渠道人格读写                                                     |
| `src/insights/`         | 数据洞察流检测器与追问                                                       |
| `src/overview/`         | 概览值班台聚合接口                                                           |
| `src/phone/`            | 无线 ADB 设备读取与操作                                                      |
| `src/redis/`            | Redis 连接探活与缓存                                                         |
| `src/settings/`         | 系统设置 API（模型提供商、全局禁用词等）                                     |
| `src/generated/prisma/` | Prisma 生成的客户端（构建产物，已 gitignore）                                |

### Web（apps/web）

| 目录              | 职责                                                    |
| ----------------- | ------------------------------------------------------- |
| `src/router.tsx`  | 路由定义与 `beforeLoad` 守卫（初始化状态 / 登录态跳转） |
| `src/lib/`        | API 客户端、Query 定义、表单错误映射、QueryClient       |
| `src/components/` | 品牌标识、背景、表单控件、按钮、认证布局、控制台外壳    |
| `src/pages/`      | 引导页、登录页、概览、聊天（私聊/群聊/直连）、人格中心、心智、洞察、设置、连接 |
| `src/styles.css`  | Tailwind 4 主题变量、玻璃面板、网格背景、动画关键帧     |

## 配置策略（强约束）

1. `.env` **只允许** `DATABASE_URL` 一项。Redis、管理员账户等非数据库配置全部写入 `SystemConfig` 表。
2. 所有数据库读写必须经过 ORM（Prisma），**禁止拼接 SQL 字符串**。
3. 开发/测试临时配置允许放在环境变量中，但不得进入产品运行路径。

`SystemConfig` 表结构：`key`（主键）、`value`（JSON）、`isSecret`（敏感标记）、`updatedAt`。
当前键：

- `onboarding.completed` — 是否完成初始化
- `redis.connection` — Redis 连接参数（标记为敏感）
- `video.bilibili` — B 站 SESSDATA 与昵称（标记为敏感，设置页维护，用于读取自动字幕）
- `mind.globalBannedWords` — 心智全局禁用词（设置页维护，无行用内置默认、空数组=关闭）

手机设备按渠道选择，存在 `ChatMindSettings.phoneDevice`（无线 ADB 设备：`IP:端口` 或无线调试自动发现的 mDNS 名称），不占用全局配置。

## 认证与会话

- 密码使用 Node `scrypt` 哈希（`scrypt$salt$hash`），校验使用 `timingSafeEqual`。
- 登录成功后生成 32 字节随机 token，数据库只保存其 SHA-256 哈希。
- 会话通过 HttpOnly、SameSite=Lax Cookie（`inkseek_session`）传递，有效期 7 天，生产环境附加 Secure。
- `AuthGuard` 解析 Cookie → 查询会话 → 挂载 `request.currentUser`；过期会话惰性删除。
- 无 JWT 密钥，因此不需要额外的环境变量配置。

## 引导与跳转流程

```
GET /bootstrap/status
  ├─ initialized=false → /setup
  │    步骤 1：填写 Redis → POST /bootstrap/test-redis 探活
  │    步骤 2：填写管理员账户 → POST /bootstrap
  │            （Serializable 事务：创建 ADMIN + 写入 Redis 配置 + onboarding.completed）
  │            成功后自动签发会话 → /
  └─ initialized=true
       ├─ GET /auth/me 成功 → /
       └─ 401 → /login → POST /auth/login → /
```

路由守卫在 `beforeLoad` 中通过 TanStack Query 缓存执行上述判断，避免页面闪烁。

## 数据模型

- `User`：`id`、`username`（唯一）、`displayName`、`passwordHash`、`role`（ADMIN/MEMBER）、时间戳。
- `Session`：`tokenHash`（唯一）、`userId`、`expiresAt`、`lastUsedAt`、`ip`、`userAgent`，级联删除。
- `SystemConfig`：键值配置，JSON 值，敏感标记。

聊天、人格卡与心智的数据模型（渠道、消息、媒体、人格状态、关系、记忆、运行轨迹等）见 [persona-mind.md](./persona-mind.md) 与 `apps/api/prisma/schema.prisma`。

## 前端视觉规范

- 自定义字体：Sora（标题）、Manrope（正文）、Noto Sans SC（中文）、JetBrains Mono（等宽）。
- 深色墨蓝主题，`ink / mist / brass / jade / signal` 五组色阶，避免框架默认主题。
- 页面切换使用 Motion `AnimatePresence`，表单步骤间有方向性过渡；尊重 `prefers-reduced-motion`。
- 关键容器使用玻璃拟态与网格噪点背景，形成统一品牌质感。

## 后续规划

- **定时任务**：BullMQ（复用已配置的 Redis）+ 调度表 + 执行历史。
- **可视化**：ECharts / 图表组件库，接入任务与聊天指标。
