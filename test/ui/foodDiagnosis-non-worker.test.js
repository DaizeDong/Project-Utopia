import test from "node:test";
import assert from "node:assert/strict";

import { buildFoodDiagnosis } from "../../src/ui/panels/EntityFocusPanel.js";

// v0.10.1-n (A7-rationality-audit R1) — non-WORKER entities (predator,
// herbivore, visitor) must not be diagnosed against the colony food
// infrastructure. Bear-20 / Ash-16 previously fell through to the
// worker-only "Build or reconnect a warehouse" template, which produced
// a false causal chain in the inspector.

test("buildFoodDiagnosis: ANIMAL/PREDATOR does not reference warehouse infra", () => {
  const diagnosis = buildFoodDiagnosis(
    { type: "ANIMAL", kind: "PREDATOR", id: "bear-20", hunger: 0.1 },
    { resources: { food: 0 }, buildings: { warehouses: 0, farms: 0 } },
  );

  assert.equal(diagnosis.severity, "ok");
  assert.doesNotMatch(
    diagnosis.cause,
    /warehouse/i,
    "predator inspector must not surface warehouse-level diagnosis",
  );
  assert.doesNotMatch(
    diagnosis.next,
    /warehouse/i,
    "predator inspector must not suggest warehouse repair",
  );
  assert.match(diagnosis.cause, /wildlife/i);
  assert.match(diagnosis.facts, /type=ANIMAL/);
});

test("buildFoodDiagnosis: ANIMAL/HERBIVORE branches the same as predator", () => {
  const diagnosis = buildFoodDiagnosis(
    { type: "ANIMAL", kind: "HERBIVORE", id: "deer-7", hunger: 0.4 },
    { resources: { food: 200 }, buildings: { warehouses: 1, farms: 1 } },
  );

  assert.equal(diagnosis.severity, "ok");
  assert.doesNotMatch(diagnosis.cause, /warehouse/i);
  assert.match(diagnosis.facts, /type=ANIMAL/);
  assert.match(diagnosis.facts, /kind=HERBIVORE/);
});

test("buildFoodDiagnosis: VISITOR/SABOTEUR routes through visitor template", () => {
  const diagnosis = buildFoodDiagnosis(
    { type: "VISITOR", kind: "SABOTEUR", id: "ash-16", hunger: 0 },
    { resources: { food: 0 }, buildings: { warehouses: 0, farms: 0 } },
  );

  assert.equal(diagnosis.severity, "ok");
  assert.doesNotMatch(
    diagnosis.cause,
    /warehouse/i,
    "saboteur visitor must not surface colony food diagnosis",
  );
  assert.match(diagnosis.cause, /visitor/i);
  assert.match(diagnosis.facts, /type=VISITOR/);
  assert.match(diagnosis.facts, /kind=SABOTEUR/);
});

test("buildFoodDiagnosis: VISITOR/TRADER also routes through visitor template", () => {
  const diagnosis = buildFoodDiagnosis(
    { type: "VISITOR", kind: "TRADER", id: "merchant-3" },
    { resources: { food: 100 }, buildings: { warehouses: 1, farms: 1 } },
  );

  assert.equal(diagnosis.severity, "ok");
  assert.doesNotMatch(diagnosis.cause, /warehouse/i);
  assert.match(diagnosis.cause, /visitor/i);
});

test("buildFoodDiagnosis: WORKER still walks the original colony-food template (regression lock)", () => {
  // Worker with empty stockpile + no carry should still surface the
  // farm/warehouse diagnosis. Confirms the early-return only short-circuits
  // ANIMAL/VISITOR — WORKER (and missing-type) entities continue through
  // the original feasibility logic.
  const diagnosis = buildFoodDiagnosis(
    { type: "WORKER", role: "FARM", hunger: 0.1, carry: { food: 0 } },
    { resources: { food: 0 }, buildings: { warehouses: 1, farms: 1 } },
  );

  assert.notEqual(
    diagnosis.severity,
    "ok",
    "starving FARM worker with no stock must not be classified ok",
  );
  assert.match(
    diagnosis.cause,
    /Stored food is 0/i,
    "WORKER path must still call out empty stockpile",
  );
});

test("buildFoodDiagnosis: missing entity.type does not crash and walks worker path", () => {
  // Entity without an explicit type (legacy worker fixture) must keep
  // routing through the original logic, not the early-return branches.
  const diagnosis = buildFoodDiagnosis(
    { hunger: 0.1, carry: { food: 0 }, debug: { reachableFood: false } },
    { resources: { food: 0 }, buildings: { warehouses: 1, farms: 1 } },
  );

  assert.equal(diagnosis.severity, "critical");
});
