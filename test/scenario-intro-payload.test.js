// test/scenario-intro-payload.test.js
// v0.8.2 Round-5b (02e Step 7) — getScenarioIntroPayload smoke test.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getScenarioIntroPayload } from "../src/world/scenarios/ScenarioFactory.js";

describe("getScenarioIntroPayload", () => {
  it("fortified_basin openingPressure contains expected prose", () => {
    const payload = getScenarioIntroPayload("fortified_basin");
    assert.ok(typeof payload.openingPressure === "string", "openingPressure is string");
    assert.ok(payload.openingPressure.includes("danger"), "openingPressure has authored prose");
    assert.strictEqual(payload.title, "Hollow Keep");
    assert.strictEqual(payload.durationMs, 1500);
  });

  it("temperate_plains returns title and non-empty openingPressure", () => {
    const payload = getScenarioIntroPayload("temperate_plains");
    assert.ok(payload.title.length > 0, "title non-empty");
    assert.ok(payload.openingPressure.length > 0, "openingPressure non-empty");
  });

  it("unknown template falls back to defaults without throwing", () => {
    const payload = getScenarioIntroPayload("unknown_template");
    assert.ok(typeof payload.title === "string");
    assert.ok(typeof payload.openingPressure === "string");
    assert.strictEqual(payload.durationMs, 1500);
  });
});
