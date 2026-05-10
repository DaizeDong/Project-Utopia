// Validates scripts/benchmark-paper.mjs (V6.1) — paper-run entrypoint.
//
// We import the driver as a module (its CLI block guards on isMain) and
// drive `runPaperExperiment` with a minimal 1-seed × 1-scenario × FB-cell
// config to keep the test fast. Asserts NDJSON shape + parser correctness.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseDriverArgs,
  parseSeedToken,
  buildAgentConfigForCell,
  runPaperExperiment,
  writeNDJSONRows,
  PAPER_EXPERIMENTS,
} from "../scripts/benchmark-paper.mjs";
import { DIMENSION_NORMALIZERS } from "../src/benchmark/framework/DimensionNormalizer.js";

// ── arg parsing ───────────────────────────────────────────────────────

test("parseSeedToken handles decimal, hex, negative", () => {
  assert.equal(parseSeedToken("42"), 42);
  assert.equal(parseSeedToken("0xC0FFEE"), 0xC0FFEE);
  assert.equal(parseSeedToken("0xbeef"), 0xBEEF);
  assert.equal(parseSeedToken("-7"), -7);
  // empty / non-numeric → NaN
  assert.ok(Number.isNaN(parseSeedToken("")));
  assert.ok(Number.isNaN(parseSeedToken("xyz")));
});

test("parseDriverArgs requires --experiment and uses defaults for the rest", () => {
  const cfg = parseDriverArgs(["--experiment", "E1"]);
  assert.equal(cfg.experiment, "E1");
  assert.deepEqual(cfg.cells, PAPER_EXPERIMENTS.E1.defaultCells);
  assert.ok(cfg.scenarios.length > 0);
  assert.ok(cfg.seeds.length > 0);
  assert.ok(cfg.durationSec > 0);
  assert.equal(cfg.concurrency, 1);
  assert.equal(typeof cfg.out, "string");
});

test("parseDriverArgs throws on missing / unknown experiment", () => {
  assert.throws(() => parseDriverArgs([]), /experiment is required/);
  assert.throws(() => parseDriverArgs(["--experiment", "Z9"]), /experiment is required|one of/);
});

test("parseDriverArgs throws on unknown cell label", () => {
  assert.throws(
    () => parseDriverArgs(["--experiment", "E1", "--cells", "NOT_A_CELL"]),
    /unknown cell label/,
  );
});

test("parseDriverArgs accepts custom seeds + scenarios + cells + duration", () => {
  const cfg = parseDriverArgs([
    "--experiment", "E1",
    "--scenarios", "temperate_plains",
    "--seeds", "0xC0FFEE,123",
    "--cells", "FB",
    "--duration-sec", "5",
    "--out", "/tmp/test.ndjson",
    "--concurrency", "2",
  ]);
  assert.deepEqual(cfg.scenarios, ["temperate_plains"]);
  assert.deepEqual(cfg.seeds, [0xC0FFEE, 123]);
  assert.deepEqual(cfg.cells, ["FB"]);
  assert.equal(cfg.durationSec, 5);
  assert.equal(cfg.out, "/tmp/test.ndjson");
  assert.equal(cfg.concurrency, 2);
});

// ── adapter wiring ───────────────────────────────────────────────────

test("buildAgentConfigForCell produces a MultiBackendAdapter for any registered cell", () => {
  const cfg = buildAgentConfigForCell("FB");
  assert.equal(typeof cfg.adapterClass, "function");
  // Must instantiate without throwing and produce something with .request().
  const adapter = new cfg.adapterClass(cfg.adapterOpts);
  assert.equal(typeof adapter.request, "function");
});

// ── E1 smoke run on FB cell ─────────────────────────────────────────

test("runPaperExperiment(E1, FB, 1 seed × 1 scenario) emits NDJSON rows for every dim", { timeout: 240000 }, async () => {
  const cfg = {
    experiment: "E1",
    scenarios: ["temperate_plains"],
    seeds: [42],
    cells: ["FB"],
    durationSec: 4,
    out: "ignored",
    concurrency: 1,
  };
  const rows = await runPaperExperiment(cfg);
  assert.ok(rows.length > 0, "expected at least one NDJSON row");

  // Every row carries the canonical schema fields.
  for (const row of rows) {
    assert.equal(row.experiment, "E1");
    assert.equal(row.cellId, "FB");
    assert.equal(row.scenario, "temperate_plains");
    assert.equal(row.seed, 42);
    assert.ok(typeof row.dim === "string" && row.dim.length > 0);
    // raw can be 0 (NoopAgentAdapter run) but must be defined and finite.
    assert.equal(typeof row.raw, "number");
    assert.ok(Number.isFinite(row.raw), `raw not finite for dim=${row.dim}`);
    // normalized must be in [0,1].
    assert.ok(Number.isFinite(row.normalized), `normalized not finite for dim=${row.dim}`);
    assert.ok(row.normalized >= 0 && row.normalized <= 1, `normalized out of range for dim=${row.dim}: ${row.normalized}`);
    // bayesian fields
    assert.ok(Number.isFinite(row.bayesianMean));
    assert.ok(Array.isArray(row.bayesianCi95) && row.bayesianCi95.length === 2);
    // sandwichNorm: agent ≈ fallback ≈ oracle in this degenerate case → either
    // a finite number (often 0 or the binary above-baseline branch) or NaN
    // when oracle == fallback. Both are valid here; just assert presence.
    assert.ok("sandwichNorm" in row, "row missing sandwichNorm");
  }

  // Every registered dim should appear at least once.
  const dimsSeen = new Set(rows.map((r) => r.dim));
  for (const dim of Object.keys(DIMENSION_NORMALIZERS)) {
    assert.ok(dimsSeen.has(dim), `expected at least one row for dim=${dim}`);
  }

  // Round-trip through writeNDJSONRows.
  const dir = mkdtempSync(join(tmpdir(), "paper-driver-"));
  const out = join(dir, "smoke.ndjson");
  try {
    writeNDJSONRows(out, rows);
    const txt = readFileSync(out, "utf-8");
    const lines = txt.split("\n").filter((l) => l.length > 0);
    assert.equal(lines.length, rows.length);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.experiment, "E1");
    assert.equal(parsed.cellId, "FB");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
