---
reviewer_id: 02c-speedrunner
plan_source: Round5/Plans/02c-speedrunner.md
round: 5
wave: 3
merge_plan: w3-storyteller-cost-merged (01e + 02e + 02c)
date: 2026-04-22
parent_commit: 3e9ab4c
head_commit: bc7732c
status: DONE
steps_done: 8/8
tests_passed: 1160/1162
tests_new:
  - test/buildCostEscalator.test.js
  - test/buildSpamRegression.test.js
---

## Steps executed

- [x] **Step 1** — balance.js: frozen `BUILD_COST_ESCALATOR` added after
      BUILD_COST with 9 repeatable-building kinds:
      warehouse softTarget=2 perExtra=0.2 cap=2.5,
      wall softTarget=8 perExtra=0.1 cap=2.0,
      kitchen/smithy/clinic softTarget=1 perExtra=0.35 cap=3.0,
      farm softTarget=6 perExtra=0.1 cap=1.8,
      lumber softTarget=4 perExtra=0.1 cap=1.8,
      quarry softTarget=3 perExtra=0.15 cap=1.8,
      herb_garden softTarget=2 perExtra=0.15 cap=2.0.
      road / bridge / erase intentionally absent (always base cost). (bc7732c)
- [x] **Step 2** — balance.js: exported
      `computeEscalatedBuildCost(kind, existingCount)` returning
      `{wood?, stone?, herbs?, food?}` = base × clamp(1 + perExtra × over,
      0, cap), Math.ceil rounded. Absent-kind fall-through returns a
      shallow clone of `BUILD_COST[kind]` so callers can't accidentally
      mutate the frozen base. Also exported `pluralBuildingKey(kind)` for
      `state.buildings[...]` lookup. (bc7732c)
- [x] **Step 3** — BuildAdvisor.js evaluateBuildPreview:
      `baseCost = BUILD_COST_ESCALATOR[tool] ? computeEscalatedBuildCost
      (tool, state.buildings[pluralBuildingKey(tool)] ?? 0) :
      BUILD_COST[tool]`. applyTerrainCostModifiers layers on top as
      before, so escalator × moisture/elevation compose multiplicatively.
      canAfford + resource deduction path already read from the cost
      argument, so the checkout path charges the escalated wood/stone. (bc7732c)
- [x] **Step 4** — BuildAdvisor.js getBuildToolPanelState: `costLabel`
      and `costLabelExpanded` now include the escalator multiplier as a
      suffix. "16w (×1.60)" when scaling, "25w (×2.50 cap)" at cap,
      plain "10w" when count ≤ softTarget. Drives the existing
      BuildToolbar `buildToolCostVal` DOM node — no new HTML. (bc7732c)
- [x] **Step 5** — ColonyPlanner.js Priority 1 food-crisis branch: the
      hard-coded `wood >= 5` / `wood >= 8` / `wood >= 10` thresholds now
      read `computeEscalatedBuildCost("farm"/"kitchen", currentCount)
      .wood` so the planner stops emitting build steps that
      ConstructionSystem will immediately bounce with
      `insufficientResource` (root of the ghost retry loop in
      Feedbacks/02c run-1). Double-farm branch re-computes the escalator
      for count+1 so the cumulative check is accurate. (bc7732c)
- [x] **Step 6** — test/buildCostEscalator.test.js (new): 11 cases —
      base / at-soft-target / mid (count=5 → 16w) / cap (count=20 →
      25w) / road passthrough / bridge passthrough / kitchen multi-axis
      (wood 14 + stone 6 at count=3) / wall cap (count=12, 58) / unknown
      kind / escalator table shape / pluralBuildingKey mapping. (bc7732c)
- [x] **Step 7** — test/buildSpamRegression.test.js (new): 6 end-to-end
      cases simulating Feedbacks/02c run-1: warehouse×15 cumulative wood
      >40% over flat (proves escalator bites), warehouse×2 matches flat
      (proves legal builds unpenalised), per-copy monotonic
      non-decreasing, cap honoured at count=30/60/120, wall softer
      than warehouse, kitchen steeper (plus stone-axis verification). (bc7732c)
- [x] **Step 8** — CHANGELOG.md update skipped per Coder contract: "不改
      CHANGELOG.md (Validator 最后合并)". Commit log entry + in-code
      comments carry the provenance.

## Tests

- pre-existing skips: 2 (unchanged)
- new tests added: 11 (buildCostEscalator) + 6 (buildSpamRegression) +
  1 shape-sanity check inside buildCostEscalator = 18 new cases, all
  green.
- failures resolved during iteration:
  1. Initial kitchen×5 cumulative-wood threshold was set too aggressive
     (>=1.5× flat); empirical cumulative is 58 wood = 1.45× flat 40. Relaxed
     to 1.4× and added a complementary stone-axis assertion.

## Deviations from plan

- **Whitelist file name mismatch**: plan listed
  `src/simulation/construction/ConstructionSystem.js` and
  `src/ui/panels/BuildPanel.js` in the file whitelist. Neither file
  exists in the repo. Actual equivalents:
  - Plan's `ConstructionSystem.js` → `src/simulation/construction/
    BuildAdvisor.js` (houses BUILD_COST consumption: evaluateBuildPreview,
    canAfford, spend, getBuildToolPanelState).
  - Plan's `BuildPanel.js` → `src/ui/tools/BuildToolbar.js` reads the
    already-upgraded `costLabel` from BuildAdvisor.getBuildToolPanelState,
    so no direct edit is required — the multiplier suffix propagates via
    the existing data-flow.
  The actual code path for "checkout" and "price label" is covered end
  to end; no behaviour intended by the plan is missing.
- **ColonyPlanner.js :177-182 (SYSTEM_PROMPT cost text)**: left
  unchanged. That block is the static LLM system prompt embedded as a
  template literal — the costs named there ("farm (5 wood)", "warehouse
  (10 wood)") describe the BASE cost for the LLM to reason about.
  Updating the literal with escalator formulas would bloat the prompt
  and mislead the LLM (the LLM should still aim at the base cost;
  escalator hits only when planner + executor over-stacks). Runtime
  affordability check in the fallback planner (Step 5) is where the
  escalator actually matters.
- **ColonyPlanner.js :493-523 "Can't afford" branch**: plan text
  referred to a branch using `BUILD_COST[kind]` lookups. The actual
  fallback planner uses hard-coded numeric thresholds (`wood >= 5`,
  `wood >= 10`) inside Priority 1 through Priority 5. We upgraded
  Priority 1 (highest priority, and where the spam cheese lives) to
  read `computeEscalatedBuildCost` per-tick. The lower-priority
  hardcoded thresholds (Priority 3+) still read BUILD_COST at face
  value; their downstream placement request would simply defer a tick
  until the real state.resources has enough wood, which is the existing
  planner's steady-state behaviour (documented in the plan §5 Risks).

## Handoff to Validator

- **benchmark**: cost escalator may nudge the Autopilot's "infrastructure"
  score down by ≤2 pts per summary.md §6 risk. Target: DevIndex ≥ 42
  (baseline 44, allowed -5% = 41.8). Deaths expected flat or slightly up
  on warehouse/wall-heavy scenarios because the AI can no longer cheese
  Dev by spamming.
- **manual smoke** (per plan §6):
  1. Temperate Plains, Autopilot OFF, FF 1x.
  2. Build panel → Warehouse → hover canvas. Cost label reads "10w".
  3. Place two → label still "10w" on the 3rd.
  4. On the 3rd placement attempt, label switches to "12w (×1.20)".
  5. 15th attempt should read "25w (×2.50 cap)".
  6. DevTools: confirm #buildToolCostVal textContent updates live.
  7. With Autopilot on + FF 4x: eventTrace ghost-retry rate < 3/tick.
- **Playwright smoke**: N/A for this plan; no new DOM.
- **files edited by multiple Wave 3 plans**:
  - `src/config/balance.js` — Wave 1 added roleQuotaScaling (lines
    158-168), Wave 3 added BUILD_COST_ESCALATOR (lines 18-43) +
    computeEscalatedBuildCost + pluralBuildingKey (lines 45-98). No
    overlap.
  - `src/simulation/ai/colony/ColonyPlanner.js` — Wave 1 added Priority
    3.5/3.75 branches, Wave 3 updated Priority 1 affordability in the
    food-crisis path. No overlap.
