import { PathCache } from "../simulation/navigation/PathCache.js";
import { LLMClient } from "../simulation/ai/llm/LLMClient.js";
import { buildEnvironmentFallback, buildPolicyFallback } from "../simulation/ai/llm/PromptBuilder.js";
import { SeededRng, deriveRngSeed } from "./rng.js";
import { createSnapshotService } from "./snapshotService.js";
import { createReplayService } from "./replayService.js";

export function createServices(seed = 1337) {
  const rng = new SeededRng(deriveRngSeed(seed, "simulation"));
  return {
    pathCache: new PathCache(700),
    pathBudget: {
      tick: -1,
      usedMs: 0,
      skipped: 0,
      maxMs: 3,
    },
    llmClient: new LLMClient(),
    fallbackEnvironment: buildEnvironmentFallback,
    fallbackPolicies: buildPolicyFallback,
    rng,
    snapshotService: createSnapshotService(),
    replayService: createReplayService(),
  };
}
