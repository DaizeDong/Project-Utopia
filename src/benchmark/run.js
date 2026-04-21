/**
 * Unified Benchmark Entry Point
 *
 * Runs capability probes, scenario sampling, crisis injection, and
 * scoring through the unified framework.
 *
 * Usage:
 *   node src/benchmark/run.js
 *   node src/benchmark/run.js --probes=RESOURCE_TRIAGE,ADAPTATION
 *   node src/benchmark/run.js --scenarios=20 --seeds=5
 *   node src/benchmark/run.js --template=fortified_basin
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, formatReport, writeResults } from "./framework/cli.js";
import { SimHarness, DT_SEC, round } from "./framework/SimHarness.js";
import { generateScenarios, EDGE_CASES } from "./framework/ScenarioSampler.js";
import { CrisisInjector } from "./framework/CrisisInjector.js";
import { runProbes, PROBES } from "./framework/ProbeCollector.js";
import { bayesianScore, consistencyAdjustedScore, compareGroups } from "./framework/ScoringEngine.js";
import { DecisionTracer } from "./framework/DecisionTracer.js";
import { computeTaskScore, computeCostMetrics, computeInfrastructureScore } from "./BenchmarkMetrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Capability Probes ─────────────────────────────────────────────

async function runCapabilityProbes(args) {
  const probeIds = args.probes ? args.probes.split(",") : undefined;
  const templateId = args.template || "temperate_plains";
  const seed = Number(args.seed) || 42;
  const seedCount = Number(args.seeds) || 3;

  console.log("\n═══ Capability Probes ═══");
  console.log(`Probes: ${probeIds?.join(", ") ?? "all"}`);
  console.log(`Seeds: ${seedCount}, Template: ${templateId}\n`);

  const allResults = {};
  for (let s = 0; s < seedCount; s++) {
    const currentSeed = seed + s * 137;
    console.log(`  Seed ${currentSeed}...`);
    const results = await runProbes({ probeIds, templateId, seed: currentSeed });
    for (const r of results) {
      if (!allResults[r.id]) allResults[r.id] = [];
      allResults[r.id].push(r.score);
    }
  }

  console.log("\n  Results:");
  const probeScores = {};
  for (const [id, scores] of Object.entries(allResults)) {
    const stats = bayesianScore(scores);
    probeScores[id] = stats;
    console.log(`    ${id}: ${stats.mean.toFixed(3)} [${stats.ci95[0].toFixed(3)}, ${stats.ci95[1].toFixed(3)}]`);
  }

  const allScores = Object.values(allResults).flat();
  const composite = consistencyAdjustedScore(allScores);
  console.log(`\n  Composite (consistency-adjusted): ${composite.toFixed(3)}`);

  return { probeScores, composite };
}

// ── Scenario Stress Test ──────────────────────────────────────────

async function runScenarioStressTest(args) {
  const count = Number(args.scenarios) || 10;
  const durationSec = Number(args.duration) || 120;
  const masterSeed = Number(args["master-seed"]) || 12345;

  console.log("\n═══ Scenario Stress Test ═══");
  console.log(`Scenarios: ${count}, Duration: ${durationSec}s\n`);

  const scenarios = generateScenarios(count, masterSeed);
  // Add edge cases
  for (const edge of EDGE_CASES) {
    scenarios.push({
      scenario: edge,
      preset: edge,
      difficulty: 0.9,
      bin: "edge",
    });
  }

  const results = [];
  for (const entry of scenarios) {
    const { preset, difficulty, bin } = entry;
    const templateId = preset.templateId ?? "temperate_plains";
    const seed = preset.seed ?? entry.scenario?.seed ?? 42;

    try {
      const harness = new SimHarness({
        templateId,
        seed: typeof seed === "number" ? seed : 42,
        aiEnabled: true,
        preset,
      });

      const timeSeries = [];
      const totalTicks = Math.round(durationSec / DT_SEC);
      const sampleEvery = Math.round(5 / DT_SEC);

      for (let t = 0; t < totalTicks; t++) {
        await harness.tick();
        if (t % sampleEvery === 0 || t === totalTicks - 1) {
          const s = harness.state;
          timeSeries.push({
            t: round(Number(s.metrics.timeSec ?? 0)),
            food: round(s.resources.food ?? 0),
            wood: round(s.resources.wood ?? 0),
            workers: harness.aliveWorkers.length,
            prosperity: round(s.gameplay.prosperity ?? 0),
            threat: round(s.gameplay.threat ?? 0),
          });
        }
        if (harness.state.session.phase === "end") break;
      }

      const taskScore = computeTaskScore(timeSeries, {
        totalObjectives: 3,
        completedObjectives: 0,
        survivalSec: Number(harness.state.metrics.timeSec ?? durationSec),
        maxSurvivalSec: durationSec,
        initialWorkers: harness.initialWorkers,
        deathsTotal: Number(harness.state.metrics.deathsTotal ?? 0),
      });

      results.push({
        id: preset.id ?? "unknown",
        bin,
        difficulty: round(difficulty, 3),
        T_composite: round(taskScore.T_composite, 4),
        // v0.8.0 Phase 4 — "win" outcome retired; survival = run didn't reach a loss ending.
        survived: harness.state.session.phase !== "end" || harness.state.session.outcome !== "loss",
        workers: harness.aliveWorkers.length,
      });

      const status = results[results.length - 1].survived ? "✓" : "✗";
      console.log(`  ${status} ${(preset.id ?? "?").padEnd(20)} D=${round(difficulty, 2)} T=${round(taskScore.T_composite, 3)}`);
    } catch (err) {
      console.log(`  ✗ ${(preset.id ?? "?").padEnd(20)} ERROR: ${err.message}`);
      results.push({ id: preset.id ?? "unknown", bin, difficulty, T_composite: 0, survived: false, error: err.message });
    }
  }

  // Aggregate by difficulty bin
  const binStats = {};
  for (const r of results) {
    if (!binStats[r.bin]) binStats[r.bin] = [];
    binStats[r.bin].push(r.T_composite);
  }
  console.log("\n  By difficulty bin:");
  for (const [bin, scores] of Object.entries(binStats)) {
    const stats = bayesianScore(scores);
    console.log(`    ${bin.padEnd(10)} mean=${stats.mean.toFixed(3)} CI=[${stats.ci95[0].toFixed(3)}, ${stats.ci95[1].toFixed(3)}] n=${scores.length}`);
  }

  return { results, binStats };
}

// ── Crisis Adaptation Test ────────────────────────────────────────

async function runCrisisTest(args) {
  const templateId = args.template || "temperate_plains";
  const seed = Number(args.seed) || 42;
  const durationSec = Number(args["crisis-duration"]) || 300;

  console.log("\n═══ Crisis Adaptation Test ═══");
  console.log(`Template: ${templateId}, Seed: ${seed}, Duration: ${durationSec}s\n`);

  const harness = new SimHarness({
    templateId,
    seed,
    aiEnabled: true,
    preset: { id: "crisis_test", resources: { food: 60, wood: 50 }, category: "test" },
  });

  const injector = new CrisisInjector({ steadyStateThreshold: 60 });
  const totalTicks = Math.round(durationSec / DT_SEC);

  for (let t = 0; t < totalTicks; t++) {
    await harness.tick();
    injector.update(harness.state, t);
    if (harness.state.session.phase === "end") break;
  }

  const results = injector.getResults();
  const adaptationScore = injector.getAdaptationScore();

  console.log(`  Injections: ${results.length}`);
  for (const r of results) {
    console.log(`    ${r.type.padEnd(18)} det=${r.scores.detectionScore.toFixed(2)} rec=${r.scores.recoveryScore.toFixed(2)} res=${r.scores.resilienceScore.toFixed(2)} → ${r.scores.composite.toFixed(3)}`);
  }
  console.log(`\n  Adaptation Score: ${adaptationScore.toFixed(3)}`);

  return { results, adaptationScore };
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const startTime = Date.now();

  console.log("╔════════════════════════════════════════╗");
  console.log("║   Unified Benchmark Framework v1.0     ║");
  console.log("╚════════════════════════════════════════╝");

  const report = { meta: { date: new Date().toISOString() }, sections: {} };

  // Run all sections (or specific ones via --only=probes,scenarios,crisis)
  const only = args.only ? args.only.split(",") : ["probes", "scenarios", "crisis"];

  if (only.includes("probes")) {
    report.sections.probes = await runCapabilityProbes(args);
  }
  if (only.includes("scenarios")) {
    report.sections.scenarios = await runScenarioStressTest(args);
  }
  if (only.includes("crisis")) {
    report.sections.crisis = await runCrisisTest(args);
  }

  report.meta.wallTimeMin = round((Date.now() - startTime) / 60000, 2);
  console.log(`\nTotal time: ${report.meta.wallTimeMin} min`);

  // Write results
  const outDir = path.join(__dirname, "../../results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `benchmark-${Date.now()}.json`);
  writeResults(outPath, report);
  console.log(`Results: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
