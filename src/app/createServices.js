import { PathCache } from "../simulation/navigation/PathCache.js";
import { LLMClient } from "../simulation/ai/llm/LLMClient.js";
import { buildEnvironmentFallback, buildPolicyFallback } from "../simulation/ai/llm/PromptBuilder.js";
import { SeededRng, deriveRngSeed } from "./rng.js";
import { createSnapshotService } from "./snapshotService.js";
import { createReplayService } from "./replayService.js";
import { createLeaderboardService } from "./leaderboardService.js";

function createOfflineFallbackClient(baseClient) {
  return {
    ...baseClient,
    async requestEnvironment(summary, enabled) {
      const data = buildEnvironmentFallback(summary);
      this.lastStatus = enabled ? "offline-fallback" : "fallback";
      this.lastError = "";
      this.lastLatencyMs = 0;
      this.lastModel = "offline-fallback";
      return {
        fallback: true,
        data,
        latencyMs: 0,
        error: "",
        model: "offline-fallback",
        debug: {
          requestedAtIso: new Date().toISOString(),
          endpoint: "/api/ai/environment",
          requestSummary: summary,
          rawModelContent: JSON.stringify(data, null, 2),
          parsedBeforeValidation: data,
          guardedOutput: data,
          error: "",
        },
      };
    },
    async requestPolicies(summary, enabled) {
      const data = buildPolicyFallback(summary);
      this.lastStatus = enabled ? "offline-fallback" : "fallback";
      this.lastError = "";
      this.lastLatencyMs = 0;
      this.lastModel = "offline-fallback";
      return {
        fallback: true,
        data,
        latencyMs: 0,
        error: "",
        model: "offline-fallback",
        debug: {
          requestedAtIso: new Date().toISOString(),
          endpoint: "/api/ai/policy",
          requestSummary: summary,
          rawModelContent: JSON.stringify(data, null, 2),
          parsedBeforeValidation: data,
          guardedOutput: data,
          error: "",
        },
      };
    },
  };
}

export function createServices(seed = 1337, options = {}) {
  const rng = new SeededRng(deriveRngSeed(seed, "simulation"));
  const llmClient = options.offlineAiFallback
    ? createOfflineFallbackClient(new LLMClient({ baseUrl: options.baseUrl ?? "" }))
    : new LLMClient({ baseUrl: options.baseUrl ?? "" });
  // Phase 10: `deterministic: true` disables the wall-clock path budget so
  // long-horizon benchmarks produce reproducible results. Production paths
  // still use the 3ms budget (real FPS matters on slow devices); bench
  // harnesses pay the wall-clock cost but get bit-identical outcomes.
  const pathBudgetMaxMs = options.deterministic ? Infinity : 3;
  return {
    pathCache: new PathCache(700),
    pathBudget: {
      tick: -1,
      usedMs: 0,
      skipped: 0,
      maxMs: pathBudgetMaxMs,
    },
    llmClient,
    fallbackEnvironment: buildEnvironmentFallback,
    fallbackPolicies: buildPolicyFallback,
    rng,
    snapshotService: createSnapshotService(),
    replayService: createReplayService(),
    // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 2a) — local leaderboard
    // persisted in localStorage at `utopia:leaderboard:v1`. Storage may be
    // unavailable in Node test runs / Safari private mode; the service
    // tolerates a null backing store and silently falls back to in-memory.
    leaderboardService: createLeaderboardService(
      typeof localStorage !== "undefined" ? localStorage : null,
    ),
  };
}
