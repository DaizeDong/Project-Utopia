/**
 * Planner Benchmark — evaluates ColonyPlanner quality (prompt, validation, fallback, LLM).
 *
 * Tests prompt construction, response validation, fallback plan quality, trigger logic,
 * and optionally end-to-end LLM plan generation with quality scoring.
 *
 * Usage:
 *   node scripts/planner-benchmark.mjs [--template=temperate_plains] [--duration=180]
 *
 * Environment:
 *   OPENAI_API_KEY — required for LLM judge + live planner test
 *   OPENAI_BASE_URL — optional
 */
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { SimulationClock } from "../src/app/SimulationClock.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { StrategicDirector } from "../src/simulation/ai/strategic/StrategicDirector.js";
import { EnvironmentDirectorSystem } from "../src/simulation/ai/director/EnvironmentDirectorSystem.js";
import { WeatherSystem } from "../src/world/weather/WeatherSystem.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { TileStateSystem } from "../src/simulation/economy/TileStateSystem.js";
import { NPCBrainSystem } from "../src/simulation/ai/brains/NPCBrainSystem.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { VisitorAISystem } from "../src/simulation/npc/VisitorAISystem.js";
import { AnimalAISystem } from "../src/simulation/npc/AnimalAISystem.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { WildlifePopulationSystem } from "../src/simulation/ecology/WildlifePopulationSystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";
import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";
import { ProcessingSystem } from "../src/simulation/economy/ProcessingSystem.js";
import { PopulationGrowthSystem } from "../src/simulation/population/PopulationGrowthSystem.js";
import { ColonyDirectorSystem } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { ColonyPerceiver, formatObservationForLLM } from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

import {
  ColonyPlanner, buildPlannerPrompt, validatePlanResponse,
  generateFallbackPlan, shouldReplan,
} from "../src/simulation/ai/colony/ColonyPlanner.js";
import {
  groundPlan, executeNextSteps, isPlanComplete, getPlanProgress,
} from "../src/simulation/ai/colony/PlanExecutor.js";

const DT_SEC = 1 / 30;

function parseArgs() {
  const args = {};
  for (const token of process.argv.slice(2)) {
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq < 0) { args[token.slice(2)] = true; continue; }
    args[token.slice(2, eq)] = token.slice(eq + 1);
  }
  return args;
}

function buildSystems(memoryStore) {
  return [
    new SimulationClock(), new ProgressionSystem(), new RoleAssignmentSystem(),
    new PopulationGrowthSystem(), new StrategicDirector(memoryStore),
    new EnvironmentDirectorSystem(), new WeatherSystem(), new WorldEventSystem(),
    new TileStateSystem(), new NPCBrainSystem(), new WorkerAISystem(),
    new VisitorAISystem(), new AnimalAISystem(), new MortalitySystem(),
    new WildlifePopulationSystem(), new BoidsSystem(), new ResourceSystem(),
    new ProcessingSystem(), new ColonyDirectorSystem(),
  ];
}

function advanceSim(state, systems, services, targetSec) {
  const targetTicks = Math.round(targetSec / DT_SEC);
  const currentTicks = Math.round((state.metrics?.timeSec ?? 0) / DT_SEC);
  for (let i = currentTicks; i < targetTicks; i++) {
    for (const sys of systems) sys.update(DT_SEC, state, services);
  }
}

// ── Benchmark Scenarios ─────────────────────────────────────────────

function benchPromptConstruction(state, perceiver) {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  const obs = perceiver.observe(state);

  // 1.1 Basic prompt structure
  const prompt = buildPlannerPrompt(obs, "", state);
  check("prompt non-empty", prompt.length > 100, `length=${prompt.length}`);
  check("prompt contains observation", prompt.includes("Colony State"), "");
  check("prompt contains skill availability", prompt.includes("Skill Availability"), "");
  check("prompt contains affordable section", prompt.includes("Affordable Buildings"), "");

  // 1.2 Token efficiency — prompt should be under ~2000 tokens (~8000 chars)
  check("prompt under 8000 chars", prompt.length < 8000, `length=${prompt.length}`);

  // 1.3 With memory
  const memPrompt = buildPlannerPrompt(obs, "[T=30s, reflection] Farm underperformed due to low moisture.", state);
  check("prompt includes memory", memPrompt.includes("Recent Reflections"), "");
  check("prompt includes memory content", memPrompt.includes("underperformed"), "");

  // 1.4 Prompt changes with state
  const richState = { ...state, resources: { ...state.resources, wood: 200, stone: 50, food: 200, herbs: 20 } };
  richState.buildings = { ...state.buildings, farms: 10 };
  const richPrompt = buildPlannerPrompt(obs, "", richState);
  check("rich state shows affordable skills", richPrompt.includes("Affordable:") && richPrompt.includes("Logistics Hub"), "");

  // 1.5 Prompt with poor state
  const poorState = { ...state, resources: { food: 2, wood: 1, stone: 0, herbs: 0 } };
  const poorObs = perceiver.observe(poorState);
  const poorPrompt = buildPlannerPrompt(poorObs, "", poorState);
  check("poor state shows unaffordable", poorPrompt.includes("Unaffordable"), "");

  return results;
}

function benchValidation() {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  // 2.1 Valid plan
  const valid = validatePlanResponse({
    goal: "expand food production",
    horizon_sec: 60,
    reasoning: "Food declining, need farms.",
    steps: [
      { id: 1, action: { type: "farm", hint: "near_cluster:c0" }, priority: "high", depends_on: [] },
      { id: 2, action: { type: "road", hint: "near_step:1" }, priority: "low", depends_on: [1] },
    ],
  });
  check("valid plan accepted", valid.ok, valid.error);
  check("plan has 2 steps", valid.plan?.steps?.length === 2, "");

  // 2.2 Skill action
  const skillPlan = validatePlanResponse({
    goal: "fortify",
    steps: [{ id: 1, action: { type: "skill", skill: "defense_line", hint: null }, priority: "high", depends_on: [] }],
  });
  check("skill plan accepted", skillPlan.ok, skillPlan.error);

  // 2.3 Reject bad input
  check("null rejected", !validatePlanResponse(null).ok, "");
  check("empty steps rejected", !validatePlanResponse({ goal: "test", steps: [] }).ok, "");
  check("unknown type rejected", !validatePlanResponse({ goal: "test", steps: [{ id: 1, action: { type: "castle" }, depends_on: [] }] }).ok, "");
  check("unknown skill rejected", !validatePlanResponse({ goal: "test", steps: [{ id: 1, action: { type: "skill", skill: "mega" }, depends_on: [] }] }).ok, "");

  // 2.4 Robustness — malformed but salvageable
  const partial = validatePlanResponse({
    goal: "test",
    steps: [
      { id: 1, action: { type: "road" } },
      { id: 2 }, // missing action
      { id: 3, action: { type: "farm" }, priority: "high", depends_on: [] },
    ],
  });
  check("partial plan salvaged", partial.ok && partial.plan.steps.length === 2, `steps=${partial.plan?.steps?.length}`);

  // 2.5 Dedup ids
  const dedup = validatePlanResponse({
    goal: "test",
    steps: [
      { id: 1, action: { type: "road" }, depends_on: [] },
      { id: 1, action: { type: "farm" }, depends_on: [] },
    ],
  });
  check("duplicate id handled", dedup.ok && dedup.plan.steps.length === 1, "");

  // 2.6 Truncation
  const long = validatePlanResponse({
    goal: "x".repeat(200),
    reasoning: "y".repeat(500),
    steps: [{ id: 1, thought: "z".repeat(200), action: { type: "road" }, depends_on: [] }],
  });
  check("long fields truncated", long.ok && long.plan.goal.length <= 60 && long.plan.reasoning.length <= 300, "");

  // 2.7 Invalid depends_on cleanup
  const depFix = validatePlanResponse({
    goal: "test",
    steps: [{ id: 1, action: { type: "road" }, depends_on: [99, "foo"] }],
  });
  check("invalid deps cleaned", depFix.ok && depFix.plan.steps[0].depends_on.length === 0, "");

  return results;
}

function benchFallbackPlan(state, perceiver) {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  // 3.1 Normal state fallback
  const obs = perceiver.observe(state);
  const plan = generateFallbackPlan(obs, state);
  check("fallback has steps", plan.steps.length > 0, `steps=${plan.steps.length}`);
  check("fallback has goal", plan.goal.length > 0, plan.goal);
  check("fallback source=fallback", plan.source === "fallback", "");
  check("fallback steps <= 8", plan.steps.length <= 8, "");

  // 3.2 Fallback passes own validation
  const { ok: selfValid, error: selfError } = validatePlanResponse(plan);
  check("fallback passes validation", selfValid, selfError);

  // 3.3 Fallback is executable — ground and check
  const buildSystem = new BuildSystem();
  state.resources = { food: 200, wood: 200, stone: 50, herbs: 20, meals: 0, tools: 0, medicine: 0 };
  const grounded = groundPlan(plan, state, buildSystem);
  const feasible = grounded.steps.filter(s => s.feasible).length;
  check("fallback plan groundable", feasible > 0, `feasible=${feasible}/${grounded.steps.length}`);

  // 3.4 Execute fallback plan
  const oldBuildings = Object.values(state.buildings).reduce((s, v) => s + v, 0);
  let maxTicks = 10;
  while (!isPlanComplete(grounded) && maxTicks-- > 0) {
    executeNextSteps(grounded, state, buildSystem);
    state.buildings = rebuildBuildingStats(state.grid);
  }
  const newBuildings = Object.values(state.buildings).reduce((s, v) => s + v, 0);
  const progress = getPlanProgress(grounded);
  check("fallback plan executed", progress.completed > 0, `completed=${progress.completed}/${progress.total}`);
  check("fallback placed buildings", newBuildings > oldBuildings, `old=${oldBuildings}, new=${newBuildings}`);

  // 3.5 Food crisis fallback — use fresh metrics to avoid time regression
  const crisisMetrics = { ...state.metrics, timeSec: 0 };
  const crisisState = { ...state, resources: { food: 10, wood: 30, stone: 5, herbs: 0, meals: 0, tools: 0, medicine: 0 }, metrics: crisisMetrics };
  const crisisPerceiver = new ColonyPerceiver();
  crisisPerceiver.observe(crisisState);
  crisisMetrics.timeSec = 2;
  crisisState.resources.food = 5;
  crisisPerceiver.observe(crisisState);
  crisisMetrics.timeSec = 4;
  crisisState.resources.food = 2;
  const crisisObs = crisisPerceiver.observe(crisisState);
  const crisisPlan = generateFallbackPlan(crisisObs, crisisState);
  const hasFarm = crisisPlan.steps.some(s => s.action.type === "farm");
  check("crisis fallback prioritizes farms", hasFarm, crisisPlan.steps.map(s => s.action.type).join(","));

  return results;
}

function benchTriggerLogic() {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  const normalObs = { economy: { food: { rate: 0.5, stock: 50 }, wood: { stock: 30 } } };
  const crisisObs = { economy: { food: { rate: -2, stock: 15 }, wood: { stock: 30 } } };
  const richObs = { economy: { food: { rate: 0.5, stock: 50 }, wood: { stock: 150 } } };

  check("no plan → replan", shouldReplan(30, 5, normalObs, false).should, "");
  check("cooldown respected", !shouldReplan(25, 15, normalObs, true).should, "");
  check("heartbeat at 30s", shouldReplan(60, 25, normalObs, true).should, "");
  check("food crisis triggers", shouldReplan(40, 25, crisisObs, true).should, "");
  check("resource opportunity triggers", shouldReplan(40, 25, richObs, true).should, "");
  check("normal state no trigger", !shouldReplan(30, 22, normalObs, true).should, "");

  return results;
}

async function benchLiveLLM(state, perceiver) {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    check("live LLM (skipped: no API key)", true, "");
    return results;
  }

  const planner = new ColonyPlanner({ apiKey, baseUrl, model, timeoutMs: 60000 });
  const obs = perceiver.observe(state);

  console.log("  Calling LLM for plan generation...");
  const { plan, source, error } = await planner.requestPlan(obs, "", state);

  check("LLM call completed", source === "llm" || source === "fallback", `source=${source}`);

  if (source === "llm") {
    check("LLM plan has goal", plan.goal?.length > 0, plan.goal);
    check("LLM plan has steps", plan.steps?.length >= 1, `steps=${plan.steps?.length}`);
    check("LLM plan has reasoning", plan.reasoning?.length > 0, plan.reasoning?.slice(0, 80));

    // Check step quality
    for (const step of plan.steps) {
      check(`LLM step ${step.id} has thought`, step.thought?.length > 0, step.thought?.slice(0, 60));
      check(`LLM step ${step.id} valid type`, step.action?.type != null, step.action?.type);
    }

    // Ground and check feasibility
    const buildSystem = new BuildSystem();
    state.resources = { food: 200, wood: 200, stone: 50, herbs: 20, meals: 0, tools: 0, medicine: 0 };
    const grounded = groundPlan(plan, state, buildSystem);
    const feasible = grounded.steps.filter(s => s.feasible).length;
    check("LLM plan groundable", feasible > 0, `feasible=${feasible}/${grounded.steps.length}`);

    console.log(`  LLM plan: "${plan.goal}" — ${plan.steps.length} steps, ${feasible} feasible`);
    for (const step of plan.steps) {
      const gStep = grounded.steps.find(s => s.id === step.id);
      console.log(`    [${step.id}] ${step.action.skill ?? step.action.type} → ${gStep?.feasible ? "✓" : "✗"} ${step.thought?.slice(0, 50)}`);
    }
  } else {
    check("LLM fallback reason logged", planner.stats.lastError.length > 0, planner.stats.lastError);
    console.log(`  LLM failed, using fallback: ${planner.stats.lastError}`);
  }

  return results;
}

// ── LLM Judge ────────────────────────────────────────────────────────

const JUDGE_SYSTEM_PROMPT = `You are an expert game AI evaluator specializing in LLM-powered planning systems. You will evaluate the quality of a ColonyPlanner system that generates construction plans for a colony simulation.

The system has:
1. **Prompt Construction**: Builds structured prompts from observations + memory + skill availability
2. **Response Validation**: Parses, sanitizes, and validates LLM JSON responses
3. **Fallback Generation**: Algorithmic plan generation when LLM is unavailable
4. **Trigger Logic**: Decides when to replan (heartbeat, crisis, opportunity)
5. **End-to-end LLM Integration**: Calls OpenAI-compatible API and grounds results

Good planning systems should:
1. Construct token-efficient, information-dense prompts
2. Robustly handle malformed LLM responses
3. Generate sensible fallback plans that address colony needs
4. Trigger replanning at appropriate moments
5. Produce plans that are groundable and executable

Score each dimension from 1-10.`;

function buildJudgePrompt(benchResults, groundTruth) {
  const sections = [];
  sections.push(`## Benchmark Context
- Map: ${groundTruth.templateId}, Grid: ${groundTruth.gridWidth}x${groundTruth.gridHeight}
- Sim time: ${groundTruth.simTimeSec}s, Workers: ${groundTruth.workers}, Buildings: ${groundTruth.totalBuildings}
- Resources: food=${groundTruth.food}, wood=${groundTruth.wood}, stone=${groundTruth.stone}`);

  for (const [name, result] of Object.entries(benchResults)) {
    sections.push(`\n### ${name}
- Tests: ${result.tests}, Passed: ${result.passed} (${(result.passed / result.tests * 100).toFixed(0)}%)
- Details:`);
    for (const d of result.details) {
      sections.push(`  ${d.ok ? "✓" : "✗"} ${d.name}${d.detail ? ` — ${d.detail}` : ""}`);
    }
  }

  sections.push(`\n### System Design
- Prompt includes: observation, memory reflections, skill availability, affordable buildings
- Validation: truncation, dedup, dep fixup, type checking, priority defaults
- Fallback priorities: food crisis → coverage gap → wood shortage → processing → defense → roads → expansion
- Triggers: no_active_plan, heartbeat (30s), food_crisis, resource_opportunity, cooldown (20s)

### Evaluation Dimensions
Score each 1-10:

1. **Prompt Quality** (1-10): Token efficiency, information density, context relevance for LLM planning
2. **Validation Robustness** (1-10): Handles malformed input, edge cases, partial salvage, sanitization
3. **Fallback Intelligence** (1-10): Priority logic, crisis response, state-adaptive planning, executability
4. **Trigger Design** (1-10): Appropriate replan conditions, cooldown, crisis/opportunity detection
5. **Integration Quality** (1-10): End-to-end plan flow (prompt → LLM → validate → ground → execute)
6. **Error Resilience** (1-10): Graceful degradation, timeout handling, invalid response recovery
7. **Strategic Depth** (1-10): Does fallback show understanding of colony economics? Resource chains?
8. **Architecture Quality** (1-10): Clean API, separation of concerns, testability, extensibility

Respond in JSON:
\`\`\`json
{
  "scores": {
    "prompt_quality": { "score": <1-10>, "justification": "<brief>" },
    "validation_robustness": { "score": <1-10>, "justification": "<brief>" },
    "fallback_intelligence": { "score": <1-10>, "justification": "<brief>" },
    "trigger_design": { "score": <1-10>, "justification": "<brief>" },
    "integration_quality": { "score": <1-10>, "justification": "<brief>" },
    "error_resilience": { "score": <1-10>, "justification": "<brief>" },
    "strategic_depth": { "score": <1-10>, "justification": "<brief>" },
    "architecture_quality": { "score": <1-10>, "justification": "<brief>" }
  },
  "overall_score": <1-10>,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "improvement_suggestions": ["..."]
}
\`\`\``);

  return sections.join("\n");
}

async function callLLMJudge(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.JUDGE_MODEL || "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.3, max_tokens: 2000,
      }),
    });
    if (!resp.ok) { console.error(`LLM judge HTTP ${resp.status}`); return null; }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
    return jsonMatch ? JSON.parse(jsonMatch[1]) : null;
  } catch (err) { console.error(`LLM judge error: ${err.message}`); return null; }
}

function selfAssess(benchResults) {
  const scores = {};
  const allDetails = Object.values(benchResults).flatMap(r => r.details);
  const totalTests = Object.values(benchResults).reduce((s, r) => s + r.tests, 0);
  const totalPassed = Object.values(benchResults).reduce((s, r) => s + r.passed, 0);
  const passRate = totalPassed / totalTests;

  const rate = (name) => {
    const tests = benchResults[name]?.details ?? [];
    return tests.length > 0 ? tests.filter(d => d.ok).length / tests.length : 0;
  };

  scores.prompt_quality = Math.min(10, Math.round(rate("promptConstruction") * 8 + 2));
  scores.validation_robustness = Math.min(10, Math.round(rate("validation") * 8 + 2));
  scores.fallback_intelligence = Math.min(10, Math.round(rate("fallbackPlan") * 8 + 2));
  scores.trigger_design = Math.min(10, Math.round(rate("triggerLogic") * 8 + 2));
  scores.integration_quality = Math.min(10, Math.round(rate("liveLLM") * 7 + 3));
  scores.error_resilience = Math.min(10, Math.round(passRate * 7 + 3));
  scores.strategic_depth = Math.min(10, Math.round(rate("fallbackPlan") * 7 + 3));
  scores.architecture_quality = Math.min(10, Math.round(passRate * 8 + 2));

  const overall = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / 8 * 10) / 10;
  return { scores, overall };
}

// ── Main ─────────────────────────────────────────────────────────────

async function run() {
  const args = parseArgs();
  const duration = Number(args.duration) || 180;
  const templateId = args.template || "temperate_plains";
  const seed = Number(args.seed) || 42;
  const skipLlm = args["skip-llm"] === true;

  console.log(`\n=== Planner Benchmark ===`);
  console.log(`Template: ${templateId}, Seed: ${seed}, Duration: ${duration}s\n`);

  const state = createInitialGameState({ templateId, seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = true;
  state.ai.coverageTarget = "fallback";

  const memoryStore = new MemoryStore();
  const services = createServices(seed, { offlineAiFallback: true });
  services.memoryStore = memoryStore;
  const systems = buildSystems(memoryStore);

  console.log(`Advancing simulation ${duration}s...`);
  const simStart = performance.now();
  advanceSim(state, systems, services, duration);
  state.buildings = rebuildBuildingStats(state.grid);
  console.log(`Done in ${Math.round(performance.now() - simStart)}ms`);
  console.log(`  Workers: ${state.agents.filter(a => a.type === "WORKER" && a.alive !== false).length}, Buildings: ${JSON.stringify(state.buildings)}\n`);

  const perceiver = new ColonyPerceiver();
  // Build rate data
  perceiver.observe(state);
  state.metrics.timeSec += 2;
  perceiver.observe(state);
  state.metrics.timeSec += 2;

  const benchResults = {};

  console.log("--- Scenario 1: Prompt Construction ---");
  benchResults.promptConstruction = benchPromptConstruction(state, perceiver);
  console.log(`  ${benchResults.promptConstruction.passed}/${benchResults.promptConstruction.tests} passed`);

  console.log("--- Scenario 2: Validation Robustness ---");
  benchResults.validation = benchValidation();
  console.log(`  ${benchResults.validation.passed}/${benchResults.validation.tests} passed`);

  console.log("--- Scenario 3: Fallback Plan Quality ---");
  benchResults.fallbackPlan = benchFallbackPlan(state, perceiver);
  console.log(`  ${benchResults.fallbackPlan.passed}/${benchResults.fallbackPlan.tests} passed`);

  console.log("--- Scenario 4: Trigger Logic ---");
  benchResults.triggerLogic = benchTriggerLogic();
  console.log(`  ${benchResults.triggerLogic.passed}/${benchResults.triggerLogic.tests} passed`);

  console.log("--- Scenario 5: Live LLM Integration ---");
  benchResults.liveLLM = await benchLiveLLM(state, perceiver);
  console.log(`  ${benchResults.liveLLM.passed}/${benchResults.liveLLM.tests} passed`);

  // Failed tests
  const allFailed = Object.entries(benchResults).flatMap(([name, r]) =>
    r.details.filter(d => !d.ok).map(d => ({ scenario: name, ...d }))
  );
  if (allFailed.length > 0) {
    console.log(`\n=== Failed Tests (${allFailed.length}) ===`);
    for (const f of allFailed) console.log(`  ✗ [${f.scenario}] ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  }

  // Self-assessment
  console.log("\n=== Self-Assessment ===");
  const selfResult = selfAssess(benchResults);
  for (const [dim, score] of Object.entries(selfResult.scores)) {
    const bar = "█".repeat(score) + "░".repeat(10 - score);
    console.log(`  ${dim.padEnd(26)} ${bar} ${score}/10`);
  }
  console.log(`  ${"OVERALL".padEnd(26)} ${selfResult.overall}/10`);

  // LLM judge
  let llmResult = null;
  if (!skipLlm) {
    console.log("\n=== LLM Judge ===");
    const groundTruth = {
      templateId, simTimeSec: duration,
      gridWidth: state.grid.width, gridHeight: state.grid.height,
      workers: state.agents.filter(a => a.type === "WORKER" && a.alive !== false).length,
      totalBuildings: Object.values(state.buildings).reduce((s, v) => s + v, 0),
      food: Math.round(state.resources.food), wood: Math.round(state.resources.wood), stone: Math.round(state.resources.stone),
    };
    console.log("Sending to LLM judge...");
    llmResult = await callLLMJudge(JUDGE_SYSTEM_PROMPT, buildJudgePrompt(benchResults, groundTruth));
    if (llmResult) {
      console.log("\nLLM Judge Scores:");
      for (const [dim, val] of Object.entries(llmResult.scores ?? {})) {
        const score = val.score ?? 0;
        console.log(`  ${dim.padEnd(26)} ${"█".repeat(score)}${"░".repeat(10 - score)} ${score}/10  ${val.justification ?? ""}`);
      }
      console.log(`  ${"OVERALL".padEnd(26)} ${llmResult.overall_score ?? "?"}/10`);
      if (llmResult.strengths?.length) { console.log("\n  Strengths:"); for (const s of llmResult.strengths) console.log(`    + ${s}`); }
      if (llmResult.weaknesses?.length) { console.log("  Weaknesses:"); for (const w of llmResult.weaknesses) console.log(`    - ${w}`); }
      if (llmResult.improvement_suggestions?.length) { console.log("  Suggestions:"); for (const s of llmResult.improvement_suggestions) console.log(`    > ${s}`); }
    } else { console.log("LLM judge unavailable."); }
  }

  const totalTests = Object.values(benchResults).reduce((s, r) => s + r.tests, 0);
  const totalPassed = Object.values(benchResults).reduce((s, r) => s + r.passed, 0);
  const finalScore = llmResult?.overall_score ?? selfResult.overall;
  console.log(`\n=== Final Summary ===`);
  console.log(`Tests: ${totalPassed}/${totalTests} (${(totalPassed / totalTests * 100).toFixed(0)}%)`);
  console.log(`Final score: ${finalScore}/10`);
  if (finalScore >= 8) console.log("\n✓✓ EXCELLENT");
  else if (finalScore >= 6) console.log("\n✓ PASSING");
  else { console.log("\n⚠ BELOW THRESHOLD"); process.exitCode = 1; }

  return { benchResults, selfAssessment: selfResult, llmAssessment: llmResult, finalScore };
}

run().catch(err => { console.error(err); process.exit(1); });
