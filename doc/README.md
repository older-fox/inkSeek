# inkSeek 平台文档

inkSeek 是一个 Agent 聊天控制平台：通过 NapCat 接入 QQ，运行人格驱动的 Agent 对话与自主心智，并提供数据洞察与概览值班台。定时任务与高级数据可视化仍在规划中。项目处于快速迭代期，请注意使用。

## 文档索引

| 文档                                                             | 内容                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| [architecture/overview.md](./architecture/overview.md)           | 总体架构、目录结构、配置策略、认证与引导流程、数据模型 |
| [architecture/persona-mind.md](./architecture/persona-mind.md)   | 人格心智：运行时循环、记忆、社交计算、工具、心跳与接入 |
| [architecture/persona-numeric-audit.md](./architecture/persona-numeric-audit.md) | 人格数值交互审计与分档改造建议（未完成）     |
| [adr/0001-stack-selection.md](./adr/0001-stack-selection.md)     | 技术选型决策记录（含取舍理由）                         |
| [api/README.md](./api/README.md)                                 | HTTP API 契约、错误格式、鉴权说明                      |
| [runbooks/local-development.md](./runbooks/local-development.md) | 本地开发启动、迁移、排障手册                           |
| [TODO.md](./TODO.md)                                             | 已确认但尚未实现的功能点                               |

## 当前能力

- 首次启动引导：配置 Redis 连接与管理员账户，写入数据库后自动登录。
- 管理员登录 / 登出 / 会话保持（HttpOnly Cookie）。
- QQ 渠道接入（NapCat）：私聊 / 群聊消息持久化、媒体内容寻址落盘、语音转写、图片视觉描述。
- 人格卡中心：数据库版本化人格卡、渠道人格配置、AI 辅助写作。
- 人格心智：自主回复裁决、记忆与关系、长时事件、手机焦点、好奇 / 反思 / 自主学习、运行轨迹。
- 直连对话（`/direct`）：绕过 QQ 的真实心智会话。
- 数据洞察流与概览值班台。
- 系统配置全部持久化在数据库，`.env` 仅保存数据库连接串。

## 尚未实现

- 定时任务调度与执行历史
- 数据可视化看板
- 多用户与权限管理（当前仅 ADMIN 角色）
