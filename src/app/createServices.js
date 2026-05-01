import { PathCache } from "../simulation/navigation/PathCache.js";
import { PathWorkerPool } from "../simulation/navigation/PathWorkerPool.js";
import { LLMClient } from "../simulation/ai/llm/LLMClient.js";
import { buildEnvironmentFallback, buildPolicyFallback } from "../simulation/ai/llm/PromptBuilder.js";
import { ReachabilityCache } from "../simulation/services/ReachabilityCache.js";
import { PathFailBlacklist } from "../simulation/services/PathFailBlacklist.js";
import { SeededRng, deriveRngSeed } from "./rng.js";
import { createSnapshotService } from "./snapshotService.js";
import { createReplayService } from "./replayService.js";
import { createLeaderboardService } from "./leaderboardService.js";
import { pickBootSeed } from "../world/grid/Grid.js";

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
  const llmClient = options.offlineAiFallback
    ? createOfflineFallbackClient(new LLMClient({ baseUrl: options.baseUrl ?? "" }))
    : new LLMClient({ baseUrl: options.baseUrl ?? "" });
  // Phase 10: `deterministic: true` disables the wall-clock path budget so
  // long-horizon benchmarks produce reproducible results. Production paths
  // still use the 3ms budget (real FPS matters on slow devices); bench
  // harnesses pay the wall-clock cost but get bit-identical outcomes.
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
    // v0.8.13 — A2 audit. Per-(workerTile, tileTypes) reachability cache
    // keyed on grid.version. Replaces the 2.5 s TTL previously baked into
    // MortalitySystem.hasReachableNutritionSource so AI / mortality /
    // feasibility consumers all read the same fresh result.
    reachability: new ReachabilityCache(),
    // v0.8.13 — A6 audit. (workerId, ix, iz, tileType) blacklist with 5 s
    // TTL. chooseWorkerTarget skips blacklisted candidates so a worker
    // doesn't infinitely re-pick the same tile A* just refused.
    pathFailBlacklist: new PathFailBlacklist(),
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
    dispose() {
      pathWorkerPool?.dispose?.();
    },
  };
}

/**
 * v0.10.1 A7-rationality-audit R2 (P0 #7) — fresh-boot services factory.
 *
 * Wraps `createServices` so the **default** seed for a fresh page load is
 * resolved via `pickBootSeed()` (URL `?seed=` → `localStorage` →
 * `Math.random()`-derived 31-bit int) instead of the hard-coded
 * `DEFAULT_MAP_SEED = 1337`. Every test / benchmark / scenario that pins
 * a seed explicitly continues calling `createServices(seed, options)`
 * directly — nothing in the test path is affected.
 *
 * Returned object has an extra `bootSeed` field exposing the resolved
 * value so the caller can stash it on `state.world.mapSeed` (GameApp does
 * this via the `regenerateWorld` flow on first construct).
 *
 * @param {object} [options] forwarded to createServices
 * @param {URLSearchParams} [options.urlParams] override for tests
 * @param {Storage|null}    [options.storage]   override for tests
 * @returns {object} services bundle + `bootSeed`
 */
export function createServicesForFreshBoot(options = {}) {
  const urlParams = options.urlParams
    ?? (typeof globalThis !== "undefined" && globalThis.location?.search != null
      ? new URLSearchParams(globalThis.location.search)
      : new URLSearchParams(""));
  const storage = options.storage !== undefined
    ? options.storage
    : (typeof localStorage !== "undefined" ? localStorage : null);
  const bootSeed = pickBootSeed({ urlParams, storage });
  // Strip our own knobs before forwarding so createServices doesn't see them.
  const { urlParams: _u, storage: _s, ...forwardOpts } = options;
  const services = createServices(bootSeed, forwardOpts);
  services.bootSeed = bootSeed;
  return services;
}
