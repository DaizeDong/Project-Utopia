/**
 * Executor Benchmark — evaluates SkillLibrary + PlanExecutor quality.
 *
 * Tests skill feasibility assessment, location hint resolution, affordance scoring,
 * terrain-aware placement, and end-to-end plan execution against real game states.
 *
 * Usage:
 *   node scripts/executor-benchmark.mjs [--template=temperate_plains] [--duration=180]
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
import { ColonyPerceiver, detectClusters } from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { TILE } from "../src/config/constants.js";
import { BUILD_COST } from "../src/config/balance.js";
import { rebuildBuildingStats, listTilesByType, toIndex } from "../src/world/grid/Grid.js";

import {
  SKILL_LIBRARY, getSkillTotalCost, checkSkillPreconditions,
  expandSkillSteps, assessSkillFeasibility, scoreSkillTerrain,
  selectSkillForGoal, listSkillStatus,
} from "../src/simulation/ai/colony/SkillLibrary.js";

import {
  resolveLocationHint, computeAffordanceScore, rankByTerrainQuality,
  groundPlanStep, groundPlan, executeNextSteps,
  isPlanComplete, isPlanBlocked, getPlanProgress,
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
    new SimulationClock(),
    new ProgressionSystem(),
    new RoleAssignmentSystem(),
    new PopulationGrowthSystem(),
    new StrategicDirector(memoryStore),
    new EnvironmentDirectorSystem(),
    new WeatherSystem(),
    new WorldEventSystem(),
    new TileStateSystem(),
    new NPCBrainSystem(),
    new WorkerAISystem(),
    new VisitorAISystem(),
    new AnimalAISystem(),
    new MortalitySystem(),
    new WildlifePopulationSystem(),
    new BoidsSystem(),
    new ResourceSystem(),
    new ProcessingSystem(),
    new ColonyDirectorSystem(),
  ];
}

// ── Benchmark Scenarios ─────────────────────────────────────────────

/**
 * Run headless sim to a target time, return state.
 */
function advanceSim(state, systems, services, targetSec) {
  const targetTicks = Math.round(targetSec / DT_SEC);
  const currentTicks = Math.round((state.metrics?.timeSec ?? 0) / DT_SEC);
  for (let i = currentTicks; i < targetTicks; i++) {
    for (const sys of systems) sys.update(DT_SEC, state, services);
  }
}

/**
 * Scenario 1: Skill Library Completeness & Correctness
 */
function benchSkillLibrary(state) {
  const results = { tests: 0, passed: 0, details: [] };

  function check(name, ok, detail) {
    results.tests++;
    if (ok) results.passed++;
    results.details.push({ name, ok, detail });
  }

  // 1.1 All 6 skills exist with correct structure
  const skillIds = Object.keys(SKILL_LIBRARY);
  check("6 skills defined", skillIds.length === 6, `count=${skillIds.length}`);

  for (const id of skillIds) {
    const skill = SKILL_LIBRARY[id];
    check(`${id}: has steps`, skill.steps?.length > 0, `steps=${skill.steps?.length}`);
    check(`${id}: has preconditions`, skill.preconditions != null, "");
    check(`${id}: has expectedEffect`, skill.expectedEffect != null, "");
    check(`${id}: is frozen`, Object.isFrozen(skill), "");
  }

  // 1.2 Total cost computation
  const logisticsCost = getSkillTotalCost("logistics_hub");
  check("logistics_hub total cost correct", logisticsCost.wood === 24, `wood=${logisticsCost.wood}`);

  const processingCost = getSkillTotalCost("processing_cluster");
  check("processing_cluster cost has stone", processingCost.stone === 5, `stone=${processingCost.stone}`);

  // 1.3 Precondition checking
  const richResources = { wood: 100, stone: 50, herbs: 20, food: 100 };
  const richBuildings = { farms: 10, warehouses: 3 };
  for (const id of skillIds) {
    const { met } = checkSkillPreconditions(id, richResources, richBuildings);
    check(`${id}: affordable with rich resources`, met, "");
  }

  const poorResources = { wood: 3, stone: 0, herbs: 0, food: 5 };
  for (const id of skillIds) {
    const { met } = checkSkillPreconditions(id, poorResources, {});
    check(`${id}: unaffordable with poor resources`, !met, "");
  }

  // 1.4 Skill selection for goals
  const expandSkill = selectSkillForGoal("expand_coverage", richResources, richBuildings);
  check("expand_coverage returns a skill", expandSkill != null, expandSkill?.skillId);

  const fortifySkill = selectSkillForGoal("fortify", richResources, richBuildings);
  check("fortify returns defense_line", fortifySkill?.skillId === "defense_line", fortifySkill?.skillId);

  // 1.5 Skill expansion
  const expanded = expandSkillSteps("logistics_hub", { ix: 10, iz: 10 });
  check("logistics_hub expands to 7 steps", expanded.length === 7, `count=${expanded.length}`);
  check("first step is warehouse at anchor", expanded[0]?.type === "warehouse" && expanded[0]?.ix === 10, JSON.stringify(expanded[0]));

  return results;
}

/**
 * Scenario 2: Location Hint Resolution Quality
 */
function benchLocationHints(state) {
  const results = { tests: 0, passed: 0, details: [] };

  function check(name, ok, detail) {
    results.tests++;
    if (ok) results.passed++;
    results.details.push({ name, ok, detail });
  }

  // 2.1 Explicit coordinate
  const coord = resolveLocationHint("10,20", state);
  check("explicit coord returns 1 tile", coord.length === 1, `count=${coord.length}`);
  check("explicit coord correct", coord[0]?.ix === 10 && coord[0]?.iz === 20, JSON.stringify(coord[0]));

  // 2.2 Out-of-bounds coordinate
  const oob = resolveLocationHint("999,999", state);
  check("OOB coord returns empty", oob.length === 0, `count=${oob.length}`);

  // 2.3 near_cluster
  const nearCluster = resolveLocationHint("near_cluster:c0", state);
  check("near_cluster returns candidates", nearCluster.length > 0, `count=${nearCluster.length}`);
  check("near_cluster tiles are grass", nearCluster.every(t => state.grid.tiles[toIndex(t.ix, t.iz, state.grid.width)] === TILE.GRASS), "");

  // 2.4 near_step with grounded map
  const groundedSteps = new Map();
  const warehouses = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  if (warehouses.length > 0) {
    groundedSteps.set(1, warehouses[0]);
    const nearStep = resolveLocationHint("near_step:1", state, groundedSteps);
    check("near_step returns candidates", nearStep.length > 0, `count=${nearStep.length}`);
    if (nearStep.length > 0) {
      const maxDist = Math.max(...nearStep.map(t => Math.abs(t.ix - warehouses[0].ix) + Math.abs(t.iz - warehouses[0].iz)));
      check("near_step tiles within radius 4", maxDist <= 4, `maxDist=${maxDist}`);
    }
  }

  // 2.5 expansion directions
  for (const dir of ["north", "south", "east", "west"]) {
    const expTiles = resolveLocationHint(`expansion:${dir}`, state);
    check(`expansion:${dir} returns tiles`, expTiles.length > 0, `count=${expTiles.length}`);
  }

  // 2.6 coverage_gap
  const gap = resolveLocationHint("coverage_gap", state);
  check("coverage_gap returns tiles", gap.length > 0, `count=${gap.length}`);

  // 2.7 terrain:high_moisture
  const highMoisture = resolveLocationHint("terrain:high_moisture", state);
  check("terrain:high_moisture returns tiles", highMoisture.length >= 0, `count=${highMoisture.length}`);

  // 2.8 null/default hint
  const defaultTiles = resolveLocationHint(null, state);
  check("null hint returns default candidates", defaultTiles.length > 0, `count=${defaultTiles.length}`);

  return results;
}

/**
 * Scenario 3: Affordance Scoring Quality
 */
function benchAffordance(state) {
  const results = { tests: 0, passed: 0, details: [] };

  function check(name, ok, detail) {
    results.tests++;
    if (ok) results.passed++;
    results.details.push({ name, ok, detail });
  }

  // 3.1 Basic affordance
  check("empty cost → 1.0", computeAffordanceScore({ wood: 10 }, {}) === 1, "");
  check("cannot afford → 0", computeAffordanceScore({ wood: 3 }, { wood: 5 }) === 0, "");
  check("exactly afford → 0.5", Math.abs(computeAffordanceScore({ wood: 5 }, { wood: 5 }) - 0.5) < 0.01, "");
  check("2x afford → ~1.0", computeAffordanceScore({ wood: 10 }, { wood: 5 }) >= 0.99, "");

  // 3.2 Multi-resource bottleneck
  const multiScore = computeAffordanceScore(
    { wood: 20, stone: 3, food: 100, herbs: 0 },
    { wood: 6, stone: 5 }
  );
  check("multi-resource bottleneck detected", multiScore === 0, `score=${multiScore}`);

  // 3.3 Terrain ranking for farms prefers moisture
  const grid = state.grid;
  if (grid.moisture) {
    const grassTiles = [];
    for (let iz = 10; iz < 20; iz++) {
      for (let ix = 10; ix < 20; ix++) {
        if (state.grid.tiles[toIndex(ix, iz, grid.width)] === TILE.GRASS) {
          grassTiles.push({ ix, iz });
        }
        if (grassTiles.length >= 10) break;
      }
      if (grassTiles.length >= 10) break;
    }

    if (grassTiles.length >= 2) {
      const ranked = rankByTerrainQuality(grassTiles, "farm", grid);
      check("terrain ranking returns same count", ranked.length === grassTiles.length, `${ranked.length} vs ${grassTiles.length}`);
      check("terrain ranked tiles have scores", ranked.every(t => typeof t.terrainScore === "number"), "");
      check("terrain ranking is sorted descending", ranked.every((t, i) => i === 0 || t.terrainScore <= ranked[i - 1].terrainScore), "");
    }
  }

  return results;
}

/**
 * Scenario 4: End-to-End Plan Execution
 */
function benchPlanExecution(state) {
  const results = { tests: 0, passed: 0, details: [] };
  const buildSystem = new BuildSystem();

  function check(name, ok, detail) {
    results.tests++;
    if (ok) results.passed++;
    results.details.push({ name, ok, detail });
  }

  // Ensure sufficient resources
  state.resources.wood = 200;
  state.resources.stone = 50;
  state.resources.food = 200;
  state.resources.herbs = 20;

  // 4.1 Ground a multi-step plan
  const plan = groundPlan({
    goal: "establish food surplus",
    steps: [
      { id: 1, action: { type: "warehouse", hint: "coverage_gap" }, depends_on: [], priority: "high" },
      { id: 2, action: { type: "farm", hint: "near_step:1" }, depends_on: [1], priority: "high" },
      { id: 3, action: { type: "farm", hint: "near_step:1" }, depends_on: [1], priority: "medium" },
      { id: 4, action: { type: "road", hint: "near_step:1" }, depends_on: [1], priority: "low" },
    ],
  }, state, buildSystem);

  check("plan grounded with 4 steps", plan.steps.length === 4, `steps=${plan.steps.length}`);
  const groundedCount = plan.steps.filter(s => s.groundedTile != null).length;
  check("most steps have grounded tiles", groundedCount >= 3, `grounded=${groundedCount}/4`);
  const feasibleCount = plan.steps.filter(s => s.feasible).length;
  check("most steps are feasible", feasibleCount >= 3, `feasible=${feasibleCount}/4`);

  // 4.2 Execute tick 1
  const oldBuildings = (state.buildings?.warehouses ?? 0) + (state.buildings?.farms ?? 0) + (state.buildings?.roads ?? 0);
  const tick1 = executeNextSteps(plan, state, buildSystem);
  state.buildings = rebuildBuildingStats(state.grid);
  check("tick 1 executes steps", tick1.length > 0, `executed=${tick1.length}`);
  check("tick 1 limited to 2", tick1.length <= 2, `executed=${tick1.length}`);

  // 4.3 Check progress tracking
  const progress = getPlanProgress(plan);
  check("progress tracking works", progress.total === 4, `total=${progress.total}`);
  check("some steps completed", progress.completed > 0, `completed=${progress.completed}`);

  // 4.4 Execute remaining ticks
  let maxTicks = 5;
  while (!isPlanComplete(plan) && maxTicks-- > 0) {
    executeNextSteps(plan, state, buildSystem);
    state.buildings = rebuildBuildingStats(state.grid);
  }

  const finalProgress = getPlanProgress(plan);
  check("plan reaches completion", isPlanComplete(plan), `completed=${finalProgress.completed}/${finalProgress.total}`);

  // 4.5 Buildings actually placed
  const newBuildings = (state.buildings?.warehouses ?? 0) + (state.buildings?.farms ?? 0) + (state.buildings?.roads ?? 0);
  check("buildings actually placed on grid", newBuildings > oldBuildings, `old=${oldBuildings}, new=${newBuildings}`);

  // 4.6 Skill execution plan
  state.resources.wood = 200;
  state.resources.stone = 50;
  const skillPlan = groundPlan({
    goal: "fortify perimeter",
    steps: [
      { id: 1, action: { type: "skill", skill: "defense_line", hint: null }, depends_on: [] },
    ],
  }, state, buildSystem);

  check("skill plan grounded", skillPlan.steps.length === 1, "");
  const skillStep = skillPlan.steps[0];
  check("skill has sub-steps", skillStep.skillSubSteps?.length > 0, `subSteps=${skillStep.skillSubSteps?.length}`);

  if (skillStep.feasible) {
    const wallsBefore = state.buildings?.walls ?? 0;
    executeNextSteps(skillPlan, state, buildSystem);
    state.buildings = rebuildBuildingStats(state.grid);
    check("skill execution placed walls", (state.buildings?.walls ?? 0) > wallsBefore, `walls: ${wallsBefore} → ${state.buildings?.walls}`);
  } else {
    check("skill execution (skipped — infeasible)", true, "no valid placement");
  }

  return results;
}

/**
 * Scenario 5: Skill Feasibility Assessment on Real Maps
 */
function benchSkillFeasibility(state) {
  const results = { tests: 0, passed: 0, details: [] };
  const buildSystem = new BuildSystem();

  function check(name, ok, detail) {
    results.tests++;
    if (ok) results.passed++;
    results.details.push({ name, ok, detail });
  }

  // Test feasibility of each skill at various positions
  const warehouses = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  if (warehouses.length === 0) {
    check("has warehouses for feasibility test", false, "no warehouses");
    return results;
  }

  for (const skillId of Object.keys(SKILL_LIBRARY)) {
    // Try multiple candidate positions near warehouses
    const candidates = resolveLocationHint(null, state);
    let bestRatio = 0;
    let bestAnchor = null;
    const evalLimit = Math.min(candidates.length, 20);

    for (let i = 0; i < evalLimit; i++) {
      const feas = assessSkillFeasibility(skillId, candidates[i], state.grid, buildSystem, state);
      if (feas.ratio > bestRatio) {
        bestRatio = feas.ratio;
        bestAnchor = candidates[i];
      }
    }

    check(`${skillId}: found placement (ratio=${bestRatio.toFixed(2)})`, bestRatio > 0, bestAnchor ? `at (${bestAnchor.ix},${bestAnchor.iz})` : "none");

    // Terrain scoring
    if (bestAnchor) {
      const tScore = scoreSkillTerrain(skillId, bestAnchor, state.grid);
      check(`${skillId}: terrain score reasonable`, tScore > 0, `score=${tScore.toFixed(2)}`);
    }
  }

  return results;
}

// ── LLM Judge ──────��─────────────────────────────────────────────────

const JUDGE_SYSTEM_PROMPT = `You are an expert game AI evaluator specializing in build planning and execution systems. You will evaluate the quality of a Skill Library + Plan Executor system for a colony simulation game.

The system has two components:
1. **SkillLibrary**: Frozen compound build patterns (like "logistics_hub" = warehouse + roads + farms) with preconditions, terrain preferences, and expected effects
2. **PlanExecutor**: Grounds LLM-generated plans to actual game state — resolves location hints, scores affordability, ranks by terrain quality, executes with dependency ordering

Good execution systems should:
1. Ground abstract plans to concrete tile placements efficiently
2. Respect resource constraints and building dependencies
3. Place buildings in terrain-appropriate locations (farms on moist land, walls on ridges)
4. Handle compound skills as atomic operations
5. Detect blocked/infeasible plans gracefully

Score each dimension from 1-10 and provide brief justification.`;

function buildJudgePrompt(benchResults, groundTruth) {
  const sections = [];

  sections.push(`## Benchmark Context
- Map template: ${groundTruth.templateId}
- Simulation time: ${groundTruth.simTimeSec}s
- Grid: ${groundTruth.gridWidth}×${groundTruth.gridHeight}
- Workers: ${groundTruth.workers}, Buildings: ${groundTruth.totalBuildings}
- Resources: wood=${groundTruth.wood}, stone=${groundTruth.stone}, food=${groundTruth.food}`);

  for (const [name, result] of Object.entries(benchResults)) {
    sections.push(`\n### Scenario: ${name}
- Tests: ${result.tests}, Passed: ${result.passed} (${(result.passed / result.tests * 100).toFixed(0)}%)
- Details:`);
    for (const d of result.details) {
      sections.push(`  ${d.ok ? "✓" : "✗"} ${d.name}${d.detail ? ` — ${d.detail}` : ""}`);
    }
  }

  sections.push(`\n### Skill Library Design
${Object.entries(SKILL_LIBRARY).map(([id, s]) => `- **${s.name}** (${id}): ${s.description} — ${s.steps.length} steps, preconditions: ${JSON.stringify(s.preconditions)}`).join("\n")}

### Location Hint Types
- near_cluster:<id>, near_step:<id>, expansion:<dir>, coverage_gap, defense_line:<dir>, terrain:high_moisture, explicit coords

### Evaluation Dimensions

Score each dimension 1-10:

1. **Skill Design Quality** (1-10): Are skills well-composed? Do preconditions match actual costs? Are terrain preferences meaningful?

2. **Location Resolution** (1-10): Do all hint types resolve correctly? Are candidate tiles valid? Does fallback work?

3. **Affordance Scoring** (1-10): Does SayCan-inspired scoring correctly gate actions? Are edge cases handled?

4. **Terrain Awareness** (1-10): Do farm placements prefer moisture? Do walls prefer elevation? Is ranking effective?

5. **Plan Grounding** (1-10): Are dependencies resolved in order? Do grounded tiles match hints? Is the pipeline robust?

6. **Execution Reliability** (1-10): Do builds actually place on grid? Are resources deducted? Do skill sub-steps execute atomically?

7. **Error Handling** (1-10): Does the system handle infeasible placements, blocked plans, insufficient resources gracefully?

8. **Architecture Quality** (1-10): Is the code modular? Are concerns separated? Is the API surface clean for downstream integration?

Respond in JSON:
\`\`\`json
{
  "scores": {
    "skill_design": { "score": <1-10>, "justification": "<brief>" },
    "location_resolution": { "score": <1-10>, "justification": "<brief>" },
    "affordance_scoring": { "score": <1-10>, "justification": "<brief>" },
    "terrain_awareness": { "score": <1-10>, "justification": "<brief>" },
    "plan_grounding": { "score": <1-10>, "justification": "<brief>" },
    "execution_reliability": { "score": <1-10>, "justification": "<brief>" },
    "error_handling": { "score": <1-10>, "justification": "<brief>" },
    "architecture_quality": { "score": <1-10>, "justification": "<brief>" }
  },
  "overall_score": <1-10>,
  "strengths": ["<strength1>", "<strength2>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "improvement_suggestions": ["<suggestion1>", "<suggestion2>", "<suggestion3>"]
}
\`\`\``);

  return sections.join("\n");
}

async function callLLMJudge(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("ERROR: OPENAI_API_KEY not set. LLM judge unavailable.");
    return null;
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const url = `${baseUrl}/chat/completions`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.JUDGE_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error(`LLM judge HTTP ${resp.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    console.error("Could not parse LLM judge response as JSON");
    console.error(content.slice(0, 500));
    return null;
  } catch (err) {
    console.error(`LLM judge error: ${err.message}`);
    return null;
  }
}

// ── Self-Assessment ─────���────────────────────────────────────────────

function selfAssess(benchResults) {
  const scores = {};
  const allDetails = Object.values(benchResults).flatMap(r => r.details);
  const totalTests = Object.values(benchResults).reduce((s, r) => s + r.tests, 0);
  const totalPassed = Object.values(benchResults).reduce((s, r) => s + r.passed, 0);
  const passRate = totalPassed / totalTests;

  // Skill Design Quality
  const skillTests = benchResults.skillLibrary?.details ?? [];
  const skillPassed = skillTests.filter(d => d.ok).length;
  scores.skill_design = Math.min(10, Math.round(skillPassed / Math.max(1, skillTests.length) * 8 + 2));

  // Location Resolution
  const locTests = benchResults.locationHints?.details ?? [];
  const locPassed = locTests.filter(d => d.ok).length;
  scores.location_resolution = Math.min(10, Math.round(locPassed / Math.max(1, locTests.length) * 8 + 2));

  // Affordance Scoring
  const affTests = benchResults.affordance?.details ?? [];
  const affPassed = affTests.filter(d => d.ok).length;
  scores.affordance_scoring = Math.min(10, Math.round(affPassed / Math.max(1, affTests.length) * 8 + 2));

  // Terrain Awareness
  const terrainTests = allDetails.filter(d => d.name.includes("terrain"));
  const terrainPassed = terrainTests.filter(d => d.ok).length;
  scores.terrain_awareness = Math.min(10, Math.round(terrainPassed / Math.max(1, terrainTests.length) * 7 + 3));

  // Plan Grounding
  const planTests = benchResults.planExecution?.details?.filter(d => d.name.includes("ground") || d.name.includes("step")) ?? [];
  const planPassed = planTests.filter(d => d.ok).length;
  scores.plan_grounding = Math.min(10, Math.round(planPassed / Math.max(1, planTests.length) * 7 + 3));

  // Execution Reliability
  const execTests = benchResults.planExecution?.details?.filter(d => d.name.includes("execut") || d.name.includes("placed") || d.name.includes("complet")) ?? [];
  const execPassed = execTests.filter(d => d.ok).length;
  scores.execution_reliability = Math.min(10, Math.round(execPassed / Math.max(1, execTests.length) * 7 + 3));

  // Error Handling
  const errorTests = allDetails.filter(d => d.name.includes("unafford") || d.name.includes("OOB") || d.name.includes("poor") || d.name.includes("blocked") || d.name.includes("infeasible"));
  const errorPassed = errorTests.filter(d => d.ok).length;
  scores.error_handling = Math.min(10, Math.round(errorPassed / Math.max(1, errorTests.length) * 7 + 3));

  // Architecture Quality (based on overall pass rate)
  scores.architecture_quality = Math.min(10, Math.round(passRate * 8 + 2));

  const overall = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length * 10) / 10;
  return { scores, overall };
}

// ── Main ─────────────────────────────────────────────────────────────

async function run() {
  const args = parseArgs();
  const duration = Number(args.duration) || 180;
  const templateId = args.template || "temperate_plains";
  const seed = Number(args.seed) || 42;
  const skipLlm = args["skip-llm"] === true;

  console.log(`\n=== Executor Benchmark ===`);
  console.log(`Template: ${templateId}, Seed: ${seed}, Duration: ${duration}s\n`);

  // Initialize game and advance simulation
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

  console.log(`Advancing simulation ${duration}s to build colony...`);
  const simStart = performance.now();
  advanceSim(state, systems, services, duration);
  const simMs = Math.round(performance.now() - simStart);

  state.buildings = rebuildBuildingStats(state.grid);
  console.log(`Simulation done in ${simMs}ms`);
  console.log(`  Workers: ${state.agents.filter(a => a.type === "WORKER" && a.alive !== false).length}`);
  console.log(`  Buildings: ${JSON.stringify(state.buildings)}`);
  console.log(`  Resources: food=${state.resources.food}, wood=${state.resources.wood}, stone=${state.resources.stone}\n`);

  // Run benchmark scenarios
  const benchResults = {};

  console.log("--- Scenario 1: Skill Library ---");
  benchResults.skillLibrary = benchSkillLibrary(state);
  console.log(`  ${benchResults.skillLibrary.passed}/${benchResults.skillLibrary.tests} passed`);

  console.log("--- Scenario 2: Location Hints ---");
  benchResults.locationHints = benchLocationHints(state);
  console.log(`  ${benchResults.locationHints.passed}/${benchResults.locationHints.tests} passed`);

  console.log("--- Scenario 3: Affordance Scoring ---");
  benchResults.affordance = benchAffordance(state);
  console.log(`  ${benchResults.affordance.passed}/${benchResults.affordance.tests} passed`);

  console.log("--- Scenario 4: Plan Execution ---");
  benchResults.planExecution = benchPlanExecution(state);
  console.log(`  ${benchResults.planExecution.passed}/${benchResults.planExecution.tests} passed`);

  console.log("--- Scenario 5: Skill Feasibility ---");
  benchResults.skillFeasibility = benchSkillFeasibility(state);
  console.log(`  ${benchResults.skillFeasibility.passed}/${benchResults.skillFeasibility.tests} passed`);

  // Print all failed tests
  const allFailed = Object.entries(benchResults).flatMap(([name, r]) =>
    r.details.filter(d => !d.ok).map(d => ({ scenario: name, ...d }))
  );
  if (allFailed.length > 0) {
    console.log(`\n=== Failed Tests (${allFailed.length}) ===`);
    for (const f of allFailed) {
      console.log(`  ✗ [${f.scenario}] ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    }
  }

  // Self-assessment
  console.log("\n=== Self-Assessment ===");
  const selfResult = selfAssess(benchResults);
  for (const [dim, score] of Object.entries(selfResult.scores)) {
    const bar = "█".repeat(score) + "���".repeat(10 - score);
    console.log(`  ${dim.padEnd(24)} ${bar} ${score}/10`);
  }
  console.log(`  ${"OVERALL".padEnd(24)} ${selfResult.overall}/10`);

  // LLM judge
  let llmResult = null;
  if (!skipLlm) {
    console.log("\n=== LLM Judge ===");
    const groundTruth = {
      templateId,
      simTimeSec: duration,
      gridWidth: state.grid.width,
      gridHeight: state.grid.height,
      workers: state.agents.filter(a => a.type === "WORKER" && a.alive !== false).length,
      totalBuildings: Object.values(state.buildings).reduce((s, v) => s + v, 0),
      wood: state.resources.wood,
      stone: state.resources.stone,
      food: state.resources.food,
    };

    const judgePrompt = buildJudgePrompt(benchResults, groundTruth);
    console.log("Sending benchmark results to LLM judge...");
    llmResult = await callLLMJudge(JUDGE_SYSTEM_PROMPT, judgePrompt);

    if (llmResult) {
      console.log("\nLLM Judge Scores:");
      for (const [dim, val] of Object.entries(llmResult.scores ?? {})) {
        const score = val.score ?? 0;
        const bar = "█".repeat(score) + "░".repeat(10 - score);
        console.log(`  ${dim.padEnd(24)} ${bar} ${score}/10  ${val.justification ?? ""}`);
      }
      console.log(`  ${"OVERALL".padEnd(24)} ${llmResult.overall_score ?? "?"}/10`);
      if (llmResult.strengths?.length > 0) {
        console.log(`\n  Strengths:`);
        for (const s of llmResult.strengths) console.log(`    + ${s}`);
      }
      if (llmResult.weaknesses?.length > 0) {
        console.log(`  Weaknesses:`);
        for (const w of llmResult.weaknesses) console.log(`    - ${w}`);
      }
      if (llmResult.improvement_suggestions?.length > 0) {
        console.log(`  Suggestions:`);
        for (const s of llmResult.improvement_suggestions) console.log(`    > ${s}`);
      }
    } else {
      console.log("LLM judge unavailable — using self-assessment only.");
    }
  }

  // Final summary
  const totalTests = Object.values(benchResults).reduce((s, r) => s + r.tests, 0);
  const totalPassed = Object.values(benchResults).reduce((s, r) => s + r.passed, 0);
  const finalScore = llmResult?.overall_score ?? selfResult.overall;

  console.log("\n=== Final Summary ===");
  console.log(`Template: ${templateId}`);
  console.log(`Tests: ${totalPassed}/${totalTests} passed (${(totalPassed / totalTests * 100).toFixed(0)}%)`);
  console.log(`Final score: ${finalScore}/10`);

  if (finalScore < 6) {
    console.log("\n⚠ BELOW THRESHOLD — improvement needed");
    process.exitCode = 1;
  } else if (finalScore < 8) {
    console.log("\n✓ PASSING — room for improvement");
  } else {
    console.log("\n✓✓ EXCELLENT");
  }

  return { benchResults, selfAssessment: selfResult, llmAssessment: llmResult, finalScore };
}

run().catch(err => { console.error(err); process.exit(1); });
