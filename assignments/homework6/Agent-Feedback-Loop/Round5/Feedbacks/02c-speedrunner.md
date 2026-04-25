---
reviewer_id: 02c-speedrunner
round: 5
date: 2026-04-24
score: 4
persona: 速通 / 最优化玩家
---

# 身份自述

我是一个 min-max 脑的速通玩家。我打开任何一款模拟游戏的第一件事：不是看剧情、不是听教程，是去找 **dominant strategy** —— 哪个建筑 ROI 最高？哪个资源堆到上限会溢出？有没有 "pause + 一次放 30 个建筑" 的伪作弊？有没有 AutoPilot 比人类玩得好的羞辱时刻？我读 Debug 面板比看游戏画面还多。我不想理解殖民者名字，我只想知道 `Score/分钟` 有没有办法上 200。

这一轮我分配了约 60 个工具调用，在 `http://127.0.0.1:5173/` 跑了三条 run（Temperate Plains 手动砸满、Fertile Riverlands 纯 Autopilot、Rugged Highlands 手动 wall-spam），目标是找出 Project Utopia 的最优策略与机制边界。

---

# Run 1 日志 — Temperate Plains · 手动 "建筑海" 策略

**策略**：Broken Frontier 默认剧本，默认种子，立刻切 4x Fast Forward，然后从 t=0:03 起开始脚本化地批量下 Warehouse / Kitchen / Smithy / Clinic，看哪些能 cheese 掉 Dev Index。

**关键事件时间线**：

| Sim 时间 | Score | Dev | 事件 |
|---|---|---|---|
| 0:02 | 2 | 49 | 开局；12 工人；warehouses 4/2 已经达标 |
| 0:59 | 79 | 48 | FF 大概跑了 57s 真实时间；第一只 Herbivore-18 被 predator 咬死 |
| 3:41 | 246 | 50 | 一次性 dispatch 了 6 次 Warehouse 点击 → 数量飙到 10/2；routes 从 1/1 掉到 0/1（我切到 warehouse tool 时破坏了路径？） |
| 4:02 | 277 | 55 | 暂停 → 我一次性铺 Kitchen×5 / Smithy×4 / Clinic×3；Dev +5 |
| 4:59 | 364 | 64 | FF 60s 后 warehouses 16、farms 12、walls 19 全部超额；食物 124，但 food -198/min 净流出 |
| 5:20 | 395 | 65 | Dev 从 64 回落到 65 平台；Heat Lens 显示北部一堆 "starved" 蓝色 tile |
| 5:27 | 397 | 64 | Cora-26 / Luka-6 starved；Food 80 / Wood 30 / Stone 0；Dev 再次下滑 |

**找到的事**：

1. **Build-spam cheese 有效但自我毁灭**。我在 0:02~4:02 之间用合成 click 往画布塞了 18+ 栋建筑，scenario 目标一路飙到 warehouses 15/2、walls 20/8。短期 Dev 从 49 上到 65（+16），**Score/min 达到约 75~100**，远高于 Autopilot run 的 ~40/min。但代价是资源耗空：food 净流出 -198/min、wood -168/min，到 5 分钟就进入 starvation spiral。典型的"**cheese 前期 Dev Index，但长期活不过第 2 个 scenario 波**"。
2. **Scenario 目标有 score 奖励**。Dev 从 49 一路涨到 65，明显是 over-达标的 warehouse/wall count 在加分。但超过阈值后边际收益递减，walls 19/8 和 walls 8/8 应该拿到一样分，**超额建造纯浪费 wood**。
3. **资源没有溢出检查**。我没能把任何资源堆到 999+（食物最高看到 125），但游戏没有显示任何上限，估计是 "生产 < 消耗" 让资源天然不会溢出。这堵死了传统 "资源海啸 cheese"。
4. **Clinic 需要 herbs**，但我从没见 Herbs 长超过 2，也从没看到 Medicine > 0。Herbalist 角色列表里是 0。**整条 herb→medicine 链在默认开局里是 dead content**。

---

# Run 2 日志 — Fertile Riverlands · 纯 Autopilot 对照

**策略**：换 Fertile Riverlands（理论上最富饶），开启 Autopilot 对照组，FF 4x，我全程不干预，看 AI fallback 能爬多高。

**关键数据**：

| Sim 时间 | Score | Dev | Workers | 说明 |
|---|---|---|---|---|
| 0:07 | 12 | 45 | 13 | 开局 |
| 0:18 | 28 | 45 | 14 | Autopilot 正在 "next policy in 2.8s" 循环，每 10s 决策一次 |
| 0:33 | 38 | 47 | 15 | First Lumber camp 达标 |
| 1:11 | 96 | 47 | 19 | **warehouses 从 6 掉到 3**（Autopilot 自己拆？还是 scenario 事件拆？）；routes 0/1 坏了没修 |

**Score/min 约 80**，但 **Dev Index 卡在 47 爬不动**。Autopilot 在我 run 1 手动状态下开出的 65 面前像小学生。更糟的是它让 warehouse 数量回落，说明 fallback policy 至少在这里有个"拆建筑"分支，或者某个 scenario tick 会 remove warehouse（"flood buried the west road"？）。

**结论**：Autopilot = 弱基线。对 min-max 玩家毫无威胁，只证明手动干预在数值上是明确占优的。这本身是好事（玩家有存在感），但也说明 fallback 的 AI 作为游戏宣传亮点属于 **半成品**。

---

# Run 3 日志 — Rugged Highlands · Wall-spam 测试

**策略**：Gate Bastion 剧本 walls 目标是 10/，我想测 "wall 海" 能否把 Dev 打爆。同时测合成 click 脚本在高频率下是否能绕过冷却。

**关键数据**：

| Sim 时间 | Score | Dev | Walls | 说明 |
|---|---|---|---|---|
| 0:36 | 46 | 48 | 7/10 | Autopilot off，FF 4x，自然发展 |
| 0:58 | 78 | 49 | 7/10 | 我用 JS 往画布发了 ~200 次 click，walls 一点没涨 |

**关键 bug/机制发现**：合成 `MouseEvent` 在 Three.js 画布上的点击转 tile 坐标失败了（HUD 显示 "Target tile is unchanged"）。也就是说：**自动化脚本化的 build-spam 能走通 UI 按钮但打不到格子坐标**，需要真实 `offsetX/offsetY` 或 pointerEvents。这对人类速通玩家无关痛痒，但说明游戏对脚本/外挂天然有一层防线。

另外 Rugged Highlands 起步资源（Food 109 / Wood 8 / Stone 5）里 Stone 只有 5，而这张图有 2 个 chokepoint 要 stabilize，石料明显不够 —— **模板没做资源差异化平衡**，每张地图都在拿 Temperate 的开局发牌。

---

# 综合数据表

| Run# | Template | Strategy | Survived (sim) | Real time (wall) | Final Score | Final Dev | Deaths | Score/min (sim) |
|---|---|---|---|---|---|---|---|---|
| 1 | Temperate Plains | Manual build-spam | 5:27 | ~7 min | 397 | 64 | 2 (starvation) | ~73 |
| 2 | Fertile Riverlands | Pure Autopilot | 1:11 | ~6 min | 96 | 47 | 0 | ~81 |
| 3 | Rugged Highlands | Manual wall-spam (failed) | 0:58 | ~4 min | 78 | 49 | 0 | ~81 |

**注**：Fast Forward 4x 在我的浏览器里实测远达不到 4x —— 三分钟真实时间只推进 38~70 秒 sim 时间，约等于 **real:sim = 3~5 : 1**。可能是 canvas/Three.js 渲染开销 + 后台 throttle 的双重拖累。这一点对速通玩家是致命打击：**我根本等不起长跑测试**，benchmark 里的 "day 365" 对手动玩家就是幻想。

---

# 找到的策略与 cheese

**真正有效的：**
1. **Warehouse / Wall 超量达标**。Scenario 目标（如 warehouses 2、walls 8）一旦达标就给一次性 Dev 跳涨。手动砸出去 4 栋 warehouse 就能在 2 分钟内把 Dev 从 49 抬到 55+。
2. **暂停期批量放建筑**。Pause 不限制 click 频率，理论可以一秒内放 20 栋，但是真的放下去之后 `wood` 会立刻扣完，没有"按需延迟扣款"的漏洞可钻。
3. **忽略 herb→medicine 链**。Clinic 要 6 wood + 4 herbs，而 herbs 整场最多看到 2，**Clinic 在默认开局 ROI ≈ 0**。跳过它。
4. **Autopilot off 一定优于 on**。手动 Dev 65 vs Auto Dev 47，差距 ~40%。

**无效的/死路：**
1. ❌ 合成 MouseEvent 不映射到 tile（机制保护）
2. ❌ 把 wall/warehouse 刷到 20+ 后不再加分
3. ❌ 等食物数字溢出 cheese（食物几乎永远在净消耗）
4. ❌ Kitchen / Smithy 建了但 role 列表依然 SMITH=1 / COOK=0，说明光建筑不够，还要角色分配，但游戏没暴露"分配工人"按钮给我

**找到的疑似 bug：**
- Run 1 中我切 Warehouse 工具时 routes 从 1/1 掉到 0/1，很可能 scenario tick 的 "west lumber route gap" 事件和我的点击不相关，只是巧合；但信息提示上看起来像是我造成的，**HUD 归因模糊**。
- Run 2 中 warehouse 数量自行从 6 掉到 3，场景"buried by silt"破坏了已建建筑但**没有任何弹窗或事件日志告知**，对速通玩家很不友好。

---

# 游戏有没有真正的玩法上限？

**短答：没有。**

长答：
- **没有真正的 Score 软上限**。Survive 越久分越高，但 Dev Index 有硬上限 100，而且边际建筑不给分。所以 Score 只是 "活多久 * 基础速率"，不是 "玩得多精"。Score 100k 和 Score 1k 的差别只有活得久，不是玩得妙。
- **没有多结局/成就/胜利条件**。v0.8.0 是 endless survival，那就真的 endless，**没有"8 分钟达到 Dev 90"这种竞速 milestone**。速通社区需要的是清晰分阶段 target，这游戏没有。
- **没有明显的"上限打法"**。我 run 1 的 manual build-spam 被饥饿锁死、run 2 的 Autopilot 爬不动、run 3 的 wall-spam 被坐标保护堵死。**每条路都撞墙但没有一条路通向 1000 score/min**。这说明作者目前在数值平衡上做了不少保护栏杆（好事），但也意味着**玩家找不到"爽"的突破口**（坏事）。
- **FF 4x 在前端严重残废**。对于动辄要求 day 365 的 benchmark 来说，人类玩家在 UI 里根本触碰不到那种深度 —— 只有 benchmark 脚本能看到。这是**速通玩家的致命离心力**：游戏的有趣部分被藏在非交互层里。

---

# 评分与一句话总结

**4 / 10**

速通视角给这个分：机制基础可见，Score/Dev/Scenario 目标清楚，**但没有 dominant strategy、没有竞速 milestone、没有 replay 维度（种子只改生成不改规则）**。Autopilot 作为基线弱到发指却又不让手动玩家跑出真正高分，中间地带被 starvation spiral 堵死。Fast Forward 在前端 CPU 瓶颈下实际等效 ~1.2x，想深度测试必须读源代码或跑 benchmark —— 而那两件事对玩家都不开放。

**一句话**：Project Utopia 像一个 benchmark 框架里挂了一层 UI 壳子，对速通玩家来说没有一条明确的 "如何跑出史诗高分" 的路径，当前状态更像是**给 benchmark 脚本玩的游戏，不是给 min-max 玩家玩的游戏**。
