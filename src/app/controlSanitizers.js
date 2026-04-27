const DEFAULT_BENCHMARK_CONFIG = Object.freeze({
  schedule: [0, 100, 200, 300, 400, 500],
  stageDurationSec: 4,
  sampleStartSec: 1.2,
});

const DEFAULT_DISPLAY_SETTINGS = Object.freeze({
  preset: "balanced",
  resolutionScale: 1,
  uiScale: 1,
  renderMode: "auto",
  antialias: "auto",
  shadowQuality: "auto",
  textureQuality: "high",
  powerPreference: "high-performance",
  effectsEnabled: true,
  weatherParticles: true,
  fogEnabled: true,
  heatLabels: true,
  entityAnimations: true,
});

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function parseScheduleArray(rawSchedule) {
  if (!Array.isArray(rawSchedule)) return [];
  return rawSchedule
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.max(0, Math.round(n)));
}

function parseScheduleString(rawSchedule) {
  if (typeof rawSchedule !== "string") return [];
  const parts = rawSchedule
    .split(/[,\s]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
  return parts
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.max(0, Math.round(n)));
}

export function benchmarkScheduleToString(schedule = []) {
  return schedule.join(",");
}

export function sanitizeBenchmarkConfig(rawConfig = {}, fallback = DEFAULT_BENCHMARK_CONFIG) {
  const corrections = [];
  let schedule = [];

  if (Array.isArray(rawConfig.schedule)) {
    schedule = parseScheduleArray(rawConfig.schedule);
  } else if (typeof rawConfig.schedule === "string") {
    schedule = parseScheduleString(rawConfig.schedule);
  }

  if (schedule.length === 0) {
    schedule = [...fallback.schedule];
    corrections.push("Benchmark schedule was empty/invalid and has been reset to defaults.");
  }

  const stageDurationSec = clampNumber(rawConfig.stageDurationSec, 1, 30, fallback.stageDurationSec);
  if (Number(rawConfig.stageDurationSec) !== stageDurationSec) {
    corrections.push(`Stage duration clamped to ${stageDurationSec.toFixed(1)}s.`);
  }

  const sampleStartRaw = clampNumber(rawConfig.sampleStartSec, 0, 30, fallback.sampleStartSec);
  const maxSampleStart = Math.max(0, stageDurationSec - 0.1);
  const sampleStartSec = Math.min(sampleStartRaw, maxSampleStart);
  if (sampleStartSec !== sampleStartRaw) {
    corrections.push(`Sample start adjusted to ${sampleStartSec.toFixed(2)}s to stay below stage duration.`);
  }

  return {
    config: {
      schedule,
      stageDurationSec,
      sampleStartSec,
    },
    corrections,
  };
}

export function sanitizeDisplaySettings(rawSettings = {}, fallback = DEFAULT_DISPLAY_SETTINGS) {
  const corrections = [];
  const input = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  const settings = {
    preset: sanitizeEnum(input.preset, ["performance", "balanced", "quality", "ultra", "custom"], fallback.preset),
    resolutionScale: clampNumber(input.resolutionScale, 0.5, 1.75, fallback.resolutionScale),
    uiScale: clampNumber(input.uiScale, 0.8, 1.4, fallback.uiScale),
    renderMode: sanitizeEnum(input.renderMode, ["auto", "3d", "2d"], fallback.renderMode),
    antialias: sanitizeEnum(input.antialias, ["auto", "on", "off"], fallback.antialias),
    shadowQuality: sanitizeEnum(input.shadowQuality, ["auto", "off", "low", "medium", "high"], fallback.shadowQuality),
    textureQuality: sanitizeEnum(input.textureQuality, ["low", "medium", "high", "ultra"], fallback.textureQuality),
    powerPreference: sanitizeEnum(input.powerPreference, ["high-performance", "default", "low-power"], fallback.powerPreference),
    effectsEnabled: typeof input.effectsEnabled === "boolean" ? input.effectsEnabled : fallback.effectsEnabled,
    weatherParticles: typeof input.weatherParticles === "boolean" ? input.weatherParticles : fallback.weatherParticles,
    fogEnabled: typeof input.fogEnabled === "boolean" ? input.fogEnabled : fallback.fogEnabled,
    heatLabels: typeof input.heatLabels === "boolean" ? input.heatLabels : fallback.heatLabels,
    entityAnimations: typeof input.entityAnimations === "boolean" ? input.entityAnimations : fallback.entityAnimations,
  };

  if (settings.preset !== input.preset) corrections.push("Display preset reset to balanced.");
  if (settings.resolutionScale !== input.resolutionScale) {
    corrections.push(`Resolution scale clamped to ${Math.round(settings.resolutionScale * 100)}%.`);
  }
  if (settings.uiScale !== input.uiScale) {
    corrections.push(`UI scale clamped to ${Math.round(settings.uiScale * 100)}%.`);
  }
  if (settings.renderMode !== input.renderMode) corrections.push("Render mode reset to Auto.");
  if (settings.antialias !== input.antialias) corrections.push("Anti-aliasing preference reset to Auto.");
  if (settings.shadowQuality !== input.shadowQuality) corrections.push("Shadow quality reset to Auto.");
  if (settings.textureQuality !== input.textureQuality) corrections.push("Texture quality reset to High.");
  if (settings.powerPreference !== input.powerPreference) corrections.push("GPU power preference reset to High Performance.");

  return { settings, corrections };
}

export function sanitizeControlSettings(controls) {
  const corrections = [];
  if (!controls || typeof controls !== "object") {
    return { corrections };
  }

  const fixedStepSec = clampNumber(controls.fixedStepSec, 1 / 120, 1 / 5, 1 / 30);
  if (fixedStepSec !== controls.fixedStepSec) {
    corrections.push(`Simulation tick fixed step adjusted to ${(1 / fixedStepSec).toFixed(1)} Hz.`);
  }
  controls.fixedStepSec = fixedStepSec;

  const minZoomRaw = clampNumber(controls.cameraMinZoom, 0.3, 5, 0.55);
  const maxZoomRaw = clampNumber(controls.cameraMaxZoom, 0.4, 6, 3.2);
  let minZoom = minZoomRaw;
  let maxZoom = maxZoomRaw;
  if (maxZoom <= minZoom + 0.1) {
    maxZoom = Math.min(6, minZoom + 0.1);
    if (maxZoom <= minZoom) minZoom = Math.max(0.3, maxZoom - 0.1);
    corrections.push("Camera zoom range corrected to keep minZoom < maxZoom.");
  }
  controls.cameraMinZoom = minZoom;
  controls.cameraMaxZoom = maxZoom;

  const threshold = Math.max(80, Math.min(2000, Math.round(Number(controls.renderModelDisableThreshold) || 260)));
  if (threshold !== controls.renderModelDisableThreshold) {
    corrections.push(`Render detail threshold adjusted to ${threshold}.`);
  }
  controls.renderModelDisableThreshold = threshold;

  controls.showTileIcons = Boolean(controls.showTileIcons);
  controls.showUnitSprites = Boolean(controls.showUnitSprites);

  const displayResult = sanitizeDisplaySettings(controls.display, DEFAULT_DISPLAY_SETTINGS);
  controls.display = displayResult.settings;
  corrections.push(...displayResult.corrections);

  const benchmarkResult = sanitizeBenchmarkConfig(
    controls.benchmarkConfig,
    DEFAULT_BENCHMARK_CONFIG,
  );
  controls.benchmarkConfig = benchmarkResult.config;
  corrections.push(...benchmarkResult.corrections);

  return { corrections };
}

export { DEFAULT_BENCHMARK_CONFIG, DEFAULT_DISPLAY_SETTINGS };
