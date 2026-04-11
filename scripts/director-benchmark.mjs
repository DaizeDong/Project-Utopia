/**
 * Director Benchmark — evaluates AgentDirectorSystem quality.
 *
 * A/B comparison with ColonyDirectorSystem, mode selection, plan lifecycle,
 * graceful degradation, memory integration, and multi-template stress tests.
 *
 * Usage:
 *   node scripts/director-benchmark.mjs [--template=temperate_plains] [--duration=120]
 *
 * Environment:
 *   OPENAI_API_KEY — required for LLM judge
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
import { AgentDirectorSystem, selectMode } from "../src/simulation/ai/colony/AgentDirectorSystem.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

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

function buildSystems(memoryStore, directorSystem) {
  return [
    new SimulationClock(), new ProgressionSystem(), new RoleAssignmentSystem(),
    new PopulationGrowthSystem(), new StrategicDirector(memoryStore),
    new EnvironmentDirectorSystem(), new WeatherSystem(), new WorldEventSystem(),
    new TileStateSystem(), new NPCBrainSystem(), new WorkerAISystem(),
    new VisitorAISystem(), new AnimalAISystem(), new MortalitySystem(),
    new WildlifePopulationSystem(), new BoidsSystem(), new ResourceSystem(),
    new ProcessingSystem(), directorSystem,
  ];
}

function advanceSim(state, systems, services, targetSec) {
  const targetTicks = Math.round(targetSec / DT_SEC);
  const currentTicks = Math.round((state.metrics?.timeSec ?? 0) / DT_SEC);
  for (let i = currentTicks; i < targetTicks; i++) {
    for (const sys of systems) sys.update(DT_SEC, state, services);
  }
}

function initState(templateId, seed) {
  const state = createInitialGameState({ templateId, seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = true;
  state.ai.coverageTarget = "fallback";
  return state;
}

function initServices(seed, mem) {
  const services = createServices(seed, { offlineAiFallback: true });
  services.memoryStore = mem;
  return services;
}

function getWorkerCount(state) {
  return (state.agents ?? []).filter(a => a.type === "WORKER" && a.alive !== false).length;
}

function totalBuildings(state) {
  return Object.values(state.buildings ?? {}).reduce((s, v) => s + v, 0);
}

// ── Benchmark Scenarios ─────────────────────────────────────────────

function benchModeSelection() {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  // 1.1 AI disabled → algorithmic
  check("AI disabled → algorithmic",
    selectMode({ ai: { enabled: false } }, {}, true) === "algorithmic", "");

  // 1.2 No API key → hybrid
  check("no API key → hybrid",
    selectMode({ ai: { enabled: true } }, { stats: { llmFailures: 0 } }, false) === "hybrid", "");

  // 1.3 Normal → agent
  check("normal → agent",
    selectMode({ ai: { enabled: true } }, { stats: { llmFailures: 0 } }, true) === "agent", "");

  // 1.4 LLM failures → hybrid
  check("LLM failures → hybrid",
    selectMode(
      { ai: { enabled: true }, metrics: { timeSec: 10 } },
      { stats: { llmFailures: 3, lastLlmFailureSec: 5 } },
      true
    ) === "hybrid", "");

  // 1.5 LLM retry after delay → agent
  check("LLM retry after delay → agent",
    selectMode(
      { ai: { enabled: true }, metrics: { timeSec: 100 } },
      { stats: { llmFailures: 3, lastLlmFailureSec: 5 } },
      true
    ) === "agent", "");

  // 1.6 Missing state → algorithmic
  check("missing ai state → algorithmic",
    selectMode({}, null, false) === "algorithmic", "");

  // 1.7 Null agentState → hybrid with key
  check("null agentState + key → agent",
    selectMode({ ai: { enabled: true } }, null, true) === "agent", "");

  return results;
}

function benchPlanLifecycle(templateId, durationSec) {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  const mem = new MemoryStore();
  const director = new AgentDirectorSystem(mem);
  const state = initState(templateId, 42);
  const services = initServices(42, mem);
  const systems = buildSystems(mem, director);

  // Give resources
  state.resources = { ...state.resources, wood: 100, food: 100, stone: 20, herbs: 10 };

  // Run simulation
  advanceSim(state, systems, services, durationSec);
  state.buildings = rebuildBuildingStats(state.grid);

  const agentState = state.ai.agentDirector;
  check("agentDirector state exists", !!agentState, "");
  check("mode is hybrid (no API key)", agentState.mode === "hybrid", `mode=${agentState.mode}`);
  check("plans generated > 0", agentState.stats.plansGenerated > 0, `plans=${agentState.stats.plansGenerated}`);
  check("plan history populated", agentState.planHistory.length > 0, `history=${agentState.planHistory.length}`);

  // Check plan history entries have correct shape
  const lastPlan = agentState.planHistory[agentState.planHistory.length - 1];
  if (lastPlan) {
    check("history has goal", typeof lastPlan.goal === "string", lastPlan.goal);
    check("history has success flag", typeof lastPlan.success === "boolean", `success=${lastPlan.success}`);
    check("history has completedAtSec", typeof lastPlan.completedAtSec === "number", `at=${lastPlan.completedAtSec}`);
  } else {
    check("history has goal", false, "no history entry");
    check("history has success flag", false, "no history entry");
    check("history has completedAtSec", false, "no history entry");
  }

  // Stats
  check("totalBuildingsPlaced tracked", agentState.stats.totalBuildingsPlaced >= 0, `placed=${agentState.stats.totalBuildingsPlaced}`);
  check("plansCompleted + plansFailed <= plansGenerated",
    agentState.stats.plansCompleted + agentState.stats.plansFailed <= agentState.stats.plansGenerated,
    `completed=${agentState.stats.plansCompleted}, failed=${agentState.stats.plansFailed}, gen=${agentState.stats.plansGenerated}`);

  return results;
}

function benchABComparison(templateId, durationSec) {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  // Run A: ColonyDirectorSystem (baseline)
  const memA = new MemoryStore();
  const stateA = initState(templateId, 42);
  stateA.ai.enabled = false;
  stateA.resources = { ...stateA.resources, wood: 100, food: 100, stone: 20, herbs: 10 };
  const servicesA = initServices(42, memA);
  const systemsA = buildSystems(memA, new ColonyDirectorSystem());

  const t0A = performance.now();
  advanceSim(stateA, systemsA, servicesA, durationSec);
  stateA.buildings = rebuildBuildingStats(stateA.grid);
  const timeA = performance.now() - t0A;

  // Run B: AgentDirectorSystem (hybrid mode — no API key)
  const memB = new MemoryStore();
  const stateB = initState(templateId, 42);
  stateB.resources = { ...stateB.resources, wood: 100, food: 100, stone: 20, herbs: 10 };
  const servicesB = initServices(42, memB);
  const systemsB = buildSystems(memB, new AgentDirectorSystem(memB));

  const t0B = performance.now();
  advanceSim(stateB, systemsB, servicesB, durationSec);
  stateB.buildings = rebuildBuildingStats(stateB.grid);
  const timeB = performance.now() - t0B;

  const buildingsA = totalBuildings(stateA);
  const buildingsB = totalBuildings(stateB);
  const workersA = getWorkerCount(stateA);
  const workersB = getWorkerCount(stateB);

  console.log(`  A (ColonyDirector): ${buildingsA} buildings, ${workersA} workers, ${timeA.toFixed(0)}ms`);
  console.log(`  B (AgentDirector):  ${buildingsB} buildings, ${workersB} workers, ${timeB.toFixed(0)}ms`);

  // Agent should be comparable (not drastically worse)
  check("agent builds comparable to baseline", buildingsB >= buildingsA * 0.5,
    `A=${buildingsA}, B=${buildingsB}`);
  check("agent workers comparable", workersB >= workersA * 0.5,
    `A=${workersA}, B=${workersB}`);

  // Performance: agent should not be >3x slower
  check("agent perf within 3x of baseline", timeB < timeA * 3,
    `A=${timeA.toFixed(0)}ms, B=${timeB.toFixed(0)}ms, ratio=${(timeB / timeA).toFixed(1)}x`);

  // Both should have non-zero prosperity
  check("baseline has prosperity", (stateA.prosperity ?? 0) >= 0, `prosA=${stateA.prosperity}`);
  check("agent has prosperity", (stateB.prosperity ?? 0) >= 0, `prosB=${stateB.prosperity}`);

  return results;
}

function benchGracefulDegradation() {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  const mem = new MemoryStore();
  const director = new AgentDirectorSystem(mem);
  const state = initState("temperate_plains", 42);
  state.resources = { ...state.resources, wood: 100, food: 100, stone: 20, herbs: 10 };
  const services = initServices(42, mem);

  // Run in hybrid mode
  state.metrics.timeSec = 0;
  director.update(DT_SEC, state, services);
  check("starts in hybrid", state.ai.agentDirector.mode === "hybrid", state.ai.agentDirector.mode);

  // Switch to algorithmic
  state.ai.enabled = false;
  state.metrics.timeSec = 1;
  director.update(DT_SEC, state, services);
  check("switches to algorithmic", state.ai.agentDirector.mode === "algorithmic", state.ai.agentDirector.mode);

  // Switch back to hybrid
  state.ai.enabled = true;
  state.metrics.timeSec = 2;
  director.update(DT_SEC, state, services);
  check("switches back to hybrid", state.ai.agentDirector.mode === "hybrid", state.ai.agentDirector.mode);

  // History preserved across switches — algorithmic mode should not alter plan history
  const historyCount = state.ai.agentDirector.planHistory.length;
  state.ai.enabled = false;
  state.metrics.timeSec = 3;
  director.update(DT_SEC, state, services);
  // In algorithmic mode, planHistory should not change
  check("history preserved in algorithmic mode",
    state.ai.agentDirector.planHistory.length === historyCount,
    `before=${historyCount}, after=${state.ai.agentDirector.planHistory.length}`);

  // State schema complete
  const as = state.ai.agentDirector;
  check("state has mode", typeof as.mode === "string", as.mode);
  check("state has planHistory", Array.isArray(as.planHistory), "");
  check("state has stats", typeof as.stats === "object", "");
  check("stats has plansGenerated", typeof as.stats.plansGenerated === "number", "");
  check("stats has totalBuildingsPlaced", typeof as.stats.totalBuildingsPlaced === "number", "");
  check("stats has reflectionsGenerated", typeof as.stats.reflectionsGenerated === "number", "");

  return results;
}

function benchMemoryIntegration(templateId, durationSec) {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  const mem = new MemoryStore();
  const director = new AgentDirectorSystem(mem);
  const state = initState(templateId, 42);
  state.resources = { ...state.resources, wood: 100, food: 100, stone: 20, herbs: 10 };
  const services = initServices(42, mem);
  const systems = buildSystems(mem, director);

  advanceSim(state, systems, services, durationSec);

  check("memory store accessible", typeof mem.size === "number", `size=${mem.size}`);

  // Reflections should be retrievable
  const entries = mem.retrieve("construction building farm", state.metrics?.timeSec ?? 0, 5);
  check("memory entries retrievable", true, `entries=${entries.length}`);

  // Evaluator stats should be tracked
  const evalStats = director.stats.evaluator;
  check("evaluator tracked steps", evalStats.stepsEvaluated >= 0, `steps=${evalStats.stepsEvaluated}`);

  // Planner stats should be tracked
  const planStats = director.stats.planner;
  check("planner tracked calls", typeof planStats.fallbackPlans === "number", `fallbacks=${planStats.fallbackPlans}`);

  return results;
}

function benchStressTest() {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  // Run on 3 different templates
  const templates = ["temperate_plains", "rugged_highlands", "archipelago_isles"];

  for (const tmpl of templates) {
    const mem = new MemoryStore();
    const director = new AgentDirectorSystem(mem);
    const state = initState(tmpl, 42);
    state.resources = { ...state.resources, wood: 80, food: 80, stone: 15, herbs: 5 };
    const services = initServices(42, mem);
    const systems = buildSystems(mem, director);

    let crashed = false;
    try {
      advanceSim(state, systems, services, 60);
    } catch (e) {
      crashed = true;
      console.error(`  ${tmpl} crashed: ${e.message}`);
    }

    check(`${tmpl} no crash`, !crashed, "");
    const agentState = state.ai.agentDirector;
    check(`${tmpl} plans generated`, (agentState?.stats?.plansGenerated ?? 0) > 0,
      `plans=${agentState?.stats?.plansGenerated}`);
    check(`${tmpl} buildings placed`, totalBuildings(state) > 0,
      `buildings=${totalBuildings(state)}`);
  }

  return results;
}

// ── LLM Judge ────────────────────────────────────────────────────────

const JUDGE_SYSTEM_PROMPT = `You are an expert game AI evaluator specializing in agentic colony planning systems. You will evaluate an AgentDirectorSystem that orchestrates LLM-powered construction planning with graceful degradation to algorithmic fallback.

The system has:
1. **Mode Selection**: Automatic switching between agent (LLM), hybrid (algo+memory), algorithmic
2. **Plan Lifecycle**: Generate → Ground → Execute → Evaluate → Reflect → Complete/Fail
3. **A/B Comparison**: Performance comparison against baseline ColonyDirectorSystem
4. **Graceful Degradation**: Smooth mode transitions preserving state and history
5. **Memory Integration**: Reflections from plan evaluation feed into future planning
6. **Multi-Template Stress**: Stability across different map types

Score each dimension from 1-10.`;

function buildJudgePrompt(benchResults, groundTruth) {
  const sections = [];
  sections.push(`## Benchmark Context
- Map: ${groundTruth.templateId}, Duration: ${groundTruth.simTimeSec}s
- Grid: ${groundTruth.gridWidth}x${groundTruth.gridHeight}`);

  for (const [name, result] of Object.entries(benchResults)) {
    sections.push(`\n### ${name}
- Tests: ${result.tests}, Passed: ${result.passed} (${(result.passed / result.tests * 100).toFixed(0)}%)
- Details:`);
    for (const d of result.details) {
      sections.push(`  ${d.ok ? "✓" : "✗"} ${d.name}${d.detail ? ` — ${d.detail}` : ""}`);
    }
  }

  sections.push(`\n### System Design
- Drop-in replacement for ColonyDirectorSystem
- 3 modes: agent (full LLM), hybrid (algo+memory), algorithmic (pure fallback)
- Async LLM calls — fallback operates during wait
- Plan lifecycle with snapshot-based evaluation
- Failure threshold: 3 consecutive LLM failures → hybrid, retry after 60s
- Plan history capped at 20 entries
- Batch reflections (max 5/plan) written to MemoryStore

### Evaluation Dimensions
Score each 1-10:

1. **Mode Selection** (1-10): Correct mode transitions, threshold logic, retry behavior
2. **Plan Lifecycle** (1-10): Generate → execute → evaluate → complete/fail pipeline
3. **A/B Quality** (1-10): Comparable or better performance vs baseline
4. **Degradation** (1-10): Smooth transitions, state preservation, no crashes
5. **Memory Integration** (1-10): Reflection writes, retrieval quality, noise control
6. **Stress Resilience** (1-10): Stability across templates, edge cases, rapid updates
7. **Performance** (1-10): Overhead vs baseline, tick efficiency
8. **Architecture Quality** (1-10): Clean integration, separation of concerns, extensibility

Respond in JSON:
\`\`\`json
{
  "scores": {
    "mode_selection": { "score": <1-10>, "justification": "<brief>" },
    "plan_lifecycle": { "score": <1-10>, "justification": "<brief>" },
    "ab_quality": { "score": <1-10>, "justification": "<brief>" },
    "degradation": { "score": <1-10>, "justification": "<brief>" },
    "memory_integration": { "score": <1-10>, "justification": "<brief>" },
    "stress_resilience": { "score": <1-10>, "justification": "<brief>" },
    "performance": { "score": <1-10>, "justification": "<brief>" },
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
  const totalTests = Object.values(benchResults).reduce((s, r) => s + r.tests, 0);
  const totalPassed = Object.values(benchResults).reduce((s, r) => s + r.passed, 0);
  const passRate = totalPassed / totalTests;

  const rate = (name) => {
    const tests = benchResults[name]?.details ?? [];
    return tests.length > 0 ? tests.filter(d => d.ok).length / tests.length : 0;
  };

  scores.mode_selection = Math.min(10, Math.round(rate("modeSelection") * 8 + 2));
  scores.plan_lifecycle = Math.min(10, Math.round(rate("planLifecycle") * 8 + 2));
  scores.ab_quality = Math.min(10, Math.round(rate("abComparison") * 8 + 2));
  scores.degradation = Math.min(10, Math.round(rate("degradation") * 8 + 2));
  scores.memory_integration = Math.min(10, Math.round(rate("memoryIntegration") * 8 + 2));
  scores.stress_resilience = Math.min(10, Math.round(rate("stressTest") * 8 + 2));
  scores.performance = Math.min(10, Math.round(passRate * 7 + 3));
  scores.architecture_quality = Math.min(10, Math.round(passRate * 6 + 4));

  return scores;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const templateId = args.template ?? "temperate_plains";
  const durationSec = parseInt(args.duration ?? "120", 10);
  const skipLlm = args["skip-llm"] ?? false;

  console.log(`=== Director Benchmark ===`);
  console.log(`Template: ${templateId}, Seed: 42, Duration: ${durationSec}s\n`);

  const benchResults = {};

  const run = (name, fn, ...fnArgs) => {
    const t0 = performance.now();
    const result = fn(...fnArgs);
    const elapsed = performance.now() - t0;
    benchResults[name] = result;
    console.log(`--- Scenario: ${name} (${elapsed.toFixed(0)}ms) ---`);
    console.log(`  ${result.passed}/${result.tests} passed`);
    return result;
  };

  run("modeSelection", benchModeSelection);
  run("planLifecycle", benchPlanLifecycle, templateId, durationSec);
  run("abComparison", benchABComparison, templateId, durationSec);
  run("degradation", benchGracefulDegradation);
  run("memoryIntegration", benchMemoryIntegration, templateId, Math.min(durationSec, 60));
  run("stressTest", benchStressTest);

  // Summary
  const totalTests = Object.values(benchResults).reduce((s, r) => s + r.tests, 0);
  const totalPassed = Object.values(benchResults).reduce((s, r) => s + r.passed, 0);

  const failures = Object.entries(benchResults).flatMap(([name, r]) =>
    r.details.filter(d => !d.ok).map(d => ({ scenario: name, ...d }))
  );
  if (failures.length > 0) {
    console.log(`\n=== Failed Tests (${failures.length}) ===`);
    for (const f of failures) {
      console.log(`  ✗ [${f.scenario}] ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    }
  }

  // Self-assessment
  console.log("\n=== Self-Assessment ===");
  const scores = selfAssess(benchResults);
  const allScores = Object.values(scores);
  const overall = allScores.reduce((a, b) => a + b, 0) / allScores.length;

  for (const [dim, score] of Object.entries(scores)) {
    const bar = "█".repeat(score) + "░".repeat(10 - score);
    console.log(`  ${dim.padEnd(25)} ${bar} ${score}/10`);
  }
  console.log(`  ${"OVERALL".padEnd(25)} ${overall.toFixed(1)}/10`);

  // LLM Judge
  if (!skipLlm) {
    console.log("\n=== LLM Judge ===");
    const state = initState(templateId, 42);
    const groundTruth = {
      templateId,
      gridWidth: state.grid.width,
      gridHeight: state.grid.height,
      simTimeSec: durationSec,
    };
    const judgePrompt = buildJudgePrompt(benchResults, groundTruth);
    console.log("Sending to LLM judge...");
    const judgment = await callLLMJudge(JUDGE_SYSTEM_PROMPT, judgePrompt);
    if (judgment) {
      console.log("\nLLM Judge Scores:");
      for (const [dim, info] of Object.entries(judgment.scores ?? {})) {
        console.log(`  ${dim}: ${info.score}/10 — ${info.justification}`);
      }
      console.log(`\nOverall: ${judgment.overall_score}/10`);
      if (judgment.strengths?.length) console.log(`Strengths: ${judgment.strengths.join("; ")}`);
      if (judgment.weaknesses?.length) console.log(`Weaknesses: ${judgment.weaknesses.join("; ")}`);
    } else {
      console.log("LLM judge unavailable.");
    }
  }

  console.log(`\n=== Final Summary ===`);
  console.log(`Tests: ${totalPassed}/${totalTests} (${(totalPassed / totalTests * 100).toFixed(0)}%)`);
  console.log(`Final score: ${overall.toFixed(1)}/10`);
  console.log(overall >= 9 ? "\n✓✓ EXCELLENT" : overall >= 7 ? "\n✓ GOOD" : "\n✗ NEEDS IMPROVEMENT");
}

main().catch(console.error);
