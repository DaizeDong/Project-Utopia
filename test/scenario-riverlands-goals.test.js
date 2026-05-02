// v0.10.1-r3-A5 P0-3: Riverlands distinct scenario goals test.
//
// Reviewer (R3 A5-balance-critic) flagged that fertile_riverlands and
// temperate_plains shared the IDENTICAL scenario `targets` table (warehouses
// 2, farms 6, lumbers 3, roads 20, walls 8) — both routed through
// buildFrontierRepairScenario, both inherited the Plains target counts
// verbatim. This erased the wetland identity Riverlands' name promises;
// the scenario goal stripe at game start read the same chip values on
// both maps despite the name suggesting agriculture-forward objectives.
//
// This test pins the contract that:
//   1. Riverlands gets +33% more farm targets (6 → 8) and -50% wall
//      targets (8 → 4) versus Plains.
//   2. Both scenarios still expose the canonical {logistics, stockpile,
//      stability} goal triplet.
//   3. The opening-pressure / hint copy is template-distinct (already
//      pinned by scenario-voice-by-template.test.js but re-asserted here
//      so the regression surface includes the 2026-05-01 R3 fix).

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../src/entities/EntityFactory.js";

test("fertile_riverlands scenario has DIFFERENT logistic targets from temperate_plains (R3 A5 P0-3)", () => {
  const plains = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const rivers = createInitialGameState({ templateId: "fertile_riverlands", seed: 1337 });

  const plainsTargets = plains.gameplay?.scenario?.targets?.logistics ?? {};
  const riversTargets = rivers.gameplay?.scenario?.targets?.logistics ?? {};

  // Plains baseline (canonical pre-r3 numbers — unchanged by the r3 fix).
  assert.equal(plainsTargets.farms, 6, "Plains farms target locked at 6");
  assert.equal(plainsTargets.walls, 8, "Plains walls target locked at 8");
  assert.equal(plainsTargets.lumbers, 3, "Plains lumbers target locked at 3");

  // Riverlands distinct (r3 differentiation).
  assert.equal(riversTargets.farms, 8, "Riverlands farms target = 8 (+33% over Plains)");
  assert.equal(riversTargets.walls, 4, "Riverlands walls target = 4 (-50% under Plains)");
  assert.equal(riversTargets.lumbers, 2, "Riverlands lumbers target = 2 (lower — wood is plentiful)");
  assert.equal(riversTargets.bridges, 2, "Riverlands adds a bridges target (wetland identity)");

  // The two tables must not be identical (the bug we're fixing).
  assert.notDeepEqual(
    riversTargets,
    plainsTargets,
    "Riverlands and Plains targets must differ (pre-r3 they were identical)",
  );
});

test("fertile_riverlands stockpile + stability targets diverge from temperate_plains", () => {
  const plains = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const rivers = createInitialGameState({ templateId: "fertile_riverlands", seed: 1337 });

  const plainsStockpile = plains.gameplay?.scenario?.targets?.stockpile ?? {};
  const riversStockpile = rivers.gameplay?.scenario?.targets?.stockpile ?? {};
  assert.notDeepEqual(plainsStockpile, riversStockpile, "stockpile targets should differ between templates");

  const plainsStability = plains.gameplay?.scenario?.targets?.stability ?? {};
  const riversStability = rivers.gameplay?.scenario?.targets?.stability ?? {};
  assert.notDeepEqual(plainsStability, riversStability, "stability targets should differ between templates");

  // Riverlands lowers the wall floor (agriculture-forward, not fortress)
  assert.ok(
    Number(riversStability.walls ?? 0) < Number(plainsStability.walls ?? 0),
    `expected Riverlands stability walls (${riversStability.walls}) < Plains (${plainsStability.walls})`,
  );
});

test("Riverlands objective copy mentions the wetland identity (bridges + harvest)", () => {
  const rivers = createInitialGameState({ templateId: "fertile_riverlands", seed: 1337 });
  const copy = rivers.gameplay?.scenario?.objectiveCopy ?? {};

  assert.ok(typeof copy.logisticsDescription === "string");
  assert.match(copy.logisticsDescription, /8 farms/i, "Riverlands logistics copy should call out the 8-farm target");
  assert.match(copy.logisticsDescription, /bridges?/i, "Riverlands logistics copy should mention bridges");
});
