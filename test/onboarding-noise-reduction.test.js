// v0.8.2 Round-6 Wave-1 01a-onboarding (Step 10) — Onboarding noise-reduction
// Plan: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/01a-onboarding.md
//
// Three structural assertions guard the first-60-seconds trust cleanup:
//   1. Menu briefing formatters return DIFFERENT strings when the templateId
//      changes (briefing is synchronous; reviewer's "stale text" report was a
//      render race, not a stale formatter).
//   2. Heat-lens halo markers carry an empty label string — they no longer
//      leak the "halo" placeholder into player view.
//   3. The GameApp source no longer emits "WHISPER" / "LLM" / "proxy" tokens
//      via state.controls.actionMessage on the AI-proxy-down or no-API-key
//      paths (regression guard against dev jargon creeping back).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildHeatLens } from "../src/render/PressureLens.js";
import {
  formatTemplatePressure,
  formatTemplatePriority,
} from "../src/ui/hud/GameStateOverlay.js";
import { TILE } from "../src/config/constants.js";

describe("01a-onboarding — formatter briefing updates synchronously per template", () => {
  it("formatTemplatePressure produces distinct strings for distinct templates", () => {
    const plains = formatTemplatePressure("temperate_plains");
    const highlands = formatTemplatePressure("rugged_highlands");
    const rivers = formatTemplatePressure("fertile_riverlands");
    assert.ok(plains.length > 0, "plains pressure briefing empty");
    assert.ok(highlands.length > 0, "highlands pressure briefing empty");
    assert.ok(rivers.length > 0, "riverlands pressure briefing empty");
    // At least two of the three should differ — this proves the formatter
    // actually reads templateId rather than returning a constant.
    const distinct = new Set([plains, highlands, rivers]);
    assert.ok(distinct.size >= 2, `expected ≥2 distinct pressure strings, got ${distinct.size}`);
  });

  it("formatTemplatePriority produces distinct strings for distinct templates", () => {
    const a = formatTemplatePriority("temperate_plains");
    const b = formatTemplatePriority("rugged_highlands");
    const c = formatTemplatePriority("archipelago_isles");
    const distinct = new Set([a, b, c]);
    assert.ok(distinct.size >= 2, `expected ≥2 distinct priority strings, got ${distinct.size}`);
  });
});

describe("01a-onboarding — heat-lens halo markers no longer carry a visible label", () => {
  function makeStarvedKitchenState() {
    const W = 20;
    const H = 20;
    const tiles = new Uint8Array(W * H).fill(TILE.GRASS);
    tiles[10 + 10 * W] = TILE.KITCHEN; // single starved kitchen
    return {
      grid: { width: W, height: H, tiles, tileSize: 1 },
      resources: { food: 0, meals: 0, wood: 0, stone: 0, herbs: 0, tools: 0, medicine: 0 },
      metrics: { warehouseDensity: null },
      agents: [],
      buildings: {},
    };
  }

  it("every halo: marker has label === \"\" (regression guard)", () => {
    const markers = buildHeatLens(makeStarvedKitchenState());
    const halos = markers.filter((m) => String(m.id).startsWith("halo:"));
    assert.ok(halos.length > 0, "no halo markers emitted; precondition failed");
    for (const h of halos) {
      assert.strictEqual(
        h.label,
        "",
        `halo marker ${h.id} should have empty label, got ${JSON.stringify(h.label)}`,
      );
    }
  });
});

describe("01a-onboarding — AI proxy errors no longer leak dev jargon to the player", () => {
  // Static-source assertion: scan src/app/GameApp.js for the two known
  // proxy-error code paths and confirm the actionMessage assignment does not
  // contain forbidden tokens. We grep the raw source rather than driving the
  // GameApp class because the failure mode is a string regression, not a
  // runtime control-flow bug.
  const SRC = fs.readFileSync("src/app/GameApp.js", "utf8");

  // Locate every actionMessage assignment line and assert that the
  // proxy-related ones use the in-fiction phrasing.
  it("the no-API-key path uses in-fiction wording", () => {
    assert.match(
      SRC,
      /actionMessage\s*=\s*"Story AI offline — fallback director is steering\. \(Game still works\.\)"/,
      "no-API-key actionMessage should be in-fiction (Story AI offline ...)",
    );
  });

  it("the unreachable-proxy path uses in-fiction wording", () => {
    assert.match(
      SRC,
      /actionMessage\s*=\s*"Story AI is offline — fallback director is steering\. \(Game still works\.\)"/,
      "unreachable-proxy actionMessage should be in-fiction (Story AI is offline ...)",
    );
  });

  it("no actionMessage assignment leaks WHISPER / LLM / API key terms", () => {
    // Capture every literal RHS of `actionMessage = ` … `;`. We scan via a
    // line-anchored regex (the source uses single-line template/string
    // literals for these). Any match against the forbidden tokens fails.
    const lines = SRC.split(/\r?\n/);
    const offenders = [];
    for (const line of lines) {
      const m = line.match(/actionMessage\s*=\s*([`"][^`"]*[`"])/);
      if (!m) continue;
      const literal = m[1];
      if (/WHISPER|LLM|API key/i.test(literal)) {
        offenders.push(line.trim());
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `actionMessage assignments leak dev jargon: ${offenders.join(" || ")}`,
    );
  });
});
