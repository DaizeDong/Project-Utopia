---
reviewer_id: 02a-rimworld-veteran
plan_source: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/02a-rimworld-veteran.md
round: 6
wave: 2
date: 2026-04-25
parent_commit: c099b4c
head_commit: 8bd5c74
status: DONE
steps_done: 10/10
tests_passed: 1369/1375 (4 pre-existing baseline failures + 2 skips, +14 new tests all passing)
tests_new:
  - test/inspector-building-coverage.test.js (5 cases)
  - test/heat-lens-halo-label.test.js (3 cases)
  - test/raid-fallback-scheduler.test.js (6 cases)
freeze_policy: lifted
---

## Steps executed

- [x] **Step 1**: `src/ui/panels/InspectorPanel.js:179` — Carry line iterates `["food","wood","stone","herbs"]` instead of hard-coding food/wood. Implemented as a 5-line `.map(k => ...).join(", ")` block with a JSDoc comment. **DONE**.
- [x] **Step 2**: `src/ui/panels/InspectorPanel.js:78-107` — Added Building block (FARM / LUMBER / QUARRY / HERB_GARDEN / WAREHOUSE) reading `state.metrics.production.byTile.get("ix,iz")`. Block renders 3 rows: Kind, Last Yield, Idle Reason. Inserted into the rendered HTML between `logisticsLine` and `processingBlock` (so existing PROCESSING block paths for KITCHEN/SMITHY/CLINIC are untouched). **DONE**.
- [x] **Step 3**: `src/simulation/economy/ResourceSystem.js` — Exported new `recordProductionEntry(state, ix, iz, kind, lastYield, idleReason)` helper. Lazy-initialises `state.metrics.production = { byTile: Map, lastUpdatedSec }` ONCE per state and reuses the Map instance + entry objects across ticks (no per-tick GC). Wired callsites in `WorkerAISystem.handleHarvest` for FARM (post-salinization block), QUARRY (after applyNodeYieldHarvest), HERB_GARDEN (after applyNodeYieldHarvest), and LUMBER (after applyNodeYieldHarvest). `idleReason` is derived from tileState (`fallow soil` when fertility=0+fallowUntil>0, `depleted node` when yieldPool=0). **DONE**.
- [x] **Step 4**: `src/render/PressureLens.js:545-553` — Added `hoverTooltip` field on halo marker payload, set to `"near ${parent.label}"` (or `""` if parent has no label). Per Stage B summary §2 D1 lock and runtime context, the `:409` `label: ""` line was NOT rewritten — instead the "near <parent>" payload is exposed as a new ADD-ONLY field for the SceneRenderer to consume on hover. **DONE**.
- [x] **Step 5**: `src/simulation/meta/RaidEscalatorSystem.js:update` — After the existing tier/interval bundle is computed, added a fallback scheduler block that self-fires `enqueueEvent(state, BANDIT_RAID, { source: "raid_fallback_scheduler" }, durationSec, intensityMultiplier)` when six floors all pass: tier ≥ 1, elapsed ≥ intervalTicks, no queued/active BANDIT_RAID, timeSec ≥ graceSec, aliveCount ≥ popFloor, food ≥ foodFloor. Sets `state.gameplay.lastRaidTick = tick` so subsequent ticks respect the cadence. Imports added: `EVENT_TYPE` from constants, `enqueueEvent` from WorldEventQueue. **DONE**.
- [x] **Step 6**: `src/config/balance.js` — After the existing `heatLensStarveThreshold` block, added `raidFallbackScheduler` frozen sub-object plus four flat aliases `raidFallbackGraceSec` (360), `raidFallbackPopFloor` (18), `raidFallbackFoodFloor` (60), `raidFallbackDurationSec` (18). Matches existing flat-field convention (`raidIntervalBaseTicks` etc.). **DONE**.
- [x] **Step 7**: `test/inspector-building-coverage.test.js` — NEW. 5 cases covering: (a) FARM tile renders "Last Yield" with the yield value formatted; (b) WAREHOUSE renders "Kind: warehouse"; (c) worker carry shows stone= and herbs= alongside food= and wood=; (d) KITCHEN processing block still rendered (back-compat); (e) FARM with no production entry shows "no harvest yet" fallback. **DONE**.
- [x] **Step 8**: `test/heat-lens-halo-label.test.js` — NEW. 3 cases covering: (a) halo markers do NOT carry the literal `"halo"` label (Wave-1 floor); (b) halo marker IDs retain the `halo:` prefix (regression guard for `test/heat-lens-coverage.test.js`); (c) halo markers expose `hoverTooltip` starting with `"near "`. **DONE**.
- [x] **Step 9**: `test/raid-fallback-scheduler.test.js` — NEW. 6 cases (1 over plan minimum to add belt-and-braces coverage): (a) tier=0 never triggers; (b) tier ≥ 1 + elapsed ≥ interval + floors met → enqueues 1 BANDIT_RAID; (c) elapsed < intervalTicks does not trigger; (d) food < floor does not trigger; (e) pop < floor does not trigger; (f) existing queued/active raid suppresses (no double-stack). **DONE**.
- [x] **Step 10**: `CHANGELOG.md` — Prepended `[Unreleased] - v0.8.2 Round-6 Wave-2 02a-rimworld-veteran` section at file top before the existing 01d / 02b sections, with categories: Scope, New Features, New Tests, Files Changed, Notes (test/bench summary + freeze policy + Wave-2 sequencing + reviewer DEFERRED). **DONE**.

## Tests

- pre-existing skips: 2 (inherited from baseline)
- pre-existing failures: 4 (build-spam wood cap, scene-renderer pick fallback regex, formatGameEventForLog noisy filter, ui-voice main.js dev gate). Verified via `git stash → run failing tests → git stash pop` against parent commit `c099b4c`.
- new tests added:
  - test/inspector-building-coverage.test.js (5 cases passing)
  - test/heat-lens-halo-label.test.js (3 cases passing)
  - test/raid-fallback-scheduler.test.js (6 cases passing)
- failures resolved during iteration:
  - Run 1: case (c) of inspector-building-coverage failed because `getEntityInsight` reads `state.buildings.warehouses` which the minimal test fixture didn't define. Fixed by adding `buildings: { warehouses: 1, farms: 1, ... }` to the test state factory.

## Bench

- Command: `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 365 --soft-validation`
- Result: `outcome=max_days_reached days=365 devIndex(last)=70.44 survivalScore=82620 passed=true`
- Floor: 41.8 (5% below 44 baseline). Result is +28.6 above floor — combined raid pressure from 01d's EventDirector and 02a's fallback scheduler does NOT regress devIndex on seed 42, validated by the four floors.

## Deviations from plan

- Step 4 implementation strategy: The plan (line 74) reads "edit `PressureLens.js:409` `label: "halo"` replace with `label: parent.label ? \`near ${parent.label}\` : ""`. However, the runtime context explicitly directed: "your Step 4 'near <parent>' must use a NEW hover-tooltip path, NOT rewrite :409 line" (Stage B summary §2 D1 Wave-1 lock). I therefore implemented the "near <parent>" semantics as a NEW `hoverTooltip` payload field on the halo marker; the locked `label: ""` line stays verbatim. This satisfies both the plan intent (semantic "near <parent>" is now exposed for the hover path) and the Wave-1 lock. The new test `test/heat-lens-halo-label.test.js` case (c) asserts the `hoverTooltip` field is present.
- Step 9 added 6 cases instead of 4 (added pop-floor and double-stack-suppression cases) — net positive coverage, no scope creep.
- Production telemetry idleReason heuristic: plan §3 lists "depleted node / fallow soil / no worker" as the three categories. Implementation derives "fallow soil" + "depleted node" from `tileState`; "no worker" is implicit (no entry written when no harvest happens). The Inspector "Idle Reason" line therefore shows `none` for normal harvests and the specific reason for stalled tiles. Acceptable per plan §6 §verification "selected FARM tile, Inspector should display 'Last Yield: …', 'Idle Reason: none/<text>'."

## Handoff to Validator

- **Bench**: One-seed bench (seed 42) passed at devIndex=70.44 (well above 41.8 floor). Plan §5 asks for 4-seed bench (`seeds = [42, 7, 9001, 123]`) with median≥42, deaths≤499. Validator should run the full 4-seed long-horizon-bench to confirm the deaths ceiling holds with the combined 01d EventDirector + 02a RaidFallbackScheduler pressure. If 4-seed median dips below 41.8, plan §5 R1 mitigation ladder: bump `BALANCE.raidFallbackGraceSec` from 360 → 480 first, then `raidFallbackPopFloor` from 18 → 22.
- **Playwright smoke** (per plan §6):
  1. Start temperate_plains, wait for Day 6, select a FARM tile → Inspector "Building" block should show "Last Yield: <num> (<age>s ago)" and "Idle Reason: none" (or specific reason if tile is fallow).
  2. Click any worker → Inspector "Carry:" line should contain `stone=` and `herbs=` substrings (alongside `food=` and `wood=`).
  3. Press L for Heat Lens → no on-screen "halo" labels, but hover-tooltip on halo markers should read "near supply surplus" / "near input starved" / "near warehouse idle". (Note: hover-tooltip wiring on the SceneRenderer side is NOT in this plan — it's exposed as a payload field for a follow-up renderer hookup. Validator should confirm the field exists in marker objects via DevTools console.)
  4. Autopilot ON + LLM-fail fallback → run to Day 12-15; should observe at least 1 BANDIT_RAID toast / event-panel entry. (Tier-1 threshold is DI≥15 + graceSec=360 + popFloor=18 + foodFloor=60.)
- **Locks honoured (Wave-1)**:
  - `PressureLens.js:409` halo `label: ""` line — UNCHANGED (Wave-1 lock per Stage B summary §2 D1).
  - SceneRenderer dedup helper API — consumed only, no rewrite.
  - GameApp LLM error copy — untouched.
  - shortcutResolver KeyR/F1/Slash registered keys — untouched.
  - `body.dev-mode` + `isDevMode` helper — untouched.
- **Locks introduced (Wave-2)** (Wave-3 must not rewrite):
  - `state.metrics.production.byTile` Map shape: `Map<"ix,iz", { kind, lastYield, lastTickSec, idleReason|null }>`. The Map instance is reused across ticks (do NOT replace it; only mutate entries via `recordProductionEntry`).
  - `BALANCE.raidFallback*` flat-key namespace.
  - RaidEscalatorSystem fallback scheduler block in `update()` — Wave-3 may extend the floors but must NOT rewrite the existing six checks.
- **Pre-existing baseline failures** (NOT introduced by this work): 4 failures inherited from parent commit `c099b4c` — see Tests section. Validator may safely ignore these (they appeared in parent and persist unchanged).
