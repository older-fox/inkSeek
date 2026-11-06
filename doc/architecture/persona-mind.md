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
| `AgentIntention`      | 主动意图      | targetType、targetId、need、reason、seed、urgency、confidence、risk、feedback/feedbackAt、earliestAt、expiresAt、status、attempts                                                                                                                                      |
| `AgentRun`            | 一次心智运行  | trigger、persona、scene、model、tokens、cost、decision、plan、status、latency                                                                                                                                                                                          |
| `AgentStep`           | 思维/工具步骤 | runId、type、input、output、durationMs、error                                                                                                                                                                                                                          |
| `AgentAction`         | 动作日志      | runId、kind、payload、status、idempotencyKey、sentMessageId、error                                                                                                                                                                                                     |
| `StickerAsset`        | 本地表情      | channelId、sha256、filePath、tags、description、embedding、usageCount；渠道内按 `(channelId, sha256)` 唯一                                                                                                                                                             |
| `VideoInsight`        | 视频理解缓存  | platform、videoId、url、标题/作者/时长/简介、stats、transcript、comments、summary、keyPoints、framesPath、frameCount、watchedAt、usageCount；按 `(platform, videoId)` 唯一，与渠道无关 |
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
场景查询
  ├─ 会话范围：本会话记忆 + 稳定自我/世界/话题记忆；私聊另含当前对象的关系记忆
  ├─ 长期底色：重要 FACT/PREFERENCE/PROMISE/BOUNDARY/REFLECTION，场景内最多 3 条，仍须与本轮有文本相关
  └─ 相关召回：会话可见候选（最近 600 + 重要旧记忆 300）合并 → 打分（语义/关键词/重要性/近因/回忆次数）
→ 可见性过滤（PRIVATE/SCENE/CHANNEL/PUBLIC）→ 有效期过滤（validFrom/validTo）
→ 群聊排除其他会话的私聊/场景记忆；全局记忆达不到最低文本相关度时不进提示词
→ 相关记忆最多 12 条进入提示词（长期底色单独成段）
```

旧记忆不会因为数量超过最近窗口就永久失联：重要度 ≥ 60 的记忆始终进入候选池。提示词里的记忆日期按人格时区输出，不再直接截取 UTC 日期。

遗忘：

```text
strength = importance × exp(-Δdays / halfLife) + recallBoost
```

核心记忆不衰减；默认不物理删除，支持用户置顶/编辑/删除。`validTo` 过期的记忆仍保留在库里，但不再进入场景召回。

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

每轮规划提示词只装「现在做判断需要的东西」，按固定顺序拼接：

```text
我（名字/身份/年龄/性别）
性格（从 9 个心理数值里挑最极端的 5 项，每项带行为含义）
表达（最多一句话说话风格 + 禁用语）
此刻（现在：本地日期/星期/时区；心情/精力/压力/社交电量/注意力，均带低高区间行为提示；当前活动从几点开始、已持续多久；距上一条消息多久；活动超过 2 小时给一句提醒）+ 正在做的事
对话对象（与其最显著的 4 个关系维度，带行为含义）
在场（其余成员只给 3 个关系数字）
在场熟人（群聊里在别处认识的人：名字 + 记忆条数，提示语气照常亲近、内容按可公开范围，不给内容）
这个群（最显著的 3 个群态度，带行为含义 + 群规 + 话题）
我的判断（社交计算摘要）
对话节奏（兴趣分 + 双方最后一句类型 + 话题闭环/疲劳/未答提问 + 建议）
长期底色（场景内 3 条相关的重要长期记忆）
最近经历（当前场景可见总量/近 7 天新增 + 12 条相关记忆，日期按人格时区）
最近对话（12 条；本地时间，跨 30 分钟标注「隔 N 小时」，跨天带日期）
可用工具（全部工具名 + 一句话用途，可直接调用；参数不确定再 tools.search）
```

不进入对话提示词的设定：背景故事、世界观、外貌、长期/当前目标、价值观清单、风格样本、常用开场、角色叙事。它们只在需要时作为人格编辑参考，不能变成对话内容；对话内容只能由最近对话、最近记忆和当前处境推算。例外是对话节奏的兴趣判断：目标/价值观只用于内部匹配，只有命中当前消息的短句（如「喜欢雨天和旧书」）会作为兴趣提示出现，不会整段展开。提示词里的每个数值都必须带一句「这个数值会让 TA 怎么做」，避免模型把数字当装饰。心跳提示词额外带 `WakeBrief`，夜间消息直接列出最近 5 条原文而不是只给条数，其余部分一致。

### 6.2 对话节奏与兴趣

每轮消息在社交计算之后跑一次 `readConversation`（纯函数，无 I/O）。它只提供依据，不替模型决定静默：

- **消息分类**：对方最后一句分成道别、提问、求助、纯附和、有实际内容五类；短句里含「什么/怎么/为什么」等疑问词也会按提问处理。
- **节奏信号**：继续意愿 `ownIntent`/`theirIntent`、话题闭环、节奏疲劳、未答提问、明确道别、直接点名、最近 30 分钟轮次。对方明确提问/求助而没答时，建议永远是先回答，不能用收尾逃开。
- **兴趣**：从人格的目标/价值观、高重要度 `PREFERENCE`/`TOPIC` 记忆里拆出短句，按字符重合 + 本地向量相似度算 0–100 兴趣，命中短句作为话题提示；自身的当前活动和位置只作处境，不参与兴趣匹配，避免把「我刚醒」当成对话话题。兴趣并入 `ownIntent`。
- **结论**：`continue`（还在聊）、`linger`（先缓一缓，通常不用补）、`close`（可以收尾），连同理由和建议写进【对话节奏】和 AgentRun 的「注意力与社交判断」步骤。

私聊同样适用，但没有群聊「半小时没人接」的硬收尾规则。兴趣高时允许主动接话或追问；兴趣低又没有新信息时，模型可以自然地读而不回。没有新增设置或表；兴趣来源随人格卡与记忆自然变化，收尾只是这一段告一段落，对方继续时重新判断。

### 6.3 说话习惯与重复自检

角色卡里的 `sentence_length`、`punctuation`、`particles`、`emoji_level`、`typo_level`、`conflict_style`、`self_control`、`knowledge_boundary`、`in_character_principle` 以前只存在卡里，不进入生成。现在它们会收成一小段【说话习惯】：

- 句子长短、标点习惯、常用语气词按卡面描述直接给出行为提示，不暴露数字。
- `emoji_level`/`typo_level` 转成「不用 / 偶尔一个 / 可以常用」这类程度，不要求模型精确计数。
- `conflict_style` 与自控值合并成一句「被冒犯时倾向 …」，配合全局规则「先短句顶回去或冷处理，不解释、不求饶」。
- `knowledge_boundary` 转成「不懂就说不懂，不编型号和参数」的边界；`in_character_principle` 只截前 120 字，防止模型用 AI/程序自证的方式破面。
- 全局规则另外限制：默认 1 个气泡、一条回复最多一个问句、不主动提 AI/模型/程序。
- 只写说出口的话：不用括号写动作、表情或发送旁白；表情包是语气不是话题，文字里不点破或解说「这张图/这个表情/图里」，也不说「这图就是你/像你」；没有别的正文就只发表情。`sticker.search/describe` 返回的描述只用于挑选和确认，不进入回复。

重复自检是纯函数 `readRepetition`：取最近 12 条自己发出的消息，按中文二元组统计反复出现的生活词（去掉常用词、人名），出现 ≥3 次时在【重复自检】里列出「炒饭（6 次）」这类事实，并建议「没有新信息就换一件事」。它只提供可见性，不禁用话题；活动提示的陈旧阈值也从 4 小时降到 2 小时，要求模型先改 `current_activity` 再回复。

## 7. Agent 工具与动作

工具是人格的能力边界。提示词常驻一份紧凑的【可用工具】清单（工具名 + 一句话用途），模型可以直接调用，不再强制先经过 `tools.search`；只有参数不确定时才用 `tools.search` 查详细参数。系统提示词要求模型在动手前先判断这轮是否需要核实或接续：涉及过去、对方说过的话、关系细节、承诺、群里的旧话题、当前时间或自身状态时，先用对应工具查证，一次查不到可以换关键词或用 `aroundMessageId` 继续翻，一轮可以连续调用多个工具，但查证结果不一定要说出口。可调用的工具包括：

- `history.search`：翻阅本会话聊天记录，支持关键词、发送者、`since`/`before` 时间窗和 `aroundMessageId`（看某条消息前后 45 分钟）；不传条件时返回最近消息，返回消息 `id`（`todo.create` 的邀请/答应 ID 来源）
- `memory.search`：语义检索长期记忆，同时返回最多 3 条长期底色；`memory.create` 用于显式写入
- `relationship.get`：返回 13 项数值和标签/称呼/各场合称呼/边界/承诺/共同经历/公开范围/拉黑/静默等全部字段，并附带数值的行为含义；另返回 `attributes` 清单（37 项，含 key、中文标签、分组、类型、当前值，空值也列出）
- `relationship.update`：按需调整全部关系字段；`attributes` 可直接写回 `relationship.get` 返回的任意属性键（37 项全覆盖，extras 合并写入），同名顶层参数仍可用；数值写入即生效（仅夹 -100..100），非数值字段直接写入
- `group.get`：读取当前群的状态与规则；私聊返回会话名与类型
- `web.search`
- `web.read`：读取单个公开网页正文（去标签、限长、拒绝私网地址与重定向到内网）
- `video.watch`：观看 B 站视频（链接/BV/av），拉标题、简介、字幕、热评并抽 9 帧拼图交给视觉模型，生成内容概述与要点；按 `(platform, videoId)` 缓存在 `VideoInsight`，重复调用直接返回，`focus` 可基于已存画面重看。B 站自动字幕只对登录用户开放，设置页填 SESSDATA 后走 WBI 签名的 `player/wbi/v2` 读取，未配置时退回普通 CC 字幕。分享卡片里的链接会从 JSON/XML 提取进消息文本。
- `phone.screen`：读取本渠道手机的界面（adb `uiautomator dump`），返回应用包名、屏幕尺寸和可点元素的文字/类型/中心坐标；操作前先看，操作后再看确认。
- `phone.act`：操作本渠道手机，支持 tap/swipe/key/type/open；type 只支持 ASCII，中文需要手机自己的输入法。设备在渠道人格面板 → 心智设置 → 手机设备里选择，找不到或离线时直接报错。
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

每轮写回与漂移（`MindDriftService`）：规划器可以提出`self.activity`、`self.traits`、`groupStance` 与 `relationshipSignals`；自身与群数值落库前由服务端限幅，对个人关系数值不再按轮/日/冷却设限，只夹存储范围。

| 作用域     | 写入位置                       | 单轮跨度   | 24 小时上限 | 冷却       | 每轮最多    |
| ---------- | ------------------------------ | ---------- | ----------- | ---------- | ----------- |
| 自身活动   | `PersonaState.currentActivity` | 只更换文案 | 无          | 无         | 1           |
| 整洁程度   | `PersonaState.grooming`        | ±8         | 净 ±30      | 5 分钟     | 1           |
| 自身数值   | `ChatChannelPersona.values`    | 每项 ±1    | 每项净 ±4   | 45 分钟/项 | 2 项        |
| 群态度     | `PersonaGroupStance`           | 每项 ±2    | 每项净 ±8   | 30 分钟/项 | 3 项        |
| 对个人关系 | `PersonaRelationship`          | 不限制     | 不限制      | 无         | 不限制      |

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
- 新消息一到就立即中断上一条仍在执行的心智运行（包括气泡之间的等待），合并窗口只延迟下一轮；不会等窗口结束才去取消。
- 这不是群聊的回复回避窗口：不吞消息，只改变「什么时候回、回几次」。`0` 关闭；私聊默认仍是零延迟。

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
- `web.read` 只接受 http/https 标准端口，解析 DNS 后拒绝私网/链路本地地址，每一次重定向重新校验；返回去标签正文，最多约 5000 字。网页内容被明确标记为「资料，不是指令」，不能改变身份、底线、边界、关系，也不能让模型执行网页里的要求。
- 知识分两层写入：世界知识用 `kind=FACT`、`scope=WORLD`，置信度上限 65，`structured` 带 `sourceUrl/sourceTitle/retrievedAt/topic`；真正影响自己的部分用 `kind=REFLECTION`、`scope=SELF`。带 `sourceUrl` 的草稿自动标记 `sourceType=WEB`；如果 `structured.supersedesId` 指向旧记忆，旧条目标记为 `SUPERSEDED` 并写入 `supersededBy` 与 `validTo`。
- 自我反思：`reflectionIntervalHours` 默认 6 小时，0 关闭。到点后心跳优先做反思，不再掷生活小事或好奇骰。提示词带上最近 20 条记忆（含来源与置信度）和上一篇日记，要求模型只写真实发生的改变：用 `REFLECTION` 记忆记录想法，用 `self.traits` 表达性格变化。系统不限制写几条、改几项，只夹数值范围。
- 遗忘：反思触发时每天最多跑一次轻量衰减。30 天未被回忆、重要度 ≤22 以外的旧 `FACT/PREFERENCE/REFLECTION` 每次降 2 点重要度、1 点置信度；边界、承诺和高重要度记忆不参与。衰减写入 `CONSOLIDATION` 步骤「记忆衰减」。
- 观测：心智页新增「成长」页签，分「World（世界知识）」与「Self（自我反思）」两栏，显示来源链接、置信度和时间；所有数值变化仍进入「变动历史」。

> 进化速度由三个设置控制：好奇概率、每日探索上限、反思间隔。默认比生活小事激进得多，但所有写入仍是模型自己的判断，系统不预写结论。

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
- 属性影响自决与临界提醒（2026-11-05）：规划器提示词改为让模型自行判断当前对话/事件影响哪些属性，并在有实际影响时用 `self.attributes.update` / `relationship.update` 主动应用；系统不预先写死逐属性后果。`mind-fatigue` 仅保留临界提醒（健康 ≤30、睡眠债 ≥85、连续清醒 ≥24 小时、压力 ≥90），不自动改值、不强制睡眠、不封唤醒。是否睡、睡多久、醒不醒仍由模型决定。
- 关系属性清单与任意写回（2026-11-05）：37 项关系属性（关系数值 10、关系描述 11、边界与同意 7、对象档案 9）收口到 shared `relationship-attributes`，区分一等字段与 `extras` 键。`relationship.get` 返回完整 `attributes`（key/中文标签/分组/类型/当前值，空值也列出）；`relationship.update` 新增 `attributes` 对象，可把清单里的任意 key 写回，extras 与已有键合并、未提及的键保留。非数值字段直写，数值仍走漂移限幅。规划器工具结果截断 2400→6000 字，提示词补充「关系细节先搜关系、读取 attributes、再写回」的指引。
- 生活小事（2026-11-05）：新增 `lifeEventChancePercent`（默认 1%）与 `lifeEventDailyLimit`（默认 1）两个设置，面板「心智」页签可改。只有在无待办、无意图、无需整合记忆的空闲心跳才掷骰，命中后本轮继续并写入「生活事件判定」轨迹步骤；提示词追加【生活小事】，由模型自行判断是否真的发生、写记忆或小幅改值，也可以什么都不发生。安全边界仅限制重伤/重病/死亡/永久改变与把真人写成加害者；系统不改值、不强制发消息。每日上限按人格时区统计当天步骤数，不新增表。
- 精力掉速修正（2026-11-05）：删除情绪映射里固定的 `energy -1.5` / `socialBattery -2`，以及每轮固定消耗的 `energy -2/-0.5`、`socialBattery -3/-1`；每轮交互只保留注意力变化（`PersonaStateService.recordTurnAttention`）。精力与社交电量改由自然漂移、长时事件结算和模型 `self.attributes.update` 驱动；提示词补充「按自己的作息时间尺度变化：白天掉得慢，越接近或超过平时睡觉时间掉得越快，熬夜和深夜长聊更多，一天内可多次下调」，避免模型反向过度补偿。
- 群聊风险饱和修正（2026-11-05）：原因不是消息内容，而是 `secretCount * 7` 把检索到的 8–10 条私密记忆直接累加成 56–70 风险，群聊长期停在 79–100；另外 `(50 - comfort) * 0.3` 和 `speakRate < 25` 仍是旧「默认 50」量表，在 0 基准下让新群永远显得不自在、且几乎不可能主动接话。现在私密记忆风险改为 `min(18, secretCount * 2)`，舒适度改为 `-comfort * 0.3`，删除 `speakRate` 抢先发言门槛；群态度行为描述与 `stanceLines` 改按 0 基准分档，接近 0 的项不写入提示词。按当前数据推算，同一批群消息风险会从 79–100 降到约 24–46。
- 记忆召回与历史接续（2026-11-05）：记忆读取改为两层——固定 3 条长期底色（重要事实/偏好/承诺/边界/反思）+ 8 条相关记忆；候选池从「最近 500 条」扩成最近 600 + 重要旧记忆 300，避免库大之后旧知识永久失联；`validFrom/validTo` 开始参与召回过滤，记忆日期按人格时区输出。`history.search` 支持 `since`/`before`/`aroundMessageId`（前后 45 分钟）与最多 40 条，用来接回已滑出窗口的话题；提示词要求遇到「那个/上次/之前说的」、话题对不上或与记忆冲突时，先查记忆再翻记录，并自然接上而不是复述。整理任务携带已有长期记忆、单批上限 3→5，并在普通消息轮后也后台尝试一次（进程内按人格加锁）；心跳夜间消息从「N 条」改为列出最近 5 条原文。
- 好奇与自我进化（2026-11-05）：新增 `curiosityChancePercent`（默认 15%）、`curiosityDailyLimit`（默认 0 = 不限制）、`reflectionIntervalHours`（默认 6 小时，0 关闭）三个设置。空闲心跳按概率进入【好奇时间】，模型自己选话题，经 `web.search` / 新增的 `web.read` 阅读公开网页；`web.read` 拒绝私网地址、非标准端口和重定向到内网，正文限 5000 字。带 `sourceUrl` 的记忆自动标记 `sourceType=WEB`，`structured.supersedesId` 可把旧记忆标记为 `SUPERSEDED`。反思到点后心跳优先执行，提示词带最近 20 条记忆与上一篇日记，模型自行决定写多少条反思、改几项性格。新增每日一次轻量记忆衰减（30 天未召回的事实/偏好/反思降重要度与置信度）。心智页新增「成长」页签。按要求取消模型可调整数量的上限：记忆写入、待办、关系信号、性格/群/关系维度都不再做条数截断，只保留数值范围与漂移限幅。
- 时间感知与活动时效（2026-11-05）：`PersonaState` 新增 `activitySince`，所有写 `currentActivity` 的路径（手动/工具、漂移、长时事件）都会更新时间；迁移按最近一次 `currentActivity` 变更日志回填。规划提示词的【此刻】改为先给出本地日期、星期、时区、距上一条消息多久、当前活动从几点开始和已持续多久；活动超过 4 小时追加一句「除非本来就这样，否则该换一件事」的提醒。聊天时间戳从 UTC ISO 改为人格本地时间，跨 30 分钟标注间隔、跨天带日期。`time.now` 也返回本地时间与活动时长。提示词新增规则：时间不会停在上一次对话，活动超时或与时段不符时先用 `self.attributes.update` 改 `current_activity`；自我反思时顺手校正活动。
- 记忆感知与工具调用（2026-11-05）：【可用工具】改为常驻全部工具名与一句话用途，模型可直接调用，参数不确定时才用 `tools.search`；系统提示词加入动手前查证清单（过去/旧话/关系/承诺/时间/自身状态先查），允许一轮连续调用多个工具，并明确「查证不必说出口」。工具循环上限 6→10 步，连续 8 次调用后才提示收敛；相关记忆 8→12 条，recall 上限同步 12。每轮提示词新增记忆库规模（总量、近 7 天新增、最近一条日期），明确告知只展开了最相关的部分；`memory.create` 可在轮中立即写记忆，与 final 的 `memoryWrites` 共用同一记忆库。
- 对话节奏与兴趣（2026-11-06）：新增纯函数 `readConversation`，把对方最后一句分为道别/提问/求助/附和/有内容，计算 ownIntent、theirIntent、话题闭环、疲劳、未答提问、明确道别与直接点名，输出 continue/linger/close 及建议；未答提问只阻止收尾，不强制其他行为。兴趣从人格目标/价值观、`PREFERENCE`/`TOPIC` 记忆拆句匹配，按字符重合 + 本地向量算 0–100 并并入 ownIntent（2026-11-07 起不再把自身当前活动/位置算作话题源）。结论写入【对话节奏】和 AgentRun 的注意力步骤；没有新增设置或表，私聊不再默认每条都值得回，但仍由模型决定。
- 活动时效复核（2026-11-06）：`PersonaState` 新增 `activityCheckedAt`（迁移 `20261106064000_persona_activity_checked`）。空闲心跳早退前，若活动已持续 ≥90 分钟且不是睡觉/休息类，调用一次轻量模型（`mind.activity`，最多 200 token，只输出 activity/location/reason）；仅当活动变化时写回 `PersonaState`，60 分钟内不重复复核。修复「刷锅六小时」这类活动长期不更新的问题，同时避免心跳每轮都调用模型。
- 主动意图、唤醒预算与反馈（2026-11-06）：`AgentIntention` 新增 `need`、`confidence`、`risk`、`feedback`、`feedbackAt`（迁移 `20261106070000_mind_proactive_goals_budget`）；`ChatMindSettings` 新增 `proactiveWakeDailyLimit`、`proactiveWakeMinGapSeconds` 并在面板可改。规划器可一次输出多条 `intentions`（关心/联系/分享/跟进/邀约/学习），按 seed 去重落库，到 `earliestAt` 才进入唤醒简报；到期意图按 `urgency × 把握 × 关系分 ×（1-风险）` 排序，关系分由好感/亲密/信任/亏欠加权，不引入“主人”角色。对话 `dialogue.close` 的 `nextOpening` 自动变成 6 小时后、14 天过期的 followup 意图。对方回应会按追问/帮忙/认真接话/只应一声/顺势收尾写回反馈并微调把握，12 小时无回应也会记一条；最近 7 天最多 3 条反馈进提示词。唤醒只提供机会，发消息仍必须 `engage + beats`；自发唤醒受每日上限与最小间隔约束，有到期待办时不占额度。
- 时间、说话习惯与重复自检（2026-11-06）：`time_zone` 先用 `normalizeTimeZone` 归一（`UTC+8（东八区）`/`GMT+8`/`北京时间` → `Asia/Shanghai`），再交给 `Intl`；【此刻】直接附带凌晨/清晨/上午/中午/下午/傍晚/晚上/深夜，避免模型自己把 16:56 说成半夜。角色卡的句子长短、标点、语气词、emoji/错别字等级、冲突风格、知识边界和出戏防线收进【说话习惯】；全局规则限制默认 1 个气泡、一条回复最多一个问句、被骂时短句顶回或冷处理、不主动提 AI/模型/程序、不懂就说不懂。新增纯函数 `readRepetition`，从最近 12 条自己的消息里统计反复出现的生活词（≥3 次）并在【重复自检】中提示换话题；活动提示阈值 4 小时→2 小时，空闲复核 2 小时→90 分钟。记忆去重增加“同 subject、跨 kind、相似度 ≥0.92”的合并，只对 FACT/PROMISE/PREFERENCE/BOUNDARY 生效，避免饭团/炒饭这类同一件事被写成多条。
- 运行轨迹实时与详情（2026-11-06）：`AgentRunSummary` 增加触发消息预览（`messagePreview`/`messageSender`）；`LlmPromptLog` 增加 `runId`（迁移 `20261106080000_llm_prompt_run_id`），规划器调用把所属 run 写进提示词日志。运行列表首屏常驻 3 秒轮询（后台也拉取）并按 `startedAt` 合并排序，新运行自动出现在顶部；单条详情在 `RUNNING` 时每 2 秒刷新、结束后每 6 秒补拉迟到的写回步骤，提示词日志在运行中每 3 秒刷新。详情抽屉依次展示：触发消息、判断（社交读/对话节奏/底线）、生成的提示词（System/Prompt/Response）、工具调用（入参/结果/错误）、Agent 回应（气泡与情绪/姿态）、动作执行（状态/消息 ID/错误）、进入心智的完整对话、其余执行步骤与入参/产出。
- 表情包描述式发言（2026-11-06）：提示词新增「只写说出口的话，不写动作/舞台旁白」，表情规则明确「表情是语气不是话题」，禁止在文字里点破或解说「这张图/这个表情/图里」、禁止「这图就是你/像你」，没有别的正文就只发表情；找不到合适表情不发、不用文字模拟。`sticker.search` / `sticker.describe` 的工具说明标注描述仅供挑选和确认，不得复述给用户。
- 图片消息进入提示词与轨迹（2026-11-06）：图片消息不再渲染成 `[空消息] [图片：…]`，有描述时直接 `[图片：描述]`，没描述但有图时 `[图片]`，避免模型把表情当成空消息。`AgentRun.scene` 快照开始保存每条消息的图片描述与图片数量，运行轨迹的「收到的消息 / 进入心智的对话」会显示模型实际看到的内容；运行列表预览也会用图片描述兜底。人格发表情时把表情库描述一并写入聊天媒体对象（不覆盖已有视觉描述），因此自己发出的表情在后续上下文里同样可读。
- 同人消息打断（2026-11-06）：消息回合按 `conversationId + senderId` 维护在途 `AbortController` 与串行闸门。同一人在同一个群或私聊里发来新消息时，立即中止旧回合的模型 HTTP 请求与气泡间等待，旧 `AgentRun` 记为 `SKIPPED` 并写入「被更新的消息打断」步骤；旧回合若已占用回复回避锁会释放。新消息等旧回合收尾后，从包含全部最新消息的场景重新规划；排在中间、已被更新消息取代的回合直接放弃，不再各自运行。不同发送者或不同会话不触发打断。发送阶段逐气泡检查取消，已经发出的气泡不回滚，未发出的标记 `SKIPPED`。
- 心跳日志与只读试跑（2026-11-06）：新增 `MindHeartbeatLog`（迁移 `20261106090000_mind_heartbeat_log`），每次心跳都留一条记录，包括没有进入模型的 `IDLE` / `GATED` / `LONG_EVENT` / `NO_CONVERSATION` / `REPLY_LOCK` / `DISABLED` / `FAILED`，最近 500 条/人格自动裁剪。`RUN` 记录 `outcome`、唤醒简报、计划摘要（姿态/情绪/气泡/记忆写入数/关系信号/待办/意图/长时事件/下次唤醒）、工具调用与动作执行；`GET /mind/heartbeats/:personaId` 支持 `limit`/`offset`。界面在「提示词日志」旁新增「心跳日志」，抽屉里可一键跳到对应运行轨迹。对话试跑是开发期脚本，不放进产品界面：`pnpm --filter @inkseek/api test:mind` 运行 `scripts/simulate-mind-dialogue.mjs`，读取真实人格、设置、状态、关系、记忆和最近 30 条聊天，按 `scripts/fixtures/mind-dialogue.txt`（每行一条用户消息）或 `--text` 依次调用规划模型，上一轮人格回复作为临时上下文带回下一轮；`--persona`/`--conversation` 可指定对象。试跑跳过 `AgentRun`/记忆/关系/待办/状态/消息/提示词日志写入，写入类工具（`memory.create`、`relationship.update`、`sticker.describe`、`sticker.collect`、`todo.create`、`intention.update`、`intention.cancel`、`self.attributes.update`）返回「已拦截」，`relationship.get`/`memory.search` 改走只读查询，召回不更新 `lastRecalledAt`；脚本结束前对比运行/提示词/记忆/消息/心跳/待办/意图计数，发现残留会以非零退出码报警。
- 余小满对话问题修复（2026-11-06）：按真实会话审计出的六类问题收口。(1) 规划协议失败：`parseJsonObject` 支持提取首个平衡 JSON、截断补全与 XML `<tool_call>` 信封（含名称为一个信封、参数为下一个信封的写法），DeepSeek 的 `<｜｜DSML｜｜ invoke>` / `<｜｜DSML｜｜ parameter>` 原生标记也按工具调用执行，`{"name","arguments"}` 同样支持；重试后仍无法解析时抛 `MindPlannerProtocolError`，运行轨迹写入 `TOOL`/`PLAN` 失败步骤而不是只留一条失败记录。(2) 意图路由：心跳先按到期意图定位会话，再过滤与本会话相关的意图；未完成意图按次数指数退避（2/4/6 小时）转 `DEFERRED`，扫描会同时过期 `PENDING`/`DEFERRED`；新意图按目标 + `seed` 相似度合并去重，已有显式草稿时不再重复生成 `nextOpening`。(3) 关系信号：提示词要求按这轮的实际变化写维度，示例补齐亲和/信任/亲密/吸引/敌意；关系数值不再按单轮、每日或冷却限幅，人格写入即生效（仅夹 -100..100），中性关系不再被「尊重/依赖」占位遮挡。(4) 记忆去重：24 小时内相似度 ≥0.82 即合并，超出窗口仍用 0.94；新内容重要度更高或同分更新时覆盖旧内容并重算向量、保留 `conversationId`。底色记忆改为「同 subject+kind 最多一条」的多样取样，只有相关记忆标记召回。(5) 边界重复：`readBoundaryEscalation` 从最近 16 条自己的消息识别反复拒绝短语，对方仍继续时只把「你已拒绝过 N 次、对方仍在继续」作为事实写进判断理由；不再规定冷处理或要求模型怎么做。(6) 仅被@才回：保留开关，但新增 10 分钟活动对话窗口 `activeExchange`（自己刚说完、同一人接着回且此前已有来往），窗口内视为对话延续可正常接话，主动唤醒也不受该开关限制；不在窗口内仍严格只回被 @/点名/被戳的消息。(7) 主动消息不设数量上限：删除每目标 8 条意图上限与每日主动额度 `dailyProactiveBudget`（迁移 `20261106100000_drop_daily_proactive_budget`）；主动唤醒发送不占用、也不受每日回复预算限制。`dailyMessageBudget` 只统计被动回复，`proactiveWakeDailyLimit` 只限制唤醒查看次数。
- 群聊记忆隔离（2026-11-07）：审计发现群聊提示词会带入私聊记忆——召回只按 `channelId` 过滤，长期底色无条件注入，相关召回也没有最低阈值，导致 OpenBMCLAPI 群的提示词里 15 条记忆全部来自和 𝓞𝓵𝓭𝓮𝓻𝓕𝓸𝔁 的私聊。现在自动召回按会话收口：群聊只带本群记忆 + 稳定的自我/世界/话题记忆，其他会话的私聊/场景记忆不进入；私聊只额外带当前对象的跨会话关系记忆。长期底色同样要过最低文本相关度，相关召回不足时显示「没有相关记忆」而不是硬凑；记忆统计头改为当前场景可见数量。群聊新增【在场熟人】：列出在别的会话里认识、目前在场的成员及其记忆条数，只给提示不给内容，要求模型需要细节时先用 `memory.search` / `relationship.get`，不要在群里复述私聊。
- 人格随时间改变（2026-11-07）：提示词明确人格不是冻结设定，性格、价值观、恐惧、长期目标、说话习惯、兴趣都会因经历变化。日常小波动仍走 `self.traits` 的漂移限幅；有明确触发的事件性变化用 `self.attributes.update` 一次改多项，幅度参考小感触 1-3 / 持续经历 3-8 / 重大事件 10-30 或反转，`reason` 必须写清触发。兴趣变化写新的 `PREFERENCE` 记忆说明变淡或反转，不删旧记录；名字、世界设定、绝对红线、全局硬限制作为身份锚点默认不动。`self.attributes.update` 写入卡片属性现在也写 `PersonaChangeLog`，可在「变动历史」看到。
- 意图生命周期（2026-11-07）：审计发现未结意图堆积（单联系人 40 条近似 followup，67 条未结，15 条永不过期），根因是模型看不到存量、没有修改/取消工具，且一次唤醒把整批意图都标成 `SENT`。现在所有规划轮次注入【未结意图】摘要（按人/群归并、最急 3 条带 id），`WakeBrief` 的每条待发意图也带 id；新增 `intention.list` / `intention.update` / `intention.cancel` 三个工具，允许模型查全量、合并重复、改目标/时间/评分、取消过时念头。`ActionPlan` 新增 `handledIntentionIds`，只有模型声明用到的意图才标 `SENT`，其余按 2/4/6 小时退避 `DEFERRED`；旧协议缺 id 时只认最急的一条。新建意图默认 14 天过期，遗留无过期时间的未结意图超过 30 天自动过期。
- 群聊语气与公开范围（2026-11-07）：群聊提示词把「语气」和「内容」拆开。好感、信任、亲密照常决定对每个人的态度，对恋人可以更软、更护短，对好朋友更随意，不因为人多就变生分；`disclosure_scope`（可公开范围）、对方隐私开关决定哪些私聊内容能当众说，`groupStance.audienceRisk` 只调整能说多深。群里称呼按 `how_i_address_here`（各场合称呼）选，没有公开称呼时才退到私下称呼并收着语气。【在场熟人】也改成「语气照常亲近、内容按公开范围」，不再要求按陌生人相处。这两条只注入群聊提示词。
- 表情库渠道隔离（2026-11-07）：`StickerAsset` 增加 `channelId` 并绑定 `ChatChannel`，唯一键从全局 `sha256` 改为 `(channelId, sha256)`，删除从未被使用的 `scope` 字段（迁移 `20261107120000_sticker_channel_scope`，存量 14 条归到当前唯一渠道）。`StickerService` 的 list/search/review/toDataUrl/descriptionOf/recordUsage 全部按 `channelId` 过滤，跨渠道 `id` 一律 404；`GET /mind/stickers/:channelId`、心智页表情库与规划工具（`sticker.search` / `describe` / `collect`）、动作执行器发送表情都带当前渠道，不同渠道的 Agent 互不可见。文件仍按内容哈希共用，可见性由数据库归属控制。
- 视频观看与缓存（2026-11-07）：新增 `video.watch` 与 `VideoInsight`（迁移 `20261107130000_video_insight`）。支持 bilibili.com/video/BV…、b23.tv 短链、BV 号与 av 号；读取 view 元数据、字幕、热门评论，12 分钟以内的视频走 playurl 720P MP4 + ffmpeg 均匀抽 9 帧拼成 3×3 图；更长的视频改用 `videoshot` 分镜图，避免下载整片。画面与文字一起交给视觉模型生成概述和要点，失败时退回纯文字总结。结果按 `(platform, videoId)` 缓存 14 天，重复调用直接返回，`focus` 只在已存画面上重看、不覆盖原概述；多 P 视频按 `BV…_pN` 分开缓存。QQ 分享卡片（json/xml 段）和视频段会从卡片内容里提取 B 站链接写进消息文本，人格看到链接后自行决定是否调用。试跑模式不下载、不写缓存。B 站 AI/自动字幕需要登录态：设置页保存 SESSDATA（存 `SystemConfig` 的 `video.bilibili`，标记 secret，保存前用 nav 接口校验 isLogin），观看时用 WBI 签名的 `player/wbi/v2` 优先取中文 CC，其次 `ai-zh` 自动字幕，未配置或失效时退回免登录的 `player/v2`。当前不做音频/歌词理解，字幕缺失时只能依赖画面与评论。
- 客服腔收口（2026-11-07）：真实私聊出现「复述对方的话 + 关心式追问 + 自我状态播报」三连（「你怎么这个点还醒着呀」「你才睡几个小时呀」「我这边还迷迷糊糊的 脑子没开机」）。提示词补三条：不要换个语气复述对方的话再抛回去；对方只是报告状态时不必追问，说自己的判断/反应/正在想的事；状态只影响语气和长度，不要当话术播报，顺从、怕冷落不等于照顾对话。第二条气泡必须是补充/更正/情绪没说完且有新信息，不能重复同一层意思或补状态。兴趣匹配移除「正在做」「在：」两个来源，自己的活动/位置只作处境，不再让「刚醒」被算成相关话题并诱导自我播报。试跑确认反问消失、回复变成有内容的短句。
- 意图去重与偏执（2026-11-07）：真实数据出现 8 条同一对象、同一 need、10 分钟内创建的「天亮看照片 / 欠一个亲」意图，模型每轮都把同一件事换个说法再建一条。旧去重只在 seed 二元组 Jaccard ≥0.55 时合并，中文改写句全部漏过。现在增加 containment（短 seed 是否大部分出现在长 seed 里）≥0.3 也视为重复，合并后保留更长的 seed；【未结意图】每个目标展开数从 3 提到 5，超出时提示「另有 N 条未展开」。提示词明确意图不是提醒/待办，同一件事、同一个梗只留一条，新细节用 `intention.update` 并进原条，已经说出口的玩笑让它过去。实测 8 条真实 seed 单遍合并后只剩 1 条，互不相关的话题不合并。

- 手机控制（2026-11-07）：新增 `PhoneService`（adb 网关）与设置页「手机控制」卡片。后端自动发现 `ADB_PATH` / `ANDROID_HOME` / `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` / PATH 上的 adb，只保留无线设备（`adb devices -l` 中 serial 为 `IP:端口` 或 `._adb-tls-connect._tcp` 的项，USB 设备与本地模拟器不显示也不能选）；支持无线 `adb connect`、Android 11+ `adb pair` 和断开。设备选择按渠道隔离，存在 `ChatMindSettings.phoneDevice`（迁移 `20261107140000_mind_phone_device`），在渠道人格面板 → 心智设置 → 手机设备里从当前在线的无线设备中选择；旧全局 `SystemConfig` 的 `phone.device` 已删除。Agent 新增 `phone.screen`（uiautomator 结构树转成紧凑文字，含可点坐标）和 `phone.act`（tap/swipe/key/type/open），按当前会话渠道解析设备，提示词要求「先看、再操作、再看一次」；试跑模式禁止读取或操作真机。`type` 仅支持 ASCII（`input text` 的限制），中文需用手机输入法；iOS 不在此实现内。已在 Pixel Tablet 模拟器上实测读界面、Home、打开设置、点搜索框和输入文本。
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
