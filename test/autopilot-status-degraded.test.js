// v0.8.2 Round-5 Wave-3 (01e Step 6) — Autopilot banner degraded-state tests.
//
// getAutopilotStatus(state) emits the HUD banner text and tooltip. These
// tests cover the three shapes mapped in the plan:
//   (a) LLM OK      — banner shows mode/coverage and countdown, no offline tag
//   (b) LLM offline — banner appends " | LLM offline — DIRECTOR steering" and
//                     the compound mode "fallback/fallback" collapses to
//                     "rule-based"
//   (c) Autopilot off — banner preserves the legacy manual-control copy,
//                       unaffected by the new suffix / rule-based rewrite.

import test from "node:test";
import assert from "node:assert/strict";

import { getAutopilotStatus } from "../src/ui/hud/autopilotStatus.js";

test("getAutopilotStatus: LLM OK shape — no 'LLM offline' suffix", () => {
  const status = getAutopilotStatus({
    ai: {
      enabled: true,
      mode: "llm",
      coverageTarget: "llm",
      lastPolicySource: "llm",
      lastError: "",
      lastPolicyResultSec: 0,
    },
    metrics: { timeSec: 3, proxyHealth: "ok" },
  });
  assert.equal(status.enabled, true);
  assert.ok(!/LLM offline/.test(status.text),
    `LLM-OK banner should not advertise offline: ${status.text}`);
  assert.ok(!/fallback\/fallback/.test(status.text));
});

test("getAutopilotStatus: LLM offline shape (dev-mode) — appends 'LLM offline' and rewrites fallback/fallback", () => {
  // v0.8.2 Round-6 Wave-1 (01c-ui Step 4) — engineer-facing "LLM offline —
  // DIRECTOR steering" is now dev-mode-only. Pass `{ devMode: true }` to
  // retain the legacy assertion. The `test/hud-dev-string-quarantine.test.js`
  // suite covers the casual default shape (no countdown / no offline tag).
  const status = getAutopilotStatus({
    ai: {
      enabled: true,
      mode: "fallback",
      coverageTarget: "fallback",
      lastPolicySource: "fallback",
      lastError: "HTTP 503",
      lastPolicyResultSec: 2,
    },
    metrics: { timeSec: 5, proxyHealth: "error" },
  }, { devMode: true });
  assert.equal(status.enabled, true);
  // Compound mode collapses to the player-readable phrase.
  assert.ok(!/fallback\/fallback/.test(status.text),
    `fallback/fallback should collapse to rule-based: ${status.text}`);
  assert.match(status.text, /rule-based/);
  // Degraded suffix must surface.
  assert.match(status.text, /LLM offline/);
  assert.match(status.text, /DIRECTOR steering/);
  // Tooltip carries the long-form explanation.
  assert.match(status.title, /LLM unavailable/);
});

test("getAutopilotStatus: autopilot OFF shape — unchanged copy, no suffix", () => {
  const status = getAutopilotStatus({
    ai: {
      enabled: false,
      mode: "fallback",
      coverageTarget: "fallback",
      lastPolicySource: "fallback",
      lastError: "HTTP 503",
      lastPolicyResultSec: 0,
    },
    metrics: { timeSec: 0, proxyHealth: "error" },
  });
  assert.equal(status.enabled, false);
  // Autopilot-off copy is preserved verbatim.
  assert.equal(status.text, "Autopilot off. Manual control is active; fallback is ready.");
  assert.ok(!/LLM offline/.test(status.text));
});
