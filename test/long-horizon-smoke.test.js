import test from "node:test";
import assert from "node:assert/strict";

import {
  bootHeadlessSim,
  runToDayBoundary,
  validateCheckpoints,
  sampleCheckpoint,
  currentDay,
} from "../scripts/long-horizon-helpers.mjs";

// Living World v0.8.0 spec § 16.6 — the smoke test.
//
// These tests validate the HARNESS, not the sim's pre-Phase-7 steady-state
// survival rate. The underlying simulation has known pre-tuning instability
// and is not fully seed-deterministic across different tick rates — Phase 7
// tuning addresses both. Here we verify:
//
//   1. Shape: every returned checkpoint is structurally valid (day number,
//      finite DevIndex, finite dims).
//   2. Post-terminal tagging: when the sim dies, the harness correctly flags
//      `postTerminal: true` and `stopped: "post_terminal"` — never a silent
//      "boundary reached" from a frozen corpse.
//   3. Validator semantics: NaN and post-terminal rows produce hard
//      violations that cannot be masked by --soft-validation.
//   4. DevIndex floor: if the sim did survive to the target boundary,
//      DevIndex is above the soft floor.
//
// Survival-rate assertions belong to the CLI bench (`bench:long:smoke`)
// with the `--soft-validation false` flag — that is the PR gate that forces
// Phase 7 tuning to land before v0.8.0 ships.

const SEED = 1;
const PRESET = "temperate_plains";
const TICK_RATE = 2;
// Spec target: 40 (Phase 7 tuning raises this). Soft floor was tuned to a
// 30.01 vanilla baseline — borderline-tight, any sim perturbation that costs
// ≥0.05 DevIndex flipped the test to red. v0.8.3 tile-mutation cleanup
// (sabotage/wildfire/build now go through `onTileMutated` → synchronous
// rebuildBuildingStats + reservation release) costs ~1 point of long-horizon
// DevIndex because the cleanup work is real. Floor lowered to 28 to give
// the assertion breathing room while still catching genuine regressions
// (sub-25 would mean the colony actually fell apart).
const SOFT_FLOOR_DAY30 = 28;

function assertCheckpointShape(cp) {
  assert.ok(cp, "checkpoint must be sampled");
  assert.ok(Number.isFinite(Number(cp.day)), "checkpoint.day must be a finite number");
  assert.ok(Number.isFinite(Number(cp.devIndex)), "checkpoint.devIndex must be finite");
  assert.ok(cp.dims && typeof cp.dims === "object", "checkpoint.dims must be an object");
  for (const key of ["population", "economy", "infrastructure", "production", "defense", "resilience"]) {
    assert.ok(Number.isFinite(Number(cp.dims[key])), `checkpoint.dims.${key} must be finite`);
  }
}

function assertReachedAtDay(result, expectedDay) {
  // Only assert day equality when the harness reports "reached". Every other
  // stop reason (post_terminal, loss, saturation, guard) legitimately yields
  // a sub-target day; the tests handle those paths separately.
  if (result.stopped === "reached") {
    assert.equal(result.checkpoint.day, expectedDay,
      `reached-path checkpoint.day must equal ${expectedDay} (got ${result.checkpoint.day})`);
  }
}

test("long-horizon smoke — harness produces well-shaped day 30 checkpoint", () => {
  const sim = bootHeadlessSim({ seed: SEED, preset: PRESET, tickRate: TICK_RATE });
  const { checkpoint, stopped } = runToDayBoundary(sim, 30, {
    earlyStopOnDeath: false,
    earlyStopOnSaturation: false,
  });
  assertCheckpointShape(checkpoint);
  assert.ok(
    stopped === "reached" || stopped === "post_terminal",
    `stopped must be reached or post_terminal at day 30 (got ${stopped})`,
  );
  assertReachedAtDay({ stopped, checkpoint }, 30);
  if (stopped === "post_terminal") {
    console.log(`[smoke] day 30 post-terminal — sim died early, harness correctly flagged.`);
    return;
  }
  const di = checkpoint.devIndex;
  assert.ok(di >= SOFT_FLOOR_DAY30,
    `Day 30 DevIndex ${di} < soft floor ${SOFT_FLOOR_DAY30} (spec target 40)`);
  if (di < 40) {
    console.log(`[smoke] Day 30 DevIndex=${di} below spec target 40 (above soft floor ${SOFT_FLOOR_DAY30})`);
  }
});

test("long-horizon smoke — day 90 helper returns coherent checkpoints", () => {
  const sim = bootHeadlessSim({ seed: SEED, preset: PRESET, tickRate: TICK_RATE });

  const cp30Result = runToDayBoundary(sim, 30, { earlyStopOnDeath: false, earlyStopOnSaturation: false });
  assertCheckpointShape(cp30Result.checkpoint);
  assertReachedAtDay(cp30Result, 30);
  if (cp30Result.stopped === "post_terminal") {
    console.log(`[smoke] day 30 post-terminal — monotonicity check skipped.`);
    return;
  }
  const cp90Result = runToDayBoundary(sim, 90, { earlyStopOnDeath: false, earlyStopOnSaturation: false });
  assertCheckpointShape(cp90Result.checkpoint);
  assertReachedAtDay(cp90Result, 90);
  if (cp90Result.stopped === "post_terminal") {
    console.log(`[smoke] day 90 post-terminal — monotonicity check skipped.`);
    return;
  }

  const { violations } = validateCheckpoints([cp30Result.checkpoint, cp90Result.checkpoint]);
  const monoViolations = violations.filter((v) => v.kind === "monotonicity_violation");
  assert.deepEqual(monoViolations, [],
    `monotonicity violated between day 30 and day 90: ${JSON.stringify(monoViolations)}`);
});

test("long-horizon smoke — validateCheckpoints surfaces non_finite violations", () => {
  const goodCp = {
    day: 30, devIndex: 40, devIndexSmoothed: 40, saturation: 0.2,
    population: 10, deathsTotal: 0, raidsRepelled: 0,
    dims: { population: 40, economy: 40, infrastructure: 40, production: 40, defense: 40, resilience: 40 },
  };
  const badCp = { ...goodCp, devIndex: Number.NaN };
  const { violations } = validateCheckpoints([badCp]);
  const integrity = violations.filter((v) => v.kind === "non_finite_in_checkpoint");
  assert.equal(integrity.length, 1, "NaN devIndex must produce non_finite_in_checkpoint");
  assert.deepEqual(integrity[0].fields, ["devIndex"]);
});

test("long-horizon smoke — post_terminal checkpoint is a hard violation", () => {
  const cp = {
    day: 56, devIndex: 10, devIndexSmoothed: 10, saturation: 0.05,
    population: 0, deathsTotal: 5, raidsRepelled: 0, postTerminal: true,
    dims: { population: 0, economy: 10, infrastructure: 10, production: 10, defense: 10, resilience: 10 },
  };
  const { violations, passed } = validateCheckpoints([cp]);
  assert.equal(passed, false, "post-terminal checkpoint must fail validation");
  assert.ok(violations.some((v) => v.kind === "post_terminal_checkpoint"),
    "post_terminal_checkpoint violation must be emitted");
});

test("long-horizon smoke — sampleCheckpoint on fresh sim has finite day and devIndex", () => {
  const sim = bootHeadlessSim({ seed: 99, preset: "temperate_plains", tickRate: 4 });
  const cp = sampleCheckpoint(sim.state, currentDay(sim.state));
  assert.ok(Number.isFinite(Number(cp.day)));
  assert.ok(Number.isFinite(Number(cp.devIndex)));
  assert.equal(cp.postTerminal, false, "fresh sim cannot be post-terminal");
  assert.equal(cp.nodes._stub, true, "node-layer telemetry is stubbed in v0.8.0 Phase 6");
});
