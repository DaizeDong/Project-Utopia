---
reviewer_id: A7-rationality-audit
plan_source: Round1/Plans/A7-rationality-audit.md
round: 1
date: 2026-05-01
parent_commit: 34da583
head_commit: 2b96618
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 8/9
tests_passed: 1727/1735
tests_new: test/ui/foodDiagnosis-non-worker.test.js, test/ui/entityFocusList-visitor-role.test.js
---

## Steps executed

- [x] Step 1: index.html lens-legend "yellow ring" -> "cyan ring" (border-color #71d9ff). Label finally matches inline color.
- [x] Step 2: index.html lens-legend "purple ring" -> "light-blue ring" (border-color #72b9ff).
- [x] Step 3: src/ui/panels/EntityFocusPanel.js buildFoodDiagnosis early-return for entity.type === "ANIMAL" or "VISITOR". Returns severity:"ok" with a kind-aware cause string instead of falling through to worker-only feasibility logic.
- [x] Step 4: src/ui/panels/EntityFocusPanel.js #renderWorkerList — non-WORKER rows with no role now render `(saboteur)`/`(trader)`/`(predator)`/`(herbivore)` lower-cased instead of bare "-". WORKER rows with role="FARM" etc. unchanged (regression lock guarded by `hasRole`).
- [x] Step 5: src/ui/hud/HUDController.js — `statusObjectiveTime.textContent` chip "Survived HH:MM:SS" -> "Run HH:MM:SS". The legacy combined `statusObjective.textContent` fallback (line ~1647) still uses "Survived ...", keeping test/hud-menu-phase.test.js green.
- [x] Step 6: index.html `#statusObjectiveTime` placeholder "Survived --:--:--" -> "Run --:--:--". Hover `title="Survival time and running score (Phase 4 endless mode)"` left untouched per plan R3.
- [x] Step 7: test/ui/foodDiagnosis-non-worker.test.js — 6 cases: predator/herbivore/saboteur/trader early-return, no-warehouse-mention assertion, WORKER regression-lock, missing-type fallback.
- [x] Step 8: test/ui/entityFocusList-visitor-role.test.js — 4 source-level contract cases: VISITOR branch, ANIMAL branch, hasRole guard regression-lock, groupMeta composition shape.
- [ ] Step 9: SKIPPED — CHANGELOG.md is `assignments/`-adjacent / docs-track; per implementer.md "code track commits should not touch CHANGELOG; left to docs track / Validator".

## Tests

- pre-existing skips (3, unchanged): same as parent 34da583 baseline.
- pre-existing failures (5, unchanged from parent recursive baseline 1727/1735):
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
  - `HUDController gives Score and Dev independent numeric tooltips` (test/ui/hud-score-dev-tooltip.test.js — appears to track A5's `+5/birth -> +10/birth` survival-score knob; verified red on parent before any A7 edit)
- new tests added (10 cases across 2 files): all green.
- failures resolved during iteration: none.

## Deviations from plan

- Step 9 (CHANGELOG entry) skipped — code-track convention. Plan author flagged this as "depends_on: Steps 1-6" optional polish; the validator / docs track owns CHANGELOG closeout.
- Index.html line numbers in plan were stale (legend rows at 2689-2690 not 2593-2594; placeholder at 2337 not 2241). Edits located by content match (legend row spans, statusObjectiveTime span). Semantic change identical to plan.
- Step 3 expanded ANIMAL fallback to also cover unspecified `kind` (defaults to "—" / "ANIMAL") — plan dictated PREDATOR/HERBIVORE handling; using `entity.type === "ANIMAL"` covers both and degrades safely if `kind` is missing. Same approach for VISITOR.
- Step 4 used `hasRole` boolean guard (refactor of plan's negated chained-ternary) for readability; logic identical: non-WORKER + no-role -> kind suffix.

## Freeze / Track check 结果

- freeze_check: **PASS** — no new TILE / role enum / building blueprint / audio asset / UI panel file. All edits are label / template / branch logic.
- track_check: **PASS** — touched only `src/ui/...`, `index.html` (predecessor A6 established index.html as in-bounds for code track), and `test/ui/...`. Did not touch README / CHANGELOG / docs / Plans / Feedbacks.

## Handoff to Validator

- **Smoke targets**: Logistics Legend (press `L`) — rows 4 & 5 should now read "cyan ring = Depot not ready" / "light-blue ring = Weather impact" matching their inline border colors.
- **Inspector smoke**: spawn or wait for a bear/wolf, click it -> Food Diagnosis cause should read "Wildlife (does not use colony food infrastructure)." with severity ok. Repeat for a saboteur visitor -> "Visitor (SABOTEUR); not a colonist.".
- **Worker list smoke**: when a saboteur or animal appears in the focus list (groupId="other" or "starving"), row text should include `(saboteur)` / `(predator)` etc. instead of bare `-`. Workers with active roles must still show `<group> / FARM`, `<group> / LOG`, etc.
- **Status bar smoke**: top-left chip should show `Run 00:00:30 ... Score N ... Dev D/100` instead of `Survived 00:00:30 ...`. Hover tooltip still says "Survival time and running score". Sidebar `objectiveVal` (legacy combined "Survived HH:MM:SS · Score N · Dev D/100") unchanged so existing voice-consistency / menu-phase tests stay green.
- **Regression invariants preserved**: hud-menu-phase.test.js (3 cases on `statusObjective` legacy combined string), entity-focus-relationships.test.js (buildFoodDiagnosis worker template), entity-focus-player-view.test.js (engBlock / hunger label structure), statBar.reset.test.js — all green.
- **5th P0 (STABLE + empty food contradiction)**: NOT addressed in this plan per `conflicts_with: A5` (already commit `?` per orchestrator handoff — A5 R1 reconnected entity.hunger root cause).
- **FPS check**: pure label / template diff; no per-frame allocation introduced. The added `entityType` string-coerce in buildFoodDiagnosis is once-per-inspector-render, not hot-path.
- **Production build**: `npx vite build` not run in this implementer pass — left to Validator per implementer protocol (only test step is hard-required).
