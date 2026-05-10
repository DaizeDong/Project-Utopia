// Validates SeedMatrix runner (W1 P0-1).
//
// Asserts: cells.length matches seeds × scenarios; bySeed structure is
// per-seed-then-aggregate; aggregatePerSeedThenAverage produces finite
// numbers; NDJSON dump round-trips.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runSeedMatrix,
  aggregatePerSeedThenAverage,
  writeNDJSON,
} from "../src/benchmark/framework/SeedMatrix.js";
import { ACADEMIC_BENCHMARK_DIMENSIONS } from "../src/benchmark/dimensions/index.js";

test("runSeedMatrix returns one cell per seed × scenario", { timeout: 180000 }, async () => {
  const result = await runSeedMatrix({
    seeds: [11, 22],
    scenarios: ["temperate_plains"],
    durationSec: 4,
    dimensionOpts: { intervalSec: 1, durationSec: 4 },
  });
  assert.equal(result.cells.length, 2, "cells.length should equal seeds×scenarios");
  for (const cell of result.cells) {
    assert.ok([11, 22].includes(cell.seed), "cell.seed unexpected");
    assert.equal(cell.scenario, "temperate_plains");
    assert.equal(typeof cell.perDimensionScores, "object");
    // Every plugin's dimension scores should be present and finite.
    for (const plugin of ACADEMIC_BENCHMARK_DIMENSIONS) {
      for (const dim of plugin.scoreDimensions) {
        assert.equal(
          Number.isFinite(cell.perDimensionScores[dim]),
          true,
          `cell.perDimensionScores.${dim} not finite for seed=${cell.seed}`,
        );
      }
    }
    assert.equal(typeof cell.wallclockMs, "number");
    assert.ok(cell.wallclockMs >= 0);
  }
});

test("runSeedMatrix bySeed groups cells by seed", { timeout: 180000 }, async () => {
  const result = await runSeedMatrix({
    seeds: [101, 202],
    scenarios: ["temperate_plains"],
    durationSec: 3,
    dimensionOpts: { intervalSec: 1, durationSec: 3 },
  });
  assert.equal(result.bySeed.length, 2);
  const seeds = result.bySeed.map((entry) => entry.seed).sort((a, b) => a - b);
  assert.deepEqual(seeds, [101, 202]);
  for (const entry of result.bySeed) {
    assert.equal(Array.isArray(entry.scenarios), true);
    assert.equal(entry.scenarios.length, 1);
    assert.equal(entry.scenarios[0].seed, entry.seed);
  }
});

test("aggregatePerSeedThenAverage returns finite grand mean and std", () => {
  const cells = [
    { seed: 1, scenario: "a", perDimensionScores: { rae_sufficiency: 0.8, rae_idle_capacity: 0.2 }, agentId: "x", aiRuntime: {}, outcome: null, wallclockMs: 0 },
    { seed: 1, scenario: "b", perDimensionScores: { rae_sufficiency: 0.6, rae_idle_capacity: 0.4 }, agentId: "x", aiRuntime: {}, outcome: null, wallclockMs: 0 },
    { seed: 2, scenario: "a", perDimensionScores: { rae_sufficiency: 0.9, rae_idle_capacity: 0.1 }, agentId: "x", aiRuntime: {}, outcome: null, wallclockMs: 0 },
    { seed: 2, scenario: "b", perDimensionScores: { rae_sufficiency: 0.7, rae_idle_capacity: 0.3 }, agentId: "x", aiRuntime: {}, outcome: null, wallclockMs: 0 },
  ];
  const agg = aggregatePerSeedThenAverage(cells, "rae_sufficiency");
  assert.equal(agg.meanPerSeed.length, 2);
  assert.ok(Number.isFinite(agg.grandMean));
  assert.ok(Number.isFinite(agg.grandStd));
  // seed=1 mean=0.7, seed=2 mean=0.8 ⇒ grand=0.75
  assert.ok(Math.abs(agg.grandMean - 0.75) < 1e-9, `grandMean off: ${agg.grandMean}`);
});

test("aggregatePerSeedThenAverage handles empty cells gracefully", () => {
  const agg = aggregatePerSeedThenAverage([], "anything");
  assert.deepEqual(agg, { meanPerSeed: [], grandMean: 0, grandStd: 0 });
});

test("writeNDJSON dumps cells and round-trips", async () => {
  const dir = mkdtempSync(join(tmpdir(), "seedmatrix-"));
  const file = join(dir, "out.ndjson");
  const cells = [
    { seed: 1, scenario: "x", perDimensionScores: { a: 0.5 }, agentId: "noop", aiRuntime: { totalCalls: 0, fallbackCalls: 0, schemaErrors: 0 }, outcome: null, wallclockMs: 1 },
    { seed: 2, scenario: "x", perDimensionScores: { a: 0.6 }, agentId: "noop", aiRuntime: { totalCalls: 0, fallbackCalls: 0, schemaErrors: 0 }, outcome: null, wallclockMs: 2 },
  ];
  await writeNDJSON(file, cells);
  const raw = readFileSync(file, "utf-8");
  const lines = raw.trim().split(/\n/);
  assert.equal(lines.length, 2);
  for (let i = 0; i < lines.length; i++) {
    const obj = JSON.parse(lines[i]);
    assert.equal(obj.seed, cells[i].seed);
    assert.equal(obj.perDimensionScores.a, cells[i].perDimensionScores.a);
  }
  rmSync(dir, { recursive: true, force: true });
});
