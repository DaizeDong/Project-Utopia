import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recordDesiredGoal } from "../src/simulation/npc/state/StatePlanner.js";

function makeState(timeSec = 10) {
  return {
    metrics: { timeSec, goalFlipCount: 0 },
    debug: { logic: { lastGoalsByEntity: {}, prevPrevGoalsByEntity: {}, goalFlipCount: 0 } },
  };
}

function makeEntity(id = "w1") {
  return { id, debug: {} };
}

describe("recordDesiredGoal oscillation detection", () => {
  it("forward progression does NOT count as flip", () => {
    const state = makeState(10);
    const entity = makeEntity();
    recordDesiredGoal(entity, "idle", state, 10);
    recordDesiredGoal(entity, "seek_task", state, 11);
    recordDesiredGoal(entity, "harvest", state, 12);
    recordDesiredGoal(entity, "deliver", state, 12.5);
    assert.equal(state.metrics.goalFlipCount, 0);
  });

  it("A→B→A oscillation counts as flip", () => {
    const state = makeState(10);
    const entity = makeEntity();
    recordDesiredGoal(entity, "harvest", state, 10);
    recordDesiredGoal(entity, "deliver", state, 11);
    recordDesiredGoal(entity, "harvest", state, 12);
    assert.equal(state.metrics.goalFlipCount, 1);
  });

  it("same state repeated is NOT a flip", () => {
    const state = makeState(10);
    const entity = makeEntity();
    recordDesiredGoal(entity, "harvest", state, 10);
    recordDesiredGoal(entity, "harvest", state, 11);
    assert.equal(state.metrics.goalFlipCount, 0);
  });

  it("oscillation outside 3s window is NOT a flip", () => {
    const state = makeState(10);
    const entity = makeEntity();
    recordDesiredGoal(entity, "harvest", state, 10);
    recordDesiredGoal(entity, "deliver", state, 11);
    recordDesiredGoal(entity, "harvest", state, 15);
    assert.equal(state.metrics.goalFlipCount, 0);
  });

  it("independent entities tracked separately", () => {
    const state = makeState(10);
    const e1 = makeEntity("w1");
    const e2 = makeEntity("w2");
    recordDesiredGoal(e1, "harvest", state, 10);
    recordDesiredGoal(e1, "deliver", state, 11);
    recordDesiredGoal(e1, "harvest", state, 12); // flip for e1
    recordDesiredGoal(e2, "idle", state, 10);
    recordDesiredGoal(e2, "seek_task", state, 11);
    recordDesiredGoal(e2, "harvest", state, 12); // not a flip
    assert.equal(state.metrics.goalFlipCount, 1);
  });

  it("multiple oscillations count independently", () => {
    const state = makeState(10);
    const entity = makeEntity();
    recordDesiredGoal(entity, "harvest", state, 10);
    recordDesiredGoal(entity, "deliver", state, 10.5);
    recordDesiredGoal(entity, "harvest", state, 11);   // flip 1
    recordDesiredGoal(entity, "deliver", state, 11.5);
    recordDesiredGoal(entity, "harvest", state, 12);   // flip 3
    assert.equal(state.metrics.goalFlipCount, 3);
  });

  it("full work cycle with gaps produces zero flips", () => {
    const state = makeState(10);
    const entity = makeEntity();
    // Two full work cycles with sufficient spacing
    // idle(10) → seek_task(11.5) → harvest(13) → deliver(14.5) → idle(16) → seek_task(17.5) → harvest(19) → deliver(20.5)
    const cycle = ["idle", "seek_task", "harvest", "deliver"];
    let t = 10;
    for (let i = 0; i < 2; i++) {
      for (const s of cycle) {
        recordDesiredGoal(entity, s, state, t);
        t += 1.5;
      }
    }
    // seek_task at 11.5 and 17.5 = 6s gap > 3s, so no flip
    assert.equal(state.metrics.goalFlipCount, 0);
  });
});
