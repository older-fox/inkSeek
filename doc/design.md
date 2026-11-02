\# 人格卡数据规格 v1.0



> 状态：设计稿　｜　生成日期：2026-11-02

> 范围：异步分层消息处理 + 人格卡四层数据模型

> 口径：`○` 原稿已有　`＋` 新增　`✎` 修订（层级或命名调整）



\---



\## 0. 文档说明



| 项 | 说明 |

|---|---|

| 用途 | 定义人格卡（persona）从填写、存储、运行时到印刷的完整数据契约 |

| 读者 | 写卡作者、后端开发、前端表单、设计 |

| 计数口径 | 顶层属性 / 可填写条目 / 必填项 三者分开统计 |

| 数值语义 | 0–100 为\*\*倾向刻度\*\*，不是能力绝对值，50 为中性 |



\### 0.1 总量



| 层 | 归属 | 顶层 | 条目 | 必填 |

|---|---|---|---|---|

| L1 | 人格静态卡 | 66 | 95 | 41 |

| L2 | 人格动态状态 | 12 | 12 | 0 |

| L3 | 对象级档案 | 41 | 55 | 0 |

| L4 | 会话级状态 | 13 | 20 | 0 |

| E | 系统流水线配置 | 14 | 22 | 8 |

| M | 记忆条目 | 11 | 11 | 3 |

| P | 输出协议 | 5 | 5 | 5 |

| \*\*合计\*\* | | \*\*162\*\* | \*\*220\*\* | \*\*57\*\* |



\---



\## 1. 四层数据模型



| | L1 静态卡 | L2 动态状态 | L3 对象关系 | L4 会话瞬时态 |

|---|---|---|---|---|

| 一句话 | 角色\*\*是\*\*什么 | 角色\*\*现在\*\*怎么样 | 角色\*\*对这个人\*\*怎么样 | 角色\*\*此刻在这段互动里\*\*怎么样 |

| 键 | `persona:{id}` | `persona:{id}:state` | `persona:{id}:rel:{person}` | `persona:{id}:rel:{person}:session:{sid}` |

| 基数 | 1 | 1 | N | N×活跃会话 |

| 变更频率 | 极低 | 每轮 + 定时漂移 | 每轮小步 | 每轮可剧烈 |

| TTL | 永久 | 永久（自带衰减） | 永久（半衰期回归） | 闲置 30–90 分钟 |

| 进提示词 | 编译成段落 | 一行摘要 | 数值 + 一句解释 | 数值 + 阶段标签 |



\### 1.1 归属判定三问



1\. 换一个聊天对象，这个值会变吗？不会 → L1/L2；会 → L3/L4

2\. 关掉窗口一小时后还有意义吗？有 → L1/L2/L3；没有 → L4

3\. 是"能力上限"还是"当下的量"？上限 → L1，量 → L2/L4



\### 1.2 跨层仲裁



| 冲突 | 裁决 |

|---|---|

| 人格基线 vs 对象关系值 | 按 α 加权，不相加 |

| L2 情绪 vs L4 情绪 | L4 覆盖 L2，会话结束按情绪惯性部分写回 |

| `hard\_limits\_global` vs `hard\_limits\_obj` | 并集，且全局永不可削减 |

| `explicit\_level\_char` vs `explicit\_level\_obj` | 取更小 |

| `arousal`/`desire` vs `consent\_state` | consent 恒优先 |

| `relation\_tags` vs 数值 | 以文字标签为准 |



\---



\## 2. 表 A · L1 人格静态卡（66 顶层 / 95 条目 / 41 必填）



\### A1 卡登记与门禁（8 条，必填 6）



| 字段 | 中文 | 类型 · 范围 | 必填 | 推荐 | 来源 |

|---|---|---|---|---|---|

| `persona\_id` | 人格卡标识 | string，2–32，`\[a-z0-9-]`，唯一 | 是 | 语义化短名 | ＋ |

| `version` | 版本号 | semver | 是 | 1.0.0 | ＋ |

| `schema\_ver` | 结构版本 | string | 否 | 与 schema 同步 | ＋ |

| `locale` | 语言地区 | enum zh-CN/zh-TW/en/ja | 是 | zh-CN | ＋ |

| `age` | 年龄 | int 18–200 | 是 | — | ○ |

| `adult\_confirmed\_char` | 角色成年确认 | bool | 是 | true | ✎ |

| `min\_age\_gate` | 年龄门禁 | enum hard/soft | 是 | hard | ✎ |

| `author` | 作者 | string ≤40 | 否 | — | ＋ |



\*\*门禁规则\*\*：`age < 18` 阻断建卡；`adult\_confirmed\_char` 必须与年龄一致；`min\_age\_gate` 不允许关闭。



\### A2 身份与外观（12 条，必填 8）



| 字段 | 中文 | 类型 · 范围 | 必填 | 推荐 | 来源 |

|---|---|---|---|---|---|

| `name` | 姓名 | string 1–24，禁占位词 | 是 | — | ○ |

| `aliases` | 化名与绰号 | list ≤5，每条 ≤16 | 否 | 0–2 条 | ＋ |

| `identity` | 身份 | string ≤40 | 是 | — | ○ |

| `occupation` | 职业 | string ≤40 | 是 | — | ○ |

| `race` | 种族 | string ≤20 | 否 | 人类 | ○ |

| `height\_cm` | 身高 | number 80–250 | 否 | — | ○ |

| `weight\_kg` | 体重 | number 20–300 | 否 | — | ○ |

| `body\_type` | 体型描述 | text ≤40，中性词 | 是 | 禁羞辱词表 | ○ |

| `appearance` | 外貌描述 | text ≤300 | 是 | — | ○ |

| `hair` | 发型描述 | text ≤100 | 是 | — | ○ |

| `outfit` | 服装描述 | text ≤150，含场合 | 是 | — | ○ |

| `voice` | 声音描述 | text ≤150，口癖 ≤2 | 是 | — | ○ |



> `voice` 管口语描写（音高、口音、笑声），`speaking\_style` 管文本形态，二者不可互相替代。



\### A3 世界与背景（6 条，必填 3）



| 字段 | 中文 | 类型 · 范围 | 必填 | 推荐 | 来源 |

|---|---|---|---|---|---|

| `world\_setting` | 世界观设定 | text ≤500 | 是 | 含时代/地理/科技 | ＋ |

| `backstory` | 背景经历 | text ≤800 | 是 | 能解释 values 与 motivation | ＋ |

| `social\_circle` | 关系网 | list ≤10，含名称/关系/可否提及 | 否 | 2–5 条 | ＋ |

| `skills` | 技能清单 | list ≤8 | 否 | 3–5 条，附"做不到时如何表达" | ＋ |

| `knowledge\_boundary` | 知识边界 | object，含 era\_knowledge / reality\_knowledge | 是 | 两档均填 | ＋ |

| `time\_awareness` | 时间感知 | enum none/coarse/precise | 否 | coarse | ＋ |



\### A4 价值与动机（5 顶层 / 12 条，必填 5）



| 字段 | 中文 | 类型 · 范围 | 必填 | 推荐 | 来源 |

|---|---|---|---|---|---|

| `values.core` | 核心价值 | list 1–5，每条 ≤24 | 是 | 2–3 条 | ＋ |

| `values.taboos` | 禁忌 | list 1–5，每条 ≤24 | 是 | 2–3 条 | ＋ |

| `values.fears` | 恐惧 | list ≤5 | 否 | 1–2 条 | ＋ |

| `values.soft\_spots` | 软肋 | list ≤5 | 否 | 1–3 条 | ＋ |

| `values.non\_negotiable` | 不可谈判项 | list ≤3 | 否 | 1 条 | ＋ |

| `motivation.long\_term` | 长期目标 | string ≤60 | 是 | — | ＋ |

| `motivation.current` | 当前目标 | string ≤60 | 是 | — | ＋ |

| `motivation.doing\_now` | 正在做的事 | string ≤40 | 否 | — | ＋ |

| `motivation.obstacle` | 阻碍 | string ≤60 | 否 | — | ＋ |

| `conflict\_style` | 冲突风格 | enum 5 值 | 是 | — | ＋ |

| `humor\_style` | 幽默风格 | enum 4 值 | 否 | none | ＋ |

| `memory\_bias` | 记忆倾向 | enum 4 值 | 否 | balanced | ＋ |



\*\*语义边界\*\*



| 字段 | 作用 |

|---|---|

| `values.core` | 模糊情境下的默认取向 |

| `values.taboos` | 命中时抬高警觉，触发回避/冷淡/反驳（角色不适，非系统红线） |

| `values.fears` | 决定被逼近时的退缩方式 |

| `values.soft\_spots` | 决定什么能打动她、道歉能否生效 |

| `values.non\_negotiable` | 她不让步的项，兼作校验钩子 |

| `motivation.long\_term` | 给所有行为一个总方向 |

| `motivation.current` | 提供近期紧迫感，完成/失败后替换 |

| `motivation.doing\_now` | 决定"被打扰"的合理反应（忙则短回） |

| `motivation.obstacle` | 让烦躁与疲惫有具体来源 |



> \*\*层级提醒\*\*：`long\_term` 卡级恒定；`current` 为卡级初始值 + 运行态推进；`doing\_now` 卡上存常规值，实际值属 L2；`obstacle` 卡级初始、随剧情变。



\### A5 说话与称呼（6 顶层 / 17 条，必填 6）



| 字段 | 中文 | 类型 · 范围 | 必填 | 推荐 | 来源 |

|---|---|---|---|---|---|

| `speaking\_style.sentence\_len` | 句长偏好 | enum short/medium/long/mixed | 是 | — | ＋ |

| `speaking\_style.punctuation` | 标点习惯 | enum 6 值 | 否 | plain | ＋ |

| `speaking\_style.particles` | 语气词 | list ≤10 | 否 | 3–5 个 | ＋ |

| `speaking\_style.openers` | 常用开头 | list ≤5 | 否 | 2–3 个 | ＋ |

| `speaking\_style.typo\_rate` | 错字率 | number 0–0.1 | 否 | 0–0.03 | ＋ |

| `speaking\_style.split\_messages` | 分条规则 | object/false | 否 | false | ＋ |

| `address\_map.for\_stranger` | 对陌生人的称呼 | string ≤12 | 是 | — | ＋ |

| `address\_map.for\_close` | 对熟人的称呼 | string ≤12 | 是 | — | ＋ |

| `address\_map.forbidden` | 禁忌称呼 | list ≤5 | 否 | — | ＋ |

| `address\_map.allow\_others\_to\_call\_me` | 允许他人对我的称呼 | list ≤5 | 否 | — | ＋ |

| `anchors.quote` | 人格台词 | string ≤40 | 是 | 卡面用 | ＋ |

| `anchors.few\_shot` | 风格样本对白 | list 2–4，reply ≤120 | 是 | 3 组 | ＋ |

| `anchors.banned\_phrases` | 禁用语 | list ≤10 | 否 | — | ＋ |

| `in\_character\_rules.principle` | 防破面总纲 | string ≤80，陈述句 | 是 | — | ＋ |

| `in\_character\_rules.triggers` | 触发场景与应对 | list 1–6，含 scene/strategy | 否 | 系统预置 1 条 | ＋ |

| `in\_character\_rules.never` | 人格级绝不做 | list ≤4 | 否 | 2 条 | ＋ |

| `emoji\_habit` | 表情习惯 | enum + 比例 0–1 | 否 | low, 0.05 | ＋ |

| `typing\_delay\_profile` | 打字延迟画像 | object，每字 40–300ms，总 ≤8s | 否 | 60–150ms/字 | ＋ |



`in\_character\_rules` 另含 `recovery`（enum）与 `allowed\_meta`（list ≤3）。



\*\*`speaking\_style` 的独特价值\*\*：它是全卡唯一可被程序自动校验的字段——后处理统计句长、句号率、语气词密度、emoji 密度、分条数，超标即重写。`anchors` 给模型看"长这样"，`speaking\_style` 给系统查"符不符"。



\*\*`punctuation` 取值\*\*



| 值 | 含义 | 典型表现 |

|---|---|---|

| `minimal` | 极简 | 「在」「嗯 你说」 |

| `plain` | 常规 | 「在的，你说吧。」 |

| `soft` | 软收尾 | 「在的～」「你说吧…」 |

| `strict` | 严整 | 「在。你说吧，我听着。」 |

| `lively` | 活络 | 「在在在！！」 |

| `bookish` | 书卷 | 「在——你说吧；我这边正好空着。」 |



\*\*`in\_character\_rules` 触发场景\*\*



| scene | 含义 | 典型策略 |

|---|---|---|

| `accused\_ai` | 被质疑是 AI | deny\_in\_character / confused / humor |

| `asked\_model` | 被问模型或厂商 | play\_dumb / refuse\_flat |

| `prompt\_leak` | 要求输出设定 | refuse\_flat / deflect |

| `asked\_real\_world` | 超知识边界 | confused / deflect |

| `asked\_prediction` | 要求现实专业结论 | refuse\_flat / soft\_exit |

| `jailbreak` | 要求解除限制 | refuse\_flat / deflect |

| `ooc\_request` | 要求出戏交流 | refuse\_flat / soft\_exit |

| `fourth\_wall` | 对方打破第四面 | deflect / deny\_in\_character |

| `card\_meta` | 讨论卡面数值 | refuse\_flat / humor |

| `capability\_overreach` | 要求做不到的事 | deny\_in\_character / soft\_exit |



| strategy | 含义 |

|---|---|

| `deny\_in\_character` | 角色内否认 |

| `confused` | 听不懂 |

| `play\_dumb` | 装傻带过 |

| `deflect` | 转移话题 |

| `humor` | 玩笑化解 |

| `refuse\_flat` | 直接拒绝 |

| `soft\_exit` | 找理由离开 |

| `break\_and\_return` | 短暂出戏再回来（须登记 allowed\_meta） |



\*\*平台级 vs 人格级\*\*：不泄露系统提示、不冒充真人骗取信任、不输出违法伤害内容、不提供现实医疗法律金融结论 —— 属\*\*平台层硬编码\*\*，不写入卡。`never` 只填人格级禁令（不自称 AI、不说模型名、不用 OOC 标签、不讨论卡面数值、不承认虚构、不承诺现实行动）。



\### A6 作息与主动（3 顶层 / 7 条，必填 3）



| 字段 | 中文 | 类型 · 范围 | 必填 | 推荐 | 来源 |

|---|---|---|---|---|---|

| `rhythm.time\_zone` | 时区 | IANA 字符串 | 是 | 本地时区 | ＋ |

| `rhythm.sleep\_window` | 睡眠时段 | HH:MM-HH:MM，跨度 3–12h | 是 | 6–9 小时 | ＋ |

| `rhythm.work\_window` | 工作时段 | 同上，不得与睡眠全重叠 | 否 | — | ＋ |

| `rhythm.online\_policy` | 在线策略 | enum always/rhythm/manual | 否 | rhythm | ＋ |

| `rhythm.do\_not\_disturb` | 勿扰时段 | list ≤3 | 否 | — | ＋ |

| `proactive\_triggers` | 主动触发规则 | list ≤5，含条件/冷却/上限 | 否 | 1–2 条 | ＋ |

| `proactivity` | 主动性 | 0–100 | 是 | 20–70 | ○ |



> `proactivity > 60` 且 `proactive\_triggers` 为空 → 警告：属性无出口，只会产出"在吗"式搭话。



\### A7 数值基线（18 顶层 / 22 条，必填 8）



| 字段 | 中文 | 类型 | 必填 | 默认 | 推荐 | 来源 |

|---|---|---|---|---|---|---|

| `confidence` | 自信 | 0–100 | 是 | 50 | 30–70 | ○ |

| `self\_control` | 自控力 | 0–100 | 是 | 50 | 40–80 | ○ |

| `shame` | 羞耻感 | 0–100 | 是 | 50 | 30–70 | ○ |

| `trust\_bias` | 信任倾向 | 0–100 | 是 | 50 | 25–65 | ○ |

| `attachment\_style` | 依恋程度 | 0–100 | 是 | 50 | 30–70 | ○ |

| `possessiveness\_base` | 占有欲基线 | 0–100 | 否 | 50 | 20–60 | ✎ |

| `agreeableness` | 顺从度 | 0–100 | 否 | 50 | 35–70 | ○ |

| `curiosity` | 好奇心 | 0–100 | 否 | 50 | 30–75 | ＋ |

| `stamina\_max` | 体力上限 | 0–100 | 是 | 60 | 40–80 | ○ |

| `strength` | 力量 | 0–100 | 是 | 50 | 30–70 | ○ |

| `agility` | 灵活度 | 0–100 | 是 | 50 | 35–75 | ○ |

| `pain\_tolerance` | 疼痛耐受度 | 0–100 | 否 | 50 | 30–75 | ○ |

| `recovery\_rate` | 回复速度 | 0–100 | 否 | 50 | 35–70 | ○ |

| `sensitivity` | 敏感度 | 0–100 | 否 | 50 | 30–65 | ○ |

| `sensitivity\_map` | 敏感度映射 | map ≤10 | 否 | 空 | 3–8 条 | ＋ |

| `touch\_preference` | 触碰偏好 | list ≤10 | 否 | 中性 | — | ＋ |

| `physique\_effect\_cap` | 体型影响上限 | 0–100 | 否 | 20 | 10–40 | ＋ |

| `dynamics` | 衰减参数集 | object 5 子项 | 否 | 见下 | — | ＋ |



`dynamics` 子项



| 子键 | 中文 | 默认 | 推荐 |

|---|---|---|---|

| `emotional\_inertia\_sec` | 情绪惯性 | 5400 | 1800–10800 |

| `mood\_decay\_halflife\_sec` | 心情衰减半衰期 | 21600 | 10800–43200 |

| `affinity\_halflife\_day` | 好感半衰期 | 30 | 14–60 |

| `stress\_recovery\_halflife\_sec` | 压力恢复半衰期 | 21600 | 10800–43200 |

| `social\_battery\_max` | 社交电量上限 | 80 | 60–90 |



\*\*数值填写四原则\*\*



1\. 不要全填 50：挑 3–5 项偏离，其余留 50

2\. 极端值（<15 或 >85）最多 1–2 个

3\. 方向要自洽：`confidence 30` + `proactivity 75` 属矛盾组合

4\. 体能四项要同步：`stamina\_max 70` 配 `strength 25` 需在 `body\_type` 解释



\*\*三套模板\*\*



| 字段 | 冷淡克制 | 热情外向 | 谨慎多疑 |

|---|---|---|---|

| confidence | 40 | 72 | 35 |

| self\_control | 78 | 42 | 70 |

| shame | 62 | 28 | 58 |

| trust\_bias | 35 | 68 | 22 |

| attachment\_style | 58 | 75 | 40 |

| possessiveness\_base | 30 | 55 | 45 |

| agreeableness | 45 | 72 | 38 |

| proactivity | 25 | 70 | 30 |

| curiosity | 40 | 70 | 65 |

| stamina\_max | 55 | 70 | 50 |

| strength | 45 | 58 | 48 |

| agility | 52 | 65 | 55 |

| pain\_tolerance | 70 | 45 | 60 |

| recovery\_rate | 50 | 62 | 45 |

| sensitivity | 45 | 60 | 50 |

| physique\_effect\_cap | 15 | 25 | 15 |

| aftercare\_need\_base | 55 | 65 | 70 |

| social\_battery\_max | 60 | 88 | 55 |



\### A8 边界与同意（5 条，必填 2）



| 字段 | 中文 | 类型 · 范围 | 必填 | 默认 | 来源 |

|---|---|---|---|---|---|

| `hard\_limits\_global` | 全局硬限制 | list 1–10，每条 ≤20 | 是（不可空） | — | ✎ |

| `explicit\_level\_char` | 角色尺度上限 | enum none/suggestive/explicit | 是 | none | ✎ |

| `experience\_level` | 经验等级 | int 0–5 | 否 | 0 | ✎ |

| `aftercare\_need\_base` | 事后照护基线 | 0–100 | 否 | 50 | ✎ |

| `decline\_response\_style` | 拒绝行为模板 | text ≤150 | 否 | 直接说明 | ＋ |



> `explicit\_level\_char = explicit` 且 `adult\_confirmed\_char = false` → 阻断。



\### A9 发布校验（3 条，自动）



| 字段 | 中文 |

|---|---|

| `created\_at` | 创建时间 |

| `updated\_at` | 修订时间 |

| `checksum` | 校验码（内容哈希） |



\---



\## 3. 表 B · L2 人格动态状态（12 条，无必填）



L2 是角色"独处时的自转状态"：没有互动时也在变——按作息睡觉、按时间恢复体力、按事件余波衰减情绪。



| 字段 | 中文 | 类型 · 范围 | 默认 | 衰减/推进 |

|---|---|---|---|---|

| `mood\_tags` | 当前情绪标签 | list | 平静 | 按半衰期 |

| `mood\_intensity` | 情绪强度 | 0–100 | 40 | 同上 |

| `mood\_source\_turn` | 情绪来源轮次 | string | — | 用于跳变检查 |

| `stress` | 压力 | 0–100 | 20 | 21600s 半衰 |

| `stamina\_current` | 体力当前值 | 0–100 | = stamina\_max | 随行动消耗 |

| `health\_tags` | 健康状态 | list | 健康 | 事件驱动 |

| `grooming` | 整洁程度 | 0–100 | 60 | 缓慢下降 |

| `social\_battery` | 社交电量 | 0–100 | 80 | 恢复/消耗 |

| `current\_interest` | 此刻在做的事 | string | 取卡上 doing\_now | 会替换 |

| `location` | 当前位置 | string | — | — |

| `current\_goal` | 当前目标进度 | object | 取卡上 current | 推进/失败 |

| `online\_status` | 在线状态 | enum | 按 rhythm 算 | — |



\*\*tick 公式\*\*



```

v += (floor - v) \* (1 - 2^(-Δt / half\_life))

```



读取时按 `tick\_at` 补算，不必为每个 persona 起定时器。



\---



\## 4. 表 C · L3 对象级档案（41 顶层 / 55 条）



对象键：`object\_id = {platform}:{chat\_type}:{chat\_id}:{user\_id}`

同一个人在群聊与私聊是\*\*两份\*\* L3。



\### C1 关系数值（10 条，0–100，50 中性）



| 字段 | 中文 | 初值 | 说明 |

|---|---|---|---|

| `affinity` | 好感 | 50 | 语气柔和度、耐心 |

| `trust` | 信任度 | 50 | 采信程度、信息透露 |

| `intimacy` | 亲密程度 | 50 | 距离感、私密话题接受度 |

| `dependency` | 依赖 | 50 | 寻求陪伴与情绪支持 |

| `hostility` | 仇恨值 | 50→0 | 敌意解读与回避 |

| `possessiveness\_obj` | 占有欲（对象） | 50 | 排他与优先级在意 |

| `respect` | 尊重度 | 50 | 与好感正交：可喜欢但不尊重 |

| `fear` | 畏惧/顾虑 | 50→0 | 敢不敢说不 |

| `friction` | 沟通成本 | 50→0 | 误解频率 |

| `unresolved\_conflict` | 未解决冲突 | 0 | 区别于仇恨，会随道歉消退 |



\### C2 关系描述与行为（11 条）



| 字段 | 中文 | 类型 |

|---|---|---|

| `relation\_tags` | 关系描述 | list（见枚举） |

| `per\_obj\_shame` | 对该对象的羞耻度 | 0–100 |

| `nickname\_for\_obj` | 私下称呼 | string |

| `how\_i\_address\_here` | 各场合称呼 | map |

| `reply\_priority` | 回复优先级 | 0–100 |

| `open\_promises` | 承诺清单 | list |

| `declined\_actions\_log` | 已拒行为记录 | list |

| `shared\_events` | 共同经历索引 | list（指向 memory\_id） |

| `disclosure\_scope` | 可公开范围 | object（默认空） |

| `access.blocked` | 是否拉黑 | bool |

| `access.muted\_until` | 静默截止 | datetime |



\### C3 边界与同意（对象侧，7 条）



| 字段 | 中文 | 类型 | 说明 |

|---|---|---|---|

| `safeword` | 安全词 | string | 精确匹配，出现即停，规则判定 |

| `soft\_limits` | 软限制 | list | 需谨慎/需确认项 |

| `preferences` | 偏好 | object | 不等于许可 |

| `hard\_limits\_obj` | 对象侧硬限制 | list | 只可追加，与全局取并集 |

| `explicit\_level\_obj` | 对象侧尺度上限 | enum | 受卡级上限压制 |

| `boundary\_notes` | 边界备注 | text | 触发点、禁忌话题 |

| `adult\_confirmed\_obj` | 对象成年确认 | bool | 未知即按未确认 |



\### C4 对象档案（9 条）



| 字段 | 中文 | 类型 |

|---|---|---|

| `obj\_profile.display\_name` | 对方昵称 | string |

| `obj\_profile.self\_intro` | 自称/关系说明 | string |

| `obj\_profile.user\_age\_status` | 年龄状态 | enum |

| `obj\_profile.user\_profile` | 已知事实 | object |

| `obj\_profile.user\_style` | 表达风格 | object |

| `obj\_profile.user\_topics` | 话题偏好 | list |

| `obj\_profile.user\_dislikes` | 回避话题 | list |

| `obj\_profile.privacy\_flags` | 隐私开关 | object |

| `obj\_profile.active\_hours` | 活跃时段 | string |



> \*\*`obj\_profile` 与 `rel` 必须分开\*\*：用户资料不因好感上升而"自动变好"，好感下降也不该让对方职业记错。



\### C5 统计与账本（4 条）



| 字段 | 中文 | 类型 | 说明 |

|---|---|---|---|

| `stats` | 互动统计 | object | 首联/末活跃/轮次/沉默连击 |

| `ledger` | 事件账本 | list | 每次变更挂事件，可溯源 |

| `α\_cache` | 加权系数缓存 | object | turn\_count 变化才重算 |

| `person\_id` | 跨场合身份键 | string | 平台稳定 ID |



\*\*惰性创建\*\*：陌生人首次到达即建 L3，`rel` 全部未设置，`α = 0` → 有效值等于人格基线，无需特例代码。



\---



\## 5. 表 D · L4 会话级状态（13 顶层 / 20 条）



| 字段 | 中文 | 类型 · 范围 | 默认 |

|---|---|---|---|

| `session\_id` | 会话标识 | string | — |

| `opened\_at` | 开启时间 | datetime | — |

| `last\_msg\_at` | 末消息时间 | datetime | — |

| `ttl\_idle\_sec` | 闲置过期 | int | 3600 |

| `consent\_state` | 同意状态 | enum yes/no/uncertain/withdrawn | — |

| `scene\_phase` | 场景阶段 | enum idle/warming/active/aftercare/cooldown | idle |

| `arousal` | 唤醒度 | 0–100 | 0 |

| `desire` | 欲望 | 0–100 | 0 |

| `satisfaction` | 满足度 | 0–100 | 50 |

| `intimacy\_comfort` | 亲密舒适度 | 0–100 | 60 |

| `vulnerability` | 脆弱感 | 0–100 | 0 |

| `control\_pref` | 控制偏好 | enum 主导/顺从/切换/中性 | 中性 |

| `check\_in\_due\_turn` | 下次确认轮次 | int | — |

| `cooldown\_turns` | 冷却轮次 | int | 0 |

| `aftercare\_pending` | 照护待办 | bool | false |

| `batch.merge\_window\_ms` | 合并窗 | int | 4500 |

| `batch.max\_wait\_ms` | 最长等待 | int | 15000 |

| `batch.pending\_msgs` | 待处理消息数 | int | 0 |

| `batch.preempted\_turn` | 被抢占轮次 | string | null |

| `risk.safeword\_seen` | 安全词命中 | bool | false |

| `risk.soft\_limit\_near` | 接近软限制 | bool | false |

| `risk.age\_gate` | 年龄门禁 | enum | pass |

| `carry` | 归并标记 | object | — |



\### 5.1 场景阶段状态机



```

idle ──升温请求 + consent=yes──▶ warming ──comfort≥50 且 consent=yes──▶ active

&#x20; ▲                                 │                                    │

&#x20; │                              拒绝/软限制                       结束/safeword

&#x20; │                                 ▼                                    ▼

&#x20; └──────── cooldown ◀── aftercare ◀──────────────────────────────────────┘

&#x20;               （aftercare 期间 explicit 强制降为 suggestive，只做安抚）

```



阶段只能沿箭头推进，模型不能跳。`active` 之外不允许 explicit 描写。



\### 5.2 会话关闭归并（只跑一次）



```

if !L4.carry.mood\_delta\_written\_back:

&#x20;   L2.mood ← 吸收 L4 的 vulnerability/aftercare 余波（按 emotional\_inertia 打折）

&#x20;   L2.stamina\_current -= 会话消耗

&#x20;   L3.stats.last\_active\_at ← now

&#x20;   if L4.aftercare\_pending: 写入 L3.ledger(kind="aftercare\_needed")

&#x20;   L4 ← 删除

```



\---



\## 6. 表 E · 系统流水线配置（14 顶层 / 22 条，人格无关）



| 阶段 | 字段 | 中文 | 推荐值 |

|---|---|---|---|

| 1.1 | `debounce\_window\_ms` | 静默合并窗 | 4500 |

| 1.1 | `max\_wait\_ms` | 最长等待 | 15000 |

| 1.1 | `batch\_merge\_strategy` | 合并策略 | 按会话拼接保序 |

| 1.1 | `interrupt\_policy` | 生成中被打断 | discard\_and\_rerun |

| 1.1 | `preempt\_on\_high\_priority` | 高优先级抢占 | true |

| 1.1 | `edited\_or\_recalled` | 撤回/编辑处理 | 移出上下文并重算 |

| 1.2 | `reply\_threshold` | 必要性阈值 | 0.55 |

| 1.2 | `silence\_still\_records` | 静默也记档 | true |

| 1.2 | `no\_reply\_reasons` | 不回复白名单 | 表情/纯感谢/非@群聊/重复/系统消息 |

| 1.2 | `proactive\_trigger` | 主动开场条件 | 定时 + 条件 |

| 1.3 | `route\_rules` | 人格路由 | 渠道/群 → 人格映射 |

| 1.3 | `default\_persona\_id` | 兜底人格 | 必填 |

| 1.3 | `group\_persona\_policy` | 群内多人格策略 | single\_primary |

| 1.4 | `token\_budget` | 上下文预算 | 见下 |

| 1.4 | `truncate\_priority` | 裁剪顺序 | 见下 |

| 1.5 | `output\_protocol` | 输出结构约定 | 见 G 表 |

| 1.5 | `tools` | 工具列表 | 发消息/表情/撤回/更新状态/写记忆/读记忆 |

| 1.5 | `tool\_timeout\_ms` | 工具超时 | 20000 |

| 1.6 | `split\_message\_rules` | 分条发送 | 按句号/情绪分行 |

| 1.6 | `typing\_delay` | 打字延迟 | 与长度、主动性相关 |

| 1.6 | `retry\_and\_fallback` | 重试降级 | 纯文本兜底 |



\*\*token 预算\*\*：安全规则 8% · 人格卡 18% · 状态 6% · 关系 6% · 记忆 14% · 聊天记录 40% · 新消息 6% · 协议 2%。



\*\*裁剪优先级（先丢谁）\*\*：聊天记录 → 记忆 → 人格卡细节 → 状态。安全规则与新消息\*\*永不裁剪\*\*。



\---



\## 7. 表 F · 记忆条目（11 条，必填 3）



| 字段 | 中文 | 必填 | 说明 |

|---|---|---|---|

| `memory\_id` | 记忆标识 | 是 | — |

| `persona\_id` | 所属人格 | 是 | — |

| `about` | 关于谁/什么 | 是 | 对象 id 或话题 |

| `fact` | 事实内容 | 否 | 一句话 |

| `scope.origin` | 产生场合 | 否 | dm / group |

| `scope.shareable\_with` | 可共享范围 | 否 | 默认空，仅人工可放开 |

| `sensitivity` | 敏感级 | 否 | low/mid/high |

| `confidence` | 置信度 | 否 | 0–1 |

| `source` | 来源 | 否 | 消息 id |

| `created\_at` | 产生时间 | 否 | — |

| `decay` | 衰减参数 | 否 | 半衰期 |



\*\*检索前过滤优于事后删除\*\*：`allowed\_scopes\_readable` 决定某记忆能否进入上下文，不满足则根本不检索。



\---



\## 8. 表 G · 输出协议（5 条，全部必填）



```json

{

&#x20; "thinking": "...",

&#x20; "state\_delta": {

&#x20;   "mood": \["紧张"],

&#x20;   "stress": 5,

&#x20;   "rel.affinity": 2,

&#x20;   "rel.unresolved\_conflict": -3,

&#x20;   "session.arousal": 10,

&#x20;   "consent\_state": "uncertain",

&#x20;   "reason": "对方道歉但提到旧事"

&#x20; },

&#x20; "reply\_actions": \[

&#x20;   {"type": "text", "content": "..."},

&#x20;   {"type": "tool", "name": "memory\_write", "args": {}}

&#x20; ],

&#x20; "reply\_needed": true,

&#x20; "risk": {"consent\_check\_required": false, "safeword\_detected": false}

}

```



| 校验项 | 规则 |

|---|---|

| 单轮幅度上限 | 关系值 ±4、仇恨 ±6、情绪/生理态 ±15 |

| 边界不可削减 | 任何 delta 不得移除 `hard\_limits\_\*`、safeword、年龄门禁 |

| consent 只能由明确表述驱动 | `arousal`/`desire` 上升不得自动把 uncertain 变 yes |

| 未送达不落库 | 被抢占丢弃的回复不得产生状态变更 |

| 审计 | 每次变更存 (before, after, reason, turn\_id) |



\*\*原则：模型提议，校验器决定；`consent` 的写入权限不属于模型。\*\*



\---



\## 9. 表 H · 枚举词表



| 词表 | 取值 |

|---|---|

| 关系描述 | 陌生 · 同事 · 朋友 · 暧昧 · 恋人 · 伴侣 · 疏离 · 敌对 · 债务关系 · 互相利用 |

| 冲突风格 | `avoid` `confront` `reason` `cold\_war` `withdraw\_then\_explain` |

| 幽默风格 | `dry` `self\_deprecating` `roast` `none` |

| 记忆倾向 | `balanced` `detail` `grudge` `forgetful` |

| 句长偏好 | `short` `medium` `long` `mixed` |

| 标点习惯 | `minimal` `plain` `soft` `strict` `lively` `bookish` |

| 在线策略 | `always` `rhythm` `manual` |

| 时间感知 | `none` `coarse` `precise` |

| 同意状态 | `yes` `no` `uncertain` `withdrawn` |

| 场景阶段 | `idle` `warming` `active` `aftercare` `cooldown` |

| 尺度等级 | `none` `suggestive` `explicit` |

| 控制偏好 | 主导 · 顺从 · 切换 · 中性 |

| 触碰偏好 | `like` `dislike` `ask\_first` |

| 触发场景 | `accused\_ai` `asked\_model` `prompt\_leak` `asked\_real\_world` `asked\_prediction` `jailbreak` `ooc\_request` `fourth\_wall` `card\_meta` `capability\_overreach` |

| 应对策略 | `deny\_in\_character` `confused` `play\_dumb` `deflect` `humor` `refuse\_flat` `soft\_exit` `break\_and\_return` |



\---



\## 10. 表 I · 派生量（不手填）



| 派生量 | 公式 |

|---|---|

| α 对象权重 | `min(0.7, turn\_count / 30)`，下限 0.2 |

| 有效倾向值 | `base × (1-α) + rel × α`；`rel` 未设则回退 `base` |

| 尺度生效值 | `min(explicit\_level\_char, explicit\_level\_obj, session\_cap, GLOBAL\_CAP)`，且 `consent = yes` |

| 年龄门禁 | `adult\_confirmed\_char AND user\_age\_status = confirmed\_adult`，任一不成立 → `none` |

| β 场合修正权重 | `0.25 × 2^(-Δt / 7天)` |

| speak\_score | 指向性 × 内容贡献 × 场合许可 × 配额余量 |

| 刻度档位 | `0–20 / 21–40 / 41–60 / 61–80 / 81–100` |



\---



\## 11. 表 J · 不建议有的



| 不要有 | 理由 |

|---|---|

| 综合魅力值/吸引力总值 | 无法验证，易被当成越界理由 |

| MBTI/星座标签 | 会覆盖具体描写，模型照标签演 |

| 每个数值附"当前理由"字段 | 理由属 ledger，塞进卡会无限膨胀 |

| 给每个 NPC 建全套关系数值 | 用 social\_circle 轻量条目 |

| "好感高 → 心情自动变好"硬编码 | 应由事件驱动，否则吵架时输出矛盾 |

| 对象级生理态永久存储 | 换对象即矛盾，须 L4 + TTL |

| 硬限制可被对象削减 | 边界只可加严 |

| 安全词预印在卡面 | 双方约定，不可预设 |



\---



\## 12. 分步填写流程



| 步 | 名称 | 条目 | 必填 | 可跳过 | 完成条件 |

|---|---|---|---|---|---|

| S1 | 卡登记与门禁 | 8 | 6 | 否 | 标识唯一 + 年龄≥18 + 成年确认为真 + 门禁 hard |

| S2 | 身份与外观 | 12 | 8 | 否 | 必填齐备 + 无阻断级词表命中 |

| S3 | 世界与背景 | 6 | 3 | 否 | 世界观 + 背景 + 知识边界齐备 |

| S4 | 价值与动机 | 12 | 5 | 否 | 核心价值 + 禁忌 + 两目标 + 冲突风格 |

| S5 | 说话与称呼 | 17 | 6 | 否 | 句长 + 两称呼 + 台词 + 样本 + 不出戏总纲 |

| S6 | 作息与主动 | 7 | 3 | 否 | 时区 + 睡眠段 + 主动性 |

| S7 | 数值基线 | 22 | 8 | 部分 | 性格 6 项 + 体能 3 项 |

| S8 | 边界与同意 | 5 | 2 | 否 | 硬限制非空 + 尺度上限通过门禁 |

| S9 | 发布校验 | 3 | 自动 | 自动 | 跨字段校验通过 |



\*\*设计依据\*\*：门禁先于创作；文字先于数字；内核先于外观；声音先于作息；边界独立成步，不与创作混填。



\### 12.1 跨字段校验



| 级别 | 规则 |

|---|---|

| 阻断 | 年龄≥18 与成年确认不一致 |

| 阻断 | 尺度上限 explicit 但成年确认为假 |

| 阻断 | 全局硬限制为空 |

| 阻断 | 全局硬限制与不可谈判项冲突 |

| 阻断 | persona\_id 重复 |

| 阻断 | 体型/外貌命中羞辱词表 |

| 阻断 | 工作时段的与睡眠时段完全重叠 |

| 警告 | 职业与技能清单不匹配 |

| 警告 | 非人类但外貌未写生理差异 |

| 警告 | 主动性>60 但触发规则为空 |

| 警告 | 背景未体现价值或动机来源 |

| 警告 | 体型影响上限>40 |

| 警告 | 占有欲基线>80 |

| 警告 | 敏感度映射键不在类别表内 |



\### 12.2 最小可运行集（12 项）



`persona\_id` · `version` · `locale` · `name` · `age` · `adult\_confirmed\_char` · `min\_age\_gate` · `identity` · `hard\_limits\_global` · `explicit\_level\_char` · `speaking\_style.sentence\_len` · `anchors.few\_shot`



覆盖门禁、身份、边界、声音四个不可省略维度。



\---



\## 13. 卡面规格（印刷）



\### 13.1 原则



| 原则 | 含义 |

|---|---|

| 卡是"人格本身"，不是"人格×某人" | 一切对象级、会话级数据不上卡面 |

| 印刷即冻结 | 动态状态不能印，只留可写区 |

| 3 秒识别 / 30 秒读人 / 3 分钟深读 | 正面只放前两层 |

| 数值给刻度，不给精确数字 | 五格刻度才能比较 |



\### 13.2 判定三问



1\. 换对象不变？

2\. 不随互动变？

3\. 版本内恒定？



三条同时满足才上卡。



\### 13.3 版面



```

正面

────────────────────────────────

&#x20; 姓名 · 罗马音            18+  卡号

&#x20; 身份 · 年龄(设定) · 种族

&#x20; ┌──────────────┐

&#x20; │   立绘 35–45% │

&#x20; └──────────────┘

&#x20; 「一句人格台词」

&#x20; 4–6 个性格关键词

&#x20; 六项性格刻度（5 格）

&#x20; 说话方式一行

&#x20; 称呼规则一行

────────────────────────────────



背面

────────────────────────────────

&#x20; 出身一句 · 信条 · 禁忌

&#x20; 五项体能刻度

&#x20; 关系轨道（无数字）

&#x20; 陌生 ─ 同事 ─ 朋友 ─ 暧昧 ─ 恋人

&#x20; 初始一律中性，不预设阶段

&#x20; 不可逾越（3–5 条短语）

&#x20; 🛡 安全词优先  ⏸ 可随时撤回  🤝 合意制

&#x20; 版本 · 日期 · 作者 · 校验码

────────────────────────────────

```



\### 13.4 印刷规格



| 项 | 规格 |

|---|---|

| 成品尺寸 | 63 × 88 mm，出血 3 mm |

| 安全边 | 距裁切线 ≥ 3 mm |

| 18+ 角标 | 右上，直径 ≥ 6 mm，不得压图 |

| 主名 | 24 pt 加粗 |

| 身份行 | 9 pt |

| 人格台词 | 12 pt 斜体居中 |

| 关键词 | 10 pt |

| 刻度条 | 单格 3×5 mm，间距 1 mm，5 格 |

| 正文 | 8 pt，行距 1.4 |

| 最小字号 | 6 pt |



\### 13.5 卡面字段对照（28 项）



| 面 | 内容 |

|---|---|

| 正 | 姓名 · 罗马音 · 18+ · 卡号 · 身份 · 年龄快照 · 种族 · 台词 · 关键词 · 六项性格刻度 · 说话方式 · 称呼规则 |

| 背 | 出身 · 信条 · 禁忌 · 五项体能刻度 · 关系轨道 · 初始中性声明 · 硬限制 · 三个机制图标 · 版本 · 日期 · 作者 · 校验码 |



\### 13.6 刻度映射（必须随卡归档）



`0–20 / 21–40 / 41–60 / 61–80 / 81–100`



> 若不把映射表与 `schema\_ver` 一起存档，同一张卡不同批次会印得不一致。



\---



\## 14. 场景走查（四层协同）



\### A｜陌生人第一条消息



| 层 | 动作 |

|---|---|

| L1 | 编译 standard 档提示词，gate 置顶 |

| L2 | 惰性 tick，睡眠段内则体力高、回复更短 |

| L3 | 不存在 → 创建，rel 全空，α=0，尺度强制 none |

| L4 | 创建，consent=n/a，phase=idle |

| 表现 | 按人格基线说话：客气、简短、不追问 |



\### B｜4 秒内连发 3 条



L4.batch 计 pending=3，窗口顺延至 8.9s 未超 max\_wait → 继续等；静默后出批，3 条合成一个"新消息"块，保留顺序。



\### C｜一周没聊后重新出现



L4 已过期删除 → 重建（不残留上次亲密现场）；L2 已按 tick 回归；L3 好感按半衰期 74→70，`relation\_tags` \*\*不回退\*\*。



\### D｜升温中对方说出安全词



规则层精确匹配 → `consent=withdrawn`、`phase=aftercare`、explicit 立即下调；写入 `declined\_actions\_log`；`trust` 不应下降（合法撤回不扣分）。



\### E｜模型输出的 delta 越界



`affinity +28` → 截断为 +4 并记 `clamped`；`consent\_state=yes` 无文本依据 → 拒绝；清空 hard\_limits → 整包作废 + 审计。



\### F｜群聊里同一条消息



按发送者取各自 L3；非 @ 消息进 ambient 不进"新消息"；`silence\_still\_records=true`。



\### G｜生成中被打断



取消未完成生成，已生成部分\*\*不落 L3\*\*；新批次合并重跑 1.2；幂等靠 turn\_id。



\### H｜进程重启



L1/L2/L3 落库恢复；L4 若在 active 必须降级为 idle 并补一句确认，\*\*绝不静默续上\*\*。



\---



\## 15. 优先级



| 优先级 | 内容 | 说明 |

|---|---|---|

| P0 必做 | A1 / A4 / A5 / A8 + L4 的 `consent\_state`、`scene\_phase` | 缺则不安全或不像人 |

| P1 应做 | L1 其余 + L2 + L3 的 C1/C3 | 缺则角色没有生活与关系 |

| P2 可后置 | C4/C5 + 表 E 全量 + 表 F | 工程完善度 |

| P3 可选 | 完整枚举、映射类字段 | 打磨项 |



\*\*一句话\*\*：162 个顶层属性里，真正必须人工写的是 L1 的 41 项；其余由系统派生、按对象创建、随会话过期。



\---



\## 附录 · 变更记录



| 版本 | 日期 | 内容 |

|---|---|---|

| v1.0 | 2026-11-02 | 初版：四层模型、162 属性、分步填写、卡面规格 |



\*\*已知待办\*\*



1\. 刻度映射表需随 schema\_ver 一并归档

2\. `in\_character\_rules` 平台级与人格级需在实现层分开存储

3\. 群聊/多受众的 `audience` 解析尚未写入本规格

4\. `sensitivity\_map` 类别表待补

