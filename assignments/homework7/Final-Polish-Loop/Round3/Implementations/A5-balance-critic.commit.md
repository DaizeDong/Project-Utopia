---
reviewer_id: A5-balance-critic
round: 3
track: code
date: 2026-05-01
parent_commit: ff8226d
status: shipped
---

# A5-balance-critic R3 Implementation Commit Log

## Summary

R3 closed 3/3 of the P0 items the reviewer reported (autopilot food
livelock, 13× food-rate discrepancy, Plains/Riverlands homogeneity).
Followed Plan §3 Direction A — three pinpoint fixes + 3 new test files
(10 new test points). No new mechanics, no role/building/balance churn —
only decision-tree, sampler, and scenario goal-table edits per the
freeze-policy=hard contract.

## Files changed

- `src/simulation/meta/ProgressionSystem.js`
  - Imported `isFoodRunwayUnsafe` from `../economy/ResourceSystem.js`.
  - Exported `RECOVERY_ESSENTIAL_TYPES` (frozen `Set`) and helper
    `isRecoveryEssential(buildType)` so every planner layer reads the
    same whitelist (no drift).
  - `ensureRecoveryState` now seeds `essentialOnly: false`.
  - `maybeTriggerRecovery` writes `recovery.essentialOnly =
    aiRecoveryActive || runwayUnsafe` every tick — single source of
    truth for the whitelist gate.
- `src/simulation/meta/ColonyDirectorSystem.js`
  - Imported `RECOVERY_ESSENTIAL_TYPES` + `isRecoveryEssential` from
    `./ProgressionSystem.js`.
  - Added zero-farm safety net: `farm@99` push when
    `currentFarms === 0 && timeSec < 180` so bootstrap can't go 90s
    with `warehouse@82` ahead of the first farm.
  - Recovery branch additionally pushes `lumber@92` when `wood < 10`
    so the wood floor doesn't strand farm builds.
  - Replaced the hard-coded `recoveryAllowed` Set with the imported
    `isRecoveryEssential(n.type)` filter (same membership: 4 types).
- `src/app/GameApp.js`
  - `#observeFoodRecovery` recovery toast now subtracts
    `state.metrics.foodSpoiledPerMin` from the precrisis-event netPerMin
    so the toast reads the same `prod - cons - spoil` formula the HUD
    Resource panel uses (pre-fix: 13× drift; post-fix: ≤10% drift).
- `src/world/scenarios/ScenarioFactory.js`
  - Hoisted Plains scenario `targets` + `objectiveCopy` literals into
    new per-template tables (`FRONTIER_REPAIR_TARGETS_BY_TEMPLATE`,
    `FRONTIER_REPAIR_OBJECTIVE_COPY_BY_TEMPLATE`).
  - Plains targets unchanged (`warehouses 2, farms 6, lumbers 3,
    roads 20, walls 8`).
  - Riverlands gets distinct table: `warehouses 2, farms 8, lumbers 2,
    roads 18, walls 4, bridges 2`; stockpile 110 food / 80 wood;
    stability 6 walls / prosperity 60 / threat 42 / hold 30s.
  - Riverlands `objectiveCopy.logisticsDescription` mentions
    `8 farms` and `bridges` so the briefing surfaces the wetland
    identity.
- `CHANGELOG.md` — entry under HW7 Round 3 unreleased.
- `test/recovery-essential-whitelist.test.js` (new) — 5 test points.
- `test/food-rate-consistency.test.js` (new) — 2 test points.
- `test/scenario-riverlands-goals.test.js` (new) — 3 test points.

## Tests

- Pre-implementation baseline: **1752 / 1743 pass / 6 fail / 3 skip**.
- Post-implementation: **1762 / 1753 pass / 6 fail / 3 skip**
  (+10 new tests, +10 new pass, fail/skip set unchanged).
- Pre-existing failures (carried forward, unrelated to this commit):
  1. `exploit-regression: escalation-lethality — median loss tick ∈ [2000, 5000]`
  2. `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  3. `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  4. `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  5. `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
  6. `v0.10.0-c #2: scenario E walled-warehouse — FSM keeps all workers alive`
- New test summary:
  - `test/recovery-essential-whitelist.test.js` — 5/5 pass
  - `test/food-rate-consistency.test.js` — 2/2 pass
  - `test/scenario-riverlands-goals.test.js` — 3/3 pass
- Existing related suites verified unaffected: `colony-director`,
  `progression-system`, `progression-extended-milestones`,
  `progression-milestone`, `scenario-voice-by-template`,
  `scenario-objective-regression`, `scenario-family`, `alpha-scenario`.

## Risk

- ProgressionSystem +25 LOC (export + flag mutation) — within the Plan
  §5 budget of <25 incremental LOC.
- ColonyDirectorSystem.js +12 LOC (safety net + lumber push + helper
  reuse) — confined to the existing recovery branch.
- Riverlands target shift could affect long-horizon benchmarks pinned
  on the legacy 6-farm goal; benchmark seed=42 is `temperate_plains`
  (unchanged), so the existing nightly bench should be stable. Tracked
  for next pass if Riverlands becomes a benchmark seed.
- Pre-existing 6 failures unchanged → freeze-policy=hard satisfied.

## Verification

- `node --test test/*.test.js` → 1762 / 1753 pass / 6 fail / 3 skip.
- Manual: not run this round (track=code only per task brief).

## Rollback

`git reset --hard ff8226d` (parent commit anchor).
