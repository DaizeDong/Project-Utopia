# Performance Optimization Plan

Date: 2026-04-26 (original draft) — refreshed 2026-05-01 (post HW7 R3 + Hotfix iter4, HEAD `2f31346`).

## HW7 Final-Polish-Loop perf track — DONE vs PLANNED

The Round-9 baseline below remains the authoritative architectural picture for the simulation hotspots. HW7's Final-Polish-Loop (R0 → R3 + Hotfix iter4) layered observability and small-but-targeted shaves on top of that baseline rather than re-cutting the simulation core. See `docs/optimization-progress.md` for measured deltas.

### Completed under HW7

- **R0 — Observability infrastructure (DONE)**
  - `__fps_observed` always-on render-loop FPS probe in `src/app/GameApp.js` (separate from RAF-based EMA so headless-throttle measurement is at least visible).
  - `?perftrace=1` query flag exposes `__perftrace` snapshot of `state.debug.systemTimingsMs`.
  - `src/ui/panels/PerformancePanel.js` renders top hot systems lazily.
  - Regression test: `test/perf-system-budget.test.js` (soft-skipped under `CI_FAST=1`).
- **R1 — SceneRenderer per-frame allocation shave (DONE)**
  - `src/render/SceneRenderer.js` `__pressureLensSignature` cache short-circuit (eliminated 4/5 per-frame allocations).
  - `__updatePressureLensLabels` Map reuse via `clear()`.
  - Scratch buffers `_labelProjectedScratch`, `_labelEntriesScratch`, `_labelEntryToPoolIdxScratch`, `_labelVisibleCandidatesScratch`, `_labelVisibleScratchMap` reused via `length = 0` / `clear()`.
  - `__entityMeshUpdateIntervalSec` ≥ 1/30 s throttle when `selectedEntityId == null`.
  - Regression test: `test/perf-allocation-budget.test.js` (8 tests).
- **R2 — Sim-time cadence gates (DONE)**
  - `src/simulation/ai/colony/AgentDirectorSystem.js` — `AGENT_DIRECTOR_HEAVY_TICK_INTERVAL_SEC = 0.5 s` gate on heavy work (perceiver.observe, snapshotState pre/post, executeNextSteps, shouldReplan). Fast-path (mode select, `agentState.activePlan` mirror, fallback throttle) preserved at every-tick cadence.
  - `src/simulation/meta/ProgressionSystem.js` — 0.25 s dt-accumulator gate on coverage / milestones / recovery scans.
  - Regression test: `test/agent-director-cadence.test.js`.
- **R3 — Methodology lock-in (DONE)**
  - Headless RAF cap documented as a measurement-pipeline issue (not a project bug).
  - Required Chromium flags listed for any future non-headless / hybrid FPS measurement: `--disable-renderer-backgrounding`, `--disable-background-timer-throttling`, `--disable-backgrounding-occluded-windows`. Missing any one silently re-enables the 1 Hz throttle.
  - Cross-link: `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` § "R3 Closeout — Perf Methodology Note (A2)".
  - Prod-build state validated: `vite build` ~5 s, 144 modules, 3 chunks 500–650 KB (`vendor-three` 612.94 KB largest), 0 chunks > 1 MB.
- **Hotfix iter4 — Non-perf hotfixes (DONE)** Pop-cap removal + recruit-button surfacing + dev-dock force-hide. Perf surface unchanged.

### Planned for HW8+

- **Real-Chrome FPS validation (PLANNED)** — apply the three Chromium flags above (or move to a non-headless Playwright harness) so Gate 3 can move from YELLOW (headless RAF cap) to GREEN on its own merits. Sim-side ground truth at R2 (≤ 0.4 ms/frame at 8× / 86 entities, `headroomFps ≈ 2500`) already supports a 60 fps target.
- **Bundle WARN → GREEN (PLANNED)** — `vendor-three` tree-shaking / scoped imports; lazy-loading the LLM-prompt-builder pathways; or splitting heavy panels into route-level lazy imports. Not addressed under the HW7 freeze.
- **Multi-seed long-horizon bench (PLANNED)** — single seed=42 plains baseline gives noisy DevIndex / deaths reads; 50-seed averaging recommended for HW8+ to characterize the post-A5 distribution properly.
- **`worker-ai-bare-init Fix 2/3` deflake (PLANNED)** — wall-clock-dependent assertion; replace `Date.now()` dependency with deterministic simulated-time check.
- **Faction-aware reachability cache (PLANNED, carried)** — v0.9.x audit-A2 follow-up; would zero scenario E's residual stuck>3s tail.
- **At-warehouse fast-eat tuning (PLANNED, carried)** — v0.10.0 deferred list.
- **Phase 2A pathfinding worker** (Round 9 baseline below): IMPLEMENTED for high-load browser runs.
- **Phase 2B animal AI worker / Phase 2C OffscreenCanvas / Phase 2D adaptive scheduler**: design notes retained below; not planned for HW8 unless the headless-RAF-cap remediation surfaces a real ≥ 10 ms/tick regression.

## Summary

The runtime bottleneck is simulation work on the browser main thread, not raw GPU rendering. GPU and total CPU usage can look low while the game still stutters because one JavaScript thread is saturated by AI/pathfinding work and the renderer waits for new scene data. The correct target is lower frame/tick cost and more parallelizable work, not artificial busy loops that merely raise utilization.

This pass focuses on safe, deterministic optimizations first:

- Reduce O(N^2) AI scans in animal, worker, mortality, and NPC brain systems.
- Avoid unnecessary pathfinding and path cache misses.
- Add high-load AI level-of-detail (LOD) sharding so large populations keep moving every frame while expensive decisions are distributed across ticks.
- Add frame-pressure telemetry, adaptive caps, render/UI throttling, and high-load fast-forward macro-steps so the UI remains responsive instead of pretending the selected speed is delivered.
- Document a follow-up multithreading plan for pathfinding, AI workers, and possible OffscreenCanvas migration.

## Latest Round 9 Parallelization Update

After the initial optimization pass, live browser testing showed that most entities still failed to move because active paths were invalidated by volatile traffic-cost versions and the main thread repeatedly re-entered A* while async path results were pending. The latest pass fixes that by:

- Moving high-load A* requests to a browser `PathWorkerPool` sized from `navigator.hardwareConcurrency` and capped at 32 workers.
- Keeping traffic costs in new path calculations while no longer invalidating hundreds of active paths every traffic sample under high load.
- Binding async path results to per-entity pending target tiles so completed worker results are applied instead of discarded as stale.
- Avoiding sync A* fallback when the worker queue is backpressured; entities wait for the worker result or retry later.
- Turning dev stress workers into a movement stress load: they skip hunger/death economy, continuously patrol, and keep pathing/boids/rendering hot without collapsing the population.
- Using high-load macro-steps (`1/10s` at 1000+ entities, `1/12s` at 700+ entities) so 8x can remain responsive without chasing 24 tiny fixed steps on the main thread.

Visible headed Chromium validation after these changes:

| Sample | Entities | Moving workers | Workers with path | Target / actual speed | Avg FPS | Work p95 | Path workers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| t+10s | 1020 | 1009 / 1012 | 991 / 1012 | 8x / 7.83x | 54.1 | 10.7 ms | 32 |
| t+20s | 1019 | 1008 / 1012 | 1003 / 1012 | 8x / 7.75x | 53.9 | 11.8 ms | 32 |

The worker pool completed 37,539 path jobs by t+20s with zero drops and an average worker-side path duration of about 0.49 ms. The remaining low total CPU/GPU reading is therefore no longer caused by idle entities or blocked pathing; it reflects that the optimized workload is finishing within frame budget on this machine.

## Baseline Profile

Headless simulation profiling, measured with 30 Hz ticks on `temperate_plains`.

| Case | Entities | Before avg tick | Before top systems |
| --- | ---: | ---: | --- |
| Base | 22 | 1.179 ms | WorkerAI 0.228 ms, VisitorAI 0.196 ms, Progression 0.143 ms |
| 500 workers, 200 visitors, 200 animals | 901 | 36.128 ms | AnimalAI 14.231 ms, WorkerAI 10.444 ms, Mortality 3.662 ms, NPCBrain 3.211 ms, VisitorAI 2.705 ms |
| 900 workers, 300 visitors, 300 animals | 1502 | 73.204 ms | AnimalAI 33.986 ms, WorkerAI 16.720 ms, Mortality 7.455 ms, NPCBrain 7.223 ms, VisitorAI 4.310 ms |

The low GPU/CPU observation is consistent with this profile:

- Rendering already uses instanced meshes for many entities, so the GPU is often waiting for the main thread.
- The main thread performs all simulation systems serially.
- High time-scale increases requested simulation steps, but the frame loop has a max-step cap and cannot parallelize systems.
- Many AI systems repeatedly scan all entities or trigger pathfinding from the same thread.

## Implemented Optimizations

### Frame Loop and Telemetry

Round 9 added timing truth before further tuning:

- `GameLoop` forwards raw wall-clock frame timing to `GameApp`.
- `GameApp` records raw frame ms, wall-clock actual speed, observed FPS, sim/render/UI timings, performance caps, and a bottleneck summary.
- At high entity count and 8x target speed, the app applies a fast-forward macro-step (`1/10s` at 1000+ entities, `1/12s` at 700+ entities) so capped frames still advance meaningful sim time without unbounded fixed-step catch-up.
- Frame-level sim CPU now accumulates the CPU spent across all fixed steps in the rendered frame; performance telemetry no longer relies only on the last step's cost.
- The HUD and Performance panel display target-vs-actual speed and the cap reason.

### Animal AI

AnimalAI was the largest high-population hotspot. Changes:

- Partition herbivores and predators once per update.
- Build spatial hashes for herbivores and predators when active animals exceed 220.
- Use local neighbor sets for flee, hunt, herd, spread, and prey scoring at high population.
- Add high-load AI LOD sharding:
  - 220+ active animals: stride 2.
  - 500+ active animals: stride 3.
  - 1000+ active animals: stride 4.
  - At 8x, total entity pressure also raises animal stride so mixed 1000-entity stress cases do not leave 100 animals running full-rate decisions.
  - Skipped animals still follow active paths or idle, while expensive decisions run on their assigned shard.
  - Processed animals receive accumulated `dt` so hunger and action timing remain approximately conserved.
- Cache animal LOD phase instead of recalculating it from string IDs every tick.
- Expose `state.debug.animalAiLod` for telemetry.

### Worker AI

WorkerAI remains the biggest remaining hotspot at very large population, but repeated all-worker scans have been reduced:

- Build worker target occupancy once per update instead of rebuilding it for each worker target scoring pass.
- Build a worker spatial hash once per update and use it for social proximity and relationship drift.
- Avoid duplicate nearest-warehouse debug scans.
- Add high-load worker AI LOD:
  - Worker pressure is based on active workers and total entity count, so mixed 700-worker / 1000-total stress cases still enter LOD.
  - At 8x, 1000+ worker/entity pressure uses stride 4 with a large async path request budget; lower high-load tiers use stride 3/2.
  - Skipped workers still follow active paths or idle.
  - Processed workers receive accumulated `dt`.
  - Pending async path requests are not re-submitted every tick.
- Expose `state.debug.workerAiLod` for telemetry.

### Visitor AI and Boids

Visitor and crowd movement were also load-shed:

- VisitorAI uses total entity pressure and 8x target speed to raise cadence stride up to 16 at 1000+ entities.
- Boids high-load skipped ticks now integrate simple velocity every tick, but the next full flock solve no longer double-integrates the skipped time.
- Boids flock solves are scheduled by target wall-clock frequency at high speed: about 2 Hz for 1000+ entities at 8x instead of accidentally multiplying the solve cadence by simulation speed.
- Neighbor samples were reduced for 650+ and 1000+ entities.
- SceneRenderer now throttles entity instance matrix refresh at high population and lowers pixel ratio in fast fallback mode.
- UI panel refresh is pressure-adaptive: dev/full panels drop to slower refresh under 700-1000+ entity stress while the simulation continues.

### Mortality and Nutrition Reachability

Mortality previously spent pathfinding work on entities that were not close to starving.

- Worker/visitor nutrition reachability is now skipped unless hunger is at or below 0.22, below the death threshold, or starvation was already accumulating. The 0.22 guard keeps `reachableFood` fresh before WorkerAI emergency-ration logic starts near 0.18 hunger.
- Fixed a `PathCache.set` argument order bug in mortality reachability. Paths were being written into the wrong argument slot, which prevented useful reuse.

### NPC Brain

NPCBrain repeatedly filtered predator/herbivore lists inside the entity loop.

- Predator and herbivore target context is now built once per update and reused for state feasibility checks.

### AStar

AStar allocated dynamic string keys for every neighbor even when dynamic hazard/traffic maps were empty.

- Dynamic tile key creation now only runs when hazard tiles, hazard penalties, or traffic penalties are actually non-empty.

## Post-Optimization Profile

Same headless simulation profiler after this pass.

| Case | Entities | After avg tick | Improvement | Top systems after |
| --- | ---: | ---: | ---: | --- |
| 500 workers, 200 visitors, 200 animals | 901 | 21.847 ms | 39.5% faster | WorkerAI 9.938 ms, AnimalAI 7.507 ms, VisitorAI 2.579 ms |
| 900 workers, 300 visitors, 300 animals | 1501 | 23.839 ms | 67.4% faster | WorkerAI 14.153 ms, VisitorAI 4.057 ms, AnimalAI 2.726 ms |

The largest win is from AnimalAI/NPCBrain/Mortality reductions in the 1500-entity case. WorkerAI is now the primary remaining target.

## Round 9 Browser Stress Notes

The final Round 9 stress validation used visible headed Chromium (`headless:false`) with 1000 stress workers and 8x target speed. It intentionally did not run a four-hour soak after the requirement was narrowed to performance diagnosis and optimization.

Final visible-browser sample:

- 1019-1020 total entities stayed alive over the sampled window.
- 998-999 of 1000 stress workers were moving; 982-994 had active paths.
- Average FPS stayed around 54 FPS, observed FPS stayed around 48-60 FPS.
- Target speed was 8x; measured wall-clock actual speed stayed about 7.75x-7.83x.
- Frame work p95 stayed about 10.7-11.8 ms.
- Path worker pool used 32 workers, completed 37,539 jobs by t+20s, and dropped 0 jobs.

The only console errors observed were AI proxy HTTP 500 health checks; those affect live LLM availability, not local pathing/performance.

## Remaining Bottlenecks

### WorkerAI

WorkerAI still costs the most under synthetic 500-900 worker loads. Likely remaining drivers:

- Per-worker state planning and path follow bookkeeping.
- Worker target scoring across all worksite candidates during retarget waves.
- Pathfinding bursts when many workers spawn, change role, or lose a target.
- Resource and production side effects that currently require main-thread mutable state.

Next low-risk improvements:

- Cache per-grid-version target candidate metadata such as nearby road/wall count, frontier/depot affinity, and tile type.
- Limit target scoring to the closest K candidates per role under high population.
- Stagger retarget windows more aggressively when active workers exceed 450.
- Move path request generation into an async queue with a fixed per-frame completion budget.

### Visitors

VisitorAI is smaller than WorkerAI but grows linearly with visitor count. Apply the same high-load LOD pattern only if visitor counts become a real scenario target.

### Renderer

Renderer is not the original simulation hotspot, but browser validation should still watch:

- Entity instance update count.
- Label/icon DOM updates.
- Sidebar panel render frequency.
- Shadow/antialias settings on integrated GPUs.
- Whether fast fallback pixel ratio is acceptable visually at high stress.

### Remaining Accuracy Tradeoffs

Current high-load LOD is intentionally a performance trade:

- Worker, visitor, and animal decisions are less frequent at 8x with 1000+ entities, but path following still runs on skipped ticks.
- Large `dt` macro-steps improve fast-forward throughput but can make production and behavior more bursty than a strict 30 Hz simulation.
- Worker production parity under forced high-load stride is still a follow-up validation target.

## Multithreading Plan

### Phase 2A: Pathfinding Worker

Status: implemented for high-load browser runs. AStar now runs through a Web Worker pool when path workers are available, with sync A* retained for deterministic tests and fallback.

Design:

- Main thread owns authoritative state and entity mutation.
- Worker receives immutable snapshots:
  - `grid.version`
  - width/height
  - tile array
  - optional elevation array
  - dynamic hazard/traffic maps in compact arrays
  - `{ requestId, entityId, start, goal, costVersion }`
- Worker returns:
  - `{ requestId, entityId, gridVersion, costVersion, path, ok, durationMs }`
- Main thread applies a result only if:
  - entity still exists and is alive
  - entity still wants the same target
  - grid and cost versions still match
- Sync AStar remains as fallback for urgent short paths or worker failure.
- PathCache becomes shared at the main-thread boundary; worker returns path data, main thread caches it.

Expected impact:

- Removes pathfinding bursts from the render-critical thread.
- Raises total CPU usage in a useful way on multi-core machines.
- Keeps deterministic application order by merging results at tick boundaries.

### Phase 2B: Animal AI Worker

Animal AI is the second-best offload target after pathfinding.

Design:

- Main thread sends typed-array snapshots:
  - id index
  - x/z
  - kind/species
  - hunger/hp
  - current state
  - local zone id or anchor index
- Worker computes decision commands:
  - desired state
  - target tile request
  - flee/hunt/regroup intent
- Main thread validates commands and performs authoritative mutation/path requests.

Rules:

- Do not let the worker mutate game state directly.
- Commands are deterministic data, not closures.
- Random decisions use pre-issued random seeds per tick or are performed on the main thread.

### Phase 2C: Render Worker Evaluation

OffscreenCanvas may help only after simulation bottlenecks are reduced.

Use it if:

- Browser/Electron target supports stable OffscreenCanvas WebGL.
- SceneRenderer instance updates become a measured hotspot.
- DOM HUD remains on the main thread.

Avoid it if:

- Main-thread simulation remains above 10 ms/tick.
- The cost of serializing render data exceeds the render savings.

### Phase 2D: Adaptive Scheduler

Add a scheduler that reacts to measured frame budget:

- If `simCostMs` is high, increase AI LOD stride before dropping render quality.
- If render cost is high, lower visual detail thresholds and label/icon refresh rate.
- If both are low, allow more simulation catch-up steps for high time-scale.
- Use `navigator.hardwareConcurrency` only as a hint; measured frame cost wins.
- Keep target-vs-actual speed visible so the UI never claims 8x when the machine is delivering less.

## Validation Gates

Before merging further performance changes:

- `node --test` for functional regression coverage.
- `npm run build` for browser bundle correctness.
- Headless stress profile for 900 and 1500 entity cases.
- Browser smoke at high time-scale with Dev Performance panel open.
- Visible-browser stress at 1000+ entities, because headless browser timing can understate real visible performance.
- Verify debug fields:
  - `state.debug.workerAiLod`
  - `state.debug.animalAiLod`
  - `state.debug.visitorAiLod`
  - `state.debug.boids`
  - `state.debug.astar`
  - system timing table in Performance panel.

## Acceptance Target

Short term:

- Keep 1500 synthetic entities below 30 ms/tick headless.
- Keep normal gameplay below 16.7 ms frame budget on desktop hardware when not using extreme time-scale.
- Prevent pathfinding bursts from freezing the UI.

Medium term:

- Move AStar to a worker and keep the main-thread simulation slice below 8-10 ms for 1000+ entities.
- Use AI LOD/adaptive scheduling so high time-scale degrades decision frequency before it degrades input responsiveness.
