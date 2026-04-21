# Living World v0.8.0 — Implementation Progress Tracker

> Live log for the v0.8.0 overhaul. Updated after every phase commit. Plan: [2026-04-21-living-world-implementation.md](2026-04-21-living-world-implementation.md). Spec: [../specs/2026-04-21-living-world-balance-design.md](../specs/2026-04-21-living-world-balance-design.md).

## Branch

`feature/v080-living-world` (off `feature/phase1-resource-chains` @ `6e85c39`).

## Baseline (v0.7.0, 2026-04-21)

**Package version at plan start:** `0.7.0`
**Tests at plan start:** `731 pass / 0 fail / 60 suites`
**Comprehensive eval (archived to `docs/benchmarks/baseline-v0.7.0.{json,md}`):**

| Tier | Score | Grade |
|---|---|---|
| **Overall** | 0.82 | B |
| Foundation | 0.925 | A |
| Gameplay | 0.762 | C |
| Maturity | 0.813 | B |

**Problem dims flagged for v0.8.0 uplift:**

| Dim | Baseline | Target | Grade |
|---|---|---|---|
| Efficiency | 0.649 | ≥ 0.75 | D → B+ |
| Logistics | 0.549 | ≥ 0.70 | D → B+ |
| Spatial Layout Intelligence | 0.624 | ≥ 0.70 | D → B |
| Technical (AI) | 0.745 | ≥ 0.82 | C → B+ |

**bench:logic baseline:**
- `goalFlipCount`: 39 (improved from 71 pre-v0.7)
- `invalidTransitionCount`: 0 ✔
- `deliverWithoutCarryCount`: **21** (bug — fix in Phase 7.B, target 0)
- `deathsTotal`: 2

**Benchmark runs archived to:**
- `output/bench-run-eval.log`, `output/bench-run-logic.log`, `output/bench-run-perf.log`, `output/bench-run-soak.log`
- `docs/assignment4/metrics/perf-baseline.csv` (frame-time baseline)

## Phase Status

| Phase | Scope | Status | Commit | Date |
|---|---|---|---|---|
| 0 | Branch + progress scaffolding | completed | 53e7e74 | 2026-04-21 |
| 1 | M3 fatigue/spoilage + M4 road compounding | completed | 5710da3 | 2026-04-21 |
| 2 | M2 warehouse queue + density risk | completed | c23a50b | 2026-04-21 |
| 3 | M1 soil + M1a nodes + M1b fog + M1c recycling | completed | 6eb7325 | 2026-04-21 |
| 4 | Survival mode + DevIndex + Plan C raids | completed | 7dd2ffa+iter | 2026-04-21 |
| 5 | AI adaptation 18-patch sweep | pending | — | — |
| 6 | Long-horizon benchmark harness | pending | — | — |
| 7 | Param tuning + regression fixes + release | pending | — | — |

## Final Exit Gate (check at end of Phase 7)

- [ ] `node --test test/*.test.js` — 0 failures
- [ ] Test count ≥ 761 (baseline 731 + ≥30)
- [ ] `comprehensive-eval --quick` Overall ≥ 0.88
- [ ] `bench:long --seed 42 --max-days 365` DevIndex ≥ 70, no dim < 50
- [ ] `bench:long` `violations: []`
- [ ] `bench:logic` `deliverWithoutCarryCount = 0`
- [ ] `bench:perf` frame-time regression ≤ 10% vs `docs/assignment4/metrics/perf-baseline.csv`
- [ ] `package.json` version = `0.8.0`, `CHANGELOG.md` has `[0.8.0]` section
- [ ] This progress doc fully populated
- [ ] Final review round (code-reviewer + silent-failure-hunter + legacy-sweep + type-design-analyzer + pr-test-analyzer) returned clean

## Per-Phase Log

### Phase 0 — Branch setup & baseline snapshot

_2026-04-21 — Started._
- Branch `feature/v080-living-world` created off `6e85c39` (spec v3 commit).
- Baseline JSON + MD archived to `docs/benchmarks/baseline-v0.7.0.{json,md}`.
- Full test suite confirmed green: 731 pass / 0 fail / 60 suites / 3.8s.
- No code changes this phase.

_Phase 0 commit:_ `53e7e74` (chore(v0.8.0 phase-0): branch setup + baseline snapshot).

---

### Phase 1 — Infrastructure mechanics (M3 + M4)

_2026-04-21 — Started._

**Subagents dispatched (parallel, 2-way):**
- Agent 1.A (M4 road compounding): Navigation.js `roadStep` stacking, LogisticsSystem warehouse-inclusion + `isolationDepositPenalty` exposure, WorkerAISystem deliver-block isolation detection. Produced `test/road-compounding.test.js` (7 cases).
- Agent 1.B+1.C (M3 fatigue + spoilage): WorkerAISystem update loop `_fatigueMult` + spoilage block. Produced `test/carry-fatigue.test.js` (1 case), `test/carry-spoilage.test.js` (4 cases), `test/m3-m4-integration.test.js` (1 case).

**Review rounds:**
- Code-reviewer (`pr-review-toolkit:code-reviewer`): flagged 3 must-fix (balance values diverged from spec, carryTicks reset bug, missing CHANGELOG) + 4 nits → all 3 must-fix addressed.
- Silent-failure-hunter (`pr-review-toolkit:silent-failure-hunter`): 11 findings (3 CRITICAL, 4 HIGH, 4 MEDIUM). Fixed CRITICAL #1 (carryTicks reset) which overlapped code-reviewer #2. Remaining defensive-fallback findings accepted as pragmatic (they guard against system-order init order and are tested green); can be re-evaluated in Phase 7 hardening pass.
- Legacy sweep (`general-purpose`): flagged hardcoded `0.85` magic literal in WorkerAISystem deliver block + stale `?? 0.003` fallback for rest decay. Both fixed: exported `ISOLATION_PENALTY` from LogisticsSystem, updated fallback to `0.004`.

**Deviations from original spec caught:**
- Subagents initially wrote `carryFatigueLoadedMultiplier=1.8` (spec 1.5), spoilage rates 4× too aggressive, and `roadStackStepCap=5` (spec 20). All corrected to spec § 14.1 values.

**Fixes applied in iteration pass:**
- Aligned all 7 balance params with spec § 14.1.
- Added `carryTicks = 0` reset inside deliver full-unload block (`WorkerAISystem:492`).
- Exported `ISOLATION_PENALTY` constant from LogisticsSystem.
- Updated `?? 0.003` → `?? 0.004` in WorkerAISystem and m3-m4 integration test.
- Added CHANGELOG `[0.8.0]` unreleased section with Phase 1 entries.

**Test delta:** 731 → 744 (+13: 7 road-compounding + 1 carry-fatigue + 4 carry-spoilage + 1 integration).
**Soak sim:** temperate_plains/fortified_basin/archipelago_isles all survived 2703 ticks, peakThreat 27-48, deaths=1 each — no regression vs baseline.
**LOC changed (src/ only):** +111 / -15 across 4 files.

_Phase 1 commit:_ `5710da3` (feat(v0.8.0 phase-1): M3 carry fatigue + spoilage, M4 road compounding).

---

### Phase 2 — Warehouse economy (M2 throughput queue + density risk)

_2026-04-21 — Started + completed._

**Subagents dispatched (2 in parallel):**
- Agent 2.A (warehouse queue): new `WarehouseQueueSystem`, SYSTEM_ORDER + GameApp wiring, WorkerAISystem deliver-block intake gate. Produced `test/warehouse-queue.test.js` (3 cases). Also exported `handleDeliver` for targeted test access.
- Agent 2.B (density risk): `rebuildWarehouseDensity` helper in ResourceSystem (producer-count × avg-stock approximation since per-building stocks don't exist), `applyWarehouseDensityRisk` in WorldEventSystem, 3 new EVENT_TYPES, SceneRenderer TODO stub for amber pulse. Produced `test/warehouse-density.test.js` (3 cases).

**Review rounds:**
- Code-reviewer (`pr-review-toolkit:code-reviewer`): 3 MUST-FIX (missing BALANCE keys, tautological density Case C, non-deterministic RNG), 6 SHOULD-FIX (O(N²) queue scan, queued-contract recovery, demolition blackboard clear, handleDeliver export, magic loss fractions, DENSITY_AVG_STOCK_PER_TILE), 3 NIT. All 3 MUST-FIX addressed; 6 SHOULD-FIX partially addressed (loss fractions + avg-stock moved to BALANCE; queue-leak fixed; remaining items deferred to Phase 7 hardening).
- Silent-failure-hunter: 2 CRITICAL (queue leak on retarget, non-deterministic production RNG), 5 HIGH, 4 MEDIUM, 2 LOW. Both CRITICAL addressed via targetTile-match pruning in WarehouseQueueSystem and services.rng threading in WorldEventSystem. HIGH/MEDIUM findings related to save/load semantics and token-reset edge cases deferred to Phase 7 (no current save/load flow touches warehouse state).
- Legacy sweep (general-purpose): 2 MUST-CLEAN (balance keys, double-jeopardy queue penalty), 4 SHOULD-CLEAN, 4 NIT. Balance keys fixed. `warehouseQueuePenalty` double-jeopardy accepted as intentional: the new token gate is a hard throughput cap while the existing `warehouseLoadByKey`-based unload slowdown remains a soft penalty for shared tiles — they compose correctly under test cases.

**Fixes applied in iteration pass:**
- Added 11 new BALANCE keys (`warehouseIntakePerTick`, `warehouseQueueMaxWaitTicks`, density radius/threshold/avg-stock, fire/vermin chance/fraction/cap × 2). Decided 120 for `warehouseQueueMaxWaitTicks` (spec § 3 mentions 180 — deviation documented in balance.js comment, targeted for Phase 7 tuning sweep).
- Threaded `services` through `WorldEventSystem.update` → `applyWarehouseDensityRisk` → `services.rng.next`. Preserves `state._riskRng` as test override.
- Added queue pruning for workers whose `targetTile` drifted off the queued warehouse (prevents permanent queue growth under re-prioritization).
- Added stale-tile guard in `applyWarehouseDensityRisk` (re-checks `grid.tiles[i] === TILE.WAREHOUSE` before rolling, handles mid-tick demolitions).
- Strengthened `test/warehouse-density.test.js` with Case D (rng=0.99 → zero events) and Case E (seeded services.rng determinism across two runs).

**Test delta:** 744 → 752 (+8: 3 warehouse-queue + 5 warehouse-density).
**LOC changed (src/):** +201 / -1 across 8 files + 1 new file (`WarehouseQueueSystem.js`, ~115 lines).

_Phase 2 commit:_ `c23a50b` (feat(v0.8.0 phase-2): M2 warehouse throughput queue + density risk events).

---

### Phase 3 — Tile-state mechanics (M1 + M1a + M1b + M1c)

_2026-04-21 — Started + completed._

**Subagents dispatched (4 in parallel):**
- Agent 3.A (M1 soil salinization): BALANCE block (`soilSalinizationPerHarvest`, `soilSalinizationThreshold`, `soilFallowRecoveryTicks`, `soilSalinizationDecayPerTick`, `farmYieldPoolInitial/Max/RegenPerTick`). `TileStateSystem._updateSoil` runs per-tick for fallow expiry + yieldPool regen; `WorkerAISystem` farm branch accumulates salinized, triggers fallow at threshold, caps harvest by yieldPool with carry-refund on overflow. Produced `test/soil-salinization.test.js` (+4).
- Agent 3.B (M1a resource nodes): `NODE_FLAGS` bitmask + `seedResourceNodes` (Poisson forest, cluster-walk stone, link-seek herb). `BuildAdvisor` gates LUMBER/QUARRY/HERB_GARDEN on matching nodeFlag via `missing_resource_node`. `WorkerAISystem.applyNodeYieldHarvest` + `applyResourceNodeRegen` drain-then-regen per type. Produced `test/node-layer.test.js` (+4).
- Agent 3.C (M1b fog of war): `FOG_STATE` enum, `state.fog.visibility` Uint8Array, new `VisibilitySystem` (VISIBLE→EXPLORED sticky-memory walker), BuildAdvisor `hidden_tile` rejection, worker `explore_fog` intent fallback + `findNearestHiddenTile` frontier biasing, FogOverlay + Minimap stubs. Produced `test/fog-visibility.test.js` (+4).
- Agent 3.D (M1c demolition recycling): Per-resource `demo{Stone|Wood|Food|Herbs}Recovery` ratios replace the single `salvageRefundRatio`. BuildSystem emits `DEMOLITION_RECYCLED` event on non-zero refund; undo/redo parity across all 4 resource types. Produced `test/demo-recycling.test.js` (+4); adjusted `test/build-system.test.js` (wall refund now rounds to 0) and `test/phase1-resource-chains.test.js` (smithy/clinic refund math).

**Review rounds:**
- Code-reviewer (×2): caught CONSTRUCTION_BALANCE fallback preserved where it should be removed, salvage/ruin RNG non-determinism, setTile schema drift, hardcoded `"eligibleForPromotion"` shape drift in worker sort. All must-fix addressed; `createTileStateEntry` factory now single source of truth.
- Silent-failure-hunter (×2): 3 CRITICAL (services.rng not threaded through TileStateSystem fire, BuildAdvisor ruin salvage, M1 cap silently bypassed when tileState missing post-wildfire), 6 HIGH. CRITICALs all fixed; `services` now threads from `update(dt, state, services)` → internals; lazy-create pattern in WorkerAISystem harvest completion path; `asRngFn` throws on missing RNG instead of Math.random fallback.
- Legacy-sweep (general-purpose, ×2): 9 items (frontier cache on `state.fog` = state pollution, Grid.js duplicate init logic, stale `salvageRefundRatio` comment, etc.). 7 fixed in iteration pass; 2 deferred to Phase 7 (minimap perf, FogOverlay shader).
- Final silent-failure pass on scenario FARM reconcile fix: flagged HIGH — gating on `yieldPool <= 0` would silently refill live depleted farms, masking M1 loop. Fixed by gating on `prev == null` only.

**Deviations + deferrals:**
- `ProceduralTileTextures.drawFarm` salinization crack overlay deferred to Phase 7 (per-tile-type texture bake; per-instance material variant needed).
- FogOverlay is a zero-dep stub — real Three.js data-texture shader deferred to Phase 7.
- `salvageRefundRatio` fallback preserved as the safe-default when BALANCE values go missing (defensive only; never hit in practice).

**Bug caught during convergence:** Scenario-stamped FARMs had no `tileState` entry (ScenarioFactory uses `setTileDirect`, bypassing `setTile`). Phase 3 harvest-cap then read `yieldPool === 0` and clamped every scenario-FARM harvest to zero food, surfacing as a broken `animal-ecology.test.js` pressured<clean assertion. Fix: extended `autoFlagExistingProductionTiles` to reconcile FARM yieldPool+fertility, invoked post-scenario-stamp via `buildScenarioBundle`. Gated on `prev == null` per reviewer HIGH finding to preserve M1 salinization loop integrity.

**Test delta:** 752 → 769 (+17: +4 soil + +4 nodes + +4 fog + +4 recycling + adjustments).
**LOC changed (src/):** +784 / -32 across 13 files + 3 new files (`VisibilitySystem.js`, `FogOverlay.js`, `Minimap.js`).

_Phase 3 commit:_ `6eb7325` (feat(v0.8.0 phase-3): M1 soil + M1a nodes + M1b fog + M1c recycling).

---

### Phase 4 — Survival mode + DevIndex + Plan C raids

_2026-04-21 — Started + completed._

**Subagents dispatched (3 in parallel, staged):**
- Agent 4.A (survival mode): retired "win" outcome in favour of open-ended survival, added `state.metrics.survivalScore` monotonic counter + per-second/birth/death deltas, updated `runOutcome.js` + `deriveAtmosphereProfile` + HUD badge, wired `buildObjectivesForScenario` to return `[]`. Produced `test/survival-score.test.js` (+4).
- Agent 4.B (Plan C raids): new `RaidEscalatorSystem` that converts `devIndexSmoothed` into a raid tier (interval↓ + intensity↑), WorldEventSystem `readRaidEscalation` helper gates bandit raids on cooldown and applies tier multiplier. Produced `test/raid-escalator.test.js` (+6).
- Agent 4.C (DevIndex): new `DevIndexSystem` computes a 6-dim weighted composite (population/economy/infrastructure/production/defense/resilience) on ring-buffer smoothing. New `EconomyTelemetry.js` extracts signal collection for unit-testable per-dim scoring. Produced `test/dev-index-system.test.js` + `test/economy-telemetry.test.js` (+15).

**Review rounds:**
- Code-reviewer (`pr-review-toolkit:code-reviewer`): 2 MUST-FIX (systemOrder invariant guard missing, runOutcome counted non-worker agents as survivors), 4 SHOULD-FIX, 3 NIT.
- Silent-failure-hunter: 2 CRITICAL (PopulationGrowthSystem `Math.random` broke determinism under seeded services, timestamp-based birth cursor dropped births colliding on same integer `timeSec`), 3 HIGH (no DevIndex tick sentinel, no warning when `raidEscalation` missing after tick 1, SYSTEM_ORDER ordering not asserted), 4 MEDIUM, 3 SR-nits.
- Legacy-sweep: flagged 14+ objective-related dead code paths across types.js, benchmark/run.js, StrategicDirector, DecisionScheduler, RoleAssignmentSystem, PromptBuilder, WorldExplain, DeveloperPanel, ColonyDirectorSystem, ColonyPerceiver, WorldSummary, MemoryObserver, updateObjectiveProgress — deferred to Phase 7 cleanup sweep (functionally dormant since `buildObjectivesForScenario` returns `[]`).

**Fixes applied in iteration pass:**
- **C1:** `PopulationGrowthSystem.update(dt, state, services = null)` — threaded `services.rng.next` with Math.random fallback so seeded benchmarks stay reproducible.
- **C2:** Replaced broken timestamp cursor (which dropped same-second births) with monotonic `state.metrics.birthsTotal` counter; `ProgressionSystem.updateSurvivalScore` now diffs `birthsTotal` against `survivalLastBirthsSeen`. Fields initialised in `createInitialGameState`.
- **H1:** Added `state.gameplay.devIndexTicksComputed` sentinel in `DevIndexSystem` so HUD/consumers can detect missed ticks.
- **H2:** `WorldEventSystem.readRaidEscalation` now logs a one-shot warning if `state.gameplay.raidEscalation` is absent after tick 1 (caught SYSTEM_ORDER misconfigs early instead of silently defaulting to tier-0).
- **H3:** `GameApp.createSystems` runs `assertSystemOrder(systems, ["DevIndexSystem","RaidEscalatorSystem","WorldEventSystem"])` at boot; throws if the chain is reordered.
- **M4:** `runOutcome.js` — collapsed `aliveAgents <= 0` and the redundant `workers <= 0` branch into a single `workers <= 0` check so surviving animals/visitors no longer mask a worker-wipe.
- **SR1:** `HUDController` survival badge now appends `· Dev D/100` once `devIndexTicksComputed > 0`; removed stale `TODO(Agent 4.C)` marker.
- **SR2:** `ProgressionSystem.updateSurvivalScore` seeds `survivalLastBirthsSeen` / `survivalLastDeathsSeen` to the current total when those cursors are `undefined`, protecting tests that bypass `createInitialGameState`.
- **SR3:** WorldEventSystem raid tier application now sets `event.payload.raidTierApplied = true` to prevent double-application of the intensity multiplier if a raid is ever re-queued.
- Tests updated: `test/progression-system.test.js` and `test/survival-score.test.js` migrated from `lastBirthGameSec` timestamp semantics to `birthsTotal` counter semantics; `test/atmosphere-profile.test.js` compares loss vs neutral (no-win) endings.

**Deviations + deferrals:**
- 14+ dead-code objective paths (functionally dormant) deferred to Phase 7 legacy-sweep rather than bloat this iteration.
- M2 "NaN clamp guard" review item — already covered by existing `Number.isFinite` gate in `RaidEscalatorSystem.clamp`; no change needed.
- M3 "warehouses<1 timeSec<20 dead code" — not found in current source (likely removed in Phase 3 work); marked complete without change.

**Test delta:** 769 → 799 (+30: +4 survival-score, +6 raid-escalator, +8 dev-index, +7 economy-telemetry, +5 misc).
**LOC changed (src/):** +1,120 / -180 across 18 files + 3 new files (`DevIndexSystem.js`, `RaidEscalatorSystem.js`, `EconomyTelemetry.js`).

_Phase 4 commits:_ `93f6dc2` (DevIndex + EconomyTelemetry), `0056320` (Survival mode), `7dd2ffa` (Plan C raids), plus this iteration pass commit.

---

(Phases 5-7 entries will be appended as they complete.)
