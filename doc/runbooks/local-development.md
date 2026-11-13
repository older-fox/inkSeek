# 本地开发手册

## 前置条件

- Node.js >= 22.12（当前验证版本 24.18）
- pnpm 12（`corepack enable` 后由 `packageManager` 字段锁定）
- 可访问的 PostgreSQL 与 Redis

## 环境变量

项目根目录 `.env` **只允许**一行数据库连接：

```dotenv
DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<database>"
```

Redis 与管理员账户在首次访问引导页时填写，写入 `SystemConfig` 表，不进入 `.env`。
可参考 `.env.example`。

## 首次启动

```bash
pnpm install          # 安装依赖，postinstall 自动生成 Prisma Client
pnpm db:deploy        # 应用已有迁移（开发期可用 pnpm db:migrate 创建新迁移）
pnpm dev              # 同时启动 API(3100) 与 Web(5173)
```

打开 `http://localhost:5173`：

1. 若系统未初始化，自动进入 `/setup`。
2. 填写 Redis 地址并测试连接。
3. 填写管理员账户，提交后自动登录并跳转 `/`。

## 常用脚本

| 命令               | 说明                       |
| ------------------ | -------------------------- |
| `pnpm dev`         | Turborepo 并行启动全部应用 |
| `pnpm build`       | 构建全部包与应用           |
| `pnpm typecheck`   | 全仓类型检查               |
| `pnpm lint`        | ESLint                     |
| `pnpm format`      | Prettier 格式化            |
| `pnpm db:generate` | 重新生成 Prisma Client     |
| `pnpm db:migrate`  | 创建并应用开发迁移         |
| `pnpm db:deploy`   | 生产模式应用迁移           |
| `pnpm db:studio`   | 打开 Prisma Studio         |

单独启动：

```bash
pnpm --filter @inkseek/api dev
pnpm --filter @inkseek/web dev
```

## 端口

| 服务        | 端口               |
| ----------- | ------------------ |
| Web（Vite） | 5173（strictPort） |
| API         | 3100               |
| Swagger     | 3100 `/api/docs`   |

API 只监听回环 `127.0.0.1:3100`，Vite 将 `/api` 代理到 `http://127.0.0.1:3100`。如端口被占用，需同时调整 `apps/api/src/main.ts` 与 `apps/web/vite.config.ts`。

## 排障

### `ERR_PNPM_IGNORED_BUILDS`

pnpm 12 使用 `allowBuilds`。已在 `pnpm-workspace.yaml` 放行 Prisma、esbuild、Tailwind oxide。若新增需构建的依赖：

```bash
pnpm approve-builds <package> -y
```

### API 启动时报 `@fastify/static` 缺失

Swagger 依赖该包，已加入依赖；若被裁剪，重新 `pnpm install`。

### 类型错误：TS1479 / ESM 导入

Nest 12 为 ESM-only。相对导入必须带 `.js` 后缀，Prisma 生成器需保持 `moduleFormat = "esm"`，`apps/api/package.json` 需保留 `"type": "module"`。

### 引导页提示 Redis 不可达

- 确认地址、端口、密码、TLS。
- 服务端探活超时 5 秒；先用 `redis-cli -h <host> ping` 验证。
- 错误会定位到 `redis.host` 字段。

### 数据库已完成初始化，想重新引导

引导状态由 `SystemConfig.onboarding.completed` 决定。开发环境可执行：

```bash
pnpm db:studio
```

删除 `onboarding.completed` 与 `redis.connection` 两条记录，并删除 `User`/`Session` 数据后刷新页面。**请勿在生产环境执行。**

### 端口 3000 被占用

API 默认使用 3100，Web 代理已指向该端口，无需处理。
