// v0.10.2 PJ-pacing P0 (Round-6 Final-Polish-Loop pacing implementer).
//
// Invariant lock for the EventDirector pacing knobs. The reviewer's R6
// PJ-pacing audit cut eventDirectorBaseIntervalSec 360→90 (4× faster proactive
// pressure) + raidFallbackGraceSec 180→90 (first-raid window opens earlier) +
// rebalanced eventDirectorWeights to keep raid frequency near the prior
// baseline (banditRaid 0.30→0.18, animalMigration 0.25→0.40). This test
// fences those values so a future drift-back trips a red flag before bench
// regressions appear.
//
// PT-invasion-pressure (R8): the two weight fences below were intentionally
// flipped — PT god-mode harness measured 5 raids in 30 sim-min vs target ~9,
// so banditRaid was restored 0.18 → 0.30 (revert R6's over-correction) and
// animalMigration partially offset 0.40 → 0.34. The cadence + grace knobs
// stay locked to PJ-pacing values; the weight fences now lock the R8 values.

import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";

test("PJ-pacing: eventDirectorBaseIntervalSec is 90 (4× acceleration from prior 360)", () => {
  assert.equal(
    BALANCE.eventDirectorBaseIntervalSec,
    90,
    `PJ-pacing P0: eventDirectorBaseIntervalSec must be 90, got ${BALANCE.eventDirectorBaseIntervalSec}`,
  );
});

test("PJ-pacing: raidFallbackGraceSec is 90 (halved from prior 180)", () => {
  assert.equal(
    BALANCE.raidFallbackGraceSec,
    90,
    `PJ-pacing P0: raidFallbackGraceSec must be 90, got ${BALANCE.raidFallbackGraceSec}`,
  );
  assert.equal(
    BALANCE.raidFallbackScheduler.graceSec,
    90,
    `PJ-pacing P0: raidFallbackScheduler.graceSec must be 90, got ${BALANCE.raidFallbackScheduler.graceSec}`,
  );
});

// PT-invasion-pressure (R8): R6 fence was banditRaid <= 0.18; PT harness
// proved that floor was too low for the 4× cadence (5 raids in 30 sim-min
// vs target ~9). Restored to 0.30 — the test now locks the R8 floor.
test("PT-R8: eventDirectorWeights.banditRaid >= 0.30 (R8 raid-frequency restore)", () => {
  const w = BALANCE.eventDirectorWeights ?? {};
  assert.ok(
    Number(w.banditRaid) >= 0.30 - 1e-9,
    `PT-R8: banditRaid weight must be ≥ 0.30 to deliver target raid frequency, got ${w.banditRaid}`,
  );
});

// PT-invasion-pressure (R8): R6 fence was animalMigration >= 0.40; partial
// offset for the +0.12 raid bump cut it to 0.34. Lock the R8 ceiling.
test("PT-R8: eventDirectorWeights.animalMigration <= 0.34 (R8 partial offset)", () => {
  const w = BALANCE.eventDirectorWeights ?? {};
  assert.ok(
    Number(w.animalMigration) <= 0.34 + 1e-9,
    `PT-R8: animalMigration weight must be ≤ 0.34 (R8 partial offset), got ${w.animalMigration}`,
  );
});
