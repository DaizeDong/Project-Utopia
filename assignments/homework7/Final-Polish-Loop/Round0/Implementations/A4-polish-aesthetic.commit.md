---
reviewer_id: A4-polish-aesthetic
plan_source: Round0/Plans/A4-polish-aesthetic.md
round: 0
date: 2026-05-01
parent_commit: ff75e2e
head_commit: 0ff7287
status: DONE
track: both
freeze_check: PASS
track_check: PASS
steps_done: 6/6
tests_passed: 1664/1672
tests_new: test/dayNightLightingTint.test.js (8 tests)
---

## Steps executed

- [x] Step 1: status bar overflow at 1920×1080 — `index.html` `#aiAutopilotChip`
  CSS clamp widened to `clamp(180px, calc(100vw - 720px), 460px)` and
  `white-space: nowrap` so the long autopilot string ellipsizes onto a single
  line. `title=` tooltip already carries the verbose copy via HUDController.
- [x] Step 2: main-menu / canvas duplicate map-preview labels —
  `src/render/PressureLens.js` `buildRouteMarkers` collapsed from
  per-gap-tile emission to a single per-route marker at the gap centroid.
  Source-side dedup; `dedupPressureLabels` test contract preserved (still
  emits 2 markers for distinct routes far apart).
- [x] Step 3: Lumber Mill / Lumber terminology drift — `index.html` 8 sites
  (build toolbar tooltip, Help modal × 2, hud-resource title, Resources
  panel × 1, Population panel, overlay menu lead, header chip prose) all
  consolidated onto canonical "Lumber Camp" — matches the pre-existing
  `ProgressionSystem.js` milestone copy "First Lumber camp raised" and the
  `BuildAdvisor.js` toolbar label "Lumber".
- [x] Step 4: inspector empty-state hint anchoring at 1366×768 —
  `index.html` adds `.inspector-empty-hint` CSS (relative-positioned
  dashed-border card, centred text, downward-arrow glyph); both the
  static initial paint AND the dynamic `EntityFocusPanel.js` re-render
  paths (`No entity selected.` / `Selected entity not found.`) wrap the
  prose in the new class.
- [x] Step 5: day-night lighting tint — `src/render/AtmosphereProfile.js`
  exports new pure helpers `applyDayNightModulation`, `getDayNightPhase`,
  `computeDayNightTint`, `quantizeDayNightPhase`, `DAY_NIGHT_TINT_BINS`.
  `src/render/SceneRenderer.js` `#applyAtmosphere` calls the modulation
  with phase quantized to 32 bins so the tinted profile only re-blends
  when the bin index changes (~once every 2.8 s on the default cycle).
  4-stop ramp per plan: dawn `#ffd9a8` → day `#ffffff` → dusk `#ffb574`
  → night `#3a4a78`; ambient intensity 0.85→1.20→0.85→0.45; sun intensity
  0.70→1.00→0.70→0.20; mixed at 35 % strength against the scenario/
  weather-derived base. Reads phase from `state.environment.dayNightPhase`
  (pre-existing, set by `SimulationClock.update` with period
  `DAY_CYCLE_PERIOD_SEC = 90` s = `BALANCE.dayCycleSeconds`); falls back
  to `(timeSec % 90) / 90` for test rigs that don't tick the clock.
  **No new mesh / shadow rig / asset / panel.**
- [x] Step 6: CHANGELOG.md — added `## [Unreleased] — HW7 Final Polish
  Loop Round 0` section at top with Polish/Deferred/Files/Tests
  subsections, listing each fix and explicitly recording the audio /
  tile-blend / walk-cycle / building-silhouette / weather-particles /
  post-FX deferrals under the freeze.

## Tests

- pre-existing skips (4): unchanged.
- pre-existing failures (4 — all confirmed at parent ff75e2e):
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
- new tests added: `test/dayNightLightingTint.test.js` (8 tests, all pass)
  - 4-stop ramp at canonical phases (color ±2 hex channel, intensity ±0.02)
  - smooth interpolation between stops (mid-rise 0.125, mid-pre-dawn 0.875
    exercises the phase-wrap path)
  - phase normalisation outside `[0,1)` (1.25 ≡ 0.25, -0.25 ≡ 0.75)
  - quantizeDayNightPhase distributes 1000 random phases into >24 of 32 bins
    and stays within `[0, 31]`
  - quantizeDayNightPhase clamps phase 1.0 → 0, phase 0.999 → 31
  - getDayNightPhase reads `state.environment.dayNightPhase` and falls back
    to `(timeSec % 90) / 90`
  - applyDayNightModulation is pure (input frozen → no mutation throw) and
    clamps intensities into `[0.18, 1.6]` ambient / `[0.08, 1.5]` sun /
    `[0.16, 0.78]` hemi
  - applyDayNightModulation produces darker night than noon (sanity)
- failures resolved during iteration: 1 — `getDayNightPhase reads
  state.environment.dayNightPhase when present` initially used
  `assert.equal(getDayNightPhase({ env: { dayNightPhase: 0.42 } }), 0.42)`
  but `((0.42 % 1) + 1) % 1 = 0.41999999...` (floating-point noise);
  switched to `approxEqual(_, _, 1e-9)`.

## Deviations from plan

- Plan suggested `test/ui/dayNightLightingTint.test.js` (subdirectory).
  Implementer placed the test at `test/dayNightLightingTint.test.js`
  (flat) to match the `node --test test/*.test.js` glob actually used by
  `package.json` and the rest of the test suite. Functional equivalent.
- Plan suggested adding `_updateDayNightTint(dayPhase)` directly on
  `SceneRenderer`. Implementer instead extracted the modulation into a
  pure function `applyDayNightModulation(profile, phase)` exported from
  `AtmosphereProfile.js`, so the unit test does NOT need to instantiate
  Three.js — same outcome, zero test-rig coupling.
- Plan recommended `Lumber Camp` as the canonical name; implementer
  confirmed via `BuildAdvisor.js` (label `Lumber`) and `ProgressionSystem.js`
  (milestone `First Lumber camp raised`) and adopted "Lumber Camp" across
  all 8 sites. The toolbar button face still says "Lumber" (single-word
  short label, unchanged); the title= tooltip and Help modal both now say
  "Lumber Camp".
- Step 2 — plan suggested either dedupe by `(mapId, labelText)` tuple OR
  clear the label container. Implementer applied the source-side fix
  (collapse `buildRouteMarkers` to one centroid per route) which is
  cleaner and orthogonal to the existing `dedupPressureLabels` flow. The
  existing `pressure-lens-label-dedup.test.js` `same-label far-apart: 2
  east trade route → both kept` contract is unaffected because that test
  passes synthetic entries directly to `dedupPressureLabels`, not via
  `buildRouteMarkers`.

## Freeze / Track check 结果

- **Freeze check: PASS.** No new TILE constant, no new role enum value, no
  new building blueprint, no new audio asset import, no new UI panel
  file, no new mesh / shadow-mapping rig, no new shader / texture asset.
  All lighting changes mutate the EXISTING `THREE.AmbientLight` +
  `THREE.DirectionalLight` colour & intensity off the EXISTING day-cycle
  clock (`BALANCE.dayCycleSeconds` = 90 s, set by
  `SimulationClock.update`).
- **Track check: PASS** (track = both). Touched: `src/` (4 files), `test/`
  (1 new), `index.html` (1 file), `CHANGELOG.md` (1 file). Did NOT touch:
  `README.md`, `assignments/homework7/**` (other than this commit log,
  which is the implementer output contract), `docs/**`.

## Handoff to Validator

- **Browser smoke (1920×1080):** open `npx vite` → enable Autopilot, run
  20 s, take a screenshot of the top bar — autopilot pill must NOT
  overflow; ellipsis visible if text exceeds; `title=` tooltip on hover
  shows the verbose autopilot string. Compare against
  `screenshots/A4/steam-1.png` baseline.
- **Browser smoke (1366×768):** open inspector empty state — hint must
  appear inside `#entityFocusOverlay` panel as a dashed-border card with
  centred prose, NOT floating mid-canvas. Compare against
  `screenshots/A4/17-1366.png`.
- **Help modal terminology:** Press F1, search the modal text — there
  must be 0 occurrences of "Lumber Mill" or "lumber mills"; canonical
  name is "Lumber Camp" / "Lumber Camps".
- **Day-night smoke:** run game 90 s (one full day cycle) — observe
  warm-shift at start, neutral at midpoint, cool blue tint near end of
  cycle. Quantization (32 bins) means tint should step every ~2.8 s
  rather than continuously; this is intentional to keep the per-frame
  cost bounded. No flicker.
- **Map-preview duplicate labels:** open game with frontier_repair
  scenario and the heat lens off (route lens default). Each unrepaired
  route must show ONE label at the gap centroid, not multiple labels at
  per-tile positions.
- **FPS regression:** `browser_evaluate` 5 s avg should still be ≥ 55 fps
  at 1920×1080 / default scenario (lighting tint reuses cached profile
  and only re-blends on bin change).
- **Prod build:** `npx vite build` should succeed with no errors;
  `vite preview` 3-min smoke, zero console errors.
- **Existing test invariants preserved:**
  `test/atmosphere-profile.test.js` (pure-function `deriveAtmosphereProfile`
  unchanged); `test/pressure-lens.test.js` (route marker still emitted at
  least once per unrepaired route — only count changed from N gap tiles
  to 1 centroid); `test/pressure-lens-label-dedup.test.js` (dedup helper
  untouched).
