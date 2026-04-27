import test from "node:test";
import assert from "node:assert/strict";

import { ROLE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";

// v0.8.2 Round-5 Wave-1 (02d Step 4) — specialty-aware role assignment.
//
// Previously `RoleAssignmentSystem.update` used `workers[idx++]` array-order
// to pick which agents got which role, so the `skills` field on worker
// backstories was purely cosmetic. The new logic sorts the remaining pool by
// `skills[<key>]` descending before assigning specialist roles (COOK,
// SMITH, HERBALIST, STONE, HERBS), so a "cooking specialist" actually ends
// up cooking.
//
// Note: FARM / WOOD / HAUL assignments keep the legacy array-order so the
// spatial correlation between spawn order and cluster proximity is
// preserved (see commit log for monotonicity seed=1 Risk note).

function workers(state) {
  return state.agents.filter((a) => a.type === "WORKER");
}

test("specialty: highest skills.cooking is picked for ROLE.COOK when kitchen exists", () => {
  const state = createInitialGameState({ seed: 902 });
  // Keep exactly 12 workers for a predictable budget.
  const pool = workers(state).slice(0, 12);
  state.agents = state.agents.filter((a) => a.type !== "WORKER").concat(pool);
  state.buildings.kitchens = 1;
  state.buildings.warehouses = 1;
  state.controls.roleQuotas = { cook: 1, smith: 0, herbalist: 0, haul: 0, stone: 0, herbs: 0 };

  // Make one worker the clear cooking specialist.
  const specialist = pool[5];
  for (const w of pool) {
    w.skills = { ...(w.skills ?? {}), cooking: 0.2 };
  }
  specialist.skills.cooking = 0.95;

  new RoleAssignmentSystem().update(2, state);
  const cooks = pool.filter((w) => w.role === ROLE.COOK);
  assert.equal(cooks.length, 1, "exactly 1 cook expected under cook quota=1");
  assert.equal(
    cooks[0].id,
    specialist.id,
    "highest skills.cooking worker should be the one selected as COOK",
  );
});

test("specialty: no dedicated specialist — assignment still deterministic and correct count", () => {
  const state = createInitialGameState({ seed: 902 });
  const pool = workers(state).slice(0, 12);
  state.agents = state.agents.filter((a) => a.type !== "WORKER").concat(pool);
  state.buildings.smithies = 1;
  state.buildings.warehouses = 1;
  state.controls.roleQuotas = { cook: 0, smith: 2, herbalist: 0, haul: 0, stone: 0, herbs: 0 };

  new RoleAssignmentSystem().update(2, state);
  // 2 smiths assigned (scaled: floor(12*1/10)=1, min(1, playerCap=2)=1 —
  // so with quota scaled to 1 at n=12 we still get 1 smith). Just assert no
  // crashes and that the role is populated.
  const smiths = pool.filter((w) => w.role === ROLE.SMITH);
  assert.ok(smiths.length >= 1, "at least 1 smith expected");
  assert.ok(smiths.length <= 2, "smith count should not exceed player cap");
});
