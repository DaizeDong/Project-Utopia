import test from "node:test";
import assert from "node:assert/strict";

import {
  createLeaderboardService,
  recordRunResultFromState,
} from "../src/app/leaderboardService.js";

// v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 7c) — end-phase integration
// contract: when a run ends, the speedrunner should be able to open the
// boot screen and see their score. This test does not stand up a full
// GameApp; it asserts the seam (`recordRunResultFromState` → leaderboard)
// that GameApp #evaluateRunOutcome wires.

function fakeStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _map: map,
  };
}

test("speedrunner finishes a run and the next boot screen reads their entry", () => {
  // Storage round-trip: write with svcA, read with svcB so we prove the
  // entry survived the JSON serialise/deserialise cycle.
  const storage = fakeStorage();
  const svcA = createLeaderboardService(storage);

  // Minimal end-phase state shape — mirrors what GameApp passes when the
  // colony is wiped at survival score 1234.
  const state = {
    world: { mapSeed: 42, mapTemplateId: "temperate_plains", mapTemplateName: "Temperate Plains" },
    gameplay: { scenario: { id: "default" }, devIndexSmoothed: 51 },
    metrics: { timeSec: 600, survivalScore: 1234, deathsTotal: 7, populationStats: { workers: 0 } },
    session: { outcome: "loss" },
  };

  const writeResult = recordRunResultFromState(state, svcA);
  assert.equal(writeResult.ok, true, "recordRunResultFromState must succeed");
  assert.equal(writeResult.persisted, true, "fakeStorage write must succeed");

  // Now imagine the player reloads the page and the boot screen mounts a
  // fresh leaderboard service against the same storage.
  const svcB = createLeaderboardService(storage);
  const top = svcB.listTopByScore(10);

  assert.equal(top.length, 1, "exactly 1 entry after a single run");
  assert.equal(top[0].seed, "42", "seed survives the storage round-trip");
  assert.equal(top[0].score, 1234, "score survives the storage round-trip");
  assert.equal(top[0].cause, "loss", "cause defaults to outcome");
  assert.equal(top[0].templateName, "Temperate Plains", "template name preserved");
});

test("benchmark mode bypass: recordRunResultFromState is opt-in (caller decides)", () => {
  // Defensive contract: the helper itself does NOT consult state.benchmarkMode.
  // GameApp #evaluateRunOutcome owns the bypass decision (see :1841 comment).
  // This test pins the contract so a future refactor doesn't accidentally
  // teach the helper to skip the benchmark, breaking the GameApp seam.
  const storage = fakeStorage();
  const svc = createLeaderboardService(storage);
  const state = {
    benchmarkMode: true,
    world: { mapSeed: 7 },
    gameplay: { scenario: { id: "bench" }, devIndexSmoothed: 80 },
    metrics: { timeSec: 9000, survivalScore: 9999, populationStats: { workers: 0 } },
    session: { outcome: "loss" },
  };
  // The helper records regardless — caller is responsible for skipping in benchmark mode.
  const result = recordRunResultFromState(state, svc);
  assert.equal(result.ok, true);
  assert.equal(svc.listTopByScore(1)[0].score, 9999);
});
