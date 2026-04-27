import test from "node:test";
import assert from "node:assert/strict";

import { TILE, VISITOR_KIND } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { tileToWorld } from "../src/world/grid/Grid.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { VisitorAISystem } from "../src/simulation/npc/VisitorAISystem.js";
import { getEntityInsight } from "../src/ui/interpretation/WorldExplain.js";

function setTile(state, ix, iz, tileType) {
  state.grid.tiles[ix + iz * state.grid.width] = tileType;
}

function connectCoreToEastDepot(state) {
  const { coreWarehouse, eastDepot } = state.gameplay.scenario.anchors;
  for (let ix = coreWarehouse.ix; ix <= eastDepot.ix; ix += 1) {
    setTile(state, ix, coreWarehouse.iz, TILE.ROAD);
  }
  for (let iz = coreWarehouse.iz; iz <= eastDepot.iz; iz += 1) {
    setTile(state, eastDepot.ix, iz, TILE.ROAD);
  }
}

function makeServices(sequence = [0.5]) {
  let index = 0;
  return {
    rng: {
      next: () => {
        const value = sequence[Math.min(index, sequence.length - 1)];
        index += 1;
        return value;
      },
    },
    pathCache: { get: () => null, set: () => {} },
  };
}

function getSaboteur(state) {
  return state.agents.find((agent) => agent.type === "VISITOR" && agent.kind !== VISITOR_KIND.TRADER);
}

function getTrader(state) {
  return state.agents.find((agent) => agent.type === "VISITOR" && agent.kind === VISITOR_KIND.TRADER);
}

test("Trader prefers a reclaimed depot warehouse over the nearest core warehouse", () => {
  const state = createInitialGameState();
  const trader = getTrader(state);
  assert.ok(trader, "expected a trader");
  state.agents = [trader];
  state.animals = [];

  const { coreWarehouse, eastDepot } = state.gameplay.scenario.anchors;
  const corePos = tileToWorld(coreWarehouse.ix, coreWarehouse.iz, state.grid);
  trader.x = corePos.x;
  trader.z = corePos.z;
  trader.hunger = 1;
  trader.alive = true;
  trader.targetTile = null;
  trader.path = null;
  trader.pathIndex = 0;
  trader.pathGridVersion = -1;
  trader.blackboard = {
    fsm: {
      state: "seek_trade",
      previousState: "idle",
      changedAtSec: 0,
      reason: "test",
      history: [],
      path: [],
    },
  };
  state.metrics.timeSec = 20;

  connectCoreToEastDepot(state);
  setTile(state, eastDepot.ix, eastDepot.iz, TILE.WAREHOUSE);
  setTile(state, eastDepot.ix, eastDepot.iz - 1, TILE.WALL);
  setTile(state, eastDepot.ix, eastDepot.iz + 1, TILE.WALL);
  setTile(state, eastDepot.ix + 1, eastDepot.iz - 1, TILE.WALL);
  state.grid.version += 1;

  const system = new VisitorAISystem();
  system.update(0.2, state, makeServices([0.5]));

  assert.equal(trader.targetTile?.ix, eastDepot.ix);
  assert.equal(trader.targetTile?.iz, eastDepot.iz);
  assert.match(String(trader.blackboard.tradeTargetLabel ?? ""), /depot/i);
  assert.ok(Number(trader.blackboard.tradeTargetBonus ?? 1) > 1);
});

test("Saboteur prefers exposed depot infrastructure over defended core assets", () => {
  const state = createInitialGameState();
  const saboteur = getSaboteur(state);
  assert.ok(saboteur, "expected a saboteur");
  state.agents = [saboteur];
  state.animals = [];

  const { coreWarehouse, eastDepot } = state.gameplay.scenario.anchors;
  const corePos = tileToWorld(coreWarehouse.ix, coreWarehouse.iz, state.grid);
  saboteur.x = corePos.x;
  saboteur.z = corePos.z;
  saboteur.hunger = 1;
  saboteur.alive = true;
  saboteur.sabotageCooldown = 0;
  saboteur.blackboard = {
    fsm: {
      state: "scout",
      previousState: "idle",
      changedAtSec: 0,
      reason: "test",
      history: [],
      path: [],
    },
  };
  state.metrics.timeSec = 30;

  connectCoreToEastDepot(state);
  setTile(state, eastDepot.ix, eastDepot.iz, TILE.WAREHOUSE);
  setTile(state, coreWarehouse.ix - 1, coreWarehouse.iz, TILE.WALL);
  setTile(state, coreWarehouse.ix + 1, coreWarehouse.iz, TILE.WALL);
  setTile(state, coreWarehouse.ix, coreWarehouse.iz - 1, TILE.WALL);
  state.grid.version += 1;

  const system = new VisitorAISystem();
  system.update(0.2, state, makeServices([0.5, 0.5, 0.5]));

  assert.equal(saboteur.targetTile?.ix, eastDepot.ix);
  assert.equal(saboteur.targetTile?.iz, eastDepot.iz);
  assert.match(String(saboteur.blackboard.sabotageTargetLabel ?? ""), /depot/i);
});

test("Walls and sabotage resistance can block a sabotage run", () => {
  const state = createInitialGameState();
  const progression = new ProgressionSystem();
  const saboteur = getSaboteur(state);
  assert.ok(saboteur, "expected a saboteur");
  state.agents = [saboteur];
  state.animals = [];
  state.controls.doctrine = "fortress";
  progression.update(0.2, state);

  const { coreWarehouse } = state.gameplay.scenario.anchors;
  for (let iz = 0; iz < state.grid.height; iz += 1) {
    for (let ix = 0; ix < state.grid.width; ix += 1) {
      const tile = state.grid.tiles[ix + iz * state.grid.width];
      if (tile === TILE.FARM || tile === TILE.LUMBER) {
        setTile(state, ix, iz, TILE.GRASS);
      }
    }
  }
  setTile(state, coreWarehouse.ix - 1, coreWarehouse.iz, TILE.WALL);
  setTile(state, coreWarehouse.ix + 1, coreWarehouse.iz, TILE.WALL);
  setTile(state, coreWarehouse.ix, coreWarehouse.iz - 1, TILE.WALL);
  setTile(state, coreWarehouse.ix, coreWarehouse.iz + 1, TILE.WALL);
  state.grid.version += 1;

  const pos = tileToWorld(coreWarehouse.ix, coreWarehouse.iz, state.grid);
  saboteur.x = pos.x;
  saboteur.z = pos.z;
  saboteur.hunger = 1;
  saboteur.alive = true;
  saboteur.sabotageCooldown = 0;
  saboteur.targetTile = { ix: coreWarehouse.ix, iz: coreWarehouse.iz };
  saboteur.path = [{ ix: coreWarehouse.ix, iz: coreWarehouse.iz }];
  saboteur.pathIndex = 0;
  saboteur.pathGridVersion = state.grid.version;
  saboteur.blackboard = {
    fsm: {
      state: "scout",
      previousState: "idle",
      changedAtSec: 0,
      reason: "test",
      history: [],
      path: [],
    },
    sabotageTargetLabel: "core warehouse",
    sabotageTargetDefense: 4,
  };
  state.metrics.timeSec = 40;

  const system = new VisitorAISystem();
  system.update(0.2, state, makeServices([0, 0, 0]));
  system.update(0.2, state, makeServices([0, 0, 0]));

  const idx = coreWarehouse.ix + coreWarehouse.iz * state.grid.width;
  assert.equal(state.grid.tiles[idx], TILE.WAREHOUSE, "blocked sabotage should not ruin the warehouse");
  const sabotageEvent = state.events.active.find((event) => event.type === "sabotage");
  assert.ok(sabotageEvent?.payload?.blockedByWalls, "sabotage event should record a blocked attack");
  const insights = getEntityInsight(state, saboteur);
  assert.ok(insights.some((line) => /blocked/i.test(line)), "entity insight should explain the blocked sabotage");
});

test("High-load sabotage rate-limits destructive grid changes", () => {
  const state = createInitialGameState();
  const saboteur = getSaboteur(state);
  assert.ok(saboteur, "expected a saboteur");
  state.agents = [saboteur];
  state.animals = [];
  state.ai.runtimeProfile = "long_run";
  state.controls.timeScale = 8;
  state.metrics.timeSec = 100;

  const firstTarget = { ix: 8, iz: 8 };
  const secondTarget = { ix: 9, iz: 8 };
  setTile(state, firstTarget.ix, firstTarget.iz, TILE.FARM);
  setTile(state, secondTarget.ix, secondTarget.iz, TILE.FARM);
  state.grid.version += 1;

  const pos = tileToWorld(firstTarget.ix, firstTarget.iz, state.grid);
  saboteur.x = pos.x;
  saboteur.z = pos.z;
  saboteur.hunger = 1;
  saboteur.alive = true;
  saboteur.sabotageCooldown = 0;
  saboteur.targetTile = firstTarget;
  saboteur.path = [firstTarget];
  saboteur.pathIndex = 0;
  saboteur.pathGridVersion = state.grid.version;
  saboteur.blackboard = {
    fsm: { state: "scout", previousState: "idle", changedAtSec: 0, reason: "test", history: [], path: [] },
    sabotageTargetLabel: "farm belt",
    sabotageTargetDefense: 0,
  };

  const system = new VisitorAISystem();
  system.update(0.2, state, makeServices([0, 0, 0]));
  assert.equal(state.grid.tiles[firstTarget.ix + firstTarget.iz * state.grid.width], TILE.RUINS);

  state.events.active = [];
  state.metrics.timeSec += 1;
  const pos2 = tileToWorld(secondTarget.ix, secondTarget.iz, state.grid);
  saboteur.x = pos2.x;
  saboteur.z = pos2.z;
  saboteur.sabotageCooldown = 0;
  saboteur.targetTile = secondTarget;
  saboteur.path = [secondTarget];
  saboteur.pathIndex = 0;
  saboteur.pathGridVersion = state.grid.version;
  saboteur.blackboard.sabotageTargetDefense = 0;

  system.update(0.2, state, makeServices([0, 0, 0]));
  assert.equal(state.grid.tiles[secondTarget.ix + secondTarget.iz * state.grid.width], TILE.FARM);
  const rateLimited = state.events.active.find((event) => event.type === "sabotage");
  assert.equal(rateLimited?.payload?.gridChangeRateLimited, true);
});
