---
reviewer_id: 02b-casual
plan_source: Round1/Plans/02b-casual.md
round: 1
date: 2026-04-22
parent_commit: a14d150
head_commit: 6297371
status: DONE
steps_done: 7/8
tests_passed: 1000/1002
tests_new: test/world-explain-casual.test.js
---

## Steps executed

- [x] **Step 1** — `index.html` `.hud-objective` rule: replaced `max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` with 2-line `-webkit-box` clamp + `max-width: 240px; line-height: 1.25; word-break: break-word;`. Preserved `font-size: 10px; opacity: 0.7; text-align: right;` and the native `title` tooltip fallback.
- [x] **Step 2** — `index.html` `.hud-scenario` rule: same transformation (`max-width: 320px` → `420px`; nowrap/ellipsis → 2-line `-webkit-box` clamp + `word-break: break-word`). `margin-right: 12px; flex-shrink: 1;` preserved.
- [x] **Step 3** — `index.html` `.hud-action` rule: `max-width: 420px` → `520px`; nowrap/ellipsis → 2-line `-webkit-box` clamp + `line-height: 1.3`. `padding`, `border-radius`, `font-size`, and `transition: opacity 0.3s` preserved; `.flash-action` animation keyframes still in scope.
- [x] **Step 4** — `index.html` compact-mode fallback: appended a block after `#ui.compact .hud-action.flash-action { animation: none; }` that selects `#ui.compact .hud-objective, #ui.compact .hud-scenario, #ui.compact .hud-action` and restores `-webkit-line-clamp: 1; white-space: nowrap; text-overflow: ellipsis;`. Inserted as a new rule block (not a property merge) for clarity.
- [x] **Step 5** — `src/ui/interpretation/WorldExplain.js`: added exported function `getScenarioProgressCompactCasual(state)` immediately after `getScenarioProgressCompact`. Reuses `getScenarioRuntime(state)` (no extra grid traversal). Renders human-readable tokens: `"N of M supply routes open"`, `"N of M depots reclaimed"`, `"N warehouses built (goal M)"`, `"N farms built (goal M)"`, `"N lumber camps (goal M)"`, `"N walls placed (goal M)"`. Empty fallback: `"Endless mode — no pending goals"`. Separator is two spaces (not `" · "`) so the 2-line clamp can break mid-string.
- [x] **Step 6** — `src/ui/hud/HUDController.js`: added `getScenarioProgressCompactCasual` to the existing named import from `../interpretation/WorldExplain.js`. At the `#statusScenario` render site (line ~498), branched on `state.controls?.uiProfile ?? "casual"` — casual profile calls the new function, full/dev profile keeps `getScenarioProgressCompact`. No other consumers in the file.
- [x] **Step 7** — Created `test/world-explain-casual.test.js` with 3 tests: (1) default Broken Frontier scenario renders structural `"N of M supply routes open"` / `"N warehouses built (goal M)"` patterns and must NOT contain the dev-profile `" · "` separator; (2) emptied scenario returns exactly `"Endless mode — no pending goals"`; (3) regression guard that `getScenarioProgressCompact` still emits `wh N/M`, `farms N/M`, and `" · "` separators on the same state (proves the dev-profile literal is preserved).
- [ ] **Step 8** — SKIPPED (manual-only): `npx vite` smoke. Plan explicitly lists this as human-eye verification; unit tests in Step 7 cover the string shapes, and the CSS changes are static. Handed to Validator.

## Tests

- pre-existing skips: 2 (unchanged baseline)
- new tests added: `test/world-explain-casual.test.js` (3 subtests, all passing)
- failures resolved during iteration: none — first full-suite run was green (1000/1002 pass, 0 fail)

## Deviations from plan

- **Step 1/2/3 textual cap**: plan re-listed the full replacement property set including existing properties like `font-size`, `opacity`, `text-align`, `padding`, `border-radius`, `transition`. To minimize diff churn and avoid accidentally dropping a neighboring property, I produced a targeted Edit that swaps only the `max-width / overflow / text-overflow / white-space` cluster and adds the 2-line clamp properties alongside. Net CSS semantics match plan exactly.
- **Step 5 separator**: plan specifies `"  "` (two spaces). Implemented as `"  "` exactly.
- **Step 6 comment**: added an inline comment above the branch explaining why the dev profile keeps the original function (protects terse-token tests). Plan did not request the comment; included as a low-cost maintainer hint.

## Handoff to Validator

1. **Playwright smoke area**: `#statusObjective`, `#statusScenario`, `#statusAction` (HUD top-right chip trio). Verify in non-compact mode that long warnings ("Insufficient resources to build Quarry...", "No stone node on this tile. Quarries must be sited on a stone deposit.") wrap to 2 lines instead of being truncated with `...`. Verify in compact mode (`#ui.compact`) that all three chips collapse to single-line + ellipsis.
2. **Casual-mode ribbon text**: default `body.casual-mode` should show `"0 of 1 supply routes open  0 of 1 depots reclaimed  0 warehouses built (goal N)  ..."` in `#statusScenario`. Toggle dev profile (`?ui=full`) to confirm it reverts to the terse `"routes 0/1 · depots 0/1 · wh 0/2 · ..."` line.
3. **Benchmark**: plan requests `scripts/long-horizon-bench.mjs --seed=42 --preset=temperate_plains --days=365` as a sanity check (DevIndex floor 41). CSS+pure-selector changes should not affect simulation output; run it if policy requires, but expected delta is 0.
4. **Out of scope**: deaths-without-notification, onboarding, SFX, and auto-tool-reset were explicitly deferred by the plan (freeze compliance). No FREEZE-VIOLATION flags.
