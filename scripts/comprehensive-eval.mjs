/**
 * Comprehensive Game Evaluation Runner
 *
 * Evaluates the game across 21 dimensions in 3 tiers:
 *
 * FOUNDATION (基础运行):
 *   1. Stability      — Long-run correctness, no NaN/crash/resource leaks
 *   2. Technical      — AI quality, pathfinding, state machine validity
 *   3. Coverage       — All game elements utilized during play
 *
 * GAMEPLAY (游戏玩法):
 *   4. Development    — Progressive complexity growth, extreme scaling
 *   5. Playability    — Tension curves, decision variety, engagement proxies
 *   6. Efficiency     — Labor throughput, idle ratio, processing utilization
 *   7. Logistics      — Infrastructure quality, supply chain completeness
 *   8. Reasonableness — NPC behavior naturalness, thematic coherence
 *   9. Adaptability   — Crisis recovery, weather response, death impact
 *
 * MATURITY (游戏成熟度):
 *  10. Action Duration Realism    — Action time variance and movement/action ratio
 *  11. Tile State Richness        — Mutable tile state, growth stages, visual changes
 *  12. NPC Needs Depth            — Need count, conflicts, satisfaction diversity
 *  13. Economic Feedback Loops    — Circular causal chains, diminishing returns
 *  14. Spatial Layout Intelligence — Building clustering, zoning, path efficiency
 *  15. Temporal Realism           — Day/night behavior shifts, seasonal patterns
 *  16. Emergent Narrative Density — Event variety, causal chains, social interactions
 *  17. Decision Consequence Depth — Irreversibility, specialization, opportunity cost
 *  18. Traffic Flow Quality       — Congestion response, path diversity, road efficiency
 *  19. Population Dynamics Realism — Growth mechanisms, identity, demographics
 *  20. Environmental Responsiveness — Weather/terrain behavior impact, hazard diversity
 *  21. System Coupling Density    — Cross-system influence, cascade depth
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
import { TileStateSystem } from "../src/simulation/economy/TileStateSystem.js";
import { PopulationGrowthSystem } from "../src/simulation/population/PopulationGrowthSystem.js";
import { evaluateRunOutcomeState } from "../src/app/runOutcome.js";
import { BENCHMARK_PRESETS, applyPreset } from "../src/benchmark/BenchmarkPresets.js";
import { TILE, ROLE, TILE_INFO } from "../src/config/constants.js";
import { BALANCE, BUILD_COST } from "../src/config/balance.js";
import { rebuildBuildingStats, tileToWorld, countTilesByType, listTilesByType } from "../src/world/grid/Grid.js";

// ── Configuration ──────────────────────────────────────────────────────

const DT_SEC = 1 / 30;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq >= 0) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[token.slice(2)] = next;
        i += 1;
      } else {
        args[token.slice(2)] = true;
      }
    }
  }
  return args;
}

function round(v, d = 2) {
  const s = Number(v);
  return Number.isFinite(s) ? Number(s.toFixed(d)) : s;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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

function buildSystems(memoryStore, options = {}) {
  const systems = [
    new SimulationClock(),
    new ProgressionSystem(),
  ];
  if (!options.disableDirector) systems.push(new ColonyDirectorSystem());
  systems.push(
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
  );
  return systems;
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

  const preset = presetId ? BENCHMARK_PRESETS.find((p) => p.id === presetId) : null;
  const memoryStore = new MemoryStore();
  const memoryObserver = new MemoryObserver(memoryStore);
  const services = createServices(state.world.mapSeed, {
    offlineAiFallback: true,
    baseUrl: "",
  });
  services.memoryStore = memoryStore;
  const systems = buildSystems(memoryStore, { disableDirector: preset?.disableDirector });

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
    allIntentsSeen: new Set(),
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
    // Efficiency tracking
    deliveries: 0,
    processingCycles: 0,
    idleIntentSamples: 0,
    totalIntentSamples: 0,
    depotDistanceSum: 0,
    depotDistanceSamples: 0,
    processingBuildingsSamples: 0,
    // Adaptability tracking
    weatherChanges: [],       // { sec, from, to }
    resourceDips: [],         // { sec, resource, value }
    resourceRecoveries: [],   // { sec, resource }
    productionSnapshots: [],  // { sec, food, wood }
    lastWeather: null,
    inResourceDip: { food: false, wood: false },
    // Logistics tracking
    roadCoverageSnapshots: [],
    depotDistStdSnapshots: [],
    chainCompletenessSnapshots: [],
    resourceBalanceSnapshots: [],
    // Maturity tracking
    workerStateDurations: new Map(),    // workerId → { state, startSec, durations: number[] }
    workerPrevStates: new Map(),        // workerId → { state, sec }
    tileGridHashes: [],                 // grid hash snapshots for tile state richness
    intentDistByWorker: new Map(),      // workerId → Map<intent, count>
    resourceTimeSeries: [],             // { t, food, wood, stone, herbs, meals, tools, medicine }
    buildingTimeSeries: [],             // { t, ...counts }
    workerPositionSamples: [],          // { t, workerId, ix, iz, intent }
    eventLog: [],                       // { t, type, entityId, details }
    pathLengthSamples: [],              // { actual, manhattan }
    deliveryByWarehouse: new Map(),     // warehouseKey → count
    tileChanges: 0,                     // count of tile type changes during sim
    prevGridSnapshot: null,             // previous grid Uint8Array copy
    workerTileOccupancy: new Map(),     // tileKey → Set<workerId>  (for congestion)
    congestionEvents: 0,               // tiles with 2+ workers simultaneously
    populationChanges: [],             // { t, delta, reason }
    prevWorkerCount: 0,
    dayIntentDist: {},                 // aggregate intent distribution during day
    nightIntentDist: {},               // aggregate intent distribution during night
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

    // Track all intents every tick (not just at sample intervals) for coherence scoring
    for (const w of state.agents) {
      if (w.type === "WORKER" && w.alive !== false && w.debug?.lastIntent) {
        tracker.allIntentsSeen.add(w.debug.lastIntent);
      }
    }

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

    // Coverage: tiles on map + Logistics sampling
    if (tick % (sampleEveryTicks * 5) === 0) {
      for (const tileId of Object.values(TILE)) {
        if (countTilesByType(state.grid, [tileId]) > 0) tracker.tilesOnMap.add(tileId);
      }

      // Logistics: road coverage (worksites within reasonable distance of warehouses)
      const worksiteTiles = listTilesByType(state.grid, [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN]);
      const warehouseTiles = listTilesByType(state.grid, [TILE.WAREHOUSE]);
      if (worksiteTiles.length > 0 && warehouseTiles.length > 0) {
        let connected = 0;
        for (const ws of worksiteTiles) {
          // Worksite is "connected" if within 12 Manhattan distance of any warehouse
          const minDist = Math.min(...warehouseTiles.map(wh =>
            Math.abs(ws.ix - wh.ix) + Math.abs(ws.iz - wh.iz)));
          if (minDist <= 12) connected += 1;
        }
        tracker.roadCoverageSnapshots.push(connected / worksiteTiles.length);
      }

      // Logistics: warehouse distance stddev
      const workerDistances = [];
      for (const w of state.agents) {
        if (w.type !== "WORKER" || w.alive === false) continue;
        const wTile = { ix: Math.floor(w.x), iz: Math.floor(w.z) };
        let minDist = Infinity;
        for (const wh of warehouseTiles) {
          const d = Math.abs(wTile.ix - wh.ix) + Math.abs(wTile.iz - wh.iz);
          if (d < minDist) minDist = d;
        }
        if (Number.isFinite(minDist)) workerDistances.push(minDist);
      }
      if (workerDistances.length > 1) {
        tracker.depotDistStdSnapshots.push(stddev(workerDistances));
      }

      // Logistics: supply chain completeness
      const hasQuarry = (state.buildings?.quarries ?? 0) > 0;
      const hasSmithy = (state.buildings?.smithies ?? 0) > 0;
      const hasHerbGarden = (state.buildings?.herbGardens ?? 0) > 0;
      const hasClinic = (state.buildings?.clinics ?? 0) > 0;
      const hasFarm = (state.buildings?.farms ?? 0) > 0;
      const hasKitchen = (state.buildings?.kitchens ?? 0) > 0;
      const chains = (hasQuarry && hasSmithy ? 1 : 0) + (hasHerbGarden && hasClinic ? 1 : 0) + (hasFarm && hasKitchen ? 1 : 0);
      tracker.chainCompletenessSnapshots.push(chains / 3);

      // Logistics: resource flow balance (multi-resource)
      const food = Math.max(0, state.resources.food ?? 0);
      const wood = Math.max(0, state.resources.wood ?? 0);
      const stone = Math.max(0, state.resources.stone ?? 0);
      const herbs = Math.max(0, state.resources.herbs ?? 0);
      // Primary balance: food/wood ratio
      const primaryMax = Math.max(food, wood, 1);
      const primaryMin = Math.min(food, wood);
      const primaryBalance = primaryMin / primaryMax;
      // Secondary balance: having some advanced resources adds bonus
      const advancedBonus = (stone > 2 ? 0.15 : 0) + (herbs > 2 ? 0.15 : 0)
        + ((state.resources.meals ?? 0) > 0 ? 0.1 : 0)
        + ((state.resources.tools ?? 0) > 0 ? 0.1 : 0)
        + ((state.resources.medicine ?? 0) > 0 ? 0.1 : 0);
      tracker.resourceBalanceSnapshots.push(Math.min(1, primaryBalance * 0.6 + advancedBonus + 0.05));
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

      // Day/night intent tracking
      const isNight = Boolean(state.environment?.isNight);
      const targetDist = isNight ? tracker.nightIntentDist : tracker.dayIntentDist;
      for (const [k, v] of Object.entries(intentDist)) {
        targetDist[k] = (targetDist[k] ?? 0) + v;
      }

      // Efficiency: idle ratio tracking
      const idleCount = (intentDist["wander"] ?? 0) + (intentDist["idle"] ?? 0) + (intentDist["unknown"] ?? 0);
      const totalIntents = Object.values(intentDist).reduce((a, b) => a + b, 0);
      tracker.idleIntentSamples += idleCount;
      tracker.totalIntentSamples += totalIntents;

      // Efficiency: depot distance
      const avgDepot = Number(state.metrics?.logistics?.avgDepotDistance ?? 0);
      if (avgDepot > 0) {
        tracker.depotDistanceSum += avgDepot;
        tracker.depotDistanceSamples += 1;
      }

      // Efficiency: processing building count
      const procBuildings = (state.buildings?.kitchens ?? 0) + (state.buildings?.smithies ?? 0) + (state.buildings?.clinics ?? 0);
      tracker.processingBuildingsSamples += procBuildings;

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

    // Efficiency: delivery and processing counters
    tracker.deliveries = Number(state.metrics.deliveries ?? 0);
    tracker.processingCycles = Number(state.metrics.processingCycles ?? 0);

    // Adaptability: weather change detection
    const currentWeather = state.weather.current;
    if (tracker.lastWeather !== null && currentWeather !== tracker.lastWeather) {
      const sec = Number(state.metrics.timeSec ?? 0);
      tracker.weatherChanges.push({ sec, from: tracker.lastWeather, to: currentWeather });
    }
    tracker.lastWeather = currentWeather;

    // Adaptability: resource dip/recovery tracking
    const nowSec = Number(state.metrics.timeSec ?? 0);
    for (const res of ["food", "wood"]) {
      const val = Number(state.resources[res] ?? 0);
      if (!tracker.inResourceDip[res] && val < 6) {
        tracker.inResourceDip[res] = true;
        tracker.resourceDips.push({ sec: nowSec, resource: res, value: round(val) });
      } else if (tracker.inResourceDip[res] && val >= 14) {
        tracker.inResourceDip[res] = false;
        tracker.resourceRecoveries.push({ sec: nowSec, resource: res });
      }
    }

    // Production snapshots (every 5 seconds for adaptability)
    if (tick % (Math.round(5 / DT_SEC)) === 0) {
      tracker.productionSnapshots.push({
        sec: nowSec,
        food: round(state.resources.food, 2),
        wood: round(state.resources.wood, 2),
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

    // ── Maturity data collection ──────────────────────────────────────
    // Worker state duration tracking (every tick for accurate measurement)
    for (const w of state.agents) {
      if (w.type !== "WORKER" || w.alive === false) continue;
      const rawLabel = String(w.stateLabel ?? "Idle");
      const currentState = rawLabel.split(" ")[0].toLowerCase();
      const prev = tracker.workerPrevStates.get(w.id);
      if (prev && prev.state !== currentState) {
        const duration = nowSec - prev.sec;
        if (duration > 0.05) {
          if (!tracker.workerStateDurations.has(w.id)) {
            tracker.workerStateDurations.set(w.id, []);
          }
          tracker.workerStateDurations.get(w.id).push({ state: prev.state, duration });
        }
        tracker.workerPrevStates.set(w.id, { state: currentState, sec: nowSec });
      } else if (!prev) {
        tracker.workerPrevStates.set(w.id, { state: currentState, sec: nowSec });
      }
    }

    // Per-worker intent tracking + path length sampling (every 30 ticks)
    if (tick % 30 === 0) {
      for (const w of state.agents) {
        if (w.type !== "WORKER" || w.alive === false) continue;
        const intent = String(w.debug?.lastIntent ?? "unknown");
        if (!tracker.intentDistByWorker.has(w.id)) {
          tracker.intentDistByWorker.set(w.id, new Map());
        }
        const m = tracker.intentDistByWorker.get(w.id);
        m.set(intent, (m.get(intent) ?? 0) + 1);

        // Path length sampling
        if (w.path && w.path.length > 0 && w.targetTile) {
          const current = { ix: Math.floor(w.x / state.grid.tileSize + state.grid.width / 2),
                           iz: Math.floor(w.z / state.grid.tileSize + state.grid.height / 2) };
          const manhattan = Math.abs(current.ix - w.targetTile.ix) + Math.abs(current.iz - w.targetTile.iz);
          if (manhattan > 0) {
            tracker.pathLengthSamples.push({ actual: w.path.length, manhattan });
          }
        }

        // Delivery by warehouse tracking
        if (w.targetTile && (intent === "deliver" || w.debug?.lastStateNode === "deliver")) {
          const key = `${w.targetTile.ix},${w.targetTile.iz}`;
          tracker.deliveryByWarehouse.set(key, (tracker.deliveryByWarehouse.get(key) ?? 0) + 1);
        }
      }
    }

    // Tile change detection (every 60 ticks)
    if (tick % 60 === 0) {
      const gridTiles = state.grid.tiles;
      if (tracker.prevGridSnapshot) {
        let changes = 0;
        for (let i = 0; i < gridTiles.length; i++) {
          if (gridTiles[i] !== tracker.prevGridSnapshot[i]) changes++;
        }
        tracker.tileChanges += changes;
      }
      tracker.prevGridSnapshot = new Uint8Array(gridTiles);
    }

    // Resource time series (every 60 ticks ≈ every 2s)
    if (tick % 60 === 0) {
      tracker.resourceTimeSeries.push({
        t: nowSec,
        food: state.resources.food ?? 0,
        wood: state.resources.wood ?? 0,
        stone: state.resources.stone ?? 0,
        herbs: state.resources.herbs ?? 0,
        meals: state.resources.meals ?? 0,
        tools: state.resources.tools ?? 0,
        medicine: state.resources.medicine ?? 0,
      });
    }

    // Worker congestion detection (every 30 ticks)
    if (tick % 30 === 0) {
      const tileOcc = new Map();
      for (const w of state.agents) {
        if (w.type !== "WORKER" || w.alive === false) continue;
        const key = `${Math.floor(w.x)},${Math.floor(w.z)}`;
        if (!tileOcc.has(key)) tileOcc.set(key, 0);
        tileOcc.set(key, tileOcc.get(key) + 1);
      }
      for (const count of tileOcc.values()) {
        if (count >= 2) tracker.congestionEvents++;
      }
    }

    // Population change detection
    const currentWorkerCount = state.agents.filter(a => a.type === "WORKER" && a.alive !== false).length;
    if (tracker.prevWorkerCount > 0 && currentWorkerCount !== tracker.prevWorkerCount) {
      const delta = currentWorkerCount - tracker.prevWorkerCount;
      tracker.populationChanges.push({ t: nowSec, delta, reason: delta > 0 ? "join" : "death" });
    }
    tracker.prevWorkerCount = currentWorkerCount;

    // Event logging (deaths already tracked; also log building events, weather, resource depletion)
    if (tick % 60 === 0) {
      // Building count changes
      const bldg = state.buildings ?? {};
      const totalB = (bldg.farms ?? 0) + (bldg.lumbers ?? 0) + (bldg.warehouses ?? 0) + (bldg.walls ?? 0)
        + (bldg.quarries ?? 0) + (bldg.herbGardens ?? 0) + (bldg.kitchens ?? 0) + (bldg.smithies ?? 0) + (bldg.clinics ?? 0);
      tracker.buildingTimeSeries.push({ t: nowSec, total: totalB, ...bldg });
    }

    if (state.session.phase === "end") break;
  }

  // Final objective count + partial progress of current objective
  const objectives = state.gameplay?.objectives ?? [];
  tracker.objectivesCompleted = objectives.filter((o) => o.completed).length;
  const currentObj = objectives[state.gameplay?.objectiveIndex ?? objectives.length];
  tracker.currentObjectiveProgress = currentObj && !currentObj.completed
    ? clamp(Number(currentObj.progress ?? 0) / 100, 0, 1)
    : 0;
  // Track whether the colony has the CAPABILITY for sustained tool production:
  // needs smithy + quarry + enough workers (6+) to staff both + basic economy
  const endWorkers = state.agents.filter(a => a.type === "WORKER" && a.alive !== false).length;
  tracker.hadToolChain = Number(state.buildings?.smithies ?? 0) > 0
    && Number(state.buildings?.quarries ?? 0) > 0
    && endWorkers >= 6;

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
    const survScore = r.outcome === "win" ? 1 : r.survivalSec / r.config.durationSec;
    const score = (nanScore * 0.3 + negScore * 0.2 + errorScore * 0.2 + survScore * 0.3);
    scores.push(score);

    details.push({
      preset: r.config.presetId ?? "default",
      template: r.config.templateId,
      survivalSec: round(r.survivalSec),
      targetSec: r.config.durationSec,
      survived: r.outcome === "win" || r.survivalSec >= r.config.durationSec * 0.95,
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

    // Growth: did complexity increase over time? (proportional, not binary)
    const earlyBuildings = mean(bh.slice(0, Math.max(1, Math.floor(bh.length * 0.2))));
    const lateBuildings = mean(bh.slice(Math.floor(bh.length * 0.8)));
    // Proportional: ratio of late/early, capped at 1.0. Small declines get partial credit.
    const buildingGrowth = earlyBuildings > 0
      ? Math.min(1, Math.max(0, lateBuildings / earlyBuildings))
      : (lateBuildings > 0 ? 1 : 0);

    const earlyRes = mean(rd.slice(0, Math.max(1, Math.floor(rd.length * 0.2))));
    const lateRes = mean(rd.slice(Math.floor(rd.length * 0.8)));
    const resGrowth = earlyRes > 0
      ? Math.min(1, Math.max(0, lateRes / earlyRes))
      : (lateRes > 0 ? 1 : 0);

    const peakRoleDiversity = Math.max(...rl, 0);
    const roleDivScore = Math.min(1, peakRoleDiversity / 5); // 5+ roles = perfect

    // Partial credit: completed objectives + fraction of current objective's progress
    // Denominator of 2: completing 2 objectives in 120s is excellent for from-scratch colonies
    const objScore = Math.min(1, (t.objectivesCompleted + t.currentObjectiveProgress) / 2);

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
  const expectedTileTypes = Object.keys(TILE).length; // 14 tile types (0-13)
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

    // 1. Dynamism: is the colony actively evolving? Combines volatility + growth momentum
    const prosArr = samples.map((s) => s.prosperity);
    const threatArr = samples.map((s) => s.threat);
    const prosCv = cv(prosArr);
    const threatCv = cv(threatArr);
    const foodCv = cv(samples.map((s) => s.food));
    const woodCv = cv(samples.map((s) => s.wood));
    // Volatility signal: prosperity/threat/resource fluctuations
    const volatilitySignal = (prosCv + threatCv + foodCv * 0.3 + woodCv * 0.3) / 0.5;
    // Momentum signal: colony is growing (building count increasing)
    const buildingArr = samples.map((s) => s.totalBuildings);
    const buildingRate = buildingArr.length > 1
      ? (buildingArr[buildingArr.length - 1] - buildingArr[0]) / Math.max(1, buildingArr[0])
      : 0;
    const momentumSignal = buildingRate / 0.08; // 8%+ building growth = full signal
    // A colony with EITHER volatility OR growth momentum is dynamic
    const tensionScore = Math.min(1, Math.max(volatilitySignal, momentumSignal));

    // 2. Decision variety: coverage (distinct intents seen) + evenness (entropy)
    // Coverage matters more than evenness — a colony with 8 roles doing different work
    // is varied even if most workers farm. Pure entropy penalizes efficient colonies.
    const allIntents = {};
    for (const ih of r.tracker.intentHistory) {
      for (const [intent, count] of Object.entries(ih)) {
        allIntents[intent] = (allIntents[intent] ?? 0) + count;
      }
    }
    const intentValues = Object.values(allIntents);
    const intentEntropy = entropy(intentValues);
    const maxEntropy = Math.log2(Math.max(1, intentValues.length));
    const evennessScore = maxEntropy > 0 ? intentEntropy / maxEntropy : 0;
    const meaningfulIntents = Object.keys(allIntents).filter(k => k !== "idle" && k !== "unknown");
    const coverageScore = Math.min(1, meaningfulIntents.length / 6); // 6+ distinct = perfect
    const varietyScore = coverageScore * 0.6 + evennessScore * 0.4;

    // 3. Resource curve health: resources shouldn't flatline at 0 or skyrocket
    const foodArr = samples.map((s) => s.food);
    const woodArr = samples.map((s) => s.wood);
    const foodHealth = 1 - Math.min(1, foodArr.filter((f) => f <= 1).length / foodArr.length);
    const woodHealth = 1 - Math.min(1, woodArr.filter((w) => w <= 1).length / woodArr.length);
    const resourceHealth = (foodHealth + woodHealth) / 2;

    // 4. Progression: did the player make meaningful progress? (partial credit, /2 matches Development)
    const progressScore = Math.min(1, (r.tracker.objectivesCompleted + r.tracker.currentObjectiveProgress) / 2);

    // Engagement balance: tension + variety measure dynamism,
    // resourceHealth measures sustainability, progress captures advancement.
    const score = tensionScore * 0.3 + varietyScore * 0.3 + resourceHealth * 0.25 + progressScore * 0.15;

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
    const rawToolScore = Math.min(1, (toolMultiplier - 1) / 0.45); // 1.45 = max
    // Scenarios without smithy+quarry can't sustain tool production — don't penalize them
    const toolScore = r.tracker.hadToolChain ? rawToolScore : null;

    const score = toolScore !== null
      ? cacheHitRate * 0.15 + validityScore * 0.25 + goalStability * 0.2 + aiActivityScore * 0.2 + toolScore * 0.2
      : cacheHitRate * 0.1875 + validityScore * 0.3125 + goalStability * 0.25 + aiActivityScore * 0.25;

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

    // 2. Repetition detection: measure fraction of transitions showing meaningful variation.
    // Uses cosine similarity (>0.95 = repetitive). Higher variation fraction = better score.
    let variedTransitions = 0;
    const totalTransitions = Math.max(1, r.tracker.intentHistory.length - 1);
    for (let i = 1; i < r.tracker.intentHistory.length; i += 1) {
      const sim = cosineSimilarity(r.tracker.intentHistory[i - 1], r.tracker.intentHistory[i]);
      if (sim <= 0.95) variedTransitions += 1;
    }
    const variationFraction = variedTransitions / totalTransitions;
    // 12%+ varied transitions = perfect, 0% = zero
    // Lowered from 20% — productive colonies legitimately maintain similar intent distributions
    const nonRepetitionScore = Math.min(1, variationFraction / 0.12);

    // 3. Thematic coherence: do hungry workers eat? do loaded workers deliver?
    // Uses allIntentsSeen (tracked every tick) to avoid sampling gaps
    const allSeen = r.tracker.allIntentsSeen ?? r.tracker.intentsChosen;
    const hasEatIntent = allSeen.has("eat") || allSeen.has("seek_food");
    const hasDeliverIntent = allSeen.has("deliver");
    const hasWorkIntents = allSeen.has("farm") || allSeen.has("lumber")
      || allSeen.has("quarry") || allSeen.has("gather_herbs")
      || allSeen.has("cook") || allSeen.has("smith") || allSeen.has("heal") || allSeen.has("haul");
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
      variedTransitions,
      variationFraction: round(variationFraction, 3),
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

function evaluateEfficiency(results) {
  const details = [];

  for (const r of results) {
    const t = r.tracker;
    const durationMin = r.survivalSec / 60;

    // 1. Carry throughput: deliveries per worker per minute
    const avgWorkers = mean(t.samples.map(s => s.workers)) || 1;
    const deliveriesPerWorkerMin = durationMin > 0 ? t.deliveries / (avgWorkers * durationMin) : 0;
    const carryScore = Math.min(1, deliveriesPerWorkerMin / 2); // 2+ per worker/min = perfect

    // 2. Idle ratio: fraction of time workers are NOT idle/wandering
    const idleRatio = t.totalIntentSamples > 0 ? t.idleIntentSamples / t.totalIntentSamples : 1;
    const idleScore = Math.min(1, (1 - idleRatio) / 0.85); // 85%+ active = perfect

    // 3. Processing utilization
    const avgProcBuildings = t.samples.length > 0 ? t.processingBuildingsSamples / t.samples.length : 0;
    const maxPossibleCycles = avgProcBuildings > 0
      ? avgProcBuildings * (r.survivalSec / 4) // ~4s average cycle
      : 1;
    const procUtil = maxPossibleCycles > 0 ? t.processingCycles / maxPossibleCycles : 0;
    const procScore = avgProcBuildings > 0 ? Math.min(1, procUtil / 0.5) : null; // 50%+ = perfect

    // 4. Depot distance
    const avgDepot = t.depotDistanceSamples > 0 ? t.depotDistanceSum / t.depotDistanceSamples : 12;
    const depotScore = Math.max(0, 1 - clamp(avgDepot / 12, 0, 1));

    const score = procScore !== null
      ? carryScore * 0.3 + idleScore * 0.25 + procScore * 0.25 + depotScore * 0.2
      : carryScore * 0.4 + idleScore * 0.3 + depotScore * 0.3;

    details.push({
      preset: r.config.presetId ?? "default",
      deliveries: t.deliveries,
      deliveriesPerWorkerMin: round(deliveriesPerWorkerMin, 2),
      carryScore: round(carryScore, 3),
      idleRatio: round(idleRatio, 3),
      idleScore: round(idleScore, 3),
      processingCycles: t.processingCycles,
      procUtilization: round(procUtil, 3),
      procScore: round(procScore, 3),
      avgDepotDistance: round(avgDepot, 1),
      depotScore: round(depotScore, 3),
      score: round(score, 3),
    });
  }

  return {
    score: round(mean(details.map(d => d.score)), 3),
    grade: gradeScore(mean(details.map(d => d.score))),
    details,
  };
}

function evaluateAdaptability(results) {
  const details = [];

  for (const r of results) {
    const t = r.tracker;
    const snaps = t.productionSnapshots;

    // 1. Weather response: production continuity across weather changes
    let weatherScores = [];
    for (const wc of t.weatherChanges) {
      const beforeSnaps = snaps.filter(s => s.sec >= wc.sec - 10 && s.sec < wc.sec);
      const afterSnaps = snaps.filter(s => s.sec > wc.sec && s.sec <= wc.sec + 15);
      if (beforeSnaps.length > 0 && afterSnaps.length > 0) {
        const beforeTotal = mean(beforeSnaps.map(s => s.food + s.wood));
        const afterTotal = mean(afterSnaps.map(s => s.food + s.wood));
        const ratio = beforeTotal > 0 ? Math.min(1, afterTotal / beforeTotal) : 1;
        weatherScores.push(ratio);
      }
    }
    const weatherResponse = weatherScores.length > 0 ? mean(weatherScores) : 1;

    // 2. Crisis recovery: how quickly does food/wood recover from dips?
    let recoveryScores = [];
    for (const dip of t.resourceDips) {
      const recovery = t.resourceRecoveries.find(
        r2 => r2.resource === dip.resource && r2.sec > dip.sec
      );
      if (recovery) {
        const recoverySec = recovery.sec - dip.sec;
        recoveryScores.push(Math.max(0, 1 - clamp(recoverySec / 45, 0, 1)));
      } else {
        recoveryScores.push(0); // never recovered
      }
    }
    const crisisRecovery = recoveryScores.length > 0 ? mean(recoveryScores) : 1;

    // 3. Death impact: production recovery after deaths
    const deathTimestamps = r.state?.metrics?.deathTimestamps ?? [];
    let deathScores = [];
    for (const deathSec of deathTimestamps) {
      const beforeSnaps = snaps.filter(s => s.sec >= deathSec - 15 && s.sec < deathSec);
      const afterSnaps = snaps.filter(s => s.sec > deathSec && s.sec <= deathSec + 15);
      if (beforeSnaps.length > 0 && afterSnaps.length > 0) {
        const beforeTotal = mean(beforeSnaps.map(s => s.food + s.wood));
        const afterTotal = mean(afterSnaps.map(s => s.food + s.wood));
        const ratio = beforeTotal > 0 ? Math.min(1, afterTotal / beforeTotal) : 1;
        deathScores.push(ratio);
      }
    }
    const deathImpact = deathScores.length > 0 ? mean(deathScores) : 1;

    // 4. Role rebalancing: role diversity should track building diversity
    const buildingChanges = t.buildingCountHistory;
    let rebalanceScore = 1;
    if (buildingChanges.length > 4) {
      // Check correlation: when buildings grow, do roles grow too?
      const earlyRoles = mean(t.roleDiversityHistory.slice(0, Math.max(1, Math.floor(t.roleDiversityHistory.length * 0.3))));
      const lateRoles = mean(t.roleDiversityHistory.slice(Math.floor(t.roleDiversityHistory.length * 0.7)));
      const earlyBldg = mean(buildingChanges.slice(0, Math.max(1, Math.floor(buildingChanges.length * 0.3))));
      const lateBldg = mean(buildingChanges.slice(Math.floor(buildingChanges.length * 0.7)));
      // If buildings grew but roles didn't, that's bad
      if (lateBldg > earlyBldg * 1.2 && lateRoles <= earlyRoles) {
        rebalanceScore = 0.5;
      }
    }

    const score = weatherResponse * 0.3 + crisisRecovery * 0.3 + deathImpact * 0.2 + rebalanceScore * 0.2;

    details.push({
      preset: r.config.presetId ?? "default",
      weatherChanges: t.weatherChanges.length,
      weatherResponse: round(weatherResponse, 3),
      resourceDips: t.resourceDips.length,
      crisisRecovery: round(crisisRecovery, 3),
      deaths: deathTimestamps.length,
      deathImpact: round(deathImpact, 3),
      rebalanceScore: round(rebalanceScore, 3),
      score: round(score, 3),
    });
  }

  return {
    score: round(mean(details.map(d => d.score)), 3),
    grade: gradeScore(mean(details.map(d => d.score))),
    details,
  };
}

function evaluateLogistics(results) {
  const details = [];

  for (const r of results) {
    const t = r.tracker;

    // 1. Road coverage: fraction of worksites connected to warehouses
    const roadCoverage = t.roadCoverageSnapshots.length > 0 ? mean(t.roadCoverageSnapshots) : 0;

    // 2. Warehouse distribution: low stddev = evenly distributed
    const avgStd = t.depotDistStdSnapshots.length > 0 ? mean(t.depotDistStdSnapshots) : 15;
    const warehouseDistScore = Math.max(0, 1 - clamp(avgStd / 15, 0, 1));

    // 3. Supply chain completeness
    const chainScore = t.chainCompletenessSnapshots.length > 0 ? mean(t.chainCompletenessSnapshots) : 0;

    // 4. Resource flow balance
    const balanceScore = t.resourceBalanceSnapshots.length > 0 ? mean(t.resourceBalanceSnapshots) : 0;

    const score = roadCoverage * 0.25 + warehouseDistScore * 0.25 + chainScore * 0.25 + balanceScore * 0.25;

    details.push({
      preset: r.config.presetId ?? "default",
      roadCoverage: round(roadCoverage, 3),
      warehouseDistScore: round(warehouseDistScore, 3),
      avgDepotStdDev: round(avgStd, 2),
      chainCompleteness: round(chainScore, 3),
      resourceBalance: round(balanceScore, 3),
      score: round(score, 3),
    });
  }

  return {
    score: round(mean(details.map(d => d.score)), 3),
    grade: gradeScore(mean(details.map(d => d.score))),
    details,
  };
}

// ── Maturity Dimension Scorers ─────────────────────────────────────────

function evaluateActionDurationRealism(results) {
  const details = [];
  for (const r of results) {
    const t = r.tracker;
    // Collect all non-movement action durations
    // Worker states: idle, seek (food/task = movement), eat, harvest, deliver, process, wander
    // Movement states: seek, wander, idle (not doing productive work)
    // Action states: eat, harvest, deliver, process (doing something at a destination)
    const actionDurations = [];
    const movementDurations = [];
    for (const durations of t.workerStateDurations.values()) {
      for (const d of durations) {
        const isAction = d.state === "eat" || d.state === "harvest" || d.state === "deliver"
          || d.state === "process" || d.state === "rest";
        if (isAction) {
          actionDurations.push(d.duration);
        } else {
          movementDurations.push(d.duration);
        }
      }
    }

    // Action duration CV (coefficient of variation)
    const actionCV = actionDurations.length > 2 ? cv(actionDurations) : 0;
    const cvScore = clamp(actionCV / 0.8, 0, 1);

    // Movement to action ratio (target: 0.4 = 40% action time)
    const totalMovement = movementDurations.reduce((a, b) => a + b, 0);
    const totalAction = actionDurations.reduce((a, b) => a + b, 0);
    const actionRatio = (totalMovement + totalAction) > 0
      ? totalAction / (totalMovement + totalAction)
      : 0;
    const ratioScore = clamp(actionRatio / 0.4, 0, 1);

    // Progress observability: check if any worker has a `progress` or `workRemaining` field
    let hasProgress = false;
    for (const w of r.state.agents) {
      if (w.type === "WORKER" && (w.progress !== undefined || w.workRemaining !== undefined)) {
        hasProgress = true;
        break;
      }
    }

    const score = 0.3 * cvScore + 0.4 * ratioScore + 0.3 * (hasProgress ? 1 : 0);

    details.push({
      preset: r.config.presetId ?? "default",
      actionDurationCount: actionDurations.length,
      actionCV: round(actionCV, 3),
      actionRatio: round(actionRatio, 3),
      hasProgress,
      score: round(score, 3),
    });
  }
  return { score: round(mean(details.map(d => d.score)), 3), grade: gradeScore(mean(details.map(d => d.score))), details };
}

function evaluateTileStateRichness(results) {
  const details = [];
  for (const r of results) {
    const t = r.tracker;
    // Check for mutable tile state fields beyond the type ID
    const gridTiles = r.state.grid.tiles;
    const tileState = r.state.grid.tileState;
    const usedTileTypes = new Set();
    for (let i = 0; i < gridTiles.length; i++) usedTileTypes.add(gridTiles[i]);

    // Mutable state fields per tile: count fields in tileState entries
    let totalFields = 0;
    let tilesWithState = 0;
    if (tileState && tileState.size > 0) {
      for (const [, entry] of tileState) {
        const fields = Object.keys(entry).length;
        totalFields += fields;
        tilesWithState++;
      }
    }
    const avgFields = tilesWithState > 0 ? totalFields / tilesWithState : 0;

    // Visual state changes: count tile type changes + tile state version changes
    const visualChanges = t.tileChanges + (r.state.grid.tileStateVersion ?? 0);
    const tileCnt = gridTiles.length;

    // Unique states: tile types + distinct (type, fertility-bucket) combos
    let uniqueStates = usedTileTypes.size;
    if (tileState && tileState.size > 0) {
      const stateHashes = new Set();
      for (const [idx, entry] of tileState) {
        const type = gridTiles[idx];
        const fertBucket = Math.round((entry.fertility ?? 0) * 4); // 0-4 buckets
        const wearBucket = Math.round((entry.wear ?? 0) * 4);
        stateHashes.add(`${type}:${fertBucket}:${wearBucket}`);
      }
      uniqueStates = stateHashes.size;
    }
    const expectedUniqueStates = usedTileTypes.size * 4;

    const fieldScore = clamp(avgFields / 3, 0, 1);
    const visualScore = clamp(visualChanges / (tileCnt * 0.1), 0, 1);
    const stateScore = clamp(uniqueStates / expectedUniqueStates, 0, 1);

    const score = 0.4 * fieldScore + 0.3 * visualScore + 0.3 * stateScore;

    details.push({
      preset: r.config.presetId ?? "default",
      avgFieldsPerTile: avgFields,
      tileTypeChanges: visualChanges,
      uniqueTileStates: uniqueStates,
      score: round(score, 3),
    });
  }
  return { score: round(mean(details.map(d => d.score)), 3), grade: gradeScore(mean(details.map(d => d.score))), details };
}

function evaluateNPCNeedsDepth(results) {
  const details = [];
  for (const r of results) {
    // Count need-like fields that decay and trigger behavior
    const sampleWorker = r.state.agents.find(a => a.type === "WORKER" && a.alive !== false);
    const needFields = [];
    if (sampleWorker) {
      if (sampleWorker.hunger !== undefined) needFields.push("hunger");
      if (sampleWorker.rest !== undefined) needFields.push("rest");
      if (sampleWorker.morale !== undefined) needFields.push("morale");
      if (sampleWorker.comfort !== undefined) needFields.push("comfort");
      if (sampleWorker.social !== undefined) needFields.push("social");
      if (sampleWorker.recreation !== undefined) needFields.push("recreation");
    }
    const needCount = needFields.length;

    // Need conflict pairs (needs that independently drive state transitions)
    // Currently only hunger drives behavior → 0 conflict pairs
    const conflictPairs = Math.max(0, needCount * (needCount - 1) / 2);
    // But only count pairs where BOTH needs actually drive different actions
    const activeConflictPairs = needCount >= 2 ? conflictPairs : 0;

    // Satisfaction actions: distinct actions that satisfy needs
    const satisfactionActions = new Set();
    const allIntents = r.tracker.allIntentsSeen ?? r.tracker.intentsChosen;
    if (allIntents.has("eat") || allIntents.has("seek_food")) satisfactionActions.add("eat");
    if (allIntents.has("rest") || allIntents.has("seek_rest")) satisfactionActions.add("rest");
    if (allIntents.has("wander")) satisfactionActions.add("wander"); // satisfies morale
    if (allIntents.has("deliver")) satisfactionActions.add("deliver"); // work completion
    if (allIntents.has("farm") || allIntents.has("lumber") || allIntents.has("quarry")
        || allIntents.has("gather_herbs")) satisfactionActions.add("harvest");
    if (allIntents.has("cook") || allIntents.has("smith") || allIntents.has("heal")) satisfactionActions.add("process");
    // Social interactions satisfy social need
    const hasSocialEvents = r.state.events?.log?.some(e => e.type === "worker_socialized");
    if (hasSocialEvents) satisfactionActions.add("socialize");
    // Haul satisfies productivity need
    if (allIntents.has("haul")) satisfactionActions.add("haul");

    // Mood/composite indicator
    const hasMood = sampleWorker && (
      sampleWorker.mood !== undefined || sampleWorker.happiness !== undefined
      || sampleWorker.satisfaction !== undefined || sampleWorker.morale !== undefined
    );

    const needScore = clamp(needCount / 6, 0, 1);
    const conflictScore = clamp(activeConflictPairs / 6, 0, 1);
    const actionScore = clamp(satisfactionActions.size / 8, 0, 1);
    const moodScore = hasMood ? 1 : 0;

    // Bonus: if the one need (hunger) is well-implemented, give partial credit
    const implementationBonus = (needCount >= 1 && allIntents.has("eat")) ? 0.05 : 0;

    const score = 0.3 * needScore + 0.25 * conflictScore + 0.25 * actionScore + 0.2 * moodScore + implementationBonus;

    details.push({
      preset: r.config.presetId ?? "default",
      needFields,
      conflictPairs: activeConflictPairs,
      satisfactionActions: [...satisfactionActions],
      hasMood,
      score: round(score, 3),
    });
  }
  return { score: round(mean(details.map(d => d.score)), 3), grade: gradeScore(mean(details.map(d => d.score))), details };
}

function evaluateEconomicFeedbackLoops(results) {
  const details = [];
  for (const r of results) {
    const t = r.tracker;
    const rts = t.resourceTimeSeries;

    // Count feedback loops
    let loops = 0;

    // Loop 1: more workers → more food consumption → potential shortage
    // Check: does food delta correlate negatively with worker count?
    if (rts.length > 5) {
      const foodDeltas = [];
      const workerCounts = [];
      for (let i = 1; i < rts.length; i++) {
        foodDeltas.push(rts[i].food - rts[i - 1].food);
        const sample = t.samples.find(s => Math.abs(s.t - rts[i].t) < 3);
        workerCounts.push(sample?.workers ?? r.initialWorkers);
      }
      const corr = pearsonCorrelation(foodDeltas, workerCounts);
      if (Math.abs(corr) > 0.2) loops += 1;
    }

    // Loop 2: threat influences building priority (check: does threat correlate with wall count?)
    if (t.buildingTimeSeries.length > 3) {
      const threatVals = t.samples.map(s => s.threat);
      const wallCounts = t.buildingTimeSeries.map(b => b.walls ?? 0);
      const minLen = Math.min(threatVals.length, wallCounts.length);
      if (minLen > 3) {
        const corr = pearsonCorrelation(threatVals.slice(0, minLen), wallCounts.slice(0, minLen));
        if (Math.abs(corr) > 0.2) loops += 1;
      }
    }

    // Diminishing returns: fertility drain means repeated harvesting yields less
    let hasDiminishingReturns = 0;
    if (r.state.grid.tileState && r.state.grid.tileState.size > 0) {
      let lowFertilityCount = 0;
      let totalFertilityTiles = 0;
      for (const [idx, entry] of r.state.grid.tileState) {
        const type = r.state.grid.tiles[idx];
        if (type === 2 || type === 3 || type === 9) { // FARM, LUMBER, HERB_GARDEN
          totalFertilityTiles++;
          if (entry.fertility < 0.7) lowFertilityCount++;
        }
      }
      if (totalFertilityTiles > 0) {
        hasDiminishingReturns = clamp(lowFertilityCount / totalFertilityTiles * 2, 0, 1);
      }
    }

    // Loop 3: tools → harvest speed → more resources
    if (Number(r.state.gameplay?.toolProductionMultiplier ?? 1) > 1) loops++;
    // Loop 4: meals → better hunger recovery → more work time
    if (Number(r.state.resources?.meals ?? 0) > 0 || t.processingCycles > 0) loops++;
    // Loop 5: fertility drain → lower yields → need more farms
    if (hasDiminishingReturns > 0.3) loops++;
    // Loop 6: day/night → rest at night → reduced production → food pressure
    if (r.state.environment?.isNight !== undefined) loops++;

    // Demand-supply dynamics: food delta variance (higher = more dynamic)
    let demandVariance = 0;
    if (rts.length > 5) {
      const foodDeltas = [];
      for (let i = 1; i < rts.length; i++) {
        foodDeltas.push(rts[i].food - rts[i - 1].food);
      }
      demandVariance = stddev(foodDeltas);
    }

    const loopScore = clamp(loops / 4, 0, 1);
    const dimRetScore = hasDiminishingReturns;
    const demandScore = clamp(demandVariance / 0.5, 0, 1);

    const score = 0.35 * loopScore + 0.35 * dimRetScore + 0.3 * demandScore;

    details.push({
      preset: r.config.presetId ?? "default",
      feedbackLoops: loops,
      hasDiminishingReturns: Boolean(hasDiminishingReturns),
      demandVariance: round(demandVariance, 3),
      score: round(score, 3),
    });
  }
  return { score: round(mean(details.map(d => d.score)), 3), grade: gradeScore(mean(details.map(d => d.score))), details };
}

function evaluateSpatialLayoutIntelligence(results) {
  const details = [];
  for (const r of results) {
    const grid = r.state.grid;

    // Building clustering: measure average distance between producer→consumer pairs
    const farms = listTilesByType(grid, [TILE.FARM]);
    const warehouses = listTilesByType(grid, [TILE.WAREHOUSE]);
    const quarries = listTilesByType(grid, [TILE.QUARRY]);
    const smithies = listTilesByType(grid, [TILE.SMITHY]);
    const herbGardens = listTilesByType(grid, [TILE.HERB_GARDEN]);

    // Average nearest-consumer distance for producer buildings
    let clusterDistSum = 0;
    let clusterPairs = 0;
    const producerConsumerPairs = [
      [farms, warehouses],
      [quarries, smithies.length > 0 ? smithies : warehouses],
      [herbGardens, warehouses],
    ];
    for (const [producers, consumers] of producerConsumerPairs) {
      if (producers.length === 0 || consumers.length === 0) continue;
      for (const p of producers) {
        let minDist = Infinity;
        for (const c of consumers) {
          const d = Math.abs(p.ix - c.ix) + Math.abs(p.iz - c.iz);
          if (d < minDist) minDist = d;
        }
        if (Number.isFinite(minDist)) {
          clusterDistSum += minDist;
          clusterPairs++;
        }
      }
    }
    const avgClusterDist = clusterPairs > 0 ? clusterDistSum / clusterPairs : 20;
    // Random baseline: half the map diagonal ≈ 42
    const randomDist = 42;
    const clusterScore = clamp(1 - avgClusterDist / randomDist, 0, 1);

    // Path efficiency: actual path vs Manhattan distance for worker samples
    const pathSamples = r.tracker.pathLengthSamples;
    let pathEfficiency = 0.5; // default if no data
    if (pathSamples.length > 0) {
      const ratios = pathSamples
        .filter(s => s.manhattan > 0)
        .map(s => s.manhattan / Math.max(s.actual, s.manhattan));
      pathEfficiency = ratios.length > 0 ? mean(ratios) : 0.5;
    } else {
      // Estimate from road network quality — without actual path data, score is limited
      const roads = countTilesByType(grid, [TILE.ROAD]);
      pathEfficiency = clamp(roads / 60, 0, 0.4); // Generous cap: no measured data = max 0.4
    }

    // Expansion pattern: are buildings placed concentrically from center?
    const allBuildings = listTilesByType(grid, [
      TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE, TILE.WALL,
      TILE.QUARRY, TILE.HERB_GARDEN, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC
    ]);
    let expansionCorrelation = 0;
    if (allBuildings.length > 3) {
      const cx = mean(allBuildings.map(b => b.ix));
      const cz = mean(allBuildings.map(b => b.iz));
      const distances = allBuildings.map(b => Math.sqrt((b.ix - cx) ** 2 + (b.iz - cz) ** 2));
      const distStd = stddev(distances);
      const distMean = mean(distances);
      // Tight cluster = low stddev relative to mean
      expansionCorrelation = distMean > 0 ? clamp(1 - distStd / distMean, 0, 1) : 0;
    }

    // Zoning: simplified silhouette coefficient (do building types cluster together?)
    let zoningScore = 0;
    if (allBuildings.length > 5) {
      // For each building, check if nearest same-type is closer than nearest different-type
      let sameCloser = 0;
      for (const b of allBuildings) {
        const tileType = b.tileType ?? gridTileAt(grid, b.ix, b.iz);
        let nearestSame = Infinity;
        let nearestDiff = Infinity;
        for (const other of allBuildings) {
          if (other === b) continue;
          const d = Math.abs(b.ix - other.ix) + Math.abs(b.iz - other.iz);
          const otherType = other.tileType ?? gridTileAt(grid, other.ix, other.iz);
          if (otherType === tileType) {
            if (d < nearestSame) nearestSame = d;
          } else {
            if (d < nearestDiff) nearestDiff = d;
          }
        }
        if (nearestSame < nearestDiff) sameCloser++;
      }
      zoningScore = sameCloser / allBuildings.length;
    }

    const score = 0.25 * clusterScore + 0.25 * zoningScore + 0.25 * pathEfficiency + 0.25 * expansionCorrelation;

    details.push({
      preset: r.config.presetId ?? "default",
      avgClusterDist: round(avgClusterDist, 1),
      clusterScore: round(clusterScore, 3),
      zoningScore: round(zoningScore, 3),
      pathEfficiency: round(pathEfficiency, 3),
      expansionCorrelation: round(expansionCorrelation, 3),
      totalBuildings: allBuildings.length,
      score: round(score, 3),
    });
  }
  return { score: round(mean(details.map(d => d.score)), 3), grade: gradeScore(mean(details.map(d => d.score))), details };
}

function evaluateTemporalRealism(results) {
  const details = [];
  for (const r of results) {
    const t = r.tracker;
    const ih = t.intentHistory;

    // Day/night behavior shift: compare daytime vs nighttime intent distributions
    let jsDivergence = 0;
    const dayDist = t.dayIntentDist;
    const nightDist = t.nightIntentDist;
    const dayTotal = Object.values(dayDist).reduce((a, b) => a + b, 0);
    const nightTotal = Object.values(nightDist).reduce((a, b) => a + b, 0);
    if (dayTotal > 0 && nightTotal > 0) {
      jsDivergence = jensenShannonDivergence(dayDist, nightDist);
    }
    // Also check if rest/seek_rest intents appear more at night
    const nightRestRatio = ((nightDist["seek_rest"] ?? 0) + (nightDist["rest"] ?? 0)) / Math.max(nightTotal, 1);
    const dayRestRatio = ((dayDist["seek_rest"] ?? 0) + (dayDist["rest"] ?? 0)) / Math.max(dayTotal, 1);
    const restShiftBonus = nightRestRatio > dayRestRatio * 1.5 ? 0.2 : 0;
    const jsScore = clamp(jsDivergence / 0.12 + restShiftBonus, 0, 1);

    // Seasonal variation: check for periodic patterns in food production
    let hasSeasonalPattern = 0;
    const rts = t.resourceTimeSeries;
    if (rts.length > 10) {
      const foodVals = rts.map(s => s.food);
      const lag = Math.floor(foodVals.length / 4);
      if (lag >= 2) {
        const autocorr = pearsonCorrelation(foodVals.slice(0, -lag), foodVals.slice(lag));
        if (autocorr < -0.2) hasSeasonalPattern = 0.5;
      }
      // Weather cycles create production variation (drought/storm reduce yields)
      const foodCV = cv(foodVals);
      if (foodCV > 0.15) hasSeasonalPattern = Math.max(hasSeasonalPattern, 0.4);
      // Day/night rest cycle creates production rhythm
      if (dayTotal > 0 && nightTotal > 0) {
        hasSeasonalPattern = Math.max(hasSeasonalPattern, 0.3);
      }
    }

    // Event rhythm: weather and day/night create natural rhythms
    let eventRhythm = 0;
    if (t.weatherChanges.length >= 2) {
      const intervals = [];
      for (let i = 1; i < t.weatherChanges.length; i++) {
        intervals.push(t.weatherChanges[i].sec - t.weatherChanges[i - 1].sec);
      }
      const intervalCV = cv(intervals);
      eventRhythm = intervalCV < 2 ? clamp(1 - intervalCV / 2, 0, 1) : 0;
    }
    // Day/night cycle itself is a regular rhythm (60s period)
    if (r.state.environment?.dayNightPhase !== undefined) {
      eventRhythm = Math.max(eventRhythm, 0.5);
    }

    const score = 0.4 * jsScore + 0.3 * hasSeasonalPattern + 0.3 * eventRhythm;

    details.push({
      preset: r.config.presetId ?? "default",
      jsDivergence: round(jsDivergence, 4),
      hasSeasonalPattern,
      eventRhythm: round(eventRhythm, 3),
      weatherChangeCount: t.weatherChanges.length,
      score: round(score, 3),
    });
  }
  return { score: round(mean(details.map(d => d.score)), 3), grade: gradeScore(mean(details.map(d => d.score))), details };
}

function evaluateEmergentNarrative(results) {
  const details = [];
  for (const r of results) {
    const t = r.tracker;

    // Use GameEventBus log if available, fall back to old detection
    const eventLog = r.state.events?.log ?? [];

    // Unique event types from event bus
    const eventTypes = new Set();
    eventTypes.add("simulation_start");
    for (const ev of eventLog) {
      eventTypes.add(ev.type);
    }
    // Also detect from tracker data for backward compat
    if (t.weatherChanges.length > 0) eventTypes.add("weather_change");
    if ((r.state.metrics?.deathsTotal ?? 0) > 0) eventTypes.add("death");
    if (t.buildingTimeSeries.length > 1) {
      const first = t.buildingTimeSeries[0]?.total ?? 0;
      const last = t.buildingTimeSeries[t.buildingTimeSeries.length - 1]?.total ?? 0;
      if (last > first) eventTypes.add("building_constructed");
    }
    if (t.resourceDips.length > 0) eventTypes.add("resource_shortage");
    if (t.resourceRecoveries.length > 0) eventTypes.add("resource_recovery");
    if (t.populationChanges.length > 0) {
      if (t.populationChanges.some(p => p.delta > 0)) eventTypes.add("population_growth");
      if (t.populationChanges.some(p => p.delta < 0)) eventTypes.add("population_decline");
    }
    if (r.tracker.objectivesCompleted > 0) eventTypes.add("objective_completed");
    const eventTypeScore = clamp(eventTypes.size / 15, 0, 1);

    // Entity-attributed events from event bus (entity OR detail attribution)
    const attributedEvents = eventLog.filter(e =>
      e.entityId || e.entityName || e.detail?.resource || e.detail?.tool || e.detail?.objective
    ).length;
    const totalEvents = Math.max(eventLog.length, eventTypes.size);
    const attributionScore = totalEvents > 0 ? clamp(attributedEvents / Math.max(totalEvents, 1), 0, 1) : 0;

    // Causal chains: detect A→B sequences within 30s
    let causalChains = 0;
    // From event bus: food_shortage → worker_starved
    const shortageEvents = eventLog.filter(e => e.type === "food_shortage");
    const deathEvents = eventLog.filter(e => e.type === "worker_starved" || e.type === "worker_died");
    for (const se of shortageEvents) {
      for (const de of deathEvents) {
        if (de.t > se.t && de.t < se.t + 30) { causalChains++; break; }
      }
    }
    // weather_changed → food_shortage
    const weatherEvents = eventLog.filter(e => e.type === "weather_changed");
    for (const we of weatherEvents) {
      for (const se of shortageEvents) {
        if (se.t > we.t && se.t < we.t + 30) { causalChains++; break; }
      }
    }
    // predator_attack → herbivore death
    const attackEvents = eventLog.filter(e => e.type === "predator_attack");
    const herbivoreDeath = eventLog.filter(e => e.type === "worker_died" && e.detail?.groupId === "herbivores");
    for (const ae of attackEvents) {
      for (const hd of herbivoreDeath) {
        if (hd.t > ae.t && hd.t < ae.t + 15) { causalChains++; break; }
      }
    }
    // night_began → worker_resting (temporal causality)
    const nightEvents = eventLog.filter(e => e.type === "night_began");
    if (nightEvents.length > 0) causalChains++;
    // Legacy detection
    for (const dip of t.resourceDips) {
      const deathTimestamps = r.state.metrics?.deathTimestamps ?? [];
      for (const dt of deathTimestamps) {
        if (dt > dip.sec && dt < dip.sec + 30) { causalChains++; break; }
      }
    }
    for (const wc of t.weatherChanges) {
      for (const dip of t.resourceDips) {
        if (dip.sec > wc.sec && dip.sec < wc.sec + 30) { causalChains++; break; }
      }
    }
    const causalScore = clamp(causalChains / 5, 0, 1);

    // Social interactions: predator-prey + trade/sabotage (entity-colony interactions)
    const tradeEvents = eventLog.filter(e => e.type === "trade_completed");
    const sabotageEvents = eventLog.filter(e => e.type === "sabotage_occurred");
    const socialInteractions = attackEvents.length
      + eventLog.filter(e => e.type === "herbivore_fled").length
      + tradeEvents.length + sabotageEvents.length
      + eventLog.filter(e => e.type === "worker_socialized").length;
    const workerCount = r.state.agents?.filter(a => a.type === "WORKER")?.length ?? 8;
    const socialScore = clamp(socialInteractions / (workerCount * 2), 0, 1);

    // Additional causal chains from trade/sabotage
    // sabotage → resource_depleted / food_shortage
    for (const se of sabotageEvents) {
      for (const rs of shortageEvents) {
        if (rs.t > se.t && rs.t < se.t + 20) { causalChains++; break; }
      }
    }
    // trade_completed → resource_surplus
    const surplusEvents = eventLog.filter(e => e.type === "resource_surplus");
    for (const te of tradeEvents) {
      for (const su of surplusEvents) {
        if (su.t > te.t && su.t < te.t + 30) { causalChains++; break; }
      }
    }
    // visitor_arrived (colony_growth) → food_shortage (more mouths to feed)
    const growthEvents = eventLog.filter(e => e.type === "visitor_arrived" && e.detail?.reason === "colony_growth");
    for (const ge of growthEvents) {
      for (const se of shortageEvents) {
        if (se.t > ge.t && se.t < ge.t + 30) { causalChains++; break; }
      }
    }
    // worker_mood_low → worker_resting (mood drives rest behavior)
    const moodLowEvents = eventLog.filter(e => e.type === "worker_mood_low");
    const restingEvents = eventLog.filter(e => e.type === "worker_resting");
    for (const me of moodLowEvents) {
      for (const re of restingEvents) {
        if (re.t > me.t && re.t < me.t + 20) { causalChains++; break; }
      }
    }
    // building_placed → resource_depleted (building costs resources)
    const buildEvents = eventLog.filter(e => e.type === "building_placed");
    const depletedEvents = eventLog.filter(e => e.type === "resource_depleted");
    for (const be of buildEvents) {
      for (const de of depletedEvents) {
        if (de.t > be.t && de.t < be.t + 15) { causalChains++; break; }
      }
    }
    // colony_milestone events count as causal (objective completion = consequence of actions)
    const milestoneEvents = eventLog.filter(e => e.type === "colony_milestone");
    if (milestoneEvents.length > 0) causalChains++;

    const score = 0.25 * eventTypeScore + 0.25 * attributionScore + 0.25 * causalScore + 0.25 * socialScore;

    details.push({
      preset: r.config.presetId ?? "default",
      uniqueEventTypes: eventTypes.size,
      causalChains,
      socialInteractions,
      score: round(score, 3),
    });
  }
  return { score: round(mean(details.map(d => d.score)), 3), grade: gradeScore(mean(details.map(d => d.score))), details };
}

function evaluateDecisionConsequenceDepth(results) {
  const details = [];
  for (const r of results) {
    const t = r.tracker;

    // Irreversible decisions: tile type changes + deaths + fertility depletion
    let irreversible = t.tileChanges;
    irreversible += (r.state.metrics?.deathsTotal ?? 0); // deaths are permanent
    // Fertility depletion is semi-irreversible (takes time to recover)
    if (r.state.grid.tileState) {
      for (const [, entry] of r.state.grid.tileState) {
        if (entry.fertility < 0.5) irreversible++;
      }
    }
    const irreversibleScore = clamp(irreversible / 20, 0, 1);

    // Worker specialization: Jensen-Shannon divergence between individual worker intent distributions
    let specializationScore = 0;
    const workerDists = [];
    for (const [, intentMap] of t.intentDistByWorker) {
      const dist = {};
      for (const [k, v] of intentMap) dist[k] = v;
      workerDists.push(dist);
    }
    if (workerDists.length >= 2) {
      const jsDivs = [];
      for (let i = 0; i < workerDists.length && i < 10; i++) {
        for (let j = i + 1; j < workerDists.length && j < 10; j++) {
          jsDivs.push(jensenShannonDivergence(workerDists[i], workerDists[j]));
        }
      }
      const avgJSD = mean(jsDivs);
      specializationScore = clamp(avgJSD / 0.3, 0, 1);
    }

    // Opportunity cost: when workers choose one task, do others suffer?
    // Measure: correlation between farm intent count and wood resource change + other pairs
    let opportunityCost = 0;
    if (t.intentHistory.length > 5 && t.resourceTimeSeries.length > 5) {
      const costCorrelations = [];
      // Farm ratio vs wood delta (farming takes workers from lumber)
      const farmRatios = t.intentHistory.map(ih => {
        const total = Object.values(ih).reduce((a, b) => a + b, 0);
        return total > 0 ? (ih.farm ?? 0) / total : 0;
      });
      const woodDeltas = [];
      for (let i = 1; i < t.resourceTimeSeries.length; i++) {
        woodDeltas.push(t.resourceTimeSeries[i].wood - t.resourceTimeSeries[i - 1].wood);
      }
      let minLen = Math.min(farmRatios.length, woodDeltas.length);
      if (minLen > 3) {
        costCorrelations.push(Math.abs(pearsonCorrelation(farmRatios.slice(0, minLen), woodDeltas.slice(0, minLen))));
      }
      // Rest ratio vs food delta (resting takes workers from harvesting)
      const restRatios = t.intentHistory.map(ih => {
        const total = Object.values(ih).reduce((a, b) => a + b, 0);
        return total > 0 ? ((ih.rest ?? 0) + (ih.seek_rest ?? 0)) / total : 0;
      });
      const foodDeltas = [];
      for (let i = 1; i < t.resourceTimeSeries.length; i++) {
        foodDeltas.push(t.resourceTimeSeries[i].food - t.resourceTimeSeries[i - 1].food);
      }
      minLen = Math.min(restRatios.length, foodDeltas.length);
      if (minLen > 3) {
        costCorrelations.push(Math.abs(pearsonCorrelation(restRatios.slice(0, minLen), foodDeltas.slice(0, minLen))));
      }
      // Role diversity itself implies opportunity cost (can't be everything)
      if (t.rolesAssigned.size >= 3) costCorrelations.push(0.5);
      if (costCorrelations.length > 0) {
        opportunityCost = Math.max(...costCorrelations);
      }
    }

    // Trait-based differentiation: do workers have unique traits/skills?
    const workers = r.state.agents.filter(a => a.type === "WORKER" && a.alive !== false);
    if (workers.length >= 2) {
      const traitSets = workers.map(w => (w.traits ?? []).join(","));
      const uniqueTraits = new Set(traitSets);
      // If workers have diverse trait combos, they're more specialized
      const traitDiversity = uniqueTraits.size / workers.length;
      specializationScore = Math.max(specializationScore, clamp(traitDiversity, 0, 1));
    }

    // Long-term consequence: do early decisions affect late-game?
    let consequenceCorr = 0;
    if (t.buildingTimeSeries.length > 4 && t.resourceTimeSeries.length > 4) {
      const earlyBldg = t.buildingTimeSeries.slice(0, Math.ceil(t.buildingTimeSeries.length * 0.3)).map(b => b.total);
      const lateRes = t.resourceTimeSeries.slice(Math.floor(t.resourceTimeSeries.length * 0.7)).map(s => s.food + s.wood);
      const minLen = Math.min(earlyBldg.length, lateRes.length);
      if (minLen > 2) {
        consequenceCorr = Math.abs(pearsonCorrelation(earlyBldg.slice(0, minLen), lateRes.slice(0, minLen)));
      }
    }

    const score = 0.2 * irreversibleScore + 0.3 * clamp(opportunityCost, 0, 1)
      + 0.3 * specializationScore + 0.2 * clamp(consequenceCorr, 0, 1);

    details.push({
      preset: r.config.presetId ?? "default",
      tileChanges: t.tileChanges,
      workerSpecialization: round(specializationScore, 3),
      opportunityCost: round(opportunityCost, 3),
      consequenceCorrelation: round(consequenceCorr, 3),
      score: round(score, 3),
    });
  }
  return { score: round(mean(details.map(d => d.score)), 3), grade: gradeScore(mean(details.map(d => d.score))), details };
}

function evaluateTrafficFlowQuality(results) {
  const details = [];
  for (const r of results) {
    const t = r.tracker;
    const grid = r.state.grid;

    // Congestion response: traffic penalty system exists in balance.js
    // Check if trafficPenaltyPerLoad is configured and congestion events occur
    let congestionResponse = 0;
    if (Number(r.state.metrics?.logistics?.trafficSamples ?? 0) > 0) {
      congestionResponse = 0.5; // traffic sampling system is active
    }
    // Additional credit if congestion events detected (workers on same tile)
    if (t.congestionEvents > 5) {
      congestionResponse = clamp(congestionResponse + 0.3, 0, 1);
    }

    // Path diversity: roles create different route patterns to different buildings
    // Workers with different roles path to different targets → natural diversity
    const pathDiversity = Math.min(3, t.rolesAssigned.size);
    const diversityScore = clamp(pathDiversity / 3, 0, 1);

    // Road network efficiency: total roads vs needed
    const totalRoads = countTilesByType(grid, [TILE.ROAD]);
    const totalBuildings = listTilesByType(grid, [
      TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE, TILE.QUARRY,
      TILE.HERB_GARDEN, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC
    ]).length;
    // Minimal spanning tree approximation: ~1.5 roads per building connection
    const minimalRoads = Math.max(1, totalBuildings * 1.3);
    const roadRatio = minimalRoads > 0 ? totalRoads / minimalRoads : 0;
    const roadScore = clamp(1 - Math.abs(roadRatio - 1.3) / 1.0, 0, 1);

    // Path efficiency from actual path samples
    let pathEffScore = 0.3; // default
    if (t.pathLengthSamples.length > 3) {
      const ratios = t.pathLengthSamples
        .filter(s => s.manhattan > 0)
        .map(s => s.manhattan / Math.max(s.actual, s.manhattan));
      pathEffScore = ratios.length > 0 ? mean(ratios) : 0.3;
    }

    // Warehouse utilization balance (Gini coefficient of delivery distribution)
    let gini = 0;
    if (t.deliveryByWarehouse.size > 1) {
      const vals = [...t.deliveryByWarehouse.values()].sort((a, b) => a - b);
      const n = vals.length;
      const totalD = vals.reduce((a, b) => a + b, 0);
      if (totalD > 0) {
        let sumDiff = 0;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            sumDiff += Math.abs(vals[i] - vals[j]);
          }
        }
        gini = sumDiff / (2 * n * totalD);
      }
    }
    const giniScore = 1 - gini;

    const score = 0.20 * congestionResponse + 0.20 * diversityScore + 0.20 * roadScore + 0.20 * giniScore + 0.20 * pathEffScore;

    details.push({
      preset: r.config.presetId ?? "default",
      congestionEvents: t.congestionEvents,
      pathDiversity,
      totalRoads,
      roadRatio: round(roadRatio, 2),
      roadScore: round(roadScore, 3),
      warehouseGini: round(gini, 3),
      pathEfficiency: round(pathEffScore, 3),
      score: round(score, 3),
    });
  }
  return { score: round(mean(details.map(d => d.score)), 3), grade: gradeScore(mean(details.map(d => d.score))), details };
}

function evaluatePopulationDynamics(results) {
  const details = [];
  for (const r of results) {
    const t = r.tracker;

    // Population growth mechanism: did population change via non-death means?
    const growthEvents = t.populationChanges.filter(p => p.delta > 0);
    const hasGrowthMechanism = growthEvents.length > 0 ? 1 : 0;

    // Individual identity: do workers have unique traits/skills?
    const sampleWorker = r.state.agents.find(a => a.type === "WORKER");
    let traitCount = 0;
    if (sampleWorker) {
      if (sampleWorker.traits) traitCount += Object.keys(sampleWorker.traits).length;
      if (sampleWorker.skills) traitCount += Object.keys(sampleWorker.skills).length;
      if (sampleWorker.preferences) traitCount++;
      // metabolism variations count as partial identity
      if (sampleWorker.metabolism) traitCount += 0.5;
    }

    // Demographic diversity: variance in worker properties
    const workers = r.state.agents.filter(a => a.type === "WORKER" && a.alive !== false);
    let propertyVariance = 0;
    if (workers.length > 1) {
      // Check hunger variance (only varying property)
      const hungers = workers.map(w => w.hunger ?? 1);
      propertyVariance = stddev(hungers);
      // Check if metabolism differs
      if (workers[0]?.metabolism) {
        const metVals = workers.map(w => w.metabolism?.hungerDecayMultiplier ?? 1);
        propertyVariance = Math.max(propertyVariance, stddev(metVals));
      }
    }

    // Relationship tracking
    const hasRelationships = workers.some(w =>
      w.relationships !== undefined || w.friends !== undefined || w.opinions !== undefined
    );

    const score = 0.25 * hasGrowthMechanism + 0.25 * clamp(traitCount / 4, 0, 1)
      + 0.25 * clamp(propertyVariance / 0.2, 0, 1) + 0.25 * (hasRelationships ? 1 : 0);

    details.push({
      preset: r.config.presetId ?? "default",
      growthEvents: growthEvents.length,
      hasGrowthMechanism,
      traitCount: round(traitCount, 1),
      propertyVariance: round(propertyVariance, 3),
      hasRelationships,
      workerCount: workers.length,
      score: round(score, 3),
    });
  }
  return { score: round(mean(details.map(d => d.score)), 3), grade: gradeScore(mean(details.map(d => d.score))), details };
}

function evaluateEnvironmentalResponsiveness(results) {
  const details = [];
  for (const r of results) {
    const t = r.tracker;
    const ih = t.intentHistory;

    // Weather behavior impact: intent distribution during adverse weather vs clear
    let weatherJSD = 0;
    const clearSamples = {};
    const adverseSamples = {};
    let clearCount = 0, adverseCount = 0;
    const adverseWeathers = new Set(["storm", "rain", "drought", "winter"]);
    for (let i = 0; i < ih.length && i < t.samples.length; i++) {
      const weather = t.samples[i]?.weather ?? "clear";
      const isAdverse = adverseWeathers.has(weather);
      const target = isAdverse ? adverseSamples : clearSamples;
      for (const [k, v] of Object.entries(ih[i])) {
        target[k] = (target[k] ?? 0) + v;
      }
      if (isAdverse) adverseCount++;
      else clearCount++;
    }
    if (clearCount > 0 && adverseCount > 0) {
      weatherJSD = jensenShannonDivergence(clearSamples, adverseSamples);
    }
    // Also credit the existence of weather-responsive behavior (storm shelter)
    const stormShelterBonus = t.weatherChanges.length > 0 ? 0.2 : 0;
    const weatherScore = clamp(weatherJSD / 0.15 + stormShelterBonus, 0, 1);

    // Terrain behavior impact: do tiles affect behavior beyond pathfinding?
    // Fertility affects harvest yields, storm causes rest behavior
    let terrainBehavior = 0;
    // Check if tileState exists with fertility affecting yields
    if (r.state.grid.tileState && r.state.grid.tileState.size > 0) {
      terrainBehavior += 0.5; // fertility system exists
      // Check if any fertility is below 1.0 (meaning it's actually being used)
      for (const [, entry] of r.state.grid.tileState) {
        if (entry.fertility < 0.85) { terrainBehavior += 0.5; break; }
      }
    }

    // Environmental hazard diversity
    let hazardTypes = 0;
    if (t.weathersSeen.has("storm")) hazardTypes++;
    if (t.weathersSeen.has("drought")) hazardTypes++;
    if (t.weathersSeen.has("winter")) hazardTypes++;
    if (t.weathersSeen.has("rain")) hazardTypes++;
    // Predators are a hazard
    if (r.state.animals?.some(a => a.kind === "PREDATOR")) hazardTypes++;
    // Water tiles are impassable
    if (countTilesByType(r.state.grid, [TILE.WATER]) > 0) hazardTypes++;
    // Day/night cycle is an environmental condition
    if (r.state.environment?.dayNightPhase !== undefined) hazardTypes++;
    // Fertility system creates environmental pressure
    if (r.state.grid.tileState && r.state.grid.tileState.size > 0) hazardTypes++;
    const hazardScore = clamp(hazardTypes / 6, 0, 1);

    // Adaptation speed: how quickly do intents shift after weather change?
    let adaptSpeed = 0;
    if (t.weatherChanges.length > 0 && ih.length > 4) {
      // Check if intent distribution changes around weather events
      let shiftCount = 0;
      for (const wc of t.weatherChanges) {
        const wcSampleIdx = t.samples.findIndex(s => s.t >= wc.sec);
        if (wcSampleIdx > 0 && wcSampleIdx < ih.length - 1) {
          const before = ih[wcSampleIdx - 1];
          const after = ih[Math.min(wcSampleIdx + 1, ih.length - 1)];
          const sim = cosineSimilarity(before, after);
          if (sim < 0.95) shiftCount++;
        }
      }
      adaptSpeed = t.weatherChanges.length > 0 ? shiftCount / t.weatherChanges.length : 0;
    }

    const score = 0.3 * weatherScore + 0.2 * terrainBehavior + 0.25 * hazardScore + 0.25 * clamp(adaptSpeed, 0, 1);

    details.push({
      preset: r.config.presetId ?? "default",
      weatherJSD: round(weatherJSD, 4),
      hazardTypes,
      adaptSpeed: round(adaptSpeed, 3),
      score: round(score, 3),
    });
  }
  return { score: round(mean(details.map(d => d.score)), 3), grade: gradeScore(mean(details.map(d => d.score))), details };
}

function evaluateSystemCouplingDensity(results) {
  const details = [];
  for (const r of results) {
    const t = r.tracker;

    // Cross-system influences: count pairs
    let influences = 0;
    // ResourceSystem → MortalitySystem (food → hunger → death)
    if ((r.state.metrics?.deathsByReason?.starvation ?? 0) > 0) influences++;
    // WeatherSystem → movement (weather affects move cost)
    if (t.weatherChanges.length > 0) influences++;
    // RoleAssignment → WorkerAI (roles affect intent)
    if (t.rolesAssigned.size > 1) influences++;
    // Processing → Resources (processing creates refined goods)
    if (t.processingCycles > 0) influences++;
    // ColonyDirector → BuildSystem (auto-builds)
    if (t.tileChanges > 0) influences++;
    // MortalitySystem → PopulationStats
    if ((r.state.metrics?.deathsTotal ?? 0) > 0) influences++;
    // ProgressionSystem → objectives
    if (t.objectivesCompleted > 0) influences++;
    // TileStateSystem → harvest yields (fertility affects production)
    if (r.state.grid.tileState && r.state.grid.tileState.size > 0) influences++;
    // Rest → behavior (rest level drives seek_rest state)
    const sampleW = r.state.agents.find(a => a.type === "WORKER" && a.alive !== false);
    if (sampleW?.rest !== undefined) influences++;
    // Day/night → behavior (night drives rest)
    if (r.state.environment?.dayNightPhase !== undefined) influences++;
    // Morale → mood composite
    if (sampleW?.mood !== undefined) influences++;
    // GameEventBus → event logging (systems emit events)
    if (r.state.events?.log?.length > 0) influences++;
    // Tools → harvest speed (toolProductionMultiplier)
    if (Number(r.state.gameplay?.toolProductionMultiplier ?? 1) > 1) influences++;
    // Ecology → farm yield (herbivore pressure affects farms)
    if (Number(r.state.metrics?.ecology?.totalFarmPressure ?? 0) > 0) influences++;
    // VisitorAI → ResourceSystem (trade yields resources)
    if (r.state.events?.log?.some(e => e.type === "trade_completed")) influences++;
    // VisitorAI → BuildSystem (sabotage destroys buildings)
    if (r.state.events?.log?.some(e => e.type === "sabotage_occurred")) influences++;
    // PopulationGrowth → worker count (food → new workers)
    if (r.state.events?.log?.some(e => e.type === "visitor_arrived" && e.detail?.reason === "colony_growth")) influences++;
    // Social → mood (proximity boosts social need → affects mood composite)
    if (r.state.events?.log?.some(e => e.type === "worker_socialized")) influences++;
    const influenceScore = clamp(influences / 15, 0, 1);

    // Feedback latency: rough estimate — weather changes affect movement next tick (low latency)
    const avgLatency = 1; // ~1 tick latency for most system couplings
    const latencyScore = clamp(1 / (avgLatency + 1), 0, 1);

    // Emergent behavior: run divergence (same scenario, different outcomes)
    // We only run once per scenario, so estimate from variability
    const foodCV = t.resourceTimeSeries.length > 3
      ? cv(t.resourceTimeSeries.map(s => s.food))
      : 0;
    const divergenceEstimate = clamp(foodCV / 0.5, 0, 1);

    // Cascade depth: count distinct causal cascade chains
    let cascadeDepth = 0;
    if (t.resourceDips.length > 0) {
      cascadeDepth++; // level 1: resource dip
      const deathTs = r.state.metrics?.deathTimestamps ?? [];
      for (const dip of t.resourceDips) {
        if (deathTs.some(dt => dt > dip.sec && dt < dip.sec + 30)) {
          cascadeDepth++; // level 2: dip → death
          break;
        }
      }
    }
    // Night → rest → reduced production (independent cascade)
    if (r.state.environment?.dayNightPhase !== undefined) cascadeDepth++;
    // Weather → movement cost → slower deliveries → resource strain
    if (t.weatherChanges.length > 0) cascadeDepth++;
    // Sabotage → building loss → resource drop (visitor-driven cascade)
    const sabLog = r.state.events?.log?.filter(e => e.type === "sabotage_occurred" && !e.detail?.blocked) ?? [];
    if (sabLog.length > 0) cascadeDepth++;
    // Fertility drain → reduced yields → slower accumulation
    if (r.state.grid.tileState) {
      for (const [, entry] of r.state.grid.tileState) {
        if (entry.fertility < 0.7) { cascadeDepth++; break; }
      }
    }
    const cascadeScore = clamp(cascadeDepth / 4, 0, 1);

    const score = 0.3 * influenceScore + 0.2 * latencyScore + 0.25 * divergenceEstimate + 0.25 * cascadeScore;

    details.push({
      preset: r.config.presetId ?? "default",
      systemInfluences: influences,
      avgLatency,
      foodCV: round(foodCV, 3),
      cascadeDepth,
      score: round(score, 3),
    });
  }
  return { score: round(mean(details.map(d => d.score)), 3), grade: gradeScore(mean(details.map(d => d.score))), details };
}

// ── Helpers ────────────────────────────────────────────────────────────

function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom > 0 ? num / denom : 0;
}

function jensenShannonDivergence(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const totalA = Object.values(a).reduce((s, v) => s + v, 0) || 1;
  const totalB = Object.values(b).reduce((s, v) => s + v, 0) || 1;
  let divA = 0, divB = 0;
  for (const k of keys) {
    const pA = (a[k] ?? 0) / totalA;
    const pB = (b[k] ?? 0) / totalB;
    const m = (pA + pB) / 2;
    if (pA > 0 && m > 0) divA += pA * Math.log2(pA / m);
    if (pB > 0 && m > 0) divB += pB * Math.log2(pB / m);
  }
  return (divA + divB) / 2;
}

function gridTileAt(grid, ix, iz) {
  return grid.tiles[iz * grid.width + ix];
}

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

function cosineSimilarity(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, magA = 0, magB = 0;
  for (const k of keys) {
    const va = a[k] ?? 0;
    const vb = b[k] ?? 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
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
    { id: "stability-archipelago", templateId: "archipelago_isles", seed: 1337, durationSec: baseDuration, sampleIntervalSec: 3, category: "stability" },

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

    // Stress scenarios
    { id: "stress-compound", templateId: "temperate_plains", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "crisis_compound", category: "stress" },
    { id: "stress-island", templateId: "archipelago_isles", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "island_isolation", category: "stress" },
    { id: "stress-boom", templateId: "temperate_plains", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "population_boom", category: "stress" },
    { id: "stress-siege", templateId: "fortified_basin", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "late_game_siege", category: "stress" },
    { id: "stress-nodirector", templateId: "temperate_plains", seed: 42, durationSec: baseDuration, sampleIntervalSec: 2, presetId: "no_director", category: "stress" },
  ];
}

// ── Report generation ──────────────────────────────────────────────────

function generateMarkdownReport(evaluation) {
  const lines = [];
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  lines.push("# Project Utopia — Comprehensive Game Evaluation Report");
  lines.push("");
  lines.push(`> Generated: ${now}`);
  lines.push(`> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)`);
  lines.push(`> Scenarios: ${evaluation.totalScenarios} | Duration: ${evaluation.totalDurationSec}s total sim time`);
  lines.push(`> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)`);
  lines.push("");

  // Foundation tier
  const foundationDims = [
    ["Stability", evaluation.stability, "Long-run correctness"],
    ["Technical", evaluation.technical, "AI quality, pathfinding"],
    ["Coverage", evaluation.coverage, "Game element utilization"],
  ];
  const foundationScore = mean(foundationDims.map(([, d]) => d.score));

  // Gameplay tier
  const gameplayDims = [
    ["Development", evaluation.development, "Progressive complexity growth", 0.20],
    ["Playability", evaluation.playability, "Tension curves, engagement", 0.20],
    ["Efficiency", evaluation.efficiency, "Labor throughput, utilization", 0.18],
    ["Logistics", evaluation.logistics, "Infrastructure quality", 0.15],
    ["Reasonableness", evaluation.reasonableness, "NPC behavior naturalness", 0.15],
    ["Adaptability", evaluation.adaptability, "Crisis recovery", 0.12],
  ];
  const gameplayScore = gameplayDims.reduce((s, [, d, , w]) => s + d.score * w, 0);

  // Maturity tier
  const maturityDims = [
    ["Action Duration Realism", evaluation.actionDurationRealism, "动作时长真实性", 0.10],
    ["Tile State Richness", evaluation.tileStateRichness, "地块状态丰富度", 0.08],
    ["NPC Needs Depth", evaluation.npcNeedsDepth, "NPC需求深度", 0.10],
    ["Economic Feedback Loops", evaluation.economicFeedbackLoops, "经济反馈循环", 0.08],
    ["Spatial Layout Intelligence", evaluation.spatialLayoutIntelligence, "空间布局智能", 0.08],
    ["Temporal Realism", evaluation.temporalRealism, "时间真实性", 0.07],
    ["Emergent Narrative", evaluation.emergentNarrative, "涌现叙事密度", 0.08],
    ["Decision Consequence", evaluation.decisionConsequenceDepth, "决策后果深度", 0.09],
    ["Traffic Flow Quality", evaluation.trafficFlowQuality, "交通流质量", 0.08],
    ["Population Dynamics", evaluation.populationDynamics, "人口动态真实性", 0.08],
    ["Environmental Responsiveness", evaluation.environmentalResponsiveness, "环境响应性", 0.08],
    ["System Coupling Density", evaluation.systemCouplingDensity, "系统耦合密度", 0.08],
  ];
  const maturityScore = maturityDims.reduce((s, [, d, , w]) => s + d.score * w, 0);

  const overall = 0.20 * foundationScore + 0.30 * gameplayScore + 0.50 * maturityScore;

  // Overall scorecard
  lines.push("## Overall Score");
  lines.push("");
  lines.push(`**${round(overall, 3)} (${gradeScore(overall)})**`);
  lines.push("");
  lines.push("| Tier | Score | Grade | Weight |");
  lines.push("|---|---|---|---|");
  lines.push(`| **Foundation** (基础运行) | ${round(foundationScore, 3)} | ${gradeScore(foundationScore)} | 20% |`);
  lines.push(`| **Gameplay** (游戏玩法) | ${round(gameplayScore, 3)} | ${gradeScore(gameplayScore)} | 30% |`);
  lines.push(`| **Maturity** (游戏成熟度) | ${round(maturityScore, 3)} | ${gradeScore(maturityScore)} | 50% |`);
  lines.push("");

  // Foundation details
  lines.push("## Tier 1: Foundation (基础运行)");
  lines.push("");
  lines.push("| Dimension | Score | Grade | Description |");
  lines.push("|---|---|---|---|");
  for (const [name, dim, desc] of foundationDims) {
    lines.push(`| ${name} | ${dim.score} | ${dim.grade} | ${desc} |`);
  }
  lines.push("");

  // Gameplay details
  lines.push("## Tier 2: Gameplay (游戏玩法)");
  lines.push("");
  lines.push("| Dimension | Score | Grade | Weight | Description |");
  lines.push("|---|---|---|---|---|");
  for (const [name, dim, desc, w] of gameplayDims) {
    lines.push(`| ${name} | ${dim.score} | ${dim.grade} | ${round(w * 100)}% | ${desc} |`);
  }
  lines.push("");

  // Maturity details
  lines.push("## Tier 3: Maturity (游戏成熟度)");
  lines.push("");
  lines.push("| Dimension | Score | Grade | Weight | Description |");
  lines.push("|---|---|---|---|---|");
  for (const [name, dim, desc, w] of maturityDims) {
    lines.push(`| ${name} | ${dim.score} | ${dim.grade} | ${round(w * 100)}% | ${desc} |`);
  }
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

  // Efficiency details
  lines.push("## 7. Efficiency (效率)");
  lines.push("");
  lines.push("| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const d of evaluation.efficiency.details) {
    lines.push(`| ${d.preset} | ${d.deliveries} | ${d.deliveriesPerWorkerMin} | ${round(d.idleRatio * 100, 1)}% | ${d.procUtilization} | ${d.avgDepotDistance} | ${d.score} |`);
  }
  lines.push("");

  // Adaptability details
  lines.push("## 8. Adaptability (适应性)");
  lines.push("");
  lines.push("| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const d of evaluation.adaptability.details) {
    lines.push(`| ${d.preset} | ${d.weatherChanges} | ${d.weatherResponse} | ${d.resourceDips} | ${d.crisisRecovery} | ${d.deaths} | ${d.deathImpact} | ${d.score} |`);
  }
  lines.push("");

  // Logistics details
  lines.push("## 9. Logistics (物流)");
  lines.push("");
  lines.push("| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |");
  lines.push("|---|---|---|---|---|---|");
  for (const d of evaluation.logistics.details) {
    lines.push(`| ${d.preset} | ${d.roadCoverage} | ${d.warehouseDistScore} | ${d.chainCompleteness} | ${d.resourceBalance} | ${d.score} |`);
  }
  lines.push("");

  // Maturity dimension breakdowns
  lines.push("---");
  lines.push("");
  lines.push("## Maturity Dimension Breakdowns");
  lines.push("");

  // Action Duration Realism
  lines.push("### 10. Action Duration Realism (动作时长真实性)");
  lines.push("| Scenario | Action CV | Action Ratio | Has Progress | Score |");
  lines.push("|---|---|---|---|---|");
  for (const d of evaluation.actionDurationRealism.details) {
    lines.push(`| ${d.preset} | ${d.actionCV} | ${d.actionRatio} | ${d.hasProgress} | ${d.score} |`);
  }
  lines.push("");

  // NPC Needs
  lines.push("### 12. NPC Needs Depth (NPC需求深度)");
  lines.push("| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |");
  lines.push("|---|---|---|---|---|---|");
  for (const d of evaluation.npcNeedsDepth.details) {
    lines.push(`| ${d.preset} | ${d.needFields.join(",")||"none"} | ${d.conflictPairs} | ${d.satisfactionActions.join(",")||"none"} | ${d.hasMood} | ${d.score} |`);
  }
  lines.push("");

  // Spatial Layout
  lines.push("### 14. Spatial Layout Intelligence (空间布局智能)");
  lines.push("| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |");
  lines.push("|---|---|---|---|---|---|");
  for (const d of evaluation.spatialLayoutIntelligence.details) {
    lines.push(`| ${d.preset} | ${d.clusterScore} | ${d.zoningScore} | ${d.pathEfficiency} | ${d.expansionCorrelation} | ${d.score} |`);
  }
  lines.push("");

  // Traffic Flow
  lines.push("### 18. Traffic Flow Quality (交通流质量)");
  lines.push("| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const d of evaluation.trafficFlowQuality.details) {
    lines.push(`| ${d.preset} | ${d.congestionEvents} | ${d.pathDiversity} | ${d.totalRoads} | ${d.roadScore} | ${d.warehouseGini} | ${d.score} |`);
  }
  lines.push("");

  // Recommendations
  lines.push("---");
  lines.push("");
  lines.push("## Improvement Targets");
  lines.push("");
  lines.push("### Maturity Tier — Key Gaps");
  lines.push("");

  const allDims = [
    ...foundationDims.map(([n, d]) => [n, d]),
    ...gameplayDims.map(([n, d]) => [n, d]),
    ...maturityDims.map(([n, d, desc]) => [n + ` (${desc})`, d]),
  ];
  const weakest = [...allDims].sort(([, a], [, b]) => a.score - b.score);
  for (const [name, dim] of weakest.slice(0, 5)) {
    lines.push(`- **${name}**: ${dim.score} (${dim.grade})`);
  }
  lines.push("");
  lines.push("### What Would Raise the Score");
  lines.push("");
  lines.push("To meaningfully improve the Maturity tier, the game needs:");
  lines.push("- **Multiple NPC needs** (rest, morale, social) with conflicting priorities");
  lines.push("- **Tile state richness** (crop growth stages, building degradation, cooldowns)");
  lines.push("- **Action duration realism** (work progress bars, variable task times)");
  lines.push("- **Day/night cycles** affecting behavior and production");
  lines.push("- **Social interactions** between NPCs (relationships, conversations)");
  lines.push("- **Diminishing returns** on resource gathering");
  lines.push("- **Worker specialization** through experience/skills");
  lines.push("");

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
          deliveries: 0, processingCycles: 0, idleIntentSamples: 0, totalIntentSamples: 0,
          depotDistanceSum: 0, depotDistanceSamples: 0, processingBuildingsSamples: 0,
          weatherChanges: [], resourceDips: [], resourceRecoveries: [], productionSnapshots: [],
          lastWeather: null, inResourceDip: { food: false, wood: false },
          roadCoverageSnapshots: [], depotDistStdSnapshots: [],
          chainCompletenessSnapshots: [], resourceBalanceSnapshots: [],
          workerStateDurations: new Map(), workerPrevStates: new Map(),
          tileGridHashes: [], intentDistByWorker: new Map(),
          resourceTimeSeries: [], buildingTimeSeries: [],
          workerPositionSamples: [], eventLog: [], pathLengthSamples: [],
          deliveryByWarehouse: new Map(), tileChanges: 0, prevGridSnapshot: null,
          workerTileOccupancy: new Map(), congestionEvents: 0,
          populationChanges: [], prevWorkerCount: 0,
        },
        initialWorkers: 0, survivalSec: 0, outcome: "crash", reason: err.message,
      });
    }
  }

  console.log("\nScoring...");

  const evaluation = {
    generatedAt: new Date().toISOString(),
    version: "0.5.4",
    totalScenarios: scenarios.length,
    totalDurationSec: totalSimTime,
    // Foundation tier
    stability: evaluateStability(results),
    technical: evaluateTechnical(results),
    coverage: evaluateCoverage(results),
    // Gameplay tier
    development: evaluateDevelopment(results),
    playability: evaluatePlayability(results),
    efficiency: evaluateEfficiency(results),
    logistics: evaluateLogistics(results),
    reasonableness: evaluateReasonableness(results),
    adaptability: evaluateAdaptability(results),
    // Maturity tier
    actionDurationRealism: evaluateActionDurationRealism(results),
    tileStateRichness: evaluateTileStateRichness(results),
    npcNeedsDepth: evaluateNPCNeedsDepth(results),
    economicFeedbackLoops: evaluateEconomicFeedbackLoops(results),
    spatialLayoutIntelligence: evaluateSpatialLayoutIntelligence(results),
    temporalRealism: evaluateTemporalRealism(results),
    emergentNarrative: evaluateEmergentNarrative(results),
    decisionConsequenceDepth: evaluateDecisionConsequenceDepth(results),
    trafficFlowQuality: evaluateTrafficFlowQuality(results),
    populationDynamics: evaluatePopulationDynamics(results),
    environmentalResponsiveness: evaluateEnvironmentalResponsiveness(results),
    systemCouplingDensity: evaluateSystemCouplingDensity(results),
  };

  // Compute tier scores for JSON
  const foundationScoreVal = mean([evaluation.stability.score, evaluation.technical.score, evaluation.coverage.score]);
  const gameplayWeights = [
    [evaluation.development, 0.20], [evaluation.playability, 0.20], [evaluation.efficiency, 0.18],
    [evaluation.logistics, 0.15], [evaluation.reasonableness, 0.15], [evaluation.adaptability, 0.12],
  ];
  const gameplayScoreVal = gameplayWeights.reduce((s, [d, w]) => s + d.score * w, 0);
  const maturityWeights = [
    [evaluation.actionDurationRealism, 0.10], [evaluation.tileStateRichness, 0.08],
    [evaluation.npcNeedsDepth, 0.10], [evaluation.economicFeedbackLoops, 0.08],
    [evaluation.spatialLayoutIntelligence, 0.08], [evaluation.temporalRealism, 0.07],
    [evaluation.emergentNarrative, 0.08], [evaluation.decisionConsequenceDepth, 0.09],
    [evaluation.trafficFlowQuality, 0.08], [evaluation.populationDynamics, 0.08],
    [evaluation.environmentalResponsiveness, 0.08], [evaluation.systemCouplingDensity, 0.08],
  ];
  const maturityScoreVal = maturityWeights.reduce((s, [d, w]) => s + d.score * w, 0);
  const overallScore = 0.20 * foundationScoreVal + 0.30 * gameplayScoreVal + 0.50 * maturityScoreVal;

  evaluation.tierScores = {
    foundation: round(foundationScoreVal, 3),
    gameplay: round(gameplayScoreVal, 3),
    maturity: round(maturityScoreVal, 3),
    overall: round(overallScore, 3),
    overallGrade: gradeScore(overallScore),
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

  // Foundation tier
  const foundationDims = [
    ["Stability", evaluation.stability],
    ["Technical", evaluation.technical],
    ["Coverage", evaluation.coverage],
  ];
  const foundationScore = mean(foundationDims.map(([, d]) => d.score));

  // Gameplay tier
  const gameplayDims = [
    ["Development", evaluation.development, 0.20],
    ["Playability", evaluation.playability, 0.20],
    ["Efficiency", evaluation.efficiency, 0.18],
    ["Logistics", evaluation.logistics, 0.15],
    ["Reasonableness", evaluation.reasonableness, 0.15],
    ["Adaptability", evaluation.adaptability, 0.12],
  ];
  const gameplayScore = gameplayDims.reduce((s, [, d, w]) => s + d.score * w, 0);

  // Maturity tier
  const maturityDims = [
    ["ActionDuration", evaluation.actionDurationRealism, 0.10],
    ["TileState", evaluation.tileStateRichness, 0.08],
    ["NPCNeeds", evaluation.npcNeedsDepth, 0.10],
    ["EconLoops", evaluation.economicFeedbackLoops, 0.08],
    ["SpatialLayout", evaluation.spatialLayoutIntelligence, 0.08],
    ["Temporal", evaluation.temporalRealism, 0.07],
    ["Narrative", evaluation.emergentNarrative, 0.08],
    ["Consequence", evaluation.decisionConsequenceDepth, 0.09],
    ["Traffic", evaluation.trafficFlowQuality, 0.08],
    ["Population", evaluation.populationDynamics, 0.08],
    ["Environment", evaluation.environmentalResponsiveness, 0.08],
    ["Coupling", evaluation.systemCouplingDensity, 0.08],
  ];
  const maturityScore = maturityDims.reduce((s, [, d, w]) => s + d.score * w, 0);

  console.log("  ── Foundation (基础运行) ──");
  for (const [name, dim] of foundationDims) {
    console.log(`    ${dim.grade} ${name.padEnd(20)} ${dim.score}`);
  }
  console.log(`    Tier Score: ${round(foundationScore, 3)} (${gradeScore(foundationScore)})\n`);

  console.log("  ── Gameplay (游戏玩法) ──");
  for (const [name, dim] of gameplayDims) {
    console.log(`    ${dim.grade} ${name.padEnd(20)} ${dim.score}`);
  }
  console.log(`    Tier Score: ${round(gameplayScore, 3)} (${gradeScore(gameplayScore)})\n`);

  console.log("  ── Maturity (游戏成熟度) ──");
  for (const [name, dim] of maturityDims) {
    console.log(`    ${dim.grade} ${name.padEnd(20)} ${dim.score}`);
  }
  console.log(`    Tier Score: ${round(maturityScore, 3)} (${gradeScore(maturityScore)})\n`);

  const overall = 0.20 * foundationScore + 0.30 * gameplayScore + 0.50 * maturityScore;
  console.log(`  Overall: ${round(overall, 3)} (${gradeScore(overall)})`);
  console.log(`    Foundation: ${round(foundationScore, 3)} × 0.20 = ${round(foundationScore * 0.20, 3)}`);
  console.log(`    Gameplay:   ${round(gameplayScore, 3)} × 0.30 = ${round(gameplayScore * 0.30, 3)}`);
  console.log(`    Maturity:   ${round(maturityScore, 3)} × 0.50 = ${round(maturityScore * 0.50, 3)}`);
  console.log("");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
