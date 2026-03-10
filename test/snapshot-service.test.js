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
  state.weather.hazardTiles = [{ ix: 4, iz: 5 }];
  state.weather.hazardPenaltyByKey = { "4,5": 1.72 };
  state.weather.hazardFronts = [{ label: "east ruined depot", kind: "depot", tileCount: 5, contestedTiles: 1, peakPenalty: 1.72 }];
  state.weather.hazardFocusSummary = "east ruined depot";
  state.weather.pressureScore = 0.72;
  state.metrics.spatialPressure = {
    weatherPressure: 0.72,
    eventPressure: 1.18,
    contestedZones: 1,
    contestedTiles: 3,
    activeEventCount: 1,
    peakEventSeverity: 1.18,
    summary: "Spatial pressure: weather 0.72 across 1 fronts; events 1.18 across 1 active zones; contested zones 1.",
  };
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
  assert.equal(restored.weather.hazardTileSet instanceof Set, true);
  assert.equal(restored.weather.hazardTileSet.has("4,5"), true);
  assert.equal(restored.weather.hazardFronts.length, 1);
  assert.equal(restored.metrics.spatialPressure.contestedTiles, 3);
  assert.equal(restored.metrics.spatialPressure.peakEventSeverity, 1.18);
  assert.equal(restored.meta.rng.calls, 3);
  assert.deepEqual(restored.meta.view, { targetX: 14, targetZ: -9, zoom: 1.55 });
});
