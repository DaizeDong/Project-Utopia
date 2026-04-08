/**
 * Comprehensive Game Evaluation Runner
 *
 * Evaluates the game across 6 dimensions:
 *   1. Stability    — Long-run correctness, no NaN/crash/resource leaks
 *   2. Development  — Progressive complexity growth, extreme scaling
 *   3. Coverage     — All game elements utilized during play
 *   4. Playability  — Tension curves, decision variety, engagement proxies
 *   5. Technical    — AI quality, pathfinding, state machine validity
 *   6. Reasonableness — NPC behavior naturalness, thematic coherence
 *
 * Usage:
 *   node scripts/comprehensive-eval.mjs
 *   node scripts/comprehensive-eval.mjs --duration=60 --quick
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { SimulationClock } from "../src/app/SimulationClock.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { ColonyDirectorSystem } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { MemoryObserver } from "../src/simulation/ai/memory/MemoryObserver.js";
import { StrategicDirector } from "../src/simulation/ai/strategic/StrategicDirector.js";
import { EnvironmentDirectorSystem } from "../src/simulation/ai/director/EnvironmentDirectorSystem.js";
import { WeatherSystem } from "../src/world/weather/WeatherSystem.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { NPCBrainSystem } from "../src/simulation/ai/brains/NPCBrainSystem.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { VisitorAISystem } from "../src/simulation/npc/VisitorAISystem.js";
import { AnimalAISystem } from "../src/simulation/npc/AnimalAISystem.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { WildlifePopulationSystem } from "../src/simulation/ecology/WildlifePopulationSystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";
import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";
import { ProcessingSystem } from "../src/simulation/economy/ProcessingSystem.js";
import { evaluateRunOutcomeState } from "../src/app/runOutcome.js";
import { BENCHMARK_PRESETS, applyPreset } from "../src/benchmark/BenchmarkPresets.js";
import { TILE, ROLE, TILE_INFO } from "../src/config/constants.js";
import { BALANCE, BUILD_COST } from "../src/config/balance.js";
import { rebuildBuildingStats, tileToWorld, countTilesByType } from "../src/world/grid/Grid.js";

// ── Configuration ──────────────────────────────────────────────────────

const DT_SEC = 1 / 30;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq < 0) { args[token.slice(2)] = true; continue; }
    args[token.slice(2, eq)] = token.slice(eq + 1);
  }
  return args;
}

function round(v, d = 2) {
  const s = Number(v);
  return Number.isFinite(s) ? Number(s.toFixed(d)) : s;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function cv(arr) {
  const m = mean(arr);
  return m > 0 ? stddev(arr) / m : 0;
}

// ── System builder ─────────────────────────────────────────────────────

function buildSystems(memoryStore) {
  return [
    new SimulationClock(),
    new ProgressionSystem(),
    new ColonyDirectorSystem(),
    new RoleAssignmentSystem(),
    new StrategicDirector(memoryStore),
    new EnvironmentDirectorSystem(),
    new WeatherSystem(),
    new WorldEventSystem(),
    new NPCBrainSystem(),
    new WorkerAISystem(),
    new VisitorAISystem(),
    new AnimalAISystem(),
    new MortalitySystem(),
    new WildlifePopulationSystem(),
    new BoidsSystem(),
    new ResourceSystem(),
    new ProcessingSystem(),
  ];
}

function refreshPopulationStats(state) {
  const workers = state.agents.filter((a) => a.type === "WORKER" && a.alive !== false);
  state.metrics.populationStats = {
    workers: workers.length,
    totalEntities: state.agents.length + (state.animals?.length ?? 0),
  };
  state.metrics.deathsTotal = state.metrics.deathsTotal ?? 0;
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

// ── Core simulation runner ─────────────────────────────────────────────

async function runSimulation(config) {
  const {
    templateId = "temperate_plains",
    seed = 1337,
    durationSec = 120,
    sampleIntervalSec = 2,
    presetId = null,
  } = config;

  const state = createInitialGameState({ templateId, seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = true;
  state.ai.coverageTarget = "fallback";

  if (presetId) {
    const preset = BENCHMARK_PRESETS.find((p) => p.id === presetId);
    if (preset) applyPreset(state, preset);
  }

  const memoryStore = new MemoryStore();
  const memoryObserver = new MemoryObserver(memoryStore);
  const services = createServices(state.world.mapSeed, {
    offlineAiFallback: true,
    baseUrl: "",
  });
  services.memoryStore = memoryStore;
  const systems = buildSystems(memoryStore);

  const totalTicks = Math.round(durationSec / DT_SEC);
  const sampleEveryTicks = Math.max(1, Math.round(sampleIntervalSec / DT_SEC));

  // Tracking state for all 6 dimensions
  const tracker = {
    samples: [],
    errors: [],
    nanDetected: 0,
    negativeResources: 0,
    maxEntities: 0,
    // Coverage tracking
    tilesPlaced: new Set(),
    tilesOnMap: new Set(),
    rolesAssigned: new Set(),
    intentsChosen: new Set(),
    statesVisited: new Set(),
    resourcesProduced: new Set(),
    resourcesConsumed: new Set(),
    weathersSeen: new Set(),
    // Behavior tracking
    intentHistory: [],       // per-sample intent distribution
    stateHistory: [],        // per-sample state distribution
    goalFlips: 0,
    invalidTransitions: 0,
    // Development tracking
    buildingCountHistory: [],
    resourceDiversityHistory: [],
    roleDiversityHistory: [],
    objectivesCompleted: 0,
    peakWorkers: 0,
    peakBuildings: 0,
    // Technical tracking
    pathRecalcs: 0,
    pathCacheHits: 0,
    pathCacheMisses: 0,
    boidsMaxLoad: 0,
    aiDecisions: 0,
    aiFallbacks: 0,
  };

  const initialWorkers = state.agents.filter((a) => a.type === "WORKER").length;

  for (let tick = 0; tick < totalTicks; tick += 1) {
    // Run systems
    for (const system of systems) {
      try {
        system.update(DT_SEC, state, services);
      } catch (err) {
        tracker.errors.push({ tick, system: system.name, message: err.message });
      }
    }
    // Flush microtasks periodically so async AI decisions resolve
    if (tick % 30 === 0) await flush();
    refreshPopulationStats(state);
    memoryObserver.observe(state);

    // Check run outcome
    const outcome = state.session.phase === "active" ? evaluateRunOutcomeState(state) : null;
    if (outcome) {
      state.session.phase = "end";
      state.session.outcome = outcome.outcome;
      state.session.reason = outcome.reason;
      state.session.endedAtSec = Number(state.metrics.timeSec ?? 0);
    }

    // NaN/negative detection
    for (const key of ["food", "wood", "stone", "herbs", "meals", "medicine", "tools"]) {
      const v = state.resources[key];
      if (!Number.isFinite(v)) tracker.nanDetected += 1;
      if (v < -0.001) tracker.negativeResources += 1;
    }

    // Entity count tracking
    const entityCount = state.agents.length + (state.animals?.length ?? 0);
    if (entityCount > tracker.maxEntities) tracker.maxEntities = entityCount;

    // Coverage: weather
    tracker.weathersSeen.add(state.weather.current);

    // Coverage: tiles on map
    if (tick % (sampleEveryTicks * 5) === 0) {
      for (const tileId of Object.values(TILE)) {
        if (countTilesByType(state.grid, [tileId]) > 0) tracker.tilesOnMap.add(tileId);
      }
    }

    // Sample collection
    if (tick === 0 || tick === totalTicks - 1 || tick % sampleEveryTicks === 0) {
      const t = round(state.metrics.timeSec ?? 0, 2);
      const workers = state.agents.filter((a) => a.type === "WORKER" && a.alive !== false);

      // Intent distribution
      const intentDist = {};
      const stateDist = {};
      const roleDist = {};
      for (const w of workers) {
        const intent = String(w.debug?.lastIntent ?? "unknown");
        intentDist[intent] = (intentDist[intent] ?? 0) + 1;
        tracker.intentsChosen.add(intent);

        const sl = String(w.stateLabel ?? "Idle").split(" ")[0].toLowerCase();
        stateDist[sl] = (stateDist[sl] ?? 0) + 1;
        tracker.statesVisited.add(sl);

        const role = String(w.role ?? "FARM");
        roleDist[role] = (roleDist[role] ?? 0) + 1;
        tracker.rolesAssigned.add(role);
      }
      tracker.intentHistory.push(intentDist);
      tracker.stateHistory.push(stateDist);

      // Resource diversity
      const resDiversity = ["food", "wood", "stone", "herbs", "meals", "medicine", "tools"]
        .filter((k) => state.resources[k] > 0.01).length;
      tracker.resourceDiversityHistory.push(resDiversity);

      // Building counts
      const bldgs = state.buildings ?? {};
      const totalBuildings = (bldgs.farms ?? 0) + (bldgs.lumbers ?? 0) + (bldgs.warehouses ?? 0)
        + (bldgs.walls ?? 0) + (bldgs.quarries ?? 0) + (bldgs.herbGardens ?? 0)
        + (bldgs.kitchens ?? 0) + (bldgs.smithies ?? 0) + (bldgs.clinics ?? 0);
      tracker.buildingCountHistory.push(totalBuildings);
      tracker.roleDiversityHistory.push(Object.keys(roleDist).length);
      if (totalBuildings > tracker.peakBuildings) tracker.peakBuildings = totalBuildings;
      if (workers.length > tracker.peakWorkers) tracker.peakWorkers = workers.length;

      // Resources produced tracking
      for (const key of ["food", "wood", "stone", "herbs", "meals", "medicine", "tools"]) {
        if (state.resources[key] > 0.01) tracker.resourcesProduced.add(key);
      }

      tracker.samples.push({
        t,
        food: round(state.resources.food, 2),
        wood: round(state.resources.wood, 2),
        stone: round(state.resources.stone, 2),
        herbs: round(state.resources.herbs, 2),
        meals: round(state.resources.meals, 2),
        medicine: round(state.resources.medicine, 2),
        tools: round(state.resources.tools, 2),
        workers: workers.length,
        prosperity: round(state.gameplay.prosperity ?? 0, 2),
        threat: round(state.gameplay.threat ?? 0, 2),
        totalEntities: entityCount,
        totalBuildings,
        resourceDiversity: resDiversity,
        roleDiversity: Object.keys(roleDist).length,
        intentDist,
        roleDist,
        weather: state.weather.current,
        toolMultiplier: round(state.gameplay?.toolProductionMultiplier ?? 1, 3),
      });
    }

    // Technical metrics aggregation
    tracker.goalFlips = Number(state.metrics.goalFlipCount ?? 0);
    tracker.invalidTransitions = Number(state.metrics.invalidTransitionCount ?? 0);
    tracker.pathRecalcs = Number(state.debug?.astar?.requests ?? 0);
    tracker.pathCacheHits = Number(state.debug?.astar?.cacheHits ?? 0);
    tracker.pathCacheMisses = Number(state.debug?.astar?.cacheMisses ?? 0);
    tracker.boidsMaxLoad = Math.max(tracker.boidsMaxLoad, Number(state.debug?.boids?.peakTileLoad ?? 0));
    tracker.aiDecisions = Number(state.ai.environmentDecisionCount ?? 0) + Number(state.ai.policyDecisionCount ?? 0);
    tracker.aiFallbacks = tracker.aiDecisions; // all fallback in headless mode

    if (state.session.phase === "end") break;
  }

  // Final objective count
  const objectives = state.gameplay?.objectives ?? [];
  tracker.objectivesCompleted = objectives.filter((o) => o.completed).length;

  return {
    state,
    tracker,
    initialWorkers,
    survivalSec: state.session.phase === "end"
      ? Number(state.session.endedAtSec ?? 0)
      : durationSec,
    outcome: String(state.session.outcome ?? "none"),
    reason: String(state.session.reason ?? ""),
  };
}

// ── Evaluation Dimension Scorers ───────────────────────────────────────

function evaluateStability(results) {
  const scores = [];
  const details = [];

  for (const r of results) {
    const t = r.tracker;
    const nanScore = t.nanDetected === 0 ? 1 : Math.max(0, 1 - t.nanDetected / 100);
    const negScore = t.negativeResources === 0 ? 1 : Math.max(0, 1 - t.negativeResources / 100);
    const errorScore = t.errors.length === 0 ? 1 : Math.max(0, 1 - t.errors.length / 10);
    const survScore = r.survivalSec / r.config.durationSec;
    const score = (nanScore * 0.3 + negScore * 0.2 + errorScore * 0.2 + survScore * 0.3);
    scores.push(score);

    details.push({
      preset: r.config.presetId ?? "default",
      template: r.config.templateId,
      survivalSec: round(r.survivalSec),
      targetSec: r.config.durationSec,
      survived: r.survivalSec >= r.config.durationSec * 0.95,
      nanDetected: t.nanDetected,
      negativeResources: t.negativeResources,
      systemErrors: t.errors.length,
      maxEntities: t.maxEntities,
      outcome: r.outcome,
      reason: r.reason,
    });
  }

  return {
    score: round(mean(scores), 3),
    grade: gradeScore(mean(scores)),
    details,
    issues: details.filter((d) => !d.survived || d.nanDetected > 0 || d.systemErrors > 0),
  };
}

function evaluateDevelopment(results) {
  const details = [];

  for (const r of results) {
    const t = r.tracker;
    const bh = t.buildingCountHistory;
    const rd = t.resourceDiversityHistory;
    const rl = t.roleDiversityHistory;

    // Growth: did complexity increase over time?
    const earlyBuildings = mean(bh.slice(0, Math.max(1, Math.floor(bh.length * 0.2))));
    const lateBuildings = mean(bh.slice(Math.floor(bh.length * 0.8)));
    const buildingGrowth = lateBuildings > earlyBuildings ? 1 : (lateBuildings === earlyBuildings ? 0.5 : 0);

    const earlyRes = mean(rd.slice(0, Math.max(1, Math.floor(rd.length * 0.2))));
    const lateRes = mean(rd.slice(Math.floor(rd.length * 0.8)));
    const resGrowth = lateRes > earlyRes ? 1 : (lateRes === earlyRes ? 0.5 : 0);

    const peakRoleDiversity = Math.max(...rl, 0);
    const roleDivScore = Math.min(1, peakRoleDiversity / 5); // 5+ roles = perfect

    const objScore = t.objectivesCompleted / 3;

    details.push({
      preset: r.config.presetId ?? "default",
      earlyBuildings: round(earlyBuildings),
      lateBuildings: round(lateBuildings),
      buildingGrowth: round(buildingGrowth, 1),
      earlyResourceDiversity: round(earlyRes, 1),
      lateResourceDiversity: round(lateRes, 1),
      resourceGrowth: round(resGrowth, 1),
      peakRoleDiversity,
      roleDiversityScore: round(roleDivScore, 2),
      peakWorkers: t.peakWorkers,
      peakBuildings: t.peakBuildings,
      objectivesCompleted: t.objectivesCompleted,
      objectiveScore: round(objScore, 2),
    });
  }

  const scores = details.map((d) =>
    d.buildingGrowth * 0.2 + d.resourceGrowth * 0.2 + d.roleDiversityScore * 0.25 + d.objectiveScore * 0.35
  );

  return {
    score: round(mean(scores), 3),
    grade: gradeScore(mean(scores)),
    details,
  };
}

function evaluateCoverage(results) {
  const allTilesPlaced = new Set();
  const allTilesOnMap = new Set();
  const allRoles = new Set();
  const allIntents = new Set();
  const allStates = new Set();
  const allResources = new Set();
  const allWeathers = new Set();

  for (const r of results) {
    r.tracker.tilesPlaced.forEach((t) => allTilesPlaced.add(t));
    r.tracker.tilesOnMap.forEach((t) => allTilesOnMap.add(t));
    r.tracker.rolesAssigned.forEach((r2) => allRoles.add(r2));
    r.tracker.intentsChosen.forEach((i) => allIntents.add(i));
    r.tracker.statesVisited.forEach((s) => allStates.add(s));
    r.tracker.resourcesProduced.forEach((r2) => allResources.add(r2));
    r.tracker.weathersSeen.forEach((w) => allWeathers.add(w));
  }

  // Define expected elements
  const expectedTileTypes = Object.keys(TILE).length; // 13 tile types (0-12)
  const expectedRoles = Object.keys(ROLE).length;     // 8 roles
  const expectedResources = 7; // food, wood, stone, herbs, meals, medicine, tools
  const expectedWeathers = 5;  // clear, rain, storm, drought, winter
  const expectedIntents = ["farm", "lumber", "deliver", "eat", "wander", "quarry", "gather_herbs", "cook", "smith", "heal"];

  const tileScore = allTilesOnMap.size / expectedTileTypes;
  const roleScore = allRoles.size / expectedRoles;
  const resourceScore = allResources.size / expectedResources;
  const weatherScore = allWeathers.size / expectedWeathers;
  const intentScore = allIntents.size / expectedIntents.length;

  const missingTiles = Object.entries(TILE).filter(([, v]) => !allTilesOnMap.has(v)).map(([k]) => k);
  const missingRoles = Object.keys(ROLE).filter((k) => !allRoles.has(k));
  const missingResources = ["food", "wood", "stone", "herbs", "meals", "medicine", "tools"].filter((k) => !allResources.has(k));
  const missingIntents = expectedIntents.filter((i) => !allIntents.has(i));

  const overallScore = tileScore * 0.2 + roleScore * 0.2 + resourceScore * 0.25 + intentScore * 0.2 + weatherScore * 0.15;

  return {
    score: round(overallScore, 3),
    grade: gradeScore(overallScore),
    details: {
      tilesOnMap: { found: allTilesOnMap.size, expected: expectedTileTypes, missing: missingTiles, score: round(tileScore, 2) },
      roles: { found: allRoles.size, expected: expectedRoles, missing: missingRoles, score: round(roleScore, 2) },
      resources: { found: allResources.size, expected: expectedResources, missing: missingResources, score: round(resourceScore, 2) },
      intents: { found: allIntents.size, expected: expectedIntents.length, missing: missingIntents, score: round(intentScore, 2) },
      weathers: { found: allWeathers.size, expected: expectedWeathers, missing: [], score: round(weatherScore, 2) },
    },
  };
}

function evaluatePlayability(results) {
  const details = [];

  for (const r of results) {
    const samples = r.tracker.samples;
    if (samples.length < 3) { details.push({ score: 0 }); continue; }

    // 1. Tension curve: prosperity/threat should oscillate, not flatline
    const prosArr = samples.map((s) => s.prosperity);
    const threatArr = samples.map((s) => s.threat);
    const prosCv = cv(prosArr);
    const threatCv = cv(threatArr);
    const tensionScore = Math.min(1, (prosCv + threatCv) / 0.6); // moderate variation = good

    // 2. Decision variety: how evenly distributed are intents?
    const allIntents = {};
    for (const ih of r.tracker.intentHistory) {
      for (const [intent, count] of Object.entries(ih)) {
        allIntents[intent] = (allIntents[intent] ?? 0) + count;
      }
    }
    const intentValues = Object.values(allIntents);
    const intentEntropy = entropy(intentValues);
    const maxEntropy = Math.log2(Math.max(1, intentValues.length));
    const varietyScore = maxEntropy > 0 ? intentEntropy / maxEntropy : 0;

    // 3. Resource curve health: resources shouldn't flatline at 0 or skyrocket
    const foodArr = samples.map((s) => s.food);
    const woodArr = samples.map((s) => s.wood);
    const foodHealth = 1 - Math.min(1, foodArr.filter((f) => f <= 1).length / foodArr.length);
    const woodHealth = 1 - Math.min(1, woodArr.filter((w) => w <= 1).length / woodArr.length);
    const resourceHealth = (foodHealth + woodHealth) / 2;

    // 4. Progression: did the player make meaningful progress?
    const progressScore = r.tracker.objectivesCompleted / 3;

    const score = tensionScore * 0.25 + varietyScore * 0.25 + resourceHealth * 0.25 + progressScore * 0.25;

    details.push({
      preset: r.config.presetId ?? "default",
      tensionScore: round(tensionScore, 3),
      prosperityCV: round(prosCv, 3),
      threatCV: round(threatCv, 3),
      varietyScore: round(varietyScore, 3),
      intentDistribution: allIntents,
      resourceHealth: round(resourceHealth, 3),
      foodZeroRatio: round(1 - foodHealth, 3),
      woodZeroRatio: round(1 - woodHealth, 3),
      progressScore: round(progressScore, 2),
      score: round(score, 3),
    });
  }

  const overallScore = mean(details.map((d) => d.score));
  return {
    score: round(overallScore, 3),
    grade: gradeScore(overallScore),
    details,
  };
}

function evaluateTechnical(results) {
  const details = [];

  for (const r of results) {
    const t = r.tracker;

    // Pathfinding quality
    const totalPathOps = t.pathCacheHits + t.pathCacheMisses;
    const cacheHitRate = totalPathOps > 0 ? t.pathCacheHits / totalPathOps : 0;

    // State machine validity
    const totalTransitions = Math.max(1, t.goalFlips + t.invalidTransitions + 100);
    const validityScore = 1 - (t.invalidTransitions / totalTransitions);

    // Goal stability (fewer flips = more decisive AI)
    const workersPerMin = r.initialWorkers;
    const durationMin = r.survivalSec / 60;
    const flipsPerWorkerPerMin = durationMin > 0 && workersPerMin > 0
      ? t.goalFlips / (workersPerMin * durationMin)
      : 0;
    const goalStability = Math.max(0, 1 - flipsPerWorkerPerMin / 5); // >5 flips/worker/min = terrible

    // AI decision rate
    const decisionRate = durationMin > 0 ? t.aiDecisions / durationMin : 0;
    const aiActivityScore = Math.min(1, decisionRate / 10); // expect ~5-10 decisions/min

    // Tool multiplier effectiveness (did tools actually get made?)
    const lastSample = r.tracker.samples[r.tracker.samples.length - 1];
    const toolMultiplier = lastSample?.toolMultiplier ?? 1;
    const toolScore = Math.min(1, (toolMultiplier - 1) / 0.45); // 1.45 = max

    const score = cacheHitRate * 0.15 + validityScore * 0.25 + goalStability * 0.2
      + aiActivityScore * 0.2 + toolScore * 0.2;

    details.push({
      preset: r.config.presetId ?? "default",
      pathCacheHitRate: round(cacheHitRate, 3),
      pathRecalcs: t.pathRecalcs,
      invalidTransitions: t.invalidTransitions,
      goalFlips: t.goalFlips,
      goalStabilityScore: round(goalStability, 3),
      flipsPerWorkerPerMin: round(flipsPerWorkerPerMin, 2),
      validityScore: round(validityScore, 3),
      aiDecisions: t.aiDecisions,
      aiDecisionRate: round(decisionRate, 1),
      aiActivityScore: round(aiActivityScore, 3),
      boidsMaxLoad: round(t.boidsMaxLoad, 1),
      toolMultiplier: round(toolMultiplier, 3),
      toolScore: round(toolScore, 2),
      score: round(score, 3),
    });
  }

  return {
    score: round(mean(details.map((d) => d.score)), 3),
    grade: gradeScore(mean(details.map((d) => d.score))),
    details,
  };
}

function evaluateReasonableness(results) {
  const details = [];

  for (const r of results) {
    const samples = r.tracker.samples;
    if (samples.length < 3) { details.push({ score: 0 }); continue; }

    // 1. Behavior diversity: workers should not all do the same thing
    const diversityScores = [];
    for (const ih of r.tracker.intentHistory) {
      const vals = Object.values(ih);
      const total = vals.reduce((a, b) => a + b, 0);
      if (total === 0) continue;
      const ent = entropy(vals);
      const maxEnt = Math.log2(Math.max(1, vals.length));
      diversityScores.push(maxEnt > 0 ? ent / maxEnt : 0);
    }
    const avgDiversity = mean(diversityScores);

    // 2. Repetition detection: count consecutive samples with identical intent distribution
    let repetitiveStreak = 0;
    let maxRepetitiveStreak = 0;
    for (let i = 1; i < r.tracker.intentHistory.length; i += 1) {
      const prev = JSON.stringify(r.tracker.intentHistory[i - 1]);
      const curr = JSON.stringify(r.tracker.intentHistory[i]);
      if (prev === curr) {
        repetitiveStreak += 1;
        if (repetitiveStreak > maxRepetitiveStreak) maxRepetitiveStreak = repetitiveStreak;
      } else {
        repetitiveStreak = 0;
      }
    }
    const maxPossibleStreak = Math.max(1, r.tracker.intentHistory.length - 1);
    const nonRepetitionScore = 1 - Math.min(1, maxRepetitiveStreak / Math.max(5, maxPossibleStreak * 0.3));

    // 3. Thematic coherence: do hungry workers eat? do loaded workers deliver?
    // Proxy: check that "eat" intent appears when food is available, "deliver" appears at all
    const hasEatIntent = r.tracker.intentsChosen.has("eat");
    const hasDeliverIntent = r.tracker.intentsChosen.has("deliver");
    const hasWorkIntents = r.tracker.intentsChosen.has("farm") || r.tracker.intentsChosen.has("lumber");
    const coherenceScore = (hasEatIntent ? 0.33 : 0) + (hasDeliverIntent ? 0.33 : 0) + (hasWorkIntents ? 0.34 : 0);

    // 4. Role-building alignment: specialist roles only when buildings exist
    // Already enforced by RoleAssignmentSystem, but check if workers are doing matching work
    const roleIntentAlignment = [];
    for (const ih of r.tracker.intentHistory) {
      const farmIntent = ih["farm"] ?? 0;
      const lumberIntent = ih["lumber"] ?? 0;
      const total = Object.values(ih).reduce((a, b) => a + b, 0);
      if (total > 0) {
        // productive work ratio (excluding eat/wander/idle)
        const productive = (farmIntent + lumberIntent + (ih["quarry"] ?? 0) + (ih["gather_herbs"] ?? 0)
          + (ih["cook"] ?? 0) + (ih["smith"] ?? 0) + (ih["heal"] ?? 0) + (ih["deliver"] ?? 0));
        roleIntentAlignment.push(productive / total);
      }
    }
    const productivityRate = mean(roleIntentAlignment);

    const score = avgDiversity * 0.3 + nonRepetitionScore * 0.2 + coherenceScore * 0.2 + productivityRate * 0.3;

    details.push({
      preset: r.config.presetId ?? "default",
      avgBehaviorDiversity: round(avgDiversity, 3),
      maxRepetitiveStreak,
      nonRepetitionScore: round(nonRepetitionScore, 3),
      coherenceScore: round(coherenceScore, 2),
      hasEatIntent: hasEatIntent,
      hasDeliverIntent: hasDeliverIntent,
      hasWorkIntents: hasWorkIntents,
      productivityRate: round(productivityRate, 3),
      score: round(score, 3),
    });
  }

  return {
    score: round(mean(details.map((d) => d.score)), 3),
    grade: gradeScore(mean(details.map((d) => d.score))),
    details,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function entropy(values) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let h = 0;
  for (const v of values) {
    if (v <= 0) continue;
    const p = v / total;
    h -= p * Math.log2(p);
  }
  return h;
}

function gradeScore(score) {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.65) return "C";
  if (score >= 0.5) return "D";
  return "F";
}

// ── Scenario configurations ────────────────────────────────────────────

function buildEvalScenarios(durationSec, quick) {
  const baseDuration = quick ? Math.min(durationSec, 60) : durationSec;
  const longDuration = quick ? Math.min(durationSec, 90) : Math.max(durationSec, 180);

  return [
    // Stability: long run across all templates
    { id: "stability-temperate", templateId: "temperate_plains", seed: 1337, durationSec: longDuration, sampleIntervalSec: 3, category: "stability" },
    { id: "stability-fortified", templateId: "fortified_basin", seed: 1337, durationSec: longDuration, sampleIntervalSec: 3, category: "stability" },
    { id: "stability-archipelago", templateId: "archipelago_isles", seed: 1337, durationSec: longDuration, sampleIntervalSec: 3, category: "stability" },

    // Economy presets (stability + coverage)
    { id: "economy-scarce", templateId: "temperate_plains", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "scarce_resources", category: "economy" },
    { id: "economy-abundant", templateId: "temperate_plains", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "abundant_resources", category: "economy" },
    { id: "economy-chains", templateId: "temperate_plains", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "resource_chains_basic", category: "economy" },
    { id: "economy-full", templateId: "fortified_basin", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "full_processing", category: "economy" },
    { id: "economy-tooled", templateId: "fortified_basin", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "tooled_colony", category: "economy" },

    // Pressure presets
    { id: "pressure-threat", templateId: "temperate_plains", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "high_threat", category: "pressure" },
    { id: "pressure-skeleton", templateId: "temperate_plains", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "skeleton_crew", category: "pressure" },
    { id: "pressure-large", templateId: "fortified_basin", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "large_colony", category: "pressure" },
    { id: "pressure-wildlife", templateId: "archipelago_isles", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "wildlife_heavy", category: "pressure" },
    { id: "pressure-storm", templateId: "temperate_plains", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "storm_start", category: "pressure" },

    // Development: progressive building (ColonyDirectorSystem handles autonomous building)
    { id: "development-progressive", templateId: "temperate_plains", seed: 1337, durationSec: longDuration, sampleIntervalSec: 3, category: "development" },

    // Extreme: developed colony
    { id: "extreme-developed", templateId: "fortified_basin", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "developed_colony", category: "extreme" },

    // Multi-seed stability check
    { id: "seed-variant-1", templateId: "temperate_plains", seed: 256, durationSec: baseDuration, sampleIntervalSec: 3, category: "stability" },
    { id: "seed-variant-2", templateId: "temperate_plains", seed: 789, durationSec: baseDuration, sampleIntervalSec: 3, category: "stability" },
  ];
}

// ── Report generation ──────────────────────────────────────────────────

function generateMarkdownReport(evaluation) {
  const lines = [];
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  lines.push("# Project Utopia — Comprehensive Game Evaluation Report");
  lines.push("");
  lines.push(`> Generated: ${now}`);
  lines.push(`> Version: 0.5.0 (Phase 1: Resource Chains)`);
  lines.push(`> Scenarios: ${evaluation.totalScenarios} | Duration: ${evaluation.totalDurationSec}s total sim time`);
  lines.push("");

  // Overall scorecard
  lines.push("## Overall Scorecard");
  lines.push("");
  lines.push("| Dimension | Score | Grade | Description |");
  lines.push("|---|---|---|---|");
  const dims = [
    ["Stability", evaluation.stability, "Long-run correctness, no crashes or data corruption"],
    ["Development", evaluation.development, "Progressive complexity growth and objective completion"],
    ["Coverage", evaluation.coverage, "All game elements utilized during play"],
    ["Playability", evaluation.playability, "Tension curves, decision variety, engagement"],
    ["Technical", evaluation.technical, "AI quality, pathfinding, state machine validity"],
    ["Reasonableness", evaluation.reasonableness, "NPC behavior naturalness and thematic coherence"],
  ];
  for (const [name, dim, desc] of dims) {
    lines.push(`| **${name}** | ${dim.score} | ${dim.grade} | ${desc} |`);
  }
  lines.push("");

  const overall = mean(dims.map(([, d]) => d.score));
  lines.push(`**Overall Score: ${round(overall, 3)} (${gradeScore(overall)})**`);
  lines.push("");

  // Stability details
  lines.push("---");
  lines.push("");
  lines.push("## 1. Stability (稳定性)");
  lines.push("");
  lines.push("| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const d of evaluation.stability.details) {
    lines.push(`| ${d.preset}/${d.template} | ${d.survived ? "YES" : "**NO**"} | ${d.survivalSec}/${d.targetSec}s | ${d.nanDetected} | ${d.negativeResources} | ${d.systemErrors} | ${d.maxEntities} | ${d.outcome} |`);
  }
  if (evaluation.stability.issues.length > 0) {
    lines.push("");
    lines.push(`**Issues Found:** ${evaluation.stability.issues.length}`);
    for (const issue of evaluation.stability.issues) {
      lines.push(`- ${issue.preset}: ${issue.outcome} (${issue.reason}), NaN=${issue.nanDetected}, errors=${issue.systemErrors}`);
    }
  }
  lines.push("");

  // Development details
  lines.push("## 2. Development (发展性)");
  lines.push("");
  lines.push("| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |");
  lines.push("|---|---|---|---|---|");
  for (const d of evaluation.development.details) {
    lines.push(`| ${d.preset} | ${d.earlyBuildings}→${d.lateBuildings} | ${d.earlyResourceDiversity}→${d.lateResourceDiversity} | ${d.peakRoleDiversity} | ${d.objectivesCompleted}/3 |`);
  }
  lines.push("");

  // Coverage details
  lines.push("## 3. Coverage (覆盖度)");
  lines.push("");
  lines.push("| Element | Found | Expected | Missing | Score |");
  lines.push("|---|---|---|---|---|");
  const cov = evaluation.coverage.details;
  lines.push(`| Tile Types | ${cov.tilesOnMap.found} | ${cov.tilesOnMap.expected} | ${cov.tilesOnMap.missing.join(", ") || "none"} | ${cov.tilesOnMap.score} |`);
  lines.push(`| Roles | ${cov.roles.found} | ${cov.roles.expected} | ${cov.roles.missing.join(", ") || "none"} | ${cov.roles.score} |`);
  lines.push(`| Resources | ${cov.resources.found} | ${cov.resources.expected} | ${cov.resources.missing.join(", ") || "none"} | ${cov.resources.score} |`);
  lines.push(`| Intents | ${cov.intents.found} | ${cov.intents.expected} | ${cov.intents.missing.join(", ") || "none"} | ${cov.intents.score} |`);
  lines.push(`| Weathers | ${cov.weathers.found} | ${cov.weathers.expected} | ${cov.weathers.missing.join(", ") || "none"} | ${cov.weathers.score} |`);
  lines.push("");

  // Playability details
  lines.push("## 4. Playability (可玩性)");
  lines.push("");
  lines.push("| Scenario | Tension | Variety | Resource Health | Progress | Score |");
  lines.push("|---|---|---|---|---|---|");
  for (const d of evaluation.playability.details) {
    lines.push(`| ${d.preset} | ${d.tensionScore} | ${d.varietyScore} | ${d.resourceHealth} | ${d.progressScore} | ${d.score} |`);
  }
  lines.push("");

  // Technical details
  lines.push("## 5. Technical (技术性)");
  lines.push("");
  lines.push("| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const d of evaluation.technical.details) {
    lines.push(`| ${d.preset} | ${d.pathCacheHitRate} | ${d.validityScore} | ${d.goalStabilityScore} | ${d.aiDecisionRate}/min | ${d.toolMultiplier} | ${d.score} |`);
  }
  lines.push("");

  // Reasonableness details
  lines.push("## 6. Reasonableness (合理性)");
  lines.push("");
  lines.push("| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |");
  lines.push("|---|---|---|---|---|---|");
  for (const d of evaluation.reasonableness.details) {
    lines.push(`| ${d.preset} | ${d.avgBehaviorDiversity} | ${d.nonRepetitionScore} | ${d.coherenceScore} | ${d.productivityRate} | ${d.score} |`);
  }
  lines.push("");

  // Recommendations
  lines.push("---");
  lines.push("");
  lines.push("## Improvement Targets");
  lines.push("");

  const weakest = dims.sort(([, a], [, b]) => a.score - b.score);
  for (const [name, dim] of weakest.slice(0, 3)) {
    lines.push(`### ${name} (${dim.grade}, ${dim.score})`);
    if (name === "Coverage" && dim.details) {
      const missing = [];
      if (cov.tilesOnMap.missing.length) missing.push(`tiles: ${cov.tilesOnMap.missing.join(", ")}`);
      if (cov.roles.missing.length) missing.push(`roles: ${cov.roles.missing.join(", ")}`);
      if (cov.resources.missing.length) missing.push(`resources: ${cov.resources.missing.join(", ")}`);
      if (cov.intents.missing.length) missing.push(`intents: ${cov.intents.missing.join(", ")}`);
      if (missing.length) lines.push(`- Missing elements: ${missing.join("; ")}`);
    }
    if (name === "Stability" && dim.issues.length > 0) {
      lines.push(`- ${dim.issues.length} scenario(s) had issues (early termination, NaN, errors)`);
    }
    if (name === "Playability") {
      const lowTension = evaluation.playability.details.filter((d) => d.tensionScore < 0.3);
      if (lowTension.length) lines.push(`- ${lowTension.length} scenario(s) had flat tension curves (low drama)`);
    }
    if (name === "Reasonableness") {
      const lowDiv = evaluation.reasonableness.details.filter((d) => d.avgBehaviorDiversity < 0.4);
      if (lowDiv.length) lines.push(`- ${lowDiv.length} scenario(s) showed low behavior diversity`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const durationSec = Number(args.duration ?? 120);
  const quick = Boolean(args.quick);

  const scenarios = buildEvalScenarios(durationSec, quick);

  console.log(`\n=== Comprehensive Game Evaluation ===`);
  console.log(`Scenarios: ${scenarios.length} | Duration: ${quick ? "quick" : "full"} mode`);
  console.log("");

  const results = [];
  let totalSimTime = 0;

  for (let i = 0; i < scenarios.length; i += 1) {
    const sc = scenarios[i];
    const startMs = Date.now();
    process.stdout.write(`  [${i + 1}/${scenarios.length}] ${sc.id} (${sc.durationSec}s) ... `);

    try {
      const result = await runSimulation(sc);
      result.config = sc;
      results.push(result);
      totalSimTime += sc.durationSec;

      const elapsed = Date.now() - startMs;
      const survived = result.survivalSec >= sc.durationSec * 0.95;
      console.log(`${survived ? "OK" : "EARLY-END"} (${elapsed}ms, ${result.outcome})`);
    } catch (err) {
      console.log(`CRASH: ${err.message}`);
      results.push({
        config: sc,
        tracker: {
          samples: [], errors: [{ tick: 0, system: "main", message: err.message }],
          nanDetected: 0, negativeResources: 0, maxEntities: 0,
          tilesPlaced: new Set(), tilesOnMap: new Set(), rolesAssigned: new Set(),
          intentsChosen: new Set(), statesVisited: new Set(),
          resourcesProduced: new Set(), resourcesConsumed: new Set(), weathersSeen: new Set(),
          intentHistory: [], stateHistory: [], goalFlips: 0, invalidTransitions: 0,
          buildingCountHistory: [0], resourceDiversityHistory: [0], roleDiversityHistory: [0],
          objectivesCompleted: 0, peakWorkers: 0, peakBuildings: 0,
          pathRecalcs: 0, pathCacheHits: 0, pathCacheMisses: 0,
          boidsMaxLoad: 0, aiDecisions: 0, aiFallbacks: 0,
        },
        initialWorkers: 0, survivalSec: 0, outcome: "crash", reason: err.message,
      });
    }
  }

  console.log("\nScoring...");

  const evaluation = {
    generatedAt: new Date().toISOString(),
    version: "0.5.0",
    totalScenarios: scenarios.length,
    totalDurationSec: totalSimTime,
    stability: evaluateStability(results),
    development: evaluateDevelopment(results),
    coverage: evaluateCoverage(results),
    playability: evaluatePlayability(results),
    technical: evaluateTechnical(results),
    reasonableness: evaluateReasonableness(results),
  };

  // Write JSON report
  const outDir = path.join(__dirname, "..", "docs", "evaluation");
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, "eval-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(evaluation, null, 2));
  console.log(`JSON: ${jsonPath}`);

  // Write markdown report
  const mdReport = generateMarkdownReport(evaluation);
  const mdPath = path.join(outDir, "eval-report.md");
  fs.writeFileSync(mdPath, mdReport);
  console.log(`Report: ${mdPath}`);

  // Print summary
  console.log("\n=== Summary ===\n");
  const dims = [
    ["Stability", evaluation.stability],
    ["Development", evaluation.development],
    ["Coverage", evaluation.coverage],
    ["Playability", evaluation.playability],
    ["Technical", evaluation.technical],
    ["Reasonableness", evaluation.reasonableness],
  ];
  for (const [name, dim] of dims) {
    console.log(`  ${dim.grade} ${name.padEnd(16)} ${dim.score}`);
  }
  const overall = mean(dims.map(([, d]) => d.score));
  console.log(`\n  Overall: ${round(overall, 3)} (${gradeScore(overall)})`);
  console.log("");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
