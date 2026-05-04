---
iter: 5
parent: f1ba30d
head: 2f31346
gaps_addressed: 2
commits: 2
verdict: GREEN
---

## Status per gap

### Gap A — `extractor-saturated` highlight broadened — DONE

- Removed the `wood>=15 + stone>=8 + food>=30` resource floor that suppressed the highlight on wood-starved colonies.
- New softer non-bootstrap gate (`workers>=10 AND extractionSites>=5`):
  - `foodFlow (>=8) AND (woodFlow (>=4) OR stoneFlow (>=2))`, **OR**
  - `woodStarvedExtractorTreadmill` (`wood<4 AND extraction>=5`) — wood-starved colonies that keep building extractors but never accumulate enough wood to switch to processing, **OR**
  - `processingSiteCount === 0` zero-processing short-circuit.
- 3 new unit tests in `test/prompt-payload.test.js` cover (1) wood-starved triggering, (2) zero-processing triggering at low resources, (3) bootstrap colony correctly suppressed.
- Commit: `3c987c8`.

### Gap B — 1060 px viewport sidebar overflow — DONE

- Added `@media (min-width: 1025px) and (max-width: 1080px)` block in `index.html`.
- `--sidebar-width: 256px` (was clamped 280 at this band) pulls panel in 24 px.
- Panel-body padding `6px → 5px 4px`; font-size `12 → 11`; recruit/kv `11 → 10.5`.
- Hides the literal "Auto" text label so checkbox + status row fit one line (tooltip on parent label preserves accessibility).
- Above 1080 px: existing `clamp(280px, 22vw, 460px)` resumes — zero visible change. ≤1024 px: existing bottom-bar collapse already handles it.
- Commit: `2f31346`.

## Files changed

- `src/simulation/ai/llm/PromptPayload.js` (+25 / -7 in `pickHighlights`)
- `test/prompt-payload.test.js` (+47 / -0, three new tests)
- `index.html` (+23 / -0, new media block after the existing 1025-1200 block)

No CHANGELOG touched (per hard rule). No new tile/role/building/mood/mechanic. Stayed within `src/**` + `test/**` + `index.html`.

## Tests

```
# tests 1787
# pass  1778
# fail  5     ← all pre-existing baseline (escalation-lethality / ResourceSystem flush /
                RoleAssignment 1-quarry / RaidEscalator log curve / RaidFallbackScheduler popFloor)
# skip  3
```

`test/prompt-payload.test.js` in isolation: `5 pass / 0 fail / 0 skip` (3 new + 2 carryover). Same 5 baseline failures as iter4 parent `f1ba30d`. **No new regressions.**

## Head

`2f31346` (parent `f1ba30d` → `3c987c8` Gap A → `2f31346` Gap B). 2 commits, within the ≤2 budget.
