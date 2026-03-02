const DEFAULT_BENCHMARK_CONFIG = Object.freeze({
  schedule: [0, 100, 200, 300, 400, 500],
  stageDurationSec: 4,
  sampleStartSec: 1.2,
});

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
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

  const benchmarkResult = sanitizeBenchmarkConfig(
    controls.benchmarkConfig,
    DEFAULT_BENCHMARK_CONFIG,
  );
  controls.benchmarkConfig = benchmarkResult.config;
  corrections.push(...benchmarkResult.corrections);

  return { corrections };
}

export { DEFAULT_BENCHMARK_CONFIG };
