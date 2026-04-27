# Living World v0.8.0 — Implementation Plan

> **For agentic workers:** This is a **phased outline plan**, not a line-by-line task list. Each phase is executed as a sub-project: dispatch parallel subagents for the work items, iterate until no optimization remains, run the phase-review protocol, commit, update the progress tracker, then advance to the next phase. Do NOT exit between phases — only stop after Phase 7 is fully closed and the final review loop is clean.

**Goal:** Ship the Living World balance overhaul (spec v3, 2026-04-21) — M1–M4 economy mechanics + node-gated producers + fog of war + Plan C adaptive raids + DevIndex + long-horizon benchmark — bumping Project Utopia from `v0.7.1` to `v0.8.0`.

**Architecture:** 7 sequential phases × parallel intra-phase subagents. Each phase ends with a two-stage review: first a code-review subagent, then a cleanup/regression subagent, looped until both return "no issues". Progress is persisted to [2026-04-21-living-world-progress.md](2026-04-21-living-world-progress.md) after every phase.

**Tech Stack:** Pure ES modules (.js), Vite 7.3.1, Three.js 0.182, Node `--test` runner. No TypeScript. No new dependencies.

**Spec reference:** [docs/superpowers/specs/2026-04-21-living-world-balance-design.md](../specs/2026-04-21-living-world-balance-design.md)

---

## Execution Protocol (read first, applies to every phase)

For each Phase N:

1. **Kickoff** — mark phase `in_progress` in TodoWrite and in the progress doc. Read the spec section(s) listed under the phase. Snapshot current test count (`node --test test/ 2>&1 | tail -5`).
2. **Parallel dispatch** — launch the phase's subagents (listed per-phase) in a **single message with multiple Agent tool calls**. Each subagent gets: its spec section, its file targets, its exit criteria, and an explicit instruction to write tests first (TDD).
3. **Convergence check** — when all subagents return, run the full test suite. If any test fails, dispatch a fix subagent for the failure. Loop until `node --test` is green and the phase's new tests pass.
4. **Iteration pass** — **DO NOT EXIT YET**. Ask yourself: "Is there any obvious optimization, dead code, duplicated logic, or missed edge case in what was just written?" If yes, dispatch a small refactor subagent. Loop until the answer is "no obvious improvement remaining."
5. **Phase review (two-stage)**:
   - **5a. Code review subagent** (`pr-review-toolkit:code-reviewer`): dispatch against the git diff since phase start. Fix every issue it raises, then re-dispatch. Loop until clean.
   - **5b. Silent-failure hunter** (`pr-review-toolkit:silent-failure-hunter`): dispatch against the same diff. Fix every silent failure / inadequate error. Loop until clean.
   - **5c. Legacy sweep subagent** (`general-purpose`): "Search the diff area for dead code, obsolete comments referencing removed fields, duplicate constants, and deprecated fallback paths that are now unreachable. Report with file:line references." Fix every finding.
6. **Phase commit** — one commit per phase. Title: `feat(v0.8.0 phase-N): <phase-name>`. Body lists the spec sections shipped and the subagent rounds used.
7. **Progress update** — append to the progress doc: date, phase, subagents dispatched, review rounds, LOC changed, test delta, noteworthy decisions.
8. **Advance** — mark phase complete, next phase `in_progress`, and proceed to step 1 without waiting for user input.

**Hard stop rule:** Only exit after Phase 7's review rounds all return clean AND the long-horizon benchmark passes with DevIndex ≥ 70 at day 365.

**Subagent instruction template** (use for every task dispatch):
> Context: v0.8.0 Living World implementation, phase N/7. Spec: `docs/superpowers/specs/2026-04-21-living-world-balance-design.md` § X.Y. Your scope: <exact files + goal>. Required: TDD (test first), node --test must pass, no new deps. Return: list of files touched, test delta, open questions (if any). Under 400 words.

---

## File Structure (locked decisions)

**New files to be created across all phases:**

| Path | Purpose | Phase |
|------|---------|-------|
| `src/simulation/world/VisibilitySystem.js` | Fog-of-war reveal ticker | 3 |
| `src/render/FogOverlay.js` | Shader-based fog layer | 3 |
| `src/simulation/economy/WarehouseQueueSystem.js` | Intake throttle + queue | 2 |
| `src/simulation/meta/RaidEscalatorSystem.js` | Plan C adaptive escalator | 4 |
| `src/simulation/meta/DevIndexSystem.js` | 6-dim composite scoring | 4 |
| `src/simulation/telemetry/EconomyTelemetry.js` | Rolling ring buffer | 4 |
| `scripts/long-horizon-bench.mjs` | 730-day headless harness | 6 |
| `test/exploit-regression.test.js` | 7 adjacency/survival tests | 7 |
| `test/long-horizon-smoke.test.js` | 90-day CI smoke | 6 |
| `test/monotonicity.test.js` | 15% regression rule | 6 |

**Existing files modified (full list per phase below — referenced in the spec):**
`BuildAdvisor.js`, `WorkerAISystem.js`, `ResourceSystem.js`, `LogisticsSystem.js`, `TileStateSystem.js`, `Grid.js`, `ScenarioFactory.js`, `ProgressionSystem.js`, `WorldEventSystem.js`, `PopulationGrowthSystem.js`, `ColonyPerceiver.js`, `ColonyPlanner.js`, `PromptBuilder.js`, `PlanEvaluator.js`, `StrategicDirector.js`, `SkillLibrary.js`, `GameStateOverlay.js`, `index.html`, `balance.js`, `constants.js`, `runOutcome.js`, `ProceduralTileTextures.js`, `SceneRenderer.js`, `Minimap.js`, `PressureLens.js`, `package.json`, `CHANGELOG.md`.

---

## Phase 0 — Branch setup & progress scaffolding

**Goal:** Establish the working branch, progress tracker, and baseline snapshots. No code changes yet.

**Files:**
- Create: `docs/superpowers/plans/2026-04-21-living-world-progress.md`
- Create: `docs/benchmarks/baseline-v0.7.1.json` (snapshot of current eval-report.json)
- Modify: nothing

**Tasks** (sequential, no subagents):

- [ ] **0.1** Create or confirm branch `feature/v080-living-world` off current HEAD. Verify `feature/phase1-resource-chains` tests pass (`node --test 2>&1 | tail -3` → expect `pass 731` or higher).
- [ ] **0.2** Write the progress tracker file with phase table, baseline scores (0.82 B overall, per-dim breakdown from `docs/evaluation/eval-report.md`), and an empty log section.
- [ ] **0.3** Copy `docs/evaluation/eval-report.json` → `docs/benchmarks/baseline-v0.7.1.json` for post-implementation comparison.
- [ ] **0.4** Commit: `chore(v0.8.0 phase-0): branch setup + baseline snapshot`.

**Exit criteria:** branch clean, progress doc exists with phase checkboxes, baseline JSON archived.

---

## Phase 1 — Infrastructure mechanics (M3 + M4)

**Spec sections:** § 3 M3 (carry fatigue + spoilage), § 3 M4 (road compounding), § 14 (params `carryFatigueLoadedMultiplier`, `foodSpoilageRatePerSec`, `herbSpoilageRatePerSec`, `spoilageGracePeriodTicks`, `roadStackPerStep`, `roadStackStepCap`, `isolationDepositPenalty`).

**Why first:** Smallest scope, lowest coupling, produces the immediate anti-exploit pressure that later phases build on.

**Parallel subagents (dispatch in one message):**

- **Agent 1.A — M4 Road Compounding**
  - Files: `src/simulation/economy/LogisticsSystem.js:52-66`, `src/simulation/npc/WorkerAISystem.js` (movement tick), `src/config/balance.js`.
  - Add per-worker `roadStep`, speed multiplier stack, ISOLATED deposit 0.8× penalty. New tests in `test/road-compounding.test.js`.
- **Agent 1.B — M3 Carry Fatigue**
  - Files: `src/simulation/npc/WorkerAISystem.js` (rest decay path), `src/config/balance.js`.
  - Multiply rest decay by `CARRY_FATIGUE_MULT` when `carry.total > 0`. Tests in `test/carry-fatigue.test.js`.
- **Agent 1.C — M3 In-Transit Spoilage**
  - Files: `src/simulation/npc/WorkerAISystem.js:216-258` (intent tick) + `:449-483` (deliver), `src/config/balance.js`.
  - Per-tick decay on `carry.food` / `carry.herbs` unless on ROAD/BRIDGE. Grace period `tick < 500` halves rates. Tests in `test/carry-spoilage.test.js`.

**Phase-level iteration focus:** Verify M3 and M4 compose correctly (a worker on a road receives compounding speed AND zero spoilage). Write one integration test in `test/m3-m4-integration.test.js` covering a 20-tile road run with food carry.

**Review protocol:** run steps 5a/5b/5c of the execution protocol. Fix, loop.

**Commit title:** `feat(v0.8.0 phase-1): M3 carry fatigue + spoilage, M4 road compounding`

**Exit criteria:** new phase tests pass, full suite green, no regression in soak-sim wood median (re-run `npm run soak:sim`, archive output).

---

## Phase 2 — Warehouse economy (M2)

**Spec sections:** § 3 M2 (throughput + density risk), § 14 (`warehouseIntakePerTick`, `warehouseDensityRadius`, `warehouseDensityRiskThreshold`, `warehouseFireIgniteChancePerTick`, `verminSwarmIgniteChancePerTick`).

**Parallel subagents:**

- **Agent 2.A — WarehouseQueueSystem**
  - Files: Create `src/simulation/economy/WarehouseQueueSystem.js`. Modify `src/simulation/economy/ResourceSystem.js` (deposit hook), `src/app/GameApp.js` SYSTEM_ORDER insertion before WorkerAISystem.
  - Per-warehouse `intakePendingThisTick` counter, worker `queuedAt` field, `QUEUE_MAX_WAIT_TICKS` reroute. Tests in `test/warehouse-queue.test.js`.
- **Agent 2.B — Density Risk Events**
  - Files: Modify `src/world/events/WorldEventSystem.js` (add `vermin_swarm`, `warehouse_fire` handlers), `src/simulation/economy/ResourceSystem.js` (density scan). Add amber-pulse visual hook to `src/render/SceneRenderer.js`.
  - Tests in `test/warehouse-density.test.js`.

**Iteration focus:** Run a 60-second soak with 6 farms touching a warehouse — assert at least one `vermin_swarm` or `warehouse_fire` fires before second 50.

**Review + commit** per protocol.

**Commit title:** `feat(v0.8.0 phase-2): M2 warehouse throughput queue + density risk`

---

## Phase 3 — Soil, nodes, fog, recycling (M1 + M1a + M1b + M1c)

**Biggest phase. Spec sections:** § 3 M1, § 3 M1a (nodes), § 3 M1b (fog), § 3 M1c (demo recycling), § 7 (data model extensions).

**Parallel subagents (4-way):**

- **Agent 3.A — M1 Soil Salinization + Farm yieldPool**
  - Files: `src/simulation/economy/TileStateSystem.js`, `src/simulation/npc/WorkerAISystem.js` (harvest deduction), `src/render/ProceduralTileTextures.js` (soil-crack overlay), `src/config/balance.js`.
  - Tests: `test/soil-salinization.test.js`.
- **Agent 3.B — M1a Resource Node Layer**
  - Files: `src/world/grid/Grid.js` (extend `tileState` with `nodeFlags: Uint8`), `src/world/scenarios/ScenarioFactory.js` (node seeding pass: Poisson-disk for FOREST, cluster-walk for STONE, link-seek for HERB), `src/simulation/construction/BuildAdvisor.js` (node-gate enforcement + `reason: "missing_resource_node"`), `src/config/balance.js` (node count ranges, per-node yieldPool).
  - Tests: `test/node-layer.test.js` — assert every map generates within count ranges; assert lumber/quarry/herb placement fails off-node.
- **Agent 3.C — M1b Fog of War**
  - Files: Create `src/simulation/world/VisibilitySystem.js` (reveal tick), `src/render/FogOverlay.js` (shader). Modify `src/ui/hud/Minimap.js`, `src/simulation/npc/WorkerAISystem.js` (new `explore_fog` low-priority intent), `src/app/GameApp.js` SYSTEM_ORDER (VisibilitySystem runs after SimulationClock).
  - Tests: `test/fog-visibility.test.js` — assert initial 9×9 revealed, tiles permanently reveal on actor walk-through, BuildAdvisor rejects placement on FOG.
- **Agent 3.D — M1c Demolition Recycling**
  - Files: `src/simulation/construction/BuildAdvisor.js` (salvage refund logic), `src/config/balance.js` (`demoStoneRecovery: 0.35`).
  - Tests: `test/demo-recycling.test.js`.

**Coupling note for subagents:** 3.A may modify `tileState` shape; 3.B extends the same struct. Coordinate: agent 3.B reads 3.A's spec and adds `nodeFlags` alongside `salinized`/`fallowUntil`/`yieldPool`. Dispatch 3.A and 3.B sequentially if conflicts arise; 3.C and 3.D can run fully parallel.

**Iteration focus:** After all 4 merge, a manual exploratory run: generate a temperate_plains map, verify 18–32 forest nodes spawn, 10–18 stone, 12–22 herb. Verify lumber cannot be placed on non-forest tile. Verify fog reveals progressively.

**Review + commit** per protocol. This phase's review is the most important — the legacy-sweep subagent should specifically look for:
- Any reference to "place lumber anywhere" in existing tests (update them)
- Old hardcoded yieldPool constants that are now per-node
- Dead fallow-recovery code paths superseded by node regrow

**Commit title:** `feat(v0.8.0 phase-3): M1 soil + M1a nodes + M1b fog + M1c recycling`

---

## Phase 4 — Survival mode + DevIndex + Plan C raids

**Spec sections:** § 5.1–5.6, § 14 (all `raid*` and `devIndex*` and `survivalScore*` params).

**Parallel subagents (3-way):**

- **Agent 4.A — Objectives removal + Survival score**
  - Files: `src/world/scenarios/ScenarioFactory.js:138-165` (returns `[]`), `src/app/runOutcome.js:3-13` (remove `"win"`), `src/simulation/meta/ProgressionSystem.js:356-479` (replace `updateObjectiveProgress()` with `updateSurvivalScore()`), `src/simulation/population/PopulationGrowthSystem.js` (track `lastBirthGameSec`), `index.html` + `src/ui/hud/GameStateOverlay.js` (status bar rewrite).
  - Tests: `test/survival-score.test.js`, `test/death-condition.test.js` (both from § 8.2).
- **Agent 4.B — Plan C RaidEscalatorSystem**
  - Files: Create `src/simulation/meta/RaidEscalatorSystem.js`. Modify `src/world/events/WorldEventSystem.js:432-464` (intensity multiplier), `src/config/balance.js`, `src/app/GameApp.js` SYSTEM_ORDER.
  - Depends on 4.C's DevIndex output — dispatch 4.C first, start 4.B after 4.C writes the `state.gameplay.devIndex` contract.
  - Tests: `test/raid-escalator.test.js`, `test/survival-scaling.test.js`.
- **Agent 4.C — DevIndexSystem + Telemetry**
  - Files: Create `src/simulation/meta/DevIndexSystem.js` + `src/simulation/telemetry/EconomyTelemetry.js`. Modify `src/config/balance.js` (weights, windows), `src/simulation/meta/ProgressionSystem.js` (hook into per-tick telemetry push), `src/ui/hud/GameStateOverlay.js` (DevIndex badge).
  - Tests: `test/dev-index.test.js` (6 dim unit tests + composite), `test/saturation-indicator.test.js`.

**Dispatch order:** 4.A parallel with 4.C. 4.B after 4.C lands the contract. This is the only phase where not all agents run simultaneously.

**Iteration focus:** Run a 3-minute soak, verify DevIndex starts ~30 and climbs into the 50s. Verify raid interval decreases as DevIndex rises.

**Review + commit** per protocol. Legacy sweep must flag every orphaned reference to `objectives` / `objectiveIndex` / the old `RAID_TIER_CAP=6` constant.

**Commit title:** `feat(v0.8.0 phase-4): survival mode + Plan C raids + DevIndex`

---

## Phase 5 — AI adaptation (18-patch agent-layer sweep)

**Spec sections:** § 13.1–13.5 (all 18 patches).

**Parallel subagents (2-way):**

- **Agent 5.A — Perception + Planner layer**
  - Files: `src/simulation/ai/perception/ColonyPerceiver.js` (patches 1–7: tile state, density, spoilage, survival, nodes, fog, DevIndex), `src/simulation/ai/planner/ColonyPlanner.js` + `src/simulation/ai/prompt/PromptBuilder.js` (patches 8–10: SYSTEM_PROMPT extension, depletion-aware fallback, isolation scoring).
  - Tests: `test/ai-perceiver-signals.test.js`, `test/ai-planner-fallback.test.js`.
- **Agent 5.B — Evaluator + Strategic + Skills**
  - Files: `src/simulation/ai/evaluator/PlanEvaluator.js` (patches 11–13: postconditions for depleted sites / density / spoilage), `src/simulation/ai/strategic/StrategicDirector.js` (patches 14–16: threat-tier switch, survival goal chain, opportunity-cost prompts), `src/simulation/ai/skills/SkillLibrary.js` (patches 17–18: prospect_fog_frontier, recycle_abandoned_worksite + DevIndex-aware strategic goal).
  - Tests: `test/ai-evaluator-postconditions.test.js`, `test/ai-strategic-devindex.test.js`, `test/ai-skills-prospect-recycle.test.js`.

**Iteration focus:** Run `bench:logic` — target `goalFlipCount ≤ 40` (from baseline 39), verify `deliverWithoutCarryCount = 0` as a side-effect of tighter postconditions.

**Review + commit** per protocol. Silent-failure hunter is especially relevant here — AI fallback code has many catch-all paths that swallow errors.

**Commit title:** `feat(v0.8.0 phase-5): AI adaptation for M1-M4 + nodes + fog + DevIndex`

---

## Phase 6 — Long-horizon benchmark harness

**Spec sections:** § 16 (all subsections).

**Single-track (no parallel split — the harness is one coherent unit):**

- **Agent 6.A — bench:long harness**
  - Files: Create `scripts/long-horizon-bench.mjs` (headless loop, checkpoint sampling, JSON output per § 16.3), `scripts/long-horizon-helpers.mjs` (shared sampling logic). Modify `package.json` scripts (`bench:long`).
  - Tests: Create `test/long-horizon-smoke.test.js` (90-day run, Day 30 ≥ 40, Day 90 ≥ 55), `test/monotonicity.test.js` (180-day for seeds {1, 2, 3}).
  - Output: `docs/benchmarks/long-horizon-<seed>-<preset>.json` + `.md` summary.
- **Agent 6.B — CI integration** (follow-up, after 6.A lands)
  - Files: `package.json` scripts (`bench:long:smoke`, `bench:long:matrix`), optional GitHub Actions workflow file if CI config exists. Document matrix in `docs/benchmarks/README.md`.

**Iteration focus:** Actually run `npm run bench:long -- --seed 42 --max-days 365 --preset temperate_plains` once. Archive output. Inspect for sanity: DevIndex trajectory, node discovery curve, raid tier at day 365.

**Review + commit** per protocol.

**Commit title:** `feat(v0.8.0 phase-6): long-horizon benchmark harness + CI integration`

---

## Phase 7 — Parameter tuning + regression fixes + release

**Spec sections:** § 14.2 (rebalance), § 15 (targets), § 8.2 (regression tests).

**Parallel subagents (3-way):**

- **Agent 7.A — Parameter tuning loop**
  - Run `bench:long` with baseline params. Identify weakest dim per checkpoint. Adjust the 9 rebalance params from § 14.2 one at a time, rerun, accept if ΔDevIndex > +2 with no earlier-checkpoint regression. Document each decision in `docs/benchmarks/tuning-log.md`.
  - Files: `src/config/balance.js`, `docs/benchmarks/tuning-log.md`.
- **Agent 7.B — `deliverWithoutCarry` bug + exploit-regression tests**
  - Investigate `test/states/StatePlanner.js` (or wherever the empty-carry deliver transition happens). Fix. Add the full 7-test regression suite from § 8.2 to `test/exploit-regression.test.js`.
  - Files: `src/simulation/npc/states/*.js`, `test/exploit-regression.test.js`.
- **Agent 7.C — PressureLens + CHANGELOG + version bump**
  - Files: `src/render/PressureLens.js` (L-key toggle, red/blue/grey channels per § 6), `index.html` (HUD button), `CHANGELOG.md` (new `## [0.8.0] — YYYY-MM-DD` section with all shipped mechanics), `package.json` (version `0.7.1` → `0.8.0`), `CLAUDE.md` (update "Current State" bullet).

**Iteration focus:** Re-run all four baseline benchmarks (`bench:perf`, `bench:logic`, `soak:sim`, `comprehensive-eval.mjs --quick`) AND `bench:long --max-days 365`. Compare against baseline snapshot. Confirm: Overall ≥ 0.88, Efficiency ≥ 0.75, Logistics ≥ 0.70, Spatial Layout ≥ 0.70, day-365 DevIndex ≥ 70 with no dim < 50.

**Review + commit** per protocol. This is the final phase — the review sweep must be the most thorough. Run:
- code-reviewer on the full v0.8.0 diff (phases 1–7)
- silent-failure-hunter on the full diff
- legacy-sweep on the full diff
- type-design-analyzer (`pr-review-toolkit:type-design-analyzer`) on new data structures (`nodeFlags`, `devIndexDims`, `visibility`)
- pr-test-analyzer (`pr-review-toolkit:pr-test-analyzer`) on new test files
- Loop until all return clean.

**Commit title:** `feat(v0.8.0): release — param tuning + regression fixes + PressureLens + changelog`

**Tag:** `v0.8.0-living-world` after commit.

---

## Final Exit Gate

Before declaring the plan complete, verify **all** of the following:

| Gate | How to check |
|------|--------------|
| Full test suite green | `node --test test/ 2>&1 | tail -3` shows 0 failures |
| Test count grew | ≥ +30 tests over baseline 731 |
| Overall eval score ≥ 0.88 | `npm run comprehensive-eval.mjs --quick` |
| DevIndex day-365 ≥ 70 | `npm run bench:long -- --seed 42 --max-days 365` |
| No monotonicity violation | output JSON `violations: []` |
| `deliverWithoutCarryCount` = 0 | `npm run bench:logic` |
| Frame time regression ≤ 10% | `npm run bench:perf` vs baseline CSV |
| CHANGELOG updated, version 0.8.0 | `git show HEAD -- CHANGELOG.md package.json` |
| Progress doc fully populated | every phase has dated entry |
| Zero open review findings | final review round returned clean |

If any gate fails: identify the failing gate, dispatch a targeted fix subagent, loop Phase 7's review protocol, re-check. Only exit when all gates pass simultaneously.

---

## Self-Review (run by me after writing this plan)

- **Spec coverage:** every § 3 mechanic (M1, M1a, M1b, M1c, M2, M3, M4), § 5 survival-mode components, § 6 heat lens, § 13 AI patches (all 18), § 14 params (all 27 new + 9 rebalance), § 15 targets, § 16 benchmark — all mapped to phases 1–7. No spec section orphaned.
- **Placeholder scan:** No "TBD"/"TODO"/"similar to X". Every phase names concrete files and concrete subagent deliverables.
- **Type consistency:** `nodeFlags` (M1a), `devIndex` + `devIndexDims` (§ 5.6), `visibility` (M1b), `queuedAt` (M2), `roadStep` (M4) used consistently across phases where they first appear and later get consumed by AI layer (phase 5).
- **Scope:** 7 phases is the right decomposition — M3+M4 couple naturally, M1 family couples naturally, survival+DevIndex+raids couple naturally, AI adaptation is one sweep, benchmark is one artifact, tuning+release is one gate. No phase crosses more than ~3 spec sections.
