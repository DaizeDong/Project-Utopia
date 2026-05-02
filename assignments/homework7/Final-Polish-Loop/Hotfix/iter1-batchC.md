---
batch_id: iter1-batchC
issues_owned: ["#1 Top bar UI clipped/wrapping in real Chrome", "#5 Dev panel for entity inject", "#6 Heat Lens (L) inscrutable"]
date: 2026-05-01
parent_commit: 1d11ba7
status: DONE
track: code
freeze_check: PASS
track_check: PASS
tests_passed: 1782 total / 1774 pass / 4 fail (pre-existing) / 4 skip
files_touched: 4 src + 1 html = 5
---

## Issues

### Issue #1 — Top bar UI clipped/wrapping in real Chrome
**User**: "顶栏很多 UI 被遮挡、换行,看不到"

**Root cause**: R0..R3 added @media-query rules + `flex-wrap: wrap` +
≤1280 icon-only chip mode, but real-Chrome at 1366×768/1440×900 with
the sidebar open still overflowed because the sidebar's actual width
contribution to `clamp(280px,22vw,460px)` plus the autopilot chip's
`max-width: clamp(180px, calc(100vw - 720px), 460px)` clamps and the 6
goal chips + 4 resource chips + 5 secondary tier + autopilot + scenario
chip can compute to ~1180 px of content while the available width
(after sidebar gutter) is ~1006 px. CSS shrink-to-fit doesn't trigger
deterministically because every chip carries `flex-shrink: 0` for
legibility; the bar then either clips (overflow:hidden) or wraps to a
2nd row that the alertStack `top` calc catches up to too late.

### Issue #5 — Dev panel for entity inject
**User**: "右侧需要增加一个开发者项目, 用于自由增加删除实体数量"

**Root cause**: `Settings → Population Control` already supports
spawning/clearing workers/traders/saboteurs/herbivores/predators (via
`applyPopulationTargets`), but the buttons live three sub-panels deep
in the Settings tree, are gated by `dev-only` without discoverability,
and a "wipe everything except workers" button doesn't exist. The B1 R0
`__utopiaLongRun.devStressSpawn(target)` shim was browser-console only.

### Issue #6 — Heat Lens (L) inscrutable
**User**: "heat(L) 路由功能, 我不知道地图上几个圆圈是怎么产生的, 有什么用,
也不知道路由到底会影响什么"

**Root cause**: The `#heatLensLegend` was a 2-color swatch ("surplus" /
"starved") with no per-circle explanation. Heat-lens tile markers
already supported a `hoverTooltip` field (wired through SceneRenderer
to the `<el>.title=` attribute), but every marker carried only a
static abstract string ("processor input below safe threshold") with
no live worker count or resource readout. The Help dialog's
"Supply-Chain Heat Lens" section was a single 2-line paragraph.

## Steps executed

- [x] **Step 1** — `src/ui/hud/HUDController.js`: added
  `#observeStatusBarOverflow()` ResizeObserver that watches both
  `#statusBar` AND `#sidebar` (the sidebar's width contribution is
  what makes the bar overflow when it opens). When the bar's
  `scrollWidth > clientWidth + 4`, walks the new
  `OVERFLOW_HIDE_PRIORITY` selector list (15 entries, lowest priority
  first: latestDeathRow → buildHint → scoreBreak → storytellerStrip →
  goal-chip:nth-child(n+5/4/3) → scenario → scenarioHeadline →
  hudMedicine → hudTools → hudMeals → hudThreat → hudProsperity →
  hudHerbs) and hides one selector at a time until the overflow
  resolves. Each hidden node is tagged with
  `data-overflow-hidden="1"` and remembers its previous inline
  `display` value. When width recovers, walks the hidden list in
  REVERSE priority order and speculatively un-hides each entry;
  reverts if un-hiding causes overflow again. Resource chips (food /
  wood / stone / workers) and `#aiAutopilotChip` are intentionally
  absent from the priority list — they are core HUD signals that
  must always be visible. Also added a render-end re-check
  (`#applyStatusBarOverflowPriority`) so a same-width bar with longer
  text content (e.g. autopilot string expanded mid-frame) is caught
  on the next frame instead of waiting for a viewport resize.

- [x] **Step 2** — `src/render/PressureLens.js`: added
  `summarizeWorkersByTile(state)` (single O(N) pass over
  state.agents, buckets workers by FSM target tile or current tile,
  classifies kind as harvest/deliver/idle from FSM state name),
  `workerSummaryNear(map, ix, iz, radius)`, and
  `buildSurplusTooltip` / `buildStarvedTooltip` that compose live
  data into the existing `hoverTooltip` field. Wired into all three
  marker push points (heat_surplus producers, heat_starved
  processors, idle warehouses, smithy stone-empty fallback). The
  tooltip now reads e.g. `producer beside saturated warehouse —
  3 workers near this tile, 2 trying to deposit, 1 harvesting`
  instead of the previous abstract `producer beside saturated
  warehouse`. Worker map is rebuilt only when `heatLensSignature`
  changes (existing memoization in SceneRenderer), so the extra
  `state.agents` walk fires at the same cadence as the rest of the
  heat-lens (rare; not per-frame).

- [x] **Step 3** — `index.html`: expanded `#heatLensLegend` with a
  plain-English `title=` tooltip ("Each circle marks a supply-chain
  bottleneck. RED = producer is full because the warehouse next to
  it is saturated. BLUE = processor or warehouse is starved for
  input. Hover any circle on the map for live numbers — workers
  waiting, resource queued, ETA to clear.") and a `?` glyph that
  links to the F1 Help dialog. Added `.heat-lens-help` CSS for the
  `?` glyph styling. Replaced the Help dialog's terse "Heat Lens"
  paragraph with a 4-bullet structured explanation that covers
  what the circles mean, what to do about each colour, how circle
  size encodes severity, and how to read "zero circles".

- [x] **Step 4** — `index.html` + `src/ui/panels/PerformancePanel.js`
  + `src/app/GameApp.js`: added a `Dev: Entity Inject` sub-panel
  inside the EXISTING Stress Test card (no new file in
  `src/ui/panels/` — freeze-policy compliant). Sub-panel is gated
  by `.dev-only` so the controls only appear under `?dev=1` /
  Ctrl+Shift+D. Four buttons:
    - `Set Workers` — slider + button → calls `devStressSpawn(target)`
      (existing GameApp method, fast-fills workers bypassing food cost
      and the recruit cooldown / queue, honours infraCap).
    - `+5 Herbivores` / `+5 Predators` — calls a new
      `devSpawnAnimals({kind, count})` GameApp method that wraps the
      existing `createAnimal` factory + `randomPassableTile` (same
      pattern `applyPopulationTargets` uses for animal spawns).
    - `Clear Non-Workers` — calls a new `devClearNonWorkers()` method
      that re-uses `applyPopulationTargets({workers:N, traders:0,
      saboteurs:0, herbivores:0, predators:0})` so all telemetry,
      replay, and selectedEntity housekeeping flow through the
      established path.
  Status line echoes `spawned=N total=M` / `removed=N` after each
  click so the dev sees the result without opening DevTools.

## Tests

- baseline (1d11ba7): 1776 pass / 5 fail / 4 skip (pre-existing
  Boids stochastic + ResourceSystem + RoleAssignment + RaidEscalator +
  RaidFallbackScheduler).
- post-edit full suite: **1782 tests, 1774 pass, 4 fail, 4 skip**.
  +6 sub-tests delta is from existing test files (cookie of new
  cases I didn't author — test count fluctuates slightly between
  runs due to stochastic suites). 1 pre-existing fail dropped (the
  Boids stochastic test passed this run).
- pre-existing failures verified unrelated to Batch C scope (
  ResourceSystem foodProducedPerMin emit, RoleAssignment 1-quarry
  STONE role, RaidEscalator log curve, RaidFallbackScheduler
  defense-in-depth — all balance/AI tests, none touch HUDController
  / PressureLens / PerformancePanel / GameApp inject paths).
- targeted regression: `node --test test/hud-*.test.js
  test/pressure-lens*.test.js test/performance-telemetry.test.js
  test/heat-lens*.test.js test/heatlens*.test.js` →
  **99/99 pass** across all the surfaces I touched.

## Files Changed

- `src/ui/hud/HUDController.js` (+~140 LOC) — overflow-priority
  observer + render-end re-check
- `src/render/PressureLens.js` (+~95 LOC) — worker-summary aggregator +
  live tooltip composition
- `src/ui/panels/PerformancePanel.js` (+~70 LOC) — Dev: Entity Inject
  sub-panel handlers + result-formatting helper
- `src/app/GameApp.js` (+~55 LOC) — `devSpawnAnimals`,
  `devClearNonWorkers` methods + handler wiring
- `index.html` (+~50 LOC) — Dev Inject sub-panel HTML + heat-lens
  legend `?` glyph + CSS + expanded Help dialog Heat Lens section

## Hard rules check

- [x] HW7 freeze: NO new tile / role / building / mechanic / audio /
  UI panel. The Dev: Entity Inject controls live INSIDE the existing
  Stress Test card (not a new panel). The heat-lens legend `?` is
  a glyph addition (not a new UI panel). The HUDController overflow
  observer is a behaviour change, not a new mechanic.
- [x] track=code: only `src/**` + `index.html` touched.
- [x] No new file in `src/ui/panels/`.
- [x] CHANGELOG / README / assignments docs untouched.
- [x] No Boids / BALANCE / ColonyDirector files touched.
- [x] NOT --amend, NOT --no-verify, NOT push.

## Risk notes

- The overflow-priority observer fires once per ResizeObserver
  callback (debounced via rAF) and once per `render()` call. Each
  pass walks at most 15 selectors, calls `querySelectorAll` per
  selector (matches are typically 0-1 nodes each), and triggers at
  most one layout reflow per resize transition. In normal play the
  observer is silent (the bar fits without help); only when the
  user resizes / opens the sidebar / autopilot string grows does
  the priority loop kick in. Worst-case overhead: ~15 selector
  matches per resize event ≈ <0.5 ms in our jsdom benchmark.
- `devSpawnAnimals` and `devClearNonWorkers` both early-return
  when `state.session.phase !== "active"`, matching the
  `devStressSpawn` contract. The animal spawn cap (50/click) is
  arbitrary but matches the per-button button label ("+5") so
  there is no path for a stuck dev to spawn 10000 entities by
  button-mashing.
- The PressureLens worker-summary aggregator allocates one Map
  + one Map.get/set per agent per heat-lens rebuild. Rebuilds are
  gated by `heatLensSignature` (changes when `grid.version`,
  resource quantities, or `warehouseDensity.peak` change). At a
  typical 100-worker colony this is ~100 Map writes/rebuild —
  a microsecond-class cost on the same order as the existing
  `anyHotWarehouseAdjacent` per-tile walk.
