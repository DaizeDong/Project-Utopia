import test from "node:test";
import assert from "node:assert/strict";

import { EVENT_TYPE, TILE, WEATHER } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { buildPressureLens } from "../src/render/PressureLens.js";
import { enqueueEvent } from "../src/world/events/WorldEventQueue.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { setWeather } from "../src/world/weather/WeatherSystem.js";

test("pressure lens exposes unresolved scenario gaps and active map pressure", () => {
  const state = createInitialGameState({ seed: 1337 });
  const eventSystem = new WorldEventSystem();
  const hotspot = state.gameplay.scenario.routeLinks[0].gapTiles[0];

  setWeather(state, WEATHER.STORM, 18, "test");
  enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, {}, 12, 1);
  eventSystem.update(1.1, state);

  state.metrics.traffic = {
    version: 1,
    activeLaneCount: 1,
    hotspotCount: 1,
    peakLoad: 4.2,
    avgLoad: 2.5,
    peakPenalty: 1.8,
    loadByKey: { [`${hotspot.ix},${hotspot.iz}`]: 4.2 },
    penaltyByKey: { [`${hotspot.ix},${hotspot.iz}`]: 1.8 },
    hotspotTiles: [{ ix: hotspot.ix, iz: hotspot.iz, load: 4.2, penalty: 1.8 }],
    summary: "Traffic: 1 hotspot on the frontier lane.",
  };
  state.metrics.ecology.hotspotFarms = [{ ix: hotspot.ix + 1, iz: hotspot.iz, pressure: 1.1 }];

  const markers = buildPressureLens(state);

  assert.ok(markers.some((marker) => marker.kind === "route"));
  assert.ok(markers.some((marker) => marker.kind === "depot"));
  assert.ok(markers.some((marker) => marker.kind === "weather"));
  assert.ok(markers.some((marker) => marker.kind === "bandit_raid"));
  assert.ok(markers.some((marker) => marker.kind === "traffic"));
  assert.ok(markers.some((marker) => marker.kind === "ecology"));
});

test("pressure lens stops flagging the repaired frontier route once gaps are filled", () => {
  const state = createInitialGameState({ seed: 1337 });
  const route = state.gameplay.scenario.routeLinks[0];
  const start = state.gameplay.scenario.anchors[route.from];
  const end = state.gameplay.scenario.anchors[route.to];
  let ix = start.ix;
  let iz = start.iz;
  state.grid.tiles[ix + iz * state.grid.width] = TILE.ROAD;
  while (ix !== end.ix) {
    ix += ix < end.ix ? 1 : -1;
    state.grid.tiles[ix + iz * state.grid.width] = TILE.ROAD;
  }
  while (iz !== end.iz) {
    iz += iz < end.iz ? 1 : -1;
    state.grid.tiles[ix + iz * state.grid.width] = TILE.ROAD;
  }
  state.grid.version += 1;

  const markers = buildPressureLens(state);

  assert.equal(markers.some((marker) => marker.kind === "route"), false);
});
