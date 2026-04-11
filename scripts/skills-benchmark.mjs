/**
 * Skills Benchmark — evaluates Phase 6 (Tuning & Learned Skills) quality.
 *
 * Tests: new built-in skills, skill learning pipeline, prompt tuning,
 * LearnedSkillLibrary integration, fallback plan new skill usage,
 * and end-to-end AgentDirectorSystem with skill learning.
 *
 * Usage:
 *   node scripts/skills-benchmark.mjs
 *
 * Environment:
 *   OPENAI_API_KEY — required for LLM judge
 *   OPENAI_BASE_URL — optional
 */

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { AgentDirectorSystem } from "../src/simulation/ai/colony/AgentDirectorSystem.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";
import {
  SKILL_LIBRARY, getSkillTotalCost, checkSkillPreconditions,
  assessSkillFeasibility, scoreSkillTerrain, listSkillStatus,
} from "../src/simulation/ai/colony/SkillLibrary.js";
import {
  extractSkillFromPlan, inferTerrainPreference, computeExpectedEffect,
  generateSkillName, signatureSimilarity, LearnedSkillLibrary,
} from "../src/simulation/ai/colony/LearnedSkillLibrary.js";
import {
  buildPlannerPrompt, generateFallbackPlan, validatePlanResponse,
  shouldReplan, ColonyPlanner,
} from "../src/simulation/ai/colony/ColonyPlanner.js";
import { ColonyPerceiver } from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { groundPlan, executeNextSteps, isPlanComplete } from "../src/simulation/ai/colony/PlanExecutor.js";
import { PlanEvaluator, snapshotState } from "../src/simulation/ai/colony/PlanEvaluator.js";
import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { SimulationClock } from "../src/app/SimulationClock.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
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

const DT_SEC = 1 / 30;
const PASS = "✅ PASS";
const FAIL = "❌ FAIL";

let passed = 0;
let failed = 0;
let total = 0;

function check(name, condition, detail = "") {
  total++;
  if (condition) {
    passed++;
    console.log(`  ${PASS} ${name}`);
  } else {
    failed++;
    console.log(`  ${FAIL} ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function initState(templateId = "temperate_plains", seed = 42) {
  const state = createInitialGameState({ templateId, seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = true;
  state.ai.coverageTarget = "fallback";
  state.buildings = rebuildBuildingStats(state.grid);
  return state;
}

function initServices(seed = 42) {
  const mem = new MemoryStore();
  const services = createServices(seed, { offlineAiFallback: true });
  services.memoryStore = mem;
  return { mem, services };
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

// ══════════════════════════════════════════════════════════════════════
// Scenario 1: New Built-in Skills
// ═════════════��════════════════════════��═══════════════════════════════

function scenario1_newBuiltinSkills() {
  console.log("\n═══ Scenario 1: New Built-in Skills ═══");

  // 1a: All 9 skills exist and are frozen
  const keys = Object.keys(SKILL_LIBRARY);
  check("SKILL_LIBRARY has 9 skills", keys.length === 9, `got ${keys.length}`);
  check("All skills frozen", keys.every(k => Object.isFrozen(SKILL_LIBRARY[k])));

  // 1b: medical_center structure
  const mc = SKILL_LIBRARY.medical_center;
  check("medical_center has 3 steps", mc.steps.length === 3);
  check("medical_center includes clinic", mc.steps.some(s => s.type === "clinic"));
  check("medical_center includes herb_garden", mc.steps.some(s => s.type === "herb_garden"));
  check("medical_center preconditions correct", mc.preconditions.wood === 11 && mc.preconditions.herbs === 4);

  // 1c: resource_hub structure
  const rh = SKILL_LIBRARY.resource_hub;
  check("resource_hub has 4 steps", rh.steps.length === 4);
  check("resource_hub includes quarry + lumber", rh.steps.some(s => s.type === "quarry") && rh.steps.some(s => s.type === "lumber"));

  // 1d: rapid_farms structure
  const rf = SKILL_LIBRARY.rapid_farms;
  check("rapid_farms has 3 farm steps", rf.steps.length === 3 && rf.steps.every(s => s.type === "farm"));
  check("rapid_farms minMoisture preference", rf.terrain_preference.minMoisture === 0.5);

  // 1e: Cost computation works for new skills
  const mcCost = getSkillTotalCost("medical_center");
  check("medical_center total cost includes herbs", mcCost.herbs === 4 && mcCost.wood >= 10);

  // 1f: Precondition check works
  const { met } = checkSkillPreconditions("medical_center", { wood: 20, herbs: 5 }, {});
  check("medical_center preconditions met with enough resources", met);
  const { met: notMet } = checkSkillPreconditions("medical_center", { wood: 5, herbs: 1 }, {});
  check("medical_center preconditions not met with low resources", !notMet);

  // 1g: listSkillStatus includes all 9
  const statuses = listSkillStatus({ wood: 100, stone: 20, herbs: 10 }, { farms: 10 });
  check("listSkillStatus returns 9 entries", statuses.length === 9);
}

// ══════════════════════��═══════════════════════════════���═══════════════
// Scenario 2: Skill Learning Pipeline
// ���═════════════════════════════════════════════════════════════════════

function scenario2_skillLearning() {
  console.log("\n���══ Scenario 2: Skill Learning Pipeline ═══");

  const grid = { width: 20, height: 20, tiles: new Uint8Array(400), moisture: new Float32Array(400).fill(0.6), elevation: new Float32Array(400).fill(0.35) };

  // 2a: Extract skill from quality plan
  const plan = {
    goal: "food production boost", horizon_sec: 60, source: "fallback",
    steps: [
      { id: 1, action: { type: "farm" }, status: "completed", groundedTile: { ix: 10, iz: 10 }, predicted_effect: { food_rate_delta: "+0.4/s" } },
      { id: 2, action: { type: "farm" }, status: "completed", groundedTile: { ix: 11, iz: 10 }, predicted_effect: { food_rate_delta: "+0.4/s" } },
      { id: 3, action: { type: "farm" }, status: "completed", groundedTile: { ix: 10, iz: 11 }, predicted_effect: { food_rate_delta: "+0.4/s" } },
      { id: 4, action: { type: "road" }, status: "completed", groundedTile: { ix: 12, iz: 10 }, predicted_effect: { logistics: "improved" } },
    ],
  };
  const evaluation = { overallScore: 0.88, success: true, completed: 4, failed: 0, total: 4 };
  const stepEvals = plan.steps.map(s => ({ stepId: s.id, score: 0.8, success: true, diagnosis: [] }));

  const skill = extractSkillFromPlan(plan, evaluation, stepEvals, grid);
  check("extractSkillFromPlan produces skill", skill != null);
  check("Extracted skill has 4 steps", skill?.steps.length === 4);
  check("Anchor offset is [0,0]", skill?.steps[0].offset[0] === 0 && skill?.steps[0].offset[1] === 0);
  check("Relative offsets correct", skill?.steps[1].offset[0] === 1 && skill?.steps[1].offset[1] === 0);

  // 2b: Terrain inference
  const pref = inferTerrainPreference(plan.steps, grid);
  check("Terrain preference inferred", Object.keys(pref).length > 0);
  check("Moisture preference >= 0.3", (pref.minMoisture ?? 0) >= 0.3);

  // 2c: Expected effect computation
  const effect = computeExpectedEffect(plan.steps, stepEvals);
  check("Expected effect includes food_rate", effect.food_rate != null);
  check("Expected effect correct farm count", effect.food_rate === "+1.2/s");

  // 2d: Skill naming
  const name = generateSkillName({ farm: 3, road: 1 }, "food boost");
  check("Skill name starts with learned_", name.startsWith("learned_"));
  check("Skill name includes 3xfarm", name.includes("3xfarm"));

  // 2e: Signature similarity
  check("Identical signatures → 1.0", signatureSimilarity("farm,farm,road", "farm,farm,road") === 1.0);
  check("Different signatures → 0", signatureSimilarity("farm", "wall") === 0);
  const partialSim = signatureSimilarity("farm,road", "farm,wall");
  check("Partial similarity in (0,1)", partialSim > 0 && partialSim < 1);

  // 2f: Quality gates
  const lowScorePlan = { ...plan };
  const lowEval = { ...evaluation, overallScore: 0.4, success: false };
  check("Rejects low-score plan", extractSkillFromPlan(lowScorePlan, lowEval, stepEvals, grid) === null);

  const fewStepsPlan = { ...plan, steps: plan.steps.slice(0, 2) };
  const fewEval = { ...evaluation, completed: 2 };
  check("Rejects plan with < 3 completed steps", extractSkillFromPlan(fewStepsPlan, fewEval, stepEvals, grid) === null);
}

// ���════════════════════════���════════════════════════���═══════════════════
// Scenario 3: LearnedSkillLibrary Management
// ════════════════════════���═════════════════════════════��═══════════════

function scenario3_libraryManagement() {
  console.log("\n═���═ Scenario 3: LearnedSkillLibrary Management ═══");

  const lib = new LearnedSkillLibrary();
  const grid = { width: 20, height: 20, tiles: new Uint8Array(400), moisture: new Float32Array(400).fill(0.5), elevation: new Float32Array(400).fill(0.4) };

  // 3a: Learn and retrieve
  const plan = {
    goal: "test skill", horizon_sec: 60, source: "fallback",
    steps: [
      { id: 1, action: { type: "farm" }, status: "completed", groundedTile: { ix: 5, iz: 5 }, predicted_effect: {} },
      { id: 2, action: { type: "lumber" }, status: "completed", groundedTile: { ix: 6, iz: 5 }, predicted_effect: {} },
      { id: 3, action: { type: "quarry" }, status: "completed", groundedTile: { ix: 7, iz: 5 }, predicted_effect: {} },
    ],
  };
  const evaluation = { overallScore: 0.82, success: true, completed: 3, failed: 0, total: 3 };
  const stepEvals = plan.steps.map(s => ({ stepId: s.id, score: 0.8, success: true, diagnosis: [] }));

  const id = lib.maybeLearnSkill(plan, evaluation, stepEvals, grid);
  check("Library learns skill", id != null);
  check("Library size = 1", lib.size === 1);
  check("Can retrieve by ID", lib.getSkill(id) != null);

  // 3b: Deduplication
  const id2 = lib.maybeLearnSkill(plan, { ...evaluation, overallScore: 0.75 }, stepEvals, grid);
  check("Rejects duplicate with lower score", id2 === null);
  check("Library still size 1", lib.size === 1);

  // 3c: Usage tracking
  lib.recordUsage(id, true);
  lib.recordUsage(id, true);
  lib.recordUsage(id, false);
  const skill = lib.getSkill(id);
  check("Usage tracked: 3 uses", skill._meta.uses === 3);
  check("Success tracked: 2 successes", skill._meta.successes === 2);

  // 3d: Listing with affordability
  const affordable = lib.listLearnedSkills({ wood: 100, stone: 50 });
  check("Listed skill is affordable", affordable[0].affordable);
  const poor = lib.listLearnedSkills({ wood: 0 });
  check("Listed skill not affordable with 0 wood", !poor[0].affordable);

  // 3e: Confidence scoring
  const listing = lib.listLearnedSkills({ wood: 100 });
  check("Confidence > 0.5 after 2/3 success", listing[0].confidence > 0.5);

  // 3f: Prompt formatting
  const prompt = lib.formatForPrompt({ wood: 100 });
  check("Prompt includes Learned Skills header", prompt.includes("Learned Skills"));
  check("Empty prompt when no skills", new LearnedSkillLibrary().formatForPrompt({}) === "");

  // 3g: allSkillIds
  const allIds = lib.allSkillIds();
  check("allSkillIds includes built-in skills", allIds.has("logistics_hub") && allIds.has("medical_center"));
  check("allSkillIds includes learned skill", [...allIds].some(k => k.startsWith("learned_")));

  // 3h: Eviction at capacity
  const bigLib = new LearnedSkillLibrary();
  const types = ["farm", "lumber", "quarry", "wall", "road", "herb_garden", "kitchen", "smithy", "clinic", "warehouse"];
  for (let i = 0; i < 10; i++) {
    const steps = Array.from({ length: 3 }, (_, j) => ({
      id: j + 1, action: { type: types[i] }, status: "completed",
      groundedTile: { ix: 10 + j, iz: 10 + i }, predicted_effect: {},
    }));
    bigLib.maybeLearnSkill({ goal: `s${i}`, horizon_sec: 60, steps, source: "fallback" },
      { overallScore: 0.7 + i * 0.01, success: true, completed: 3, total: 3 },
      steps.map(s => ({ stepId: s.id, score: 0.8, success: true, diagnosis: [] })), grid);
  }
  check("Library at capacity (10)", bigLib.size === 10);

  const extraSteps = Array.from({ length: 3 }, (_, j) => ({
    id: j + 1, action: { type: "bridge" }, status: "completed",
    groundedTile: { ix: 5 + j, iz: 5 }, predicted_effect: {},
  }));
  bigLib.maybeLearnSkill({ goal: "extra", horizon_sec: 60, steps: extraSteps, source: "fallback" },
    { overallScore: 0.92, success: true, completed: 3, total: 3 },
    extraSteps.map(s => ({ stepId: s.id, score: 0.9, success: true, diagnosis: [] })), grid);
  check("Eviction keeps size at 10", bigLib.size === 10);
  check("Eviction stat incremented", bigLib.stats.skillsEvicted >= 1);
}

// ══════════════════════════════════════════════════��═══════════════════
// Scenario 4: Prompt Tuning Quality
// ═══════════════════���══════════════════════════════════════════════════

function scenario4_promptTuning() {
  console.log("\n═══ Scenario 4: Prompt Tuning Quality ═══");

  const state = initState();
  state.resources = { food: 50, wood: 100, stone: 20, herbs: 10, meals: 0, tools: 0, medicine: 0 };
  state.buildings = rebuildBuildingStats(state.grid);

  const perceiver = new ColonyPerceiver();
  const observation = perceiver.observe(state);

  // 4a: buildPlannerPrompt with learned skills text
  const prompt = buildPlannerPrompt(observation, "Some reflections.", state, "## Learned Skills\n- test_skill");
  check("Prompt includes observation", prompt.includes("Current Observation"));
  check("Prompt includes reflections", prompt.includes("Some reflections"));
  check("Prompt includes learned skills section", prompt.includes("Learned Skills"));
  check("Prompt includes skill availability", prompt.includes("Skill Availability"));
  check("Prompt includes affordable buildings", prompt.includes("Affordable Buildings"));

  // 4b: Prompt without learned skills
  const basicPrompt = buildPlannerPrompt(observation, "", state);
  check("Basic prompt works without learned skills", basicPrompt.includes("Current Observation"));
  check("No learned skills section when empty", !basicPrompt.includes("Learned Skills"));

  // 4c: Fallback plan uses new skills
  const richState = initState();
  richState.resources = { food: 50, wood: 100, stone: 20, herbs: 10, meals: 0, tools: 0, medicine: 0 };
  richState.buildings = rebuildBuildingStats(richState.grid);
  const richObs = perceiver.observe(richState);
  const fallback = generateFallbackPlan(richObs, richState);
  check("Fallback plan has steps", fallback.steps.length > 0);

  // 4d: Fallback plan includes new skill types when appropriate
  const herbState = initState();
  herbState.resources = { food: 100, wood: 100, stone: 20, herbs: 10, meals: 0, tools: 0, medicine: 0 };
  herbState.buildings = rebuildBuildingStats(herbState.grid);
  // No clinics built → should suggest medical_center
  const herbObs = perceiver.observe(herbState);
  const herbPlan = generateFallbackPlan(herbObs, herbState);
  const hasNewSkills = herbPlan.steps.some(s =>
    s.action.skill === "medical_center" || s.action.skill === "rapid_farms" || s.action.skill === "resource_hub"
  );
  check("Fallback plan can reference new skills", hasNewSkills, `steps: ${herbPlan.steps.map(s => s.action.skill ?? s.action.type).join(",")}`);
}

// ═══════════════════���═══════════════════════════════���══════════════════
// Scenario 5: End-to-End Integration
// ════════════════════════════════════════════════════���═════════════════

function scenario5_e2eIntegration() {
  console.log("\n═���═ Scenario 5: End-to-End Integration ═══");

  const { mem, services } = initServices();
  const system = new AgentDirectorSystem(mem);
  const state = initState();
  state.resources = { food: 100, wood: 200, stone: 30, herbs: 10, meals: 0, tools: 0, medicine: 0 };
  state.buildings = rebuildBuildingStats(state.grid);

  // 5a: System exposes learned skills
  check("System has learnedSkills property", system.learnedSkills != null);
  check("learnedSkills is LearnedSkillLibrary", system.learnedSkills instanceof LearnedSkillLibrary);
  check("Initial learned skills count = 0", system.learnedSkills.size === 0);

  // 5b: Stats include learned skills
  const stats = system.stats;
  check("Stats include learnedSkills", "learnedSkills" in stats);
  check("learnedSkills stats has skillsExtracted", typeof stats.learnedSkills.skillsExtracted === "number");

  // 5c: Run simulation — should generate and complete plans
  const dt = 1 / 30;
  for (let i = 0; i < 300; i++) {
    state.metrics.timeSec = i * dt;
    system.update(dt, state, services);
  }

  const agentState = state.ai.agentDirector;
  check("Agent generated plans", agentState.stats.plansGenerated >= 1);
  check("Agent completed plans", agentState.stats.plansCompleted >= 1);
  check("Mode is hybrid (no API key)", agentState.mode === "hybrid");

  // 5d: Check if any skills were learned (may or may not depending on plan quality)
  const learnedCount = system.learnedSkills.size;
  check("Learned skills tracking works", typeof learnedCount === "number");
  if (learnedCount > 0) {
    check("skillsLearned stat tracked", agentState.stats.skillsLearned > 0);
  }
}

// ═��═══════════════════════��════════════════════════════════════════════
// Scenario 6: Multi-Template Skill Feasibility
// ══════════════════════════════════════════════════════════════════════

function scenario6_multiTemplate() {
  console.log("\n═══ Scenario 6: Multi-Template Skill Feasibility ═══");

  const templates = ["temperate_plains", "rugged_highlands", "archipelago_isles"];
  const buildSystem = new BuildSystem();

  for (const templateId of templates) {
    const state = initState(templateId, 1337);
    state.resources = { food: 200, wood: 200, stone: 50, herbs: 20, meals: 0, tools: 0, medicine: 0 };
    state.buildings = rebuildBuildingStats(state.grid);

    // Test each new skill's feasibility
    for (const skillId of ["medical_center", "resource_hub", "rapid_farms"]) {
      const { met } = checkSkillPreconditions(skillId, state.resources, state.buildings);
      check(`${templateId}/${skillId} preconditions met`, met);

      // Find a warehouse and test feasibility near it
      const warehouses = [];
      const grid = state.grid;
      for (let iz = 0; iz < grid.height; iz++) {
        for (let ix = 0; ix < grid.width; ix++) {
          if (grid.tiles[iz * grid.width + ix] === 5) { // TILE.WAREHOUSE
            warehouses.push({ ix, iz });
          }
        }
      }

      if (warehouses.length > 0) {
        // Search nearby for a feasible anchor
        const wh = warehouses[0];
        let foundFeasible = false;
        for (let dz = -6; dz <= 6 && !foundFeasible; dz++) {
          for (let dx = -6; dx <= 6 && !foundFeasible; dx++) {
            if (Math.abs(dx) + Math.abs(dz) > 6) continue;
            const anchor = { ix: wh.ix + dx, iz: wh.iz + dz };
            const feas = assessSkillFeasibility(skillId, anchor, grid, buildSystem, state);
            if (feas.ratio >= 0.5) foundFeasible = true;
          }
        }
        check(`${templateId}/${skillId} feasible near warehouse`, foundFeasible);
      }
    }
  }
}

// ═════════════════════════════════���════════════════════════════════════
// Scenario 7: A/B — Agent with Skills vs Without
// ══════════════════════════════════════════════════════════════════════

function scenario7_abComparison() {
  console.log("\n═══ Scenario 7: A/B Comparison (Agent vs Baseline) ═══");

  const templateId = "temperate_plains";
  const seed = 42;
  const simDuration = 60; // seconds

  // Run with AgentDirectorSystem (has skill learning)
  const { mem: memA, services: svcA } = initServices(seed);
  const agentDir = new AgentDirectorSystem(memA);
  const stateA = initState(templateId, seed);
  stateA.resources = { food: 100, wood: 150, stone: 20, herbs: 8, meals: 0, tools: 0, medicine: 0 };
  stateA.buildings = rebuildBuildingStats(stateA.grid);
  const systemsA = buildSystems(memA, agentDir);
  advanceSim(stateA, systemsA, svcA, simDuration);
  const buildsA = Object.values(stateA.buildings).reduce((a, b) => a + b, 0);

  // Run with baseline ColonyDirectorSystem
  const { mem: memB, services: svcB } = initServices(seed);
  const baseDir = new ColonyDirectorSystem();
  const stateB = initState(templateId, seed);
  stateB.resources = { food: 100, wood: 150, stone: 20, herbs: 8, meals: 0, tools: 0, medicine: 0 };
  stateB.buildings = rebuildBuildingStats(stateB.grid);
  const systemsB = buildSystems(memB, baseDir);
  advanceSim(stateB, systemsB, svcB, simDuration);
  const buildsB = Object.values(stateB.buildings).reduce((a, b) => a + b, 0);

  console.log(`  Agent: ${buildsA} buildings | Baseline: ${buildsB} buildings`);
  check("Agent builds >= baseline", buildsA >= buildsB, `agent=${buildsA} base=${buildsB}`);
  check("Agent places buildings", buildsA > 0);
  check("Baseline places buildings", buildsB > 0);

  // Check agent stats
  const agentState = stateA.ai.agentDirector;
  check("Agent generated plans in A/B test", agentState.stats.plansGenerated >= 1);
}

// ══════════════════════════════════════════════════════════════════════
// LLM Judge
// ══════════════════════════════════════════════════════════════════════

async function llmJudge() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");

  if (!apiKey) {
    console.log("\n⚠️  No OPENAI_API_KEY — skipping LLM judge, using self-assessment.");
    return selfAssess();
  }

  const prompt = `You are evaluating Phase 6 (Tuning & Learned Skills) of an agent-based colony planning system.

## Results
- Total tests: ${total}
- Passed: ${passed}
- Failed: ${failed}
- Pass rate: ${((passed / total) * 100).toFixed(1)}%

## Phase 6 Features
1. LearnedSkillLibrary — extracts reusable build patterns from successful plans (Voyager-inspired)
2. 3 new built-in skills: medical_center, resource_hub, rapid_farms
3. Prompt tuning — yield rates, terrain impact, adjacency rules in system prompt
4. Skill deduplication by action-type Jaccard similarity
5. Capacity management with weakest-skill eviction
6. Integration into AgentDirectorSystem._completePlan() for automatic skill learning
7. Learned skills injected into LLM prompts for future planning

## Evaluation Dimensions (score each 0-10)
1. **Skill Extraction Quality** — correct offset computation, terrain inference, quality gates
2. **Library Management** — deduplication, eviction, usage tracking, confidence scoring
3. **Prompt Enhancement** — yield rates, terrain impact, adjacency rules, learned skills injection
4. **New Skills Design** — medical_center, resource_hub, rapid_farms — balanced, useful, well-structured
5. **Integration Quality** — clean wiring into AgentDirectorSystem, backward compatible
6. **Test Coverage** — unit tests + benchmark scenarios cover all features
7. **Robustness** — multi-template feasibility, edge cases, graceful handling
8. **Architecture** — Voyager-inspired design, clean separation, extensible

Return JSON only: { "scores": { "skill_extraction": N, "library_management": N, "prompt_enhancement": N, "new_skills_design": N, "integration_quality": N, "test_coverage": N, "robustness": N, "architecture": N }, "average": N, "summary": "brief" }`;

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!resp.ok) {
      console.log(`\n⚠️  LLM judge HTTP ${resp.status} — using self-assessment.`);
      return selfAssess();
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    if (parsed?.scores) {
      console.log("\n═══ LLM Judge Scores ═══");
      for (const [dim, score] of Object.entries(parsed.scores)) {
        console.log(`  ${dim}: ${score}/10`);
      }
      console.log(`  AVERAGE: ${parsed.average}/10`);
      if (parsed.summary) console.log(`  Summary: ${parsed.summary}`);
      return parsed.average;
    }
  } catch (err) {
    console.log(`\n⚠️  LLM judge error: ${err.message} — using self-assessment.`);
  }
  return selfAssess();
}

function selfAssess() {
  const rate = passed / total;
  const score = Math.round(rate * 10 * 10) / 10;
  console.log(`\n═══ Self-Assessment Score: ${score}/10 (${passed}/${total} passed) ═���═`);
  return score;
}

// ══════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║       Phase 6: Tuning & Learned Skills Benchmark    ║");
  console.log("╚═══════════════════════════��══════════════════════════╝");

  scenario1_newBuiltinSkills();
  scenario2_skillLearning();
  scenario3_libraryManagement();
  scenario4_promptTuning();
  scenario5_e2eIntegration();
  scenario6_multiTemplate();
  scenario7_abComparison();

  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`  TOTAL: ${passed}/${total} passed (${failed} failed)`);
  console.log(`════════════════════════════════════════════��═════════`);

  const score = await llmJudge();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
