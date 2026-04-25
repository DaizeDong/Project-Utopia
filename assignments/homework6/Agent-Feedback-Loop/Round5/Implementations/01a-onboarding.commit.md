---
reviewer_id: 01a-onboarding
plan_source: Round5/Plans/01a-onboarding.md
bundle: w2-entity-focus-merged (Package A, shared with 01d-mechanics-content)
round: 5
wave: 2
date: 2026-04-22
parent_commit: 8288bd7
head_commit: 99844ab
status: DONE
steps_done: 6/6 (plan steps 1-6 — Step 7 CHANGELOG skipped per Runtime Context rule #4)
tests_passed: 1102/1104
tests_new:
  - test/default-tool-is-select.test.js
  - test/pointerdown-expands-entity-focus.test.js
  - test/entityFocusWorkerList.test.js (shared with 01d)
---

## Steps executed

- [x] Step 1: EntityFactory.js — `tool: "road"` → `tool: "select"` (with JSDoc for P0-2 observation loop trace).
- [x] Step 2: BuildToolbar.js — removed 185-187 road→select silent rebind; sync() now falls back to Select-button-active when tool is unknown.
- [x] Step 3: SceneRenderer.js #onPointerDown — inserted a typeof-document-guarded shim that sets `overlay.open = true` after a successful pick; runs before onSelectEntity.
- [x] Step 4: index.html:1269 — `<details id="entityFocusOverlay" open ...>`; also added `#entityFocusWorkerList` container + CSS (shared with Package A 01d portion).
- [x] Step 5: test/default-tool-is-select.test.js added.
- [x] Step 6: test/pointerdown-expands-entity-focus.test.js added (source-contract style, matches test/entity-pick-hitbox.test.js:155-170 pattern).
- [~] Step 7: CHANGELOG.md intentionally NOT updated per orchestrator rule #4 ("commit 不改 CHANGELOG.md"). Leaves a single unified CHANGELOG entry for the Validator.

## Tests
- pre-existing skips: 2 (unchanged).
- new tests added: test/default-tool-is-select.test.js, test/pointerdown-expands-entity-focus.test.js.
- failures resolved during iteration: none (all three new suites green on first run).

## Deviations from plan
- Plan says `EntityFactory.js:794`; actual `tool:` field sits at line 801 after Wave-1 added roleQuotas comments. Semantic edit identical.
- Plan says `BuildToolbar.js` lines 185-187 rebound; exact lines matched at the time of the edit.

## Handoff to Validator
- Benchmark not expected to move — default tool change does not touch `ColonyDirectorSystem` / `WorkerAISystem` decision paths (shortcut handler reads tool literal, not state.controls.tool).
- Playwright smoke target: first canvas click on a worker should open overlay AND set selected entity; Road-tile should NOT appear under the click (regression guard for the P0-2 observation loop).
