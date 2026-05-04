# R9 — PW-Scale-Stability Reviewer Report

**Reviewer:** Playwright BLIND scale-stability stress test
**Date:** 2026-05-01
**Build:** v0.10.1-m (preview, port 19090)
**User goal (CN):**
> "让殖民地在拥有超多建筑、worker 时，工作分配依然稳定" + "能够应对一次性大于 10 个掠夺者的袭击"

---

## Method

Live game launched via `?dev=1`, scenario `alpha_broken_frontier`, 96×72 map, seed 1904006029. Three sequential stress tests applied via `window.__utopia.applyPopulationTargets()` and `window.__utopia.buildSystem.placeToolAt(..., {instant:true})`. Metrics from `state.metrics`, `state.metrics.combat`, `state.metrics.performanceCap`, and `state.gameplay.raidEscalation`.

Baseline (post-Start, t≈65s): 12 workers (FSM:IDLE×12), 0 buildings, food=320, FPS=49.0, frameMs=0.6.

---

## Test A — 50 workers (no buildings)

**Setup:** `applyPopulationTargets({workers:50, traders:2, saboteurs:2, herbivores:8, predators:2})` at t≈114s. Held until t≈141s (~27s observation).

**Findings:**
- Workers spawned cleanly: **populationBreakdown.totalWorkers=50, agentsTotal=53**.
- RoleAssignmentSystem auto-allocated: FARM 31, WOOD 19. Two-role baseline because no warehouses/processing/walls exist yet — correct behaviour.
- FSM distribution: **IDLE=48, RESTING=1, FIGHTING=1**. 48 IDLE is correct given there are no harvest targets / no warehouses to deliver to.
- **Performance held: FPS=59.88, frameMs=2.3, simCpuFrameMs=2.3, performanceCap.active=false.** Zero throughput cost from 4× workers.
- Population reconcile minor bug: target saboteurs=2 → got SABOTEUR×1 in the agent list. Off-by-one in resize/spawn (rare, low severity).
- Resource drain inevitable (no production): food 307→56 in ~70s. Bandit raid auto-fired at t=121s and workers self-defended (1 FIGHTING, 3 kills).

**Severity:** **GREEN.** Worker spawn + role-assignment + FSM scale fine to 50. The "no work to do" idle state is correct; no thrashing.

**Note re: Settings Dev Tools `Worker count → 50`:** the `stressExtraWorkers` slider creates **synthetic patrol workers with no `fsm` property** (`stateLabel: "Stress patrol"` only). They burn CPU on movement/path but **bypass the FSM scheduler entirely** — so the slider does NOT actually stress the work-assignment code path. Real worker scaling requires `applyPopulationTargets({workers:N})`. Worth flagging in the PERF panel as "patrol stress only" so testers don't think they're stress-testing AI.

---

## Test B — 50 workers + ~50 buildings

**Setup:** Boosted resources (food/wood/stone=5000), then placed via `buildSystem.placeToolAt(..., {instant:true})`: 6× warehouse, 16× farm, 14× wall, 4× kitchen, 4× smithy, 2× clinic, 8× road. Snapshot at t≈248s (~107s after placement).

**Real placements (some silently failed):**
- warehouses 1 (5 blocked by `warehouseTooClose` proximity rule)
- farms 16, walls 14, kitchens 4, roads 8 → **43 buildings live**
- smithies 0, clinics 0, lumbers 0, quarries 0, herbGardens 0 — these need underlying forest/stone/herb nodes; instant-place silently fails, not a bug but an UX gotcha for stress testing.

**Findings:**
- RoleAssignmentSystem rebalanced: WOOD 17, COOK 5, FARM 21, HAUL 7. **Sane mix, COOK/HAUL drafted as soon as kitchens + warehouse appeared.**
- FSM distribution: **HARVESTING=16, SEEKING_HARVEST=11, PROCESSING=3, SEEKING_PROCESS=2, DELIVERING=1, RESTING=1, IDLE=16**. **34/50 BUSY (68% utilisation).**
- **Top target-tile cluster: only 4 workers on tile (47,33)**, next 3 on (45,33), then 2's. **No mass clustering — distribution healthy across the 16 farms.** This is the headline win for the v0.10.0 priority FSM at scale.
- **Performance: FPS=59.88, frameMs=0.9, simCpuFrameMs=0.9, performanceCap.active=false.** Zero degradation despite 50 workers actively pathing + harvesting.
- Production confirmed: meals 0→24.7 in 100s, food held 4780.
- DevIndex climbed to 73.

**Severity:** **GREEN** for work distribution and perf. **YELLOW** for the building-placement UX (no toast/log when smithy/lumber etc silently fail because of missing node) — not a stability issue but it makes scale testing harder.

---

## Test C — 12 saboteurs (raider equivalent) all at once + 50 workers + 43 buildings

**Setup:** `applyPopulationTargets({...prev, saboteurs:12})` at t≈287s (12 simultaneous hostiles). Observed for 100s through t≈389s.

**Findings:**
- 11–12 saboteurs alive throughout window (one churned). All 11 had **`stateLabel: "Evade"` / `aiTargetState: "evade"`** — they actively flee combat instead of swarming the colony. So GUARDs can't engage them head-on.
- **GUARDs drafted automatically: guardCount=4** (RoleAssignmentSystem reading `combat.activeSaboteurs=11`). This works — the v0.8.7 T0-4 fix is effective.
- **Worker deaths during the saboteur stress: 0/50.** All 50 workers alive at t=389s. Several FIGHTING transitions fired (peaked at 2 simultaneously) and 7 hostiles confirmed killed in that window. Combat preempt is functioning.
- Sabotage damage during 100s of 12 saboteurs: **1 warehouse fire** (stored goods damaged, t=322s). Low impact.
- Concurrent bandit raids: **8 raids fired in 250s** (every ~30s, raidEscalation.tier=8, intensityMultiplier=7.5×, projectedDrain=628 food/raid). Resources held 4534→3879 — colony absorbs it.
- **Performance under combined 50 workers + 43 buildings + 12 saboteurs + 8 raids: FPS=48.07, frameMs=1.3, simCpuFrameMs=1.3, performanceCap.active=false, perfScale=1.08.** **Excellent.**

**Severity for combat handling:** **YELLOW.**
- The defensive draft works — GUARDs spawn and engage when threats commit.
- BUT the user asked specifically for **"一次性大于 10 个掠夺者的袭击"** (>10 raiders attacking simultaneously). What I observed is **11–12 SABOTEURS that all flee** rather than attacking. There is no API/dev tool I could find to force-spawn 10+ true RAIDERS in a single bandit-raid spawn (`combat.activeRaiders=0` the whole time despite 8 raids firing — bandit raids drain resources, they don't spawn 10+ unit melee waves). The defence is **untested in the scenario the user asked about** because the engine doesn't generate that scenario.

---

## CRITICAL stability gap (cuts across Tests B + C)

**Workers starving in the middle of plenty at 50-worker scale.**

At t≈389s with 50 workers, 16 farms, 1 warehouse, 4 kitchens, **food=3879 + meals=194 in stockpile**:

| Hunger bucket | Worker count |
|---|---|
| 0.0 (zero) | **41** |
| 0.1 | 8 |
| 0.2 | 1 |
| ≥0.3 | 0 |

- **49/50 workers in critical hunger** (HUD `Critical hunger 49 / Hungry 2 / Combat 11`).
- 23 workers have `carry.food > 0` they are **not consuming**.
- Stockpile is overflowing (food 3879, meals 194), but the eat-pipeline can't get it into 50 mouths fast enough.

**Likely cause:** The single warehouse (5/6 blocked by `warehouseTooClose`) becomes the bottleneck for `at-warehouse fast-eat` (v0.10.1-h). All 50 workers must converge on tile (46,34) to deposit + eat. With FSM transition priorities favouring HARVESTING over EATING for non-survival hunger thresholds, workers loop harvest → carry → seek-warehouse → queue → starve before reaching the deposit tile.

**Impact:** Colony survives the perf/AI test BUT it's heading into a starvation cascade. Once hunger ticks below survival-bypass threshold the FSM should preempt to EATING (priority:1 in HARVESTING.transitions per v0.10.0), but with carry.food >0 and no warehouse-eat route the survival bypass apparently doesn't fire either.

**Severity: HIGH.** This is the single biggest scale-stability gap. At 12 workers it's invisible (one warehouse handles them); at 50 workers + 1 warehouse it's catastrophic.

---

## Summary

| Test | Result | Severity |
|---|---|---|
| A: 50 workers (no buildings) | Spawn/role/FSM clean. FPS 59.88. 48 IDLE = correct. | GREEN |
| B: 50 workers + 43 buildings | 68% busy, top cluster only 4-on-1 tile. FPS 59.88, frameMs 0.9. Distribution healthy. | GREEN |
| C: 12 saboteurs + B's load | 4 GUARDs auto-draft; 0 worker deaths; 1 warehouse fire. FPS 48.07, frameMs 1.3. | YELLOW (saboteurs evade — true 10+ raider swarm untested because engine doesn't spawn it) |

**Top stability gap:** **49/50 workers starving with 3879 food + 194 meals in stockpile.** Single-warehouse bottleneck strangles the eat pipeline at 50-worker scale; survival-preempt doesn't fire because workers' `carry.food > 0` masks the emergency. Recommend: (1) fast-eat-from-carry should fire at hunger<0.15 regardless of warehouse reachability, OR (2) per-warehouse eat-throughput cap so the role-assigner adds warehouses when contention >N workers/site.

**Secondary:**
- **MEDIUM:** Dev-tool stress slider creates fake patrol workers (no FSM); doesn't stress AI. Label it.
- **LOW:** Building instant-place silently fails for node-required types (smithy/lumber/clinic/quarry/herb_garden); add a placement reason toast.
- **LOW:** `applyPopulationTargets({saboteurs:N})` resize/spawn is off-by-one (target 2 → 1 alive in Test A).
- **GAP:** No way to force-spawn 10+ simultaneous melee RAIDERS; bandit raid is a passive resource-drain event, not a combat unit spawn. The user's "1次性大于10个掠夺者" scenario is presently un-triggerable from gameplay.

Reference screenshot: `assignments/homework7/Final-Polish-Loop/Round9/Feedbacks/screenshots/round9-pw-scale-stability.png` (HUD shows Critical hunger 49 + Combat 11).
