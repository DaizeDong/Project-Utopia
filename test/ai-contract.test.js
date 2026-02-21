import test from "node:test";
import assert from "node:assert/strict";

import { LLMClient } from "../src/simulation/ai/llm/LLMClient.js";
import { guardEnvironmentDirective } from "../src/simulation/ai/llm/Guardrails.js";
import { validateEnvironmentDirective } from "../src/simulation/ai/llm/ResponseSchema.js";

test("Guardrails clamp unsafe environment values", () => {
  const guarded = guardEnvironmentDirective({
    weather: "clear",
    durationSec: 9999,
    factionTension: 5,
    eventSpawns: [{ type: "banditRaid", intensity: 99, durationSec: 999 }],
  });

  assert.ok(guarded.durationSec <= 120);
  assert.ok(guarded.factionTension <= 1);
  assert.ok(guarded.eventSpawns[0].intensity <= 3);
  assert.ok(guarded.eventSpawns[0].durationSec <= 60);
});

test("Schema validator rejects malformed environment payload", () => {
  const validation = validateEnvironmentDirective({ weather: "clear" });
  assert.equal(validation.ok, false);
});

test("LLMClient returns fallback contract when disabled", async () => {
  const client = new LLMClient();
  const summary = { resources: { food: 10, wood: 20 }, traffic: { congestion: 0.2 } };
  const result = await client.requestEnvironment(summary, false);

  assert.equal(result.fallback, true);
  assert.ok(result.data);
});
