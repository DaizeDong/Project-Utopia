import { PathCache } from "../simulation/navigation/PathCache.js";
import { LLMClient } from "../simulation/ai/llm/LLMClient.js";
import { buildEnvironmentFallback, buildPolicyFallback } from "../simulation/ai/llm/PromptBuilder.js";

export function createServices() {
  return {
    pathCache: new PathCache(1000),
    llmClient: new LLMClient(),
    fallbackEnvironment: buildEnvironmentFallback,
    fallbackPolicies: buildPolicyFallback,
  };
}
