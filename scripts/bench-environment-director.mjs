/**
 * Environment Director A/B Bench — LLM vs Fallback
 *
 * Runs three deterministic stress scenarios (240 sim sec each) twice:
 * once with `state.ai.coverageTarget="llm"` (calls ai-proxy on :8787)
 * and once with `coverageTarget="fallback"` (rule-based directive).
 *
 * Holds every other director at fallback so the only signal is the env
 * directive. Captures per-run:
 *   - state.metrics.deathsTotal
 *   - state.gameplay.devIndex (final + smoothed last-60s mean)
 *   - state.ai.environmentDecisionCount
 *   - weatherThrash (count of weather-state changes)
 *   - fallback ratio across the run
 *   - average env LLM latency
 *
 * Computes "env quality score" = -deaths*1.0 + devIndex*0.3 - thrash*0.5
 * (higher = better). Outputs a single JSON blob to stdout.
 *
 *  Usage:
 *    node scripts/bench-environment-director.mjs
 *    node scripts/bench-environment-director.mjs --offline   (skip proxy)
 *
 * Modelled on scripts/ablation-benchmark.mjs runSim()/buildSystems().
 */

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

import { SimulationClock } from "../src/app/SimulationClock.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
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

const DT = 1 / 30;
const PROXY_URL = process.env.AI_PROXY_URL ?? "http://localhost:8787";
const ARGS = new Set(process.argv.slice(2));

const SCENARIOS = [
  {
    id: "S1_food_crisis",
    template: "temperate_plains",
    seed: 1337,
    durationSec: 240,
    note: "early food crisis (low farm count)",
    init(state) {
      // Push the colony into a fragile state: starve early so the env
      // director's first 1-3 decisions hit a real food crisis.
      state.resources.food = 60;
      state.resources.wood = 80;
      // Knock farm count below 3 if higher (rebuild stats reflects grid).
      if ((state.buildings?.farms ?? 0) > 2) {
        // Can't easily de-place tiles; instead drain food harder so
        // fragility = food<100 trips regardless of farm seed.
        state.resources.food = 40;
      }
    },
  },
  {
    id: "S2_raid_pressure",
    template: "rugged_highlands",
    seed: 42,
    durationSec: 240,
    note: "raid pressure mid-run",
    init(state) {
      // Raise threat so the director sees raid pressure when it ticks.
      state.gameplay = state.gameplay ?? {};
      state.gameplay.threat = 65;
      state.gameplay.prosperity = 50;
    },
  },
  {
    id: "S3_long_horizon",
    template: "archipelago_isles",
    seed: 7777,
    durationSec: 240,
    note: "stable long-horizon progression",
    init(_state) {},
  },
];

function buildState(scenario, coverage) {
  const state = createInitialGameState({ templateId: scenario.template, seed: scenario.seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = true;
  state.ai.coverageTarget = coverage; // "llm" | "fallback"
  state.buildings = rebuildBuildingStats(state.grid);
  scenario.init(state);
  return state;
}

function buildServices(seed, coverage) {
  // For the LLM run we need a non-offline client wired to the proxy.
  // For fallback we still hit createServices; coverageTarget="fallback"
  // short-circuits to buildEnvironmentFallback inside requestEnvironment.
  const offline = coverage !== "llm" || ARGS.has("--offline");
  const services = createServices(seed, {
    offlineAiFallback: offline,
    baseUrl: PROXY_URL,
    deterministic: true,
  });
  services.memoryStore = new MemoryStore();
  return services;
}

function buildSystems() {
  // EnvironmentDirector is the system under test; every OTHER director slot
  // is held at fallback (no AgentDirectorSystem, no StrategicDirector). This
  // mirrors ablation-benchmark.mjs's "fallback baseline" arm.
  return [
    new SimulationClock(),
    new ProgressionSystem(),
    new RoleAssignmentSystem(),
    new PopulationGrowthSystem(),
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
  ];
}

async function runOnce(scenario, coverage) {
  const state = buildState(scenario, coverage);
  const services = buildServices(scenario.seed, coverage);
  const systems = buildSystems();
  // Reach into the EnvironmentDirector instance so we can await its
  // in-flight `pendingPromise` between ticks; this prevents the LLM run
  // from "missing" decision slots when fetch latency exceeds the
  // wall-clock cost of advancing 18 sim seconds.
  const envDirector = systems.find((s) => s.constructor.name === "EnvironmentDirectorSystem");

  // Tracking signals
  const targetTicks = Math.round(scenario.durationSec / DT);
  let prevWeather = state.weather?.current ?? "clear";
  let weatherChanges = 0;
  const devIndexSamples = [];
  const latencies = [];
  let llmCalls = 0;
  let fallbackCalls = 0;
  let lastSeenDecisionCount = 0;

  // Yield to the event loop every ~30 ticks (≈1 sim sec) so any
  // in-flight `fetch` from EnvironmentDirector.requestEnvironment can
  // resolve and its `pendingResult` block can fire on the next tick.
  // Without this, `await fetch(...)` never settles inside a tight
  // synchronous for-loop and the decision count stays at 0.
  const YIELD_EVERY = 30;

  for (let i = 0; i < targetTicks; i += 1) {
    for (const sys of systems) sys.update(DT, state, services);

    // Weather thrash: count distinct transitions between non-equal states.
    const w = state.weather?.current ?? "clear";
    if (w !== prevWeather) {
      weatherChanges += 1;
      prevWeather = w;
    }

    // DevIndex sample (last 60 sec window via metrics.timeSec).
    if (i % Math.round(1 / DT) === 0) {
      devIndexSamples.push({
        sec: state.metrics.timeSec,
        devIndex: Number(state.gameplay?.devIndex ?? 0),
      });
    }

    // Track new env decisions for fallback-vs-llm ratio + latency.
    const dc = Number(state.ai?.environmentDecisionCount ?? 0);
    if (dc > lastSeenDecisionCount) {
      const ex = state.ai?.lastEnvironmentExchange;
      if (ex) {
        if (ex.fallback) fallbackCalls += 1; else llmCalls += 1;
        if (Number.isFinite(Number(ex.latencyMs))) latencies.push(Number(ex.latencyMs));
      }
      lastSeenDecisionCount = dc;
    }

    if (i % YIELD_EVERY === 0) {
      // Drain microtasks AND a macrotask so a settled fetch handler runs.
      // setImmediate is cheaper than setTimeout(0) in node.
      await new Promise((r) => setImmediate(r));
      // If a request is in-flight, AWAIT it so the LLM run gets a fair
      // count of decisions (proxy latency would otherwise drop most of
      // the 13 scheduled calls because the director short-circuits while
      // pendingPromise is set).
      if (envDirector?.pendingPromise) {
        try { await envDirector.pendingPromise; } catch { /* ignore */ }
      }
    }
  }

  // Need to wait for last in-flight request to settle; we tick a few extra
  // and yield each iteration so the final 1-2 directives are recorded.
  for (let extra = 0; extra < 60; extra += 1) {
    for (const sys of systems) sys.update(DT, state, services);
    if (extra % 5 === 0) {
      await new Promise((r) => setImmediate(r));
    }
    const dc = Number(state.ai?.environmentDecisionCount ?? 0);
    if (dc > lastSeenDecisionCount) {
      const ex = state.ai?.lastEnvironmentExchange;
      if (ex) {
        if (ex.fallback) fallbackCalls += 1; else llmCalls += 1;
        if (Number.isFinite(Number(ex.latencyMs))) latencies.push(Number(ex.latencyMs));
      }
      lastSeenDecisionCount = dc;
    }
  }

  // Smoothed devIndex over last 60s.
  const final = state.gameplay?.devIndex ?? 0;
  const lastSec = state.metrics.timeSec;
  const last60 = devIndexSamples.filter((s) => s.sec >= lastSec - 60);
  const smoothed60 =
    last60.length > 0 ? last60.reduce((s, x) => s + x.devIndex, 0) / last60.length : final;

  const totalCalls = llmCalls + fallbackCalls;
  const fallbackRatio = totalCalls > 0 ? fallbackCalls / totalCalls : 0;
  const avgLatencyMs = latencies.length > 0
    ? latencies.reduce((s, x) => s + x, 0) / latencies.length
    : 0;

  return {
    coverage,
    deaths: Number(state.metrics?.deathsTotal ?? 0),
    devIndexFinal: Number(final.toFixed(2)),
    devIndexSmoothed60: Number(smoothed60.toFixed(2)),
    weatherDecisionCount: Number(state.ai?.environmentDecisionCount ?? 0),
    weatherChanges,
    llmCalls,
    fallbackCalls,
    fallbackRatio: Number(fallbackRatio.toFixed(3)),
    avgLatencyMs: Number(avgLatencyMs.toFixed(1)),
    finalWeather: state.weather?.current ?? "",
    finalProsperity: Number((state.gameplay?.prosperity ?? 0).toFixed(2)),
    finalThreat: Number((state.gameplay?.threat ?? 0).toFixed(2)),
    foodFinal: Number(Number(state.resources?.food ?? 0).toFixed(2)),
  };
}

function envQualityScore(r) {
  return -r.deaths * 1.0 + r.devIndexSmoothed60 * 0.3 - r.weatherChanges * 0.5;
}

async function main() {
  const out = { startedAt: new Date().toISOString(), proxyUrl: PROXY_URL, scenarios: [] };
  console.error(`[bench] starting; proxy=${PROXY_URL}`);

  for (const scenario of SCENARIOS) {
    console.error(`[bench] ${scenario.id} (${scenario.template} seed=${scenario.seed} ${scenario.durationSec}s)`);

    // Fallback first (no network, fast)
    const fbStart = Date.now();
    const fallback = await runOnce(scenario, "fallback");
    console.error(`  fallback done in ${Date.now() - fbStart}ms — deaths=${fallback.deaths} dev60=${fallback.devIndexSmoothed60} thrash=${fallback.weatherChanges}`);

    const llmStart = Date.now();
    const llm = await runOnce(scenario, "llm");
    console.error(`  llm done in ${Date.now() - llmStart}ms — deaths=${llm.deaths} dev60=${llm.devIndexSmoothed60} thrash=${llm.weatherChanges} fallbackRatio=${llm.fallbackRatio} avgLatency=${llm.avgLatencyMs}ms`);

    const fbScore = envQualityScore(fallback);
    const llmScore = envQualityScore(llm);
    const denom = Math.abs(fbScore) > 0.0001 ? Math.abs(fbScore) : 1;
    const deltaPct = ((llmScore - fbScore) / denom) * 100;

    out.scenarios.push({
      id: scenario.id,
      template: scenario.template,
      seed: scenario.seed,
      durationSec: scenario.durationSec,
      note: scenario.note,
      fallback,
      llm,
      envQualityScore: { fallback: fbScore, llm: llmScore, deltaPct: Number(deltaPct.toFixed(2)) },
    });
  }

  // Summary
  const wins = out.scenarios.filter((s) => s.envQualityScore.deltaPct >= 5).length;
  out.summary = {
    scenarioCount: out.scenarios.length,
    llmWins5pct: wins,
    pass: wins >= 2,
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error("[bench] fatal:", err?.stack ?? err);
  process.exit(1);
});
