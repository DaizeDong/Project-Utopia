---
reviewer_id: 01c-ui
feedback_source: Round5/Feedbacks/01c-ui.md
round: 5
date: 2026-04-22
build_commit: 61ddd8a
priority: P1
estimated_scope:
  files_touched: 4
  loc_delta: ~140
  new_tests: 2
  wall_clock: 90
conflicts_with: []
---

## 1. 核心问题

Reviewer 列了 17 条表面缺陷（○○○ 占位符、z-index、800×600 崩、图标不统一、ellipsis 截断、配色、按钮 padding…），其中本轮 summary 第 5 节把**响应式/z-index/配色**归入"D5 不采纳"，把 **Heat Lens 不真染色**归入"P0-2 观察闭环派生"，把 **HUD 数据高密度但因果密度 0**归入 **P1-2**。

在读源码后，真正的根本问题只有一条、一次可修：

- **HUD 因果断层 — "Food -151.7/min 无来源拆分 / Dev 49 无维度与阈值"**。
  具体代码证据：
  - `src/ui/hud/HUDController.js:545-557` 已经预留了 `#foodRateBreakdown` DOM 节点，会读取 `state.metrics.foodProducedPerMin / foodConsumedPerMin / foodSpoiledPerMin`，并意图输出 `(prod +X / cons -Y / spoil -Z)`。但全仓库 Grep `foodProducedPerMin|foodConsumedPerMin|foodSpoiledPerMin` **只命中这 1 个文件**——simulation 层**从来没有写入**过这些字段。于是 `foodRateBreakdown` 永远渲染为空字符串，玩家看到的只剩 `▼ -151.7/min`，**读数据的 UI 是存在的，产数据的 simulation 端是断的**。
  - `src/simulation/npc/WorkerAISystem.js:389-400, 469-471` 是 food 的消费点（worker 吃 carry / 吃 warehouse），`:550` 是 food 的产出点（unloadFood 进 warehouse）；`src/simulation/population/PopulationGrowthSystem.js:70` 是新 colonist 的开销。这三处全部直接改 `state.resources.food` 而没有发出"消耗 / 产出 / 腐败"事件，所以 HUDController 无论用什么公式都算不出拆分。
  - Dev 49 的断层同理：`src/simulation/meta/DevIndexSystem.js:95-100` 已经把 6 维分数写进 `state.gameplay.devIndexDims`，`HUDController.js:39-49` 的 `buildDevIndexTooltip` 已经会把它渲进 `title` tooltip。但玩家看到的 HUD 正文仍然是 `Dev 49/100` 一串数字——**数据在 state 里、在 tooltip 里，但不在第一屏视觉里**，只要玩家不 hover 就永远看不到"下一档差哪一维"。

这不是"调色 / 调 margin / 换图标"能解。是 **simulation 层漏记 food 的流向统计 + HUD 层没把已存在的 devIndexDims 提升为可见元素**，正好是 HW06 freeze 允许的"暴露已有 breakdown 到 UI + 修 renderer bug"范围。

## 2. Suggestions（可行方向）

### 方向 A: Food 因果拆分 +（次要）Dev 弱维度高亮（结构最小改动）

- 思路：在 `ResourceSystem` 每 tick 末快照 `state.resources.food`，对比上一 tick，用**已有事件 / WorkerAI 行为痕迹**反推 consumed/produced/spoiled（bucketing 3 秒窗口 → per-min 折算）写入 `state.metrics.foodProducedPerMin / foodConsumedPerMin / foodSpoiledPerMin`；HUDController 那头不用改（它已经在读）。Dev 部分在 `HUDController.render()` 的 `statusObjectiveDev` 节点下追加一个 `(lowest: defense 18)` 徽章，指出**最弱那一维**——数据已在 `state.gameplay.devIndexDims` 里。
- 涉及文件：
  - `src/simulation/economy/ResourceSystem.js`（新增 per-tick food-flow 快照 + 累计到 per-min metric，~40 LOC）
  - `src/ui/hud/HUDController.js`（extend `statusObjectiveDev` 后追加弱维度徽章 + 让 `foodRateBreakdown` 在无数据时显示占位 `(waiting…)`，~30 LOC）
  - `public/index.html` 或 `src/ui/layout/*`（如果需要新增一个 `<span id="statusObjectiveDevWeak">` 节点，~4 LOC）
  - `test/food-rate-breakdown.test.js`（2 个新测试：simulation 填数据后 HUD 能读到 / DevWeakest 正确挑出最低维）
- scope：小-中（~70-140 LOC，其中一半是测试）
- 预期收益：玩家从"Food -151.7/min"看到下一行 `(cons -180 / prod +28)` 秒懂"是吃太多不是产不够"；从 Dev 49 看到 `lowest: defense 18` 秒懂下一档要修什么。**P1-2 的因果密度从 0 提到可读**。
- 主要风险：
  - 3 秒窗口下 spoil 很难从 food 单列反推（目前 spoilage 机制本身只在 spoilageSystem/WarehouseQueue 里间接扣），方向 A 如果硬推会把"被 kitchen 消耗到 meals"错标为 spoil；保守做法是**只填 produced+consumed，spoil 栏先空**，等 spoilage 系统补 emit 再填。
  - 新增的 ResourceSystem snapshot 若放错位置（update() 最前 or 最后）会让 0 tick 偏差 100%。

### 方向 B: Heat Lens 真染色覆盖率提升（P1-3 派生路径）

- 思路：`src/render/PressureLens.js:284-395` 的 `buildHeatLens` 只在建筑 tile 发 marker（最多 48 个、只染 FARM/KITCHEN/SMITHY/CLINIC/WAREHOUSE），导致整张 96×72 图 7000 tile 里仅 <1% 被染色——这就是 reviewer "Heat Lens ON 后地图没颜色变化" 的根因。方案：把染色从"建筑 tile"扩展到"tile + 周边半径 2 的邻域"，或把 `anyHotWarehouseAdjacent` 判据放宽到"任何有 density 分数的 warehouse"，并在 `SceneRenderer.js:1313-1334 #updateHeatTileOverlay` 把 opacity 0.46→0.58，pulse amplitude 0.22→0.28。
- 涉及文件：
  - `src/render/PressureLens.js`（扩 `buildHeatLens` 的邻域，~40 LOC）
  - `src/render/SceneRenderer.js`（`HEAT_TILE_OVERLAY_VISUAL` 调 opacity + amplitude，~10 LOC）
  - `test/heat-lens-coverage.test.js`（新增 1 个测试：在一个有 4 warehouse + 6 farm + 2 kitchen 的 state 上，染色 tile 数 ≥ 20）
- scope：小（~50-80 LOC）
- 预期收益：Heat Lens 从"UI 文案指向不存在的视觉"变成"按 L 后 10-20% tile 真的有红/蓝半透明染色"——直接修 reviewer 第 5 条缺陷 + summary P1-3。
- 主要风险：
  - 扩邻域会让渲染 pool 峰值上升（MAX_HEAT_MARKERS 48 可能不够）；需要同步抬到 96-120，否则盖不全。
  - 改变现有 buildHeatLens 的输出会让 `test/heat-lens.test.js` 系列现有快照失效（若存在）。

## 3. 选定方案

选 **方向 A — Food 因果拆分 + Dev 弱维度高亮**。

理由：
1. 本轮选择偏置要求"本质优先于表面"。方向 A 触达 summary 第 5 节明确列为 **P1-2（"HUD 数据高密度但因果密度 0"）**的根因（simulation 写入缺失），方向 B 只触达 P1-3 且属视觉增强。
2. 方向 A 的**修 HUD 已预留但未通电的数据管道**是典型的"暴露已有 breakdown 到 UI + 修 renderer bug"——正好在 HW06 freeze 显式允许的白名单里（见 Runtime Context 硬约束 3）。
3. 方向 A 的可度量指标（玩家能从 HUD 直接回答 "Food 负数原因" 的占比 ≥80%）是 P1-2 最直接的验证，且不依赖美术 / 内容工作。
4. 方向 B 的 Heat Lens 染色其实已经在 PressureLens.js 写全，只是邻域窄——属"tuning"，方向 A 则是"填补 data contract 空洞"——后者的系统深度更高，符合 orchestrator 本轮偏置。
5. 方向 A **不会破坏现有测试**（只新增 metrics 字段，不重命名、不改公共 API），而方向 B 的 `buildHeatLens` 已被多处测试覆盖。

## 4. Plan 步骤

- [ ] **Step 1**: `src/simulation/economy/ResourceSystem.js:update()` — **edit** — 在 `update(dt, state)` 最前段（目前是 L170 的 `Number.isFinite` clamp 之前）插入 **food-flow 快照初始化**：读上一 tick 快照 `state._foodFlowSnapshot = state._foodFlowSnapshot ?? { food: state.resources.food, windowSec: 0, produced: 0, consumed: 0 }`。在 `update()` 返回前（目前 L200 wood-shortage 之后、新增一段）：计算 `delta = state.resources.food - prev.food`，`delta >= 0` 累加到 `produced`，`delta < 0` 累加到 `consumed`。`windowSec += stepSec`；窗口 ≥ 3 秒时把累计值 × 60 / windowSec 折算 per-min 写进 `state.metrics.foodProducedPerMin / foodConsumedPerMin`，然后重置快照。（**不**估算 spoil，留为 0）。

- [ ] **Step 2**: `src/simulation/economy/ResourceSystem.js:update()` — **edit** — 同样对 `wood / stone / herbs / meals` 各加一条 per-min 累计（合并为一个 `trackResourceFlow(state, "food"/"wood"/...)` 辅助函数写在文件顶部）。HUDController 已有 `woodRateVal/stoneRateVal/...`，但 breakdown DOM 目前只给 food，所以本步只保证 food 通路可靠，其他资源只是"预埋 future hook"不加 HUD 元素。
  - depends_on: Step 1

- [ ] **Step 3**: `src/ui/hud/HUDController.js:545-557` — **edit** — 把 breakdown 的"空数据"分支改成明确提示：当 `prod+cons+spoil < 0.05` 时写 `(sampling…)`（而不是 `""`），避免玩家以为 UI 坏了。保留 prod/cons/spoil 三段拼接格式。

- [ ] **Step 4**: `src/ui/hud/HUDController.js:buildDevIndexTooltip()` / `render():statusObjectiveDev` — **edit** — 在 L934 `this.statusObjectiveDev.textContent = ... "Dev ${devScore}/100"` 之后追加：计算 `dims = state.gameplay.devIndexDims`，找出 `Object.entries(dims)` 中**最低值的那一维**；若该维 < devScore - 8 则把 `statusObjectiveDev.textContent` 改写为 `Dev ${devScore}/100 · weakest: ${dimKey} ${Math.round(dimValue)}`。这给了 reviewer 要的"Dev 49 下一档需要什么"——实际暴露的是"最弱一维"，比"下一档阈值"更可操作。casualMode 下保留原有纯数字格式。

- [ ] **Step 5**: `test/food-rate-breakdown.test.js` — **add** — 新建测试：(a) 构造 state 让 food 从 100 → 40 over 3 秒，跑 ResourceSystem.update 10 次，断言 `state.metrics.foodConsumedPerMin` 在 `[1100, 1300]` 区间（delta -60 / 3s * 60 = -1200）；(b) 反过来 food 40 → 100 → `foodProducedPerMin` 在 `[1100, 1300]`；(c) stable（food 不变）→ 两者都 0。
  - depends_on: Step 1

- [ ] **Step 6**: `test/hud-dev-weakest.test.js` — **add** — 构造 `state.gameplay.devIndexDims = { population: 80, economy: 70, infrastructure: 30, production: 75, defense: 18, resilience: 60 }`，runs HUDController.render() on a minimal jsdom DOM，断言 `#statusObjectiveDev` 的 textContent 包含 `"weakest: defense 18"`；再断言当所有维度都 >= devScore - 8 时**不**追加后缀（避免总分高时信息噪声）。
  - depends_on: Step 4

- [ ] **Step 7**: `src/ui/hud/HUDController.js:#applyGlossaryTooltips` — **edit** — 在 `pairs` 数组里（L251-260）追加 `[document.getElementById("foodRateBreakdown"), "foodRateBreakdown"]`，并在 `src/ui/hud/glossary.js` 里加一条 `foodRateBreakdown: "Rate shown is net per-minute change; breakdown splits production (farms/kitchen) vs consumption (worker eating) over the last 3 sec."`。让 hover Food-rate 时玩家能看到因果解释。
  - depends_on: Step 3

## 5. Risks

- **R1 — 快照位置错会让 Step 1 的 delta 把 WorkerAI 的 intra-tick 临时写入当成净流**。缓解：把快照 **放在 ResourceSystem.update() 最前面**（即 SYSTEM_ORDER 内 ResourceSystem 之前的系统已完成本 tick 所有 food 写），并且快照**只在 tick 边界**比较上一 tick 的最终值——不在 sub-tick 比较。
- **R2 — 3 秒窗口刚好跨过 kitchen 批量 produce（+20）会让 prod 出现尖峰** `+400/min`。缓解：用 `Math.min` 夹到合理上限（± 800/min）或在 UI 端 format 时 toFixed(0) 不显示小数。
- **R3 — 弱维度徽章若 Dev 本身很高（例如 95），最弱维可能也 ≥ 85，追加后缀会变噪声**。Step 4 已用 `< devScore - 8` 的 guard，避免 90+ 玩家看到 "weakest: defense 82"。
- **R4 — casual-mode 下 statusObjectiveDev 可能被 CSS 或 JS 清空（见 L976-990 类似 statusScoreBreak 的处理）**；需要 Step 4 同样在 casual 下退回纯 "Dev N/100"。
- **R5 — 可能影响的现有测试**：`test/hud.test.js`（若 assert 过 statusObjectiveDev 的精确 textContent 是 `Dev 49/100`）、`test/resource-system*.test.js`（若 snapshot state.metrics 全量）。Step 4 必须在 devScore ≥ 50 且弱维 ≥ devScore - 8 的常见测试 fixture 下不改变 textContent，以保留向后兼容。

## 6. 验证方式

- **新增测试**：
  - `test/food-rate-breakdown.test.js` — 覆盖 Step 1 的 food-flow 快照正确性（消耗场景、产出场景、稳态场景 3 个）。
  - `test/hud-dev-weakest.test.js` — 覆盖 Step 4 的弱维度追加逻辑（有弱维 / 无弱维 / casual-mode 3 个）。
- **手动验证**：
  1. `npx vite` → `http://localhost:5173` → Start Colony（temperate_plains / seed 42）→ Autopilot ON → 等到饥饿开始（Food 开始下降）。
  2. 预期在 `#foodRateVal` 旁看到 `(cons -180)` 或 `(prod +20 / cons -180)` 拼接；5 秒内从 `(sampling…)` 切换为真实数值。
  3. 打开 Colony 面板前 1 分钟 Dev 通常 20-40，断言 `#statusObjectiveDev` 显示如 `Dev 28/100 · weakest: defense 5`。
  4. 切到 casual uiProfile（body class `casual-mode`），刷新 → 预期 `#statusObjectiveDev` 退回纯 `Dev 28/100`，无 "weakest" 后缀。
- **可度量指标（plan 承诺）**：
  - 10 分钟 Autopilot 采样：每 30 秒截屏一次 HUD，统计 `#foodRateBreakdown` 非空且非 `(sampling…)` 的帧占比 **≥ 80%**。
  - `#statusObjectiveDev` 在 Dev < 50 的帧中显示 weakest 后缀的比例 **≥ 70%**（低分时弱维判据几乎一定触发）。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 30` —— DevIndex 不得低于 Round5 基线 44 - 5% = 41.8（本 plan 只加 metrics 字段和 UI 读取，不改 simulation 数值行为，预期持平）。
- **明确不是做什么**：这份 plan **不改配色、不改 margin、不改 z-index、不改图标字体、不做 800×600 compact 布局、不加音效、不改 heat lens 染色覆盖率**——reviewer 列的 17 条表面缺陷里，有 13 条被本 plan 显式放弃，因为它们不打在 P1-2 因果断层的病灶上。

## 7. UNREPRODUCIBLE 标记（如适用）

未使用 Playwright 现场复现；源码 Grep 已足够证伪：全仓库 `foodProducedPerMin|foodConsumedPerMin|foodSpoiledPerMin` 仅在 `src/ui/hud/HUDController.js` 一个文件出现，且**只在读端**。HUD 读一个仿真层从未写入的字段 → 空 breakdown → reviewer 在截图 05/09 观察到的"Food -151.7/min 光秃秃一个数字"完全可由代码层面解释，无需运行时复现。
