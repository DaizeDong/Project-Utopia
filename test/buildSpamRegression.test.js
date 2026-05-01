// v0.8.2 Round-5 Wave-3 (02c Step 7) — Build-spam regression guard.
//
// Reviewer 02c run-1 reported legally queueing warehouse×10 + wall×19 +
// kitchen×5 before food/wood burned through, lifting Dev 49→65 short-term
// and running the colony into starvation long-term. With the soft-cost
// escalator in BUILD_COST_ESCALATOR, each of those spams should now cost
// progressively more, so the build-spam cost curve rises sharply while the
// "legal" (at-softTarget) cost curve stays flat.
//
// This test does NOT boot the ECS; it drives `computeEscalatedBuildCost`
// in a loop to simulate the reviewer's spam sequence, asserting:
//   (a) cumulative wood for warehouse×15 is significantly above 10×15
//       (flat baseline); proves the escalator bites.
//   (b) cumulative wood for warehouse×2 (scenario target) equals the flat
//       cost 2×10=20; proves the "legal" path is NOT penalised.
//   (c) the Nth copy cost is monotonically non-decreasing in N; proves the
//       multiplier is never applied backwards.
//   (d) the Nth copy cost is capped by the `cap` entry in the escalator
//       table; proves unbounded spam does not reach infinity wood cost.

import test from "node:test";
import assert from "node:assert/strict";

import {
  BUILD_COST,
  BUILD_COST_ESCALATOR,
  computeEscalatedBuildCost,
  isBuildKindHardCapped,
} from "../src/config/balance.js";

function cumulativeWood(kind, n) {
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    total += Number(computeEscalatedBuildCost(kind, i).wood ?? 0);
  }
  return total;
}

test("build-spam: warehouse×15 cumulative wood exceeds flat 10×15 by >40%", () => {
  const flatTotal = 15 * Number(BUILD_COST.warehouse.wood ?? 0);
  const escalatedTotal = cumulativeWood("warehouse", 15);
  assert.ok(escalatedTotal > flatTotal * 1.4,
    `expected escalator to raise warehouse×15 cost >40% above flat ${flatTotal}, got ${escalatedTotal}`);
});

test("build-spam: warehouse×2 (at scenario target) matches flat cost — no penalty before softTarget", () => {
  const flatTotal = 2 * Number(BUILD_COST.warehouse.wood ?? 0);
  const escalatedTotal = cumulativeWood("warehouse", 2);
  assert.equal(escalatedTotal, flatTotal,
    `warehouse×2 must cost exactly ${flatTotal} wood (no escalation before soft target)`);
});

test("build-spam: per-copy wood cost is monotonically non-decreasing across warehouse×20", () => {
  let lastCost = -Infinity;
  for (let i = 0; i < 20; i += 1) {
    const c = Number(computeEscalatedBuildCost("warehouse", i).wood ?? 0);
    assert.ok(c >= lastCost,
      `warehouse cost dropped at count=${i}: ${c} < prev ${lastCost}`);
    lastCost = c;
  }
});

test("build-spam: warehouse beyond-cap costs keep rising (hardCap removed in v0.10.1-m)", () => {
  // v0.10.1-m: hardCap removed — placement is no longer capped, but costs keep
  // rising indefinitely via perExtraBeyondCap so there is still a natural soft ceiling.
  const atCap = Number(computeEscalatedBuildCost("warehouse", 9).wood ?? 0);
  const beyondCap = Number(computeEscalatedBuildCost("warehouse", 20).wood ?? 0);
  assert.ok(beyondCap > atCap,
    `warehouse beyond-cap cost should keep rising to discourage plateau cheese (${beyondCap} <= ${atCap})`);
  for (const count of [30, 60, 120]) {
    const capState = isBuildKindHardCapped("warehouse", count);
    assert.equal(capState.capped, false, `warehouse count=${count} should NOT be placement-capped (hardCap removed)`);
    assert.equal(capState.hardCap, null);
  }
});

test("build-spam: wall×20 cumulative wood exceeds flat 2×20 but respects softer perExtra", () => {
  // Wall perExtra is 0.1 (gentler than warehouse 0.2) and softTarget=8, so
  // the cost curve rises more slowly. Still, 20 walls should cost strictly
  // more than 40 (flat), but strictly less than 2.5× that (warehouse-style
  // slope).
  const flatTotal = 20 * Number(BUILD_COST.wall.wood ?? 0);
  const escalatedTotal = cumulativeWood("wall", 20);
  assert.ok(escalatedTotal > flatTotal,
    `wall×20 should cost more than flat ${flatTotal}, got ${escalatedTotal}`);
  assert.ok(escalatedTotal < flatTotal * 2.5,
    `wall×20 should be penalised softer than warehouse: got ${escalatedTotal}, flat ${flatTotal}`);
});

test("build-spam: kitchen×5 still escalates with perExtra=0.25 (v0.8.5)", () => {
  // v0.8.5 Tier 3: kitchen perExtra 0.35 → 0.25 (LLM never built 2nd kitchen
  // even when needed; soften the punishment). Cumulative wood for 5
  // kitchens still escalates above flat (now ~1.25× instead of 1.45×).
  const flatTotal = 5 * Number(BUILD_COST.kitchen.wood ?? 0);
  const escalatedTotal = cumulativeWood("kitchen", 5);
  assert.ok(escalatedTotal >= flatTotal * 1.2,
    `kitchen×5 should still escalate >=1.2× flat ${flatTotal}, got ${escalatedTotal}`);
  // Also assert stone-axis scaling: kitchen base stone=3, cumulative stone
  // for count 0..4 follows the same multiplier pattern.
  let stoneTotal = 0;
  for (let i = 0; i < 5; i += 1) {
    stoneTotal += Number(computeEscalatedBuildCost("kitchen", i).stone ?? 0);
  }
  const flatStone = 5 * Number(BUILD_COST.kitchen.stone ?? 0);
  assert.ok(stoneTotal > flatStone,
    `kitchen×5 stone cost should exceed flat ${flatStone}, got ${stoneTotal}`);
});
