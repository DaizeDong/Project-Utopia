import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { EVENT_TYPES } from "../src/simulation/meta/GameEventBus.js";

test("ProgressionSystem emits milestone action message and dedupes repeats", () => {
  const state = createInitialGameState({ seed: 822 });
  const progression = new ProgressionSystem();
  state.gameplay.milestoneBaseline = {
    warehouses: state.buildings.warehouses,
    farms: 0,
    lumbers: state.buildings.lumbers,
    kitchens: state.buildings.kitchens,
    meals: 0,
    tools: 0,
  };
  state.gameplay.milestonesSeen = [];
  state.buildings.farms = 1;

  progression.update(0.1, state);
  progression.update(0.1, state);

  const events = (state.events.log ?? []).filter((event) => event.type === EVENT_TYPES.COLONY_MILESTONE);
  assert.equal(events.length, 1);
  assert.equal(events[0].detail.kind, "first_farm");
  assert.equal(state.controls.actionKind, "milestone");
  assert.match(state.controls.actionMessage, /First Farm/i);
});
