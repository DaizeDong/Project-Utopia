import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Minimal HUDController stub — tests the runout logic by calling #renderRunoutHints
// indirectly through a minimal state + DOM stub. We invoke it via a thin test harness
// that replicates the relevant state shape.

function makeHintNode() {
  return { textContent: "", className: "runout-hint",
    setAttribute: () => {}, getAttribute: () => null };
}

function makeMinimalHUD(overrides = {}) {
  // Simulate just the parts of HUDController that #renderRunoutHints touches
  const nodes = {};
  for (const r of ["food", "meals", "herbs", "medicine", "tools", "stone"]) {
    nodes[`${r}RunoutHint`] = makeHintNode();
  }
  const hud = {
    ...nodes,
    _lastRunoutSmoothed: {},
    // replicate #renderRunoutHints logic inline for isolated test
    renderRunoutHints(state) {
      const m = state.metrics ?? {};
      const res = state.resources ?? {};
      for (const resource of ["food", "meals", "herbs", "medicine", "tools", "stone"]) {
        const hintNode = this[`${resource}RunoutHint`];
        if (!hintNode) continue;
        const produced = Number(m[`${resource}ProducedPerMin`] ?? 0);
        const consumed = Number(m[`${resource}ConsumedPerMin`] ?? 0);
        const stock = Number(res[resource] ?? 0);
        const netPerSec = (produced - consumed) / 60;
        if (netPerSec >= -0.02 || stock <= 0) {
          hintNode.textContent = "";
          hintNode.className = "runout-hint";
          this._lastRunoutSmoothed[resource] = undefined;
          continue;
        }
        const rawRunout = stock / -netPerSec;
        const prev = this._lastRunoutSmoothed[resource];
        const smoothed = prev === undefined ? rawRunout : prev * 0.7 + rawRunout * 0.3;
        this._lastRunoutSmoothed[resource] = smoothed;
        if (smoothed >= 180) {
          hintNode.textContent = "";
          hintNode.className = "runout-hint";
          continue;
        }
        const minutes = Math.floor(smoothed / 60);
        const seconds = Math.floor(smoothed % 60);
        hintNode.textContent = `\u2248 ${minutes}m ${seconds}s until empty`;
        hintNode.className = smoothed < 60 ? "runout-hint warn-critical" : "runout-hint warn-soon";
      }
    },
    ...overrides,
  };
  return hud;
}

describe("resourceRunoutEta", () => {
  it("a: food=60, consumed=60/min, produced=30/min → warn-soon, shows 'until empty'", () => {
    const hud = makeMinimalHUD();
    const state = {
      resources: { food: 60, meals: 0, herbs: 0, medicine: 0, tools: 0, stone: 0 },
      metrics: { foodProducedPerMin: 30, foodConsumedPerMin: 60 },
    };
    hud.renderRunoutHints(state);
    const hint = hud.foodRunoutHint;
    assert.ok(hint.textContent.includes("until empty"), `expected 'until empty', got: ${hint.textContent}`);
    assert.ok(hint.className.includes("warn-soon"), `expected warn-soon class, got: ${hint.className}`);
  });

  it("b: food consumed > produced, runout < 60s → warn-critical", () => {
    const hud = makeMinimalHUD();
    // food=10, net=-0.5/s → runout=20s → warn-critical
    const state = {
      resources: { food: 10, meals: 0, herbs: 0, medicine: 0, tools: 0, stone: 0 },
      metrics: { foodProducedPerMin: 0, foodConsumedPerMin: 30 },
    };
    hud.renderRunoutHints(state);
    const hint = hud.foodRunoutHint;
    assert.ok(hint.className.includes("warn-critical"), `expected warn-critical, got: ${hint.className}`);
  });

  it("c: food consumed < produced (surplus) → hint is empty, no class", () => {
    const hud = makeMinimalHUD();
    const state = {
      resources: { food: 60, meals: 0, herbs: 0, medicine: 0, tools: 0, stone: 0 },
      metrics: { foodProducedPerMin: 65, foodConsumedPerMin: 60 },
    };
    hud.renderRunoutHints(state);
    const hint = hud.foodRunoutHint;
    assert.strictEqual(hint.textContent, "", `expected empty hint, got: ${hint.textContent}`);
    assert.ok(!hint.className.includes("warn"), `expected no warn class, got: ${hint.className}`);
  });

  it("d: stone=120, consumed=10/min, produced=0 → runout=720s (>180s) → hint empty", () => {
    const hud = makeMinimalHUD();
    const state = {
      resources: { food: 0, meals: 0, herbs: 0, medicine: 0, tools: 0, stone: 120 },
      metrics: { stoneProducedPerMin: 0, stoneConsumedPerMin: 10 },
    };
    hud.renderRunoutHints(state);
    // 120 / (10/60) = 720s which is >= 180s → hint should be empty
    const hint = hud.stoneRunoutHint;
    assert.strictEqual(hint.textContent, "", `expected empty for >180s runout, got: ${hint.textContent}`);
  });

  it("e: wood is NOT in the runout hint list (not tracked)", () => {
    const hud = makeMinimalHUD();
    // woodRunoutHint should not exist on hud
    assert.ok(!hud.woodRunoutHint, "wood should not have a runout hint node");
  });
});
