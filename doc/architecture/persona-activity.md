# 人格作息与长时事件 v2

> 本轮目标：长时事件不再由后端固定 8 小时，而是后端提供「作息参考」，由人格模型自己决定活动、时长和是否被叫醒。本文是执行期的进度锚点，上下文压缩后以本文为准。

## 设计结论

### 1. 后端只提供简报，不替模型做决定

规划器新增 `sleepBrief`（`MindSleepBrief`），消息触发与心跳都注入 `【作息】` 段：

- 当前本地时间、时区；
- 人格 `sleep_depth`（0–4，越高越难叫醒）及含义；
- 上一次 SLEEP/NAP 实际睡了多久、计划多久、什么时候结束（来自 `PersonaLongEvent`，不再依赖被心跳污染的 `lastWakeAt`）；
- 已经清醒多久；
- 当前 `sleepDebt` / `energy` / `health` / `stress`；
- 一条非约束性的时长建议（按睡眠债、清醒时长、时段、睡眠深度估算，量化到 15 分钟），明确写「只是参考，你可以自己决定」。

### 2. 长时事件可以是任何事

`kind` 允许任意 `[A-Z0-9_]` 字符串，`title` 是主要显示名。睡觉、打盹、洗澡、吃饭、上厕所、出门、专注等都走同一套模型。后端默认时长只在模型漏写 `plannedEndAt` 时兜底：睡眠类按 `sleepDebt` 估算（5–10 小时），其他活动 60 分钟。

规划器提示词要求 `START` 时写 `plannedEndAt`；时长由模型结合简报决定。

### 3. 醒来方式交给模型判断

- 到 `plannedEndAt`：确定性醒来（`PLANNED`），不调模型。
- 没有被点名/戳：继续事件，不调模型。
- 被点名时：调用一次 `mind.long-event.wake`，输入事件、人格、`sleep_depth`、当前状态、最近窗口内点名次数、消息文本，输出 `{"wake":boolean,"urgency":0-100,"reason":"..."}`。
  - 模型判断醒来：`wakeReason = JUDGMENT`（若命中事件自定义提醒词则记 `KEYWORD`）。
  - 模型判断继续睡：保持事件，判定理由写入跳过运行轨迹。
- 模型失败/不可解析：退化为「事件自定义 `wakeKeywords` → 窗口内点名次数」两级兜底。
- 删除全局硬编码唤醒词表。`wakeKeywords` 仅作为人格睡前留下的「在意词」，作为模型判断的参考，由规划器按事件自行填写。

### 4. 状态语义修正

- 心跳不再调用 `markWake`，改为 `markHeartbeat`（只更新 `lastHeartbeatAt`）。
- `lastWakeAt` 只在长时事件结算（真正睡醒/结束）时更新。
- 删除心跳每次 `sleepDebt -2` 的隐性回血；睡眠债只由自然漂移与事件结算改变。

## 数据流

```
消息/心跳
  → PersonaLongEventService.sleepBrief()   (上次睡眠 + 清醒时长 + 状态 + 建议)
  → MindPlannerService.plan({ sleepBrief }) → 提示词【作息】
  → 模型输出 longEvent{action,kind,title,plannedEndAt,wakeKeywords,...}
  → PersonaLongEventService.start()

事件期间被点名
  → MindRuntimeService.turn()
  → PersonaLongEventService.judgeWake()     (到点? 没点名? LLM 判定?)
  → 醒来: finish(JUDGMENT/KEYWORD/PLANNED) → 结算 → 进入正常规划
  → 继续睡: 记 SKIPPED AgentRun（含判定理由/紧急度）
```

## 清单

- [x] P1 文档与任务锚点
- [x] P2 `MindSleepBrief` 类型 + `sleepBrief()` 计算（上次睡眠、清醒时长、建议）
- [x] P3 规划器提示词注入【作息】，改写 longEvent 规则（任意活动、必填计划结束、唤醒词仅参考）
- [x] P4 异步 `judgeWake()`：LLM 结构化判定 + 兜底 + `JUDGMENT` 原因
- [x] P5 运行时接入 judge / sleepBrief，跳轨迹记录判定
- [x] P6 `markHeartbeat` 与 `lastWakeAt` / `sleepDebt` 语义修正
- [x] P7 UI：叫醒难度、醒来方式、结算原因、自定义 kind 显示
- [x] P8 文档更新（persona-mind.md / refactor 日志 / 本文件）
- [x] P9 全量 typecheck / lint / build + 浏览器冒烟

## 执行日志

### 2026-11-05

- 建立本文件与任务清单。
- P2：`mind.types.ts` 新增 `MindSleepBrief`；`PersonaLongEventService.sleepBrief()` 读取最近一次 SLEEP/NAP 结算、清醒时长、状态与 `sleep_depth`，按夜间/睡眠债/精力/清醒时长给出 5–10 小时（或 20–60 分钟小睡）参考，明确非约束。
- P3：规划器 `PlannerInput.sleepBrief` + `【作息】` 段；longEvent 规则改为任意活动、`plannedEndAt` 必填、时长由模型决定、`wakeKeywords` 仅参考。
- P4：`evaluateWake` → 异步 `judgeWake`，新增 `mind.long-event.wake`（`{wake,urgency,reason}`）、`JUDGMENT` 原因、模型失败两级兜底；删除全局唤醒词表。
- P5：消息与心跳都注入 sleepBrief；被点名判定结果（wake/urgency/reason/source/error）写入 `ATTENTION` 步骤；醒来步记录 `judgeReason`。
- P6：新增 `PersonaStateService.markHeartbeat()`，心跳重排只更新 `lastHeartbeatAt`；`lastWakeAt` 仅由事件结算 `applyBodyDeltas({markWake:true})` 更新；删除心跳 `sleepDebt -2`。`start()` 兜底时长按睡眠债估算。
- P7：长时事件卡显示叫醒难度（按 `sleep_depth`）、「被点名时自行判断、计划结束一定醒」、最近事件的结算原因；自定义活动以 `title` 为主显示。人格向导的「睡眠深度」说明改为「数值越高睡得越沉；被点名时由 TA 结合睡眠深度和事情轻重自己判断」。
- P8：更新 `persona-mind.md` 长时事件章节与变更日志、`persona-mind-refactor.md` 执行日志。
- P9：`@inkseek/shared` / `@inkseek/api` / `@inkseek/web` typecheck、lint、build 全部通过；Prettier 检查通过。API watcher 已把 `mind.long-event.wake` 编译进 `dist`，`/api/v1/health` 与 web `5173` 均为 200。浏览器冒烟：`/mind?channelId=…` 的当前事件卡显示「叫醒难度 一般（睡眠深度 2/4）· 已收到 0 次点名」与「被点名时由 TA 自己判断醒不醒，计划结束一定醒」，最近事件显示结算原因「被在意的话叫醒」；控制台无报错。
- 备注：冒烟时存在一条用户正在进行的「睡觉」事件（计划 14:30 结束），未触发唤醒或修改数据。
- 运行时只读校验：用现有渠道直接调用 `sleepBrief()`，返回 `localTime 05:12`、上次睡眠 151 分钟（计划 480）、已清醒 31 分钟、睡眠债 9、精力 0，建议睡 360 分钟；数据与推荐符合预期，未写库。
- 数据备注：现有 `time_zone` 存的是「UTC+8（东八区）」这类人类标签，`Intl` 无法识别时会抛错；`localHour` / `localClock` / `formatClockTime` 均已回退服务器本地时区，当前服务器同为 +8，不影响显示。
