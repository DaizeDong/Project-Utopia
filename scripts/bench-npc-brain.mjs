/**
 * NPC-Brain LLM A/B Bench
 *
 * Compares NPC-Brain LLM policies vs the fallback policy template across three
 * stress scenarios chosen to highlight raid + wildlife pressure (where the LLM
 * has the largest expected lead). All other AI directors run in fallback mode
 * so the only variable is the policy source.
 *
 * Composite npc-quality-score = -deaths*2.0 + entities*0.1 - predationDeaths*5.0
 *
 * Usage:
 *   node scripts/bench-npc-brain.mjs
 *   AI_PROXY_BASE=http://localhost:8787 node scripts/bench-npc-brain.mjs
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
import { createAnimal } from "../src/entities/EntityFactory.js";
import { ANIMAL_KIND, ANIMAL_SPECIES } from "../src/config/constants.js";

const DT_SEC = 1 / 30;

// ── Scenarios — focused on raid / wildlife pressure ────────────────────────
const SCENARIOS = [
  {
    id: "S1",
    label: "fortified_basin (raid)",
    templateId: "fortified_basin",
    seed: 1337,
    durationSec: 240,
    raidSeeds: { extraRaiders: 4, extraPredators: 1 },
  },
  {
    id: "S2",
    label: "temperate_plains (mixed)",
    templateId: "temperate_plains",
    seed: 42,
    durationSec: 300,
    raidSeeds: { extraRaiders: 3, extraPredators: 2 },
  },
  {
    id: "S3",
    label: "rugged_highlands (wildlife)",
    templateId: "rugged_highlands",
    seed: 7777,
    durationSec: 240,
    raidSeeds: { extraRaiders: 1, extraPredators: 4 },
  },
];

const COVERAGE_TARGETS = ["llm", "fallback"];
const PROXY_BASE = process.env.AI_PROXY_BASE ?? "http://localhost:8787";

// ── Sim plumbing ───────────────────────────────────────────────────────────
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

function refreshPopulationStats(state) {
  const workers = state.agents.filter((a) => a.type === "WORKER" && a.alive !== false);
  state.metrics.populationStats = {
    workers: workers.length,
    totalEntities: state.agents.length + (state.animals?.length ?? 0),
  };
  state.metrics.deathsTotal = state.metrics.deathsTotal ?? 0;
}

// Sprinkle raid pressure: spawn extra raider_beast + predators near the colony
// so the run actually exercises raid response within 240–300 sim sec.
function injectRaidPressure(state, raidSeeds, rng) {
  if (!raidSeeds) return;
  const extraRaiders = Math.max(0, Number(raidSeeds.extraRaiders ?? 0));
  const extraPredators = Math.max(0, Number(raidSeeds.extraPredators ?? 0));
  const grid = state.grid;
  const w = grid?.width ?? 96;
  const h = grid?.height ?? 72;
  // Anchor near population centroid so combat actually happens in-frame.
  const cx0 = state.agents.length > 0
    ? state.agents.reduce((s, a) => s + a.x, 0) / state.agents.length
    : w / 2;
  const cz0 = state.agents.length > 0
    ? state.agents.reduce((s, a) => s + a.z, 0) / state.agents.length
    : h / 2;
  for (let i = 0; i < extraRaiders; i += 1) {
    const angle = (i / Math.max(1, extraRaiders)) * Math.PI * 2;
    const r = 14 + (i % 3);
    const x = Math.max(2, Math.min(w - 2, cx0 + Math.cos(angle) * r));
    const z = Math.max(2, Math.min(h - 2, cz0 + Math.sin(angle) * r));
    const a = createAnimal(x, z, ANIMAL_KIND.PREDATOR, rng, ANIMAL_SPECIES.RAIDER_BEAST);
    state.animals.push(a);
  }
  for (let i = 0; i < extraPredators; i += 1) {
    const angle = (i / Math.max(1, extraPredators)) * Math.PI * 2 + 0.8;
    const r = 18 + (i % 3);
    const x = Math.max(2, Math.min(w - 2, cx0 + Math.cos(angle) * r));
    const z = Math.max(2, Math.min(h - 2, cz0 + Math.sin(angle) * r));
    const species = i % 2 === 0 ? ANIMAL_SPECIES.WOLF : ANIMAL_SPECIES.BEAR;
    const a = createAnimal(x, z, ANIMAL_KIND.PREDATOR, rng, species);
    state.animals.push(a);
  }
}

async function runOne(scenario, coverageTarget) {
  const aiEnabled = coverageTarget === "llm";
  const state = createInitialGameState({ templateId: scenario.templateId, seed: scenario.seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = aiEnabled;
  state.ai.coverageTarget = coverageTarget; // "llm" or "fallback"

  const services = createServices(state.world.mapSeed, {
    // offlineAiFallback: false → real LLMClient → real proxy at PROXY_BASE
    offlineAiFallback: !aiEnabled,
    baseUrl: aiEnabled ? PROXY_BASE : "",
    deterministic: true,
  });
  const memoryStore = new MemoryStore();
  services.memoryStore = memoryStore;

  // Inject raid pressure deterministically (uses seeded rng draws via Math.random
  // since createAnimal accepts an rng; we mirror the seed for stability).
  let rngCounter = scenario.seed * 9301 + 49297;
  const rng = () => {
    rngCounter = (rngCounter * 9301 + 49297) % 233280;
    return rngCounter / 233280;
  };
  injectRaidPressure(state, scenario.raidSeeds, rng);

  const systems = buildSystems(memoryStore);
  refreshPopulationStats(state);

  const totalTicks = Math.max(60, Math.round(scenario.durationSec / DT_SEC));
  const sampleEveryTicks = Math.max(1, Math.round(2 / DT_SEC)); // 2 sec
  const samples = [];

  // Find the NPCBrainSystem instance so we can drain its pending promise.
  const npcBrain = systems.find((s) => s && s.name === "NPCBrainSystem");

  // To keep the bench fair under real-LLM latency: at every decision
  // boundary (~policyDecisionIntervalSec = 20 sim sec), wait for the LLM
  // call to resolve before advancing the sim, so the LLM actually steers
  // the colony for the whole duration instead of only the first 36s.
  const drainBoundaryTicks = Math.max(1, Math.round(20 / DT_SEC));
  let lastDrainTick = -drainBoundaryTicks;
  for (let tick = 0; tick < totalTicks; tick += 1) {
    for (const sys of systems) sys.update(DT_SEC, state, services);
    if (npcBrain && (tick - lastDrainTick) >= drainBoundaryTicks) {
      // Wait until any in-flight policy request resolves and is integrated.
      // pendingResult is cleared the next time NPCBrainSystem.update runs
      // and consumes it — so we wait, then run one more sim step, then move
      // on. This caps LLM call cost at one drain per ~20 sim sec, and also
      // ensures the offline fallback's microtask result actually lands
      // (otherwise the entire 240s sim runs sync without ever yielding).
      while (npcBrain.pendingPromise) {
        await npcBrain.pendingPromise.catch(() => {});
        await new Promise((r) => setImmediate(r));
      }
      lastDrainTick = tick;
    } else if (tick % 60 === 0) {
      await new Promise((r) => setImmediate(r));
    }
    refreshPopulationStats(state);
    if (tick % sampleEveryTicks === 0) {
      samples.push({
        timeSec: state.metrics.timeSec,
        activeRaiders: Number(state.metrics?.combat?.activeRaiders ?? 0),
        activePredators: Number(state.metrics?.combat?.activePredators ?? 0),
        guardCount: Number(state.metrics?.combat?.guardCount ?? 0),
        workerCount: Number(state.metrics?.combat?.workerCount ?? 0),
      });
    }
  }
  // Final flush so any in-flight call resolves into pendingResult and the
  // policy source counter is not undercounted (applies to both LLM and the
  // microtask-deferred offline fallback).
  for (let i = 0; i < 16; i += 1) await new Promise((r) => setImmediate(r));

  const deathsTotal = Number(state.metrics?.deathsTotal ?? 0);
  const deathsByReason = state.metrics?.deathsByReason ?? {};
  const predationDeaths = Number(deathsByReason.predation ?? 0);
  const totalEntities = Number(state.metrics?.populationStats?.totalEntities ?? (state.agents.length + state.animals.length));

  const meanRaiders = samples.reduce((s, x) => s + x.activeRaiders, 0) / Math.max(1, samples.length);
  const meanPredators = samples.reduce((s, x) => s + x.activePredators, 0) / Math.max(1, samples.length);
  const meanGuards = samples.reduce((s, x) => s + x.guardCount, 0) / Math.max(1, samples.length);
  const meanWorkers = samples.reduce((s, x) => s + x.workerCount, 0) / Math.max(1, samples.length);

  // Average predator-hit count per worker (looks at every alive worker's
  // recentEvents and counts how many entries are "predator-hit").
  let predatorHits = 0;
  let workerSurvey = 0;
  for (const w of state.agents) {
    if (w.type !== "WORKER") continue;
    workerSurvey += 1;
    const recent = w.memory?.recentEvents ?? [];
    for (const r of recent) if (r === "predator-hit") predatorHits += 1;
  }
  const predatorHitsPerWorker = workerSurvey > 0 ? predatorHits / workerSurvey : 0;

  const score = -deathsTotal * 2.0 + totalEntities * 0.1 - predationDeaths * 5.0;

  return {
    coverageTarget,
    deathsTotal,
    deathsByReason,
    predationDeaths,
    totalEntities,
    meanRaiders: Number(meanRaiders.toFixed(2)),
    meanPredators: Number(meanPredators.toFixed(2)),
    meanGuards: Number(meanGuards.toFixed(2)),
    meanWorkers: Number(meanWorkers.toFixed(2)),
    predatorHitsPerWorker: Number(predatorHitsPerWorker.toFixed(2)),
    lastPolicySource: state.ai.lastPolicySource,
    policyDecisionCount: Number(state.ai.policyDecisionCount ?? 0),
    policyLlmCount: Number(state.ai.policyLlmCount ?? 0),
    score: Number(score.toFixed(2)),
  };
}

function pct(a, b) {
  if (b === 0) return a === 0 ? 0 : Infinity;
  return ((a - b) / Math.abs(b)) * 100;
}

async function main() {
  console.log(`\n[bench-npc-brain] proxy=${PROXY_BASE}\n`);
  const out = [];
  for (const scenario of SCENARIOS) {
    console.log(`──── ${scenario.id} ${scenario.label} (seed=${scenario.seed}, ${scenario.durationSec}s) ────`);
    const results = {};
    for (const ct of COVERAGE_TARGETS) {
      const r = await runOne(scenario, ct);
      results[ct] = r;
      console.log(
        `  [${ct.padEnd(8)}] deaths=${r.deathsTotal} predation=${r.predationDeaths} entities=${r.totalEntities} ` +
        `score=${r.score} | meanRaiders=${r.meanRaiders} meanGuards=${r.meanGuards} workers=${r.meanWorkers} ` +
        `predHits/wkr=${r.predatorHitsPerWorker} | policy=${r.lastPolicySource} llmCalls=${r.policyLlmCount}/${r.policyDecisionCount}`,
      );
    }
    const llm = results.llm;
    const fb = results.fallback;
    const scoreDelta = pct(llm.score, fb.score);
    const predDelta = pct(llm.predationDeaths, fb.predationDeaths);
    const deathDelta = pct(llm.deathsTotal, fb.deathsTotal);
    out.push({ scenario, llm, fallback: fb, scoreDelta, predDelta, deathDelta });
    console.log(`    Δscore=${scoreDelta.toFixed(1)}%  Δdeaths=${deathDelta.toFixed(1)}%  Δpredation=${predDelta.toFixed(1)}%\n`);
  }

  console.log("\n══════════════════════════ Summary ══════════════════════════");
  console.log("Scenario                          Δscore   Δpred    pass(8% & ≥0)");
  let passingScenarios = 0;
  let predationPassScenarios = 0;
  for (const row of out) {
    const passScore = row.scoreDelta >= 8 || (row.fallback.score < 0 && row.llm.score > row.fallback.score && Math.abs(row.scoreDelta) >= 8);
    if (passScore) passingScenarios += 1;
    if (row.predDelta <= -20) predationPassScenarios += 1;
    const tag = `${row.scenario.id} ${row.scenario.label}`.padEnd(34);
    console.log(`${tag} ${row.scoreDelta.toFixed(1).padStart(6)}%  ${row.predDelta.toFixed(1).padStart(6)}%  ${passScore ? "PASS" : "----"}`);
  }
  const success = passingScenarios >= 2 && predationPassScenarios >= 1;
  console.log(`\nResult: ${passingScenarios}/3 scenarios on score, ${predationPassScenarios}/3 on predation drop. ${success ? "✓ PASS" : "✗ FAIL"}\n`);
  return success ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(2);
});
