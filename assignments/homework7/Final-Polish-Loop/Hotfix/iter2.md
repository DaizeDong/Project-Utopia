---
iter: 2
parent: 75b180e
head: 4814af5
gaps_closed: [A, B, C]
gaps_remaining: []
tests: 1776/1784
---

## Gap A — Heat Lens Help 4-bullet

- File:line edits:
  - `index.html:3535-3542` — replaced the 2-line `<p>` paragraph in
    `section[data-help-page="different"]` with a 4-bullet `<ul>` covering:
    (1) what the lens shows (worker bottlenecks, red surplus / blue starved),
    (2) severity by circle size, (3) how to fix it (Warehouse near red,
    Road toward blue, re-route), and (4) keyboard shortcut `L` + legend
    pointer.
- Pre-existing typos noted by validator (`<\code>`, `<\i>`) were a
  markdown-escaping artifact in the validator note itself, not actual
  source content — verified via `Grep '\\code|\\i>'` returning no matches.
  The file already had `<code>L</code>` and `<i>heat</i>` correctly.
- Browser verify: navigated `http://127.0.0.1:5173/`, pressed F1, clicked
  `[data-help-tab="different"]`. Confirmed via DOM query that the next
  sibling of the `Supply-Chain Heat Lens` `<h3>` is now `UL` containing
  the 4 expected bullets (innerHTML inspection). Screenshot saved at
  `output/hotfix-iter2/01-help-heat-lens-4bullets.png`.
- Commit: c5cf0d5

## Gap B — Stone runtime materialization

- Root cause: when every STONE node sits in HIDDEN fog of war,
  `evaluateBuildPreview` rejects quarry placement with `hidden_tile`
  before the `quarry@95` priority can land. `findNodeFlagTiles` enumerates
  all node tiles regardless of fog state, but `previewToolAt` is the gate.
  The colony stays starved of stone forever despite the iter1 priority bump.
- File:line edits:
  - `src/simulation/meta/ColonyDirectorSystem.js:3` — import `FOG_STATE`.
  - `src/simulation/meta/ColonyDirectorSystem.js:553-665` — new
    `proposeScoutRoadTowardFoggedStone(state, buildSystem, services)`.
    Conditions: `stoneStock < 15` AND zero EXPLORED/VISIBLE STONE nodes
    AND ≥1 HIDDEN STONE node, throttled to ≤1 scout road / 30 sim-sec
    via `lastStoneScoutProposalSec`. Algorithm: collect every GRASS tile
    that is currently visible AND adjacent to existing infrastructure
    (warehouse / road / bridge); score each by Manhattan distance to the
    closest hidden STONE node; first preview-ok candidate wins.
  - `src/simulation/meta/ColonyDirectorSystem.js:1133-1145` — wired the
    new proposer into `ColonyDirectorSystem.update` right after the
    existing bridge proposer (both run before the priority queue).
  - `test/hotfix-batchB-survival-safety.test.js:147-263` — +2 new tests:
    one positive (scout-road fires when stone is critical and STONE nodes
    are all fog-hidden) and one counter-test (does NOT fire when stone is
    healthy).
- Browser verify: navigated `http://127.0.0.1:5173/?dev=1`, started
  Temperate Plains, set autopilot ON, `state.resources.stone = 0`,
  `wood = 200`, `timeScale = 8`. Force-flipped fog state of every STONE
  node to HIDDEN (36 nodes total). After ~80 sim-sec runtime,
  `state.ai.colonyDirector.lastStoneScoutProposalSec` populated to
  `207.07` confirming the proposer fired multiple times and placed
  scout-road blueprints toward the fogged stone clusters. Screenshot
  saved at `output/hotfix-iter2/02-scout-road-fired.png`.
- Commit: 31a16eb

## Gap C — 1280 chip priority

- Done. Iter1's priority hider at 1280×720 keyed off
  `scrollWidth > clientWidth + 4`, which the inner `.hud-goal-list
  { flex-wrap: wrap }` rule absorbs into a 2nd row rather than into
  horizontal scroll, so the hider never engaged.
- File:line edits:
  - `src/ui/hud/HUDController.js:453-485` — added `hasWrappedRow()` that
    walks visible children of `.hud-goal-list` (fallback: bar children)
    and treats any vertical dispersion of `offsetTop` > 6 px as overflow.
    Composed into `isOverflowing()` via short-circuit OR so the existing
    width-overflow path is unchanged. Deliberately avoided keying off the
    bar's own `clientHeight` because the 1025-1366 media query sets a
    hard `min-height: 56px` floor.
- Browser verify: viewport `1280×720`. Pre-fix the bar held 6 goal chips
  on 2 rows (offsetTops `[19, 19, 19, 0, 0, 0]`); post-fix the priority
  hider trimmed `nth-child(>=3..5)` goal chips + `storytellerStrip` +
  `statusBuildHint` + `statusScoreBreak` + `latestDeathRow`, leaving 5
  resource chips + 2 goal chips on a single effective row, no clipped
  text. Screenshot: `output/hotfix-iter2/03-1280-chips.png`.
- Commit: 4814af5

## Test summary

- Pre-iter2 baseline: 1782 / 1774 pass / 4 fail / 4 skip.
- Post-iter2: 1784 / 1776 pass / 4 fail / 4 skip.
- New tests: +2 in `test/hotfix-batchB-survival-safety.test.js` for the
  scout-road proposer (1 positive, 1 counter).
- Failing tests: same 4 pre-existing (food-rate-breakdown,
  RoleAssignment STONE, raid-escalator log curve, raid-fallback popFloor).
  No new regressions.
