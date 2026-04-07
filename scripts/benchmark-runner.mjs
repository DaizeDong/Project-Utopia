/**
 * Automated Benchmark Runner
 *
 * Compares AI-enabled vs fallback-only simulation across multiple scenarios
 * and seeds, producing a structured results file and a markdown summary table.
 *
 * Usage:
 *   node scripts/benchmark-runner.mjs
 *   node scripts/benchmark-runner.mjs --duration=30 --seeds=1 --scenarios=1
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { SimulationClock } from "../src/app/SimulationClock.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
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
import { buildLongRunTelemetry } from "../src/app/longRunTelemetry.js";
import { evaluateRunOutcomeState } from "../src/app/runOutcome.js";
import { computeTaskScore, computeCostMetrics } from "../src/benchmark/BenchmarkMetrics.js";
import { BENCHMARK_PRESETS, applyPreset } from "../src/benchmark/BenchmarkPresets.js";

// ── Configuration ──────────────────────────────────────────────────────

const SCENARIOS = [
  { templateId: "temperate_plains", label: "Temperate Plains" },
  { templateId: "fortified_basin", label: "Fortified Basin" },
  { templateId: "archipelago_isles", label: "Archipelago Isles" },
];

const CONDITIONS = [
  { id: "no-ai", aiEnabled: false, label: "No AI (fallback)" },
  { id: "full-ai", aiEnabled: true, label: "Full AI" },
];

const SEEDS = [42, 137, 256, 314, 500, 617, 789, 888, 951, 1024];

const DURATION_SEC = 300;
const SAMPLE_INTERVAL_SEC = 5;
const DT_SEC = 1 / 30;

// ── CLI argument parsing ───────────────────────────────────────────────

function parseArgs(argv = process.argv.slice(2)) {
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

// ── Helpers ────────────────────────────────────────────────────────────

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
  ];
}

async function flushAsyncSystems() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Compute populationStats that GameApp normally provides via #refreshLogicMetrics. */
function refreshPopulationStats(state) {
  const workers = state.agents.filter((a) => a.type === "WORKER" && a.alive !== false);
  state.metrics.populationStats = {
    workers: workers.length,
    totalEntities: state.agents.length + (state.animals?.length ?? 0),
  };
  state.metrics.deathsTotal = state.metrics.deathsTotal ?? 0;
}

// ── Single run ─────────────────────────────────────────────────────────

async function runSingle(scenario, condition, seed, durationSec, sampleIntervalSec, preset = null) {
  const state = createInitialGameState({ templateId: scenario.templateId, seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = Boolean(condition.aiEnabled);
  state.ai.coverageTarget = "fallback";
  state.ai.runtimeProfile = "long_run";
  if (preset) applyPreset(state, preset);

  const memoryStore = new MemoryStore();
  const memoryObserver = new MemoryObserver(memoryStore);
  const services = createServices(state.world.mapSeed, {
    offlineAiFallback: !condition.aiEnabled,
    baseUrl: condition.aiEnabled ? (process.env.AI_PROXY_BASE ?? "http://localhost:8787") : "",
  });
  services.memoryStore = memoryStore;
  const systems = buildSystems(memoryStore);

  const totalTicks = Math.max(60, Math.round(durationSec / DT_SEC));
  const sampleEveryTicks = Math.max(1, Math.round(sampleIntervalSec / DT_SEC));

  const timeSeries = [];
  const initialWorkers = state.agents.filter((a) => a.type === "WORKER").length;
  let finalPhase = "active";
  let survivalSec = durationSec;

  refreshPopulationStats(state);

  for (let tick = 0; tick < totalTicks; tick += 1) {
    for (const system of systems) {
      system.update(DT_SEC, state, services);
    }
    refreshPopulationStats(state);
    memoryObserver.observe(state);
    await flushAsyncSystems();

    // Check for game-ending conditions
    const outcome = state.session.phase === "active" ? evaluateRunOutcomeState(state) : null;
    if (outcome) {
      state.session.phase = "end";
      state.session.outcome = outcome.outcome;
      state.session.reason = outcome.reason;
      state.session.endedAtSec = Number(state.metrics.timeSec ?? 0);
      state.controls.actionMessage = outcome.actionMessage;
      state.controls.actionKind = outcome.actionKind;
    }

    // Collect time-series samples at the prescribed interval
    if (tick === 0 || tick === totalTicks - 1 || tick % sampleEveryTicks === 0) {
      const t = Number(state.metrics.timeSec ?? 0);
      timeSeries.push({
        t: round(t, 2),
        food: round(state.resources.food ?? 0, 2),
        wood: round(state.resources.wood ?? 0, 2),
        workers: state.agents.filter((a) => a.type === "WORKER" && a.alive !== false).length,
        prosperity: round(state.gameplay.prosperity ?? 0, 2),
        threat: round(state.gameplay.threat ?? 0, 2),
      });
    }

    if (state.session.phase === "end") {
      finalPhase = "end";
      survivalSec = Number(state.metrics.timeSec ?? 0);
      break;
    }
  }

  // Drain any remaining async work
  for (let i = 0; i < 3; i += 1) {
    await flushAsyncSystems();
    for (const system of systems) {
      system.update(DT_SEC, state, services);
    }
  }

  // Gather AI decision data from state
  const strategyCount = Number(state.ai.strategyDecisionCount ?? 0);
  const aiDecisionCount = Number(state.ai.environmentDecisionCount ?? 0) + Number(state.ai.policyDecisionCount ?? 0) + strategyCount;
  const aiLlmCount = Number(state.ai.environmentLlmCount ?? 0) + Number(state.ai.policyLlmCount ?? 0);
  const aiFallbackCount = aiDecisionCount - aiLlmCount;

  // Build synthetic decisions array for computeCostMetrics
  const decisions = [];
  for (let i = 0; i < aiLlmCount; i += 1) {
    decisions.push({ t: 0, source: "llm", tokens: 200, latencyMs: 150 });
  }
  for (let i = 0; i < Math.max(0, aiFallbackCount); i += 1) {
    decisions.push({ t: 0, source: "fallback", tokens: 0, latencyMs: 0 });
  }

  // Compute objectives completed
  const objectiveCount = Array.isArray(state.gameplay?.objectives) ? state.gameplay.objectives.length : 0;
  const objectiveIndex = Number(state.gameplay?.objectiveIndex ?? 0);
  const completedObjectives = Math.min(objectiveIndex, objectiveCount);

  const taskScore = computeTaskScore(timeSeries, {
    totalObjectives: objectiveCount,
    completedObjectives,
    survivalSec,
    maxSurvivalSec: durationSec,
    initialWorkers,
    deathsTotal: Number(state.metrics.deathsTotal ?? 0),
  });

  const gameDurationMin = survivalSec / 60;
  const costPerToken = 0.00001; // nominal cost
  const costMetrics = computeCostMetrics(decisions, gameDurationMin, costPerToken);

  const finalTelemetry = buildLongRunTelemetry(state);

  return {
    scenario: scenario.label,
    templateId: scenario.templateId,
    condition: condition.id,
    conditionLabel: condition.label,
    seed,
    durationSec,
    survivalSec: round(survivalSec, 2),
    finalPhase,
    outcome: String(state.session.outcome ?? "none"),
    reason: String(state.session.reason ?? ""),
    initialWorkers,
    deathsTotal: Number(state.metrics.deathsTotal ?? 0),
    objectiveCount,
    completedObjectives,
    taskScore,
    costMetrics,
    ai: {
      enabled: Boolean(condition.aiEnabled),
      decisionCount: aiDecisionCount,
      strategyCount,
      llmCount: aiLlmCount,
      fallbackCount: Math.max(0, aiFallbackCount),
    },
    memory: {
      observations: memoryStore.observations.length,
      reflections: memoryStore.reflections.length,
    },
    sampleCount: timeSeries.length,
    timeSeries,
    finalTelemetry,
  };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  // Allow reducing scope via CLI for smoke testing
  const scenarioLimit = Number.isFinite(Number(args.scenarios))
    ? Math.max(1, Math.min(SCENARIOS.length, Number(args.scenarios)))
    : SCENARIOS.length;
  const seedLimit = Number.isFinite(Number(args.seeds))
    ? Math.max(1, Math.min(SEEDS.length, Number(args.seeds)))
    : SEEDS.length;
  const durationSec = Number.isFinite(Number(args.duration))
    ? Math.max(10, Number(args.duration))
    : DURATION_SEC;
  const sampleIntervalSec = Number.isFinite(Number(args["sample-interval"]))
    ? Math.max(1, Number(args["sample-interval"]))
    : SAMPLE_INTERVAL_SEC;

  const usePresets = Boolean(args.presets);
  const activeScenarios = SCENARIOS.slice(0, scenarioLimit);
  const activeSeeds = SEEDS.slice(0, seedLimit);

  console.error(`Duration: ${durationSec}s per run, sample every ${sampleIntervalSec}s`);

  const results = [];
  let runIndex = 0;

  if (!usePresets) {
    const totalRuns = activeScenarios.length * CONDITIONS.length * activeSeeds.length;
    console.error(`Benchmark: ${activeScenarios.length} scenarios x ${CONDITIONS.length} conditions x ${activeSeeds.length} seeds = ${totalRuns} runs`);

    for (const scenario of activeScenarios) {
      for (const condition of CONDITIONS) {
        for (const seed of activeSeeds) {
          runIndex += 1;
          console.error(`[${runIndex}/${totalRuns}] ${scenario.label} | ${condition.label} | seed=${seed}`);

          try {
            const result = await runSingle(scenario, condition, seed, durationSec, sampleIntervalSec);
            results.push(result);
          } catch (err) {
            console.error(`  ERROR: ${err.message ?? err}`);
            results.push({
              scenario: scenario.label,
              templateId: scenario.templateId,
              condition: condition.id,
              conditionLabel: condition.label,
              seed,
              durationSec,
              error: String(err.message ?? err),
            });
          }
        }
      }
    }
  } else {
    const totalPresetRuns = BENCHMARK_PRESETS.length * CONDITIONS.length * activeSeeds.length;
    console.error(`Preset benchmark: ${BENCHMARK_PRESETS.length} presets x ${CONDITIONS.length} conditions x ${activeSeeds.length} seeds = ${totalPresetRuns} runs`);

    for (const preset of BENCHMARK_PRESETS) {
      for (const condition of CONDITIONS) {
        for (const seed of activeSeeds) {
          runIndex += 1;
          console.error(`[${runIndex}/${totalPresetRuns}] ${preset.label} | ${condition.label} | seed=${seed}`);
          try {
            const result = await runSingle(
              { templateId: preset.templateId, label: preset.label },
              condition, seed, durationSec, sampleIntervalSec, preset,
            );
            result.presetId = preset.id;
            result.presetCategory = preset.category;
            results.push(result);
          } catch (err) {
            console.error(`  ERROR: ${err.message ?? err}`);
            results.push({
              scenario: preset.label,
              templateId: preset.templateId,
              condition: condition.id,
              conditionLabel: condition.label,
              presetId: preset.id,
              presetCategory: preset.category,
              seed,
              error: String(err.message ?? err),
            });
          }
        }
      }
    }
  }

  // ── Aggregate by (scenario, condition) ─────────────────────────────

  const groups = new Map();
  for (const r of results) {
    const key = `${r.templateId}::${r.condition}`;
    if (!groups.has(key)) {
      groups.set(key, {
        scenario: r.scenario,
        condition: r.conditionLabel,
        runs: [],
      });
    }
    groups.get(key).runs.push(r);
  }

  const summaryRows = [];
  for (const [, group] of groups) {
    const valid = group.runs.filter((r) => !r.error && r.taskScore);
    const errored = group.runs.filter((r) => r.error);
    const n = valid.length;

    if (n === 0) {
      summaryRows.push({
        scenario: group.scenario,
        condition: group.condition,
        n: 0,
        t_composite: "N/A",
        t_surv: "N/A",
        avgSurvival: "N/A",
        outcomes: `${errored.length} errors`,
      });
      continue;
    }

    const meanComposite = valid.reduce((s, r) => s + r.taskScore.T_composite, 0) / n;
    const meanSurv = valid.reduce((s, r) => s + r.taskScore.T_surv, 0) / n;
    const avgSurvivalSec = valid.reduce((s, r) => s + r.survivalSec, 0) / n;

    const wins = valid.filter((r) => r.outcome === "win").length;
    const losses = valid.filter((r) => r.outcome === "loss").length;
    const active = valid.filter((r) => r.finalPhase === "active" || r.outcome === "none").length;
    const outcomeStr = [
      wins > 0 ? `${wins}W` : null,
      losses > 0 ? `${losses}L` : null,
      active > 0 ? `${active}A` : null,
      errored.length > 0 ? `${errored.length}E` : null,
    ].filter(Boolean).join("/");

    summaryRows.push({
      scenario: group.scenario,
      condition: group.condition,
      n,
      t_composite: round(meanComposite, 4),
      t_surv: round(meanSurv, 4),
      avgSurvival: round(avgSurvivalSec, 1),
      outcomes: outcomeStr,
    });
  }

  // ── Print markdown summary table ───────────────────────────────────

  const header = "| Scenario | Condition | N | T_composite (mean) | T_surv (mean) | Avg Survival | Outcomes |";
  const sep =    "| --- | --- | --- | --- | --- | --- | --- |";
  console.log("");
  console.log("## Benchmark Summary");
  console.log("");
  console.log(header);
  console.log(sep);
  for (const row of summaryRows) {
    console.log(`| ${row.scenario} | ${row.condition} | ${row.n} | ${row.t_composite} | ${row.t_surv} | ${row.avgSurvival} | ${row.outcomes} |`);
  }
  console.log("");

  // ── Write results JSON ─────────────────────────────────────────────

  const outPath = path.resolve(
    args.out ?? "docs/ai-research/benchmark-results.json",
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    config: {
      scenarios: activeScenarios.map((s) => s.label),
      conditions: CONDITIONS.map((c) => c.label),
      seeds: activeSeeds,
      durationSec,
      sampleIntervalSec,
    },
    summary: summaryRows,
    runs: results,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.error(`Results written to: ${outPath}`);
}

// ── Entry point ────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
