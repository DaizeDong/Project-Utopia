import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { BALANCE } from "../src/config/balance.js";

// M3a: Carry fatigue — a loaded worker should lose `rest` faster than an empty one.
test("loaded worker decays rest faster than empty worker over 10s", () => {
  const stateA = createInitialGameState({ seed: 1337 });
  const stateB = createInitialGameState({ seed: 1337 });
  const servicesA = createServices(stateA.world.mapSeed);
  const servicesB = createServices(stateB.world.mapSeed);
  const systemA = new WorkerAISystem();
  const systemB = new WorkerAISystem();

  const loaded = stateA.agents.find((a) => a.type === "WORKER");
  const empty = stateB.agents.find((a) => a.type === "WORKER");
  assert.ok(loaded && empty, "both worlds should have a worker");

  // Neutralize night effects so only the carry fatigue multiplier differs.
  stateA.environment = { isNight: false };
  stateB.environment = { isNight: false };

  loaded.rest = 1.0;
  empty.rest = 1.0;
  loaded.carry = { food: 2, wood: 1, stone: 0, herbs: 1 };
  empty.carry = { food: 0, wood: 0, stone: 0, herbs: 0 };

  // Step each world for ~10 seconds of sim time at fixed dt.
  const dt = 0.1;
  const steps = 100;
  for (let i = 0; i < steps; i += 1) {
    stateA.metrics.tick = (stateA.metrics.tick ?? 0) + 1;
    stateB.metrics.tick = (stateB.metrics.tick ?? 0) + 1;
    systemA.update(dt, stateA, servicesA);
    systemB.update(dt, stateB, servicesB);
  }

  const restLoaded = Number(loaded.rest);
  const restEmpty = Number(empty.rest);
  assert.ok(
    restLoaded < restEmpty - 0.005,
    `loaded rest (${restLoaded.toFixed(4)}) should be notably less than empty rest (${restEmpty.toFixed(4)})`,
  );

  // Expected ratio check: the loaded decay should be ~multiplier x empty decay.
  const lossLoaded = 1 - restLoaded;
  const lossEmpty = Math.max(1e-6, 1 - restEmpty);
  const ratio = lossLoaded / lossEmpty;
  assert.ok(
    ratio > 1.3 && ratio < BALANCE.carryFatigueLoadedMultiplier + 0.3,
    `loaded/empty decay ratio ${ratio.toFixed(2)} should reflect fatigue multiplier ${BALANCE.carryFatigueLoadedMultiplier}`,
  );
});
