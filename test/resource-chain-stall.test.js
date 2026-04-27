// v0.8.2 Round-5 Wave-2 (02b-casual Step 6): unit tests for the new
// `getResourceChainStall` ColonyPerceiver export. Each resource row gets
// a `{ bottleneck, nextAction, severity }` describing why its rate is
// stuck at 0.0/min.
//
// Plan: assignments/homework6/Agent-Feedback-Loop/Round5/Plans/02b-casual.md

import test from "node:test";
import assert from "node:assert/strict";

import { getResourceChainStall } from "../src/simulation/ai/colony/ColonyPerceiver.js";

function makeState({ buildings = {}, pop = {}, resources = {} } = {}) {
  return {
    buildings: {
      farms: 0,
      kitchens: 0,
      lumbers: 0,
      quarries: 0,
      herbGardens: 0,
      smithies: 0,
      clinics: 0,
      ...buildings,
    },
    metrics: {
      populationStats: {
        cooks: 0,
        smiths: 0,
        herbalists: 0,
        loggers: 0,
        stoneMiners: 0,
        herbGatherers: 0,
        farmers: 0,
        haulers: 0,
        ...pop,
      },
    },
    resources: { food: 0, wood: 0, stone: 0, herbs: 0, meals: 0, tools: 0, medicine: 0, ...resources },
  };
}

test("case A: empty colony — food bottleneck is 'no farms'", () => {
  const stall = getResourceChainStall(makeState());
  assert.equal(stall.food.bottleneck, "no farms");
  assert.equal(stall.food.severity, "stalled");
});

test("case B: 1 farm, 0 lumbers — wood bottleneck names the missing lumber mill", () => {
  const stall = getResourceChainStall(makeState({ buildings: { farms: 1 } }));
  assert.match(stall.wood.bottleneck, /no lumber/);
  assert.equal(stall.wood.severity, "stalled");
});

test("case C: 2 lumbers but 0 loggers — wood bottleneck names the quota", () => {
  const stall = getResourceChainStall(makeState({
    buildings: { lumbers: 2 },
    pop: { loggers: 0 },
  }));
  assert.match(stall.wood.bottleneck, /no loggers/);
  assert.equal(stall.wood.severity, "slow");
});

test("case D: 6 farms, 0 kitchens — meals.bottleneck === 'no kitchen yet'", () => {
  const stall = getResourceChainStall(makeState({ buildings: { farms: 6 } }));
  assert.equal(stall.meals.bottleneck, "no kitchen yet");
});

test("case E: 6 farms, 1 kitchen, 0 cooks — meals.bottleneck names cooks", () => {
  const stall = getResourceChainStall(makeState({
    buildings: { farms: 6, kitchens: 1 },
    pop: { cooks: 0 },
  }));
  assert.match(stall.meals.bottleneck, /no cooks/);
});

test("case F: 1 quarry, 2 miners — stone is ok", () => {
  const stall = getResourceChainStall(makeState({
    buildings: { quarries: 1 },
    pop: { stoneMiners: 2 },
  }));
  assert.equal(stall.stone.bottleneck, null);
  assert.equal(stall.stone.severity, "ok");
});

test("case G: 0 herb gardens — herbs.bottleneck names the building", () => {
  const stall = getResourceChainStall(makeState());
  assert.match(stall.herbs.bottleneck, /no herb garden/);
});

test("case H: 0 clinics — medicine.bottleneck names the building", () => {
  const stall = getResourceChainStall(makeState({ buildings: { herbGardens: 1 } }));
  assert.match(stall.medicine.bottleneck, /no clinic/);
});

test("case I: smithy + smith staffed — tools row is ok", () => {
  const stall = getResourceChainStall(makeState({
    buildings: { smithies: 1 },
    pop: { smiths: 2 },
  }));
  assert.equal(stall.tools.bottleneck, null);
  assert.equal(stall.tools.severity, "ok");
});

test("shape contract: every known key carries {bottleneck, nextAction, severity}", () => {
  const stall = getResourceChainStall(makeState());
  for (const key of ["food", "wood", "stone", "herbs", "meals", "tools", "medicine"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(stall, key), `missing stall.${key}`);
    const entry = stall[key];
    assert.ok(entry && typeof entry === "object");
    assert.ok("bottleneck" in entry);
    assert.ok("nextAction" in entry);
    assert.ok("severity" in entry);
  }
});
