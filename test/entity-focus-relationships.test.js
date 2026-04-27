import test from "node:test";
import assert from "node:assert/strict";

import {
  TRAIT_DESC,
  buildFoodDiagnosis,
  formatRelationOpinion,
  relationLabel,
} from "../src/ui/panels/EntityFocusPanel.js";

test("relationLabel maps opinion values to player-readable relationship bands", () => {
  assert.equal(relationLabel(0.5), "Close friend");
  assert.equal(relationLabel(0.2), "Friend");
  assert.equal(relationLabel(0), "Acquaintance");
  assert.equal(relationLabel(-0.2), "Strained");
  assert.equal(relationLabel(-0.6), "Rival");
});

test("formatRelationOpinion preserves numeric value after semantic label", () => {
  assert.equal(formatRelationOpinion(0.25), "Friend (+0.25)");
  assert.equal(formatRelationOpinion(-0.25), "Strained (-0.25)");
});

test("trait descriptions name concrete behavioral effects", () => {
  assert.match(TRAIT_DESC.swift, /faster movement/i);
  assert.match(TRAIT_DESC.careful, /slower travel/i);
  assert.match(TRAIT_DESC.hardy, /morale loss/i);
  assert.match(TRAIT_DESC.social, /rest drains/i);
  assert.match(TRAIT_DESC.efficient, /work cycles/i);
});

test("buildFoodDiagnosis calls out empty stockpile with next action", () => {
  const diagnosis = buildFoodDiagnosis(
    { hunger: 0.1, carry: { food: 0 }, starvationSec: 12, debug: { reachableFood: false } },
    { resources: { food: 0 }, buildings: { warehouses: 1, farms: 1 } },
  );

  assert.equal(diagnosis.severity, "critical");
  assert.match(diagnosis.cause, /Stored food is 0/i);
  assert.match(diagnosis.next, /connect farms to a warehouse/i);
});

test("buildFoodDiagnosis distinguishes stocked but unreachable food", () => {
  const diagnosis = buildFoodDiagnosis(
    {
      hunger: 0.05,
      carry: { food: 0 },
      debug: { reachableFood: false, nutritionSourceType: "none" },
      blackboard: {
        lastFeasibilityReject: {
          source: "local",
          requestedState: "eat",
          reason: "no reachable food source",
        },
      },
    },
    { resources: { food: 25 }, buildings: { warehouses: 1, farms: 0 } },
  );

  assert.equal(diagnosis.severity, "critical");
  assert.match(diagnosis.cause, /Food exists.*no reachable nutrition source/i);
  assert.match(diagnosis.next, /Repair roads\/bridges/i);
  assert.match(diagnosis.reject, /no reachable food source/i);
});
