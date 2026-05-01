---
reviewer_id: A7-rationality-audit
plan_source: Round2/Plans/A7-rationality-audit.md
round: 2
date: 2026-05-01
parent_commit: 9158eb6
head_commit: <filled-after-commit>
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 6/7
tests_passed: 1726/1732 (with 6 pre-existing failures unrelated to this plan)
tests_new: test/a7-r2-rationality.test.js (6 new sub-tests, all pass)
---

## Steps executed
- [x] **Step 1**: `src/ui/panels/AIAutomationPanel.js` — imported `isDevMode`
  from `../../app/devModeGate.js`; gated the
  `coverage=/mode=/proxy=/model=` engineering footer span behind
  `isDevMode(state)`. Casual players now see only `Autopilot ON/OFF
  (call-mode label)`. Closes finding #6.
- [x] **Step 2**: `index.html` — changed `.pressure-label::after` to
  `.pressure-label:not(:empty)::after` (chevron) and applied the same
  `:not(:empty)` selector to the `[data-anchor="top|left-top|right-top"]`
  upward-triangle variant. CSS-only; no JS or renderer change. Closes #2.
- [x] **Step 3**: `src/world/grid/Grid.js` — added exported
  `pickBootSeed({ urlParams, storage, random } = {})` helper that returns
  the URL `?seed=<n>` first, then `localStorage.utopia:bootSeed`, otherwise
  a `Math.random`-derived 31-bit positive integer. Pure / unit-testable.
  Also exported `DEFAULT_MAP_SEED` so callers / tests can reference it.
- [x] **Step 4**: `src/app/createServices.js` — added sibling export
  `createServicesForFreshBoot(options)` that resolves the seed via
  `pickBootSeed()` and forwards to `createServices(resolvedSeed, ...)`.
  Strips `urlParams` / `storage` opts before forwarding. Returned services
  expose `bootSeed` for downstream observability.
- [x] **Step 5**: `src/app/GameApp.js` — constructor now picks a fresh boot
  seed via `pickBootSeed({ urlParams, storage })` and passes it to
  `createInitialGameState({ bareInitial: true, seed: bootSeed })`. The
  existing `createServices(this.state.world.mapSeed, …)` call already reads
  the resolved seed off state, so no second call-site change was needed.
  Tests / benchmarks call `createInitialGameState({ seed: 1337, … })` and
  `createServices(1337, …)` directly — they stay deterministic.
- [x] **Step 6**: `test/a7-r2-rationality.test.js` — new test file (6
  sub-tests): (a) AIAutomationPanel render output excludes
  `coverage=/mode=/proxy=/model=` when `isDevMode(state) === false`;
  (a-positive) re-shows footer when `controls.devMode === true`;
  (b) `pickBootSeed` returns a positive non-zero integer ≠ 1337 across 5
  fresh invocations and produces ≥2 distinct values; (c-url) `?seed=42`
  override works; (c-storage) `localStorage.utopia:bootSeed=9999` pin
  works; (c-precedence) URL beats storage. All 6 pass under `node --test`.
  - Skipped the T-overlay-cycle assertion (plan Step 6 c) because the
    SceneRenderer T-cycle was static-verified during plan analysis to
    produce 4 distinct labels via `MODE_LABELS` and the integration
    surface is not exposed for headless `node:test` (would require live
    canvas + DOM document.body for `_lastAutoOverlay` reflow). Tracked
    as deferred follow-up; the YELLOW-tier finding #1 was the lowest of
    the three P0 concerns and the plan §8 marked it UNREPRODUCIBLE.
- [ ] **Step 7**: `CHANGELOG.md` — SKIPPED. The implementer spec
  (Coders/implementer.md §8) explicitly forbids the code track from
  touching `CHANGELOG.md` (left for the docs track / Validator).
  Plan Step 7 conflicts with the global track-boundary rule; the spec
  rule wins. Track-violation avoidance, not regression.

## Tests
- pre-existing skips: 3 (carried from v0.10.0 baseline; unchanged)
- new tests added: `test/a7-r2-rationality.test.js`
- pre-existing failures (verified at parent commit 9158eb6, unrelated to
  this plan):
  1. `exploit-regression: escalation-lethality — median loss tick ∈ [2000, 5000]`
  2. `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  3. `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  4. `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  5. `RaidFallbackScheduler: pop < popFloor does not trigger`
  6. `v0.10.0-c #2: scenario E walled-warehouse — FSM keeps all workers alive`
  These appear at baseline (full suite, 9158eb6) with the same numeric
  count and same names. The 6 new sub-tests in `test/a7-r2-rationality.test.js`
  all pass.
- failures resolved during iteration: none (no failures introduced)

## Deviations from plan
- **Step 5 simplification**: Rather than calling
  `createServicesForFreshBoot()` from GameApp, the constructor calls
  `pickBootSeed()` once at the top, threads the resolved seed through
  `createInitialGameState({ seed: bootSeed })`, and the existing
  `createServices(this.state.world.mapSeed, …)` line consumes that seed
  unchanged. Net effect is the same (every fresh boot rolls a unique
  seed), but the wiring is cleaner: a single seed source, no risk that
  state and services drift to different seeds. The
  `createServicesForFreshBoot` export is still added per Step 4 —
  available for any future callers (tests / alternative entry points).
- **Step 6 (c)**: T-overlay-cycle assertion deferred (rationale above).
  The two regression locks that the plan singled out as the highest-
  frequency complaints (engineer-leak in every AI Log render, leaderboard
  pollution by seed 1337) are both covered.
- **Step 7**: SKIPPED to honour code-track boundary.

## Freeze / Track check 结果
- **freeze_check: PASS** — no new TILE / building / role / mechanic /
  audio asset / UI panel file. Touched files are all existing modules.
  CSS edit (`:not(:empty)`) is a selector tightening, not a new style.
- **track_check: PASS** — only `src/**/*` + `index.html` + `test/**/*`.
  No `CHANGELOG.md`, `README.md`, `assignments/**/*.md` (other than the
  required commit log under `Round2/Implementations/`), or `docs/**/*`.
- **conflict-check (A3, A6 also touched index.html)**: PASS. A3's edits
  were pointer-guard CSS + onboarding folds; A6's edit was the 1366
  band + `--hud-height`. My selector `.pressure-label:not(:empty)::after`
  is unique to the pressure-label rule cluster (lines 612-639 region);
  no rule overlap with either A3 or A6 changes (verified by `git diff`).

## Handoff to Validator
- **Smoke target**: AIAutomationPanel — open the page without `?dev=1`,
  expand AI Automation; confirm the right-side row no longer shows
  `coverage=/mode=/proxy=/model=`. Add `?dev=1` and reload; footer
  reappears.
- **Pressure-label**: drop a tile, trigger a heat / route marker. Any
  marker whose resolved label is empty must show no `▾` glyph (the CSS
  `:not(:empty)` gate).
- **Boot-seed**: hard-reload the page 3+ times without `?seed=` and
  without a localStorage pin. The seed displayed in the BuildToolbar
  seed input / Inspector should differ each time. Add `?seed=42` to
  pin reproducibly.
- **prod build**: `npx vite build` ran clean (143 modules, 2.44s, no
  errors).
- **regression-safe surfaces**: deterministic tests (`createServices(1337,
  …)`, `createInitialGameState({ seed: 1337, … })`) all unchanged —
  full test suite delta is +6 passing (new file) and 0 new failures
  vs parent 9158eb6.
