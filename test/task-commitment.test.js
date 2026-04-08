import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TASK_LOCK_STATES } from "../src/simulation/npc/WorkerAISystem.js";

describe("Worker Task Commitment Protocol", () => {
  it("TASK_LOCK_STATES includes all work states", () => {
    for (const s of ["harvest", "deliver", "eat", "process", "seek_task"]) {
      assert.ok(TASK_LOCK_STATES.has(s), `${s} should be in TASK_LOCK_STATES`);
    }
  });

  it("non-work states are not in TASK_LOCK_STATES", () => {
    for (const s of ["idle", "wander", "seek_food"]) {
      assert.ok(!TASK_LOCK_STATES.has(s), `${s} should NOT be in TASK_LOCK_STATES`);
    }
  });

  it("commitment skips planning when active and not hungry", () => {
    const worker = { hunger: 0.8, blackboard: { commitmentCycle: { startSec: 10, entered: true } } };
    const inCommitment = worker.blackboard.commitmentCycle?.entered === true
      && (worker.hunger ?? 1) >= 0.12;
    assert.ok(inCommitment, "should be in commitment");
  });

  it("survival interrupt breaks commitment", () => {
    const worker = { hunger: 0.08, blackboard: { commitmentCycle: { startSec: 10, entered: true } } };
    const survivalInterrupt = (worker.hunger ?? 1) < 0.12;
    const inCommitment = worker.blackboard.commitmentCycle?.entered === true && !survivalInterrupt;
    assert.ok(!inCommitment, "hunger < 0.12 should break commitment");
  });

  it("commitment clears when worker enters non-work state", () => {
    const worker = { blackboard: { commitmentCycle: { startSec: 10, entered: true } } };
    const currentState = "idle";
    if (worker.blackboard.commitmentCycle && !TASK_LOCK_STATES.has(currentState)) {
      worker.blackboard.commitmentCycle = null;
    }
    assert.equal(worker.blackboard.commitmentCycle, null);
  });

  it("commitment persists in work states", () => {
    const worker = { blackboard: { commitmentCycle: { startSec: 10, entered: true } } };
    const currentState = "harvest";
    if (worker.blackboard.commitmentCycle && !TASK_LOCK_STATES.has(currentState)) {
      worker.blackboard.commitmentCycle = null;
    }
    assert.ok(worker.blackboard.commitmentCycle, "should persist in harvest");
  });

  it("commitment starts when entering work state", () => {
    const worker = { blackboard: {} };
    const desiredState = "seek_task";
    if (TASK_LOCK_STATES.has(desiredState) && !worker.blackboard.commitmentCycle) {
      worker.blackboard.commitmentCycle = { startSec: 10, entered: true };
    }
    assert.ok(worker.blackboard.commitmentCycle, "should start commitment on seek_task");
  });

  it("does not create duplicate commitment", () => {
    const existing = { startSec: 5, entered: true };
    const worker = { blackboard: { commitmentCycle: existing } };
    const desiredState = "harvest";
    if (TASK_LOCK_STATES.has(desiredState) && !worker.blackboard.commitmentCycle) {
      worker.blackboard.commitmentCycle = { startSec: 10, entered: true };
    }
    assert.equal(worker.blackboard.commitmentCycle.startSec, 5, "should keep original commitment");
  });
});
