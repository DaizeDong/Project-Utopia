import test from "node:test";
import assert from "node:assert/strict";

import { ColonyDirectorSystem } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";
import { recordAiDecisionResult } from "../src/app/aiRuntimeStats.js";
import { BALANCE } from "../src/config/balance.js";

// R13 Plan-R13-autopilot-wait-llm (#6 P1) tests — autopilot waits for first
// /api/ai/plan response (LLM or fallback) OR a safety timeout before its
// phase-builder runs. Manual mode is never gated.

function makeState({ aiEnabled = true, timeSec = 0 } = {}) {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.resources = { food: 80, wood: 70, stone: 0, herbs: 0, meals: 0, medicine: 0, tools: 0 };
  state.buildings = rebuildBuildingStats(state.grid);
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = timeSec;
  state.ai.enabled = aiEnabled;
  return state;
}

test("autopilotReady defaults to false in initial state", () => {
  const state = makeState();
  assert.equal(state.ai.autopilotReady, false, "should start gated");
  assert.equal(state.ai.firstPlanReceivedSec, null);
  assert.equal(state.ai.autopilotReadyReason, null);
  assert.equal(state.ai.fallbackMode, false);
});

test("ColonyDirector early-returns when autopilot ON and not ready", () => {
  const state = makeState({ aiEnabled: true, timeSec: 0.1 });
  const sys = new ColonyDirectorSystem();
  const initialPhase = state.ai.colonyDirector?.phase;
  sys.update(0.1, state, null);
  // automation block records the awaiting state
  assert.equal(state.ai.colonyDirector?.automation?.phaseBuilder, "awaiting-first-plan",
    "phaseBuilder marked awaiting-first-plan during gate");
  assert.equal(state.ai.colonyDirector?.automation?.scenarioRepairAllowed, false,
    "scenario repair also gated to honour startup wait");
  assert.equal(state.ai.colonyDirector?.buildsPlaced ?? 0, 0,
    "no builds placed while gated");
});

test("first LLM response flips autopilotReady=true with reason=first-plan", () => {
  const state = makeState({ timeSec: 1.5 });
  recordAiDecisionResult(state, "policy", { fallback: false, latencyMs: 250 }, 1.5);
  assert.equal(state.ai.autopilotReady, true);
  assert.equal(state.ai.autopilotReadyReason, "first-plan");
  assert.equal(state.ai.firstPlanReceivedSec, 1.5);
  assert.equal(state.ai.fallbackMode, false, "first-plan path does not flip fallbackMode");
});

test("fallback response flips autopilotReady=true + fallbackMode=true", () => {
  const state = makeState({ timeSec: 0.8 });
  recordAiDecisionResult(state, "environment", { fallback: true, latencyMs: 5 }, 0.8);
  assert.equal(state.ai.autopilotReady, true);
  assert.equal(state.ai.autopilotReadyReason, "fallback");
  assert.equal(state.ai.fallbackMode, true);
});

test("ColonyDirector runs after autopilotReady flips via first plan", () => {
  const state = makeState({ timeSec: 1.5 });
  recordAiDecisionResult(state, "policy", { fallback: false, latencyMs: 100 }, 1.5);
  // Advance sim time past EVAL_INTERVAL_SEC=2 so the director's interval
  // gate doesn't trip.
  state.metrics.timeSec = 4.0;
  const sys = new ColonyDirectorSystem();
  sys.update(0.1, state, null);
  assert.equal(state.ai.colonyDirector?.automation?.phaseBuilder, "active",
    "phaseBuilder marked active once gate clears");
  assert.equal(state.ai.colonyDirector?.automation?.autopilotReady, true);
});

test("safety timeout flips fallbackMode + autopilotReady when nowSec >= timeoutSec", () => {
  const timeout = Number(BALANCE.autopilotReadyTimeoutSec ?? 10);
  const state = makeState({ timeSec: timeout + 0.5 });
  const sys = new ColonyDirectorSystem();
  sys.update(0.1, state, null);
  assert.equal(state.ai.autopilotReady, true);
  assert.equal(state.ai.fallbackMode, true);
  assert.equal(state.ai.autopilotReadyReason, "timeout");
});

test("manual mode (autopilot off) is never gated by autopilotReady", () => {
  const state = makeState({ aiEnabled: false, timeSec: 0.5 });
  const sys = new ColonyDirectorSystem();
  sys.update(0.1, state, null);
  // Director still runs (it just won't enter the autopilot-only branches).
  // automation block records the off state, NOT the awaiting-first-plan gate.
  assert.notEqual(state.ai.colonyDirector?.automation?.phaseBuilder, "awaiting-first-plan",
    "manual mode is not gated by autopilotReady");
  assert.equal(state.ai.colonyDirector?.automation?.autopilotEnabled, false);
});
