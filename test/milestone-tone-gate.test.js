// PF-milestone-tone-gate (R5 P1): positive milestones (pop_30/dev_60/dev_80/
// first_meal/first_medicine) must be deferred when criticalHungerRatio
// (workers with hunger<0.20 / alive workers) >= 0.30. Skip MUST NOT mark
// the rule as `seen` so it re-fires once the colony recovers.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { EVENT_TYPES } from "../src/simulation/meta/GameEventBus.js";

function freshState(seed = 7777) {
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
  // Replace state.agents with a deterministic worker pool at the requested
  // hunger level so colonyToneOk has a stable input.
  state.agents = [];
  for (let i = 0; i < count; i++) {
    state.agents.push({
      type: "WORKER",
      alive: true,
      hunger,
    });
  }
}

function milestoneEvents(state) {
  return (state.events.log ?? []).filter((e) => e.type === EVENT_TYPES.COLONY_MILESTONE);
}

describe("PF-milestone-tone-gate: dev/pop milestones", () => {
  it("starving colony (criticalHungerRatio>=0.30) suppresses dev_60 and pop_30", () => {
    const state = freshState();
    // 10 workers, 5 starving (hunger=0.10) → ratio 0.50 >= 0.30 → suppress
    setWorkers(state, 10, 0.10);
    // First half remains starving; ensure population trigger is met (>= 30).
    // Use 30 starving workers to also trigger pop_30.
    setWorkers(state, 30, 0.10);
    state.gameplay.devIndexSmoothed = 65; // would trigger dev_60

    const sys = new ProgressionSystem();
    sys.update(0.1, state);

    const events = milestoneEvents(state);
    assert.equal(
      events.filter((e) => e.detail.kind === "dev_60").length,
      0,
      "dev_60 should NOT emit during mass starvation",
    );
    assert.equal(
      events.filter((e) => e.detail.kind === "pop_30").length,
      0,
      "pop_30 should NOT emit during mass starvation",
    );
    // Crucially: not marked as seen, so re-fires later.
    assert.ok(!state.gameplay.milestonesSeen.includes("dev_60"));
    assert.ok(!state.gameplay.milestonesSeen.includes("pop_30"));
  });

  it("recovered colony (no critical hunger) emits previously-suppressed milestones", () => {
    const state = freshState();
    setWorkers(state, 30, 0.10); // starving
    state.gameplay.devIndexSmoothed = 65;

    const sys = new ProgressionSystem();
    sys.update(0.1, state);
    assert.equal(milestoneEvents(state).filter((e) => e.detail.kind === "dev_60").length, 0);

    // Heal hunger across the entire population; tone-gate should clear.
    for (const a of state.agents) a.hunger = 0.85;
    sys.update(0.1, state);

    const events = milestoneEvents(state);
    assert.equal(
      events.filter((e) => e.detail.kind === "dev_60").length,
      1,
      "dev_60 should now fire after recovery",
    );
    assert.equal(
      events.filter((e) => e.detail.kind === "pop_30").length,
      1,
      "pop_30 should now fire after recovery",
    );
  });

  it("neutral milestones (first_farm) are NOT gated by tone", () => {
    const state = freshState();
    setWorkers(state, 10, 0.05); // mass starvation
    state.buildings.farms = 1; // would trigger first_farm

    const sys = new ProgressionSystem();
    sys.update(0.1, state);

    const events = milestoneEvents(state);
    assert.equal(
      events.filter((e) => e.detail.kind === "first_farm").length,
      1,
      "first_farm is not in POSITIVE_TONE_MILESTONES — should still emit",
    );
  });
});
