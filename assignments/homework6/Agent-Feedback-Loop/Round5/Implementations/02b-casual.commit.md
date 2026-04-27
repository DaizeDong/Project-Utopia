---
reviewer_id: 02b-casual
plan_source: Round5/Plans/02b-casual.md
bundle: w2-stall-tooltip (Package C, independent)
round: 5
wave: 2
date: 2026-04-22
parent_commit: e0f9f8f
head_commit: 3e9ab4c
status: DONE
steps_done: 7/7 (plan steps 1-7; Step 8 CHANGELOG reserved for Validator)
tests_passed: 1130/1132
tests_new:
  - test/resource-chain-stall.test.js (10 cases — shape contract + 9 bottleneck scenarios)
  - test/hud-stall-tooltip.test.js (6 cases — HUD/Toolbar wiring + CSS + smoke)
---

## Steps executed

- [x] Step 1: ColonyPerceiver — new `getResourceChainStall(state)` named export (~125 LOC). Folds `analyzeResourceChains` for food/meals/tools/medicine and computes raw-input stalls for wood/stone/herbs inline (no lumber mill → "no lumber mill yet — build lumber (5w)"; lumber exists but no loggers → "no loggers assigned — raise wood quota in Management"; mirror for quarries/stoneMiners and herbGardens/herbGatherers). Returns a frozen-shape map `{food, wood, stone, herbs, meals, tools, medicine}` where each entry is `{bottleneck, nextAction, severity: "stalled"|"slow"|"ok"}`.
- [x] Step 2: HUDController.render — computes stall once per `RATE_WINDOW_SEC` (3 s) via new `_lastChainStallSec` + `_lastChainStall` cache fields. Avoids a per-frame Perceiver call; aligns with the rate-badge window.
- [x] Step 3: HUDController.render — for each of the 7 rate badges (food/wood/stone/herbs/meals/tools/medicine), sets `title="<bottleneck> — <nextAction>"` + `data-stall="1"` when `bottleneck` is non-null AND `|rate| < 0.05`. Otherwise falls back to `title="<key>: <rate> over last 3s"` + `data-stall=""` to let the CSS fade out.
- [x] Step 4: BuildToolbar — new `getBuildDeficitHint(state, preview)` helper appends the first stalled raw-resource chain bottleneck to `#buildPreviewVal`'s `data-tooltip` attribute when `preview.reason === "insufficientResource"`. Reads `preview.deficits / shortfalls / missing` opportunistically for ordering; falls back to a static wood/stone/herbs/food priority.
- [x] Step 5: index.html — CSS rule `[data-stall="1"] { border-left: 2px solid rgba(220, 150, 60, 0.7); padding-left: 4px; }` injected in the ENTITY FOCUS style block (shipped in Package A to collapse one HTML touch; plan explicitly allowed the shared-style location).
- [x] Step 6: test/resource-chain-stall.test.js added — covers reviewer's cases A-E plus four extras (herb garden, clinic, smithy-ok, shape contract).
- [x] Step 7: test/hud-stall-tooltip.test.js added — pins source-contract expectations (import present, window throttle, 7-badge wiring, data-stall set/clear) plus BuildToolbar hint plumbing + CSS presence + direct Perceiver smoke test.
- [~] Step 8 (CHANGELOG): skipped per orchestrator rule #4.

## Tests
- pre-existing skips: 2 (unchanged).
- new tests: test/resource-chain-stall.test.js, test/hud-stall-tooltip.test.js.
- failures resolved during iteration: none (both suites green on first run).

## Deviations from plan
- Plan Step 4 named the location `BuildToolbar.js:896` (a tempting hint about the `actionMessage` / `buildToolCostVal` path). Round-5 Wave-2 made Package A edits earlier in the same file (lines ~185-187 removed, sync() active fallback added, ~+12 LOC), so the current blocker-tooltip block sits around lines 915-940. Used the block containing `preview.reason === "insufficientResource"` / `this.buildPreviewVal.setAttribute("data-tooltip", ...)`, which is the semantically-correct insertion point per plan text.
- Plan Step 5 suggested either inline style injection OR editing an existing stylesheet; chose the existing `<style>` block in index.html's `#entityFocusOverlay` region (already open from Package A) so the diff stays within the Wave-2 file whitelist.

## Handoff to Validator
- HUDController.js received THREE Wave-2 edits (Package A/None, B: foodRateBreakdown+weakest-dim, C: stall tooltips+data-stall). Lines drift forward; grep `_lastChainStall` / `stallPairs` to locate the tooltip loop.
- `data-stall="1"` is safe to style further in Wave 3 — the CSS is deliberately subtle (soft amber left-border only) to satisfy the no-animation HW06 freeze.
- Benchmark expectation: side-channel only, DevIndex unchanged.
- Playwright smoke: hover each of the 7 rate badges on a fresh colony with no lumber mill → wood-rate tooltip should read "no lumber mill yet — build lumber (5w)" and carry `data-stall="1"`; place a lumber + assign loggers → tooltip should fall back to the rate string and `data-stall` should clear.
