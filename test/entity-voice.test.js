// v0.8.2 Round-6 Wave-3 (01e-innovation Step 6) — humaniseInsightLine fixture
// coverage. Asserts the rewriter:
//   1. Converts the carry-pressure line to first person, preserving the
//      decimal seconds value.
//   2. Honours `profile: "dev"` by passing the rawLine through verbatim.
//   3. Hits all 9 known WorldExplain insight patterns (table-driven).
//   4. Falls back to the rawLine for unrecognised inputs (no throw).

import test from "node:test";
import assert from "node:assert/strict";

import { humaniseInsightLine, humaniseGroupVoice, pickVoicePackEntry } from "../src/ui/interpretation/EntityVoice.js";

const sampleEntity = { displayName: "Aila-2", role: "FARM" };

test("humaniseInsightLine: carry-pressure rewrites to first person, keeps the seconds", () => {
  const raw = "Carry pressure has been building for 5.8s, so the worker is being pushed back toward a depot.";
  const out = humaniseInsightLine(raw, sampleEntity);
  // Decimal value preserved.
  assert.match(out, /5\.8/);
  // Third-person stripped.
  assert.doesNotMatch(out, /the worker/i);
  // First-person pronoun present (I / I've / I'm / my).
  assert.match(out, /\b(I|I've|I'm|my)\b/);
});

test("humaniseInsightLine: dev profile passes raw line through verbatim", () => {
  const raw = "Carry pressure has been building for 5.8s, so the worker is being pushed back toward a depot.";
  const out = humaniseInsightLine(raw, sampleEntity, { profile: "dev" });
  assert.equal(out, raw);

  const out2 = humaniseInsightLine(raw, sampleEntity, { profile: "full" });
  assert.equal(out2, raw);
});

test("humaniseInsightLine: 9 known WorldExplain insight patterns each rewrite", () => {
  // Each fixture is { raw, mustMatch: regex, mustNotMatch: regex } so we
  // verify (a) the rewrite landed and (b) the third-person debug phrasing
  // was removed. All 9 known patterns from WorldExplain.getEntityInsight.
  const fixtures = [
    {
      tag: "survival-rule",
      raw: "Local survival rule is prioritizing food access because hunger is below the worker seek-food threshold.",
      mustMatch: /running on empty|warehouse/i,
      mustNotMatch: /Local survival rule/i,
    },
    {
      tag: "logistics-rule",
      raw: "Local logistics rule sees 2.50 carried resources, so delivery should outrank more harvesting.",
      mustMatch: /2\.50/,
      mustNotMatch: /Local logistics rule/i,
    },
    {
      tag: "carry-pressure",
      raw: "Carry pressure has been building for 6.2s, so the worker is being pushed back toward a depot.",
      mustMatch: /6\.2/,
      mustNotMatch: /the worker/i,
    },
    {
      tag: "warehouse-inbound",
      raw: "Target warehouse currently has 3 inbound workers, so unloading will be slower.",
      mustMatch: /\b3\b/,
      mustNotMatch: /Target warehouse currently has/i,
    },
    {
      tag: "wildlife-pressure",
      raw: "Wildlife pressure is suppressing the target farm by about 22%, so this worker's current food loop is less efficient.",
      mustMatch: /22%/,
      mustNotMatch: /suppressing the target farm/i,
    },
    {
      tag: "gather-loop",
      raw: "Worker is still in a gather loop because carry is low and a farm worksite exists.",
      mustMatch: /farm/i,
      mustNotMatch: /^Worker is still in a gather loop/i,
    },
    {
      tag: "trader",
      raw: "Trader is favoring west depot with 4 nearby wall tiles; current trade yield bonus is x1.20.",
      mustMatch: /x1\.20|west depot/i,
      mustNotMatch: /^Trader is favoring/i,
    },
    {
      tag: "saboteur",
      raw: "Saboteur is pressuring south depot; current target has 2 nearby wall tiles.",
      mustMatch: /\b2\b/,
      mustNotMatch: /^Saboteur is pressuring/i,
    },
    {
      tag: "group-ai",
      raw: "Group AI is currently biasing this unit toward seek_task.",
      mustMatch: /colony's plan|find new work/i,
      mustNotMatch: /^Group AI/i,
    },
  ];
  for (const fx of fixtures) {
    const out = humaniseInsightLine(fx.raw, sampleEntity);
    assert.match(out, fx.mustMatch, `fixture[${fx.tag}] failed mustMatch on output: "${out}"`);
    assert.doesNotMatch(out, fx.mustNotMatch, `fixture[${fx.tag}] leaked debug phrasing: "${out}"`);
  }
});

test("humaniseInsightLine: unrecognised line returns rawLine unchanged and never throws", () => {
  const raw = "Some unknown future insight that is not in the rewrite table.";
  const out = humaniseInsightLine(raw, sampleEntity);
  assert.equal(out, raw);

  // null/undefined inputs.
  assert.equal(humaniseInsightLine(undefined, sampleEntity), "");
  assert.equal(humaniseInsightLine(null, sampleEntity), "");
  assert.equal(humaniseInsightLine("", sampleEntity), "");
});

test("humaniseGroupVoice: known states translate to clauses; unknown returns lowercase passthrough", () => {
  assert.match(humaniseGroupVoice("seek_task"), /find new work/i);
  assert.match(humaniseGroupVoice("harvest", "WOOD"), /lumber/i);
  assert.match(humaniseGroupVoice("deliver"), /haul/i);
  assert.match(humaniseGroupVoice("rest"), /breather/i);
  // Unknown state passes through with underscores converted to spaces.
  assert.equal(humaniseGroupVoice("strange_unknown_state"), "strange unknown state");
});

test("pickVoicePackEntry: deterministic round-robin; non-finite seed → idx 0; empty bucket → ''", () => {
  const bucket = ["a", "b", "c", "d"];
  assert.equal(pickVoicePackEntry(bucket, 0), "a");
  assert.equal(pickVoicePackEntry(bucket, 1), "b");
  assert.equal(pickVoicePackEntry(bucket, 4), "a");
  assert.equal(pickVoicePackEntry(bucket, 7), "d");
  assert.equal(pickVoicePackEntry(bucket, NaN), "a");
  assert.equal(pickVoicePackEntry(bucket, undefined), "a");
  assert.equal(pickVoicePackEntry([], 5), "");
  assert.equal(pickVoicePackEntry(null, 5), "");
  assert.equal(pickVoicePackEntry(undefined, 5), "");
});
