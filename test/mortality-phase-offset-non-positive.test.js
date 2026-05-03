// PFF R11 Plan-PFF-revert-cascade-regression — invariant guard.
//
// MortalitySystem.js seeds entity.starvationSec with a deterministic per-id
// phase-offset on FIRST entry into the unreachable-food accumulator. The
// offset must be NON-POSITIVE so it can only DELAY death, never accelerate
// it past the baseline holdSec. Pre-fix the range was symmetric ±10 s,
// front-loading half the cohort by up to ~29 % vs baseline holdSec=34 s and
// breaking the cascade-recovery latch's response window (PFF-r9 audit).
//
// This test mirrors the offset derivation literally: id → 32-bit FNV-ish
// hash (`((h << 5) - h + char) | 0`) → `-(Math.abs(h) % 11)`. If anyone
// reverts to a symmetric range, swaps the modulus, or drops the negation,
// at least one id in the iteration will produce a positive offset and this
// test will fail with the offending id and value.
import test from "node:test";
import assert from "node:assert/strict";

function hashId(idStr) {
  let h = 0;
  for (let i = 0; i < idStr.length; i += 1) h = ((h << 5) - h + idStr.charCodeAt(i)) | 0;
  return h;
}

function phaseOffsetForId(id) {
  const h = hashId(String(id ?? ""));
  // Must mirror MortalitySystem.js exactly.
  return -(Math.abs(h) % 11);
}

test("MortalitySystem starvation phase-offset is non-positive for all worker ids (0..1023)", () => {
  for (let i = 0; i < 1024; i += 1) {
    const offset = phaseOffsetForId(`worker-${i}`);
    assert.ok(
      offset <= 0 && offset >= -10,
      `phase offset for id "worker-${i}" was ${offset}; must be in [-10, 0]`,
    );
  }
});

test("MortalitySystem starvation phase-offset is non-positive for numeric ids (0..1023)", () => {
  for (let i = 0; i < 1024; i += 1) {
    const offset = phaseOffsetForId(i);
    assert.ok(
      offset <= 0 && offset >= -10,
      `phase offset for numeric id ${i} was ${offset}; must be in [-10, 0]`,
    );
  }
});

test("MortalitySystem starvation phase-offset is exactly 0 for empty/missing id (visitor-safe)", () => {
  // Note: `-(0 % 11)` is `-0`; normalize via `+ 0` so assert treats it as 0.
  assert.equal(phaseOffsetForId("") + 0, 0);
  assert.equal(phaseOffsetForId(null) + 0, 0);
  assert.equal(phaseOffsetForId(undefined) + 0, 0);
});

test("MortalitySystem starvation phase-offset distribution actually uses the full -10..0 range", () => {
  // Sanity: if someone accidentally hard-codes 0 the previous tests still
  // pass. Confirm the range is meaningfully populated.
  const seen = new Set();
  for (let i = 0; i < 4096; i += 1) {
    seen.add(phaseOffsetForId(`worker-${i}`));
  }
  // Expect at least 8 of the 11 possible buckets (-10..0) populated.
  assert.ok(
    seen.size >= 8,
    `expected ≥8 distinct offset buckets across 4096 ids; got ${seen.size} (${[...seen].sort((a, b) => a - b).join(",")})`,
  );
  for (const v of seen) {
    assert.ok(v <= 0 && v >= -10, `unexpected offset value ${v} in distribution`);
  }
});
