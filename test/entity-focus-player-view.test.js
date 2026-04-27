// v0.8.2 Round-0 01a-onboarding — EntityFocusPanel player-vs-dev split.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/01a-onboarding.md
//
// The panel now wraps FSM/Policy/Path/AI-Exchange blocks in BOTH
// `casual-hidden` AND `dev-only` classes. body.casual-mode or
// body:not(.dev-mode) hides them (OR relation), which means only a user
// running in `?ui=full` AND `?dev=1` (or Ctrl+Shift+D) sees the full
// engineering dump. Casual / first-time players see the friendly
// "Needs / Task" subset: Name, Role, State, Hunger bar with label, Vitals,
// Carry. This file asserts the structural contract against the JS source.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync("src/ui/panels/EntityFocusPanel.js", "utf8");
const HTML = fs.readFileSync("index.html", "utf8");

test("EntityFocusPanel source exposes engBlockOpen/engBlockClose with dev-only+casual-hidden", () => {
  // Engineering block opener/closer wrapper must carry both classes so
  // either gate (dev-mode or casual) suppresses the dump.
  assert.match(
    SRC,
    /engBlockOpen\s*=\s*`<span class="casual-hidden dev-only">`/,
    "engBlockOpen should use `casual-hidden dev-only`",
  );
  assert.match(
    SRC,
    /engClasses\s*=\s*`casual-hidden dev-only`/,
    "engClasses should use `casual-hidden dev-only`",
  );
});

test("EntityFocusPanel FSM/Policy/Path rows are inside the gated block", () => {
  // Extract the html template literal that renders entity details and
  // verify FSM / Policy Influence / Decision Time / Path / Velocity are
  // wrapped between engBlockOpen...engBlockClose spans.
  const fsmIdx = SRC.indexOf("<b>FSM:</b>");
  const openIdx = SRC.lastIndexOf("${engBlockOpen}", fsmIdx);
  const closeIdx = SRC.indexOf("${engBlockClose}", fsmIdx);
  assert.ok(fsmIdx > 0, "FSM row not found");
  assert.ok(openIdx > 0 && openIdx < fsmIdx, "FSM row not wrapped by engBlockOpen");
  assert.ok(closeIdx > fsmIdx, "FSM row not closed by engBlockClose");

  const policyIdx = SRC.indexOf("<b>Policy Influence:</b>");
  assert.ok(policyIdx > openIdx && policyIdx < closeIdx, "Policy Influence should sit inside engBlock");

  const decisionIdx = SRC.indexOf("<b>Decision Time:</b>");
  assert.ok(decisionIdx > openIdx && decisionIdx < closeIdx, "Decision Time should sit inside engBlock");
});

test("EntityFocusPanel renders a human-readable hunger label (Well-fed/Peckish/Hungry/Starving)", () => {
  assert.match(SRC, /"Well-fed"/, "missing Well-fed label");
  assert.match(SRC, /"Peckish"/, "missing Peckish label");
  assert.match(SRC, /"Hungry"/, "missing Hungry label");
  assert.match(SRC, /"Starving"/, "missing Starving label");
  // The label should appear as a user-facing row.
  assert.match(SRC, /<b>Hunger:<\/b>/, "Hunger row missing from player-view template");
});

test("index.html declares body.casual-mode .casual-hidden AND body:not(.dev-mode) .dev-only gates", () => {
  assert.match(
    HTML,
    /body:not\(\.dev-mode\)\s+\.dev-only\s*\{\s*display:\s*none\s*!important/i,
    "dev-only gate CSS missing",
  );
  assert.match(
    HTML,
    /body\.casual-mode\s+\.casual-hidden\s*\{\s*display:\s*none\s*!important/i,
    "casual-hidden gate CSS missing",
  );
});

test("EntityFocusPanel AI exchange details block carries both gate classes", () => {
  // The AI-Exchange details wrapper uses the engClasses template var,
  // which expands to `casual-hidden dev-only`.
  const detailsIdx = SRC.indexOf('data-focus-key="focus:last-ai-exchange"');
  assert.ok(detailsIdx > 0, "AI exchange details block missing");
  const snippet = SRC.slice(detailsIdx, detailsIdx + 200);
  assert.match(snippet, /class="\$\{engClasses\}"/, "AI exchange details should use engClasses");
});
