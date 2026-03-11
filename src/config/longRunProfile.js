const IDLE_DURATION_SEC = 10 * 60;
const OPERATOR_SEGMENT_DURATION_SEC = 20 * 60;
const OPERATOR_DURATION_SEC = OPERATOR_SEGMENT_DURATION_SEC * 3;
const AI_LONG_RUN_TUNING = Object.freeze({
  environmentDecisionIntervalSec: 18,
  policyDecisionIntervalSec: 20,
  policyTtlDefaultSec: 36,
  maxDirectiveDurationSec: 150,
});
const VISITOR_LONG_RUN_TUNING = Object.freeze({
  sabotageCooldownMultiplier: 1.4,
  warehousePriorityMultiplier: 0.5,
  protectLastWarehousesCount: 1,
  protectedWarehouseLossScale: 0.45,
});
const EVENT_LONG_RUN_TUNING = Object.freeze({
  maxConcurrentByType: Object.freeze({
    banditRaid: 1,
    tradeCaravan: 1,
    animalMigration: 1,
    sabotage: 1,
  }),
  maxBanditRaidPressure: 1.75,
  maxEventPressurePerEvent: 1.9,
});

export const LONG_RUN_PROFILE = Object.freeze({
  baseline: Object.freeze({
    durationSec: 75,
    sampleIntervalSec: 5,
    avgFpsRegressionBand: 0.82,
    p5FpsRegressionBand: 0.78,
  }),
  idle: Object.freeze({
    kind: "idle",
    durationSec: IDLE_DURATION_SEC,
    sampleIntervalSec: 10,
    authoritativeWallClockSec: IDLE_DURATION_SEC,
    maxFreezeSec: 3,
    maxRenderStallSec: 30,
    logisticsGraceSec: 180,
    screenshotMomentsSec: Object.freeze([0, 5 * 60, IDLE_DURATION_SEC / 2, IDLE_DURATION_SEC]),
  }),
  operator: Object.freeze({
    kind: "operator",
    durationSec: OPERATOR_DURATION_SEC,
    segmentDurationSec: OPERATOR_SEGMENT_DURATION_SEC,
    sampleIntervalSec: 15,
    authoritativeWallClockSec: OPERATOR_DURATION_SEC,
    maxFreezeSec: 3,
    maxRenderStallSec: 30,
    logisticsGraceSec: 8 * 60,
    screenshotMomentsSec: Object.freeze([0, 5 * 60, OPERATOR_DURATION_SEC / 2, OPERATOR_DURATION_SEC]),
    segments: Object.freeze([
      Object.freeze({ templateId: "temperate_plains", label: "temperate_plains" }),
      Object.freeze({ templateId: "fortified_basin", label: "fortified_basin" }),
      Object.freeze({ templateId: "archipelago_isles", label: "archipelago_isles" }),
    ]),
  }),
  ai: Object.freeze({
    tuning: AI_LONG_RUN_TUNING,
    liveGate: Object.freeze({
      maxConsecutiveFallbackResponses: 3,
      maxTimeoutCount: 8,
      maxUnrecoveredFallbackSec: 90,
      maxFallbackResponseRatio: 0.35,
      repairWindowSec: 45,
    }),
  }),
  visitors: Object.freeze({
    tuning: VISITOR_LONG_RUN_TUNING,
  }),
  events: Object.freeze({
    tuning: EVENT_LONG_RUN_TUNING,
  }),
  thresholds: Object.freeze({
    absoluteMinAvgFps: 28,
    absoluteMinP5Fps: 24,
    maxErrorWarnings: 0,
    maxThreatPinnedSec: 120,
    threatPinnedValue: 99,
    noWarehouseAnchorMessage: "Logistics: no warehouse anchors online.",
    maxNoWarehouseAnchorSec: 180,
    maxAvgDepotDistance: 18,
    maxIsolatedWorksites: 2,
    maxStretchedWorksites: 3,
    maxStrandedCarryWorkers: 10,
    minProsperitySoftFloor: 6,
    minFoodSoftFloor: 0,
    minWoodSoftFloor: 0,
    maxWeatherPressure: 1.8,
    maxEventPressure: 2.1,
    maxEcologyPressure: 1.25,
    maxContestedZones: 4,
  }),
});

export function getLongRunProfile(kind = "idle") {
  return kind === "operator" ? LONG_RUN_PROFILE.operator : LONG_RUN_PROFILE.idle;
}

export function getLongRunAiTuning(stateOrProfile = null) {
  const runtimeProfile = typeof stateOrProfile === "string"
    ? stateOrProfile
    : String(stateOrProfile?.ai?.runtimeProfile ?? "");
  if (runtimeProfile === "long_run") {
    return LONG_RUN_PROFILE.ai.tuning;
  }
  return Object.freeze({
    environmentDecisionIntervalSec: 12,
    policyDecisionIntervalSec: 10,
    policyTtlDefaultSec: 24,
    maxDirectiveDurationSec: 120,
  });
}

export function getLongRunVisitorTuning(stateOrProfile = null) {
  const runtimeProfile = typeof stateOrProfile === "string"
    ? stateOrProfile
    : String(stateOrProfile?.ai?.runtimeProfile ?? "");
  if (runtimeProfile === "long_run") {
    return LONG_RUN_PROFILE.visitors.tuning;
  }
  return Object.freeze({
    sabotageCooldownMultiplier: 1,
    warehousePriorityMultiplier: 1,
    protectLastWarehousesCount: 0,
    protectedWarehouseLossScale: 1,
  });
}

export function getLongRunEventTuning(stateOrProfile = null) {
  const runtimeProfile = typeof stateOrProfile === "string"
    ? stateOrProfile
    : String(stateOrProfile?.ai?.runtimeProfile ?? "");
  if (runtimeProfile === "long_run") {
    return LONG_RUN_PROFILE.events.tuning;
  }
  return Object.freeze({
    maxConcurrentByType: Object.freeze({}),
    maxBanditRaidPressure: Infinity,
    maxEventPressurePerEvent: Infinity,
  });
}

export function getLongRunScreenshotMoments(kind = "idle", durationSec = null) {
  const profile = getLongRunProfile(kind);
  const targetDurationSec = Math.max(1, Number(durationSec) || profile.durationSec);
  const moments = new Set(
    profile.screenshotMomentsSec
      .map((value) => Math.max(0, Math.min(targetDurationSec, Math.round(Number(value) || 0))))
  );
  moments.add(targetDurationSec);
  return [...moments].sort((a, b) => a - b);
}

export function createDefaultLongRunThresholdBaseline() {
  return {
    generatedAt: null,
    baselineDurationSec: LONG_RUN_PROFILE.baseline.durationSec,
    avgFps: null,
    p5Fps: null,
    minFps: null,
    avgFrameMs: null,
    regressionBand: {
      avgFps: LONG_RUN_PROFILE.baseline.avgFpsRegressionBand,
      p5Fps: LONG_RUN_PROFILE.baseline.p5FpsRegressionBand,
    },
    floors: {
      avgFps: LONG_RUN_PROFILE.thresholds.absoluteMinAvgFps,
      p5Fps: LONG_RUN_PROFILE.thresholds.absoluteMinP5Fps,
    },
  };
}
