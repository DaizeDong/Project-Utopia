# Round 9 Enhancer B Implementation Plan

Scope: root-cause plan for every P1/P2 issue in `Round9/Feedbacks/reviewer-b.md`. No implementation in this pass.

## P1: Ultra Speed Stutter And High-Load Collapse

Root cause: the loop reports and schedules from a clamped frame delta. `GameLoop.frame()` clamps elapsed time to 100 ms before `GameApp.update()`, then `GameApp.update()` computes `timeScaleActual` and `averageFps` from that clamped value. Under 1 s long frames the HUD can still report `actual x4.0`. Separately, ultra can run up to 12 fixed simulation steps per rendered frame, so a slow frame triggers more same-frame simulation work instead of preserving interactivity. High-load rendering also keeps expensive detail until memory pressure, not frame pressure.

1. `src/app/GameLoop.js`, `GameLoop.frame(now)`: keep both raw wall-clock elapsed and clamped simulation delta. Call update/render with a second `frameInfo` object containing `rawElapsedMs`, `rawDt`, `clampedDt`, and `nowMs`; do not use the clamped delta for FPS or realized-speed telemetry. Validation: add a unit test around a synthetic 1100 ms frame proving raw FPS is about 0.9 while clamped sim delta remains 0.1 s.

2. `src/app/GameApp.js`, `update(frameDt, frameInfo)`: compute `state.metrics.observedFps`, `state.metrics.rawFrameMs`, `state.metrics.frameP95Ms`, `state.metrics.frameP99Ms`, `state.metrics.longFrameCount`, and `state.metrics.timeScaleActualWall` from `frameInfo.rawDt`. Keep `state.metrics.timeScaleActual` only if existing tests need it, but drive user-facing actual speed from `timeScaleActualWall`. Validation: extend `test/time-scale-fast-forward.test.js` or add `test/performance-telemetry.test.js` to cover raw actual speed when clamped delta differs from wall-clock delta.

3. `src/app/GameApp.js`, `update(frameDt, frameInfo)` and `src/app/simStepper.js`, `computeSimulationStepPlan()`: add a frame-budgeted step cap for high-load or slow-frame conditions. When `observedFps < 45`, `rawFrameMs > 33`, or `simCostMs + renderCpuMs > 24`, reduce effective `maxSteps` before calling `computeSimulationStepPlan()` and return/drop bounded simulation debt instead of trying to catch up indefinitely. Store `state.metrics.performanceCap = { active, reason, targetScale, actualScale, droppedSimDebtSec }`. Validation: add a sim-stepper/GameApp test showing ultra requests `8x` but caps steps and sets `performanceCap.active` when raw frames exceed budget.

4. `src/app/GameApp.js`, `update()`: classify bottlenecks from existing timings: `simulation-bound` when `simCostMs` dominates, `render-bound` when `renderCpuMs` dominates, `ui-bound` when `uiCpuMs` dominates, and `throttled` when actual wall speed falls materially below target after capping. Store this on `state.metrics.performanceBottleneck`. Validation: unit test the pure classifier if extracted, or a GameApp-level test with mocked metrics.

5. `src/render/SceneRenderer.js`, `#updateEntityMeshes()` and `#applyRuntimeControlSettings()`: add a frame-pressure render LOD path keyed by `state.metrics.performanceCap.active` or `totalEntities >= 500`. In that path, use the existing instanced fallback meshes instead of per-entity `THREE.Sprite` groups, lower pixel ratio, hide tile icons, and skip pressure-label/heat/fog label updates that are not selected or critical. Preserve user settings as preferences; apply the cap as an effective render mode rather than permanently mutating controls. Validation: add a renderer source/unit test or visual smoke check that 500+ entities sets debug render mode to `fast-capped` and does not allocate per-entity sprites.

6. `src/simulation/movement/BoidsSystem.js`, `update(dt, state)`: make high-load LOD respond to `state.metrics.performanceCap` and lower the current neighbor/query cost under load: reduce max neighbors, update boids less often at `>=500` entities, and sample traffic metrics less frequently while capped. Validation: extend `test/boids-traffic.test.js` to assert traffic still updates eventually and debug reports the high-load interval.

7. `src/simulation/npc/WorkerAISystem.js`, `update(dt, state, services)`: lower AI LOD stride thresholds from only `>=800/1000` workers to start at supported stress counts, and cache `RoadNetwork.rebuild()` by `grid.version` so it is not rebuilt every fixed step when no tile changed. Keep path following every tick, but run target selection/state planning on staggered phases. Validation: add a high-load worker AI test that 500 workers process in phased slices while moving workers still follow existing paths.

8. `src/simulation/npc/VisitorAISystem.js` and `src/simulation/npc/AnimalAISystem.js`, `update()`: mirror the WorkerAISystem high-load policy for non-worker entities so population-target stress with visitors/animals does not leave them all at full AI frequency. Validation: add or extend visitor/animal tests with high entity counts and confirm `debug` exposes processed/skipped counts.

9. `src/ui/hud/HUDController.js`, speed-control render section near `timeScaleActualLabel`: always show target and actual when target is fast/ultra and either `performanceCap.active` is true or divergence exceeds 0.2. Use wall-clock actual speed and include `performance capped: <reason>` in the title. Validation: update `test/ui/hud-autopilot-chip.test.js` only if impacted, and add a HUD test for target `8x`, actual `1.7x`, cap active.

## P1: Autopilot-Off Automation Ownership Confusion

Root cause: `GameApp.createSystems()` always includes `ColonyDirectorSystem`, and `ColonyDirectorSystem.update()` places scenario, phase, expansion, and connector builds regardless of `state.ai.enabled`. The main HUD says manual guidance while rule automation is still authoring buildings. Build actions also lack durable attribution in `BuildSystem.placeToolAt()` events/history.

1. `src/simulation/meta/ColonyDirectorSystem.js`, `update(dt, state, services)`: split builder behavior into explicit modes. When `state.ai.enabled` is false, skip phase/expansion builds and `connectWorksitesToWarehouses()`; only allow narrowly scoped scenario repair if a new `state.controls.scenarioRepairAutomation` flag is true. When `state.ai.enabled` is true, run rule builder as Autopilot-owned automation. Validation: add `test/colony-director-autopilot-ownership.test.js` proving Autopilot off does not place phase farms/warehouses over several eval intervals.

2. `src/simulation/meta/ColonyDirectorSystem.js`, `fulfillScenarioRequirements()` and build calls in `update()`: pass attribution options to `BuildSystem.placeToolAt()`: `owner: "scenario_repair"` for route/depot repair, `owner: "rule_automation"` or `owner: "autopilot"` for phase builds, and a short reason. Validation: assert emitted build events include the owner and reason for scenario repair versus Autopilot builds.

3. `src/simulation/construction/BuildSystem.js`, `placeToolAt(state, tool, ix, iz, options)`: persist attribution in undo history, `onAction` replay payloads, and `BUILDING_PLACED` / `BUILDING_DESTROYED` event payloads as `{ owner, ownerLabel, reason }`. Default owner should be `"player"` when `recordHistory !== false`, and `"system"` only for legacy un-attributed non-history callers. Validation: extend `test/build-system.test.js` or add `test/build-attribution.test.js`.

4. `src/render/SceneRenderer.js`, user build click handler, and `src/app/GameApp.js`, `placeToolAt()`: explicitly call `BuildSystem.placeToolAt()` with `owner: "player"` so player-authored actions are distinguishable from automated placements. Validation: add a build click/unit test that replay/build event says `Built by player`.

5. `src/simulation/ai/colony/PlanExecutor.js`, `executeNextSteps()` and `_executeSkillSubSteps()`: pass `owner: "autopilot"` for LLM/fallback plan execution and include `plan.source`/step id in `reason`. Validation: extend existing plan-executor tests to assert attribution flows through successful build steps.

6. `src/ui/hud/autopilotStatus.js`, `getAutopilotStatus()`: replace the ambiguous off copy with a compact subsystem summary, for example `Autopilot OFF · Builder OFF · Directors rules`. Include title text listing Player Autopilot, Background Directors, NPC Policies, Scenario Repair, and Rule Builder as separate on/off states. Validation: update `test/ui/hud-autopilot-chip.test.js` and `test/hud-autopilot-status-contract.test.js`.

7. `src/ui/panels/AIAutomationPanel.js`, `render()`: render explicit subsystem rows with on/off/limited status sourced from the new builder mode, not just source badges. In Autopilot-off mode, Build Automation must read `OFF` or `Scenario repair only`, not `rule-based active`. Validation: update `test/ai-automation-panel.test.js` to cover Autopilot off with builder stopped and scenario repair limited.

8. `src/ui/panels/EventPanel.js` and `src/ui/hud/HUDController.js` action/status surfaces: include owner labels in recent build messages such as `Built by player`, `Built by scenario repair`, `Built by rule automation`, or `Built by Autopilot`. Validation: extend event rendering/build-toast tests to assert owner labels are user-visible without opening AI Log.

## P2: Missing Lag/Bottleneck And Benchmark Summary

Root cause: telemetry exposes only moving-average FPS/frame time plus dev-only system timings. The benchmark stores only average FPS/frame ms in CSV and sets status to `done (csv ready)`, with no visible pass/fail summary, p95/p99, actual-vs-target speed, or bottleneck classification. Direct CPU/GPU utilization is not available reliably from browser JS, so the implementation should label timing-based bottleneck inference rather than pretending to measure hardware utilization.

1. `src/app/performanceMetrics.js` (new helper) and `src/entities/EntityFactory.js` initial metrics: add pure helpers for rolling frame samples, percentile calculation, long-frame counts, and bottleneck classification. Initialize `metrics.performance` and `metrics.benchmarkLastRun` with safe defaults. Validation: add `test/performance-metrics.test.js` for p95/p99 and classifier behavior.

2. `src/app/GameApp.js`, `update()` and `render()`: feed raw frame ms, sim cost, UI cost, render cost, entity count, target speed, wall-clock actual speed, cap state, and bottleneck into `metrics.performance` every frame. Validation: GameApp/performance test confirms values update after a simulated frame.

3. `index.html`, Performance panel markup around `benchmarkStatusVal`: add stable nodes for FPS, p95, p99, sim tick ms, render ms, UI ms, entity count, target/actual speed, cap state, bottleneck, and last benchmark summary. Validation: update `test/ui-layout.test.js` with the new IDs.

4. `src/ui/panels/PerformancePanel.js`, `render()`: render the performance overlay/summary in ordinary UI, not only dev dock. Show `bottleneck: simulation-bound/render-bound/ui-bound/throttled` and label it as inferred from frame timings. Do not display CPU/GPU percentages unless a real browser API is wired later. Validation: add a PerformancePanel unit/source test for bottleneck and cap message text.

5. `src/app/GameApp.js`, benchmark fields and `updateBenchmark(dt)`: collect per-stage sample arrays instead of only sums, and store `avgFps`, `p95FrameMs`, `p99FrameMs`, `avgSimMs`, `avgRenderMs`, `avgUiMs`, `avgActualScale`, `targetScale`, `entityCount`, `capActive`, and `bottleneck`. Validation: extend benchmark tests so the built-in run produces p95/p99 and actual-speed fields.

6. `src/app/GameApp.js`, benchmark completion branch and `buildBenchmarkCsv()`: compute `state.metrics.benchmarkLastRun = { status: "pass"|"fail", summary, stages }` using thresholds from the review: load 500 should be >=30 FPS or capped with a clear message, p95 frames over 100 ms should fail unless capped/degraded. Add the new fields to CSV. Validation: update benchmark CSV tests to include pass/fail and last-run numbers.

7. `src/ui/panels/DeveloperPanel.js`, global telemetry render: add the same performance object summary so dev telemetry and normal performance UI agree. Validation: existing dev-panel string tests should be updated or extended to include `bottleneck=`.

## P2: High-Entity Entity Focus Usability

Root cause: `EntityFocusPanel.#renderWorkerList()` slices the first 20 alive workers and appends `+N more`, so high-load crisis states hide actionable workers. It does not group by hunger, blocked/idle/task state, hauling, or threat/combat, and the aggregate counts are not interactive.

1. `src/ui/panels/EntityFocusPanel.js`, add pure `deriveEntityFocusGroups(state)` near the existing helper functions. It should group entities into `starving`, `hungry`, `idle`, `blocked`, `hauling`, `combat`, and `other`, with counts and top samples sorted by severity: dead/starving first, then low hunger, blocked/stuck/path issues, then idle. Validation: add `test/entity-focus-groups.test.js` for 500 synthetic workers with mixed states.

2. `src/entities/EntityFactory.js`, controls defaults: add `entityFocusFilter: "critical"` and optional `entityFocusPage: 0` so filter state survives re-renders without DOM-only state. Validation: update snapshot/control sanitizer tests if required.

3. `src/ui/panels/EntityFocusPanel.js`, `#bindWorkerListDelegate()`: add click handling for `button[data-entity-filter]` and `button[data-entity-page]`, updating `state.controls.entityFocusFilter` and page. Existing `button[data-entity-id]` selection remains unchanged. Validation: extend `test/entityFocusWorkerList.test.js` for filter click delegates.

4. `src/ui/panels/EntityFocusPanel.js`, `#renderWorkerList()`: replace first-20 paging with grouped chips and filtered rows. Top-level should show crisis chips like `Starving 12`, `Blocked 7`, `Idle 34`, `Hauling 80`, each clickable. The selected filter should show the most actionable 20 rows, then page controls or `+N more in this group`. Validation: update existing worker-list tests from `+N more` only to grouped overflow behavior.

5. `src/ui/hud/HUDController.js`, colony health card or warning area: when starvation/blocked counts are nonzero, expose a clickable or focusable shortcut that sets `entityFocusFilter` to the matching group and opens the Entity Focus panel. Validation: add a HUD test that clicking/activating the aggregate crisis count sets the focus filter.

6. `src/ui/panels/EntityFocusPanel.js`, render signature: include group counts, selected filter, page, and top row identities in `workerListSignature`, not just first 20 workers. This avoids stale crisis counts while preserving the existing dirty-check. Validation: add a test that changing a worker from healthy to starving invalidates the signature/group render.

## Final Validation Pass

1. Run targeted unit tests: `npm test -- test/time-scale-fast-forward.test.js test/sim-stepper-timescale.test.js test/boids-traffic.test.js test/build-system.test.js test/ai-automation-panel.test.js test/ui/hud-autopilot-chip.test.js test/entityFocusWorkerList.test.js test/ui-layout.test.js`.

2. Run new tests from this plan: `test/performance-metrics.test.js`, `test/performance-panel.test.js`, `test/benchmark-summary.test.js`, `test/build-attribution.test.js`, `test/colony-director-autopilot-ownership.test.js`, and `test/entity-focus-groups.test.js`.

3. Manual browser validation at `http://127.0.0.1:5173`: default ultra for 3 minutes should keep the HUD responsive and show honest target/actual speed; 500 extra workers / around 1000 entities should either hold at least 30 FPS or enter capped mode with a clear message; Autopilot off should not place phase/expansion builds and should label any scenario repair; benchmark completion should show pass/fail and last-run numbers; Entity Focus at 500+ entities should open directly to actionable crisis groups.
