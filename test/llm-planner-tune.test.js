/**
 * LLM-planner tuning tests.
 *
 * Pins the prompt-tuning deliverables from the
 * "tune Colony Planner LLM decisions" task:
 *
 *   (a) SYSTEM_PROMPT (or its build-time injection) instructs the LLM to chain
 *       multi-step plans via `depends_on`.
 *   (b) buildPlannerPrompt embeds the `learnedSkillsText` argument.
 *   (c) buildPlannerPrompt embeds the `evaluationText` argument.
 *   (d) validatePlanResponse still accepts well-formed multi-step plans where
 *       later steps reference earlier ones via `depends_on` — i.e. tightening
 *       the prompt does not regress the validator's chain support.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlannerPrompt,
  validatePlanResponse,
} from "../src/simulation/ai/colony/ColonyPlanner.js";
import { ColonyPerceiver } from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

function makeState() {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.resources = { food: 80, wood: 70, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0 };
  state.buildings = rebuildBuildingStats(state.grid);
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = 0;
  return state;
}

function makeObservation(state) {
  return new ColonyPerceiver().observe(state);
}

// (a) chain-planning instruction is reachable via the prompt the LLM sees.
//
// We assemble the same prompt body the LLM gets — we cannot peek at
// `SYSTEM_PROMPT` directly without exporting it, but `buildPlannerPrompt`'s
// reasoning ladder + the SYSTEM_PROMPT live in the same `userPrompt` once
// AgentDirectorSystem stitches them together. The contract under test is:
// the user prompt MUST instruct the LLM to use `depends_on` for chained
// steps, otherwise the LLM has no incentive to produce 4-8 step chains.
test("buildPlannerPrompt instructs the LLM to chain steps via depends_on", () => {
  const state = makeState();
  const obs = makeObservation(state);
  const prompt = buildPlannerPrompt(obs, "", state);
  // The instruction may live in the user prompt's preamble (chain block) or
  // in a dedicated section. Either way the literal "depends_on" must appear
  // alongside chain/precondition language so the model knows what to do.
  assert.match(prompt, /depends_on/, "prompt should mention depends_on");
  assert.match(prompt, /chain|precondition|sequence|order/i,
    "prompt should explain when to chain steps");
});

// (b) learnedSkillsText — when supplied, the prompt should embed it verbatim.
test("buildPlannerPrompt embeds learnedSkillsText in the user prompt", () => {
  const state = makeState();
  const obs = makeObservation(state);
  const learned = "## Learned Skills\n- skill_uniq_chain_xyz: 3 successful uses, food_rate +1.2";
  const prompt = buildPlannerPrompt(obs, "", state, learned, "");
  assert.match(prompt, /skill_uniq_chain_xyz/,
    "learnedSkillsText must appear in the prompt verbatim");
  assert.match(prompt, /Learned Skills/i,
    "learnedSkillsText section header must survive into the prompt");
});

// (c) evaluationText — when supplied, the prompt should embed it verbatim
//     so the model can avoid repeating last plan's failures.
test("buildPlannerPrompt embeds evaluationText (last-plan reflection)", () => {
  const state = makeState();
  const obs = makeObservation(state);
  const evalText = "## Last Plan Evaluation\nFailed: kitchen step blocked by stone shortage";
  const prompt = buildPlannerPrompt(obs, "", state, "", evalText);
  assert.match(prompt, /kitchen step blocked by stone shortage/,
    "evaluationText must appear in the prompt verbatim");
  assert.match(prompt, /Last Plan Evaluation/,
    "evaluationText section header must survive into the prompt");
});

// (d) validator still accepts a well-formed multi-step plan where every
//     later step depends_on at least one earlier step — i.e. the
//     "depends_on chain" shape we are now actively encouraging.
test("validatePlanResponse accepts a 5-step depends_on chain", () => {
  const raw = {
    goal: "infra → tools → food upgrade",
    horizon_sec: 120,
    reasoning: "Build a road, place quarry, then smithy, then tools chain unlocks farm boost.",
    steps: [
      { id: 1, thought: "road for logistics",        action: { type: "road",      hint: "near_cluster:c0" }, predicted_effect: { logistics: "+1" }, priority: "high",     depends_on: [] },
      { id: 2, thought: "quarry next to road",       action: { type: "quarry",    hint: "near_step:1"      }, predicted_effect: { stone_rate: "+0.3/s" }, priority: "high",     depends_on: [1] },
      { id: 3, thought: "smithy needs stone",        action: { type: "smithy",    hint: "near_step:2"      }, predicted_effect: { tools_rate: "+0.2/s" }, priority: "high",     depends_on: [1, 2] },
      { id: 4, thought: "kitchen relies on tools",   action: { type: "kitchen",   hint: "near_cluster:c0"  }, predicted_effect: { meals_rate: "+1/cycle" }, priority: "medium", depends_on: [3] },
      { id: 5, thought: "warehouse to absorb meals", action: { type: "warehouse", hint: "coverage_gap"     }, predicted_effect: { coverage: "+15%" },     priority: "medium", depends_on: [4] },
    ],
  };
  const { ok, plan, error } = validatePlanResponse(raw);
  assert.equal(ok, true, `should accept depends_on chain plan, error=${error}`);
  assert.equal(plan.steps.length, 5);
  assert.deepEqual(plan.steps[2].depends_on, [1, 2]);
  assert.deepEqual(plan.steps[4].depends_on, [4]);
  // Sanity: chain isn't broken by the validator's "fixup unknown ids" pass.
  for (const step of plan.steps) {
    for (const dep of step.depends_on) {
      assert.ok(plan.steps.some((s) => s.id === dep),
        `dep ${dep} must reference an existing step id`);
    }
  }
});
