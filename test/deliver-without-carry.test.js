// v0.8.0 Phase 7.B — deliverWithoutCarry regression test.
//
// Context: before Phase 7.B the plan-cooldown + FSM hold window + commitment-
// cycle latch could pin a worker in `deliver` state with empty carry, causing
// `handleDeliver` to repeatedly short-circuit and increment
// `metrics.deliverWithoutCarryCount`. A 60-second soak would accumulate
// 19 counts on the broken code path.
//
// The fix lives in src/simulation/npc/WorkerAISystem.js (two-layer guard:
// plan-time `deliverStuckReplan` + post-transition defensive rewrite).
// This test locks in the invariant: counter must stay at 0 across a
// deterministic 60-second soak.

import test from "node:test";
import assert from "node:assert/strict";

import { bootHeadlessSim } from "../scripts/long-horizon-helpers.mjs";

test("deliver-without-carry: counter stays at 0 across 60s soak", () => {
  const sim = bootHeadlessSim({ seed: 42, preset: "temperate_plains", tickRate: 4 });
  const targetSec = 60;
  const ticks = Math.ceil(targetSec / sim.dt);

  for (let i = 0; i < ticks; i += 1) {
    sim.tickFn();
    if (sim.state.session?.phase === "end") break;
  }

  const counter = Number(sim.state.metrics?.deliverWithoutCarryCount ?? 0);
  assert.equal(
    counter,
    0,
    `deliverWithoutCarryCount should be 0 after 60s soak, got ${counter}. `
    + `Either the plan-time guard or post-transition rewrite in WorkerAISystem `
    + `regressed — see src/simulation/npc/WorkerAISystem.js:1022-1101.`,
  );
});
