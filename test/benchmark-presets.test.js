// test/benchmark-presets.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BENCHMARK_PRESETS, applyPreset } from "../src/benchmark/BenchmarkPresets.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";

describe("BenchmarkPresets", () => {
  it("exports exactly 20 presets", () => {
    assert.equal(BENCHMARK_PRESETS.length, 20);
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
    assert.equal(state.resources.food, 8, "food should be 8");
    assert.equal(state.resources.wood, 6, "wood should be 6");
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

  it("resource chain presets set new resources correctly", () => {
    const state = createInitialGameState({ templateId: "temperate_plains", seed: 42 });
    const preset = BENCHMARK_PRESETS.find((p) => p.id === "full_processing");
    applyPreset(state, preset);
    assert.equal(state.resources.stone, 25);
    assert.equal(state.resources.herbs, 15);
    assert.equal(state.resources.meals, 5);
    assert.equal(state.resources.medicine, 2);
    assert.equal(state.resources.tools, 1);
  });

  it("resource chain presets set processing buildings correctly", () => {
    const state = createInitialGameState({ templateId: "temperate_plains", seed: 42 });
    const preset = BENCHMARK_PRESETS.find((p) => p.id === "resource_chains_basic");
    applyPreset(state, preset);
    assert.ok(state.buildings.quarries >= 1, "should have at least 1 quarry");
    assert.ok(state.buildings.herbGardens >= 1, "should have at least 1 herb garden");
    assert.ok(state.buildings.kitchens >= 1, "should have at least 1 kitchen");
  });

  it("cloned workers have correct carry format with stone and herbs", () => {
    const state = createInitialGameState({ templateId: "temperate_plains", seed: 42 });
    const preset = BENCHMARK_PRESETS.find((p) => p.id === "large_colony");
    const initialCount = state.agents.filter((a) => a.type === "WORKER").length;
    applyPreset(state, preset);
    const workers = state.agents.filter((a) => a.type === "WORKER");
    assert.ok(workers.length > initialCount);
    // Check a cloned worker (one beyond initial count)
    const clonedWorker = workers[workers.length - 1];
    assert.equal(clonedWorker.carry.stone, 0);
    assert.equal(clonedWorker.carry.herbs, 0);
  });
});
