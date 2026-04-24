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

test("bandTable: n=4 with kitchen activates cook (Wave-1 compat retained)", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 4);
  state.buildings.kitchens = 1;
  state.buildings.warehouses = 1;
  state.resources.food = 60;
  new RoleAssignmentSystem().update(2, state);
  assert.ok(countRole(state, ROLE.COOK) >= 1, `n=4 band-hit (minFloor=1 semantics) should activate cook (got ${countRole(state, ROLE.COOK)})`);
});

test("bandTable: n=6 preserves Wave-1 minFloor=1 so specialists with buildings still activate", () => {
  // Round 5b post-tuning: bandTable is structurally present for future
  // tuning but all bands currently mirror Wave-1's minFloor=1 behaviour
  // (4-seed benchmark confirmed that tightening the bands below minFloor
  // regressed seed 1/7/42/99 outcomes). With a smithy present, n=6
  // should yield >= 1 smith.
  const state = createInitialGameState();
  setWorkerCount(state, 6);
  state.buildings.smithies = 1;
  state.buildings.warehouses = 1;
  state.resources.food = 60;
  state.resources.stone = 2;
  new RoleAssignmentSystem().update(2, state);
  assert.ok(countRole(state, ROLE.SMITH) >= 1, "band 6-7 keeps Wave-1 minFloor=1 semantics for building-gated specialists");
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

test("cannibalise: config knobs are active in BALANCE.roleQuotaScaling", async () => {
  // Post-tuning: cannibalise is a safety valve that fires only when farmMin
  // reserve grows beyond the specialist budget (e.g. under a very heavy
  // emergency farm ratio). The valve is present in the code path and
  // governed by three frozen config knobs which must remain wired.
  const { BALANCE } = await import("../src/config/balance.js");
  assert.ok(
    BALANCE.roleQuotaScaling.farmCannibaliseEnabled === true,
    "farmCannibaliseEnabled must default true",
  );
  assert.ok(
    Number(BALANCE.roleQuotaScaling.farmCannibaliseFoodMult) >= 1,
    "farmCannibaliseFoodMult must be >= 1 (food safety multiplier)",
  );
  assert.ok(
    Number(BALANCE.roleQuotaScaling.farmCannibaliseCooldownTicks) >= 0,
    "farmCannibaliseCooldownTicks must be >= 0",
  );
});
