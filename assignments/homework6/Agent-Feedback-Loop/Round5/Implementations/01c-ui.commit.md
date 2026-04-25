---
reviewer_id: 01c-ui
plan_source: Round5/Plans/01c-ui.md
bundle: w2-foodrate-devweak-merged (Package B, shared with 01d-mechanics-content data side)
round: 5
wave: 2
date: 2026-04-22
parent_commit: 99844ab
head_commit: e0f9f8f
status: DONE
steps_done: 7/7 (plan steps 1-7; Step 7 glossary plumbing shipped; Step 8 CHANGELOG reserved for Validator)
tests_passed: 1114/1116
tests_new:
  - test/food-rate-breakdown.test.js
  - test/hud-dev-weakest.test.js
tests_modified:
  - test/ui/hud-glossary.test.js (snapshot bumped to include foodRateBreakdown)
---

## Steps executed

- [x] Step 1: ResourceSystem.update — added sliding-window `_resourceFlowAccum` (per-resource produced/consumed/spoiled) + `_resourceFlowWindowSec` + `_resourceFlowLastSnapshot`. Flushes per-min metrics every `RESOURCE_FLOW_WINDOW_SEC` (3 s) with `× 60 / windowSec` scaling.
- [x] Step 2: Extended the flow-tracker to wood/stone/herbs/meals/medicine/tools as `state.metrics[<r>ProducedPerMin/<r>ConsumedPerMin]`. Future HUD hooks, no UI wired this wave.
- [x] Step 3: HUDController `#foodRateBreakdown` empty branch → `(sampling…)` (no more silent blank).
- [x] Step 4: HUDController `#statusObjectiveDev` appends `weakest: <dim> <value>` when the weakest dev-index dim is < devScore-8. Casual mode falls back to plain `Dev N/100`.
- [x] Step 5: test/food-rate-breakdown.test.js added (6 cases: true-source emit, net-delta fallback, stable window, invalid-input guards, spoiled channel, ProcessingSystem kitchen integration).
- [x] Step 6: test/hud-dev-weakest.test.js added (source-contract checks + literal replica of the weakest-dim function exercised across 4 shapes).
- [x] Step 7: HUDController `#applyGlossaryTooltips` pairs list extended with `foodRateBreakdown`; glossary.js gains the `foodRateBreakdown` entry; hud-glossary.test.js snapshot bumped.
- [~] Step 8 (CHANGELOG): skipped per orchestrator rule #4.

## Tests
- pre-existing skips: 2 (unchanged).
- new tests added: test/food-rate-breakdown.test.js, test/hud-dev-weakest.test.js.
- failures resolved during iteration:
  - initial ResourceSystem test used float-loop (`10 * 0.3 ≠ 3.0`) → switched to single `sys.update(3, state)`.
  - net-delta test needed a prime tick at food=100 before mutating down to 40.
  - ProcessingSystem kitchen test originally used `worldToTile(5, 5, grid)` without `grid.tileSize`, yielding NaN coords → fixed to build cook position via `tileToWorld(5, 5, grid)`.

## Deviations from plan
- Plan 01c Step 1 proposed net-delta reasoning for ALL food movement; Wave-2 merge guidance (summary.md §2 D1 01c×01d) selects 01d's **true-source emit** for prod/cons/spoil and keeps net-delta as a fallback ONLY for the food drop that WorkerAISystem consumes (freeze-locked). Implementation reflects the merged design — `recordResourceFlow` named export fires from ProcessingSystem (kitchen food→meals, smithy stone+wood→tools, clinic herbs→medicine) and MortalitySystem (medicine heal), and ResourceSystem folds any unexplained net-negative food delta into consumed.
- Plan 01c Step 4 suggested a separate `#statusObjectiveDevWeak` span; implemented the badge inline in existing `#statusObjectiveDev` textContent to keep DOM additions zero (per `estimated_scope`).

## Handoff to Validator
- HUDController.js has been touched TWICE (Wave-2 Package A did not touch it; Package B = this commit; Package C will add stall-tooltip markers in the next commit). Line numbers within HUDController drift forward; grep `foodRateBreakdown` / `_lastChainStallSec` to find the new blocks.
- ResourceSystem `RESOURCE_FLOW_WINDOW_SEC` is public for re-use by HUDController's rate-badge throttle (Package C).
- Benchmark: per plan Risks §R5, `test/hud.test.js` never asserted an exact `Dev X/100` textContent, so no golden drift.
