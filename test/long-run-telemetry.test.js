import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { buildLongRunTelemetry } from "../src/app/longRunTelemetry.js";

test("buildLongRunTelemetry exposes the browser harness contract", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  state.session.phase = "active";
  state.metrics.timeSec = 42.5;
  state.metrics.tick = 1280;
  state.metrics.averageFps = 57.8;
  state.metrics.frameMs = 16.9;
  state.metrics.memoryMb = 182.4;
  state.gameplay.wildlifeRuntime.zoneControl["west-wilds"] = {
    herbivoreLowSec: 12,
    predatorAbsentSec: 24,
    predatorPressureSec: 0,
    stableSec: 60,
    extinctionSec: 0,
    nextRecoveryAtSec: 70,
    nextBreedAtSec: 140,
    nextPredatorRecoveryAtSec: 190,
  };
  state.metrics.logistics.summary = "Logistics: carriers 7, avg depot dist 4.2";
  state.metrics.ecology.summary = "Ecology: pressured farms 1, frontier predators 1.";
  state.metrics.ecology.zoneStats = [{
    id: "west-wilds",
    label: "west frontier wilds",
    herbivoreCount: 4,
    predatorCount: 1,
    herbivoreCapacity: { min: 3, target: 4, max: 6 },
    predatorCapacity: { min: 0, target: 1, max: 2 },
    recoveryCooldownSec: 12,
    breedingCooldownSec: 34,
    predatorRecoveryCooldownSec: 56,
    herbivoreLowSec: 0,
    predatorAbsentSec: 0,
    stableSec: 44,
    extinctionSec: 0,
    crowdScore: 0.25,
  }];
  state.metrics.ecology.events = {
    births: 3,
    breedingSpawns: 1,
    recoverySpawns: 2,
    predatorRecoverySpawns: 0,
    predatorRetreats: 1,
    predationDeaths: 1,
    starvationDeaths: 0,
  };
  state.metrics.ecology.clusters = {
    maxSameSpeciesClusterSize: 3,
    stuckClusterCount: 0,
    longestClusterDurationSec: 8,
    byGroup: {
      herbivores: { ratio: 0.5, maxClusterSize: 3, currentDurationSec: 8 },
    },
  };
  state.metrics.ecology.flags = {
    extinctionRisk: false,
    overgrowthRisk: false,
    clumpingRisk: false,
    predatorWithoutPrey: false,
  };
  state.metrics.warningLog.push({
    id: "warn_1",
    sec: 40,
    level: "error",
    source: "LongRunTest",
    message: "Example failure",
  });
  state.metrics.aiRuntime.requestCount = 4;
  state.metrics.aiRuntime.timeoutCount = 1;
  state.metrics.aiRuntime.fallbackResponseCount = 1;
  state.metrics.aiRuntime.avgLatencyMs = 322.2;
  state.metrics.aiRuntime.coverageTarget = "llm";
  state.ai.coverageTarget = "llm";
  state.ai.mode = "llm";
  state.ai.runtimeProfile = "long_run";
  state.ai.lastPolicyModel = "gpt-4.1-mini";
  state.ai.lastError = "";

  const telemetry = buildLongRunTelemetry(state, { targetX: 3, targetZ: -2, zoom: 1.33 });

  assert.equal(telemetry.phase, "active");
  assert.equal(telemetry.tick, 1280);
  assert.equal(telemetry.world.scenarioFamily, "frontier_repair");
  assert.equal(telemetry.objective.index, 0);
  assert.equal(telemetry.logistics.summary.includes("carriers"), true);
  assert.equal(telemetry.ecology.summary.includes("pressured farms"), true);
  assert.equal(telemetry.population.byGroup.herbivores > 0, true);
  assert.equal(Array.isArray(telemetry.ecology.zoneStats), true);
  assert.equal(telemetry.ecology.zoneStats[0]?.label, "west frontier wilds");
  assert.equal(Number(telemetry.ecology.events?.births ?? 0), 3);
  assert.equal(Number(telemetry.ecology.events?.predatorRetreats ?? 0), 1);
  assert.equal(telemetry.warnings.errorCount, 1);
  assert.equal(telemetry.ai.coverageTarget, "llm");
  assert.equal(telemetry.ai.requestCount, 4);
  assert.equal(telemetry.ai.timeoutCount, 1);
  assert.equal(telemetry.performance.entityCount > 0, true);
  assert.equal(Array.isArray(telemetry.nonFiniteMetrics), true);
  assert.equal(telemetry.nonFiniteMetrics.length, 0);
});
