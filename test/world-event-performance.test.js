import test from "node:test";
import assert from "node:assert/strict";

import { ENTITY_TYPE, EVENT_TYPE, VISITOR_KIND } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";

function makeWorker(id) {
  return {
    id: `worker-${id}`,
    type: ENTITY_TYPE.WORKER,
    alive: true,
    hp: 100,
    mood: id % 7 === 0 ? 0.2 : 0.8,
    memory: { recentEvents: [], dangerTiles: [] },
    blackboard: {},
  };
}

function makeVisitor(id) {
  return {
    id: `visitor-${id}`,
    type: ENTITY_TYPE.VISITOR,
    kind: id % 2 === 0 ? VISITOR_KIND.SABOTEUR : VISITOR_KIND.TRADER,
    alive: true,
    sabotageCooldown: 8,
  };
}

function activeEvent(id, type, target) {
  return {
    id,
    type,
    status: "active",
    elapsedSec: 2,
    durationSec: 60,
    intensity: 1,
    payload: target
      ? { targetTiles: [target], targetKind: "local", targetRefId: "" }
      : {},
  };
}

test("WorldEventSystem reuses per-tick entity lists and spatial payload caches under high load", () => {
  const state = createInitialGameState({ seed: 1337 });
  const target = state.gameplay.scenario.anchors.eastDepot;
  state.agents = [
    ...Array.from({ length: 700 }, (_, i) => makeWorker(i)),
    ...Array.from({ length: 300 }, (_, i) => makeVisitor(i)),
  ];
  state.resources.food = 10000;
  state.resources.wood = 10000;
  state.resources.medicine = 10000;
  state.events.active = [
    ...Array.from({ length: 18 }, (_, i) => activeEvent(`trade-${i}`, EVENT_TYPE.TRADE_CARAVAN, target)),
    ...Array.from({ length: 6 }, (_, i) => activeEvent(`raid-${i}`, EVENT_TYPE.BANDIT_RAID, target)),
    ...Array.from({ length: 4 }, (_, i) => activeEvent(`disease-${i}`, EVENT_TYPE.DISEASE_OUTBREAK, null)),
    ...Array.from({ length: 4 }, (_, i) => activeEvent(`morale-${i}`, EVENT_TYPE.MORALE_BREAK, null)),
  ];

  const system = new WorldEventSystem();
  system.update(0.1, state, {});
  system.update(0.1, state, {});

  const stats = state.debug.worldEventLod;
  assert.ok(stats, "expected WorldEventSystem debug stats");
  assert.equal(stats.spatialCacheMisses, 0, "second stable-grid update should reuse spatial payload caches");
  assert.ok(stats.spatialCacheHits >= 24, `expected spatial cache hits for active events, got ${stats.spatialCacheHits}`);
  assert.ok(stats.workerListBuilds <= 1, `active worker list should be built once per tick, got ${stats.workerListBuilds}`);
  assert.ok(stats.saboteurListBuilds <= 1, `saboteur list should be built once per tick, got ${stats.saboteurListBuilds}`);
});

test("WorldEventSystem enforces long-run event concurrency caps while draining queues", () => {
  const state = createInitialGameState({ seed: 1337 });
  state.ai.runtimeProfile = "long_run";
  state.events.queue = [
    activeEvent("morale-a", EVENT_TYPE.MORALE_BREAK, null),
    activeEvent("morale-b", EVENT_TYPE.MORALE_BREAK, null),
  ];
  for (const event of state.events.queue) {
    event.status = "prepare";
    event.elapsedSec = 0;
  }

  new WorldEventSystem().update(1.1, state, {});

  const moraleEvents = state.events.active.filter((event) => event.type === EVENT_TYPE.MORALE_BREAK);
  assert.equal(moraleEvents.length, 1);
  assert.equal(state.events.queue.length, 0);
});
