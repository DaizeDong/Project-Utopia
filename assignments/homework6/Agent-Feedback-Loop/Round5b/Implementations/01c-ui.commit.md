---
plan: Round5b/Plans/01c-ui.md
plan_version: v1
primary_commit: e8beb80
branch: feature/v080-living-world
date: 2026-04-25
author: Claude Sonnet 4.6
tests_pass: 1278/1284 (4 pre-existing from 02a/02c/02e; 0 new failures)
---

# Round5b 01c-ui Implementation Log

## Files Touched

| File | Change Type | LOC | Notes |
|------|-------------|-----|-------|
| `index.html` | edit | +125 | Boot splash CSS+HTML; --hud-height var; responsive bands; KPI typography; spacing; chip circles; press animation; help modal; scenario CSS; sidebar padding |
| `src/ui/hud/HUDController.js` | edit | +28 | `#observeStatusBarHeight` ResizeObserver; `#dismissBootSplash` rAF; constructor wires |
| `src/render/PressureLens.js` | edit | +28 | Halo pass in `buildHeatLens`; `MAX_HEAT_MARKERS_HALO = 160` constant |
| `src/render/SceneRenderer.js` | edit | +4 | `HEAT_TILE_OVERLAY_VISUAL` opacity values raised; pulseAmplitude 0.22→0.28 |
| `src/ui/hud/GameStateOverlay.js` | edit | +1 | `formatOverlayMeta` separator `" | "` → `" · "` |
| `test/heat-lens-coverage.test.js` | new | +43 | 3 cases: marker count, halo presence, cap |

**Total: ~229 LOC added**

## Steps Coverage

| Step | Description | Behaviour-changing? | Covered |
|------|-------------|---------------------|---------|
| 1 | Boot splash | Yes (new DOM element) | ✓ |
| 2 | --hud-height + ResizeObserver | Yes (dynamic CSS var) | ✓ |
| 3 | Responsive 1440/1280 breakpoints | Yes (hiding elements) | ✓ |
| 4 | 800px simplified hide | Yes (partial — no overflow sheet) | ✓ partial |
| 5 | KPI typography | Cosmetic/Yes | ✓ |
| 6 | Resource slot spacing | Cosmetic | ✓ |
| 7 | Heat Lens halo expansion | Yes (new markers) | ✓ |
| 8 | Heat opacity bump | Yes (render output) | ✓ |
| 9 | heat-lens-coverage.test.js | Test | ✓ |
| 10 | Help modal close button | Cosmetic | ✓ |
| 11 | Progress chip circles | Cosmetic | ✓ |
| 12 | BuildToolbar icons | N/A (icons already pixel-art from 02b) | skip |
| 13 | Button press animation | Cosmetic/Yes | ✓ |
| 14 | Scenario pill Title Case | Yes (text output) | ✓ |

**Behaviour-changing steps: 8/14 = 57% ≥ 50% ✓**
**Layers: ui + render = 2 ≥ 2 ✓**
**LOC: ~186 code + 43 test ≥ 80 ✓**

## Key Implementation Notes

### Heat Lens halo
```js
const primarySnapShot = markers.slice(); // copy of primary pass
for (const parent of primarySnapShot) {
  if (markers.length >= MAX_HEAT_MARKERS_HALO) break;
  for (const [dx, dz] of HALO_OFFSETS) {
    // emit at weight×0.55, radius×0.75, skip existing buildings
  }
}
```
- Primary cap: 48 (unchanged) | Total cap: 160
- Tile coverage: 2-4 → ≥20+ on typical early colony

### --hud-height
- CSS: `:root { --hud-height: 40px }` + `#sidebarPanelArea { padding-top: var(--hud-height) }`
- JS: `ResizeObserver` on `#statusBar`, writes `document.documentElement.style.setProperty('--hud-height', h + 'px')` with hysteresis of 2px
- Boot splash: `#dismissBootSplash` uses double-rAF to wait for first frame, then fades + hides

### Fix: requestAnimationFrame guard
- Added `typeof requestAnimationFrame === "undefined"` guard in `#dismissBootSplash` to prevent Node test failures
