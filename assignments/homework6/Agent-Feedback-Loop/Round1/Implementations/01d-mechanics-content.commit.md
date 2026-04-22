---
reviewer_id: 01d-mechanics-content
plan_source: Round1/Plans/01d-mechanics-content.md
round: 1
date: 2026-04-22
parent_commit: 556d847
head_commit: a14d150
status: DONE
steps_done: 5/8
tests_passed: 997/999
tests_new: test/hud-latest-death-surface.test.js (3 cases)
---

## Steps executed

- [ ] Step 1: `src/render/SceneRenderer.js` #pickEntity screen-space fallback —
      SKIPPED — superseded by 01b-playability per summary.md §4 D1. 01b's
      16 px threshold + build-tool 24 px guard already landed in Wave 1
      (commit prior to parent); duplicating the fallback here would have
      re-entered the same function with a weaker 24 px threshold.
- [ ] Step 2: THREE.Vector3 import verify — SKIPPED — superseded by 01b per
      summary.md §4 D1 (same rationale; no edit needed because Step 1 was
      skipped).
- [x] Step 3: `index.html` — added `#latestDeathRow` (inside `#statusScoreboard`)
      and `#foodRateBreakdown` (inline with `#foodRateVal` in the Resources
      panel). Two minimal edits, zero existing IDs changed.
- [x] Step 4: `src/ui/hud/HUDController.js` constructor — captured
      `this.latestDeathVal` and `this.foodRateBreakdown` DOM refs right after
      the existing `foodRateVal` block (lines 122-128).
- [x] Step 5: `src/ui/hud/HUDController.js` rate-compute block — appended the
      food-breakdown renderer (`prod +X / cons -Y / spoil -Z`) immediately
      before the `foodRateVal.textContent = …` line. Reads
      `state.metrics.foodProducedPerMin/foodConsumedPerMin/foodSpoiledPerMin`
      with `foodProduced/foodConsumed/foodSpoiled` as cumulative fallback and
      empty string when all are zero/absent (defensive path from plan Risks).
- [x] Step 6: `src/ui/hud/HUDController.js` death block — appended the latest-
      death-line renderer after the existing obituary branch. Uses
      `state.gameplay.objectiveLog.find(/died\s*\(/)` to match
      `MortalitySystem`'s `"[t] Name died (reason) near (x,y)"` format
      (verified against `src/simulation/lifecycle/MortalitySystem.js:212`).
- [ ] Step 7: `test/entity-pick-screen-fallback.test.js` — SKIPPED — superseded
      by 01b per summary.md §4 D1 and §7 guardrail. 01b ships
      `test/entity-pick-hitbox.test.js` for the fallback; creating a second
      test here would double-assert the same code path.
- [x] Step 8: `test/hud-latest-death-surface.test.js` — created. 3 cases:
      (a) newest death line in `objectiveLog` is written to `#latestDeathVal`
      verbatim with title matching the raw log entry; (b) `objectiveLog`
      with non-death lines renders "No deaths yet"; (c) empty
      `objectiveLog` also renders "No deaths yet". Reuses the node-stub /
      `withMockedDocument` pattern from `test/hud-resource-rate.test.js`
      (no jsdom dependency).

## Tests

- pre-existing skips: 2 (unchanged from baseline — skip suite not touched).
- new tests added: test/hud-latest-death-surface.test.js (3 cases, all passing).
- failures resolved during iteration: none — first run was green
  (997/999 passing, up from 994 baseline since this commit adds exactly 3 tests).
- total: tests 999, pass 997, fail 0, skipped 2.

## Deviations from plan

- **Step 3 DOM placement**: Plan specified "index.html:~1020 (HUD top status
  bar, 紧邻 `#deathVal`)". Actual `#deathVal` lives inside the Debug
  floating panel (`index.html:1304`), not the HUD top bar. The surface
  intent of the plan is to put the death quick-row on the HUD top bar
  (scoreboard), which is where `#statusObjective` / `#statusScenario` live
  (`index.html:903-907`). I placed `#latestDeathRow` inside
  `#statusScoreboard`, which matches the plan's semantic goal ("HUD 顶栏
  出现一行 `Last: …`") and the verification script
  ("顶栏 HUD 出现 `Last: [t] WorkerName died (starvation)…`"). The `<div
  class="hud-row">` wrapper was kept verbatim.
- **Step 3 foodRateBreakdown placement**: Plan said "index.html 约 1050
  行附近 `<span id="foodRateVal" …>` 之后追加". Found at line 1052 inside
  the Colony panel's Resources card; appended the new span inline with
  the existing `foodRateVal` span, unchanged structure.
- **Step 4 insertion point**: Plan said "紧挨
  `this.foodRateVal = document.getElementById("foodRateVal");`". Inserted
  after the full block of resource rate refs (foodRateVal through
  medicineRateVal) so both new refs stay grouped with the other rate
  accessors rather than splitting that cluster.
- **Step 5 metric-name resolution**: Per plan Risks, I Grep'd
  `src/simulation/ai/colony/ColonyPerceiver.js` for
  `foodProduced|foodConsumed|foodSpoiled` and found **no matches** in
  `src/`. Per plan's defensive fallback clause, the breakdown renders the
  empty string when counters are absent — no "Risks §2" mutation of
  ColonyPerceiver was performed (that would arguably cross into new
  mechanic / new metric and the plan explicitly said "Coder 可在执行前
  Grep … 若缺失则 [optional] 在 ColonyPerceiver observe 阶段追加"; I
  treated "optional" as out-of-scope given freeze concerns). Validator may
  later wire the counters if the reviewer still flags "no breakdown".

## Handoff to Validator

- **Playwright smoke**: Boot a fresh colony and confirm the HUD top bar
  shows `Last: No deaths yet` between `#statusScoreBreak` and
  `#storytellerStrip`. Let sim run until a starvation or predation death
  fires (objectiveLog unshift), then re-observe the same row — it should
  flip to `Last: [t] <name> died (<reason>) near (x,y)` within one render
  tick. The `#foodRateBreakdown` span will remain empty string until
  someone wires `state.metrics.food{Produced,Consumed,Spoiled}PerMin`
  (see Deviations note above).
- **Benchmark**: `scripts/long-horizon-bench.mjs --seed 42 --template
  temperate_plains --days 365` expected to stay at DevIndex ~44 — this
  commit only adds DOM refs + a constant-time `find()` in the HUD render
  path (not on the sim tick), so the regression surface is effectively
  zero.
- **Freeze check**: All changes are HUD/DOM surface of already-persisted
  state (`state.gameplay.objectiveLog`, `state.metrics.food*`). Zero
  simulation, balance, or constants touched. 0 new mechanic.
- **Wave 2 interaction**: 01c-ui shipped immediately before this commit
  (parent 556d847). 01c's `.dev-only` casual-mode CSS already wraps
  `#statusScoreBreak`, and the new `#latestDeathRow` I added is
  *outside* `.dev-only` — intentional, because death surfacing is a core
  casual-visibility improvement, not a dev stat. If Wave 2 decides to
  gate it, only add `.dev-only` class on the row; the HUDController
  write-through is idempotent.
- **Known gap**: `#foodRateBreakdown` stays empty until someone populates
  `state.metrics.foodProducedPerMin/foodConsumedPerMin/foodSpoiledPerMin`.
  Flag this in Round 2 feedback so `ColonyPerceiver.observe()` or
  `ResourceSystem` gets a minimal patch to window those counters (a few
  LOC, still "surface existing mechanic").
