---
reviewer_id: Plan-R13-A1-P2-cleanup (R13 user issue #9 / sanity)
feedback_source: assignments/homework7/Final-Polish-Loop/Round13/Feedbacks/A1-stability-hunter.md
round: 13
date: 2026-05-01
build_commit: 527f460
priority: P2
track: code (A1 R13 P2 carryover sanity sweep)
freeze_policy: hard
rollback_anchor: 527f460
estimated_scope:
  files_touched: 4
  loc_delta: ~40
  new_tests: 1
  wall_clock: 30
conflicts_with: []
---

# Plan-R13-A1-P2-cleanup — A1 R13 P2 carryovers: configure/startRun template overrides + regenerate({template}) deprecation + devStressSpawn pin + HUD warnings count

**Plan ID:** Plan-R13-A1-P2-cleanup
**Source feedback:** R13 user directive issue #9 (sanity follow-up) — "Address A1 R13 P2 carryovers: (i) configure/startRun template overrides on fresh boot ignored; (ii) regenerate({template}) deprecated → migrate configure/startRun to {templateId} too; (iii) devStressSpawn contract pin; (iv) HUD warnings count pill."
**Track:** code
**Priority:** **P2** — none of these are wipe-causing; all are correctness / contract polish from A1's stability-hunter audit. Bundling them keeps the changeset coherent.
**Freeze policy:** hard — pure cleanup; no new mechanic, no new state shape. Just contract pinning + parameter naming consistency + UI count rendering.
**Rollback anchor:** `527f460`

---

## 1. Core problem (one paragraph)

A1's R13 audit surfaced four loose ends from R11/R12 P2 work: (i) `configureLongRunMode` and `startRun` accept template overrides at fresh-boot but the values are silently dropped because the bare-initial state factory has already decided the templateId before the override is read; (ii) `regenerateWorld({ templateId })` now uses `templateId` consistently but `configure`/`startRun` still accept the old `{ template }` key without migration warnings; (iii) `devStressSpawn` (an internal stress-test hook) has no documented contract for return shape so callers crash on shape drift; (iv) HUD has a warnings system but no top-level count pill, so the player can't see "5 warnings since last clear" at a glance.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — four targeted small fixes in one plan

(i) In `configureLongRunMode` (line 1443) and `startRun` (line ~2491-2548), explicitly forward `templateId` (and `template` for back-compat) into `regenerateWorld({ templateId, ... })` so fresh-boot overrides actually land. Add unit test that asserts the override propagates.

(ii) In `configureLongRunMode` and `startRun`, accept `{ templateId }` as canonical. If caller passes `{ template }`, log a one-time deprecation warning via `pushWarning` and forward the value. Tracked via `state.__deprecationWarned.template = true`.

(iii) Add JSDoc `@returns` block + a test that pins the `devStressSpawn` return shape to `{ ok: boolean, spawnedCount: number, reason?: string }`. Lightweight contract guard.

(iv) In `HUDController.js`, add a small count pill in the warnings strip that shows `state.warnings?.length ?? 0` (or whatever the canonical field is). Hidden when count===0; amber styling when >0; one-click clears the list (existing clear path).

- Files: `src/app/GameApp.js`, `src/app/types.js` (if devStressSpawn lives there), `src/ui/hud/HUDController.js`.
- Scope: ~40 LOC + 1 consolidated test ~30 LOC.
- Expected gain: closes all four A1 P2 carryovers.
- Main risk: low — all four are local edits; no behaviour change for callers using current canonical signatures.

### Suggestion B (in-freeze, SPLIT) — break into 4 separate plans

Better isolation, but 4 separate ~10-LOC plans is process overhead vs benefit. Skip.

### Suggestion C (FREEZE-VIOLATING) — refactor entire session-lifecycle API

Out of scope.

## 3. Selected approach

**Suggestion A** — single coherent plan, four small steps.

## 4. Plan steps

- [ ] **Step 1 — Audit `configureLongRunMode` and `startRun` for template handling.**
  Read `src/app/GameApp.js:1443` (configureLongRunMode) and `:2491-2548` (startRun). Document where `templateId` / `template` is consumed and where overrides fail to propagate.
  - Type: read

- [ ] **Step 2 — Patch `configureLongRunMode` and `startRun` to forward `templateId` correctly + accept `template` with deprecation.**
  ```js
  const requestedTemplateId = options.templateId ?? options.template ?? null;
  if (options.template !== undefined && options.templateId === undefined) {
    pushWarning(state, "deprecated-template-key", "configureLongRunMode/startRun: 'template' key is deprecated, use 'templateId'", { dedupKey: "deprecated-template-key" });
  }
  if (requestedTemplateId) {
    this.regenerateWorld({ templateId: requestedTemplateId, seed: options.seed });
  }
  ```
  Apply same pattern to startRun.
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Document and pin `devStressSpawn` return contract.**
  Locate `devStressSpawn` (grep). Add JSDoc:
  ```js
  /**
   * @returns {{ ok: boolean, spawnedCount: number, reason?: string }}
   */
  devStressSpawn(opts) { ... }
  ```
  Ensure all return paths conform. Add a return wrapper if needed.
  - Type: edit
  - depends_on: Step 2

- [ ] **Step 4 — Add HUD warnings count pill.**
  In `HUDController.js`, near the warnings render path (search `warnings`, `pushWarning`), add:
  ```js
  // R13 #9 (iv) — warnings count pill
  const wcount = state.warnings?.length ?? 0;
  if (this.warningsCountPill) {
    this.warningsCountPill.hidden = wcount === 0;
    this.warningsCountPill.textContent = String(wcount);
  }
  ```
  Add the pill element to `index.html`'s top status bar (or wherever existing warning indicators live):
  ```html
  <span id="hudWarningsCountPill" class="hud-warn-pill" hidden title="Warnings since last clear">0</span>
  ```
  CSS: amber background, small badge.
  - Type: edit
  - depends_on: Step 3

- [ ] **Step 5 — Consolidated unit test `test/r13-a1-p2-cleanup.test.js` (~40 LOC).**
  Test cases:
  1. `configureLongRunMode({ templateId: "rugged_highlands" })` on fresh boot → state.world.mapTemplateId === "rugged_highlands".
  2. `startRun({ templateId: "fertile_riverlands" })` → committed templateId matches.
  3. `startRun({ template: "fortified_basin" })` → still works AND emits deprecation warning (assert via state.warnings or the pushWarning mock).
  4. `devStressSpawn(opts)` returns `{ ok, spawnedCount, reason? }` shape (assert keys present, types match).
  5. After pushWarning, HUD pill shows `state.warnings.length`. After clearWarnings, pill hides.
  - Type: add
  - depends_on: Step 4

- [ ] **Step 6 — CHANGELOG.md entry.**
  *"R13 #9 Plan-R13-A1-P2-cleanup (P2): A1 R13 P2 carryovers — (i) configure/startRun template overrides now propagate on fresh boot; (ii) {template} accepted with deprecation warning, {templateId} canonical; (iii) devStressSpawn @returns contract pinned + tested; (iv) HUD warnings count pill (#hudWarningsCountPill, amber, hidden when zero)."*
  - Type: edit
  - depends_on: Step 5

## 5. Risks

- **Possible breakage of internal callers using `{ template }`** — mitigated by back-compat acceptance + deprecation warning rather than hard rename.
- **devStressSpawn callers may rely on undocumented return shape** — pinning surfaces any drift; failures are loud.
- **Possible affected tests:** `test/configure-long-run*.test.js`, `test/start-run*.test.js`, `test/dev-stress*.test.js`, `test/hud-warnings*.test.js`.

## 6. Verification

- **New unit test:** `test/r13-a1-p2-cleanup.test.js` (Step 5).
- **Manual:** dev server, click "Long-run mode" with template override → confirm map matches override. Push 3 warnings → pill shows "3". Click clear → pill hides.
- **No bench regression** — pure correctness sweep.

## 7. UNREPRODUCIBLE marker

N/A — A1 audited and reproduced these in R13 audit.

---

## Acceptance criteria

1. configureLongRunMode + startRun honor `{ templateId }` AND `{ template }` (with deprecation warning).
2. regenerateWorld continues to accept `templateId` as canonical (no rename needed there).
3. devStressSpawn returns documented `{ ok, spawnedCount, reason? }` shape; verified by test.
4. HUD warnings count pill renders correctly.
5. Test baseline 1646 / 0 fail / 2 skip preserved + new test passes.
6. CHANGELOG.md updated.

## Rollback procedure

```
git checkout 527f460 -- src/app/GameApp.js src/app/types.js src/ui/hud/HUDController.js index.html && rm test/r13-a1-p2-cleanup.test.js
```
