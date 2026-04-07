// test/benchmark-presets.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BENCHMARK_PRESETS, applyPreset } from "../src/benchmark/BenchmarkPresets.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";

describe("BenchmarkPresets", () => {
  it("exports exactly 11 presets", () => {
    assert.equal(BENCHMARK_PRESETS.length, 11);
  });

  it("each preset has required fields", () => {
    for (const p of BENCHMARK_PRESETS) {
      assert.ok(p.id, "id required");
      assert.ok(p.label, "label required");
      assert.ok(p.templateId, "templateId required");
      assert.ok(p.category, "category required");
    }
  });

  it("applyPreset modifies resources correctly", () => {
    const state = createInitialGameState({ templateId: "temperate_plains", seed: 42 });
    const preset = BENCHMARK_PRESETS.find((p) => p.id === "scarce_resources");
    applyPreset(state, preset);
    assert.equal(state.resources.food, 12, "food should be 12");
    assert.equal(state.resources.wood, 10, "wood should be 10");
  });

  it("applyPreset modifies population correctly", () => {
    const state = createInitialGameState({ templateId: "temperate_plains", seed: 42 });
    const initialWorkers = state.agents.filter((a) => a.type === "WORKER").length;
    const preset = BENCHMARK_PRESETS.find((p) => p.id === "large_colony");
    applyPreset(state, preset);
    const newWorkers = state.agents.filter((a) => a.type === "WORKER").length;
    assert.ok(newWorkers > initialWorkers, "should have more workers");
  });

  it("applyPreset modifies threat correctly", () => {
    const state = createInitialGameState({ templateId: "temperate_plains", seed: 42 });
    const preset = BENCHMARK_PRESETS.find((p) => p.id === "high_threat");
    applyPreset(state, preset);
    assert.ok(state.gameplay.threat >= 60, "threat should be high");
    const predators = state.animals.filter((a) => a.kind === "PREDATOR").length;
    assert.ok(predators >= 3, "should have more predators");
  });

  it("presets cover all 3 categories", () => {
    const categories = new Set(BENCHMARK_PRESETS.map((p) => p.category));
    assert.ok(categories.has("terrain"), "should have terrain category");
    assert.ok(categories.has("economy"), "should have economy category");
    assert.ok(categories.has("pressure"), "should have pressure category");
  });

  it("skeleton_crew keeps at least 2 workers", () => {
    const state = createInitialGameState({ templateId: "temperate_plains", seed: 42 });
    const preset = BENCHMARK_PRESETS.find((p) => p.id === "skeleton_crew");
    applyPreset(state, preset);
    const workers = state.agents.filter((a) => a.type === "WORKER").length;
    assert.ok(workers >= 2, `should keep at least 2 workers, got ${workers}`);
  });

  it("storm_start sets weather correctly", () => {
    const state = createInitialGameState({ templateId: "temperate_plains", seed: 42 });
    const preset = BENCHMARK_PRESETS.find((p) => p.id === "storm_start");
    applyPreset(state, preset);
    assert.equal(state.weather.current, "storm");
    assert.equal(state.weather.timeLeftSec, 30);
  });
});
