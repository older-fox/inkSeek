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
- 事件分支与数据源分开：系统卡片（`message.input`）产生的入边是**事件**，没有输入端口的普通卡片（固定文本、固定内容、人格读取等）是**数据源**。数据源不会在每条消息到达时立即执行，而是先挂起，等到某个被激活的下游节点真正需要它时才按需执行；只接了数据源的中间节点同样挂起，直到被下游拉取。`alwaysRun` 卡片（如「读取变量」）不受影响，仍按原规则每轮执行。
- 节点只要含有至少一条事件入边，就按 `join` 判断是否被激活；未激活的节点记为 `SKIPPED`，其背后的数据源保持挂起。只有数据入边、没有事件入边的节点（包括没有出边的终点）一律保持挂起，即使它的数据源可以执行也不会自己跑，因此纯数据图不会凭空发送。
- 整轮都没有被拉取的数据源记为 `SKIPPED`（此时写出边不会激活下游）；运行被取消时记为 `CANCELLED`。
- 其余节点必须有激活入边，否则记为 `SKIPPED`，其出边不会激活下游。
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

每个节点的端口与配置定义在 `apps/api/src/chat/pipeline/pipeline-nodes.ts`，随目录接口一起下发给前端：卡片、检查器与每张卡右上角的「?」帮助弹窗均读取同一份数据。帮助内容来自节点目录的 `description`、端口、配置字段，以及可选的 `help` 字段（补充说明与 key 列表）；顶栏不再提供全局节点文档入口。

### 数据（data）

| 类型 | 输入 | 输出 | 配置 |
| --- | --- | --- | --- |
| `object.get` 消息对象取值 | `value`（json） | `value`（any）、`text`（text）、`found`（boolean） | `path` 下拉选择（发送者昵称/ID、正文、类型、来源群号/QQ 号、引用作者/正文/图片、计数、时间、整个对象等），默认 `sender.name`；卡片与检查器都可直接切换 |
| `persona.call` 人格调用 | 无 | `text` 填充后的文本（text） | `template` 人格文本，用 `{name}`、`{age}`、`{appearance}` 等占位符自动填入人格参数；卡面直接显示多行编辑框，检查器里也有同一字段 |
| `persona.group` 群聊人格 | 无 | `text` 填充后的文本（text）、`found` 是否存在（boolean） | `variable` 会话变量（保存群号）、`template` 人格文本，用 `{group_persona}`、`{topic}`、`{scene_rules}` 等占位符填入该群人格属性；卡面直接显示多行编辑框 |
| `persona.private` 私聊人格 | 无 | `value` 属性原始值（any）、`text` 文本形式（text）、`found` 是否存在（boolean） | `variable` 会话变量（保存 QQ 号）、`field` 读取属性（整个快照或单项） |
| `chat.history` 聊天记录 | 无 | `text` 聊天记录文本（text）、`messages` 历史消息（json）、`count` 条数（number） | `variable` 暂存消息对象的管线变量、`limit` 拉取条数（1–200，默认 20） |
| `message.received` 接收消息 | 无 | `message` 消息对象（json） | `variable` 暂存消息对象的管线变量 |
| `message.sender-id` 发送人ID | 无 | `senderId` 发送人 ID（text） | `variable` 暂存消息对象的管线变量 |

「群聊人格」按管线变量里的群号读取该群的人格快照，再用模板占位符输出：先用「写入变量」把消息对象的 `conversationExternalId`（群号）写进变量，再在卡片上选择该变量。模板里的 `{参数名}` 会替换成对应属性（参数名与群聊人格面板一致，可用 `?` 帮助查看完整列表），未列出的名称保持原样，属性为空时替换为空字符串。变量为空、未选择变量或找不到记录时输出 `text = ''`、`found = false`；有记录时 `found = true`，与模板内容是否为空无关。不会依据当前消息的 `conversationKind` 自动切换，也不会在群/私聊之间回退，只读本渠道内已保存的人格记录。旧版按单项/整个快照读取的群聊人格卡会在启动迁移时转成模板：选中单项的模板为 `{原属性}`，整个快照的模板为按中文字段名逐行的 `字段名：{key}`，原来的 `value` 连线改接 `text` 并记录警告。

「私聊人格」只按管线变量里的 QQ 号读取：变量为空、未选择变量、找不到记录或所选属性为空时输出 `value = null`、`text = ''`、`found = false`，同样不会依据当前消息的 `conversationKind` 自动切换，也不会在群/私聊之间回退。整个快照按中文字段名逐行输出，只读本渠道内已保存的人格记录。

「人格调用」读取的是**本次运行绑定的那张人格卡**：渠道运行与渠道作用域调试取渠道当前绑定的人格卡，人格作用域调试取该人格卡，全局作用域调试没有绑定人格。文本里的 `{参数名}` 会被替换成对应值，参数名与渠道人格快照完全一致（`buildChannelPersonaSnapshot` 产出的归一化 `values`，如 `name`、`age`、`appearance`、`language_style`），例如 `你将扮演{name}，年龄{age}。`。未绑定人格或参数为空时替换为空字符串，不认识的花括号保持原样。`{time_awareness}` 是例外：人格卡开启「时间感知」时替换成当前日期时间（按卡里的 `time_zone` 换算，`UTC+8`、`东八区`、IANA 名称均可识别，识别不了就用服务器本地时间，格式 `2026-11-04 14:36（周三）`），关闭时替换成「你无法感知时间」。该卡片没有输入端口，属于数据源卡：只有下游被激活并真正需要它的文本时才执行。点击卡片右上角的「?」会打开该卡片的帮助弹窗，除简要说明外，按基础、外形、设定、内在、表达、称呼、破面、亲密、数值、卡片分组列出全部可用参数 key。执行时读取一次最新人格卡，因此人格中心的修改会从下一条消息起生效，不需要重新接入渠道。旧版「获取人格参数」卡片会在启动迁移时转成 `persona.call`，模板为 `{原参数名}`，原来的 `text` / `value` 连线改接 `text`，`found` 输出的连线与条件会被移除并记录警告。

「聊天记录」从管线变量里读取暂存的消息对象：先用「写入变量」把「消息输入」的 `message` 端口写进一个管线变量，再在卡片上选择该变量。卡片用消息对象里的 `conversationId` 定位会话，只取 `sentAt` 早于当前消息、同一会话的记录，按时间从早到晚拼接为 `[YYYY-MM-DD HH:mm] 发送者：内容`；当前消息本身不会重复出现，可用记录不足时取全部。图片只有在 `ChatMediaObject` 已有描述时才以 `[图片] 描述` 出现，没有描述的图片直接忽略；语音优先使用转写，没有转写时输出 `[语音]`。`messages` 输出结构化的历史消息（发送者、正文、图片与描述、语音与转写），`count` 是实际条数。变量为空、变量里不是消息对象或定位不到会话时输出空文本、空数组和 0；调试运行没有真实会话，同样为空。卡片没有输入端口，属于数据源：只有下游被激活并需要它时才查询数据库。

「接收消息」和「发送人ID」同样是数据源卡，都从管线变量里读取暂存的消息对象：先用「写入变量」把「消息输入」的 `message` 端口写进一个管线变量，再在卡上选择该变量。前者输出完整的 `message` 消息对象（变量为空或值不是对象时为 `null`），后者取 `sender.id` 输出文本，取不到时为空字符串；变量里直接存的是 ID 文本或数字时原样输出。两张卡都没有输入端口，只有下游被激活并需要它们时才执行。

### AI（ai）

| 类型 | 输入 | 输出 | 配置 |
| --- | --- | --- | --- |
| `ai.chat` AI 对话 | `text` 提示词（text，必填）、`system` 系统提示词（text，可选） | `reply` 回复文本（text）、`text` 模型原文（text）、`action` 指令动作（text）、`args` 指令参数（json）、`json` 完整信封（json）、`parsed` 解析成功（boolean）、`model` 实际模型（text）、`latencyMs` 耗时（number） | `format`（text/json）、`temperature`、`maxTokens`、`providerId` / `model`（留空用默认提供商与首个模型）；提示词与系统提示词只来自输入端口，卡片上没有任何文本配置框 |
| `ai.compress` 提示词压缩 | `text` 详细提示词（text，必填） | `text` 压缩提示词（text）、`cached` 命中缓存（boolean）、`model` 实际模型（text） | `instruction` 压缩指令（text，可改，留空用内置默认）、`providerId` / `model`（留空用默认提供商与首个模型）、`ttlSeconds` 缓存 TTL（60–2592000 秒，默认 86400） |

AI 卡是「AI 出指令、卡片干活」的执行端：

- 「提示词」端口必接：接进来的文本原样作为提示词发给模型；没接线或文本为空时该卡被跳过/失败。想拼接多段内容，先经过「拼接文本」「模板」等卡片生成一段文本再接进来。
- 「系统提示词」端口可选：接进来时作为 system 角色内容，不接时只发送提示词。
- `format = text`：原样输出模型文本，`reply` 与 `text` 相同，`parsed` 为 false。
- `format = json`：系统提示里追加固定格式要求，模型应输出 `{"action":"...","args":{...},"reply":"..."}`。解析成功时 `action`、`args`、`reply` 分别取自对应字段；解析失败（包括带 Markdown 代码块、前后有解释文字等）时 `parsed = false`、`action` 为空、`args = null`，`reply` 回退为模型原文，保证下游始终有一份可读文本。
- 用「包含判断」或「值比较」比对 `action`，把每条分支接到对应的能力卡（人格读取、图片描述、变量读取等），能力卡结果再接到下一张 AI 对话生成最终回复，最后由「消息输出」发送。循环必须封装在卡片内部，图本身仍是 DAG，不允许连线成环。
- `providerId` / `model` 与图片描述卡一样从设置里的模型提供商取选项；调试运行同样会真实调用模型，但不会提交回复等副作用。
- 提示词压缩只在缓存未命中时调用模型：缓存 key 由「详细提示词 + 压缩指令 + 提供商 + 模型」计算 SHA-256，写入设置中配置的 Redis，键名前缀 `inkseek:pipeline:prompt-compress:v1:`。TTL 到期或键不存在时重新生成；命中时 `cached = true`，不再调用模型。修改提示词、压缩指令或切换模型会落到新 key。Redis 未配置或连接失败时自动跳过缓存、每次重新生成，卡仍正常工作。
- 压缩指令就是这张卡自己的系统提示词，可在卡面或检查器里改，留空时回退内置默认指令。默认指令保留全部事实、约束、字段名、输出格式、语气与安全要求，只删除重复、客套与冗余表述，不新增原文没有的内容。

### 文本（text）

| 类型 | 输入 | 输出 | 配置 |
| --- | --- | --- | --- |
| `text.constant` 固定文本 | 无 | `text` 固定文本（text） | `text`，支持 `{{vars.名称}}`、`{{message.text}}` 等模板引用；没有输入端口，属于数据源：下游被激活并需要它时才执行，孤立时记为 `SKIPPED`；卡面直接显示多行编辑框，可就地修改，检查器里也有同一字段 |
| `text.template` 模板文本 | `text`（text，可选）、`object`（json，可选） | `text` 拼出的文本（text） | `template`，默认 `收到：{{input.text}}`；接入 `object` 后可用 `{{input.object.sender.name}}` |
| `text.transform` 文本整形 | `text`（text） | `text` 处理后的文本（text） | `mode`（trim/collapse/upper/lower/prefix/suffix）、`argument` |
| `text.regex` 正则提取 | `text`（text） | `matched`（boolean）、`match`（text）、`groups`（json）、`text` 原文本（text） | `pattern`、`flags`（仅 `imsu`） |
| `text.join` 文本汇合 | `values`（text，`multiple`） | `text` 首个非空值（text）、`picked` 命中序号（number） | 无；默认 `join = any` |

### 逻辑（logic）

| 类型 | 输入 | 输出 | 配置 |
| --- | --- | --- | --- |
| `logic.contains` 包含判断 | `text`（text） | `matched`（boolean）、`text` 原文本（text） | `value`、`caseSensitive` |
| `logic.compare` 值比较 | `left`（any）、`right`（any，可选） | `matched`（boolean）、`left` / `right` 实际值（any） | `operator`（eq/neq/gt/gte/lt/lte/contains/notContains）、`left` / `right` 未连线时的引用 |
| `logic.calc` 逻辑计算 | 动态输入端口（any，可选）：默认 `a` / `b` / `c`，卡面「＋ 添加输入」可继续追加，每行末尾的 `×` 可删除该输入 | `value` 计算结果（any）、`text` 文本形式（text） | `mode`（number/append/math）、`operator`（add/subtract/multiply/divide/modulo/power，仅数字计算）、`left` / `right` 未连线时的取值（仅数字计算）、`separatorMode`（newline/custom，仅文本追加）、`separator` 自定义分隔符、`expression` Math 表达式（仅 Math 计算） |
| `logic.whitelist` 来源过滤 | `message`（json） | `value` 原消息对象（any，仅放行时输出） | `mode`（off/whitelist/blacklist）、`groupWhitelist` 群号名单、`privateWhitelist` QQ 号名单（各自换行、逗号或空格分隔） |

「逻辑计算」一张卡三种用法：

- 输入端口不是固定三个：端口名保存在节点配置的 `inputs` 数组里，卡面左下角的「＋ 添加输入」按钮会按 a → b → c → d… 的顺序追加一个连接点（超过 z 后是 v27、v28…），数量不设上限；每个输入行末尾的 `×` 删除该端口，连到它上面的线一并移除，剩下的端口名保持不变（不会重新编号），至少保留一个输入。图校验、运行器和画布都用同一份解析结果，所以增删的端口能立刻连线、参与计算。
- `number` 数字计算：前两个输入做加、减、乘、除、取余或幂运算；端口没接线时分别读取配置里的「左值」「右值」，支持 `$vars.名称` 这类引用。切换成文本追加或 Math 计算后，运算符与左值/右值会从卡面和检查器里消失。除数为 0、取余为 0 或结果不是有限数字时节点失败。
- `append` 文本追加：按输入端口顺序把值转成文本，用分隔符拼接。`separatorMode` 只有两种：`newline` 用换行符（默认），`custom` 用 `separator` 里的自定义文本（留空则直接相连）。未接线的端口、空值和空串都跳过，因此只接两段也能用，也不会出现多余的分隔符；没有有效段时输出空串。
- `math` Math 计算：表达式可以直接在卡面上编辑（检查器里也有同一字段）。左侧输入的端口名就是变量名，默认 `a` / `b` / `c`，添加端口后 `d`、`e`… 也能直接用；另有常量 `PI` / `E`、`Math.PI` / `Math.E`，以及白名单函数 `abs`、`ceil`、`floor`、`round`、`trunc`、`sign`、`sqrt`、`cbrt`、`exp`、`log`、`log2`、`log10`、`sin`、`cos`、`tan`、`asin`、`acos`、`atan`、`atan2`、`pow`、`min`、`max`、`hypot`（可写 `round(a)` 或 `Math.round(a)`）。运算支持 `+ - * / % **` 与括号；表达式在保存时校验语法并检查变量都有对应端口，运行时不使用 `eval`，引用了未接线的变量、除以 0 或结果不是有限数字都会让节点失败。

「来源过滤」只接受消息对象输入：把「消息输入」的 `message` 端口接到它的 `message` 输入，卡片从这里读取 `conversationKind` 与 `conversationExternalId`，不再另读运行时的会话记录。群号和 QQ 号分两列：群聊只比对 `groupWhitelist`，私聊只比对 `privateWhitelist`（即 `conversationExternalId`，和聊天列表里看到的号码一致，不是数据库内部会话 ID），所以即使某个群号恰好和某个 QQ 号相同，也不会把另一类来源误放行。

`mode` 是三态开关：`off` 全部放行；`whitelist` 只放行名单内的来源，名单为空时该类来源全部不放行；`blacklist` 拦截名单内的来源，名单为空时不拦截任何来源。卡片是纯闸门：放行时把原消息对象从 `value` 输出，下游继续；拦截时卡片不产生任何输出，所有从它出发的连线失效，下游卡片按跳过处理。试跑面板可以指定来源类型（私聊 / 群聊）和来源群号 / QQ 号，用来验证名单是否命中；留空表示没有来源账号，白名单不会命中，黑名单不会拦截。

旧版单一 `whitelist` 会在启动迁移时按原 `source` 拆进对应列（`any` 写入两列）并记录警告；旧配置没有 `mode` 时，两列都为空迁移为 `off`，否则迁移为 `whitelist`（非空旧图的空列会提示该类来源不再放行）；旧的 `source` 配置会被删除；旧版 `matched` / `conversationKind` / `conversationExternalId` 输出的连线会被移除，基于它们设置的连线条件会被清掉；旧的 `value` 输入端连线也会自动改接到 `message`。

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
- 卡片：卡面渲染该节点全部可见配置字段，并按字段类型就地编辑（文本、数字、开关、下拉、JSON）；提供商/模型下拉与检查器读取同一份运行时选项。
- 尺寸：标记 `resizable` 的卡片可拖动右下角缩放，只限制最小宽高，没有最大尺寸；固定高度后内容超出时卡面内部滚动。未缩放的卡片按内容自然增高。尺寸与位置一样随图保存，刷新后保留。
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
3. 需要额外说明或 key 列表时加 `help: { notes, keyGroups }`；目录接口会把它一起下发给卡片的「?」帮助弹窗。
4. 注册后目录接口自动带出新节点，画布「添加节点」、检查器与卡片帮助弹窗无需改动；保存时自动参与类型校验。
