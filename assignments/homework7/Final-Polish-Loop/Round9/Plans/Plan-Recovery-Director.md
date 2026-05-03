---
reviewer_id: Plan-Recovery-Director
feedback_source:
  - Round9/Feedbacks/PY-dev-completion.md
  - Round9/Feedbacks/PZ-holistic-rank.md
round: 9
date: 2026-05-01
build_commit: e7fb158
track: code
priority: P0
freeze_policy: hard
rollback_anchor: e7fb158
estimated_scope:
  files_touched: 4
  loc_delta: ~120
  new_tests: 1
  wall_clock: 90
conflicts_with:
  - Plan-Eat-Pipeline       # both touch warehouse-need / warehouse-throughput surface; serialize so the eat-pipeline lands on top of the recovery-released proposer chain
---

## 1. 核心问题

Two converging blockers turn the autopilot into a self-aware-but-frozen
spectator (PY) and produce the loudest player frustration in PZ
("autopilot reads its own diagnostic and ignores it"):

1. **`foodRecoveryMode` latches permanently.** PY trace: SET at sim
   t=127.4s, never released across the next 33 sim-min. The release gate
   in `src/app/GameApp.js:614` requires
   `food >= 24 && produced >= consumed && risk <= 0 && (now - startedAt) >= 20`
   — a four-way `AND` whose `produced >= consumed` clause is structurally
   unsatisfiable while spoilage > 0 and only farms exist. As long as the
   gate stays closed, `BuildProposer` skips `ProcessingProposer`
   (`src/simulation/ai/colony/BuildProposer.js:163,187,190`) and
   quarry/herbGarden/kitchen/smithy/clinic/wall NEVER reach the queue.
   Production dim sticks at 30, defense dim sticks at 0.
2. **Director doesn't read its own Food Diagnostic.** PZ verbatim:
   inspector pins "no warehouse access point" in red while the autopilot
   queues a Lumber camp. `WarehouseNeedProposer` already exists (R6 PK)
   at `src/simulation/ai/colony/proposers/WarehouseNeedProposer.js:47-74`
   but only fires on `noAccess || overSaturated AND hungerCrisis`. The
   PZ run never tripped `criticalRatio > 0.5` because workers were only
   "a bit hungry" — yet 30%+ of them already had `nutritionSourceType === "none"`
   for ≥10 s. The proposer needs a second predicate driven by per-worker
   diagnostic state, not just hunger %.

Tertiary: `LogisticsProposer` road target is 20 (verified at
`src/simulation/ai/colony/proposers/LogisticsProposer.js:25`), but PY
observed 79 roads on a 9-worker colony — the actual emitter is
`ScoutRoadProposer` (`src/simulation/ai/colony/proposers/ScoutRoadProposer.js:39-118`)
with no count cap. And `RoleAssignmentSystem` GUARD draft is gated on
`combat.activeRaiders + activeSaboteurs > 0` — when `strategy.priority="defend"`
but no live hostiles intersect the colony, `roleCounts.GUARD = 0` even
under PY's saboteur-explosion run.

## 2. Suggestions

### 方向 A: Three-prong director repair (recovery release + warehouse promotion + cap/draft) — **PICKED**
- 思路: Surgically loosen the recovery-release `AND` chain to an `OR`
  family (any one of {farms-target hit, warehouses≥1, headroom>90s}
  releases); broaden `WarehouseNeedProposer` with a per-worker
  `nutritionSourceType==="none"` ratio sensor (≥30% for ≥10s); cap
  `ScoutRoadProposer` at 30 total roads; add `strategy.priority==="defend"`
  → minimum 1 GUARD draft to `RoleAssignmentSystem`.
- 涉及文件: `src/app/GameApp.js`,
  `src/simulation/ai/colony/proposers/WarehouseNeedProposer.js`,
  `src/simulation/ai/colony/proposers/ScoutRoadProposer.js`,
  `src/simulation/population/RoleAssignmentSystem.js`,
  new `test/r9-recovery-director.test.js`.
- scope: 中
- 预期收益: PY's "permanently subsistence-only" verdict closes — recovery
  releases on the first warehouse build (PY's t≈10:00 sample), allowing
  ProcessingProposer to queue quarry/kitchen at ~t=10–15 sim-min instead
  of never. PZ's "autopilot ignores its own diagnostic" closes via the
  diagnostic-driven `WarehouseNeedProposer` predicate. Roads cap at 30
  not 79. GUARD≥1 under defend strategy.
- 主要风险: Loosened recovery release could let the colony exit recovery
  one tick too early on a `food≥24` blip and then re-enter; mitigated by
  preserving the existing 20-sec dwell on the time clause and leaving
  the `OR` closed under low-headroom + low-warehouse + low-farm
  conjunction. WarehouseNeed predicate could thrash if the diagnostic
  clears each tick — guard with a 10-sec `noAccessSinceSec` latch on
  `state.ai`.

### 方向 B: Time-bound the recovery latch only (do nothing else)
- 思路: Add `nowSec - foodRecoveryStartedSec > 600 → release` clause
  alongside the existing AND, mirroring PY §"Recommended Fix Direction"
  bullet 1.
- 涉及文件: `src/app/GameApp.js` only.
- scope: 小
- 预期收益: 35-min lockup becomes ≤10-min; ProcessingProposer eventually
  unblocks.
- 主要风险: Single-file change, ~10 LOC, NOT freeze-violating, but only
  partially closes PY (the "autopilot ignores diagnostic" gap from PZ
  stays wide open) and does nothing for the road over-spam or GUARD=0
  problem. Misses ~60% of the user pain. Documented as fallback if
  方向 A invariant tests fail to converge in this round.

### 方向 C: Director rewrite — invert proposer priority so quarry/herbGarden bypass recovery gate
- 思路: PY §"Recommended Fix Direction" bullet 2: even in recovery,
  allow stone/herb prerequisites because they unlock the path OUT of
  recovery.
- 涉及文件: `src/simulation/ai/colony/BuildProposer.js`,
  `src/simulation/ai/colony/proposers/ProcessingProposer.js`.
- scope: 中-大
- 预期收益: Conceptually the cleanest cure for PY's "recovery gate
  denies the very thing that would end recovery" loop.
- 主要风险: Touches the BuildProposer orchestration contract (recovery
  short-circuit invariant). Likely regresses 2-4 tests in
  `test/build-proposer-orchestration.test.js`,
  `test/build-proposer-wave-2-port.test.js`. Bigger blast radius than
  方向 A. Defer to post-R9 if 方向 A doesn't converge.

## 3. 选定方案

**方向 A.** Three sub-fixes, single plan, ~120 LOC, atomic per-step.
Selection rationale: (a) closes PY + PZ root causes simultaneously,
(b) all four files are leaf modules with existing test coverage to
guard against regression, (c) no new mechanic / tile / role / building
— pure predicate refinement and proposer wiring, satisfies HW7 hard
freeze, (d) decomposes cleanly so a partial revert (e.g. drop the
WarehouseNeed extension) leaves the recovery-release fix intact.

## 4. Plan 步骤

- [ ] **Step 1**: `src/app/GameApp.js:608-620` — `edit` —
      replace the single AND release chain with:
      ```
      const farmsTarget = Math.max(5, Number(state.populationStats?.workers ?? 0));
      const farms = Number(state.buildings?.farms ?? 0);
      const warehouses = Number(state.buildings?.warehouses ?? 0);
      const headroomSec = Number(state.metrics?.foodHeadroomSec ?? 0);
      const dwellOk = nowSec - startedAt >= 20;
      const escapeHatch =
        (farms >= Math.ceil(farmsTarget / 2)) ||
        (warehouses >= 1) ||
        (headroomSec > 90);
      const stableHealth = food >= 24 && risk <= 0 && dwellOk;
      if (stableHealth && (escapeHatch || produced >= consumed)) {
        ai.foodRecoveryMode = false;
        ai.foodRecoveryReason = "";
        state.controls.actionKind = "info";
        state.controls.actionMessage = "Autopilot recovery cleared: food runway is stable.";
      }
      ```
      Preserves the 20-sec dwell + risk=0 guard so the latch can't
      flicker tick-to-tick; introduces three OR-able escape hatches
      that match PY's "what would actually mean recovery is over"
      definition.

- [ ] **Step 2**: `src/simulation/ai/colony/proposers/WarehouseNeedProposer.js:32-44` — `edit` —
      add a sibling sensor `computeNoAccessRatio(state)` that walks
      `state.agents` once counting WORKERs whose
      `debug.nutritionSourceType === "none"` AND `alive !== false`.
      Returns `noAccess / alive` (0 when alive=0).
      depends_on: none (pure addition).

- [ ] **Step 3**: `src/simulation/ai/colony/proposers/WarehouseNeedProposer.js:47-74` — `edit` —
      extend the `evaluate` body so the proposer ALSO fires when
      `noAccessRatio >= 0.30` AND a 10-sec dwell is met. Add a
      `state.ai.warehouseDiagnosticSinceSec` latch field (created
      lazily in evaluate). New reason string:
      `"warehouse-need: 30%+ workers report no warehouse access (10s+ dwell)"`.
      Priority stays at 90.
      depends_on: Step 2.

- [ ] **Step 4**: `src/simulation/ai/colony/proposers/ScoutRoadProposer.js:46-50` — `edit` —
      after the existing `stoneStock >= 15` early-return, add:
      ```
      const roadCount = Number(state.buildings?.roads ?? 0);
      if (roadCount >= 30) return 0;
      ```
      Hard cap matches `PROCESSING_TARGETS.roads = 30` referenced in
      PY's secondary findings. Comment the line with PY-source ref.

- [ ] **Step 5**: `src/simulation/population/RoleAssignmentSystem.js:328-336` — `edit` —
      threat-aware GUARD floor. Before the `for (const w of guards)
      setWorkerRole(...)` line, insert:
      ```
      const strategyDefend = String(state?.gameplay?.strategy?.priority ?? "") === "defend";
      if (strategyDefend && guards.length === 0 && allWorkers.length >= 4) {
        // PY R9 §"GUARD=0 despite strategy.priority='defend'":
        // when the director declares a defend posture but no live
        // hostiles intersect the colony, draft 1 GUARD anyway.
        const candidate = allWorkers.find((w) =>
          !guardSet.has(w) && w.role !== "BUILDER");
        if (candidate) {
          guardSet.add(candidate);
          guards.push(candidate);
        }
      }
      ```
      depends_on: none. Preserves existing draft logic; only adds the
      "no hostile but defend strategy" backstop.

- [ ] **Step 6**: `test/r9-recovery-director.test.js` — `add` — invariants:
      1. With `state.ai.foodRecoveryMode=true`, `farms=3` of target=5,
         `warehouses=0`, `foodHeadroomSec=20` → release does NOT fire.
      2. Same state but `warehouses=1` → release fires after 20s dwell.
      3. WarehouseNeedProposer with 6/12 WORKERs at
         `nutritionSourceType==="none"` and `_diagSinceSec` latched 11s
         ago → emits warehouse @priority=90.
      4. ScoutRoadProposer with `roads=31, stone=0` → returns 0 (cap).
      5. RoleAssignmentSystem with `strategy.priority="defend"`, 0 hostiles,
         12 workers → at least 1 GUARD drafted.
      depends_on: Steps 1, 3, 4, 5.

- [ ] **Step 7**: `CHANGELOG.md` — `add` — `[Unreleased] — v0.10.2-r9-recovery-director`
      block with PY+PZ citation and per-step changelog.
      depends_on: all source steps.

## 5. Risks

- **R1 (recovery thrash)**: relaxed release could exit then re-enter
  recovery rapidly. Mitigated by 20-sec dwell preservation + the AND
  with `risk <= 0` already excluding any active starvation risk.
- **R2 (WarehouseNeed double-fire)**: if both `noAccess` AND
  `noAccessRatio>=0.30` predicates fire simultaneously, two
  WAREHOUSE proposals dedupe at the orchestrator's sort+filter stage
  (`BuildProposer.js` already collapses duplicates by type). No
  additional guard needed.
- **R3 (ScoutRoad regression)**: capping at 30 may leave fogged stone
  unreached when scout-road density should be higher; acceptable per
  PY §"79 roads for 9-worker colony" (over-spam is the bug).
- **R4 (GUARD draft of role-locked worker)**: candidate lookup
  excludes `BUILDER` to honour the existing site-reservation invariant;
  may still demote a COOK/SMITH if the colony is small. Acceptable
  under defend strategy — defense > processing in that posture.
- **可能影响的现有测试**:
  `test/build-proposer-orchestration.test.js` (steps 1, 3 — recovery
  flag manipulation), `test/colony-director-behavior-lock.test.js`
  (step 1 — autopilot release path), `test/role-assignment-*.test.js`
  family (step 5 — GUARD count). Re-run before commit.

## 6. 验证方式

- 新增测试: `test/r9-recovery-director.test.js` — 5 invariants per Step 6.
- 手动验证: `npx vite` → start Temperate Plains seed 56786007 →
  `__utopia.state.ai.foodRecoveryMode = true` → step 1200 sim-sec →
  observe transition to `false` once warehouses≥1; observe at least
  one quarry / kitchen blueprint queued by t≈15 sim-min.
- benchmark 回归: `node --test test/*.test.js` baseline 1936/1933 pass
  (R8 closeout) — must stay ≥1933 pass with 0 fail.
- Freeze gate: `git diff --stat e7fb158..HEAD` must show exactly 4
  source files + 1 test + 1 changelog. No new tile / role / building /
  mood / mechanic / audio / UI panel.

## 7. UNREPRODUCIBLE 标记

不适用. PY repro is deterministic (Temperate Plains, fallback policy,
8 samples × 5 sim-min); PZ repro is observational but the symptom is
well-documented in `WarehouseNeedProposer.js:47-74`'s existing trigger
gate and the GameApp.js:608-620 release chain.
