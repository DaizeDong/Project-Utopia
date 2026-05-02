---
implementer_id: A5-balance-critic
plan: Round4/Plans/A5-balance-critic.md
round: 4
date: 2026-05-01
parent_commit: ba5b969
track: code
status: COMPLETE
---

# A5-balance-critic — R4 wave-0 Plan 6/6 implementation log

## Status

**COMPLETE** — all 3 P0 findings landed in a single commit. Tests pass: 1788 / 6 fail (pre-existing) / 3 skip; the 6 failures match the user-provided allowlist exactly. Production build clean (`npx vite build` → 144 modules transformed, dist emitted).

## Parent → head

- parent: `ba5b969` (v0.10.1-A4 R4 V5 hotfix triplet)
- head:   (see `git log --oneline -2` confirmation below)

## Changes implemented

### 1. Zero-lumber safety net — `src/simulation/meta/ColonyDirectorSystem.js`

Mirrors the existing zero-farm@99 pattern (line ~109). Inserted directly below the zero-farm block, above the existing stone-deficit safety net:

```js
const currentLumbers = buildings.lumbers ?? 0;
if (currentLumbers === 0 && Number(state.metrics?.timeSec ?? 0) < 240) {
  needs.push({ type: "lumber", priority: 95, reason: "bootstrap: zero-lumber safety net (analog to zero-farm @99)" });
}
```

Priority 95 sits below food@99/100 (food always wins), above bootstrap@78, ties cleanly with stone@95 (sort stability preserves insertion order — food first → lumber second when stone isn't critical). 240-sec window matches the plan; after that late-game logistics @66 owns lumber pacing.

### 2. Recovery boost food-floor gating — `src/simulation/meta/ProgressionSystem.js`

Two edits:
- `function maybeTriggerRecovery(...)` → `export function maybeTriggerRecovery(...)` (so the regression test can invoke it directly).
- Added the food-floor gate AFTER the meaningfulCollapse early-return and AFTER the cooldown check, so:
  - `isFoodRunwayUnsafe` and the upstream `recovery.essentialOnly = aiRecoveryActive || runwayUnsafe` flag (lines ~517-519) still fire on every tick — the gate only suppresses charge consumption.
  - The cooldown check still runs first, so the gate doesn't cause a tighter rhythm.
  - When `food >= 200 AND farms >= 1` we `return recovery` (no charge consumed, no toast).

```js
const foodNow = Number(state.resources.food ?? 0);
const farmsNow = Number(state.buildings?.farms ?? 0);
if (foodNow >= 200 && farmsNow >= 1) {
  return recovery;
}
```

### 3. Per-template starting wood + early-target hint — `src/world/scenarios/ScenarioFactory.js` + `src/entities/EntityFactory.js`

`ScenarioFactory.js` — added two new exports next to `getScenarioVoiceForTemplate`:

- `STARTING_WOOD_BY_TEMPLATE` table + `getTemplateStartingResources(templateId)` — per-template wood floor: temperate=35 (unchanged), riverlands=32, highlands=38, fortified=36, **archipelago=22**, **coastal=20**. Returns `{ wood: number | null }`; null on unknown templateIds preserves legacy fallback.
- `EARLY_TARGET_HINTS_BY_TEMPLATE` table + `getTemplateEarlyTargetHint(templateId)` — per-template `{ id, count, label }` hint:
  - temperate → firstFarms × 2
  - riverlands → firstHerbGardens × 1
  - highlands → firstQuarries × 1
  - fortified → firstWalls × 4
  - archipelago → firstBridges × 1
  - coastal → firstWarehouses × 2

Wired the early-hint into all three scenario builders' `targets` payloads:
- `getFrontierRepairTargets()` → spreads `earlyHint` into the returned target object.
- `buildGateChokepointsScenario()` (line ~604) — inline `targets:` rebuilt as IIFE that conditionally spreads `earlyHint`.
- `buildIslandRelayScenario()` (line ~771) — same pattern.

`EntityFactory.js` — imported `getTemplateStartingResources` and replaced the hardcoded `wood: ALPHA_START_RESOURCES.wood` with `getTemplateStartingResources(grid.templateId).wood ?? ALPHA_START_RESOURCES.wood`. Food + stone unchanged.

### 4. Tests added

- `test/colony-director-zero-lumber-safety.test.js` — 3 cases (fires<240s, suppresses on lumbers>=1, expires>=240s).
- `test/recovery-boost-food-floor.test.js` — 3 cases (gated when food>=200+farms>=1, fires on genuine food<=threshold crisis, fires when farms===0 regardless of food).

### 5. Changelog

- `CHANGELOG.md` — new `[Unreleased] — v0.10.1-r4-A5` section above iter4 entry; documents all 3 changes + test baseline + file list.

## Files touched

```
M  src/simulation/meta/ColonyDirectorSystem.js  (+15 LOC safety net)
M  src/simulation/meta/ProgressionSystem.js     (+15 LOC food-floor gate, 1-char export)
M  src/world/scenarios/ScenarioFactory.js       (+62 LOC two tables + getter exports + 3 wirings)
M  src/entities/EntityFactory.js                (+10 LOC import + per-template wood hook)
A  test/colony-director-zero-lumber-safety.test.js  (3 tests)
A  test/recovery-boost-food-floor.test.js          (3 tests)
M  CHANGELOG.md                                 (new top section)
```

## Tests

- New tests: 6/6 pass (`node --test test/colony-director-zero-lumber-safety.test.js test/recovery-boost-food-floor.test.js` → `pass 6 / fail 0`).
- Related existing tests: 51/51 pass (`node --test test/colony-director.test.js test/recovery-essential-whitelist.test.js test/progression-system.test.js test/balance-opening-runway.test.js test/balance-playability.test.js`).
- Full suite: 1797 tests / **1788 pass / 6 fail / 3 skip**. The 6 failures match the user-provided allowlist verbatim:
  - `exploit-regression: escalation-lethality — median loss tick ∈ [2000, 5000]`
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
  - `bare-init: no blueprints + workers → no worker stuck on the same tile >3.0s simulated`
- Production build: clean (`npx vite build` → 144 modules transformed, 3.38s).

## Risks acknowledged

- Per-template wood deltas only touch non-temperate maps; long-horizon benchmark (seed 42, temperate_plains) baseline unchanged.
- Recovery gate explicitly preserves `isFoodRunwayUnsafe` propagation — verified by reading both code paths and by recovery-essential-whitelist.test.js still passing (which exercises `essentialOnly` end-to-end).
- Lumber@95 ties with quarry@95; sort stability preserves food@99/100 ahead of both — verified by colony-director.test.js "returns sorted by descending priority" still passing.

## Confirm

See attached `git log --oneline -2` output below the commit step.
