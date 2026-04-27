/**
 * Growth Diagnostic — measures building count, population, and resources over time.
 * Usage: node scripts/growth-diagnostic.mjs [--duration=600] [--template=temperate_plains]
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
import { TileStateSystem } from "../src/simulation/economy/TileStateSystem.js";
import { ColonyDirectorSystem } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { evaluateRunOutcomeState } from "../src/app/runOutcome.js";
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

function countBuildings(state) {
  const tiles = state.grid.tiles;
  const len = state.grid.width * state.grid.height;
  const counts = {};
  for (let i = 0; i < len; i++) {
    const t = tiles[i];
    if (t === TILE.FARM) counts.farms = (counts.farms ?? 0) + 1;
    else if (t === TILE.LUMBER) counts.lumber = (counts.lumber ?? 0) + 1;
    else if (t === TILE.WAREHOUSE) counts.warehouses = (counts.warehouses ?? 0) + 1;
    else if (t === TILE.QUARRY) counts.quarries = (counts.quarries ?? 0) + 1;
    else if (t === TILE.HERB_GARDEN) counts.herbGardens = (counts.herbGardens ?? 0) + 1;
    else if (t === TILE.KITCHEN) counts.kitchens = (counts.kitchens ?? 0) + 1;
    else if (t === TILE.SMITHY) counts.smithies = (counts.smithies ?? 0) + 1;
    else if (t === TILE.CLINIC) counts.clinics = (counts.clinics ?? 0) + 1;
    else if (t === TILE.ROAD) counts.roads = (counts.roads ?? 0) + 1;
    else if (t === TILE.WALL) counts.walls = (counts.walls ?? 0) + 1;
    else if (t === TILE.BRIDGE) counts.bridges = (counts.bridges ?? 0) + 1;
  }
  counts.total = (counts.farms ?? 0) + (counts.lumber ?? 0) + (counts.warehouses ?? 0)
    + (counts.quarries ?? 0) + (counts.herbGardens ?? 0) + (counts.kitchens ?? 0)
    + (counts.smithies ?? 0) + (counts.clinics ?? 0) + (counts.roads ?? 0);
  return counts;
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

async function run() {
  const args = parseArgs();
  const duration = Number(args.duration) || 600;
  const templateId = args.template || "temperate_plains";
  const seed = Number(args.seed) || 42;
  const sampleInterval = Number(args.interval) || 30;

  console.log(`\n=== Growth Diagnostic ===`);
  console.log(`Template: ${templateId}, Seed: ${seed}, Duration: ${duration}s, Interval: ${sampleInterval}s\n`);

  const state = createInitialGameState({ templateId, seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = true;
  state.ai.coverageTarget = "fallback";
  state.ai.runtimeProfile = "long_run";

  const memoryStore = new MemoryStore();
  const services = createServices(seed, { offlineAiFallback: true });
  services.memoryStore = memoryStore;
  const systems = buildSystems(memoryStore);

  const totalTicks = Math.round(duration / DT_SEC);
  const sampleTicks = Math.round(sampleInterval / DT_SEC);
  const samples = [];

  // Header
  console.log("Time(s) | Workers | Herbi | Pred | Food | Wood | Stone | Herbs | Meals | Tools | Med | Buildings | Farms | Lumber | WH | Quarry | Kitchen | Prosperity | Threat | PopCap");
  console.log("-".repeat(170));

  for (let tick = 0; tick < totalTicks; tick++) {
    for (const system of systems) {
      system.update(DT_SEC, state, services);
    }
    await Promise.resolve();

    const outcome = state.session.phase === "active" ? evaluateRunOutcomeState(state) : null;
    if (outcome) {
      state.session.phase = "end";
      state.session.outcome = outcome.outcome;
      state.session.reason = outcome.reason;
    }

    if (tick % sampleTicks === 0 || tick === totalTicks - 1) {
      const t = Math.round(state.metrics.timeSec);
      const workers = state.agents.filter(a => a.type === "WORKER" && a.alive !== false).length;
      const herbivores = state.animals.filter(a => a.kind === "HERBIVORE" && a.alive !== false).length;
      const predators = state.animals.filter(a => a.kind === "PREDATOR" && a.alive !== false).length;
      const buildings = countBuildings(state);
      const warehouses = buildings.warehouses ?? 0;
      const farms = buildings.farms ?? 0;
      const quarries = buildings.quarries ?? 0;
      const kitchens = buildings.kitchens ?? 0;
      const lumber = buildings.lumber ?? 0;
      const smithies = buildings.smithies ?? 0;
      const clinics = buildings.clinics ?? 0;
      const herbGardens = buildings.herbGardens ?? 0;
      const popCap = Math.min(80, 8 + warehouses * 4 + Math.floor(farms * 0.8)
        + Math.floor(lumber * 0.5) + quarries * 2 + kitchens * 2
        + smithies * 2 + clinics * 2 + herbGardens);

      const sample = {
        t,
        workers,
        herbivores,
        predators,
        food: Math.round(state.resources.food),
        wood: Math.round(state.resources.wood),
        stone: Math.round(state.resources.stone ?? 0),
        herbs: Math.round(state.resources.herbs ?? 0),
        meals: Math.round(state.resources.meals ?? 0),
        tools: Math.round(state.resources.tools ?? 0),
        medicine: Math.round(state.resources.medicine ?? 0),
        buildings: buildings.total,
        farms,
        lumber: buildings.lumber ?? 0,
        warehouses,
        quarries,
        kitchens,
        prosperity: Math.round(state.gameplay.prosperity),
        threat: Math.round(state.gameplay.threat),
        popCap,
      };
      samples.push(sample);

      console.log(
        `${String(t).padStart(6)} | ${String(workers).padStart(7)} | ${String(herbivores).padStart(5)} | ${String(predators).padStart(4)} | ${String(sample.food).padStart(4)} | ${String(sample.wood).padStart(4)} | ${String(sample.stone).padStart(5)} | ${String(sample.herbs).padStart(5)} | ${String(sample.meals).padStart(5)} | ${String(sample.tools).padStart(5)} | ${String(sample.medicine).padStart(3)} | ${String(sample.buildings).padStart(9)} | ${String(farms).padStart(5)} | ${String(sample.lumber).padStart(6)} | ${String(warehouses).padStart(2)} | ${String(quarries).padStart(6)} | ${String(kitchens).padStart(7)} | ${String(sample.prosperity).padStart(10)} | ${String(sample.threat).padStart(6)} | ${String(popCap).padStart(6)}`
      );
    }

    if (state.session.phase === "end") {
      console.log(`\n>>> GAME ENDED: ${state.session.outcome} — ${state.session.reason} at ${Math.round(state.metrics.timeSec)}s`);
      break;
    }
  }

  // Summary
  const first = samples[0];
  const last = samples[samples.length - 1];
  console.log(`\n=== Summary ===`);
  console.log(`Duration: ${first.t}s → ${last.t}s`);
  console.log(`Workers: ${first.workers} → ${last.workers} (pop cap: ${last.popCap})`);
  console.log(`Buildings: ${first.buildings} → ${last.buildings}`);
  console.log(`Food: ${first.food} → ${last.food}`);
  console.log(`Wood: ${first.wood} → ${last.wood}`);
  console.log(`Prosperity: ${first.prosperity} → ${last.prosperity}`);
  console.log(`Threat: ${first.threat} → ${last.threat}`);

  // Growth analysis
  const mid = samples[Math.floor(samples.length / 2)];
  const buildingGrowthEarly = mid.buildings - first.buildings;
  const buildingGrowthLate = last.buildings - mid.buildings;
  const popGrowthEarly = mid.workers - first.workers;
  const popGrowthLate = last.workers - mid.workers;
  console.log(`\nBuilding growth: early=${buildingGrowthEarly}, late=${buildingGrowthLate} (${buildingGrowthLate > buildingGrowthEarly ? "accelerating ✓" : "decelerating ✗"})`);
  console.log(`Pop growth: early=${popGrowthEarly}, late=${popGrowthLate} (${popGrowthLate > 0 ? "still growing ✓" : "stagnant ✗"})`);

  // Stagnation detection
  const stagnantPeriods = [];
  for (let i = 2; i < samples.length; i++) {
    if (samples[i].buildings === samples[i-1].buildings && samples[i-1].buildings === samples[i-2].buildings
      && samples[i].workers === samples[i-1].workers) {
      stagnantPeriods.push(samples[i].t);
    }
  }
  if (stagnantPeriods.length > 0) {
    console.log(`\nStagnation detected at: ${stagnantPeriods.join(", ")}s`);
  } else {
    console.log(`\nNo stagnation detected ✓`);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
