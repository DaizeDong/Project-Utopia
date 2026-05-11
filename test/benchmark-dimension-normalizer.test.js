// Validates DimensionNormalizer (V3.1) — per-dimension transform layer.
//
// Asserts each transform branch maps the canonical sample input to the
// expected [0,1] benefit-form output, plus NaN/Infinity handling, unknown
// keys, and buildSandwichTriple (seed,scenario) alignment.

import test from "node:test";
import assert from "node:assert/strict";

import {
  DIMENSION_NORMALIZERS,
  normalizeDimension,
  normalizeRow,
  gatherDimensionAcrossCells,
  buildSandwichTriple,
} from "../src/benchmark/framework/DimensionNormalizer.js";

// ── transform-by-transform sanity ────────────────────────────────────

test("identity transform passes [0,1] benefit-form through unchanged", () => {
  // rae_composite is identity per registry.
  assert.equal(normalizeDimension("rae_composite", 0.0), 0);
  assert.equal(normalizeDimension("rae_composite", 0.42), 0.42);
  assert.equal(normalizeDimension("rae_composite", 1.0), 1);
  // out-of-range clamps
  assert.equal(normalizeDimension("rae_composite", -0.5), 0);
  assert.equal(normalizeDimension("rae_composite", 1.5), 1);
});

test("invert transform flips [0,1] cost-form to benefit-form (1-x)", () => {
  // rae_idle_capacity uses invert.
  assert.equal(normalizeDimension("rae_idle_capacity", 0.0), 1.0);
  assert.equal(normalizeDimension("rae_idle_capacity", 0.25), 0.75);
  assert.equal(normalizeDimension("rae_idle_capacity", 1.0), 0.0);
});

test("reciprocal transform maps [1,∞) cost-form via 1/x", () => {
  // rae_path_overhead uses reciprocal; 1.0 = perfect = score 1.
  assert.equal(normalizeDimension("rae_path_overhead", 1.0), 1.0);
  assert.equal(normalizeDimension("rae_path_overhead", 2.0), 0.5);
  assert.equal(normalizeDimension("rae_path_overhead", 4.0), 0.25);
  // values < 1 (defensive) saturate at 1
  assert.equal(normalizeDimension("rae_path_overhead", 0.5), 1);
});

test("clipScale transform maps [0,scale] via x/scale clamp", () => {
  // intent_entropy uses clipScale with scale=4.32.
  assert.ok(Math.abs(normalizeDimension("intent_entropy", 0) - 0) < 1e-9);
  assert.ok(Math.abs(normalizeDimension("intent_entropy", 4.32) - 1.0) < 1e-9);
  assert.ok(Math.abs(normalizeDimension("intent_entropy", 2.16) - 0.5) < 1e-9);
  // saturate above
  assert.equal(normalizeDimension("intent_entropy", 999), 1);
  // below zero (non-physical) clamps
  assert.equal(normalizeDimension("intent_entropy", -1), 0);
});

test("rescaleSymmetric transform maps [-1,1] → [0,1] via (x+1)/2", () => {
  // coalition_coupling uses rescaleSymmetric.
  assert.equal(normalizeDimension("coalition_coupling", -1), 0);
  assert.equal(normalizeDimension("coalition_coupling", 0), 0.5);
  assert.equal(normalizeDimension("coalition_coupling", 1), 1);
  // out-of-range clamps to domain
  assert.equal(normalizeDimension("coalition_coupling", -2), 0);
  assert.equal(normalizeDimension("coalition_coupling", 5), 1);
});

test("exponentialDecay (default) maps cost-form via e^{-x/scale}", () => {
  // colony_cadence_health uses scale=30, fromZero=false (lower=better).
  assert.equal(normalizeDimension("colony_cadence_health", 0), 1.0);
  // x = scale → e^-1 ≈ 0.3679
  const oneOverE = Math.exp(-1);
  const v = normalizeDimension("colony_cadence_health", 30);
  assert.ok(Math.abs(v - oneOverE) < 1e-9, `got ${v}, expected ≈ ${oneOverE}`);
  // very high → near 0
  assert.ok(normalizeDimension("colony_cadence_health", 9999) < 1e-9);
});

test("exponentialDecay (fromZero) maps benefit-form via 1 - e^{-x/scale}", () => {
  // dte_per_decision uses fromZero=true with scale=1.
  assert.equal(normalizeDimension("dte_per_decision", 0), 0);
  // x = 1 → 1 - e^-1
  const expected = 1 - Math.exp(-1);
  const v = normalizeDimension("dte_per_decision", 1);
  assert.ok(Math.abs(v - expected) < 1e-9, `got ${v}, expected ≈ ${expected}`);
  // very high benefit-form value → near 1
  assert.ok(normalizeDimension("dte_per_decision", 9999) > 0.999);
});

// ── failure-mode handling ────────────────────────────────────────────

test("non-finite (NaN / Infinity) input returns 0 with warning", () => {
  // Suppress console.warn for this test — we assert behavior, not output.
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(normalizeDimension("rae_composite", NaN), 0);
    assert.equal(normalizeDimension("rae_composite", Infinity), 0);
    assert.equal(normalizeDimension("rae_idle_capacity", -Infinity), 0);
  } finally {
    console.warn = origWarn;
  }
});

test("unknown dim key returns NaN with warning", () => {
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    const v = normalizeDimension("nonexistent_dim_xyz", 0.5);
    assert.ok(Number.isNaN(v), `got ${v}`);
  } finally {
    console.warn = origWarn;
  }
});

test("normalizeRow preserves unknown keys verbatim, normalizes known", () => {
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    const row = {
      rae_composite: 0.5,
      rae_idle_capacity: 0.2, // -> 0.8 after invert
      future_unknown_dim: 42,
    };
    const out = normalizeRow(row);
    assert.equal(out.rae_composite, 0.5);
    assert.ok(Math.abs(out.rae_idle_capacity - 0.8) < 1e-9);
    // unknown key preserved (caller logs)
    assert.equal(out.future_unknown_dim, 42);
  } finally {
    console.warn = origWarn;
  }
});

// ── sandwich pairing ─────────────────────────────────────────────────

function mkCell(seed, scenario, dimKey, value) {
  return {
    seed,
    scenario,
    agentId: "test",
    perDimensionScores: { [dimKey]: value },
    aiRuntime: {},
    outcome: null,
    wallclockMs: 0,
  };
}

test("buildSandwichTriple aligns by (seed,scenario) and outputs paired arrays", () => {
  const dim = "rae_composite";
  const agent    = [mkCell(1, "A", dim, 0.6), mkCell(2, "A", dim, 0.7), mkCell(1, "B", dim, 0.5)];
  const fallback = [mkCell(1, "B", dim, 0.2), mkCell(1, "A", dim, 0.3), mkCell(2, "A", dim, 0.4)];
  const oracle   = [mkCell(2, "A", dim, 0.95), mkCell(1, "A", dim, 0.9), mkCell(1, "B", dim, 0.8)];

  const triple = buildSandwichTriple(agent, fallback, oracle, dim);
  // Sorted by seed, scenario: (1,A), (1,B), (2,A)
  assert.deepEqual(
    triple.keys,
    [{ seed: 1, scenario: "A" }, { seed: 1, scenario: "B" }, { seed: 2, scenario: "A" }],
  );
  assert.deepEqual(triple.agent,    [0.6, 0.5, 0.7]);
  assert.deepEqual(triple.fallback, [0.3, 0.2, 0.4]);
  assert.deepEqual(triple.oracle,   [0.9, 0.8, 0.95]);
});

test("buildSandwichTriple throws when (seed,scenario) sets are misaligned", () => {
  const dim = "rae_composite";
  const agent    = [mkCell(1, "A", dim, 0.6), mkCell(2, "A", dim, 0.7)];
  const fallback = [mkCell(1, "A", dim, 0.3), mkCell(2, "A", dim, 0.4)];
  // oracle missing (2,A)
  const oracleBad = [mkCell(1, "A", dim, 0.9)];
  assert.throws(() => buildSandwichTriple(agent, fallback, oracleBad, dim), /size mismatch|missing/);

  // size matches but key set differs
  const oracleSwapped = [mkCell(1, "A", dim, 0.9), mkCell(3, "A", dim, 0.95)];
  assert.throws(() => buildSandwichTriple(agent, fallback, oracleSwapped, dim), /missing/);
});

test("gatherDimensionAcrossCells extracts (seed,scenario,value) triples", () => {
  const dim = "rae_composite";
  const cells = [mkCell(1, "A", dim, 0.6), mkCell(2, "B", dim, 0.7)];
  const out = gatherDimensionAcrossCells(cells, dim);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { seed: 1, scenario: "A", value: 0.6 });
  assert.deepEqual(out[1], { seed: 2, scenario: "B", value: 0.7 });
});

test("DIMENSION_NORMALIZERS covers every plugin scoreDimension exactly once", async () => {
  // Reflective sanity check: any dim a plugin emits MUST have a recipe.
  // If a future plugin adds a dim and forgets to register here, this trips.
  const { ACADEMIC_BENCHMARK_DIMENSIONS } = await import(
    "../src/benchmark/dimensions/index.js"
  );
  const declared = new Set();
  for (const plugin of ACADEMIC_BENCHMARK_DIMENSIONS) {
    for (const dim of plugin.scoreDimensions) declared.add(dim);
  }
  for (const dim of declared) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(DIMENSION_NORMALIZERS, dim),
      `dim "${dim}" emitted by plugin but missing from DIMENSION_NORMALIZERS`,
    );
  }
});
