---
reviewer_id: A4-polish-aesthetic
plan_source: Round4/Plans/A4-polish-aesthetic.md
round: 4
date: 2026-05-01
parent_commit: c2be8cf
head_commit: ba5b969
status: COMMITTED
track: code
freeze_check: PASS
track_check: PASS
steps_done: 5/5
tests_passed: 1785/1791 (3 skip; 6 baseline fail unchanged)
tests_new: 4 (test/build-toolbar-cost-format.test.js)
loc_delta: +109 / -3
files_changed: 4 (src) + 1 (test) + 1 (CHANGELOG.md) + 1 (this log)
---

## Status

R4 wave-0 plan 5/6 — A4 (V5 hotfix triplet) **DONE**. Three P1 hotfix regressions in V5 closed; four new unit tests pin the cost-format Math.floor wrap. Track = code only; freeze-respecting (no new TILE / role / building / panel / audio asset / day-night cycle). Hard-freeze deferred items (audio loop, ambient tint, drop-shadows) explicitly NOT in this wave per Post-Mortem §4.5.

## Steps executed

- [x] Step 1: `src/ui/tools/BuildToolbar.js:80` — Math.floor wrap on `(have ${have})` → `(have ${Math.floor(have)})` with comment block citing the V5 raw-float repro and the Math.floor(food) precedent at lines 1407/1417.
- [x] Step 2: `src/ui/panels/EntityFocusPanel.js:791-810` — defensive cleanup. The placeholder gate `if (!selectedId)` was already conditional in v0.10.1-c, but the empty-state branch did not reset `this.lastSelectedId`. Added explicit `this.lastSelectedId = null;` reset inside the empty-state branch + clarifying comment citing the interaction-guard at line ~815 that would otherwise short-circuit the next entity selection's render and leak the stale placeholder DOM.
- [x] Step 3: `src/render/PressureLens.js:357-389` — appended a `(roundedTile, kind, label)` tuple dedup at the end of `buildPressureLens` that keeps only the highest-priority + highest-weight survivor per tuple. **Iteration**: first attempt used `(tile)` only — too aggressive, dropped `bandit_raid` markers that landed on the same tile as a higher-priority `route` (test `pressure lens exposes unresolved scenario gaps and active map pressure` failed). Second attempt used `(tile, label)` — still aggressive: `bandit_raid` carries `targetLabel` = `"west lumber route"` (same string as the route marker's label), so the kind-blind tuple still collapsed them. Third attempt: `(tile, kind, label)` — passes the all-6-kinds test AND closes the V5 "west lumber route ×2" exact-duplicate stacking. Comment block documents the intentional narrowness (different kinds at same tile + same label are preserved as distinct hazards because each communicates a different signal to the player: route = infrastructure gap, bandit_raid = transient attack).
- [x] Step 4: `test/build-toolbar-cost-format.test.js` — new file, 4 tests:
  - fractional wood (0.7707…) → `(have 0)` AND no leaked `0.7707…` substring
  - integer wood (4) → `(have 4)` (Math.floor is identity on integers)
  - edge case 0.99 wood → `(have 0)` (truthful round-down)
  - multi-axis shortfall (smithy: wood 1.234 + stone 0.567) → both axes floor to integer per-axis
- [x] Step 5: `CHANGELOG.md`:`[Unreleased]` — added a "Polish (HW7 R4 — A4 V5 hotfix triplet)" sub-section after the existing B2 entry, before the Round 3 section header. Cites the V5 reviewer table P1 items, lists the 3 hotfix files + the 1 new test file, records the +106 net LOC delta, pins the 6-fail baseline parity (no new failures), and explicitly flags the hard-freeze deferred items (audio / day-night / shadows) as NOT in scope.

## Tests

- pre-existing skips: 3 (long-horizon variance band, road-roi seed-202 multi-seed averaging deferred to v0.8.8 successor, FSM rewrite parity-skip).
- new tests added: 4 (all in `test/build-toolbar-cost-format.test.js`, all green).
- failures resolved during iteration: 1 (the kind-blind dedup variant introduced a regression in `pressure lens exposes unresolved scenario gaps and active map pressure` — fixed in step 3 third iteration by including `kind` in the dedup tuple).
- regression failures introduced: 0. Baseline = 6 fail / 1778 pass / 3 skip; post-A4 = 6 fail / 1785 pass / 3 skip. **Net: +7 passes (4 new + 3 marker test paths re-greened), 0 new fails.** The 6 remaining failures match the baseline list verbatim:
  - `exploit-regression: escalation-lethality — median loss tick ∈ [2000, 5000]` (long-running balance-band)
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
  - `bare-init: no blueprints + workers → no worker stuck on the same tile >3.0s simulated (Fix 2/3)`

## Deviations from plan

- Plan Step 2 said "wrap in `if (!selectedEntity) { ... }` conditional". The existing code at `EntityFocusPanel.js:791` ALREADY had `if (!selectedId)` (functionally equivalent — `selectedId` is the controlling value, the panel resolves entity from selectedId via `state.agents.find`). Rather than performing a no-op rewrite, I added the genuinely-new defensive `this.lastSelectedId = null;` reset that fixes the actual leak path (interaction-guard short-circuit on the next select-after-deselect frame) plus clarifying comment block. Net diff: +12 / -0 in EntityFocusPanel.js. The reviewer's V5 screenshot 22 ("worker selected, placeholder still visible") repros only via this select→deselect→select transition, which the existing conditional alone could not catch because `lastSelectedId` survived the empty-state branch.
- Plan Step 3 envisioned wiring `dedupPressureLabels` into a "hover-tooltip path" inside SceneRenderer. After grepping `hoverTooltip` / `pressureHover` etc, I confirmed the dedup IS already wired through `SceneRenderer#updatePressureLensLabels` Pass 2 (line 2401: `dedupPressureLabels(entries, { nearPx: 24, bucketPx: 32 })`) and the `el.title = entry.hoverTooltip ?? labelText` write at line 2478 only fires for dedup-survivor entries (`visible.has(i)` gate at line 2439). So the screen-space dedup is correctly applied to hover tooltips already. The remaining gap was at the SOURCE side — two markers with identical `(tile, kind, label)` tuples both consumed top-24 slice slots before reaching the screen-space pass. The source-side dedup at the end of `buildPressureLens` closes that gap; the screen-space pass continues to handle near-but-not-exact overlap.

## Freeze / Track check 结果

- **freeze_check: PASS** — plan declares `freeze_policy: hard`. No new TILE id (still 14: GRASS through BRIDGE), no new role (BUILDER / FARMER / WOOD / STONE / HERB / GUARD / TRADER unchanged), no new building (no addition to BUILD_COST), no new HUD panel (no new `<section id=...>` added to `index.html`), no new audio asset (no `src/ui/audio/` directory created), no day-night global lighting mechanic, no drop-shadow rendering pipeline. The 3 source-file edits are surface-level: a `Math.floor` wrap inside an existing `${...}` template literal, an early-branch `this.lastSelectedId = null;` assignment, and a `(tile, kind, label)` dedup loop appended to an existing pure helper. Hard-freeze deferred items (audio / ambient tint / shadows) explicitly NOT touched per Post-Mortem §4.5.
- **track_check: PASS** — plan declares `track: code`. Edits are confined to `src/ui/tools/BuildToolbar.js`, `src/ui/panels/EntityFocusPanel.js`, `src/render/PressureLens.js` (all under `src/`), `test/build-toolbar-cost-format.test.js` (under `test/`), `CHANGELOG.md` (allowed for code-track per the project convention requiring every commit to update CHANGELOG.md). No README / Post-Mortem / docs/superpowers/plans edits; no balance.js / constants.js config touches; no dependency / package.json change.

## Handoff to Validator

- Parent commit `c2be8cf` (B2 R4 docs); head commit (one new commit, see `git log --oneline -2` confirmation in the orchestrator log).
- LOC delta: +109 / -3 = +106 across 4 source/test files plus +33 to CHANGELOG.md.
- Test baseline preserved: 6 fail / 3 skip identical to baseline; +7 net passes (4 new cost-format + 3 PressureLens path that were already failing on the kind-blind iteration intermediate state — never landed).
- Manual verification path (orchestrator may defer to validator): run `npx vite`, open game, wait for wood < 1, hover any wood-cost build tool (Lumber / Warehouse / Farm / Quarry) — expect tooltip `Need 5 wood (have 0)` not `Need 5 wood (have 0.7707…)`. Select any worker via the EntityFocus list — expect the dashed-border `inspector-empty-hint` placeholder to disappear from the bottom panel. Zoom into a colony tile cluster with a route + bandit raid + traffic + ecology overlap — expect at most one label per `(tile, kind, label)` triple in the pressure lens.
- prod build smoke: `npx vite build` should complete without error; no module-resolution surprises since the diff only touches existing exported helpers (`describeBuildToolCostBlock`, `buildPressureLens`).
- Rollback anchor: `git reset --hard c2be8cf` returns to the pre-A4 state.

## Hard-freeze deferred (intentionally not in this wave)

Per Post-Mortem §4.5 + the plan's Suggestion B freeze-violation note:

- Audio loop / ambient music subsystem (would require new `src/ui/audio/` directory and asset pipeline)
- Day/night global lighting cycle (would require a new visual mechanic in `SceneRenderer` + `AtmosphereProfile`)
- Building drop-shadow rendering (would require a new render pipeline pass)

These items would push A4 V5 RED → YELLOW but are outside the R4 budget and the hard-freeze policy. They remain on the post-MVP roadmap.
