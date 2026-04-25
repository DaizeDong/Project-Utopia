---
plan: Round5b/Plans/01a-onboarding.md
plan_version: v2
primary_commit: e553078
supplemental_commit: TBD (hud-truncation-data-full.test.js + CHANGELOG)
branch: feature/v080-living-world
date: 2026-04-24
author: Claude Sonnet 4.6
tests_pass: 1202/1204 (0 fail, 2 pre-existing skips)
---

# Round-6 Wave-1 01a-onboarding Implementation Log

## Primary Commit

`e553078` — feat(round5b wave-1 01a-onboarding): autopilot food-crisis autopause + buildHint pipeline

## Supplemental Commit (this wave)

Adds `test/hud-truncation-data-full.test.js` (Step 10) + CHANGELOG entry.
The primary commit was already landed in a prior run on this branch.

## Files Touched

| File | Change Type | Primary/Suppl | Notes |
|------|-------------|---------------|-------|
| `src/simulation/meta/GameEventBus.js` | edit | primary | +2 LOC: `FOOD_CRISIS_DETECTED: "food_crisis_detected"` in EVENT_TYPES |
| `src/simulation/economy/ResourceSystem.js` | edit | primary | +50 LOC: `#emitFoodCrisisIfNeeded(state)` private method; called at end of `update()` |
| `src/app/GameApp.js` | edit | primary | +45 LOC: `#maybeAutopauseOnFoodCrisis()` method; called from `stepSimulation()` after systems; `#maybeAutopauseOnFoodCrisis` call in `update()` |
| `src/ui/hud/autopilotStatus.js` | edit | primary | +19 LOC: `pausedByCrisis` early-return branch; `"fallback/fallback"` → `"rule-based"` normalization; `pausedByCrisis` field in returned object |
| `src/ui/hud/HUDController.js` | edit | primary | +53 LOC: `statusBuildHint`/`statusAutopilotCrisis` DOM refs; `#renderBuildHint()`; `#renderAutopilotCrisis()`; `#renderNextAction` sets `data-full=`; both new render methods called from `render()` |
| `src/render/SceneRenderer.js` | edit | primary | +29 LOC: `#onPointerMove` pipes `previewToolAt().reasonText` + Ctrl+Z hint into `state.controls.buildHint`; wrapped in try/catch |
| `index.html` | edit | primary | +10 LOC: `<span id="statusBuildHint">`, `<span id="statusAutopilotCrisis">` DOM nodes; Controls hotkey line `1–6` → `1–12` |
| `test/autopilot-food-crisis-autopause.test.js` | new | primary | +94 LOC: 6 tests (emit conditions, benchmarkMode bypass, cooldown) |
| `test/build-hint-reasoned-reject.test.js` | new | primary | +56 LOC: 2 tests (farm on water, non-grass reject reasonText) |
| `test/hud-truncation-data-full.test.js` | new | supplemental | +60 LOC: 4 tests (data-full title mirror, fallback to loopText, >40 char untruncated, consistency) |
| `CHANGELOG.md` | edit | supplemental | +33 LOC: v0.8.2 Round-5b Wave-1 01a-onboarding entry |

---

## Key Line References — FIXED Findings

### F2 (P0-2) — Autopilot 5-minute silent collapse; no failure explanation

**Root cause**: `autopilotStatus.js` always showed "Autopilot ON - fallback/fallback - next policy in X.Xs" even as the colony starved.

**Fix delivery**:
- `src/simulation/economy/ResourceSystem.js` lines 395-444: `#emitFoodCrisisIfNeeded(state)` — emits `FOOD_CRISIS_DETECTED` when `food===0 AND autopilot enabled AND ≥1 WORKER_STARVED in last 30s AND benchmarkMode!==true`. 5 s cooldown on `state.ai._lastCrisisEmitSec`.
- `src/app/GameApp.js` lines 364-410: `#maybeAutopauseOnFoodCrisis()` — scans event log tail, on first crisis sets `controls.isPaused=true`, `ai.pausedByCrisis=true`, `ai.pausedByCrisisAt`, and writes teaching `actionMessage`.
- `src/ui/hud/HUDController.js` lines 481-498: `#renderAutopilotCrisis(state)` — shows `#statusAutopilotCrisis` red alert div with `actionMessage` text.
- `src/ui/hud/autopilotStatus.js` lines 40-57: `pausedByCrisis` early-return returns `"Autopilot PAUSED · food crisis — press Space or toggle to resume"`.

### F3 (P0-3) — 6 secondary build tools (Bridge/Quarry/Herbs/Kitchen/Smithy/Clinic) have no onboarding feedback

**Root cause**: `SceneRenderer` colored preview meshes red on invalid tiles but never surfaced the `BuildSystem.previewToolAt().reasonText` to the player.

**Fix delivery** (same as F6/F21):
- `src/render/SceneRenderer.js` lines 2699-2725: `#onPointerMove` pipes `previewToolAt(state, tool, ix, iz).reasonText` into `state.controls.buildHint`. `explainBuildReason` already had descriptive enum text for all 12 tools.
- `src/ui/hud/HUDController.js` lines 459-479: `#renderBuildHint(state)` renders `state.controls.buildHint` into `#statusBuildHint` with diff-guard.

### F4 (P1-4) — Scenario/next-action instructions truncated by CSS ellipsis; no hover fallback

**Fix delivery**:
- `src/ui/hud/HUDController.js` lines 440-444 (in `#renderNextAction`):
  ```js
  node.setAttribute?.("data-full", title || loopText);
  ```
  Both `title=` (hover tooltip) and `data-full=` attribute mirror the full untruncated text.

### F6 (P1-6) — Water + Farm build is silently rejected; red mesh but no text

**Fix delivery**: Same pipeline as F3 — `SceneRenderer.#onPointerMove` → `state.controls.buildHint` → `HUDController.#renderBuildHint` → `#statusBuildHint`. The `explainBuildReason` for `farm` on WATER returns `"Farm requires grass tile — water tiles cannot support crops."`.

### F12 (P2-12) — Hotkey doc inconsistency: Welcome shows `1-12`, Help/Controls shows `1-6`

**Fix delivery**:
- `index.html` line 2236: `<li><code>1</code>–<code>12</code> — quick-pick build tool (12 tools in the Build toolbar; hover any button for name + hotkey).</li>`
  Previously: `<code>1</code>–<code>6</code> — quick-pick build tool (Road, Farm, Lumber, Warehouse, Wall, Erase).`

### F14 (P2-14) — Ctrl+Z has no discovery hint at the moment of first build error

**Fix delivery**:
- `src/render/SceneRenderer.js` lines 2711-2714 (in `#onPointerMove`):
  ```js
  const undoHint = Array.isArray(state.controls?.undoStack) && state.controls.undoStack.length > 0
    ? " (Ctrl+Z to undo last build.)" : "";
  state.controls.buildHint = tip + undoHint;
  ```
  When the undo stack is non-empty, the undo hint is appended to the build-reason text, discoverable at the point of error.

### F15 (P2-15) — At 4× fast-forward, player cannot read HUD before colony collapses

**Partial fix delivery**:
- R-A auto-pause (`#maybeAutopauseOnFoodCrisis`) sets `controls.isPaused=true` on food crisis, pausing the fast-forward naturally and giving the player time to read the teaching banner.

### F18 (建议3) — Food=0 should auto-pause autopilot

**Fix delivery**: Same as F2 — `#maybeAutopauseOnFoodCrisis` sets `controls.isPaused=true`. The "first-run modal" sub-feature is deferred per the plan's §4 justification (UI-only modal = single layer, violates §4.10 cross-layer ≥2 constraint and HW06 freeze).

### F19 (建议4) — Scenario/next-action instructions should be expandable on hover

**Fix delivery**: Same as F4 — `node.title = title` enables hover expansion. `data-full` provides the programmatic access path for CSS/test selectors.

### F21 (建议6) — Invalid tile hover: red mesh + tooltip/bubble with reason

**Fix delivery**: Same as F3/F6 — `#statusBuildHint` renders the `reasonText` as persistent single-line text below `#statusNextAction` on the HUD status bar. Not a floating bubble (no floating tooltip required by plan Step 5 spec), but a permanent inline line that appears on hover-invalid and disappears on hover-clear.

### F22 (建议7) — Unify hotkey `1-12` vs `1-6`

**Fix delivery**: Same as F12. The Welcome banner already shows `1-12`; the Help/Controls page change brings parity.

---

## Steps Coverage

| Step | Plan Step | Status | Notes |
|------|-----------|--------|-------|
| Step 1 | ResourceSystem FOOD_CRISIS_DETECTED emitter | DONE | `#emitFoodCrisisIfNeeded`; benchmarkMode bypass; 5s cooldown |
| Step 2 | GameApp autopause on crisis | DONE | `#maybeAutopauseOnFoodCrisis`; clear-on-recovery branch |
| Step 3 | HUDController data-full on next-action | DONE | `data-full` + `title` set in `#renderNextAction` |
| Step 4 | SceneRenderer buildHint pipe | DONE | `#onPointerMove` writes `state.controls.buildHint` |
| Step 5 | HUDController #renderBuildHint + #renderAutopilotCrisis | DONE | Two new private render methods; called from `render()` |
| Step 6 | autopilotStatus pausedByCrisis branch | DONE | Early-return with "PAUSED" text; `"fallback/fallback"` → `"rule-based"` |
| Step 7 | index.html DOM nodes + 1-6→1-12 | DONE | Two new spans; hotkey line updated |
| Step 8 | test/autopilot-food-crisis-autopause.test.js | DONE | 6 tests — all pass |
| Step 9 | test/build-hint-reasoned-reject.test.js | DONE | 2 tests — all pass |
| Step 10 | test/hud-truncation-data-full.test.js | DONE (this wave) | 4 tests — all pass |
| Step 11 | CHANGELOG.md | DONE (this wave) | Entry added at top of unreleased section |

---

## Test Results Summary

```
node --test test/*.test.js
# tests 1204
# suites 73
# pass 1202
# fail 0
# skipped 2  (pre-existing)
# duration_ms ~200000
```

New tests added by 01a: 12 total (6 food-crisis + 2 build-hint + 4 hud-truncation).

---

## Benchmark Regression Guard

The `benchmarkMode` bypass in `ResourceSystem.#emitFoodCrisisIfNeeded` (line 406):
```js
if (state.benchmarkMode === true) return;
```
ensures that `scripts/long-horizon-bench.mjs` runs are unaffected. The `#maybeAutopauseOnFoodCrisis` method in `GameApp.js` (line 375) has its own guard:
```js
if (state.benchmarkMode === true) return;
```
Both guards prevent the autopause from triggering in headless benchmark runs, preserving the 4-seed sweep determinism.

---

## Coverage Matrix (Summary)

| Finding | Disposition | Delivered |
|---------|-------------|-----------|
| F2 (P0-2) | FIXED | `#emitFoodCrisisIfNeeded` + `#maybeAutopauseOnFoodCrisis` + autopilotStatus + HUD banner |
| F3 (P0-3) | FIXED | `previewToolAt().reasonText` → `buildHint` → `#statusBuildHint` |
| F4 (P1-4) | FIXED | `data-full` + `title` in `#renderNextAction` |
| F6 (P1-6) | FIXED | Same pipe as F3; farm/water reasonText surfaces inline |
| F12 (P2-12) | FIXED | `index.html` Controls tab `1–12` |
| F14 (P2-14) | FIXED | Ctrl+Z hint appended to `buildHint` when undoStack non-empty |
| F15 (P2-15) | PARTIAL | Auto-pause creates time to read HUD; speed policy not changed |
| F18 (建议3) | FIXED | food=0 + autopilot → isPaused=true |
| F19 (建议4) | FIXED | `title=` hover expansion on `#statusNextAction` |
| F21 (建议6) | FIXED | `#statusBuildHint` shows invalid-tile reason text persistently |
| F22 (建议7) | FIXED | Same as F12 |
