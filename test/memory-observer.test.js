// test/memory-observer.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { MemoryObserver } from "../src/simulation/ai/memory/MemoryObserver.js";

describe("MemoryObserver", () => {
  it("records death observation when deaths increase", () => {
    const store = new MemoryStore();
    const observer = new MemoryObserver(store);
    const state = {
      metrics: { timeSec: 30, deathsTotal: 2 },
      resources: { food: 50 },
      gameplay: { objectiveIndex: 0, objectives: [{ title: "Test" }] },
      weather: { current: "clear" },
    };
    observer.observe(state);
    assert.equal(store.observations.length, 0, "first call sets baseline only");

    state.metrics.deathsTotal = 4;
    state.metrics.timeSec = 45;
    observer.observe(state);
    assert.equal(store.observations.length, 1);
    assert.ok(store.observations[0].text.includes("2"), "should mention count");
    assert.ok(store.observations[0].text.includes("death"), "should be a death observation");
  });

  it("records food-critical observation when food drops below 15", () => {
    const store = new MemoryStore();
    const observer = new MemoryObserver(store);
    const state = {
      metrics: { timeSec: 10, deathsTotal: 0 },
      resources: { food: 50 },
      gameplay: { objectiveIndex: 0, objectives: [] },
      weather: { current: "clear" },
    };
    observer.observe(state);
    state.resources.food = 10;
    state.metrics.timeSec = 20;
    observer.observe(state);
    assert.equal(store.observations.length, 1);
    assert.ok(store.observations[0].text.toLowerCase().includes("food"));
  });

  it("records weather change observation", () => {
    const store = new MemoryStore();
    const observer = new MemoryObserver(store);
    const state = {
      metrics: { timeSec: 10, deathsTotal: 0 },
      resources: { food: 50 },
      gameplay: { objectiveIndex: 0, objectives: [] },
      weather: { current: "clear" },
    };
    observer.observe(state);
    state.weather.current = "storm";
    state.metrics.timeSec = 20;
    observer.observe(state);
    assert.equal(store.observations.length, 1);
    assert.ok(store.observations[0].text.toLowerCase().includes("storm"));
  });

  it("records objective completion observation", () => {
    const store = new MemoryStore();
    const observer = new MemoryObserver(store);
    const state = {
      metrics: { timeSec: 10, deathsTotal: 0 },
      resources: { food: 50 },
      gameplay: { objectiveIndex: 0, objectives: [{ title: "Repair Routes" }, { title: "Build Depot" }] },
      weather: { current: "clear" },
    };
    observer.observe(state);
    state.gameplay.objectiveIndex = 1;
    state.metrics.timeSec = 60;
    observer.observe(state);
    assert.equal(store.observations.length, 1);
    assert.ok(store.observations[0].text.includes("Repair Routes"));
  });

  it("resets tracking state via reset()", () => {
    const store = new MemoryStore();
    const observer = new MemoryObserver(store);
    const state = {
      metrics: { timeSec: 10, deathsTotal: 3 },
      resources: { food: 50 },
      gameplay: { objectiveIndex: 0, objectives: [] },
      weather: { current: "clear" },
    };
    observer.observe(state);
    observer.reset();
    state.metrics.deathsTotal = 5;
    observer.observe(state);
    assert.equal(store.observations.length, 0, "first call after reset sets baseline");
  });
});
