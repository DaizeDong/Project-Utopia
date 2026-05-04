---
reviewer_id: A4-polish-aesthetic
reviewer_tier: A
feedback_source: assignments/homework7/Final-Polish-Loop/Round0/Feedbacks/A4-polish-aesthetic.md
round: 0
date: 2026-05-01
build_commit: 3f87bf4
priority: P0
track: both
freeze_policy: hard
estimated_scope:
  files_touched: 6
  loc_delta: ~180
  new_tests: 1
  wall_clock: 25
conflicts_with: []
rollback_anchor: 3f87bf4
---

## 1. 核心问题

A4 returns RED (3/10) with 3 categories of polish gap and 6 specific bugs. Under the HW7 hard freeze (no new tile / role / building / mechanic / audio asset / UI panel) the 3 RED categories must be split:

1. **Pure code polish, no freeze concerns (wave-0)** — 4 specific bugs are surface-level layout / terminology / rendering issues that are unambiguously polish:
   - **P0 status bar overflow at 1920×1080** when Autopilot pill is long (`Autopilot ON · fallback/llm ｜ Recovery: … ｜ Autopilot struggling…`) — clipping above canvas.
   - **P0 main-menu map-preview duplicate label render** ("west h... west lumber route") — labels overlap themselves.
   - **P2 "Lumber Mill" vs "Lumber" terminology drift** between Help modal and build toolbar.
   - **P2 unanchored Inspector hint** floating mid-canvas at 1366×768.
2. **Day-night lighting tint (wave-0, edge of freeze)** — `BALANCE.dayCycleSeconds=90` already exists. Tinting ambient + directional light color & intensity off the existing day-phase clock is a parameter change to existing scene lights, NOT a new mechanic / asset / panel. Allowed. Adding a new sun/moon mesh, shadow-mapping rig, or particle system is **NOT** allowed under this round.
3. **Hard-freeze deferrals (documented in CHANGELOG, not implemented)**:
   - **No audio** — repo has zero audio assets, no Howler/Tone, no `<audio>` tags. Adding even one SFX = new asset import = freeze violation. Document as deferred; do not add.
   - **Tile checkerboard seams** — fixing requires either material rework (new shader/texture asset = freeze risk) or per-tile color noise reduction (touches `src/render/*` heavily). Defer to wave-1.
   - **Worker walk animation** — current is mesh teleport. Linear position interpolation between FSM ticks is in-scope polish for a future wave; new skeletal rig is forbidden. Defer to wave-1.
   - **Building 3D silhouette diversity, fog soft falloff, weather particles** — wave-1+.

This plan is **wave-0 of 2**: 4 specific bugs + minimal lighting tint + a CHANGELOG note that records the freeze-deferred items. Wave-1 (renderer polish) is queued for HW7-Round-1+.

## 2. Suggestions (可行方向)

### 方向 A: Wave-0 surgical fix — 4 bug fixes + 1 lighting tint + CHANGELOG deferral note (RECOMMENDED)

- 思路: Land the 4 specific layout / terminology bugs A4 called out (all single-file, single-function), tie ambient + directional light color/intensity to the existing `state.time.dayPhase` so the world warms at "morning" and cools at "night" without any new asset, and add a CHANGELOG entry that explicitly defers audio + tile-blend + walk-cycle to wave-1.
- 涉及文件: `src/ui/topBar.*` or status-bar component, `src/ui/mainMenu.*` (map preview labels), `src/ui/helpModal.*` or buildToolbar (terminology), `src/ui/inspectorPanel.*` (anchor), `src/render/SceneRenderer.js` (lighting tint), `CHANGELOG.md` (deferral note).
- scope: 小-中 (~6 files, ~180 LOC).
- 预期收益: Closes both P0 + both P2 specific bugs A4 reported. Lighting tint addresses V1 (lighting score 2/10) at lowest possible asset cost. CHANGELOG note converts the audio/seams/walk-cycle gaps from "missed" to "consciously deferred under freeze".
- 主要风险: Lighting tint may conflict with weather overlay color; FPS regression possible if light-update runs every frame instead of every dayPhase delta. Mitigated by gating on dayPhase quantum (e.g. update only when phase bin changes).
- freeze 检查: **OK**. No new tile / role / building / mechanic / asset / panel. Lighting tint mutates existing `THREE.AmbientLight` + `THREE.DirectionalLight` parameters that already exist in SceneRenderer init.

### 方向 B: Defer everything visual to wave-1, ship docs-only round

- 思路: Acknowledge in CHANGELOG + post-mortem that A4's RED is largely beyond freeze scope; do not touch code at all; queue a dedicated visual-pass milestone.
- 涉及文件: `CHANGELOG.md`, `docs/post-mortem/2026-05-01-a4-visual-deferral.md` (new file).
- scope: 小 (~30 LOC docs only).
- 预期收益: Zero risk of breaking existing tests / FPS. Cheapest possible round.
- 主要风险: A4 will return RED again next round on the same 4 specific bugs that were unambiguously fixable. Wastes a polish round.
- freeze 检查: OK.

### 方向 C: Full visual pass — fix tile seams + add walk cycle + day-night

- 思路: Address V1, V2, V4 in one round by rewriting tile material to merge same-type neighbors, adding linear interp on `worker.mesh.position` between FSM ticks, and a full lighting day-night.
- 涉及文件: `src/render/SceneRenderer.js`, `src/render/proceduralTextures.js`, `src/render/entityRenderer.js`, plus new `src/render/walkInterpolator.js`.
- scope: 大 (~600 LOC).
- 预期收益: Would lift A4 score by 2-3 points.
- 主要风险: **FREEZE-VIOLATION**. New `walkInterpolator.js` introduces a new render-pipeline component arguably qualifying as a new mechanic; tile-merge rewrites existing materials → high regression risk on entity z-fighting & overlay layers. LOC ≥ 400 cap on plan.

## 3. 选定方案

选 **方向 A** (wave-0 surgical). Maximum reviewer-visible progress under HARD freeze: closes 4 of 6 numbered bugs A4 listed (incl. both P0s), addresses V1 at minimum cost via existing-light tinting, and converts the freeze-blocked items (audio / seams / walk cycle) from silent gaps into explicit, traceable deferrals. Wave-1 will tackle V2 / V4 renderer polish once freeze loosens.

## 4. Plan 步骤

- [ ] Step 1: `src/ui/topBar.js` (or whichever module renders `.status-bar` / autopilot pill — Implementer to confirm via `grep -rn "Autopilot" src/ui`) — `edit` — wrap the autopilot status string in a CSS clamp container: `max-width: calc(100vw - 320px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` plus `title={fullText}` for hover. If the pill is in `index.html` static DOM, edit there + corresponding CSS in `src/ui/styles.css`. Resolves V5 P0 #1.

- [ ] Step 2: `src/ui/mainMenu.js` (or wherever map-preview labels render — search `grep -rn "lumber route\|west" src/ui`) — `edit` — at the label-render function, dedupe by mapId before drawing OR clear the label canvas/DOM container before each render pass. Bug is double-render of overlapping label nodes; fix is a single `container.innerHTML = ''` (or React/render equivalent) before append. Resolves V5 P0 #2.

- [ ] Step 3: `src/ui/helpModal.js` or `src/config/buildingMeta.js` — `edit` — pick canonical name (recommend `Lumber Camp` since toolbar label is `Lumber` and the building actually is a camp not a mill — verify in `BUILDINGS` const). Update Help modal text to match toolbar. Single-string change. Resolves V5 P2 #1.

- [ ] Step 4: `src/ui/inspectorPanel.js` (search `grep -rn "Click a worker, visitor" src/ui`) — `edit` — anchor the empty-state hint to the panel container with `position: relative` (not `position: absolute` over canvas). Add CSS `.inspector-empty-hint { position: relative; padding: 12px; text-align: center; }`. Resolves V5 P2 #2.

- [ ] Step 5: `src/render/SceneRenderer.js:<lighting-init-function>` (search `grep -n "AmbientLight\|DirectionalLight" src/render/SceneRenderer.js`) — `edit` — add a `_updateDayNightTint(dayPhase)` method:
  - Read `state.time.dayPhase ∈ [0,1)` from existing day cycle.
  - Compute ambient color from a 4-stop ramp: dawn `#ffd9a8` (phase 0.0-0.25), day `#ffffff` (0.25-0.5), dusk `#ffb574` (0.5-0.75), night `#3a4a78` (0.75-1.0). Use `THREE.Color.lerpColors`.
  - Compute ambient intensity ramp: 0.55 → 0.95 → 0.55 → 0.30.
  - Compute directional intensity ramp: 0.7 → 1.0 → 0.7 → 0.15.
  - Quantize phase to 32 bins (only update when `Math.floor(dayPhase*32)` changes vs `_lastTintBin`) to avoid per-frame work.
  - Call from render loop AFTER the existing tick step.
  - depends_on: none

- [ ] Step 6: `CHANGELOG.md` — `edit` — under current unreleased section, add entry:
  ```
  ### Polish (HW7 Round 0 — A4 wave-0)
  - fix: status bar overflow at 1920×1080 (autopilot pill ellipsis)
  - fix: duplicate map-preview labels on main menu
  - fix: Lumber Mill ↔ Lumber terminology consistency
  - fix: inspector empty-state hint anchoring at 1366×768
  - polish: ambient + directional light tint follows BALANCE.dayCycleSeconds=90 (4-stop dawn/day/dusk/night ramp, 32-bin quantization)

  ### Deferred under HW7 hard freeze (queued for wave-1+)
  - V3 audio: zero audio assets ship; adding even 1 SFX = new asset import. Documented as design tradeoff; Master/Music/SFX volume sliders must land alongside first audio asset.
  - V2 tile checkerboard seams: requires material/shader rework; deferred to dedicated renderer pass.
  - V4 worker teleport-step: linear position interp between FSM ticks deferred; skeletal rig forbidden.
  - V1 fog-of-war hard edges, building 3D silhouette diversity, weather particles, post-FX (vignette/LUT): wave-1+.
  ```
  - depends_on: Steps 1-5

## 5. Risks

- Step 5 lighting tint may visually clash with the existing **PressureLens heat-mode** overlay (ambient color shift could re-tint the heat color ramp). Mitigation: heat-lens overlay is a separate post material with its own opacity; verify via Playwright that toggling heat-lens at "night" still reads cleanly.
- Step 5 quantization: if `state.time.dayPhase` doesn't exist yet, fall back to `(state.time.elapsedSec / BALANCE.dayCycleSeconds) % 1`. Verify `BALANCE.dayCycleSeconds` is the canonical knob (per CLAUDE.md it is, post-v0.8.5).
- Step 1 ellipsis may hide important autopilot text that A4's review actually wanted readable. Mitigation: add `title=` for tooltip on hover.
- Step 2 dedupe risks hiding a legitimate two-route map preview. Mitigation: dedupe by `(mapId, labelText)` tuple, not just `labelText`.
- 可能影响的现有测试: any UI snapshot test that checks status bar HTML structure (`test/ui/*topBar*.test.js`, `test/ui/*mainMenu*.test.js`, `test/ui/*inspector*.test.js`); SceneRenderer-init tests if they assert ambient light starts at a fixed color (`test/render/*.test.js`). Implementer should `grep -rn "AmbientLight\|status-bar\|inspector-empty" test/` before editing.

## 6. 验证方式

- 新增测试: `test/ui/dayNightLightingTint.test.js` — instantiate SceneRenderer with mock state, advance `dayPhase` through [0, 0.25, 0.5, 0.75], assert ambient color and intensity match expected ramp values within tolerance 0.02; assert quantization bin counter stays ≤ 32 over 1000 random advances.
- 手动验证 (Playwright):
  1. `npx vite` → open `http://127.0.0.1:5173`.
  2. Resize browser to 1920×1080, enable Autopilot, wait 20s, screenshot top bar — pill must NOT overflow, ellipsis visible if text exceeds; `title` tooltip on hover shows full text.
  3. Open main menu, screenshot map-preview labels — each label appears exactly once per route.
  4. Press F1, Help modal — search for "Lumber Mill" → must be 0 occurrences (or the toolbar must say "Lumber Mill"; pick one).
  5. Resize to 1366×768, click empty area on canvas — Inspector hint stays inside panel container, not floating mid-canvas.
  6. Run game 90s (one full day cycle) — observe ambient warm-shift at start, cool-shift at midpoint, dark-blue tint near end of cycle. No flicker (32-bin quantization).
- FPS 回归: `browser_evaluate` 5s avg ≥ 55 fps at 1920×1080 with default scenario (compare to baseline 3f87bf4).
- benchmark 回归: `scripts/long-horizon-bench.mjs` seed=42 / temperate_plains; DevIndex ≥ baseline - 5% (lighting tint is render-only, must not affect simulation).
- prod build: `npx vite build` no errors; `vite preview` 3-min smoke, zero console errors.

## 7. 回滚锚点

- 当前 HEAD: `3f87bf4`
- 一键回滚: `git reset --hard 3f87bf4` (orchestrator-only, on Implementer failure).

## 8. UNREPRODUCIBLE 标记

Not applicable — feedback includes labeled screenshots (`steam-1.png`, `01-game-start.png`, `17-1366.png` etc.) and explicit reproduction steps for all 6 numbered bugs. Implementer may run Playwright at the listed resolutions to confirm before / after.
