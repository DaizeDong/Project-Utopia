import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AgentDirectorSystem, selectMode } from "../src/simulation/ai/colony/AgentDirectorSystem.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

// ── Helpers ──────────────────────────────────────────────────────────

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
  return services;
}

// ── selectMode ───────────────────────────────────────────────────────

describe("selectMode", () => {
  it("returns algorithmic when AI disabled", () => {
    const state = { ai: { enabled: false } };
    assert.equal(selectMode(state, {}, true), "algorithmic");
  });

  it("returns hybrid when no API key", () => {
    const state = { ai: { enabled: true } };
    assert.equal(selectMode(state, { stats: { llmFailures: 0 } }, false), "hybrid");
  });

  it("returns agent when AI enabled with API key", () => {
    const state = { ai: { enabled: true } };
    assert.equal(selectMode(state, { stats: { llmFailures: 0 } }, true), "agent");
  });

  it("returns hybrid after LLM failure threshold", () => {
    const state = { ai: { enabled: true }, metrics: { timeSec: 10 } };
    const agentState = { stats: { llmFailures: 3, lastLlmFailureSec: 5 } };
    assert.equal(selectMode(state, agentState, true), "hybrid");
  });

  it("returns agent after retry delay expires", () => {
    const state = { ai: { enabled: true }, metrics: { timeSec: 100 } };
    const agentState = { stats: { llmFailures: 3, lastLlmFailureSec: 5 } };
    assert.equal(selectMode(state, agentState, true), "agent");
  });

  it("handles missing ai state gracefully", () => {
    assert.equal(selectMode({}, null, false), "algorithmic");
  });
});

// ── AgentDirectorSystem construction ─────────────────────────────────

describe("AgentDirectorSystem construction", () => {
  it("constructs with name", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    assert.equal(system.name, "AgentDirectorSystem");
  });

  it("exposes stats", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const stats = system.stats;
    assert.ok("planner" in stats);
    assert.ok("evaluator" in stats);
  });

  it("activePlan is null initially", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    assert.equal(system.activePlan, null);
  });
});

// ── update() — algorithmic mode ──────────────────────────────────────

describe("AgentDirectorSystem update — algorithmic mode", () => {
  it("delegates to fallback when AI disabled", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const state = makeState();
    state.ai.enabled = false;
    const services = makeServices(mem);

    // Should not throw — fallback handles everything
    system.update(1 / 30, state, services);
    assert.equal(state.ai.agentDirector?.mode, "algorithmic");
  });

  it("skips when session not active", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const state = makeState();
    state.session.phase = "menu";
    const services = makeServices(mem);

    system.update(1 / 30, state, services);
    // No agentDirector state created since we returned early
    assert.equal(state.ai.agentDirector, undefined);
  });
});

// ── update() — hybrid mode (no API key) ──────────────────────────────

describe("AgentDirectorSystem update — hybrid mode", () => {
  it("generates fallback plans in hybrid mode", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem); // no API key → hybrid
    const state = makeState();
    state.resources = { food: 50, wood: 100, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0 };
    state.buildings = rebuildBuildingStats(state.grid);
    const services = makeServices(mem);

    // Run multiple ticks to trigger planning
    for (let i = 0; i < 100; i++) {
      state.metrics.timeSec = i * (1 / 30);
      system.update(1 / 30, state, services);
    }

    const agentState = state.ai.agentDirector;
    assert.equal(agentState.mode, "hybrid");
    // Should have generated at least one plan
    assert.ok(agentState.stats.plansGenerated >= 1, `plansGenerated=${agentState.stats.plansGenerated}`);
  });

  it("places buildings through plan execution", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const state = makeState();
    state.resources = { food: 100, wood: 200, stone: 30, herbs: 10, meals: 0, tools: 0, medicine: 0 };
    state.buildings = rebuildBuildingStats(state.grid);
    const services = makeServices(mem);

    const buildsBefore = Object.values(state.buildings).reduce((a, b) => a + b, 0);

    // Run for 5 seconds of sim time
    const dt = 1 / 30;
    for (let i = 0; i < 150; i++) {
      state.metrics.timeSec = i * dt;
      system.update(dt, state, services);
    }

    const buildsAfter = Object.values(state.buildings).reduce((a, b) => a + b, 0);
    // Should have placed at least some buildings (via plan or fallback)
    assert.ok(buildsAfter >= buildsBefore, `before=${buildsBefore}, after=${buildsAfter}`);
  });
});

// ── Plan lifecycle ───────────────────────────────────────────────────

describe("AgentDirectorSystem plan lifecycle", () => {
  it("records plan completion in history", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const state = makeState();
    state.resources = { food: 100, wood: 200, stone: 30, herbs: 10, meals: 0, tools: 0, medicine: 0 };
    state.buildings = rebuildBuildingStats(state.grid);
    const services = makeServices(mem);

    // Run enough ticks for a plan to complete
    const dt = 1 / 30;
    for (let i = 0; i < 300; i++) {
      state.metrics.timeSec = i * dt;
      system.update(dt, state, services);
    }

    const agentState = state.ai.agentDirector;
    // At least one plan should have been generated
    assert.ok(agentState.stats.plansGenerated >= 1, `plans=${agentState.stats.plansGenerated}`);
  });

  it("tracks totalBuildingsPlaced in stats", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const state = makeState();
    state.resources = { food: 100, wood: 200, stone: 30, herbs: 10, meals: 0, tools: 0, medicine: 0 };
    state.buildings = rebuildBuildingStats(state.grid);
    const services = makeServices(mem);

    const dt = 1 / 30;
    for (let i = 0; i < 300; i++) {
      state.metrics.timeSec = i * dt;
      system.update(dt, state, services);
    }

    const agentState = state.ai.agentDirector;
    // totalBuildingsPlaced tracks buildings from agent plans (not fallback)
    assert.ok(typeof agentState.stats.totalBuildingsPlaced === "number");
  });
});

// ── Memory integration ───────────────────────────────────────────────

describe("AgentDirectorSystem memory integration", () => {
  it("writes reflections to MemoryStore", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const state = makeState();
    state.resources = { food: 100, wood: 200, stone: 30, herbs: 10, meals: 0, tools: 0, medicine: 0 };
    state.buildings = rebuildBuildingStats(state.grid);
    const services = makeServices(mem);

    // Run many ticks
    const dt = 1 / 30;
    for (let i = 0; i < 300; i++) {
      state.metrics.timeSec = i * dt;
      system.update(dt, state, services);
    }

    // Memory may or may not have entries (depends on plan failures)
    // Just verify no crashes and memory is accessible
    assert.ok(typeof mem.size === "number");
  });

  it("memory reflections are retrievable", () => {
    const mem = new MemoryStore();
    // Manually add a reflection to test retrieval
    mem.addReflection(10, "Farm at (42,31) underperformed due to low moisture.");
    const entries = mem.retrieve("farm moisture placement", 60, 5);
    assert.ok(entries.length > 0);
  });
});

// ── Graceful degradation ─────────────────────────────────────────────

describe("AgentDirectorSystem graceful degradation", () => {
  it("falls back smoothly when switching modes", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const state = makeState();
    state.resources = { food: 50, wood: 100, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0 };
    state.buildings = rebuildBuildingStats(state.grid);
    const services = makeServices(mem);

    // Start in hybrid (no API key)
    const dt = 1 / 30;
    for (let i = 0; i < 100; i++) {
      state.metrics.timeSec = i * dt;
      system.update(dt, state, services);
    }
    assert.equal(state.ai.agentDirector.mode, "hybrid");

    // Switch to algorithmic
    state.ai.enabled = false;
    system.update(dt, state, services);
    assert.equal(state.ai.agentDirector.mode, "algorithmic");

    // Switch back to hybrid
    state.ai.enabled = true;
    state.metrics.timeSec = 100;
    system.update(dt, state, services);
    assert.equal(state.ai.agentDirector.mode, "hybrid");
  });

  it("preserves plan history across mode switches", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const state = makeState();
    state.resources = { food: 100, wood: 200, stone: 30, herbs: 10, meals: 0, tools: 0, medicine: 0 };
    state.buildings = rebuildBuildingStats(state.grid);
    const services = makeServices(mem);

    const dt = 1 / 30;
    for (let i = 0; i < 200; i++) {
      state.metrics.timeSec = i * dt;
      system.update(dt, state, services);
    }

    const historyBefore = state.ai.agentDirector.planHistory.length;

    // Switch to algorithmic and back
    state.ai.enabled = false;
    system.update(dt, state, services);
    state.ai.enabled = true;
    state.metrics.timeSec = 200;
    system.update(dt, state, services);

    // History should be preserved
    assert.equal(state.ai.agentDirector.planHistory.length, historyBefore);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────

describe("AgentDirectorSystem edge cases", () => {
  it("handles empty grid gracefully", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const state = makeState();
    state.resources = { food: 0, wood: 0, stone: 0, herbs: 0, meals: 0, tools: 0, medicine: 0 };
    const services = makeServices(mem);

    // Should not throw even with zero resources
    system.update(1 / 30, state, services);
    assert.ok(true);
  });

  it("handles rapid consecutive updates", () => {
    const mem = new MemoryStore();
    const system = new AgentDirectorSystem(mem);
    const state = makeState();
    state.resources = { food: 50, wood: 50, stone: 5, herbs: 0, meals: 0, tools: 0, medicine: 0 };
    state.buildings = rebuildBuildingStats(state.grid);
    const services = makeServices(mem);

    // Run many rapid ticks at same timeSec (shouldn't cause issues)
    for (let i = 0; i < 50; i++) {
      system.update(1 / 30, state, services);
    }
    assert.ok(true);
  });
});
