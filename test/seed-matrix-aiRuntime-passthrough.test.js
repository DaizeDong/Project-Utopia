// Regression test for the SeedMatrix aiRuntime passthrough fix.
//
// Pre-fix bug: SeedMatrix.runOneCell read telemetry from `state.ai.runtime`
// (which never existed), so every cell returned aiRuntime.fallbackCalls === 0
// even when the adapter was the NoopAgentAdapter that always falls back.
// Post-fix: telemetry is read from `state.metrics.aiRuntime` (the canonical
// path populated by src/app/aiRuntimeStats.js) and the field names are
// remapped:
//   requestCount         -> totalCalls
//   fallbackResponseCount -> fallbackCalls
//   errorCount           -> schemaErrors
// Plus the S5 token-telemetry fields are passed through unchanged so DTE/E6
// cells can consume them.
//
// This test runs SeedMatrix on a NoopAgentAdapter scenario and asserts that
// at least one cell records fallbackCalls > 0 (since Noop always falls back),
// and that all the new token-telemetry keys are present and finite.

import test from "node:test";
import assert from "node:assert/strict";

import { runSeedMatrix } from "../src/benchmark/framework/SeedMatrix.js";
import { NoopAgentAdapter } from "../src/simulation/ai/llm/AgentAdapter.js";

test(
  "SeedMatrix aiRuntime passthrough — Noop adapter produces fallbackCalls > 0",
  { timeout: 180000 },
  async () => {
    const result = await runSeedMatrix({
      seeds: [42],
      scenarios: ["temperate_plains"],
      // Force aiEnabled so the brain/director systems actually dispatch
      // requests through the adapter; otherwise no telemetry accumulates.
      aiEnabled: true,
      agentConfig: { adapterClass: NoopAgentAdapter, adapterOpts: {} },
      durationSec: 12,
      dimensionOpts: { intervalSec: 2, durationSec: 12 },
    });

    assert.equal(result.cells.length, 1, "expected exactly 1 cell");
    const cell = result.cells[0];

    // Public API surface — old names preserved for backwards compat.
    assert.ok(
      Number.isFinite(cell.aiRuntime.totalCalls),
      "totalCalls must be finite",
    );
    assert.ok(
      Number.isFinite(cell.aiRuntime.fallbackCalls),
      "fallbackCalls must be finite",
    );
    assert.ok(
      Number.isFinite(cell.aiRuntime.schemaErrors),
      "schemaErrors must be finite",
    );

    // Core regression: NoopAgentAdapter always returns fallback responses,
    // so SeedMatrix should observe fallbackCalls > 0. Pre-fix this was
    // always 0 because the wrong state path was read.
    assert.ok(
      cell.aiRuntime.fallbackCalls > 0,
      `expected fallbackCalls > 0 with NoopAgentAdapter, got ${cell.aiRuntime.fallbackCalls}. ` +
        `If this is 0, SeedMatrix is reading aiRuntime from the wrong path again.`,
    );

    // S5 token-telemetry passthrough — keys must exist and be finite numbers.
    for (const key of [
      "promptTokens",
      "completionTokens",
      "cachedTokens",
      "kvCacheHits",
      "prefixHits",
      "firstTokenLatencyMs",
      "tokensPerSec",
    ]) {
      assert.ok(
        key in cell.aiRuntime,
        `aiRuntime is missing token-telemetry key "${key}"`,
      );
      assert.ok(
        Number.isFinite(cell.aiRuntime[key]),
        `aiRuntime.${key} must be finite, got ${cell.aiRuntime[key]}`,
      );
    }
  },
);
