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

| 模型                  | 作用          | 关键字段                                                                                                                                                                                                                                                               |
| --------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PersonaState`        | 当下自我      | moodValence/Arousal/Dominance、energy、stress、socialBattery、attention、currentActivity、location、sleepDebt、grooming、lastWakeAt、nextWakeAt、leaseUntil、leaseOwner、wakeReason；心跳调度已并入本表                                                                |
| `PersonaRelationship` | 对个人的关系  | affinity、trust、intimacy、attraction、hostility、fear、respect、obligation、dependency、possessiveness、friction、unresolvedConflict、familiarity、relationTags、addressHere、openPromises、sharedEvents、boundaries、extras（仅存此刻值，增量在 `PersonaChangeLog`） |
| `PersonaGroupStance`  | 对群的态度    | comfort、belonging、attention、formality、speakRate、audienceRisk、role、tabooTopics、boundaries、extras                                                                                                                                                               |
| `PersonaChangeLog`    | 统一变动账本  | personaId、scope（STATE/SELF/RELATION/GROUP）、targetId、field、beforeValue、afterValue、delta、reason、source、runId；状态/自身/关系/群四类历史与漂移配额共用这一张表                                                                                                 |
| `PersonaMemory`       | 统一记忆      | scope、kind、subject、content、structured、importance、confidence、emotion、visibility、status、occurredAt、sourceIds、embedding                                                                                                                                       |
| `AgentTodo`           | 待办/唤醒     | title、detail、priority、dueAt、wakeCondition、recurrence、status、source                                                                                                                                                                                              |
| `AgentIntention`      | 主动意图      | targetType、targetId、reason、seed、urgency、earliestAt、expiresAt、status、attempts                                                                                                                                                                                   |
| `AgentRun`            | 一次心智运行  | trigger、persona、scene、model、tokens、cost、decision、plan、status、latency                                                                                                                                                                                          |
| `AgentStep`           | 思维/工具步骤 | runId、type、input、output、durationMs、error                                                                                                                                                                                                                          |
| `AgentAction`         | 动作日志      | runId、kind、payload、status、idempotencyKey、sentMessageId、error                                                                                                                                                                                                     |
| `StickerAsset`        | 本地表情      | mediaId、sha256、filePath、tags、description、embedding、usageCount                                                                                                                                                                                                    |
| `PersonaJournal`      | 日记/反思     | personaInstanceId、date、content、mood、consolidatedMemoryIds                                                                                                                                                                                                          |
| `LlmPromptLog`        | 原始提示词    | source、provider、model、system、prompt、response、tokens、latency、error；仅保留最近 200 条                                                                                                                                                                           |

单一真源（2026-11-04 收敛完成）：

- 自我属性只存在于 `ChatChannelPersona.values`（基本数值，附带 `history` 修订日志）与 `PersonaState`（当下数值，一行一人格）。渠道人格面板直接写回服务端，不再使用 localStorage 覆盖；面板里由 `PersonaState` 掌管的字段（正在做的事、位置、情绪三维、精力、压力、社交电量、注意力、睡眠债、整洁程度）以实时投影展示，编辑直接写回 `PersonaState`，不写入卡片副本。
- 对每个人只存一份 `PersonaRelationship`，对每个群只存一份 `PersonaGroupStance`；`ChatPrivatePersona` / `ChatGroupPersona` 已迁移并删除，对话页的人格面板也改为读取这两张表。
- `PersonaState` 是唯一的动态参数；渠道列表通过读时投影展示「此刻」状态，渠道面板与心智页都会展示全部 10 个当前数值，不落第二份。
- `PersonaChangeLog` 同时承担两件事：变动历史（scope/targetId/field/before/after/reason/source）与漂移配额账本（`delta != null` 的行按 source 统计 24 小时净变化）。它不保存任何当前值。
- 情绪是全局底色：规划器与社交判断都会先写入「全局外显」，只有对某人好感 > 65 时才允许明显例外。

存储：

- Postgres：状态、关系、记忆元数据、待办、trace。
- 向量：首版使用本地哈希向量 + 应用内余弦相似度，避免依赖 pgvector 扩展；后续可替换为 pgvector。
- 磁盘：表情原文件，复用内容寻址思路。
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

情景记忆节流：普通对话不写入 `EPISODE`；显著性 ≥ 75、关系数值单轮变化 ≥ 4 或强情绪（≥ 80）事件才写，同一会话普通情景至少间隔 3 小时，显著事件至少间隔 20 分钟。已有显式 `memoryWrites` 时不再重复写情景。场景不是聊天日志；长期事实、偏好、承诺、边界、重要经历以规划器的显式写入为主，提示词鼓励对可长期复用的新信息主动写最多 5 条。情景按会话类型归到联系人（私聊）或群（群聊）名下。

读取路径：

```text
场景查询 → 向量召回 → 可见性/有效期过滤 → 重排（语义/近因/重要性/关系/情绪）→ MMR → token 预算
```

遗忘：

```text
strength = importance × exp(-Δdays / halfLife) + recallBoost
```

核心记忆不衰减；默认不物理删除，支持用户置顶/编辑/删除。

整理：

```text
未整理情景 → 按人物/话题聚类 → 摘要 → 提炼事实/承诺/边界 → 更新关系 → 写日记 → 标记已整理
```

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

### 6.1 对话提示词预算

每轮规划提示词只装「现在做判断需要的东西」，按固定顺序拼接：

```text
我（名字/身份/年龄/性别）
性格（从 9 个心理数值里挑最极端的 5 项，每项带行为含义）
表达（最多一句话说话风格 + 禁用语）
此刻（心情/精力/压力/社交电量/注意力，均带低高区间行为提示）+ 正在做的事
对话对象（与其最显著的 4 个关系维度，带行为含义）
在场（其余成员只给 3 个关系数字）
这个群（最显著的 3 个群态度，带行为含义 + 群规 + 话题）
我的判断（社交计算摘要）
最近经历（6 条记忆）
最近对话（12 条，单条截断）
可用工具（工具名 + 一句话用途 + 参数名，不展开 JSON schema）
```

不进入对话提示词的设定：背景故事、世界观、外貌、长期/当前目标、价值观清单、风格样本、常用开场、角色叙事。它们只在需要时作为人格编辑参考，不能变成对话内容；对话内容只能由最近对话、最近记忆和当前处境推算。提示词里的每个数值都必须带一句「这个数值会让 TA 怎么做」，避免模型把数字当装饰。心跳提示词额外带 `WakeBrief`，其余部分一致。

## 7. Agent 工具与动作

工具是人格的能力边界。提示词只暴露一个入口 `tools.search`，不会把所有工具一次性倒给模型；模型需要查历史、记忆、关系、群、表情、网页、时间或自身属性时，先搜索关键词，拿到工具名、说明和参数后再调用。可发现的工具包括：

- `history.search`：搜索本会话聊天记录，返回消息 `id`（`todo.create` 的邀请/答应 ID 来源）
- `memory.search` / `memory.create`
- `relationship.get`：返回 13 项数值和标签/称呼/边界/承诺/共同经历/公开范围/公开面具/拉黑/静默等全部字段，并附带数值的行为含义；另返回 `attributes` 清单（37 项，含 key、中文标签、分组、类型、当前值，空值也列出）
- `relationship.update`：按需调整全部关系字段；`attributes` 可直接写回 `relationship.get` 返回的任意属性键（37 项全覆盖，extras 合并写入），同名顶层参数仍可用；数值走单轮跨度/每日上限/冷却，非数值字段直接写入
- `group.get`：读取当前群的状态与规则；私聊返回会话名与类型
- `web.search`
- `sticker.search`：返回表情 `id`、描述、标签与相似度；`id` 直接作为 `beats[].stickerId`
- `sticker.describe`：重新识别一张表情（可带 `focus`），新描述与向量写回 `StickerAsset`
- `sticker.collect`：把本会话收到的图片收进表情库，`image` 传 `[图片：描述]` 的描述原文
- `todo.create`：只有双方明确邀请并明确答应后才可写入
- `self.state`
- `self.attributes.list`：列出人格卡与实时状态的全部属性键、中文标签、分组、类型和是否有值，不返回值
- `self.attributes.get`：按一个或多个键读取属性完整值；数值型属性附带行为含义，实时状态（精力/压力/社交电量/情绪/整洁等）直接从 `PersonaState` 读取
- `self.attributes.update`：按对象批量修改任意自身属性；卡片键写入 `ChatChannelPersona.values` 并记录修订历史，实时状态键写入 `PersonaState`，数值按该键范围夹取
- `time.now`

工具循环限制：最多 6 步、20 秒、2 次网页搜索、5 条记忆写入；第 4 次工具调用后要求直接输出动作计划。发送只能生成 `message.plan`，由执行器提交。

动作计划：

```ts
interface ActionPlan {
  engage: boolean;
  reason: string;
  stance: Stance;
  beats: OutgoingBeat[];
  memoryWrites: MemoryDraft[];
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
  | { kind: 'face'; faceId: string; delayMs: number };
```

每轮写回与漂移（`MindDriftService`）：规划器可以提出`self.activity`、`self.traits`、`groupStance` 与 `relationshipSignals`，但真正落库前统一由服务端限幅，任何一轮都不能把属性拉飞。

| 作用域     | 写入位置                       | 单轮跨度   | 24 小时上限 | 冷却       | 每轮最多    |
| ---------- | ------------------------------ | ---------- | ----------- | ---------- | ----------- |
| 自身活动   | `PersonaState.currentActivity` | 只更换文案 | 无          | 无         | 1           |
| 整洁程度   | `PersonaState.grooming`        | ±8         | 净 ±30      | 5 分钟     | 1           |
| 自身数值   | `ChatChannelPersona.values`    | 每项 ±1    | 每项净 ±4   | 45 分钟/项 | 2 项        |
| 群态度     | `PersonaGroupStance`           | 每项 ±2    | 每项净 ±8   | 30 分钟/项 | 3 项        |
| 对个人关系 | `PersonaRelationship`          | 每项 ±5    | 每项净 ±10  | 10 分钟/项 | 3 人 × 4 项 |

自身数值只在 9 个心理维度上漂移：自信、自控力、羞耻感、信任倾向、依恋程度、占有欲、顺从度、好奇心、主动性；体力上限、身高体重等稳定设定不会随聊天移动。每日上限按净变化计算，反向回调不会被上限锁死。所有漂移都会写一条 `WRITEBACK` run step，账本落在 `PersonaChangeLog`。

整洁程度不自行漂移，只在活动文案命中具体事件时变化：洗澡/换衣/整理等上调，跑步/淋雨/打扫/搬东西等下调，普通出门小幅下调；没有事件就不变。

群关系不预判：新建 `PersonaGroupStance` 的自在/归属/关注/严肃/主动/观众风险六项全部从 0 开始，由人格在后续轮次里自适应；迁移 `20261104235500_group_stance_zero_defaults` 只把仍然是旧默认全 50 的行归零，不覆盖已调整过的群。

主动消息：由 `AgentIntention` 驱动，经时间、关系、近况、连发、群规、额度门控。默认每人每天最多一次主动开启话题。

表情：本地 `StickerAsset`，文件名/视觉描述/标签做本地向量；检索按情绪、意图、关系、场景；发送走现有媒体链路。人格想发表情时先 `sticker.search` 拿 `id`，在 `beats` 里写 `{"kind":"sticker","stickerId":"...","delayMs":800}`；表情作为独立图片气泡，可与文字气泡交替，一次回复最多一个。描述不准或想确认内容时可以 `sticker.describe` 带 `focus` 重新看图，新描述与向量写回数据库。人格可用 `sticker.collect` 把本会话收到的图片收进表情库（`image` 传 `[图片：描述]` 的描述原文）；心智页「表情库」只展示 TA 自己收藏的表情，不再展示渠道最近图片或本地目录扫描结果。

## 8. 心跳与待办

`PersonaState.nextWakeAt` + 数据库租约（`FOR UPDATE SKIP LOCKED`）每 30 秒扫描。每次醒来生成 `WakeBrief`：时间、状态、夜间消息、未回消息、待办、承诺、未解决冲突、最近记忆。

额度与唤醒节奏由 `ChatMindSettings` 控制：

- `dailyMessageBudget`：每天最多发送的文本/表情气泡数（跨私聊与群聊合计，默认 30；0 表示不限制）。
- `dailyProactiveBudget`：每天最多主动开启几次话题（按发出消息的心跳/主动 run 计，默认 3；0 表示只回应、不主动，负数表示不限制）。达到上限后心跳降级为 `SHADOW` 且不再领取主动意图，次日恢复。

- `selfScheduleEnabled`：是否允许人格在计划里写 `nextWakeAt` 自主安排下次醒来。
- `wakeIntervalMinutes`：没有到期事项时的常规间隔。
- `wakeMinMinutes` / `wakeMaxMinutes`：自主唤醒与兜底重排的上下界。
- `quietIntervalMinutes`：安静时段使用的间隔。

待办唤醒条件：绝对时间、相对间隔、事件（某人/关键词）、状态（精力/心情）、复合条件。

计划任务同意规则：人格不能凭单方面愿望建待办。`todos[].consent` 必须同时给出邀请消息 ID 与答应消息 ID；答应必须发生在邀请之后、间隔不超过 40 条消息与 12 小时，两段消息要来自双方、包含明确邀约与明确同意，且答应不能是否定、反问或含糊拖延；群聊里的邀请还必须点名或 @ 人格本人。`todo.create` 工具走同一校验，未通过直接报错。

睡眠：按人格时区与在线策略；睡眠期间默认不主动，@、亲密求助、紧急承诺可突破；醒来补消息；睡眠时做深度整理与日记。

## 9. 消息接入与模式

`ChatMessageProcessor` 是唯一入口：消息入库、媒体与语音转写完成后，按渠道级 `ChatMindSettings.mode` 分流，不再存在第二套消息管线。

- `OFF`：不做心智判断，只保留会话记录。
- `SHADOW`：运行完整心智循环并落 `AgentRun`，但不发送。
- `APPROVAL`：只生成待审 `AgentAction`，人工批准后由执行器发送。
- `LIVE`：心智直接执行动作。

私聊在 `privateBurstSeconds > 0` 时先进入连发合并；其余消息直接 `mind.turn`。

### 回复回避窗口

`ChatMindSettings.replyAvoidSeconds`（0–7200 秒，默认 180）把同一会话的回复串行化。**只对群聊生效；私聊默认没有任何窗口期。**

- 规划器确认要回复（`engage` 且有气泡）后，运行立刻占用 `mind:reply-lock:<conversationId>`；Redis `SET NX EX` 跨进程生效，Redis 不可用时回退到进程内计时表。
- 锁存在期间，只有**没有被点名**的消息在场景构建前直接跳过（`suppressed: true`），不再调用视觉与规划。点名包括：at 段目标等于渠道账号、戳一戳目标是自己、文本里出现人格名字或别名。被点名的消息照常规划；若规划要回复，则把窗口顺延为完整时长。
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
- 这不是群聊的回复回避窗口：不吞消息、不取消已决定的回复，只改变「什么时候回、回几次」。`0` 关闭；私聊默认仍是零延迟。

### 长时事件（任何离场活动）

`PersonaLongEvent` 记录 Agent 自己安排的一段离场时间，活动不限于睡觉：睡觉、打盹、洗澡、吃饭、上厕所、出门、专注做事等都可以。`kind` 是自由字符串（`[A-Z0-9_]`），`title` 是主要显示名。规划输出里的 `longEvent` 写 `START` 或 `END`；`START` 会结束已有事件、写入标题/原因/计划结束时间，并把活动改为对应状态。

- 规划器每次都能看到【作息】简报：当前本地时间、`sleep_depth`（0–4，越高越难叫醒）、上次 SLEEP/NAP 的实际/计划时长与结束时间、已清醒时长、睡眠债/精力/健康/压力，以及一条非约束性的时长建议。`START` 必须写 `plannedEndAt`，时长由模型结合简报自己决定，不固定 8 小时；漏写时才兜底：睡眠类按睡眠债估 5–10 小时，其他活动 1 小时；计划结束会被夹在 10 分钟到 24 小时之间。
- 事件 ACTIVE 期间，普通消息与心跳都不会进入规划：消息仍落 `AgentRun`（`SKIPPED`，原因写「长时事件『…』中，跳过…」），并设置 `suppressed`，不再继续处理。
- 唤醒判定：
  - 到达 `plannedEndAt` 直接醒（`PLANNED`），不调模型。
  - 没有被点名/戳时继续休息。
  - 被点名时调用一次 `mind.long-event.wake`：模型结合事件、`sleep_depth`、当前状态、窗口内点名次数、谁在叫和消息内容，输出 `{wake, urgency, reason}`。决定醒来记 `JUDGMENT`（若命中事件自定义在意词则记 `KEYWORD`）；决定继续睡时，理由与紧急度写入跳过运行轨迹的 `ATTENTION` 步骤。
  - 模型失败时退化为「事件自定义 `wakeKeywords` → 窗口内点名次数阈值」兜底（`MENTIONS`）。不存在全局唤醒词表，`wakeKeywords` 只是人格睡前留下的参考词。
- 唤醒即结束事件（`COMPLETED` 或 `CANCELLED`）。结算不按事件类型套固定公式：结束时由人格自己调用一次 `mind.long-event.settlement` 模型，结合事件类型/标题/开始原因、计划与实际时长、结束原因、期间被点名次数、`sleep_depth` 和叫醒消息，自行决定要改动哪些指标（心情三维、精力、健康、压力、社交电量、注意力、睡眠债、整洁）以及醒来后的活动与位置。每个变化字段都必须给出简短理由，写入 `PersonaState` 和「数据变动历史」；模型超时或输出不可解析时最多重试一次，仍失败则只恢复活动、不做数值改动。每次结算是独立的提示词日志，可在提示词面板查看。
- `lastWakeAt` 只在事件结算时更新；心跳只更新 `lastHeartbeatAt`，不再每次扣睡眠债。因此「上次醒来」表示真正的离场结束，而不是心跳轮询时间。
- 手动结束：`POST /mind/long-events/:personaId/end`，心智页「此刻的 TA」里有「结束事件」按钮。
- 事件结束后把下一次心跳排到 1 分钟后，让常规唤醒节奏恢复。

### 数据变动历史

`PersonaChangeLog` 统一记录四类变化（`scope`）：`STATE`（当下状态）、`SELF`（自身卡片数值）、`RELATION`（对个人）、`GROUP`（对群）。每行写字段、前值、后值、差值、原因、来源（长时事件/自然漂移/情绪/对话消耗/Agent/手动/醒来/工具）与可选的 `runId`。心智页「变动历史」页签按时间倒序分页展示，人格简报里能看到整体最近 8 条；关系抽屉只显示与当前联系人相关的最近 12 条；群关系与完整历史在「变动历史」页签。长时事件结算、Agent 调整与手动修改都会留痕。

### 图片描述提示词

`ChatMindSettings.imageDescriptionPrompt` 覆盖心智补描述时的内置提示词（留空 = 内置默认）。它只影响尚未生成描述的图片：已有 `ChatMediaObject.description` 直接复用，改提示词不会触发重跑。

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

Web `/mind`：页面拆成「人格简报 + 8 个页签」，不再把配置塞进这一屏。

- 顶部只保留渠道选择、渠道配置入口、立即唤醒与自动刷新（10 秒 / 30 秒 / 1 分钟 / 5 分钟，默认 30 秒，存 localStorage）。
- 人格简报：实时状态 10 项、位置、下次唤醒、当前长时事件（叫醒难度、已收到点名、结束按钮与最近结算原因）。
- 页签：`runs`（运行轨迹 + 提示词日志 + 待审动作）、`changes`（统一变动历史，按 scope 过滤）、`relations`、`groups`、`memories`、`plans`（待办 / 主动意图）、`journal`、`stickers`。
- 长列表按批懒渲染；页签内容在固定高度容器内滚动，后台刷新不清空页面。
- 心智配置（模式、每日消息/主动额度、唤醒节奏、回复回避、连发合并、图片描述提示词等）并入互联中心的渠道人格面板「心智」页签，与变动历史放在一起。

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
- 发送上限、主动额度、静默时段、黑名单、急停开关。
- 模型分层、注意力过滤、缓存、每日预算。
- 心智 trace 回答「为什么回/不回、想起了什么、改了什么」。
- 影子/审批模式用于灰度。

## 12. 实施清单

- [x] Phase 0：Prisma 模型与迁移、shared 契约、基础服务。
- [x] Phase 1：Scene/Attention/SocialRead/Planner/Tools/ActionPlan、影子/直发模式。
- [x] Phase 2：心跳、待办、主动意图、睡眠/醒来。
- [x] Phase 3：表情库、网页搜索、记忆 CRUD、整理/日记。
- [x] Phase 4：Web 心智面板、trace、评测场景、旧数据迁移（关系/群态从旧人格值播种）。

### 已验证（2026-11-04）

- 影子模式连续三轮：首轮软拒绝，第二轮检索到上一轮写入的 BOUNDARY 记忆后升级为冷处理沉默；关系信号按 `contactId` 落库。
- 心跳整理：两条情景记忆合成 BOUNDARY/PROMISE/FACT 三条长期记忆，并写入第一人称日记；单次规划 3739 prompt / 593 completion tokens。
- 表情库：扫描本地目录 → 向量检索「开心」「生气」分别命中对应文件，相似度 1.0；测试文件与索引已清理。
- Web：运行轨迹、关系与群、记忆、待办与主动、日记、表情库六个页签均可用真实命中测试切换。
- 页面细化（2026-11-04）：渠道选择框统一为 `mind-select`；页面最小字号提升到 0.68rem；状态面板展示全部数值属性与活动/位置/三个时间点；日记可删除；表情库可从渠道收到的图片导入（`sticker.collect` 工具与页面挑选两条路径）。
- 表情库范围（2026-11-05）：心智页「表情库」只展示 TA 通过 `sticker.collect` 收藏的表情，移除渠道最近图片挑选与「扫描本地表情」入口，避免额外图片混入库视图。
- 图片可见性（2026-11-05）：心智场景构建前会为缺失描述的图片调用视觉模型并写回 `ChatMediaObject.description`（锚点消息优先、最多 6 张、每批 3 张、失败不阻塞），提示词继续用 `[图片：描述]`。
- 回复回避与图片提示词（2026-11-05）：心智设置新增 `replyAvoidSeconds`（默认 180 秒；旧库迁移时分钟值 ×60）与 `imageDescriptionPrompt`；前者在规划确认回复后按会话占 Redis/进程内锁，窗口内的其他消息与心跳不再回复且不会重复发送，后者按渠道覆盖心智补描述的内置提示词。
- @ 与戳一戳（2026-11-05）：提及判定不再看文本里是否出现 `@`，改为检查原始 segments：`at.qq` 或合成 `poke.target_id` 等于渠道账号才算 `mentionedSelf`；群「仅被@才回」与互动加分都走这个字段。NapCat 的 `notice/notify/poke` 事件被转成一条合成消息（`[戳了戳我]` / `[戳一戳]`，附 `poke` segment），与普通消息一样进入会话历史与心智；自己戳自己会被忽略。
- 回避窗口点名绕过与轨迹补全（2026-11-05）：窗口内只跳过未被 @、未被叫名字、未被戳的消息；被点名时正常回复并把窗口重新填满。此前被窗口跳过的消息直接 `return`，不创建 `AgentRun`，运行轨迹因此缺条；现在跳过也会落一条 `SKIPPED` 运行（含当前消息的紧凑场景与 `ATTENTION` 步骤），运行列表新增 `offset` 分页与「加载更多」。
- 私聊无窗口（2026-11-05）：回复回避窗口只对群聊生效，私聊默认不占锁、不跳过、不延长窗口；心跳与运行后抢锁同样按会话类型判断。私聊另提供可选的「连发合并」（`privateBurstSeconds`，默认 0）：开启后按安静间隔把同一串消息合成一次回复，不抑制消息，最多等 12 秒；被合并的消息仍以 `SKIPPED` 运行留在轨迹里。
- 长时事件与健康度（2026-11-05）：新增 `PersonaLongEvent`（睡觉/打盹/休息/专注/离开等，Agent 可自定义类型）与 `PersonaState.health`。规划器可写 `longEvent` 开始或结束事件；事件期间消息与心跳跳过并记为 `SKIPPED`，只有窗口内重复点名、唤醒关键词或到点才强制醒来。结束结算交给人格自己的模型判断：由它决定改动哪些指标、醒来后的活动与位置，并为每个变化字段写明理由，不按事件类型套固定公式；手动结束走 `POST /mind/long-events/:personaId/end`。心智页「此刻的 TA」展示当前事件与结束按钮，结算明细进入「数据变动历史」。
- 数据变动历史（2026-11-05）：所有动态状态、自身数值、关系与群姿态写入都记录字段、前值、后值和原因（自然漂移/情绪/对话消耗/长时事件/Agent/手动/醒来/工具）；心智页「变动历史」页签按时间倒序分页展示，并可跳转关系/群抽屉查看局部历史。
- 模块收口（2026-11-05）：消息管线三表与前后端代码全量删除；`PersonaStateChange` / `PersonaRelationshipEvent` / `PersonaDriftEvent` 合并为 `PersonaChangeLog`；`PersonaSchedule` 并入 `PersonaState`；删除无引用的 `PersonaMemoryLink`。心智页拆成简报 + 8 个页签，配置并入渠道人格面板「心智」页签；对话页头像可直接打开关系/人格简报。迁移 `20261105060000_mind_consolidation` 已保留旧数据并删除旧表。
- 表情发送与工具契约校对（2026-11-05）：规划器明确「可以直接只发表情，也可以与文字气泡交替；一次回复最多 1 个」，解析端强制单表情；新增 `sticker.describe` 重新识别表情并把新描述与向量写回 `StickerAsset`；`sticker.search` 只返回 id/描述/标签/分数，避免干扰 `stickerId`。工具校对：`history.search` 补消息 id（`todo.create` 的邀请/答应 ID 来源）、`memory.create` 补 `subjectId` 并放开完整 kind、`sticker.collect` 改为用 `[图片：描述]` 原文解析本会话图片、移除规划器对无执行实现的 face 段解析、工具结果截断放宽到 2400 字并让中文自然短语也能命中工具关键词。
- 私聊误判与记忆促进（2026-11-05）：修正 `writeBack` 在私聊里无条件调用群姿态 `markRead` 导致的「群会话不存在」——现在只在 GROUP 会话标记已读；情景记忆显著性门槛 85→75、普通冷却 6h→3h、显著冷却 45min→20min，并把「关系变化 ≥8」修正为 ≥4（规划器单轮信号上限本来就是 5，旧条件永远不成立）；规划器改为对可长期复用的新信息主动写记忆，规划输出上限 1000→1200 tokens；私聊情景不再记到群名下。心智页页签改为固定高度容器内滚动、长列表懒渲染，并加入可关闭、可调间隔的自动刷新与手动刷新，后台刷新不覆盖未保存的设置草稿。
- 唤醒节奏：常规/安静/最短/最长间隔与“自主安排唤醒”开关可从页面保存，规划器的 `nextWakeAt` 会被夹在设定区间内；心跳兜底重排使用同一组配置。
- 作息参考与自主唤醒（2026-11-05）：长时事件不再固定 8 小时。规划器新增【作息】简报（上次睡眠、清醒时长、睡眠债、`sleep_depth` 与非约束性时长建议），`START` 必须由模型写 `plannedEndAt`，兜底时长按睡眠债估算；活动类型放开为任意离场事项。唤醒改为被点名时调用 `mind.long-event.wake` 自主判断，输出 `{wake,urgency,reason}`，新增 `JUDGMENT` 结束原因；全局唤醒词表删除，`wakeKeywords` 仅作参考与模型失败时的兜底。心跳改用 `markHeartbeat`，不再刷新 `lastWakeAt` 或扣睡眠债。
- 关系属性清单与任意写回（2026-11-05）：37 项关系属性（关系数值 10、关系描述 11、边界与同意 7、对象档案 9）收口到 shared `relationship-attributes`，区分一等字段与 `extras` 键。`relationship.get` 返回完整 `attributes`（key/中文标签/分组/类型/当前值，空值也列出）；`relationship.update` 新增 `attributes` 对象，可把清单里的任意 key 写回，extras 与已有键合并、未提及的键保留。非数值字段直写，数值仍走漂移限幅。规划器工具结果截断 2400→6000 字，提示词补充「关系细节先搜关系、读取 attributes、再写回」的指引。
- 属性单一真源（2026-11-04）：删除 `PersonaRelationship.baseValues`；把 `ChatPrivatePersona`/`ChatGroupPersona` 迁移进 `PersonaRelationship`/`PersonaGroupStance` 后删表；对话页人格面板改读这两张表；渠道人格面板改为服务端保存并写入 `ChatChannelPersona.history`；`PersonaState` 仍是唯一动态状态，渠道快照只做读时投影。
- 计划同意与记忆节流（2026-11-04）：`todos` 需邀请/答应两条消息并通过时序、间隔、否定词、点名校验；普通情景记忆不再每轮写入，阈值与冷却时间见第 5 节。
- 提示词日志（2026-11-04）：所有 `LlmService.complete` 调用与人格 AI 编写都会写入 `LlmPromptLog`，插入后裁剪到最近 200 条。
- 每轮漂移与提示词瘦身（2026-11-04）：规划器新增 `self` / `groupStance`，由 `MindDriftService` 按上表限幅并记账；对话提示词去掉背景/世界观/风格样本，改为 5 项行为化性格、目标关系、群态度、6 条记忆、12 条对话与紧凑工具表。
- 自身属性查询（2026-11-04）：新增 `self.attributes.list` / `self.attributes.get`。前者只列键与元数据，后者按需读取一个或多个值；动态字段从 `PersonaState` 实时读取，避免人格卡里的旧副本误导模型。
- 工具按需发现与关系读写（2026-11-04）：提示词只暴露 `tools.search`，模型搜索后再调用具体工具；`relationship.get` 返回全部关系字段，`relationship.update` 可调整全部字段，数值仍受漂移限幅。群关系六项默认值改为 0。
- 渠道人格面板实时投影（2026-11-04）：编辑页把 `PersonaState` 掌管的字段（活动/位置/情绪三维/精力/压力/社交电量/注意力/睡眠债）实时合并展示并标记「实时」，编辑直接调用状态接口；卡片不再接收这些字段的第二份副本；渠道人格快照投影排除 `mood_tags`/`mood_intensity`/`stress`/`social_battery`/`doing_now`/`location` 旧卡片副本。
- 整洁程度与自身属性写入（2026-11-05）：`grooming` 并入 `PersonaState`（迁移从卡片数值回填），渠道面板与心智页同步展示；每轮活动变化按关键词调整整洁度（洗澡/换衣 +，跑步/淋雨/打扫 −，单轮 ±8、每日 30、冷却 5 分钟）。新增 `self.attributes.update`，人格可批量修改任意卡片键或实时状态键；卡片键写入 `values` 并追加修订历史，状态键写入 `PersonaState`。心智页「基本数值」补上 `physique_effect_cap` 与四组动态参数的中文标签。
- 页面交互（2026-11-04）：渠道下拉改为自定义列表；移除影子试跑和会话选择；关系/群支持 ID 或昵称搜索；滑条改为带填充段的 `mind-range` 并补全所有可调数值。
- 全程只使用 SHADOW，没有发送真实 QQ 消息；验证后渠道模式已恢复为 `OFF`。

验收：

1. 「讨厌群 A 但喜欢的人 B 在群里」能产生克制的对外回复 + 对 B 的软回应。
2. 「喜欢 B、被 C 追求」能清晰拒绝 C，且不在群里/对 B 泄露 C 的隐私。
3. 私聊秘密不会在群里被检索出来。
4. 沉默、多气泡、延迟、表情都能被 trace 解释。
5. 影子模式不发送；直发模式不重复发送。
6. 心跳能按期处理待办并写日记，不打扰睡眠。
