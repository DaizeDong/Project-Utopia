// v0.10.1-r4-A5 P0-2: zero-lumber safety net regression test.
// Mirrors the existing zero-farm@99 safety net (covered by colony-director.test.js).
// Spec: ZeroLumberProposer must push lumber@75 when buildings.lumbers === 0
// AND state.metrics.timeSec < 240. After the 240-sec window late-game
// expansion logic owns lumber pacing.
// v0.10.1-n R12 Plan-R12-wood-food-balance (A5 #1): priority lowered 95→75
// so food@99/100 / warehouse@82 / farm@70 emergency proposals preempt the
// lumber safety net. Because the proposer's @75 emission is now LOWER than
// the downstream phase-3 lumber@78 bootstrap branch, the type-dedupe inside
// assessColonyNeeds drops the @75 record. We therefore assert against the
// proposer's direct output (BuildProposer interface) rather than the deduped
// assessColonyNeeds output. The dedupe-survived record (lumber@78 with a
// different reason) preserves the safety-net intent: at least one lumber
// proposal always reaches the planner during the bootstrap window.

import test from "node:test";
import assert from "node:assert/strict";

import { assessColonyNeeds } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { ZeroLumberProposer } from "../src/simulation/ai/colony/BuildProposer.js";
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

function makeCtx({ lumbers = 0, timeSec = 60 } = {}) {
  return { buildings: { lumbers }, timeSec };
}

test("ZeroLumberProposer: emits lumber@75 when lumbers===0 and timeSec<240", () => {
  // R12 A5 #1: priority 95→75 so food/farm/warehouse emergency rules preempt.
  const state = makeState({ timeSec: 60, lumbers: 0 });
  const out = ZeroLumberProposer.evaluate(state, makeCtx({ lumbers: 0, timeSec: 60 }));
  assert.equal(out.length, 1, `expected one proposal; got ${JSON.stringify(out)}`);
  assert.equal(out[0].type, "lumber");
  assert.equal(out[0].priority, 75);
  assert.match(out[0].reason, /zero-lumber|safety net/i, "reason should reference safety-net intent");
});

test("ZeroLumberProposer: does NOT fire when at least one lumber exists", () => {
  const state = makeState({ timeSec: 60, lumbers: 1 });
  const out = ZeroLumberProposer.evaluate(state, makeCtx({ lumbers: 1, timeSec: 60 }));
  assert.deepEqual(out, [], "safety net should not fire when lumbers>=1");
});

test("ZeroLumberProposer: does NOT fire after the 240s window closes", () => {
  const state = makeState({ timeSec: 250, lumbers: 0 });
  const out = ZeroLumberProposer.evaluate(state, makeCtx({ lumbers: 0, timeSec: 250 }));
  assert.deepEqual(out, [], "safety net should expire after 240s — late-game logistics owns pacing");
});

test("ZeroLumberProposer: ratio gate suppresses proposal when wood > food * maxWoodPerFarmRatio", () => {
  // R12 A5 #1: even with lumbers=0 and timeSec<240, if wood/food > 5 the
  // colony is wood-saturated; let food rules drive instead.
  const state = makeState({ timeSec: 60, lumbers: 0, food: 50, wood: 300 });
  const out = ZeroLumberProposer.evaluate(state, makeCtx({ lumbers: 0, timeSec: 60 }));
  assert.deepEqual(out, [], "ratio gate should suppress lumber@75 when wood/food > 5");
});

test("ZeroLumberProposer: ratio gate stays open at the boundary (wood = food * 5)", () => {
  // Boundary: wood === food * 5 → gate uses strict `>`, so still emits.
  const state = makeState({ timeSec: 60, lumbers: 0, food: 50, wood: 250 });
  const out = ZeroLumberProposer.evaluate(state, makeCtx({ lumbers: 0, timeSec: 60 }));
  assert.equal(out.length, 1, "boundary wood===food*5 should NOT trigger gate");
  assert.equal(out[0].priority, 75);
});

test("ZeroLumberProposer: ratio gate skipped when food === 0 (preserves bootstrap)", () => {
  // Defensive: food===0 disables the gate so the bootstrap proposal still
  // fires (avoids div-by-zero / always-suppress when colony has no food yet).
  const state = makeState({ timeSec: 60, lumbers: 0, food: 0, wood: 100 });
  const out = ZeroLumberProposer.evaluate(state, makeCtx({ lumbers: 0, timeSec: 60 }));
  assert.equal(out.length, 1, "gate should be skipped when food===0");
  assert.equal(out[0].priority, 75);
});

test("ZeroLumberProposer: emits at priority 75 (NOT 95) — R12 negative regression", () => {
  const state = makeState({ timeSec: 60, lumbers: 0 });
  const out = ZeroLumberProposer.evaluate(state, makeCtx({ lumbers: 0, timeSec: 60 }));
  assert.notEqual(out[0]?.priority, 95, "ZeroLumberProposer no longer emits priority=95 (R12 lowered to 75)");
});

test("assessColonyNeeds: still produces a lumber proposal during bootstrap (intent preserved)", () => {
  // The deduped output should still contain SOME lumber record so the
  // planner has a candidate during the bootstrap window. This guards the
  // intent of the original safety net even though the @75 ZeroLumber
  // emission is shadowed by the higher-priority phase-3 lumber@78.
  const state = makeState({ timeSec: 60, lumbers: 0 });
  const needs = assessColonyNeeds(state);
  const lumber = needs.find((n) => n.type === "lumber");
  assert.ok(
    lumber,
    `bootstrap output should still include some lumber record; got: ${JSON.stringify(needs.map(n => ({ t: n.type, p: n.priority })))}`,
  );
});
