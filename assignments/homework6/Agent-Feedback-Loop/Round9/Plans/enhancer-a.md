# Round 9 Enhancer A Plan

Scope: address every P1/P2 issue from `reviewer-a.md`. No defers.

## P1 - High entity count at 8x stutters and miscommunicates sustained speed

Root cause: `src/app/simStepper.js:1` permits an 8x request, but `src/app/GameApp.js:update` only reports the smoothed `metrics.timeScaleActual` after the loop saturates. `src/ui/hud/HUDController.js:1680` keeps the Ultra button active from requested `controls.timeScale >= 7`, so the control still reads as stable 8x even when actual speed drops. Render/sim load also scales too aggressively: `src/simulation/npc/WorkerAISystem.js:update` only enables AI LOD at 800+ workers, and `src/simulation/movement/BoidsSystem.js:update` only enables movement cadence LOD at 320+ entities, so the reviewed 75-100 worker case still runs full worker AI, traffic, boids, render transform, and UI work during every 8x fixed step.

Implementation steps:

1. Add a sustainable-speed governor in `src/app/GameApp.js:update`, immediately after `metrics.timeScaleActual` is computed.
   - Code-change intent: add a private helper such as `#applySpeedSaturationGuard(frameDt, stepPlan)` that accumulates `metrics.speedSaturationSec` when requested speed is above 4x and either `metrics.averageFps < 45`, `metrics.frameMs > 22`, or `metrics.timeScaleActual < requested * 0.9` for more than about 2 seconds. When sustained, lower the effective `controls.timeScale` to the next tier that can be sustained, preserve the original request in `controls.requestedTimeScale`, and emit an action message like `Ultra speed reduced: running 6x because the browser is CPU-bound.`
   - Validation: a 75-100 worker default-run RAF sample at 8x must either hold p95 frame interval under 35 ms or show an explicit degraded speed state within 2 seconds of saturation.

2. Split requested-vs-effective speed display in `src/ui/hud/HUDController.js:1680` and `src/ui/hud/HUDController.js:1687`.
   - Code-change intent: base button active/warn state on both `controls.requestedTimeScale` and effective `controls.timeScale`; keep Ultra visibly selected only when effective speed is near 8x, otherwise mark it degraded and show `requested x8, running xN.N` in `#timeScaleActualLabel`. Add a tooltip explaining CPU-bound degradation.
   - Validation: with a forced low `metrics.timeScaleActual` in a HUD unit test, Ultra must not look like a fully satisfied 8x state and the actual/running text must be visible.

3. Add high-speed worker AI LOD in `src/simulation/npc/WorkerAISystem.js:update`.
   - Code-change intent: replace the current `workerStride` thresholds at `activeWorkers >= 800/1000` with a high-speed-aware threshold, for example stride 2 when `state.controls.timeScale >= 4 && activeWorkers >= 64`, while still calling `followPath` every skipped worker tick so motion remains continuous. Keep hunger/rest/resource state updates accumulated through `blackboard.aiLodDt` on processed ticks.
   - Validation: add or update a worker-AI cadence test proving skipped workers continue following paths every sim tick and receive accumulated hunger/rest updates on their processed tick; run a browser soak to confirm no new idle/starvation regression.

4. Add high-speed movement/traffic cadence LOD in `src/simulation/movement/BoidsSystem.js:update`.
   - Code-change intent: lower the high-load path from `entities.length >= 320` to a combined condition such as `state.controls.timeScale >= 8 && entities.length >= 75`, with a conservative `highLoadStepSec` of about `1/30` for reviewed colony sizes. Keep accumulated `simDt` so entity positions remain deterministic and readable.
   - Validation: run a deterministic movement test comparing entity bounds/path progress under 1x and 8x LOD, then repeat the 75-100 worker RAF sample and verify dense movement has no repeated >50 ms hitches.

5. Reduce hot-path UI/render churn in `src/app/GameApp.js:render` and `src/render/SceneRenderer.js:render`.
   - Code-change intent: when effective speed is degraded or entity count exceeds about 75, raise noncritical panel refresh interval to at least 1/4 s, but keep HUD speed/resource crisis fields refreshed. In `SceneRenderer.render`, keep entity matrix updates tied to position-changing ticks but avoid rebuilding non-visible label/placement overlays unless their signature changes.
   - Validation: use `state.debug.systemTimingsMs`, `metrics.uiCpuMs`, and `metrics.renderCpuMs` during the RAF sample to confirm the frame budget reduction comes from sim/render work, not just hiding labels.

## P1 - Autopilot scales into starvation before pausing

Root cause: the current fail-safe fires only after starvation deaths. `src/simulation/economy/ResourceSystem.js:#emitFoodCrisisIfNeeded` requires `foodStock <= 0` and at least one recent `WORKER_STARVED` event. `src/app/GameApp.js:#maybeAutopauseOnFoodCrisis` then pauses after damage is done. Growth pressure also remains permissive in `src/simulation/population/PopulationGrowthSystem.js:update`, where births continue whenever food is above `MIN_FOOD_FOR_GROWTH` and infrastructure cap allows it, without considering recent food net rate, starvation risk, meals, or food-per-worker runway.

Implementation steps:

1. Add a pre-crisis detector in `src/simulation/economy/ResourceSystem.js:update`, adjacent to `#emitFoodCrisisIfNeeded`.
   - Code-change intent: introduce `#emitFoodPreCrisisIfNeeded(state)` and a new event type in `src/simulation/meta/GameEventBus.js` such as `FOOD_PRECRISIS_DETECTED`. Trigger when Autopilot is on and projected runway is unsafe before deaths: examples include `food <= emergencyThreshold`, `metrics.foodConsumedPerMin > metrics.foodProducedPerMin`, `resources.food / liveWorkers < configured floor`, `metrics.resourceEmptySec.food > 0`, or `metrics.starvationRiskCount > 0`. Include payload fields `food`, `workers`, `netFoodPerMin`, `runoutSec`, `starvationRiskCount`, and a plain reason like `population growth exceeds food production`.
   - Validation: add a resource-system test where falling food/net rate emits pre-crisis before any `WORKER_STARVED` event and does not spam due to cooldown.

2. Add Autopilot throttling/recovery mode in `src/app/GameApp.js`, near `#maybeAutopauseOnFoodCrisis`.
   - Code-change intent: add `#maybeThrottleAutopilotOnFoodPreCrisis()` that consumes the new event, sets `state.ai.foodRecoveryMode = true`, records `foodRecoveryReason`, and reduces expansion speed without fully pausing. In recovery mode, keep Autopilot enabled but block non-food expansion until runway recovers.
   - Validation: in an 8x default Autopilot run, the first player-facing warning must appear before any starvation death and before food reaches zero.

3. Gate expansion in `src/simulation/meta/ColonyDirectorSystem.js:assessColonyNeeds`.
   - Code-change intent: when `state.ai.foodRecoveryMode` or the same food-runway predicate is true, return only food/logistics recovery priorities: farms, warehouses near uncovered farms, roads to farms, and worker-role support. Suppress continuous roads/walls/quarries/herb gardens/smithy expansion at `assessColonyNeeds` lines 218-267 until recovery clears.
   - Validation: add a director test that low food plus negative net food suppresses non-food expansion and prioritizes reachable farm/warehouse fixes.

4. Add growth safety in `src/simulation/population/PopulationGrowthSystem.js:update`.
   - Code-change intent: before spawning a worker, require food runway to remain safe after `FOOD_COST_PER_COLONIST`; use live worker count, `metrics.foodProducedPerMin`, `metrics.foodConsumedPerMin`, meals, and `metrics.starvationRiskCount`. If Autopilot recovery mode is active or net food is negative, skip birth and optionally record `state.metrics.populationGrowthBlockedReason = "food runway unsafe"`.
   - Validation: add a population-growth test proving births are blocked during negative food runway and resume when food production recovers.

5. Replace the generic pause text in `src/app/GameApp.js:#maybeAutopauseOnFoodCrisis` and `src/ui/hud/HUDController.js:#renderAutopilotCrisis`.
   - Code-change intent: render a short checklist mapped to controls: `1. Select Farm, place on green terrain. 2. Select Warehouse/Road, reconnect fields. 3. Resume with Space or Autopilot toggle after food > 10 and net food >= 0.` Use event payload data when available.
   - Validation: a HUD test for `ai.pausedByCrisis` must assert the checklist includes Farm, Warehouse/Road, and Space/toggle resume.

## P1 - AI/Autopilot status is transparent but contradictory

Root cause: player-facing and debug layers are mixed. `src/ui/hud/autopilotStatus.js:getAutopilotStatus` condenses fallback/fallback into `Autopilot ON · rules` and hides most LLM availability in casual mode. `src/ui/panels/AIAutomationPanel.js:render`, `src/ui/panels/AIExchangePanel.js:renderExchangeCard`, and `src/ui/panels/AIPolicyTimelinePanel.js:formatRow` then expose raw `fallback`, `fallback-degraded`, proxy/error/model details without first stating practical gameplay impact.

Implementation steps:

1. Centralize automation status derivation in `src/ui/hud/autopilotStatus.js`.
   - Code-change intent: add a helper such as `getAutomationModeSummary(state)` returning `{hudLabel, aiAvailability, impact, playerAction, debug}`. Distinguish at least `Rule Autopilot active`, `AI active`, `AI unavailable - rules still active`, and `Autopilot paused - food recovery`.
   - Validation: add status-contract tests for proxy down, last policy fallback with error, live LLM, Autopilot off, and paused-by-crisis.

2. Update `src/ui/hud/HUDController.js:1397` to use the centralized summary.
   - Code-change intent: make the top chip read plainly, for example `Rule Autopilot active · AI unavailable` when proxy/model calls are down, and put `what still works / what is disabled / player action` in the title. Avoid requiring the AI Log for basic status.
   - Validation: HUD test must verify proxy down plus Autopilot on does not render only `Autopilot ON · rules`.

3. Refactor `src/ui/panels/AIAutomationPanel.js:render`.
   - Code-change intent: add a player-facing impact card before the technical rows: `Still working: rule builder, NPC policies. Disabled: live AI calls. Action needed: none unless you want live AI.` Move `coverage=`, `mode=`, proxy, model, and inactive planner details into a collapsed debug section.
   - Validation: panel test must assert the impact card appears above rows and raw proxy/model details are not required to understand automation.

4. Refactor `src/ui/panels/AIExchangePanel.js:renderExchangeCard` and `renderErrorLogCard`.
   - Code-change intent: keep full prompt/error payloads, but default them under a `Debug details` disclosure. Add one-line practical impact near the top of each card: `Using rule-based decision because the AI request failed; gameplay automation continues.`
   - Validation: AI Log test must assert fallback/error cards include practical impact text and still preserve debug details when expanded.

5. Make policy timeline language player-facing in `src/ui/panels/AIPolicyTimelinePanel.js:formatRow` and/or at write time in `src/simulation/ai/brains/NPCBrainSystem.js:update`.
   - Code-change intent: map `fallback-degraded` to `Rules took over after AI error`; map focus text like `rebuild the broken supply lane` into `Repair the broken supply lane`; move `errorKind` and `model` into a muted debug suffix or title.
   - Validation: timeline test must prove no row relies on `fallback-degraded` as the primary visible badge.

## P2 - Help opens on Resource Chain instead of Controls

Root cause: static markup in `index.html:2696-2730` marks `Resource Chain` as the active tab/page by default even though `Controls` is first.

Implementation steps:

1. Change the default active tab/page in `index.html`.
   - Code-change intent: move `class="active"` from the `data-help-tab="chain"` button to `data-help-tab="controls"`, and from the `data-help-page="chain"` section to `data-help-page="controls"`. Remove or update the nearby comment at `index.html:2705` that explains intentionally defaulting to Resource Chain.
   - Validation: open `How to Play` from the start screen and assert the Controls tab and Basic Controls section are active on first open.

2. Make `openHelp()` in `index.html:2777` optionally context-aware without preserving stale tab state.
   - Code-change intent: add a tiny `selectHelpTab(tab = "controls")` helper used by `openHelp()` so future callers can intentionally open `chain` or another tab, but the default first/open action lands on Controls.
   - Validation: add/update help modal test to call `window.__utopiaHelp.open()` and verify Controls is selected by default.

## P2 - Heat lens labels become noisy during crisis

Root cause: `src/render/PressureLens.js:buildHeatLens` can produce up to 48 primary heat markers plus halo markers, and `src/render/SceneRenderer.js:#updatePressureLensLabels` projects every non-empty marker label before only local screen-space dedup (`nearPx: 24`, `bucketPx: 32`). There is no global top-N label budget, no zoom-aware fade, and no drilldown path for suppressed labels.

Implementation steps:

1. Add priority metadata to heat markers in `src/render/PressureLens.js:buildHeatLens`.
   - Code-change intent: include `actionRank` or strengthen `priority/weight` so true crisis markers sort above secondary warehouse-idle/surplus labels. In crisis conditions, prefer labels that directly explain food recovery: input-starved kitchens/farms/warehouses over generic surplus.
   - Validation: unit test `buildHeatLens` with many food-crisis markers and assert the top-ranked labels include no more than the highest-impact 3-5 actionable issues.

2. Add a global visible-label budget in `src/render/SceneRenderer.js:#updatePressureLensLabels`.
   - Code-change intent: before writing labels, sort projected visible entries by marker priority/weight and keep only the top 3-5 at normal zoom. Still render tile overlays/markers for context, but hide lower-priority text labels.
   - Validation: scene label test with 12 overlapping heat markers must render at most 5 visible `.pressure-label` elements while keeping marker overlays.

3. Make label budget zoom-aware in `src/render/SceneRenderer.js:#updatePressureLensLabels`.
   - Code-change intent: derive approximate zoom from camera distance or `controls.getDistance()` and use a smaller label budget when zoomed out, larger budget when zoomed in. Fade/suppress labels below a zoom threshold rather than always rendering all.
   - Validation: test or browser check must show fewer labels zoomed out and more labels zoomed in without changing heat marker data.

4. Add drilldown for suppressed labels in `src/render/SceneRenderer.js` hover/selection path.
   - Code-change intent: keep suppressed label summaries in a per-tile or screen-bucket cache and expose them through the existing tile hover/inspector text so lower-priority issues are discoverable on hover/click instead of always visible.
   - Validation: hover a clustered heat lens area after suppression and verify the inspector/tooltip lists hidden issue counts/details.

## End-to-end validation

1. Browser performance pass: default Temperate Plains 96x72, Autopilot on, 8x, 75-100 workers. Capture a 15-second `requestAnimationFrame` sample. Pass if p95 frame interval is under 35 ms and FPS is at least 45, or if the UI transparently degrades requested 8x and explains why.
2. Autopilot survival pass: same run through 80 workers. Pass if a pre-crisis warning appears before any starvation death and Autopilot recovery mode prioritizes food/logistics before food reaches zero.
3. Status clarity pass: proxy down / fallback / live AI states. Pass if the top HUD alone states whether Rule Autopilot, AI unavailable, or AI active is driving, and AI Log explains practical impact before debug details.
4. UX regression pass: Help opens to Controls by default; Heat Lens crisis view shows only the top 3-5 actionable labels at normal zoom, with hidden details available by hover/click.
