import test from "node:test";
import assert from "node:assert/strict";

import { AIPolicyTimelinePanel } from "../src/ui/panels/AIPolicyTimelinePanel.js";

// v0.8.2 Round-5b Wave-1 (01e Step 4) — AIPolicyTimelinePanel renders
// state.ai.policyHistory (most-recent-first, up to 12 entries).

function makeRoot() {
  // Minimal fake DOM element with innerHTML setter.
  return {
    _html: "",
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
  };
}

function makePanelWithRoot(root, state) {
  const panel = new AIPolicyTimelinePanel(state);
  panel.root = root;
  return panel;
}

test("timeline panel: empty history renders 'No policy changes yet.'", () => {
  const root = makeRoot();
  const state = { ai: { policyHistory: [] }, metrics: { timeSec: 5 } };
  const panel = makePanelWithRoot(root, state);
  panel.render();
  assert.match(root.innerHTML, /No policy changes yet/);
});

test("timeline panel: 3 entries render in reverse-chronological order", () => {
  const root = makeRoot();
  const state = {
    ai: {
      policyHistory: [
        { atSec: 20, source: "llm", badgeState: "llm-live", focus: "most recent", errorKind: "none", model: "gpt-4o" },
        { atSec: 14, source: "fallback", badgeState: "fallback-healthy", focus: "mid entry", errorKind: "none", model: "" },
        { atSec: 9, source: "fallback", badgeState: "fallback-degraded", focus: "first entry", errorKind: "http", model: "" },
      ],
    },
    metrics: { timeSec: 25 },
  };
  const panel = makePanelWithRoot(root, state);
  panel.render();
  const html = root.innerHTML;
  // Most recent must render first in the list.
  const firstIdx = html.indexOf("most recent");
  const midIdx = html.indexOf("mid entry");
  const lastIdx = html.indexOf("first entry");
  assert.ok(firstIdx !== -1 && midIdx !== -1 && lastIdx !== -1, "all three entries must render");
  assert.ok(firstIdx < midIdx && midIdx < lastIdx, "entries must be time-descending");
});

test("timeline panel: >12 entries truncate to 12", () => {
  const root = makeRoot();
  const policyHistory = [];
  for (let i = 0; i < 20; i += 1) {
    policyHistory.push({ atSec: 100 - i, source: "fallback", badgeState: "fallback-healthy", focus: `entry-${i}`, errorKind: "none", model: "" });
  }
  const state = { ai: { policyHistory }, metrics: { timeSec: 100 } };
  const panel = makePanelWithRoot(root, state);
  panel.render();
  const html = root.innerHTML;
  // entry-0..entry-11 should appear; entry-12..entry-19 should not.
  for (let i = 0; i < 12; i += 1) {
    assert.ok(html.includes(`entry-${i}`), `entry-${i} must render`);
  }
  for (let i = 12; i < 20; i += 1) {
    assert.ok(!html.includes(`entry-${i}`), `entry-${i} must be truncated`);
  }
});
