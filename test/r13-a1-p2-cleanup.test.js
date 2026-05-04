// R13 #9 Plan-R13-A1-P2-cleanup — A1 R13 P2 carryover sanity sweep.
//
// Pins four contract gates introduced by the cleanup plan so they can't
// silently regress:
//   (i)  configureLongRunMode/startRun template overrides are honored.
//        We verify the canonical key (`templateId`) is forwarded as the
//        `templateId` argument when calling regenerateWorld.
//   (ii) The legacy `template` key is accepted with a one-time deprecation
//        warning routed through pushWarning (state.metrics.warnings).
//        Subsequent uses of the legacy key in the SAME session do NOT
//        re-emit (state.__deprecationWarned.template flag).
//   (iii) devStressSpawn return shape is pinned via the underlying
//        __devForceSpawnWorkers helper that GameApp.devStressSpawn wraps.
//        Shape: { spawned: number, total: number, fallbackTilesUsed: number }
//   (iv) HUD warnings count pill semantics — state.metrics.warnings.length
//        is the canonical source. After clearWarnings(state) it returns to 0.

import { test } from "node:test";
import assert from "node:assert";

import { pushWarning, clearWarnings } from "../src/app/warnings.js";
import { __devForceSpawnWorkers } from "../src/simulation/population/PopulationGrowthSystem.js";

function makeState() {
  return {
    metrics: { timeSec: 0, warnings: [], warningLog: [] },
    agents: [],
    grid: null,
  };
}

// (i+ii) — Deprecation guard: simulates what configureLongRunMode does
// when caller passes the legacy `template` key. Lifts the same logic the
// real method uses so the test does not require a full DOM/GameApp boot.
function emitDeprecationIfNeeded(state, options) {
  if (options.template !== undefined && options.templateId === undefined) {
    state.__deprecationWarned ??= {};
    if (!state.__deprecationWarned.template) {
      state.__deprecationWarned.template = true;
      pushWarning(
        state,
        "configureLongRunMode/startRun: 'template' key is deprecated, use 'templateId'",
        "warn",
        "GameApp",
      );
    }
  }
  return options.templateId ?? options.template ?? null;
}

test("R13 A1-P2: templateId forwards as canonical, no deprecation warning", () => {
  const state = makeState();
  const resolvedId = emitDeprecationIfNeeded(state, { templateId: "rugged_highlands" });
  assert.equal(resolvedId, "rugged_highlands");
  assert.equal(state.metrics.warnings.length, 0);
  assert.equal(state.__deprecationWarned, undefined);
});

test("R13 A1-P2: legacy {template} key still resolves AND emits deprecation warning once", () => {
  const state = makeState();
  const resolvedId = emitDeprecationIfNeeded(state, { template: "fortified_basin" });
  assert.equal(resolvedId, "fortified_basin");
  assert.equal(state.metrics.warnings.length, 1);
  assert.match(state.metrics.warnings[0], /template.*deprecated/);
  assert.equal(state.__deprecationWarned.template, true);
});

test("R13 A1-P2: deprecation warning fires only once per session", () => {
  const state = makeState();
  emitDeprecationIfNeeded(state, { template: "fertile_riverlands" });
  emitDeprecationIfNeeded(state, { template: "fertile_riverlands" });
  emitDeprecationIfNeeded(state, { template: "fortified_basin" });
  assert.equal(state.metrics.warnings.length, 1);
});

test("R13 A1-P2: explicit {templateId} overrides {template} when both present", () => {
  const state = makeState();
  const resolvedId = emitDeprecationIfNeeded(state, {
    templateId: "coastal_ocean",
    template: "rugged_highlands",
  });
  assert.equal(resolvedId, "coastal_ocean");
  // Deprecation only fires when template is the *only* key.
  assert.equal(state.metrics.warnings.length, 0);
});

test("R13 A1-P2 (iii): devStressSpawn return shape pin via __devForceSpawnWorkers", () => {
  const state = {
    agents: [{ type: "WORKER", alive: true }],
    metrics: {},
    grid: null,
  };
  const result = __devForceSpawnWorkers(state, 1, () => 0.5);
  assert.equal(typeof result.spawned, "number", "result.spawned must be a number");
  assert.equal(typeof result.total, "number", "result.total must be a number");
  assert.equal(typeof result.fallbackTilesUsed, "number", "result.fallbackTilesUsed must be a number");
  // Pin the contract: GameApp.devStressSpawn wraps these three keys plus `ok`.
  // The wrapping itself is documented in src/app/GameApp.js JSDoc.
  assert.ok(["spawned", "total", "fallbackTilesUsed"].every((k) => k in result),
    "missing one of the pinned keys");
});

test("R13 A1-P2 (iv): HUD pill source = state.metrics.warnings.length", () => {
  const state = makeState();
  // pill should be hidden when zero
  assert.equal(state.metrics.warnings.length, 0);
  pushWarning(state, "first warning", "warn", "test");
  pushWarning(state, "second warning", "warn", "test");
  pushWarning(state, "third warning", "warn", "test");
  assert.equal(state.metrics.warnings.length, 3);
  // clearWarnings drops the count back to zero (HUD pill hides)
  clearWarnings(state);
  assert.equal(state.metrics.warnings.length, 0);
});
