import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { WEATHER } from "../src/config/constants.js";
import { setWeather } from "../src/world/weather/WeatherSystem.js";

test("setWeather generates localized scenario hazard tiles and bumps grid version", () => {
  const templates = ["temperate_plains", "fortified_basin", "archipelago_isles"];
  for (const templateId of templates) {
    const state = createInitialGameState({ templateId, seed: 1337 });
    const prevVersion = state.grid.version;

    setWeather(state, WEATHER.STORM, 18, "test");

    assert.equal(state.weather.current, WEATHER.STORM);
    assert.ok(Array.isArray(state.weather.hazardTiles));
    assert.ok(state.weather.hazardTiles.length > 0);
    assert.ok(state.weather.hazardTileSet instanceof Set);
    assert.ok(Number(state.weather.hazardPenaltyMultiplier) > 1);
    assert.ok(Array.isArray(state.weather.hazardFronts));
    assert.ok(state.weather.hazardFronts.length > 0);
    assert.equal(typeof state.weather.hazardFocusSummary, "string");
    assert.ok(Object.keys(state.weather.hazardPenaltyByKey ?? {}).length > 0);
    assert.ok(Number(state.weather.pressureScore ?? 0) > 0);
    assert.ok(state.grid.version > prevVersion);
  }
});
