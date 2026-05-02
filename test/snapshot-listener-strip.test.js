import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { makeSerializableSnapshot, restoreSnapshotState } from "../src/app/snapshotService.js";

// A1-stability-hunter Round 3 P0:
// Save Snapshot used to throw `DataCloneError` whenever a stray listener
// (e.g. a `(event) => this.#handleDeathToastEvent(event)` callback) leaked
// into `state` via NPC.deathListeners or an event-bus back-reference.
// `stripUncloneable` is the fix — it walks the state graph and drops
// function-valued fields before structuredClone runs.
test("makeSerializableSnapshot strips function-valued fields without throwing", () => {
  const state = createInitialGameState({ seed: 42 });
  // Plant a stray listener at the top level — exactly the shape that
  // crashed Save Snapshot in the wild.
  state.__deathListener = (event) => event;
  // And one nested two layers deep, to exercise recursion.
  state.metrics.__leakedHandler = function leaked() { return 1; };
  // And one inside an array, to exercise array-recursion.
  state.weather.hazardFronts = [{ label: "x", __cb: () => null }];

  let snapshot;
  assert.doesNotThrow(() => {
    snapshot = makeSerializableSnapshot(state);
  }, "makeSerializableSnapshot must not throw on listener-bearing state");

  assert.equal(snapshot.__deathListener, undefined,
    "function fields must be dropped at the top level");
  assert.equal(snapshot.metrics.__leakedHandler, undefined,
    "function fields must be dropped at nested depth");
  assert.equal(snapshot.weather.hazardFronts[0].__cb, undefined,
    "function fields must be dropped inside arrays");
  // The legitimate sibling field on the same object must be preserved.
  assert.equal(snapshot.weather.hazardFronts[0].label, "x");
});

test("snapshot restore round-trips after stripUncloneable scrub", () => {
  const state = createInitialGameState({ seed: 99 });
  state.__leak = () => 1;
  state.resources.food = 123;
  const serialized = makeSerializableSnapshot(state);
  const round = JSON.parse(JSON.stringify(serialized));
  const restored = restoreSnapshotState(round);
  assert.equal(restored.resources.food, 123);
  assert.equal(restored.__leak, undefined);
});
