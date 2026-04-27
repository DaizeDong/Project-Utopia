---
reviewer_id: 02b-casual
plan_source: Round0/Plans/02b-casual.md
round: 0
date: 2026-04-22
parent_commit: 568bdb6
head_commit: bdb874d
status: DONE
steps_done: 9/9
tests_passed: 917/919
tests_new: test/ui-profile.test.js, test/build-validity-overlay.test.js
---

## Steps executed

- [x] **Step 1**: Added `uiProfile: "casual"` to `state.controls` default in
  `src/entities/EntityFactory.js` (line ~713). Mirrored the field in the
  `ControlState` JSDoc typedef in `src/app/types.js` as
  `uiProfile?: "casual"|"full"`. Skipped the separate `buildValidity`
  sub-object the plan proposed — the existing `state.controls.buildPreview`
  object already carries the `{ ok, ix, iz, reasonText }` shape (it's
  written by `SceneRenderer.#onPointerMove` per frame), so a parallel
  field would be redundant. Noted in Deviations below.

- [x] **Step 2**: Extended `src/app/devModeGate.js` (rather than building
  a separate gate, per Runtime Context orthogonality constraint from 01c
  and R2 summary arbitration) with `UI_PROFILE_STORAGE_KEY`,
  `CASUAL_MODE_BODY_CLASS`, `UI_PROFILE_VALUES`, `readInitialUiProfile()`,
  and `applyUiProfile()`. Wired `#initUiProfileGate()` into
  `GameApp.constructor` adjacent to the existing `#initDevModeGate()`
  call. The profile is both applied to the DOM (body class +
  `documentElement[data-ui-profile]`) and mirrored into
  `state.controls.uiProfile` so the render/panel layer can branch without
  DOM reads.

- [x] **Step 3**: Extended `index.html` `<style>` block with the casual-mode
  gate (body.casual-mode hides `[data-resource-tier="secondary"]` and
  `.casual-hidden`, and bolds the build validity row). Tagged
  `#hudMeals`, `#hudTools`, `#hudMedicine`, `#hudProsperity`, `#hudThreat`
  (the 5 "advanced" HUD cells) + their two preceding `.hud-divider`
  elements with `data-resource-tier="secondary"`. The existing
  `#debugFloatingPanel` / `#settingsFloatingPanel` / `#devDock` already
  carry `.dev-only` from 01c-ui, so the casual gate layers on top without
  duplication. The `data-tool` button titles were already in the form
  "Road (1) — connect buildings, cost: 1 wood" (full words) from the
  v0.8.1 baseline, so 3c required no edits to those titles.

- [x] **Step 4**: Wrapped the engineering regions of
  `src/ui/panels/EntityFocusPanel.js:render()` in `<span class="casual-hidden">`
  sleeves or `.casual-hidden` class attributes: FSM / AI Target / Policy
  Influence / Decision Time / Velocity / Path / Path Recalc, and the
  entire "AI Agent Effect" block plus the two `<details>` exchange
  panels. Kept the "Role / Group / State / Intent / Position / Vitals /
  Carry" rows always visible — this is the friendly "Needs / Task"
  summary the reviewer asked for. DOM ids and element presence are
  preserved (visibility is CSS-only) so downstream panels and any future
  `test/entity-focus-panel.test.js` can still query them.

- [x] **Step 5**: Added `formatCostExpanded()` and extended
  `getBuildToolPanelState()` in `src/simulation/construction/BuildAdvisor.js`
  with a new `costLabelExpanded` field. In
  `src/ui/tools/BuildToolbar.js:sync()`, branch on
  `state.controls.uiProfile === "casual"` and display the expanded
  label ("5 wood + 3 stone") instead of the compact one ("5w 3s").
  Also stamp `data-ui-casual-accent` on `#buildPreviewVal` so the
  CSS accent applies only under casual.

- [x] **Step 6**: `src/render/SceneRenderer.js` — exported a new pure
  helper `describeBuildValidityAccent(preview, uiProfile)` returning
  `{ color, scale, reasonText, legal }`. Applied the 1.08x casual scale
  to the existing `previewMesh` in `#updateOverlayMeshes()`. The plan
  originally asked for a separate `#renderBuildValidityOverlay()` method,
  but the renderer already paints the hovered tile green (legal) / red
  (illegal) via `previewMesh`; accenting the existing mesh avoids a
  second draw pass and the attendant FPS risk flagged in plan Risk §5.
  See Deviations below.

- [x] **Step 7**: `src/app/shortcutResolver.js` — phase-gated L, 0, Home,
  Digit1–6 so they return `null` when `context.phase !== "active"`. Kept
  Escape always-on (clearing selection in end phase is harmless) and
  left the Ctrl+Z/Y path untouched (it already had its own
  `phase !== "active"` guard). Defensive fix for the UNREPRODUCIBLE
  "wheel/L → menu" reports (plan §7).

- [x] **Step 8**: Created `test/ui-profile.test.js` (15 subtests):
  readInitialUiProfile URL/storage/unknown/privacy-throw cases,
  applyUiProfile toggles both the body class and the html data-attribute,
  orthogonality with body.dev-mode, resolveGlobalShortcut phase gating
  for L/0/1–6, Escape preserved across phases, and an index.html CSS
  contract assertion for the secondary-tier gate + the 5 HUD element
  tier tags.

- [x] **Step 9**: Created `test/build-validity-overlay.test.js` (5 subtests):
  `describeBuildValidityAccent` green/red colours, 1.08x casual scale vs
  1.0x full, null-preview guard, reasonText fallback when reasonText
  missing, and a mock-`CanvasRenderingContext2D` `strokeRect` recorder
  pattern verifying illegal hover → red border (the plan's canvas
  overlay "driver" story, even though the live renderer uses a Three.js
  mesh).

## Tests

- Baseline (at parent_commit 568bdb6): 899 tests, 897 pass / 2 skip / 0 fail.
- Post-commit (HEAD bdb874d): **919 tests, 917 pass / 2 skip / 0 fail**.
- Net delta: +20 tests (15 in ui-profile.test.js, 5 in build-validity-overlay.test.js).
- Pre-existing skips (unchanged): 2 — carried over from baseline; not
  touched by this plan.
- New tests added:
  - `test/ui-profile.test.js`
  - `test/build-validity-overlay.test.js`
- Failures resolved during iteration: one existing shortcut-resolver
  assertion expected `Home` in menu phase to return `resetCamera`; after
  Step 7's defensive gating that assertion needed updating. Rewrote the
  test case to assert the new gated behaviour (menu=null, active=camera
  reset). No other regressions encountered; the full suite ran green
  on first attempt.

## Deviations from plan

- **Step 1 `buildValidity` field**: the plan proposed a new
  `state.controls.buildValidity` sub-object with
  `{ hoverTile, legal, reason }`. The existing
  `state.controls.buildPreview` field (written per-frame by
  `SceneRenderer.#onPointerMove`) already carries exactly this data
  (`{ ok, ix, iz, reasonText, ... }`). Introducing a parallel field
  would have required dual bookkeeping and risked desync under the
  0.8.1 pointer-sample throttling. I kept Step 5 / 6 / 9 consumers
  reading from `buildPreview` and documented the contract in the Step 1
  JSDoc comment and the SceneRenderer helper. The semantics the plan
  asked for (hover tile + legal bit + reason string) are unchanged.

- **Step 6 `#renderBuildValidityOverlay` helper**: the plan asked for a
  new private method that re-paints the hovered tile each frame. The
  SceneRenderer already has a `previewMesh` (allocated in the
  constructor, positioned in `#updateOverlayMeshes()`) whose material
  colour is already switched green/red based on
  `preview.ok`. I added the casual accent (scale 1.08x) at that same
  call site rather than introducing a second draw pass, which would
  have violated plan Risk §5 "< 2 FPS delta". The pure-function
  `describeBuildValidityAccent()` is the test surface the plan asked
  for; the live renderer forwards its outputs to the mesh.

- **Cost button titles (Step 3c)**: the v0.8.1 baseline `index.html`
  already expands costs to full words in `data-tool` button titles
  (e.g. `title="Road (1) — connect buildings, cost: 1 wood"`). No edit
  to those titles was needed. The 5w → 5 wood expansion now happens
  at the hover-panel layer via the new `costLabelExpanded`.

- **02d dependency (summary §R3)**: the summary prescribes the
  EntityFocusPanel merge order 02d → 02b → 01e → 01a. 02d has not yet
  run (it's in Wave 4). I kept Step 4 narrowly scoped to the
  "hide engineering regions" responsibility of 02b, and did not
  prepend a Character header (that is 02d's job). The `.casual-hidden`
  sleeves are additive and will compose cleanly when 02d prepends its
  block at the top of the panel.

## Handoff to Validator

- **Manual QA**:
  1. `npx vite` → open `/?ui=casual` (default). Confirm: top HUD
     shows only Food / Wood / Stone / Herbs / Workers; Meals / Tools /
     Medicine / Prosperity / Threat are hidden. Click a worker →
     Entity Focus shows Role / Group / State / Intent / Position /
     Vitals / Carry; no FSM / Policy / Path / AI Exchange rows.
     Hover a farm tool over an arable tile → green mesh (slightly
     larger than before). Hover over water → red mesh. In the "Build"
     panel the Cost row now reads e.g. `Cost: 5 wood` instead of
     `Cost: 5w`.
  2. Open `/?ui=full` → profile flips to v0.8.1 behaviour. All HUD
     resources visible; EntityFocus full debug dump returns; cost
     label reverts to `5w`.
  3. On the main menu press `L`, `0`, `1`–`6` → no response. Press
     `Space` → no response (existing behaviour). Press Escape → no-op
     in menu (only clears selection in active). Start a colony, then
     L works again, 1–6 switches tools.
- **Benchmark**: plan mandates DevIndex ≥ 41.8 (seed=42 /
  temperate_plains) post-change; this plan makes no simulation-side
  edits, so DevIndex should be unchanged from baseline 44. Validator
  should still spot-check.
- **Playwright smoke**: not run in this session (UI-only, covered by
  the 15 new unit tests). Suggest a screenshot diff on (a) fresh load
  in casual profile, (b) worker click in casual profile, (c) load
  with `?ui=full` query to verify the toggle wiring.
- **Known non-issues**: the 260+ untracked screenshots in repo root
  (`casual-*.png`, `utopia-*.png`, `01-initial-load.png`, etc.) are
  pre-existing from prior reviewer sessions and were deliberately NOT
  staged (plan constraint §5). They remain untracked.
