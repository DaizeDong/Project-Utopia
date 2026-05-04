// R13 Plan-R13-wildlife-hunt (P1) — verify the three sub-issues.
// (a) wildlifeSpawnIntervalMult halves the post-spawn cooldown.
// (b) wildlifeSpeciesRoundRobin makes bear + raider_beast actually appear
//     instead of EntityFactory's 55%/30%/15% weighted random.
// (c) Worker hunt drops wildlifeHuntFoodReward food into carry/stockpile +
//     records a 'food/produced' flow.

import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";
import { ANIMAL_KIND, ANIMAL_SPECIES, ROLE } from "../src/config/constants.js";
import { createInitialGameState, createAnimal, createWorker } from "../src/entities/EntityFactory.js";
import { WildlifePopulationSystem } from "../src/simulation/ecology/WildlifePopulationSystem.js";
import { WorkerFSM } from "../src/simulation/npc/fsm/WorkerFSM.js";
import { STATE } from "../src/simulation/npc/fsm/WorkerStates.js";
import { createServices } from "../src/app/createServices.js";

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeServices(sequence = [0.5]) {
  let i = 0;
  return {
    rng: { next: () => sequence[Math.min(i++, sequence.length - 1)] },
  };
}

test("R13 wildlife-hunt: spawn interval mult shortens herbivore recovery cooldown", () => {
  const state = createInitialGameState({ templateId: "fortified_basin", seed: 1337 });
  const zone = state.gameplay.scenario.wildlifeZones?.[0];
  assert.ok(zone);
  state.animals = [];
  state.metrics.timeSec = 80;
  state.gameplay.wildlifeRuntime.zoneControl[zone.id] = {
    herbivoreLowSec: 60,
    predatorAbsentSec: 0,
    predatorPressureSec: 0,
    stableSec: 0,
    extinctionSec: 60,
    nextRecoveryAtSec: -Infinity,
    nextBreedAtSec: Infinity,
    nextPredatorRecoveryAtSec: Infinity,
  };
  new WildlifePopulationSystem().update(0.2, state, makeServices([0.25, 0.75]));
  const ctrl = state.gameplay.wildlifeRuntime.zoneControl[zone.id];
  // Default cooldown 75s × 0.5 mult = 37.5s; nextRecoveryAtSec = 80 + 37.5 = 117.5
  // (without mult it would be 155). Allow tolerance for tuning override.
  const expected = 80 + 75 * Number(BALANCE.wildlifeSpawnIntervalMult ?? 1);
  assert.ok(
    ctrl.nextRecoveryAtSec <= expected + 1,
    `expected nextRecoveryAtSec ≤ ${expected + 1}, got ${ctrl.nextRecoveryAtSec}`,
  );
});

test("R13 wildlife-hunt: species round-robin picks least-represented predator", () => {
  const state = createInitialGameState({ templateId: "fortified_basin", seed: 1337 });
  const zone = state.gameplay.scenario.wildlifeZones?.[0];
  assert.ok(zone);
  // Strip animals + pre-seed predator counts so wolf is the most populous.
  state.animals = [];
  state.metrics.ecology = {
    ...(state.metrics.ecology ?? {}),
    predatorsBySpecies: { wolf: 3, bear: 1, raider_beast: 0 },
  };
  state.metrics.timeSec = 200;
  state.gameplay.wildlifeRuntime.zoneControl[zone.id] = {
    herbivoreLowSec: 0,
    predatorAbsentSec: 120,
    predatorPressureSec: 0,
    stableSec: 0,
    extinctionSec: 0,
    nextRecoveryAtSec: Infinity,
    nextBreedAtSec: Infinity,
    nextPredatorRecoveryAtSec: -Infinity,
  };
  // Inject 2 herbivores so the predator-recovery branch passes its herbivore floor.
  for (let n = 0; n < 3; n += 1) {
    state.animals.push({
      id: `h${n}`, type: "ANIMAL", kind: ANIMAL_KIND.HERBIVORE, species: ANIMAL_SPECIES.DEER,
      x: 0, z: 0, alive: true, hunger: 0.8, memory: {},
    });
  }
  new WildlifePopulationSystem().update(0.2, state, makeServices([0.4, 0.5, 0.6]));
  const newPredator = state.animals.find((a) => a.kind === ANIMAL_KIND.PREDATOR);
  assert.ok(newPredator, "expected a predator spawn");
  // raider_beast had count 0 → should be the round-robin pick.
  assert.equal(newPredator.species, ANIMAL_SPECIES.RAIDER_BEAST);
});

test("R13 wildlife-hunt: worker kill drops food reward into carry + records flow", () => {
  const reward = Number(BALANCE.wildlifeHuntFoodReward ?? 0);
  assert.ok(reward > 0, "wildlifeHuntFoodReward must be > 0 for this test");

  const state = createInitialGameState({ seed: 4711, bareInitial: true });
  state.session.phase = "active";
  state.metrics.timeSec = 1;
  state.animals = [];
  state.agents = [];

  const worker = createWorker(0, 0, rng(3));
  worker.role = ROLE.GUARD;
  worker.alive = true;
  worker.hp = worker.maxHp;
  worker.hunger = 1;
  worker.rest = 1;
  worker.starvationSec = 0;
  worker.attackCooldownSec = 0;
  worker.carry = { food: 0, wood: 0, stone: 0, herbs: 0 };
  worker.fsm = { state: STATE.IDLE, enteredAtSec: 1, target: null, payload: undefined };
  state.agents.push(worker);

  // 1-HP wolf at distance 0.5 — well inside meleeReach (1.0) so the first
  // FIGHTING.tick does the kill.
  const wolf = createAnimal(0.5, 0, ANIMAL_KIND.PREDATOR, rng(5), ANIMAL_SPECIES.WOLF);
  wolf.alive = true;
  wolf.hp = 1;
  state.animals.push(wolf);

  const services = createServices(state.world.mapSeed);
  const fsm = new WorkerFSM();

  const baselineFood = Number(state.resources?.food ?? 0);
  const baselineProduced = Number(state._resourceFlowAccum?.food?.produced ?? 0);

  // Up to 3 dispatcher passes: IDLE → FIGHTING via COMBAT_PREEMPT, then the
  // melee swing in FIGHTING.tick downs the 1-HP wolf.
  for (let i = 0; i < 3 && wolf.alive !== false; i += 1) {
    fsm.tickWorker(worker, state, services, 1 / 30);
  }

  assert.equal(wolf.alive, false, "wolf should be dead after FIGHTING tick");
  assert.equal(wolf.deathReason, "killed-by-worker");

  const carryFood = Number(worker.carry?.food ?? 0);
  const stockpileFood = Number(state.resources?.food ?? 0);
  const gained = carryFood + Math.max(0, stockpileFood - baselineFood);
  assert.ok(gained >= reward, `expected ≥ ${reward} food gained, got carry=${carryFood} stockpile-delta=${stockpileFood - baselineFood}`);

  const produced = Number(state._resourceFlowAccum?.food?.produced ?? 0);
  assert.ok(produced - baselineProduced >= reward,
    `expected food.produced delta ≥ ${reward}, got ${produced - baselineProduced}`);
});
