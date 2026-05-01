import test from "node:test";
import assert from "node:assert/strict";

import {
  BALANCE,
  INITIAL_POPULATION,
  INITIAL_RESOURCES,
} from "../src/config/balance.js";

// v0.10.1-r0-A5: Lock the opening-runway invariants put in place to fix the
// hard-coded ~3:11 starvation crash. These tests assert the *invariant*
// (runway seconds), not the literal numbers, so future tuners can move the
// dials without breaking the suite — as long as the floor holds.

test("opening pure-burn runway is >= 600 seconds (10-minute floor)", () => {
  const drainPerSec =
    INITIAL_POPULATION.workers * BALANCE.workerFoodConsumptionPerSecond;
  assert.ok(
    drainPerSec > 0,
    `colony drain must be > 0 (got ${drainPerSec})`,
  );
  const runwaySeconds = INITIAL_RESOURCES.food / drainPerSec;
  assert.ok(
    runwaySeconds >= 600,
    `Opening pure-burn runway is ${runwaySeconds.toFixed(1)}s ` +
      `(food=${INITIAL_RESOURCES.food}, workers=${INITIAL_POPULATION.workers}, ` +
      `drain=${BALANCE.workerFoodConsumptionPerSecond}/s), expected >= 600s`,
  );
});

test("resourceCollapseCarryGrace is >= 1.0 (carry-in-transit window)", () => {
  assert.ok(
    BALANCE.resourceCollapseCarryGrace >= 1.0,
    `BALANCE.resourceCollapseCarryGrace is ${BALANCE.resourceCollapseCarryGrace}, expected >= 1.0`,
  );
});
