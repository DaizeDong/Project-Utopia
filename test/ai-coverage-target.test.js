import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { EnvironmentDirectorSystem } from "../src/simulation/ai/director/EnvironmentDirectorSystem.js";
import { NPCBrainSystem } from "../src/simulation/ai/brains/NPCBrainSystem.js";
import { buildEnvironmentFallback, buildPolicyFallback } from "../src/simulation/ai/llm/PromptBuilder.js";
import { StrategicDirector } from "../src/simulation/ai/strategic/StrategicDirector.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";

test("Environment and policy directors skip live LLM calls when coverageTarget is fallback", async () => {
  const state = createInitialGameState({ seed: 1337 });
  state.ai.enabled = true;
  state.ai.coverageTarget = "fallback";
  state.ai.lastEnvironmentDecisionSec = -999;
  state.ai.lastPolicyDecisionSec = -999;
  state.metrics.timeSec = 120;

  const environmentEnabledArgs = [];
  const policyEnabledArgs = [];
  const services = {
    llmClient: {
      lastStatus: "down",
      lastModel: "fallback",
      requestEnvironment: async (summary, enabled) => {
        environmentEnabledArgs.push(enabled);
        return { fallback: true, data: buildEnvironmentFallback(summary), error: "", model: "fallback", debug: {} };
      },
      requestPolicies: async (summary, enabled) => {
        policyEnabledArgs.push(enabled);
        return { fallback: true, data: buildPolicyFallback(summary), error: "", model: "fallback", debug: {} };
      },
    },
    fallbackEnvironment: buildEnvironmentFallback,
    fallbackPolicies: buildPolicyFallback,
  };

  new EnvironmentDirectorSystem().update(1 / 30, state, services);
  new NPCBrainSystem().update(1 / 30, state, services);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(environmentEnabledArgs, [false]);
  assert.deepEqual(policyEnabledArgs, [false]);
});

test("StrategicDirector uses synchronous fallback when autopilot is on but coverageTarget is fallback", () => {
  const state = createInitialGameState({ seed: 1337 });
  state.ai.enabled = true;
  state.ai.coverageTarget = "fallback";
  state.ai.forceStrategicDecision = true;
  state.metrics.timeSec = 30;
  let requestStrategicCalls = 0;

  new StrategicDirector(new MemoryStore()).update(0, state, {
    llmClient: {
      requestStrategic: async () => {
        requestStrategicCalls += 1;
        return { fallback: true, data: null };
      },
    },
  });

  assert.equal(requestStrategicCalls, 0);
  assert.equal(state.ai.lastStrategySource, "fallback");
  assert.ok(state.ai.llmCallLog?.[0], "fallback exchange should still be visible in AI Exchange log");
});
