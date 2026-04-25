---
reviewer_id: 02a-rimworld-veteran
feedback_source: Round6/Feedbacks/02a-rimworld-veteran.md
round: 6
date: 2026-04-25
build_commit: 5622cda
freeze_policy: lifted
priority: P0
estimated_scope:
  files_touched: 9
  loc_delta: ~360
  new_tests: 4
  wall_clock: 90
conflicts_with: []
---

## 1. 核心问题

老兵的 3/10 分背后只有三个真正的根本问题（10+ 散点 findings 收敛）：

1. **Building Inspector 只对 KITCHEN/SMITHY/CLINIC 有数据，其他生产/物流 tile 全部沉默；同时 worker Carry 只显示 food + wood 两条线** —— 两者合起来构成"colony sim 灵魂面板缺口"。`InspectorPanel.js:78-107` 已经有 processing block 框架，但 FARM / LUMBER / QUARRY / HERB_GARDEN / WAREHOUSE 没有 input/output/idle reason；entity carry 字段 `InspectorPanel.js:179` 硬编码只读 `entity.carry.food/.wood`，stone/herbs 直接被 truncate 掉。reviewer 的"5 wood 卡死"和"80 工人空手 halo"两个体感都从这一处发散。

2. **Heat Lens halo pass 用字面字符串 "halo" 当 label，90% 占满屏的"halo"被 reviewer 当成调试残留** —— `PressureLens.js:409` 是孤立的一行 placeholder，halo 应该 inherit parent 的 throughput 语义（"around no cook" / "around stone empty" 等）或者干脆不渲染 label。这是"会摆 colony sim 的形状但还没长牙"的最直接物证。

3. **22 分钟 0 raid / 0 fire / 0 disease**——不是事件系统不存在（`WorldEventSystem.js` + `RaidEscalatorSystem.js` 都在），而是 raid 唯一生成路径是 `EnvironmentDirectiveApplier.js:14`（LLM directive → enqueueEvent），而玩家 session 100% 跑在 fallback 模式（`Why no WHISPER?: LLM errored`），fallback 不发 raid directive。结果就是 `raidIntervalBaseTicks=3600` 这个 tier-0 节奏永远不被触发。这是 lifted-freeze 下唯一真正的"event drought 病因"。

> 取舍说明：Splash 无端覆盖 / Esc 返回主菜单 / autopilot 双 toggle / 重复 milestone toast 都是 P1 UX 杂症，被 02b/02c 等 reviewer 合并处理更合适；本 plan 集中火力在 colony-sim 老兵感知最强的三处结构缺陷，跟 freeze_policy=lifted 的指引一致。

## 2. Suggestions（可行方向）

### 方向 A: Inspector 三件套（building 全覆盖 + 全资源 carry + halo 语义化）

- 思路：把 `InspectorPanel.js` 的 building block 从仅 3 种处理建筑扩展到 8 种（FARM/LUMBER/QUARRY/HERB_GARDEN/WAREHOUSE 各加 input/output/last-yield/idle-reason 行）；`carry` 字段改成迭代 `{food,wood,stone,herbs}` 全量；`PressureLens.js:409` 把 `label: "halo"` 改成从 parent.label 派生 "near <parent.label>" 或 inherit 语义类标签。
- 涉及文件：`src/ui/panels/InspectorPanel.js`、`src/ui/interpretation/WorldExplain.js`（新加 `getBuildingProductionInsight`）、`src/render/PressureLens.js`、`src/simulation/economy/ResourceSystem.js`（暴露 perBuilding yield snapshot）。
- scope：中（150-220 LOC，纯 UI/读写 metrics）
- 预期收益：直接消除老兵两条扣分大头："building 不可选 deal-breaker" + "halo placeholder"。视觉密度立刻"长出 colony-sim 牙齿"。
- 主要风险：InspectorPanel 是高频渲染面板，`lastHtml` diff 已存在；新增 build snapshot 不能引入 GC 抖动。要复用 frozen array buffer。

### 方向 B: Survival 事件保底节拍（fallback path 也发 raid）

- 思路：在 `RaidEscalatorSystem.js` 末尾加一个 "scheduler" pass：当 `state.gameplay.lastRaidTick` 距今超过 `intervalTicks` 且 `tier >= 1`，且当前没有 LLM directive 排队时，直接 `enqueueEvent(state, BANDIT_RAID, {}, 18, intensityMultiplier)`。这样 fallback session（评测环境 100% 命中）也能在 Day 8-10 看到第一次 raid，不再"永生 plateau"。
- 涉及文件：`src/simulation/meta/RaidEscalatorSystem.js`、`src/world/events/WorldEventQueue.js`（仅引入），新加 `test/raid-fallback-scheduler.test.js`。
- scope：小-中（50-80 LOC）
- 预期收益：把 reviewer "0 raid / threat 27%↔58% 漂浮 / scenario brief 是空话" 三连击直接破除。配合方向 A 的 Inspector 数据流，玩家能感知到事件确实发生了。
- 主要风险：raid 提前打到死亡螺旋边缘的 colony 会让 4-seed benchmark deaths 飙升；必须做"resource floor / population floor / first-raid grace"三重 gate，benchmark gate (median≥42, deaths≤499) 不能崩。

### 方向 C: 单 Worker 个性深度（trait 系统 v0）

- 思路：给 EntityFactory 的 worker 创建路径加 `traits: ["lazy"|"hardy"|"clumsy"|"green-thumb"]` 0-2 个，影响 utility 评分系数。Inspector 显示 trait list。
- 涉及文件：`src/entities/EntityFactory.js`、`src/simulation/npc/WorkerAISystem.js`（utility hook）、`src/ui/panels/InspectorPanel.js`、新加 `test/worker-traits.test.js`。
- scope：大（250-400 LOC，触碰 worker AI 评分 → 必然影响 benchmark deaths）
- 预期收益：直接命中老兵"worker 没有灵魂"的最大痛点，但 RimWorld 老粉口味很挑，做半成品反而更扣分。
- 主要风险：（a）4-seed benchmark gate 高概率破裂——utility 系数被 trait 扰动；（b）需要在 freeze-lifted 下落实，但 R5b 02d-roleplayer 已经在 personality 方向投过资，再 stack 容易冲突；（c）单 round 90 分钟预算下做不到"4-5 个 trait + benchmark stable" 的稳态。

## 3. 选定方案

选 **方向 A + 方向 B 的合并最小集**。理由：

1. **A 是 colony sim deal-breaker 的最低还债**——reviewer 在"最想修 5 件事"清单里第 1 条就是 Building Inspector，第 3 条是 halo 替换，两件事用同一份 plan 就能根治；Carry 全量补丁是 5 LOC 的硬 bug fix，没理由不连带。
2. **B 是 freeze=lifted 下唯一能把 reviewer "0 raid"扭转的最小手术**——不引入新 mechanic（raid 系统已经存在），只补 fallback 触发路径。带 floor/grace gate 后 benchmark 风险可控。
3. **拒绝 C** 因为 trait 系统是"做半成品比不做更糟"的领域，且单轮 90 分钟预算 + benchmark gate 双约束下风险/收益比最差。02d-roleplayer 已经在该方向有 plan 沉淀，避免趋同。
4. A + B 合计 ~360 LOC、4 新测试，单 Coder 90 分钟可达；都不动 `src/benchmark/**`、`scripts/long-horizon-bench.mjs`、`package.json`、`vite.config.*`，符合本轮 frozen 边界。

## 4. Plan 步骤

- [ ] **Step 1**: `src/ui/panels/InspectorPanel.js:179` — `edit` — `carry` 字段从硬编码 food/wood 改成 `["food","wood","stone","herbs"].map(k=>\`${k}=${(entity.carry?.[k]??0).toFixed(2)}\`).join(", ")`，2 行 → 1 行。

- [ ] **Step 2**: `src/ui/panels/InspectorPanel.js:78-107` — `edit` — 把 `PROCESSING_KINDS` map 扩展为 `BUILDING_KINDS`，新增 `[TILE.FARM]:"farm" / [TILE.LUMBER]:"lumber" / [TILE.QUARRY]:"quarry" / [TILE.HERB_GARDEN]:"herb_garden" / [TILE.WAREHOUSE]:"warehouse"` 5 项。Building block 的 input/output 从 `state.metrics.processing` 读，新增对 raw producer 的回退：从 `state.metrics.production?.byTile?.[ix,iz]` 读"last yield" / "idle reason"（来源见 Step 3）。
  - depends_on: Step 1

- [ ] **Step 3**: `src/simulation/economy/ResourceSystem.js:rebuildBuildingStats` — `edit` — 新增 `state.metrics.production = { byTile: Map<"ix,iz", {kind,lastYield,lastTickSec,idleReason|null}>, lastUpdatedSec }`。在 farm/lumber/quarry/herb harvest tick 处（参考 `WorkerAISystem.js` farm-yield-pool 路径）写入 entry。Map 复用 frozen Map instance，避免 GC。
  - depends_on: Step 2

- [ ] **Step 4**: `src/render/PressureLens.js:409` — `edit` — `label: "halo"` 替换为 `label: parent.label ? \`near ${parent.label}\` : ""`。同时 `id: \`halo:${parent.id}:${dx}:${dz}\`` 保留（test/heat-lens-coverage.test.js 仍依赖 `halo:` 前缀）。

- [ ] **Step 5**: `src/simulation/meta/RaidEscalatorSystem.js:update` — `edit` — 在 `ensureEscalationState(state)` 之后、return 之前加 fallback scheduler block：
  ```
  if (state.gameplay.raidEscalation.tier >= 1 &&
      (state.metrics.tick - state.gameplay.lastRaidTick) >= intervalTicks &&
      state.events.queue.filter(e=>e.type===BANDIT_RAID).length===0 &&
      state.events.active.filter(e=>e.type===BANDIT_RAID).length===0 &&
      state.metrics.timeSec >= BALANCE.raidFallbackGraceSec &&
      state.agents.filter(a=>a.alive!==false).length >= BALANCE.raidFallbackPopFloor &&
      Number(state.resources?.food ?? 0) >= BALANCE.raidFallbackFoodFloor) {
    enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, {}, BALANCE.raidFallbackDurationSec, intensityMultiplier);
    state.gameplay.lastRaidTick = state.metrics.tick;
  }
  ```
  - depends_on: 无

- [ ] **Step 6**: `src/config/balance.js:608` (after `heatLensStarveThreshold`) — `add` — 新加 frozen block：
  ```
  raidFallbackScheduler: Object.freeze({
    graceSec: 360,           // ~6 game-min before first auto-raid
    popFloor: 18,            // skip if colony hasn't grown
    foodFloor: 60,           // skip if starvation imminent
    durationSec: 18,
  }),
  ```
  并在文件顶层 export 同名常量：`raidFallbackGraceSec/raidFallbackPopFloor/raidFallbackFoodFloor/raidFallbackDurationSec` 作为 `BALANCE.*` 别名（沿用现有命名风格，参见 `raidIntervalBaseTicks` 等扁平字段）。
  - depends_on: Step 5

- [ ] **Step 7**: `test/inspector-building-coverage.test.js` — `add` — 新建 4 cases：(a) 选中 FARM tile 渲染包含 "Last Yield"; (b) 选中 WAREHOUSE 渲染 "kind"; (c) entity carry 字段同时包含 stone= / herbs= 文本; (d) processing block 对 KITCHEN 仍向后兼容（不破坏现有 `test/processingSnapshot.test.js`）。
  - depends_on: Step 2, Step 3

- [ ] **Step 8**: `test/heat-lens-halo-label.test.js` — `add` — 2 cases：(a) halo marker 的 label 不再等于字面 "halo"（`assert.notStrictEqual(halo.label, "halo")`）；(b) halo marker 的 id 仍以 `halo:` 前缀开头（保护现有 `test/heat-lens-coverage.test.js` 契约）。
  - depends_on: Step 4

- [ ] **Step 9**: `test/raid-fallback-scheduler.test.js` — `add` — 4 cases：(a) tier=0 不触发；(b) tier≥1 且 elapsed ≥ intervalTicks 且 floor 满足时 enqueue 1 个 BANDIT_RAID；(c) 距离上次 raid 不足 intervalTicks 不触发；(d) food < floor 不触发（防止把死亡螺旋拉得更陡）。
  - depends_on: Step 5, Step 6

- [ ] **Step 10**: `CHANGELOG.md` (Unreleased section) — `edit` — 新增 "v0.8.2 Round-6 02a-rimworld-veteran" 子段，列出：
  - Inspector building coverage（FARM/LUMBER/QUARRY/HERB_GARDEN/WAREHOUSE）
  - Worker carry 全资源显示（4 种）
  - PressureLens halo label 语义化（"near <parent>"）
  - RaidEscalator fallback scheduler（解决 LLM-down session 0 raid 问题）
  - Files Changed / New Tests / Behaviour-changing flags
  - depends_on: Step 1-9

## 5. Risks

- **R1: 4-seed benchmark gate**（median≥42, min≥32, deaths≤499）。Step 5 的 fallback raid 会在 Day 8-12 触发首发 raid（tier=1 需要 DI≥15）；若 colony 当时 fragile 会增加 deaths。Step 6 的 graceSec=360（约 Day 6）+ popFloor=18 + foodFloor=60 三重 gate 是为这个 benchmark 风险设的。先跑一次 4-seed dry run 验证 deaths 浮动 < +30。
- **R2: PressureLens 现有 test/heat-lens-coverage.test.js (Round5b 01c) 依赖 `halo:` 前缀**。Step 4 不改 id，仅改 label，回归不破。
- **R3: state.metrics.production Map 越界**——大型 colony (96×72=6912 tile) 不能每 tick 全表扫描；只在 farm/lumber/quarry/herb harvest 路径写 entry，读侧（InspectorPanel）按 selected tile key O(1) lookup。
- **R4: Inspector lastHtml diff 失效**——加 building block 后 HTML 字符串变长但仍是确定函数，diff 还有效；processing block 已经有 `open` 默认展开模式，复用即可。
- **R5: 可能影响的现有测试**：`test/processingSnapshot.test.js`（依赖 metrics.processing 结构 — 不动）、`test/heat-lens-coverage.test.js`（halo:id 前缀 — 保留）、`test/raid-escalator.test.js`（不修 escalation 数学，只在末尾加 enqueue 分支 — 加防御 mock）、`test/world-event-spatial.test.js`（事件空间分配 — 不动）、`test/long-horizon-determinism.test.js`（fallback 路径下 raid 节奏变化 — 需要 reseed assertion 或允许新基线）。

## 6. 验证方式

- **新增测试**：
  - `test/inspector-building-coverage.test.js`（4 cases）
  - `test/heat-lens-halo-label.test.js`（2 cases）
  - `test/raid-fallback-scheduler.test.js`（4 cases）
  - 一份补丁 case 加到 `test/processingSnapshot.test.js` 验证 KITCHEN block 仍存在（向后兼容）
- **全量回归**：`node --test test/*.test.js` 全部 green，零新增 skip。
- **手动验证**（dev server）：
  1. `npx vite` → start temperate_plains → 等到 Day 6 → 选 FARM tile，Inspector 应显示 "Last Yield: …", "Idle Reason: none/<text>"。
  2. 选 worker → Inspector "Carry:" 行包含 stone= 与 herbs= 字段。
  3. 按 L → Heat Lens 标签中 "halo" 字面字符串数量 = 0；以 "near " 开头的标签 ≥ 4。
  4. autopilot ON + 默认 LLM-fail fallback → 跑到 Day 12-15 应至少看到 1 次 BANDIT_RAID toast / event panel 条目。
- **benchmark 回归**：本轮 freeze 不允许改 `scripts/long-horizon-bench.mjs`，只跑现状脚本：
  - `node scripts/long-horizon-bench.mjs --seeds 4 --template temperate_plains`
  - **要求**：median DevIndex ≥ 42、min ≥ 32、deaths ≤ 499（gate 不退化）；tier=0 grace 期 colony death curve 与 baseline 偏差 < 5%。

## 7. UNREPRODUCIBLE 标记

不适用。reviewer 的所有 5 件事在静态代码读 + R5b 实现日志 + R6 build_commit 5622cda 上都能定位到具体文件行号，没有"无法复现"的现象。

> 注：reviewer 的"splash 无端 reset"和"Esc 返回主菜单"两条 UX 杂症在 `shortcutResolver.js:69`（Esc → clearSelection）已经修过，未观察到 menu 跳转——疑似 Round 5 之前残留印象。本 plan 不再针对此项排查。
