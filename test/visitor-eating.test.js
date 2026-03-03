import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE, VISITOR_KIND } from "../src/config/constants.js";
import { tileToWorld, findNearestTileOfTypes } from "../src/world/grid/Grid.js";
import { VisitorAISystem } from "../src/simulation/npc/VisitorAISystem.js";

test("Trader at full hunger does not consume food while trading", () => {
  const state = createInitialGameState();
  const trader = state.agents.find((e) => e.type === "VISITOR" && e.kind === VISITOR_KIND.TRADER);
  assert.ok(trader, "expected at least one trader in initial state");
  state.agents = [trader];
  state.animals = [];

  const warehouse = findNearestTileOfTypes(state.grid, trader, [TILE.WAREHOUSE]);
  assert.ok(warehouse, "expected at least one warehouse tile");

  const pos = tileToWorld(warehouse.ix, warehouse.iz, state.grid);
  trader.x = pos.x;
  trader.z = pos.z;
  trader.targetTile = warehouse;
  trader.path = [];
  trader.pathIndex = 0;
  trader.pathGridVersion = state.grid.version;
  trader.hunger = 1;
  trader.alive = true;
  state.metrics.timeSec = 10;
  trader.blackboard ??= {};
  trader.blackboard.fsm = {
    state: "seek_trade",
    previousState: "idle",
    changedAtSec: 0,
    reason: "test",
    history: [],
    path: [],
  };

  const dt = 1 / 30;
  const tradeYield = Number(state.gameplay?.modifiers?.tradeYield ?? 1);
  const expectedFood = Number(state.resources.food) + 1.5 * dt * tradeYield;

  const system = new VisitorAISystem();
  system.update(dt, state, {
    rng: { next: () => 0.5 },
    pathCache: { get: () => null, set: () => {} },
  });

  assert.ok(Math.abs(Number(state.resources.food) - expectedFood) < 1e-4);
});
