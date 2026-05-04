---
reviewer_id: Plan-R12-wood-food-balance (A5-balance-critic finding 1)
feedback_source: assignments/homework7/Final-Polish-Loop/Round12/Feedbacks/A5-balance-critic.md
round: 12
date: 2026-05-01
build_commit: fa6cda1
priority: P1
track: balance (ColonyDirector zero-lumber safety net firing too aggressively)
freeze_policy: hard
rollback_anchor: fa6cda1
estimated_scope:
  files_touched: 2
  loc_delta: ~40
  new_tests: 1
  wall_clock: 30
conflicts_with: []
---

# Plan-R12-wood-food-balance — Cap zero-lumber priority and add wood/food ratio gate so wood stops snowballing while food collapses

**Plan ID:** Plan-R12-wood-food-balance
**Source feedback:** A5-balance-critic finding 1 ("Wood snowballs while food collapses on every map")
**Track:** balance
**Priority:** **P1** — A5 quote: "Run 1: Wood 34 → 291 → 444 → 685 → final 767 (+22×). Food 315 → 333 → 13 → 56 → 0 (-100%). Same shape on Run 2 and Run 3. The fallback director assigns workers to FARM/BUILDER/WOOD by role but only WOOD actually produces a deliverable to the warehouse fast enough; the lumber@95 zero-lumber safety net (R8 PS) is doing its job too well — wood has no consumption sink commensurate with its 20× ramp." This is the dominant resource-curve degeneracy of R12 and likely the root cause of A7's `farms 0/6 | warehouses 0/2` while AI fixates on lumber narrative.
**Freeze policy:** hard — no new building, no new resource, no new mechanic. Adjusts ONE numeric priority (95 → 50) AND adds ONE balance knob (`BALANCE.maxWoodPerFarmRatio`) gated by an existing-state read in the existing ZeroLumberProposer. ~40 LOC.
**Rollback anchor:** `fa6cda1`

---

## 1. Core problem (one paragraph)

`src/simulation/ai/colony/proposers/ZeroLumberProposer.js` (R5 wave-1 port from ColonyDirectorSystem) emits `priority: 95` with `reason: "bootstrap: zero-lumber safety net (analog to zero-farm @99)"` whenever `currentLumbers === 0 && timeSec < 240`. The intent (R4-A5 P0-2 audit) was to guarantee the colony lands at least one lumber camp inside the bootstrap window so wood doesn't drain to zero. But A5 R12 measures the actual impact across 3 maps × 3 seeds: wood ramps to 22× starting (685+ at peak) while food collapses to 0 in every run. Meanwhile farms either don't get built or don't deliver fast enough. Two compounding failures: (a) priority 95 is too close to the food@99/100 emergency rules, so on a map where food is already low at boot the lumber proposal beats food production setup; (b) once one lumber camp exists, the proposer goes silent (`currentLumbers === 0` only fires at zero), but the upstream lumber-pacing logic (logistics @66 / phase-3 @55) keeps adding lumbers without any wood/food balance feedback. Fix: lower the bootstrap priority from 95 to 50 (still wins against routine expansion but loses to food@99 / warehouse@82 / farm@70 emergency rules) AND add a `BALANCE.maxWoodPerFarmRatio` gate that suppresses additional lumber proposals when wood/food ratio exceeds 5 (the trigger for A5's "wood +22× / food -100%" snowball).

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — lower zero-lumber priority + add wood/food ratio cap

**Part 1: lower priority** (file `src/simulation/ai/colony/proposers/ZeroLumberProposer.js:31`):
```js
// CURRENT:
return [{
  type: "lumber",
  priority: 95,
  reason: "bootstrap: zero-lumber safety net (analog to zero-farm @99)",
}];

// AFTER:
// R12 Plan-R12-wood-food-balance (A5 #1): drop bootstrap priority from 95
// to 50 so food@99 / warehouse@82 / farm@70 emergency proposals beat the
// lumber bootstrap when food is the actual crisis. Lumber@50 still wins
// against routine expansion (logistics@66 — wait, logistics is 66 which
// IS higher than 50; actually use 75 instead so the safety net still
// fires before logistics but after food/warehouse/farm safety nets). The
// 95 priority was an over-correction in R4-A5 P0-2 that A5 R12 measured
// as a 22× wood snowball while food collapsed to 0 every run.
return [{
  type: "lumber",
  priority: 75,    // was 95 — R12 A5 #1
  reason: "bootstrap: zero-lumber safety net (analog to zero-farm @99) — R12 priority lowered so food rules preempt",
}];
```

**Part 2: wood/food ratio cap** (same file + `src/config/balance.js`). Add a new `BALANCE.maxWoodPerFarmRatio = 5` knob and gate the proposer:
```js
// src/config/balance.js — add knob in the existing balance section:
maxWoodPerFarmRatio: 5,  // R12 A5 #1: skip lumber proposals when wood/food
                         // ratio exceeds this — prevents the 22× wood snowball

// src/simulation/ai/colony/proposers/ZeroLumberProposer.js — guard the early-return:
evaluate(state, ctx) {
  const currentLumbers = ctx.buildings?.lumbers ?? 0;
  const timeSec = Number(ctx.timeSec ?? 0);
  if (currentLumbers === 0 && timeSec < 240) {
    // R12 A5 #1: defence-in-depth — even if lumbers === 0, if wood/food
    // ratio is already >5, the colony is wood-rich-food-poor and adding
    // more lumber will worsen the snowball. Skip and let food rules drive.
    const wood = Number(state.resources?.wood ?? 0);
    const food = Number(state.resources?.food ?? 0);
    const ratioCap = Number(BALANCE.maxWoodPerFarmRatio ?? 5);
    if (food > 0 && wood > food * ratioCap) {
      return [];  // wood-saturated; let food/farm rules win
    }
    return [{
      type: "lumber",
      priority: 75,
      reason: "bootstrap: zero-lumber safety net (R12 A5 #1: ratio-gated)",
    }];
  }
  return [];
},
```

- Files: `src/simulation/ai/colony/proposers/ZeroLumberProposer.js` (~15 LOC), `src/config/balance.js` (~5 LOC), 1 unit test (~25 LOC).
- Scope: ~45 LOC.
- Expected gain: closes A5 #1. Wood snowball ratio should drop from 22× to ≤5× and food production should keep pace.
- Main risk: dropping priority from 95 to 75 may cause some maps (Archipelago/Coastal where wood IS the bottleneck) to under-produce lumber. Mitigation: 75 still beats logistics@66 and phase-3@55, so the proposer still fires before routine expansion when no other emergency rule fires.

### Suggestion B (in-freeze, MINIMAL VARIANT) — only lower priority, no ratio gate

Skip the ratio knob; just change `priority: 95 → priority: 50`. Smallest change, lowest risk. May not fully close the snowball on maps where the lumber proposer fires repeatedly via the upstream phase-3 logic (which ZeroLumberProposer doesn't touch).
- Files: 1 file, 1 line + comment
- Scope: ~5 LOC
- Expected gain: ~50% of A5's request

### Suggestion C (in-freeze, COMBINED) — also nerf upstream lumber-pacing logic

A5 mentions phase-3 @55 keeps adding lumbers. Audit `src/simulation/ai/colony/proposers/PhaseProposers.js` (or wherever phase-3 lumber pacing lives) and add the same ratio gate. ~15 extra LOC. Wider blast radius — defer unless Step 5 verification shows snowball persists.
- Files: 2-3 files
- Scope: ~15 extra LOC

### Suggestion D (FREEZE-VIOLATING, do not ship) — add a wood-consumption sink (e.g., wall maintenance burns wood per second)

Adds a passive wood drain. Bigger mechanic change; defer to v0.10.2.

## 3. Selected approach

**Suggestion A** (priority drop to 75 + ratio cap). Closes A5 #1 with a small, mechanically correct change. The ratio cap is a defensive layer that catches regressions in upstream lumber-pacing logic without requiring an audit of every lumber proposer.

## 4. Plan steps

- [ ] **Step 1 — Audit existing tests for the `priority: 95` assertion.**
  ```
  Grep -n "ZeroLumber\|zero-lumber" test/ -r
  Grep -n "priority.*95" test/ -r
  Grep -n "buildings\.lumbers" test/ -r
  ```
  Document tests that pin the 95 priority. Likely 1-3 hits.
  - Type: read (no edit)

- [ ] **Step 2 — Add `BALANCE.maxWoodPerFarmRatio = 5` in `src/config/balance.js`.**
  Locate the existing `BALANCE` object and add the knob in the resource-balance section. Comment: `// R12 A5 #1: cap above which ZeroLumberProposer suppresses bootstrap proposals — prevents wood/food snowball measured at 22× by A5 R12`.
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Update `src/simulation/ai/colony/proposers/ZeroLumberProposer.js`:**
  (a) Change `priority: 95` to `priority: 75`.
  (b) Add the wood/food ratio guard (skip return when `wood > food * BALANCE.maxWoodPerFarmRatio`).
  (c) Update the existing `evaluate(_state, ctx)` signature to `evaluate(state, ctx)` (currently `_state` because the proposer didn't read state; we now do).
  (d) Add a `BALANCE` import at the top if not already present.
  (e) Update the `reason` string to cite the R12 change.
  - Type: edit
  - depends_on: Step 2

- [ ] **Step 4 — Update existing tests flagged in Step 1.**
  Update assertions from `priority === 95` to `priority === 75`. Add a comment citing R12 A5 #1.
  - Type: edit (existing tests)
  - depends_on: Step 3

- [ ] **Step 5 — Add a regression test `test/zero-lumber-ratio-gate.test.js` (~30 LOC).**
  Test cases:
  1. `lumbers === 0 && timeSec < 240 && wood < food * 5` → emits proposal at priority 75.
  2. `lumbers === 0 && timeSec < 240 && wood > food * 5` → emits empty array (ratio gate fires).
  3. `lumbers === 0 && timeSec < 240 && food === 0` → emits proposal (defensive: zero food shouldn't enable infinite lumber, but neither should it block the bootstrap; the gate condition uses `food > 0`).
  4. `lumbers === 1 && timeSec < 240` → emits empty array (existing behaviour preserved).
  5. `lumbers === 0 && timeSec === 240` → emits empty array (existing window preserved).
  6. Negative regression: NO proposal at priority 95 anymore.
  - Type: add
  - depends_on: Step 4

- [ ] **Step 6 — Run the suite + A5 repro benchmark.**
  `node --test test/*.test.js` — baseline 1646 / 0 fail / 2 skip preserved + Step 4 updates pass + Step 5 new test passes.
  Run a long-horizon bench to verify snowball is fixed: `node scripts/long-horizon-bench.mjs --seed 1638360143 --preset temperate_plains --max-days 30 --tick-rate 4` (A5 Run 1 seed). Expect: peak wood/food ratio ≤ 5 (was 22× per A5 R12 measurement); colony survives at least the same wall-clock as baseline (39:33 sim).
  - Type: verify
  - depends_on: Step 5

- [ ] **Step 7 — Manual Playwright re-verification.**
  Open the build, run a Temperate Plains autopilot session for 10 sim minutes, sample wood + food values every 60s. Confirm: wood does not exceed 5× food at any point; the colony does not run out of food while wood ramps.
  - Type: verify
  - depends_on: Step 6

- [ ] **Step 8 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  *"R12 Plan-R12-wood-food-balance (A5 P1 #1): ZeroLumberProposer bootstrap priority lowered 95→75 (food@99 / warehouse@82 / farm@70 now preempt the lumber safety net) and a `BALANCE.maxWoodPerFarmRatio = 5` gate suppresses lumber proposals when wood/food ratio exceeds the cap. Closes the 22× wood snowball / 100% food collapse A5 R12 measured across 3 maps × 3 seeds."*
  - Type: edit
  - depends_on: Step 7

## 5. Risks

- **Tests asserting priority === 95 will flip.** Step 1 audits; Step 4 updates. Likely 1-3 tests.
- **Maps where wood IS the bottleneck (Archipelago/Coastal — small starting wood floors).** Lower priority may delay the first lumber camp by 1-2 ticks. Mitigation: priority 75 still beats logistics@66 and phase-3@55; A5 specifically reports Run 3 (Riverlands) ran out of wood faster than Temperate, so the bottleneck-vs-snowball trade-off is map-specific. Step 6's bench should confirm Temperate doesn't regress and Step 7's manual session should sanity-check.
- **`BALANCE.maxWoodPerFarmRatio = 5` might be too tight.** A5 measured 22× as the snowball peak; cap at 5 is aggressive. If post-fix benches show too-frequent gate-firing, adjust to 7 or 10 in a follow-up.
- **Sibling Plan-R12-non-temperate-fallback also touches starting wood / map balance.** This plan and that plan are independent (different files, different mechanisms) but share the "wood economy" surface. Implementer can ship both in one PR or sequence them; no merge conflict.
- **Possible affected tests:** `test/zero-lumber-proposer*.test.js`, `test/colony-director*.test.js`, `test/build-proposer*.test.js`. Audit in Step 1.

## 6. Verification

- **New unit test:** `test/zero-lumber-ratio-gate.test.js` (Step 5).
- **Bench regression:** `scripts/long-horizon-bench.mjs --seed 1638360143 --preset temperate_plains --max-days 30 --tick-rate 4` — DevIndex must not drop more than 5%; peak wood/food ratio must be ≤ 5.
- **Manual Playwright:** Step 7's 10-sim-min session with periodic resource sampling.

## 7. UNREPRODUCIBLE marker

N/A — A5 captured the 22× snowball / 100% food collapse across 3 distinct maps × 3 distinct seeds × 3 distinct strategies, with screenshot timestamps and exact resource counts. Reliable repro on default boot in autopilot mode.

---

## Acceptance criteria

1. Long-horizon bench (seed 1638360143, Temperate Plains, 30 days, tick-rate 4): peak `wood/food` ratio ≤ 5 (was 22× per A5 R12 measurement).
2. Same bench: colony survives at least 30 sim minutes (was 39:33 in A5 Run 1; should not regress more than 10%).
3. ZeroLumberProposer emits proposals at priority 75, not 95.
4. ZeroLumberProposer suppresses proposals when `wood > food * BALANCE.maxWoodPerFarmRatio`.
5. New unit test `test/zero-lumber-ratio-gate.test.js` passes.
6. Test baseline 1646 / 0 fail / 2 skip preserved (+1 new pass; pre-existing tests updated for priority 95 → 75).

## Rollback procedure

```
git checkout fa6cda1 -- src/simulation/ai/colony/proposers/ZeroLumberProposer.js src/config/balance.js && rm test/zero-lumber-ratio-gate.test.js
```
