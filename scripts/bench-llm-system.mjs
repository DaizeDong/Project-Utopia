#!/usr/bin/env node
/**
 * System-level A/B benchmark — all 4 LLM directors ON vs all fallback.
 *
 * Aggregates the per-director tuning work (Environment + Strategic +
 * NPC Brain + Colony Planner) and answers a single question:
 *
 *   Does the colony do better when ALL directors run LLM, end-to-end,
 *   versus when ALL directors run their algorithmic fallback?
 *
 * Captures composite outcome metrics: devIndex, deathsTotal,
 * totalEntities, totalBuildings, plansCompleted (LLM only).
 *
 * Usage: node scripts/bench-llm-system.mjs [--duration=240] [--seeds=1337,42]
 */
import process from "node:process";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

import { SimulationClock } from "../src/app/SimulationClock.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { DevIndexSystem } from "../src/simulation/meta/DevIndexSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { PopulationGrowthSystem } from "../src/simulation/population/PopulationGrowthSystem.js";
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
import { AgentDirectorSystem } from "../src/simulation/ai/colony/AgentDirectorSystem.js";

import { loadEnvIntoProcess } from "./env-loader.mjs";

const DT_SEC = 1 / 30;

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = String(a).match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const DURATION_SEC = Number(args.duration ?? 240);
const SEEDS = String(args.seeds ?? "1337,42").split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
const TEMPLATES = String(args.templates ?? "temperate_plains").split(",").map((s) => s.trim());

function initState(templateId, seed, coverageTarget) {
  const state = createInitialGameState({ templateId, seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = true;
  state.ai.coverageTarget = coverageTarget;
  state.buildings = rebuildBuildingStats(state.grid);
  return state;
}

function buildSystems(memoryStore) {
  return [
    new SimulationClock(), new ProgressionSystem(), new DevIndexSystem(),
    new RoleAssignmentSystem(),
    new PopulationGrowthSystem(), new StrategicDirector(memoryStore),
    new EnvironmentDirectorSystem(), new WeatherSystem(), new WorldEventSystem(),
    new TileStateSystem(), new NPCBrainSystem(), new WorkerAISystem(),
    new VisitorAISystem(), new AnimalAISystem(), new MortalitySystem(),
    new WildlifePopulationSystem(), new BoidsSystem(), new ResourceSystem(),
    new ProcessingSystem(),
    new AgentDirectorSystem(memoryStore),
  ];
}

async function runOnce(templateId, seed, coverageTarget, durationSec) {
  const memoryStore = new MemoryStore();
  // For LLM mode we use the real LLMClient (creates services WITHOUT offline fallback);
  // for fallback mode the offlineAiFallback wraps the LLMClient so requests resolve
  // to fallbacks immediately (no network).
  const services = createServices(seed, {
    offlineAiFallback: coverageTarget !== "llm",
    baseUrl: process.env.AI_PROXY_BASE_URL ?? "http://localhost:8787",
  });
  services.memoryStore = memoryStore;
  const state = initState(templateId, seed, coverageTarget);
  const systems = buildSystems(memoryStore);

  const targetTicks = Math.round(durationSec / DT_SEC);
  // Throttle to leave wallclock for fetch promises to resolve. Too tight and
  // LLM responses (1-3s wallclock per call) miss their decision window; too
  // slack and the bench drags. ~5ms/tick → 30 ticks/s sim at ~6-7x throttle.
  const TICK_WALLCLOCK_MS = coverageTarget === "llm" ? 5 : 0;
  for (let tick = 0; tick < targetTicks; tick++) {
    for (const sys of systems) sys.update(DT_SEC, state, services);
    if (TICK_WALLCLOCK_MS > 0) {
      await new Promise((r) => setTimeout(r, TICK_WALLCLOCK_MS));
    } else if (tick % 30 === 0) {
      await new Promise((r) => setImmediate(r));
    }
  }

  const buildings = Object.values(state.buildings ?? {}).reduce((s, v) => s + v, 0);
  const entities = (state.agents ?? []).filter((a) => a.alive !== false).length
    + (state.animals ?? []).filter((a) => a.alive !== false).length;
  const ad = state.ai?.agentDirector?.stats ?? {};
  return {
    coverageTarget,
    template: templateId,
    seed,
    durationSec,
    devIndex: Number(state.gameplay?.devIndex ?? 0).toFixed(2),
    devIndexSmoothed: Number(state.gameplay?.devIndexSmoothed ?? 0).toFixed(2),
    deathsTotal: Number(state.metrics?.deathsTotal ?? 0),
    entitiesAlive: entities,
    totalBuildings: buildings,
    food: Number(state.resources?.food ?? 0).toFixed(0),
    wood: Number(state.resources?.wood ?? 0).toFixed(0),
    stone: Number(state.resources?.stone ?? 0).toFixed(0),
    plansGenerated: Number(ad.plansGenerated ?? 0),
    plansCompleted: Number(ad.plansCompleted ?? 0),
    plansFailed: Number(ad.plansFailed ?? 0),
    envLLMCount: Number(state.ai?.environmentLlmCount ?? 0),
    envDecisions: Number(state.ai?.environmentDecisionCount ?? 0),
    policyLLMCount: Number(state.ai?.policyLlmCount ?? 0),
    policyDecisions: Number(state.ai?.policyDecisionCount ?? 0),
    strategyDecisions: Number(state.ai?.strategyDecisionCount ?? 0),
  };
}

function compositeScore(r) {
  // Simple weighted composite:
  //   devIndex (development) + entitiesAlive (survival) - deaths (cost)
  const dev = Number(r.devIndexSmoothed) || 0;
  return dev * 0.5 + r.entitiesAlive * 0.4 - r.deathsTotal * 0.6 + r.totalBuildings * 0.05;
}

function fmtPct(llm, fb) {
  if (fb === 0) return llm > 0 ? "+inf%" : "0%";
  const d = ((llm - fb) / Math.abs(fb)) * 100;
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}

async function main() {
  loadEnvIntoProcess();
  console.log(`[bench:system] duration=${DURATION_SEC}s seeds=${SEEDS.join(",")} templates=${TEMPLATES.join(",")}`);
  if (!String(process.env.OPENAI_API_KEY ?? "").trim()) {
    console.error("[bench:system] OPENAI_API_KEY missing in env");
    process.exit(1);
  }

  const results = [];
  for (const template of TEMPLATES) {
    for (const seed of SEEDS) {
      console.log(`\n— scenario ${template} seed=${seed} ${DURATION_SEC}s —`);
      const fbStart = Date.now();
      const fb = await runOnce(template, seed, "fallback", DURATION_SEC);
      console.log(`  fallback: dev=${fb.devIndexSmoothed} deaths=${fb.deathsTotal} alive=${fb.entitiesAlive} buildings=${fb.totalBuildings}  (${((Date.now() - fbStart) / 1000).toFixed(1)}s)`);
      const llmStart = Date.now();
      const llm = await runOnce(template, seed, "llm", DURATION_SEC);
      console.log(`  LLM:      dev=${llm.devIndexSmoothed} deaths=${llm.deathsTotal} alive=${llm.entitiesAlive} buildings=${llm.totalBuildings} plans=${llm.plansCompleted}/${llm.plansGenerated} envLLM=${llm.envLLMCount}/${llm.envDecisions} polLLM=${llm.policyLLMCount}/${llm.policyDecisions}  (${((Date.now() - llmStart) / 1000).toFixed(1)}s)`);

      const fbScore = compositeScore(fb);
      const llmScore = compositeScore(llm);
      const verdict = llmScore >= fbScore ? "LLM_WIN" : "LLM_LOSS";
      console.log(`  composite: fb=${fbScore.toFixed(2)} llm=${llmScore.toFixed(2)} Δ=${fmtPct(llmScore, fbScore)}  → ${verdict}`);
      results.push({ template, seed, fb, llm, fbScore, llmScore, verdict, deltaPct: ((llmScore - fbScore) / Math.abs(fbScore || 1)) * 100 });
    }
  }

  const wins = results.filter((r) => r.verdict === "LLM_WIN").length;
  console.log("\n[bench:system] summary:");
  console.log(`  scenarios: ${results.length}`);
  console.log(`  LLM wins:  ${wins}/${results.length}`);
  for (const r of results) {
    console.log(`    ${r.template} seed=${r.seed}: ${r.verdict} (Δ=${r.deltaPct >= 0 ? "+" : ""}${r.deltaPct.toFixed(1)}%, dev ${r.fb.devIndexSmoothed}→${r.llm.devIndexSmoothed}, deaths ${r.fb.deathsTotal}→${r.llm.deathsTotal}, alive ${r.fb.entitiesAlive}→${r.llm.entitiesAlive})`);
  }
  console.log("\n[bench:system] full results JSON:");
  console.log(JSON.stringify(results, null, 2));

  process.exit(wins >= results.length / 2 ? 0 : 1);
}

main().catch((err) => {
  console.error("[bench:system] error:", err?.stack ?? err?.message ?? err);
  process.exit(1);
});
