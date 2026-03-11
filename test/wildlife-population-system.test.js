import test from "node:test";
import assert from "node:assert/strict";

import { ANIMAL_KIND } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { WildlifePopulationSystem } from "../src/simulation/ecology/WildlifePopulationSystem.js";
import { tileToWorld } from "../src/world/grid/Grid.js";

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
  };
}

test("wildlife population system recovers herbivores after extinction risk", () => {
  const state = createInitialGameState({ templateId: "fortified_basin", seed: 1337 });
  const zone = state.gameplay.scenario.wildlifeZones?.[0];
  assert.ok(zone, "expected wildlife zone");
  state.animals = [];
  state.metrics.timeSec = 80;
  state.gameplay.wildlifeRuntime.zoneControl[zone.id] = {
    herbivoreLowSec: 45,
    predatorAbsentSec: 0,
    predatorPressureSec: 0,
    stableSec: 0,
    extinctionSec: 45,
    nextRecoveryAtSec: -Infinity,
    nextBreedAtSec: Infinity,
    nextPredatorRecoveryAtSec: Infinity,
  };

  const system = new WildlifePopulationSystem();
  system.update(0.2, state, makeServices([0.25, 0.75]));

  assert.equal(state.animals.filter((animal) => animal.kind === ANIMAL_KIND.HERBIVORE).length, 2);
  assert.equal(Number(state.metrics.ecology.events?.recoverySpawns ?? 0), 2);
  assert.equal(Number(state.metrics.ecology.zoneStats?.[0]?.herbivoreCount ?? 0), 2);
});

test("wildlife breeding respects max capacity and cooldown", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const zone = state.gameplay.scenario.wildlifeZones?.[0];
  assert.ok(zone, "expected wildlife zone");
  state.animals = state.animals.filter((animal) => animal.kind === ANIMAL_KIND.HERBIVORE);
  state.metrics.timeSec = 120;
  state.gameplay.wildlifeRuntime.zoneControl[zone.id] = {
    herbivoreLowSec: 0,
    predatorAbsentSec: 0,
    predatorPressureSec: 0,
    stableSec: 60,
    extinctionSec: 0,
    nextRecoveryAtSec: -Infinity,
    nextBreedAtSec: -Infinity,
    nextPredatorRecoveryAtSec: Infinity,
  };

  const system = new WildlifePopulationSystem();
  system.update(0.2, state, makeServices([0.3]));
  const afterFirst = state.animals.filter((animal) => animal.kind === ANIMAL_KIND.HERBIVORE).length;
  system.update(0.2, state, makeServices([0.3]));
  const afterSecond = state.animals.filter((animal) => animal.kind === ANIMAL_KIND.HERBIVORE).length;

  assert.equal(afterFirst, 6);
  assert.equal(afterSecond, 6);
  assert.equal(Number(state.metrics.ecology.events?.breedingSpawns ?? 0), 1);
});

test("wildlife breeding can rebuild a recovered herd from the stability floor", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const zone = state.gameplay.scenario.wildlifeZones?.[0];
  const anchor = state.gameplay.scenario.anchors?.[zone?.anchor];
  assert.ok(zone && anchor, "expected wildlife zone");
  state.animals = state.animals.filter((animal) => animal.kind === ANIMAL_KIND.HERBIVORE).slice(0, 2);
  state.animals.forEach((herbivore, index) => {
    const pos = tileToWorld(anchor.ix + index * 2, anchor.iz, state.grid);
    herbivore.x = pos.x;
    herbivore.z = pos.z;
    herbivore.hunger = 0.9;
    herbivore.memory.homeZoneId = zone.id;
    herbivore.memory.homeTile = { ix: anchor.ix + index * 2, iz: anchor.iz };
  });
  state.metrics.timeSec = 120;
  state.gameplay.wildlifeRuntime.zoneControl[zone.id] = {
    herbivoreLowSec: 0,
    predatorAbsentSec: 60,
    predatorPressureSec: 0,
    stableSec: 60,
    extinctionSec: 0,
    nextRecoveryAtSec: -Infinity,
    nextBreedAtSec: -Infinity,
    nextPredatorRecoveryAtSec: Infinity,
  };

  const system = new WildlifePopulationSystem();
  system.update(0.2, state, makeServices([0.3]));

  assert.equal(state.animals.filter((animal) => animal.kind === ANIMAL_KIND.HERBIVORE).length, 3);
  assert.equal(Number(state.metrics.ecology.events?.breedingSpawns ?? 0), 1);
});

test("wildlife controller suppresses predator recovery when prey floor is too low", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const zone = state.gameplay.scenario.wildlifeZones?.[0];
  const anchor = state.gameplay.scenario.anchors?.[zone.anchor];
  assert.ok(zone && anchor, "expected wildlife zone anchor");
  state.animals = state.animals.filter((animal) => animal.kind === ANIMAL_KIND.HERBIVORE).slice(0, 1);
  const herbivore = state.animals[0];
  const pos = tileToWorld(anchor.ix, anchor.iz, state.grid);
  herbivore.x = pos.x;
  herbivore.z = pos.z;
  herbivore.memory.homeZoneId = zone.id;
  herbivore.memory.homeTile = { ix: anchor.ix, iz: anchor.iz };
  state.metrics.timeSec = 140;
  state.gameplay.wildlifeRuntime.zoneControl[zone.id] = {
    herbivoreLowSec: 0,
    predatorAbsentSec: 90,
    predatorPressureSec: 0,
    stableSec: 60,
    extinctionSec: 0,
    nextRecoveryAtSec: -Infinity,
    nextBreedAtSec: Infinity,
    nextPredatorRecoveryAtSec: -Infinity,
  };

  const system = new WildlifePopulationSystem();
  system.update(0.2, state, makeServices([0.4]));

  assert.equal(state.animals.filter((animal) => animal.kind === ANIMAL_KIND.PREDATOR).length, 0);
  assert.equal(Number(state.metrics.ecology.events?.predatorRecoverySpawns ?? 0), 0);
});

test("wildlife controller retires predators after a no-prey hold", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const zone = state.gameplay.scenario.wildlifeZones?.[0];
  const predator = state.animals.find((animal) => animal.kind === ANIMAL_KIND.PREDATOR);
  assert.ok(zone && predator, "expected wildlife zone and predator");
  state.animals = [predator];
  state.metrics.timeSec = 120;
  state.gameplay.wildlifeRuntime.zoneControl[zone.id] = {
    herbivoreLowSec: 45,
    predatorAbsentSec: 0,
    predatorPressureSec: 18,
    stableSec: 0,
    extinctionSec: 45,
    nextRecoveryAtSec: Infinity,
    nextBreedAtSec: Infinity,
    nextPredatorRecoveryAtSec: Infinity,
  };

  const system = new WildlifePopulationSystem();
  system.update(0.2, state, makeServices([0.5]));

  assert.equal(state.animals.filter((animal) => animal.kind === ANIMAL_KIND.PREDATOR).length, 0);
  assert.equal(Number(state.metrics.ecology.events?.predatorRetreats ?? 0), 1);
});

test("wildlife controller reports clumping metrics for stacked herbivores", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const herbivores = state.animals.filter((animal) => animal.kind === ANIMAL_KIND.HERBIVORE);
  const shared = { x: herbivores[0].x, z: herbivores[0].z };
  for (const herbivore of herbivores) {
    herbivore.x = shared.x;
    herbivore.z = shared.z;
    herbivore.blackboard.intent = "graze";
  }

  const system = new WildlifePopulationSystem();
  system.update(0.2, state, makeServices([0.5]));

  assert.equal(Number(state.metrics.ecology.clusters?.maxSameSpeciesClusterSize ?? 0) >= herbivores.length, true);
  assert.equal(Number(state.metrics.ecology.clusters?.byGroup?.herbivores?.ratio ?? 0) >= 0.7, true);
  assert.equal(Boolean(state.metrics.ecology.flags?.clumpingRisk), true);
});
