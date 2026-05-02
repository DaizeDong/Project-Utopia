// PF-milestone-tone-gate (R5 P1): first_meal and first_medicine are positive-
// tone milestones. They MUST be deferred during mass starvation so the green
// "Prepared food is reaching the colony" toast doesn't fire while colonists
// are dying from hunger. Once the colony recovers (criticalHungerRatio<0.30),
// the milestone re-fires.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { EVENT_TYPES } from "../src/simulation/meta/GameEventBus.js";

function freshState(seed = 8888) {
  const state = createInitialGameState({ seed });
  state.gameplay.milestonesSeen = [];
  state.gameplay.milestoneBaseline = {
    warehouses: 0, farms: 0, lumbers: 0, kitchens: 0,
    meals: 0, tools: 0, clinics: 0, smithies: 0, medicine: 0,
    haulDeliveredLife: 0, __devNever__: 0,
  };
  return state;
}

function setWorkers(state, count, hunger) {
  state.agents = [];
  for (let i = 0; i < count; i++) {
    state.agents.push({ type: "WORKER", alive: true, hunger });
  }
}

function milestoneEvents(state) {
  return (state.events.log ?? []).filter((e) => e.type === EVENT_TYPES.COLONY_MILESTONE);
}

describe("PF-milestone-tone-gate: first_meal/first_medicine", () => {
  it("starving colony does NOT toast first_meal even after a meal lands", () => {
    const state = freshState();
    setWorkers(state, 10, 0.10); // 100% critical hunger → suppress
    state.resources.meals = 1; // would trigger first_meal

    const sys = new ProgressionSystem();
    sys.update(0.1, state);

    const events = milestoneEvents(state);
    assert.equal(
      events.filter((e) => e.detail.kind === "first_meal").length,
      0,
      "first_meal must be deferred while colony is starving",
    );
    assert.ok(!state.gameplay.milestonesSeen.includes("first_meal"),
      "first_meal must NOT be marked as seen on suppression — must re-fire later");
  });

  it("starving colony does NOT toast first_medicine even after medicine brews", () => {
    const state = freshState();
    setWorkers(state, 10, 0.10);
    state.resources.medicine = 1;

    const sys = new ProgressionSystem();
    sys.update(0.1, state);

    const events = milestoneEvents(state);
    assert.equal(
      events.filter((e) => e.detail.kind === "first_medicine").length,
      0,
      "first_medicine must be deferred while colony is starving",
    );
    assert.ok(!state.gameplay.milestonesSeen.includes("first_medicine"));
  });

  it("healthy colony emits first_meal normally", () => {
    const state = freshState();
    setWorkers(state, 10, 0.85); // well-fed
    state.resources.meals = 1;

    const sys = new ProgressionSystem();
    sys.update(0.1, state);

    const events = milestoneEvents(state);
    assert.equal(
      events.filter((e) => e.detail.kind === "first_meal").length,
      1,
      "first_meal must emit when colony is well-fed",
    );
  });
});
