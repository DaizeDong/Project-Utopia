// v0.8.2 Round-1 01e-innovation — Heat Lens legend synchronisation tests.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round1/Plans/01e-innovation.md
//
// Verifies:
//   (1) #heatLensLegend DOM is present in index.html, starts hidden, and
//       matches the red/blue + surplus/starved semantics that the
//       companion CSS expects;
//   (2) GameApp#toggleHeatLens wires the legend alongside the button's
//       `.active` class so the cycle pressure → heat → off keeps the legend
//       visible ONLY in heat mode. We mirror the toggleHeatLens logic into
//       the test with a fake renderer + document stub (full GameApp is too
//       heavy to instantiate in a unit test — it boots Three.js, workers,
//       and the full ECS).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("index.html ships a hidden Heat Lens legend next to the Heat Lens button", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.ok(
    html.includes('id="heatLensLegend"'),
    "index.html missing #heatLensLegend element",
  );
  assert.ok(
    /id="heatLensLegend"[^>]*hidden/.test(html),
    "#heatLensLegend must start with the `hidden` attribute so the default (pressure-lens) HUD does not show it",
  );
  assert.ok(
    html.includes('class="legend-dot legend-red"'),
    "#heatLensLegend must include a red legend dot",
  );
  assert.ok(
    html.includes('class="legend-dot legend-blue"'),
    "#heatLensLegend must include a blue legend dot",
  );
  // The legend text "surplus" and "starved" match the toggleHeatLens toast
  // wording — that consistency is the whole point of the legend.
  assert.ok(/surplus/.test(html), "#heatLensLegend must include the word 'surplus'");
  assert.ok(/starved/.test(html), "#heatLensLegend must include the word 'starved'");
});

test("GameApp.toggleHeatLens source wires both the button active class AND the legend hidden flag", () => {
  const src = fs.readFileSync("src/app/GameApp.js", "utf8");
  // Grab the toggleHeatLens() body up to the matching closing brace.
  const methodMatch = src.match(/toggleHeatLens\s*\(\)\s*\{[\s\S]*?\n\s{2}\}/);
  assert.ok(methodMatch, "expected toggleHeatLens() method body to exist");
  const body = methodMatch[0];
  assert.ok(
    /getElementById\(\s*["']heatLensBtn["']\s*\)/.test(body),
    "toggleHeatLens should look up #heatLensBtn",
  );
  assert.ok(
    /getElementById\(\s*["']heatLensLegend["']\s*\)/.test(body),
    "toggleHeatLens should look up #heatLensLegend to sync the legend visibility",
  );
  assert.ok(
    /legend\.hidden\s*=\s*\(?\s*mode\s*!==\s*["']heat["']\s*\)?/.test(body),
    "toggleHeatLens must set legend.hidden = (mode !== 'heat')",
  );
});

// Helper: mirror the exact toggle logic from GameApp#toggleHeatLens so we
// can exercise the cycle without booting the whole GameApp stack. Keeps
// the assertion tightly coupled to the contract documented in the plan
// (Step 5): after every toggle the button `.active` class and the legend
// `hidden` flag must BOTH reflect `mode === "heat"`.
function simulateToggleHeatLensCycle() {
  const rendererLens = { mode: "pressure" };
  const btn = {
    classes: new Set(),
    classList: {
      toggle(cls, on) {
        if (on) btn.classes.add(cls); else btn.classes.delete(cls);
      },
    },
  };
  const legend = { hidden: true };
  const doc = {
    getElementById(id) {
      if (id === "heatLensBtn") return btn;
      if (id === "heatLensLegend") return legend;
      return null;
    },
  };

  // Same cycle order as SceneRenderer#toggleHeatLens: pressure → heat → off → pressure.
  const cycle = () => {
    rendererLens.mode = rendererLens.mode === "pressure"
      ? "heat"
      : rendererLens.mode === "heat"
        ? "off"
        : "pressure";
    const mode = rendererLens.mode;
    // Mirror of GameApp.js toggleHeatLens button + legend sync:
    const b = doc.getElementById("heatLensBtn");
    if (b) b.classList.toggle("active", mode === "heat");
    const l = doc.getElementById("heatLensLegend");
    if (l) l.hidden = (mode !== "heat");
    return { mode, active: btn.classes.has("active"), legendHidden: legend.hidden };
  };
  return cycle;
}

test("heat lens cycle: pressure→heat shows legend, heat→off hides it, off→pressure stays hidden", () => {
  const cycle = simulateToggleHeatLensCycle();

  // pressure → heat
  let step = cycle();
  assert.equal(step.mode, "heat");
  assert.equal(step.active, true, "heat mode must set button.active");
  assert.equal(step.legendHidden, false, "heat mode must show the legend");

  // heat → off
  step = cycle();
  assert.equal(step.mode, "off");
  assert.equal(step.active, false, "off mode must drop button.active");
  assert.equal(step.legendHidden, true, "off mode must hide the legend");

  // off → pressure
  step = cycle();
  assert.equal(step.mode, "pressure");
  assert.equal(step.active, false, "pressure mode must leave button.active off");
  assert.equal(step.legendHidden, true, "pressure mode must keep the legend hidden");
});
