import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";

test("ProgressionSystem applies doctrine modifiers", () => {
  const state = createInitialGameState();
  const system = new ProgressionSystem();

  state.controls.doctrine = "agrarian";
  system.update(0.5, state);

  assert.equal(state.gameplay.doctrine, "agrarian");
  assert.ok(state.gameplay.modifiers.farmYield > 1);
  assert.ok(state.gameplay.modifiers.lumberYield < 1);
});

test("ProgressionSystem completes stockpile objective and grants reward", () => {
  const state = createInitialGameState();
  const system = new ProgressionSystem();

  state.resources.food = 120;
  state.resources.wood = 120;

  system.update(0.2, state);

  const stockpile = state.gameplay.objectives.find((o) => o.id === "stockpile-1");
  assert.ok(stockpile?.completed, "stockpile objective should complete");
  assert.equal(state.gameplay.objectiveIndex, 1);
  assert.ok(state.resources.food >= 150, "food reward should be applied");
  assert.ok(state.resources.wood >= 150, "wood reward should be applied");
});
