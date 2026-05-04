# PY · Development-Completion Reviewer · Round 9 · BLIND PLAYTHROUGH

**Mission**: verify the colony actually *unlocks the full processing chain* (kitchen / smithy / clinic), not just the food/wood foothold. R8 PT noted "Lumber 0 / Wood 软锁" — R9 PA fixed BUILDER stuck Wander, but the user wants **completion**: scenario goals checked off, devIndex production dim populated, meals/medicine/tools actually flowing.

## Method

- Vite dev server `http://127.0.0.1:5173/?dev=1` (dev hook live → `window.__utopia` exposes full state).
- Defaults: Temperate Plains, 96×72, scenario `alpha_broken_frontier`, AI `setAiEnabled(true)` but proxy unreachable → **fallback rule-based autopilot** (the production-default policy stack: BootstrapProposer → LogisticsProposer → ProcessingProposer, gated by RecoveryProposer).
- `__utopiaLongRun.startRun()` then `__utopia.stepSimulation(1/30)` × 9000 steps per sample = **5 sim-min between snapshots**.
- 8 samples covering **t=00:37 → t=35:00 sim-min** (~35.7 min total, no unwanted pause/death exit, phase=`active` throughout).

## Time Series — Buildings

| sim-time | warehouses | farms | lumbers | quarries | herbGardens | kitchens | smithies | clinics | walls | gates | bridges | roads |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 00:37 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 9 |
| 05:00 | 1 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 18 |
| 10:00 | 2 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 84 |
| 15:00 | 2 | 8 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 80 |
| 20:00 | 2 | 7 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 80 |
| 25:00 | 2 | 6 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 80 |
| 30:00 | 2 | 7 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 79 |
| 35:00 | **1** | 7 | 2 | **0** | **0** | **0** | **0** | **0** | **0** | **0** | 5 | 79 |

Visible chain: **Warehouse → Farm → (eventually) Lumber → Bridge → Roads**. **No quarry, no herbGarden, no kitchen, no smithy, no clinic, no walls EVER built across 35 sim-min.** A warehouse was even *lost* between t=30 and t=35 (saboteur impact — saboteur pop spiked 7 → 18 at t=35).

## Time Series — Resources & Processing-Chain Output

| sim-time | food | wood | stone | herbs | meals | medicine | tools |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 00:37 | 304.2 | 1.1 | 12 | 0 | 0 | 0 | 0 |
| 05:00 | 249.2 | 89.3 | 0 | 0 | 0 | 0 | 0 |
| 10:00 | 25.1 | 7.6 | 0 | 0 | 0 | 0 | 0 |
| 15:00 | 88.8 | 250.8 | 0 | 0 | 0 | 0 | 0 |
| 20:00 | 229.7 | 585.0 | 0 | 0 | 0 | 0 | 0 |
| 25:00 | 194.5 | 916.2 | 0 | 0 | 0 | 0 | 0 |
| 30:00 | 215.5 | 1175.3 | 0 | 0 | 0 | 0 | 0 |
| 35:00 | 190.9 | **1323.2** | **0** | **0** | **0** | **0** | **0** |

End-of-run per-min metrics (live read at t=35:42):
- `mealsProducedPerMin = 0` · `medicineProducedPerMin = 0` · `toolsProducedPerMin = 0`
- `stoneProducedPerMin = 0` · `herbsProducedPerMin = 0`
- `woodProducedPerMin = 0` (despite 2 lumber camps standing for 20 sim-min)
- `foodProducedPerMin = 0` / `foodConsumedPerMin = 15.96` / `foodSpoiledPerMin = 3.37` → **net food drain when production stalls**

**Verdict: processing chain is stone-cold dead. No meal, no tool, no medicine produced in 35 sim-min — colony is permanently subsistence-only.**

## Time Series — DevIndex Breakdown (live at t=35)

```
devIndex            = 45.13   (gameplay.devIndex)
devIndexSmoothed    = 45.13
devIndexDims = {
  population:     90.00   ← 12 → 9 → 7 workers; cap binds
  economy:        56.47
  infrastructure: 15.43   ← 1 warehouse, 0 quarry/herb_garden
  production:     30.00   ← floor; no kitchen/smithy/clinic ever fed it
  defense:         0.00   ← 0 walls, 0 gates, 0 guards (roleCounts.GUARD=0)
  resilience:     47.35
}
```

The "production" dim is sticky around 30 because no processing buildings exist. "defense" is **0.00** the entire run — the strategy banner literally reads `priority: "defend"` while building zero wall tiles.

## Time Series — Scenario Goal Progress

`state.gameplay.objective.title = ""`, `objective.progress = 100`, `objective.index = 0` from t=00:37 onwards. The **scenario "Broken Frontier" objective shows 100% from the first sample** — i.e., the scenario goal layer either auto-completed on first warehouse or has no further milestones queued. The HUD action message at t=30/t=35 reads:

> "Dev 40 · foothold: Your colony is surviving; widen the production chain."

The game is *literally telling itself* to widen the production chain, but the autopilot can't act on it because of the lockup below.

## Time Series — Workforce Roles & Construction Queue

End state `roleCounts`:
```
FARM=5  WOOD=0  STONE=0  HERBS=0
COOK=0  SMITH=0 HERBALIST=0
HAUL=0  GUARD=0 BUILDER=2
```
- `WOOD=0` despite 2 lumber camps → **lumbers are zombie buildings**, no harvest happens.
- `STONE=0 HERBS=0 COOK=0 SMITH=0 HERBALIST=0` are inevitable: zero of those buildings exist to assign roles to.
- `GUARD=0` despite `strategy.priority="defend"` and saboteurs+predators in zone.

End state `constructionSites`:
```
csCount = 27
csByType = { road: 26, warehouse: 1 }   ← ZERO processing buildings queued
```

## Findings — Root Cause of Completion Stall

**Locked finding (BLOCKER, 1 line of evidence):**

```
state.ai.foodRecoveryMode = true            ← SET at sim t=127.4s
state.ai.foodRecoveryReason = "food runway unsafe"
state.metrics.foodHeadroomSec = 39.74       ← never climbs past safety bar
state.metrics.populationGrowthBlockedReason = "food headroom 40s < 60s (auto-fill skipped)"
```

The autopilot entered `foodRecoveryMode` at sim t=127s and **never exited** it across the next 33 sim-min. Per `src/simulation/ai/colony/BuildProposer.js:140-147` and `proposers/RecoveryProposer.js:40`, when `isRecoveryMode(state)` is true, **`ProcessingProposer` (which is the only proposer that emits quarry/herb_garden/kitchen/smithy/clinic/wall) is short-circuited out of the WAVE_2 chain**. The colony then loops forever on Bootstrap (warehouses) + Logistics (roads) + Recovery (more farms / repair).

Cascade:
1. `foodHeadroomSec` is computed from `(food / foodConsumedPerMin)` × 60. Consumption grows with workers; production is capped because workers eat from carry / spoilage drains 3.37/min on the road network.
2. The runway-unsafe gate uses ~60s headroom. Recovery mode is sticky — it builds *more farms*, which uses *more wood*, which keeps `WOOD=0` workers (no role assignment) starving the build pipeline.
3. Stone never produced → can't build smithy / walls / clinic prereqs (those buildings cost stone in `BALANCE`). Even if the proposer fired, the autopilot would skip-for-cost.
4. `defense=0` permanently → `gameplay.threat=27.7` plus 18 saboteurs at t=35 → warehouse already destroyed (2→1) → food stockpile risk further widens.

This is exactly the failure mode the user flagged ("着重提升建设的完整度" — emphasize *completion* of construction). The colony is stuck in **infinite food-triage purgatory** with the production chain held hostage behind a recovery-mode gate that never releases.

**Top completion gap (single-line summary):** `foodRecoveryMode` latches on at t=127s and never releases for 33+ sim-min, which causes `BuildProposer` to skip `ProcessingProposer` indefinitely → quarries/herbGardens/kitchens/smithies/clinics/walls never even reach the construction queue.

## Secondary Findings

1. **Lumber zombie buildings**: 2 lumber camps standing for 20 sim-min, `roleCounts.WOOD=0`, `woodProducedPerMin=0`. Wood is somehow accumulating (1.1 → 1323.2) — confirming PA's R9 thesis that the wood comes from one-shot terrain harvest (FOREST tile clearing), not steady lumber-camp production. R8 PT's "Lumber 0 / Wood 软锁" is *partially* fixed (wood inventory rises) but the lumber camp role-pump itself is still broken.
2. **Road over-spam**: 79 roads for a 9-worker colony on a 96×72 grid. `LogisticsProposer` keeps emitting "expand road network" up to `PROCESSING_TARGETS.roads = 30` (per `ProcessingProposer.js:37`), but the actual ceiling is much higher because the threshold is checked against `b.roads`, not road density. 79 ≫ 30 means another proposer (LogisticsProposer or ScoutRoadProposer) is the actual emitter.
3. **Food spoilage feedback loop**: 3.37/min spoiled on a 79-road network. Each road clears `spoilageOnRoadMultiplier=0` per CLAUDE.md, so spoilage is happening *off-road* (carry-eat, depot-overload). This is what keeps `foodHeadroomSec` pinned at 40s.
4. **Saboteur explosion**: workers 12 → 7, saboteurs 1 → 18 over 35 sim-min. `roleCounts.GUARD=0` because no clinic / wall infra exists for guard hand-off. Defense dim stays 0.

## Recommended Fix Direction (out of scope for review, for R10 planning)

- **Time-bound `foodRecoveryMode`**: latch should release if (`foodHeadroomSec >= 60`) **OR** (`time_in_recovery > 600s` and `food > 100`). 35-min lockout is undefined behaviour.
- **Proposer relaxation**: even in recovery mode, allow `quarry` (priority 77 + earlyBoost) and `herbGarden` to be queued — they are *prerequisites* for getting out of food-triage (smithy → tools → farm output multiplier). Currently the recovery gate denies the very thing that would end recovery.
- **Lumber camp role-pump**: investigate why `roleCounts.WOOD=0` while 2 lumbers stand idle — likely `RoleAssignmentSystem` deprioritises WOOD when in `foodRecoveryMode`.

## Run Manifest

- Browser: Playwright Chromium against `http://127.0.0.1:5173/?dev=1`
- Total sim-time stepped: **35.7 sim-min** (64,204 ticks @ fixedStepSec=1/30)
- Wall-clock duration of stepping: ~80s (`stepSimulation` ran in-thread; render loop suspended)
- Phase throughout: `active` (no death, no menu return)
- AI mode: `fallback` (LLM proxy `unknown`, `fallbackCount=3`, `llmCount=0`)
- Snapshot file: `utopia-r9-py-samples.json` (cwd, ~178 KB) — full per-sample dumps
- Slim file: `utopia-r9-slim.json` (cwd, ~178 KB)
