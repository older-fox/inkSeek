# 人格心智全量整理（2026-11-05）

> 本文是本次改造的持续进度板。每完成一项就勾选并在「执行日志」追加一行，
> 避免上下文丢失后重复执行。完成后合并结论回 `persona-mind.md`。

## 目标

1. 删除消息管线（前端、后端、共享类型、数据库表），心智成为唯一消息行为引擎。
2. 清除孤儿代码与垃圾代码：无引用的服务、端点、类型、组件、查询、样式。
3. 拆分与重构脏耦合：心智页不再一次性拉全量数据；前后端按领域拆分。
4. 数据库减表、减交叉查询：
   - `PersonaStateChange` + `PersonaRelationshipEvent` + `PersonaDriftEvent` → `PersonaChangeLog`
   - `PersonaSchedule` → 合并进 `PersonaState`（唤醒时间已重复存储）
   - 删除无引用的 `PersonaMemoryLink`
   - 删除管线三表 `ChatPipelineGraph` / `ChatPipelineRun` / `ChatPipelineNodeRun`
5. UI 全面重排：
   - 心智页改为「简报 + 页签 + 浮窗详情」，不再一屏塞满。
   - 心智配置并入渠道人格面板（互联中心）。
   - 日志（提示词）并入运行轨迹页签。
   - 对话页：点击发言人头像查看关系/群态度，点击人格头像查看人格简报，
     并可跳转互联中心人格编辑页查看实时数据与变动历史。
   - 关系/群态度详情、运行详情、记忆编辑等统一使用右侧浮窗。
6. 文档同步：本文件、`persona-mind.md`、`TODO.md`、删除 `message-pipeline.md`。

## 现状盘点

### 后端 `apps/api/src/mind`（25 文件 / 约 1 万行）

- 运行时编排：`mind-runtime.service.ts` (1340)、`mind-planner.service.ts` (769)
- 工具：`mind-tools.service.ts` (1120)
- 状态/关系/群态：`persona-state`、`persona-relationship`、`persona-group-stance`
- 审计/漂移：`mind-drift.service.ts`、`PersonaStateChange`、`PersonaRelationshipEvent`、`PersonaDriftEvent`
- 记忆/日志/待办/意图：`persona-memory`、`persona-long-event`、`mind.service`
- 其他：`mind-scene`、`mind-social`、`mind-behavior`、`mind-persona-attributes`、
  `mind-consent`、`mind-vector`、`mind-settings`、`mind-heartbeat`、`mind-reply-lock`、
  `sticker`、`web-search`
- 问题：`MindService.overview` 一次并发 12 个查询；关系/群态列表会为每个联系人/群
  `ensure` 写行（N+1）；调度表与状态表重复保存 `nextWakeAt`。

### 前端

- `apps/web/src/pages/mind-page.tsx` 2578 行，单文件包含全部页签与浮层。
- `components/pipeline/*` + `pages/message-pipeline-page.tsx` + `lib/pipeline-events.ts`。
- `components/conversation-workspace.tsx` 1146 行：消息气泡、输入、人格面板都在一个文件。
- `lib/conversation-persona.ts` 打开单个会话会先拉全量关系/群态。

### 共享包

- `packages/shared/src/types.ts` 中约 400 行管线类型。
- `packages/shared/src/mind.ts` 包含总览、贴纸扫描/导入等即将废弃契约。

### 数据库

管线表：`ChatPipelineGraph`、`ChatPipelineRun`、`ChatPipelineNodeRun`。
心智表：`ChatMindSettings`、`PersonaState`、`PersonaLongEvent`、`PersonaStateChange`、
`PersonaRelationship`、`PersonaRelationshipEvent`、`PersonaGroupStance`、`PersonaDriftEvent`、
`PersonaMemory`、`PersonaMemoryLink`、`AgentTodo`、`AgentIntention`、`PersonaSchedule`、
`AgentRun`、`AgentStep`、`AgentAction`、`StickerAsset`、`PersonaJournal`。

## 目标结构

### 后端

```
apps/api/src/mind/
  mind.module.ts / mind.controller.ts / mind.service.ts   # 薄聚合层
  mind-runtime.service.ts        # 单轮编排
  mind-planner.service.ts
  mind-tools.service.ts
  mind-scene.service.ts / mind-social.service.ts / mind-behavior.ts
  mind-persona-attributes.ts / mind-consent.ts / mind-vector.ts
  mind-json.ts                   # 新增：Prisma JSON 写入/读出辅助
  mind-settings.service.ts
  mind-heartbeat.service.ts
  mind-reply-lock.service.ts
  persona-state.service.ts
  persona-relationship.service.ts
  persona-group-stance.service.ts
  persona-long-event.service.ts
  persona-memory.service.ts
  sticker.service.ts / web-search.service.ts
```

消息快照类型从管线移到 `apps/api/src/chat/chat-message.types.ts`，
命名为 `ChatMessageSnapshot`；`ChatMessageProcessor` 只调用心智。

### API 契约

保留：state、long-events、relationships、group-stances、memories、todos、intentions、
runs、prompts、journal、actions、heartbeat、settings、stickers。

新增：

- `GET /mind/changes/:personaId?scope=&targetId=&limit=&offset=` 统一变动历史
- `GET /mind/long-events/:personaId?limit=` 长时事件列表
- `GET /mind/relationships/:personaId/contact/:externalId` 单个联系人关系（按需创建）

删除：

- `GET /mind/overview/:channelId`（改为前端按页签拉取）
- `GET /mind/stickers/images`、`POST /mind/stickers/import`、`POST /mind/stickers/scan`、
  `GET /mind/stickers/search`（UI 已不展示；Agent 走服务层 `sticker.collect/search`）
- 管线全部端点

### 数据库

- 新表 `PersonaChangeLog`：`personaId, scope, targetId, field, beforeValue, afterValue,
delta, reason, source, runId, createdAt`；索引 `(personaId, createdAt)` 与
  `(personaId, scope, targetId, field, createdAt)`。
- `PersonaState` 增加 `leaseUntil`、`leaseOwner`、`wakeReason`；删除 `PersonaSchedule`。
- 删除 `PersonaMemoryLink`。
- 删除管线三表及相关枚举。
- 迁移前把受影响表导出到 `data/backup/`。

### UI

- `/mind`：
  - 顶部：渠道/人格切换、模式徽章、刷新、心跳、跳到渠道配置。
  - 简报区：头像、身份、台词、情绪/精力/健康/注意力、当前活动、长时事件（可结束）。
  - 页签：运行轨迹（含提示词子页签）、变动历史、记忆、关系、群态度、待办与意图、日记、表情库。
  - 列表与详情分离：列表在页签内，详情用右侧浮窗。
- 渠道配置：`ChannelPersonaPanel` 增加「心智」分组，包含模式、预算、唤醒、回避锁、
  连发合并、图片描述提示词等；从心智页移除。
- 对话页：
  - 点击他人的消息头像 → 该联系人的关系浮窗（可编辑，保存到 `PersonaRelationship`）。
  - 点击自己（人格）的消息头像 → 人格简报浮窗（实时数值、长时事件、跳转人格编辑与变动历史）。
  - 群聊头部头像 → 群态度浮窗（替代现有群人格按钮）。
- 人格编辑页（互联中心渠道人格面板）：元信息分组增加「变动历史」入口/列表。

## 执行清单

### A. 删除消息管线

- [x] A1 抽出 `ChatMessageSnapshot` 并替换心智/私聊合并/图片描述的管线类型引用
- [x] A2 删除 `apps/api/src/chat/pipeline/**`，清理 `chat.module.ts`、处理器、压缩服务
- [x] A3 删除前端管线页面/组件/路由/导航/API/查询/事件
- [x] A4 删除共享管线类型与 schema
- [x] A5 删除 Prisma 管线模型与枚举，导出备份并生成迁移
- [x] A6 删除 `doc/architecture/message-pipeline.md`，更新导航与文档引用
- [x] A7 类型检查 + 构建 + 页面冒烟

### B. 后端收口

- [x] B1 删除贴纸 UI 端点与服务方法、共享契约（保留 Agent 所需 collect/search）
- [x] B2 删除 `MindService.overview`，拆成按需读接口
- [x] B3 关系/群态列表去掉 N+1 ensure，按需单条 ensure
- [x] B4 统一转换/格式化辅助，删除重复实现
- [x] B5 检查未导出/未引用服务与方法，删除孤儿（`StickerService.get`、未用 logger 等）

### C. 数据库

- [x] C1 备份受影响表到 `data/backup/`
- [x] C2 合并三张日志表为 `PersonaChangeLog`（含数据迁移）
- [x] C3 合并 `PersonaSchedule` 进 `PersonaState`
- [x] C4 删除 `PersonaMemoryLink` 与管线表
- [x] C5 更新漂移额度、心跳、长时事件、状态服务
- [x] C6 `prisma generate` + 迁移应用 + 数据完整性核对

### D. 前端心智页

- [x] D1 拆分 `mind-page.tsx` 为 shell + `components/mind/*`
- [x] D2 简报区与页签按需加载
- [x] D3 运行轨迹 + 提示词子页签 + 详情浮窗
- [x] D4 变动历史页签（跨状态/关系/群态筛选）
- [x] D5 关系/群态度列表 + 详情浮窗
- [x] D6 记忆/待办/意图/日记/表情库页签
- [x] D7 心智设置移入渠道人格面板
- [x] D8 移除心智页设置面板与 overview 依赖

### E. 对话页与人格编辑页

- [x] E1 消息头像点击：他人 → 关系浮窗；自己 → 人格简报浮窗
- [x] E2 群聊/私聊头部头像 → 群态度 / 私人格浮窗
- [x] E3 人格简报链接到 `/mind?channelId=&tab=changes` 与渠道人格编辑
- [x] E4 渠道人格面板增加变动历史
- [x] E5 对话页样式与全站一致（浮窗、间距、字号）

### F. 验证与文档

- [x] F1 `pnpm typecheck`、`pnpm lint`、`pnpm build`
- [x] F2 浏览器冒烟：心智页、对话头像、渠道配置、人格编辑
- [x] F3 更新 `persona-mind.md`、`TODO.md`（`overview.md` 无相关引用，无需改动）
- [x] F4 `git status` 清理临时文件

## 执行日志

- 2026-11-05：完成盘点，建立本文件与任务清单。
- 2026-11-05：A1-A6 完成：新增 `chat-message.types.ts`，删除后端 pipeline 目录、前端管线页面/组件/路由/导航、共享管线类型与 Prisma 管线模型；`pnpm typecheck` 通过；删除 `message-pipeline.md`。
- 2026-11-05：B 完成：删除贴纸 UI 端点/契约与 `MindService.overview`；关系/群态列表不再 ensure 全表；新增 `mind-json.ts`；删除 `StickerService.get` 与未用 logger。
- 2026-11-05：C 完成：备份 13.5MB 到 `data/backup/persona-mind-2026-11-05.json`；迁移 `20261105060000_mind_consolidation` 应用成功，`PersonaChangeLog` 迁入 56 行，状态/关系/群/长时事件均切换到新账本，旧表与管线三表已删除。
- 2026-11-05：D 完成：心智页拆为 `components/mind/mind-{ui,format,brief,runs,changes,people,library,settings-panel}.tsx`；8 个页签改为按需拉取，列表详情统一右侧浮窗；旧页面备份到 `data/backup/mind-page.pre-refactor.tsx`。
- 2026-11-05：E 完成（样式待冒烟）：`ConversationWorkspace` 接入 `ContactRelationshipPanel` 与 `PersonaBriefPanel`，消息头像/会话头像可点击；`/connections?persona=<channelId>` 可直接打开渠道人格面板；渠道人格面板新增「心智」页签。
- 2026-11-05：意外修正：`personaForChannel` 的 `id` 原先返回 `cardId`，导致渠道人格面板「心智」页签的变动历史始终为 0；改为返回人格实例 `snapshot.id`。
- 2026-11-05：孤儿清理：删除 `MindService.overview` 之后的残留（`group-stances/.../conversation` 端点、web `personaVersion` / `updateMindMemory` / `mindGroupStance`）；删除 `StickerService.get`、`MindSceneService.loadConversation`、`mind.types` 中未使用的 `MindRelationship` / `MindMessage` / `ToolCall` / `scorePercent` / `scoreSigned`；删除无人引用的 `PersonaMetadataView` 与两个对话人格面板的空「元数据」页签，并移除 `useConversationPersona` 中无人读取的 meta 历史累积。
- 2026-11-05：F 完成：`pnpm typecheck`、`pnpm lint`、`pnpm build` 全部通过；浏览器冒烟覆盖心智页 8 个页签、提示词子页签、关系浮窗历史、私聊/群聊头像浮窗、`/connections?persona=` 深链与渠道人格「心智」页签。in-app 浏览器视口处于 hidden，截图不可用，改用 DOM 文本与命中测试断言。
- 2026-11-05：补充渠道额度配置：渠道人格面板「心智」页签新增「每日消息额度」与「每日主动额度」；心跳入口按当天已发送的 PROACTIVE/HEARTBEAT run 执行主动额度，达到上限后降级为 SHADOW 并停止领取主动意图，次日恢复。
- 2026-11-05：长时事件 v2（见 `persona-activity.md`）：规划器新增【作息】简报（上次睡眠、清醒时长、睡眠债、`sleep_depth`、非约束性时长建议），`START` 必须写 `plannedEndAt`，兜底时长按睡眠债估算；活动类型放开为任意离场事项。被点名时改为 `mind.long-event.wake` 自主判断 `{wake,urgency,reason}`，新增 `JUDGMENT`，删除全局唤醒词表，模型失败才用事件自定义词与点名阈值兜底。心跳改用 `markHeartbeat`，`lastWakeAt` 只在事件结算更新，不再每次扣睡眠债。
