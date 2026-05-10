// Verifies importance-aware eviction in MemoryStore (P1 fix, reviewer round 2).
//
// Pre-fix: anchors at t=0 with importance=5 were FIFO-evicted as soon as the
//   51st routine observation landed → E5 long-horizon recall always 0.
// Post-fix: importance-aware FIFO drops oldest low-importance (≤2) first;
//   anchors (importance=5) survive arbitrary numbers of routine observations.

import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";

test("MemoryStore: importance=5 anchor survives routine flood", () => {
  const store = new MemoryStore({ maxObservations: 10 });
  // Inject 1 high-importance anchor at t=0.
  store.addObservation(0, "ANCHOR-WAREHOUSE-12-8", "anchor", 5);
  // Inject 50 routine importance=1 observations.
  for (let i = 0; i < 50; i++) {
    store.addObservation(i + 1, `routine event ${i}`, "tick", 1);
  }
  // The anchor must survive — only routine observations may be evicted.
  const found = store.observations.find(o => o.text === "ANCHOR-WAREHOUSE-12-8");
  assert.ok(found, "anchor (importance=5) was evicted by routine observations");
  assert.equal(found.importance, 5);
  assert.equal(store.observations.length, 10);
});

test("MemoryStore: multiple anchors at importance=5 all survive", () => {
  const store = new MemoryStore({ maxObservations: 10 });
  for (let i = 0; i < 5; i++) {
    store.addObservation(i, `ANCHOR-${i}`, "anchor", 5);
  }
  for (let i = 0; i < 30; i++) {
    store.addObservation(i + 100, `routine ${i}`, "tick", 1);
  }
  const anchors = store.observations.filter(o => o.importance === 5);
  assert.equal(anchors.length, 5, "all 5 anchors should survive");
});

test("MemoryStore: when ALL high-importance, falls back to oldest-first FIFO", () => {
  const store = new MemoryStore({ maxObservations: 5 });
  // Fill with 6 importance=5 entries — must drop one because no low-importance exists
  for (let i = 0; i < 6; i++) {
    store.addObservation(i, `imp5-${i}`, "anchor", 5);
  }
  assert.equal(store.observations.length, 5);
  // Oldest (i=0) was dropped.
  assert.ok(!store.observations.find(o => o.text === "imp5-0"));
  assert.ok(store.observations.find(o => o.text === "imp5-5"));
});

test("MemoryStore: importance=2 boundary — still evictable as 'low'", () => {
  const store = new MemoryStore({ maxObservations: 3 });
  store.addObservation(0, "imp5", "anchor", 5);
  store.addObservation(1, "imp3", "tick", 3);
  store.addObservation(2, "imp2", "tick", 2);
  store.addObservation(3, "imp1", "tick", 1); // evicts imp2 (oldest ≤2)
  const texts = store.observations.map(o => o.text);
  assert.deepEqual(texts.sort(), ["imp1", "imp3", "imp5"]);
});

test("MemoryStore: importance=3 NOT evicted while importance=2 exists", () => {
  const store = new MemoryStore({ maxObservations: 3 });
  store.addObservation(0, "imp3", "tick", 3);
  store.addObservation(1, "imp5", "anchor", 5);
  store.addObservation(2, "imp2", "tick", 2);
  store.addObservation(3, "new-imp1", "tick", 1); // evicts imp2 not imp3
  const texts = store.observations.map(o => o.text);
  assert.ok(texts.includes("imp3"));
  assert.ok(texts.includes("imp5"));
  assert.ok(texts.includes("new-imp1"));
  assert.ok(!texts.includes("imp2"));
});
