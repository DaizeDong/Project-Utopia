import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";
import { ANIMAL_KIND, TILE } from "../src/config/constants.js";
import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { tileToWorld } from "../src/world/grid/Grid.js";
import { AnimalAISystem } from "../src/simulation/npc/AnimalAISystem.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";

function makeServices(sequence = [0.5]) {
  let index = 0;
  return {
    rng: {
      next: () => {
        const value = sequence[Math.min(index, sequence.length - 1)];
        index += 1;
        return value;
      },
    },
    pathCache: { get: () => null, set: () => {} },
  };
}

function findFirstTileOfType(state, targetType) {
  for (let iz = 0; iz < state.grid.height; iz += 1) {
    for (let ix = 0; ix < state.grid.width; ix += 1) {
      if (state.grid.tiles[ix + iz * state.grid.width] === targetType) return { ix, iz };
    }
  }
  return null;
}

function setTile(state, ix, iz, tileType) {
  state.grid.tiles[ix + iz * state.grid.width] = tileType;
}

test("animals spawn with authored wildlife habitats near scenario zones", () => {
  const templates = ["temperate_plains", "fortified_basin", "archipelago_isles"];
  for (const templateId of templates) {
    const state = createInitialGameState({ templateId, seed: 1337 });
    const wildlifeZone = state.gameplay.scenario.wildlifeZones?.[0];
    const wildlifeAnchor = state.gameplay.scenario.anchors?.[wildlifeZone.anchor];
    const herbivores = state.animals.filter((animal) => animal.kind === ANIMAL_KIND.HERBIVORE);

    assert.ok(wildlifeZone, `expected a wildlife zone for ${templateId}`);
    assert.ok(wildlifeAnchor, `expected wildlife anchor for ${templateId}`);
    assert.ok(herbivores.length > 0, `expected herbivores for ${templateId}`);
    assert.ok(herbivores.every((animal) => animal.memory?.homeZoneId === wildlifeZone.id), `expected habitat metadata on ${templateId}`);

    const maxSpawnDistance = Number(wildlifeZone.radius ?? 2) + Number(BALANCE.wildlifeSpawnRadiusBonus ?? 3) + 1;
    const nearbyHerbivore = herbivores.some((animal) => {
      const tile = animal.memory?.homeTile ?? null;
      return tile && Math.abs(tile.ix - wildlifeAnchor.ix) + Math.abs(tile.iz - wildlifeAnchor.iz) <= maxSpawnDistance;
    });
    assert.ok(nearbyHerbivore, `expected at least one herbivore to spawn near the authored wildlife habitat in ${templateId}`);
  }
});

test("herbivore grazing pressure reduces worker harvest yield", () => {
  const pressuredState = createInitialGameState({ seed: 1337 });
  const cleanState = createInitialGameState({ seed: 1337 });
  const farmTile = findFirstTileOfType(pressuredState, TILE.FARM);
  assert.ok(farmTile, "expected at least one farm tile");

  const herbivore = pressuredState.animals.find((animal) => animal.kind === ANIMAL_KIND.HERBIVORE);
  assert.ok(herbivore, "expected a herbivore");
  pressuredState.animals = [herbivore];
  pressuredState.agents = [];
  const herdPos = tileToWorld(farmTile.ix, farmTile.iz, pressuredState.grid);
  herbivore.x = herdPos.x;
  herbivore.z = herdPos.z;
  herbivore.hunger = 0.2;
  herbivore.targetTile = { ...farmTile };
  herbivore.path = [];
  herbivore.pathIndex = 0;
  herbivore.pathGridVersion = pressuredState.grid.version;
  herbivore.blackboard = {
    fsm: {
      state: "graze",
      previousState: "wander",
      changedAtSec: 0,
      reason: "test",
      history: [],
      path: [],
    },
  };
  pressuredState.metrics.timeSec = 12;

  const animalSystem = new AnimalAISystem();
  animalSystem.update(0.6, pressuredState, makeServices([0.5]));
  pressuredState.metrics.timeSec += 0.6;
  animalSystem.update(0.6, pressuredState, makeServices([0.5]));

  const farmKey = `${farmTile.ix},${farmTile.iz}`;
  const farmPressure = Number(pressuredState.metrics.ecology?.farmPressureByKey?.[farmKey] ?? 0);
  assert.ok(farmPressure > 0.2, "expected herbivore grazing to create measurable farm pressure");

  const pressuredWorker = createWorker(herdPos.x, herdPos.z, () => 0.5);
  pressuredWorker.role = "FARM";
  pressuredWorker.hunger = 1;
  pressuredWorker.targetTile = { ...farmTile };
  pressuredWorker.path = [];
  pressuredWorker.pathIndex = 0;
  pressuredWorker.pathGridVersion = pressuredState.grid.version;
  pressuredWorker.cooldown = 0.05;
  pressuredWorker.blackboard = {
    fsm: {
      state: "harvest",
      previousState: "seek_task",
      changedAtSec: 0,
      reason: "test",
      history: [],
      path: [],
    },
  };
  // v0.10.0-d — Pin the FSM state directly so the dispatcher routes
  // through HARVESTING.tick on the first update() call (otherwise
  // bootstrap goes IDLE → SEEKING_HARVEST and applyHarvestStep doesn't
  // fire until tick #2). The legacy `blackboard.fsm.state` above is the
  // display-FSM history, not the dispatcher's source of truth.
  pressuredWorker.fsm = { state: "HARVESTING", enteredAtSec: 0, target: { ix: farmTile.ix, iz: farmTile.iz }, payload: undefined };
  pressuredState.agents = [pressuredWorker];
  pressuredState.animals = [];

  const cleanWorker = createWorker(herdPos.x, herdPos.z, () => 0.5);
  cleanWorker.role = "FARM";
  cleanWorker.hunger = 1;
  cleanWorker.targetTile = { ...farmTile };
  cleanWorker.path = [];
  cleanWorker.pathIndex = 0;
  cleanWorker.pathGridVersion = cleanState.grid.version;
  cleanWorker.cooldown = 0.05;
  cleanWorker.blackboard = {
    fsm: {
      state: "harvest",
      previousState: "seek_task",
      changedAtSec: 0,
      reason: "test",
      history: [],
      path: [],
    },
  };
  cleanWorker.fsm = { state: "HARVESTING", enteredAtSec: 0, target: { ix: farmTile.ix, iz: farmTile.iz }, payload: undefined };
  cleanState.agents = [cleanWorker];
  cleanState.animals = [];
  cleanState.metrics.ecology = {
    activeGrazers: 0,
    pressuredFarms: 0,
    maxFarmPressure: 0,
    frontierPredators: 0,
    migrationHerds: 0,
    farmPressureByKey: {},
    hotspotFarms: [],
    herbivoresByZone: {},
    predatorsByZone: {},
    summary: "Ecology: idle",
  };

  const workerSystem = new WorkerAISystem();
  workerSystem.update(0.2, cleanState, makeServices([0.5]));
  workerSystem.update(0.2, pressuredState, makeServices([0.5]));

  assert.ok(Number(pressuredWorker.debug?.lastFarmYieldMultiplier ?? 1) < Number(cleanWorker.debug?.lastFarmYieldMultiplier ?? 1));
  assert.ok(Number(pressuredWorker.carry.food ?? 0) < Number(cleanWorker.carry.food ?? 0));
});

test("predator patrols frontier farm pressure hotspots when prey is absent", () => {
  const state = createInitialGameState({ seed: 1337 });
  const predator = state.animals.find((animal) => animal.kind === ANIMAL_KIND.PREDATOR);
  assert.ok(predator, "expected a predator");

  const zone = state.gameplay.scenario.wildlifeZones?.[0];
  const anchor = state.gameplay.scenario.anchors?.[zone.anchor];
  assert.ok(zone && anchor, "expected a wildlife zone anchor");

  const hotspot = { ix: anchor.ix, iz: anchor.iz };
  setTile(state, hotspot.ix, hotspot.iz, TILE.FARM);
  state.grid.version += 1;
  state.metrics.ecology = {
    activeGrazers: 0,
    pressuredFarms: 1,
    maxFarmPressure: 1.1,
    frontierPredators: 0,
    migrationHerds: 0,
    farmPressureByKey: { [`${hotspot.ix},${hotspot.iz}`]: 1.1 },
    hotspotFarms: [{ ix: hotspot.ix, iz: hotspot.iz, pressure: 1.1 }],
    herbivoresByZone: { [zone.id]: 2 },
    predatorsByZone: {},
    summary: "Ecology: one hotspot farm",
  };
  state.animals = [predator];
  const predatorPos = tileToWorld(anchor.ix, anchor.iz + 2, state.grid);
  predator.x = predatorPos.x;
  predator.z = predatorPos.z;
  predator.hunger = 0.45;
  predator.targetTile = null;
  predator.path = null;
  predator.pathIndex = 0;
  predator.pathGridVersion = -1;
  predator.blackboard = {
    fsm: {
      state: "roam",
      previousState: "stalk",
      changedAtSec: 0,
      reason: "test",
      history: [],
      path: [],
    },
  };
  state.metrics.timeSec = 18;

  const animalSystem = new AnimalAISystem();
  animalSystem.update(0.2, state, makeServices([0.3]));
  state.metrics.timeSec += 0.2;
  animalSystem.update(0.2, state, makeServices([0.3]));

  assert.equal(predator.targetTile?.ix, hotspot.ix);
  assert.equal(predator.targetTile?.iz, hotspot.iz);
  assert.match(String(predator.debug?.lastPatrolLabel ?? ""), /farm-pressure hotspot/i);
});

test("herbivores spread out when crowding persists", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const herbivores = state.animals.filter((animal) => animal.kind === ANIMAL_KIND.HERBIVORE).slice(0, 3);
  assert.equal(herbivores.length, 3);
  const sharedTile = herbivores[0].memory?.homeTile ?? herbivores[0].targetTile ?? { ix: 0, iz: 0 };
  const sharedPos = tileToWorld(sharedTile.ix, sharedTile.iz, state.grid);
  state.animals = herbivores;
  state.metrics.timeSec = 24;

  for (const herbivore of herbivores) {
    herbivore.x = sharedPos.x;
    herbivore.z = sharedPos.z;
    herbivore.debug.crowdingSec = 6;
    herbivore.path = null;
    herbivore.targetTile = null;
    herbivore.blackboard = {
      fsm: {
        state: "wander",
        previousState: "graze",
        changedAtSec: 0,
        reason: "test",
        history: [],
        path: [],
      },
      intent: "wander",
    };
  }

  const animalSystem = new AnimalAISystem();
  animalSystem.update(0.2, state, makeServices([0.6]));

  assert.equal(herbivores.some((animal) => String(animal.debug?.lastCrowdResponse ?? "") === "spread"), true);
  assert.equal(herbivores.some((animal) => animal.targetTile && (animal.targetTile.ix !== sharedTile.ix || animal.targetTile.iz !== sharedTile.iz)), true);
});
