/**
 * v0.10.1-r2-A2: AgentDirectorSystem sim-time cadence gate.
 *
 * Verifies that at high sim-step rates (4x/8x speed), heavy work
 * (perceiver.observe / executeNextSteps / shouldReplan) is gated to a
 * fixed sim-time interval rather than firing every sim step. Fast-path
 * behaviour (mode select, agentState.activePlan mirror, fallback throttle)
 * must still run every tick.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AgentDirectorSystem,
  AGENT_DIRECTOR_HEAVY_TICK_INTERVAL_SEC,
} from "../src/simulation/ai/colony/AgentDirectorSystem.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

function makeState() {
  const state = createInitialGameState("temperate_plains", 42);
  state.session = { phase: "active" };
  state.ai = { enabled: true };
  state.metrics = { timeSec: 0 };
  state.buildings = rebuildBuildingStats(state.grid);
  return state;
}

function makeServices(mem) {
  const services = createServices(mem);
  services.memoryStore = mem;
  // Strip llmClient to force "hybrid" mode (no proxy in tests). Heavy-path
  // gating still applies in hybrid because the gate sits before the
  // mode-specific branch.
  services.llmClient = null;
  return services;
}

describe("AgentDirectorSystem sim-time cadence gate", () => {
  it("exports the heavy-tick interval constant", () => {
    assert.equal(typeof AGENT_DIRECTOR_HEAVY_TICK_INTERVAL_SEC, "number");
    assert.ok(AGENT_DIRECTOR_HEAVY_TICK_INTERVAL_SEC > 0);
  });

  it("calls perceiver.observe at most ceil(elapsed / interval) times across 12 sim steps in one frame (8x speed)", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const services = makeServices(mem);
    const state = makeState();

    // Spy on perceiver.observe.
    let observeCalls = 0;
    const realObserve = system._perceiver.observe.bind(system._perceiver);
    system._perceiver.observe = (s) => {
      observeCalls++;
      return realObserve(s);
    };

    // Simulate 12 sim steps within a single render frame at fixed dt=1/30s.
    // Total elapsed sim time = 12 * (1/30) = 0.4s, which is < 0.5s default
    // interval ⇒ heavy work should fire AT MOST once across the frame
    // (twice if the boundary lands exactly).
    const dt = 1 / 30;
    for (let i = 0; i < 12; i++) {
      state.metrics.timeSec += dt;
      system.update(dt, state, services);
    }

    // Headroom: 0.4s elapsed / 0.5s interval = 0.8 ⇒ at most 1 heavy tick.
    // Allow ≤2 to tolerate boundary timing.
    assert.ok(
      observeCalls <= 2,
      `expected perceiver.observe called ≤2 times across 12 sim steps (got ${observeCalls})`,
    );
    assert.ok(observeCalls >= 0, "observeCalls should be non-negative");
  });

  it("calls perceiver.observe at least once when sim time crosses the heavy-tick interval", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const services = makeServices(mem);
    const state = makeState();

    // Spy.
    let observeCalls = 0;
    const realObserve = system._perceiver.observe.bind(system._perceiver);
    system._perceiver.observe = (s) => {
      observeCalls++;
      return realObserve(s);
    };

    // Run for 1.5 sim seconds at dt = 1/30 → ~45 steps. With 0.5s interval,
    // expect ~3 heavy ticks (1.5 / 0.5).
    const dt = 1 / 30;
    for (let i = 0; i < 45; i++) {
      state.metrics.timeSec += dt;
      system.update(dt, state, services);
    }

    assert.ok(
      observeCalls >= 2,
      `expected perceiver.observe called ≥2 times across 1.5s sim (got ${observeCalls})`,
    );
    assert.ok(
      observeCalls <= 5,
      `expected perceiver.observe called ≤5 times across 1.5s sim (got ${observeCalls})`,
    );
  });

  it("refreshes agentState.activePlan mirror every tick (fast-path preserved)", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const services = makeServices(mem);
    const state = makeState();

    // Drive a few ticks; even when heavy work is gated, the mirror at the top
    // of update() should always run, so agentState (initialized lazily) must
    // exist after the first tick.
    const dt = 1 / 30;
    state.metrics.timeSec += dt;
    system.update(dt, state, services);

    assert.ok(state.ai?.agentDirector, "agentState should be initialized on first tick");
    assert.ok(
      "activePlan" in state.ai.agentDirector,
      "activePlan key should be mirrored every tick",
    );
    // mode is set unconditionally on the fast-path (before the heavy gate).
    assert.ok(
      ["agent", "hybrid", "algorithmic"].includes(state.ai.agentDirector.mode),
      `mode should be set on fast-path (got ${state.ai.agentDirector.mode})`,
    );

    // Tick again with a tiny dt that does NOT cross the heavy-tick interval —
    // mode and activePlan key must still be present.
    state.metrics.timeSec += dt;
    system.update(dt, state, services);
    assert.ok(state.ai.agentDirector.mode);
    assert.ok("activePlan" in state.ai.agentDirector);
  });

  it("does not skip heavy work when interval is 0 (override hook for tests / debugging)", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const services = makeServices(mem);
    const state = makeState();

    // Override the cadence to 0 → every tick is a "heavy" tick.
    system._heavyTickIntervalSec = 0;

    let observeCalls = 0;
    const realObserve = system._perceiver.observe.bind(system._perceiver);
    system._perceiver.observe = (s) => {
      observeCalls++;
      return realObserve(s);
    };

    const dt = 1 / 30;
    for (let i = 0; i < 6; i++) {
      state.metrics.timeSec += dt;
      system.update(dt, state, services);
    }
    assert.equal(observeCalls, 6, "with interval=0 every tick should be heavy");
  });
});
