---
iter: 1
parent: 1d11ba7
head: 75b180e
verdict: YELLOW
issues_fixed: 5
issues_partial: [4, 6, 7]
issues_failed: []
new_regressions: []
tests: 1774/1782
---

## Test + build baseline

- `node --test test/*.test.js` → **1782 tests, 1774 pass, 4 fail, 4 skip** in 103.4s.
- Failing tests are exactly the 4 expected pre-existing failures listed in the task spec — no new regressions:
  - `not ok 510 ResourceSystem flushes foodProducedPerMin when a farm-source emit fires` (food-rate-breakdown)
  - `not ok 845 RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `not ok 925 RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `not ok 935 RaidFallbackScheduler: pop < popFloor does not trigger`
- New tests added by this hotfix all pass:
  - `BoidsSystem dampens worker separation while following A* path (issue #2)` — ok
  - `assessColonyNeeds does NOT emit quarry safety net when stone is healthy` (and 7 sibling tests in `hotfix-batchB-survival-safety.test.js`) — ok
  - Updated `wildlife-population-system.test.js` — ok
- `npx vite build` → exit 0, 144 modules, 2.43s.

## Issue verification matrix

| # | Description | Status | Evidence |
|---|---|---|---|
| 1 | Top bar overflow / wrap in real Chrome | PASS | `output/hotfix-iter1/02-1920-game-topbar.png` (no overflow, scrollWidth==clientWidth, 13 chips visible). `03-1366-game-topbar.png` (priority hider trimmed `#hudHerbs/#hudMeals/#hudTools` etc to 10 chips, single row, no clip). `04-1280-game-topbar.png` (bar wraps to 56px / 2 rows but no clipped text). HUDController `OVERFLOW_HIDE_PRIORITY` array + ResizeObserver wired and active in DOM. |
| 2 | Worker repulsion off-path | PASS | New test `boids-traffic.test.js` line 64 "BoidsSystem dampens worker separation while following A* path (issue \#2)" passes. Code in `src/simulation/movement/BoidsSystem.js` adds `SEP_DAMPEN_ON_PATH = 0.35` for path-followers, exact diff from spec. |
| 3 | LLM early farm | PASS | Plains autopilot run (`?dev=1`, autopilot ON, ultra-speed): at sim t≈42s, AI Trace already shows "farms 1/6"; by t≈250s "farms 7/6" (over-target). The LLM was actually idle at start (`environment-request` only at 42.5s) — the deterministic ColonyDirectorSystem zero-farm safety net (priority 99) drove the first farm before the LLM even responded. New `npc-colony-planner.md` + `strategic-director.md` + `ColonyPlanner.js` SYSTEM_PROMPT all carry the survival-check hard rule. |
| 4 | Wildlife density / hunting | PARTIAL | Visible-density half PASS — Entity Focus list at t≈4s shows 8 herbivores (Deer-17..24) + at least 1 predator. `INITIAL_POPULATION.herbivores 3→8`, `predators 1→2`, `BALANCE.wildlifeSpawnRadiusBonus 3→6` all confirmed in `src/config/balance.js`. Hunting half deferred per commit message (freeze-protected). Screenshot: `02-1920-game-topbar.png` (deer cluster visible at center map). Predator attrition observed in event log ("Deer-23 died - predation") so predator AI is alive. |
| 5 | Dev panel free-form entity inject | PASS | `output/hotfix-iter1/05-dev-entity-inject-after.png` — full sub-panel visible under `?dev=1` (right sidebar > Debug tab > Performance card > "Dev: Entity Inject"). All 4 buttons render (Set Workers / +5 Herbivores / +5 Predators / Clear Non-Workers) plus slider + status line. Click on `+5 Herbivores` echoed status `+5 Herbivores → spawned 5, total 15`. New methods `devSpawnAnimals` + `devClearNonWorkers` present in `src/app/GameApp.js`. |
| 6 | Heat lens explanation | PARTIAL | Tooltip half PASS — `#heatLensBtn` carries data-tip `"Supply-Chain Heat Lens (L) — cycles: Pressure (red=surplus/blue=starved), Heat (production density), Off"`; `#heatLensLegend` carries data-tip `"Heat Lens legend — red = producer warehouse full / overflowing, blue = processor starved for input"`; legend appears bottom-left when L is pressed (`output/hotfix-iter1/06-heat-lens-on.png` shows "Heat lens ON — red = surplus, blue = starved"). PressureLens.js `summarizeWorkersByTile`/`buildSurplusTooltip`/`buildStarvedTooltip` all wired (+102 LOC). **Help dialog Heat Lens section update DID NOT LAND** — the F1 > "What makes Utopia different" tab still shows the 2-line `<p>` paragraph from before, not the claimed 4-bullet `<ul>` (verified by querying `section[data-help-page="different"]` innerHTML). Pre-existing escaping typos `<code>L<\code>` and `<i>heat<\i>` (backslash) in that paragraph also remain. The `index.html` diff in the 14a5f42 commit only added the Dev Entity Inject markup; the Help dialog edit promised by the commit message was never staged. |
| 7 | Stone shortage / fog | PARTIAL | Code half PASS — `ColonyDirectorSystem.assessColonyNeeds` now emits `quarry@95` when `(currentQuarries===0 && stoneStock<15) \|\| stoneStock<5`; system prompts add the STONE-DEFICIT hard rule. Test `assessColonyNeeds DOES emit quarry safety net when stone is critical and no quarry exists` passes. Runtime observation half NOT YET DEMONSTRATED — at t≈250s the colony reached `Stone 0`, but no quarry blueprint appeared in `state.blueprints` during the 60s observation window after the deficit threshold was crossed. The colony was simultaneously starving (`Food 1`) so director may be re-prioritizing food.farms over food.quarry; or quarry placement is failing because of a missing stone tile in the visible/reachable area (the FogSystem investigation prong of the issue is unresolved — no fog-reveal-for-stone behavior was added in this hotfix). |

## What's left for iter 2

- **Issue #6 Help dialog**: re-apply the 4-bullet Heat Lens explanation to `index.html` `section[data-help-page="different"]` — the commit 14a5f42 message claims it, but the actual diff only includes the Dev Inject sub-panel markup. While there, fix the pre-existing typos `<code>L<\code>` → `<code>L</code>` and `<i>heat<\i>` → `<i>heat</i>` (backslash should be forward slash) on the same lines.
- **Issue #7 fog/quarry execution**: confirm with a multi-minute autopilot trace that `assessColonyNeeds quarry@95` actually places a blueprint when stone reaches 0, and that the worker reaches the placement tile through fog. If the quarry stays unplaced (as observed at t≈250s with stone=0 in this validator run), add a placement-feasibility log line so it is debuggable; consider whether `findPlacementTile` for quarry has a hard requirement on a visible STONE-node tile (which fog would hide).
- **Issue #4 hunting**: still freeze-deferred per commit message. The visual density bump is in, but workers don't yet hunt, so animals → carry-food never happens. Re-evaluate freeze policy when ready.
- **Issue #1 1280×720 wrap**: at the smallest target viewport the priority hider lets the bar wrap to a 2-row layout (56px tall) rather than hide more low-priority chips. Decide whether this is acceptable; if not, add `#hudHerbs`/`#hudMeals` to the priority list earlier or tighten the overflow detection (it currently keys off `scrollWidth > clientWidth+4`, which a wrap absorbs).
- **Test debt unchanged**: 4 pre-existing test failures still present (food-rate-breakdown, RoleAssignment STONE, raid-escalator log curve, raid-fallback-scheduler popFloor) — out of scope for this hotfix loop but accumulating debt.
