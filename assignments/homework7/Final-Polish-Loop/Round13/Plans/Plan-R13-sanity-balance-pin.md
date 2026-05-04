---
reviewer_id: Plan-R13-sanity-balance-pin (R13 sanity follow-up #2)
feedback_source: assignments/homework7/Final-Polish-Loop/Round13/Feedbacks/summary.md
round: 13
date: 2026-05-01
build_commit: 527f460
priority: P2
track: code (sanity — pin all 12 new R13 BALANCE constants in a single contract test)
freeze_policy: hard
rollback_anchor: 527f460
estimated_scope:
  files_touched: 1
  loc_delta: ~30
  new_tests: 1
  wall_clock: 20
conflicts_with: []
---

# Plan-R13-sanity-balance-pin — Single contract test pins all 12 new R13 BALANCE constants

**Plan ID:** Plan-R13-sanity-balance-pin
**Source feedback:** R13 sanity follow-up — the seven R13 code plans collectively introduce 12 new `BALANCE.*` constants:
1. `recruitFastTrackHeadroomSec`
2. `recruitFastTrackPendingJobs`
3. `recruitFastTrackCooldownMult`
4. `eventPreWarningLeadSec`
5. `eventPreparednessFullCapAtWalls`
6. `eventPreparednessGuardWeight`
7. `eventPreparednessMaxMitigation`
8. `workerExploreFogEdgeBiasWeight`
9. `autopilotReadyTimeoutSec`
10. `wildlifeSpawnIntervalMult`
11. `wildlifeSpeciesRoundRobin`
12. `wildlifeHuntFoodReward`

To prevent silent regression (typo, value drift, accidental delete), add a single contract test that asserts each is present with its R13 default. Mirrors the v0.8.5 balance-pin pattern.
**Track:** code
**Priority:** **P2** — sanity guard; closes a class of latent regressions before they ship.
**Freeze policy:** hard — pure test addition, no source changes.
**Rollback anchor:** `527f460`

---

## 1. Core problem (one paragraph)

The seven R13 code plans add 12 BALANCE constants. Without a contract test, a future plan that re-balances any of them silently could drop a typo or an off-by-10 default and only get caught in long-horizon bench regression. A single 30-LOC test that asserts each constant's name + default value protects all 12 in O(1) plan effort.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — single contract test

`test/r13-balance-pin.test.js` imports `BALANCE` and asserts each of the 12 fields' value matches its R13 default. If a future plan changes a value intentionally, that plan updates this test in the same commit (visible in code review).

- Files: 0 source files; 1 new test.
- Scope: ~30 LOC test.
- Expected gain: regression guard for all 12 constants in one place.
- Main risk: false-positive when a plan intentionally tunes — mitigated by requiring co-update in same commit (standard contract-test pattern).

### Suggestion B (in-freeze) — let each R13 plan add its own pin in its own test

Status quo. 7 separate places to maintain. Skip.

### Suggestion C (FREEZE-VIOLATING) — schema-validate `BALANCE` against a JSDoc type

Heavier; out of scope.

## 3. Selected approach

**Suggestion A** — single 30-LOC test pins all 12 in one place.

## 4. Plan steps

- [ ] **Step 1 — Audit the seven R13 plans' BALANCE additions.**
  Read each of the seven Plan-R13-*.md files in `assignments/homework7/Final-Polish-Loop/Round13/Plans/` and extract the exact constant name + default value from each plan's BALANCE-add step. Cross-check against the table above.
  - Type: read

- [ ] **Step 2 — Add `test/r13-balance-pin.test.js` (~40 LOC).**
  ```js
  import { test } from "node:test";
  import assert from "node:assert";
  import { BALANCE } from "../src/config/balance.js";

  const R13_DEFAULTS = {
    recruitFastTrackHeadroomSec: 120,
    recruitFastTrackPendingJobs: 3,
    recruitFastTrackCooldownMult: 0.5,
    eventPreWarningLeadSec: 30,
    eventPreparednessFullCapAtWalls: 12,
    eventPreparednessGuardWeight: 1.5,
    eventPreparednessMaxMitigation: 0.7,
    workerExploreFogEdgeBiasWeight: 0.6,
    autopilotReadyTimeoutSec: 10,
    wildlifeSpawnIntervalMult: 0.5,
    wildlifeSpeciesRoundRobin: true,
    wildlifeHuntFoodReward: 4,
  };

  for (const [key, expected] of Object.entries(R13_DEFAULTS)) {
    test(`R13 BALANCE pin: ${key} = ${JSON.stringify(expected)}`, () => {
      assert.strictEqual(BALANCE[key], expected, `BALANCE.${key} drifted from R13 default ${JSON.stringify(expected)} (got ${JSON.stringify(BALANCE[key])})`);
    });
  }
  ```
  - Type: add
  - depends_on: Step 1

- [ ] **Step 3 — CHANGELOG.md entry.**
  *"R13 sanity Plan-R13-sanity-balance-pin (P2): single contract test pins all 12 new R13 BALANCE constants. Future tuning plans must update this pin in the same commit."*
  - Type: edit
  - depends_on: Step 2

## 5. Risks

- **Test fails until all 7 R13 code plans land** — by design; this plan should be applied AFTER all 7 to ensure the constants exist.
- **False-positive on intentional tuning** — standard contract-test pattern; tuning plans co-update the pin.
- **Possible affected tests:** none (this only adds tests).

## 6. Verification

- **New unit test:** `test/r13-balance-pin.test.js`.
- Run `node --test test/r13-balance-pin.test.js` after all 7 R13 code plans land — all 12 assertions pass.

## 7. UNREPRODUCIBLE marker

N/A — preventive contract test.

---

## Acceptance criteria

1. Test file exists and asserts all 12 R13 BALANCE constants at their R13 defaults.
2. Test passes once the seven R13 code plans land.
3. Test baseline 1646 / 0 fail / 2 skip preserved + 12 new test cases pass.
4. CHANGELOG.md updated.

## Rollback procedure

```
rm test/r13-balance-pin.test.js
```
