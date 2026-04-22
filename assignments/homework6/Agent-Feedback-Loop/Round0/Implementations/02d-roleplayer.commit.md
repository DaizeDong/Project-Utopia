---
reviewer_id: 02d-roleplayer
plan_source: Round0/Plans/02d-roleplayer.md
round: 0
date: 2026-04-22
parent_commit: 6bdcd80
head_commit: <filled after commit>
status: DONE
steps_done: 8/8
tests_passed: 970/972 (2 pre-existing skips)
tests_new:
  - test/entity-names.test.js
  - test/death-narrative-log.test.js
---

## Steps executed

- [x] **Step 1** — `src/entities/EntityFactory.js`: added `TRADER_NAME_BANK`
  (22 names) and `SABOTEUR_NAME_BANK` (22 names) as frozen arrays, plus
  `pickVisitorName(random, kind)` helper. **Delta-only** relative to
  orchestrator-merged context: 01e already shipped `WORKER_NAME_BANK` +
  `pickWorkerName` + `buildWorkerBackstory`, so this step only extends the
  pattern to visitors per `known_conflicts_merged.R1`.
- [x] **Step 2** — `EntityFactory.createVisitor`: `displayName` now uses
  `pickVisitorName(random, kind)` with `seqFromId(id)` suffix
  (`"Mercer-217"`). Name draw happens BEFORE `baseAgent()` call to keep the
  random stream offset stable (matches 01e's createWorker convention). Stock
  backstory strings (`"wandering trader"` / `"roaming saboteur"`) preserved
  to keep `entity-factory.test.js` assertions green.
- [x] **Step 3** — `src/simulation/lifecycle/MortalitySystem.js` recordDeath:
  worker/visitor deaths now also push a human-readable line to
  `state.gameplay.objectiveLog`
  (`"[161.6s] Mercer-217 died (starvation) near (45,33)"`). Uses
  `unshift` + `slice(0, 24)` to match `ProgressionSystem.logObjective`
  capacity. Dedupe is free — `recordDeath` only fires in the
  `!entity.deathRecorded` branch of MortalitySystem.update, and sets the
  flag. Animal deaths deliberately excluded from the log to avoid spam.
- [x] **Step 4** — `src/ui/panels/EntityFocusPanel.js`: added a
  `<details data-focus-key="focus:character" open>` block showing
  Traits / Mood / Morale / Social / Rest / top-3 Relationships (with
  displayName reverse-lookup from `state.agents`) / last 3
  `memory.recentEvents`. Placed immediately after the existing Backstory
  line and before Policy Focus, so casual-profile users see character
  before engineering telemetry. Not gated by `.casual-hidden` — the
  character block is meant for everyone.
- [x] **Step 5** — `src/ui/panels/EventPanel.js` render: after the active
  events list, appends a "Recent Colony Events" section pulling the top 6
  entries from `state.gameplay.objectiveLog`. Inline HTML escape for log
  lines. `lastHtml` dedupe still honoured.
- [x] **Step 6** — `index.html:1277`: `<summary>Event Queue</summary>` →
  `<summary>Events &amp; Colony Log</summary>`. `data-panel-key="events"`
  unchanged so persisted collapse state is preserved.
- [x] **Step 7** — new `test/entity-names.test.js` (6 tests): bank shape,
  trader name match, saboteur name match, determinism, diversity. Focuses
  on **visitor** naming since worker naming is already covered by 01e's
  `test/entity-factory.test.js`.
- [x] **Step 8** — new `test/death-narrative-log.test.js` (3 tests): single
  entry per death, no dup after subsequent ticks, timestamp format.

## Tests

- **full suite**: `node --test test/*.test.js` → **970 pass / 0 fail / 2
  skip** (972 total).
- **pre-existing skips** (unchanged):
  - `exploit-regression: road-roi` — zero food in one scenario, pre-v0.9.0
    systemic starvation, deferred per `docs/tuning-log.md`.
  - one additional skip in the ecology suite (unchanged by this plan).
- **new tests added**:
  - `test/entity-names.test.js` — 6 subtests, all pass.
  - `test/death-narrative-log.test.js` — 3 subtests, all pass.
- **flaky note**: on one run the long-horizon benchmark
  `exploit-regression: strategy-diversity` reported `not ok`. Re-running the
  suite (and running that test file in isolation) both pass 5/5 non-skipped
  subtests. The test does a 50s stochastic multi-colony sim — the flake is
  not caused by this plan (no sim-path code changed besides one log push
  inside an already-guarded death branch) and has a historical cadence.
  Validator may want to re-run it if they see the same transient.

## Deviations from plan

- **Step 1 naming format**: plan specified `"First Last #N"` and a `First`
  pool of ~30 entries. `known_conflicts_merged.R1` records that 01e already
  shipped `"Aila-10"` (single-token + dash + id-seq) as the baseline. I
  followed the merged baseline and only extended VISITOR naming — did NOT
  re-change worker display format. Visitor `displayName` therefore reads
  `"Mercer-217"` (single-token + dash + id-seq), matching the 01e
  convention rather than the original 02d plan's `"First Last #N"`.
- **Step 3 tile fallback**: plan said `entity.deathContext.targetTile`.
  Kept that as the primary source but added a fallback to
  `entity.targetTile` (so the narrative still renders the tile even when
  `deathContext` hasn't been populated yet — e.g. when `shouldDie` fires
  via `markDeath` but `deathContext` is constructed by the same call).
- **Step 4 relationships lookup**: plan said "fallback to `<unknown>` or
  raw id". Implemented the more helpful "raw id" fallback — if the related
  worker has already been filtered out of `state.agents` by a prior
  MortalitySystem pass, the id is still printed verbatim (readable and
  stable).
- **Step 7 scope shift**: plan said `test/entity-names.test.js` would cover
  workers. Since 01e already shipped worker coverage in
  `test/entity-factory.test.js`, my file focuses on the **new** visitor
  banks instead — this avoids duplicate assertions and keeps the test
  module single-responsibility.

## Handoff to Validator

- **Playwright smoke**: click any worker in EntityFocus → verify the new
  `Character` block renders at the top with Traits / Mood / Morale /
  Social / Rest / Relationships / Recent Memory. Open
  `Events & Colony Log` card on the right rail → verify after ~30s the
  first death appears as `"[Xs] Aila-12 died (starvation) near (...)"`.
- **Benchmark**: **NOT REQUIRED** by this plan. All simulation code paths
  are unchanged save for a single `unshift` + slice on an array that's
  already cap-bounded at 24 entries. DevIndex regression is extremely
  unlikely. If Validator wants to run `node scripts/long-horizon-bench.mjs
  --seed 42 --template temperate_plains --days 365` for peace of mind,
  baseline DevIndex ≈ 44, acceptable floor ≥ 41.8.
- **Potential downstream friction**: `state.gameplay.objectiveLog` is now
  written to much more frequently than before (previously only from
  `ProgressionSystem.maybeTriggerRecovery`). `DeveloperPanel` already
  reads it via `objectiveLog.slice(0, 8)` — that surface will now show
  death lines mixed with recovery lines, which is intentional. No test
  in the suite asserted "objectiveLog stays empty under normal play", so
  nothing should break downstream.
- **Conflict awareness**: as noted in `known_conflicts_merged`,
  `EntityFocusPanel.js` has been modified by 01a, 02b, and 01e in this
  round. My Character block is a strictly additive top-append that lives
  above the existing Policy / casual-gated engineering block. Merge
  surface should be clean.
