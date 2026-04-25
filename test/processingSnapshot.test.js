import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ProcessingSystem } from "../src/simulation/economy/ProcessingSystem.js";
import { TILE, ROLE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";

function makeState({ kitchenIx = 5, kitchenIz = 5, smithyIx = null, food = 100, stone = 50, wood = 30, cookPresent = true, smithPresent = false } = {}) {
  const W = 20, H = 20;
  const tiles = new Uint8Array(W * H).fill(TILE.GRASS);
  tiles[kitchenIx + kitchenIz * W] = TILE.KITCHEN;
  if (smithyIx !== null) tiles[smithyIx + 10 * W] = TILE.SMITHY;

  // worldToTile: ix = floor(x/tileSize + W/2), so tile→world: x = (ix - W/2 + 0.5) * tileSize
  const tileToWorldX = (ix) => (ix - W / 2 + 0.5);
  const tileToWorldZ = (iz) => (iz - H / 2 + 0.5);
  const agents = [];
  if (cookPresent) {
    agents.push({ type: "WORKER", alive: true, role: ROLE.COOK, x: tileToWorldX(kitchenIx), z: tileToWorldZ(kitchenIz) });
  }
  if (smithPresent && smithyIx !== null) {
    agents.push({ type: "WORKER", alive: true, role: ROLE.SMITH, x: tileToWorldX(smithyIx), z: tileToWorldZ(10) });
  }

  return {
    grid: { width: W, height: H, tiles, tileSize: 1 },
    resources: { food, wood, stone, herbs: 0, meals: 0, tools: 0, medicine: 0 },
    metrics: { timeSec: 0, processingCycles: 0, warningLog: [], warnings: [] },
    gameplay: { toolProductionMultiplier: 1 },
    environment: { isNight: false },
    weather: { current: "clear" },
    agents,
    animals: [],
    events: { log: [] },
  };
}

describe("ProcessingSystem #emitSnapshot", () => {
  let sys;
  beforeEach(() => { sys = new ProcessingSystem(); });

  it("a: snapshot length matches number of registered building timers", () => {
    const state = makeState({ smithyIx: 10 });
    // First update registers timers but doesn't fire (cooldown not elapsed)
    sys.update(0.1, state);
    assert.ok(Array.isArray(state.metrics.processing), "state.metrics.processing should be an array");
    // 1 kitchen + 1 smithy both attempted → 2 entries (both registered)
    assert.strictEqual(state.metrics.processing.length, 2);
  });

  it("b: kitchen entry has correct kind, valid progress01, not stalled when cook present + food OK", () => {
    const state = makeState({ food: 100, cookPresent: true });
    sys.update(0.1, state);
    const entry = state.metrics.processing.find((e) => e.kind === "kitchen");
    assert.ok(entry, "kitchen entry should be present");
    assert.strictEqual(entry.kind, "kitchen");
    assert.ok(entry.progress01 >= 0 && entry.progress01 <= 1, `progress01 out of range: ${entry.progress01}`);
    assert.strictEqual(entry.workerPresent, true);
    assert.strictEqual(entry.inputOk, true);
    assert.strictEqual(entry.stalled, false);
    assert.strictEqual(entry.stallReason, null);
  });

  it("c: smithy entry is stalled with 'no smith' when no SMITH worker present", () => {
    const state = makeState({ smithyIx: 10, smithPresent: false });
    sys.update(0.1, state);
    const entry = state.metrics.processing.find((e) => e.kind === "smithy");
    assert.ok(entry, "smithy entry should be present");
    assert.strictEqual(entry.workerPresent, false);
    assert.strictEqual(entry.stalled, true);
    assert.strictEqual(entry.stallReason, "no smith");
  });

  it("d: progress01 is monotonically non-decreasing across two updates for same kitchen", () => {
    const state = makeState({ food: 100, cookPresent: true });
    const cycleSec = Number(BALANCE.kitchenCycleSec ?? 3);
    sys.update(0.1, state);
    const p1 = state.metrics.processing.find((e) => e.kind === "kitchen")?.progress01 ?? 0;
    state.metrics.timeSec = 1.0;
    sys.update(0.9, state);
    const p2 = state.metrics.processing.find((e) => e.kind === "kitchen")?.progress01 ?? 0;
    // progress should advance (within same cycle) or reset near 0 on cycle complete
    assert.ok(p2 >= 0 && p2 <= 1, `p2 out of range: ${p2}`);
    // After 1s of a 3s cycle, progress should be non-trivially positive unless cycle just reset
    // Allow for cycle reset: either p2 >= p1 or p2 is near 0 (just cycled)
    assert.ok(p2 >= p1 || p2 < 0.1, `progress should not decrease mid-cycle: p1=${p1} p2=${p2}`);
  });

  it("e: snapshotBuffer is reused in-place (same object reference after two updates)", () => {
    const state = makeState();
    sys.update(0.1, state);
    const ref1 = state.metrics.processing;
    sys.update(0.1, state);
    const ref2 = state.metrics.processing;
    assert.strictEqual(ref1, ref2, "snapshotBuffer should be the same array object (in-place reuse)");
  });
});
