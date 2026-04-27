import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { getScenarioRuntime } from "../src/world/scenarios/ScenarioFactory.js";

const CASES = Object.freeze([
  ["temperate_plains", "frontier_repair"],
  ["fortified_basin", "gate_chokepoints"],
  ["archipelago_isles", "island_relay"],
]);

test("scenario starter footprints stay below logistics targets", () => {
  for (const [templateId, family] of CASES) {
    const state = createInitialGameState({ templateId, seed: 1337 });
    const runtime = getScenarioRuntime(state);
    const counts = runtime.counts;
    const targets = runtime.logisticsTargets;

    assert.equal(runtime.scenario.family, family);
    assert.ok(
      counts.warehouses <= targets.warehouses - 1,
      `${templateId}: starter warehouses should leave at least one warehouse to build`,
    );
    assert.ok(
      counts.farms < targets.farms,
      `${templateId}: starter farms should not complete the farm target`,
    );
    assert.ok(
      counts.lumbers < targets.lumbers,
      `${templateId}: starter lumber camps should not complete the lumber target`,
    );
    assert.ok(
      counts.walls < targets.walls,
      `${templateId}: starter walls should not complete the wall target`,
    );
  }
});
