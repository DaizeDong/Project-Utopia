import test from "node:test";
import assert from "node:assert/strict";

import { WEATHER } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { deriveAtmosphereProfile } from "../src/render/AtmosphereProfile.js";
import { setWeather } from "../src/world/weather/WeatherSystem.js";

test("atmosphere profile reacts to scenario family and weather pressure", () => {
  const frontierState = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const islandState = createInitialGameState({ templateId: "coastal_ocean", seed: 1337 });

  const clearFrontier = deriveAtmosphereProfile(frontierState);
  const clearIsland = deriveAtmosphereProfile(islandState);

  setWeather(frontierState, WEATHER.STORM, 18, "test");
  frontierState.metrics.spatialPressure = {
    weatherPressure: 1.2,
    eventPressure: 1.5,
    contestedZones: 2,
    contestedTiles: 6,
    activeEventCount: 1,
    peakEventSeverity: 1.5,
    summary: "Spatial pressure: weather 1.2, events 1.5.",
  };
  const stormFrontier = deriveAtmosphereProfile(frontierState);

  assert.notEqual(clearFrontier.background, clearIsland.background);
  assert.notEqual(clearFrontier.background, stormFrontier.background);
  assert.ok(stormFrontier.sunIntensity < clearFrontier.sunIntensity);
  assert.ok(stormFrontier.fogFar < clearFrontier.fogFar);
  assert.ok(stormFrontier.markerStrength > clearFrontier.markerStrength);
});

test("atmosphere profile darkens end-state losses and brightens wins", () => {
  const state = createInitialGameState({ seed: 1337 });
  state.session.phase = "end";
  state.session.outcome = "loss";
  const loss = deriveAtmosphereProfile(state);

  state.session.outcome = "win";
  const win = deriveAtmosphereProfile(state);

  assert.ok(loss.exposure < win.exposure);
  assert.ok(loss.sunIntensity < win.sunIntensity);
});

