---
reviewer_id: A5-balance-critic
plan_source: Round2/Plans/A5-balance-critic.md
round: 2
date: 2026-05-01
parent_commit: 425d669
head_commit: 91a8d5b
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 7/7
tests_passed: 1705/1714
tests_new: test/balance-afk-fail-state-r2.test.js
---

## Steps executed

- [x] **Step 1**: `src/config/balance.js` — renamed `workerHungerDecayWhenFoodZero` → `workerHungerDecayWhenFoodLow`, added `workerHungerDecayLowFoodThreshold: 8`. Updated comment to point at R2 finding (food never reaches strictly 0 because of TRADE_CARAVAN + recovery trickle).
- [x] **Step 2**: `src/simulation/economy/ResourceSystem.js` — changed the hunger-decay branch trigger from `state.resources.food <= 0` to `state.resources.food < BALANCE.workerHungerDecayLowFoodThreshold (default 8)`. Reads the renamed BALANCE key with fallback `?? 0`.
- [x] **Step 3**: `src/world/events/WorldEventSystem.js` — TRADE_CARAVAN per-tick yields cut: food `0.5 → 0.22` (-56%), wood `0.34 → 0.18` (-47%). Inline comment cites A5 R2 root-cause.
- [x] **Step 4**: `src/simulation/meta/ProgressionSystem.js:maybeTriggerRecovery` — added `meaningfulCollapse = deathsTotal > 0 || severePressure` hard-gate to the early-return condition so emergency relief charges only fire when an actual death has occurred or severe pressure is registered (not on soft food≤12 dips alone).
- [x] **Step 5**: `src/simulation/meta/ProgressionSystem.js:defended_tier_5` — milestone now requires `state.combat?.guardCount ≥ 1 || state.buildings?.walls ≥ 4`; pre-r2 a 0-wall 0-guard run could light up the milestone.
- [x] **Step 6**: `src/world/events/WorldEventSystem.js:raidsRepelled` — increment now gated on `event.payload?.defenseScore ≥ 1 || event.payload?.blockedByWalls === true`. Pre-r2 any BANDIT_RAID lifecycle reaching `resolve` was credited a repel.
- [x] **Step 7**: `test/balance-afk-fail-state-r2.test.js` — new file, 3 tests: (1) AFK fail-state with food pinned at 1 (low band) → hunger crosses 0.05 in 90s; (2) raidsRepelled stays 0 for 0-defense raid resolve; (3) counter-test — defenseScore=4 raid DOES increment.

Bonus: `test/balance-fail-state-and-score.test.js` (R1) updated to read the renamed BALANCE key with old-name fallback. No assertion logic changed.

## Tests

- **Baseline (parent 425d669)**: 1701/1708 sequential, 4 pre-existing failures.
- **Post-r2 head**: 1705/1714 (1711 + 3 new = 1714 total; 6 fail, 3 skip).
- **Pre-existing failures** (unchanged from R1 closeout):
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires` (food-rate-breakdown)
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
- **Plan-anticipated regressions** (R2 plan §5 Risks: "测试可能从 1646 pass 掉到 1640 左右"):
  - `exploit-regression: escalation-lethality — median loss tick ∈ [2000, 5000]` — baseline 7/10 deaths median=4452, post-r2 5/10 deaths median=Infinity. Recovery hard-gate + caravan cut shifted distribution; runs that previously died from soft-collapse now survive longer in a stuck-but-not-dead equilibrium.
  - `v0.10.0-c #2: scenario E walled-warehouse — FSM keeps all workers alive` — test sets `state.resources.food = 5` (below new threshold=8) and `worker.hunger=0.3`, so the 1800-tick window now triggers entity-hunger decay where pre-r2 it did not. This is exactly the autopilot regression flagged in the plan's Risks.
- **New tests added (3)**: all pass.

## Deviations from plan

- Step 5: plan said "fall back to `state.buildings?.walls >= 4` if `state.combat.activeWalls / state.combat.guards` not available — use git grep to confirm before choosing one or the other." Confirmed via Grep that neither `state.combat.activeWalls` nor `state.combat.guards` exist as fields, but `state.combat.guardCount` does (NPCBrainSystem, ThreatPlanner). Used `state.combat?.guardCount ≥ 1 || state.buildings?.walls ≥ 4`.
- Step 4: plan referenced lines 491-503 of ProgressionSystem.js (early-return guard); applied the new `meaningfulCollapse` clause as an additional `||` term in the same early-return predicate, preserving the existing chain semantics.
- Step 7: implemented as 3 tests (not 2) — added a counter-test that confirms the raidsRepelled gate IS permissive when defense is real (defenseScore=4, blockedByWalls=true), so a future "I broke the gate too tight" regression would surface.

## Freeze / Track check 结果

- **freeze_check: PASS** — 2 BALANCE field additions (`workerHungerDecayWhenFoodLow` rename of existing field; `workerHungerDecayLowFoodThreshold` new field on existing structure). 4 numeric tweaks (caravan food/wood, recovery gate, raidsRepelled gate, milestone gate). No new TILE / role enum / building blueprint / audio / UI panel.
- **track_check: PASS** — touched `src/config/`, `src/simulation/`, `src/world/`, `test/` only. No `docs/`, `README.md`, `CHANGELOG.md`, or `assignments/`-source modifications (commit-log under `Round2/Implementations/` is the spec's own output channel).

## Handoff to Validator

- **FPS regression**: not run by implementer (no UI/render changes); validator should confirm 5s p50 ≥ 55fps stable.
- **prod build**: not run; balance/world/progression files only — Vite build should be unaffected.
- **freeze-diff**: 1 BALANCE rename (compat-bridged in test/balance-fail-state-and-score.test.js); 1 BALANCE addition (`workerHungerDecayLowFoodThreshold`); no schema breakage.
- **invariant the new tests pin**:
  1. Low-food-band hunger decay fires (test/balance-afk-fail-state-r2.test.js #1)
  2. raidsRepelled requires actual defense (test/balance-afk-fail-state-r2.test.js #2 + #3)
- **handover items / regressions to track for R3**:
  1. `escalation-lethality` median shifted to Infinity — distribution tightening expected to recover once R3 retunes lossGracePeriodSec / collapse predicates around the new equilibrium.
  2. `scenario E walled-warehouse` — fixture starts at food=5 which is below new threshold=8. R3 may want to either bump the fixture food or stage the threshold to be aware of carry-eat distance.
  3. Visitor trade-yield (VisitorAISystem.js:427 `1.5 * dt * tradeYield`) is the OTHER passive food external — flagged in plan §5 as deferred to R3.
