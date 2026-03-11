import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import {
  classifyAiErrorMessage,
  markAiDecisionRequest,
  recordAiDecisionResult,
} from "../src/app/aiRuntimeStats.js";

test("classifyAiErrorMessage recognizes timeout and auth failures", () => {
  assert.equal(classifyAiErrorMessage("request timeout"), "timeout");
  assert.equal(classifyAiErrorMessage("OPENAI_API_KEY missing"), "auth");
  assert.equal(classifyAiErrorMessage("schema failed: missing field"), "schema");
  assert.equal(classifyAiErrorMessage(""), "none");
});

test("AI runtime stats track fallback streaks and recovery for live coverage", () => {
  const state = createInitialGameState({ seed: 1337 });
  state.ai.coverageTarget = "llm";

  markAiDecisionRequest(state, "policy", 12);
  recordAiDecisionResult(state, "policy", {
    fallback: true,
    latencyMs: 210,
    error: "request timeout",
  }, 12.4);

  assert.equal(state.metrics.aiRuntime.requestCount, 1);
  assert.equal(state.metrics.aiRuntime.policyRequests, 1);
  assert.equal(state.metrics.aiRuntime.timeoutCount, 1);
  assert.equal(state.metrics.aiRuntime.fallbackResponseCount, 1);
  assert.equal(state.metrics.aiRuntime.consecutiveFallbackResponses, 1);

  markAiDecisionRequest(state, "policy", 30);
  recordAiDecisionResult(state, "policy", {
    fallback: false,
    latencyMs: 320,
    error: "",
  }, 30.2);

  assert.equal(state.metrics.aiRuntime.llmResponseCount, 1);
  assert.equal(state.metrics.aiRuntime.consecutiveFallbackResponses, 0);
  assert.equal(state.metrics.aiRuntime.recoveryCount, 1);
  assert.equal(state.metrics.aiRuntime.liveCoverageSatisfied, true);
  assert.equal(state.metrics.aiRuntime.lastResultSource, "llm");
});
