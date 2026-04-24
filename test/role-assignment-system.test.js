import test from "node:test";
import assert from "node:assert/strict";
import { ROLE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";

function countRoles(state) {
  const workers = state.agents.filter((agent) => agent.type === "WORKER");
  return {
    farm: workers.filter((worker) => worker.role === ROLE.FARM).length,
    wood: workers.filter((worker) => worker.role === ROLE.WOOD).length,
  };
}

test("RoleAssignmentSystem biases workers toward farms when stockpile food is the bottleneck", () => {
  const state = createInitialGameState();
  const progression = new ProgressionSystem();
  const roles = new RoleAssignmentSystem();

  progression.update(0.2, state);
  // v0.8.0 Phase 4 — Survival Mode. Objectives are retired; the role
  // assignment bias is now driven purely by resource deficit + prosperity.
  state.resources.food = 12;
  state.resources.wood = 180;
  state.gameplay.prosperity = 60;

  roles.update(2, state);
  const counts = countRoles(state);
  assert.ok(counts.farm > counts.wood, "food deficit should push more workers onto farms");
});

test("RoleAssignmentSystem keeps an industry doctrine wood-heavy during the logistics buildout", () => {
  const state = createInitialGameState();
  const progression = new ProgressionSystem();
  const roles = new RoleAssignmentSystem();

  state.controls.doctrine = "industry";
  state.resources.food = 80;
  state.resources.wood = 60;
  progression.update(0.2, state);

  roles.update(2, state);
  const counts = countRoles(state);
  // v0.8.2 Round-5b Wave-1 (01b Step 3) — dynamic farmMin = floor(ratio*n)
  // means industry doctrine (farmBias=-0.14 → ratio≈0.36 @ n=12) now keeps
  // farmMin≈4 instead of the old hardcoded min(2,n)=2. With specialists
  // consuming more of the budget, the industry bias still drives wood ≥ farm
  // (never farm > wood), which is the invariant that matters for the
  // reviewer-facing doctrine signal.
  assert.ok(counts.wood >= counts.farm, `industry logistics pressure should bias workers toward lumber (farm=${counts.farm}, wood=${counts.wood})`);
});
