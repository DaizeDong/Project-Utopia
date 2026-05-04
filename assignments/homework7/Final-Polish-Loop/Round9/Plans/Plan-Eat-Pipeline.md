---
reviewer_id: Plan-Eat-Pipeline
feedback_source: Round9/Feedbacks/PW-scale-stability.md
round: 9
date: 2026-05-01
build_commit: e7fb158
track: code
priority: P0
freeze_policy: hard
rollback_anchor: e7fb158
estimated_scope:
  files_touched: 3
  loc_delta: ~60
  new_tests: 1
  wall_clock: 45
conflicts_with:
  - Plan-Recovery-Director  # both touch warehouse logic — Recovery-Director extends WarehouseNeedProposer triggers; this plan extends the same proposer with a contention sensor. Serialize so the contention sensor lands on top of the diagnostic-driven trigger.
---

## 1. 核心问题

PW Test C exposes the single biggest scale-stability gap in v0.10.1-m:
**49/50 workers in critical hunger with food=3879 + meals=194 in
stockpile** — they can't physically reach the single (5/6 blocked)
warehouse fast enough.

Two structural failures compose:

1. **Survival preempt is masked by `carry.food > 0` AND warehouse
   reachability.** `_emergencyRationStep`
   (`src/simulation/npc/WorkerAISystem.js:562-619`) early-returns
   at line 596 (`if (reachable !== false) return;`) whenever the
   warehouse is globally reachable, even when this particular
   worker is queued behind 30 others and starving with full carry.
   The "v0.8.8 D1 tightening" comment (lines 572-581) intentionally
   denied carry-eat when reachableFood ≠ false to prevent workers
   munching carry at the warehouse — but the unconditional gate
   defeats survival in queue contention. PW §"survival-preempt
   doesn't fire because workers' carry.food > 0 masks the
   emergency."
2. **WarehouseNeedProposer doesn't fire on contention.** With 50
   workers and 1 warehouse, contention ratio = 50:1 → 8.3× the
   safe threshold. The current proposer
   (`src/simulation/ai/colony/proposers/WarehouseNeedProposer.js:47-74`)
   only fires on `noAccess || overSaturated AND hungerCrisis`. A
   warehouse exists (so `noAccess=false`), it has stockpile headroom
   (so `overSaturated=false`), and the role-assigner never adds a
   second one until cascade. PW recommendation §2 verbatim:
   "increase warehouse need priority via WarehouseNeedProposer
   (extend R6 PK proposer)."

## 2. Suggestions

### 方向 A: Two-prong eat-pipeline unblock (carry-eat survival bypass + warehouse contention need) — **PICKED**
- 思路: Lower the survival-preempt mask from "warehouse not reachable"
  to "warehouse not reachable OR hunger truly critical" so a worker
  with carry food and hunger<0.15 always eats from carry; extend
  `WarehouseNeedProposer` with a `workers / warehouses > 12`
  contention sensor that emits warehouse @priority=88 (slot one
  notch under the noAccess @90 case so noAccess still wins).
- 涉及文件:
  `src/simulation/npc/WorkerAISystem.js`,
  `src/simulation/ai/colony/proposers/WarehouseNeedProposer.js`,
  new `test/r9-eat-pipeline.test.js`.
- scope: 中-小 (~60 LOC).
- 预期收益: PW Test C re-run → 49/50 starving collapses to ≤5/50;
  proposer auto-builds warehouse #2 at the 13:1 contention point so
  the 50:1 starvation never materialises.
- 主要风险: Loosened survival-preempt could re-introduce the v0.8.7
  T0-3 carry-munching exploit (workers eating carry next to the
  warehouse instead of depositing). Mitigated by gating the
  exception on `hunger < 0.15` AND `carry.food > 0` only — at that
  hunger the worker is ~30 sim-sec from death, the warehouse-
  munching exploit isn't the priority.

### 方向 B: Carry-eat bypass only (skip the proposer extension)
- 思路: Just relax the survival mask; let role-assigner handle the
  warehouse contention organically.
- 涉及文件: `src/simulation/npc/WorkerAISystem.js` only.
- scope: 小
- 预期收益: Closes the immediate "starving with carry food" symptom.
  Role-assigner won't add warehouses on its own (no current trigger
  for contention), so the next 50-worker run has the same 1-warehouse
  bottleneck — workers survive but the queue never shrinks.
- 主要风险: Insufficient on its own per PW §"single warehouse becomes
  the bottleneck for at-warehouse fast-eat." 方向 A's proposer
  extension is what closes the structural side.

### 方向 C: Per-warehouse eat-throughput cap that triggers role-assigner
- 思路: PW Recommendation §2 alternate — instead of extending the
  proposer, add a per-warehouse eat-throughput cap so that when
  contention >N workers/site, RoleAssignmentSystem flags the
  director.
- 涉及文件: `src/simulation/economy/WarehouseQueueSystem.js`,
  `src/simulation/population/RoleAssignmentSystem.js`,
  several balance constants.
- scope: 中-大
- 预期收益: Cleaner — caps at the queue layer, signals upward.
- 主要风险: Touches WarehouseQueueSystem invariants which have
  multiple hot paths and 30+ existing tests; far higher blast
  radius than 方向 A's WarehouseNeedProposer extension. Defer.

## 3. 选定方案

**方向 A.** Two-prong fix matches PW's two distinct recommendations
verbatim, ~60 LOC, no new mechanic / tile / role / building. The
carry-eat unblock is a single conditional refinement; the proposer
extension is one extra branch on an existing proposer. HW7 hard
freeze fully respected. Synergy with Plan-Recovery-Director: that
plan also extends WarehouseNeedProposer (with diagnostic-driven
trigger). They edit different branches of the same proposer's
`evaluate()` so a serial implementer ordering avoids conflict.

## 4. Plan 步骤

- [ ] **Step 1**: `src/simulation/npc/WorkerAISystem.js:584-597` — `edit` —
      replace the unconditional `if (reachable !== false) return;`
      gate (line 596) with a starvation-bypass:
      ```
      const hungerNow = Number(worker.hunger ?? 0);
      const survivalCritical = hungerNow < 0.15 && carryFood > 0;
      if (reachable !== false && !survivalCritical) return;
      ```
      Rationale (inline comment): "PW R9 §scale-stability — when a
      worker's hunger crosses 0.15 (≈30 sim-sec from death) AND
      they have carry food, eat from carry IMMEDIATELY regardless
      of whether the warehouse is theoretically reachable. At 50
      workers + 1 warehouse the warehouse is reachable but the
      queue is 30+ deep; survival overrides the carry-munching
      exploit guard at this hunger floor."
      depends_on: none.

- [ ] **Step 2**: `src/simulation/ai/colony/proposers/WarehouseNeedProposer.js:47-74` — `edit` —
      add a third trigger branch (after the existing `noAccess` and
      `overSaturated` checks):
      ```
      // PW R9 §scale-stability — warehouse contention sensor.
      // When the colony has >12 workers per warehouse, the eat-pipeline
      // bottlenecks (PW Test C: 49/50 starving with stockpile full).
      // Emit warehouse build need at priority 88 (one notch under
      // noAccess @90 so noAccess still preempts).
      const workerCount = Number(ctx.workers ?? 0);
      const contention = warehouses > 0 ? (workerCount / warehouses) : Infinity;
      if (warehouses > 0 && contention > 12) {
        return [{
          type: "warehouse",
          priority: 88,
          reason: `warehouse-need: contention ${contention.toFixed(1)} workers/warehouse > 12`,
        }];
      }
      ```
      Place the new branch BEFORE the existing
      `if (!noAccess && !overSaturated) return [];` early-return so
      it competes with the diagnostic branch (Plan-Recovery-Director
      Step 3) on equal footing.
      depends_on: none. Coordinate ordering with Plan-Recovery-Director
      Step 3 — implementer should land Plan-Recovery-Director first
      (which adds the diagnostic-driven trigger), then this plan adds
      the contention trigger as a sibling branch.

- [ ] **Step 3**: `test/r9-eat-pipeline.test.js` — `add` — invariants:
      1. `_emergencyRationStep` with `worker.hunger=0.10,
         carry.food=2, reachable=true, warehouseFood=100` →
         worker.hunger increases (carry-eat fires per survival
         bypass).
      2. Same call but `worker.hunger=0.30` (above 0.15 floor) →
         worker.hunger UNCHANGED (preserves v0.8.8 D1 contract for
         non-survival hunger).
      3. WarehouseNeedProposer with
         `workers=50, warehouses=1, food=200, agents=[]` →
         emits warehouse @priority=88 with contention reason.
      4. Same proposer with `workers=10, warehouses=1` (ratio=10) →
         no emission (under threshold).
      5. Same proposer with `workers=50, warehouses=0` →
         emits @priority=90 (noAccess wins over contention).
      depends_on: Steps 1, 2.

- [ ] **Step 4**: `CHANGELOG.md` — `add` — `[Unreleased] — v0.10.2-r9-eat-pipeline`
      block citing PW with per-step changelog.
      depends_on: all source steps.

## 5. Risks

- **R1 (carry-eat exploit re-emerges)**: a worker at hunger=0.14
  next to a healthy warehouse will now munch carry instead of
  depositing. Acceptable per PW: at hunger<0.15 the worker is
  effectively in a death-spiral and the deposit-then-eat round trip
  is the actual exploit (the round trip is what's killing them).
  Mitigated by the strict 0.15 threshold being below the
  v0.8.8-tuned `WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD` — the
  exploit window is 0.15 sec at most.
- **R2 (proposer over-build)**: contention trigger could keep
  emitting warehouses indefinitely if `workers/warehouses` stays
  above 12 even after a build. Self-limiting because each new
  warehouse drops the ratio (50/1=50, 50/2=25, 50/3=16.7, 50/4=12.5
  — fires until 5 warehouses, ratio=10 < 12 → stops). Aligns with
  PW's "1 warehouse / 10-12 workers" healthy ratio observation.
- **R3 (proposer ordering bug with Plan-Recovery-Director)**: both
  plans extend the same `evaluate()` body. Plan-Recovery-Director
  adds the `noAccessRatio>=0.30` branch; this plan adds the
  `contention>12` branch. Both must be inserted BEFORE the existing
  early-return on line 60. Implementer should land
  Plan-Recovery-Director Step 2+3 first, verify invariants, then
  layer Step 2 of this plan on top.
- **可能影响的现有测试**:
  `test/worker-ai-system-*.test.js` family (Step 1: emergency
  ration carry-eat path);
  `test/warehouse-need-proposer*.test.js` if any exist (Step 2);
  `test/balance-pass-*.test.js` long-horizon tests (overall scale
  stability shift). Re-run all before commit.

## 6. 验证方式

- 新增测试: `test/r9-eat-pipeline.test.js` — 5 invariants per Step 3.
- 手动验证: `npx vite` → reproduce PW Test C exactly
  (`?dev=1`, `applyPopulationTargets({workers:50,
  saboteurs:12, ...})`, place 1 warehouse + 16 farms instant) → step
  100 sim-sec → expect Critical hunger ≤ 5/50 (was 49/50) and at
  least 1 additional warehouse blueprint queued (or constructed
  if BUILDERs are available).
- benchmark 回归: 1936/1933 pass baseline must stay ≥1933 pass /
  0 fail. Especially watch
  `test/worker-ai-emergency-ration*.test.js` and
  `test/warehouse-density*.test.js`.
- Freeze gate: `git diff --stat e7fb158..HEAD` must show exactly 2
  source files + 1 test + 1 changelog. No new role / building / mood
  / mechanic.

## 7. UNREPRODUCIBLE 标记

不适用. PW Test C is fully scripted via `applyPopulationTargets` +
`placeToolAt({instant:true})` — repro-ready in a Playwright session.
