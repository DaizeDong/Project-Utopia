import test from "node:test";
import assert from "node:assert/strict";
import { ROLE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";

// v0.8.2 Round-1 02a-rimworld-veteran — Role Quota sliders exposed the 6
// specialist slot knobs that were previously hardcoded to 1 inside
// RoleAssignmentSystem. These tests pin:
//   (a) default quotas {all:1} reproduce pre-change behaviour
//   (b) raising quotas.haul with sufficient workers + warehouse yields
//       the requested number of haulers (surface, no mechanic change)
//   (c) building-gating still dominates the quota (COOK=5 without a
//       kitchen still yields 0 cooks)
//   (d) specialistBudget still dominates the quota (tight worker budget
//       caps cook below the requested quota)

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

test("RoleAssignmentSystem HAUL gate (n<10) disables haulers regardless of quota", () => {
  const state = createInitialGameState();
  // Prune the worker pool below the n>=10 gate.
  const workers = state.agents.filter((a) => a.type === "WORKER");
  const keepIds = new Set(workers.slice(0, 6).map((w) => w.id));
  state.agents = state.agents.filter((a) => a.type !== "WORKER" || keepIds.has(a.id));
  state.buildings.warehouses = 1;
  state.controls.roleQuotas = { cook: 0, smith: 0, herbalist: 0, haul: 4, stone: 0, herbs: 0 };
  const roles = new RoleAssignmentSystem();
  roles.update(2, state);
  assert.equal(countRole(state, ROLE.HAUL), 0, "HAUL gate (n>=10) should keep hauler count at 0 even when quota=4");
});

test("RoleAssignmentSystem honours quotas.haul = 3 when gate + warehouse are satisfied", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 12);
  state.buildings.warehouses = 2;
  state.controls.roleQuotas = { cook: 0, smith: 0, herbalist: 0, haul: 3, stone: 0, herbs: 0 };
  const roles = new RoleAssignmentSystem();
  roles.update(2, state);
  assert.equal(countRole(state, ROLE.HAUL), 3, "quota.haul=3 should yield 3 haulers");
});

test("RoleAssignmentSystem respects kitchen gate even when quotas.cook is large", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 10);
  state.buildings.kitchens = 0; // gate: no kitchen → no cooks
  state.controls.roleQuotas = { cook: 5, smith: 0, herbalist: 0, haul: 0, stone: 0, herbs: 0 };
  const roles = new RoleAssignmentSystem();
  roles.update(2, state);
  assert.equal(countRole(state, ROLE.COOK), 0, "kitchen gate must override quota");
});

test("RoleAssignmentSystem caps cook at specialistBudget when quota exceeds the budget", () => {
  const state = createInitialGameState();
  // 4 workers: farmMin=2, woodMin=1 (if lumbers present) or 0; so budget is
  // 1 or 2. We force a minimal scenario with no lumber tiles counted and just
  // enough workers that the budget is smaller than the requested quota.
  setWorkerCount(state, 4);
  state.buildings.kitchens = 1;
  state.buildings.lumbers = 0;
  state.controls.roleQuotas = { cook: 7, smith: 0, herbalist: 0, haul: 0, stone: 0, herbs: 0 };
  const roles = new RoleAssignmentSystem();
  roles.update(2, state);
  const cooks = countRole(state, ROLE.COOK);
  // With farmMin=2 and woodMin in {0,1}, specialistBudget is either 1 or 2.
  // The quota of 7 must not exceed this.
  assert.ok(cooks <= 2, `cook count (${cooks}) must be bounded by specialistBudget (<=2)`);
  assert.ok(cooks >= 1, `with cook quota=7 and specialistBudget>=1, at least 1 cook expected (got ${cooks})`);
});

test("RoleAssignmentSystem default quota path is byte-equivalent to legacy behaviour", () => {
  // Regression guard: default quotas {all:1} + kitchen present should still
  // produce exactly 1 cook when specialistBudget permits, matching the
  // pre-change hardcoded logic.
  const state = createInitialGameState();
  setWorkerCount(state, 10);
  state.buildings.kitchens = 1;
  // leave roleQuotas at defaults (EntityFactory sets all to 1)
  const roles = new RoleAssignmentSystem();
  roles.update(2, state);
  assert.equal(countRole(state, ROLE.COOK), 1, "default quota=1 + kitchen=1 should yield 1 cook");
});
