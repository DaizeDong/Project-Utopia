import test from "node:test";
import assert from "node:assert/strict";

import { AIAutomationPanel } from "../src/ui/panels/AIAutomationPanel.js";

function makeRoot() {
  return {
    innerHTML: "",
  };
}

test("AIAutomationPanel distinguishes LLM, rule-based automation, and inactive planner", () => {
  const nodes = {
    aiAutomationSummaryBody: makeRoot(),
  };
  const prevDocument = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      return nodes[id] ?? null;
    },
  };

  try {
    const state = {
      metrics: { proxyHealth: "up", proxyModel: "gpt-test", timeSec: 15 },
      ai: {
        enabled: true,
        coverageTarget: "live",
        mode: "proxy",
        lastEnvironmentSource: "llm",
        lastEnvironmentResultSec: 10,
        environmentDecisionCount: 1,
        environmentLlmCount: 1,
        lastEnvironmentExchange: {
          source: "llm",
          fallback: false,
          decisionResult: { weather: "rain", focus: "east depot" },
        },
        lastStrategySource: "llm",
        lastStrategySec: 11,
        strategyDecisionCount: 1,
        lastStrategicExchange: { source: "llm", fallback: false },
        strategy: { priority: "grow", phase: "industrialize", primaryGoal: "Build quarry" },
        lastPolicySource: "fallback",
        policyDecisionCount: 1,
        policyLlmCount: 0,
        lastPolicyBatch: [{ groupId: "workers", focus: "depot throughput" }],
        lastPolicyExchange: { source: "fallback", fallback: true },
        groupStateTargets: new Map([["workers", { targetState: "seek_task" }]]),
        colonyDirector: { phase: "bootstrap", buildsPlaced: 3, lastEvalSec: 12 },
      },
    };

    const panel = new AIAutomationPanel(state);
    panel.render();

    const html = nodes.aiAutomationSummaryBody.innerHTML;
    assert.match(html, /Autopilot ON/);
    assert.match(html, /Environment Director/);
    assert.match(html, /Strategic Director/);
    assert.match(html, /NPC Brain/);
    assert.match(html, /Build Automation/);
    assert.match(html, /rule-based active/);
    assert.match(html, /Colony Planner LLM/);
    assert.match(html, /not wired/);
  } finally {
    globalThis.document = prevDocument;
  }
});

test("AIAutomationPanel explains why fallback rows update while Autopilot is off", () => {
  const nodes = {
    aiAutomationSummaryBody: makeRoot(),
  };
  const prevDocument = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      return nodes[id] ?? null;
    },
  };

  try {
    const state = {
      metrics: { proxyHealth: "up", proxyModel: "gpt-test" },
      ai: {
        enabled: false,
        coverageTarget: "fallback",
        mode: "fallback",
        lastEnvironmentSource: "fallback",
        lastStrategySource: "fallback",
        lastPolicySource: "fallback",
        environmentDecisionCount: 2,
        strategyDecisionCount: 2,
        policyDecisionCount: 2,
        lastEnvironmentExchange: { source: "fallback", fallback: true },
        lastStrategicExchange: { source: "fallback", fallback: true },
        lastPolicyExchange: { source: "fallback", fallback: true },
      },
    };

    const panel = new AIAutomationPanel(state);
    panel.render();

    const html = nodes.aiAutomationSummaryBody.innerHTML;
    assert.match(html, /Autopilot OFF/);
    assert.match(html, /LLM calls disabled/);
    assert.match(html, /fallback directors still visible/);
    assert.match(html, /rule-based simulation directors keep weather/);
  } finally {
    globalThis.document = prevDocument;
  }
});
