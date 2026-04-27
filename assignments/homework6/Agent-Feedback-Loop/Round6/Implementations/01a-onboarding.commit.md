---
reviewer_id: 01a-onboarding
plan_source: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/01a-onboarding.md
round: 6
wave: 1
date: 2026-04-25
parent_commit: 2558cf1
head_commit: 2b04f16
status: DONE
steps_done: 10/10
tests_passed: 1299/1305
tests_new: test/onboarding-noise-reduction.test.js
freeze_policy: lifted
---

## Steps executed

- [x] Step 1 — `src/render/PressureLens.js:409`: halo marker `label: "halo"` → `label: ""`. Inline comment explains the contract change and references the summary §2 D1 Wave-1 floor.
- [x] Step 2 — `src/render/SceneRenderer.js#updatePressureLensLabels`: empty-label markers short-circuit to `el.style.display = "none"; continue;`. Used `marker.label === ""` (explicit empty string) so the legacy `?? marker.kind` fallback is preserved when `label` is omitted.
- [x] Step 3 — `src/app/GameApp.js`: both proxy-down (`.catch(...)`) and proxy-no-key paths now write `actionMessage = "Story AI is offline — fallback director is steering. (Game still works.)"` with `actionKind = "info"`. Original `err.message` retained via `console.warn("[Project Utopia] AI proxy unreachable:", errText)` + `pushWarning(this.state, ..., "warn", "ai-health")` for dev-panel consumption.
- [x] Step 4 — `src/app/shortcutResolver.js`: added `KeyR / "r"` branch returning `{ type: "resetCamera" }` in active phase. `SHORTCUT_HINT` updated to "R or Home reset camera". `Digit0` retains its kitchen-tool binding (no test breakage path).
- [x] Step 5 — `index.html`: Help dialog `data-help-tab="controls"` lost the `active` class; `data-help-tab="chain"` gained it. The bullet `<code>0</code> resets camera.` rewritten to `<code>R</code> or <code>Home</code> resets camera (number keys 1-0/-/= are build tools).` Tab-button `active` class moved in lockstep.
- [x] Step 6 — `src/ui/panels/EntityFocusPanel.js`: added `alive / hpPct / healthLabel / healthPctText / healthDeceasedSuffix` derivations. `Vitals: hp=...` row replaced by two rows: casual `<div class="small"><b>Health:</b> ${healthLabel}${healthPctText}${healthDeceasedSuffix}</div>` and dev-only `<div class="small ${engClasses}"><b>Vitals (dev):</b> hp=...</div>`.
- [x] Step 7 — `src/ui/panels/EntityFocusPanel.js`: `Position: world=(...) tile=(...)` row gained `class="small ${engClasses}"` — only visible in dev-mode + ui=full.
- [x] Step 8 — Audit-only: confirmed all PressureLens primary marker labels (`"traffic hotspot"`, `"wildlife pressure"`, `"supply surplus"`, `"input starved"`, `"warehouse idle"`, `"stone input empty"`) are kept; only the halo label was replaced with `""`. No additional code edits.
- [x] Step 9 — Existing tests verified post-edit: `test/heat-lens-coverage.test.js` (3/3 pass; halo asserts on `id` prefix, not label), `test/entity-focus-player-view.test.js` (5/5 pass; asserts on `engBlockOpen`, `engClasses`, hunger labels, AI-Exchange details — none touched), `test/entity-focus-relationships.test.js` (pass), `test/pressure-lens.test.js` (pass), `test/shortcut-resolver.test.js` (13/13 pass; doesn't assert on the new KeyR binding's specifics).
- [x] Step 10 — Added `test/onboarding-noise-reduction.test.js` (3 suites / 6 cases): formatter-distinctness for `formatTemplatePressure` + `formatTemplatePriority` (required exporting them from `GameStateOverlay.js`), `halo` label-empty regression, GameApp `actionMessage` jargon-free regression (static-source scan).

## Tests

- **Total run**: `node --test test/*.test.js` — 1305 tests / 1299 pass / 4 fail / 2 skip.
- **Pre-existing failures (verified fail on parent commit `2558cf1` before any edit)**:
  - `test/buildSpamRegression.test.js` — "warehouse cost at count=30 exceeded cap 25" (BUILD_COST_ESCALATOR drift, unrelated).
  - `test/entity-pick-hitbox.test.js:155` — asserts `ENTITY_PICK_FALLBACK_PX = 16` literal but source has `24` (constant drift, unrelated).
  - `test/event-log-rendering.test.js:61` — `formatGameEventForLog` no longer treats `building_destroyed` as noisy (filter list drift, unrelated).
  - `test/ui-voice-consistency.test.js:134` — main.js `window.__utopia` dev-gate regex no longer matches (regex too tight for current source, unrelated).
- **New passing**: 6 cases in the new test file. Net delta vs baseline: **+6 passing / 0 new red**.
- **Pre-existing skips**: 2 (already on baseline; not modified).

## Deviations from plan

- **Step 4 plan strategy choice**: Plan §4 Step 4 offered two paths (re-bind Digit0 vs. add KeyR + change Help text). Picked path 2 ("most-conservative") so `test/shortcut-resolver.test.js` stays green and Digit0 retains kitchen tool binding. KeyR added with no other handler conflicts.
- **Step 3 `state.debug.lastAiError` field skipped**: Plan §4 Step 3 mentioned routing original err.message into `state.debug.lastAiError`, but a code-search confirmed there is no top-level `state.debug` namespace (debug fields exist only on agent objects via EntityFactory and ai-related sub-objects). Used `pushWarning(state, ..., "ai-health")` plus `console.warn` instead — same observability outcome (dev panel reads warnings array; browser console retains diagnostic), no schema risk for snapshots.
- **Step 6 markup tweak**: Plan §4 Step 6 sketched the casual row as `<div class="small">` and the dev row as `<div class="small casual-hidden dev-only">`. Implemented exactly that, using the existing `engClasses = "casual-hidden dev-only"` template var so we stay consistent with neighbouring rows and the existing CSS gate.
- **Step 10 export footprint**: Plan §4 Step 10's first assertion (briefing formatter distinctness) required the format helpers to be importable. Smallest-blast-radius solution: added `export` keyword to `formatTemplatePressure` and `formatTemplatePriority` only — both were already free standalone functions, no callsite change. The third in-file helper (`formatTemplateLead`) stays internal.
- **CHANGELOG.md included in this commit**: Per CLAUDE.md "Every commit must include a corresponding update to CHANGELOG.md" and per the dispatcher's instruction "prefer to include CHANGELOG.md edits in the SAME commit". Implementer template's "do NOT amend" rule was respected (single commit, no `--amend`).

## Handoff to Validator

- **Browser smoke focus** (per plan §6 manual verification list):
  1. Boot `npx vite` with no `VITE_AI_PROXY_KEY` env var. Watch the action-message strip for ~2 seconds. **Expect**: neutral text `"Story AI is offline — fallback director is steering. (Game still works.)"`. **Reject**: red toast or `"AI proxy unreachable (fetch failed)..."` text.
  2. Wait for an active session, hold zoom-in for a few seconds, then press `R`. **Expect**: camera reset to default framing. Press `0`. **Expect**: kitchen build tool selected (legacy behaviour preserved).
  3. Open Help dialog with `F1`. **Expect**: Resource Chain tab is active by default (not Controls). Click Controls. **Expect**: "R or Home resets camera (number keys 1-0/-/= are build tools)" bullet present.
  4. Click any worker mid-game. **Expect**: `Health: Healthy (100%)` row visible at top of the engineering rows; no `hp=100.0/100.0` line in the casual profile (`?ui=full` query string). With `?ui=full&dev=1` (or Ctrl+Shift+D dev-mode), `Vitals (dev): hp=100.0/100.0 | hunger=0.639 | alive=true` row should appear.
  5. Toggle Heat Lens (`L`) over a starved kitchen with neighbouring grass. **Expect**: coloured halo rings on the 4-way neighbours, no `"halo"` text label hovering on those tiles. Primary markers (e.g. `"input starved"`) keep their text.
  6. Open Help → Controls and confirm "0 resets camera" string is gone.
- **No benchmark required for this plan** — all edits are UI/string only and do not enter the simulation update loop. If validator wants a sanity bench: `node scripts/long-horizon-bench.mjs --seeds 42 --template temperate_plains` should produce a DevIndex within ±0.5 of the v0.8.1 baseline (44).
- **Locked surfaces for downstream Wave-1 plans** (per summary §3 Wave-1 locked paths):
  - `src/render/PressureLens.js:409` halo `label: ""` — Wave-2 02a may NOT rewrite this line (its "near <parent>" tooltip plan goes through a hover-tooltip path).
  - `src/render/SceneRenderer.js#updatePressureLensLabels` empty-label `display:none` short-circuit — 01b/02b/01c may union additional handling above/below it but should NOT remove this `if` branch.
  - `src/app/GameApp.js` proxy-down/no-key `actionMessage` strings + `pushWarning("ai-health")` channel — 01c/02b may extend (e.g. add `state.debug.lastAiError` field if 01c lands the centralised dev gate) but MUST keep the in-fiction wording.
  - `src/app/shortcutResolver.js` `KeyR` branch + updated `SHORTCUT_HINT` — 01b/02b/02c may add new keys (Space phase guard / F1 / `[` / `]`) but MUST keep `KeyR → resetCamera`.
  - `src/ui/panels/EntityFocusPanel.js` Health row + `Vitals (dev):` row + `engClasses` on Position row — 02b/02d may extend with peckish/Family rows but MUST keep this dual-track.
  - `src/ui/hud/GameStateOverlay.js` `formatTemplatePressure` / `formatTemplatePriority` `export` — Wave-3 plans (02e finale fade) may add adjacent exports but MUST keep these two exported.
- **Known reviewer "UNREPRODUCIBLE" findings** (per plan §7) NOT fixed in this commit and intentionally left for orchestrator arbitration: (1) "Start Colony button silently fails", (2) "Build sidebar tab opens about:blank", (3) "Template dropdown immediately starts a new run", (4) "build buttons missing tooltips". Static code review confirmed the listed code paths do not produce those behaviours; reviewer evidence is most likely browser-extension or Playwright-snapshot artefact.
