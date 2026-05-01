// v0.10.1-A6 R2 (Wave-1, plan 2/3, Step 6) — AIPolicyTimelinePanel render
// dedupe coverage. NPCBrainSystem can push the same (badgeState + focus +
// errorKind) tuple repeatedly during fallback-healthy reconnect storms;
// the panel now folds adjacent runs within an 80s window into a single
// `×N last <span>s` row. These tests pin that contract:
//   (a) 9 same-key entries within 80s → 1 group with `×9`
//   (b) the 10th entry with a different badgeState opens a new group
//   (c) gap > 80s breaks the run (no fold)
//   (d) entry.atSec NaN/undefined → no fold but no throw

import test from "node:test";
import assert from "node:assert/strict";

import { AIPolicyTimelinePanel } from "../../src/ui/panels/AIPolicyTimelinePanel.js";

function makeRoot() {
  return { innerHTML: "" };
}

function installFakeDocument(root) {
  globalThis.document = {
    getElementById(id) {
      return id === "aiPolicyTimelinePanelBody" ? root : null;
    },
  };
}

function uninstallFakeDocument() {
  delete globalThis.document;
}

function makeEntry({ atSec, badgeState = "fallback-healthy", focus = "rebuild the broken supply lane", errorKind = "none", source = "fallback", model = "" }) {
  return { atSec, badgeState, focus, errorKind, source, model };
}

function countLis(html) {
  // Count opening <li tags (the panel emits one per group).
  return (html.match(/<li[\s>]/g) || []).length;
}

test("AIPolicyTimelinePanel: 9 same-key entries within 80s collapse into one group with ×9", () => {
  const root = makeRoot();
  installFakeDocument(root);
  try {
    // Reverse-chronological newest-first: atSec descending 120 → 64
    // (head=120, tail=64, span=56s ≤ 80s window → all 9 fold).
    const history = [];
    for (let i = 0; i < 9; i += 1) {
      history.push(makeEntry({ atSec: 120 - i * 7 }));
    }
    const state = {
      ai: { policyHistory: history },
      metrics: { timeSec: 130 },
    };
    const panel = new AIPolicyTimelinePanel(state);
    panel.render();
    assert.match(root.innerHTML, /×9 last \d+s/);
    assert.equal(countLis(root.innerHTML), 1, "all 9 should fold into one <li>");
  } finally {
    uninstallFakeDocument();
  }
});

test("AIPolicyTimelinePanel: different badgeState opens a new group", () => {
  const root = makeRoot();
  installFakeDocument(root);
  try {
    const history = [
      makeEntry({ atSec: 120, badgeState: "llm-live" }),     // newest, distinct
      makeEntry({ atSec: 110 }),                             // fallback-healthy run
      makeEntry({ atSec: 100 }),
      makeEntry({ atSec: 90 }),
    ];
    const state = {
      ai: { policyHistory: history },
      metrics: { timeSec: 130 },
    };
    const panel = new AIPolicyTimelinePanel(state);
    panel.render();
    assert.equal(countLis(root.innerHTML), 2, "two groups expected (1 llm-live + 3 fallback-healthy)");
    assert.match(root.innerHTML, /×3 last \d+s/);
    assert.match(root.innerHTML, /llm-live/);
  } finally {
    uninstallFakeDocument();
  }
});

test("AIPolicyTimelinePanel: 81s gap between same-key entries breaks the run", () => {
  const root = makeRoot();
  installFakeDocument(root);
  try {
    const history = [
      makeEntry({ atSec: 200 }), // head
      makeEntry({ atSec: 119 }), // 81s earlier — outside window → new group
      makeEntry({ atSec: 110 }), // 9s after the prior head → same-group with #2
    ];
    const state = {
      ai: { policyHistory: history },
      metrics: { timeSec: 210 },
    };
    const panel = new AIPolicyTimelinePanel(state);
    panel.render();
    // Two groups (no ×N on the singleton; ×2 on the second pair).
    assert.equal(countLis(root.innerHTML), 2, "81s gap should split into two groups");
    assert.match(root.innerHTML, /×2 last \d+s/);
  } finally {
    uninstallFakeDocument();
  }
});

test("AIPolicyTimelinePanel: undefined / NaN atSec does not throw and does not fold", () => {
  const root = makeRoot();
  installFakeDocument(root);
  try {
    const history = [
      makeEntry({ atSec: undefined }),
      makeEntry({ atSec: Number.NaN }),
      makeEntry({ atSec: 50 }),
    ];
    const state = {
      ai: { policyHistory: history },
      metrics: { timeSec: 60 },
    };
    const panel = new AIPolicyTimelinePanel(state);
    assert.doesNotThrow(() => panel.render());
    // Same key but no finite atSec on head → cannot determine window → no fold.
    assert.equal(countLis(root.innerHTML), 3, "non-finite atSec should not fold");
    assert.doesNotMatch(root.innerHTML, /×\d+ last/);
  } finally {
    uninstallFakeDocument();
  }
});
