import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { EVENT_TYPE, TILE } from "../src/config/constants.js";
import { enqueueEvent } from "../src/world/events/WorldEventQueue.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";

test("bandit raid targets scenario-specific zones and can damage route tiles", () => {
  const templates = ["temperate_plains", "fortified_basin", "archipelago_isles"];
  for (const templateId of templates) {
    const state = createInitialGameState({ templateId, seed: 1337 });
    const system = new WorldEventSystem();

    enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, {}, 12, 1);
    system.update(1.1, state);

    const raid = state.events.active.find((event) => event.type === EVENT_TYPE.BANDIT_RAID);
    assert.ok(raid, `expected active bandit raid for ${templateId}`);
    assert.equal(raid.status, "active");
    assert.equal(typeof raid.payload?.targetLabel, "string");
    assert.ok(Array.isArray(raid.payload?.targetTiles));

    const impact = raid.payload?.impactTile;
    assert.ok(impact, `expected raid to choose a spatial impact tile for ${templateId}`);
    const impactedTile = state.grid.tiles[impact.ix + impact.iz * state.grid.width];
    assert.ok(impactedTile === TILE.RUINS || Boolean(raid.payload?.blockedByWalls));
  }
});

test("animal migration writes a spatial migration target for herbivores", () => {
  const state = createInitialGameState({ seed: 1337 });
  const system = new WorldEventSystem();

  enqueueEvent(state, EVENT_TYPE.ANIMAL_MIGRATION, {}, 12, 1);
  system.update(1.1, state);

  const herbivore = state.animals.find((animal) => animal.kind === "HERBIVORE");
  assert.ok(herbivore, "expected at least one herbivore");
  assert.ok(herbivore.memory?.migrationTarget, "expected migration target");
  assert.equal(typeof herbivore.memory.migrationTarget.ix, "number");
  assert.equal(typeof herbivore.memory.migrationTarget.iz, "number");
});
