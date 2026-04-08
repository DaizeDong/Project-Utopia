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

  it("non-normal-cycle A→B→A oscillation counts as flip", () => {
    const state = makeState(10);
    const entity = makeEntity();
    // harvest→wander→harvest is not a normal cycle
    recordDesiredGoal(entity, "harvest", state, 10);
    recordDesiredGoal(entity, "wander", state, 10.5);
    recordDesiredGoal(entity, "harvest", state, 11);
    assert.equal(state.metrics.goalFlipCount, 1);
  });

  it("work cycle harvest→deliver→harvest is NOT a flip", () => {
    const state = makeState(10);
    const entity = makeEntity();
    recordDesiredGoal(entity, "harvest", state, 10);
    recordDesiredGoal(entity, "deliver", state, 10.5);
    recordDesiredGoal(entity, "harvest", state, 11);
    // This is a normal work cycle, not oscillation
    assert.equal(state.metrics.goalFlipCount, 0);
  });

  it("same state repeated is NOT a flip", () => {
    const state = makeState(10);
    const entity = makeEntity();
    recordDesiredGoal(entity, "harvest", state, 10);
    recordDesiredGoal(entity, "harvest", state, 11);
    assert.equal(state.metrics.goalFlipCount, 0);
  });

  it("oscillation outside 1.5s window is NOT a flip", () => {
    const state = makeState(10);
    const entity = makeEntity();
    // harvest→wander→harvest but with >1.5s gap
    recordDesiredGoal(entity, "harvest", state, 10);
    recordDesiredGoal(entity, "wander", state, 11);
    recordDesiredGoal(entity, "harvest", state, 13);
    assert.equal(state.metrics.goalFlipCount, 0);
  });

  it("independent entities tracked separately", () => {
    const state = makeState(10);
    const e1 = makeEntity("w1");
    const e2 = makeEntity("w2");
    // e1: harvest→wander→harvest = flip
    recordDesiredGoal(e1, "harvest", state, 10);
    recordDesiredGoal(e1, "wander", state, 10.5);
    recordDesiredGoal(e1, "harvest", state, 11);
    // e2: idle→seek_task→harvest = not a flip
    recordDesiredGoal(e2, "idle", state, 10);
    recordDesiredGoal(e2, "seek_task", state, 10.5);
    recordDesiredGoal(e2, "harvest", state, 11);
    assert.equal(state.metrics.goalFlipCount, 1);
  });

  it("multiple oscillations count independently", () => {
    const state = makeState(10);
    const entity = makeEntity();
    // harvest→deliver→harvest→deliver→harvest (work cycle — no flips expected)
    // Use non-cycle states for actual flip test
    recordDesiredGoal(entity, "harvest", state, 10);
    recordDesiredGoal(entity, "wander", state, 10.3);
    recordDesiredGoal(entity, "harvest", state, 10.6);    // flip 1
    recordDesiredGoal(entity, "wander", state, 10.9);
    recordDesiredGoal(entity, "harvest", state, 11.2);     // flip 3
    assert.equal(state.metrics.goalFlipCount, 3);
  });

  it("full work cycle with gaps produces zero flips", () => {
    const state = makeState(10);
    const entity = makeEntity();
    // Two full work cycles
    const cycle = ["idle", "seek_task", "harvest", "deliver"];
    let t = 10;
    for (let i = 0; i < 2; i++) {
      for (const s of cycle) {
        recordDesiredGoal(entity, s, state, t);
        t += 1.5;
      }
    }
    assert.equal(state.metrics.goalFlipCount, 0);
  });
});
