import test from "node:test";
import assert from "node:assert/strict";

import { AIExchangePanel } from "../src/ui/panels/AIExchangePanel.js";

function makeRoot() {
  return {
    innerHTML: "",
    scrollTop: 0,
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
  };
}

function makeExchange(category, decisionResult) {
  return {
    category,
    label: category,
    simSec: 12.3,
    source: "llm",
    fallback: false,
    model: "gpt-test",
    endpoint: "/api/ai/environment",
    promptSystem: `${category} system prompt`,
    promptUser: `${category} user prompt`,
    requestPayload: { endpoint: "/api/ai/environment", channel: category },
    requestSummary: { channel: category },
    rawModelContent: JSON.stringify(decisionResult),
    parsedBeforeValidation: decisionResult,
    guardedOutput: decisionResult,
    decisionResult,
    error: "",
  };
}

test("AIExchangePanel renders LLM calls by documented categories", () => {
  const nodes = {
    aiExchangePanelBody: makeRoot(),
  };
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  globalThis.document = {
    getElementById(id) {
      return nodes[id] ?? null;
    },
  };
  globalThis.window = {
    addEventListener() {},
  };

  try {
    const state = {
      ai: {
        lastEnvironmentExchange: makeExchange("environment-director", { weather: "rain", focus: "east depot" }),
        lastStrategicExchange: makeExchange("strategic-director", { phase: "industrialize", primaryGoal: "Build quarry" }),
        lastPolicyExchange: makeExchange("npc-brain", { policies: [{ groupId: "workers", focus: "depot throughput" }] }),
        environmentExchanges: [],
        strategicExchanges: [],
        policyExchanges: [],
      },
    };

    const panel = new AIExchangePanel(state);
    panel.render();

    const html = nodes.aiExchangePanelBody.innerHTML;
    assert.match(html, /Environment Director/);
    assert.match(html, /Strategic Director/);
    assert.match(html, /NPC Brain/);
    assert.match(html, /Colony Planner/);
    assert.match(html, /not wired in live runtime/i);
    assert.match(html, /Prompt Input: System/);
    assert.match(html, /Raw Model Content/);
    assert.match(html, /Decision Result/);
    assert.match(html, /industrialize/);
  } finally {
    globalThis.document = prevDocument;
    globalThis.window = prevWindow;
  }
});
