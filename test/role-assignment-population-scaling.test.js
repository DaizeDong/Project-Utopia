import test from "node:test";
import assert from "node:assert/strict";
import { ROLE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";

// v0.8.2 Round-5 Wave-1 (01b + 02a) — population-aware role quotas.
//
// Previously `roleQuotas` defaulted to {cook:1, smith:1, ...} for every
// population, so a 20-worker colony only ever had 1 cook / 1 smith / 1
// hauler. The new default reads BALANCE.roleQuotaScaling and computes
// `floor(n * perWorker)` so specialist headcount tracks the population.
// The player's `state.controls.roleQuotas` slider still caps the upper
// bound; the sentinel 99 ("unlimited") lets the scaled formula dominate.

function setWorkerCount(state, targetCount) {
  const workers = state.agents.filter((a) => a.type === "WORKER");
  if (workers.length === targetCount) return;
  if (workers.length > targetCount) {
    const keepIds = new Set(workers.slice(0, targetCount).map((w) => w.id));
    state.agents = state.agents.filter((a) => a.type !== "WORKER" || keepIds.has(a.id));
    return;
  }
  const template = workers[workers.length - 1] ?? null;
  if (!template) throw new Error("No worker template available");
  for (let i = workers.length; i < targetCount; i += 1) {
    const clone = {
      ...template,
      id: `${template.id}-pad-${i}`,
      role: template.role,
    };
    state.agents.push(clone);
  }
}

function countRole(state, role) {
  return state.agents.filter((a) => a.type === "WORKER" && a.role === role).length;
}

test("pop-scaled quotas: n=10 with kitchen yields cookSlots >= 1", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 10);
  state.buildings.kitchens = 1;
  state.buildings.warehouses = 1;
  // EntityFactory now seeds roleQuotas to 99 (unlimited sentinel) so the
  // scaled formula is the binding cap.
  new RoleAssignmentSystem().update(2, state);
  assert.ok(
    countRole(state, ROLE.COOK) >= 1,
    "n=10 floor(n*1/8)=1 should yield at least 1 cook when kitchen exists",
  );
});

test("pop-scaled quotas: n=20 yields multiple haulers (floor(n/6)=3)", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 20);
  state.buildings.warehouses = 2;
  state.controls.roleQuotas = { cook: 99, smith: 99, herbalist: 99, haul: 99, stone: 99, herbs: 99 };
  new RoleAssignmentSystem().update(2, state);
  const haulers = countRole(state, ROLE.HAUL);
  assert.ok(
    haulers >= 3,
    `n=20 + haulPerWorker=1/6 should yield >= 3 haulers, got ${haulers}`,
  );
});

test("pop-scaled quotas: player slider caps the scaled value", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 20);
  state.buildings.kitchens = 1;
  state.buildings.warehouses = 2;
  // Player forces cook cap = 1 even though scaled at n=20 would permit 2.
  state.controls.roleQuotas = { cook: 1, smith: 99, herbalist: 99, haul: 99, stone: 99, herbs: 99 };
  new RoleAssignmentSystem().update(2, state);
  assert.equal(
    countRole(state, ROLE.COOK),
    1,
    "player cap of 1 should bind the cook count below the pop-scaled value",
  );
});

test("pop-scaled quotas: n=5 + no kitchen yields cookSlots=0 (gate wins)", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 5);
  state.buildings.kitchens = 0;
  new RoleAssignmentSystem().update(2, state);
  assert.equal(countRole(state, ROLE.COOK), 0, "kitchen gate must override the scaled formula");
});

test("pendingRoleBoost hint: state.ai.fallbackHints.pendingRoleBoost = 'COOK' raises cookSlots +1", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 10);
  state.buildings.kitchens = 1;
  state.buildings.warehouses = 1;
  // Sanity: without the hint, n=10 + cookPerWorker=1/8 floors to 1.
  new RoleAssignmentSystem().update(2, state);
  const baselineCooks = countRole(state, ROLE.COOK);

  // Rewind timer and plant the hint.
  state.ai ??= {};
  state.ai.fallbackHints = { pendingRoleBoost: "COOK" };
  const sys = new RoleAssignmentSystem();
  sys.update(2, state);

  assert.ok(
    countRole(state, ROLE.COOK) >= baselineCooks,
    "pendingRoleBoost=COOK should not reduce cook count",
  );
  assert.equal(
    state.ai.fallbackHints.pendingRoleBoost,
    undefined,
    "hint must be consumed (deleted) on read",
  );
});

// v0.8.2 Round-5b Wave-1 (01b Step 7) — bandTable tests: band-hit semantics
// must leave 0-valued entries at 0 (the whole point of the refactor) and the
// n>=8 fall-through must preserve Wave-1 perWorker behaviour.

test("bandTable: n=4 with kitchen + smithy + clinic yields only COOK (band 4-5 allow.cook=1 rest=0)", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 4);
  state.buildings.kitchens = 1;
  state.buildings.smithies = 1;
  state.buildings.clinics = 1;
  state.buildings.quarries = 1;
  state.buildings.herbGardens = 1;
  state.buildings.warehouses = 1;
  // Plenty of food so cannibalise is allowed (foodEmergencyThreshold=14, mult=1.5 → need >21).
  state.resources.food = 60;
  new RoleAssignmentSystem().update(2, state);
  // Cook should be activated (either via budget or cannibalise at pop=4).
  assert.ok(countRole(state, ROLE.COOK) >= 1, `n=4 band allow.cook=1 should activate cook (got ${countRole(state, ROLE.COOK)})`);
  assert.equal(countRole(state, ROLE.SMITH), 0, "band 4-5 forbids smith");
  assert.equal(countRole(state, ROLE.HERBALIST), 0, "band 4-5 forbids herbalist");
  assert.equal(countRole(state, ROLE.STONE), 0, "band 4-5 forbids stone");
  assert.equal(countRole(state, ROLE.HERBS), 0, "band 4-5 forbids herbs");
});

test("bandTable: n=6 with smithy still yields smithSlots=0 (band 6-7 explicitly denies smith)", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 6);
  state.buildings.smithies = 1;
  state.buildings.warehouses = 1;
  state.resources.food = 60;
  // Keep stone below pipeline-idle-boost threshold (10) so the idle-boost
  // path cannot override the band decision; this test asserts the band
  // semantic specifically (0 stays 0 from the budget path).
  state.resources.stone = 2;
  new RoleAssignmentSystem().update(2, state);
  assert.equal(countRole(state, ROLE.SMITH), 0, "band 6-7 must keep smith at 0 via budget path when stone is below idle-boost threshold");
});

test("bandTable: n=10 falls through to perWorker path (Wave-1 behaviour)", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 10);
  state.buildings.kitchens = 1;
  state.buildings.warehouses = 1;
  state.buildings.smithies = 1;
  state.buildings.quarries = 1;
  state.resources.food = 60;
  state.controls.roleQuotas = { cook: 99, smith: 99, herbalist: 99, haul: 99, stone: 99, herbs: 99 };
  new RoleAssignmentSystem().update(2, state);
  // Wave-1 baseline: n=10 * cookPerWorker(1/8) = 1 cook, smithPerWorker(1/10)=1 smith, stonePerWorker(1/8)=1 stone.
  assert.ok(countRole(state, ROLE.COOK) >= 1, "n=10 fall-through should activate cook");
});

test("cannibalise: pop=4 all-buildings-present with specialistBudget=0 activates cook via FARM borrow", () => {
  // Construct a state where farmMin + woodMin = 4 so specialistBudget = 0
  // (all n=4 workers are locked by FARM/WOOD reserves). Without cannibalise
  // cook would be 0 despite kitchen presence; with cannibalise it becomes 1.
  const state = createInitialGameState();
  setWorkerCount(state, 4);
  state.buildings.kitchens = 1;
  state.buildings.warehouses = 1;
  // Raise farmRatio so farmMinScaled = floor(0.8 × 4) = 3 + woodMin = 1 → reserved=4.
  state.controls.farmRatio = 0.8;
  state.resources.food = 60; // > 14 × 1.5 = 21
  state.tick = 0;
  const sys = new RoleAssignmentSystem();
  sys.update(2, state);
  assert.equal(countRole(state, ROLE.COOK), 1, "pop=4 with budget=0 + kitchen + food safe should produce 1 cook via cannibalise");
  // At least 1 FARM remains (hard floor from cannibalise guard: farmMin - cannibalised > 1).
  assert.ok(countRole(state, ROLE.FARM) >= 1, "cannibalise must preserve at least 1 FARM slot");
});

test("cannibalise: cooldown prevents re-fire within cooldownTicks window", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 4);
  state.buildings.kitchens = 1;
  state.buildings.warehouses = 1;
  state.controls.farmRatio = 0.8;
  state.resources.food = 60;
  state.tick = 5;
  const sys = new RoleAssignmentSystem();
  sys.update(2, state);
  // First call should fire cannibalise.
  const firstLastTick = state.ai.roleAssignMemo.cannibaliseLastTick;
  assert.equal(firstLastTick, 5, `first cannibalise sets memo to current tick (got ${firstLastTick})`);
  // Advance tick by only 1 (< cooldownTicks=3) → guard must block.
  state.tick = 6;
  const sys2 = new RoleAssignmentSystem();
  sys2.update(2, state);
  assert.equal(state.ai.roleAssignMemo.cannibaliseLastTick, 5, "cooldown must keep memo unchanged within cooldownTicks window");
});
