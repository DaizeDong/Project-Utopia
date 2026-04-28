/**
 * Strategic Director A/B Bench — measures the LLM strategic director vs.
 * the deterministic fallback across 3 stress scenarios. ALL OTHER
 * directors run on fallback so we isolate the contribution of the
 * strategic LLM decision quality alone.
 *
 * Usage:
 *   AI_PROXY_PORT=8787 node scripts/bench-strategic-director.mjs
 *
 * Requires the ai-proxy running on AI_PROXY_BASE_URL (default
 * http://localhost:8787) with OPENAI_API_KEY set.
 *
 * Output: per-scenario LLM-vs-fallback table and composite quality
 * score deltas. Exit 0 if LLM beats fallback by ≥5% on ≥2 of 3
 * scenarios AND primaryGoal-non-empty rate ≥ 80%; else exit 1.
 */

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { LLMClient } from "../src/simulation/ai/llm/LLMClient.js";
import { SeededRng, deriveRngSeed } from "../src/app/rng.js";
import { PathCache } from "../src/simulation/navigation/PathCache.js";

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
import { DevIndexSystem } from "../src/simulation/meta/DevIndexSystem.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

const DT_SEC = 1 / 30;
const PROXY_BASE = process.env.AI_PROXY_BASE_URL ?? `http://localhost:${process.env.AI_PROXY_PORT ?? 8787}`;

const FULL_SCENARIOS = [
  { id: "S1", template: "temperate_plains", seed: 1337, durationSec: 240, label: "S1 typical" },
  { id: "S2", template: "rugged_highlands", seed: 42, durationSec: 300, label: "S2 stone bottleneck" },
  { id: "S3", template: "fertile_riverlands", seed: 7777, durationSec: 300, label: "S3 long-horizon" },
];

// Optional: pass --smoke for a fast 60s sanity run on each scenario.
// Optional: pass --only=S2 to run a single scenario.
const argSmoke = process.argv.includes("--smoke");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const onlyId = onlyArg ? onlyArg.slice("--only=".length) : null;
const SCENARIOS = FULL_SCENARIOS
  .map((s) => argSmoke ? { ...s, durationSec: 60 } : s)
  .filter((s) => !onlyId || s.id === onlyId);

const PHASE_ORDER = { bootstrap: 0, growth: 1, industrialize: 2, process: 3, fortify: 1.5, optimize: 4 };

/**
 * StrategicDirector subclass that *forces* LLM regardless of
 * state.ai.coverageTarget. Lets us keep all other directors on
 * fallback while still routing strategic to the proxy.
 */
class LLMOnlyStrategicDirector extends StrategicDirector {
  constructor(memoryStore, llmClient, options = {}) {
    super(memoryStore, options);
    this._forcedLlmClient = llmClient;
  }
  update(dt, state, services) {
    // Temporarily flip coverageTarget so the parent class takes the LLM branch
    // for THIS director only. Other systems read state.ai.coverageTarget on
    // their own update calls and remain on fallback.
    const original = state.ai.coverageTarget;
    state.ai.coverageTarget = "llm";
    state.ai.enabled = true;
    const patchedServices = { ...services, llmClient: this._forcedLlmClient };
    try {
      super.update(dt, state, patchedServices);
    } finally {
      state.ai.coverageTarget = original;
    }
  }
}

function buildSystems(memoryStore, strategicDirector) {
  return [
    new SimulationClock(),
    new ProgressionSystem(),
    new RoleAssignmentSystem(),
    new PopulationGrowthSystem(),
    strategicDirector,
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
    new DevIndexSystem(),
    new ColonyDirectorSystem(),
  ];
}

function initState(templateId, seed) {
  const state = createInitialGameState({ templateId, seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = true;
  state.ai.coverageTarget = "fallback"; // others stay on fallback; LLM director overrides per-tick.
  state.buildings = rebuildBuildingStats(state.grid);
  return state;
}

function buildLocalServices(seed) {
  // Minimal services bag — strategic director only needs llmClient + memoryStore;
  // other systems mostly use rng/pathCache. We avoid PathWorkerPool (worker_threads)
  // for determinism + faster harness boot.
  const rng = new SeededRng(deriveRngSeed(seed, "simulation"));
  return {
    pathCache: new PathCache(700),
    pathWorkerPool: null,
    pathBudget: { tick: -1, usedMs: 0, skipped: 0, maxMs: Infinity },
    rng,
    dispose() {},
  };
}

async function runScenario({ template, seed, durationSec }, useLLM, llmClient) {
  const state = initState(template, seed);
  const memory = new MemoryStore();
  const services = buildLocalServices(seed);
  services.memoryStore = memory;
  services.llmClient = llmClient; // shared by NPCBrain/EnvironmentDirector for fallback path

  const strategic = useLLM
    ? new LLMOnlyStrategicDirector(memory, llmClient, { heartbeatSec: 30 })
    : new StrategicDirector(memory, { heartbeatSec: 30 });

  const systems = buildSystems(memory, strategic);

  const phaseSeen = new Set();
  let primaryGoalNonEmpty = 0;
  let primaryGoalChecks = 0;
  let lastDecisionCount = 0;
  const goalSamples = [];
  const phaseSamples = [];

  const totalTicks = Math.round(durationSec / DT_SEC);
  for (let t = 0; t < totalTicks; t++) {
    for (const sys of systems) sys.update(DT_SEC, state, services);

    // Drain pending LLM result on next tick (StrategicDirector uses
    // an async pendingPromise — we await it so each strategic
    // decision actually lands inside the run window).
    if (useLLM && strategic.pendingPromise) {
      // eslint-disable-next-line no-await-in-loop
      await strategic.pendingPromise;
    }

    const decisionCount = state.ai.strategyDecisionCount ?? 0;
    if (decisionCount > lastDecisionCount) {
      const strat = state.ai.strategy ?? {};
      primaryGoalChecks += 1;
      if (typeof strat.primaryGoal === "string" && strat.primaryGoal.trim().length > 0) {
        primaryGoalNonEmpty += 1;
      }
      goalSamples.push({
        sec: Math.round(state.metrics.timeSec),
        phase: strat.phase ?? "?",
        goal: (strat.primaryGoal ?? "").slice(0, 80),
        source: state.ai.lastStrategySource,
      });
      phaseSamples.push(strat.phase ?? "?");
      phaseSeen.add(strat.phase ?? "?");
      lastDecisionCount = decisionCount;
    }
  }

  // Drain any final pending promise so the bench cleanly resolves.
  if (useLLM && strategic.pendingPromise) {
    await strategic.pendingPromise.catch(() => {});
  }

  const devIndex = Number(state.gameplay?.devIndex ?? 0);
  const devIndexSmoothed = Number(state.gameplay?.devIndexSmoothed ?? 0);
  const totalEntities = Number(state.metrics?.populationStats?.totalEntities ?? state.agents?.length ?? 0);
  const deathsTotal = Number(state.metrics?.deathsTotal ?? 0);

  // Phase progress bonus: max phase rank reached + spread across phases.
  let maxPhaseRank = 0;
  for (const p of phaseSeen) maxPhaseRank = Math.max(maxPhaseRank, PHASE_ORDER[p] ?? 0);
  const phaseBonus = maxPhaseRank * 5 + (phaseSeen.size - 1) * 2;

  const score =
    devIndexSmoothed * 0.5 +
    (totalEntities / 100) * 0.2 -
    deathsTotal * 0.3 +
    phaseBonus;

  return {
    devIndex,
    devIndexSmoothed,
    totalEntities,
    deathsTotal,
    decisionCount: state.ai.strategyDecisionCount ?? 0,
    lastSource: state.ai.lastStrategySource ?? "?",
    phasesSeen: [...phaseSeen],
    maxPhaseRank,
    phaseBonus,
    primaryGoalNonEmpty,
    primaryGoalChecks,
    primaryGoalRate: primaryGoalChecks > 0 ? primaryGoalNonEmpty / primaryGoalChecks : 0,
    candidateUseRateAvg: Number(state.ai?.candidateUseRateAvg ?? 0),
    candidateUseRateSamples: Number(state.ai?.candidateUseRateSamples ?? 0),
    score,
    goalSamples: goalSamples.slice(0, 6),
    phaseSamples,
  };
}

function fmt(v, d = 2) {
  if (typeof v !== "number" || !Number.isFinite(v)) return String(v ?? "-");
  return v.toFixed(d);
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  Strategic Director A/B Bench — LLM vs Fallback         ║");
  console.log("║  Proxy:", PROXY_BASE.padEnd(48), "║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const llmClient = new LLMClient({ baseUrl: PROXY_BASE });
  const results = [];

  for (const scen of SCENARIOS) {
    console.log(`▶ ${scen.id} (${scen.template}, seed=${scen.seed}, ${scen.durationSec}s) — fallback first`);
    const fb = await runScenario(scen, false, llmClient);
    console.log(`  fallback: dev=${fmt(fb.devIndexSmoothed)} ent=${fb.totalEntities} deaths=${fb.deathsTotal} ` +
      `phases=${fb.phasesSeen.length} rank=${fb.maxPhaseRank} score=${fmt(fb.score)} ` +
      `decisions=${fb.decisionCount} goal%=${fmt(fb.primaryGoalRate * 100, 1)}`);

    console.log(`▶ ${scen.id} (${scen.template}, seed=${scen.seed}, ${scen.durationSec}s) — LLM`);
    const llm = await runScenario(scen, true, llmClient);
    console.log(`  llm:      dev=${fmt(llm.devIndexSmoothed)} ent=${llm.totalEntities} deaths=${llm.deathsTotal} ` +
      `phases=${llm.phasesSeen.length} rank=${llm.maxPhaseRank} score=${fmt(llm.score)} ` +
      `decisions=${llm.decisionCount} goal%=${fmt(llm.primaryGoalRate * 100, 1)} ` +
      `candUse%=${fmt(llm.candidateUseRateAvg * 100, 1)} src=${llm.lastSource}`);

    const delta = llm.score - fb.score;
    const deltaPct = fb.score !== 0 ? (delta / Math.abs(fb.score)) * 100 : 0;
    console.log(`  Δscore=${fmt(delta)} (${fmt(deltaPct, 1)}%) — LLM ${delta >= 0 ? "WIN" : "LOSS"}`);
    if (llm.goalSamples.length > 0) {
      console.log(`  llm goals: ${llm.goalSamples.slice(0, 3).map(s => `[${s.phase}] ${s.goal || "(empty)"}`).join(" | ")}`);
    }
    console.log();

    results.push({ scen, fallback: fb, llm, delta, deltaPct });
  }

  // Summary
  console.log("┌──────┬───────────┬────────────┬────────────┬─────────┬─────────┬─────────┬─────────┐");
  console.log("│ Scen │ Template  │ FB score   │ LLM score  │ Δ%      │ goal%   │ candUse%│ Verdict │");
  console.log("├──────┼───────────┼────────────┼────────────┼─────────┼─────────┼─────────┼─────────┤");
  let wins = 0;
  let r2Wins = 0;  // R2 bar: ≥75% delta
  let totalGoalNonEmpty = 0;
  let totalGoalChecks = 0;
  let candUseSum = 0;
  let candUseCount = 0;
  for (const r of results) {
    const winFlag = r.deltaPct >= 75 ? "R2-WIN" : (r.deltaPct >= 5 ? "WIN" : "LOSS");
    if (r.deltaPct >= 5) wins += 1;
    if (r.deltaPct >= 75) r2Wins += 1;
    totalGoalNonEmpty += r.llm.primaryGoalNonEmpty;
    totalGoalChecks += r.llm.primaryGoalChecks;
    if (r.llm.candidateUseRateSamples > 0) {
      candUseSum += r.llm.candidateUseRateAvg;
      candUseCount += 1;
    }
    console.log(
      `│ ${r.scen.id.padEnd(4)} │ ${r.scen.template.slice(0, 9).padEnd(9)} │ ${
        fmt(r.fallback.score).padStart(10)
      } │ ${fmt(r.llm.score).padStart(10)} │ ${fmt(r.deltaPct, 1).padStart(7)} │ ${
        fmt(r.llm.primaryGoalRate * 100, 1).padStart(7)
      } │ ${fmt(r.llm.candidateUseRateAvg * 100, 1).padStart(7)} │ ${winFlag.padEnd(7)} │`,
    );
  }
  console.log("└──────┴───────────┴────────────┴────────────┴─────────┴─────────┴─────────┴─────────┘");

  const overallGoalRate = totalGoalChecks > 0 ? totalGoalNonEmpty / totalGoalChecks : 0;
  const overallCandUse = candUseCount > 0 ? candUseSum / candUseCount : 0;
  console.log(`\nWins (Δ≥5%):  ${wins}/${SCENARIOS.length}`);
  console.log(`R2 Wins (Δ≥75%): ${r2Wins}/${SCENARIOS.length}`);
  console.log(`Overall LLM primaryGoal-non-empty rate: ${fmt(overallGoalRate * 100, 1)}%`);
  console.log(`Overall candidateUseRate (avg per scenario): ${fmt(overallCandUse * 100, 1)}%`);

  const passWins = wins >= 2;
  const passGoals = overallGoalRate >= 0.8;
  const passR2 = r2Wins >= 3;
  const passCandUse = overallCandUse >= 0.8;
  if (passWins && passGoals) {
    if (passR2 && passCandUse) {
      console.log("\nPASS R2 — LLM beats fallback by ≥75% on 3/3 AND candidateUseRate ≥ 80%.\n");
    } else {
      console.log("\nPASS R1 — LLM beats fallback on ≥2 of 3 scenarios with ≥80% goal coverage.");
      if (!passR2) console.log(`  R2 bar miss: needs 3/3 ≥75% wins, got ${r2Wins}`);
      if (!passCandUse) console.log(`  R2 bar miss: needs ≥80% candidateUseRate, got ${fmt(overallCandUse * 100, 1)}%`);
      console.log();
    }
    process.exit(0);
  }
  console.log("\nFAIL — tuning targets not met:");
  if (!passWins) console.log(`  needs ≥2 wins, got ${wins}`);
  if (!passGoals) console.log(`  needs ≥80% goal coverage, got ${fmt(overallGoalRate * 100, 1)}%`);
  process.exit(1);
}

main().catch((err) => {
  console.error("bench-strategic-director failed:", err);
  process.exit(2);
});
