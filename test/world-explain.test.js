import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { EVENT_TYPE, WEATHER } from "../src/config/constants.js";
import { enqueueEvent } from "../src/world/events/WorldEventQueue.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { setWeather } from "../src/world/weather/WeatherSystem.js";
import { getEntityInsight, getEventInsight, getFrontierStatus, getTileInsight, getWeatherInsight } from "../src/ui/interpretation/WorldExplain.js";

test("world explain summarizes broken frontier opening state", () => {
  const state = createInitialGameState({ seed: 1337 });
  const frontier = getFrontierStatus(state);

  assert.equal(frontier.routesOnline, 0);
  assert.equal(frontier.depotsReady, 0);
  assert.match(frontier.summary, /Broken Frontier/i);
  assert.match(frontier.summary, /0\/1 routes online/i);
  assert.match(frontier.summary, /0\/1 depots reclaimed/i);
});

test("world explain summarizes spatial weather fronts and event targets", () => {
  const state = createInitialGameState({ seed: 1337 });
  const eventSystem = new WorldEventSystem();

  setWeather(state, WEATHER.STORM, 18, "test");
  enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, {}, 12, 1);
  eventSystem.update(1.1, state);

  const weather = getWeatherInsight(state);
  const events = getEventInsight(state);

  assert.equal(weather.hasHazards, true);
  assert.match(weather.summary, /storm/i);
  assert.match(weather.summary, /hazard tiles/i);
  assert.match(events, /bandit raid active/i);
  assert.match(events, /west lumber route|east ruined depot/i);
});

test("world explain marks frontier gap, weather front, and event impact on tiles", () => {
  const state = createInitialGameState({ seed: 1337 });
  const eventSystem = new WorldEventSystem();
  const gapTile = state.gameplay.scenario.routeLinks[0].gapTiles[0];

  setWeather(state, WEATHER.STORM, 18, "test");
  enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, {}, 12, 1);
  eventSystem.update(1.1, state);

  const gapInsights = getTileInsight(state, gapTile);
  const raid = state.events.active.find((event) => event.type === EVENT_TYPE.BANDIT_RAID);
  const impactInsights = getTileInsight(state, raid.payload.impactTile);

  assert.ok(gapInsights.some((line) => /blocks the west lumber route/i.test(line)));
  assert.ok(gapInsights.some((line) => /costs more to path through/i.test(line)));
  assert.ok(impactInsights.some((line) => /event:/i.test(line)));
});

test("world explain summarizes worker delivery pressure, hazard route, and rejected policy", () => {
  const state = createInitialGameState({ seed: 1337 });
  const worker = state.agents.find((entity) => entity.type === "WORKER");
  const gapTile = state.gameplay.scenario.routeLinks[0].gapTiles[0];

  worker.carry.food = 1.5;
  worker.carry.wood = 1.5;
  worker.targetTile = { ...gapTile };
  worker.debug.policyRejectedReason = "deliver requires carry>0 and warehouse>0";
  setWeather(state, WEATHER.STORM, 18, "test");

  const insights = getEntityInsight(state, worker);

  assert.ok(insights.some((line) => /carried resources/i.test(line)));
  assert.ok(insights.some((line) => /route touches/i.test(line)));
  assert.ok(insights.some((line) => /policy override was rejected/i.test(line)));
});

test("world explain summarizes herbivore migration steering", () => {
  const state = createInitialGameState({ seed: 1337 });
  const eventSystem = new WorldEventSystem();
  const herbivore = state.animals.find((animal) => animal.kind === "HERBIVORE");

  enqueueEvent(state, EVENT_TYPE.ANIMAL_MIGRATION, {}, 12, 1);
  eventSystem.update(1.1, state);

  const insights = getEntityInsight(state, herbivore);

  assert.ok(insights.some((line) => /migration order is steering/i.test(line)));
});
