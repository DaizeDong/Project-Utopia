import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";

test("WorkerAISystem mirrors friendship memories into durable history", () => {
  const state = createInitialGameState({ seed: 4108 });
  const workerA = createWorker(0, 0, () => 0.11);
  const workerB = createWorker(1, 0, () => 0.22);
  workerA.relationships[workerB.id] = 0.14;
  workerB.relationships[workerA.id] = 0.14;
  state.agents = [workerA, workerB];
  state.animals = [];
  state.metrics.timeSec = 15;
  state.metrics.tick = (workerA.id?.charCodeAt?.(7) ?? 0) % 300;

  new WorkerAISystem().update(1 / 30, state, {
    rng: { next: () => 0.5 },
    pathCache: { get: () => null, set: () => {} },
  });

  assert.match(workerA.memory?.recentEvents?.[0] ?? "", /Became Friend with/);
  assert.equal(workerA.memory?.history?.[0]?.type, "relationship");
  assert.match(workerA.memory?.history?.[0]?.label ?? "", /Became Friend with/);
  assert.doesNotThrow(() => JSON.stringify(workerA.memory.history));
});
