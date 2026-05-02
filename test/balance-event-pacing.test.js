// v0.10.2 PJ-pacing P0 (Round-6 Final-Polish-Loop pacing implementer).
//
// Invariant lock for the EventDirector pacing knobs. The reviewer's R6
// PJ-pacing audit cut eventDirectorBaseIntervalSec 360→90 (4× faster proactive
// pressure) + raidFallbackGraceSec 180→90 (first-raid window opens earlier) +
// rebalanced eventDirectorWeights to keep raid frequency near the prior
// baseline (banditRaid 0.30→0.18, animalMigration 0.25→0.40). This test
// fences those values so a future drift-back trips a red flag before bench
// regressions appear.

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

test("PJ-pacing: eventDirectorWeights.banditRaid <= 0.18 (offsets 4× cadence)", () => {
  const w = BALANCE.eventDirectorWeights ?? {};
  assert.ok(
    Number(w.banditRaid) <= 0.18 + 1e-9,
    `PJ-pacing P0: banditRaid weight must be ≤ 0.18 to offset cadence acceleration, got ${w.banditRaid}`,
  );
});

test("PJ-pacing: eventDirectorWeights.animalMigration >= 0.40 (filler protects death budget)", () => {
  const w = BALANCE.eventDirectorWeights ?? {};
  assert.ok(
    Number(w.animalMigration) >= 0.40 - 1e-9,
    `PJ-pacing P0: animalMigration weight must be ≥ 0.40 to absorb cadence acceleration, got ${w.animalMigration}`,
  );
});
