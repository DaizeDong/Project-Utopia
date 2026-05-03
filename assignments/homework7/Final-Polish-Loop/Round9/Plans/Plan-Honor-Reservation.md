---
reviewer_id: Plan-Honor-Reservation
feedback_source: Round9/Feedbacks/PX-work-assignment-binding.md
round: 9
date: 2026-05-01
build_commit: e7fb158
track: code
priority: P0
freeze_policy: hard
rollback_anchor: e7fb158
estimated_scope:
  files_touched: 2
  loc_delta: ~40
  new_tests: 1
  wall_clock: 30
conflicts_with: []   # No overlap with the other R9 plans (different files: WorkerStates.js + RoleAssignmentSystem.js BUILDER quota path; Recovery-Director only touches RoleAssignmentSystem GUARD path on a different code block)
---

## 1. 核心问题

PX section "Race conditions found" identifies two HIGH-severity bugs
that produce the user's verbatim complaint "工作场景与 worker 能够
一一绑定 broken" (workers cluster on one site / sites idle while
workers cluster):

1. **HARVEST `tryReserve` boolean is discarded.** PX B1 — at
   `src/simulation/npc/fsm/WorkerStates.js:301-303` (SEEKING_HARVEST.onEnter)
   and `:344-346` (HARVESTING.onEnter) the FSM calls
   `reservation.tryReserve(worker.id, t.ix, t.iz, "harvest", nowSec)`
   and **discards the boolean return value**. Per the documented
   contract on `JobReservation.js` ("a `false` result means the
   worker lost the race and should abandon to JobWander"), losing
   the race should null the target so the dispatcher's
   `fsmTargetNull` transition (`WorkerTransitions.js:109,137,151,167`)
   kicks the worker back to IDLE. Currently every FARM/WOOD/QUARRY
   worker can pile onto the highest-scoring tile while the
   reservation still points at one (often-stale) holder.
2. **BUILDER quota leaves sites idle while harvesters cluster.**
   PX B3 — with 12 organic workers the role distribution was
   `{FARM:5, GUARD:4, BUILDER:1, SMITH:1, COOK:1}` while 9-12
   build sites sat with `builderId === null`. Only 1 site can be
   built at a time because only 1 BUILDER exists. The current
   `targetBuilders` formula
   (`src/simulation/population/RoleAssignmentSystem.js:356-359`)
   uses `ceil(sitesCount * builderPerSite)` clamped to
   `[builderMin, builderMax]` then capped by the
   `builderMaxFraction=0.30` rule (line 366, 384-387). With 12
   workers and `builderMaxFraction=0.30`, fractionCap = 3 → up to
   3 builders at most. PX B3 wants the lower-bound "at least 2
   when sites exist" floor and the size-by-unclaimed-sites
   formula `max(2, ceil(sitesUnclaimed * 0.4))` so a site backlog
   pulls extra builders.

## 2. Suggestions

### 方向 A: Two-prong reservation honor + builder quota refresh — **PICKED**
- 思路: Honor the `tryReserve` boolean in both HARVEST onEnters
  (null target on `false` so dispatcher routes back to IDLE).
  Refresh `RoleAssignmentSystem` BUILDER quota to
  `max(2, ceil(sitesUnclaimed * 0.4))` so unbuilt sites pull more
  builders. Both fixes are surgical edits to existing code paths,
  zero new mechanics.
- 涉及文件:
  `src/simulation/npc/fsm/WorkerStates.js`,
  `src/simulation/population/RoleAssignmentSystem.js`,
  new `test/r9-honor-reservation.test.js`.
- scope: 小 (~40 LOC).
- 预期收益: PX-described race (4 workers HARVESTING tile (54,42)
  while only worker_6 holds the lock) closes — losers get
  re-targeted to a different tile by the next IDLE → SEEKING_HARVEST
  cycle. PX B3 closes — builder count scales with unclaimed-site
  count instead of total-site count.
- 主要风险: Honoring `tryReserve` may cause a wave of
  IDLE-bouncing on the first frame after job assignment if the
  reservation cache is stale. Mitigated because the dispatcher's
  `fsmTargetNull` transition (priority 7 in
  `SEEKING_HARVEST_TRANSITIONS`, `WorkerTransitions.js:109`)
  immediately routes to IDLE → IDLE re-evaluates and picks a
  different tile next tick. Net: 1-tick latency for losers.

### 方向 B: Add per-tile occupancy hard cap (no reservation honor)
- 思路: Skip the reservation contract; instead add a hard
  `chooseWorkerTarget` filter that excludes tiles with ≥1
  HARVESTING worker already on them.
- 涉及文件: `src/simulation/npc/WorkerAISystem.js:282-284` (penalty
  layer).
- scope: 中
- 预期收益: Same convergent effect (workers spread out) without
  modifying the FSM port.
- 主要风险: Replaces the existing soft -2.0 penalty with a hard
  exclusion. Likely regresses the tests that rely on the soft
  penalty letting a worker take a "best available" tile when no
  unoccupied tile exists. The reservation contract already
  exists and is documented — using it is the cleaner fix.

### 方向 C: PROCESSING per-tile claim (PX B4)
- 思路: Mirror the harvest reservation pattern in
  `SEEKING_PROCESS / PROCESSING` (`WorkerStates.js:520-559`).
- 涉及文件: `src/simulation/npc/fsm/WorkerStates.js` (PROCESSING block).
- scope: 中
- 预期收益: Closes PX B4 (extra COOK silently wasted on a kitchen
  tile).
- 主要风险: PX rates B4 as "LOW for current play, MEDIUM for
  future" — not stressed in any current run because food shortage
  keeps role counts low. Out of scope for R9; defer to v0.10.3.
  This plan focuses ONLY on the HIGH-severity items B1 + B3.

## 3. 选定方案

**方向 A.** Two HIGH-severity items, smallest possible delta to
existing surfaces. Both edits respect the documented contracts
(JobReservation's "lost race → abandon", RoleAssignmentSystem's
existing builderMin/builderMax/builderMaxFraction structure).
方向 B (occupancy hard cap) and 方向 C (PROCESSING claims) are
explicitly deferred — the user's primary frustration is harvest
clustering and builder starvation, exactly what 方向 A targets.

## 4. Plan 步骤

- [ ] **Step 1**: `src/simulation/npc/fsm/WorkerStates.js:299-303` — `edit` —
      change `SEEKING_HARVEST.onEnter` to honor the `tryReserve`
      return value:
      ```
      const reservation = state?._jobReservation;
      const nowSec = Number(state?.metrics?.timeSec ?? 0);
      if (reservation?.tryReserve) {
        const claimed = reservation.tryReserve(worker.id, tgt.ix, tgt.iz, "harvest", nowSec);
        if (!claimed) {
          // PX R9 B1 — lost the race; null the target so the
          // dispatcher's `fsmTargetNull` transition (priority 7
          // in SEEKING_HARVEST_TRANSITIONS) routes back to IDLE
          // for re-pick on the next tick.
          worker.fsm.target = null;
          return;
        }
      }
      ```
      depends_on: none.

- [ ] **Step 2**: `src/simulation/npc/fsm/WorkerStates.js:342-346` — `edit` —
      apply the same pattern to `HARVESTING.onEnter`. The
      HARVESTING tick body's safety net (`if (!t) return;` at line
      352) already handles `worker.fsm.target = null`, so dropping
      out of the body is safe — and the dispatcher's HARVESTING
      transitions (`WorkerTransitions.js:114-131`) include
      `priority: 8 → STATE.IDLE when (yieldPoolDriedUp && carryEmpty)`
      which catches the no-target case. Concrete change at line 344-346:
      ```
      const reservation = state?._jobReservation;
      const nowSec = Number(state?.metrics?.timeSec ?? 0);
      if (reservation?.tryReserve) {
        const claimed = reservation.tryReserve(worker.id, t.ix, t.iz, "harvest", nowSec);
        if (!claimed) {
          worker.fsm.target = null;
          return;
        }
      }
      ```
      depends_on: none. Pairs with Step 1 — same primitive on the
      arrival side.

- [ ] **Step 3**: `src/simulation/population/RoleAssignmentSystem.js:351-359` — `edit` —
      replace the BUILDER quota formula. Before the existing
      `let targetBuilders = sitesCount > 0 ? Math.ceil(...) : 0`,
      compute `sitesUnclaimed`:
      ```
      const sitesUnclaimedCount = sitesArr.reduce(
        (acc, s) => acc + (s && !s.builderId ? 1 : 0), 0);
      // PX R9 B3 — when sites exist but lack a claimant, pull
      // more builders so the queue actually drains. Floor at 2
      // so the colony always has redundancy on a non-empty
      // construction queue.
      let targetBuilders = sitesCount > 0
        ? Math.max(2, Math.ceil(sitesUnclaimedCount * 0.4))
        : 0;
      targetBuilders = Math.max(builderMin, Math.min(builderMax, targetBuilders));
      ```
      The downstream `builderMaxFraction` cap (lines 384-387) and
      `economyHeadroom` cap (line 391) still constrain the upper
      bound, so the floor of 2 is honored only when the worker pool
      can spare them. depends_on: none.

- [ ] **Step 4**: `test/r9-honor-reservation.test.js` — `add` —
      invariants:
      1. SEEKING_HARVEST.onEnter: with state.\_jobReservation
         containing existing claim on (5,5) by "worker_A", call
         onEnter for "worker_B" with target (5,5) → after onEnter,
         `worker_B.fsm.target === null`.
      2. HARVESTING.onEnter: same setup, with worker.targetTile=(5,5)
         pre-set → after onEnter, `worker.fsm.target === null`.
      3. SEEKING_HARVEST.onEnter happy path: empty reservation,
         target (5,5) → after onEnter, target set + claim recorded.
      4. RoleAssignmentSystem with `sitesArr=[6 sites all unclaimed],
         workers=12` → `targetBuilders >= 2` (was 1 pre-fix; should
         be `max(2, ceil(6*0.4)) = 3`).
      5. RoleAssignmentSystem with `sitesArr=[1 site claimed by
         existing builder], workers=12` → `sitesUnclaimedCount=0`
         → `targetBuilders=max(2, 0)=2` (preserves redundancy).
      6. RoleAssignmentSystem with `sitesArr=[]` → targetBuilders=0
         (floor only kicks in when sites exist).
      depends_on: Steps 1, 2, 3.

- [ ] **Step 5**: `CHANGELOG.md` — `add` — `[Unreleased] — v0.10.2-r9-honor-reservation`
      block citing PX B1 + B3 with per-step changelog.
      depends_on: all source steps.

## 5. Risks

- **R1 (IDLE thrash on lost race)**: a worker that loses
  `tryReserve` returns to IDLE; on the next tick `IDLE_TRANSITIONS`
  (`WorkerTransitions.js:75-86`) re-evaluates and picks another
  tile. If `chooseWorkerTarget` consistently picks the SAME tile
  for multiple workers, the lossers will bounce IDLE→SEEKING→IDLE
  every tick. Mitigated by the existing soft -2.0 reservation
  penalty (`WorkerAISystem.js:282`) — it just needs to actually
  bias toward different targets when the lock is honored. If
  thrashing emerges, follow-up (out of scope) to lift the penalty
  to -∞ for reserved tiles.
- **R2 (BUILDER over-allocation in tight populations)**: with 4
  workers and 5 sites the formula yields `max(2, ceil(5*0.4))=2`,
  capped by `economyHeadroom = 4 - guards - 1`. If guards=0 then
  economyHeadroom=3 → 2 builders + 1 economy worker → economy
  starves. Mitigated by `builderMaxFraction` (default 0.30 → cap
  at 1 builder for a 4-worker colony) — matches existing v0.8.6
  Tier 3 BC3 invariant (`RoleAssignmentSystem.js:360-366`).
- **R3 (test churn for existing role-assigner suites)**: the
  builder-quota change will shift expected counts in
  `test/role-assignment-builder-allocation.test.js` family.
  Re-baseline those tests as part of Step 4 if needed.
- **可能影响的现有测试**:
  `test/worker-fsm-*` family (Steps 1, 2 — FSM onEnter behaviour);
  `test/job-reservation*.test.js` (reservation primitive);
  `test/role-assignment*.test.js` (BUILDER quota).
  Re-run before commit.

## 6. 验证方式

- 新增测试: `test/r9-honor-reservation.test.js` — 6 invariants per
  Step 4.
- 手动验证: `npx vite` → reproduce PX Method
  (`__utopiaLongRun.devStressSpawn(30)`, place ~19 blueprints) →
  inspect `state._jobReservation._tiles` after 60 sim-sec → expect
  every HARVESTING worker's target tile to match a tile in the
  reservation map (no orphan harvesters); inspect
  `roleCounts.BUILDER` ≥ 2 when constructionSites.length ≥ 5.
- benchmark 回归: 1936/1933 pass baseline must stay ≥1933 pass /
  0 fail.
- Freeze gate: `git diff --stat e7fb158..HEAD` must show exactly 2
  source files + 1 test + 1 changelog. No new mechanic.

## 7. UNREPRODUCIBLE 标记

不适用. PX evidence is rock-solid (8 snapshots @ 30 sim-sec stride;
race tile (54,42) appears 8/8 with 2-4 simultaneous claimants;
`_jobReservation.stats` shows 0-2 active locks vs 5-8 simultaneous
HARVESTING workers — the bypass is direct and reproducible).
