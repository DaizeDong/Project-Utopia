import { PathCache } from "../simulation/navigation/PathCache.js";
import { PathWorkerPool } from "../simulation/navigation/PathWorkerPool.js";
import { LLMClient } from "../simulation/ai/llm/LLMClient.js";
import { AdapterToLLMClient } from "../simulation/ai/llm/AdapterToLLMClient.js";
import { buildEnvironmentFallback, buildPolicyFallback } from "../simulation/ai/llm/PromptBuilder.js";
import { ReachabilityCache } from "../simulation/services/ReachabilityCache.js";
import { PathFailBlacklist } from "../simulation/services/PathFailBlacklist.js";
import { SeededRng, deriveRngSeed } from "./rng.js";

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
    async requestStrategic(promptContent, enabled, fallbackData = null) {
      const requestSummary = (() => {
        if (typeof promptContent !== "string") return promptContent ?? {};
        try {
          return JSON.parse(promptContent);
        } catch {
          return { channel: "strategic-director", rawPrompt: promptContent };
        }
      })();
      this.lastStatus = enabled ? "offline-fallback" : "fallback";
      this.lastError = "";
      this.lastLatencyMs = 0;
      this.lastModel = "offline-fallback";
      return {
        fallback: true,
        data: fallbackData,
        latencyMs: 0,
        error: "",
        model: "offline-fallback",
        debug: {
          requestedAtIso: new Date().toISOString(),
          endpoint: "/api/ai/environment",
          requestSummary,
          promptSystem: "(offline fallback: strategic proxy call skipped)",
          promptUser: typeof promptContent === "string" ? promptContent : JSON.stringify(requestSummary, null, 2),
          requestPayload: { endpoint: "/api/ai/environment", channel: "strategic-director", mode: "offline-fallback" },
          rawModelContent: JSON.stringify(fallbackData, null, 2),
          parsedBeforeValidation: fallbackData,
          guardedOutput: fallbackData,
          error: "",
        },
      };
    },
  };
}

export function createServices(seed = 1337, options = {}) {
  const rng = new SeededRng(deriveRngSeed(seed, "simulation"));
  // Adapter precedence: when an `agentAdapter` is supplied (benchmark
  // harness path) we wrap it in AdapterToLLMClient so all
  // `services.llmClient.requestXxx(...)` callers transparently route to the
  // adapter's `request(channel, ...)`. This is the seam that makes
  // FlatBaselineAdapter / ScriptedOraclePolicy / HTTPAgentClient /
  // LayerCastAdapter actually drive the simulation. The default browser /
  // game path keeps the existing LLMClient (proxy-routed) and the
  // offlineAiFallback wrapper exactly as before — no behaviour change.
  let llmClient;
  if (options.agentAdapter) {
    llmClient = new AdapterToLLMClient(options.agentAdapter);
  } else if (options.offlineAiFallback) {
    llmClient = createOfflineFallbackClient(new LLMClient({ baseUrl: options.baseUrl ?? "" }));
  } else {
    llmClient = new LLMClient({ baseUrl: options.baseUrl ?? "" });
  }
  // `deterministic: true` disables the wall-clock path budget so long-horizon
  // benchmarks produce reproducible results. Headless harness defaults to
  // deterministic; the in-browser game (now removed in S1) used 3ms.
  const pathBudgetMaxMs = options.deterministic ? Infinity : 3;
  const pathWorkerPool = !options.deterministic && options.enablePathWorkers !== false
    ? new PathWorkerPool(options.pathWorkers ?? {})
    : null;
  return {
    pathCache: new PathCache(700),
    pathWorkerPool,
    pathBudget: {
      tick: -1,
      usedMs: 0,
      skipped: 0,
      maxMs: pathBudgetMaxMs,
    },
    reachability: new ReachabilityCache(),
    pathFailBlacklist: new PathFailBlacklist(),
    llmClient,
    fallbackEnvironment: buildEnvironmentFallback,
    fallbackPolicies: buildPolicyFallback,
    rng,
    dispose() {
      pathWorkerPool?.dispose?.();
    },
  };
}
