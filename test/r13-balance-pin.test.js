// R13 sanity Plan-R13-sanity-balance-pin — single contract test pinning the
// 12 BALANCE constants introduced by the seven R13 code plans.
//
// Mirrors the v0.8.5 balance-pin pattern. Future tuning plans that change
// any of these values MUST update this pin in the same commit so the diff
// is visible in code review.
//
// Key sources:
//   - recruitFastTrack* (3) — Plan-R13-recruit-prob (P1)
//   - eventPreWarningLeadSec + eventPreparedness* (4) — Plan-R13-event-mitigation (P0)
//   - workerExploreFogEdgeBiasWeight (1) — Plan-R13-fog-aware-build (#5+#7)
//   - autopilotReadyTimeoutSec (1) — Plan-R13-autopilot-wait-llm (#6 P1)
//   - wildlife* (3) — Plan-R13-wildlife-hunt (P1)

import { test } from "node:test";
import assert from "node:assert";
import { BALANCE } from "../src/config/balance.js";

const R13_DEFAULTS = Object.freeze({
  // Plan-R13-recruit-prob
  recruitFastTrackHeadroomSec: 120,
  recruitFastTrackPendingJobs: 3,
  recruitFastTrackCooldownMult: 0.5,
  // Plan-R13-event-mitigation
  eventPreWarningLeadSec: 30,
  eventPreparednessFullCapAtWalls: 12,
  eventPreparednessGuardWeight: 1.5,
  eventPreparednessMaxMitigation: 0.7,
  // Plan-R13-fog-aware-build
  workerExploreFogEdgeBiasWeight: 0.6,
  // Plan-R13-autopilot-wait-llm
  autopilotReadyTimeoutSec: 10,
  // Plan-R13-wildlife-hunt
  wildlifeSpawnIntervalMult: 0.5,
  wildlifeSpeciesRoundRobin: true,
  wildlifeHuntFoodReward: 4,
});

for (const [key, expected] of Object.entries(R13_DEFAULTS)) {
  test(`R13 BALANCE pin: ${key} = ${JSON.stringify(expected)}`, () => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(BALANCE, key),
      `BALANCE.${key} is missing — was it removed without updating the R13 pin?`,
    );
    assert.strictEqual(
      BALANCE[key],
      expected,
      `BALANCE.${key} drifted from R13 default ${JSON.stringify(expected)} (got ${JSON.stringify(BALANCE[key])}). ` +
        `If this change is intentional, update R13_DEFAULTS in this file in the same commit.`,
    );
  });
}

test("R13 BALANCE pin: total of 12 constants pinned", () => {
  assert.equal(Object.keys(R13_DEFAULTS).length, 12);
});
