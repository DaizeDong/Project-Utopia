# v0.9.0 Worker AI Job-Layer Rewrite — Retrospective

_Date: 2026-04-29. Phase 5 of 5 (v0.9.0-e) is the final commit; this doc
locks the architectural shift in place._

## What the rewrite delivered

v0.9.0 replaced the worker AI's hand-written intent FSM + commitment latch
with a Job-utility scheduler. The previous architecture had **three
intent pickers** (StatePlanner, AI policy, fallback) feeding a single
`currentState` per worker, plus a `commitmentCycle` latch that hard-locked
state transitions for ~120 LOC of arithmetic. The new architecture has
**one source of truth** (`worker.currentJob`), set every tick by
`JobScheduler.tickWorker`, which re-scores all eligible Jobs and keeps the
incumbent only via a soft hysteresis bonus that decays over 30 s.

The rewrite shipped in five phases: (a) the `Job` base class +
`JobScheduler` + `JobWander` skeleton behind a feature flag; (b) the four
harvest Jobs + `JobHelpers`; (c) the eight remaining Jobs
(Deliver/Build/Eat/Rest/Process×3/Guard); (d) flag flipped ON in
production, commitment latch retired, ~370 LOC of legacy deleted, trace
gate passed; (e) **this commit** — the legacy `handle*` functions in
`WorkerAISystem.js` are inlined into their respective Jobs (or deleted as
dead code), the `WorkerAISystem.js` ECS system shrinks to its true
responsibilities (worker loop, LOD logic, JobScheduler invocation,
per-tick decay, FSM display state, telemetry), the trace harness is
patched to count carry-eat ticks correctly, and v0.9.0 is feature-complete.

## What NOT to revert to

- **Do not re-introduce a hard-lock TASK_LOCK_STATES set.** The new
  hysteresis (`STICKY_BONUS_FRESH = 0.25` decaying to `STICKY_BONUS_FLOOR =
  0.05` over `STICKY_DECAY_SEC = 30`) is empirically stable across all
  seven scenarios A–G. A hard lock prevents the worker from ever
  re-evaluating, which is what the v0.8.x F2/F12 escape branches were
  patching around.
- **Do not re-introduce the per-state escape branches** that v0.8.12 added
  (`commitmentCycle.entered`, `survivalInterrupt`, `deliverStuckReplan`).
  The Job's `canTake` + `findTarget` blacklist guards (audit F12 fix in
  phase d) and the `isComplete` predicate subsume them all.
- **Do not split target-finding from eligibility.** Each Job's
  `findTarget` AND `canTake` together decide if the Job is actionable;
  the scheduler only awards a score to actionable Jobs. The legacy
  picker/planner separation produced "planner wants harvest, picker
  finds no target → idle" stalls (the "planner-out-of-picker" metric in
  the trace harness) that collapsed once eligibility was fused into the
  Job.

## Metric table

| Metric (per scenario) | v0.8.10 | v0.8.13 | v0.9.0-d | v0.9.0-e |
|---|---|---|---|---|
| A stuck>3s              | 0  | 0  | 0  | 0  |
| B stuck>3s              | 2  | 0  | 0  | 0  |
| C stuck>3s              | 4  | 1  | 1  | 1  |
| D stuck>3s              | 6  | 2  | 1  | 1  |
| E stuck>3s              | 11 | 7  | 5  | 5* |
| F stuck>3s (long-horiz) | 5  | 3  | 2  | 2  |
| G stuck>3s (high-pop)   | 4  | 1  | 1  | 1  |
| Planner-out-of-picker (E, /min) | ~80 | ~50 | 26.50 | 26.50 |
| Deaths (D, 60s)         | 4  | 0  | 0  | 0  |
| Avg role volatility max | 5  | 3  | 3  | 3  |

\* The harness metric refinement in this phase (count carry-eat /
hunger-rise ticks as not-stuck) was applied. In E specifically, the five
remaining "stuck>3s" workers diagnosed via the harness are NOT carry-eating
during their stuck window — they are genuinely path-failing on harvest /
seek_food in a deadlocked routing config. The phase-d brief's framing
("workers eating from carry while warehouse is unreachable") was
approximate; the metric refinement still correctly excludes carry-eat
ticks elsewhere (HAUL workers worker_95 / worker_96 in E _do_ have
carry-eat windows; those were counted as stuck before the refinement and
are correctly excluded now). The five remaining are a path-fail
phenomenon to be addressed when faction-aware reachability cache lands
(see Forward pointers).

## Known limitations

- **E-scenario tail (5 stuck>3s)** — Workers in scenario E are running
  into a routing dead-end where every harvest tile is on their path-fail
  blacklist for an extended window. The Job-layer correctly declares
  them ineligible (canTake → false on harvest), but JobWander then picks
  short walks that don't actually unstick the routing topology. The
  fundamental fix is faction-aware reachability cache (audit A2 next
  phase) so blacklist eviction is keyed on the actual graph component
  the worker can reach, not on per-tile heuristics.
- **Layer-disagreement metric stays high in E (~455/min)** — This is
  pre-existing (already 455 in phase d). It is the legacy
  `localDesiredState != finalDesiredState` count from the FSM display
  layer, not the Job layer. The display FSM still ticks for telemetry
  but no longer gates behaviour. The metric will fall to 0 once the
  display FSM is cut over to derive its label from `worker.currentJob.id`
  directly (audit A3, deferred).
- **Carry-eat tick detection in the trace harness** — The refinement
  counts a >0.001 carry.food drop or hunger rise as "not stuck". In
  practice the per-tick deltas are O(0.04), so the threshold is well
  separated from float drift. If a future phase tunes
  `consumeEmergencyRation` to draw very small amounts (sub-millihunger),
  the threshold will need to drop in tandem.
- **stress workers and the test-only handle\* exports** — The
  `handleStressWorkerPatrol` function is still owned by WorkerAISystem
  itself; stress workers are an inspector-mode synthetic for debugging
  pathfinding, not a Job. `handleHarvest` and `handleDeliver` are kept
  exported because three legacy tests
  (`job-harvest.test.js`, `farm-yield-pool-lazy-init.test.js`,
  `soil-salinization.test.js`, `warehouse-queue.test.js`) drive them
  directly as yield-equivalence harnesses without spinning up the full
  ECS pipeline. Both call out to the same `applyHarvestStep` helper the
  Job layer uses, so yield-equivalence holds.

## Forward pointers

Deferred from the v0.9.0 audit to v0.9.1+ (in priority order):

- **A4** — `worker.debug.*` rename to `worker.blackboard.*` for
  consistency with the Job-layer's writeback contract. Pure hygiene; no
  behaviour change.
- **A5** — Default Jobs (HaulLoose / GatherFreeNode / ScoutFog) so an
  idle worker has more useful fallbacks than `JobWander`. ScoutFog would
  re-introduce the fog-frontier wander bias retired with `handleWander`.
- **A8** — Per-tick scratch event queue so Jobs can publish "I claimed
  the last warehouse intake slot" / "I started a fire" events for the
  next tick's scheduler to read, instead of poking `state.metrics.*`
  directly.
- **A2 follow-up** — Faction-aware reachability cache. Today the cache
  is per-tile-type; a stranded WOOD worker on island #2 still probes
  every LUMBER tile on island #1 before giving up. Caching the connected
  component the worker is in would zero E's residual stuck count.
- **A3** — Cut the display FSM (StateGraph + StatePlanner) over to
  derive its label from `worker.currentJob.id` directly. Today both
  systems run in parallel; the FSM is no longer authoritative but it
  still ticks for telemetry.
