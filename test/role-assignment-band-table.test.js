import test from "node:test";
import assert from "node:assert/strict";
import { ROLE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";

// v0.8.2 Round-6 Wave-1 (01b-structural Step 6) — BAND TABLE tests.
//
// Root cause: at pop=4, the old bandTable had all allow=1, so 6 specialists
// contended for 1 slot (specialistBudget = n - reserved = 4-3 = 1). The
// structural fix: bandTable now has explicit 0s so blocked specialists
// do NOT enter the specialistBudget contention.
//
// Band layout (balance.js):
//   pop 0-3: all zero (farm-only phase)
//   pop 4-5: cook=1, all others=0
//   pop 6-7: cook=1, haul=1, stone=1, all others=0
//   pop 8+:  fall-through to perWorker formula (Wave-1 behaviour)

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
    const clone = { ...template, id: `${template.id}-pad-${i}`, role: template.role };
    state.agents.push(clone);
  }
}

function countRole(state, role) {
  return state.agents.filter((a) => a.type === "WORKER" && a.role === role).length;
}

// ── Band pop=4 ──────────────────────────────────────────────────────────────

test("bandTable n=4: cook gets 1 slot when kitchen present", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 4);
  // Force only kitchen; remove other specialist buildings from buildings object.
  state.buildings.kitchens = 1;
  state.buildings.smithies = 0;
  state.buildings.clinics = 0;
  // Keep quarries/herbGardens but band=4 must zero out stone/herbs.
  state.buildings.warehouses = 1;
  state.resources.food = 60;
  new RoleAssignmentSystem().update(2, state);
  assert.ok(countRole(state, ROLE.COOK) >= 1, "n=4 band: cook=1 must activate when kitchen exists");
});

test("bandTable n=4: smith=0 even with smithy present (band explicit zero)", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 4);
  state.buildings.smithies = 1;
  state.buildings.kitchens = 0;
  state.buildings.clinics = 0;
  state.resources.food = 60;
  new RoleAssignmentSystem().update(2, state);
  assert.equal(countRole(state, ROLE.SMITH), 0,
    "n=4 band: smith=0 — smithy exists but band blocks smith at pop=4");
});

test("bandTable n=4: herbalist=0 even with clinic present (band explicit zero)", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 4);
  state.buildings.clinics = 1;
  state.buildings.kitchens = 0;
  state.buildings.smithies = 0;
  state.resources.food = 60;
  state.resources.herbs = 10;
  new RoleAssignmentSystem().update(2, state);
  assert.equal(countRole(state, ROLE.HERBALIST), 0,
    "n=4 band: herbalist=0 — clinic exists but band blocks herbalist at pop=4");
});

test("bandTable n=4: haul=0 even with warehouse (band explicit zero)", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 4);
  state.buildings.warehouses = 1;
  state.buildings.kitchens = 0;
  // Force n>=haulMinPopulation check: set haulMinPop to something lower won't
  // help here because the bandTable itself has haul=0 for band 4-5. But the
  // haulMinPop=8 gate already blocks haul at n=4 too — both checks confirm 0.
  state.resources.food = 60;
  new RoleAssignmentSystem().update(2, state);
  assert.equal(countRole(state, ROLE.HAUL), 0,
    "n=4 band: haul=0 — band explicitly blocks haul at pop=4");
});

// ── Band pop=6 ──────────────────────────────────────────────────────────────

test("bandTable n=6: cook activates (band 6-7 cook=1)", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 6);
  state.buildings.kitchens = 1;
  state.buildings.warehouses = 1;
  state.buildings.smithies = 0;
  state.resources.food = 60;
  new RoleAssignmentSystem().update(2, state);
  assert.ok(countRole(state, ROLE.COOK) >= 1, "n=6 band: cook=1 must activate when kitchen exists");
});

test("bandTable n=6: smith=0 (band 6-7 smith explicit zero despite smithy)", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 6);
  state.buildings.smithies = 1;
  state.buildings.kitchens = 0;
  state.buildings.warehouses = 1;
  state.resources.food = 60;
  state.resources.stone = 10;
  new RoleAssignmentSystem().update(2, state);
  assert.equal(countRole(state, ROLE.SMITH), 0,
    "n=6 band: smith=0 — band 6-7 does not allow smith; only cook/haul/stone");
});

// ── Band pop=8 fall-through ──────────────────────────────────────────────────

test("bandTable n=8: falls through to perWorker path — cook activates", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 8);
  state.buildings.kitchens = 1;
  state.buildings.warehouses = 1;
  state.buildings.smithies = 0;
  state.resources.food = 60;
  state.controls.roleQuotas = { cook: 99, smith: 99, herbalist: 99, haul: 99, stone: 99, herbs: 99 };
  new RoleAssignmentSystem().update(2, state);
  // perWorker: cook = max(1, floor(8 * 1/8)) = 1
  assert.ok(countRole(state, ROLE.COOK) >= 1,
    "n=8 falls through to perWorker path; cook should activate with kitchen");
});

test("bandTable n=10: perWorker path — cook+smith+stone activate with buildings", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 10);
  state.buildings.kitchens = 1;
  state.buildings.smithies = 1;
  state.buildings.quarries = 1;
  state.buildings.warehouses = 1;
  state.resources.food = 60;
  state.resources.stone = 10;
  state.controls.roleQuotas = { cook: 99, smith: 99, herbalist: 99, haul: 99, stone: 99, herbs: 99 };
  new RoleAssignmentSystem().update(2, state);
  assert.ok(countRole(state, ROLE.COOK) >= 1, "n=10 perWorker: cook should activate");
  assert.ok(countRole(state, ROLE.SMITH) >= 1, "n=10 perWorker: smith should activate");
  assert.ok(countRole(state, ROLE.STONE) >= 1, "n=10 perWorker: stone should activate");
});

// ── Emergency cook floor ─────────────────────────────────────────────────────

test("bandTable n=4: emergencyOverrideCooks floor=1 still enforced (food low)", () => {
  // When food < foodEmergencyThreshold, cook is still allowed (emergencyFloor=1),
  // and cannibalise should be blocked (food not safe). But if kitchen exists +
  // specialistBudget>0, cook still gets 1 via normal allocation (band cook=1).
  const state = createInitialGameState();
  setWorkerCount(state, 4);
  state.buildings.kitchens = 1;
  state.buildings.smithies = 1;  // emergency should clamp smith to floor
  state.resources.food = 5;     // below BALANCE.foodEmergencyThreshold=18
  state.resources.stone = 20;   // smith could otherwise activate
  new RoleAssignmentSystem().update(2, state);
  // In emergency: applyEmergency(q("smith")) → min(smith, emergencyFloor=1)
  // But band 4-5 has smith=0 → q("smith")=0 → min(0,1)=0. Smith stays 0.
  // Cook: band=4 allow.cook=1, applyEmergency(1)=min(1,1)=1. specialistBudget
  // at n=4 is max(0, 4 - farmMin - woodMin). cook should still get at least
  // the emergency override floor.
  // Result: cook >= 1 (emergency keel), smith = 0 (band block + empty budget).
  assert.ok(countRole(state, ROLE.COOK) >= 1,
    "emergency must not starve the cook (emergencyOverrideCooks=1 is survival keel)");
  assert.equal(countRole(state, ROLE.SMITH), 0,
    "band n=4 smith=0 blocks smith even in emergency scenario");
});
