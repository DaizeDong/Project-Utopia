---
reviewer_id: A5-balance-critic
reviewer_tier: A
feedback_source: Round0/Feedbacks/A5-balance-critic.md
round: 0
date: 2026-05-01
build_commit: 3f87bf4
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 2
  loc_delta: ~25
  new_tests: 1
  wall_clock: 25
conflicts_with:
  - A3-goal-surfacing (may also touch INITIAL_RESOURCES briefing copy)
  - A7-food-rate-display (may also touch ResourceSystem.js food drain telemetry path)
rollback_anchor: 3f87bf4
---

## 1. 核心问题

1. **Hard-coded ~3:11 starvation crash, regardless of map / strategy.** No-input runs deterministically lose Food + Wood at the same in-game minute. Math: `INITIAL_RESOURCES.food = 200`, `workerFoodConsumptionPerSecond = 0.050`, `aliveWorkers = 12` (`INITIAL_POPULATION.workers`) → drain = `12 × 0.050 = 0.60 food/s` colony-wide → 200/0.60 ≈ 333 s ≈ **5:33 pure burn**, but spoilage (`warehouseFoodSpoilageRatePerSec = 0.0003` proportional) plus the lack of any harvest cycle in the first 3 minutes (workers spawn, traverse to nodes, then carry-eat without a warehouse) collapse the runway to ~3:11. This is the #1 P0 — the player never reaches any other system.
2. **Starter workers contribute zero production in the opening window.** FARM/WOOD-tagged workers spawn already "Wander hungry" and never produce a harvest event before food=0. Whatever onboarding path the FSM is supposed to take from spawn → SEEKING_HARVEST is gated by the missing warehouse; no warehouse = no deposit = workers carry-eat their first harvest and the colony stockpile never moves.
3. **Survived clock + Score freeze at the death-tick while the simulation continues.** Both `state.metrics.survivalScore` and the Survived display stop advancing at the moment `evaluateRunOutcomeState` returns a loss reason (`runOutcome.js:63`), but the simulation is not actually halted — `GameApp` keeps ticking. Result: autopilot "survives" the crash forever at Score=210 / Dev=24, which is the only stable equilibrium and is degenerate.

## 2. Suggestions（可行方向）

### 方向 A: Numeric balance tweak — extend the opening runway via existing BALANCE keys

- 思路：Lift the 3-minute crash window to ~6 minutes by tweaking only the existing `INITIAL_RESOURCES.food`, `BALANCE.workerFoodConsumptionPerSecond`, and `BALANCE.resourceCollapseCarryGrace` constants — no new keys, no new mechanics. Concretely: `INITIAL_RESOURCES.food: 200 → 320` and `workerFoodConsumptionPerSecond: 0.050 → 0.038`, raising `resourceCollapseCarryGrace: 0.5 → 1.5` so workers with carry-food in transit don't trigger the loss-state during the first depot construction.
- 涉及文件：
  - `src/config/balance.js:161` (food: 200 → 320)
  - `src/config/balance.js:204` (workerFoodConsumptionPerSecond: 0.050 → 0.038)
  - `src/config/balance.js:209` (resourceCollapseCarryGrace: 0.5 → 1.5)
- scope：小（~3 numeric lines + 1 test)
- 预期收益：Pushes the no-input crash from 3:11 → ~6:30 (math: 320/(12×0.038) = 702 s ≈ 11:42 pure burn, realistically ~6:30 after carry-eat losses). Player gets a real opening window to reach Kitchen / Smithy / Clinic content. Score stops being capped by death-tick because the death-tick moves out past the AI ramp-up.
- 主要风险：
  - Long-horizon DevIndex regression — generous food may flatten difficulty curve at day 30+. Mitigated by the existing `warehouseFoodSpoilageRatePerSec` (line 208), which is proportional and scales with stockpile size.
  - May invalidate calibrated `survivalScorePerSecond=1` baselines in `test/long-horizon-bench.test.js` etc.
- freeze 检查：OK — pure numeric tweaks to existing BALANCE keys (HW7 explicitly allows "balance 数值微调（沿用既有 BALANCE 常量结构）").

### 方向 B: Pre-seed a starter warehouse on the named scenario tile

- 思路：Make the briefing-named "east ruined depot" a pre-built (not just blueprinted) warehouse so workers have a deposit target from t=0. This unblocks the harvest → deposit → eat-from-stockpile loop.
- 涉及文件：`src/world/scenarios/ScenarioFactory.js` (scenario building list), `src/entities/EntityFactory.js:22-24` (initial state hook), possibly `src/simulation/construction/BuildSystem.js`
- scope：中（pre-build path needs to bypass the blueprint→commission flow, and faction-aware pathfinding must accept an pre-built building)
- 预期收益：Restores the harvest loop within seconds of game-start. Combined with #A this likely eliminates the no-input crash entirely.
- 主要风险：
  - Adds a building at game-start which is borderline `FREEZE-VIOLATION` — strictly speaking the "warehouse" tile/role/building already exists, so this is repurposing not adding. But pre-placed buildings sidestep the construction lifecycle and could break tests that assume `state.buildings.length === 0` at t=0.
  - Touches multiple subsystems (scenario, entity, build) in one shot — risk of cascading regressions in the v0.10.0 FSM.
- freeze 检查：OK with caveat — no new tile / role / building / mechanic / panel; just a pre-placement of an existing building. Gray zone.

### 方向 C: Hard-stop simulation at the loss-tick instead of freezing the score

- 思路：When `evaluateRunOutcomeState` returns a loss, set `state.simulationHalted = true` and have `GameApp.update()` skip system ticks. Score and Survived clock stop honestly, autopilot can no longer "fake survive".
- 涉及文件：`src/app/GameApp.js` (update loop guard + ~2200 score read), `src/app/runOutcome.js` (state flag setter)
- scope：中
- 预期收益：Removes the "autopilot infinite oscillation" degenerate equilibrium A5 flagged. Gives the player an honest "you died" ending so failure is meaningful.
- 主要风险：
  - Could break the post-mortem replay UX (Chronicle, leaderboard write) which expects the sim to keep ticking briefly after loss.
  - Does NOT fix the core 3:11 crash — only fixes the score-freeze symptom. P0 remains unsolved.
- freeze 检查：OK — pure runtime control flow change.

## 3. 选定方案

选 **方向 A**, with one validation-test addition.

理由：
- A5's headline is the **3:11 hard-coded crash**. Direction A targets the crash directly; Directions B and C address downstream symptoms but leave the root cause untouched.
- HW7 freeze explicitly permits BALANCE numeric tweaks. Direction A is the only suggestion that is unambiguously inside the freeze envelope.
- P0 selection rule from enhancer.md: "P0 → 选小 scope / 快速落地". 3 numeric edits + 1 test is the smallest viable shape.
- Direction B (pre-built warehouse) and Direction C (hard-stop) are tracked as follow-up plans for Round 1 / 2 if Round 0 validation shows A is insufficient.

## 4. Plan 步骤

- [ ] Step 1: `src/config/balance.js:161` — edit — `food: 200` → `food: 320` inside `INITIAL_RESOURCES`. Add a one-line comment: `// v0.10.1-r0-A5: extend opening runway from ~3:11 to ~6:30 (A5 P0 fix)`.
- [ ] Step 2: `src/config/balance.js:204` — edit — `workerFoodConsumptionPerSecond: 0.050` → `workerFoodConsumptionPerSecond: 0.038`. Update the trailing comment to reflect new ~0.456 food/s colony drain at 12 workers.
  - depends_on: Step 1
- [ ] Step 3: `src/config/balance.js:209` — edit — `resourceCollapseCarryGrace: 0.5` → `resourceCollapseCarryGrace: 1.5`. This widens the runOutcome.js:60-62 carry-in-transit grace so first-warehouse construction window doesn't trip the loss-state.
  - depends_on: Step 2
- [ ] Step 4: `test/balance-opening-runway.test.js` — add — new test file. Asserts (a) `INITIAL_RESOURCES.food / (INITIAL_POPULATION.workers * BALANCE.workerFoodConsumptionPerSecond) >= 600` (10-minute pure-burn floor), and (b) `BALANCE.resourceCollapseCarryGrace >= 1.0`. Locks the opening-window invariant against future regressions.
  - depends_on: Step 3
- [ ] Step 5: `CHANGELOG.md` — edit — add an unreleased v0.10.1-n entry under "Balance" describing the 3-line tuning + the A5 P0 trigger. (Per CLAUDE.md convention: "Every commit must include a corresponding update to CHANGELOG.md".)
  - depends_on: Step 4

## 5. Risks

- **Long-horizon DevIndex regression** — The 90-day benchmark (`scripts/long-horizon-bench.mjs`) was tuned against `food: 200 / consume: 0.050`. New numbers may overshoot DevIndex target by 5–10%. Mitigation: existing proportional spoilage (line 208) self-corrects; if benchmark drops > 5% below baseline, scale back `INITIAL_RESOURCES.food` to 280 (still > 5-min runway).
- **Death-grace cascade** — Lower hunger pressure → fewer "starving" deaths → `survivalScorePenaltyPerDeath: 10` accumulates less penalty → Score baselines shift. Acceptable side effect — A5 explicitly flags Score=210 frozen forever as broken; movement is the goal.
- **Test breakage** — Tests that hardcode `INITIAL_RESOURCES.food === 200` (if any) will fail. Mitigation: Step 4 tests the *invariant* (runway seconds), not the literal. Implementer should grep `INITIAL_RESOURCES.food` and `200` in `test/` and update any literal-coupling.
- **Carry-grace inflation** — `resourceCollapseCarryGrace: 1.5` may delay the loss-trigger by 1 extra second in marginal cases where colony is already dead but workers carry < 1.5 food. Negligible UX impact.
- **Possible affected tests**:
  - `test/long-horizon-bench.test.js`
  - `test/exploit-regression-*.test.js` (any food-budget assertion)
  - `test/resource-system*.test.js`
  - `test/runOutcome.test.js` (carry-grace boundary)

## 6. 验证方式

- **新增测试**: `test/balance-opening-runway.test.js` — covers two invariants:
  1. `(INITIAL_RESOURCES.food) / (INITIAL_POPULATION.workers * BALANCE.workerFoodConsumptionPerSecond) >= 600` (10-min pure-burn floor)
  2. `BALANCE.resourceCollapseCarryGrace >= 1.0`
- **手动验证**:
  1. `npx vite` → open `http://127.0.0.1:5173`
  2. Pick Riverlands map (A5's Run-3 / Run-4 baseline) → DO NOT click anything → 8x speed
  3. Expected: Survived clock reaches **>= 5:30** before any "colony stalled" toast (vs current 3:11)
  4. Optional: repeat on Plains + Highlands; both should clear 5:30
- **FPS 回归**: `browser_evaluate` `performance.now()` delta over 5 s, average FPS ≥ 30 (no rendering changes — should be unaffected)
- **benchmark 回归**: `node scripts/long-horizon-bench.mjs --seed 42 --map temperate_plains --days 90` — DevIndex must stay within `baseline - 5%` (baseline pulled from prior validation report when available; otherwise establish new baseline this round)
- **Test runner**: `node --test test/*.test.js` — all 1646 prior pass / 0 fail / 2 skip preserved (modulo the new test file adding +2 assertions)
- **prod build**: `npx vite build` no errors; `vite preview` 3-minute smoke with no console errors

## 7. 回滚锚点

- 当前 HEAD: `3f87bf4`
- 一键回滚: `git reset --hard 3f87bf4` (仅当 Implementer 失败时由 orchestrator 触发)

## 8. UNREPRODUCIBLE 标记

Not applicable — A5's feedback is highly reproducible from static analysis alone:
- `INITIAL_RESOURCES.food = 200` (`src/config/balance.js:161`)
- `INITIAL_POPULATION.workers = 12` (`src/config/balance.js:168`)
- `workerFoodConsumptionPerSecond = 0.050` (`src/config/balance.js:204`)
- Drain = 12 × 0.050 = 0.60 food/s → 200/0.60 ≈ 333 s ≈ 5:33 pure burn
- Observed crash at 3:11 = 191 s → ~120 s "missing" food consumed by spoilage + workers carry-eating their first harvests instead of depositing (no starter warehouse).

The math confirms A5's headline finding without needing Playwright reproduction. Re-running in browser is encouraged in Step 6 manual verification, not blocking for plan generation.
