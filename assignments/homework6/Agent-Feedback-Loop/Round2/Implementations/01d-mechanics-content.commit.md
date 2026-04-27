---
round: 2
reviewer_id: 01d-mechanics-content
wave: 1
commit: d912248
parent_commit: aeb6543
tests: 1031/1033 pass, 2 skipped, 0 failed
---

## Summary
- Added `BALANCE.heatLensStarveThreshold` and switched Heat Lens processor starvation checks from zero-only to pre-empty warning thresholds.
- Added full-tile Heat Lens color planes and a node-gated placement overlay in `SceneRenderer`, backed by pure `classifyPlacementTiles`.
- Exported `NODE_GATED_TOOLS`, expanded tile insight text with terrain/soil/node/visibility lines, and refreshed Heat Lens glossary copy.

## Verification
- `node --check src/render/PressureLens.js`
- `node --check src/render/SceneRenderer.js`
- `node --check src/ui/interpretation/WorldExplain.js`
- `node --test test/heat-lens-tile-overlay.test.js test/placement-lens.test.js test/pressure-lens.test.js test/world-explain.test.js test/ui/hud-glossary.test.js`
- `node --test test/*.test.js`

## Notes
- No new tile, building, mechanic, asset, or build-tool type was added.
- Heat marker opacity/radius constants were left available for Wave 3 `01e`; this commit routes heat mode through full-tile planes and hides the older disc/ring markers for heat mode.
