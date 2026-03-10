import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { EVENT_TYPE, TILE, WEATHER } from "../src/config/constants.js";
import { enqueueEvent } from "../src/world/events/WorldEventQueue.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { setWeather } from "../src/world/weather/WeatherSystem.js";

test("bandit raid targets scenario-specific zones and can damage route tiles", () => {
  const templates = ["temperate_plains", "fortified_basin", "archipelago_isles"];
  for (const templateId of templates) {
    const state = createInitialGameState({ templateId, seed: 1337 });
    const system = new WorldEventSystem();

    setWeather(state, WEATHER.STORM, 18, "test");
    enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, {}, 12, 1);
    system.update(1.1, state);

    const raid = state.events.active.find((event) => event.type === EVENT_TYPE.BANDIT_RAID);
    assert.ok(raid, `expected active bandit raid for ${templateId}`);
    assert.equal(raid.status, "active");
    assert.equal(typeof raid.payload?.targetLabel, "string");
    assert.ok(Array.isArray(raid.payload?.targetTiles));
    assert.ok(Number(raid.payload?.pressure ?? 0) > 0.4);
    assert.equal(typeof raid.payload?.severity, "string");
    assert.ok(Number(raid.payload?.hazardOverlapTiles ?? 0) > 0);

    const impact = raid.payload?.impactTile;
    assert.ok(impact, `expected raid to choose a spatial impact tile for ${templateId}`);
    const impactedTile = state.grid.tiles[impact.ix + impact.iz * state.grid.width];
    assert.ok(impactedTile === TILE.RUINS || Boolean(raid.payload?.blockedByWalls));
    assert.ok(Number(state.metrics.spatialPressure?.eventPressure ?? 0) >= Number(raid.payload?.pressure ?? 0));
  }
});

test("animal migration writes a spatial migration target for herbivores", () => {
  const state = createInitialGameState({ seed: 1337 });
  const system = new WorldEventSystem();

  enqueueEvent(state, EVENT_TYPE.ANIMAL_MIGRATION, {}, 12, 1);
  system.update(1.1, state);

  const herbivore = state.animals.find((animal) => animal.kind === "HERBIVORE");
  assert.ok(herbivore, "expected at least one herbivore");
  assert.ok(herbivore.memory?.migrationTarget, "expected migration target");
  assert.equal(typeof herbivore.memory.migrationTarget.ix, "number");
  assert.equal(typeof herbivore.memory.migrationTarget.iz, "number");
  assert.ok(Number(herbivore.debug?.lastMigrationPressure ?? 0) > 0);
  assert.match(String(state.metrics.spatialPressure?.summary ?? ""), /active zones/i);
});

test("trade caravan reward drops when depot lane is weather-contested", () => {
  const clearState = createInitialGameState({ seed: 1337 });
  const stormState = createInitialGameState({ seed: 1337 });
  const clearSystem = new WorldEventSystem();
  const stormSystem = new WorldEventSystem();
  const depotAnchor = clearState.gameplay.scenario.anchors.eastDepot;
  const stormDepotAnchor = stormState.gameplay.scenario.anchors.eastDepot;

  clearState.grid.tiles[depotAnchor.ix + depotAnchor.iz * clearState.grid.width] = TILE.WAREHOUSE;
  stormState.grid.tiles[stormDepotAnchor.ix + stormDepotAnchor.iz * stormState.grid.width] = TILE.WAREHOUSE;

  enqueueEvent(clearState, EVENT_TYPE.TRADE_CARAVAN, {}, 12, 1);
  clearSystem.update(1.1, clearState);

  setWeather(stormState, WEATHER.STORM, 18, "test");
  enqueueEvent(stormState, EVENT_TYPE.TRADE_CARAVAN, {}, 12, 1);
  stormSystem.update(1.1, stormState);

  const clearCaravan = clearState.events.active.find((event) => event.type === EVENT_TYPE.TRADE_CARAVAN);
  const stormCaravan = stormState.events.active.find((event) => event.type === EVENT_TYPE.TRADE_CARAVAN);

  assert.ok(clearCaravan);
  assert.ok(stormCaravan);
  assert.ok(Number(clearCaravan.payload?.rewardMultiplier ?? 0) > Number(stormCaravan.payload?.rewardMultiplier ?? 0));
  assert.ok(Number(stormCaravan.payload?.hazardOverlapTiles ?? 0) > 0);
});
