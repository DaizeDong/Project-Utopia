---
round: 9
stage: B
date: 2026-04-26
source:
  - Round9/Feedbacks/reviewer-a.md
  - Round9/Feedbacks/reviewer-b.md
status: ACCEPTED
---

# Round 9 Stage B - Accepted Plan Summary

## Accepted Scope

This summary merges the two independent Enhancer plans into implementation waves. The implementation stage may read this file as the accepted scope.

| Wave | Priority | Status | Goal |
| --- | --- | --- | --- |
| W1 performance-truth-and-lod | P1 | ACCEPTED | Make high-speed/high-entity runs degrade honestly and reduce main-thread AI/pathfinding cost. |
| W2 autopilot-food-precrisis | P1 | ACCEPTED | Warn and enter recovery mode before starvation deaths; throttle expansion while food runway is unsafe. |
| W3 automation-ownership | P1 | ACCEPTED | Separate player Autopilot, rule builder, background directors, NPC policies, and live/fallback AI in HUD/panels/events. |
| W4 performance-panel-and-benchmark-summary | P2 | ACCEPTED | Surface FPS, p95/p99, sim/render/UI cost, entity count, target-vs-actual speed, cap state, and bottleneck inference. |
| W5 entity-focus-high-load | P2 | ACCEPTED | Replace `+N more` as the only high-load affordance with status/role/crisis grouping and filtering. |
| W6 help-and-heat-lens-polish | P2 | ACCEPTED | Default Help to Controls and reduce Heat Lens label noise during clustered crises. |

## Wave Details

### W1 - performance-truth-and-lod

Root cause: ultra speed can request more fixed steps than the main thread can sustain, while telemetry and controls still present the selected speed as if it were being delivered. High-load AI systems also run too much full-frequency decision logic at reviewed counts.

Implementation targets:

- `src/app/GameLoop.js`: pass raw frame timing to `GameApp.update/render` while keeping clamped simulation delta for safety.
- `src/app/GameApp.js`: compute wall-clock actual speed, long-frame counts, p95/p99 frame timing, and a `performanceCap` object when target speed cannot be sustained.
- `src/app/simStepper.js`: accept an effective max-step cap so the app can preserve interactivity instead of catching up indefinitely.
- `src/ui/hud/HUDController.js`: show target-vs-actual speed and cap reason when fast/ultra diverges.
- `src/simulation/npc/WorkerAISystem.js`, `AnimalAISystem.js`, `VisitorAISystem.js`, `BoidsSystem.js`: use high-speed/high-load cadence LOD while preserving path-following every tick and accumulated `dt`.

Validation:

- Browser stress: default ultra 75-100 workers must either stay readable or show explicit performance-capped state.
- Headless stress profile must improve or stay no worse than the current optimized baseline.
- Unit tests for telemetry/cap and entity LOD debug fields.

### W2 - autopilot-food-precrisis

Root cause: current crisis handling pauses after starvation deaths; growth/build decisions do not consistently account for food runway or starvation-risk telemetry.

Implementation targets:

- `src/simulation/economy/ResourceSystem.js`: emit a pre-crisis event before deaths when food runway is unsafe.
- `src/app/GameApp.js`: consume pre-crisis events into `state.ai.foodRecoveryMode`, player-facing warning copy, and recovery checklist.
- `src/simulation/meta/ColonyDirectorSystem.js`: suppress non-food expansion while recovery mode is active and prioritize farms, warehouses, and road reconnection.
- `src/simulation/population/PopulationGrowthSystem.js`: block births when food runway is unsafe and expose `populationGrowthBlockedReason`.

Validation:

- Pre-crisis event fires before any starvation event in a controlled test.
- Autopilot default high-speed run surfaces warning before starvation where feasible.
- Director/growth tests prove non-food expansion and births are gated during unsafe food runway.

### W3 - automation-ownership

Root cause: Autopilot OFF still permits background rule builders/directors to act, and build/action attribution is not visible enough for players to know who authored a change.

Implementation targets:

- `src/simulation/meta/ColonyDirectorSystem.js`: explicitly gate phase/expansion builder work by `state.ai.enabled`; allow only narrow scenario repair when configured.
- `src/simulation/construction/BuildSystem.js`, `src/app/GameApp.js`, `src/simulation/ai/colony/PlanExecutor.js`: persist build owner/reason attribution (`player`, `scenario_repair`, `rule_automation`, `autopilot`).
- `src/ui/hud/autopilotStatus.js`, `src/ui/hud/HUDController.js`: render subsystem-level state in the main chip/title.
- `src/ui/panels/AIAutomationPanel.js`, `AIExchangePanel.js`, `AIPolicyTimelinePanel.js`, `EventPanel.js`: put practical impact and owner labels before debug/error details.

Validation:

- Autopilot-off test proves automatic phase/expansion builds stop.
- Build attribution tests prove player/system/autopilot owner labels flow to events/replay/UI.
- HUD/panel tests cover AI unavailable, rule autopilot, paused crisis, and Autopilot off.

### W4 - performance-panel-and-benchmark-summary

Root cause: reviewers needed external probes to connect visible lag with simulation/render/UI bottlenecks; built-in benchmark lacks p95/p99 and pass/fail summary.

Implementation targets:

- Add or extend a performance metrics helper for rolling samples and bottleneck inference.
- `src/app/GameApp.js`: collect raw frame ms, sim/render/UI ms, entity count, target/actual speed, cap state, and bottleneck.
- `src/ui/panels/PerformancePanel.js` and `index.html`: render current FPS, p95/p99, sim/render/UI cost, entity count, target/actual speed, cap state, bottleneck, and last benchmark result.
- `GameApp.updateBenchmark()` / `buildBenchmarkCsv()`: store benchmark p95/p99, actual speed, cap/bottleneck, pass/fail summary.

Validation:

- Unit tests for p95/p99 and bottleneck inference.
- UI layout tests for stable IDs.
- Benchmark tests for new summary fields.

### W5 - entity-focus-high-load

Root cause: high-load Entity Focus lists only first rows plus `+N more`, hiding crisis entities.

Implementation targets:

- `src/ui/panels/EntityFocusPanel.js`: add `deriveEntityFocusGroups(state)` grouping by starving, hungry, blocked, idle, hauling, combat, and other.
- `src/entities/EntityFactory.js` / control sanitizer if needed: add filter/page controls.
- `EntityFocusPanel` render/delegate: clickable group chips and paged filtered rows.
- HUD crisis count shortcut may set the focus filter and open Entity Focus.

Validation:

- Tests for group derivation, filter delegate, signature invalidation, and crisis row priority.

### W6 - help-and-heat-lens-polish

Root cause: Help defaults to Resource Chain despite Controls being first; Heat Lens renders too many overlapping crisis labels.

Implementation targets:

- `index.html`: default Help tab/page to Controls and make `openHelp()` default explicit.
- `src/render/PressureLens.js`: rank Heat Lens labels by actionable crisis priority.
- `src/render/SceneRenderer.js`: enforce zoom-aware top-label budget and preserve lower-priority details for hover/click.

Validation:

- Help modal test or browser smoke verifies Controls selected on first open.
- Heat Lens test/smoke verifies normal zoom displays top 3-5 labels, not every nearby issue.

## Deferred Items

No reviewer P1 is deferred. Some P2 details may be partially implemented if their full root-cause version exceeds the current round's risk budget:

- Full CPU/GPU utilization percentages are deferred because browser APIs do not expose reliable cross-platform CPU/GPU utilization. The accepted replacement is timing-based bottleneck inference.
- Full OffscreenCanvas/render-worker migration is deferred to a later architecture pass. The accepted near-term fix is frame-pressure LOD plus honest performance caps.

## Required Validation Gate

Stage D must include:

- Targeted tests for changed systems.
- Full `npm test`.
- `npm run build`.
- `git diff --check`.
- Browser smoke at default ultra speed and high-load stress.
- At least one long-duration validation run. If the user requires a wall-clock minimum, the run must record start/end timestamps and elapsed wall-clock duration.
