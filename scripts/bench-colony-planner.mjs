#!/usr/bin/env node
/**
 * Colony Planner LLM-vs-Fallback Bench
 *
 * Runs 4 stress scenarios twice each — once with AgentDirectorSystem (LLM)
 * and once with ColonyDirectorSystem (rule-based fallback) — and reports a
 * composite "planner quality score" so we can prove the LLM beats the
 * fallback after prompt tuning.
 *
 * Reuses the runSim pattern from scripts/ablation-benchmark.mjs.
 *
 * Usage:
 *   node scripts/bench-colony-planner.mjs [--scenarios=S1,S2,S3,S4]
 *
 * Environment:
 *   OPENAI_API_KEY  — required for LLM run; if missing the LLM column is empty
 *   OPENAI_MODEL    — optional, default "gpt-4o-mini"
 */

import process from "node:process";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { AgentDirectorSystem } from "../src/simulation/ai/colony/AgentDirectorSystem.js";
import { ColonyDirectorSystem } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

import { SimulationClock } from "../src/app/SimulationClock.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { DevIndexSystem } from "../src/simulation/meta/DevIndexSystem.js";
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

import { loadEnvIntoProcess } from "./env-loader.mjs";

const DT_SEC = 1 / 30;
// Yield to the event loop every YIELD_TICKS ticks of sim so async LLM
// promises (fetch -> JSON.parse) resolve before the next batch advances.
// 6 ticks ≈ 0.2 sim seconds; on a 600s run that's 3000 yields. Each yield
// is a setImmediate (≈ 10us in Node) so total wallclock overhead is ~30ms.
const YIELD_TICKS = 6;

// ── Scenarios (S1..S4) ──────────────────────────────────────────────

const SCENARIOS = [
  { id: "S1", templateId: "temperate_plains",  seed: 1337, durationSec: 300 },
  { id: "S2", templateId: "temperate_plains",  seed: 42,   durationSec: 300 },
  { id: "S3", templateId: "rugged_highlands",  seed: 7777, durationSec: 300 },
  { id: "S4", templateId: "temperate_plains",  seed: 1337, durationSec: 600 },
];

// ── Helpers (mirror ablation-benchmark.mjs) ─────────────────────────

function initState(templateId, seed, { llm }) {
  const state = createInitialGameState({ templateId, seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = true;
  // For LLM runs we MUST NOT set coverageTarget="fallback" — that path
  // forces selectMode → "algorithmic" and the planner never runs.
  state.ai.coverageTarget = llm ? "llm" : "fallback";
  state.buildings = rebuildBuildingStats(state.grid);
  return state;
}

function buildSystems(memoryStore, directorSystem) {
  return [
    new SimulationClock(), new ProgressionSystem(), new DevIndexSystem(),
    new RoleAssignmentSystem(),
    new PopulationGrowthSystem(), new StrategicDirector(memoryStore),
    new EnvironmentDirectorSystem(), new WeatherSystem(), new WorldEventSystem(),
    new TileStateSystem(), new NPCBrainSystem(), new WorkerAISystem(),
    new VisitorAISystem(), new AnimalAISystem(), new MortalitySystem(),
    new WildlifePopulationSystem(), new BoidsSystem(), new ResourceSystem(),
    new ProcessingSystem(), directorSystem,
  ];
}

async function advanceSimAsync(state, systems, services, targetSec) {
  const targetTicks = Math.round(targetSec / DT_SEC);
  const currentTicks = Math.round((state.metrics?.timeSec ?? 0) / DT_SEC);
  const devSamples = []; // {timeSec, devIndex}
  for (let i = currentTicks; i < targetTicks; i++) {
    for (const sys of systems) sys.update(DT_SEC, state, services);
    if (i % 30 === 0) {
      devSamples.push({
        timeSec: state.metrics?.timeSec ?? 0,
        devIndex: Number(state.gameplay?.devIndex ?? 0),
      });
    }
    if (i % YIELD_TICKS === 0) {
      // Yield: lets in-flight fetch promises resolve so LLM plans land.
      await new Promise((r) => setImmediate(r));
    }
  }
  return devSamples;
}

function totalBuildings(state) {
  return Object.values(state.buildings ?? {}).reduce((s, v) => s + v, 0);
}

function smoothedDevIndex(samples, lastSec) {
  const cutoff = Math.max(0, lastSec - 60);
  const window = samples.filter((s) => s.timeSec >= cutoff);
  if (window.length === 0) return Number(samples.at(-1)?.devIndex ?? 0);
  return window.reduce((a, s) => a + s.devIndex, 0) / window.length;
}

async function runSim(scenario, mode, opts) {
  const llm = mode === "llm";
  const mem = new MemoryStore();
  // offlineAiFallback so the offline llmClient does NOT proxy /api/ai/plan;
  // when AgentDirectorSystem has its own apiKey it goes via direct callLLM.
  const services = createServices(scenario.seed, { offlineAiFallback: true });
  services.memoryStore = mem;

  let director;
  if (llm) {
    director = new AgentDirectorSystem(mem, {
      apiKey: opts.apiKey,
      model: opts.model,
      baseUrl: opts.baseUrl,
    });
  } else {
    // Pure rule-based fallback (NOT the AgentDirector wrapper). This is the
    // standalone ColonyDirectorSystem path — the same code AgentDirector
    // delegates to in algorithmic mode.
    director = new ColonyDirectorSystem();
  }

  const state = initState(scenario.templateId, scenario.seed, { llm });
  const systems = buildSystems(mem, director);
  const startedAt = performance.now();
  const devSamples = await advanceSimAsync(state, systems, services, scenario.durationSec);
  const wallMs = performance.now() - startedAt;
  state.buildings = rebuildBuildingStats(state.grid);

  const finalDev = Number(state.gameplay?.devIndex ?? 0);
  const smoothedDev = smoothedDevIndex(devSamples, scenario.durationSec);
  const ad = state.ai?.agentDirector ?? null;
  const stats = ad?.stats ?? null;
  const plansGenerated = Number(stats?.plansGenerated ?? 0);
  const plansCompleted = Number(stats?.plansCompleted ?? 0);
  const plansFailed = Number(stats?.plansFailed ?? 0);
  const plansSuperseded = Number(stats?.plansSuperseded ?? 0);
  const completionRate = plansGenerated > 0 ? plansCompleted / plansGenerated : 0;
  const buildings = totalBuildings(state);
  const deaths = Number(state.metrics?.deathsTotal ?? 0);
  const totalEntities = Number(state.metrics?.populationStats?.totalEntities ?? 0);

  // Composite "planner quality score":
  //   devIndex * 0.4 + buildings * 0.05 - deaths * 0.5 + completionBonus
  // completionBonus is only for LLM runs (fallback has no completion stats).
  const completionBonus = llm ? completionRate * 5 : 0;
  const score = finalDev * 0.4 + buildings * 0.05 - deaths * 0.5 + completionBonus;

  return {
    mode,
    scenario: scenario.id,
    finalDev: Number(finalDev.toFixed(2)),
    smoothedDev: Number(smoothedDev.toFixed(2)),
    deaths,
    totalEntities,
    buildings,
    plansGenerated,
    plansCompleted,
    plansFailed,
    plansSuperseded,
    completionRate: Number(completionRate.toFixed(3)),
    score: Number(score.toFixed(2)),
    wallSec: Number((wallMs / 1000).toFixed(1)),
  };
}

// ── Main ────────────────────────────────────────────────────────────

function parseArgs() {
  const args = {};
  for (const tok of process.argv.slice(2)) {
    if (!tok.startsWith("--")) continue;
    const eq = tok.indexOf("=");
    if (eq < 0) { args[tok.slice(2)] = true; continue; }
    args[tok.slice(2, eq)] = tok.slice(eq + 1);
  }
  return args;
}

function fmtRow(label, r) {
  if (!r) return `  ${label.padEnd(8)} —`;
  const pct = (r.completionRate * 100).toFixed(0).padStart(3);
  return `  ${label.padEnd(8)} dev=${String(r.finalDev).padStart(5)} smoothDev=${String(r.smoothedDev).padStart(5)} `
       + `bld=${String(r.buildings).padStart(3)} deaths=${String(r.deaths).padStart(3)} `
       + `gen=${String(r.plansGenerated).padStart(3)} cmp=${String(r.plansCompleted).padStart(3)} `
       + `fl=${String(r.plansFailed).padStart(3)} cmpRate=${pct}% score=${String(r.score).padStart(6)} `
       + `(wall=${r.wallSec}s)`;
}

async function main() {
  loadEnvIntoProcess();
  const args = parseArgs();
  const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  const model = String(process.env.OPENAI_MODEL ?? "gpt-4o-mini").trim();
  const baseUrl = String(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").trim();
  const wantLLM = !!apiKey;

  const scenarioFilter = String(args.scenarios ?? "").split(",").filter(Boolean);
  const scenarios = scenarioFilter.length > 0
    ? SCENARIOS.filter((s) => scenarioFilter.includes(s.id))
    : SCENARIOS;

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  Colony Planner LLM-vs-Fallback Bench                     ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`  Scenarios: ${scenarios.map((s) => s.id).join(", ")}`);
  console.log(`  LLM enabled: ${wantLLM ? `yes (${model})` : "no — set OPENAI_API_KEY"}`);

  const summary = [];
  for (const sc of scenarios) {
    console.log(`\n── ${sc.id}: ${sc.templateId} seed=${sc.seed} ${sc.durationSec}s ──`);
    const fb = await runSim(sc, "fallback", {});
    console.log(fmtRow("FB:", fb));
    let llm = null;
    if (wantLLM) {
      llm = await runSim(sc, "llm", { apiKey, model, baseUrl });
      console.log(fmtRow("LLM:", llm));
    }
    const delta = llm ? Number(((llm.score - fb.score) / Math.max(0.01, Math.abs(fb.score)) * 100).toFixed(1)) : null;
    summary.push({ id: sc.id, fb, llm, delta });
    if (llm) {
      const sign = delta >= 0 ? "+" : "";
      console.log(`  Δ score: ${sign}${delta}%   completionRate=${(llm.completionRate * 100).toFixed(0)}%`);
    }
  }

  // ── Verdict ────────────────────────────────────────────────────────
  console.log("\n═════════════════ Summary ═════════════════");
  console.log("Scen  FBscore  LLMscore  Δ%        cmpRate");
  for (const r of summary) {
    const fb = String(r.fb.score).padStart(7);
    const ll = r.llm ? String(r.llm.score).padStart(8) : "    —   ";
    const dl = r.delta == null ? "  —  " : `${r.delta >= 0 ? "+" : ""}${r.delta}%`.padStart(7);
    const cr = r.llm ? `${(r.llm.completionRate * 100).toFixed(0)}%` : "—";
    console.log(`${r.id.padEnd(4)}  ${fb}  ${ll}  ${dl}    ${cr}`);
  }

  if (wantLLM) {
    const beats = summary.filter((r) => r.llm && r.delta >= 10).length;
    const halfCmpRate = summary.filter((r) => r.llm && r.llm.completionRate >= 0.5).length;
    const verdict = beats >= 3 && halfCmpRate >= 2 ? "PASS" : "FAIL";
    console.log(`\n  Pass criteria: ≥3 scenarios with ≥10% delta AND ≥2 with cmpRate ≥0.5`);
    console.log(`  Result: ${beats}/${summary.length} scenarios beat fallback by ≥10%`);
    console.log(`          ${halfCmpRate}/${summary.length} scenarios with cmpRate ≥0.5`);
    console.log(`  ${verdict}`);
    process.exit(verdict === "PASS" ? 0 : 1);
  } else {
    console.log("\n  Skipped LLM column (no OPENAI_API_KEY).");
  }
}

main().catch((err) => {
  console.error("[bench-colony-planner] FAIL — unexpected error");
  console.error(String(err?.stack ?? err?.message ?? err));
  process.exit(1);
});
