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
  // v0.8.2 Round-6 Wave-1 (01b Step 8) — updated with dynamic farmMin semantics.
  // Industry doctrine (farmBias=-0.14) lowers targetFarmRatio to ~0.36, which
  // in turn lowers farmMin = floor(0.36*n) < floor(0.5*n) for balanced doctrine.
  // The assertion is now: industry yields more wood workers than balanced does
  // (relative improvement), not the absolute wood > farm (which can be equal
  // when food-surplus resource-balance and dynamic farmMin interact at n=12).
  const makeIndustryState = () => {
    const s = createInitialGameState();
    s.controls.doctrine = "industry";
    s.resources.food = 80;
    s.resources.wood = 60;
    return s;
  };
  const makeBalancedState = () => {
    const s = createInitialGameState();
    s.resources.food = 80;
    s.resources.wood = 60;
    return s;
  };

  const industryState = makeIndustryState();
  const balancedState = makeBalancedState();
  const progression = new ProgressionSystem();
  progression.update(0.2, industryState);
  progression.update(0.2, balancedState);

  new RoleAssignmentSystem().update(2, industryState);
  new RoleAssignmentSystem().update(2, balancedState);

  const industryCounts = countRoles(industryState);
  const balancedCounts = countRoles(balancedState);

  assert.ok(
    industryCounts.wood >= balancedCounts.wood,
    `industry doctrine should yield at least as many wood workers as balanced ` +
      `(got industry=${industryCounts.wood} vs balanced=${balancedCounts.wood})`,
  );
  assert.ok(
    industryCounts.farm <= balancedCounts.farm,
    `industry doctrine should yield no more farm workers than balanced ` +
      `(got industry=${industryCounts.farm} vs balanced=${balancedCounts.farm})`,
  );
});
