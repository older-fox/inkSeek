# TODO

记录已确认但尚未实现的功能点，按主题追加，完成后保留条目并标注「已完成」。

## 表情消息需要经过 LLM 后正确带入上下文

- 现状：表情（`face` / `mface`）消息在入库时只保留原始段数据，文本字段可能为空，展示层也不渲染表情内容。
- 目标：发送给 LLM 的上下文必须包含可理解的表情语义，而不是丢失或只留下空字符串。
- 要求：
  1. 表情消息在组装 LLM 上下文时完成语义转换（例如 `face[178]` → `[表情: 笑哭]`），保留原始的 `face id` 以便追溯。
  2. 保持消息内的原始顺序：纯表情消息、图文混合消息中的表情，都必须出现在原有位置，不能统一挪到末尾或丢弃。
  3. 纯表情消息同样要作为一条完整的用户消息进入上下文，不能因为文本为空被过滤。
  4. 表情词典或映射表需可维护（数据库配置或代码常量），并对未知 `face id` 提供兜底文案（例如 `[表情: 未知 178]`）。
- 关联位置：
  - 入库与分段：`apps/api/src/chat/chat-messages.service.ts`（`extractContent` / `buildParts`）
  - 上下文组装：`apps/api/src/chat/chat-message-processor.service.ts`

## ~~消息管线对前端与日志系统不透明~~（已完成，2026-11-05）

- 结论：消息管线已整体删除，不再维护独立的事件表与 `/pipeline` 页面。运行轨迹改由 `AgentRun` / `AgentStep` / `AgentAction` 承担，前端在心智页「运行轨迹」页签中按 runId 展示裁决、工具步骤与投递结果；`SKIPPED` 也会落运行记录并写明原因。
- 以下为历史设计记录，保留供追溯。

- 现状：一条消息经过 接收 → 归一 → 裁决 → 生成 → 投递 时，各阶段只存在于进程内的调用栈里。
  前端拿不到任何阶段信息，`/pipeline` 页面只能做静态占位；日志里也没有统一的运行标识，
  排查「这条消息为什么没回 / 为什么回错」只能靠散落的普通日志拼接。
- 目标：每个阶段结束时落一行不可变事件（按 runId 归组），前端和日志共享同一份运行标识与阶段数据。
- 要求：
  1. 新增只追加的管线事件表（阶段、状态 RUNNING/SUCCEEDED/SKIPPED/FAILED、摘要、结构化详情、
     模型与 token 用量、耗时、错误码、起止时间），以 runId 串起一条消息的完整轨迹。
  2. 裁决为 SKIPPED 时明确记录原因，后续阶段不再写行；失败阶段写入错误码与错误信息，且不影响已写事件。
  3. API 暴露只读运行列表与单条轨迹；前端把占位页换成按阶段展开的时间线，能直接看出在哪一步停下。
  4. 日志系统在每个阶段输出同一条 runId 的结构化日志，级别与事件状态对应，便于与数据库轨迹互查。
  5. 事件写入不能反向影响消息处理主链路：写事件失败只记日志，不抛出、不阻断投递。
- 关联位置：
  - 消息处理：`apps/api/src/chat/chat-message-processor.service.ts`
  - 入库：`apps/api/src/chat/chat-messages.service.ts`
  - 占位页面：~~`apps/web/src/pages/message-pipeline-page.tsx`~~（已随管线删除）

## 图片落盘去重与哈希映射（内容寻址存储）

- 现状：收到的图片一律以 `时间戳-随机 UUID.扩展名` 写盘，没有内容哈希、没有去重查表；
  `ChatImageAsset` 只做「消息 → 图片」映射，同一张图在多条消息中出现会重复写文件和重复建行。
  来源无法定位、远程拉取失败或超过 64MB 时只保存远程地址甚至不建映射，因此「所有图片都落盘」
  并不成立。图片描述字段不存在，视觉模型也尚未接入。接收消息的 `segments` 若含 base64 会原样进库。
- 目标：对图片字节做内容寻址存储（SHA-256，禁用 MD5），以哈希为唯一键建立全局映射表，
  同一份字节只落一个文件、只生成一次 LLM 描述；每条消息仍保留自己的位置映射。
- 要求：
  1. 对**解码后的原始字节**计算 SHA-256；路径形如 `ab/cd/ef/<完整 hash>.<扩展名>`，扩展名只由
     字节嗅探决定（不取 URL 后缀或 mime hint），嗅探失败用 `.bin`；补充 AVIF/BMP 嗅探，聊天媒体拒收 SVG。
  2. 写入原子化：`mkdir -p` → 同目录临时文件 → `rename` 覆盖；目标已存在则跳过写盘；
     数据库用 `upsert`，唯一冲突（P2002）视为命中。先写文件后写映射，孤儿文件由 GC 回收。
  3. 新增 `ChatMediaObject`：`sha256 @unique`、`storagePath`、`mimeType`、`byteSize`、`width`、`height`、
     `description`、`descriptionStatus`（PENDING/RUNNING/READY/FAILED）、`descriptionModel`、
     `descriptionError`、`describedAt`。`ChatImageAsset` 增加可空 `mediaId`，保留 `url` / `remoteUrl` /
     `position`，历史行不动。
  4. 图片描述异步执行：消息入库后按 `mediaId` 投递幂等任务，失败只更新状态与错误信息，不影响入库与投递；
     模型来源写入 `SystemConfig`（沿用「只有 DATABASE_URL 在 .env」的约定）；送模型前长边缩到约 1024px，
     并设置独立的体积上限；是否需要渠道级隐私开关待定。
  5. 描述按图片在消息中的 `position` 进入 LLM 上下文，与上方「表情语义」条目同一思路。
  6. 接收侧入库时把 `segments` 中的图片段改写为哈希 blob URL，避免原始 base64 进入 JSON 列
     （发送侧已修复，接收与转发节点还未处理）。
  7. 删除与回收：消息级联只删映射行，需为「无引用的 blob 与文件」提供 GC；blob 可跨渠道共享，
     访问鉴权必须经过消息/会话，不能直接暴露 blob 列表。
- 进度（2026-11-04）：接收与发送的图片已按 SHA-256 内容寻址落盘（`ab/cd/ef/<hash>.<ext>`，字节嗅探扩展名、
  拒收 SVG、临时文件 rename、已存在跳过），`ChatMediaObject` 以哈希去重并保存元数据与空描述，
  `ChatImageAsset` / `ChatForwardNodeImage` 通过 `mediaId` 关联；消息改为先入库、再处理媒体与转发。
  仍待：视觉描述任务、历史图片回填、blob GC 与渠道级隐私开关。
- 进度（2026-11-08）：磁盘按渠道隔离完成。图片、语音、表情统一落在
  `data/chat/channels/<channelId>/{images,voices,stickers}`，静态 URL 为
  `/api/v1/media/channels/<channelId>/...`；`ChatMediaObject` 仍是全局内容元数据与描述缓存。
  一次性迁移脚本 `apps/api/scripts/migrate-media-to-channels.mjs` 会先备份相关表到
  `data/backup/media-channels-<时间>/`，复制旧文件并重写资产/转发节点/引用快照/归档消息段中的本地 URL；
  旧共享目录保留不删。仍待：旧文件与孤儿文件 GC、存量表情目录清理。
- 未定项：
  - 视觉描述使用哪个 provider/model，是否提供渠道级开关。
  - 历史图片是否回填到哈希路径（复制 → 校验哈希 → 建映射 → 清理旧文件），或旧数据继续使用扁平路径。
- 关联位置：
  - 媒体落盘：`apps/api/src/chat/chat-media.service.ts`
  - 入库与分段改写：`apps/api/src/chat/chat-messages.service.ts`（接收、发送、转发节点）
  - 数据模型：`apps/api/prisma/schema.prisma`
  - 视觉调用：`apps/api/src/ai/ai.service.ts`（目前只支持纯文本补全）
  - 静态服务：`apps/api/src/main.ts`、`apps/api/src/chat/chat-paths.ts`
