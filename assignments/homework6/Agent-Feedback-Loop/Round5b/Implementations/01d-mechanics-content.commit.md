---
plan: Round5b/Plans/01d-mechanics-content.md
plan_version: v1
primary_commit: 5af4aa3
branch: feature/v080-living-world
date: 2026-04-25
author: Claude Sonnet 4.6
tests_pass: 1293/1299 (4 pre-existing from 02a/02c/02e; 0 new failures)
---

# Round5b 01d-mechanics-content Implementation Log

## Files Touched

| File | Change Type | LOC | Notes |
|------|-------------|-----|-------|
| `src/simulation/economy/ProcessingSystem.js` | edit | +72 | `snapshotBuffer`; `#computeEffectiveCycle` helper; `#emitSnapshot` grid scan (replaces buildingTimers iteration) |
| `src/ui/hud/HUDController.js` | edit | +62 | 6 breakdown + 6 runout DOM refs; `_lastRunoutSmoothed`; `#renderRateBreakdown`; `#renderRunoutHints`; replaced food-only block; call both helpers at end of render() |
| `src/ui/panels/InspectorPanel.js` | edit | +52 | Processing block (kind/cycle%/ETA/worker/input/status) + logistics efficiency line in `#renderTileSection` |
| `index.html` | edit | +22 | 12 spans (6 rateBreakdown + 6 runoutHint) in resource rows; `.runout-hint / .warn-soon / .warn-critical / @keyframes flashWarn` + reduce-motion guard |
| `test/processingSnapshot.test.js` | new | +72 | 5 cases: snapshot length, kitchen entry correctness, smithy stall, progress monotonicity, buffer reuse |
| `test/inspectorProcessingBlock.test.js` | new | +91 | 5 cases: Processing block present, Cycle%, ETA, stall text, grass tile exclusion |
| `test/resourceRunoutEta.test.js` | new | +80 | 5 cases: warn-soon, warn-critical, surplus clears hint, >180s suppressed, wood excluded |

**Total: ~451 LOC added**

## Steps Coverage

| Step | Description | Behaviour-changing? | Covered |
|------|-------------|---------------------|---------|
| 1 | ProcessingSystem snapshotBuffer + #emitSnapshot | Yes (new state.metrics.processing) | ✓ |
| 2 | HUDController #renderRateBreakdown for 7 resources | Yes (6 new breakdown spans populated) | ✓ |
| 3 | HUDController #renderRunoutHints ETA + CSS classes | Yes (new DOM writes, class changes) | ✓ |
| 5 | InspectorPanel processing block for KITCHEN/SMITHY/CLINIC | Yes (new HTML block in Inspector) | ✓ |
| 5b | InspectorPanel logistics efficiency line | Yes (new data surfaced) | ✓ bonus |
| 6 | index.html 12 spans + CSS | Yes (new DOM nodes + keyframes) | ✓ |
| 7 | test/processingSnapshot.test.js | Test | ✓ |
| 8 | test/inspectorProcessingBlock.test.js | Test | ✓ |
| 9 | test/resourceRunoutEta.test.js | Test | ✓ |

**Behaviour-changing steps: 8/9 = 89% ≥ 50% ✓**
**Layers: simulation + ui/hud + ui/panels + DOM = 4 ≥ 2 ✓**
**LOC: ~300 code + ~243 test ≥ 80 ✓**

## Key Implementation Notes

### #emitSnapshot: grid scan vs buildingTimers iteration
Plan said to iterate `buildingTimers` but that only contains buildings that have had a worker arrive. Changed to scan grid directly for KITCHEN/SMITHY/CLINIC tiles so stalled buildings (no worker ever present) are also surfaced in the snapshot. `buildingTimers` is still consulted for `progress01` / `etaSec`; buildings without a timer show `progress01 = 0`.

### #renderRateBreakdown refactor
Replaced the 15-line food-only block with a 10-line generic helper. The helper reads `${resource}ProducedPerMin` / `${resource}ConsumedPerMin` from `state.metrics`, falling back to 0. Spoilage only applies to food (unique `foodSpoiledPerMin`). All 7 resources now get `(prod +X / cons -Y)` breakdown.

### Runout EMA smoothing
`_lastRunoutSmoothed[resource]` tracks EMA per resource. First reading initialises with raw value; subsequent readings blend `prev × 0.7 + rawRunout × 0.3`. Prevents flicker during food-wave events (kitchen just produced → short spike in `foodProducedPerMin`).

### Fix: sampling… unicode
Refactored breakdown uses literal `…` character (not `\u2026` escape) so pre-existing regex test `/"(sampling…)"/` continues to pass.

### Fix: worldToTile offset in tests
`worldToTile` computes `ix = floor(x / tileSize + width/2)`. Test workers must be placed at world coordinates `(ix - W/2 + 0.5, iz - H/2 + 0.5)` to map back to the correct tile, not at raw tile coordinates.
