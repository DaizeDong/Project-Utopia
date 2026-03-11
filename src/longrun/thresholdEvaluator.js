import { LONG_RUN_PROFILE, createDefaultLongRunThresholdBaseline, getLongRunProfile } from "../config/longRunProfile.js";

function round(value, digits = 2) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return safe;
  return Number(safe.toFixed(digits));
}

function countValues(values, predicate) {
  let count = 0;
  for (const value of values) {
    if (predicate(value)) count += 1;
  }
  return count;
}

export function createLongRunEvaluationState() {
  return {
    currentTemplateId: "",
    lastScenarioStartWallSec: 0,
    lastProgressWallSec: 0,
    lastHealthyFpsWallSec: 0,
    threatPinnedSinceSec: null,
    noWarehouseAnchorSinceSec: null,
    firstRouteRepairAtSec: null,
    firstWeatherEventOverlapAtSec: null,
    firstFailure: null,
  };
}

export function evaluateLongRunSample({
  currentSample,
  previousSample = null,
  evaluationState = createLongRunEvaluationState(),
  elapsedWallSec = 0,
  runKind = "idle",
  thresholdBaseline = createDefaultLongRunThresholdBaseline(),
}) {
  const profile = getLongRunProfile(runKind);
  const thresholds = LONG_RUN_PROFILE.thresholds;
  const failures = [];
  const nextState = { ...evaluationState };
  const currentTemplateId = String(currentSample.world?.templateId ?? "");
  if (currentTemplateId && currentTemplateId !== String(nextState.currentTemplateId ?? "")) {
    nextState.currentTemplateId = currentTemplateId;
    nextState.lastScenarioStartWallSec = elapsedWallSec;
    nextState.threatPinnedSinceSec = null;
    nextState.noWarehouseAnchorSinceSec = null;
  } else if (!Number.isFinite(Number(nextState.lastScenarioStartWallSec))) {
    nextState.lastScenarioStartWallSec = 0;
  }
  const scenarioWallSec = Math.max(0, elapsedWallSec - Number(nextState.lastScenarioStartWallSec ?? 0));
  const logisticsThresholdsActive = scenarioWallSec >= Number(profile.logisticsGraceSec ?? 0);

  const tickAdvanced = previousSample == null
    || String(currentSample.world?.templateId ?? "") !== String(previousSample.world?.templateId ?? "")
    || Number(currentSample.simTimeSec ?? 0) < Number(previousSample.simTimeSec ?? 0)
    || Number(currentSample.tick ?? 0) > Number(previousSample.tick ?? 0)
    || Number(currentSample.simTimeSec ?? 0) > Number(previousSample.simTimeSec ?? 0);
  if (tickAdvanced) nextState.lastProgressWallSec = elapsedWallSec;

  const currentFps = Number(currentSample.performance?.fps ?? 0);
  if (currentFps >= thresholds.absoluteMinP5Fps) {
    nextState.lastHealthyFpsWallSec = elapsedWallSec;
  }

  if (Array.isArray(currentSample.nonFiniteMetrics) && currentSample.nonFiniteMetrics.length > 0) {
    failures.push({
      kind: "nan_metric",
      message: `Non-finite metrics: ${currentSample.nonFiniteMetrics.join(", ")}`,
    });
  }

  if (String(currentSample.phase ?? "") === "end" && elapsedWallSec < profile.authoritativeWallClockSec) {
    failures.push({
      kind: "phase_end",
      message: `Run ended early at ${round(elapsedWallSec, 1)}s wall-clock.`,
    });
  }

  if (elapsedWallSec - Number(nextState.lastProgressWallSec ?? 0) > profile.maxFreezeSec) {
    failures.push({
      kind: "tick_freeze",
      message: `Tick or sim time stopped advancing for more than ${profile.maxFreezeSec}s.`,
    });
  }

  if (elapsedWallSec - Number(nextState.lastHealthyFpsWallSec ?? 0) > profile.maxRenderStallSec) {
    failures.push({
      kind: "fps_collapse",
      message: `FPS stayed below ${thresholds.absoluteMinP5Fps} for more than ${profile.maxRenderStallSec}s.`,
    });
  }

  if (Number(currentSample.warnings?.errorCount ?? 0) > thresholds.maxErrorWarnings) {
    failures.push({
      kind: "warning_escalation",
      message: `Error-level warnings detected (${currentSample.warnings.errorCount}).`,
    });
  }

  const ai = currentSample.ai ?? {};
  if (String(ai.coverageTarget ?? "fallback") === "llm") {
    const liveGate = LONG_RUN_PROFILE.ai.liveGate;
    const responses = Math.max(1, Number(ai.requestCount ?? 0));
    const fallbackRatio = Number(ai.fallbackCount ?? 0) / responses;
    if (Number(ai.timeoutCount ?? 0) > liveGate.maxTimeoutCount) {
      failures.push({
        kind: "ai_outage",
        message: `AI timeout churn exceeded ${liveGate.maxTimeoutCount}.`,
      });
    }
    if (Number(ai.consecutiveFallbackResponses ?? 0) > liveGate.maxConsecutiveFallbackResponses) {
      failures.push({
        kind: "ai_outage",
        message: "AI entered repeated fallback responses without recovering.",
      });
    }
    if (Number(ai.maxUnrecoveredFallbackSec ?? 0) > liveGate.maxUnrecoveredFallbackSec) {
      failures.push({
        kind: "ai_outage",
        message: `AI fallback remained unrecovered for ${round(ai.maxUnrecoveredFallbackSec, 1)}s.`,
      });
    }
    if (fallbackRatio > liveGate.maxFallbackResponseRatio) {
      failures.push({
        kind: "ai_outage",
        message: `AI fallback ratio ${round(fallbackRatio, 2)} exceeded ${liveGate.maxFallbackResponseRatio}.`,
      });
    }
  }

  const threat = Number(currentSample.gameplay?.threat ?? 0);
  if (threat >= thresholds.threatPinnedValue) {
    nextState.threatPinnedSinceSec ??= elapsedWallSec;
    if (elapsedWallSec - nextState.threatPinnedSinceSec > thresholds.maxThreatPinnedSec) {
      failures.push({
        kind: "pacing",
        message: `Threat stayed pinned near ${thresholds.threatPinnedValue} for more than ${thresholds.maxThreatPinnedSec}s.`,
      });
    }
  } else {
    nextState.threatPinnedSinceSec = null;
  }

  const logisticsSummary = String(currentSample.logistics?.summary ?? "");
  if (logisticsSummary === thresholds.noWarehouseAnchorMessage) {
    nextState.noWarehouseAnchorSinceSec ??= elapsedWallSec;
    if (elapsedWallSec - nextState.noWarehouseAnchorSinceSec > thresholds.maxNoWarehouseAnchorSec) {
      failures.push({
        kind: "logistics",
        message: "Warehouse anchors never came online within the allowed repair window.",
      });
    }
  } else {
    nextState.noWarehouseAnchorSinceSec = null;
  }

  if (
    Number(currentSample.world?.frontier?.connectedRoutes ?? 0) > 0
    || Number(currentSample.world?.frontier?.readyDepots ?? 0) > 0
  ) {
    nextState.firstRouteRepairAtSec ??= elapsedWallSec;
  }
  if (
    Number(currentSample.world?.spatialPressure?.activeEventCount ?? 0) > 0
    && Number(currentSample.world?.weather?.hazardFrontCount ?? 0) > 0
  ) {
    nextState.firstWeatherEventOverlapAtSec ??= elapsedWallSec;
  }

  if (logisticsThresholdsActive && Number(currentSample.logistics?.avgDepotDistance ?? 0) > thresholds.maxAvgDepotDistance) {
    failures.push({
      kind: "logistics",
      message: `Average depot distance exceeded ${thresholds.maxAvgDepotDistance}.`,
    });
  }
  if (logisticsThresholdsActive && Number(currentSample.logistics?.isolatedWorksites ?? 0) > thresholds.maxIsolatedWorksites) {
    failures.push({
      kind: "logistics",
      message: `Isolated worksites exceeded ${thresholds.maxIsolatedWorksites}.`,
    });
  }
  if (logisticsThresholdsActive && Number(currentSample.logistics?.stretchedWorksites ?? 0) > thresholds.maxStretchedWorksites) {
    failures.push({
      kind: "logistics",
      message: `Stretched worksites exceeded ${thresholds.maxStretchedWorksites}.`,
    });
  }
  if (logisticsThresholdsActive && Number(currentSample.logistics?.strandedCarryWorkers ?? 0) > thresholds.maxStrandedCarryWorkers) {
    failures.push({
      kind: "logistics",
      message: `Stranded carry workers exceeded ${thresholds.maxStrandedCarryWorkers}.`,
    });
  }
  if (Number(currentSample.world?.spatialPressure?.weatherPressure ?? 0) > thresholds.maxWeatherPressure) {
    failures.push({
      kind: "pressure",
      message: `Weather pressure exceeded ${thresholds.maxWeatherPressure}.`,
    });
  }
  if (Number(currentSample.world?.spatialPressure?.eventPressure ?? 0) > thresholds.maxEventPressure) {
    failures.push({
      kind: "pressure",
      message: `Event pressure exceeded ${thresholds.maxEventPressure}.`,
    });
  }
  if (Number(currentSample.ecology?.maxFarmPressure ?? 0) > thresholds.maxEcologyPressure) {
    failures.push({
      kind: "pressure",
      message: `Ecology pressure exceeded ${thresholds.maxEcologyPressure}.`,
    });
  }
  if (Number(currentSample.world?.spatialPressure?.contestedZones ?? 0) > thresholds.maxContestedZones) {
    failures.push({
      kind: "pressure",
      message: `Contested zones exceeded ${thresholds.maxContestedZones}.`,
    });
  }

  if (failures.length > 0 && !nextState.firstFailure) {
    nextState.firstFailure = failures[0];
  }

  return {
    failures,
    evaluationState: nextState,
  };
}

export function finalizeLongRunSamples(samples, thresholdBaseline = createDefaultLongRunThresholdBaseline()) {
  const fpsValues = samples
    .map((sample) => Number(sample.performance?.fps ?? 0))
    .filter((value) => Number.isFinite(value));
  const browserFpsValues = samples
    .map((sample) => Number(sample.performance?.browserFps ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const observedFpsValues = samples
    .map((sample) => Number(sample.performance?.observedFps ?? sample.performance?.fps ?? 0))
    .filter((value) => Number.isFinite(value));
  const frameValues = samples
    .map((sample) => Number(sample.performance?.frameMs ?? 0))
    .filter((value) => Number.isFinite(value));
  const sortedFps = [...fpsValues].sort((a, b) => a - b);
  const sortedBrowserFps = [...browserFpsValues].sort((a, b) => a - b);
  const sortedObservedFps = [...observedFpsValues].sort((a, b) => a - b);
  const p5Index = sortedFps.length <= 0 ? -1 : Math.max(0, Math.floor((sortedFps.length - 1) * 0.05));
  const browserP5Index = sortedBrowserFps.length <= 0 ? -1 : Math.max(0, Math.floor((sortedBrowserFps.length - 1) * 0.05));
  const observedP5Index = sortedObservedFps.length <= 0 ? -1 : Math.max(0, Math.floor((sortedObservedFps.length - 1) * 0.05));
  const avgFps = fpsValues.length > 0 ? round(fpsValues.reduce((sum, value) => sum + value, 0) / fpsValues.length, 2) : 0;
  const avgBrowserFps = browserFpsValues.length > 0
    ? round(browserFpsValues.reduce((sum, value) => sum + value, 0) / browserFpsValues.length, 2)
    : 0;
  const avgObservedFps = observedFpsValues.length > 0
    ? round(observedFpsValues.reduce((sum, value) => sum + value, 0) / observedFpsValues.length, 2)
    : 0;
  const avgFrameMs = frameValues.length > 0 ? round(frameValues.reduce((sum, value) => sum + value, 0) / frameValues.length, 2) : 0;
  const p5Fps = p5Index >= 0 ? round(sortedFps[p5Index], 2) : 0;
  const p5BrowserFps = browserP5Index >= 0 ? round(sortedBrowserFps[browserP5Index], 2) : 0;
  const p5ObservedFps = observedP5Index >= 0 ? round(sortedObservedFps[observedP5Index], 2) : 0;
  const minFps = sortedFps.length > 0 ? round(sortedFps[0], 2) : 0;
  const minBrowserFps = sortedBrowserFps.length > 0 ? round(sortedBrowserFps[0], 2) : 0;
  const minObservedFps = sortedObservedFps.length > 0 ? round(sortedObservedFps[0], 2) : 0;
  const errorWarningCount = countValues(samples, (sample) => Number(sample.warnings?.errorCount ?? 0) > 0);
  const timeoutCount = Number(samples.at(-1)?.ai?.timeoutCount ?? 0);

  return {
    sampleCount: samples.length,
    avgFps,
    avgBrowserFps,
    avgObservedFps,
    p5Fps,
    p5BrowserFps,
    p5ObservedFps,
    minFps,
    minBrowserFps,
    minObservedFps,
    avgFrameMs,
    errorWarningSamples: errorWarningCount,
    timeoutCount,
    thresholdBaseline,
  };
}

export function evaluateLongRunSummary(summary, thresholdBaseline = createDefaultLongRunThresholdBaseline()) {
  const thresholds = LONG_RUN_PROFILE.thresholds;
  const avgObservedFps = Number(summary.avgObservedFps ?? summary.avgFps ?? 0);
  const p5ObservedFps = Number(summary.p5ObservedFps ?? summary.p5Fps ?? 0);
  const floorAvgFps = Math.max(
    thresholds.absoluteMinAvgFps,
    Number.isFinite(Number(thresholdBaseline?.avgFps))
      ? Number(thresholdBaseline.avgFps) * Number(thresholdBaseline?.regressionBand?.avgFps ?? 0.82)
      : thresholds.absoluteMinAvgFps,
  );
  const floorP5Fps = Math.max(
    thresholds.absoluteMinP5Fps,
    Number.isFinite(Number(thresholdBaseline?.p5Fps))
      ? Number(thresholdBaseline.p5Fps) * Number(thresholdBaseline?.regressionBand?.p5Fps ?? 0.78)
      : thresholds.absoluteMinP5Fps,
  );
  const failures = [];
  if (avgObservedFps < floorAvgFps) {
    failures.push({
      kind: "fps_regression",
      message: `Average FPS ${round(avgObservedFps, 2)} dropped below floor ${round(floorAvgFps, 2)}.`,
    });
  }
  if (p5ObservedFps < floorP5Fps) {
    failures.push({
      kind: "fps_regression",
      message: `p5 FPS ${round(p5ObservedFps, 2)} dropped below floor ${round(floorP5Fps, 2)}.`,
    });
  }
  return failures;
}
