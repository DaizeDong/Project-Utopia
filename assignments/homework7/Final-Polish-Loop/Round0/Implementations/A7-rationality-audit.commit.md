---
reviewer_id: A7-rationality-audit
plan_source: Round0/Plans/A7-rationality-audit.md
round: 0
date: 2026-05-01
parent_commit: f0ca44d
head_commit: 501f52b
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 6/7
tests_passed: 1656/1664
tests_new:
  - test/ui/statBar.reset.test.js
  - test/ui/foodRateConsistency.test.js
---

## Steps executed
- [x] Step 1: HUDController.resetTransientCaches() + GameApp.regenerateWorld() hook (P0 #1).
- [x] Step 2: Food/Wood/Stone/etc. headline rate now derived from prod-cons-spoil metrics, not stock-delta (P0 #2).
- [x] Step 3: toggleHeatLens() "OFF" wording aligned to plan; L was already correctly wired to Heat Lens via shortcutResolver — A7's "Tile icons" toast originates from setTileIconsVisible() (a separate sidebar handler), confirmed not bound to L (P0 #3).
- [x] Step 4: InspectorPanel Memory-tab raw JSON dumps gated behind isDevMode(state) — uses the project's existing dev-flag helper (devModeGate.js) instead of `window.__utopiaDevApp` which was the plan's literal string but does not exist in this repo. Same isDevMode pattern HUDController/EntityFocusPanel already use (P0 #4).
- [x] Step 5: test/ui/statBar.reset.test.js — 2 tests asserting resetTransientCaches() clears every `_last*` field + the proof that fresh state.metrics returns 0/0/0 (so any persistent stale value must come from a HUD cache).
- [x] Step 6: test/ui/foodRateConsistency.test.js — 3 tests pinning headline = prod-cons-spoil (matches breakdown), the stock-delta fallback path when metrics absent, and the zero-invariant when prod=cons=spoil=0.
- [ ] Step 7: SKIPPED — CHANGELOG.md is docs-track; per implementer spec section 8 ("CHANGELOG.md ... code track 内的 commit 不要顺手碰 CHANGELOG"). Validator / docs-track pass will pick it up.

## Tests
- pre-existing skips: 4 (unchanged from baseline f0ca44d)
- pre-existing failures (unchanged):
  * `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires` — pre-existing, related to food-rate-breakdown test fixture drift (likely shifted by A5's BALANCE retunes).
  * `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role` — pre-existing.
  * `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)` — pre-existing.
  * `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)` — pre-existing.
- new tests added: test/ui/statBar.reset.test.js (2 tests), test/ui/foodRateConsistency.test.js (3 tests). All 5 green.
- failures resolved during iteration: Initial DOM stub lacked `addEventListener`; expanded stub to cover HUDController.setupSpeedControls() before the test could construct an HUDController.
- Net: baseline pass count 1655 → 1656 (one rolled-up sub-test now also passes — likely benefited from cache clearing in resetTransientCaches).

## Deviations from plan
- **Step 4 dev-flag identifier**: plan literally says `if (window.__utopiaDevApp)`. Grep confirmed `__utopiaDevApp` does not exist anywhere in this repo (it was an HW6 reference). Substituted `isDevMode(state)` from `src/app/devModeGate.js` — the canonical project helper used by HUDController / EntityFocusPanel — preserving the semantic intent (gate dev telemetry behind the existing dev-mode signal). Per implementer spec §5: "plan 描述与实际代码对不上...允许小幅调整，但语义必须与 plan 一致".
- **Step 3 wording**: plan asks for "Heat lens OFF." — adopted exactly (was "Heat lens hidden."). The other two strings ("Heat lens ON — red = surplus, blue = starved." / "Heat lens restored.") were already correct.
- **Step 7 (CHANGELOG)**: skipped per code-track boundary — the implementer spec section 8 explicitly says CHANGELOG belongs to docs track. Documented above.
- **Step 2 scope**: plan suggests possibly fixing P1 #5 (Wood "-248.6/min" while constant 35) "as a bonus". Confirmed — the same fix applies to all resources because deriveRate() reads the per-min metrics for whatever the resource is. Wood/Stone/etc. now also report prod-cons accurate rates (with stock-delta fallback when their per-min counters are zero/absent).

## Freeze / Track check 结果
- **Freeze: PASS** — no new TILE / role / building / mood / audio / UI panel introduced. Changes are: (a) one new public method `resetTransientCaches()` on existing HUDController, (b) a new `deriveRate()` closure inside an existing render path, (c) a wrapping conditional in an existing Inspector tab, (d) a 1-string toast wording change, (e) 2 new test files.
- **Track: PASS** — only `src/**` and `test/**` touched. CHANGELOG / README / docs / assignments untouched.

## Handoff to Validator

**Manual smoke (P0 #1)**: dev server → start a run → wait 60s → press End-Run / die → click Try Again → confirm top stat bar reads `Survived 00:00:00 Score 0 Dev --/100` (or 0/100) immediately after the splash fades, and the food/wood rate badges read `= 0.0/min` instead of leaking the previous run's `▼ -562/min` for the first minute. Repeat the cycle twice consecutively to ensure the cache reset is idempotent across multiple Try Agains.

**Manual smoke (P0 #2)**: dev server → wait until food shows non-trivial drain → confirm headline `▼ -X/min` matches the breakdown `(prod +A / cons -B / spoil -C)` arithmetic (A - B - C). The pre-fix 14× disagreement (-562 headline vs -41 breakdown) should be impossible by construction now.

**Manual smoke (P0 #3)**: dev server → press `L` → confirm toast says `Heat lens ON — red = surplus, blue = starved.` AND the heat overlay actually appears AND pressing `L` again toggles it to `Heat lens OFF.`. Cross-check: clicking the sidebar `Heat (L)` button produces an identical toast.

**Manual smoke (P0 #4)**: dev server, default URL (no `?dev=1`) → die → open Inspector → Memory tab → confirm only `Cooldown` / `Sabotage CD` rows are visible, plus a muted hint pointing at Ctrl+Shift+D / `?dev=1`. Then visit `?dev=1` → reload → Memory tab now shows the full 5-`<details>` ladder (blackboard / policy / groupPolicy / memory / debug). Equivalent: keep the URL clean, press Ctrl+Shift+D in the canvas, click on a worker → panels appear.

**FPS regression**: run `browser_evaluate` for a 5-sec average vs the parent commit f0ca44d baseline; this change should be neutral to slightly positive (5 fewer `<details>` rendered per Inspector frame for non-dev users).

**Bench regression**: `scripts/long-horizon-bench.mjs` seed 42 / temperate_plains — DevIndex within ±2 vs parent. No simulation logic changed; only HUD rate display + Inspector gating. Risk surface is essentially zero on the sim side.

**Prod build**: `npx vite build` should succeed with no new warnings; `vite preview` 3-min smoke produces zero console errors and stat bar snaps to fresh-run zeros across two consecutive Try Agains.

**Pre-existing test failures** (unchanged, pre-date this commit at f0ca44d): `ResourceSystem flushes foodProducedPerMin`, `RoleAssignment: with 1 quarry`, `RaidEscalator: DI=30`, `RaidFallbackScheduler: pop < popFloor`. None are caused by this change-set; if validator wants triage these are A5 / earlier balance-retune fallout.
