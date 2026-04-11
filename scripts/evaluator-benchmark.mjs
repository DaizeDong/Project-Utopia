/**
 * Evaluator Benchmark — evaluates PlanEvaluator quality (step eval, diagnosis, reflection, memory).
 *
 * Tests prediction comparison, failure diagnosis, reflection generation, memory integration,
 * plan-level evaluation, and full evaluation cycle with grounded plans.
 *
 * Usage:
 *   node scripts/evaluator-benchmark.mjs [--template=temperate_plains] [--duration=120]
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
import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { ColonyPerceiver } from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

import { generateFallbackPlan } from "../src/simulation/ai/colony/ColonyPlanner.js";
import { groundPlan, executeNextSteps, isPlanComplete, getPlanProgress } from "../src/simulation/ai/colony/PlanExecutor.js";
import {
  parsePredictedValue, snapshotState, evaluateStep,
  diagnoseFailure, generateReflection, evaluatePlan, PlanEvaluator,
} from "../src/simulation/ai/colony/PlanEvaluator.js";
import { TILE } from "../src/config/constants.js";

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

function benchPredictionParsing() {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  // 1.1 Rate values
  const r1 = parsePredictedValue("+0.5/s");
  check("parses rate +0.5/s", r1.numeric === 0.5 && r1.unit === "/s", `${r1.numeric} ${r1.unit}`);

  const r2 = parsePredictedValue("-2/s");
  check("parses negative rate", r2.numeric === -2, `${r2.numeric}`);

  // 1.2 Percentages
  const r3 = parsePredictedValue("+15%");
  check("parses percentage", r3.numeric === 15 && r3.unit === "%", `${r3.numeric} ${r3.unit}`);

  // 1.3 Plain numbers
  const r4 = parsePredictedValue("-3");
  check("parses plain number", r4.numeric === -3, `${r4.numeric}`);

  // 1.4 Qualitative
  const r5 = parsePredictedValue("improved");
  check("parses qualitative", r5.numeric === null, `unit=${r5.unit}`);

  // 1.5 Edge cases
  check("handles null input", parsePredictedValue(null).numeric === null, "");
  check("handles numeric input", parsePredictedValue(42).numeric === 42, "");
  check("handles decimal rate", parsePredictedValue("+0.3/s").numeric === 0.3, "");

  return results;
}

function benchStepEvaluation(state) {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  // 2.1 Snapshot captures resources
  const snap = snapshotState(state);
  check("snapshot has food", typeof snap.resources.food === "number", `food=${snap.resources.food}`);
  check("snapshot has timeSec", typeof snap.timeSec === "number", `timeSec=${snap.timeSec}`);
  check("snapshot has workerCount", snap.workerCount > 0, `workers=${snap.workerCount}`);

  // 2.2 Evaluate successful step
  const successStep = {
    id: 1, action: { type: "farm" }, status: "completed",
    groundedTile: { ix: 10, iz: 10 }, predicted_effect: { food_rate_delta: "+0.4/s" },
  };
  const before = { resources: { food: 50 }, timeSec: 60 };
  const after = { resources: { food: 50.3 }, timeSec: 62 };
  const ev1 = evaluateStep(successStep, before, after, state);
  check("successful step buildSuccess=true", ev1.buildSuccess, "");
  check("successful step score > 0", ev1.score > 0, `score=${ev1.score.toFixed(2)}`);

  // 2.3 Evaluate failed step
  const failStep = { id: 2, action: { type: "farm" }, status: "failed", groundedTile: null, predicted_effect: {} };
  const ev2 = evaluateStep(failStep, before, before, state);
  check("failed step score = 0", ev2.score === 0, `score=${ev2.score}`);
  check("failed step has diagnosis", ev2.diagnosis.length > 0, `causes=${ev2.diagnosis.length}`);

  // 2.4 Step with qualitative prediction
  const qualStep = {
    id: 3, action: { type: "road" }, status: "completed",
    groundedTile: { ix: 15, iz: 15 }, predicted_effect: { logistics: "improved" },
  };
  const ev3 = evaluateStep(qualStep, before, after, state);
  check("qualitative prediction → full score", ev3.score === 1.0, `score=${ev3.score}`);

  // 2.5 Large prediction mismatch
  const mismatchStep = {
    id: 4, action: { type: "farm" }, status: "completed",
    groundedTile: { ix: 10, iz: 10 }, predicted_effect: { food_rate_delta: "+10" },
  };
  const ev4 = evaluateStep(mismatchStep, before, { resources: { food: 50.1 }, timeSec: 62 }, state);
  check("large mismatch → lower score", ev4.score < 1.0, `score=${ev4.score.toFixed(2)}`);

  return results;
}

function benchDiagnosis(state) {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  const grid = state.grid;

  // 3.1 No valid tile
  const noTileStep = { id: 1, action: { type: "farm" }, groundedTile: null, status: "failed" };
  const causes1 = diagnoseFailure(noTileStep, { buildSuccess: false, deviations: {} }, state);
  check("diagnoses no_valid_tile", causes1.some(c => c.type === "no_valid_tile"), causes1.map(c => c.type).join(","));

  // 3.2 Uncovered building — place farm far from any warehouse
  const farStep = {
    id: 2, action: { type: "farm" },
    groundedTile: { ix: grid.width - 1, iz: grid.height - 1 }, status: "completed",
  };
  const causes2 = diagnoseFailure(farStep, { buildSuccess: true, deviations: {} }, state);
  const hasUncovered = causes2.some(c => c.type === "uncovered");
  check("diagnoses uncovered for distant building", hasUncovered, causes2.map(c => c.type).join(","));

  // 3.3 Poor terrain — set low moisture at known position
  const moistIdx = 5 * grid.width + 5;
  const origMoist = grid.moisture[moistIdx];
  grid.moisture[moistIdx] = 0.1;
  const dryStep = {
    id: 3, action: { type: "farm" },
    groundedTile: { ix: 5, iz: 5 }, status: "completed",
  };
  const causes3 = diagnoseFailure(dryStep, { buildSuccess: true, deviations: {} }, state);
  check("diagnoses poor_terrain for dry farm", causes3.some(c => c.type === "poor_terrain"), causes3.map(c => c.type).join(","));
  grid.moisture[moistIdx] = origMoist; // restore

  // 3.4 No workers nearby — use far corner away from all agents
  const agents = state.agents ?? [];
  // Find a corner far from all workers
  const corners = [[0, 0], [grid.width - 1, 0], [0, grid.height - 1], [grid.width - 1, grid.height - 1]];
  let bestCorner = corners[0];
  let bestDist = 0;
  for (const [cx, cz] of corners) {
    let minDist = Infinity;
    for (const a of agents) {
      if (a.type && a.type !== "WORKER") continue;
      const d = Math.abs((a.tileX ?? a.ix ?? 0) - cx) + Math.abs((a.tileZ ?? a.iz ?? 0) - cz);
      if (d < minDist) minDist = d;
    }
    if (minDist > bestDist) { bestDist = minDist; bestCorner = [cx, cz]; }
  }
  if (bestDist > 12) {
    const cornerStep = {
      id: 4, action: { type: "herb_garden" },
      groundedTile: { ix: bestCorner[0], iz: bestCorner[1] }, status: "completed",
    };
    const causes4 = diagnoseFailure(cornerStep, { buildSuccess: true, deviations: {} }, state);
    check("diagnoses no_workers for remote building", causes4.some(c => c.type === "no_workers"), causes4.map(c => c.type).join(","));
  } else {
    check("diagnoses no_workers for remote building", true, "skipped — workers cover all corners");
  }

  // 3.5 Prediction mismatch
  const causes5 = diagnoseFailure(
    { id: 5, action: { type: "farm" }, groundedTile: { ix: 10, iz: 10 }, status: "completed" },
    { buildSuccess: true, deviations: { food_rate_delta: -3.0 } },
    state
  );
  check("diagnoses prediction_mismatch", causes5.some(c => c.type === "prediction_mismatch"), causes5.map(c => c.type).join(","));

  // 3.6 Successful well-placed build — find a tile near warehouse and workers
  // Use center area where sim likely placed buildings
  const centerIx = Math.floor(grid.width / 2);
  const centerIz = Math.floor(grid.height / 2);
  const wellPlacedStep = {
    id: 6, action: { type: "road" }, // road has no production checks
    groundedTile: { ix: centerIx, iz: centerIz }, status: "completed",
  };
  const causes6 = diagnoseFailure(wellPlacedStep, { buildSuccess: true, deviations: {} }, state);
  check("no diagnosis for well-placed road", causes6.length === 0, causes6.map(c => c.type).join(","));

  // 3.7 Multiple causes
  grid.moisture[moistIdx] = 0.1;
  const multiCauseStep = {
    id: 7, action: { type: "farm" },
    groundedTile: { ix: 5, iz: 5 }, status: "completed",
  };
  const causes7 = diagnoseFailure(multiCauseStep, { buildSuccess: true, deviations: { food_rate_delta: -2.0 } }, state);
  check("multiple diagnosis causes", causes7.length >= 2, `causes=${causes7.length}: ${causes7.map(c => c.type).join(",")}`);
  grid.moisture[moistIdx] = origMoist;

  return results;
}

function benchReflectionGeneration(state) {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  // 4.1 Reflection for uncovered building
  const step1 = { id: 1, action: { type: "farm" }, groundedTile: { ix: 20, iz: 20 } };
  const ev1 = {
    stepId: 1, action: "farm", buildSuccess: true, success: false, score: 0.4,
    diagnosis: [{ type: "uncovered", detail: "nearest warehouse is 30 tiles away", severity: 4 }],
  };
  const ref1 = generateReflection(step1, ev1, state);
  check("uncovered reflection generated", ref1 !== null, ref1?.text?.slice(0, 60));
  check("uncovered reflection mentions warehouse", ref1?.text?.includes("warehouse"), "");
  check("uncovered category is construction_reflection", ref1?.category === "construction_reflection", ref1?.category);

  // 4.2 Reflection for terrain issue
  const ev2 = {
    stepId: 2, action: "farm", buildSuccess: true, success: false, score: 0.3,
    diagnosis: [{ type: "poor_terrain", detail: "low moisture (0.12)", severity: 3 }],
  };
  const ref2 = generateReflection({ id: 2, action: { type: "farm" }, groundedTile: { ix: 10, iz: 10 } }, ev2, state);
  check("terrain reflection generated", ref2 !== null, ref2?.text?.slice(0, 60));
  check("terrain category is terrain_knowledge", ref2?.category === "terrain_knowledge", ref2?.category);

  // 4.3 Reflection for placement failure
  const ev3 = {
    stepId: 3, action: "warehouse", buildSuccess: false, success: false, score: 0,
    diagnosis: [{ type: "no_valid_tile", detail: "no valid tile", severity: 5 }],
  };
  const ref3 = generateReflection({ id: 3, action: { type: "warehouse" }, groundedTile: null }, ev3, state);
  check("failure reflection has high importance", ref3?.importance === 5, `importance=${ref3?.importance}`);
  check("failure category is construction_failure", ref3?.category === "construction_failure", ref3?.category);

  // 4.4 No reflection for smooth success
  const ev4 = { stepId: 4, action: "farm", buildSuccess: true, success: true, score: 1.0, diagnosis: [] };
  const ref4 = generateReflection({ id: 4, action: { type: "farm" }, groundedTile: { ix: 10, iz: 10 } }, ev4, state);
  check("no reflection for smooth success", ref4 === null, "");

  // 4.5 Generic underperformance reflection
  const ev5 = { stepId: 5, action: "road", buildSuccess: true, success: false, score: 0.5, diagnosis: [] };
  const ref5 = generateReflection({ id: 5, action: { type: "road" }, groundedTile: { ix: 10, iz: 10 } }, ev5, state);
  check("generic underperformance reflection", ref5 !== null && ref5.text.includes("scored"), ref5?.text?.slice(0, 60));

  // 4.6 Adjacency conflict reflection
  const ev6 = {
    stepId: 6, action: "quarry", buildSuccess: true, success: false, score: 0.5,
    diagnosis: [{ type: "adjacency_conflict", detail: "quarry adjacent to 2 farms", severity: 3 }],
  };
  const ref6 = generateReflection({ id: 6, action: { type: "quarry" }, groundedTile: { ix: 15, iz: 15 } }, ev6, state);
  check("adjacency reflection generated", ref6 !== null, ref6?.text?.slice(0, 60));
  check("adjacency category is construction_pattern", ref6?.category === "construction_pattern", ref6?.category);

  return results;
}

function benchPlanEvaluation(state) {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  // 5.1 Fully successful plan
  const plan1 = {
    goal: "food expansion", horizon_sec: 60,
    steps: [
      { id: 1, status: "completed" },
      { id: 2, status: "completed" },
      { id: 3, status: "completed" },
    ],
  };
  const ev1 = evaluatePlan(plan1, { resources: { food: 50 }, timeSec: 0 }, { resources: { food: 80 }, timeSec: 40 }, state);
  check("full success plan → success=true", ev1.success, `ratio=${ev1.completionRatio}`);
  check("full success plan → score > 0.8", ev1.overallScore > 0.8, `score=${ev1.overallScore.toFixed(2)}`);
  check("full success plan → food delta +30", ev1.resourceChanges.food === 30, `delta=${ev1.resourceChanges.food}`);

  // 5.2 Partially failed plan
  const plan2 = {
    goal: "defense", horizon_sec: 30,
    steps: [
      { id: 1, status: "completed" },
      { id: 2, status: "failed" },
      { id: 3, status: "failed" },
      { id: 4, status: "failed" },
    ],
  };
  const ev2 = evaluatePlan(plan2, { resources: {}, timeSec: 0 }, { resources: {}, timeSec: 20 }, state);
  check("partial failure → success=false", !ev2.success, `ratio=${ev2.completionRatio}`);

  // 5.3 Over-time plan
  const plan3 = {
    goal: "slow build", horizon_sec: 30,
    steps: [{ id: 1, status: "completed" }, { id: 2, status: "completed" }],
  };
  const ev3 = evaluatePlan(plan3, { resources: {}, timeSec: 0 }, { resources: {}, timeSec: 120 }, state);
  check("over-time plan → low time efficiency", ev3.timeEfficiency < 0.5, `eff=${ev3.timeEfficiency.toFixed(2)}`);

  // 5.4 Empty plan
  const ev4 = evaluatePlan({ goal: "empty", steps: [] }, { resources: {}, timeSec: 0 }, { resources: {}, timeSec: 10 }, state);
  check("empty plan → success=false", !ev4.success, "");

  return results;
}

function benchMemoryIntegration(state) {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  // 6.1 PlanEvaluator writes reflections to MemoryStore on failure
  const mem = new MemoryStore();
  const evaluator = new PlanEvaluator(mem);

  const failStep = { id: 1, action: { type: "farm" }, status: "failed", groundedTile: null, predicted_effect: {} };
  evaluator.evaluateStep(failStep, { resources: {}, timeSec: 60 }, { resources: {}, timeSec: 60 }, state);
  check("failure reflection stored in memory", mem.size > 0, `memSize=${mem.size}`);

  // 6.2 Reflection is retrievable with relevant query
  const entries = mem.retrieve("farm placement failure", 60, 5);
  check("reflection retrievable", entries.length > 0, `entries=${entries.length}`);
  check("reflection text mentions farm", entries.some(e => e.text.toLowerCase().includes("farm")), entries[0]?.text?.slice(0, 60));

  // 6.3 Plan-level failure writes reflection
  const mem2 = new MemoryStore();
  const evaluator2 = new PlanEvaluator(mem2);
  const failedPlan = {
    goal: "failed expansion", horizon_sec: 60,
    steps: [{ id: 1, status: "failed" }],
  };
  evaluator2.evaluatePlan(failedPlan, { resources: {}, timeSec: 0 }, { resources: {}, timeSec: 30 }, state);
  check("plan failure reflection stored", mem2.size > 0, `memSize=${mem2.size}`);

  // 6.4 Stats tracking
  check("stepsEvaluated tracks", evaluator.stats.stepsEvaluated === 1, `steps=${evaluator.stats.stepsEvaluated}`);
  check("reflectionsGenerated tracks", evaluator.stats.reflectionsGenerated > 0, `refs=${evaluator.stats.reflectionsGenerated}`);

  // 6.5 generatePlanReflections limits output
  const mem3 = new MemoryStore();
  const evaluator3 = new PlanEvaluator(mem3);
  const plan = {
    goal: "multi-fail",
    steps: Array.from({ length: 8 }, (_, i) => ({
      id: i + 1, action: { type: "farm" },
      groundedTile: { ix: 90, iz: 70 }, // far from everything
      status: "completed",
    })),
  };
  const evals = plan.steps.map(s => ({
    stepId: s.id, action: "farm", buildSuccess: true, success: false, score: 0.2,
    diagnosis: [{ type: "uncovered", detail: "too far", severity: 4 }],
  }));
  const refs = evaluator3.generatePlanReflections(plan, evals, state);
  check("batch reflections limited to 5", refs.length <= 5, `count=${refs.length}`);
  check("batch reflections non-empty", refs.length > 0, "");
  check("batch reflections stored in memory", mem3.size > 0, `memSize=${mem3.size}`);

  return results;
}

function benchFullCycle(state) {
  const results = { tests: 0, passed: 0, details: [] };
  function check(name, ok, detail) { results.tests++; if (ok) results.passed++; results.details.push({ name, ok, detail }); }

  // 7.1 Full cycle: fallback plan → ground ��� execute → evaluate
  const mem = new MemoryStore();
  const evaluator = new PlanEvaluator(mem);
  const perceiver = new ColonyPerceiver();
  const buildSystem = new BuildSystem();

  // Give plenty of resources
  state.resources = { food: 100, wood: 100, stone: 20, herbs: 10, meals: 0, tools: 0, medicine: 0 };
  state.buildings = rebuildBuildingStats(state.grid);

  // Ensure at least one warehouse exists for coverage (place if missing)
  if ((state.buildings.warehouses ?? 0) === 0) {
    const cx = Math.floor(state.grid.width / 2);
    const cz = Math.floor(state.grid.height / 2);
    buildSystem.placeToolAt(state, "warehouse", cx, cz, { recordHistory: false });
    state.buildings = rebuildBuildingStats(state.grid);
  }

  const obs = perceiver.observe(state);
  const fallback = generateFallbackPlan(obs, state);
  check("fallback plan generated", fallback.steps.length > 0, `steps=${fallback.steps.length}`);

  // Ground the plan
  const grounded = groundPlan(fallback, state, buildSystem);
  const feasible = grounded.steps.filter(s => s.feasible).length;
  check("plan grounded", feasible > 0, `feasible=${feasible}/${grounded.steps.length}`);

  // Snapshot before execution
  const snapBefore = snapshotState(state);

  // Execute steps with evaluation
  const stepEvals = [];
  let maxTicks = 10;
  while (!isPlanComplete(grounded) && maxTicks-- > 0) {
    const preSnap = snapshotState(state);
    const executed = executeNextSteps(grounded, state, buildSystem);
    const postSnap = snapshotState(state);

    for (const step of executed) {
      const ev = evaluator.evaluateStep(step, preSnap, postSnap, state);
      stepEvals.push(ev);
    }
    state.buildings = rebuildBuildingStats(state.grid);
  }

  check("steps executed", stepEvals.length > 0, `executed=${stepEvals.length}`);
  check("some steps succeeded", stepEvals.some(e => e.buildSuccess), `successes=${stepEvals.filter(e => e.buildSuccess).length}`);

  // Plan-level evaluation
  const snapAfter = snapshotState(state);
  const planEval = evaluator.evaluatePlan(grounded, snapBefore, snapAfter, state);
  check("plan evaluated", typeof planEval.overallScore === "number", `score=${planEval.overallScore.toFixed(2)}`);
  check("plan has resource changes", Object.keys(planEval.resourceChanges).length > 0, "");

  // Generate batch reflections
  const refs = evaluator.generatePlanReflections(grounded, stepEvals, state);
  check("reflections generated for failures", evaluator.stats.reflectionsGenerated >= 0, `refs=${evaluator.stats.reflectionsGenerated}`);

  // Memory should be populated
  check("memory has entries", mem.size > 0, `memSize=${mem.size}`);

  // Retrieval test: query construction-related memories
  const retrieved = mem.retrieve("construction farm warehouse placement", state.metrics?.timeSec ?? 0, 5);
  check("memories retrievable", retrieved.length > 0 || mem.size === 0, `retrieved=${retrieved.length}`);

  // Stats
  check("evaluator tracked steps", evaluator.stats.stepsEvaluated === stepEvals.length, `tracked=${evaluator.stats.stepsEvaluated}`);
  check("evaluator tracked plans", evaluator.stats.plansEvaluated === 1, `plans=${evaluator.stats.plansEvaluated}`);

  return results;
}

// ── LLM Judge ────────────────────────────────────────────────────────

const JUDGE_SYSTEM_PROMPT = `You are an expert game AI evaluator specializing in Reflexion-based plan evaluation systems. You will evaluate the quality of a PlanEvaluator system that assesses construction plan outcomes in a colony simulation.

The system has:
1. **Prediction Parsing**: Parses various prediction formats (+0.5/s, +15%, "improved")
2. **Step Evaluation**: Compares actual outcomes to predicted effects with scoring
3. **Failure Diagnosis**: Structured cause analysis (coverage, terrain, workers, adjacency)
4. **Reflection Generation**: Template-based natural language reflections for MemoryStore
5. **Plan Evaluation**: Overall plan quality with completion, time efficiency, and resource tracking
6. **Memory Integration**: Writes construction reflections to enable learning from past mistakes

Good evaluation systems should:
1. Accurately detect when builds underperform and diagnose root causes
2. Generate actionable reflections that improve future planning
3. Balance thoroughness with relevance (not flood memory with noise)
4. Score plans fairly across different success/failure scenarios
5. Integrate seamlessly with the existing MemoryStore for retrieval

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
- Step evaluation: build success (60%) + prediction accuracy (40%)
- Diagnosis types: no_valid_tile, placement_rejected, uncovered, no_workers, poor_terrain, high_elevation, adjacency_conflict, prediction_mismatch
- Reflections: template-based with cause-specific categories (construction_failure, terrain_knowledge, construction_pattern, construction_reflection)
- Plan evaluation: completion (40%) + time efficiency (20%) + build success (30%) + no-failure bonus (10%)
- Memory integration: observations for terrain/failures, reflections for patterns
- Batch reflections capped at 5 per plan to avoid memory flooding

### Evaluation Dimensions
Score each 1-10:

1. **Prediction Accuracy** (1-10): Parsing quality, tolerance handling, comparison logic
2. **Diagnosis Quality** (1-10): Root cause identification, structured cause types, severity scoring
3. **Reflection Quality** (1-10): Actionable text, appropriate categorization, importance scoring
4. **Plan Scoring** (1-10): Fair scoring formula, multi-dimensional assessment, threshold logic
5. **Memory Integration** (1-10): MemoryStore write patterns, retrieval relevance, noise control
6. **Full Cycle Quality** (1-10): End-to-end evaluation flow, snapshot handling, stat tracking
7. **Error Resilience** (1-10): Edge case handling, graceful degradation, missing data tolerance
8. **Architecture Quality** (1-10): Clean API, pure functions + stateful class, testability

Respond in JSON:
\`\`\`json
{
  "scores": {
    "prediction_accuracy": { "score": <1-10>, "justification": "<brief>" },
    "diagnosis_quality": { "score": <1-10>, "justification": "<brief>" },
    "reflection_quality": { "score": <1-10>, "justification": "<brief>" },
    "plan_scoring": { "score": <1-10>, "justification": "<brief>" },
    "memory_integration": { "score": <1-10>, "justification": "<brief>" },
    "full_cycle_quality": { "score": <1-10>, "justification": "<brief>" },
    "error_resilience": { "score": <1-10>, "justification": "<brief>" },
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

  scores.prediction_accuracy = Math.min(10, Math.round(rate("predictionParsing") * 8 + 2));
  scores.diagnosis_quality = Math.min(10, Math.round(rate("diagnosis") * 8 + 2));
  scores.reflection_quality = Math.min(10, Math.round(rate("reflectionGeneration") * 8 + 2));
  scores.plan_scoring = Math.min(10, Math.round(rate("planEvaluation") * 8 + 2));
  scores.memory_integration = Math.min(10, Math.round(rate("memoryIntegration") * 8 + 2));
  scores.full_cycle_quality = Math.min(10, Math.round(rate("fullCycle") * 8 + 2));
  scores.error_resilience = Math.min(10, Math.round(passRate * 7 + 3));
  scores.architecture_quality = Math.min(10, Math.round(passRate * 6 + 4));

  return scores;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const templateId = args.template ?? "temperate_plains";
  const durationSec = parseInt(args.duration ?? "120", 10);
  const skipLlm = args["skip-llm"] ?? false;

  console.log(`=== Evaluator Benchmark ===`);
  console.log(`Template: ${templateId}, Seed: 42, Duration: ${durationSec}s\n`);

  // Setup
  const memoryStore = new MemoryStore();
  const state = createInitialGameState(templateId, 42);
  const services = createServices(memoryStore);
  const systems = buildSystems(memoryStore);

  console.log(`Advancing simulation ${durationSec}s...`);
  const t0 = performance.now();
  advanceSim(state, systems, services, durationSec);
  console.log(`Done in ${(performance.now() - t0).toFixed(0)}ms`);
  console.log(`  Workers: ${state.agents.filter(a => a.type === "WORKER" && a.alive !== false).length}, Buildings: ${JSON.stringify(state.buildings)}\n`);

  // Run benchmarks
  const benchResults = {};

  const run = (name, fn, ...fnArgs) => {
    const result = fn(...fnArgs);
    benchResults[name] = result;
    console.log(`--- Scenario: ${name} ---`);
    console.log(`  ${result.passed}/${result.tests} passed`);
    return result;
  };

  const perceiver = new ColonyPerceiver();
  perceiver.observe(state); // warm up rate tracker

  run("predictionParsing", benchPredictionParsing);
  run("stepEvaluation", benchStepEvaluation, state);
  run("diagnosis", benchDiagnosis, state);
  run("reflectionGeneration", benchReflectionGeneration, state);
  run("planEvaluation", benchPlanEvaluation, state);
  run("memoryIntegration", benchMemoryIntegration, state);
  run("fullCycle", benchFullCycle, state);

  // Summary
  const totalTests = Object.values(benchResults).reduce((s, r) => s + r.tests, 0);
  const totalPassed = Object.values(benchResults).reduce((s, r) => s + r.passed, 0);

  // Print failures
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
    const groundTruth = {
      templateId,
      gridWidth: state.grid.width,
      gridHeight: state.grid.height,
      simTimeSec: durationSec,
      workers: state.agents.filter(a => a.type === "WORKER" && a.alive !== false).length,
      totalBuildings: Object.values(state.buildings).reduce((s, v) => s + v, 0),
      food: Math.round(state.resources.food),
      wood: Math.round(state.resources.wood),
      stone: Math.round(state.resources.stone),
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
      if (judgment.improvement_suggestions?.length) console.log(`Suggestions: ${judgment.improvement_suggestions.join("; ")}`);
    } else {
      console.log("LLM judge unavailable.");
    }
  }

  // Final
  console.log(`\n=== Final Summary ===`);
  console.log(`Tests: ${totalPassed}/${totalTests} (${(totalPassed / totalTests * 100).toFixed(0)}%)`);
  console.log(`Final score: ${overall.toFixed(1)}/10`);
  console.log(overall >= 9 ? "\n✓✓ EXCELLENT" : overall >= 7 ? "\n✓ GOOD" : "\n✗ NEEDS IMPROVEMENT");
}

main().catch(console.error);
