# 人格数值交互审计

> 审计日期：2026-11-05
>
> 口径：
>
> - **事件交互**：有运行时写入，且有运行时读取后影响判断或输出。
> - **提示词消费**：值会进入提示词，由 LLM 自行判断，但没有确定性判定读取。
> - **无消费**：写入后没有任何运行时逻辑读取。
>
> 本轮只出清单，不改变行为。

## 结论速览

- 真正参与确定性判断的数值：`moodValence`、`moodArousal`、`energy`、`attention`、`affinity`、`trust`、`hostility`、`attraction`、`obligation`、`familiarity`、`comfort`、`audienceRisk`、群 `attention`、`speakRate`、`sleep_depth`、9 项 self traits。
- 只进入提示词、没有确定性判定的数值：`health`、`stress`、`socialBattery`、`grooming`、`moodDominance`、`sleepDebt`、部分关系维度和群维度。
- 完全没有任何运行时消费的数值：身体基线、表达数值、时间常数、部分关系 extras。
- 最需要先处理的是 `health`：它能被事件结算和工具修改，但没有事件触发规则，也没有任何行为读取，还会自动漂回 80。

## 一、实时状态 `PersonaState`

| 字段            | 写入来源                                                    | 运行时消费                            | 结论                             |
| --------------- | ----------------------------------------------------------- | ------------------------------------- | -------------------------------- |
| `moodValence`   | 情绪映射、自然漂移、事件结算、`self.attributes`、手动       | `desire`、`inferFelt`、提示词         | 保留                             |
| `moodArousal`   | 情绪映射、自然漂移、事件结算、`self.attributes`、手动       | `moodLabel` → 姿态判断、提示词        | 保留                             |
| `moodDominance` | 自然漂移、事件结算、`self.attributes`、手动；情绪映射不写   | 仅提示词与属性查询                    | 保留（提示词），可选软接通到姿态 |
| `energy`        | 自然漂移、事件结算、`self.attributes`（模型按时间尺度判断） | 睡眠判断的一部分、提示词、作息简报    | 保留                             |
| `stress`        | 情绪映射、自然漂移、事件结算、`self.attributes`             | 仅提示词与疲劳警告                    | 软接通：明确影响耐心/回复长度    |
| `socialBattery` | 自然漂移、事件结算、`self.attributes`（模型按时间尺度判断） | 仅提示词                              | 软接通：明确影响主动性与回避     |
| `attention`     | 每轮参与/旁观、自然漂移、事件结算、`self.attributes`        | 社交注意力分数、`engage` 阈值、提示词 | 保留                             |
| `sleepDebt`     | 自然漂移、事件结算、`self.attributes`                       | 作息建议、疲劳警告、提示词            | 保留                             |
| `health`        | 自然漂移、事件结算、`self.attributes`                       | 仅提示词与疲劳警告，无行为判定        | 软接通，见第五节                 |
| `grooming`      | 活动关键词漂移、事件结算、`self.attributes`                 | 仅提示词                              | 保留（提示词），暂无场景系统     |

## 二、关系数值 `PersonaRelationship`

写入路径统一为：规划器 `relationshipSignals`（限幅）、`relationship.update` / `attributes`、操作员手动。

| 字段                 | 运行时消费                                | 结论                                 |
| -------------------- | ----------------------------------------- | ------------------------------------ |
| `affinity`           | `desire`、社交注意力、姿态、提示词        | 保留                                 |
| `trust`              | `obligationScore`、提示词                 | 保留                                 |
| `hostility`          | `desire`、`risk`、情绪推断、姿态、提示词  | 保留                                 |
| `attraction`         | 情绪推断、姿态、提示词                    | 保留                                 |
| `obligation`         | `desire`、`obligationScore`、姿态、提示词 | 保留                                 |
| `familiarity`        | `obligationScore`、提示词                 | 保留                                 |
| `intimacy`           | 仅提示词（关系行为描述）                  | 保留（提示词）                       |
| `fear`               | 仅提示词                                  | 保留（提示词），可选软接通到 `risk`  |
| `respect`            | 仅提示词                                  | 保留（提示词）                       |
| `dependency`         | 仅提示词                                  | 保留（提示词），可选软接通到主动寻找 |
| `possessiveness`     | 仅提示词                                  | 保留（提示词）                       |
| `friction`           | 仅提示词                                  | 可选软接通到 `risk` / 冲突姿态       |
| `unresolvedConflict` | 仅提示词                                  | 可选软接通到 `risk` / 旧账行为       |

关系维度全部有行为描述，提示词消费不是死值；不建议删除。

## 三、群态度 `PersonaGroupStance`

| 字段           | 运行时消费         | 结论           |
| -------------- | ------------------ | -------------- |
| `comfort`      | `risk`、提示词     | 保留           |
| `audienceRisk` | `risk`、提示词     | 保留           |
| `attention`    | 社交注意力、提示词 | 保留           |
| `speakRate`    | `engage`、提示词   | 保留           |
| `belonging`    | 仅提示词           | 保留（提示词） |
| `formality`    | 仅提示词           | 保留（提示词） |

## 四、人格卡数值

### 4.1 有运行时消费

| 字段                                                                                                                         | 消费位置                      |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `age`                                                                                                                        | 人格身份提示词                |
| `sleep_depth`                                                                                                                | 睡眠/唤醒难度、作息简报       |
| `proactivity`                                                                                                                | self trait，提示词与每轮漂移  |
| `confidence`、`self_control`、`shame`、`trust_bias`、`attachment_style`、`possessiveness_base`、`agreeableness`、`curiosity` | self traits，提示词与每轮漂移 |

结论：保留。

### 4.2 没有运行时消费，但适合作静态角色设定

| 字段                                                                    | 说明                                     | 结论                           |
| ----------------------------------------------------------------------- | ---------------------------------------- | ------------------------------ |
| `height_cm`、`weight_kg`                                                | 外观描述，不参与判定                     | 静态保留                       |
| `stamina_max`、`strength`、`agility`、`pain_tolerance`、`recovery_rate` | 物理/体能设定，目前没有场景系统消费      | 静态保留，或后续接入事件结算   |
| `sensitivity`、`physique_effect_cap`                                    | 亲密/身体场景设定，目前无系统消费        | 静态保留                       |
| `aftercare_need_base`                                                   | 事后照护基线，目前无系统消费             | 静态保留或接入关系恢复         |
| `mood_intensity`、`stress`、`social_battery`、`grooming`（卡片旧副本）  | 与 `PersonaState` 重复，运行时只认状态表 | 删除旧副本，避免双源           |
| `health_tags`                                                           | 静态健康描述，不是动态健康值             | 保留为文字标签，不参与数值判断 |

### 4.3 应该有运行时消费、但目前没有

| 字段                           | 应有作用       | 建议                 |
| ------------------------------ | -------------- | -------------------- |
| `typo_level`                   | 口胡概率       | 接入输出层，或删除   |
| `split_level`                  | 分条发送程度   | 接入输出层，或删除   |
| `emoji_level`                  | 表情偏向       | 接入输出层，或删除   |
| `typing_level`                 | 打字速度/延迟  | 接入输出层，或删除   |
| `emotional_inertia_sec`        | 情绪惯性       | 接入漂移公式，或删除 |
| `mood_decay_halflife_sec`      | 心情衰减半衰期 | 接入漂移公式，或删除 |
| `affinity_halflife_day`        | 好感半衰期     | 接入关系衰减，或删除 |
| `stress_recovery_halflife_sec` | 压力恢复半衰期 | 接入漂移公式，或删除 |

这些字段目前只出现在人格编辑器和 AI 生成人格卡的提示词里，运行时不读。要么真正接线，要么从数值体系中删除，不建议继续保留“看起来有用、实际没用”的状态。

## 五、关系 extras 中的数值

| 字段             | 当前消费             | 结论                           |
| ---------------- | -------------------- | ------------------------------ |
| `per_obj_shame`  | 仅编辑器与 37 项清单 | 接入对该对象的行为约束，或删除 |
| `reply_priority` | 仅编辑器与 37 项清单 | 接入回复等待/抢占，或删除      |

## 六、建议落地顺序

### P0：健康

1. 停止健康自动漂回 80；健康只在睡眠/休息/治疗/受伤/生病等事件中恢复或受损。
2. 在事件结算提示词里明确：普通聊天不改健康；持续熬夜、受伤、生病、极端压力才是健康变化来源。
3. 不预先写死“低健康会怎样回复”，只给模型通用指令：自行判断当前对话/事件影响了哪些属性并应用；系统仅在健康 ≤30 等临界值提醒。
4. 在提示词里带上最近一次健康变化的来源和理由，避免模型反复无缘无故改健康。
5. 不默认实现死亡；如果要做，单独设计阈值和叙事后果。

### P1：软接通

- `stress`、`socialBattery`：只保留事实值，交给模型自行判断对回复长度、耐心、主动性和回避的影响，不新增硬门控。
- `friction`、`unresolvedConflict`：保留提示词中的行为语义，由模型自行判断是否翻旧账、冷处理或提高冲突风险。
- `per_obj_shame`、`reply_priority`：决定接线还是删除。

### P2：输出与公式

- `typo_level` / `split_level` / `emoji_level` / `typing_level`：接入消息输出层；这是最能直接提升聊天真实感的一组。
- 四个时间常数：接入 `PersonaStateService` 的漂移公式，替换写死的速率；否则删除。
- `stamina_max` / `recovery_rate` / `pain_tolerance`：接入长时事件结算或体力恢复；没有计划就标记为静态设定。

### P3：清理

- 删除卡片里的 `mood_intensity` / `stress` / `social_battery` / `grooming` 旧副本，只保留 `PersonaState`。
- 明确 `health_tags` 只是描述标签，不参与健康数值。
- 对仍然没有任何消费者的字段做最终决定：接入或删除，不保留灰值。
