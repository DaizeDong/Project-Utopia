import test from "node:test";
import assert from "node:assert/strict";

import { TILE } from "../src/config/constants.js";
import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { tileToWorld } from "../src/world/grid/Grid.js";
import { PopulationGrowthSystem } from "../src/simulation/population/PopulationGrowthSystem.js";

// v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 6 / verification §6.1) —
// PopulationGrowthSystem must wire kinship into newborns: parents[] must
// reference at least one nearby living worker, the parent's children[] must
// reference the newborn, and the broadcast memory line must read "born to
// {parent}" rather than the legacy "warehouse" copy.

function findWarehouseTile(state) {
  const { grid } = state;
  for (let iz = 0; iz < grid.height; iz += 1) {
    for (let ix = 0; ix < grid.width; ix += 1) {
      if (grid.tiles[ix + iz * grid.width] === TILE.WAREHOUSE) return { ix, iz };
    }
  }
  return null;
}

// v0.8.4 Phase 11 (Agent D) — RecruitmentSystem replaced organic
// reproduction with explicit food-cost recruits. Recruits intentionally do
// NOT carry parent ids (they're "hired" from a recruit pool, not born to
// in-game agents). The kinship-wiring this test guards no longer exists.
// The test is preserved (skipped) to mark the behavior change for the
// changelog and to remind any future reviver that the contract changed.
test("PopulationGrowthSystem wires lineage parents/children on birth", { skip: "v0.8.4 recruits do not carry parent ids (Phase 11 RecruitmentSystem)" }, () => {
  const state = createInitialGameState({ seed: 31337 });
  const wh = findWarehouseTile(state);
  assert.ok(wh, "test setup: at least one warehouse tile is required");
  const pos = tileToWorld(wh.ix, wh.iz, state.grid);

  // Replace the agents with a small adjacent cohort so the parent-pick
  // candidate ring (manhattan-world < 8) deterministically catches them.
  const parentA = createWorker(pos.x, pos.z, () => 0.11);
  const parentB = createWorker(pos.x + 1, pos.z, () => 0.22);
  state.agents = [parentA, parentB];
  state.animals = [];
  state.resources.food = 200;
  state.metrics.timeSec = 60;

  const sys = new PopulationGrowthSystem();
  // First update consumes initial timer; force-execute by zeroing the timer.
  sys._timer = 0;
  sys.update(0, state, { rng: { next: () => 0.5 } });

  const newborns = state.agents.filter((a) => a !== parentA && a !== parentB);
  assert.equal(newborns.length, 1, "exactly one newborn expected");
  const newborn = newborns[0];
  assert.ok(Array.isArray(newborn.lineage?.parents), "lineage.parents present");
  assert.ok(newborn.lineage.parents.length >= 1, "newborn has ≥1 parent id");
  // Parents' children arrays must back-reference the newborn.
  const allParentChildren = state.agents
    .filter((a) => newborn.lineage.parents.includes(a.id))
    .flatMap((a) => Array.isArray(a.lineage?.children) ? a.lineage.children : []);
  assert.ok(allParentChildren.includes(newborn.id),
    "parent's lineage.children references newborn id");

  // Memory broadcast: nearby workers should see "born to ..." not "warehouse".
  const witnessMemory = parentA.memory?.recentEvents?.[0] ?? "";
  assert.match(witnessMemory, /born to /i, "witness memory uses 'born to' copy");
  assert.ok(!/warehouse/i.test(witnessMemory),
    "witness memory must not contain 'warehouse' literal");
  const witnessHistory = parentA.memory?.history?.[0];
  assert.equal(witnessHistory?.type, "birth", "birth memory mirrored to durable history");
  assert.match(witnessHistory?.label ?? "", /born to /i);
  assert.doesNotThrow(() => JSON.stringify(parentA.memory.history),
    "memory.history stays serializable");
});
