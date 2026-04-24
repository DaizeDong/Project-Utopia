import test from "node:test";
import assert from "node:assert/strict";

import { getNextActionAdvice } from "../src/ui/hud/nextActionAdvisor.js";
import { TILE } from "../src/config/constants.js";

function makeState(width = 12, height = 12) {
  const size = width * height;
  return {
    grid: {
      width,
      height,
      version: 1,
      tiles: new Uint8Array(size).fill(TILE.GRASS),
      tileState: new Map(),
    },
    resources: { food: 100, wood: 100, stone: 100, herbs: 100, meals: 0 },
    metrics: {
      resourceEmptySec: { food: 0 },
      starvationRiskCount: 0,
    },
    session: { phase: "active" },
    gameplay: {
      scenario: {
        anchors: {},
        routeLinks: [],
        depotZones: [],
        targets: { logistics: { warehouses: 0, farms: 0, lumbers: 0, roads: 0, walls: 0 } },
      },
    },
  };
}

function setTile(state, ix, iz, tile) {
  state.grid.tiles[ix + iz * state.grid.width] = tile;
  state.grid.version += 1;
}

test("next action prioritizes food recovery during starvation risk", () => {
  const state = makeState();
  state.resources.food = 6;
  state.metrics.starvationRiskCount = 2;

  const advice = getNextActionAdvice(state);
  assert.equal(advice.priority, "critical");
  assert.equal(advice.tool, "farm");
  assert.equal(advice.reason, "food_crisis");
  assert.equal(advice.headline, "Food bottleneck");
  assert.match(advice.whyNow, /Food is below the emergency line/);
  assert.match(advice.expectedOutcome, /Reconnecting farms keeps workers fed/);
  assert.match(advice.detail, /farms/i);
});

test("next action chooses a concrete road gap for broken routes", () => {
  const state = makeState();
  setTile(state, 1, 1, TILE.WAREHOUSE);
  setTile(state, 2, 1, TILE.ROAD);
  setTile(state, 4, 1, TILE.ROAD);
  setTile(state, 5, 1, TILE.LUMBER);
  state.gameplay.scenario.anchors = {
    core: { ix: 1, iz: 1 },
    outpost: { ix: 5, iz: 1 },
  };
  state.gameplay.scenario.routeLinks = [{
    id: "west-route",
    label: "west lumber route",
    from: "core",
    to: "outpost",
    gapTiles: [{ ix: 3, iz: 1 }],
  }];

  const advice = getNextActionAdvice(state);
  assert.equal(advice.priority, "high");
  assert.equal(advice.tool, "road");
  assert.equal(advice.reason, "route_gap");
  assert.deepEqual(advice.target, { ix: 3, iz: 1 });
  assert.equal(advice.label, "Repair west lumber route");
  assert.match(advice.headline, /west lumber route gap at \(3,1\)/);
  assert.match(advice.whyNow, /broken at \(3,1\)/);
  assert.match(advice.expectedOutcome, /Restores the haul line/);
  assert.match(advice.detail, /Road at \(3,1\) reconnects west lumber route/);
});

test("next action asks for warehouse when a depot zone is missing", () => {
  const state = makeState();
  state.gameplay.scenario.anchors = {
    eastDepot: { ix: 8, iz: 6 },
  };
  state.gameplay.scenario.depotZones = [{
    id: "east-depot",
    label: "east ruined depot",
    anchor: "eastDepot",
    radius: 2,
  }];

  const advice = getNextActionAdvice(state);
  assert.equal(advice.priority, "high");
  assert.equal(advice.tool, "warehouse");
  assert.equal(advice.reason, "depot_missing");
  assert.deepEqual(advice.target, { ix: 8, iz: 6 });
  assert.equal(advice.label, "Reclaim east ruined depot");
  assert.match(advice.headline, /east ruined depot at \(8,6\)/);
  assert.match(advice.whyNow, /east ruined depot is still offline/);
  assert.match(advice.expectedOutcome, /reopens stockpile coverage/);
  assert.match(advice.detail, /Warehouse near \(8,6\) reopens east ruined depot/);
});

test("next action falls back to unmet logistics targets", () => {
  const state = makeState();
  state.gameplay.scenario.targets.logistics = {
    warehouses: 0,
    farms: 2,
    lumbers: 0,
    roads: 0,
    walls: 0,
  };

  const advice = getNextActionAdvice(state);
  assert.equal(advice.priority, "normal");
  assert.equal(advice.tool, "farm");
  assert.equal(advice.reason, "target_farms");
  assert.equal(advice.label, "Grow food supply");
  assert.match(advice.headline, /Grow food supply target/);
  assert.match(advice.whyNow, /Food production still needs 2 more farms/);
  assert.match(advice.expectedOutcome, /next layer of the scenario/);
  assert.match(advice.detail, /0\/2 farms built/);
});

test("next action falls back to a done-state guidance when logistics are stable", () => {
  const state = makeState();
  state.gameplay.scenario.targets.logistics = {
    warehouses: 0,
    farms: 0,
    lumbers: 0,
    roads: 0,
    walls: 0,
  };
  state.gameplay.scenario.routeLinks = [];
  state.gameplay.scenario.depotZones = [];

  const advice = getNextActionAdvice(state);
  assert.equal(advice.priority, "done");
  assert.equal(advice.tool, "select");
  assert.equal(advice.reason, "all_clear");
  assert.equal(advice.label, "Hold and improve");
  assert.match(advice.headline, /Scenario stable/);
  assert.match(advice.expectedOutcome, /build preview/i);
});
