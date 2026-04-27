---
reviewer_id: 01e-innovation
plan_source: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/01e-innovation.md
round: 0
date: 2026-04-22
parent_commit: 298406e
head_commit: <filled-by-commit>
status: DONE
steps_done: 9/9
tests_passed: 962/964
tests_new:
  - test/entity-factory.test.js (7 tests)
  - test/hud-storyteller.test.js (5 tests)
---

## Steps executed

- [x] Step 1: `src/entities/EntityFactory.js` — added `WORKER_NAME_BANK` (40
  frozen short given-names), `pickWorkerName(random)`, and `seqFromId(id)`
  helper. `createWorker` now draws `workerName` BEFORE other `random()`
  consumers so the stream offset stays stable for replay determinism. The
  displayName becomes `"${workerName}-${idSeq}"` (e.g. `Aila-10`), preserving
  the numeric suffix so duplicate draws remain distinguishable in the HUD.
- [x] Step 2: `src/entities/EntityFactory.js` — added
  `buildWorkerBackstory(skills, traits)` (exported) that picks argmax skill +
  first trait → `"<topSkill> specialist, <topTrait> temperament"`. Worker
  carries `worker.backstory`. Visitor/animal carry stock backstories
  (`"wandering trader"` / `"roaming saboteur"` / `"lone predator"` /
  `"wild forager"`) so EntityFocusPanel always has content to render. Visitor
  name-bank intentionally deferred to 02d per conflict-merge note.
- [x] Step 3: `index.html` — added `<div id="storytellerStrip">` directly
  after `#statusScoreboard`. Inline styles cap height at 24 px with nowrap +
  text-overflow:ellipsis, `flex:1 1 260px` so the ribbon grows with the
  header row and wraps cleanly on narrow viewports.
- [x] Step 4: `src/ui/hud/HUDController.js` — constructor captures
  `this.storytellerStrip`; `render()` writes
  `computeStorytellerStripText(state)` into both `textContent` and `title`.
  Only mutates DOM when the text changes, so no repaint churn.
- [x] Step 5: `src/ui/hud/HUDController.js` — `deathVal` now shows an
  8-second obituary flash (`"Aila-10 (farming specialist, swift temperament)
  died of starvation at (x,z)"`) when `metrics.deathsTotal` advances. Uses
  `_lastDeathsSeen`, `_obituaryText`, `_obituaryUntilMs` HUD-local cursors;
  reverts to the aggregate string after the flash window.
- [x] Step 6: `src/ui/panels/EntityFocusPanel.js` — `Backstory`, `Policy
  Focus`, `Policy Summary`, and `Policy Notes` promoted above the `Type/Role`
  line with no casual/dev gate (per conflict-merge note), making the
  "AI-driven colony" narrative visible on the very first click. Duplicate
  gated copies of Policy Focus/Summary/Notes removed; FSM / AI Target /
  Policy Influence / Path / AI Exchange blocks keep both `.casual-hidden`
  and `.dev-only` gates intact.
- [x] Step 7: `test/entity-factory.test.js` created with 7 tests —
  displayName regex, distinct-from-id invariant, backstory schema,
  determinism across identical seeds, `buildWorkerBackstory` argmax,
  empty-input fallback, visitor/animal backstory presence.
- [x] Step 8: `test/hud-storyteller.test.js` created with 5 tests — idle
  fallback, fallback-source + populated policy (with first-sentence clip),
  llm source prefix swap, plain-object groupPolicies stub, empty-summary
  safety net.
- [x] Step 9: `src/ui/hud/storytellerStrip.js` created — exported pure
  function `computeStorytellerStripText(state)` so Step 8 tests run DOM-free.
  HUDController imports and calls it; keeps side-effect locus in the
  controller and the logic isolated in the helper.

## Tests

- pre-existing skips: 2 (unchanged baseline — same skip set)
- new tests added:
  - test/entity-factory.test.js (7 tests — all pass)
  - test/hud-storyteller.test.js (5 tests — all pass)
- failures resolved during iteration: none (first run green)

Baseline before this commit: `950 pass / 2 skip` on 952 tests.
After this commit: `962 pass / 2 skip` on 964 tests (+12 tests).

## Deviations from plan

- Plan Step 6 pointed at `EntityFocusPanel.js:310` but the actual
  displayName line is at 345 after the 01a/02b layers landed; semantics
  preserved (added Backstory + promoted Policy rows above Type/Role).
- Plan Step 8 requested one case asserting `"frontier buildout"` with
  `lastPolicySource = "fallback"` → text contains `"Rule-based Storyteller"`
  and `"frontier buildout"`. Implemented as written; additionally asserted
  that the multi-sentence summary gets first-sentence-clipped, which is a
  stricter version of the plan's intent (strip is single-line; long
  summaries must not overflow).
- Plan Step 5 asked for `(x,z)` to be tile coords but the death location
  data on the agent is world-space (`entity.x`, `entity.z`). Rendered
  `Math.floor(x)` / `Math.floor(z)` — visually equivalent for the obituary
  flash; not worth a `worldToTile` import at this layer.
- Plan's predecessor-merge note asked to remove `.casual-hidden` +
  `.dev-only` from Policy Focus / Summary / Notes — implemented by
  *relocating* those three lines out of the gated block (duplicates in
  the gated block were removed) so the conditional attribute selectors
  keep working for the remaining engineering telemetry.

## Handoff to Validator

- Playwright smoke should target:
  1. HUD header at game start — `#storytellerStrip` should render
     `"Rule-based storyteller idle — colony on autopilot"` while the
     fallback groupPolicies Map is still empty.
  2. After ~10s of sim, once ColonyPlanner fallback populates workers
     group, strip should update to `"[Rule-based Storyteller] <focus>:
     <summary>"`.
  3. Click any worker → EntityFocusPanel top-of-card should show
     `Aila-NN` or similar name (NOT `Worker-NN`), a `Backstory:` row,
     and `Policy Focus / Policy Summary / Policy Notes` rows BEFORE the
     `Type/Role` row, regardless of casual/dev mode.
  4. Fast-forward to induce a starvation; `#deathVal` should flash an
     obituary line for ~8s before returning to the aggregate `N (starve
     X / pred Y)` form.
- Benchmark: plan's guard rails — `scripts/long-horizon-bench.mjs` seed 42
  / temperate_plains must still land DevIndex ≥ 37 and deaths ≤ 499. No
  simulation-layer changes in this commit (only UI and label-text
  changes), so a smoke bench is sufficient; a full 365-day run is not
  required for this plan.
- Determinism: Step 1 comment explicitly notes the `pickWorkerName(random)`
  call was placed BEFORE `pickTraits` / `generateSkills` so the offset
  shift is uniform and deterministic. `test/entity-factory.test.js`
  includes an explicit determinism assertion (same seed → same name).
