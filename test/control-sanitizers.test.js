import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BENCHMARK_CONFIG,
  DEFAULT_DISPLAY_SETTINGS,
  sanitizeBenchmarkConfig,
  sanitizeControlSettings,
  sanitizeDisplaySettings,
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
    display: {
      preset: "overdrive",
      resolutionScale: 99,
      uiScale: 0.1,
      renderMode: "hologram",
      shadowQuality: "cinematic",
    },
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
  assert.equal(controls.display.preset, DEFAULT_DISPLAY_SETTINGS.preset);
  assert.equal(controls.display.renderMode, DEFAULT_DISPLAY_SETTINGS.renderMode);
  assert.ok(controls.display.resolutionScale <= 1.75);
  assert.ok(controls.display.uiScale >= 0.8);
  assert.ok(Array.isArray(controls.benchmarkConfig.schedule));
  assert.ok(controls.benchmarkConfig.schedule.length > 0);
});

test("sanitizeDisplaySettings clamps graphics controls and preserves booleans", () => {
  const { settings, corrections } = sanitizeDisplaySettings({
    preset: "quality",
    resolutionScale: 0.2,
    uiScale: 3,
    renderMode: "2d",
    antialias: "off",
    shadowQuality: "high",
    textureQuality: "ultra",
    powerPreference: "low-power",
    effectsEnabled: false,
    weatherParticles: false,
    fogEnabled: false,
    heatLabels: true,
    entityAnimations: false,
  });

  assert.ok(corrections.length >= 2);
  assert.equal(settings.preset, "quality");
  assert.equal(settings.resolutionScale, 0.5);
  assert.equal(settings.uiScale, 1.4);
  assert.equal(settings.renderMode, "2d");
  assert.equal(settings.antialias, "off");
  assert.equal(settings.shadowQuality, "high");
  assert.equal(settings.textureQuality, "ultra");
  assert.equal(settings.powerPreference, "low-power");
  assert.equal(settings.effectsEnabled, false);
  assert.equal(settings.weatherParticles, false);
  assert.equal(settings.fogEnabled, false);
  assert.equal(settings.heatLabels, true);
  assert.equal(settings.entityAnimations, false);
});
