import test from "node:test";
import assert from "node:assert/strict";

import { transitionEntityState } from "../src/simulation/npc/state/StateGraph.js";

function makeEntity() {
  return {
    blackboard: {},
    debug: {},
    stateLabel: "Idle",
  };
}

test("worker state graph transitions through seek_task before deliver", () => {
  const worker = makeEntity();

  const s1 = transitionEntityState(worker, "workers", "deliver", 0, "rule:deliver", { force: true });
  assert.equal(s1, "seek_task");
  assert.equal(worker.blackboard.fsm.previousState, "idle");

  const s2 = transitionEntityState(worker, "workers", "deliver", 1.0, "rule:deliver");
  assert.equal(s2, "deliver");
});

test("saboteur state graph transitions through scout before sabotage", () => {
  const visitor = makeEntity();

  const s1 = transitionEntityState(visitor, "saboteurs", "sabotage", 0, "rule:sabotage", { force: true });
  assert.equal(s1, "scout");

  const s2 = transitionEntityState(visitor, "saboteurs", "sabotage", 1.0, "rule:sabotage");
  assert.equal(s2, "sabotage");
});
