import test from "node:test";
import assert from "node:assert/strict";

import { resolveWorkerAiLoadShedding } from "../src/simulation/npc/WorkerAISystem.js";

test("Worker AI LOD budgets by total entity pressure at 8x", () => {
  const lod = resolveWorkerAiLoadShedding({
    requestedScale: 8,
    activeWorkerCount: 700,
    totalEntityCount: 1002,
  });

  assert.equal(lod.workerStride, 3);
  assert.equal(lod.pathBudget, 192);
  assert.equal(lod.pressureCount, 1002);
});

test("Worker AI LOD remains full-rate for small colonies", () => {
  const lod = resolveWorkerAiLoadShedding({
    requestedScale: 4,
    activeWorkerCount: 120,
    totalEntityCount: 160,
  });

  assert.equal(lod.workerStride, 1);
  assert.equal(lod.pathBudget, Infinity);
});
