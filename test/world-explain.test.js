import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { EVENT_TYPE, TILE, WEATHER } from "../src/config/constants.js";
import { enqueueEvent } from "../src/world/events/WorldEventQueue.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { setWeather } from "../src/world/weather/WeatherSystem.js";
import { getAiInsight, getCausalDigest, getEntityInsight, getEventInsight, getFrontierStatus, getTileInsight, getTrafficInsight, getWeatherInsight } from "../src/ui/interpretation/WorldExplain.js";

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
  assert.match(weather.summary, /fronts/i);
  assert.match(weather.summary, /hazard tiles/i);
  assert.match(weather.summary, /pressure/i);
  assert.match(events, /bandit raid active/i);
  assert.match(events, /west lumber route|east ruined depot/i);
  assert.match(events, /Spatial pressure:/i);
});

test("world explain marks frontier gap, weather front, and event impact on tiles", () => {
  const state = createInitialGameState({ seed: 1337 });
  const eventSystem = new WorldEventSystem();
  const gapTile = state.gameplay.scenario.routeLinks[0].gapTiles[0];

  setWeather(state, WEATHER.STORM, 18, "test");
  enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, {}, 12, 1);
  eventSystem.update(1.1, state);
  state.metrics.traffic = {
    version: 1,
    activeLaneCount: 1,
    hotspotCount: 1,
    peakLoad: 4.1,
    avgLoad: 2.4,
    peakPenalty: 1.7,
    loadByKey: { [`${gapTile.ix},${gapTile.iz}`]: 4.1 },
    penaltyByKey: { [`${gapTile.ix},${gapTile.iz}`]: 1.7 },
    hotspotTiles: [{ ix: gapTile.ix, iz: gapTile.iz, load: 4.1, penalty: 1.7 }],
    summary: "Traffic: 1 hotspots, avg load 2.4, peak load 4.1, peak path cost x1.70.",
  };

  const gapInsights = getTileInsight(state, gapTile);
  const raid = state.events.active.find((event) => event.type === EVENT_TYPE.BANDIT_RAID);
  const impactInsights = getTileInsight(state, raid.payload.impactTile);

  assert.ok(gapInsights.some((line) => /blocks the west lumber route/i.test(line)));
  assert.ok(gapInsights.some((line) => /path cost/i.test(line)));
  assert.ok(gapInsights.some((line) => /traffic:/i.test(line)));
  assert.ok(impactInsights.some((line) => /event:/i.test(line)));
});

test("world explain summarizes worker delivery pressure, hazard route, and rejected policy", () => {
  const state = createInitialGameState({ seed: 1337 });
  const worker = state.agents.find((entity) => entity.type === "WORKER");
  const gapTile = state.gameplay.scenario.routeLinks[0].gapTiles[0];
  const currentTile = { ix: gapTile.ix - 1, iz: gapTile.iz };

  worker.carry.food = 1.5;
  worker.carry.wood = 1.5;
  worker.targetTile = { ...gapTile };
  worker.path = [currentTile, gapTile];
  worker.pathIndex = 0;
  worker.debug.policyRejectedReason = "deliver requires carry>0 and warehouse>0";
  setWeather(state, WEATHER.STORM, 18, "test");
  state.metrics.traffic = {
    version: 1,
    activeLaneCount: 1,
    hotspotCount: 1,
    peakLoad: 3.8,
    avgLoad: 2.2,
    peakPenalty: 1.6,
    loadByKey: { [`${gapTile.ix},${gapTile.iz}`]: 3.8 },
    penaltyByKey: { [`${gapTile.ix},${gapTile.iz}`]: 1.6 },
    hotspotTiles: [{ ix: gapTile.ix, iz: gapTile.iz, load: 3.8, penalty: 1.6 }],
    summary: "Traffic: 1 hotspots, avg load 2.2, peak load 3.8, peak path cost x1.60.",
  };

  const insights = getEntityInsight(state, worker);

  assert.ok(insights.some((line) => /carried resources/i.test(line)));
  assert.ok(insights.some((line) => /route touches/i.test(line)));
  assert.ok(insights.some((line) => /crosses congestion/i.test(line)));
  assert.ok(insights.some((line) => /policy override was rejected/i.test(line)));
});

test("world explain summarizes traffic hotspot state", () => {
  const state = createInitialGameState({ seed: 1337 });
  state.metrics.traffic = {
    version: 2,
    activeLaneCount: 2,
    hotspotCount: 1,
    peakLoad: 4.4,
    avgLoad: 2.5,
    peakPenalty: 1.8,
    loadByKey: {},
    penaltyByKey: {},
    hotspotTiles: [],
    summary: "Traffic: 1 hotspots, avg load 2.5, peak load 4.4, peak path cost x1.80.",
  };

  const traffic = getTrafficInsight(state);

  assert.equal(traffic.hasHotspots, true);
  assert.match(traffic.summary, /Traffic: 1 hotspots/i);
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

test("world explain surfaces ecology pressure on tiles and animals", () => {
  const state = createInitialGameState({ seed: 1337 });
  const wildlifeZone = state.gameplay.scenario.wildlifeZones[0];
  const wildlifeTile = state.gameplay.scenario.anchors[wildlifeZone.anchor];
  const predator = state.animals.find((animal) => animal.kind === "PREDATOR");

  state.metrics.ecology = {
    activeGrazers: 1,
    pressuredFarms: 1,
    maxFarmPressure: 1.05,
    frontierPredators: 1,
    migrationHerds: 0,
    farmPressureByKey: { [`${wildlifeTile.ix},${wildlifeTile.iz}`]: 1.05 },
    hotspotFarms: [{ ix: wildlifeTile.ix, iz: wildlifeTile.iz, pressure: 1.05 }],
    herbivoresByZone: { [wildlifeZone.id]: 2 },
    predatorsByZone: { [wildlifeZone.id]: 1 },
    summary: "Ecology: one pressured farm near the frontier habitat",
  };
  state.grid.tiles[wildlifeTile.ix + wildlifeTile.iz * state.grid.width] = TILE.FARM;
  predator.memory.homeZoneLabel = wildlifeZone.label;
  predator.debug.lastPatrolLabel = "farm-pressure hotspot";

  const tileInsights = getTileInsight(state, wildlifeTile);
  const predatorInsights = getEntityInsight(state, predator);

  assert.ok(tileInsights.some((line) => /stripping this farm lane/i.test(line)));
  assert.ok(tileInsights.some((line) => /2 herbivores and 1 predators/i.test(line)));
  assert.ok(predatorInsights.some((line) => /patrolling/i.test(line)));
});

test("world explain builds a shared causal digest from frontier pressure and AI focus", () => {
  const state = createInitialGameState({ seed: 1337 });
  state.metrics.logistics = {
    isolatedWorksites: 1,
    overloadedWarehouses: 0,
    stretchedWorksites: 0,
    summary: "Logistics: 1 isolated worksite needs depot access.",
  };
  state.ai.lastEnvironmentDirective = {
    weather: WEATHER.RAIN,
    durationSec: 14,
    factionTension: 0.6,
    focus: "contested logistics lane",
    summary: "Maintain contested logistics lane for 14s without obscuring the map's main pressure.",
    steeringNotes: ["Keep route pressure spatial and readable."],
    eventSpawns: [],
  };
  state.ai.groupPolicies.set("workers", {
    expiresAtSec: 24,
    data: {
      groupId: "workers",
      ttlSec: 24,
      riskTolerance: 0.35,
      intentWeights: { deliver: 1.4, eat: 1.2, farm: 1.0 },
      targetPriorities: { warehouse: 1.5, depot: 1.2, safety: 1.1 },
      focus: "depot throughput",
      summary: "Keep workers fed, reconnect routes, and unload cargo before harvest loops stall.",
      steeringNotes: ["Protect delivery chains before raw output."],
    },
  });

  const aiInsight = getAiInsight(state);
  const digest = getCausalDigest(state);

  assert.match(aiInsight.summary, /env=contested logistics lane/i);
  assert.match(aiInsight.summary, /workers:depot throughput/i);
  assert.equal(digest.severity, "error");
  assert.match(digest.headline, /Reconnect 1 isolated worksite/i);
  assert.match(digest.action, /route repair should outrank more expansion/i);
  assert.ok(digest.evidence.some((line) => /Frontier:/i.test(line)));
  assert.ok(digest.evidence.some((line) => /AI: env=contested logistics lane/i.test(line)));
});
