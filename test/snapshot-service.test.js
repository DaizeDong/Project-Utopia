import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { makeSerializableSnapshot, restoreSnapshotState } from "../src/app/snapshotService.js";

test("snapshot serialization/restoration preserves core runtime state", () => {
  const state = createInitialGameState({ seed: 2026 });
  state.session.phase = "active";
  state.session.outcome = "none";
  state.session.reason = "";
  state.resources.food = 77;
  state.resources.wood = 55;
  state.controls.tool = "farm";
  state.ai.groupPolicies.set("workers", { expiresAtSec: 10, data: { groupId: "workers", ttlSec: 10 } });

  const serialized = makeSerializableSnapshot(state, { initialSeed: 1, state: 2, calls: 3 });
  serialized.meta.view = { targetX: 14, targetZ: -9, zoom: 1.55 };
  const restored = restoreSnapshotState(serialized);

  assert.equal(restored.resources.food, 77);
  assert.equal(restored.resources.wood, 55);
  assert.equal(restored.session.phase, "active");
  assert.equal(restored.controls.tool, "farm");
  assert.equal(restored.grid.tiles instanceof Uint8Array, true);
  assert.equal(restored.ai.groupPolicies instanceof Map, true);
  assert.equal(restored.ai.groupPolicies.has("workers"), true);
  assert.equal(restored.meta.rng.calls, 3);
  assert.deepEqual(restored.meta.view, { targetX: 14, targetZ: -9, zoom: 1.55 });
});
