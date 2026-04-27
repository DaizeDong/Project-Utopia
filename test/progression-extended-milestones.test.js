import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { EVENT_TYPES } from "../src/simulation/meta/GameEventBus.js";

function makeState(overrides = {}) {
  const state = createInitialGameState({ seed: 42 });
  state.gameplay.milestonesSeen = [];
  state.gameplay.milestoneBaseline = {
    warehouses: 0, farms: 0, lumbers: 0, kitchens: 0,
    meals: 0, tools: 0, clinics: 0, smithies: 0, medicine: 0,
    haulDeliveredLife: 0, __devNever__: 0,
  };
  Object.assign(state.buildings, overrides.buildings ?? {});
  Object.assign(state.resources, overrides.resources ?? {});
  Object.assign(state.metrics, overrides.metrics ?? {});
  if (overrides.devIndexSmoothed !== undefined) {
    state.gameplay.devIndexSmoothed = overrides.devIndexSmoothed;
  }
  return state;
}

function milestoneEvents(state) {
  return (state.events.log ?? []).filter((e) => e.type === EVENT_TYPES.COLONY_MILESTONE);
}

describe("progression extended milestones", () => {
  it("A: clinics=1 after baseline 0 emits first_clinic", () => {
    const state = makeState({ buildings: { clinics: 1 } });
    const sys = new ProgressionSystem();
    sys.update(0.1, state);
    const events = milestoneEvents(state);
    assert.ok(events.some((e) => e.detail.kind === "first_clinic"), "first_clinic not emitted");
  });

  it("B: devIndexSmoothed=41 emits dev_40", () => {
    const state = makeState({ devIndexSmoothed: 41 });
    const sys = new ProgressionSystem();
    sys.update(0.1, state);
    const events = milestoneEvents(state);
    assert.ok(events.some((e) => e.detail.kind === "dev_40"), "dev_40 not emitted");
  });

  it("C: devIndexSmoothed=61 emits dev_60 only once on re-tick", () => {
    const state = makeState({ devIndexSmoothed: 61 });
    const sys = new ProgressionSystem();
    sys.update(0.1, state);
    sys.update(0.1, state);
    const dev60 = milestoneEvents(state).filter((e) => e.detail.kind === "dev_60");
    assert.equal(dev60.length, 1, "dev_60 emitted more than once");
  });

  it("D: haulDeliveredLife=5 emits first_haul_delivery", () => {
    const state = makeState({ metrics: { haulDeliveredLife: 5 } });
    const sys = new ProgressionSystem();
    sys.update(0.1, state);
    const events = milestoneEvents(state);
    assert.ok(events.some((e) => e.detail.kind === "first_haul_delivery"), "first_haul_delivery not emitted");
  });

  it("E: dev_40 already seen — does not re-emit on second update", () => {
    const state = makeState({ devIndexSmoothed: 45 });
    state.gameplay.milestonesSeen = ["dev_40"];
    const sys = new ProgressionSystem();
    sys.update(0.1, state);
    const dev40 = milestoneEvents(state).filter((e) => e.detail.kind === "dev_40");
    assert.equal(dev40.length, 0, "dev_40 re-emitted when already seen");
  });
});
