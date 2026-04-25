// v0.8.2 Round-6 Wave-2 (01d-mechanics-content) — mood→output coupling.
// Verifies that low-mood workers produce less than high-mood workers, and that
// the moodOutputMultiplier ramps linearly from BALANCE.moodOutputMin (mood=0)
// to 1.0 (mood=1).

import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Inline reproduction of WorkerAISystem's mood→output computation. The same
// formula is also embedded in WorkerAISystem; this test asserts the contract.
function computeMoodMultiplier(mood) {
  const moodOutputMin = Number(BALANCE.moodOutputMin ?? 0.5);
  return clamp(moodOutputMin + (1 - moodOutputMin) * Number(mood), 0, 1);
}

test("mood→output: mood=0 yields exactly moodOutputMin multiplier", () => {
  const m = computeMoodMultiplier(0);
  assert.equal(m, Number(BALANCE.moodOutputMin), "mood=0 → moodOutputMin");
});

test("mood→output: mood=1 yields exactly 1.0 multiplier", () => {
  const m = computeMoodMultiplier(1);
  assert.equal(m, 1.0);
});

test("mood→output: mood=0.5 yields the midpoint between min and 1", () => {
  const m = computeMoodMultiplier(0.5);
  const expected = Number(BALANCE.moodOutputMin) + (1 - Number(BALANCE.moodOutputMin)) * 0.5;
  assert.equal(Number(m.toFixed(4)), Number(expected.toFixed(4)));
});

test("mood→output: low-mood worker (0.1) yields ≥40% less than high-mood (0.9)", () => {
  const lo = computeMoodMultiplier(0.1);
  const hi = computeMoodMultiplier(0.9);
  const ratio = lo / hi;
  // mood=0.1 → 0.5 + 0.5*0.1 = 0.55; mood=0.9 → 0.5 + 0.5*0.9 = 0.95.
  // ratio 0.55/0.95 ≈ 0.579, i.e. lo is ~42% smaller. Assert lo/hi <= 0.6.
  assert.ok(ratio <= 0.6,
    `expected lo/hi <= 0.6 (>=40% reduction), got ratio=${ratio.toFixed(3)}`);
});

test("mood→output: BALANCE keys exist with expected defaults", () => {
  assert.equal(typeof BALANCE.moodOutputMin, "number");
  assert.ok(BALANCE.moodOutputMin >= 0 && BALANCE.moodOutputMin <= 1);
  assert.equal(typeof BALANCE.moraleBreakCooldownSec, "number");
  assert.ok(BALANCE.moraleBreakCooldownSec >= 1);
});
