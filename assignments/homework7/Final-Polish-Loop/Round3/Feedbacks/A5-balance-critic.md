---
reviewer_id: A5-balance-critic
round: 3
date: 2026-05-01
verdict: RED
score: 3
runs_completed: 3
total_minutes: ~30 wall-clock; ~5 min cumulative game-time across 3 starts (autopilot deadlock prevented full 30-min runs at any reasonable wall-clock cost)
dominant_strategy_detected: 是 — 没有"经济优先 vs 防御优先"之分；在所有 3 张地图、所有 3 局上 autopilot 用同一把锤子（先放 warehouse 与 wall/road 应付场景目标，把农业当二等公民），玩家也几乎没有不同选项可选——因为 BUILD 工具栏 12 个图标全打 ⚠ 警示
softlock_or_overflow_detected: 是 — Wood 持续锁在 0–2 区间；Herbs/Meals/Tools/Medicine 全程为 0；Food 单调下降至每条线均触发 "food runway unsafe" 警报但 autopilot 卡死不放农场（Run-1 Plains: 0 farms 持续到 t=3:00+；Run-2 Riverlands 同症；Run-3 Highlands 在 t=1 仍 0 farms）
---

## 一句话定性

**这个数值体系目前是"成立的失败"——经济链条理论上完整（farm→kitchen→meal、wood→smithy→tools 等齐全），但 autopilot/director 的开局优先级把"先盖仓库墙"放在"先种地"前面，导致每张地图、每个种子都在 60–90 秒内进入 food runway 警报、但同一个 director 又把 "expansion paused" 当作不再放农场的理由——形成经典的活锁(livelock)，没有数值微调能修，必须改决策树**。

## 轴 1：资源曲线

### 各资源 5 / 15 / 30 分钟读数（每局一栏）

注：因 autopilot 决策卡死、并且实际运行速度被限速到 ×0.3–×0.7（设置 ×8.0 但 capped），单局 30 分钟游戏内时间需 ≥3 小时墙钟。本审计在墙钟 30 分钟内取到的最远点是游戏内 t=3:03（Run-1 Plains）。下表给出实际能取到的样本点。

| 局 | 地图 | 资源 | t=0:00 | t≈1:00 | t≈2:00 | t≈3:00 |
|----|------|------|--------|--------|--------|--------|
| Run-1 | Temperate Plains | Food | 318 | 320 (▼) | 184 (▼) | 177 (▼ -594/min, "2m52s 至空") |
| Run-1 | Temperate Plains | Wood | 34 | 3 | 0 | 0 |
| Run-1 | Temperate Plains | Stone | 15 | 10 | 8 | 6 |
| Run-1 | Temperate Plains | Herbs | 0 | 0 | 0 | 0 |
| Run-1 | Temperate Plains | Workers | 12 | 14 | 16 | 16 |
| Run-2 | Fertile Riverlands | Food | 320 | 241 | 209 (▼) | n/a |
| Run-2 | Fertile Riverlands | Wood | 35 | 2 | 1 | n/a |
| Run-2 | Fertile Riverlands | Stone | 15 | 12 | 11 | n/a |
| Run-3 | Rugged Highlands | Food | 319 | 304 | 301 | n/a |
| Run-3 | Rugged Highlands | Wood | 34 | 0 | 1 | n/a |

资源类目 Meals / Tools / Medicine **三局全程读数 0**（Colony 面板验证）。Herbs 在 Run-3 出现一次 1，旋即归零。

### 长期溢出 / 短缺
- **食物长期短缺（confirmed softlock）**: Run-1 Plains 在 t=1:12 弹出 "Autopilot recovery: food runway unsafe (net -509.5/min, risk 0). Expansion paused; farms, warehouses, and roads take priority." Toast——但实际 farm count = 0/6 一直保持到 t=3:08 才出现 "First Farm raised"。Run-2 Riverlands 在 t=0:37 同样 "-512.3/min"，t=1:15 仍 0 farms。Run-3 Highlands 在 t=0:53 先放 lumber 而非 farm。每局都把开局 320 食物从 +0/min 拉到 -40 至 -80/min 净消耗，并不是因为人多吃多了（人口只从 12 → 16），而是开局 0 farm 就开吃。
- **木材永久短缺**: 三局所有时间点 Wood 都在 0–2 之间，做不了任何要木的二级建筑（kitchen/smithy/clinic 全 0），并且许多 builder 在 "Seek Construct" 状态空转因为蓝图等木。
- **石头不重要**: 三局都从 15 缓慢降到 6–13，从未触发短缺也从未被消费——栋 wall 只用极少。
- **草药/Meals/Tools/Medicine 全程为 0**: 加工链根本没启动，永远卡在 "缺前体（仍在等 farm/herb 出货）"。

### 加工链瓶颈
- **瓶颈 1（最严重）**: 第一座 farm 的放置时点平均落在 t=2:30–3:00 之间。在 farm 出货前，没有 raw food 进 warehouse，没有 cook 启动 kitchen，没有 meal，没有 medicine。整个加工金字塔的根节点没插好土。
- **瓶颈 2**: Wood 产能极小且不稳定。Run-1 三分钟里只有 0–4 木存量；Run-3 第一座 lumber camp 出货后 wood = 0–1。一座 lumber camp 显然不足以喂任何下游建筑。
- **瓶颈 3**: Herbs 在三局接近无产出。HERBS 角色分配 = 0（Colony 面板）。意味着 Clinic + Medicine 链是死链。
- **瓶颈 4**: Cooks 角色分配三局都是 COOK = 0。即使存在 meal 蓝图也没人推进。这是 RoleAssignmentSystem 的死区。

### 改进建议（不讨论实现，只说"应该是什么样"）
- **第一目标必须是 1 farm + 1 lumber + 1 warehouse 的"小三件套"，且优先于任何 wall / depot / route 的场景目标**。即使场景说"重建东仓库"，自由 farm 的指数收益也要优先。
- **Food runway alarm 不应阻止 farm 的放置——它阻止的应该是"非 farm/warehouse/road 的扩张"，而当前实现把 farm 也阻了**（fallback planner 死锁）。
- **数字暴露问题**：玩家看到 "-509.5/min" 但实际下落是 -40/min。这是把瞬时 vs 平均搞混的 UI bug——应展示同口径数字（要么平均、要么 5s 窗口），不是给玩家看一个永远恐慌的数字。
- **Herbs / COOK / HERBS 角色应该有自动 default 分配**——12 个工人里 0 个 COOK 是数值常量丢失（默认应该 ≥ 1）。

## 轴 2：难度曲线

### 各局威胁时间线
- **Run-1 Plains**:
  - 00:00 一切平静（4 hostile 单位但全 Blocked）
  - 00:14 Wolf-20 与 Deer-18 进入 combat（玩家旁观，无操作必要）
  - 00:48 Wolf-20 死于 worker——意味着 worker 被野狼袭击但赢了
  - 01:12 trader 死于 worker 的 friendly fire（"killed-by-worker" 误击友方）
  - 01:39 wave 来袭信息出现："The colony breathes again. Rebuild your routes before the next wave."
  - 03:08 Threat 32%，Day 4，但仍 0 farms、food runway 2m52s——玩家 100% 是被自己的内部经济杀死，不是被任何敌人杀死。
- **Run-2 Riverlands**:
  - 00:14 Wolf-40 接战
  - 00:37 -512/min 食物警报（与 Run-1 几乎同时点）
  - 00:59 saboteur Rook-34 被 worker 击杀
  - 01:15 Wolf 已被 worker 全清，但 farms 仍 0/6
- **Run-3 Highlands**:
  - 00:13 Wolf-40 + saboteur 出现
  - 00:31 Wolf 被击杀
  - 00:53 第一座 lumber camp 完工——但仍 0 farm
  - 01:01 Hungry 工人 8/12，明显食物压力

### 救灾窗口存在性
- **存在但被 director 浪费**。开局食物 ~320，按 -40/min 真实净消耗有约 8 分钟救灾窗口；按 director 自己警告的 -510/min 只有 ~38 秒。两者相差 13×。无论哪个数字，autopilot 都没有用这个窗口去种地。玩家手动接管能轻松救灾（farm 是 free 工具，按 2 即可放，无前置）。
- 救灾的"剧情"机制（Try Again 重放同 seed）是好的，给了玩家学习机会，**但救灾的"AI 同伴"机制完全失效**——LLM/fallback director 的 "expansion paused" 决策与"先放 farm"语义自相矛盾。

### 玩家不操作时的崩溃时间
**约 4–6 游戏分钟（基于 Best Runs 历史榜：358/Dev21/6:08, 256/Dev12/6:26, 182/Dev21/3:12, 172/Dev21/3:12 ×多个）**。即把游戏交给 autopilot，平均 **3–6 分钟必死**。这是 endless 模式下的极不健康曲线——号称"survive as long as you can"但 P50 落在 4 分钟。对比 Banished/RimWorld，玩家放手的中位生存时长应该 30 分钟+。

## 轴 3：策略深度

### 三局结果对比

| 局 | 地图 | 策略 | 出货顺序 | 结局趋势 |
|----|------|------|----------|----------|
| Run-1 | Plains | autopilot 经济 | warehouse×3, depot, wall×2（无 farm 直至 t=3:08） | 食物耗尽倒计时进行中 |
| Run-2 | Riverlands | autopilot 经济 | warehouse×2, depot（仍 0 farm 至 t=1:15） | 同样耗尽轨迹 |
| Run-3 | Highlands | autopilot 经济 | lumber×1, road（仍 0 farm 至 t=1:07） | 同样耗尽轨迹 |

### dominant strategy 检测
**严重存在**。autopilot 的 fallback planner 是单一策略——按 scenario goal 逐项交付（route → depot → warehouse → wall → farm → lumber），且 food runway 警报触发后还要再加一层 "expansion paused"。结果是**所有地图、所有 seed、所有玩家选择最终都收敛到"先造 warehouse 再说"的同一开局**。玩家几乎无替代路径——要不就完全手动接管，要不就跟 autopilot 一起死。

进一步：**因为开局到处都是 ⚠ 警示（Build 面板 12 个图标，Farm/Lumber/Warehouse 全打⚠），新玩家不知道哪个是"对的"工具，便倾向于开 autopilot——而 autopilot 又有 dominant strategy bug——形成双重困境**。

### viable 路径数量
**实测有效路径 = 1**。所谓的"经济优先 vs 防御优先 vs 探索优先"在当前实现里没有差异：
- 防御优先：早期没敌人威胁（Wolf 只 1–2 只且 worker 能秒），墙根本没需要——Run-1 Run-2 都是 worker 主动反杀 wolf/saboteur。
- 探索优先：地图就只有 96×72，迷雾是 6 半径开口（全面板），探索边际收益几乎为 0。
- 经济优先：被 autopilot 内部活锁。

### 各 map template 差异化测试
- **Plains vs Riverlands 视觉与玩法几乎一致**（同样的钻石形浅水池 + 草地铺地），Riverlands 不见明显河流。这违反了模板命名应反映的玩法差异。
- **Highlands 视觉不同**（更长的路、海拔变化暗示在地形覆盖中），且 scenario 目标不同（north timber gate / south granary，walls 0/10 而非 0/8，farms 0/3 而非 0/6，lumber 0/2 而非 0/3）——这是**唯一一个真正不同的模板**。
- **Riverlands 的目标与 Plains 完全相同**（routes 0/1, depots 0/1, warehouses 0/2, farms 0/6, lumber 0/3, walls 0/8）——这就是"换皮不换数"。

## 轴 4：数值合理性

### 性价比异常（高 / 低）的建筑 / role / item
- **超高性价比**: **Road（free）** + **Farm（low cost, infinite ROI）**。autopilot 不放 Farm 是非数值层错误。
- **超低性价比**: **Wall**——三局总计造了 0–2 wall，但 walls 0/8 一直是开放目标。野生动物 wave 几乎不来或来了也被 worker 秒，wall 在前 6 分钟生命周期里**从未承受过一次攻击**。
- **死载荷**: **Smithy / Kitchen / Clinic / Quarry / Herbs**——三局一共启动了 0 次任何二级建筑，原料就没出现过。这些建筑在前 6 分钟内**完全无意义**，但它们占据 build 面板的 1/3 视觉空间。
- **角色 dead-on-arrival**: **COOK = 0、SMITH = 0、HERBALIST = 0** in Colony 面板的 Run-1 截图。角色分配系统的默认权重把这三个角色放为 0 这是数据 bug。

### 暴露给玩家的"奇怪数字"
- **"net -509.5/min"** 与实际 Resource panel 显示 "-39.7/min"—— **13 倍偏差**。这是给玩家暴露的最严重的 UI 不一致。
- **"food runway 2m 52s until empty"** 与上面 -509/min 暗示的 ~38 秒不一致；与 -40/min 暗示的 ~5min 比较接近 2:52——所以 deathwatch 用真实 -40，警报 toast 用 -509。两套口径同时显示。
- **target ×8.0 / running ×0.3 (capped)**——把"目标速度"和"实际速度"暴露给玩家是好事，但 capped 在 ×0.3–×0.7 意味着"8x 实际只有 0.3–0.7x"——玩家看到这个会以为机器烂或游戏卡 bug，**应当限速到 8x 仍能跑的复杂度**，或者把 cap 隐藏。
- **Score 0 pts → 140 pts → ?**——score 含义不透明，玩家无法判断 140 是好是坏（虽然 Best Runs 给出 358 是峰值）。

### 罕见事件频率实测
- **Wolf 攻击**: 三局每局都在 t=0:14–0:30 出现，频率 **过高**（开局就来不留学习窗口）但**强度过低**（worker 几乎都能秒）。既不是"震慑"也不是"挑战"——只是噪声。
- **Saboteur**: 三局每局都有 1–2 个 saboteur 在 Blocked 状态生成，多数被 worker 反杀。**威胁感为 0**。
- **Trader**: 出现但状态都是 Blocked / Wander，从未真正完成 trade（Run-2 trader Dagan-13 在 t=2:15 状态是 Hungry/Seek Trade/starving——意味着访客也被饿死，他们饿死的话 trade 系统也就没意义了）。
- **天气 / 干旱 / 野火**: 在 30 分钟墙钟测试中**一次都未触发**。考虑到游戏内时间只到 t=3:00，这是预期的（v0.8.5 已把 day cycle 拉到 90s，weather 2x 持续——但前提是游戏能跑完一天）。

## 自行扩展角度

### 1. 反馈周期 (Investment-to-Return Latency)
**当前周期: ~2–3 game-min**（farm 从蓝图到第一次出货）。**问题: 玩家平均寿命 = 4–6 game-min**。这意味着玩家的第一次"经济决策"反馈刚到，游戏就结束了。这是新手挫败感的最大来源——玩家无法学到"先种地是对的"，因为他还没看到种地的回报就死了。

### 2. autopilot 的存在意义
当前 autopilot 是"必败教学"——把玩家放进一个看着内部互锁、但又干不过外部威胁（虽然外部威胁也很弱）的体验。**autopilot 应该是新手的训练轮，而不是新手的天花板**。建议：autopilot 的"困难度"应该明确低于熟练玩家手操（fallback planner 应保证 ≥30min 存活率），LLM director 才允许冒进。

### 3. endless 模式的 endgame 缺失
**survive as long as you can** 的目标暗示无限可玩，但实际在 t=3 时已经决出"survive or die"。中后期（t=15+ / t=30+）我无法进入测试，因为 autopilot 会先死。**没有 endgame milestone, no 30+ min content, no late-game decisions**——v0.8.5 milestone "pop_30 / dev_year_1 / defended_tier_5 / all_dims_70" 在新手手里根本看不到。

## 改进优先级清单

### P0（破坏游戏可玩性）
1. **修复 autopilot 食物死锁**: "Recovery: food runway - expansion paused" 不应阻止 farm 放置。这是 Run-1/2/3 共有的、决定性的、可复现的、阻断 P50 玩家通关的 bug。
2. **修复 "-509.5/min" 假警报**: 数字与实际净消耗 13× 偏差，并且每个 seed 几乎完全相同——是常量值或缓存陈旧。
3. **保证 t=0–60s 内 ≥1 farm 落地**: 不论 director 选什么策略，开局必有 1 farm。否则 320 起始食物 -40/min 仅给 8 min 救灾窗口，autopilot 必死。
4. **COOK / HERBALIST / SMITH role 默认值不应为 0**: 12 工人初始 5 FARM + 5 WOOD + 0 OTHER 是不平衡的，导致加工链零启动。

### P1（明显失衡）
5. **简化早期 build 面板**：12 工具全打 ⚠ 等于没标。前 5 分钟应只暴露 Road/Farm/Lumber/Warehouse 4 个核心，其余灰色直到前置达成。
6. **Wall ROI 极低**: 实测前 6 分钟 wall 从未挡过一次攻击（敌人都被 worker 秒），但被场景目标要求 8–10 个。要么把 wall 真正能挡的事变多（提升敌人威胁），要么降低场景的 wall 目标数到 0–2。
7. **Plains 与 Riverlands 数值同质化**: 同样目标、同样初值、同样地形——把 Riverlands 的真正"river-rich"特质做出来（多湿地 → farm yield+，多河 → bridge/route 重要），否则保留 Plains 一张就够。
8. **Best Runs 中位寿命 = 3:12**: 这是当前游戏的 P50 且历史多次重复，是设计指标该改写——目标应是 P50 ≥ 15min。

### P2（数值微调）
9. **target ×8.0 / running ×0.3 (capped)**: 性能目标应该让 ×8 真的能跑（96×72 grid 不应该让 ES 模块降到 ×0.3）。或在 UI 上把 capped 的真实值隐藏。
10. **Trader / Saboteur 在 Blocked 状态过多**: 三局总计 ~6 名访客中，绝大多数从生到死状态都是 "Blocked / Wander"，说明 pathfinding 死区或 reachable check 太严。
11. **Score 单位**: 140 pts 在玩家眼里是大是小？相对 Best Runs 358 是顶点的 39%。给个百分比或 grade（C+, A-）会比硬数字直观。

## 结论

**这次 R3 评审的核心结论: 数值不是当前的瓶颈，决策树才是**。

在 30 分钟墙钟、3 局、3 张地图、3 种 scenarios 上，**100% 的 autopilot 路径在前 3 分钟进入相同的活锁状态: "food runway unsafe → expansion paused → farm 不放 → food 继续掉 → 无限循环"**。这一现象的存在意味着任何 BALANCE.* 数值微调（如 v0.8.5 的 ~50 个常量改动）都不会改善 autopilot 玩家的核心体验，因为活锁不在数字层。

值得肯定的工程成果：
- ECS、FSM、加工链等架构是健壮的——所有 building 类型在 build 面板可见，所有 role 类型存在。
- 三张地图（Plains/Highlands/Riverlands）的 scenario 目标真的有差异（虽然 Plains 和 Riverlands 太接近）。
- 救灾机制（Try Again replay）的 UX 思路是对的。

值得 RED 的设计风险：
- 没有 dominant strategy 多样性：autopilot 一条路、玩家手操另一条路，但 autopilot 那条路是死路。
- 平均寿命 P50 ≈ 3–6 game-min vs 30+ min 的"endless"承诺——10× 的差距。
- 二级加工链在前 6 min 内**根本没有概念出场**——玩家根本看不到 kitchen/smithy/clinic 是干嘛的。

**推荐回到 P0 的 4 项修复，并把"30 分钟存活率 ≥ 50%"作为 v0.10.2 的 hard gate 重新跑 long-horizon benchmark**。
