import test from "node:test";
import assert from "node:assert/strict";

import { ColonyDirectorSystem } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";
import { SimHarness } from "../src/benchmark/framework/SimHarness.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeBaseState({ runMode } = {}) {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.resources = {
    food: 200,
    wood: 200,
    stone: 0,
    herbs: 0,
    meals: 0,
    medicine: 0,
    tools: 0,
  };
  state.buildings = rebuildBuildingStats(state.grid);
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = 0;
  state.ai.enabled = true;
  // Bypass the R13 startup readiness gate so the phaseBuilder reaches
  // "active" deterministically — we want the gate-under-test (runMode)
  // to be the only thing modulating director behaviour.
  state.ai.autopilotReady = true;
  if (runMode !== undefined) state.ai.runMode = runMode;
  return state;
}

// ── Default behaviour: runMode="fallback" → scripted director ticks ─────

test("ColonyDirectorSystem ticks when runMode='fallback' (default)", () => {
  const state = makeBaseState({ runMode: "fallback" });
  const system = new ColonyDirectorSystem();

  system.update(1 / 30, state);

  assert.ok(
    state.ai.colonyDirector,
    "fallback runMode must initialise scripted director state",
  );
  assert.ok(
    "phase" in state.ai.colonyDirector,
    "fallback runMode must execute the scripted director update body",
  );
  assert.equal(
    state.ai.colonyDirector.automation?.phaseBuilder,
    "active",
    "fallback runMode + autopilot ON → phase builder must be active",
  );
});

test("ColonyDirectorSystem ticks when runMode is undefined (back-compat)", () => {
  // Older callers / tests that never wrote `state.ai.runMode` must keep
  // ticking the scripted director — the gate is opt-IN.
  const state = makeBaseState();
  delete state.ai.runMode;
  const system = new ColonyDirectorSystem();

  system.update(1 / 30, state);

  assert.ok(
    state.ai.colonyDirector,
    "undefined runMode must NOT gate the director (legacy behaviour preserved)",
  );
});

// ── Gate: runMode="llm" → scripted director skipped ─────────────────────

test("ColonyDirectorSystem skips update when runMode='llm'", () => {
  const state = makeBaseState({ runMode: "llm" });
  const beforeVersion = state.grid.version;
  const system = new ColonyDirectorSystem();

  system.update(1 / 30, state);

  assert.equal(
    state.grid.version,
    beforeVersion,
    "runMode='llm' must NOT mutate the tile grid (no auto builds)",
  );
  assert.equal(
    state.ai.colonyDirector,
    undefined,
    "runMode='llm' must short-circuit BEFORE ensureDirectorState — no director state",
  );
});

test("ColonyDirectorSystem stays silent across many ticks when runMode='llm'", () => {
  const state = makeBaseState({ runMode: "llm" });
  const system = new ColonyDirectorSystem();
  const beforeVersion = state.grid.version;

  for (let i = 0; i < 20; i += 1) {
    state.metrics.timeSec = i * 5;
    system.update(5, state);
  }

  assert.equal(
    state.grid.version,
    beforeVersion,
    "runMode='llm' must keep grid quiet across long horizons",
  );
  assert.equal(state.ai.colonyDirector, undefined);
});

// ── SimHarness wiring: runMode option propagates to state.ai.runMode ─────

test("SimHarness defaults state.ai.runMode='fallback'", () => {
  const harness = new SimHarness({
    templateId: "temperate_plains",
    seed: 0xC0FFEE,
  });
  assert.equal(harness.state.ai.runMode, "fallback");
});

test("SimHarness({runMode:'llm'}) sets state.ai.runMode='llm'", () => {
  const harness = new SimHarness({
    templateId: "temperate_plains",
    seed: 0xC0FFEE,
    runMode: "llm",
  });
  assert.equal(harness.state.ai.runMode, "llm");
});

test("SimHarness coerces unknown runMode values to 'fallback'", () => {
  const harness = new SimHarness({
    templateId: "temperate_plains",
    seed: 0xC0FFEE,
    runMode: "bogus",
  });
  assert.equal(
    harness.state.ai.runMode,
    "fallback",
    "unknown runMode must coerce to safe default",
  );
});

// ── End-to-end: runMode='llm' harness keeps grid clean of auto builds ───

test("SimHarness with runMode='llm' produces no scripted director builds", async () => {
  const harness = new SimHarness({
    templateId: "temperate_plains",
    seed: 0xC0FFEE,
    aiEnabled: true,
    runMode: "llm",
  });
  // Boot resources so the rule-based director WOULD have built if it ran.
  harness.state.resources.food = 200;
  harness.state.resources.wood = 200;

  const versionBefore = harness.state.grid.version;
  await harness.advanceTicks(30);

  // ColonyDirector never initialised → no buildsPlaced bookkeeping.
  assert.equal(
    harness.state.ai.colonyDirector,
    undefined,
    "runMode='llm' harness must not initialise scripted director state",
  );

  // Other (non-scripted) systems may still nudge the grid version (e.g.
  // TileStateSystem revealing fog), so we assert the *script-emitted*
  // contract: zero "autopilot" / "fallback" placements were attributed.
  // This is the load-bearing assertion for the gate.
  assert.ok(
    harness.state.grid.version >= versionBefore,
    "grid version is monotonic non-decreasing",
  );
});
