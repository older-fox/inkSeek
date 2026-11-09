# TODO

记录已确认但尚未实现的功能点，按主题追加；完成后从本文件删除条目（历史见 git 记录与架构文档）。

## 表情消息的语义化上下文

- 现状：`face` 段现在以占位符 `[表情]` 进入 LLM 上下文，纯表情消息也会作为一条完整消息保留、不被过滤，消息内顺序不变；`mface` / `marketface` 作为图片资产渲染。但占位符不带 `face id`，也没有表情词典，模型无法区分「笑哭」和「发怒」具体是哪个表情。
- 目标：发送给 LLM 的上下文包含可理解的表情语义，而不是统一的 `[表情]`。
- 要求：
  1. 组装上下文时把 `face id` 转成可理解语义（例如 `face[178]` → `[表情: 笑哭]`），保留原始 id 以便追溯。
  2. 表情词典或映射表可维护（数据库配置或代码常量），对未知 id 提供兜底文案（例如 `[表情: 未知 178]`）。
- 关联位置：
  - 入库与分段：`apps/api/src/chat/message-content.ts`、`apps/api/src/chat/chat-messages.service.ts`
  - 上下文组装：`apps/api/src/mind/mind-conversation-read.ts`

## 多媒体 GC 与旧目录清理

- 现状：图片/语音/表情已按 SHA-256 内容寻址落盘并按渠道隔离（`data/chat/channels/<channelId>/{images,voices,stickers}`），`ChatMediaObject` 按哈希全局缓存元数据与视觉描述，存量媒体已迁移到渠道目录。但无引用的 blob 与文件没有回收机制，旧共享目录与存量表情目录也只读保留。
- 目标：为「无引用的媒体元数据行与磁盘文件」提供 GC，并清理迁移后不再使用的旧目录。
- 要求：
  1. 消息级联只删映射行；GC 扫描没有任何 `ChatImageAsset` / `ChatVoiceAsset` / `StickerAsset` 引用的 `ChatMediaObject` 与文件，确认无引用后再删。
  2. 删除前快照到 `data/backup/`，跨渠道共享的元数据行只要还有任一渠道引用就不能删。
  3. 清理旧共享目录（`data/chat/images|voices|stickers`）与迁移遗留的 `legacy/` 扁平文件，确认新渠道路径全部命中后再删。
- 未定项：是否提供渠道级图片描述开关（目前只有渠道级 `imageDescriptionPrompt` 覆盖，描述默认走配置的默认模型，无法按渠道关闭）。
- 关联位置：
  - 媒体落盘：`apps/api/src/chat/chat-media.service.ts`
  - 数据模型：`apps/api/prisma/schema.prisma`
  - 迁移脚本：`apps/api/scripts/migrate-media-to-channels.mjs`
