// v0.8.2 Round-5 Wave-3 (01e Step 5) — PromptBuilder summary sanity tests.
//
// These tests guard the three hard invariants that emerged from Feedbacks
// 01e / 02e when the "Workers should sustain <focus> while keeping hunger
// and carried cargo from overriding the map's intended reroute pressure."
// template ate the player's HUD:
//
//   (A) No "sustain <verb-phrase>" grammar trap leaks through for any of the
//       9 verb shapes that previously combined with `describeWorkerFocus`.
//   (B) Content-word repetition across focus + summary is capped at <3 (no
//       "rebuild rebuild reconnect" echo).
//   (C) Summary length stays under 160 characters so the HUD single-line
//       strip does not clip a tail fragment (e.g. "reroute pres…").
//
// All tests exercise `buildPolicyFallback` — the public entry point for the
// rule-based path — with three realistic world summary shapes.

import test from "node:test";
import assert from "node:assert/strict";

import { buildPolicyFallback } from "../src/simulation/ai/llm/PromptBuilder.js";

function makeSummary(overrides = {}) {
  return {
    world: {
      scenario: { title: "Broken Frontier", summary: "Reconnect the route." },
      objective: { id: "recovery-1", title: "Reconnect the Frontier", progress: 42 },
      frontier: { brokenRoutes: [], unreadyDepots: [], readyDepots: [] },
      logistics: { isolatedWorksites: 0, overloadedWarehouses: 0, strandedCarryWorkers: 0 },
      ecology: { pressuredFarms: 0, maxFarmPressure: 0 },
      gameplay: { recovery: { collapseRisk: 40, charges: 2 } },
      events: [],
    },
    workers: { totalWorkers: 10 },
    ...overrides,
  };
}

function getWorkersPolicy(result) {
  return result.policies.find((p) => p.groupId === "workers") ?? null;
}

// ── (A) Grammar trap regression ────────────────────────────────────────

test("buildPolicyFallback: route-gap shape — no 'sustain <verb>' grammar trap", () => {
  const summary = makeSummary({
    world: {
      scenario: { title: "Broken Frontier" },
      objective: { id: "recovery-1", title: "Reconnect the Frontier", progress: 10 },
      frontier: { brokenRoutes: [{ label: "west lumber route" }], unreadyDepots: [], readyDepots: [] },
      logistics: { isolatedWorksites: 0, overloadedWarehouses: 0, strandedCarryWorkers: 0 },
      ecology: { pressuredFarms: 0 },
      gameplay: { recovery: { collapseRisk: 40 } },
      events: [],
    },
  });
  const { policies } = buildPolicyFallback(summary);
  const workers = policies.find((p) => p.groupId === "workers");
  assert.ok(workers, "expected a workers policy");
  const text = String(workers.summary ?? "");
  // The 9-verb grammar-trap shape must not appear.
  assert.ok(
    !/sustain (reconnect|rebuild|push|hug|clear|disrupt|harass|run|work)/i.test(text),
    `grammar trap leaked: ${text}`,
  );
});

test("buildPolicyFallback: depot-anchor shape — no 'sustain <verb>' grammar trap", () => {
  const summary = makeSummary({
    world: {
      scenario: { title: "Island Relay" },
      objective: { id: "logistics-1", title: "Anchor the Depot", progress: 30 },
      frontier: { brokenRoutes: [], unreadyDepots: [], readyDepots: [{ label: "east relay depot" }] },
      logistics: { isolatedWorksites: 0, overloadedWarehouses: 0, strandedCarryWorkers: 0 },
      ecology: { pressuredFarms: 0 },
      gameplay: { recovery: { collapseRisk: 20 } },
      events: [],
    },
  });
  const workers = getWorkersPolicy(buildPolicyFallback(summary));
  const text = String(workers.summary ?? "");
  assert.ok(
    !/sustain (reconnect|rebuild|push|hug|clear|disrupt|harass|run|work)/i.test(text),
    `grammar trap leaked: ${text}`,
  );
});

test("buildPolicyFallback: steady-state shape — no 'sustain <verb>' grammar trap", () => {
  const summary = makeSummary();
  const workers = getWorkersPolicy(buildPolicyFallback(summary));
  const text = String(workers.summary ?? "");
  assert.ok(
    !/sustain (reconnect|rebuild|push|hug|clear|disrupt|harass|run|work)/i.test(text),
    `grammar trap leaked: ${text}`,
  );
});

// ── (B) Repetition cap ─────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "by",
  "for", "with", "is", "are", "be", "has", "have", "should", "will", "so",
  "that", "this", "these", "those", "it", "its", "their", "they", "we",
]);

function wordCounts(text) {
  const words = String(text ?? "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  return counts;
}

test("buildPolicyFallback: no content word appears ≥3 times across focus+summary", () => {
  const shapes = [
    makeSummary(),
    makeSummary({
      world: {
        scenario: { title: "Broken Frontier" },
        objective: { id: "recovery-1", title: "Reconnect", progress: 5 },
        frontier: { brokenRoutes: [{ label: "west route" }], unreadyDepots: [], readyDepots: [] },
        logistics: { isolatedWorksites: 1 },
        ecology: { pressuredFarms: 0 },
        gameplay: { recovery: { collapseRisk: 45 } },
        events: [],
      },
    }),
    makeSummary({
      world: {
        scenario: { title: "Hollow Keep" },
        objective: { id: "stability-1", title: "Hold the Gate", progress: 60 },
        frontier: { brokenRoutes: [], unreadyDepots: [], readyDepots: [] },
        logistics: { isolatedWorksites: 0 },
        ecology: { pressuredFarms: 0 },
        gameplay: { recovery: { collapseRisk: 30 } },
        events: [],
      },
    }),
  ];
  for (const s of shapes) {
    const workers = getWorkersPolicy(buildPolicyFallback(s));
    const text = `${workers.focus ?? ""} ${workers.summary ?? ""}`;
    const counts = wordCounts(text);
    for (const [word, count] of counts) {
      assert.ok(count < 3,
        `repetition cap violated: "${word}" appears ${count} times in "${text}"`);
    }
  }
});

// ── (C) Length cap ─────────────────────────────────────────────────────

test("buildPolicyFallback: summary stays under 160 chars across shapes", () => {
  const shapes = [
    makeSummary(),
    makeSummary({
      world: {
        scenario: { title: "Broken Frontier" },
        objective: { id: "recovery-1", title: "Reconnect", progress: 5 },
        frontier: { brokenRoutes: [{ label: "west route" }], unreadyDepots: [{ label: "east depot" }], readyDepots: [] },
        logistics: { isolatedWorksites: 2, overloadedWarehouses: 1 },
        ecology: { pressuredFarms: 1, maxFarmPressure: 0.9 },
        gameplay: { recovery: { collapseRisk: 70, charges: 1 } },
        events: [{ type: "banditRaid", severity: "high" }],
      },
    }),
  ];
  for (const s of shapes) {
    const workers = getWorkersPolicy(buildPolicyFallback(s));
    const text = String(workers.summary ?? "");
    assert.ok(text.length <= 160,
      `summary exceeds 160 chars (${text.length}): "${text}"`);
  }
});
