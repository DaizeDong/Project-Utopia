// PEE R10 P1 (Plan-PEE-goal-attribution) — round-trip: warehouse-on-depot
// flips runtime.depots[].ready and the first-warehouse milestone toast names
// the depot ("First Warehouse covers east depot") instead of the misleading
// pre-R10 "First extra Warehouse raised" copy. Negative control: a warehouse
// placed away from any depot still drops "first extra" but does NOT name a
// depot.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { EVENT_TYPES } from "../src/simulation/meta/GameEventBus.js";
import { TILE } from "../src/config/constants.js";
import { setTile } from "../src/world/grid/Grid.js";
import { getScenarioRuntime } from "../src/world/scenarios/ScenarioFactory.js";

function makeFixture(seed, withDepot) {
  const state = createInitialGameState({ seed });
  state.grid = {
    width: 5,
    height: 1,
    version: 1,
    // [WAREHOUSE bootstrap, GRASS, GRASS, GRASS, RUINS depot tile]
    tiles: new Uint8Array([TILE.WAREHOUSE, TILE.GRASS, TILE.GRASS, TILE.GRASS, TILE.RUINS]),
    tileState: new Map(),
  };
  state.gameplay.scenario = {
    id: "test-depot-attribution",
    anchors: {
      core: { ix: 0, iz: 0 },
      eastDepot: { ix: 4, iz: 0 },
    },
    routeLinks: [],
    depotZones: withDepot
      ? [{ id: "east-depot", label: "east ruined depot", anchor: "eastDepot", radius: 2 }]
      : [],
    targets: { logistics: { warehouses: 0, farms: 0, lumbers: 0, roads: 0, walls: 0 } },
  };
  // Reset milestone bookkeeping so first_warehouse fires fresh on tile flip.
  state.gameplay.milestonesSeen = [];
  state.gameplay.milestoneBaseline = {
    warehouses: Number(state.buildings?.warehouses ?? 0),
    farms: 0,
    lumbers: 0,
    kitchens: 0,
    meals: 0,
    tools: 0,
    clinics: 0,
    smithies: 0,
    medicine: 0,
    haulDeliveredLife: 0,
    __devNever__: 0,
  };
  return state;
}

test("PEE R10: warehouse on east depot tile flips runtime ready + names depot in toast", () => {
  const state = makeFixture(901, true);
  const progression = new ProgressionSystem();

  // Pre-condition: depot is unready (only RUINS at the depot tile).
  const before = getScenarioRuntime(state);
  assert.equal(before.depots.length, 1);
  assert.equal(before.depots[0].ready, false, "depot should start unready");
  assert.equal(before.readyDepots, 0);

  // Player builds a warehouse on the east depot ruin tile (4, 0).
  setTile(state.grid, 4, 0, TILE.WAREHOUSE);
  state.buildings.warehouses = (state.buildings.warehouses ?? 0) + 1;

  progression.update(0.1, state);
  progression.update(0.1, state);

  // Runtime now reports the depot as ready (auto-recomputed from the grid).
  const after = getScenarioRuntime(state);
  assert.equal(after.depots[0].ready, true, "depot should be ready after warehouse on tile");
  assert.equal(after.readyDepots, 1);

  // first_warehouse milestone fired with depot-aware label/message.
  const events = (state.events.log ?? []).filter(
    (event) => event.type === EVENT_TYPES.COLONY_MILESTONE
      && event.detail?.kind === "first_warehouse",
  );
  assert.equal(events.length, 1, "first_warehouse milestone should emit exactly once");
  const detail = events[0].detail;
  assert.match(detail.label, /Warehouse covers east depot/, "label should name the depot");
  assert.doesNotMatch(detail.label, /first extra/i, "label must not say 'first extra'");
  assert.doesNotMatch(detail.label, /\bruined\b/i, "label should strip 'ruined' for cleanliness");
  assert.match(state.controls.actionMessage, /Warehouse covers east depot/);
  assert.doesNotMatch(state.controls.actionMessage, /first extra/i);
});

test("PEE R10: warehouse with no depot present uses neutral 'First Warehouse raised' copy (no depot name)", () => {
  const state = makeFixture(902, false);
  const progression = new ProgressionSystem();

  // Build a second warehouse anywhere (no depot zones in scenario).
  setTile(state.grid, 2, 0, TILE.WAREHOUSE);
  state.buildings.warehouses = (state.buildings.warehouses ?? 0) + 1;

  progression.update(0.1, state);
  progression.update(0.1, state);

  const events = (state.events.log ?? []).filter(
    (event) => event.type === EVENT_TYPES.COLONY_MILESTONE
      && event.detail?.kind === "first_warehouse",
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].detail.label, "First Warehouse raised");
  assert.doesNotMatch(events[0].detail.label, /first extra/i,
    "neutral copy must not regress to 'first extra' wording");
});
