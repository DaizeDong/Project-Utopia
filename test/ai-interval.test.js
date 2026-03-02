import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { EnvironmentDirectorSystem } from "../src/simulation/ai/director/EnvironmentDirectorSystem.js";
import { buildEnvironmentFallback } from "../src/simulation/ai/llm/PromptBuilder.js";

test("Environment director respects decision interval when sim time does not advance", async () => {
  const state = createInitialGameState();
  state.ai.enabled = false;
  state.metrics.timeSec = 0;
  state.ai.lastEnvironmentDecisionSec = -999;

  let calls = 0;
  const services = {
    llmClient: {
      requestEnvironment: async () => {
        calls += 1;
        return { fallback: true, data: buildEnvironmentFallback({ resources: { food: 30 }, traffic: { congestion: 0.2 } }), error: "" };
      },
    },
    fallbackEnvironment: buildEnvironmentFallback,
  };

  const system = new EnvironmentDirectorSystem();
  system.update(1 / 30, state, services);
  await new Promise((resolve) => setTimeout(resolve, 0));
  system.update(1 / 30, state, services);
  system.update(1 / 30, state, services);
  assert.equal(calls, 1);

  state.metrics.timeSec = 20;
  system.update(1 / 30, state, services);
  await new Promise((resolve) => setTimeout(resolve, 0));
  system.update(1 / 30, state, services);
  assert.equal(calls, 2);
});
