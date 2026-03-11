import { PathCache } from "../simulation/navigation/PathCache.js";
import { LLMClient } from "../simulation/ai/llm/LLMClient.js";
import { buildEnvironmentFallback, buildPolicyFallback } from "../simulation/ai/llm/PromptBuilder.js";
import { SeededRng, deriveRngSeed } from "./rng.js";
import { createSnapshotService } from "./snapshotService.js";
import { createReplayService } from "./replayService.js";

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
    ? createOfflineFallbackClient(new LLMClient())
    : new LLMClient();
  return {
    pathCache: new PathCache(700),
    pathBudget: {
      tick: -1,
      usedMs: 0,
      skipped: 0,
      maxMs: 3,
    },
    llmClient,
    fallbackEnvironment: buildEnvironmentFallback,
    fallbackPolicies: buildPolicyFallback,
    rng,
    snapshotService: createSnapshotService(),
    replayService: createReplayService(),
  };
}
