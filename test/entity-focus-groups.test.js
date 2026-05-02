import test from "node:test";
import assert from "node:assert/strict";

import {
  ENTITY_FOCUS_GROUP_ORDER,
  deriveEntityFocusGroups,
} from "../src/ui/panels/EntityFocusPanel.js";

function worker(id, overrides = {}) {
  return {
    id,
    displayName: id,
    type: "WORKER",
    role: "FARM",
    hunger: 1,
    hp: 100,
    maxHp: 100,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    stateLabel: "Harvest",
    alive: true,
    debug: {},
    blackboard: {},
    ...overrides,
  };
}

test("deriveEntityFocusGroups assigns the accepted high-load focus groups", () => {
  const state = {
    agents: [
      worker("starving", { hunger: 0.1 }),
      worker("hungry", { hunger: 0.35 }),
      worker("blocked", { debug: { lastIntentReason: "no reachable food source" } }),
      worker("idle", { stateLabel: "Idle", blackboard: { intent: "idle" } }),
      worker("hauling", { stateLabel: "Deliver", carry: { food: 0, wood: 3, stone: 0, herbs: 0 } }),
      worker("combat", { hp: 55, maxHp: 100 }),
      worker("working", { stateLabel: "Harvest" }),
      // v0.10.1-r5 (PE-classify-and-inspector P1): "Harvest" now classifies
      // as "working" via the productive-states regex; "other" is reserved
      // for stateless / unknown entities (visitor SCOUTs, init phase).
      worker("other", { stateLabel: "" }),
    ],
    animals: [],
  };

  const focus = deriveEntityFocusGroups(state);

  assert.deepEqual(ENTITY_FOCUS_GROUP_ORDER, [
    "starving",
    "hungry",
    "blocked",
    "working",
    "idle",
    "hauling",
    "combat",
    "other",
  ]);
  assert.equal(focus.groupCounts.starving, 1);
  assert.equal(focus.groupCounts.hungry, 1);
  assert.equal(focus.groupCounts.blocked, 1);
  assert.equal(focus.groupCounts.working, 1);
  assert.equal(focus.groupCounts.idle, 1);
  assert.equal(focus.groupCounts.hauling, 1);
  assert.equal(focus.groupCounts.combat, 1);
  assert.equal(focus.groupCounts.other, 1);
});

test("deriveEntityFocusGroups orders crisis rows before routine rows", () => {
  const state = {
    agents: [
      worker("routine-a", { stateLabel: "Harvest" }),
      worker("idle-a", { stateLabel: "Idle", blackboard: { intent: "idle" } }),
      worker("blocked-a", { blackboard: { lastFeasibilityReject: { reason: "blocked road" } } }),
      worker("starving-a", { hunger: 0.05 }),
      worker("hungry-a", { hunger: 0.3 }),
    ],
    animals: [],
  };

  const ids = deriveEntityFocusGroups(state).rows.map((row) => row.entity.id);

  assert.deepEqual(ids.slice(0, 3), ["starving-a", "hungry-a", "blocked-a"]);
});

