import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BENCHMARK_CONFIG,
  sanitizeBenchmarkConfig,
  sanitizeControlSettings,
} from "../src/app/controlSanitizers.js";

test("sanitizeBenchmarkConfig falls back to default schedule when input is invalid", () => {
  const { config, corrections } = sanitizeBenchmarkConfig({
    schedule: "abc,def",
    stageDurationSec: 4,
    sampleStartSec: 1.2,
  }, DEFAULT_BENCHMARK_CONFIG);

  assert.deepEqual(config.schedule, DEFAULT_BENCHMARK_CONFIG.schedule);
  assert.ok(corrections.some((msg) => msg.includes("schedule")));
});

test("sanitizeBenchmarkConfig clamps sampleStartSec below stageDurationSec", () => {
  const { config, corrections } = sanitizeBenchmarkConfig({
    schedule: [0, 100, 200],
    stageDurationSec: 3,
    sampleStartSec: 8,
  }, DEFAULT_BENCHMARK_CONFIG);

  assert.equal(config.stageDurationSec, 3);
  assert.ok(config.sampleStartSec < 3);
  assert.ok(corrections.some((msg) => msg.includes("Sample start")));
});

test("sanitizeControlSettings normalizes zoom range, threshold and benchmark config", () => {
  const controls = {
    fixedStepSec: 1 / 1000,
    cameraMinZoom: 5,
    cameraMaxZoom: 1,
    renderModelDisableThreshold: 3,
    showTileIcons: 1,
    showUnitSprites: 0,
    benchmarkConfig: {
      schedule: [],
      stageDurationSec: 0,
      sampleStartSec: 999,
    },
  };

  const { corrections } = sanitizeControlSettings(controls);

  assert.ok(corrections.length > 0);
  assert.ok(controls.fixedStepSec >= 1 / 120);
  assert.ok(controls.cameraMaxZoom > controls.cameraMinZoom);
  assert.ok(controls.renderModelDisableThreshold >= 80);
  assert.equal(typeof controls.showTileIcons, "boolean");
  assert.equal(typeof controls.showUnitSprites, "boolean");
  assert.ok(Array.isArray(controls.benchmarkConfig.schedule));
  assert.ok(controls.benchmarkConfig.schedule.length > 0);
});
