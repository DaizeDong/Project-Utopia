import test from "node:test";
import assert from "node:assert/strict";

import { EVENT_TYPE, TILE, WEATHER } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { getScenarioEventCandidates, getScenarioRuntime, resolveScenarioFocusTiles } from "../src/world/scenarios/ScenarioFactory.js";

test("fortified basin uses gate chokepoint scenario metadata", () => {
  const state = createInitialGameState({ templateId: "fortified_basin", seed: 1337 });
  const runtime = getScenarioRuntime(state);

  assert.equal(state.gameplay.scenario.family, "gate_chokepoints");
  assert.equal(runtime.routes.length, 1);
  assert.equal(runtime.depots.length, 1);
  assert.ok((state.gameplay.scenario.chokePoints ?? []).length >= 2);
  assert.equal(runtime.connectedRoutes, 0);
  assert.equal(runtime.readyDepots, 0);
  assert.ok(runtime.counts.walls >= 6);
  // v0.8.0 Phase 4 — Survival Mode. Objectives are retired; scenario
  // metadata still drives route/depot setup and family identity.
  assert.equal(Array.isArray(state.gameplay.objectives), true);
  assert.equal(state.gameplay.objectives.length, 0);
});

test("archipelago isles uses island relay scenario metadata", () => {
  const state = createInitialGameState({ templateId: "archipelago_isles", seed: 1337 });
  const runtime = getScenarioRuntime(state);

  assert.equal(state.gameplay.scenario.family, "island_relay");
  assert.equal(runtime.routes.length, 2);
  assert.equal(runtime.depots.length, 1);
  assert.equal(runtime.connectedRoutes, 0);
  assert.equal(runtime.readyDepots, 0);
  // v0.8.0 Phase 4 — Survival Mode. Objectives are retired.
  assert.equal(Array.isArray(state.gameplay.objectives), true);
  assert.equal(state.gameplay.objectives.length, 0);
});

test("scenario families expose event and weather focus tiles", () => {
  const frontier = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const basin = createInitialGameState({ templateId: "fortified_basin", seed: 1337 });
  const islands = createInitialGameState({ templateId: "archipelago_isles", seed: 1337 });

  const frontierStorm = resolveScenarioFocusTiles(frontier, frontier.gameplay.scenario.weatherFocus[WEATHER.STORM]);
  const basinBandits = getScenarioEventCandidates(basin, EVENT_TYPE.BANDIT_RAID);
  const islandTrade = getScenarioEventCandidates(islands, EVENT_TYPE.TRADE_CARAVAN);

  assert.ok(frontierStorm.length > 0);
  assert.ok(basinBandits.length >= 2);
  assert.ok(basinBandits.some((zone) => /north gate|south granary/i.test(zone.label)));
  assert.ok(islandTrade.length >= 1);
  assert.match(islandTrade[0].label, /relay depot/i);
});

test("scenario runtime cache reuses stable grids and invalidates on grid.version changes", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const anchor = state.gameplay.scenario.anchors.eastDepot;

  const first = getScenarioRuntime(state);
  const cached = getScenarioRuntime(state);
  assert.equal(cached, first, "stable grid should reuse cached scenario runtime");
  assert.equal(first.readyDepots, 0);

  state.grid.tiles[anchor.ix + anchor.iz * state.grid.width] = TILE.WAREHOUSE;
  state.grid.version = Number(state.grid.version ?? 0) + 1;

  const afterGridChange = getScenarioRuntime(state);
  assert.notEqual(afterGridChange, first, "grid.version change must invalidate runtime cache");
  assert.ok(afterGridChange.readyDepots > first.readyDepots);
});
