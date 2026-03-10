import test from "node:test";
import assert from "node:assert/strict";

import { EVENT_TYPE, WEATHER } from "../src/config/constants.js";
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
  assert.match(state.gameplay.objectives[0]?.description ?? "", /north timber gate/i);
});

test("archipelago isles uses island relay scenario metadata", () => {
  const state = createInitialGameState({ templateId: "archipelago_isles", seed: 1337 });
  const runtime = getScenarioRuntime(state);

  assert.equal(state.gameplay.scenario.family, "island_relay");
  assert.equal(runtime.routes.length, 2);
  assert.equal(runtime.depots.length, 1);
  assert.equal(runtime.connectedRoutes, 0);
  assert.equal(runtime.readyDepots, 0);
  assert.match(state.gameplay.objectives[0]?.description ?? "", /causeways/i);
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
