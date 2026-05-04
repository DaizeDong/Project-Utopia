---
reviewer_id: A5-balance-critic
reviewer_tier: A
feedback_source: Round1/Feedbacks/A5-balance-critic.md
round: 1
date: 2026-05-01
build_commit: 1f6ecc6
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 5
  loc_delta: ~85
  new_tests: 1
  wall_clock: 35
conflicts_with: [A7, A3, C1]
rollback_anchor: 1f6ecc6
---

## 1. 核心问题

R0 的 A5 修复（INITIAL food 200→320 + per-worker drain 0.050→0.038 + carryGrace 0.5→1.5）把开局 runway 从 3:11 拉长到 ~6:30，但作为**副作用**把 fail-state 彻底关掉了：

1. **Fail-state 缺失**：v0.10.1-l 把"hunger FSM"重构为 `ResourceSystem.update` 里的全局 food drain（`workerFoodConsumptionPerSecond`），但忘了把 per-entity `entity.hunger` 也接到这条新路径上。`getWorkerHungerDecayPerSecond` 仍在 balance.js 里定义、在 WorkerAISystem 里 export，但**全工程没有任何 caller**。结果：worker 的 `entity.hunger` 永远是初值 (~1.0)，永远 ≤ 0.045 不成立 → `MortalitySystem.shouldStarve` 永不触发 → no-op 玩 30 分钟 0 死亡 = 必胜。这是 P0-1 的根因，比 feedback 里"延长 grace"更上游。
2. **Score = c × time**：`updateSurvivalScore` 只按 `survivalScorePerSecond=1`/s 累加，加上 `+10/birth` `-10/death`。无操作 18 分 = 1080，操作满 18 分 = 1150，差 6%——这是 feedback 实测吻合的脱钩公式。修复方向：把"产出建筑数 × dt"乘进 perSec 公式，让什么都不建的 score/s 显著低于建满的 score/s。
3. **Wood/stone 链失能 + HUD 双时钟**：wood 走的是同一条 ResourceSystem，但 wood 没有 `warehouseFoodSpoilageRatePerSec` 那种衰减，所以 NO-OP 堆 235+ 没人消费；stone/herbs 在 autopilot 里 `hasAccessibleWorksite([TILE.QUARRY])` 检查依赖地图节点存在，节点不存在时 ColonyDirector 静默跳过；HUD 顶部 (statusObjective) 与底部 (objectiveVal) 都读同一个 `state.metrics.timeSec` 但顶部静态 ≠ 底部动态——很可能是 statusObjective 节点引用没在主循环里更新（A7 域，本 plan 让位）。

## 2. Suggestions（可行方向）

### 方向 A: 全局 drain 触发 hunger，让 MortalitySystem 旧管道复活 + score 乘以建筑产能 + wood 衰减
- 思路：在 `ResourceSystem.update` 的 food-consume 块里，当 `state.resources.food <= 0` 且 worker 数 > 0 时，按 `workerHungerDecayPerSecond` 把每个活 worker 的 `entity.hunger` 减少 `dt`。`MortalitySystem.shouldStarve` 已经有完整的 hunger ≤ 0.045 → starvationSec → 34s holdSec → death 链路，重新接通即可，不引入新 mechanic。Score 公式在 `ProgressionSystem.updateSurvivalScore` 加一项 `BALANCE.survivalScorePerProductiveBuilding * productiveBuildings * dt` (productiveBuildings = farms + lumbers + quarries + herbGardens + smithies + clinics + kitchens)。Wood 加 `warehouseWoodSpoilageRatePerSec=0.00015`（食物 spoilage 的一半，更慢、避免破坏正常使用）。
- 涉及文件：`src/simulation/economy/ResourceSystem.js`, `src/simulation/meta/ProgressionSystem.js`, `src/config/balance.js`
- scope：中
- 预期收益：no-op 在 ~6:30-9:00 食物耗尽后开始死人，30 分钟内 pop→0；操作得分 ≥ no-op 得分 ×1.5（产能差异显著进 score）；wood 30 分稳态 60-90（不再 235+）。Balance test 同时锁住 fail-state 不变形。
- 主要风险：(a) `entity.hunger` 字段被 hunger-FSM 遗存代码读，可能影响 telemetry——但 NPCBrainAnalytics 只在调试面板显示，不影响 sim；(b) workerStarvingPreemptThreshold 触发可能让 worker 提前回 EATING——但 EATING FSM 已经是空操作（v0.10.1-h），所以无路径风险；(c) score 公式改变会让 `test/balance-opening-runway.test.js` 之外的 score-baseline 测试断言数值偏差——下面会列受影响测试。
- freeze 检查：OK（无新 tile/role/building/mood/audio/UI panel；只调整两个现有公式 + 新增 1 个 BALANCE 数值常量）。

### 方向 B: 把 score 改成纯 dev_score = Σ(building.tier × uptime) + 加 hp-decay 而不是回灌 hunger
- 思路：rewrite `updateSurvivalScore` 用 `state.gameplay.devIndexSmoothed * dt * k`，并在 ResourceSystem 直接给 worker 扣 hp 当 food=0 持续 N 秒。
- 涉及文件：同 A 但 ProgressionSystem 改幅更大；需要新增 hp-decay 路径。
- scope：中-大
- 预期收益：score 完全跟 DevIndex 走，理论上更"对齐"feedback 的"dev_score = Σ tier × uptime"建议。
- 主要风险：(a) hp-decay 是新 mortality 通道——orchestrator 明确 "NO new mortality mechanic, just tighten existing parameters"，**FREEZE-VIOLATION**；(b) DevIndex 自己还在被打磨，把 score 完全绑死会放大 DevIndex 任何抖动。
- freeze 检查：FREEZE-VIOLATION（新增 hp-from-food-zero 死亡路径 = 新 mortality mechanic）。淘汰。

### 方向 C: 仅回滚 R0 的 food=320/drain=0.038，不动公式
- 思路：把 INITIAL_RESOURCES.food 退回 200、workerFoodConsumptionPerSecond 退回 0.050、carryGrace 退回 0.5——回到 R0 之前。
- 涉及文件：`src/config/balance.js` 仅 3 行
- scope：小
- 预期收益：恢复 R0 之前的 fail-state（assuming 当时是真 work 的）。
- 主要风险：(a) feedback 明确说 R0 修复**初衷正确** (3:11 runway 太短)——回滚等于把 R0 工作丢掉；(b) 经我代码检查，hunger 不被任何 caller 喂，回到 0.050 也修不了死活——R0 之前就已经断了，只是 runway 太短让 EAT 系统自己撑着，**回滚解决不了根因**。
- freeze 检查：OK，但收益伪——淘汰。

## 3. 选定方案

选 **方向 A**，理由：
- P0：方向 A 是唯一同时关掉 4 个 P0/P1 issue 的最小路径（fail-state、score 脱钩、wood overflow，外加 raid 防御 0-wall 问题留给独立调参）。
- 不触发 hard freeze——纯参数 + 公式调整，复用既有 MortalitySystem starvation 通道、既有 survivalScore 加权、既有 spoilage 模式。
- 与 R0 修复正交：保留 320/0.038/1.5 不变，新管道只在 `food == 0` 时启动；正常游戏不变。
- HUD 双时钟显式让位 A7（feedback 也明示"Overlaps with A7"）。autopilot quarry 缺失留给本 plan 加一个轻量 BALANCE 抬高 quarry-priority 触发条件（不动 ColonyDirector 结构）。

## 4. Plan 步骤

- [ ] **Step 1**: `src/config/balance.js:208` — `edit` — 在 `workerFoodConsumptionPerSecond: 0.038` 后新增字段：
  ```
  // v0.10.1-r1-A5: when state.resources.food == 0, decay each worker's
  // entity.hunger at this rate so MortalitySystem's starvation chain
  // (hunger<=0.045 + holdSec=34) can fire. Pre-r1 the global drain
  // replaced hunger-FSM but never wired through to per-entity hunger,
  // so workers never starved. 0.020/s = ~50s from hunger=1.0 → 0.045,
  // total time-to-first-death = 50s decay + 34s holdSec ≈ 84s after
  // food hits zero — gives the player a clear "act or die" window.
  workerHungerDecayWhenFoodZero: 0.020,
  ```
  Plus add: `warehouseWoodSpoilageRatePerSec: 0.00015,` next to existing `warehouseFoodSpoilageRatePerSec`.
  Plus add: `survivalScorePerProductiveBuildingSec: 0.08,` next to existing `survivalScorePerSecond`.

- [ ] **Step 2**: `src/simulation/economy/ResourceSystem.js:408` — `edit` — 在 `food=0`/worker>0 分支末尾追加 hunger 回灌:
  ```js
  // v0.10.1-r1-A5 P0-1: when food fully depleted, decay per-worker
  // hunger so MortalitySystem's existing starvation chain can fire.
  // Caps: workerHungerDecayWhenFoodZero is paused entirely while
  // food > 0 (consume branch above already prevents that path).
  if (state.resources.food <= 0 && aliveWorkers > 0) {
    const hungerDecay = Number(BALANCE.workerHungerDecayWhenFoodZero ?? 0.020) * stepSec;
    for (const a of state.agents) {
      if (a?.type !== "WORKER" || a?.alive === false) continue;
      // Honor metabolism multiplier, same clamp as existing hunger helper.
      const mul = Math.max(0.5, Math.min(1.5, Number(a.metabolism?.hungerDecayMultiplier ?? 1)));
      a.hunger = Math.max(0, Number(a.hunger ?? 1) - hungerDecay * mul);
    }
  }
  ```
  - depends_on: Step 1

- [ ] **Step 3**: `src/simulation/economy/ResourceSystem.js:392` — `edit` — 在 food spoilage 块下面立即镜像一份 wood spoilage：
  ```js
  // v0.10.1-r1-A5 P0-3: wood overflow cap — same proportional spoilage
  // pattern as food (v0.10.1-j), tuned half as aggressive so normal
  // construction-cycle wood (35-60) barely loses anything but no-op
  // 235+ stockpiles slowly decay back toward equilibrium.
  const woodSpoilageRate = Number(BALANCE.warehouseWoodSpoilageRatePerSec ?? 0);
  if (woodSpoilageRate > 0 && state.resources.wood > 0) {
    const spoiled = state.resources.wood * woodSpoilageRate * stepSec;
    state.resources.wood = Math.max(0, state.resources.wood - spoiled);
    if (spoiled > 0) {
      recordResourceFlow(state, "wood", "spoiled", spoiled);
    }
  }
  ```
  - depends_on: Step 1

- [ ] **Step 4**: `src/simulation/meta/ProgressionSystem.js:545` — `edit` — 在 `metrics.survivalScore += perSec * ticks;` 后追加 productive-building 加成块：
  ```js
  // v0.10.1-r1-A5 P0-2: score must reflect outcomes. Add a per-second
  // bonus proportional to how many productive buildings exist so a
  // "do nothing" run accrues only the time floor, while a built-up
  // colony scores 2-3x faster. NO new score system — same survivalScore
  // metric, just an extra summand sourced from observable game state.
  const perBuilding = Number(BALANCE.survivalScorePerProductiveBuildingSec ?? 0);
  if (perBuilding > 0) {
    const b = state.buildings ?? {};
    const productive =
        Number(b.farms ?? 0)
      + Number(b.lumbers ?? 0)
      + Number(b.quarries ?? 0)
      + Number(b.herbGardens ?? 0)
      + Number(b.kitchens ?? 0)
      + Number(b.smithies ?? 0)
      + Number(b.clinics ?? 0);
    metrics.survivalScore += perBuilding * productive * ticks;
  }
  ```
  - depends_on: Step 1

- [ ] **Step 5**: `src/config/balance.js:798` — `edit` — autopilot quarry-priority bump：在 `RAID_AUTOPILOT_DEFAULTS` 块附近**不要**动 ColonyDirector 结构，而是在 BALANCE 顶层加：
  ```
  // v0.10.1-r1-A5 P0-4: autopilot processing-chain unblock. ColonyDirector
  // currently bumps quarry to priority 77 only when hasAccessibleWorksite
  // returns false; on Archipelago/Temperate the STONE node spawns far
  // enough that ColonyPlanner's wood-gate (wood >= 6) loses to farm-spam
  // priority 80. This knob raises the early-game quarry threshold so
  // ColonyDirector promotes quarry above farm in bootstrap.
  autopilotQuarryEarlyBoost: 12,  // added to quarry priority before t<300s
  ```
  Then `src/simulation/meta/ColonyDirectorSystem.js:175` — `edit` — change `priority: 77` to `priority: 77 + (Number(state.metrics?.timeSec ?? 0) < 300 ? Number(BALANCE.autopilotQuarryEarlyBoost ?? 0) : 0)`. Mirror line 178 (herb_garden) with `priority: 76 + (...)` for symmetry.
  - depends_on: Step 1

- [ ] **Step 6**: `test/balance-fail-state-and-score.test.js` — `add` — new node:test file with 3 sub-tests:
  1. **fail-state lock**: simulate `state` with `resources.food=0`, 5 workers @ `hunger=1.0`, run ResourceSystem.update for `dt=1` 60 times → assert min worker hunger ≤ 0.05 (i.e. crossed death threshold). Then run MortalitySystem.update with stub services (reachableFood=false), 35 more ticks of dt=1 → assert at least 1 worker `alive===false` with `deathReason==="starvation"`.
  2. **score divergence**: build state-A with `buildings.farms=0,lumbers=0,...` and state-B with `farms=5,lumbers=3,quarries=1,kitchens=1`. Run ProgressionSystem.updateSurvivalScore(state, dt=1) 600 times each. Assert `state-B.metrics.survivalScore >= state-A.metrics.survivalScore * 1.4` (clear strategy reward, ≥40% gap).
  3. **wood spoilage**: state with resources.wood=240, no workers. Run ResourceSystem.update(state, dt=1) for 1800 sec (30 min). Assert `wood < 200` (decayed ≥ 16%) and `wood > 50` (didn't over-decay).
  - depends_on: Steps 1-4

- [ ] **Step 7**: `CHANGELOG.md` — `edit` — append under unreleased section a "v0.10.1-r1-A5 P0 fix" bullet group describing fail-state restoration, score-divergence formula, and wood-spoilage cap. NO NEW SECTION.
  - depends_on: Steps 1-6

## 5. Risks

- **R1**: `entity.hunger` 字段从未被显式 init 在所有 spawn 路径——某些 worker 可能 hunger=undefined。Step 2 用 `Number(a.hunger ?? 1) - decay`，即首次写入会从 1 起算，行为正确。但 NPCBrainAnalytics / WorkerFocusPanel 可能展示 NaN——加 `??1` 防御。
- **R2**: 现有 `test/balance-opening-runway.test.js` 跨 600 秒模拟 food=0；新 hunger-decay 会让 worker 死掉，那个测试断言 "alive==12" 可能失败。**Step 6 + 测试修订**：在 Step 6 同 PR 内将 opening-runway 的"alive 仍 12"断言放宽为 "alive >= 8"（10:00 内死 ≤4 是合理的 fail-state）。Implementer 必查。
- **R3**: 长时段 benchmark（`scripts/long-horizon-bench.mjs`）的 DevIndex 长期 baseline 是在"fail-state 关掉"的状态下测的。Step 4 score 公式调整后 DevIndex 不变，但 survivalScore 绝对值不可逆地改变 ≥30% — Implementer 须重跑 baseline 并更新 `test/long-horizon-*.test.js` 的 score 断言；门槛建议保持 "score per minute ≥ 60 in operated run"。
- **R4**: Step 5 的 quarry-boost 仅在 t<300s 触发，对中后期不变；但若 ColonyDirector 早期把 quarry 推上去而 BuildAdvisor 找不到 STONE 节点，会循环插入 needs[] 但不能落地——这是已知 silent-fail，A3 域，本 plan 不修。
- **可能影响的现有测试**：
  - `test/balance-opening-runway.test.js`（断言 alive==12 → 须放宽）
  - `test/long-horizon-*.test.js`（survivalScore 绝对值 baseline）
  - `test/progression-*.test.js`（如果存在 score-per-second 直接断言）
  - `test/economy-resource-system-*.test.js`（如果存在 wood 守恒断言）

## 6. 验证方式

- 新增测试：`test/balance-fail-state-and-score.test.js`（Step 6）覆盖 fail-state 启动、score 分化、wood 衰减三条不变量。
- 手动验证：
  1. `npx vite` → 加载 Archipelago + NO-OP（不点任何按钮）→ 等到 food=0（约 ~10 min）→ 再 90 秒内必须看到至少 1 条 `<name> died (starvation)` 进入 Colony Log。
  2. 同会话续到 30 min → wood 应稳定 < 150（spoilage 抵消采集）。
  3. 重启 → 启用 Autopilot Economy → 30 min → score >= 1500 + 至少 1 quarry 落成（建造日志含 quarry 关键词）。
- FPS 回归：`browser_evaluate` `__utopiaPerf?.fpsAvg` 5 秒平均 ≥ 55（现状 60，wood-spoilage 一次 sweep 是 O(1) 的，predicted Δ < 0.1ms）。
- benchmark 回归：`node scripts/long-horizon-bench.mjs --seed 42 --map temperate_plains` DevIndex 不得低于 baseline - 5%；survivalScore 绝对值会上调（操作场景）也下调（无操作场景），属于设计预期，更新 baseline 即可。
- prod build：`npx vite build` 无错；`npm run preview` 3 分钟 NO-OP smoke 须看到 starvation 死亡进入日志。

## 7. 回滚锚点

- 当前 HEAD: `1f6ecc6`
- 一键回滚：`git reset --hard 1f6ecc6`（仅当 Implementer 失败时由 orchestrator 触发）

## 8. UNREPRODUCIBLE 标记（如适用）

不适用——feedback 自带 3 局 56 分钟 in-game 实测数据 + 我已用静态分析在代码中定位到根因（`getWorkerHungerDecayPerSecond` 无 caller、`updateSurvivalScore` 公式纯线性时间、wood 缺 spoilage、ColonyDirector quarry 静默跳过）。Playwright 复现不必要。
