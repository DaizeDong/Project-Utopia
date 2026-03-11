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
  state.metrics.logistics.summary = "Logistics: carriers 7, avg depot dist 4.2";
  state.metrics.ecology.summary = "Ecology: pressured farms 1, frontier predators 1.";
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
  assert.equal(telemetry.warnings.errorCount, 1);
  assert.equal(telemetry.ai.coverageTarget, "llm");
  assert.equal(telemetry.ai.requestCount, 4);
  assert.equal(telemetry.ai.timeoutCount, 1);
  assert.equal(telemetry.performance.entityCount > 0, true);
  assert.equal(Array.isArray(telemetry.nonFiniteMetrics), true);
  assert.equal(telemetry.nonFiniteMetrics.length, 0);
});
