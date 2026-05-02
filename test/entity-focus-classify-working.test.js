// v0.10.1-r5 (PE-classify-and-inspector P1) — verify the new "working" chip
// captures all 9 productive worker FSM states the v0.9.x → v0.10.0 rewrite
// introduced. Pre-fix, these states fell through to "Other"; the
// PE-entity-info-completeness review traced "many new states fall into Others"
// to a regex gap in classifyEntityFocusGroup, not a missing DISPLAY_LABEL.
//
// Coverage: HARVESTING / SEEKING_HARVEST / BUILDING / SEEKING_BUILD /
// PROCESSING / SEEKING_PROCESS / RESTING / SEEKING_REST / FIGHTING.
// Plus a predator "Hunt" sanity check — combat must still beat working
// (combat regex runs before working regex inside classifyEntityFocusGroup).

import test from "node:test";
import assert from "node:assert/strict";

import {
  ENTITY_FOCUS_GROUP_ORDER,
  deriveEntityFocusGroups,
} from "../src/ui/panels/EntityFocusPanel.js";

function worker(id, stateLabel, overrides = {}) {
  return {
    id,
    displayName: id,
    type: "WORKER",
    role: "FARM",
    hunger: 1,
    hp: 100,
    maxHp: 100,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    stateLabel,
    alive: true,
    debug: {},
    blackboard: {},
    ...overrides,
  };
}

test("ENTITY_FOCUS_GROUP_ORDER includes 'working' between 'blocked' and 'idle'", () => {
  const order = [...ENTITY_FOCUS_GROUP_ORDER];
  const blockedIdx = order.indexOf("blocked");
  const workingIdx = order.indexOf("working");
  const idleIdx = order.indexOf("idle");
  assert.ok(blockedIdx >= 0, "'blocked' missing from order");
  assert.ok(workingIdx >= 0, "'working' missing from order");
  assert.ok(idleIdx >= 0, "'idle' missing from order");
  assert.ok(workingIdx === blockedIdx + 1, "'working' should sit immediately after 'blocked'");
  assert.ok(workingIdx < idleIdx, "'working' should sit before 'idle'");
});

test("classifyEntityFocusGroup → 'working' for all 9 productive FSM states", () => {
  const productiveStates = [
    "Harvest",
    "Seek Harvest",
    "Build",
    "Seek Construct",
    "Process",
    "Seek Process",
    "Rest",
    "Seek Rest",
    "Engage",
  ];

  const state = {
    agents: productiveStates.map((label, i) => worker(`w${i}`, label)),
    animals: [],
  };

  const focus = deriveEntityFocusGroups(state);
  assert.equal(
    focus.groupCounts.working,
    productiveStates.length,
    `expected all ${productiveStates.length} productive states to classify as 'working', got ${focus.groupCounts.working}`,
  );
  assert.equal(focus.groupCounts.other ?? 0, 0, "no productive state should fall to 'other'");
});

test("classifyEntityFocusGroup → 'working' for raw FSM enum names (HARVESTING / BUILDING / etc.)", () => {
  // entityFocusStateNode reads entity.fsm.state directly when present.
  // Using uppercase enum names as the worker FSM emits them post-v0.10.0.
  const fsmStates = [
    "HARVESTING",
    "SEEKING_HARVEST",
    "BUILDING",
    "SEEKING_BUILD",
    "PROCESSING",
    "SEEKING_PROCESS",
    "RESTING",
    "SEEKING_REST",
    "FIGHTING",
  ];
  const state = {
    agents: fsmStates.map((s, i) => worker(`fsm${i}`, "?", { fsm: { state: s } })),
    animals: [],
  };
  const focus = deriveEntityFocusGroups(state);
  assert.equal(focus.groupCounts.working, fsmStates.length);
});

test("predator 'Hunt' still routes to combat, not working", () => {
  // Combat check runs before working check; predator with hunt label and
  // hp damage should land in combat. Word boundaries also keep the
  // working regex from grabbing "hunt".
  const predator = worker("p1", "Hunt", { hp: 40, maxHp: 100, type: "ANIMAL", role: null });
  const state = { agents: [], animals: [predator] };
  const focus = deriveEntityFocusGroups(state);
  assert.equal(focus.groupCounts.combat, 1);
  assert.equal(focus.groupCounts.working ?? 0, 0);
});
