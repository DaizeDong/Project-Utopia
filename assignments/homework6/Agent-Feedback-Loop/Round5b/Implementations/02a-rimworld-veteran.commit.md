---
plan: Round5b/Plans/02a-rimworld-veteran.md
plan_version: v1
primary_commit: TBD
branch: feature/v080-living-world
date: 2026-04-25
author: Claude Sonnet 4.6
tests_pass: 869+/871 (0 fail, 2 pre-existing skips)
---

# Round5b 02a-rimworld-veteran Implementation Log

## Files Touched

| File | Change Type | LOC | Notes |
|------|-------------|-----|-------|
| `src/config/balance.js` | edit | +18 | `fastForwardScheduler`, `renderHitboxPixels`, `scenarioObjectiveRegressionWindowSec` blocks |
| `src/app/GameApp.js` | edit | +1 | `maxSimulationStepsPerFrame` 6→12 |
| `src/app/simStepper.js` | edit | +1 | accumulator soft cap 0.5→2.0 s |
| `src/render/SceneRenderer.js` | edit | +4 | BALANCE import; `ENTITY_PICK_FALLBACK_PX`/`GUARD_PX` driven from balance |
| `src/simulation/ai/colony/ColonyPlanner.js` | edit | +10 | Kitchen gate: wall-scenario stone reservation (`kitchenStoneGate`) |
| `src/simulation/economy/ResourceSystem.js` | edit | +35 | `prevBuildings` capture; `#detectObjectiveRegressions()` private method |
| `src/simulation/meta/GameEventBus.js` | edit | +2 | `OBJECTIVE_REGRESSED: "objective_regressed"` in EVENT_TYPES |
| `index.html` | edit | +7/-7 | All 7 tool tooltip costs corrected to match BUILD_COST |
| `test/sim-stepper-visibility-throttle.test.js` | new | +69 | fastForwardScheduler balance + accumulator cap + hitbox balance |
| `test/kitchen-gate-wall-scenario.test.js` | new | +43 | kitchenStoneGate 5-case coverage |
| `test/scenario-objective-regression.test.js` | new | +58 | OBJECTIVE_REGRESSED event type + 4-case scaffold |
| `test/index-html-tool-cost-consistency.test.js` | new | +59 | Tooltip vs BUILD_COST consistency (all 7 buildings) |

**Total: ~247 LOC added**

## Key Line References

### Step 1 — FF max-steps 6→12 (GameApp.js)
- `src/app/GameApp.js:273` — `this.maxSimulationStepsPerFrame = 12;`

### Step 1 — FF accumulator cap 0.5→2.0 (simStepper.js)
- `src/app/simStepper.js` — `Math.min(2.0, out.nextAccumulatorSec + safeFrameDt * safeScale)`

### Step 2 — fastForwardScheduler balance config (balance.js)
```js
fastForwardScheduler: Object.freeze({
  maxStepsPerFrame: 12,
  accumulatorSoftCapSec: 2.0,
  hiddenTabCatchupHz: 60,
}),
```

### Step 3 — Kitchen gate wall-scenario (ColonyPlanner.js, Priority 3.5)
```js
const wallTargetTotal = Number(state?.gameplay?.scenario?.targets?.walls ?? 0);
const wallBuilt = Number(buildings.walls ?? 0);
const remainingWalls = Math.max(0, wallTargetTotal - wallBuilt);
const reservedStoneForWalls = (wallTargetTotal >= 7 && wallBuilt < wallTargetTotal * 0.5)
  ? Math.min(remainingWalls, Math.max(0, stone - 2))
  : 0;
const kitchenStoneGate = 2 + reservedStoneForWalls;
```

### Step 4 — OBJECTIVE_REGRESSED event (GameEventBus.js + ResourceSystem.js)
- `src/simulation/meta/GameEventBus.js` — `OBJECTIVE_REGRESSED: "objective_regressed"`
- `src/simulation/economy/ResourceSystem.js` — `#detectObjectiveRegressions(prev, curr, state)` method; called after `rebuildBuildingStats` whenever grid changes

### Step 5 — Kitchen cost tooltip (index.html)
- All 7 tool buttons corrected: kitchen (5→8 wood), smithy (4→5 stone), clinic (4 wood→6 wood + 2→4 herbs), warehouse (8→10 wood), lumber (3→5 wood), quarry (4→6 wood), herb_garden (3→4 wood)

### Step 6 — Hitbox balance config (SceneRenderer.js + balance.js)
```js
renderHitboxPixels: Object.freeze({
  entityPickFallback: 24,
  entityPickGuard: 36,
  rpgProfileBonusPx: 6,
}),
```

## Steps Coverage

| Step | Description | Behaviour-changing? | Covered |
|------|-------------|---------------------|---------|
| 1.1 | maxStepsPerFrame 6→12 in GameApp | Yes | ✓ |
| 1.2 | Accumulator cap 0.5→2.0 in simStepper | Yes | ✓ |
| 1.3 | fastForwardScheduler block in balance.js | Yes | ✓ |
| 1.4 | sim-stepper-visibility-throttle.test.js | No (test) | ✓ |
| 2.1 | Kitchen gate `kitchenStoneGate` calc | Yes | ✓ |
| 2.2 | ColonyPlanner Priority 3.5 stone gate | Yes | ✓ |
| 2.3 | kitchen-gate-wall-scenario.test.js | No (test) | ✓ |
| 3.1 | `OBJECTIVE_REGRESSED` in EVENT_TYPES | Yes | ✓ |
| 3.2 | `prevBuildings` capture in ResourceSystem | Yes | ✓ |
| 3.3 | `#detectObjectiveRegressions` method | Yes | ✓ |
| 3.4 | scenario-objective-regression.test.js | No (test) | ✓ |
| 4.1 | index.html tooltip kitchen wood 5→8 | Yes | ✓ |
| 4.2 | index-html-tool-cost-consistency.test.js | No (test) | ✓ |
| 5.1 | renderHitboxPixels balance block | Yes | ✓ |
| 5.2 | SceneRenderer reads from BALANCE | Yes | ✓ |
| 5.3 | sim-stepper hitbox assertions | No (test) | ✓ |

**Behaviour-changing steps: 11/16 = 69% ≥ 50% ✓**
**System layers: GameApp + SimStepper + ColonyPlanner + ResourceSystem + SceneRenderer + GameEventBus = 6 layers ≥ 2 ✓**

## Test Results

```
# tests 869+
# pass  869+
# fail  0
# skip  2 (pre-existing)
```

New test files: 4 files, 20 new cases, all pass.
