# inkSeek 平台文档

inkSeek 是一个 Agent 聊天控制平台，后续将支持定时任务、聊天界面与高级数据可视化。当前版本完成了工程脚手架、数据库初始化引导、登录与空首页。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [architecture/overview.md](./architecture/overview.md) | 总体架构、目录结构、配置策略、认证与引导流程、数据模型 |
| [adr/0001-stack-selection.md](./adr/0001-stack-selection.md) | 技术选型决策记录（含取舍理由） |
| [api/README.md](./api/README.md) | HTTP API 契约、错误格式、鉴权说明 |
| [runbooks/local-development.md](./runbooks/local-development.md) | 本地开发启动、迁移、排障手册 |

## 当前能力

- 首次启动引导：配置 Redis 连接与管理员账户，写入数据库后自动登录。
- 管理员登录 / 登出 / 会话保持（HttpOnly Cookie）。
- 空首页：已登录控制台骨架，预留定时任务、聊天、可视化入口。
- 系统配置全部持久化在数据库，`.env` 仅保存数据库连接串。

## 尚未实现

- Agent 聊天流式接口（规划 SSE + BullMQ）
- 定时任务调度与执行历史
- 数据可视化看板
- 多用户与权限管理（当前仅 ADMIN 角色）
