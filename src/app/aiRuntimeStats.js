function clampNonNegative(value, fallback = 0) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return fallback;
  return Math.max(0, safe);
}

export function createDefaultAiRuntimeStats() {
  return {
    requestCount: 0,
    responseCount: 0,
    environmentRequests: 0,
    policyRequests: 0,
    environmentResponses: 0,
    policyResponses: 0,
    llmResponseCount: 0,
    fallbackResponseCount: 0,
    timeoutCount: 0,
    errorCount: 0,
    recoveryCount: 0,
    avgLatencyMs: 0,
    lastLatencyMs: 0,
    lastRequestSec: -999,
    lastResponseSec: -999,
    lastLiveSec: -999,
    lastFallbackSec: -999,
    maxUnrecoveredFallbackSec: 0,
    consecutiveFallbackResponses: 0,
    lastErrorKind: "none",
    lastErrorMessage: "",
    lastResultSource: "none",
    coverageTarget: "fallback",
    liveCoverageSatisfied: false,
  };
}

export function getAiCoverageTarget(state) {
  const raw = String(state?.ai?.coverageTarget ?? "").trim().toLowerCase();
  if (raw === "llm") return "llm";
  return "fallback";
}

export function ensureAiRuntimeStats(state) {
  state.metrics.aiRuntime ??= createDefaultAiRuntimeStats();
  const stats = state.metrics.aiRuntime;
  stats.requestCount = clampNonNegative(stats.requestCount);
  stats.responseCount = clampNonNegative(stats.responseCount);
  stats.environmentRequests = clampNonNegative(stats.environmentRequests);
  stats.policyRequests = clampNonNegative(stats.policyRequests);
  stats.environmentResponses = clampNonNegative(stats.environmentResponses);
  stats.policyResponses = clampNonNegative(stats.policyResponses);
  stats.llmResponseCount = clampNonNegative(stats.llmResponseCount);
  stats.fallbackResponseCount = clampNonNegative(stats.fallbackResponseCount);
  stats.timeoutCount = clampNonNegative(stats.timeoutCount);
  stats.errorCount = clampNonNegative(stats.errorCount);
  stats.recoveryCount = clampNonNegative(stats.recoveryCount);
  stats.avgLatencyMs = clampNonNegative(stats.avgLatencyMs);
  stats.lastLatencyMs = clampNonNegative(stats.lastLatencyMs);
  stats.lastRequestSec = Number.isFinite(Number(stats.lastRequestSec)) ? Number(stats.lastRequestSec) : -999;
  stats.lastResponseSec = Number.isFinite(Number(stats.lastResponseSec)) ? Number(stats.lastResponseSec) : -999;
  stats.lastLiveSec = Number.isFinite(Number(stats.lastLiveSec)) ? Number(stats.lastLiveSec) : -999;
  stats.lastFallbackSec = Number.isFinite(Number(stats.lastFallbackSec)) ? Number(stats.lastFallbackSec) : -999;
  stats.maxUnrecoveredFallbackSec = clampNonNegative(stats.maxUnrecoveredFallbackSec);
  stats.consecutiveFallbackResponses = clampNonNegative(stats.consecutiveFallbackResponses);
  stats.lastErrorKind = String(stats.lastErrorKind ?? "none");
  stats.lastErrorMessage = String(stats.lastErrorMessage ?? "");
  stats.lastResultSource = String(stats.lastResultSource ?? "none");
  stats.coverageTarget = getAiCoverageTarget(state);
  stats.liveCoverageSatisfied = Boolean(stats.liveCoverageSatisfied);
  return stats;
}

export function resetAiRuntimeStats(state) {
  state.metrics.aiRuntime = createDefaultAiRuntimeStats();
  state.metrics.aiRuntime.coverageTarget = getAiCoverageTarget(state);
  return state.metrics.aiRuntime;
}

export function classifyAiErrorMessage(errorText = "") {
  const raw = String(errorText ?? "").trim().toLowerCase();
  if (!raw) return "none";
  if (raw.includes("timeout") || raw.includes("aborted")) return "timeout";
  if (raw.includes("openai_api_key") || raw.includes("api key")) return "auth";
  if (raw.includes("http 4")) return "http-4xx";
  if (raw.includes("http 5")) return "http-5xx";
  if (raw.includes("schema")) return "schema";
  if (raw.includes("proxy") || raw.includes("fetch") || raw.includes("network")) return "proxy";
  return "other";
}

export function markAiDecisionRequest(state, channel, nowSec = Number(state?.metrics?.timeSec ?? 0)) {
  const stats = ensureAiRuntimeStats(state);
  stats.requestCount += 1;
  stats.lastRequestSec = nowSec;
  if (channel === "environment") stats.environmentRequests += 1;
  if (channel === "policy") stats.policyRequests += 1;
  return stats;
}

export function recordAiDecisionResult(state, channel, result, nowSec = Number(state?.metrics?.timeSec ?? 0)) {
  const stats = ensureAiRuntimeStats(state);
  const latencyMs = clampNonNegative(result?.latencyMs ?? 0);
  const errorMessage = String(result?.error ?? "").trim();
  const errorKind = classifyAiErrorMessage(errorMessage);
  const fallback = Boolean(result?.fallback);
  const coverageTarget = getAiCoverageTarget(state);

  stats.responseCount += 1;
  stats.lastResponseSec = nowSec;
  stats.lastLatencyMs = latencyMs;
  stats.avgLatencyMs = stats.responseCount <= 1
    ? latencyMs
    : Number((((stats.avgLatencyMs * (stats.responseCount - 1)) + latencyMs) / stats.responseCount).toFixed(2));
  stats.coverageTarget = coverageTarget;
  stats.lastResultSource = fallback ? "fallback" : "llm";
  if (channel === "environment") stats.environmentResponses += 1;
  if (channel === "policy") stats.policyResponses += 1;

  if (errorKind !== "none") {
    stats.errorCount += 1;
    stats.lastErrorKind = errorKind;
    stats.lastErrorMessage = errorMessage;
    if (errorKind === "timeout") stats.timeoutCount += 1;
  } else {
    stats.lastErrorKind = "none";
    stats.lastErrorMessage = "";
  }

  if (fallback) {
    stats.fallbackResponseCount += 1;
    if (coverageTarget === "llm") {
      stats.consecutiveFallbackResponses += 1;
      stats.lastFallbackSec = nowSec;
      const unrecoveredSec = stats.lastLiveSec > -998 ? nowSec - stats.lastLiveSec : 0;
      stats.maxUnrecoveredFallbackSec = Math.max(stats.maxUnrecoveredFallbackSec, clampNonNegative(unrecoveredSec));
    }
  } else {
    stats.llmResponseCount += 1;
    if (coverageTarget === "llm" && stats.consecutiveFallbackResponses > 0) {
      stats.recoveryCount += 1;
    }
    stats.consecutiveFallbackResponses = 0;
    stats.lastLiveSec = nowSec;
    stats.liveCoverageSatisfied = true;
  }

  if (coverageTarget !== "llm") {
    stats.consecutiveFallbackResponses = 0;
    stats.maxUnrecoveredFallbackSec = 0;
    stats.liveCoverageSatisfied = false;
  }

  return stats;
}
