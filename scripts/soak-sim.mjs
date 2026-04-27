import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
import { makeSerializableSnapshot, restoreSnapshotState } from "../src/app/snapshotService.js";
import { buildLongRunTelemetry } from "../src/app/longRunTelemetry.js";
import { LONG_RUN_PROFILE } from "../src/config/longRunProfile.js";
import { evaluateRunOutcomeState } from "../src/app/runOutcome.js";

const DT_SEC = 1 / 30;
const SCENARIOS = Object.freeze([
  { templateId: "temperate_plains", seed: 1337 },
  { templateId: "fortified_basin", seed: 1337 },
  { templateId: "archipelago_isles", seed: 1337 },
]);
export const PRESETS = Object.freeze({
  default: Object.freeze({
    name: "default",
    durationSec: 90,
    sampleIntervalSec: 10,
    aiEnabled: false,
  }),
  long: Object.freeze({
    name: "long",
    durationSec: 20 * 60,
    sampleIntervalSec: 15,
    aiEnabled: false,
  }),
  "ai-on": Object.freeze({
    name: "ai-on",
    durationSec: 10 * 60,
    sampleIntervalSec: 15,
    aiEnabled: true,
    aiMode: "offline-fallback",
    aiOfflineFallback: true,
  }),
  "ecology-long": Object.freeze({
    name: "ecology-long",
    durationSec: 20 * 60,
    sampleIntervalSec: 15,
    aiEnabled: true,
    aiMode: "offline-fallback",
    aiOfflineFallback: true,
  }),
});

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const eqIndex = token.indexOf("=");
    if (eqIndex < 0) {
      args[token.slice(2)] = true;
      continue;
    }
    args[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
  }
  return args;
}

function round(value, digits = 2) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return safe;
  return Number(safe.toFixed(digits));
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

export function resolvePreset(args) {
  const presetName = String(args.preset ?? "default").trim().toLowerCase();
  const preset = PRESETS[presetName] ?? PRESETS.default;
  const durationSec = Number.isFinite(Number(args.duration)) ? Math.max(30, Number(args.duration)) : preset.durationSec;
  const sampleIntervalSec = Number.isFinite(Number(args["sample-interval-sec"]))
    ? Math.max(1, Number(args["sample-interval-sec"]))
    : preset.sampleIntervalSec;
  return {
    ...preset,
    durationSec,
    sampleIntervalSec,
  };
}

async function flushAsyncSystems() {
  await Promise.resolve();
  await Promise.resolve();
}

function createAssertionTracker() {
  return {
    threatPinnedSinceSec: null,
    resourceFlatlineSinceSec: null,
    failures: [],
  };
}

function pushFailure(tracker, kind, message, sample) {
  tracker.failures.push({
    kind,
    message,
    simTimeSec: round(sample.simTimeSec ?? 0, 2),
    phase: String(sample.phase ?? "unknown"),
  });
}

function evaluateOfflineAssertions(samples) {
  const tracker = createAssertionTracker();
  const thresholds = LONG_RUN_PROFILE.thresholds;
  const repairWindowSec = Number(LONG_RUN_PROFILE.idle.logisticsGraceSec ?? 180);

  for (const sample of samples) {
    const threat = Number(sample.gameplay?.threat ?? 0);
    const deathsTotal = Number(sample.deaths?.total ?? 0);
    const phase = String(sample.phase ?? "active");
    const simTimeSec = Number(sample.simTimeSec ?? 0);
    const food = Number(sample.resources?.food ?? 0);
    const wood = Number(sample.resources?.wood ?? 0);
    const prosperity = Number(sample.gameplay?.prosperity ?? 0);
    const objectiveProgress = Number(sample.objective?.progress ?? 0);

    if (threat >= thresholds.threatPinnedValue) {
      tracker.threatPinnedSinceSec ??= simTimeSec;
      if (
        simTimeSec - tracker.threatPinnedSinceSec > thresholds.maxThreatPinnedSec
        && deathsTotal <= 0
        && phase !== "end"
      ) {
        pushFailure(
          tracker,
          "threat_pinned",
          `Threat stayed pinned near ${thresholds.threatPinnedValue} without visible world consequences.`,
          sample,
        );
        break;
      }
    } else {
      tracker.threatPinnedSinceSec = null;
    }

    if (
      simTimeSec >= repairWindowSec
      && String(sample.logistics?.summary ?? "") === thresholds.noWarehouseAnchorMessage
    ) {
      pushFailure(
        tracker,
        "logistics_anchor",
        "Logistics still reports no warehouse anchors online after the repair window.",
        sample,
      );
      break;
    }

    const nonsenseFlatline = prosperity <= thresholds.minProsperitySoftFloor
      && food <= thresholds.minFoodSoftFloor
      && wood <= thresholds.minWoodSoftFloor
      && phase === "active";
    if (nonsenseFlatline) {
      tracker.resourceFlatlineSinceSec ??= simTimeSec;
      if (simTimeSec - tracker.resourceFlatlineSinceSec > 45) {
        pushFailure(
          tracker,
          "resource_flatline",
          objectiveProgress > 0
            ? "Prosperity, food, and wood flatlined into a nonsense state while progression still claimed forward motion."
            : "Prosperity, food, and wood flatlined into a nonsense state while the run remained active.",
          sample,
        );
        break;
      }
    } else {
      tracker.resourceFlatlineSinceSec = null;
    }
  }

  return tracker.failures;
}

function summarizeRanges(samples, accessor) {
  const values = samples
    .map(accessor)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (values.length <= 0) return { min: null, max: null };
  return {
    min: round(Math.min(...values), 2),
    max: round(Math.max(...values), 2),
  };
}

async function runScenario({ templateId, seed }, preset) {
  const state = createInitialGameState({ templateId, seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = Boolean(preset.aiEnabled);
  state.ai.coverageTarget = preset.aiEnabled ? "fallback" : "fallback";
  state.ai.runtimeProfile = "long_run";

  const memoryStore = new MemoryStore();
  const services = createServices(state.world.mapSeed, {
    offlineAiFallback: Boolean(preset.aiOfflineFallback),
  });
  services.memoryStore = memoryStore;
  const systems = buildSystems(memoryStore);
  const totalTicks = Math.max(60, Math.round(preset.durationSec / DT_SEC));
  const sampleEveryTicks = Math.max(1, Math.round(preset.sampleIntervalSec / DT_SEC));
  let maxEntities = state.agents.length + state.animals.length;
  let peakThreat = Number(state.gameplay.threat ?? 0);
  let peakProsperity = Number(state.gameplay.prosperity ?? 0);
  const samples = [];

  for (let tick = 0; tick < totalTicks; tick += 1) {
    for (const system of systems) {
      system.update(DT_SEC, state, services);
    }
    await flushAsyncSystems();
    assertFiniteMetrics(state, `${templateId}@tick${tick}`);
    const errorWarnings = compactErrorWarnings(state);
    if (errorWarnings.length > 0) {
      throw new Error(`${templateId}: system errors -> ${errorWarnings.slice(-3).join(" | ")}`);
    }
    const outcome = state.session.phase === "active" ? evaluateRunOutcomeState(state) : null;
    if (outcome) {
      state.session.phase = "end";
      state.session.outcome = outcome.outcome;
      state.session.reason = outcome.reason;
      state.session.endedAtSec = Number(state.metrics.timeSec ?? 0);
      state.controls.actionMessage = outcome.actionMessage;
      state.controls.actionKind = outcome.actionKind;
    }
    maxEntities = Math.max(maxEntities, state.agents.length + state.animals.length);
    peakThreat = Math.max(peakThreat, Number(state.gameplay.threat ?? 0));
    peakProsperity = Math.max(peakProsperity, Number(state.gameplay.prosperity ?? 0));

    if (tick === 0 || tick === totalTicks - 1 || tick % sampleEveryTicks === 0) {
      samples.push(buildLongRunTelemetry(state));
    }
    if (state.session.phase === "end") break;
  }

  for (let i = 0; i < 3; i += 1) {
    await flushAsyncSystems();
    for (const system of systems) {
      system.update(DT_SEC, state, services);
    }
  }

  const restored = restoreSnapshotState(makeSerializableSnapshot(state, services.rng.snapshot()));
  if (!(restored.ai.groupPolicies instanceof Map)) {
    throw new Error(`${templateId}: snapshot restore lost ai.groupPolicies map`);
  }
  if (!(restored.weather.hazardTileSet instanceof Set)) {
    throw new Error(`${templateId}: snapshot restore lost weather.hazardTileSet set`);
  }

  const assertionFailures = evaluateOfflineAssertions(samples);
  if (assertionFailures.length > 0) {
    const failure = assertionFailures[0];
    throw new Error(`${templateId}: ${failure.kind} -> ${failure.message}`);
  }

  const finalSample = samples.at(-1) ?? buildLongRunTelemetry(state);
  return {
    templateId,
    seed,
    preset: preset.name,
    durationSec: preset.durationSec,
    aiEnabled: Boolean(preset.aiEnabled),
    aiMode: String(preset.aiMode ?? (preset.aiEnabled ? "fallback" : "disabled")),
    tickCount: Number(state.metrics.tick ?? 0),
    maxEntities,
    peakThreat: round(peakThreat, 2),
    peakProsperity: round(peakProsperity, 2),
    prosperityRange: summarizeRanges(samples, (sample) => sample.gameplay?.prosperity),
    threatRange: summarizeRanges(samples, (sample) => sample.gameplay?.threat),
    finalPhase: String(finalSample.phase ?? "unknown"),
    deathsTotal: Number(state.metrics.deathsTotal ?? 0),
    activeEvents: (state.events.active ?? []).length,
    frontierSummary: String(state.gameplay.frontierSummary ?? ""),
    logisticsSummary: String(state.metrics.logistics?.summary ?? ""),
    warningCount: (state.metrics.warningLog ?? []).length,
    errorWarnings: compactErrorWarnings(state),
    ai: {
      enabled: Boolean(finalSample.ai?.enabled),
      requestCount: Number(finalSample.ai?.requestCount ?? 0),
      fallbackCount: Number(finalSample.ai?.fallbackCount ?? 0),
      llmCount: Number(finalSample.ai?.llmCount ?? 0),
      timeoutCount: Number(finalSample.ai?.timeoutCount ?? 0),
    },
    sampleCount: samples.length,
    samples,
  };
}

async function main() {
  const args = parseArgs();
  const preset = resolvePreset(args);
  const outPath = path.resolve(
    args.out
      ?? "docs/assignment4/metrics/soak-report.json",
  );

  const results = [];
  for (const scenario of SCENARIOS) {
    const result = await runScenario(scenario, preset);
    results.push(result);
    console.log(
      `[soak:${preset.name}] ${result.templateId} seed=${result.seed} ticks=${result.tickCount} maxEntities=${result.maxEntities} peakThreat=${result.peakThreat} deaths=${result.deathsTotal} aiRequests=${result.ai.requestCount}`,
    );
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    preset: preset.name,
    durationSec: preset.durationSec,
    sampleIntervalSec: preset.sampleIntervalSec,
    aiEnabled: Boolean(preset.aiEnabled),
    aiMode: String(preset.aiMode ?? (preset.aiEnabled ? "fallback" : "disabled")),
    scenarios: results,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Soak report written: ${outPath}`);
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
