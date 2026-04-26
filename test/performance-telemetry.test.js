import test from "node:test";
import assert from "node:assert/strict";

import {
  inferPerformanceBottleneck,
  percentile,
  recordPerformanceSample,
} from "../src/app/performanceTelemetry.js";

test("percentile uses sorted rolling samples", () => {
  assert.equal(percentile([50, 10, 20, 40, 30], 95), 50);
  assert.equal(percentile([50, 10, 20, 40, 30], 50), 30);
});

test("recordPerformanceSample stores p95/p99 and cap summary", () => {
  const metrics = {};
  for (const ms of [16, 17, 18, 45, 80]) {
    recordPerformanceSample(metrics, {
      rawFrameMs: ms,
      workFrameMs: Math.min(ms, 25),
      simMs: 12,
      simLastStepMs: 4,
      uiMs: 2,
      renderMs: 5,
      targetScale: 8,
      actualScale: 5,
      entityCount: 900,
      capActive: ms === 80,
      capReason: ms === 80 ? "frame-pressure step cap 6/12" : "",
      effectiveMaxSteps: 6,
    });
  }

  assert.equal(metrics.performance.frameP95Ms, 80);
  assert.equal(metrics.performance.frameP99Ms, 80);
  assert.equal(metrics.performance.workFrameP95Ms, 25);
  assert.equal(metrics.performance.simP95Ms, 12);
  assert.equal(metrics.performance.simLastStepP95Ms, 4);
  assert.equal(metrics.performance.capActive, true);
  assert.equal(metrics.performance.bottleneck, "step cap");
  assert.match(metrics.performance.summary, /900 entities/);
  assert.match(metrics.performance.summary, /work p95 25\.0ms/);
});

test("inferPerformanceBottleneck distinguishes sim/render/ui paths", () => {
  assert.equal(inferPerformanceBottleneck({ simMs: 18, uiMs: 3, renderMs: 5, targetScale: 8, actualScale: 4 }), "simulation");
  assert.equal(inferPerformanceBottleneck({ simMs: 4, uiMs: 3, renderMs: 12, targetScale: 1, actualScale: 1 }), "render");
  assert.equal(inferPerformanceBottleneck({ simMs: 3, uiMs: 9, renderMs: 4, targetScale: 1, actualScale: 1 }), "ui");
});
