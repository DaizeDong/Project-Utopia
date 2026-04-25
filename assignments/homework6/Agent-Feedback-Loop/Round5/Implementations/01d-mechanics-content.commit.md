---
reviewer_id: 01d-mechanics-content
plan_source: Round5/Plans/01d-mechanics-content.md
bundle:
  - w2-entity-focus-merged (Package A, UI/focus side — shared with 01a)
  - w2-foodrate-devweak-merged (Package B, data side — shared with 01c)
round: 5
wave: 2
date: 2026-04-22
parent_commit: 8288bd7
head_commits:
  - 99844ab (Package A — EntityFocus worker list + Tab cycle + focus:why block)
  - e0f9f8f (Package B — resource-flow emits + consumption fallback)
status: DONE
steps_done: 9/9
tests_passed: 1114/1116 (after Package B), 1130/1132 (after Package C adjacent merge)
tests_new:
  - test/entityFocusWorkerList.test.js (UI contract)
  - test/food-rate-breakdown.test.js (data-side contract — shared with 01c)
---

## Steps executed

- [x] Step 1: ResourceSystem.update — sliding-window accumulator + `recordResourceFlow(state, resource, kind, amount)` named export; per-min metrics flush every 3 s.
- [x] Step 2: MortalitySystem medicine-heal path emits `recordResourceFlow(state, "medicine", "consumed", medicineUsed)`. Worker food-eating (WorkerAISystem) is freeze-locked, so ResourceSystem's net-delta fallback attributes its drop to food consumed instead — documented in-code + test coverage.
- [x] Step 3: ProcessingSystem emits true-source flows per completed cycle — Kitchen (food consumed + meals produced), Smithy (wood+stone consumed + tools produced), Clinic (herbs consumed + medicine produced). Wired via the `inputConsume` / `outputProduce` callbacks inside `#tryProcess` so partial cycles cannot leak.
- [x] Step 4: index.html — new `<div id="entityFocusWorkerList" class="entity-worker-list">` slot above `#entityFocusBody`; CSS rules for `.entity-worker-list`, `.entity-worker-row`, `.entity-worker-row.selected`, and `.entity-worker-list-footer`.
- [x] Step 5: EntityFocusPanel — `#renderWorkerList()` renders alive workers as `<button data-entity-id=...>Name · role · state · hunger</button>`, paginates `>20` with a "+N more" footer, marks the selected row with `.selected`, and binds a single click delegate on the container (sets `state.controls.selectedEntityId`, clears selectedTile).
- [x] Step 6: EntityFocusPanel — promoted "Top Intents / Top Targets / AI Agent Effect / Decision Context" OUT of the `.casual-hidden .dev-only` gate into a new `<details open data-focus-key="focus:why">` block with summary "Why is this worker doing this?". FSM / Policy Influence / Decision Time / Velocity / Path / Target Selection / Path Nodes / Mode / Global Headline/Warning / AI Exchange REMAIN dev-only.
- [x] Step 7: GameApp.#onGlobalKeyDown — Tab / Shift+Tab cycle selected worker; gated on `phase === 'active'`; text-input focus already filtered by `#shouldIgnoreGlobalShortcut`. New `#cycleSelectedWorker(direction)` helper.
- [x] Step 8: test/entityFocusWorkerList.test.js added — verifies DOM layout, `#renderWorkerList` method, pagination constant, focus:why block has no gate classes, and GameApp Tab wiring via source inspection.
- [x] Step 9: test/food-rate-breakdown.test.js added (shared with plan 01c Step 5, 6 subtests).

## Tests
- pre-existing skips: 2 (unchanged).
- new tests: test/entityFocusWorkerList.test.js, test/food-rate-breakdown.test.js.
- existing test/entity-focus-player-view.test.js continues to pass: its assertions (engBlockOpen carries both classes, FSM/Policy Influence/Decision Time sit inside engBlock, AI Exchange details carry engClasses) are unaffected by the "focus:why" promotion.

## Deviations from plan

- **Plan Step 2 (MortalitySystem consumption path):** Plan text says "worker 从 warehouse 或 carry 吃 food 时 accum.consumed". The actual food-consumption call sites are in `WorkerAISystem.js:400 / :471`, which the Runtime Context explicitly forbids editing in Wave 2. Implementation adopted the merge-guide-compliant approach: (a) ResourceSystem's net-delta fallback captures all unexplained food drops as consumption; (b) MortalitySystem's in-scope consumer (medicine heal) emits a true-source record. Net effect matches reviewer's reported goal: `foodConsumedPerMin` populates within one 3 s window without touching freeze-locked files.
- **Plan Step 4 worker-list row buttons** use `<button>` rather than raw `<div>` so keyboard focus traversal + accessibility is preserved without extra ARIA wiring.
- **Plan Step 6 wrapper:** rendered as `<details open data-focus-key="focus:why">` (open by default, open/close state persisted through existing `#captureOpenStates`/`#restoreOpenStates` plumbing).
- **Plan Step 7:** implementation hooks directly into the existing `#onGlobalKeyDown` rather than a new keydown listener so the Escape/shortcut precedence order stays in one place.

## Handoff to Validator
- EntityFocusPanel render path now makes TWO DOM writes per tick (worker-list + body); signature-based dirty-check minimizes rebuilds (`this.workerListSignature`) — verify in Playwright that selecting a worker via canvas click + subsequent Tab cycle does not cause flicker/double-refresh.
- `getResourceChainStall` (Wave-2 Package C) and `recordResourceFlow` (Package B) are both new named exports; Validator should grep for consumers to confirm Wave 3 Plan hooks land cleanly.
- Benchmark expectation: per summary.md §6, Wave 2 is pure UI + side-channel; DevIndex should be unchanged ±1.
