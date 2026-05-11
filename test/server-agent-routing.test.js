// agent-routing — confirms the cross-vendor cell table is well-formed:
//   1) every cell label resolves to a 4-channel backend map without throwing
//   2) FB is all fallback (NoopAgentAdapter)
//   3) SS is all the same model
//   4) XV-DIVERSE-LIGHT and XV-DIVERSE-STRONG span 4 distinct vendors
//   5) instantiateAdapterForBackend dispatches LLMClient vs Noop correctly

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_AGENT_ROUTING,
  MODEL,
  buildBackendsForCell,
  instantiateAdapterForBackend,
  listCellLabels,
} from "../server/config/agent-routing.js";
import { CHANNELS, NoopAgentAdapter } from "../src/simulation/ai/llm/AgentAdapter.js";
import { LLMClient } from "../src/simulation/ai/llm/LLMClient.js";

const EXPECTED_CELLS = [
  "FB", "WW", "SS", "SW", "WS",
  "XV-OPUS-SONNET", "XV-DIVERSE-LIGHT", "XV-DIVERSE-STRONG", "XV-OPENWEIGHT-ONLY",
];

test("agent-routing: every expected cell label is declared", () => {
  const labels = listCellLabels();
  for (const cell of EXPECTED_CELLS) {
    assert.ok(labels.includes(cell), `missing cell ${cell} (have: ${labels.join(",")})`);
  }
  // All 4 channels covered for every cell — no silent gaps.
  for (const cell of EXPECTED_CELLS) {
    const map = buildBackendsForCell(cell);
    assert.equal(map.size, CHANNELS.length, `cell ${cell} channel count`);
    for (const ch of CHANNELS) {
      const cfg = map.get(ch);
      assert.ok(cfg && typeof cfg === "object", `${cell}/${ch} missing`);
      assert.ok(typeof cfg.baseUrl === "string", `${cell}/${ch} baseUrl`);
      assert.ok(typeof cfg.model === "string", `${cell}/${ch} model`);
    }
  }
});

test("agent-routing: buildBackendsForCell throws on unknown cell", () => {
  assert.throws(() => buildBackendsForCell("NOT-REAL"), /unknown cell label/);
});

test("agent-routing: FB cell routes every channel to the fallback sentinel", () => {
  const map = buildBackendsForCell("FB");
  for (const cfg of map.values()) {
    assert.equal(cfg.model, MODEL.FALLBACK);
  }
  // Materialise: every backend in FB must be a NoopAgentAdapter.
  for (const cfg of map.values()) {
    const adapter = instantiateAdapterForBackend(cfg);
    assert.ok(adapter instanceof NoopAgentAdapter, "FB must produce Noop adapters");
  }
});

test("agent-routing: SS routes all 4 channels to the same Sonnet model", () => {
  const map = buildBackendsForCell("SS");
  const models = new Set();
  for (const cfg of map.values()) models.add(cfg.model);
  assert.equal(models.size, 1, `SS should be homogeneous, got ${[...models].join(",")}`);
  assert.equal([...models][0], MODEL.CLAUDE_SONNET);
});

test("agent-routing: XV-DIVERSE-LIGHT spans 4 distinct vendors and 4 distinct models", () => {
  const map = buildBackendsForCell("XV-DIVERSE-LIGHT");
  const baseUrls = new Set();
  const models = new Set();
  for (const cfg of map.values()) {
    baseUrls.add(cfg.baseUrl);
    models.add(cfg.model);
  }
  assert.equal(baseUrls.size, 4, "4 distinct baseUrls");
  assert.equal(models.size, 4, "4 distinct models");
});

test("agent-routing: XV-DIVERSE-STRONG spans 4 distinct vendors and 4 distinct models", () => {
  const map = buildBackendsForCell("XV-DIVERSE-STRONG");
  const baseUrls = new Set();
  const models = new Set();
  for (const cfg of map.values()) {
    baseUrls.add(cfg.baseUrl);
    models.add(cfg.model);
  }
  assert.equal(baseUrls.size, 4);
  assert.equal(models.size, 4);
});

test("agent-routing: SW puts strong model only on environment-director", () => {
  const map = buildBackendsForCell("SW");
  assert.equal(map.get("environment-director").model, MODEL.CLAUDE_SONNET);
  for (const ch of ["npc-policy", "strategic-plan", "colony-agent"]) {
    assert.notEqual(map.get(ch).model, MODEL.CLAUDE_SONNET, `channel ${ch}`);
  }
});

test("agent-routing: WS puts strong model only on npc-policy", () => {
  const map = buildBackendsForCell("WS");
  assert.equal(map.get("npc-policy").model, MODEL.CLAUDE_SONNET);
  for (const ch of ["environment-director", "strategic-plan", "colony-agent"]) {
    assert.notEqual(map.get(ch).model, MODEL.CLAUDE_SONNET, `channel ${ch}`);
  }
});

test("agent-routing: instantiateAdapterForBackend returns LLMClient for real backends", () => {
  const adapter = instantiateAdapterForBackend({
    baseUrl: "https://api.example.com/v1",
    model: "fake-model",
  });
  assert.ok(adapter instanceof LLMClient);
});

test("agent-routing: instantiateAdapterForBackend returns Noop for fallback baseUrl", () => {
  const a = instantiateAdapterForBackend({ baseUrl: "fallback://noop", model: "fallback" });
  const b = instantiateAdapterForBackend({ kind: "fallback", baseUrl: "", model: "" });
  const c = instantiateAdapterForBackend(null);
  assert.ok(a instanceof NoopAgentAdapter);
  assert.ok(b instanceof NoopAgentAdapter);
  assert.ok(c instanceof NoopAgentAdapter);
});

test("agent-routing: DEFAULT_AGENT_ROUTING is frozen", () => {
  assert.equal(Object.isFrozen(DEFAULT_AGENT_ROUTING), true);
});
