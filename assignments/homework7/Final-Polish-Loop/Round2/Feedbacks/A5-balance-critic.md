---
reviewer_id: A5-balance-critic
round: 2
date: 2026-05-01
verdict: RED
score: 3
runs_completed: 3
total_minutes: ~70 game-minutes (compressed via 8x speed)
dominant_strategy_detected: 是 — "Do nothing" (no operator, no autopilot) survives 23+ min with pop loss of only 2/20; equally good as autopilot economy. Net dominant: AFK is non-losing.
softlock_or_overflow_detected: 是 — Stone soft-lock (stuck at 0 for 23+ min in Run-1 / Run-2 under autopilot, never recovers; Quarry never auto-built); Food softlock under autopilot (oscillates near 0 despite 28-44 farms built); Wood overflow under no-operator (107 then 214 — but evaporated to 0 by t≈23, hauler bug suspected).
---

## 一句话定性

数值层面**未成立**：autopilot 自动膨胀农场到 6× 上限却仍然反复缺粮、石头从游戏开始到 23 分钟不动，"Tier-5 raid"在零墙零守军零操作下也照样"defended"——也就是说**经济链失衡 + 难度全程失效**双重故障并存，现版本既没有真正的资源压力也没有真正的威胁压力。

## 轴 1：资源曲线

### 各资源 5 / 15 / 30 分钟读数

| 局 | 资源 | t=5 | t=15 | t=22-30 |
|----|------|-----|------|------|
| Run-1 (Temperate, autopilot 经济) | Food | 72 (red) | 56 (red) | 0 → 39 (oscillating) |
| Run-1 | Wood | 0 | 42 | 57 |
| Run-1 | Stone | 2 | 0 | 0 |
| Run-1 | Herbs | 16 | 1 | 0 |
| Run-1 | Lumber | 2/3 | 5/3 | 2/3 |
| Run-1 | Farms / cap | 7/6 | 22/6 | 44/6 |
| Run-2 (Highlands, autopilot 防御) | Food | 12 (red) | 84 | 13 (red) |
| Run-2 | Wood | 14 | 81 | 11 |
| Run-2 | Stone | 2 | 0 | 0 |
| Run-2 | Herbs | 0 | 1 | 0 |
| Run-2 | Farms / cap | 5/3 | 15/3 | 27/3 |
| Run-3 (Archipelago, AFK 反应式) | Food | 15 (red) | 14 (red) | 18 → 313 |
| Run-3 | Wood | 1 | 107 | 0 (蒸发了) |
| Run-3 | Stone | 15 | 15 | 15 |
| Run-3 | Herbs | 0 | 0 | 0 |
| Run-3 | Farms / cap | 0/3 | 0/3 | 0/3 |

### 长期溢出 / 短缺

- **石头永久卡死 0**（Run-1 / Run-2 全程 0；Run-3 因为没人采保留 15）。Quarry 工具按钮在 autopilot 下永远没被建。这是**结构性短缺**，不是操作问题——15+ 分钟连一个 Quarry 都没造，证明 director 评分逻辑根本不把石头当瓶颈来看。
- **草药永久 0/1**。3 局都没有任何 Herbs 节点被持续采集；Clinic 在 3 局都灰着没造。完整的医疗链（Herbs → Clinic → Medicine）从未启动。
- **食物在 autopilot 下永远红字**。Run-1 起始 314 → 5 分钟掉到 72 → 22 分钟在 0 / 39 间震荡，**而此时已造了 44 个农场**（cap 是 6！）。这说明：要么 farm yield 太低、要么 worker 拿食物消费速度过高、要么"workers eat from carry, bypassing warehouse"的老问题（v0.8.1 retrospective 提过）还没修干净。
- **食物在 AFK Run-3 居然恢复**（t=17 食 18 → t=23 食 313）。**没操作没建筑**，靠野外节点采食居然把食物涨到 313。直接证明 colony 在零基础设施下也饿不死。
- **木头在 autopilot 下被瞬间消耗**（Run-1 t=5 wood=0），但 AFK Run-3 累到 214，然后又"莫名其妙变 0"——Hauler / 库存衰减 / 队列丢资源 三类 bug 之一。

### 加工链瓶颈

- **First Meal served 在 Run-1 t≈17 才出现**（首次熟食）。前 17 分钟 colony 只能吃生 food；同时 Kitchen / Smithy / Clinic 在 3 局至少有 2 局保持灰色。整条 processing 链**几乎不参与早中期**。
- Stone=0 直接锁死 Smithy 与 Wall 升级链。
- Herbs=0/1 直接锁死 Clinic/Medicine 链。
- 加工链对**生存**实际上不起作用——Run-3 完全没有任何加工建筑，pop 22 分钟仅死 2 人。

### 改进建议

- 食物应该有**真正的下限触发**：连续 X 秒 food < 10 应当有 worker 死亡或迁出，而不是当前能"不知道为什么自己回血"。
- 直接让 director 在 Stone/Herbs 长时间 0 时**强制建 Quarry/Herbs/Clinic**（autopilot 现在显然只看 food/wood）。
- Cap 应该真的限死建筑数量。`farms 44/6` 是 **7×超建**，cap 完全是装饰；要么把 cap 当硬约束，要么换成"超过 cap 后继续建会显示 ROI 负数 / 提示玩家"。
- 仓库容量 vs 产出：仓库 11/2 也 5×超建，浪费 wood 但解决不了 food 问题——说明仓库不是瓶颈，是产出/消费比本身错了。

## 轴 2：难度曲线

### 各局威胁时间线

- **Run-1 (autopilot 经济)**：00:09 一切平静 → 00:47 Deer-17 被 predator 吃 → **05:30 "Tier-5 raid defended"**（5 分钟就 Tier-5！）→ 11:43 wildlife pressure → 17:38 First Meal → 22:57 west route online。**唯一的"威胁事件"是 5 分钟时的一个不可见 Tier-5 raid，之后 22 分钟全程平静。**
- **Run-2 (autopilot 防御)**：00:00 平静 → 05:30 First Meal → 13:00 Dev 40 → 19:11 仍然 "Recovery"。30 分钟内**一次都没有可见的敌人 raid 实体**——AI Director 的 raid escalator 似乎根本没触发。
- **Run-3 (AFK)**：00:47 Deer-39 被 predation → **17:32 "Tier-5 raid defended"** （0 墙 0 守军，但显示"walls and GUARDs hold the line"）→ 23:24 又一次 raid defended。**完全 AFK 也能"赢"全部 raid。**

### 救灾窗口存在性

不存在——因为**根本没有真正的灾难**。每个"raid"都是显示一行 toast 然后什么都不发生；预言中的 wildlife pressure 在 Run-1 出现但没造成任何资源 / 人口损失。30 分钟跨越 3 局**总死亡人数 = 4**（3 个 Deer + 1 个 trader 因饥饿），且是 NPC，不是核心 worker。

### 玩家不操作时的崩溃时间

**测不出来**。Run-3 跑 23 分钟，AFK + 无 autopilot + 0 农场 / 0 仓库 / 0 墙，pop 仅从 20 → 18，食物自我恢复到 313。**这意味着 endless survival 模式没有真正的失败条件**——玩家的"努力"对游戏结局影响极弱。

## 轴 3：策略深度

### 三局结果对比

| 局 | 策略 | 30min pop | 30min food | 30min Dev | 死亡 |
|----|------|-----------|-----------|------------|------|
| Run-1 | Autopilot 经济 | 20 | 39 | ~40 | 1 |
| Run-2 | Autopilot 防御 | 20 | 13 | 32 | 1 |
| Run-3 | AFK 反应式 | 18 | 313 | 25 | 2 |

**结论：三种策略产出近乎相同，AFK 甚至最稳。**

### dominant strategy 检测

**Yes**。"什么都不做" / "AFK" 是当前 build 的最优 / 等优策略：
1. Pop 损失最少（−2 vs autopilot −1）；
2. 食物最高；
3. 不消耗 wood / stone；
4. raid 全 cosmetic，不会因为没墙就死；
5. 玩家操作 / autopilot 反而**消耗资源建无用建筑**（44 farms 上限 6！）让经济更差。

### viable 路径数量

**0 到 1 条**。"Autopilot 把 farms 刷满" 是唯一路径，它和"什么都不干"产出几乎一样。**没有差异化路径**，因为：
- 防御策略 ≠ 防御策略（raid 不需要墙也防得住）；
- 经济策略 ≠ 经济策略（自动建 44 farms 也没把 food 拉上来）；
- 探索策略不存在（地图收益不显著）。

### 各 map template 差异化测试

3 个不同 map (Temperate / Highlands / Archipelago)：起始物品几乎相同（Food~310, Wood 34, Stone 15, Herbs 0, Lumber 12），首个事件相同（Deer 被捕食），第一次 First Meal 时间相同（~17 min），cosmetic raid 触发相同。**地图差异在数值层面没有体现**。

## 轴 4：数值合理性

### 性价比异常的建筑 / role / item

- **Farm**：在 autopilot 下被刷到 6×~7×上限，但喂不饱 20 人。**单位 farm 的食物输出严重低估** 或 **worker 消费速度过高**。
- **Warehouse**：5×超建，但因为 food 始终匮乏没起作用。建议把仓库的"激活半径 / 容量"信息暴露给 UI。
- **Quarry / Smithy / Clinic / Kitchen**：全程灰着或仅 1 个，**收益完全没参与游戏**。
- **Wall**：Run-3 0 墙也防住 Tier-5 raid → wall ROI 是负的（花 wood 没收益）。
- **Worker role**：FARM/WOOD 是 autopilot 唯一会派的角色，BUILDER 偶尔出现，**Trader/Saboteur 是 NPC 不归玩家管**。Guard 在 3 局**从未被建**。

### 暴露给玩家的"奇怪数字"

- **`farms 44/6`、`warehouses 11/2`**：cap 数字被直接显示但不限制实际建造，玩家会被这个 ratio 误导。
- **`Score 238 Dev 32/100` 在 HUD 上长时间不变**（Run-2 整 17 分钟数值字面冻结），但实际 Dev 40 milestone 又触发了——HUD 与实际状态脱节。
- **`Run 00:03:13`** 这个时间戳在 Run-2 / Run-3 的截图都显示同一个值，**可能是 Run elapsed 实际不是 game-time**，玩家无从知道"现在是第几天"。
- 起始 lumber `0/2`、`12/3` 这种 "current/cap" 比例没解释清楚是 lumber-storage 还是 lumber-route 进度。

### 罕见事件频率实测

| 事件 | 30 min 内观察次数 |
|------|-------------------|
| Predator kill | 2 次（Deer/Wolf 之间）|
| Raid (cosmetic only) | 2-3 次 |
| Wildfire / Drought / Storm | **0** 次 |
| First Meal | 仅 1 次首发 |
| 玩家 worker 死于威胁 | **0** 次 |

灾害事件接近**全部缺席**——按 brief 标准是"30 分钟没遇到极端事件"= 频率过低。

## 自行扩展角度

### A. AI Director 的反馈环 broken

Autopilot 在 Run-1 / Run-2 都死循环在"Recovery: food runway - expansion paused"。"Recovery"应该是临时态，但 22 分钟一直挂在那里——意味着 director 的"我已脱离危险"判定永远 false，所以它**只继续刷 farms 不做别的**。这是为什么石头/草药/医疗链全程不启动的根本原因。**Director 缺一个"长时间无进展时切换策略"的逃生条件**。

### B. Endgame goal 缺失

Endless survival mode 的核心问题：30 min 没有任何"接下来要追的东西"。Best Runs 列表显示历史 PB 都是 score ~170 / 3:12 survived（loss）——loss！说明历史玩家**输得很快**而不是**玩得很久**。这与本次实测的"AFK 也死不了"矛盾，怀疑这一周的某个 patch 把 fail-state 全关了；总之**当前版本无 win condition 也无可信 lose condition**，玩家 30 分钟后根本不知道为什么继续。

## 改进优先级清单

### P0（破坏游戏可玩性）

1. **Fail state 完全失效**——AFK pop 几乎不掉，raid 全 cosmetic。必须重启真实失败条件：连续 N 秒 food<5 → starvation deaths；raid 没墙没守军 → wall HP 0 直接破口扣 pop。
2. **Stone/Herbs 永久卡 0**——Director 不会建 Quarry/Herbs；建议在"某资源连续 90s = 0"时强制 enqueue 一个对应建筑。
3. **Building cap 失效**——farms 44/6、warehouses 11/2 是 7× 超建。要么把 cap 改成硬约束，要么把 director 的"还想建一个 farm 吗"评分接 cap penalty。

### P1（明显失衡）

4. **Recovery 锁死循环** — director 进入 "Recovery: food runway - expansion paused" 后永不退出；加一个 "已 5 分钟还在 Recovery → 强制切策略" 的 watchdog。
5. **加工链零参与度** — Kitchen / Smithy / Clinic 几乎不被造；造价过高 / 收益不可见。建议把 meal/medicine/tool 的 buff 显式标在 worker tooltip（例如 "+15% harvest"）。
6. **Score / Dev HUD 数字冻结** — Run-2 17 分钟内 HUD 上 "Score 238 Dev 32" 一动不动，但 milestone 还是触发了 → HUD 和实际 state 解耦了。
7. **Raid escalator 在 autopilot 模式下没效果** — Run-2 全程 0 个可见敌人实体，只有 toast；"Tier-5 raid defended" 在 5 min 出现表示 escalator 跳级触发。

### P2（数值微调）

8. Farm yield 显式调高，或者 worker hunger consumption 调低——目前 22 farms 还能让 20 人挨饿，单 farm 输出过低。
9. 起始 herbs 给 5 而不是 0，让玩家立即能造 Clinic（现在因为 0 herbs 永远不见 Clinic 启动）。
10. 各地图 starting tile 应**明显不同**（食物 / 木头 / 石头分布）；目前 3 张 map 起始仪表盘几乎一致。
11. AFK Run-3 中 wood 从 214 突然变 0——hauler/storage drain 的具体 bug，需要 dev 复盘 t=15→23 这段。
12. "Run 00:03:13" 这种时间戳在不同 game time 都不变 / 显示错乱，请校对 HUD 时钟字段绑定。

## 结论

当前 build 的平衡体系**未成立**。最严厉但客观的判断：
- 资源轴：石头/草药全程死锁、食物在 autopilot 下越建越缺、自然恢复机制反而救了 AFK；
- 难度轴：Tier-5 raid 在零防御下也"defended"，30 分钟内 0 名玩家 worker 因威胁死亡；
- 策略轴：AFK 与 autopilot 经济产出差异 < 5%，dominant strategy 是"什么都不做"；
- 数值轴：cap 不限制建造、director 死循环在 Recovery、HUD 数值冻结。

**Verdict: RED. Score 3/10.** 推荐先把 P0 三项（fail state / 资源软锁 / cap 硬约束）合到下一个 patch，才有继续做平衡调优的基础——没有真实失败条件的话，任何 BALANCE.* 的微调都是无效操作。

Best-Runs 列表里历史最高分 182、3:12 存活时间，全部都是 "loss"——意味着历史 build 玩家是真的会输的。**当前 build 与历史相比似乎**意外把 fail-state 关掉了**，这条回归一定要在下一轮第一时间排查。
