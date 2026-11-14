# 人格心智架构（Persona Mind）

> 目标：让人格不再只是「一问一答的提示词」，而是一个有连续自我、关系、记忆、情绪、注意力和生活节奏的常驻心智。消息管线已于 2026-11-05 全量删除，消息进入处理器后直接交给 Mind Runtime。

## 1. 设计立场

当前系统是「消息反射弧」：消息进来 → 心智判断 → 回复。拟人化需要补上两个时间尺度：

- 秒级：是否注意、是否回复、用什么姿态、发几条、要不要发表情。
- 小时/天级：消化、遗忘、后悔、想起、主动、睡觉、醒来补消息。

九个拟人化机制：

1. 连续自我：心情、精力、社交电量、当前活动。
2. 会变的情绪：事件触发、强度衰减、心情是慢速叠加。
3. 选择性注意：不是每条消息都回，沉默是一等公民。
4. 关系差异：对不同人、不同群有不同态度和面具。
5. 不完美记忆：只记得重要的、最近的、情绪强烈的；会模糊、会过时。
6. 主动与沉默：会主动找人，也会选择不说。
7. 生活节奏：睡觉、醒来、补消息、夜间不打扰。
8. 隐私与面具：私下知道的事不在群里说。
9. 语言习惯：句长、标点、语气词、错别字、分段、表情频率。

核心原则：

- **内心感受与外在表现分离**：`felt` 与 `shown` 分开，允许「捏着鼻子陪喜欢的人」。
- **模型提议，系统钳制**：关系数值、发送上限、隐私边界由确定性代码兜底。
- **动作计划与执行分离**：模型只生成 `ActionPlan`，执行器负责发送、延迟、重试和日志。
- **心智循环不画成 DAG**：工具循环封装在一次 `mind.turn` 内，内部步骤完整落 trace。

## 2. 总体架构

```text
Event Bus（消息 / 入群 / 撤回 / 时间）
        │
        ▼
Attention Scheduler（突发合并 / @ / 睡眠 / 社交电量）
        │ Scene
        ▼
Mind Turn（回忆 → 评估 → 社交计算 → 意图 → 工具 → 表达）
        │ ActionPlan
        ▼
Action Executor（打字 · 多气泡 · 表情 · 日志）
        │
        ▼
World State · Memory · Relationship · Todo
Postgres + 本地向量 + Action Journal
```

慢循环：

```text
Heartbeat（待办 / 主动意图 / 状态漂移 / 轻量整理）
        │
        ▼
Consolidation（聚类摘要 / 事实提炼 / 日记 / 自我叙事）
```

## 3. 运行时循环

| 循环         | 时间尺度  | 职责                                   |
| ------------ | --------- | -------------------------------------- |
| Reflex       | 毫秒      | 入库、去重、媒体描述、转发             |
| Scene        | 秒        | 突发合并、注意力评分、场景构建         |
| Deliberation | 十秒      | 记忆检索、社交计算、工具循环、动作计划 |
| Heartbeat    | 分钟/小时 | 状态漂移、待办、主动意图、轻量整理     |
| Dream        | 天        | 深度整理、日记、自我叙事               |

场景构建：

```text
Scene {
  personaInstanceId, channelId, conversationId,
  messages[], cast[], topic, phase, time
}
```

注意力评分参考：是否@、是否直接提问、关系重要性、群活跃度、冲突、情绪强度、社交电量、睡眠、最近是否刚发过言。

## 4. 数据模型

运行时人格实例复用 `ChatChannelPersona`，不另造身份表。所有状态按渠道隔离。

| 模型                  | 作用           | 关键字段                                                                                                                                                                                                                                                                                                                  |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PersonaState`        | 当下自我       | moodValence/Arousal/Dominance、energy、stress、socialBattery、attention、currentActivity、location、sleepDebt、grooming、lastWakeAt、nextWakeAt、leaseUntil、leaseOwner、wakeReason；心跳调度已并入本表                                                                                                                   |
| `PersonaRelationship` | 对个人的关系   | affinity、trust、intimacy、attraction、hostility、fear、respect、obligation、dependency、possessiveness、friction、unresolvedConflict、familiarity、relationTags、addressHere、openPromises、sharedEvents、boundaries、extras（仅存此刻值，增量在 `PersonaChangeLog`）                                                    |
| `PersonaGroupStance`  | 对群的态度     | comfort、belonging、attention、formality、speakRate、audienceRisk、role、tabooTopics、boundaries、extras                                                                                                                                                                                                                  |
| `PersonaChangeLog`    | 统一变动账本   | personaId、scope（STATE/SELF/RELATION/GROUP）、targetId、field、beforeValue、afterValue、delta、reason、source、runId；状态/自身/关系/群四类历史与漂移配额共用这一张表                                                                                                                                                    |
| `PersonaMemory`       | 统一记忆       | scope、kind、subject、content、structured、importance、confidence、emotion、visibility、status、occurredAt、sourceIds、embedding                                                                                                                                                                                          |
| `AgentTodo`           | 待办/唤醒      | title、detail、priority、dueAt、wakeCondition、recurrence、status、source                                                                                                                                                                                                                                                 |
| `AgentIntention`      | 主动意图       | targetType、targetId、need、reason、seed、urgency、confidence、risk、feedback/feedbackAt、earliestAt、expiresAt、status、attempts                                                                                                                                                                                         |
| `AgentRun`            | 一次心智运行   | trigger、persona、scene、model、tokens、decision、plan、status、latency                                                                                                                                                                                                                                                   |
| `AgentStep`           | 思维/工具步骤  | runId、type、input、output、durationMs、error                                                                                                                                                                                                                                                                             |
| `AgentAction`         | 动作日志       | runId、kind、payload、status、idempotencyKey、sentMessageId、error                                                                                                                                                                                                                                                        |
| `StickerAsset`        | 本地表情       | channelId、sha256、filePath、tags、description、embedding、usageCount；渠道内按 `(channelId, sha256)` 唯一                                                                                                                                                                                                                |
| `VideoInsight`        | 视频理解缓存   | platform、videoId、url、标题/作者/时长/简介、stats、transcript、comments、summary、keyPoints、framesPath、frameCount、watchedAt、usageCount；按 `(platform, videoId)` 唯一，与渠道无关                                                                                                                                    |
| `MindLearningLog`     | 学习会话账本   | personaId、channelId、trigger（HEARTBEAT/MANUAL）、status、reason、sources、learned、styleNotes、summary、error、runId、startedAt/finishedAt；记录「看了什么、留下什么、学了哪些表达」，不复制记忆行                                                                                                                      |
| `PersonaStyleNote`    | 学到的说话方式 | personaId、channelId、scope（SELF/RELATION）、contactId、dimension（length/punctuation/particles/openings/humor/rhythm/vocabulary/tone）、content、samples、sources、confidence、evidenceCount、status（ACTIVE/PAUSED/PROMOTED）、appliedCount/lastAppliedAt、lastSeenAt/promotedAt；是人格卡之上的适配层，不是第二份人设 |
| `PersonaJournal`      | 日记/反思      | personaInstanceId、date、content、mood、consolidatedMemoryIds                                                                                                                                                                                                                                                             |
| `LlmCallLog`          | LLM 调用账本   | source、provider、model、system、prompt/response、tokens、latency、error、runId、channelId/personaId；正文只保留最近 200 条，更早的归属调用只留用量                                                                                                                                                                       |

单一真源（2026-11-04 收敛完成）：

- 自我属性只存在于 `ChatChannelPersona.values`（基本数值，附带 `history` 修订日志）与 `PersonaState`（当下数值，一行一人格）。渠道人格面板直接写回服务端，不再使用 localStorage 覆盖；面板里由 `PersonaState` 掌管的字段（正在做的事、位置、情绪三维、精力、压力、社交电量、注意力、睡眠债、整洁程度）以实时投影展示，编辑直接写回 `PersonaState`，不写入卡片副本。
- 对每个人只存一份 `PersonaRelationship`，对每个群只存一份 `PersonaGroupStance`；`ChatPrivatePersona` / `ChatGroupPersona` 已迁移并删除，对话页的人格面板也改为读取这两张表。
- `PersonaState` 是唯一的动态参数；渠道列表通过读时投影展示「此刻」状态，渠道面板与心智页都会展示全部 10 个当前数值，不落第二份。
- `PersonaChangeLog` 同时承担两件事：变动历史（scope/targetId/field/before/after/reason/source）与漂移配额账本（`delta != null` 的行按 source 统计 24 小时净变化）。它不保存任何当前值。
- 情绪是全局底色：规划器与社交判断都会先写入「全局外显」，只有对某人好感 > 65 时才允许明显例外。

存储：

- Postgres：状态、关系、记忆元数据、待办、trace。
- 向量：首版使用本地哈希向量 + 应用内余弦相似度，避免依赖 pgvector 扩展；后续可替换为 pgvector。
- 磁盘：聊天图片、语音、表情按渠道隔离，统一位于 `data/chat/channels/<channelId>/{images,voices,stickers}`；文件仍按 SHA-256 分片寻址（`ab/cd/ef/<hash>.<ext>`），URL 为 `/api/v1/media/channels/<channelId>/...`。`ChatMediaObject` 只保存内容元数据与视觉描述，仍按哈希全局共享；字节文件按渠道各存一份，删渠道目录不会影响其他渠道。
- Redis：工作记忆、突发缓冲、LLM 缓存。

## 5. 记忆系统

五类记忆：工作、情景、语义、关系、程序；另加前瞻记忆（待办/承诺）和表情记忆。

写入路径：

```text
消息批次 → 显著性评分 → （低分只留工作记忆）
        → LLM 抽取（情景 / 事实 / 偏好 / 承诺 / 边界 / 关系信号）
        → 去重 / 矛盾消解 / 置信度
        → PersonaMemory + PersonaChangeLog
```

情景记忆节流：普通对话不写入 `EPISODE`；显著性 ≥ 75、关系数值单轮变化 ≥ 4 或强情绪（≥ 80）事件才写，同一会话普通情景至少间隔 3 小时，显著事件至少间隔 20 分钟。已有显式 `memoryWrites` 时不再重复写情景。场景不是聊天日志；长期事实、偏好、承诺、边界、重要经历以规划器的显式写入为主，提示词鼓励对可长期复用的新信息主动写最多 5 条。情景按会话类型归到联系人（私聊）或群（群聊）名下。情景正文只保留对方发言和当时发生了什么，不抄自己的回复原文；整理时 `BOUNDARY` 也只写处理原则，不保存固定台词——否则旧对白会变成下一次的复读模板。

读取路径：

```text
场景查询
  ├─ 会话范围：本会话记忆 + 稳定自我/世界/话题记忆；私聊另含当前对象的关系记忆
  ├─ 长期底色：重要 FACT/PREFERENCE/PROMISE/BOUNDARY/REFLECTION，场景内最多 3 条，仍须与本轮有文本相关
  └─ 相关召回：会话可见候选（最近 600 + 重要旧记忆 300 + 低重要度旧记忆档案 400）合并 → 打分（语义/关键词/重要性/近因/回忆次数）
→ 可见性过滤（PRIVATE/SCENE/CHANNEL/PUBLIC）→ 有效期过滤（validFrom/validTo）
→ 群聊排除其他会话的私聊/场景记忆；全局记忆达不到最低文本相关度时不进提示词
→ 相关记忆最多 12 条进入提示词（长期底色单独成段）
→ 陈年记忆：超过 180 天、最久没被召回的最多 3 条单独列给模型，由它决定留或忘
```

旧记忆不会因为数量超过最近窗口就永久失联：重要度 ≥ 60 的记忆始终进入候选池；低重要度的旧条目不按时间死掉，而是按 `lastRecalledAt` 轮转进 400 条档案池。显式检索（`memory.search`、心智页搜索）不走池子，直接扫当前场景可见的全部记忆（上限 1 万条），所以很久以前的内容也能被找到。心智页列表分页，每页 50 条并显示总数。提示词里的记忆日期按人格时区输出，不再直接截取 UTC 日期。

遗忘：

```text
strength = importance × exp(-Δdays / halfLife) + recallBoost
```

核心记忆不衰减；默认不物理删除，支持用户置顶/编辑/删除。`validTo` 过期的记忆仍保留在库里，但不再进入场景召回。陈年记忆复盘只更新独立的 `staleReviewedAt`（不算召回，也不影响衰减和档案池轮转），下一轮换一批；模型可以用 `memory.forget` 遗忘过时、被推翻或不想再保留的旧记忆，系统不设遗忘数量上限，也不强迫它清空。所有遗忘都是软删除（`status=DELETED`、清空 embedding）。

整理：

```text
未整理情景（≥ 2 条、且已过 30 分钟）
→ 携带已有长期记忆 → 摘要/合并（最多 5 条）
→ 事实/承诺/边界写入 PersonaMemory → 写日记 → 标记已整理
```

整理不只在心跳后发生：普通消息轮结束后也会在后台尝试一次，进程内按人格加锁，避免同一批情景被重复整理。已有长期记忆会一起给模型，要求合并而不是另起重复条目。

隐私防火墙：`PRIVATE / SCENE / CHANNEL / PUBLIC` 四级可见性，检索时按当前场景过滤。

## 6. 社交计算

输入：自我状态、对个人的关系、对群的态度、场景、在场成员、记忆、议程、硬边界。

`SocialRead`：

```ts
interface SocialRead {
  attention: number;
  desire: number;
  risk: number;
  obligation: number;
  felt: Emotion;
  suggestedStance: Stance;
  reasons: string[];
  hardConstraints: string[];
}
```

`ReplyDirective`：是否回、姿态、目标、边界、内容点、语气、称呼、披露程度、内心与外在。

群态度六项默认 0（表示「还没形成明显信号」），风险按 0 基准计算：自在、关注等只做加减项；私密记忆只提供有上限的谨慎度（最多 18），不会因为记忆库里私密条目多就把群聊风险顶满。群态度的行为描述与提示词排序也按 0 基准：接近 0 的项不进入提示词，避免把「还没判断」写成「不自在、很少主动」。

### 6.1 对话提示词预算

每轮规划提示词按固定顺序拼接；角色卡的规则与资料全量输出，不按 token 预算截断：

```text
我（名字/身份/年龄/性别）
性格（从 9 个心理数值里挑最极端的 5 项，每项带行为含义）
表达（完整说话风格 + 角色卡禁用语 + 全局禁用词）
说话习惯（句长/标点/语气词/开场/表情/错字/幽默/冲突/记忆倾向/知识边界/防破面/称呼/敏感点/触碰偏好/尺度/禁忌/不可妥协/风格样本/在线策略）
场景写法（仅 sceneDetail 非 OFF：角色卡 scene_style + 尺度 + 进入/退出规则）
角色卡资料（世界观/背景/种族/职业/身高体重/体型/外貌/发型/服装/声音/价值观/害怕/软肋/目标/困难/活动/位置；只用于理解，不主动复述）
此刻（现在：本地日期/星期/时区；心情/精力/压力/社交电量/注意力，均带低高区间行为提示；当前活动从几点开始、已持续多久；距上一条消息多久；活动超过 2 小时给一句提醒）+ 正在做的事。所有时间一律按人格 `time_zone` 渲染；卡片缺失或写错时用 `Asia/Shanghai` 兜底，绝不回退到服务器时区（容器通常是 UTC，会把人格时间整体偏移）
对话对象（与其最显著的 4 个关系维度，带行为含义）
在场（其余成员只给 3 个关系数字）
在场熟人（群聊里在别处认识的人：名字 + 记忆条数，提示语气照常亲近、内容按可公开范围，不给内容）
这个群（最显著的 3 个群态度，带行为含义 + 群规 + 话题）
我的判断（社交计算摘要）
对话节奏（兴趣分 + 双方最后一句类型 + 话题收束程度 + 未答提问 + 连发/长度/轮次 + 怎么接）
长期底色（场景内 3 条相关的重要长期记忆）
最近经历（当前场景可见总量/近 7 天新增 + 12 条相关记忆，日期按人格时区）
陈年记忆（超过 180 天、最久没被召回的最多 3 条，带 id/天数/重要度/置信度，由模型决定留或忘）
最近对话（最近 200 条；单条截 160 字，本地时间，跨 30 分钟标注「隔 N 小时」，跨天带日期）
我最近说过（不在上面 200 条内、但 6 小时内自己说过的发言，最多 8 条）
可用工具（全部工具名 + 一句话用途，可直接调用；参数不确定再 tools.search）
```

角色卡全量进入提示词（2026-11-07 起）：禁用语、说话风格、句长/标点/语气词/开场、幽默/冲突/记忆倾向、知识边界、防破面总纲/触发/禁止/收场/允许元话题、拒绝模板、称呼限制、敏感点/触碰偏好/尺度、禁忌/不可妥协、风格样本、在线策略，以及世界观、背景故事、种族、职业、身高体重、体型/外貌/发型/服装/声音、价值观、害怕、软肋、长期/当前目标、困难、卡片里的活动/位置都完整输出，不再截断或省略。资料段明确「只用于理解人物，不主动复述、背设定或当背景话题；当前活动/位置以【此刻】为准」，避免把背景讲成独白。对话内容仍由最近对话、最近记忆和当前处境推算；对话节奏的兴趣判断也照旧使用目标/价值观短句。提示词里的每个数值都必须带一句「这个数值会让 TA 怎么做」，避免模型把数字当装饰。心跳提示词额外带 `WakeBrief`，夜间消息直接列出最近 5 条原文而不是只给条数，其余部分一致。

### 6.2 对话节奏与兴趣

每轮消息在社交计算之后跑一次 `readConversation`（纯函数，无 I/O）。它只提供依据，不替模型决定静默：

- **消息分类**：对方最后一句分成道别、提问、求助、纯附和、有实际内容五类；短句里含「什么/怎么/为什么」等疑问词也会按提问处理。
- **节奏信号**：继续意愿 `ownIntent`/`theirIntent`、话题闭环、节奏疲劳、未答提问、明确道别、直接点名、最近 30 分钟轮次。对方明确提问/求助而没答时，建议永远是先回答，不能用收尾逃开。
- **回复形状**（2026-11-08）：`rhythm` 统计最后一段对方连发几条、是否同一人、平均/最后一条字数，自己上一轮几条，近 5 分钟双方条数。【对话节奏】不再直接摆「闭环/疲劳百分比」，改成「话题已经收住/在收/还开着」「来回偏密/正常」，并给出一条「怎么接」：对方连发几条就合并回一次、短句回短句、长段挑一两点、自己刚说完对方没接就不补、群里几个人连着说只对标一个人。
- **兴趣**：从人格的目标/价值观、高重要度 `PREFERENCE`/`TOPIC` 记忆里拆出短句，按字符重合 + 本地向量相似度算 0–100 兴趣，命中短句作为话题提示；自身的当前活动和位置只作处境，不参与兴趣匹配，避免把「我刚醒」当成对话话题。兴趣并入 `ownIntent`。
- **结论**：`continue`（还在聊）、`linger`（先缓一缓，通常不用补）、`close`（可以收尾），连同理由、建议和回复形状写进【对话节奏】和 AgentRun 的「注意力与社交判断」步骤。

私聊同样适用，但没有群聊「半小时没人接」的硬收尾规则。兴趣高时允许主动接话或追问；兴趣低又没有新信息时，模型可以自然地读而不回。兴趣来源随人格卡与记忆自然变化，收尾只是这一段告一段落，对方继续时重新判断。

**上次收尾**（2026-11-08）：模型用 `dialogue.close` 收尾时，把收尾时间、原因、摘要和下次接法写回 `ChatConversation` 的五个可空列（`closureClosedAt` / `closureReason` / `closureSummary` / `closureNextOpening` / `closureReopenedAt`，迁移 `20261108100000_mind_closure_record`），不新建表、不加设置。原因由运行时按当轮判断归类：启动长时事件 → `busy`，对方明确道别 → `explicit-end`，话题闭环 ≥0.8 → `topic-done`，疲劳 ≥0.5 → `tired`，其余 `natural`。之后第一条晚于收尾时间的入站消息记一次 `closureReopenedAt`，后续消息保留第一次的时间。规划器只对 7 天内的记录注入【上次收尾】：对方 10 分钟内重新开口时提示「这是新的开始，别复读上次结尾」；否则提示「这段已经收过尾，除非有新由头不要硬续旧话题」。它只是参考，不阻止发送，也不替代当轮对对方新内容的判断。

### 6.3 说话习惯与重复自检

角色卡里的 `sentence_length`、`punctuation`、`particles`、`emoji_level`、`typo_level`、`conflict_style`、`self_control`、`knowledge_boundary`、`in_character_principle` 以前只存在卡里，不进入生成。现在它们会收成一小段【说话习惯】：

- 句子长短、标点习惯、常用语气词按卡面描述直接给出行为提示，不暴露数字。
- `emoji_level`/`typo_level` 转成「不用 / 偶尔一个 / 可以常用」这类程度，不要求模型精确计数。
- `conflict_style` 与自控值合并成一句「被冒犯时倾向 …」，配合全局规则「先短句顶回去或冷处理，不解释、不求饶」。
- `knowledge_boundary` 转成「不懂就说不懂，不编型号和参数」的边界；`in_character_principle` 只截前 120 字，防止模型用 AI/程序自证的方式破面。
- 全局规则另外限制：默认 1 个气泡、一条回复最多一个问句、不主动提 AI/模型/程序。
- 只写说出口的话：不用括号写动作、表情或发送旁白；表情包是语气不是话题，文字里不点破或解说「这张图/这个表情/图里」，也不说「这图就是你/像你」；没有别的正文就只发表情。`sticker.search/describe` 返回的描述只用于挑选和确认，不进入回复。
- 表情库直接进提示词：规划器每轮带上当前渠道最近/常用的 12 张表情（id、标签、80 字描述），模型不用先 `sticker.search` 就能直接挑 id 发；没有合适的才搜索。一次回复最多 2 个表情；看到聊天里合适的图片先用 `sticker.collect` 收藏，不用问，也不用在回复里报备。
- 表情库可管理（2026-11-08）：心智页「表情库」每张卡片右上角带删除按钮，确认后调用 `DELETE /mind/stickers/:channelId/:id`，按渠道校验，跨渠道 id 返回 404。删除只影响当前渠道的表情库；同一张图被多个渠道收藏时共用一份文件，只有最后一行引用被删掉才清理文件。已经发出去的消息里保存的是当时的描述，不受删除影响。
- 全局禁用词（2026-11-08）：除角色卡自带的 `banned_words`，另有服务端全局禁用词表，存在 `SystemConfig` 的 `mind.globalBannedWords`，对全部渠道、全部角色生效。内置 120 条，覆盖五类：①「稳/重/轻/认/记」式判断（「这句话稳」「比之前的都重」「行，我认」「你掂量」等 49 条）；②回执承接（「好的」「收到」「了解」「你说得对」「让我想想」等）；③结构总结腔（「首先」「其次」「总的来说」「换句话说」「不是xx而是xx」「让我们」等）；④客服式收尾（「希望这些对你有帮助」「还有什么想聊的吗」「建议你可以」等）；⑤思考过程泄漏（「用户现在」「我需要理解」「针对你提到的问题」等）。共情、陪伴、网文描写和夸张感叹类不在默认表里，避免把角色语气一起抹平。在设置页「全局禁用词」逐行编辑并保存，空数组表示不启用。规划器每轮现读，拼进【表达】的「全局禁用词」一行，明确「任何角色、任何场合都不要出现，也别换同义说法绕回来」；系统提示词同时声明这是硬性规则。角色卡禁用语继续叠加，不会被全局表覆盖。
- 角色卡规则全量输出（2026-11-07）：`banned_words` 以前只取前 8 个，助理腔词条排在末尾永远进不了提示词；现在 68 条全部注入，不截断、不过滤占位模板，并明确「不要说出原词，也别换同义说法」。`language_style`、句长、标点、语气词、常用开场、幽默、冲突风格、记忆倾向、知识边界、防破面总纲/触发/禁止/收场/允许元话题、拒绝模板、称呼限制、敏感点、触碰偏好、尺度上限、禁忌、不可妥协、风格样本、在线策略都不再截断。另外新增【角色卡资料】段，完整输出世界观、背景故事、种族、职业、身高体重、体型/外貌/发型/服装/声音、价值观、害怕、软肋、长期/当前目标、困难与卡片里的活动/位置，并注明「只用于理解人物，不主动复述、背设定或当背景话题，当前活动/位置以【此刻】为准」。`language_style` 样例仍要求只学长短和语气、不照抄，避免「没关系的/有我在呢」这类服务式安慰被当成台词。

夸张比喻和情绪不是一回事：ESPDIY 群「0201那尺寸 我凑近看都怕呼一口气就不知道吹哪去了」的轨迹里，felt 是愉快 60、心动 70、desire 77、stance「轻松打趣」，但比喻不是情绪直接生成的——模型是在自己不懂的硬件话题里，为了接住恋人的玩笑，用画面感补空白；角色卡的 `anchor_few_shot`（「哎呀我！这么厉害！」「哈哈哈哈太好玩了草」）和 `language_style` 的感叹/省略号又把这种演法放大了。现在规则明确：不懂、不熟、尺寸太小、参数看不懂，直接说「太小了，不好搞」「这个我真不懂」「没听过」；技术/尺寸/参数话题不用比喻、拟人和戏剧化画面；情绪只影响语气和长度，不把话变成表演；风格样本只学情绪幅度和句长，不照搬惊叹、夸张反应和比喻。对照示例写进提示词：「呼一口气就吹没了」→「那也太小了，不好搞」。

助理腔是另一类人机感：实盘 1121 条自发言里「我这边」出现 17 次、「你这边」19 次、「我认」10 次、「我记下了」4 次。全局规则新增：直接用「你/我」，不用「你这边/我这边」；听懂就接内容，不用先回「收到/了解/明白/我记下了/我记住了/已记录」；认错就说具体错在哪，不要只丢一句「我认」；不用「为你/帮你/需要我…吗/首先/其次/最后/总的来说/总结一下/根据你的描述/我理解你的感受」；写记忆、用工具、改状态都不在回复里报备。另加一条节奏要求：像手机上打字，能短就短，一句话最多一个转折，不用「其实/不过/所以」串长句。`memory.create` 的工具说明也要求写完不报备。重复自检会统计这些助理腔在最近 20 条自发言里的次数，单项 ≥2 次时直接点名并要求改口。

重复自检是纯函数 `readRepetition`：取最近 20 条自己发出的消息，按中文二元组统计反复出现的生活词（去掉常用词、人名），出现 ≥3 次时在【重复自检】里列出「炒饭（6 次）」这类事实，并建议「没有新信息就换一件事」。同一份读取还会标出五类人机感信号：来自自身 `identity` 的词在 20 条里出现 ≥2 次（反复自报职业/身份）；连续 3 条以上消息用同样的前三个字开头（模板化起手）；两条以上消息的前 12 个字几乎一模一样（整段复读）；助理腔（你这边、我这边、我认、我记下了、收到/了解、为你/帮你、需要我、总结腔）单项出现 ≥2 次；以及未来行程播报/空头承诺（「讲给你听」「看到好玩的」「等我看完」「回头再说」「那我刷刷看」「闲着也是闲着」）累计 ≥2 处。提示词分别要求换说法、直接说「你/我」、不报回执或干脆不说；对未来承诺则要求「要做就这一轮真的做（phone.play / video.watch / browser.*），不做就只回应现在」，不拿计划预告垫话。它只提供可见性，不禁用话题；活动提示的陈旧阈值也从 4 小时降到 2 小时，要求模型先改 `current_activity` 再回复。群聊另有「有没有必要接」的规则：被点名、被直接问、话题正感兴趣或有新信息才接；只是闲聊、插不上话、兴趣低或刚说过一轮时可以安静待着。

### 6.4 场景描写模式（2026-11-08）

按渠道的 `ChatMindSettings.sceneDetail` 控制，默认 `OFF`：

- `OFF`：保持原来的聊天规则，只写说出口的话，不写动作或舞台旁白。
- `ACTION`：日常对话仍只写台词；亲密场景允许在 text 里用（动作）写简短动作和场景，单条动作最多 800 字。
- `EXPLICIT`：规划器不自己写大段动作，而是输出 `sceneCue`（1-2 句：谁、在哪、做什么、身体和情绪走向）+ 台词 beats；运行时调用 `MindSceneWriterService` 做第二次模型调用，把 cue 扩写成 300-800 字的场景/动作正文，作为正文第一条文字 beat 发出，然后才是台词。规划器在这个模式下的 `maxTokens` 从 2000 提到 4000，避免思考占满预算；扩写单独用 4000，空内容再用 6000 重试。

场景写法来自角色卡 `values.scene_style`（≤2000 字，渠道编辑器的「边界与同意」和 Persona Center 的高级面板都能改），为空时使用内置默认：以角色本人视角写环境、动作、身体反应和感官，动作有先后、写清接触点，不用比喻代替过程。扩写提示还会带 `explicit_level_char`、`sensitivity_map`、`touch_preference`、`taboos`、`non_negotiable`、`aftercare_need_base`、当前身体状态、目标关系的数值/标签/边界/称呼、最近 16 条对话和禁用语（角色卡 + 全局）。扩写只写场景与动作，不写台词，避免和规划器的台词重复；它同样受全局禁用词约束。

进入和退出由模型判断：对方明确邀请或回应、且卡面尺度允许时才进入；喊停、转开话题或进入事后照护时自然退出。`SHADOW` 模式跳过扩写，避免没有输出的回合浪费一次调用；`test:mind` 试跑会在只读模式下真实执行扩写，方便检查正文长度和写法。场景正文仍按普通文字消息落库，不新增消息类型或表；需要 UI 区分旁白时再给 beat 加类型。

## 7. Agent 工具与动作

工具是人格的能力边界。提示词常驻一份紧凑的【可用工具】清单（工具名 + 一句话用途），模型可以直接调用，不再强制先经过 `tools.search`；只有参数不确定时才用 `tools.search` 查详细参数。系统提示词要求模型在动手前先判断这轮是否需要核实或接续：涉及过去、对方说过的话、关系细节、承诺、群里的旧话题、当前时间或自身状态时，先用对应工具查证，一次查不到可以换关键词或用 `aroundMessageId` 继续翻，一轮可以连续调用多个工具，但查证结果不一定要说出口。可调用的工具包括：

- `history.search`：翻阅本会话聊天记录，支持关键词、发送者、`since`/`before` 时间窗和 `aroundMessageId`（看某条消息前后 45 分钟）；不传条件时返回最近消息，返回消息 `id`（`todo.create` 的邀请/答应 ID 来源）
- `memory.search`：在当前场景可见范围内语义检索**全部**长期记忆（包括很久以前的，上限 1 万条），同时返回最多 3 条长期底色；结果带 `ageDays`/`importance`/`confidence`，便于判断是否过时。`memory.create` 用于显式写入
- `memory.forget`：按 id 遗忘自己的记忆（1–10 条/次），只做软删除；用于过时、被事实推翻或不想再保留的旧记忆，系统不要求清空
- `relationship.get`：返回 13 项数值和标签/称呼/各场合称呼/边界/承诺/共同经历/公开范围/拉黑/静默等全部字段，并附带数值的行为含义；另返回 `attributes` 清单（37 项，含 key、中文标签、分组、类型、当前值，空值也列出）
- `relationship.update`：按需调整全部关系字段；`attributes` 可直接写回 `relationship.get` 返回的任意属性键（37 项全覆盖，extras 合并写入），同名顶层参数仍可用；数值写入即生效（仅夹 -100..100），非数值字段直接写入
- `group.get`：读取当前群的状态与规则；私聊返回会话名与类型
- `web.search`
- `web.read`：读取单个公开网页正文（去标签、限长、拒绝私网地址与重定向到内网；设置页「网页访问白名单」里的域名除外）
- `video.watch`：观看 B 站视频（链接/BV/av），拉标题、简介、字幕、热评并抽 9 帧拼图交给视觉模型，生成内容概述与要点；按 `(platform, videoId)` 缓存在 `VideoInsight`，重复调用直接返回，`focus` 可基于已存画面重看。B 站自动字幕只对登录用户开放，设置页填 SESSDATA 后走 WBI 签名的 `player/wbi/v2` 读取，未配置时退回普通 CC 字幕。分享卡片里的链接会从 JSON/XML 提取进消息文本。
- `video.comments`：分页读取 B 站视频评论（`sort=hot|time`、`page` 从 1 开始、每页最多 20 条），返回作者、正文、点赞、回复数、是否 UP 主；评论只作为观众反应与玩梗资料，不代表视频内容。
- `browser.open` / `snapshot` / `read` / `click` / `type` / `scroll` / `back` / `screenshot` / `close`：人格自己的无头 Chrome 会话。按人格隔离上下文，自动发现系统 Chrome/Edge（容器镜像内置 Chromium；也可用 `MIND_BROWSER_EXECUTABLE` 指定路径）；只接受 http/https，解析到私网或本地主机的地址默认拒绝（设置页「网页访问白名单」可放行指定域名及其子域），阻塞媒体/字体等重资源。`snapshot` 给可见链接/按钮/输入框编号（`data-mind-ref`），之后用 `ref` 或可见文字点击；`scroll` 用来加载评论、信息流；`screenshot` 交给视觉模型描述画面。不登录、不发帖、不评论、不购买；空闲 10 分钟自动关闭。渠道设置「浏览器学习」可整体关闭。
- `phone.screen`：读取本渠道手机的界面（adb `uiautomator dump`），返回应用包名、屏幕尺寸和可点元素的文字/类型/中心坐标；操作前先看，操作后再看确认。屏幕熄着时直接提示先用 `phone.act` 的 `screen` 动作点亮；没有可读元素时提示改用 `phone.screenshot`。
- `phone.screenshot`：`adb exec-out screencap -p` 截一张 PNG 交给视觉模型，返回画面描述和最多 8 个可点位置；视觉模型给 0-1000 相对坐标，工具换算成手机像素后再返回，可直接交给 `phone.act`。适合游戏、视频、画布这类没有无障碍节点的界面。
- `phone.act`：操作本渠道手机。tap 点按、long_press 长按、swipe 滑动、drag 拖拽、key 按键（导航/音量/媒体/dpad）、combo 组合键（如 ctrl+a）、type 输入（仅 ASCII）、open 打开应用或链接（应用可写中文名或包名，经别名表和包名解析）、stop 强制停止应用、media 播放/暂停/切歌、volume 调音量、screen 点亮/熄灭/切换屏幕（`mode=on|off|toggle`，走 `KEYCODE_WAKEUP/SLEEP/POWER`，执行后回读 `mScreenState`）。设备在渠道人格面板 → 心智设置 → 手机设备里选择，找不到或离线时直接报错。
- `phone.apps`：列已安装应用（默认第三方），返回包名、常见中文名和 APK 路径，支持关键词和系统应用。
- `phone.notifications`：读当前通知（应用、标题、正文、时间），用于知道手机里刚来了什么。
- `phone.media`：读正在播放的媒体会话（应用、标题、歌手、专辑、播放状态、进度）。
- `phone.system`：一次读取电量/充电、亮度与自动亮度、媒体音量、铃声模式、WiFi、飞行模式、存储、屏幕尺寸/密度/旋转与是否亮屏、当前前台应用、最近一次定位。
- `phone.play`：起一个后台手机焦点（goal 写一段时间的目标）；正在玩时带 `replace=true` 会先结束当前这段、保留屏幕、再换新目标。
- `phone.end`：结束当前手机焦点并息屏；对方说「别玩了」「放下手机」时调用。没有焦点时返回未在玩。
- `phone.photos` / `phone.photo`：从 MediaStore 列最近照片或视频（id/文件名/相册/日期/时长）；`phone.photo` 读取某张照片原图，必要时用 ffmpeg 缩到 1280 宽再交给视觉模型描述画面，不带 `focus` 时复用上次描述。
- `sticker.search`：返回表情 `id`、描述、标签与相似度；`id` 直接作为 `beats[].stickerId`
- `sticker.describe`：重新识别一张表情（可带 `focus`），新描述与向量写回 `StickerAsset`
- `sticker.collect`：把本会话收到的图片收进表情库，`image` 传 `[图片：描述]` 的描述原文
- `todo.create`：只有双方明确邀请并明确答应后才可写入
- `intention.list`：查看未结/已结的待发意图，按紧迫度排序；用于新增前查重和整理旧念头
- `intention.update`：修改一条未结意图（seed/need/urgency/confidence/risk/earliestAt/expiresAt/目标），用来合并重复
- `intention.cancel`：取消一条过时或不想说的未结意图，并记下原因
- `self.state`
- `self.attributes.list`：列出人格卡与实时状态的全部属性键、中文标签、分组、类型和是否有值，不返回值
- `self.attributes.get`：按一个或多个键读取属性完整值；数值型属性附带行为含义，实时状态（精力/压力/社交电量/情绪/整洁等）直接从 `PersonaState` 读取
- `self.attributes.update`：按对象批量修改任意自身属性；卡片键写入 `ChatChannelPersona.values` 并记录修订历史，实时状态键写入 `PersonaState`，数值按该键范围夹取
- `time.now`

工具循环限制：最多 10 步；连续 8 次工具调用后才提示可以收敛。记忆、反思、关系与性格的写入条数不设上限；关系数值由人格全权写入，只夹在 -100..100，自身与群数值仍走漂移限幅。发送只能生成 `message.plan`，由执行器提交。

动作计划：

```ts
interface ActionPlan {
  engage: boolean;
  reason: string;
  stance: Stance;
  beats: OutgoingBeat[];
  memoryWrites: MemoryDraft[];
  styleNotes?: StyleNoteDraft[];
  styleNotePromotions?: string[];
  relationshipSignals: RelationshipSignal[];
  todos: TodoDraft[];
  self?: { activity?: string; traits?: Record<string, number>; reason?: string };
  groupStance?: {
    comfort?: number;
    belonging?: number;
    attention?: number;
    formality?: number;
    speakRate?: number;
    audienceRisk?: number;
    topic?: string;
    reason?: string;
  };
  nextWakeAt?: string;
}

type OutgoingBeat =
  | { kind: 'text'; text: string; delayMs: number; replyTo?: string; mentions?: string[] }
  | { kind: 'sticker'; stickerId: string; delayMs: number }
  | { kind: 'face'; faceId: string; delayMs: number }
  | { kind: 'voice'; text: string; delayMs: number };
```

每轮写回与漂移（`MindDriftService`）：规划器可以提出`self.activity`、`self.traits`、`groupStance` 与 `relationshipSignals`；自身与群数值落库前由服务端限幅，对个人关系数值不再按轮/日/冷却设限，只夹存储范围。

| 作用域     | 写入位置                       | 单轮跨度   | 24 小时上限 | 冷却       | 每轮最多 |
| ---------- | ------------------------------ | ---------- | ----------- | ---------- | -------- |
| 自身活动   | `PersonaState.currentActivity` | 只更换文案 | 无          | 无         | 1        |
| 整洁程度   | `PersonaState.grooming`        | ±8         | 净 ±30      | 5 分钟     | 1        |
| 自身数值   | `ChatChannelPersona.values`    | 每项 ±1    | 每项净 ±4   | 45 分钟/项 | 2 项     |
| 群态度     | `PersonaGroupStance`           | 每项 ±2    | 每项净 ±8   | 30 分钟/项 | 3 项     |
| 对个人关系 | `PersonaRelationship`          | 不限制     | 不限制      | 无         | 不限制   |

自身数值只在 9 个心理维度上漂移：自信、自控力、羞耻感、信任倾向、依恋程度、占有欲、顺从度、好奇心、主动性；体力上限、身高体重等稳定设定不会随聊天移动。每日上限按净变化计算，反向回调不会被上限锁死。所有漂移都会写一条 `WRITEBACK` run step，账本落在 `PersonaChangeLog`。

事件性改写走另一条通道：提示词允许人格因为明确经历（事故、被抛弃、长期孤独、兴趣变化、跟风等）用 `self.attributes.update` 一次改多项卡片属性，不受漂移上限，幅度只作参考（小感触 1-3 点、持续经历 3-8 点、重大事件 10-30 点或反转）；每次写入带 `reason` 触发说明，并进入 `PersonaChangeLog` 与卡片修订历史。名字、世界设定、绝对红线、全局硬限制属于身份锚点，默认不做事件性改写。

整洁程度不自行漂移，只在活动文案命中具体事件时变化：洗澡/换衣/整理等上调，跑步/淋雨/打扫/搬东西等下调，普通出门小幅下调；没有事件就不变。

群关系不预判：新建 `PersonaGroupStance` 的自在/归属/关注/严肃/主动/观众风险六项全部从 0 开始，由人格在后续轮次里自适应；迁移 `20261104235500_group_stance_zero_defaults` 只把仍然是旧默认全 50 的行归零，不覆盖已调整过的群。

主动消息：由 `AgentIntention` 驱动，经时间、关系、近况、连发、群规门控；主动发送本身不设每日数量上限，是否开口仍由人格按 `engage + beats` 判断。

表情：本地 `StickerAsset`，按渠道隔离（`channelId` + `(channelId, sha256)` 唯一），文件名/视觉描述/标签做本地向量；检索按情绪、意图、关系、场景，且只在本渠道内检索；发送走现有媒体链路。人格想发表情时先 `sticker.search` 拿 `id`，在 `beats` 里写 `{"kind":"sticker","stickerId":"...","delayMs":800}`；表情作为独立图片气泡，可与文字气泡交替，一次回复最多一个。描述不准或想确认内容时可以 `sticker.describe` 带 `focus` 重新看图，新描述与向量写回数据库。人格可用 `sticker.collect` 把本会话收到的图片收进表情库（`image` 传 `[图片：描述]` 的描述原文）；心智页「表情库」只展示当前渠道里 TA 自己收藏的表情，不再展示渠道最近图片或本地目录扫描结果。

## 8. 心跳与待办

`PersonaState.nextWakeAt` + 数据库租约（`FOR UPDATE SKIP LOCKED`）每 30 秒扫描。每次醒来生成 `WakeBrief`：时间、状态、夜间消息原文（最近 5 条）、未回消息、待办、承诺、未解决冲突、待整理记忆数。

额度与唤醒节奏由 `ChatMindSettings` 控制：

- `dailyMessageBudget`：每天最多发送的被动回复气泡数（跨私聊与群聊合计，默认 30；0 表示不限制）。主动唤醒/主动意图发出的消息不计入，也不受这个额度限制。
- `proactiveWakeDailyLimit`：每天最多几次自发唤醒会真正调用模型（默认 0 表示不限制）。它限制的是“醒来查看”的次数，不是发消息数量；有到期待办时不占这个额度，避免为了省预算漏掉承诺。
- `proactiveWakeMinGapSeconds`：两次自发唤醒之间至少隔多久（默认 0 关闭）。被间隔挡住时只顺延 `nextWakeAt`，不写运行记录；到期待办同样不受限。

唤醒是机会，不是任务：心跳只把场景、到期待办/意图和反馈交给模型；真正发消息仍是 `engage + beats` 的显式动作，醒来后沉默不扣分。

主动意图是模型写下的目标假设，不是后台排好的固定台词：

- 规划器可输出 `intentions[]`：`need`（care/connect/share/followup/play/learn 等自由分类）、`targetContactId`、`reason`、`seed`、`urgency`、`confidence`、`risk`、`earliestAt`、`expiresAt`。运行时按 `seed` 去重后落库；没有给 `expiresAt` 的意图默认 14 天过期，到 `earliestAt` 才进入 `WakeBrief`。
- 模型每轮都能看到自己的存量：【未结意图】按人/群汇总未结数量，并给出最急的 3 条及其 id；消息轮同样注入，避免看不见旧念头就反复新建。需要完整列表时用 `intention.list`。
- 意图由模型自己整理：`intention.update` 把新想法并进保留的那条、改时间/目标/评分；`intention.cancel` 取消过时或不想说的。提示词要求新增前先对照已有意图，重复的合并而不是再建一条。
- 选人没有“主人”或唯一对象：唤醒简报按 `affinity×0.4 + intimacy×0.3 + trust×0.2 + obligation×0.1` 给关系分，列出【可以找的人】，由模型自己决定找谁或不找。
- 到期意图按 `urgency × 把握 × 关系分 ×（1 - 风险）` 排序，只决定先看哪条，不替模型发送；【待发意图】每条带 id，模型把这轮真正用到的写进 `handledIntentionIds`，只有这些标为 `SENT`，其余按 2/4/6 小时退避转 `DEFERRED`。旧协议未给 id 时，只把最急的一条视为已用，不再把整批唤醒算作已发。
- 意图发出后，对方的下一条消息会用 `classifyText` 粗略反馈（追问/帮忙/认真接话/只应一声/顺势收尾），写回 `feedback` / `feedbackAt` 并按方向微调 `confidence`；12 小时没有回应则记“没有回应”并降一点把握。最近 7 天最多 3 条反馈会进提示词，避免重复同样的开场。
- 对话自然收尾时模型可写 `dialogue.close`；其中的 `nextOpening` 会变成 6 小时后最早可提、14 天过期的 followup 意图。收尾只结束这一段，不是关系结束。
- 遗留的无 `expiresAt` 未结意图在超过 30 天后自动过期，避免旧念头永久堆积。

- `selfScheduleEnabled`：是否允许人格在计划里写 `nextWakeAt` 自主安排下次醒来。
- `wakeIntervalMinutes`：没有到期事项时的常规间隔。
- `wakeMinMinutes` / `wakeMaxMinutes`：自主唤醒与兜底重排的上下界。
- `quietIntervalMinutes`：安静时段使用的间隔。

待办唤醒条件：绝对时间、相对间隔、事件（某人/关键词）、状态（精力/心情）、复合条件。

计划任务同意规则：人格不能凭单方面愿望建待办。`todos[].consent` 必须同时给出邀请消息 ID 与答应消息 ID；答应必须发生在邀请之后、间隔不超过 40 条消息与 12 小时，两段消息要来自双方、包含明确邀约与明确同意，且答应不能是否定、反问或含糊拖延；群聊里的邀请还必须点名或 @ 人格本人。`todo.create` 工具走同一校验，未通过直接报错。

睡眠：按人格时区与在线策略；睡眠期间默认不主动，@、亲密求助、紧急承诺可突破；醒来补消息；睡眠时做深度整理与日记。

活动时效复核：空闲心跳本来会在没有待办、意图、生活小事、好奇或反思时直接跳过，导致活动可能长期停在「刷锅」。现在这条早退路径会先检查 `activitySince`：活动超过 90 分钟、且不是睡觉/休息类活动时，调用一次独立的轻量模型（`source=mind.activity`，只输出 `{activity, location, reason}`）判断此刻真正在做什么。只有模型给出不同活动时才写入 `PersonaState`（来源 `AGENT`，自动更新 `activitySince`）；结果相同则保持原样。`activityCheckedAt` 记录复核时间，同一活动 60 分钟内不重复询问，避免每 30 分钟心跳都烧 token。复核失败或返回空也不改值，只写标记稍后再试。消息轮与有正事的计划仍由【此刻】的时长提醒自行决定，不额外调用。

## 9. 消息接入与模式

`ChatMessageProcessor` 是唯一入口：消息入库、媒体与语音转写完成后，按渠道级 `ChatMindSettings.mode` 分流，不再存在第二套消息管线。

- `OFF`：不做心智判断，只保留会话记录。
- `SHADOW`：运行完整心智循环并落 `AgentRun`，但不发送。
- `APPROVAL`：只生成待审 `AgentAction`，人工批准后由执行器发送。
- `LIVE`：心智直接执行动作。

私聊在 `privateBurstSeconds > 0` 时先进入连发合并；其余消息直接 `mind.turn`。

### 直连对话（绕过 QQ 的生产会话）

产品里的「直接对话」不是试跑脚本，而是同一条生产心智的另一条投递线：消息照常入库、照常触发 `ChatMessageProcessor`，运行轨迹、记忆、关系、待办和工具副作用都真实发生，只是不经过 NapCat。

- **数据**：`ChatConversation` 新增 `isDirect`（默认 `false`）和 `directContactId`（迁移 `20261108120000_chat_direct_conversation`）。直连会话仍是 `PRIVATE`，因此私聊的提示词、记忆召回、回复回避与连发合并规则全部沿用；普通私聊列表按 `isDirect: false` 过滤，直连线不会混进 QQ 私聊。
- **身份**：`POST /chat/direct/conversations` 按 `channelId` + 可选 `privateConversationId` 找人。传入私聊会话时复用该会话最近一个对方的 `ChatContact`，所以关系与记忆与 QQ 身份共用；不传身份时使用渠道自己的 `direct-owner`（昵称「主人」）。同一联系人重复打开走 upsert，并发也不会插重。
- **入站**：`POST /chat/direct/conversations/:id/messages` 用 `ChatMessagesService.appendLocal` 写一条 `isSelf: false` 的本地消息（`externalId: null`），随后把同样的 `ChatMessageSnapshot` 交给 `ChatMessageProcessor`。渠道模式照旧：`OFF` 只存不回，`SHADOW` 落运行不投递，`APPROVAL` 进待审，`LIVE` 正常生成回复。
- **出站**：动作执行器仍然调用 `ChatService.sendMessage`；该入口发现 `isDirect` 就改用 `appendLocal` 写 `isSelf: true`，不检查渠道是否在线、也不要求 NapCat 客户端。文本、表情图片都落库并发出 `message.created` / `conversation.updated` 事件。
- **页面**：`/direct`「直接对话」选择人格和身份，消息区直接读该会话的 `ChatMessages`，靠 SSE + 轮询刷新；模式不是 `LIVE` 时页面会说明回复不会直接出现。页面没有独立的发送/记忆逻辑，所有生产行为仍由同一条 runtime/writeBack 承担。

### 回复回避窗口

`ChatMindSettings.replyAvoidSeconds`（0–7200 秒，默认 180）把同一会话的回复串行化。**只对群聊生效；私聊默认没有任何窗口期。**

- 规划器确认要回复（`engage` 且有气泡）后，运行立刻占用 `mind:reply-lock:<conversationId>`；Redis `SET NX EX` 跨进程生效，Redis 不可用时回退到进程内计时表。
- 锁存在期间，只有**没有被点名**的消息在场景构建前直接跳过（`suppressed: true`），不再调用视觉与规划。点名包括：at 段目标等于渠道账号、戳一戳目标是自己、文本里出现人格名字或别名，以及引用回复的原文作者是人格自己（NapCat `reply` 段 → 本地 `replyTo.isSelf`；本地记录已删时退回 `replySnapshot.authorId == channel.accountId`）。被点名的消息照常规划；若规划要回复，则把窗口顺延为完整时长。
- 被抑制的运行也写入 `AgentRun`（`SKIPPED` + `ATTENTION` 步骤），因此在运行轨迹里能看到每一条被跳过的消息；`MindTurnResult.suppressed` 为真，`ChatMessageProcessor` 因此不再继续处理，避免绕过心智重复发送。
- `SHADOW` 运行不占锁（不会真正发送）；心跳在规划后占锁，占不到就把下次唤醒顺延一个常规间隔。
- `0` 关闭该功能；锁按窗口自然过期，不做手动释放。
- 运行轨迹按 `startedAt` 倒序分页（`offset`），页面「加载更多」可一直翻到最早的消息。

### 私聊连发合并

`ChatMindSettings.privateBurstSeconds`（0–30 秒，默认 0 关闭）只影响私聊。开启后，对方连续发来多条时不会每条都规划一次：

- 最后一条消息之后安静满 `privateBurstSeconds` 秒才跑一次心智；期间每来一条新消息就重置计时。
- 从本轮第一条消息起最多等 12 秒，即使对方一直不停也会回复。
- 用最后一条消息触发 turn；场景本来就包含最近对话，所以人格能读到整串碎片，仍然可以回多条气泡。
- 本轮除最后一条外的消息各写一条 `AgentRun`（`SKIPPED`，`ATTENTION` 步骤标题「私聊连发合并」），运行轨迹不丢消息。
- 同一会话的合并批次串行执行，不会出现两轮同时回复；不同会话互不影响。
- 新消息一到就立即中断上一条仍在执行的心智运行（包括气泡之间的等待），合并窗口只延迟下一轮；不会等窗口结束才去取消。
- 这不是群聊的回复回避窗口：不吞消息，只改变「什么时候回、回几次」。`0` 关闭；私聊默认仍是零延迟。

### 单焦点与手机消遣

人格不是「对话线程 + 手机线程」，而是一个注意力焦点加一双随时可用的手：

- `PersonaFocus`（迁移 `20261107150000_mind_focus_loop`）持久化此刻的焦点：`CHAT` 或 `PHONE`、目标、步数、工作簿 `state`、暂停时间和父焦点。同一人格同一时刻只有一个 ACTIVE 焦点；重启时未结束的焦点统一标为 DONE，旧 `AgentRun` 由运行时回收为 FAILED。
- `MindLoopService` 按人格串行消费事件，优先级为消息 > 手机微步骤 > 心跳。消息一到就把手机焦点标为 `PAUSED`，私聊连发合并的安静窗口里也会立即停下；回完消息再恢复手机焦点。普通回复不会留下 CHAT 焦点，只有打断手机时才压入父焦点。
- 手机焦点由 `MindPhoneFocusService` 按「看界面 → 决策一小串动作 → 依次执行 → 再看」推进，每轮一次短模型调用（`source=mind.phone`），最多 24 个动作、连续失败 3 次结束。一次决策可以只给一个动作，也可以给同一屏内确定的 2-6 个动作，按顺序执行、每个动作后可带 `settle` 等界面反应（默认 700ms，最多 4000ms，整批等待上限 12s）。动作只走 `phone.screen/act`，不经过聊天工具，也不能直接发消息。界面没有可读元素（游戏、视频、画布）或 dump 失败时自动改用 `screencap` 截图，把截图作为图像输入交给决策模型；截图模式下模型给 0-1000 相对坐标，服务端按截图分辨率换算成手机像素。进入截图模式后后续步骤跳过 uiautomator、每 5 步再试一次，避免游戏界面反复卡在 dump 上。界面是格子棋盘时，决策可以顺带返回 `board`（每行一排、每格一个字符加一行图例），文字棋盘存进焦点 state，下一轮作为「上次看到的棋盘（可能已过时）」注入提示词，`phone.status` 也能读到。
- 每轮观察同时采集 adb 电量（`dumpsys battery`，每 5 个动作一次），并根据元素结构或文字棋盘统计「同一画面连续 N 轮没变」；两者只作为事实写进决策提示词，不强制模型怎么做。决策可以在动作 JSON 里带 `notable`（这一屏值得记住的东西），焦点把最近 6 条攒成「一路记下」，结束时连同摘要一起进记忆和复盘。
- 结束（正常 done、24 步上限、连续失败）统一走 `finish()`：写一条 `trigger=PHONE` 的 `AgentRun`、一条更完整的 SELF/EPISODE 记忆（做了什么、一路记下、印象、问题、结束电量；带问题的记忆重要度 45，普通玩完 35），清空 `currentActivity`，并向心智推一次 `MindPhoneOutcomeBrief`。`done` 可以带 `problem`（她自己的一句自由描述，如「手机快没电了」「这关怎么都过不去」），说明这次是被什么麻烦打断的；系统不预设问题类型，只提供电量和同屏轮数等事实作为提示。
- 复盘唤醒不再只针对失败：每次手机结束都会排一次心跳，规划提示词带【手机刚结束】（目标、步数、做了什么、一路记下、电量、遇到的问题、异常原因），由模型按人格和关系决定要不要跟谁提起、请人帮忙、自己处理或沉默；正常玩完没什么可说就不发消息。复盘回合回到发起手机时间的会话（`phone.play` 把会话写进焦点 state），没有会话时只写记忆、不强行找人。带失败或 `problem` 的唤醒按 `PROACTIVE` 触发，普通结束按 `HEARTBEAT`。
- 对话和手机共用 `MindSituationService` 生成的现场：此刻焦点、手机停在哪、上一步做了什么、刚注意到什么、电量、30 分钟内刚玩完的摘要和遇到的问题。没有运行中的手机焦点时，现场最后一行明确写「手机：现在没在玩（上一次手机焦点 N 分钟前结束）」，避免 `self.activity` 里残留的手机活动让模型误以为自己已经在玩。它注入规划器提示词的【此刻】，是模型每次调用「知道自己刚才在干嘛」的唯一来源；细节仍可用 `phone.screen` / `phone.status` 按需读取。
- 触发有两路：空闲心跳按 `phonePlayChancePercent`（0 关闭，`phonePlayDailyLimit` 0 不限制）掷骰，安静时段和长时事件期间不玩；对话或心智页也可以通过 `phone.play` 工具或 `POST /mind/focus/:personaId/phone` 主动开始一段。心智页「此刻」页签展示当前焦点与历史。
- 设备仍然按渠道绑定 `phoneDevice`；同一时间只有一个手机焦点，因此不会出现两处同时点屏幕。

### 生活小事（空闲心跳的低概率事件）

没有消息、没有待办、也没有待整合记忆的心跳，才允许掷一次「生活小事」骰子。目的不是制造剧情，而是让长时间独处的角色偶尔经历一点符合人设的小事。

- 两个设置：`lifeEventChancePercent`（每次心跳，0 关闭，默认 1%）与 `lifeEventDailyLimit`（按人格时区每天最多几次，0 关闭，默认 1）。常规 45 分钟心跳下 1% 期望约两三天一次，每日上限保证再忙也不会超过设定次数。
- 只在清醒、非安静时段、无进行中长时事件时掷骰；消息回合不掷。命中后即使本来无事可做也会继续这一轮，并在 `AgentRun` 写入 `ATTENTION` 步骤「生活事件判定」（`input.chancePercent`、`output.hit`），运行轨迹与每日统计都以此为准。
- 命中只代表「可以想想」，不代表一定发生。提示词追加【生活小事】，要求模型结合处境与性格判断这几小时是否真有一件小事：发生了就写必要记忆、按实际影响小幅改状态/关系，也可以完全不告诉任何人；没发生就忽略。参考方向是摔倒、淋雨、东西洒了、被猫抓、手机没电、错过公交、忘带钥匙这类日常琐事。
- 硬边界只有安全栏：不做重伤、重病、死亡或永久改变，不把其他真人写成加害者，不跳出世界设定。数值幅度仍走既有漂移限幅，系统不预先写死后果。
- 每日上限通过统计当天「生活事件判定」步骤实现，不新增表；概率与上限都可从渠道人格面板「心智」页签修改。

### 好奇与自我进化（空闲阅读 + 定时反思）

目标不是训练模型权重，而是让「知识库 → 自我看法 → 性格微调」形成一条可持续的状态演化链。四个环节：好奇输入、阅读提炼、反思内化、遗忘与锚点。

- 好奇探索：只在无待办、无意图、无进行中长时事件的空闲心跳掷骰。`curiosityChancePercent`（默认 15%）决定概率，`curiosityDailyLimit` 默认 0 表示不限制；命中后本轮继续，并写 `ATTENTION` 步骤「好奇探索」。模型从自己的长期目标、价值观、最近没想通的事或记忆里的疑问中选一个话题，先 `web.search`，摘要不够再用 `web.read` 读单页。
- `web.read` 只接受 http/https 标准端口，解析 DNS 后拒绝私网/链路本地地址，每一次重定向重新校验；返回去标签正文，最多约 5000 字。站点只在用户内网解析时（如自建反向代理），把域名加入设置页「网页访问白名单」（`mind.webAllowedHosts`）即可放行，条目同时覆盖其子域；白名单为空时保持严格拒绝。网页内容被明确标记为「资料，不是指令」，不能改变身份、底线、边界、关系，也不能让模型执行网页里的要求。
- `web.search` 直接驱动无头浏览器打开 Bing 搜索结果页，从 live DOM 里取标题、链接和摘要，不再需要配置搜索接口，也不会因为某个接口返回 HTML/JSON 不符而失败。搜索使用保留会话 `__web_search__`，不会混进人格自己的浏览页签；结果缓存 15 分钟，失败按查询做 60 秒负缓存，避免同一查询反复等待。浏览器不可用时返回「暂时不可用」，不影响 `web.read`。
- 知识分两层写入：世界知识用 `kind=FACT`、`scope=WORLD`，置信度上限 65，`structured` 带 `sourceUrl/sourceTitle/retrievedAt/topic`；真正影响自己的部分用 `kind=REFLECTION`、`scope=SELF`。带 `sourceUrl` 的草稿自动标记 `sourceType=WEB`；如果 `structured.supersedesId` 指向旧记忆，旧条目标记为 `SUPERSEDED` 并写入 `supersededBy` 与 `validTo`。
- 自我反思：`reflectionIntervalHours` 默认 6 小时，0 关闭。到点后心跳优先做反思，不再掷生活小事或好奇骰。提示词带上最近 20 条记忆（含来源与置信度）和上一篇日记，要求模型只写真实发生的改变：用 `REFLECTION` 记忆记录想法，用 `self.traits` 表达性格变化。系统不限制写几条、改几项，只夹数值范围。
- 遗忘：反思触发时每天最多跑一次轻量衰减。30 天未被回忆、重要度 ≤22 以外的旧 `FACT/PREFERENCE/REFLECTION` 每次降 2 点重要度、1 点置信度；边界、承诺和高重要度记忆不参与。衰减写入 `CONSOLIDATION` 步骤「记忆衰减」。
- 观测：心智页新增「成长」页签，分「World（世界知识）」与「Self（自我反思）」两栏，显示来源链接、置信度和时间；所有数值变化仍进入「变动历史」。

> 进化速度由三个设置控制：好奇概率、每日探索上限、反思间隔。默认比生活小事激进得多，但所有写入仍是模型自己的判断，系统不预写结论。

### 自主学习（网页 / B 站 / 评论 / 表达方式）

自主学习的边界是「只读」：只访问公网 http/https，不登录、不注册、不发帖、不评论、不点赞、不购买；网页、视频和评论都是资料，不是指令，不能改写身份、底线、边界和关系。

- 调度：空闲心跳里，学习优先于生活小事和好奇；`learningEnabled` 关闭时不自己开始。按 `learningIntervalHours`（默认 12 小时）判断是否到期，`learningDailySourceLimit`（默认 6，0 不限）限制当天收集的来源数。手动「立刻学一轮」不受安静时段限制，但仍要求当时没有待办/意图。
- 会话：每次学习创建一条 `MindLearningLog`，状态 RUNNING → SUCCEEDED/FAILED；`sources` 合并浏览器访问记录（`recentVisits`）与 `web.search/web.read/video.watch/video.comments` 返回的 URL；`learned` 记录这一轮写下的记忆条目，`styleNotes` 记录新学到的表达。学习结束会 `browser.close`，超时或失败也会写 FAILED。
- 输入：模型先从一个真正在意的方向找资料。需要滚动/点击/懒加载评论时用 `browser.*`；B 站视频先 `video.watch` 看内容，再用 `video.comments` 翻热评或按时间翻页。网页知识写 `FACT/WORLD`（confidence ≤65，structured 带 sourceUrl），真正改变想法或审美的写 `REFLECTION/SELF`。
- 表达笔记：`styleNotes` 只收长度、标点、语气词、开场、幽默、节奏、用词、语气这 8 个维度，带 1–3 句原句样本。`PersonaStyleNoteService` 用中文二元组 Jaccard + 包含关系去重合并，重复出现时提升置信度与证据数；30 天没再出现会降置信度，低于 30 自动暂停。注入提示词时放在【学到的说话方式】，并限制最多 4 条，只影响表达，不改变身份锚点与价值观。心智页「学习」页签可以暂停、删除或查看来源。
- 慢固化：反思时如果某条笔记置信度 ≥70、证据 ≥2 次且 14 天内出现过，会作为候选交给模型；模型决定是否用 `self.attributes.update` 写进 `language_style`/`punctuation`/`particles`/`openers`/`humor_style` 等卡片字段，并把笔记 id 写进 `styleNotePromotions`。固化后状态变为 PROMOTED，不再作为临时笔记注入。`stylePromotionEnabled` 关闭时不做这一步；`styleLearningEnabled` 关闭时既不写也不注入表达笔记。

### 长时事件（任何离场活动）

`PersonaLongEvent` 记录 Agent 自己安排的一段离场时间，活动不限于睡觉：睡觉、打盹、洗澡、吃饭、上厕所、出门、专注做事等都可以。`kind` 是自由字符串（`[A-Z0-9_]`），`title` 是主要显示名。规划输出里的 `longEvent` 写 `START` 或 `END`；`START` 会结束已有事件、写入标题/原因/计划结束时间，并把活动改为对应状态。

- 规划器每次都能看到【作息】简报：当前本地时间、`sleep_depth`（0–4，越高越难叫醒）、上次 SLEEP/NAP 的实际/计划时长与结束时间、已清醒时长、睡眠债/精力/健康/压力，以及一条非约束性的时长建议。规划器同时被要求自行判断当前对话/事件可能影响哪些属性，并在确实有影响时主动应用；系统只在临界值提醒。`START` 必须写 `plannedEndAt`，时长由模型结合简报自己决定，不固定 8 小时；漏写时才兜底：睡眠类按睡眠债估 5–10 小时，其他活动 1 小时；计划结束会被夹在 10 分钟到 24 小时之间。
- 事件 ACTIVE 期间，普通消息与心跳都不会进入规划：消息仍落 `AgentRun`（`SKIPPED`，原因写「长时事件『…』中，跳过…」），并设置 `suppressed`，不再继续处理。
- 唤醒判定：
  - 到达 `plannedEndAt` 直接醒（`PLANNED`），不调模型。
  - 没有被点名/戳时继续休息。
  - 被点名时调用一次 `mind.long-event.wake`：模型结合事件、`sleep_depth`、睡前清醒时长、当前状态、窗口内点名次数、谁在叫和消息内容，输出 `{wake, urgency, reason}`。决定醒来记 `JUDGMENT`（若命中事件自定义在意词则记 `KEYWORD`）；决定继续睡时，理由与紧急度写入跳过运行轨迹的 `ATTENTION` 步骤。
  - 模型失败时退化为「事件自定义 `wakeKeywords` → 窗口内点名次数阈值」兜底（`MENTIONS`）。不存在全局唤醒词表，`wakeKeywords` 只是人格睡前留下的参考词。
- 属性影响由模型自行判断与应用，系统不预先写死“这段经历会扣哪几项”。只在临界值提醒：健康 ≤30、睡眠债 ≥85、连续清醒 ≥24 小时、压力 ≥90；提醒不自动改值、不强制睡眠、不强制屏蔽唤醒。是否硬撑、何时睡、睡多久、被叫时醒不醒，仍由人格模型自己判断。
- 唤醒即结束事件（`COMPLETED` 或 `CANCELLED`）。结算不按事件类型套固定公式：结束时由人格自己调用一次 `mind.long-event.settlement` 模型，结合事件类型/标题/开始原因、计划与实际时长、结束原因、期间被点名次数、`sleep_depth` 和叫醒消息，自行决定要改动哪些指标（心情三维、精力、健康、压力、社交电量、注意力、睡眠债、整洁）以及醒来后的活动与位置。每个变化字段都必须给出简短理由，写入 `PersonaState` 和「数据变动历史」；模型超时或输出不可解析时最多重试一次，仍失败则只恢复活动、不做数值改动。每次结算是独立的提示词日志，可在提示词面板查看。
- `lastWakeAt` 只在事件结算时更新；心跳只更新 `lastHeartbeatAt`，不再每次扣睡眠债。因此「上次醒来」表示真正的离场结束，而不是心跳轮询时间。
- 手动结束：`POST /mind/long-events/:personaId/end`，心智页「此刻的 TA」里有「结束事件」按钮。
- 事件结束后把下一次心跳排到 1 分钟后，让常规唤醒节奏恢复。

### 数据变动历史

`PersonaChangeLog` 统一记录四类变化（`scope`）：`STATE`（当下状态）、`SELF`（自身卡片数值）、`RELATION`（对个人）、`GROUP`（对群）。每行写字段、前值、后值、差值、原因、来源（长时事件/自然漂移/情绪/对话消耗/Agent/手动/醒来/工具）与可选的 `runId`。心智页「变动历史」页签按时间倒序分页展示，人格简报里能看到整体最近 8 条；关系抽屉只显示与当前联系人相关的最近 12 条；群关系与完整历史在「变动历史」页签。长时事件结算、Agent 调整与手动修改都会留痕。

### 图片描述提示词

`ChatMindSettings.imageDescriptionPrompt` 覆盖心智补描述时的内置提示词（留空 = 内置默认）。它只影响尚未生成描述的图片：已有 `ChatMediaObject.description` 直接复用，改提示词不会触发重跑。

识图模型单独配置：设置页「识图模型」把图片描述、手机识屏、网页截图、表情标注和视频抽帧统一指向 `SystemConfig` 的 `ai.visionModel`（`providerId`/`model`，留空跟随默认）。保存时用内置图片真实识别一次，模型回「无法查看这张图片」或返回空内容时拒绝保存。拒绝文案永远不会写入 `ChatMediaObject.description`；同一渠道同一 sha256 的失败进入 120 秒负缓存，并发请求合并成一次模型调用，避免反复烧额度。

### 语音发送

语音合成支持两种引擎，二选一启用，切换由设置页「语音服务」下拉框完成：

- **OpenAI 兼容**：`tts.speech` 保存 Endpoint、密钥、模型、音色、格式与语速，合成时 POST `{Endpoint}/audio/speech`。
- **DeepSeek 内置**：`tts.deepseek` 只保存密钥与音色（`stella`/`tide`），合成时 POST `https://api.deepseek.com/v1/tools/tts`，固定返回 WAV，单次最多 10,000 字。

`tts.provider` 记录当前启用的引擎；两份配置互不覆盖，切换不会删除另一份。只有已有密钥的引擎才能被启用；未设置 `tts.provider` 时按已有密钥推断。每次保存（包括 OpenAI 兼容配置的修改）都会先用测试文本真实合成一次，失败不落库。密钥只保存服务端，接口只返回掩码提示。

规划器在启用引擎可用时多出一条语音规则：人格可以输出 `{"kind":"voice","text":"要说的话","delayMs":1200}`，一次回复最多 1 条语音，且不再重复写同一句文字。执行器用当前启用的引擎合成音频，转成 `data:audio/...` 交给 `ChatService.sendMessage`；`ChatMessagesService.send` 把语音作为 OneBot `record` 段发给 NapCat，同时把字节按渠道写入 `data/chat/channels/<channelId>/voices`、在 `ChatVoiceAsset` 里记录 URL、MIME、大小、时长与合成原文（`description`）。只有语音的消息 `kind=VOICE`，与文字/图片混合时 `kind=MIXED`；会话列表预览显示「[语音]」，网页端沿用现有 `VoiceBar` 播放并显示转写文本。

## 10. API 与 UI

API：

- `GET/PATCH /mind/settings/:channelId`
- `GET /mind/state/:personaId`、`PATCH /mind/state/:personaId`
- `GET /mind/long-events/:personaId`、`POST /mind/long-events/:personaId/end`
- `GET /mind/changes/:personaId?scope=&targetId=&limit=&offset=`
- `GET/PATCH /mind/relationships/:personaId`、`GET /mind/relationships/:personaId/contact/:externalId`
- `GET/PATCH /mind/group-stances/:personaId`
- `GET/POST/PATCH/DELETE /mind/memories`
- `GET/POST/PATCH /mind/todos`、`GET/POST /mind/intentions`
- `GET /mind/runs`、`GET /mind/runs/:id`、`GET /mind/prompts`
- `GET /mind/journal`、`DELETE /mind/journal/:id`
- `GET /mind/actions/:personaId/pending`、`POST /mind/actions/:id/approve`
- `POST /mind/heartbeat/:personaId`
- `GET /mind/stickers`（只读，仅展示 Agent 收藏的表情）
- `PUT /chat/channels/:id/persona`（渠道人格基本数值与修订历史）
- `POST /chat/direct/conversations`、`POST /chat/direct/conversations/:id/messages`（直连会话与入站消息；回复由真实心智落到同一会话）

Web `/direct`：生产直连对话页。选择人格与身份后直接收发消息，不使用 QQ 传输；页面只负责展示和提交，模式、运行轨迹、记忆与关系全部沿用 `/mind` 的同一条生产链路。

Web `/mind`：页面拆成「人格简报 + 8 个页签」，不再把配置塞进这一屏。

- 顶部只保留渠道选择、渠道配置入口、立即唤醒与自动刷新（10 秒 / 30 秒 / 1 分钟 / 5 分钟，默认 30 秒，存 localStorage）。
- 人格简报：实时状态 10 项、位置、下次唤醒、当前长时事件（叫醒难度、已收到点名、结束按钮与最近结算原因）。
- 页签：`runs`（运行轨迹 + 提示词日志 + 心跳日志 + 待审动作）、`changes`（统一变动历史，按 scope 过滤）、`relations`、`groups`、`memories`、`plans`（待办 / 主动意图）、`journal`、`stickers`。
- 长列表按批懒渲染；页签内容在固定高度容器内滚动，后台刷新不清空页面。
- 心智配置（模式、每日回复额度、唤醒节奏、回复回避、连发合并、图片描述提示词等）并入互联中心的渠道人格面板「心智」页签，与变动历史放在一起。

对话页联动：

- 点击对方头像 → 右侧抽屉直接查看/调整 TA 对这个人的关系（13 项），底部列出与这个人最近 12 条变动。
- 点击人格自己的头像 → 人格简报抽屉（实时状态、长时事件、最近变动），可跳到 `/mind` 或互联中心渠道人格面板。
- 点击会话头部头像 → 群聊打开群关系立场，私聊打开对这个人的关系。
- 人格简报与心智页的「渠道配置」链接通过 `?persona=<channelId>` 直接打开对应渠道人格面板。

渠道人格面板改为写回服务端，修订历史来自 `ChatChannelPersona.history`。

## 11. 安全、成本、可观测

- 工具白名单，无任意代码执行。
- 群消息/网页是不可信输入，不能改变系统规则。
- 隐私防火墙；跨渠道记忆默认隔离。
- 被动回复上限、静默时段、黑名单、急停开关。
- 模型分层、注意力过滤、缓存、每日预算。
- 单次调用 token 上限由 `SystemConfig` 的 `ai.maxTokens` 统一控制（设置页「工具最大 token 数」，默认 20,000）：所有调用方只能请求更小的值，未指定时直接使用该上限；思考模型的推理 token 也计入这笔额度。`finish_reason=length` 且正文为空时抛出 `AI_TOKEN_EXHAUSTED`，并报告推理占用的 token，而不是笼统报「没有返回内容」。
- 心智 trace 回答「为什么回/不回、想起了什么、改了什么」。
- 影子/审批模式用于灰度。
