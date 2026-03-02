import test from "node:test";
import assert from "node:assert/strict";

import { SeededRng, deriveRngSeed } from "../src/app/rng.js";
import { buildEnvironmentFallback } from "../src/simulation/ai/llm/PromptBuilder.js";

test("SeededRng sequence is deterministic", () => {
  const seed = deriveRngSeed(2026, "simulation");
  const a = new SeededRng(seed);
  const b = new SeededRng(seed);

  const seqA = Array.from({ length: 12 }, () => a.next().toFixed(8));
  const seqB = Array.from({ length: 12 }, () => b.next().toFixed(8));
  assert.deepEqual(seqA, seqB);
});

test("fallback environment decision is deterministic for identical summary", () => {
  const summary = {
    resources: { food: 43, wood: 27 },
    traffic: { congestion: 0.31 },
  };
  const a = buildEnvironmentFallback(summary);
  const b = buildEnvironmentFallback(summary);
  assert.deepEqual(a, b);
});
