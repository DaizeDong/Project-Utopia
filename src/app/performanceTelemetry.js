const DEFAULT_LIMIT = 300;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pushSample(samples, value, limit = DEFAULT_LIMIT) {
  if (!Array.isArray(samples)) return;
  const n = finite(value, NaN);
  if (!Number.isFinite(n)) return;
  samples.push(n);
  if (samples.length > limit) samples.splice(0, samples.length - limit);
}

export function percentile(samples = [], p = 95) {
  if (!Array.isArray(samples) || samples.length === 0) return 0;
  const sorted = samples
    .map((value) => finite(value, NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const clamped = Math.max(0, Math.min(100, finite(p, 95)));
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((clamped / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function createPerformanceTelemetry() {
  return {
    frameSamplesMs: [],
    workFrameSamplesMs: [],
    simSamplesMs: [],
    simLastStepSamplesMs: [],
    uiSamplesMs: [],
    renderSamplesMs: [],
    sampleCount: 0,
    longFrameCount: 0,
    rawFrameMs: 0,
    frameP95Ms: 0,
    frameP99Ms: 0,
    workFrameP95Ms: 0,
    workFrameP99Ms: 0,
    simP95Ms: 0,
    simLastStepP95Ms: 0,
    uiP95Ms: 0,
    renderP95Ms: 0,
    targetScale: 1,
    actualScale: 1,
    entityCount: 0,
    capActive: false,
    capReason: "",
    effectiveMaxSteps: 0,
    bottleneck: "sampling",
    summary: "Performance: sampling.",
  };
}

export function ensurePerformanceTelemetry(metrics = {}) {
  if (!metrics.performance || typeof metrics.performance !== "object") {
    metrics.performance = createPerformanceTelemetry();
  }
  const perf = metrics.performance;
  perf.frameSamplesMs ??= [];
  perf.workFrameSamplesMs ??= [];
  perf.simSamplesMs ??= [];
  perf.simLastStepSamplesMs ??= [];
  perf.uiSamplesMs ??= [];
  perf.renderSamplesMs ??= [];
  perf.sampleCount = finite(perf.sampleCount, 0);
  perf.longFrameCount = finite(perf.longFrameCount, 0);
  return perf;
}

export function inferPerformanceBottleneck(sample = {}) {
  if (sample.capActive) return "step cap";
  const simMs = finite(sample.simMs, 0);
  const uiMs = finite(sample.uiMs, 0);
  const renderMs = finite(sample.renderMs, 0);
  const frameP95Ms = finite(sample.frameP95Ms, 0);
  const actualScale = finite(sample.actualScale, 1);
  const targetScale = Math.max(0.1, finite(sample.targetScale, 1));
  const scaleLost = targetScale >= 4 && actualScale < targetScale * 0.85;
  if (simMs >= Math.max(uiMs, renderMs) && (simMs > 10 || scaleLost)) return "simulation";
  if (renderMs >= Math.max(simMs, uiMs) && renderMs > 8) return "render";
  if (uiMs >= Math.max(simMs, renderMs) && uiMs > 6) return "ui";
  if (frameP95Ms > 45) return "frame pacing";
  return "balanced";
}

export function recordPerformanceSample(metrics = {}, sample = {}) {
  const perf = ensurePerformanceTelemetry(metrics);
  const limit = Math.max(60, Math.min(900, finite(sample.limit, DEFAULT_LIMIT)));
  const rawFrameMs = finite(sample.rawFrameMs, 0);
  const simMs = finite(sample.simMs, 0);
  const simLastStepMs = finite(sample.simLastStepMs, simMs);
  const workFrameMs = finite(sample.workFrameMs, rawFrameMs);
  const uiMs = finite(sample.uiMs, 0);
  const renderMs = finite(sample.renderMs, 0);

  pushSample(perf.frameSamplesMs, rawFrameMs, limit);
  pushSample(perf.workFrameSamplesMs, workFrameMs, limit);
  pushSample(perf.simSamplesMs, simMs, limit);
  pushSample(perf.simLastStepSamplesMs, simLastStepMs, limit);
  pushSample(perf.uiSamplesMs, uiMs, limit);
  pushSample(perf.renderSamplesMs, renderMs, limit);

  perf.sampleCount += 1;
  if (rawFrameMs > 50) perf.longFrameCount += 1;
  perf.rawFrameMs = rawFrameMs;
  perf.workFrameMs = workFrameMs;
  perf.frameP95Ms = percentile(perf.frameSamplesMs, 95);
  perf.frameP99Ms = percentile(perf.frameSamplesMs, 99);
  perf.workFrameP95Ms = percentile(perf.workFrameSamplesMs, 95);
  perf.workFrameP99Ms = percentile(perf.workFrameSamplesMs, 99);
  perf.simP95Ms = percentile(perf.simSamplesMs, 95);
  perf.simLastStepP95Ms = percentile(perf.simLastStepSamplesMs, 95);
  perf.uiP95Ms = percentile(perf.uiSamplesMs, 95);
  perf.renderP95Ms = percentile(perf.renderSamplesMs, 95);
  perf.targetScale = Math.max(0.1, finite(sample.targetScale, perf.targetScale ?? 1));
  perf.actualScale = finite(sample.actualScale, perf.actualScale ?? 1);
  perf.entityCount = Math.max(0, finite(sample.entityCount, perf.entityCount ?? 0));
  perf.capActive = Boolean(sample.capActive);
  perf.capReason = String(sample.capReason ?? "");
  perf.effectiveMaxSteps = Math.max(0, finite(sample.effectiveMaxSteps, perf.effectiveMaxSteps ?? 0));
  perf.bottleneck = inferPerformanceBottleneck({
    simMs,
    uiMs,
    renderMs,
    frameP95Ms: perf.workFrameP95Ms,
    targetScale: perf.targetScale,
    actualScale: perf.actualScale,
    capActive: perf.capActive,
  });
  perf.summary = `Performance: ${perf.entityCount} entities, fps ${(1000 / Math.max(1, rawFrameMs)).toFixed(1)}, work p95 ${perf.workFrameP95Ms.toFixed(1)}ms, raw p95 ${perf.frameP95Ms.toFixed(1)}ms, ${perf.bottleneck}${perf.capActive ? ` (${perf.capReason})` : ""}.`;
  return perf;
}
