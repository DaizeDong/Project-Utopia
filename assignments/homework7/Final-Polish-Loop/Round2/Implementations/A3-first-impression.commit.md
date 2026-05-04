---
reviewer_id: A3-first-impression
plan_source: Round2/Plans/A3-first-impression.md
round: 2
date: 2026-05-01
parent_commit: d725bcf
head_commit: e5d754a
status: PARTIAL
track: code
freeze_check: PASS
track_check: PASS
steps_done: 9/10
tests_passed: 1717/1726
tests_new: test/scene-renderer-pointer-priority.test.js (+1 case "entity ~20 px away outside 14 px guard → place")
---

## Steps executed

- [x] **Step 1**: `src/render/SceneRenderer.js:122` + `src/config/balance.js:418` — `ENTITY_PICK_GUARD_PX` default lowered 36 → 14 px. Updated the multi-line JSDoc/comment block to explain the new "matches worker visual hitbox + 2 px slop" semantics and why the old 36 px buffer was a perception-radius mistake. Updated the inline comments inside `#onPointerDown` ("14 px guard") and `decidePointerTarget` JSDoc ("14 px guard radius"). (commit `e5d754a`)
- [x] **Step 2**: `test/scene-renderer-pointer-priority.test.js` — appended a "placement tool with entity ~20 px away (outside 14 px guard) → place" case asserting `decidePointerTarget` returns `"place"` when the screen-space proximity probe at 14 px misses the worker. Renamed adjacent case to "14 px guard radius" for consistency.
- [x] **Step 3**: `src/render/SceneRenderer.js:#updateOverlayMeshes` — gated the existing `previewMesh.visible = true` branch behind `isPlacementTool` (matches the click-path's gate). For "select"/null tool the preview mesh now stays hidden so the player gets a clean tile-info hover instead of a misleading green/red flash. Re-uses `state.controls.buildPreview` so BuildToolbar / InspectorPanel hint pipelines see the same payload as the click path. No change to `BuildSystem.placeToolAt` was needed — the existing `BuildSystem.previewToolAt` is already a pure read-only function that satisfies the "dryRun" intent in the plan.
- [x] **Step 4**: `index.html:227` — removed `#statusBar .hud-sublabel { display: none !important; }`. Sublabels Food/Wood/Stone/Herbs are now visible by default in the status bar. The `#ui.compact .hud-sublabel { display: none; }` fallback at line 256 is preserved (`hud-resource-sublabel.test.js` regression assertion still pins it).
- [x] **Step 5**: `index.html:1418-1424` — `.overlay-leaderboard-list` `max-height: 140px` → `96px`. Best Runs list now shows ~3 rows max before scrolling internally; reduces the menu panel height by ~44 px which is enough to fit Start Colony on a 630 px viewport.
- [x] **Step 6**: `index.html` `.overlay-actions` — added `position: sticky; bottom: 0; background: var(--panel-bg); padding-top: 8px; margin-top: 8px; z-index: 1;` so the primary CTA stays glued to the bottom of the visible panel area. `.overlay-panel` extended with `max-height: calc(100vh - 36px); overflow-y: auto;` so sticky actually activates (Risk R4 mitigation).
- [x] **Step 7**: `index.html:2619-2630` — `data-hotkey="1"` … `data-hotkey="9"`, `data-hotkey="-"`, `data-hotkey="="` added to 11 of the 12 toolbar buttons. **Kitchen** intentionally has NO `data-hotkey` because `TOOL_SHORTCUTS` (src/app/shortcutResolver.js:7-20) does not assign it a digit — `Digit0` is reserved for `select`, and the original toolbar tooltip's "(10)" was misleading (deliberately corrected to a tooltip note "no digit hotkey"). Mapping: road=1, farm=2, lumber=3, warehouse=4, wall=5, bridge=6, erase=7, quarry=8, herb_garden=9, smithy=`-`, clinic=`=`. Synchronised with `TOOL_SHORTCUTS` exactly.
- [x] **Step 8**: `index.html` `.tool-grid button[data-hotkey]::before` — CSS-only badge in the top-left corner of each button, reading `attr(data-hotkey)`. Sized 12 px tall, 9 px font, `var(--accent-dim)` background, `border-radius: 3px`, `opacity: 0.85`, `pointer-events: none`. Tools without a digit hotkey (Kitchen) get no badge — the omitted attribute simply skips the ::before. Added `position: relative` to `.tool-grid button[data-hotkey]` so absolute positioning has a containing block.
- [x] **Step 9**: `index.html:520` `#terrainLensLabel` + `src/app/GameApp.js:#syncTerrainLensLabel` — added `transition: opacity 200ms ease, transform 200ms ease;` and a `body.overlay-just-toggled #terrainLensLabel:not([hidden])` rule that runs a 1.4 s `overlayPulse` keyframe (scale 0.92 → 1.08 → 1.0, opacity 0 → 1, plus a fading 2 px box-shadow ring). `#syncTerrainLensLabel` flips `document.body.classList` on mode-on transitions only and clears the class via `setTimeout(1400)`. Force-reflow trick (`void document.body.offsetWidth`) ensures the keyframe restarts on rapid tool-switches. Kept the existing `[hidden]` toggle so OFF transitions are quiet.
- [ ] **Step 10**: SKIPPED — `CHANGELOG.md` is a docs-track file. `assignments/homework7/Final-Polish-Loop/Coders/implementer.md` §2 ("Track 边界自检") explicitly forbids code-track commits from touching CHANGELOG.md ("`code track` 内的 commit **不要**顺手碰 CHANGELOG (留给 docs track / Validator)"). The plan author included it in the steps list but this would be a TRACK-VIOLATION; deferred to the Validator / next docs-track plan.

## Tests

- pre-existing skips: 3 (unchanged from baseline)
- pre-existing fails: 6 (unchanged from baseline; same set as parent commit `d725bcf`):
  - `exploit-regression: escalation-lethality — median loss tick ∈ [2000, 5000]`
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
  - `v0.10.0-c #2: scenario E walled-warehouse — FSM keeps all workers alive (carry-eat works)`
- new tests added:
  - `test/scene-renderer-pointer-priority.test.js` (+1 case "placement tool with entity ~20 px away (outside 14 px guard) → place"); 7 → 8 tests in this file.
- failures resolved during iteration:
  - `test/sim-stepper-visibility-throttle.test.js` `renderHitboxPixels balance config: entityPickGuard = 36` → updated to assert `14` with the v0.10.1-A3 R2 (F1) justification (Risk R1 mitigation — the test pinned the old constant).
  - `test/entity-pick-hitbox.test.js` regression-defense regex pinned `entityPickGuard ?? 36` and the comment text "24 px build-guard" → updated to `?? 14` and "build-guard" (without a stale numeric prefix), with a v0.10.1-A3 R2 (F1) comment block justifying the change (Risk R1 mitigation).

Final test run after all edits: **1717 / 1726 passing, 6 fail (all pre-existing), 3 skip**. +1 net test (1726 vs 1725 baseline).

## Deviations from plan

- **Step 3 implementation**: plan suggested adding a `dryRun` branch to `BuildSystem.placeToolAt`. After reading `src/simulation/construction/BuildSystem.js:76-78`, this was unnecessary — the existing `BuildSystem.previewToolAt` is already a pure read-only function (delegates straight to `evaluateBuildPreview`) and is what `#updateOverlayMeshes` already calls. The fix was therefore a 4-line gate around the existing call instead of adding a new code-path. Risk R2 mitigated by *not* needing the change at all.
- **Step 7 Kitchen hotkey**: the plan listed Kitchen as `data-hotkey="10/0?"`. After reading `src/app/shortcutResolver.js`, Kitchen has *no* digit hotkey (Digit0 is `select`; Digit1-9 / Minus / Equal cover the other 11 tools). Kitchen's `data-hotkey` attribute is omitted — the CSS rule `.tool-grid button[data-hotkey]::before` simply does not match it, so no badge appears. The button's title tooltip was updated from "(10)" to a note explaining the omission. This stays in sync with TOOL_SHORTCUTS (Risk R5 mitigation).
- **Step 10 (CHANGELOG)**: SKIPPED — see Steps section above. Track-boundary rule from implementer.md §2 supersedes the plan's last step.

## Freeze / Track check 结果

- **freeze_check: PASS** — no new tile constants, role enum values, building blueprints, audio asset imports, or UI panel files. Only constants (BALANCE.renderHitboxPixels.entityPickGuard), CSS rules (sublabel, leaderboard, sticky CTA, hotkey badges, overlay pulse), DOM attributes (data-hotkey on existing buttons), a hover-mode gate on the existing previewToolAt path, and a body class flip in `#syncTerrainLensLabel`.
- **track_check: PASS** — only `src/render/SceneRenderer.js`, `src/app/GameApp.js`, `src/config/balance.js`, `index.html`, and 3 `test/*.test.js` files modified. No `README.md`, no `assignments/**/*.md` (other than this commit log), no `CHANGELOG.md`, no `docs/**/*` touched.

## Handoff to Validator

- **FPS regression**: Step 3 hover-preview only runs on pointer-move which already runs; no new tick or render-frame work. `previewToolAt` was already called per-frame on `hoverTile` change in `#updateOverlayMeshes`; the new gate actually *reduces* work in select/inspect mode (skips the call).
- **Prod build**: `npx vite build` should pass with no errors (no new imports, no syntax surface beyond CSS rules and one DOM attribute pass).
- **Manual smoke at 1049×630**: confirm Start Colony visible without scrolling on first paint; press "1" → hover grass adjacent to a wandering worker → expect green ghost-preview tile; LMB on the green tile → road placed, "Built road" toast; selectedEntityId stays null. LMB directly on a worker sprite (within ~14 px) → expect "Selected Worker-N" with entity-pick toast. Press "T" → expect "Overlay: Terrain" pulse cue (label briefly scales 0.92 → 1.08 → 1.0 with a green ring fade).
- **Sublabel reveal regression** (Risk R3): verify on 1366×768 wrap mode that secondary HUD items (Meals/Tools/Med/Prosp/Threat) don't get pushed off-screen. The `#ui.compact .hud-sublabel { display: none; }` rule at line 261 still catches narrow viewports — `body.compact` / `#ui.compact` flips on a viewport-width threshold downstream.
- **Hotkey-badge sync invariant** (Risk R5): Kitchen tooltip note added; if a future plan reassigns Kitchen to a digit, the `data-hotkey` attribute must be added in lockstep. No JS assertion was wired (would expand scope beyond the plan); recommend Validator add a 1-line `BuildToolbar` init assertion in a follow-up.
- **Sticky CTA edge cases** (Risk R4): `.overlay-panel` now has `max-height: calc(100vh - 36px); overflow-y: auto;` so sticky activates. At very short viewports (< 480 px tall) the leaderboard + map selectors will scroll behind the sticky CTA, which is the intended behaviour.
- **CHANGELOG entry**: deferred to the next docs-track plan or to the Validator. The R2 changelog section should reference: F1 pointer guard 36→14 + ghost-preview gate; F2 Start Colony sticky in overlay actions, leaderboard capped at 96 px, panel scrollable; F4 HUD resource sublabels visible by default; F3 toolbar hotkey badges (11 of 12 tools, Kitchen omitted by design); F5 overlay-toggle pulse cue.
