---
reviewer_id: 02a-rimworld-veteran
feedback_source: Round5/Feedbacks/02a-rimworld-veteran.md
round: 5
date: 2026-04-22
build_commit: 61ddd8a
priority: P0
estimated_scope:
  files_touched: 4
  loc_delta: ~110
  new_tests: 2
  wall_clock: 75
conflicts_with: []
---

## 1. 核心问题

**P0-1：Fallback AI 的角色配额从不随人口伸缩，导致 meal/haul pipeline 在人口>15 后结构性断裂。**

02a 在三张图（Plains / Highlands / Archipelago）观察到**完全相同的崩盘曲线**——2-3 分钟食物耗尽、5-6 分钟首批饿死，FARM=14、COOK=0、HAUL=1、HERBALIST=0、Meals/min=0。地形不变崩盘也不变，证明是 planner 层而非地图层问题。

读码定位到三个串联的病根（全部在 fallback/role 层，**与 Phase 9 的 "workers eat from carry" 结构问题正交**）：

1. **`RoleAssignmentSystem.js:62`** —— `roleQuotas` 默认 `{cook:1, smith:1, herbalist:1, haul:1, stone:1, herbs:1}`，**整场游戏固定 1**，不随 `n` 伸缩。20 人殖民地依然只有 1 个 COOK（而且被 kitchenCount>0 门槛卡死）。`farmMin=2 + woodMin=1 + 最多 5 个 specialist = 8` 名额被占后，剩下 12 个全部 `.role = ROLE.FARM`（第 123 行 `while (idx < n) workers[idx++].role = ROLE.FARM`）。
2. **`ColonyPlanner.js:586-598` Priority 3.5 Kitchen 门槛太严** —— `farms>=2 && food>=5 && wood>=8 && stone>=3 && clusters.length>0`。Plains 开局 `stone=4` 还要造 walls 7/8（每堵墙消耗石头），stone 长期卡在 3-4；Archipelago 开局 `stone=17` 但 fallback 照样先堆 farm。Kitchen 建造延后 → COOK 被 `kitchenCount > 0` 门（`RoleAssignmentSystem.js:66`）拒于门外 → Meals 始终 0。
3. **`RoleAssignmentSystem.js:84` HAUL 硬门槛 `n>=10` + quota=1** —— 人口到 20 人时仍然只有 1 名搬运工，所有 food/wood/stone 靠 FARM/WOOD/STONE 工人自己 carry+deliver。触发 `workerCarryPressureSec=3.8s` 阈值后 producer 停工回仓，农田 harvest 停转 → food 输入归零 → Priority 1 （`foodRate<0 && food<40`）又抽更多人去 FARM → 循环加剧。

这是**角色配额对人口/建筑状态的反馈环缺失**，不是"加一个建筑"或"加 tooltip"能修的。HW06 freeze 允许改 fallback planner 配额 + 平衡参数 + state transitions —— 这三个点全部落在允许范围内。

## 2. Suggestions（可行方向）

### 方向 A：人口-比例化配额 + Kitchen 门槛收紧 + 提前建 Warehouse（主推）

- 思路：把 `roleQuotas` 从"硬编码 1 人一槽"改为"基于人口的函数"——HAUL=`max(1, floor(n/6))`、COOK=`max(1, floor(n/8))`、HERBALIST=`max(1, floor(n/12))`。同时把 fallback Kitchen 门槛从 stone>=3 降到 stone>=2 且提到 Priority 2（在 warehouse/lumber 之前），并给 Kitchen 加"pop>=12 强制"分支。
- 涉及文件：`src/simulation/population/RoleAssignmentSystem.js`、`src/simulation/ai/colony/ColonyPlanner.js`、`src/config/balance.js`（新增伸缩系数常量）、`src/entities/EntityFactory.js`（默认 quotas 字段兼容）。
- scope：中（跨 AI/population 两层，但每处改动局部化）
- 预期收益：fallback AI 在 n=20 时 HAUL=3、COOK=2、HERBALIST=1，meal pipeline 启动；DevIndex 从 ~42 提升到 50+。
- 主要风险：`RoleAssignmentSystem` 的 quota 测试（若存在对"haul=1 固定"的断言）会 break，需同步更新。Kitchen 提前建可能挤占早期 wood 预算 → 需要 `ColonyPlanner.generateFallbackPlan` 中保留"wood<8 时推迟"的 short-circuit。

### 方向 B：动态 role rebalance hook（每次建筑/人口事件触发再分配，保留硬编码 quota=1）

- 思路：不改 quota 数字，而是在 `RoleAssignmentSystem.update` 每次 tick 开头检查 `buildings.kitchens>0 && observedMealsPerMin==0 && n>=12` → 临时 override COOK quota=`floor(n/8)`；同理 HAUL override。每次 tick 重新计算，快速响应。
- 涉及文件：`src/simulation/population/RoleAssignmentSystem.js` 单文件；`src/simulation/telemetry/EconomyTelemetry.js` 读取 meals/min。
- scope：小（单文件 +30 LOC）
- 预期收益：少量代码修复核心崩盘；保留 UI slider 的"玩家设置值就是上限"语义。
- 主要风险：override 逻辑与 UI slider 冲突（UI 写 quota=1 但 override 改成 3 → toolbar 显示会漂移）；只是"绕过"而非"修正"默认配置，将来新手玩家关 autopilot 依旧遇到同样坑。

### 方向 C：把 HAUL 从 specialist 配额独立成"基础角色"（类 FARM/WOOD）

- 思路：`RoleAssignmentSystem` 把 HAUL 从 specialist 块（受 quota 限制）挪到基础块（像 farmMin/woodMin 一样按人口比例分配），`haulMin = max(1, floor(n*0.15))`。
- 涉及文件：`src/simulation/population/RoleAssignmentSystem.js`。
- scope：小-中
- 预期收益：解决 HAUL 单点瓶颈；更贴近 RimWorld 的 "hauling priority" 本质。
- 主要风险：偏离"quota 统一管理"的架构一致性；BuildToolbar 的 haul slider 会变成"事后上限"而非"设定值"，UX 混乱；不解决 COOK/HERBALIST 同类问题。

## 3. 选定方案

选 **方向 A**。理由：

1. **02a 的 3 条独立症状（COOK=0、HAUL=1、Meals 长期 0）同时由同一修改解决** —— 人口比例化 quota 直接提高 COOK/HAUL/HERBALIST 配额上限，Kitchen 门槛下调打开 COOK gate，三点串联。
2. 方向 B 是"补丁绕过"，留下技术债；方向 C 只修 HAUL 不修 COOK/HERBALIST。
3. 落在 HW06 freeze 允许范围（fallback planner 配额 + 平衡参数 + state transitions，无新 mechanic、无新 tile/building/resource）。
4. 修改量适中（~110 LOC），新增 2 个测试即可覆盖；不会破坏 v0.8.1 Phase 8 survival hardening 的 pop-throttle（MIN_FOOD_FOR_GROWTH=30、FOOD_COST_PER_COLONIST=10 保持不动）。
5. 对现有 865 个测试的冲击面可预测：主要是 `test/RoleAssignmentSystem.*.test.js`（若有硬编码 quota=1 的断言）和 `test/ColonyPlanner.fallback.*.test.js`（Kitchen 门槛变更）。

## 4. Plan 步骤

- [ ] **Step 1**: `src/config/balance.js:~139` — `edit` — 在 `objectiveFarmRatioMax: 0.82,` 行之后、`objectiveHoldDecayPerSecond:` 之前新增一个 frozen 子对象 `roleQuotaScaling`，包含 `cookPerWorker: 1/8`（表示每 8 人配 1 个 COOK）、`haulPerWorker: 1/6`、`herbalistPerWorker: 1/12`、`smithPerWorker: 1/10`、`stonePerWorker: 1/8`、`herbsPerWorker: 1/10`、`haulMinPopulation: 8`（从 10 → 8，更早激活 HAUL）、`cookMinKitchenReady: 0`（表示只要有 kitchen 就按比例配）。全部 `Object.freeze`。
- [ ] **Step 2**: `src/simulation/population/RoleAssignmentSystem.js:62-85` — `edit` — 把 `const quotas = state.controls?.roleQuotas ?? { cook: 1, ... }` 改为：读 `state.controls?.roleQuotas` 作为**玩家设置的硬上限**（若为 undefined 则视为无限大），然后以 `scaled(key) = max(1, floor(n * BALANCE.roleQuotaScaling[${key}PerWorker]))` 生成"人口伸缩值"，最终 `q(key) = min(scaled(key), playerSetMax(key))`。HAUL 门槛同步改成 `warehouseCount >= 1 && n >= BALANCE.roleQuotaScaling.haulMinPopulation`。
  - depends_on: Step 1
- [ ] **Step 3**: `src/simulation/population/RoleAssignmentSystem.js:47-50` — `edit` — 把 `const farmMin = Math.min(2, n);` 改为 `const farmMin = Math.min(Math.max(2, Math.floor(n * 0.25)), n);`（人口>=8 时基础农民也往上走，但比例绝不超过总人口 25%，防止 n=20 时 farmMin=2 之后 specialist 刚够配就全塞到 FARM 里）。同时 `const woodMin = lumberCount > 0 ? Math.min(Math.max(1, Math.floor(n * 0.10)), n - farmMin) : 0;`。
  - depends_on: Step 2
- [ ] **Step 4**: `src/simulation/ai/colony/ColonyPlanner.js:586-598` — `edit` — `generateFallbackPlan` 里的 Priority 3.5 Kitchen 分支：把触发条件从 `kitchens === 0 && farms >= 2 && food >= 5 && workerCount >= 2 && wood >= 8 && stone >= 3 && clusters.length > 0` 改为：基础门槛 `farms >= 2 && food >= 5 && wood >= 8 && stone >= 2 && clusters.length > 0`；**额外加人口强制分支**：若 `kitchens === 0 && workerCount >= 12 && wood >= 8 && stone >= 2`，priority 从 `"high"` 升到 `"critical"`，thought 改为 "Pop exceeds meal throughput — forcing kitchen before more farms"。
  - depends_on: （独立，但与 Step 2 协同放大收益）
- [ ] **Step 5**: `src/simulation/ai/colony/ColonyPlanner.js:501-518` — `edit` — Priority 1（food crisis）里，若 `workerCount >= 12 && kitchens === 0 && food >= 5 && wood >= 8 && stone >= 2`，**跳过**新增第二个 farm step，改为插入一个 kitchen step（复用 Step 4 新分支）。防止"堆农田而无厨"的死循环。
  - depends_on: Step 4
- [ ] **Step 6**: `src/entities/EntityFactory.js:791` — `edit` — 把默认 `roleQuotas: { cook: 1, smith: 1, herbalist: 1, haul: 1, stone: 1, herbs: 1 }` 改为 `roleQuotas: { cook: 99, smith: 99, herbalist: 99, haul: 99, stone: 99, herbs: 99 }`（99 作为"不限制"哨兵值；Step 2 的 `min(scaled, playerMax)` 将由 scaled 主导）。BuildToolbar slider 仍然可以让玩家手动压回 1-5 之间。
  - depends_on: Step 2
- [ ] **Step 7**: `test/RoleAssignmentSystem.quota-scaling.test.js` — `add` — 新测试文件覆盖：(a) n=10 时 haulSlots>=1、cookSlots>=1（kitchen 存在条件下）；(b) n=20 时 haulSlots>=3、cookSlots>=2；(c) 玩家在 UI 把 cook quota 设成 1 时 cookSlots 被压到 1（上限语义保留）；(d) kitchen 不存在时 cookSlots=0（gate 不破）。
  - depends_on: Step 2, Step 6
- [ ] **Step 8**: `test/ColonyPlanner.fallback.kitchen-gate.test.js` — `add` — 新测试文件覆盖：(a) pop=12、stone=2、wood=8、farms=2、kitchens=0 → plan 必须包含 `action.type === "kitchen"` 且 `priority === "critical"`；(b) pop=8、stone=1 → 不触发；(c) foodRate<0 且上述强制条件满足时 → plan 第一步是 kitchen 而不是第二个 farm（断言 `steps[0].action.type === "kitchen"` 或第一个非 farm step 是 kitchen）。
  - depends_on: Step 4, Step 5
- [ ] **Step 9**: `src/ui/tools/BuildToolbar.js:327-330` — `edit` — 把默认 `{ cook: 1, smith: 1, herbalist: 1, haul: 1, stone: 1, herbs: 1 }` 同步改为 99（与 EntityFactory 对齐），避免加载旧 snapshot 时 UI 把已扩大的 quota 又压回 1。注释标明 "99 = unlimited; pop-scaled default in RoleAssignmentSystem"。
  - depends_on: Step 6

## 5. Risks

- **Rebalance 可能触发过 aggressive 的 COOK 配额** —— 若 kitchen 存在但 food 储备极低（<10），额外 COOK 占用会让 FARM 更少；缓解：Step 2 在 `emergency = food<foodEmergencyThreshold` 分支里保留 `effectiveRatio = max(farmRatio, 0.82)` 的原行为，scaled cook 先 -1 让路给 FARM 紧急响应。
- **v0.8.1 的 pop-throttle 与新 quota 的叠加效应** —— 更多 HAUL/COOK 意味着 FARM 减少，早期 food 积累更慢 → `MIN_FOOD_FOR_GROWTH=30` 到达更晚 → 出生率略降。这是预期权衡（02a 已指出"5 分钟饿死"比"少生几人"严重得多）；benchmark 监控 `pop @ day 90` 不能比当前值（42-44 区间）掉 >15%。
- **`roleQuotas: 99` 哨兵语义与快照反序列化** —— 旧存档加载时 `state.controls.roleQuotas.cook=1` 会被当作玩家硬上限，用户体验会突然"我之前能跑的配置现在 COOK 只剩 1"；缓解方案：`RoleAssignmentSystem` 第 62 行检测 `playerMax===1 && scaled>1` 并记一条 onceOnly console.warn；或加一个 snapshot migration 把旧的 1 改写为 99。（Plan 推荐后者，但留给 Coder 判断。）
- **可能影响的现有测试**（候选清单，Coder 需 `grep -r 'roleQuotas\|haulSlots\|cookSlots' test/`）：
  - `test/RoleAssignmentSystem.*.test.js` —— 若有硬编码 `cookSlots === 1` / `haulSlots === 1` 断言
  - `test/ColonyPlanner.fallback.*.test.js` —— Kitchen gate（stone>=3 vs stone>=2）
  - `test/GameApp.snapshot-*.test.js` —— 默认 quotas 值
  - `test/BuildToolbar.*.test.js` —— UI 默认读取
  - `test/long-horizon-*.test.js` / benchmark snapshot —— DevIndex 期望值需要**上调**（这是收益不是回退）

## 6. 验证方式

- **新增测试**：
  - `test/RoleAssignmentSystem.quota-scaling.test.js` 覆盖 n=10/n=20/玩家压上限/建筑不存在四场景（Step 7）。
  - `test/ColonyPlanner.fallback.kitchen-gate.test.js` 覆盖 pop>=12 强制 kitchen 与 foodRate<0 不堆 farm（Step 8）。
- **回归测试**：`node --test test/*.test.js` 全 865 个必须仍然 pass（允许 Step 2 改变导致的 1-3 个 quota=1 硬编码断言需同步更新）。
- **手动验证**（Enhancer 复现的同场景）：
  1. `npx vite` → 打开 http://localhost:5173
  2. Scenario: Temperate Plains (Broken Frontier)，seed=42，Autopilot ON，4x FF
  3. 等到 **in-game 10 分钟**（对应 02a feedback 里崩盘点）
  4. 期望：Colony 面板显示 COOK >= floor(pop/8)、HAUL >= floor(pop/6)、HERBALIST >= 1（若 clinic 存在）
  5. 期望：Meals/min > 0（上行 banner 里看到 "First meal cooked"）
  6. 期望：Food 不归零，Pop 死亡数 <= 2
- **benchmark 回归**：`scripts/long-horizon-bench.mjs`（或 v0.8.1 引入的同名 harness），**seed=42 / temperate_plains / 365 天**，DevIndex 必须 **>= 44**（当前 v0.8.1 基线，允许持平即不回归；目标 >= 50，若超 55 则意味着 P0-1 根治）。Deaths 总数 **<= 454**（当前 v0.8.1 基线 454）；Meals/min 365 天均值 **> 0**（当前 fallback 为 0）。
- **显式验证度量**（写进 PR 描述）：
  - `fallback AI 10 分钟 Meals/min > 0`（当前：0；目标：>= 0.3）
  - `COOK 角色数 >= floor(人口/8)`（当前：恒为 1；目标：随人口线性增长）
  - `benchmark DevIndex seed=42 plains 365 天 >= 44 且目标 >= 50`

## 7. UNREPRODUCIBLE 标记

N/A —— 本 plan 不依赖 Playwright 现场复现。02a feedback 附有 14 张截图与 3 局 session 的逐秒日志，三张图行为一致（2-3 分钟 food 归零、5-6 分钟首批饿死、FARM=14/COOK=0/HAUL=1），读码定位到 `RoleAssignmentSystem.js:62 / :84` 与 `ColonyPlanner.js:586` 三点病根，与 feedback "FARM 堆 14 / COOK 0 / HAUL 1" 观测完全吻合，归因链闭合。
