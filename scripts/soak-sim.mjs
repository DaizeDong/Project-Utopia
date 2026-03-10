import fs from "node:fs";
import path from "node:path";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { SimulationClock } from "../src/app/SimulationClock.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { EnvironmentDirectorSystem } from "../src/simulation/ai/director/EnvironmentDirectorSystem.js";
import { WeatherSystem } from "../src/world/weather/WeatherSystem.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { NPCBrainSystem } from "../src/simulation/ai/brains/NPCBrainSystem.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { VisitorAISystem } from "../src/simulation/npc/VisitorAISystem.js";
import { AnimalAISystem } from "../src/simulation/npc/AnimalAISystem.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";
import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";
import { makeSerializableSnapshot, restoreSnapshotState } from "../src/app/snapshotService.js";

const OUT_ARG = process.argv.find((arg) => arg.startsWith("--out="));
const outPath = OUT_ARG
  ? OUT_ARG.slice("--out=".length)
  : path.resolve("docs/assignment4/metrics/soak-report.json");

const durationArg = process.argv.find((arg) => arg.startsWith("--duration="));
const durationSec = durationArg ? Number(durationArg.slice("--duration=".length)) : 90;
const dt = 1 / 30;
const totalTicks = Math.max(60, Math.round(durationSec / dt));
const scenarios = [
  { templateId: "temperate_plains", seed: 1337 },
  { templateId: "fortified_basin", seed: 1337 },
  { templateId: "archipelago_isles", seed: 1337 },
];

function buildSystems() {
  return [
    new SimulationClock(),
    new ProgressionSystem(),
    new RoleAssignmentSystem(),
    new EnvironmentDirectorSystem(),
    new WeatherSystem(),
    new WorldEventSystem(),
    new NPCBrainSystem(),
    new WorkerAISystem(),
    new VisitorAISystem(),
    new AnimalAISystem(),
    new MortalitySystem(),
    new BoidsSystem(),
    new ResourceSystem(),
  ];
}

function compactErrorWarnings(state) {
  return (state.metrics.warningLog ?? [])
    .filter((entry) => String(entry.level ?? "").toLowerCase() === "error")
    .map((entry) => String(entry.message ?? "").trim())
    .filter(Boolean);
}

function assertFiniteMetrics(state, label) {
  const finiteChecks = [
    ["resources.food", state.resources.food],
    ["resources.wood", state.resources.wood],
    ["metrics.timeSec", state.metrics.timeSec],
    ["metrics.tick", state.metrics.tick],
    ["gameplay.prosperity", state.gameplay.prosperity],
    ["gameplay.threat", state.gameplay.threat],
  ];
  for (const [key, value] of finiteChecks) {
    if (!Number.isFinite(Number(value))) {
      throw new Error(`${label}: non-finite ${key}`);
    }
  }
}

async function flushAsyncSystems() {
  await Promise.resolve();
  await Promise.resolve();
}

async function runScenario({ templateId, seed }) {
  const state = createInitialGameState({ templateId, seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.ai.enabled = false;
  const services = createServices(state.world.mapSeed);
  const systems = buildSystems();
  let maxEntities = state.agents.length + state.animals.length;
  let peakThreat = Number(state.gameplay.threat ?? 0);
  let peakProsperity = Number(state.gameplay.prosperity ?? 0);

  for (let tick = 0; tick < totalTicks; tick += 1) {
    for (const system of systems) {
      system.update(dt, state, services);
    }
    await flushAsyncSystems();
    assertFiniteMetrics(state, `${templateId}@tick${tick}`);
    const errorWarnings = compactErrorWarnings(state);
    if (errorWarnings.length > 0) {
      throw new Error(`${templateId}: system errors -> ${errorWarnings.slice(-3).join(" | ")}`);
    }
    maxEntities = Math.max(maxEntities, state.agents.length + state.animals.length);
    peakThreat = Math.max(peakThreat, Number(state.gameplay.threat ?? 0));
    peakProsperity = Math.max(peakProsperity, Number(state.gameplay.prosperity ?? 0));
  }

  for (let i = 0; i < 3; i += 1) {
    await flushAsyncSystems();
    for (const system of systems) {
      system.update(dt, state, services);
    }
  }

  const restored = restoreSnapshotState(makeSerializableSnapshot(state, services.rng.snapshot()));
  if (!(restored.ai.groupPolicies instanceof Map)) {
    throw new Error(`${templateId}: snapshot restore lost ai.groupPolicies map`);
  }
  if (!(restored.weather.hazardTileSet instanceof Set)) {
    throw new Error(`${templateId}: snapshot restore lost weather.hazardTileSet set`);
  }

  return {
    templateId,
    seed,
    durationSec,
    tickCount: Number(state.metrics.tick ?? 0),
    maxEntities,
    peakThreat: Number(peakThreat.toFixed(2)),
    peakProsperity: Number(peakProsperity.toFixed(2)),
    deathsTotal: Number(state.metrics.deathsTotal ?? 0),
    activeEvents: (state.events.active ?? []).length,
    frontierSummary: String(state.gameplay.frontierSummary ?? ""),
    logisticsSummary: String(state.metrics.logistics?.summary ?? ""),
    warningCount: (state.metrics.warningLog ?? []).length,
    errorWarnings: compactErrorWarnings(state),
  };
}

async function main() {
  const results = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario);
    results.push(result);
    console.log(
      `[soak] ${result.templateId} seed=${result.seed} ticks=${result.tickCount} maxEntities=${result.maxEntities} peakThreat=${result.peakThreat} deaths=${result.deathsTotal}`,
    );
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    durationSec,
    scenarios: results,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Soak report written: ${outPath}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
