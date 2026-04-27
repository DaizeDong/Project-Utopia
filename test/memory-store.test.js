import test from "node:test";
import assert from "node:assert/strict";

import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";

test("retrieves observations ranked by keyword relevance", () => {
  const store = new MemoryStore();
  store.addObservation(10, "A worker gathered wood near the river", "resource", 2);
  store.addObservation(11, "A predator caused death of a herbivore", "combat", 4);
  store.addObservation(12, "A farm was built in the south", "building", 2);

  const results = store.retrieve("predator death", 12, 3);
  assert.equal(results.length, 3);
  assert.equal(results[0].text, "A predator caused death of a herbivore");
});

test("applies recency decay — recent event ranks above old event with same keywords", () => {
  const store = new MemoryStore();
  store.addObservation(10, "food shortage reported", "resource", 3);
  store.addObservation(300, "food shortage reported", "resource", 3);

  const results = store.retrieve("food shortage", 300, 2);
  assert.equal(results[0].timeSec, 300);
  assert.equal(results[1].timeSec, 10);
  assert.ok(results[0].score > results[1].score);
});

test("respects maxObservations and evicts oldest", () => {
  const store = new MemoryStore({ maxObservations: 5 });
  for (let i = 0; i < 8; i += 1) {
    store.addObservation(i * 10, `event ${i}`, "general", 3);
  }
  assert.equal(store.observations.length, 5);
  // oldest three (event 0, 1, 2) should have been evicted
  assert.equal(store.observations[0].text, "event 3");
  assert.equal(store.observations[4].text, "event 7");
});

test("addReflection stores with importance=5 and type='reflection'", () => {
  const store = new MemoryStore();
  store.addReflection(50, "We need more farms to survive");
  assert.equal(store.reflections.length, 1);
  assert.equal(store.reflections[0].importance, 5);
  assert.equal(store.reflections[0].type, "reflection");
  assert.equal(store.reflections[0].timeSec, 50);
  assert.equal(store.reflections[0].text, "We need more farms to survive");
});

test("formatForPrompt returns compact string with [T=Xs, type] format", () => {
  const store = new MemoryStore();
  store.addObservation(10, "Worker died at the quarry", "combat", 4);
  store.addReflection(25, "Need more farms");

  const prompt = store.formatForPrompt("farms worker", 30, 5);
  assert.ok(prompt.includes("[T=10s, observation]"));
  assert.ok(prompt.includes("[T=25s, reflection]"));
  assert.ok(prompt.includes("Worker died at the quarry"));
  assert.ok(prompt.includes("Need more farms"));
});

test("retrieve with empty query returns results scored by recency + importance only", () => {
  const store = new MemoryStore();
  store.addObservation(10, "Old unimportant event", "general", 1);
  store.addObservation(100, "Recent critical event", "general", 5);

  const results = store.retrieve("", 100, 2);
  assert.equal(results.length, 2);
  // recent+high importance should be first
  assert.equal(results[0].text, "Recent critical event");
});

test("clear() removes all entries, size returns 0", () => {
  const store = new MemoryStore();
  store.addObservation(1, "obs1", "a", 3);
  store.addObservation(2, "obs2", "b", 2);
  store.addReflection(3, "ref1");
  assert.equal(store.size, 3);

  store.clear();
  assert.equal(store.size, 0);
  assert.equal(store.observations.length, 0);
  assert.equal(store.reflections.length, 0);
});

test("retrieve from empty store returns empty array", () => {
  const store = new MemoryStore();
  const results = store.retrieve("anything", 100, 5);
  assert.ok(Array.isArray(results));
  assert.equal(results.length, 0);
});

test("importance is clamped to [1,5]", () => {
  const store = new MemoryStore();
  store.addObservation(1, "low", "a", -10);
  store.addObservation(2, "high", "b", 99);
  assert.equal(store.observations[0].importance, 1);
  assert.equal(store.observations[1].importance, 5);
});

test("formatForPrompt returns empty string when store is empty", () => {
  const store = new MemoryStore();
  const prompt = store.formatForPrompt("anything", 100);
  assert.equal(prompt, "");
});
