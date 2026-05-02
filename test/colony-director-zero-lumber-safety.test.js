// v0.10.1-r4-A5 P0-2: zero-lumber safety net regression test.
// Mirrors the existing zero-farm@99 safety net (covered by colony-director.test.js).
// Spec: assessColonyNeeds must push lumber@95 when buildings.lumbers === 0
// AND state.metrics.timeSec < 240. After the 240-sec window late-game
// expansion logic owns lumber pacing.

import test from "node:test";
import assert from "node:assert/strict";

import { assessColonyNeeds } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

function makeState({ timeSec = 60, food = 200, wood = 50, lumbers = 0, farms = 1 } = {}) {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.resources = { food, wood, stone: 10, herbs: 0, meals: 0, medicine: 0, tools: 0 };
  state.buildings = rebuildBuildingStats(state.grid);
  state.buildings.lumbers = lumbers;
  state.buildings.farms = farms;
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = timeSec;
  state.ai.enabled = true;
  return state;
}

test("zero-lumber safety net: emits lumber@95 when lumbers===0 and timeSec<240", () => {
  const state = makeState({ timeSec: 60, lumbers: 0 });
  const needs = assessColonyNeeds(state);
  const lumber = needs.find((n) => n.type === "lumber" && n.priority === 95);
  assert.ok(
    lumber,
    `expected lumber@95 safety net need; got: ${JSON.stringify(needs.map(n => ({ t: n.type, p: n.priority })))}`,
  );
  assert.match(lumber.reason, /zero-lumber|safety net/i, "reason should reference safety-net intent");
});

test("zero-lumber safety net: does NOT fire when at least one lumber exists", () => {
  const state = makeState({ timeSec: 60, lumbers: 1 });
  const needs = assessColonyNeeds(state);
  // After the safety net is gone, we may still see lumber via emergency or
  // bootstrap branches; what we assert is that the *safety-net* (priority 95
  // with the specific zero-lumber reason) is absent.
  const safetyNet = needs.find(
    (n) => n.type === "lumber" && n.priority === 95 && /zero-lumber/i.test(n.reason ?? ""),
  );
  assert.equal(safetyNet, undefined, "safety net should not fire when lumbers>=1");
});

test("zero-lumber safety net: does NOT fire after the 240s window closes", () => {
  const state = makeState({ timeSec: 250, lumbers: 0 });
  const needs = assessColonyNeeds(state);
  const safetyNet = needs.find(
    (n) => n.type === "lumber" && n.priority === 95 && /zero-lumber/i.test(n.reason ?? ""),
  );
  assert.equal(safetyNet, undefined, "safety net should expire after 240s — late-game logistics owns pacing");
});
