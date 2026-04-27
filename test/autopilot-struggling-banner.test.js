import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAutopilotStatus } from "../src/ui/hud/autopilotStatus.js";

function makeState(overrides = {}) {
  return {
    ai: {
      enabled: overrides.enabled ?? true,
      mode: "fallback",
      lastPolicyResultSec: -1,
      enabledSinceSec: overrides.enabledSinceSec ?? 0,
      pausedByCrisis: false,
      ...overrides.ai,
    },
    resources: { food: overrides.food ?? 50, ...overrides.resources },
    metrics: {
      timeSec: overrides.timeSec ?? 30,
      starvationRiskCount: overrides.starvRisk ?? 0,
      ...overrides.metrics,
    },
    services: {
      balance: {
        foodEmergencyThreshold: 18,
        casualUx: { struggleBannerGraceSec: 20, struggleFoodPctOfEmergency: 1.1 },
      },
    },
  };
}

describe("autopilot struggling banner", () => {
  it("A: food below emergency floor, grace elapsed → struggling=true", () => {
    const state = makeState({ food: 4, timeSec: 25, enabledSinceSec: 0, starvRisk: 0 });
    const status = getAutopilotStatus(state);
    assert.ok(status.struggling, "expected struggling=true");
    assert.ok(status.text.includes("manual takeover recommended"), "suffix missing");
  });

  it("B: food below floor but grace not elapsed → struggling=false", () => {
    const state = makeState({ food: 4, timeSec: 10, enabledSinceSec: 0 });
    const status = getAutopilotStatus(state);
    assert.equal(status.struggling, false);
  });

  it("C: autopilot disabled → struggling=false", () => {
    const state = makeState({ enabled: false, food: 4, timeSec: 300, enabledSinceSec: 0 });
    const status = getAutopilotStatus(state);
    assert.equal(status.struggling, false);
  });

  it("D: food healthy, starvRisk=0 → struggling=false", () => {
    const state = makeState({ food: 50, timeSec: 300, starvRisk: 0 });
    const status = getAutopilotStatus(state);
    assert.equal(status.struggling, false);
  });

  it("E: starvRisk=3, grace elapsed → struggling=true regardless of food", () => {
    const state = makeState({ food: 50, timeSec: 300, enabledSinceSec: 0, starvRisk: 3 });
    const status = getAutopilotStatus(state);
    assert.ok(status.struggling, "expected struggling=true when starvRisk>0 and grace elapsed");
  });
});
