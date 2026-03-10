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

test("snapshot roundtrip preserves maps and sets across repeated serialize/restore cycles", () => {
  let state = createInitialGameState({ templateId: "archipelago_isles", seed: 1337 });
  state.session.phase = "active";
  state.ai.groupPolicies.set("workers", {
    expiresAtSec: 24,
    data: {
      groupId: "workers",
      ttlSec: 24,
      focus: "depot throughput",
      summary: "Keep workers fed, reconnect routes, and unload cargo before harvest loops stall.",
    },
  });
  state.ai.groupStateTargets.set("workers", {
    groupId: "workers",
    targetState: "seek_task",
    priority: 0.45,
    ttlSec: 15,
  });
  state.weather.hazardTiles = [{ ix: 12, iz: 18 }, { ix: 13, iz: 18 }];
  state.weather.hazardPenaltyByKey = { "12,18": 1.4, "13,18": 1.6 };
  state.weather.hazardLabelByKey = { "12,18": ["storm front"], "13,18": ["storm front"] };
  state.weather.hazardFronts = [{ label: "central relay depot", kind: "depot", tileCount: 2, contestedTiles: 1, peakPenalty: 1.6 }];
  state.metrics.ecology = {
    activeGrazers: 1,
    pressuredFarms: 1,
    maxFarmPressure: 0.84,
    frontierPredators: 1,
    migrationHerds: 1,
    farmPressureByKey: { "12,18": 0.84 },
    hotspotFarms: [{ ix: 12, iz: 18, pressure: 0.84 }],
    herbivoresByZone: { "north-islet": 2 },
    predatorsByZone: { "north-islet": 1 },
    summary: "Ecology: pressured farms 1, top farm pressure 0.84, frontier predators 1, migration herds 1.",
  };

  for (let i = 0; i < 3; i += 1) {
    state = restoreSnapshotState(makeSerializableSnapshot(state, { initialSeed: 1, state: 2 + i, calls: 3 + i }));
  }

  assert.equal(state.ai.groupPolicies instanceof Map, true);
  assert.equal(state.ai.groupStateTargets instanceof Map, true);
  assert.equal(state.ai.groupPolicies.get("workers")?.data?.focus, "depot throughput");
  assert.equal(state.ai.groupStateTargets.get("workers")?.targetState, "seek_task");
  assert.equal(state.weather.hazardTileSet instanceof Set, true);
  assert.equal(state.weather.hazardTileSet.has("12,18"), true);
  assert.equal(state.weather.hazardFronts[0]?.label, "central relay depot");
  assert.equal(state.metrics.ecology.hotspotFarms[0]?.pressure, 0.84);
});
