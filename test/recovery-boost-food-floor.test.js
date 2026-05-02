// v0.10.1-r4-A5 P0-3: recovery-boost food-floor gating regression test.
// Spec: maybeTriggerRecovery must NOT consume a charge when food >= 200
// AND >= 1 farm exists (no real food crisis). Reason: A5 R3 trace showed
// boost firing at sim 0:18 (food=332, wood=8) — the unique relief charge
// burned during the easy phase before any genuine emergency at ~5 min.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { maybeTriggerRecovery } from "../src/simulation/meta/ProgressionSystem.js";
import { BALANCE } from "../src/config/balance.js";

function makeState({ food = 50, wood = 8, farms = 1, deathsTotal = 1 } = {}) {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.resources.food = food;
  state.resources.wood = wood;
  // gameplay setup that guarantees `severePressure === true` (low prosperity
  // + high threat) so the only remaining gate is the food-floor check.
  state.gameplay.prosperity = 5;
  state.gameplay.threat = 95;
  // Make sure the farm count gate is exercised independently of safety net.
  state.buildings.farms = farms;
  // recovery state defaults: charges=2 (cap), no prior trigger.
  state.gameplay.recovery = {
    charges: 2,
    activeBoostSec: 0,
    lastTriggerSec: -Infinity,
    collapseRisk: 0,
    lastReason: "",
    essentialOnly: false,
  };
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = 60;
  state.metrics.deathsTotal = deathsTotal;
  return state;
}

// Minimal runtime + coverage shapes consumed by maybeTriggerRecovery.
const RUNTIME = Object.freeze({ routes: [], connectedRoutes: 1, readyDepots: 1 });
const COVERAGE = Object.freeze({ progress: 1 });

test("recovery boost is GATED when food>=200 AND farms>=1 (no real crisis)", () => {
  const state = makeState({ food: 250, wood: 5, farms: 2 });
  const before = state.gameplay.recovery.charges;

  const recovery = maybeTriggerRecovery(state, RUNTIME, COVERAGE, 1);

  assert.equal(
    recovery.charges,
    before,
    `expected no charge consumed when food>=200 + farms>=1; charges before=${before} after=${recovery.charges}`,
  );
  assert.equal(state.resources.food, 250, "food should not be boosted");
});

test("recovery boost FIRES when food is critically low (genuine emergency)", () => {
  const state = makeState({ food: 5, wood: 3, farms: 1 });
  // food=5 ≤ recoveryCriticalResourceThreshold so criticalResources=true,
  // and severePressure=true via the high-threat/low-prosperity setup.
  const before = state.gameplay.recovery.charges;

  const recovery = maybeTriggerRecovery(state, RUNTIME, COVERAGE, 1);

  assert.equal(
    recovery.charges,
    before - 1,
    "charge should be consumed in a genuine food crisis",
  );
  assert.ok(state.resources.food > 5, "food should be boosted by recovery");
});

test("recovery boost FIRES when food>=200 but farms===0 (no producer)", () => {
  // Edge case: high food carry but zero farms means the runway is one
  // ration cycle from collapse — gate should NOT block.
  const state = makeState({ food: 250, wood: 3, farms: 0 });
  // Force criticalResources via wood (≤ threshold) so the upstream filter
  // doesn't short-circuit before our gate is reached.
  state.resources.wood = Number(BALANCE.recoveryCriticalResourceThreshold ?? 5);
  const before = state.gameplay.recovery.charges;

  const recovery = maybeTriggerRecovery(state, RUNTIME, COVERAGE, 1);

  assert.equal(
    recovery.charges,
    before - 1,
    "gate must not block when farms===0 — no producer means food=250 is one drain cycle from zero",
  );
});
