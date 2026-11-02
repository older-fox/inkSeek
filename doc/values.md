\# 人格系统属性 · 按变动类型拆分 v1.0



> 说明：\*\*变动类型 ≠ 数据层\*\*。四层是"归属/存储"视角，变动类型是"谁在改、多久改一次"视角。二者交叉但不重合，例如 `motivation.current` 存于卡级，却属动态可变；`batch` 存于 L4，却是每轮重建的瞬态。



\---



\## 0. 分类定义



| 类 | 名称 | 判据 | 基数 | 变动者 | 周期 |

|---|---|---|---|---|---|

| \*\*A\*\* | 人格固定 | 换对象不变、随时间不变、版本内恒定 | 1 | 作者 | 仅修订 |

| \*\*B\*\* | 动态可变 | 属人格本身（唯一一份），随事件与时间漂移 | 1 | 系统 tick + 模型 delta | 分钟～天 |

| \*\*C\*\* | 对象可变 | 按对象一份，随与该对象的互动改变 | N | 模型 delta + 校验 | 每轮小步 |

| \*\*D\*\* | 场景可变 | 按会话一份，随互动生灭 | N×会话 | 模型 delta | 每轮，TTL 销毁 |

| \*\*E\*\* | 累积只增 | 只追加、不覆盖、可追溯 | N | 系统追加 | 事件驱动 |

| \*\*F\*\* | 系统固定 | 与人格无关，部署级配置 | 1 | 运维 | 上线/调参 |

| \*\*G\*\* | 派生瞬态 | 每轮现算，用完即弃 | 1/轮 | 校验器 | 单轮 |



> 补充 E/F/G 三类，是因为「累积账本」「部署配置」「每轮输出」既不是人格固定也不是对象/场景可变，硬塞进前四类会造成语义混乱。



\---



\## 1. A 类 · 人格固定（92 条）



\*\*判据\*\*：改它必须走"修订卡 + 升 version + 重编译提示词"流程。



\### A1 卡登记与门禁（8）



| 字段 | 中文 | 类型 · 范围 | 变动者 |

|---|---|---|---|

| `persona\_id` | 人格卡标识 | string 2–32，唯一 | 作者（创建后不可改） |

| `version` | 版本号 | semver | 作者（每次修订） |

| `schema\_ver` | 结构版本 | string | 作者 |

| `locale` | 语言地区 | enum | 作者 |

| `age` | 年龄（设定快照） | int 18–200 | 作者（长期运行需同步） |

| `adult\_confirmed\_char` | 角色成年确认 | bool | 作者 |

| `min\_age\_gate` | 年龄门禁 | enum hard/soft | 作者（不可关闭） |

| `author` | 作者 | string ≤40 | 作者 |



\### A2 身份与外观（12）



| 字段 | 中文 | 类型 · 范围 | 变动者 |

|---|---|---|---|

| `name` | 姓名 | string 1–24 | 作者 |

| `aliases` | 化名与绰号 | list ≤5 | 作者 |

| `identity` | 身份 | string ≤40 | 作者 |

| `occupation` | 职业 | string ≤40 | 作者（剧情内升迁另记） |

| `race` | 种族 | string ≤20 | 作者 |

| `height\_cm` | 身高（快照） | number 80–250 | 作者 |

| `weight\_kg` | 体重（快照） | number 20–300 | 作者 |

| `body\_type` | 体型描述 | text ≤40 | 作者 |

| `appearance` | 外貌描述 | text ≤300 | 作者 |

| `hair` | 发型描述 | text ≤100 | 作者 |

| `outfit` | 服装描述 | text ≤150 | 作者 |

| `voice` | 声音描述 | text ≤150 | 作者 |



\### A3 世界与背景（6）



| 字段 | 中文 | 类型 · 范围 | 变动者 |

|---|---|---|---|

| `world\_setting` | 世界观设定 | text ≤500 | 作者 |

| `backstory` | 背景经历 | text ≤800 | 作者 |

| `social\_circle` | 关系网 | list ≤10 | 作者 |

| `skills` | 技能清单 | list ≤8 | 作者 |

| `knowledge\_boundary` | 知识边界 | object 2 子项 | 作者 |

| `time\_awareness` | 时间感知 | enum 3 值 | 作者 |



\### A4 价值与动机（固定部分，9）



| 字段 | 中文 | 类型 · 范围 | 变动者 |

|---|---|---|---|

| `values.core` | 核心价值 | list 1–5 | 作者 |

| `values.taboos` | 禁忌 | list 1–5 | 作者 |

| `values.fears` | 恐惧 | list ≤5 | 作者 |

| `values.soft\_spots` | 软肋 | list ≤5 | 作者 |

| `values.non\_negotiable` | 不可谈判项 | list ≤3 | 作者 |

| `motivation.long\_term` | 长期目标 | string ≤60 | 作者 |

| `conflict\_style` | 冲突风格 | enum 5 值 | 作者 |

| `humor\_style` | 幽默风格 | enum 4 值 | 作者 |

| `memory\_bias` | 记忆倾向 | enum 4 值 | 作者 |



> `motivation.current` / `doing\_now` / `obstacle` 三项\*\*不在此表\*\*，见 B 类。



\### A5 说话与称呼（20）



| 字段 | 中文 | 类型 · 范围 | 变动者 |

|---|---|---|---|

| `speaking\_style.sentence\_len` | 句长偏好 | enum 4 值 | 作者 |

| `speaking\_style.punctuation` | 标点习惯 | enum 6 值 | 作者 |

| `speaking\_style.particles` | 语气词 | list ≤10 | 作者 |

| `speaking\_style.openers` | 常用开头 | list ≤5 | 作者 |

| `speaking\_style.typo\_rate` | 错字率 | number 0–0.1 | 作者 |

| `speaking\_style.split\_messages` | 分条规则 | object/false | 作者 |

| `address\_map.for\_stranger` | 对陌生人的称呼 | string ≤12 | 作者 |

| `address\_map.for\_close` | 对熟人的称呼 | string ≤12 | 作者 |

| `address\_map.forbidden` | 禁忌称呼 | list ≤5 | 作者 |

| `address\_map.allow\_others\_to\_call\_me` | 允许他人对我的称呼 | list ≤5 | 作者 |

| `anchors.quote` | 人格台词 | string ≤40 | 作者 |

| `anchors.few\_shot` | 风格样本对白 | list 2–4 | 作者 |

| `anchors.banned\_phrases` | 禁用语 | list ≤10 | 作者 |

| `in\_character\_rules.principle` | 防破面总纲 | string ≤80 | 作者 |

| `in\_character\_rules.triggers` | 触发场景与应对 | list 1–6 | 作者 |

| `in\_character\_rules.never` | 人格级绝不做 | list ≤4 | 作者 |

| `in\_character\_rules.recovery` | 出戏后如何拉回 | enum | 作者 |

| `in\_character\_rules.allowed\_meta` | 允许的元话题 | list ≤3 | 作者 |

| `emoji\_habit` | 表情习惯 | enum + 0–1 | 作者 |

| `typing\_delay\_profile` | 打字延迟画像 | object | 作者 |



\### A6 作息与主动（7）



| 字段 | 中文 | 类型 · 范围 | 变动者 |

|---|---|---|---|

| `rhythm.time\_zone` | 时区 | IANA 字符串 | 作者 |

| `rhythm.sleep\_window` | 睡眠时段 | HH:MM-HH:MM | 作者 |

| `rhythm.work\_window` | 工作时段 | HH:MM-HH:MM | 作者 |

| `rhythm.online\_policy` | 在线策略 | enum 3 值 | 作者 |

| `rhythm.do\_not\_disturb` | 勿扰时段 | list ≤3 | 作者 |

| `proactive\_triggers` | 主动触发规则 | list ≤5 | 作者 |

| `proactivity` | 主动性 | 0–100 | 作者 |



\### A7 数值基线（22）



| 字段 | 中文 | 范围 | 变动者 |

|---|---|---|---|

| `confidence` | 自信 | 0–100 | 作者 |

| `self\_control` | 自控力 | 0–100 | 作者 |

| `shame` | 羞耻感 | 0–100 | 作者 |

| `trust\_bias` | 信任倾向 | 0–100 | 作者 |

| `attachment\_style` | 依恋程度 | 0–100 | 作者 |

| `possessiveness\_base` | 占有欲基线 | 0–100 | 作者 |

| `agreeableness` | 顺从度 | 0–100 | 作者 |

| `curiosity` | 好奇心 | 0–100 | 作者 |

| `stamina\_max` | 体力上限 | 0–100 | 作者 |

| `strength` | 力量 | 0–100 | 作者 |

| `agility` | 灵活度 | 0–100 | 作者 |

| `pain\_tolerance` | 疼痛耐受度 | 0–100 | 作者 |

| `recovery\_rate` | 回复速度 | 0–100 | 作者 |

| `sensitivity` | 敏感度 | 0–100 | 作者 |

| `sensitivity\_map` | 敏感度映射 | map ≤10 | 作者 |

| `touch\_preference` | 触碰偏好 | list ≤10 | 作者 |

| `physique\_effect\_cap` | 体型影响上限 | 0–100 | 作者 |

| `dynamics.emotional\_inertia\_sec` | 情绪惯性 | int | 作者 |

| `dynamics.mood\_decay\_halflife\_sec` | 心情衰减半衰期 | int | 作者 |

| `dynamics.affinity\_halflife\_day` | 好感半衰期 | int | 作者 |

| `dynamics.stress\_recovery\_halflife\_sec` | 压力恢复半衰期 | int | 作者 |

| `dynamics.social\_battery\_max` | 社交电量上限 | 0–100 | 作者 |



\### A8 边界与同意（5）



| 字段 | 中文 | 范围 | 变动者 |

|---|---|---|---|

| `hard\_limits\_global` | 全局硬限制 | list 1–10 | 作者（只可加严） |

| `explicit\_level\_char` | 角色尺度上限 | enum 3 值 | 作者 |

| `experience\_level` | 经验等级 | int 0–5 | 作者 |

| `aftercare\_need\_base` | 事后照护基线 | 0–100 | 作者 |

| `decline\_response\_style` | 拒绝行为模板 | text ≤150 | 作者 |



\### A9 发布元信息（3）



| 字段 | 中文 | 类型 | 变动者 |

|---|---|---|---|

| `created\_at` | 创建时间 | datetime | 系统（仅首次） |

| `updated\_at` | 修订时间 | datetime | 系统（每次发布） |

| `checksum` | 校验码 | string | 系统（每次发布） |



\*\*A 类小计：8+12+6+9+20+7+22+5+3 = 92 条\*\*



\---



\## 2. B 类 · 动态可变（15 条）



\*\*判据\*\*：属于人格本身、全局唯一一份；不随"换了谁"而变，但随时间与事件漂移。



| 字段 | 中文 | 范围 | 变动者 | 幅度 / 周期 |

|---|---|---|---|---|

| `mood\_tags` | 当前情绪标签 | list | 模型 delta + 半衰 | 按 `mood\_decay` 回归平静 |

| `mood\_intensity` | 情绪强度 | 0–100 | 同上 | 单轮 ±15 |

| `mood\_source\_turn` | 情绪来源轮次 | string | 系统 | 随情绪写入 |

| `stress` | 压力 | 0–100 | 事件 + tick | 单轮 ±15，21600s 半衰 |

| `stamina\_current` | 体力当前值 | 0–100 | 行动消耗 + 睡眠恢复 | 每轮小额，睡眠段回升 |

| `health\_tags` | 健康状态 | list | 事件驱动 | 剧情级 |

| `grooming` | 整洁程度 | 0–100 | 缓慢下降 + 事件 | 天级 |

| `social\_battery` | 社交电量 | 0–100 | 互动消耗 | 耗尽后回复变短 |

| `current\_interest` | 此刻在做的事 | string | 事件替换 | 覆盖卡上 `doing\_now` |

| `location` | 当前位置 | string | 事件驱动 | 场景切换时 |

| `current\_goal` | 当前目标进度 | object | 推进/失败 | 覆盖卡上 `current` |

| `online\_status` | 在线状态 | enum | 按 `rhythm` 计算 | 实时派生 |

| `motivation.current` | 当前目标（运行值） | string ≤60 | 卡上为初始，运行态替换 | 完成/失败后 |

| `motivation.doing\_now` | 正在做的事（运行值） | string ≤40 | L2 覆盖卡上常规值 | 场景级 |

| `motivation.obstacle` | 阻碍（运行值） | string ≤60 | 随剧情变 | 剧情级 |



\*\*B 类小计：15 条\*\*（L2 十二项 + `motivation` 三项运行值）



\---



\## 3. C 类 · 对象可变（36 条）



\*\*判据\*\*：按对象一份，随与该对象的互动改变；换个人就是另一份。



\### C1 关系数值（10，0–100，50 中性）



| 字段 | 中文 | 变动者 | 单轮上限 |

|---|---|---|---|

| `affinity` | 好感 | 模型 delta | ±4 |

| `trust` | 信任度 | 模型 delta | ±4 |

| `intimacy` | 亲密程度 | 模型 delta | ±4 |

| `dependency` | 依赖 | 模型 delta | ±4 |

| `hostility` | 仇恨值 | 模型 delta | ±6 |

| `possessiveness\_obj` | 占有欲（对象） | 模型 delta | ±4 |

| `respect` | 尊重度 | 模型 delta | ±4 |

| `fear` | 畏惧/顾虑 | 模型 delta | ±4 |

| `friction` | 沟通成本 | 模型 delta | ±4 |

| `unresolved\_conflict` | 未解决冲突 | 模型 delta + 道歉消退 | ±6 |



\### C2 关系描述与行为（8）



| 字段 | 中文 | 类型 | 变动者 |

|---|---|---|---|

| `relation\_tags` | 关系描述 | list | 模型（需叙事依据，\*\*不回退\*\*） |

| `per\_obj\_shame` | 对该对象的羞耻度 | 0–100 | 模型 delta |

| `nickname\_for\_obj` | 私下称呼 | string | 模型 / 事件 |

| `how\_i\_address\_here` | 各场合称呼 | map | 模型 / 作者 |

| `reply\_priority` | 回复优先级 | 0–100 | 系统（由互动统计推） |

| `disclosure\_scope` | 可公开范围 | object | \*\*仅人工\*\*，模型无权改 |

| `access.blocked` | 是否拉黑 | bool | 用户 / 人工 |

| `access.muted\_until` | 静默截止 | datetime | 用户 / 人工 |



\### C3 边界与同意（对象侧，7）



| 字段 | 中文 | 类型 | 变动者 |

|---|---|---|---|

| `safeword` | 安全词 | string | 双方约定（人工） |

| `soft\_limits` | 软限制 | list | 人工 |

| `preferences` | 偏好 | object | 人工 |

| `hard\_limits\_obj` | 对象侧硬限制 | list | 人工（\*\*只可追加\*\*） |

| `explicit\_level\_obj` | 对象侧尺度上限 | enum | 人工 |

| `boundary\_notes` | 边界备注 | text | 人工 |

| `adult\_confirmed\_obj` | 对象成年确认 | bool | 用户 / 人工 |



\### C4 对象档案（9）



| 字段 | 中文 | 变动者 |

|---|---|---|

| `obj\_profile.display\_name` | 对方昵称 | 用户资料 / 事件 |

| `obj\_profile.self\_intro` | 自称/关系说明 | 用户告知 |

| `obj\_profile.user\_age\_status` | 年龄状态 | 用户告知（未知即未确认） |

| `obj\_profile.user\_profile` | 已知事实 | 用户告知 |

| `obj\_profile.user\_style` | 表达风格 | 系统统计 |

| `obj\_profile.user\_topics` | 话题偏好 | 系统统计 |

| `obj\_profile.user\_dislikes` | 回避话题 | 用户告知 |

| `obj\_profile.privacy\_flags` | 隐私开关 | 用户（硬删除入口） |

| `obj\_profile.active\_hours` | 活跃时段 | 系统统计 |



\### C5 键与缓存（2）



| 字段 | 中文 | 变动者 |

|---|---|---|

| `person\_id` | 跨场合身份键 | 平台解析 |

| `α\_cache` | 加权系数缓存 | 系统（`turn\_count` 变才重算） |



\*\*C 类小计：10+8+7+9+2 = 36 条\*\*



\---



\## 4. D 类 · 场景可变（20 条）



\*\*判据\*\*：按会话/场景一份，随互动生灭；闲置 30–90 分钟过期销毁。



| 字段 | 中文 | 范围 | 默认 | 变动者 |

|---|---|---|---|---|

| `session\_id` | 会话标识 | string | — | 系统创建 |

| `opened\_at` | 开启时间 | datetime | — | 系统 |

| `last\_msg\_at` | 末消息时间 | datetime | — | 系统（每条消息） |

| `ttl\_idle\_sec` | 闲置过期 | int | 3600 | 配置 |

| `consent\_state` | 同意状态 | enum 4 值 | — | \*\*仅由用户文本驱动\*\* |

| `scene\_phase` | 场景阶段 | enum 5 值 | idle | 状态机推进 |

| `arousal` | 唤醒度 | 0–100 | 0 | 模型 delta（±15） |

| `desire` | 欲望 | 0–100 | 0 | 模型 delta（±15） |

| `satisfaction` | 满足度 | 0–100 | 50 | 模型 delta |

| `intimacy\_comfort` | 亲密舒适度 | 0–100 | 60 | 模型 delta |

| `vulnerability` | 脆弱感 | 0–100 | 0 | 模型 delta |

| `control\_pref` | 控制偏好 | enum 4 值 | 中性 | 模型 / 用户 |

| `check\_in\_due\_turn` | 下次确认轮次 | int | — | 系统 |

| `cooldown\_turns` | 冷却轮次 | int | 0 | 系统递减 |

| `aftercare\_pending` | 照护待办 | bool | false | 状态机 |

| `batch.merge\_window\_ms` | 合并窗 | int | 4500 | 配置（会话实例） |

| `batch.max\_wait\_ms` | 最长等待 | int | 15000 | 配置（会话实例） |

| `batch.pending\_msgs` | 待处理消息数 | int | 0 | 系统（每条消息） |

| `batch.preempted\_turn` | 被抢占轮次 | string | null | 系统 |

| `risk` | 风险标记（3 子项） | object | — | 规则层 |



\*\*D 类小计：20 条\*\*



\---



\## 5. E 类 · 累积只增（16 条）



\*\*判据\*\*：只追加、不覆盖、可追溯；修正靠新事件而非改旧记录。



| 字段 | 中文 | 归属 | 追加者 |

|---|---|---|---|

| `ledger` | 事件账本 | L3 | 系统（每次变更挂事件） |

| `open\_promises` | 承诺清单 | L3 | 事件（新增 / 结清） |

| `declined\_actions\_log` | 已拒行为记录 | L3 | 系统（每次拒绝） |

| `shared\_events` | 共同经历索引 | L3 | 系统（指向 memory\_id） |

| `stats` | 互动统计 | L3 | 系统（只增计数） |

| `memory\_id` | 记忆标识 | M | 系统 |

| `persona\_id` | 所属人格 | M | 系统 |

| `about` | 关于谁/什么 | M | 系统 |

| `fact` | 事实内容 | M | 系统（\*\*只写不改\*\*） |

| `scope.origin` | 产生场合 | M | 系统 |

| `scope.shareable\_with` | 可共享范围 | M | \*\*仅人工\*\* |

| `sensitivity` | 敏感级 | M | 系统（可降级不可升级） |

| `confidence` | 置信度 | M | 系统 |

| `source` | 来源 | M | 系统 |

| `created\_at` | 产生时间 | M | 系统 |

| `decay` | 衰减参数 | M | 系统 |



\*\*E 类小计：5 + 11 = 16 条\*\*



\---



\## 6. F 类 · 系统固定（22 条）



\*\*判据\*\*：与人格无关，部署级配置；改它影响所有角色。



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

| 1.2 | `no\_reply\_reasons` | 不回复白名单 | 表情/纯感谢/非@/重复 |

| 1.2 | `proactive\_trigger` | 主动开场条件 | 定时 + 条件 |

| 1.3 | `route\_rules` | 人格路由 | 渠道/群 → 人格 |

| 1.3 | `default\_persona\_id` | 兜底人格 | 必填 |

| 1.3 | `group\_persona\_policy` | 群内多人格策略 | single\_primary |

| 1.4 | `token\_budget` | 上下文预算 | 8/18/6/6/14/40/6/2 % |

| 1.4 | `truncate\_priority` | 裁剪顺序 | 记录→记忆→卡细节→状态 |

| 1.5 | `output\_protocol` | 输出结构约定 | 见 G 类 |

| 1.5 | `tools` | 工具列表 | 发消息/表情/撤回/记忆 |

| 1.5 | `tool\_timeout\_ms` | 工具超时 | 20000 |

| 1.6 | `split\_message\_rules` | 分条发送（系统侧） | 按句号/情绪分行 |

| 1.6 | `typing\_delay` | 打字延迟（系统侧） | 与长度、主动性相关 |

| 1.6 | `retry\_and\_fallback` | 重试降级 | 纯文本兜底 |

| — | `platform\_hard\_rules` | 平台级硬规则 | 不泄露提示、不冒充真人等（硬编码） |



\*\*F 类小计：22 条\*\*



\---



\## 7. G 类 · 派生瞬态（5 条）



\*\*判据\*\*：每轮现算、用完即弃，不落库（除审计快照）。



| 字段 | 中文 | 说明 |

|---|---|---|

| `thinking` | 内部推理 | 单轮 |

| `state\_delta` | 状态变更提案 | 单轮，校验后落地 |

| `reply\_actions` | 回复动作列表 | 单轮 |

| `reply\_needed` | 是否需要回复 | 单轮 |

| `risk` | 风险标记 | 单轮 |



\*\*G 类小计：5 条\*\*



\---



\## 8. 对账



| 类 | 名称 | 条目 | 顶层容器 | 必填 |

|---|---|---|---|---|

| A | 人格固定 | 92 | 60 | 41 |

| B | 动态可变 | 15 | 13 | 0 |

| C | 对象可变 | 36 | 37 | 0 |

| D | 场景可变 | 20 | 13 | 0 |

| E | 累积只增 | 16 | 12 | 3 |

| F | 系统固定 | 22 | 14 | 8 |

| G | 派生瞬态 | 5 | 5 | 5 |

| \*\*合计\*\* | | \*\*206\*\* | \*\*144\*\* | \*\*57\*\* |



\*\*与先前 220 的差异说明\*\*：本次按逐行列出的条目核算为 206，差 14 来自容器展开口径不同（`in\_character\_rules` 由 4 子项计为 5、`stats`/`ledger` 不再重复展开、`batch` 与 `risk` 按子项计）。\*\*以本表为准\*\*，后续若需与前端表单对齐，应以本表行数为准逐行核对。



\*\*跨类说明\*\*



| 现象 | 说明 |

|---|---|

| A 与 B 交叉 | `motivation` 一个容器被拆到两类：`long\_term` 属 A，其余三项属 B |

| D 与 F 交叉 | `debounce\_window\_ms` 在 F 是\*\*配置值\*\*，在 D 是\*\*会话实例\*\*；前者改配置，后者每轮重建 |

| C 与 E 交叉 | `ledger`/`stats` 存于 L3（对象级），但变动类型是"只增"而非"数值可变" |

| 顶层数 144 < 条目 206 | 因按变动类型拆分后，容器被拆散（如 `motivation` 拆 A/B、`in\_character\_rules` 展开 5 项） |



\---



\## 9. 变动触发矩阵



| 类 | 谁写 | 单次幅度上限 | 是否需要校验 | 是否需审计 | 可否被模型直接改 |

|---|---|---|---|---|---|

| A | 作者 | — | 跨字段校验 | 版本记录 | 否 |

| B | tick + 模型 | 情绪/生理 ±15 | 是 | 是 | 部分（情绪、压力可） |

| C | 模型 | 关系 ±4，仇恨 ±6 | 是 | 是 | 是（边界项除外） |

| D | 模型 | 生理 ±15 | 是 | 快照 | 是（`consent` 除外） |

| E | 系统 | 只增 | 否 | 天然可追溯 | 否 |

| F | 运维 | — | 变更评审 | 是 | 否 |

| G | 校验器 | — | 是 | 单轮快照 | 否 |



\*\*三类字段永远不接受模型写入\*\*：`hard\_limits\_\*`、`consent\_state`、`scope.shareable\_with`。



\---



\## 10. 常见错放与症状



| 错放 | 症状 | 正确归处 |

|---|---|---|

| 情绪写进 A | 角色永远"平静"，像客服 | B |

| 生理态写进 C | 换个人仍是上次的唤醒度 | D（会话级 + TTL） |

| 关系值写进 B | 对 A 生气后对 B 也冷淡 | C |

| 会话状态写进 C | 隔周上线仍保持高唤醒 | D |

| 记忆内容写进 C | 关系数值被"事实"污染 | E |

| 硬限制写进 C 且允许覆盖 | 关系够高即可洗白边界 | A（全局，只可加严） |

| 部署参数写进 A | 每张卡各调一套等待窗，无法统一 | F |

| 把 E 类当 C 类直接覆盖 | 承诺被静默抹除，无法追责 | E（新事件结清，不删旧记录） |



\---



\## 11. 一句话



\*\*A 类只有作者能动，B 类随时间自己变，C 类按人各一份，D 类聊完就丢；E 类只写不改，F 类全局一套，G 类每轮现算。\*\* 判断一个字段该放哪类，只需问：\*\*"谁会改它？改的时候，别人受影响吗？"\*\*

