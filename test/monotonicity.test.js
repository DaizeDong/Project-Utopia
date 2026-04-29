import test from "node:test";
import assert from "node:assert/strict";

import {
  bootHeadlessSim,
  runToDayBoundary,
  validateCheckpoints,
} from "../scripts/long-horizon-helpers.mjs";

// Living World v0.8.0 spec § 16.6 — the monotonicity test.
//
// For seeds {1, 2, 3}, drive the sim toward 180 in-game days and assert that
// the DevIndex monotonicity rule holds between any pair of surviving (non-
// post-terminal) checkpoints:
//
//   DevIndex(D_{i+1}) ≥ 0.85 × DevIndex(D_i)
//
// unless saturationIndicator(D_{i+1}) > 0.85 (plateau exemption).
//
// Pre-tuning note: Phase 6 lands the harness; some seeds may die before day
// 180. In that case we still validate the surviving checkpoints — the
// harness correctly flags post-terminal rows, and the monotonicity rule
// applies only to the surviving prefix. Phase 7 tuning will raise survival
// rates and tighten this to "all seeds reach day 180".
//
// Runs at tick-rate 1 (dt = 1.0s) — the coarsest fidelity still matching the
// per-second system timings baked into BALANCE.

const SEEDS = [1, 2, 3];
const PRESET = "temperate_plains";
const TICK_RATE = 1;
const CHECKPOINTS = [30, 90, 180];

// v0.8.5.1 — seed=3 was previously skipped (v0.8.4 algorithmic-fallback farm
// collapse). The v0.8.5 balance pass softened the raid escalator (log curve,
// intensity cap), tightened farm yieldPool regen, and added wall-HP regen +
// saboteur engagement. Re-enabling seed=3 to see if the structural fix
// reaches the algorithmic-fallback trajectory. If it regresses, restore the
// skip with a v0.8.6 tracker note.
const KNOWN_ISSUE_SEEDS_V0_8_4 = new Set();

for (const seed of SEEDS) {
  if (KNOWN_ISSUE_SEEDS_V0_8_4.has(seed)) {
    test(
      `monotonicity seed=${seed} — DevIndex non-regression across surviving checkpoints`,
      { skip: "v0.8.4 known issue — algorithmic fallback collapses farms by day 90; tracked for v0.8.5" },
      () => {},
    );
    continue;
  }
  test(`monotonicity seed=${seed} — DevIndex non-regression across surviving checkpoints`, () => {
    const sim = bootHeadlessSim({ seed, preset: PRESET, tickRate: TICK_RATE });
    const rawCheckpoints = [];
    for (const day of CHECKPOINTS) {
      const result = runToDayBoundary(sim, day, {
        earlyStopOnDeath: false,
        earlyStopOnSaturation: false,
      });
      assert.ok(result.checkpoint, `seed=${seed}: checkpoint missing at day ${day}`);
      rawCheckpoints.push(result.checkpoint);
      if (result.stopped === "post_terminal" || result.stopped === "loss") {
        // Sim died — stop driving the boundary loop. The post-terminal
        // checkpoint is retained so the data-integrity rule can assert on
        // it, but we don't keep ticking a dead colony.
        break;
      }
    }

    // Pull out only the surviving prefix for monotonicity. The dead-colony
    // checkpoint (if any) is validated separately via the data-integrity
    // rule, not the regression rule.
    const surviving = rawCheckpoints.filter((cp) => !cp.postTerminal);
    for (const cp of surviving) {
      assert.ok(Number.isFinite(cp.devIndex),
        `seed=${seed} day=${cp.day}: DevIndex must be finite`);
    }

    if (surviving.length < 2) {
      console.log(
        `[monotonicity] seed=${seed}: only ${surviving.length} surviving checkpoint(s) `
        + `before sim terminated — monotonicity rule vacuously satisfied; `
        + `Phase 7 tuning will extend colony survival.`,
      );
      return;
    }

    const { violations } = validateCheckpoints(surviving);
    const monoViolations = violations.filter((v) => v.kind === "monotonicity_violation");
    assert.deepEqual(
      monoViolations,
      [],
      `seed=${seed}: monotonicity violated among surviving checkpoints — ${JSON.stringify(monoViolations)}\n`
      + `DIs=${surviving.map((c) => c.devIndex).join(", ")} `
      + `sats=${surviving.map((c) => c.saturation).join(", ")}`,
    );
  });
}
