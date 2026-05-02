import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { makeSerializableSnapshot, restoreSnapshotState } from "../src/app/snapshotService.js";

// A1-stability-hunter Round 3 P0:
// SceneRenderer.js (lines 1978/2085/2222/2245/2904) calls
// `state.grid.tileState.get(idx)`. Pre-fix, the Save → JSON.stringify →
// JSON.parse → restore round-trip downgraded the Map to {} (or undefined)
// and crashed the very next render with "tileState.get is not a function".
// This test pins the contract by simulating the localStorage path
// (stringify/parse) explicitly, not just an in-process structuredClone
// roundtrip.
test("snapshot roundtrip preserves grid.tileState as Map after JSON serialization", () => {
  const state = createInitialGameState({ seed: 2026 });
  // Inject a known entry so we can verify field-level fidelity.
  state.grid.tileState.set(5, { fertility: 0.92, salinized: 0.1, fallowUntil: 0, yieldPool: 99, nodeFlags: 2 });

  const serialized = makeSerializableSnapshot(state, { initialSeed: 1, state: 2, calls: 3 });
  // Simulate the localStorage write/read cycle that exposed the bug.
  const round = JSON.parse(JSON.stringify(serialized));
  const restored = restoreSnapshotState(round);

  assert.equal(restored.grid.tileState instanceof Map, true,
    "grid.tileState must be a Map so SceneRenderer.tileState.get(idx) works");
  const entry = restored.grid.tileState.get(5);
  assert.ok(entry, "expected restored tileState entry at idx=5");
  assert.equal(entry.yieldPool, 99);
  assert.equal(entry.nodeFlags, 2);
  assert.equal(entry.fertility, 0.92);
});

// Defensive: legacy snapshots saved before this fix may have tileState as
// a plain object or missing entirely. Restore must not throw and must hand
// the renderer a usable Map.
test("snapshot restore tolerates missing or legacy tileState", () => {
  const state = createInitialGameState({ seed: 7 });
  const serialized = makeSerializableSnapshot(state);
  const round = JSON.parse(JSON.stringify(serialized));
  // Simulate a legacy payload that lost the Map shape entirely.
  delete round.grid.tileState;
  const restored = restoreSnapshotState(round);
  assert.equal(restored.grid.tileState instanceof Map, true);
  // Sanity: still a usable empty Map (no crash on .get).
  assert.equal(restored.grid.tileState.get(0), undefined);
});
