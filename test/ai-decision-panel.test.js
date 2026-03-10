import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { AIDecisionPanel } from "../src/ui/panels/AIDecisionPanel.js";

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

test("AIDecisionPanel renders a live causal chain alongside parsed directives", () => {
  const nodes = {
    aiDecisionPanelBody: makeRoot(),
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
    const state = createInitialGameState({ seed: 1337 });
    state.metrics.timeSec = 2.4;
    state.metrics.logistics = {
      isolatedWorksites: 1,
      overloadedWarehouses: 0,
      stretchedWorksites: 0,
      summary: "Logistics: 1 isolated worksite needs depot access.",
    };
    state.ai.lastEnvironmentSource = "fallback";
    state.ai.lastEnvironmentModel = "gpt-4.1-mini";
    state.ai.lastEnvironmentResultSec = 0.2;
    state.ai.lastPolicySource = "fallback";
    state.ai.lastPolicyModel = "gpt-4.1-mini";
    state.ai.lastPolicyResultSec = 0.2;
    state.ai.lastEnvironmentDirective = {
      weather: "rain",
      durationSec: 14,
      factionTension: 0.6,
      focus: "contested logistics lane",
      summary: "Maintain contested logistics lane for 14s without obscuring the map's main pressure.",
      steeringNotes: ["Keep route pressure spatial and readable."],
      eventSpawns: [{ type: "banditRaid", intensity: 0.9, durationSec: 12 }],
    };
    state.ai.groupStateTargets.set("workers", {
      targetState: "seek_task",
      priority: 0.45,
      expiresAtSec: 18,
    });
    state.ai.groupPolicies.set("workers", {
      expiresAtSec: 24,
      data: {
        groupId: "workers",
        ttlSec: 24,
        riskTolerance: 0.35,
        intentWeights: { deliver: 1.4, eat: 1.2, farm: 1.0 },
        targetPriorities: { warehouse: 1.5, depot: 1.2, safety: 1.1 },
        focus: "depot throughput",
        summary: "Keep workers fed, reconnect routes, and unload cargo before harvest loops stall.",
        steeringNotes: ["Protect delivery chains before raw output."],
      },
    });

    const panel = new AIDecisionPanel(state);
    panel.render();

    assert.match(nodes.aiDecisionPanelBody.innerHTML, /Live Causal Chain/);
    assert.match(nodes.aiDecisionPanelBody.innerHTML, /Reconnect 1 isolated worksite/);
    assert.match(nodes.aiDecisionPanelBody.innerHTML, /contested logistics lane/);
    assert.match(nodes.aiDecisionPanelBody.innerHTML, /depot throughput/);
  } finally {
    globalThis.document = prevDocument;
    globalThis.window = prevWindow;
  }
});
