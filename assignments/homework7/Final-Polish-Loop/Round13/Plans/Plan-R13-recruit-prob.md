---
reviewer_id: Plan-R13-recruit-prob (R13 user issue #1)
feedback_source: assignments/homework7/Final-Polish-Loop/Round13/Feedbacks/summary.md
round: 13
date: 2026-05-01
build_commit: 527f460
priority: P1
track: code (population pacing — fast-track recruit when food surplus AND build backlog)
freeze_policy: hard
rollback_anchor: 527f460
estimated_scope:
  files_touched: 2
  loc_delta: ~40
  new_tests: 1
  wall_clock: 30
conflicts_with: []
---

# Plan-R13-recruit-prob — Fast-track recruit cooldown when food surplus AND pending build jobs ≥ 3

**Plan ID:** Plan-R13-recruit-prob
**Source feedback:** R13 user directive issue #1 — "When food surplus (foodHeadroomSec ≥ 120s) AND pendingBuildJobs ≥ 3, increase recruit probability/cooldown"
**Track:** code
**Priority:** **P1** — Player observed colonies sit at low population while building backlog grows because the recruit cooldown is a fixed 30s regardless of context. When the colony has both excess food and excess work, the fixed cooldown is the bottleneck, not food/queue.
**Freeze policy:** hard — no new mechanic; only adds two tunables to the existing `BALANCE.recruit*` family and a single multiplier branch in the existing cooldown drain. No new tile / role / building / mood.
**Rollback anchor:** `527f460`

---

## 1. Core problem (one paragraph)

`PopulationGrowthSystem` drains `state.controls.recruitCooldownSec` at a fixed rate (1× wall-clock). When `foodHeadroomSec` is comfortably positive (≥120s) AND there are ≥3 pending build jobs (`state.construction.blueprintQueue.length` or equivalent in `state.metrics.pendingBuildJobs`), the colony is simultaneously food-surplus AND labor-deficit — the textbook condition for accelerating recruitment. The current code treats every recruit identically: 30s cooldown, single food-cost gate. Result: player watches build queue stagnate at 8 workers + 6 pending jobs because the cooldown timer says "wait 30s between each recruit", even when food/jobs would clearly support a faster ramp.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — additive cooldown multiplier when both conditions met

Add `BALANCE.recruitFastTrackHeadroomSec = 120` and `BALANCE.recruitFastTrackPendingJobs = 3` and `BALANCE.recruitFastTrackCooldownMult = 0.5` (halves drain time when both gates fire). In `PopulationGrowthSystem.update`, compute `pendingBuildJobs` from existing state and `foodHeadroomSec` (already exported above as part of the PC-recruit-flow-rate-gate logic) — when both clear, multiply the dt drained from `recruitCooldownSec` by `1 / fastTrackCooldownMult` (i.e. drain 2× as fast). This means the cooldown effectively shrinks from 30s to 15s when the colony is "ready and waiting" to grow.

- Files: `src/config/balance.js` (3 new constants), `src/simulation/population/PopulationGrowthSystem.js` (cooldown drain branch).
- Scope: ~25 LOC + 1 test ~15 LOC = ~40 LOC.
- Expected gain: closes user issue #1; population grows ~2× faster during the "thriving but understaffed" window.
- Main risk: faster ramp could overshoot infraCap or food-runway during a sudden raid. Mitigated — both gates remain checked every tick; the moment foodHeadroomSec drops below 120 or pending jobs falls below 3, drain reverts to 1×.

### Suggestion B (in-freeze) — probability-based fast-track instead of cooldown multiplier

Keep cooldown at 30s but, when both gates fire, give a per-tick probability of "skip remaining cooldown and spawn immediately". Cleaner semantically but adds RNG dependency that's harder to test deterministically.

- Files: same 2 files
- Scope: ~30 LOC
- Expected gain: equivalent
- Main risk: RNG noise; harder to predict for the player.

### Suggestion C (FREEZE-VIOLATING) — add a "Recruit Now" UI button bypassing cooldown entirely

New UI affordance + new control. Out of freeze. Defer.

## 3. Selected approach

**Suggestion A** — purely additive constants, no RNG, fully deterministic, trivial to test.

## 4. Plan steps

- [ ] **Step 1 — Add BALANCE constants in `src/config/balance.js`.**
  Add three new properties to the `BALANCE` `Object.freeze` literal near the existing `recruit*` block (search for `recruitFoodCost`):
  ```js
  recruitFastTrackHeadroomSec: 120, // food runway above which cooldown can fast-track
  recruitFastTrackPendingJobs: 3,   // pending blueprint count above which cooldown can fast-track
  recruitFastTrackCooldownMult: 0.5, // 0.5 = drain cooldown 2× faster when both gates fire
  ```
  - Type: edit
  - File: `src/config/balance.js`

- [ ] **Step 2 — Compute `pendingBuildJobs` snapshot at the top of `PopulationGrowthSystem.update` (once per tick).**
  After the existing `recruitFoodCost` / `recruitMinBuffer` reads (around line 140 of `PopulationGrowthSystem.js`), add:
  ```js
  // R13 #1 fast-track: drain cooldown 2× when food-surplus AND build-backlog
  const pendingBuildJobs = Number(state?.construction?.blueprintQueue?.length ?? state?.metrics?.pendingBuildJobs ?? 0);
  const headroomSec = computeForwardFoodHeadroomSec(state); // existing helper (search PC-recruit-flow-rate-gate)
  const fastTrackArmed = headroomSec >= Number(BALANCE.recruitFastTrackHeadroomSec ?? 120)
    && pendingBuildJobs >= Number(BALANCE.recruitFastTrackPendingJobs ?? 3);
  ```
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Apply multiplier in the cooldown drain at line ~118.**
  Change the existing `Number(state.controls.recruitCooldownSec ?? 0) - dtNum` to:
  ```js
  const drainMult = fastTrackArmed
    ? 1 / Math.max(0.05, Number(BALANCE.recruitFastTrackCooldownMult ?? 0.5))
    : 1;
  state.controls.recruitCooldownSec = Math.max(0, Number(state.controls.recruitCooldownSec ?? 0) - dtNum * drainMult);
  ```
  - Type: edit
  - depends_on: Step 2

- [ ] **Step 4 — Add unit test `test/recruit-fast-track.test.js` (~30 LOC).**
  Test cases:
  1. Baseline: headroomSec=60, pendingBuildJobs=0 → cooldown drains 1×.
  2. Headroom OK but no jobs: headroomSec=200, pendingBuildJobs=0 → cooldown drains 1× (gate AND).
  3. Jobs but no headroom: headroomSec=30, pendingBuildJobs=5 → cooldown drains 1×.
  4. Both gates fire: headroomSec=200, pendingBuildJobs=5 → cooldown drains 2× (with default mult=0.5).
  5. Toggle gate mid-tick: pendingBuildJobs drops 4→2 → drain reverts to 1× next tick.
  - Type: add
  - depends_on: Step 3

- [ ] **Step 5 — CHANGELOG.md entry under unreleased v0.10.1-o (or current label).**
  *"R13 #1 Plan-R13-recruit-prob (P1): recruit cooldown drains 2× faster when foodHeadroomSec ≥ 120s AND pendingBuildJobs ≥ 3 (BALANCE.recruitFastTrackHeadroomSec / recruitFastTrackPendingJobs / recruitFastTrackCooldownMult). Closes 'colony understaffed despite food + backlog' player report."*
  - Type: edit
  - depends_on: Step 4

## 5. Risks

- **`computeForwardFoodHeadroomSec` location may differ** — if the helper is internal-only to PopulationGrowthSystem, Step 2 may need to call it directly from local file scope. Audit during Step 2.
- **Faster ramp could overshoot infraCap.** Existing `effectiveCap = Math.min(recruitTargetRaw, infraCap)` (line ~180) still gates spawn — fast-track only changes cooldown drain, not cap.
- **Possible affected tests:** `test/population-growth*.test.js`, `test/recruit-*.test.js`, `test/balance-*.test.js`, long-horizon DevIndex bench (population trajectory shifts).

## 6. Verification

- **New unit test:** `test/recruit-fast-track.test.js` (Step 4).
- **Manual:** open dev server, build 5 farms + 4 lumber camps, queue 4 blueprints, observe recruit cooldown UI label drains visibly faster than baseline 30s.
- **Bench:** `scripts/long-horizon-bench.mjs` seed=42 / temperate_plains — DevIndex must not regress more than 5%; expect slight increase from earlier population ramp.

## 7. UNREPRODUCIBLE marker

N/A — issue is design-driven from user directive, not a runtime bug.

---

## Acceptance criteria

1. Cooldown drains at 2× rate exactly when both gates fire; reverts to 1× the moment either gate fails.
2. No change to cap (`effectiveCap`), food cost, or queue limits — only drain rate.
3. New test file passes; baseline 1646 / 0 fail / 2 skip preserved (+1 new pass).
4. CHANGELOG.md updated.

## Rollback procedure

```
git checkout 527f460 -- src/config/balance.js src/simulation/population/PopulationGrowthSystem.js && rm test/recruit-fast-track.test.js
```
