import test from "node:test";
import assert from "node:assert/strict";

import {
  createLeaderboardService,
  recordRunResultFromState,
  LEADERBOARD_STORAGE_KEY,
  LEADERBOARD_MAX_ENTRIES,
} from "../src/app/leaderboardService.js";

// v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 7a) — leaderboardService unit
// tests. Storage backend is faked with an in-memory Map so the test runs
// fully offline. The Round-6 plan §4 Step 7a calls for 5 cases:
//   1. recordRunResult writes; listTopByScore returns desc-by-score.
//   2. >20 entries truncated to top-20.
//   3. setItem throwing does NOT throw out of recordRunResult.
//   4. corrupt JSON in storage returns [] from list calls.
//   5. clear() empties both in-memory and storage.

function fakeStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _map: map,
  };
}

function brokenSetItemStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem(k) { map.delete(k); },
    _map: map,
  };
}

test("recordRunResult orders entries by score desc", () => {
  const storage = fakeStorage();
  const svc = createLeaderboardService(storage);
  svc.recordRunResult({ ts: 1000, seed: "a", score: 100 });
  svc.recordRunResult({ ts: 1100, seed: "b", score: 500 });
  svc.recordRunResult({ ts: 1200, seed: "c", score: 250 });
  const top = svc.listTopByScore();
  assert.equal(top.length, 3, "all three records visible");
  assert.equal(top[0].seed, "b", "score 500 first");
  assert.equal(top[1].seed, "c", "score 250 second");
  assert.equal(top[2].seed, "a", "score 100 third");
});

test("listTopByScore truncates above LEADERBOARD_MAX_ENTRIES", () => {
  const storage = fakeStorage();
  const svc = createLeaderboardService(storage);
  for (let i = 0; i < LEADERBOARD_MAX_ENTRIES + 5; i += 1) {
    svc.recordRunResult({ ts: 2000 + i, seed: `s${i}`, score: i * 10 });
  }
  const all = svc.listTopByScore(100);
  assert.equal(all.length, LEADERBOARD_MAX_ENTRIES, "list capped at MAX_ENTRIES");
  // The 5 lowest-score entries should have been dropped.
  assert.ok(
    !all.some((e) => e.score < 50),
    "lowest 5 entries pruned by score-desc retention",
  );
});

test("recordRunResult swallows storage write failures and returns persisted=false", () => {
  const storage = brokenSetItemStorage();
  const svc = createLeaderboardService(storage);
  let result;
  assert.doesNotThrow(() => {
    result = svc.recordRunResult({ ts: 3000, seed: "z", score: 999 });
  }, "QuotaExceededError must not throw out of recordRunResult");
  assert.equal(result.ok, true, "in-memory write succeeded");
  assert.equal(result.persisted, false, "persisted flag reflects storage failure");
  // The entry should still be visible on the in-memory list (current session).
  assert.equal(svc.listTopByScore()[0].seed, "z");
});

test("corrupt JSON on load returns an empty list", () => {
  const storage = fakeStorage();
  storage.setItem(LEADERBOARD_STORAGE_KEY, "{not valid json[");
  const svc = createLeaderboardService(storage);
  assert.deepEqual(svc.listTopByScore(), [], "corrupt JSON must yield []");
  assert.deepEqual(svc.listRecent(), [], "corrupt JSON must yield [] for listRecent too");
});

test("clear() empties both in-memory cache and storage", () => {
  const storage = fakeStorage();
  const svc = createLeaderboardService(storage);
  svc.recordRunResult({ ts: 4000, seed: "q", score: 1234 });
  assert.equal(svc.listTopByScore().length, 1);
  svc.clear();
  assert.equal(svc.listTopByScore().length, 0);
  assert.equal(storage.getItem(LEADERBOARD_STORAGE_KEY), null, "storage key removed");
});

test("findRankBySeed returns 1-based rank within score-desc list", () => {
  const storage = fakeStorage();
  const svc = createLeaderboardService(storage);
  svc.recordRunResult({ ts: 5000, seed: "alpha", score: 50 });
  svc.recordRunResult({ ts: 5001, seed: "beta", score: 200 });
  svc.recordRunResult({ ts: 5002, seed: "gamma", score: 100 });
  const beta = svc.findRankBySeed("beta");
  assert.equal(beta.rank, 1, "beta is the highest-score entry");
  assert.equal(beta.total, 3);
  const missing = svc.findRankBySeed("zzz");
  assert.equal(missing.rank, 0, "missing seed returns rank=0");
  assert.equal(missing.total, 3);
});

test("recordRunResultFromState extracts all the GameApp fields", () => {
  const storage = fakeStorage();
  const svc = createLeaderboardService(storage);
  const state = {
    world: { mapSeed: 42, mapTemplateId: "temperate_plains", mapTemplateName: "Temperate Plains" },
    gameplay: { scenario: { id: "default" }, devIndexSmoothed: 47 },
    metrics: { timeSec: 600, survivalScore: 1234, deathsTotal: 4, populationStats: { workers: 9 } },
    session: { outcome: "loss" },
  };
  recordRunResultFromState(state, svc);
  const top = svc.listTopByScore(1);
  assert.equal(top.length, 1);
  assert.equal(top[0].seed, "42");
  assert.equal(top[0].score, 1234);
  assert.equal(top[0].devIndex, 47);
  assert.equal(top[0].deaths, 4);
  assert.equal(top[0].workers, 9);
  assert.equal(top[0].cause, "loss");
  assert.equal(top[0].templateName, "Temperate Plains");
});
