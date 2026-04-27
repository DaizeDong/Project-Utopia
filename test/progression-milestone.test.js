import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { EVENT_TYPES } from "../src/simulation/meta/GameEventBus.js";
import { TILE } from "../src/config/constants.js";
import { setTile } from "../src/world/grid/Grid.js";
import { getScenarioRuntime } from "../src/world/scenarios/ScenarioFactory.js";

test("ProgressionSystem emits milestone action message and dedupes repeats", () => {
  const state = createInitialGameState({ seed: 822 });
  const progression = new ProgressionSystem();
  state.gameplay.milestoneBaseline = {
    warehouses: state.buildings.warehouses,
    farms: 0,
    lumbers: state.buildings.lumbers,
    kitchens: state.buildings.kitchens,
    meals: 0,
    tools: 0,
  };
  state.gameplay.milestonesSeen = [];
  state.buildings.farms = 1;

  progression.update(0.1, state);
  progression.update(0.1, state);

  const events = (state.events.log ?? []).filter((event) => event.type === EVENT_TYPES.COLONY_MILESTONE);
  assert.equal(events.length, 1);
  assert.equal(events[0].detail.kind, "first_farm");
  assert.equal(state.controls.actionKind, "milestone");
  assert.match(state.controls.actionMessage, /First Farm/i);
});

test("ProgressionSystem confirms newly connected scenario routes", () => {
  const state = createInitialGameState({ seed: 823 });
  const progression = new ProgressionSystem();
  state.grid = {
    width: 5,
    height: 1,
    version: 1,
    tiles: new Uint8Array([TILE.WAREHOUSE, TILE.ROAD, TILE.GRASS, TILE.ROAD, TILE.LUMBER]),
    tileState: new Map(),
  };
  state.gameplay.scenario = {
    id: "test-route-confirmation",
    anchors: {
      core: { ix: 0, iz: 0 },
      outpost: { ix: 4, iz: 0 },
    },
    routeLinks: [{
      id: "west-route",
      label: "west lumber route",
      from: "core",
      to: "outpost",
      gapTiles: [{ ix: 2, iz: 0 }],
    }],
    depotZones: [],
    targets: { logistics: { warehouses: 0, farms: 0, lumbers: 0, roads: 0, walls: 0 } },
  };

  progression.update(0.1, state);
  const before = getScenarioRuntime(state);
  const route = before.routes.find((entry) => !entry.connected);
  assert.ok(route, "fixture should include a disconnected scenario route");

  setTile(state.grid, 2, 0, TILE.ROAD);

  progression.update(0.1, state);
  progression.update(0.1, state);

  const events = (state.events.log ?? []).filter(
    (event) => event.type === EVENT_TYPES.COLONY_MILESTONE
      && event.detail?.kind === "scenario_route_connected",
  );
  assert.equal(events.length, 1);
  assert.match(events[0].detail.message, /Route online:/);
  assert.match(state.controls.actionMessage, /Route online:/);
  assert.match((state.gameplay.objectiveLog ?? [])[0], /Route online:/);
});
