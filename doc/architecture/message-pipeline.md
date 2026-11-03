# 消息处理管线

消息管线把每条落库消息交给一张可编辑的 DAG：节点是处理逻辑卡片，端口决定数据能否连接，连线决定执行顺序与分支。图定义持久化在 `ChatPipelineGraph`，运行时按保存的图执行，并把每个节点的轨迹写入 `ChatPipelineRun` / `ChatPipelineNodeRun`。

## 数据流

1. NapCat 消息经渠道运行时入库（`ChatMessageRecord`），随后调用 `ChatMessageProcessor`。
2. `ChatPipelineRunner` 从 `PipelineGraphService` 取当前图，按拓扑顺序逐节点执行。
3. 每个节点从**已激活的入边**按端口收集输入，结合消息快照与上游输出执行，返回 `{ outputs, effects }`；输出以节点 id 为命名空间，effects 由运行器在节点成功后统一提交。
4. 节点开始执行时写入 `RUNNING` 轨迹，结束时更新为最终状态；整次运行结束时汇总整体状态、耗时、最终变量快照与错误。被跳过、取消的节点同样留痕。
5. 消息输出节点若开启发送，会把汇总文本与图片作为 `reply` effect 交给运行器，再由 `ChatService.sendMessage` 发回来源会话；图片引用在发送前转成 data URL。自己发出的消息不再触发管线。
6. `/pipeline` 画布读取图与运行记录：卡片可拖放编排，最近一次运行的状态会叠加到卡片和连线上。

## 端口与类型

每条输入的输出字段、每个节点的输入端口都带类型，共六种：

| 类型 | 说明 |
| --- | --- |
| `text` | 字符串（消息正文、模板结果等） |
| `number` | 数值（长度、计数） |
| `boolean` | 布尔（是否命中） |
| `json` | 结构化值（捕获组等） |
| `image` | 图片引用（落盘媒体地址、data URL 或远程地址），消息输出负责转成可发送的图片 |
| `any` | 任意类型，仅比较类节点使用 |

兼容规则见共享包 `canConnectPipelineKinds`：两侧类型相同，或任一侧为 `any` 时才可连线。因此布尔输出不能接文本端口，文本也不能接数字端口。保存时服务端再次校验（`assertTypedGraph`），前端在拖拽时即给出提示。

输入端口还有两个修饰：

| 修饰 | 含义 |
| --- | --- |
| `optional` | 允许没有激活入边；`join = all` 时缺失不会阻塞节点 |
| `multiple` | 接受多根连线，输入值为按连线顺序排列的数组 |

## 图模型

| 概念 | 说明 |
| --- | --- |
| 节点 | `id`（1–48 字符，`A-Za-z0-9_-`）、`type`（节点注册表类型）、`config`、`join`、`position` |
| 连线 | `from` + `fromPort` → `to` + `toPort`，可带条件 `{ field, equals }` |
| 节点位置 | `position` 仅用于画布布局，不参与版本指纹 |
| `join` | `all`（默认）要求所有入边都激活且必填端口有值；`any` 只要一条入边激活就执行 |
| 连线条件 | 只有来源节点成功且其输出 `field` 深等于 `equals` 时连线才激活；`field` 可以与传输端口不同（例如用 `matched` 判断、用 `text` 传递正文） |
| 版本 | 结构或配置变化时 `version + 1`；仅拖动卡片不升版本 |
| 写版本 | `revision` 每次保存成功 `+ 1`（包括只拖动卡片）；客户端保存时必须带 `expectedRevision` |
| 图 schema | `schemaVersion` 标记存储图的契约版本，用于启动时的一次性迁移 |

执行语义：

- 拓扑排序（Kahn）后严格逐节点执行；带环的图无法保存，也无法运行。等待类卡片会让同一次运行中排在它后面的分支一起推迟。
- 零输入节点（仅系统消息输入）无条件执行；其余节点必须有激活入边，否则记为 `SKIPPED`，其出边不会激活下游。
- 注释卡片（`note.text`）只属于画布：运行器在拓扑序里直接跳过，不写节点轨迹、不参与整体状态；它也没有端口，无法连线。
- 节点开始时先写一行 `RUNNING` 轨迹，结束时原地更新为最终状态，因此等待中的节点也能在运行记录里看到。
- 节点抛错只标记该节点 `FAILED`，不中断整张图：依赖它的下游因入边未激活而 `SKIPPED`，其他分支继续执行；运行整体记为 `FAILED` 并汇总各节点错误。
- 进程重启会中断正在运行的图：遗留的 `RUNNING` 运行在启动时改标 `INTERRUPTED`，其 `RUNNING` 节点改标 `CANCELLED`。运行被取消时，未执行到的节点同样写 `CANCELLED` 轨迹。
- 被跳过、取消的节点同样写入轨迹，因此分支结果无需回读图定义即可观察。

节点与外围组件的边界：卡片只做纯计算并返回 `{ outputs, effects }`，不直接调用消息服务。运行器在节点成功后统一提交 `effects`（当前只有「发送回复」），失败或被取消的节点不会留下半发送的副作用。

保存时的额外约束：

- 系统节点（`message.input`、`message.output`）必须且只能各有一张。
- 消息输出是终点，不能作为连线来源。
- 连线必须指向节点声明的端口，且类型兼容。
- 同一端口只接受一根连线，`multiple` 端口除外；同一对端口不能重复连线。
- 条件字段必须是来源节点的输出之一。

## 系统卡片

消息输入与消息输出不可删除、不可新增，固定存在于每张图中。

### `message.input` 消息输入

无输入、无配置。消息字段不再逐个拆成端口，而是收敛为一个**消息对象**，经 `object.get` 按需取值；正文与图片保留快捷端口，避免最简单的复读也要先插一张取值卡：

| 输出 | 类型 | 含义 |
| --- | --- | --- |
| `message` | json | 完整消息对象（见下表），配合「消息对象取值」读取任意字段 |
| `text` | text | 消息正文 |
| `images` | image | 按消息顺序排列的图片引用，可直接接入消息输出 |

消息对象结构：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` / `externalId` | string / string \| null | 本地消息 id / 渠道消息 id |
| `channelId` / `conversationId` | string | 渠道与会话 id |
| `conversationKind` | `GROUP` \| `PRIVATE` | 会话类型 |
| `conversationExternalId` | string | 来源群号（群聊）或对方 QQ 号（私聊）；没有可用来源时为空串 |
| `isSelf` | boolean | 是否自己发出（自己发出的消息不会触发管线） |
| `sender` | `{ id, name }` | 发送者 ID 与昵称 |
| `text` | string | 消息正文 |
| `kind` | string | 消息类型（TEXT / IMAGE / FORWARD 等） |
| `hasQuote` | boolean | 是否带引用 |
| `quote` | 对象 \| null | 引用快照：`messageId`、`externalId`、`author`（`{ id, name }`）、`text`、`kind`、`sentAt`、`images`（引用图片引用）、`imageCount` |
| `images` | string[] | 消息图片引用 |
| `imageCount` | number | 图片数量 |
| `voices` | 对象[] | 语音段，按消息顺序：`url`、`position`、`duration`（秒，可为 null）、`transcript`（NapCat 转写，可为 null）、`mimeType`、`byteSize` |
| `voiceCount` | number | 语音数量 |
| `isForward` | boolean | 是否合并转发 |
| `sentAt` | string（ISO） | 发送时间 |

含语音的消息会先等待转写完成再运行管线，因此 `voices[].transcript` 在运行期间通常已有值；静音、过短或转写失败时仍为 null。纯文本与图片消息不受影响，不产生额外等待。

### `object.get` 消息对象取值

`category = data`。输入 `value`（json），配置 `path` 为点号路径：

| 输出 | 类型 | 含义 |
| --- | --- | --- |
| `value` | any | 路径对应的原始值；不存在时为 `null` |
| `text` | text | 字符串原样输出，其它值转成 JSON 文本 |
| `found` | boolean | 值存在且不为 null，可直接用作连线条件 |

配置字段 `path` 在卡片和检查器里都是下拉菜单，选项覆盖：`sender.name`、`sender.id`、`kind`、`isForward`、`imageCount`、`voices`、`voices.0.transcript`、`voices.0.url`、`voices.0.duration`、`voiceCount`；引用相关：`quote`（配合 `found` 判断有无引用）、`quote.author.name`、`quote.author.id`、`quote.text`、`quote.images`、`quote.images.0`、`quote.imageCount`；以及整个消息对象（空路径）。历史图里的自定义路径会以「自定义」选项保留。

### `message.output` 消息输出

| 输入 | 类型 | 说明 |
| --- | --- | --- |
| `text` | text（可选） | 最终回复正文 |
| `images` | image（可选） | 回复图片引用，最多 4 张 |

配置 `enabled`（默认 `false`）：关闭时只计算并记录回复内容，不调用 NapCat，适合先演练。开启后先检查内容：文本 trim 后超过 4000 字符、或图片超过 4 张都记为失败；文本与图片至少有一项非空，否则节点直接返回 `sent = false` 而不视为错误。发送前 `ChatPipelineRunner` 用 `ChatMediaService.toDataUrl` 把每个引用转成 data URL（支持落盘媒体地址、data URL 和 http(s) 远程地址，单个文件受 64 MB 与 12,000,000 字符的 data URL 上限约束），再调用 `ChatService.sendMessage`；转换或发送失败同样使节点与运行标记为失败。

| 输出 | 类型 | 含义 |
| --- | --- | --- |
| `sent` | boolean | 是否真的调用发送 |
| `length` | number | 回复文本字符数 |
| `imageCount` | number | 回复图片数量 |

## 引用语法

节点配置里的字符串支持以下取值：

| 写法 | 含义 |
| --- | --- |
| `$节点.字段` | 整个配置项替换为该值，类型保持原样，例如 `$get_sender.value` |
| `{{节点.字段}}` | 在模板字符串中插值为文本，例如 `{{input.object.sender.name}} 说：{{input.text}}` |
| `input.*` | 读取当前节点已接线的输入端口；`multiple` 端口是数组。模板文本的 `object` 输入可用 `{{input.object.sender.name}}` 直接取消息对象字段 |
| `message.*` | 直接读取原始消息快照，字段同 `message.input` 的 `PipelineMessage` |
| `$vars.名称` / `{{vars.名称}}` | 读取管线变量的当前值；变量名支持任意语言的字母、数字、下划线和连字符 |

管线变量在画布右侧声明，名称本身就是后端使用的 id，可以随意使用中文等任意语言，不需要额外的英文标识。

`message` 暴露的字段：`messageId`、`channelId`、`conversationId`、`conversationKind`、`conversationExternalId`（群号或对方 QQ 号）、`externalId`、`isSelf`、`senderId`、`senderName`、`text`、`kind`、`quote`（`{ authorName, text, images } | null`）、`images`、`imageCount`、`voices`（`{ url, position, duration, transcript, mimeType, byteSize }[]`）、`voiceCount`、`sentAt`。

## 节点目录

每个节点的端口与配置定义在 `apps/api/src/chat/pipeline/pipeline-nodes.ts`，随目录接口一起下发给前端：卡片、检查器、右上角「节点文档」抽屉均读取同一份数据。

### 数据（data）

| 类型 | 输入 | 输出 | 配置 |
| --- | --- | --- | --- |
| `object.get` 消息对象取值 | `value`（json） | `value`（any）、`text`（text）、`found`（boolean） | `path` 下拉选择（发送者昵称/ID、正文、类型、来源群号/QQ 号、引用作者/正文/图片、计数、时间、整个对象等），默认 `sender.name`；卡片与检查器都可直接切换 |

### 文本（text）

| 类型 | 输入 | 输出 | 配置 |
| --- | --- | --- | --- |
| `text.constant` 固定文本 | 无 | `text` 固定文本（text） | `text`，支持 `{{vars.名称}}`、`{{message.text}}` 等模板引用；没有输入端口，无需上游激活，每次运行都会执行 |
| `text.template` 模板文本 | `text`（text，可选）、`object`（json，可选） | `text` 拼出的文本（text） | `template`，默认 `收到：{{input.text}}`；接入 `object` 后可用 `{{input.object.sender.name}}` |
| `text.transform` 文本整形 | `text`（text） | `text` 处理后的文本（text） | `mode`（trim/collapse/upper/lower/prefix/suffix）、`argument` |
| `text.regex` 正则提取 | `text`（text） | `matched`（boolean）、`match`（text）、`groups`（json）、`text` 原文本（text） | `pattern`、`flags`（仅 `imsu`） |
| `text.join` 文本汇合 | `values`（text，`multiple`） | `text` 首个非空值（text）、`picked` 命中序号（number） | 无；默认 `join = any` |

### 逻辑（logic）

| 类型 | 输入 | 输出 | 配置 |
| --- | --- | --- | --- |
| `logic.contains` 包含判断 | `text`（text） | `matched`（boolean）、`text` 原文本（text） | `value`、`caseSensitive` |
| `logic.compare` 值比较 | `left`（any）、`right`（any，可选） | `matched`（boolean）、`left` / `right` 实际值（any） | `operator`（eq/neq/gt/gte/lt/lte/contains/notContains）、`left` / `right` 未连线时的引用 |
| `logic.whitelist` 来源过滤 | `message`（json） | `matched`（boolean）、`value` 原消息对象（any）、`conversationKind`（text）、`conversationExternalId`（text） | `mode`（off/whitelist/blacklist）、`groupWhitelist` 群号名单、`privateWhitelist` QQ 号名单（各自换行、逗号或空格分隔） |

「来源过滤」只接受消息对象输入：把「消息输入」的 `message` 端口接到它的 `message` 输入，卡片从这里读取 `conversationKind` 与 `conversationExternalId`，不再另读运行时的会话记录。群号和 QQ 号分两列：群聊只比对 `groupWhitelist`，私聊只比对 `privateWhitelist`（即 `conversationExternalId`，和聊天列表里看到的号码一致，不是数据库内部会话 ID），所以即使某个群号恰好和某个 QQ 号相同，也不会把另一类来源误放行。

`mode` 是三态开关：`off` 全部放行；`whitelist` 只放行名单内的来源，名单为空时该类来源全部不放行；`blacklist` 拦截名单内的来源，名单为空时不拦截任何来源。卡片不再有独立的来源类型过滤，只按名单判定。把出线的条件设为 `matched = true`，下游就只会在放行的会话上执行。试跑面板可以指定来源类型（私聊 / 群聊）和来源群号 / QQ 号，用来验证名单是否命中；留空表示没有来源账号，白名单不会命中，黑名单不会拦截。

旧版单一 `whitelist` 会在启动迁移时按原 `source` 拆进对应列（`any` 写入两列）并记录警告；旧配置没有 `mode` 时，两列都为空迁移为 `off`，否则迁移为 `whitelist`（非空旧图的空列会提示该类来源不再放行）；旧的 `source` 配置会被删除；旧的 `value` 输入端连线也会自动改接到 `message`。

### 流程（flow）

| 类型 | 输入 | 输出 | 配置 |
| --- | --- | --- | --- |
| `flow.delay` 延时等待 | `value`（any） | `value` 原样透传（any）、`delayedAt` 完成时间（text）、`waitedMs` 实际等待毫秒（number） | `delayMs`，范围 0–60000，默认 3000；保存时校验 |

延时卡片由运行器提供 `wait(ms)`：等待计入该节点与整次运行的耗时，进程重启或运行取消时等待会立即中止并记为 `CANCELLED`。因为运行是逐节点串行的，延时也会推迟同一次运行中排在它后面的所有分支。

### 注释（note）

| 类型 | 输入 | 输出 | 配置 |
| --- | --- | --- | --- |
| `note.text` 文字描述 | 无 | 无 | `text`：多行说明文字（≤ 4000 字符）；双击卡片直接编辑，或选中后在检查器修改 |

注释卡片是纯布局卡片：`layout: true`，运行器跳过且不写轨迹，保存校验不要求系统卡片外的最小连线；因为没有端口，任何指向它的连线都会在保存时被拒绝。它最适合标注分支用途、临时备忘或记录调参结论。

## 默认图

默认图 `default-message-graph` 只保留最简复读链路：

```
input.text   ──► output.text      （message.output.enabled = false）
input.images ──► output.images
```

- 两条线即可把消息正文与图片原样送到消息输出，不经过任何模型或处理节点。
- 默认关闭发送，避免重置或种子写入时向线上会话发消息。
- 需要复杂流程时，在中间插入 `text.*` / `logic.*` 节点；分支最终用 `text.join`（`multiple` 输入 + `join = any`）汇合，再接入 `message.output`。

带分支的示例：

```
input.text ──► contains ──(matched = true)──► template ──┐
                    └─(matched = false)──────────────────┴─► join (any) ──► output
```

## 画布与接口

- 页面：`/pipeline`，画布可平移、缩放、适应；卡片可拖动，从右侧输出端口拖到目标输入端口或卡片即连线。
- 连线时按类型高亮兼容端口、淡化不兼容端口；成环、类型不匹配、重复连线、占用中的单线端口会被拒绝并提示。
- 检查器：编辑节点配置与 `join`、连线条件（字段下拉 + 布尔/数字/文本/JSON 类型的期望值）；系统卡片显示锁定说明，不提供删除。
- 自动保存：编辑后 900ms 防抖写入，右上角显示保存状态与版本；保存请求携带 `expectedRevision`，同一时刻只跑一轮保存循环。
- 保存冲突：另一个窗口先保存时接口返回 409，当前页停止自动重试并显示「载入最新版本（放弃本地修改）」，避免用旧图覆盖别人的修改。
- 降级展示：存储中的图无法解析时，接口返回内置默认图并带 `degraded` 原因，页面顶部提示，但**不会写回**坏数据。
- 接口：`GET /api/v1/pipeline/graph`、`PUT /api/v1/pipeline/graph`、`POST /api/v1/pipeline/graph/reset`、`GET /api/v1/pipeline/runs`、`GET /api/v1/pipeline/runs/:id`。

## 存储

| 表 | 内容 |
| --- | --- |
| `ChatPipelineGraph` | 单行可编辑图：`id`、`name`、`version`、`revision`、`schemaVersion`、`nodes`（JSON）、`edges`（JSON）、`updatedAt` |
| `ChatPipelineRun` | 一次运行：`graphId`、`graphVersion`、状态（`RUNNING` / `SUCCEEDED` / `FAILED` / `INTERRUPTED`）、渠道/会话/消息、起止时间、耗时、错误、`variables` 最终快照 |
| `ChatPipelineNodeRun` | 节点轨迹：`nodeId`、`nodeType`、`nodeVersion`、状态（`RUNNING` / `SUCCEEDED` / `SKIPPED` / `FAILED` / `CANCELLED`）、起止时间、耗时、`input`（配置、`join`、端口输入）、`output`、错误 |

图的读取在进程内缓存，保存与重置会失效缓存，因此每条消息不会重复查询图定义。读取路径只解析与校验，**从不写库**：图 JSON 解析失败或校验不通过时，接口在内存中回退到默认图并标记 `degraded`，坏数据保留在原地等待修复。旧端口迁移、节点版本补齐等一次性迁移只在服务启动时执行。

### 旧端口迁移

`message.input` 曾把发送者、引用、计数等字段逐个暴露为端口（`sender`、`senderId`、`kind`、`hasQuote`、`quoteAuthor`、`quoteText`、`imageCount`、`voiceCount`、`isForward`）。服务启动时若发现这些旧端口仍被连线，会在校验前自动迁移：为每个被使用的旧端口生成一张 `object.get` 卡片（`get_<端口名>`，路径见下表），补上 `message → value` 的数据连线，把原连线改接到它的 `value` / `found` 输出，并把同端口上的连线条件字段一并改写；迁移结果写回数据库并升一个版本，进程内日志会记录。读取图的请求不再触发任何写库。

| 旧端口 | 新路径 | 输出 |
| --- | --- | --- |
| `sender` | `sender.name` | `value` |
| `senderId` | `sender.id` | `value` |
| `kind` | `kind` | `value` |
| `hasQuote` | `quote` | `found` |
| `quoteAuthor` | `quote.author.name` | `value` |
| `quoteText` | `quote.text` | `value` |
| `imageCount` | `imageCount` | `value` |
| `voiceCount` | `voiceCount` | `value` |
| `isForward` | `isForward` | `value` |

条件字段与传输端口不一致的旧连线（例如传 `text` 却按 `hasQuote` 判断）无法用单一取值卡表达，迁移时会移除并在日志中提示，需要手动重建分支。

## 新增节点

1. 在 `pipeline-nodes.ts` 定义 `type`、`label`、`category`、`description`、`defaultConfig`、`fields`、`inputs`、`outputs`、`run`；需要锁定卡片时加 `system: true`，只做画布注释时加 `layout: true`（运行器会跳过）。
2. 输入端口声明 `kind`，按需加 `optional` / `multiple`；输出键需与 `run` 返回对象的键一致。
3. 注册后目录接口自动带出新节点，画布「添加节点」、检查器与节点文档抽屉无需改动；保存时自动参与类型校验。
