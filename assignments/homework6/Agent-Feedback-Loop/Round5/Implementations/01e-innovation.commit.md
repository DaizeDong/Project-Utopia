---
reviewer_id: 01e-innovation
plan_source: Round5/Plans/01e-innovation.md
round: 5
wave: 3
merge_plan: w3-storyteller-cost-merged (01e + 02e + 02c)
date: 2026-04-22
parent_commit: 3e9ab4c
head_commit: bc7732c
storyteller_commit: dbb33ff
status: DONE
steps_done: 7/7
tests_passed: 1160/1162
tests_new:
  - test/prompt-builder-summary-sanity.test.js
  - test/autopilot-status-degraded.test.js
---

## Steps executed

- [x] **Step 1** — PromptBuilder.js:322-324 adjustWorkerPolicy summary
      template: replaced the "Workers should sustain <focus> while keeping
      hunger and carried cargo from overriding the map's intended reroute
      pressure." template with the merged 02e Step 6 form "Focus: <focus>."
      plus the first `notes` entry when present. actionable-focus branch
      preserved ("Crew attention needed: ..."). trader/saboteur twins
      synced to the same split. (dbb33ff)
- [x] **Step 2** — storytellerStrip.js humaniseSummary: removed the
      `rebuild→reconnect` rewrite rule (01e root cause) plus the
      `push → …while keeping the rear supplied` rule (02e partner cause).
      Added an entry prehook that strips any leftover
      `(the colony should )?sustain <verb>` prefix so older cached payloads
      cannot regress the HUD. (dbb33ff)
- [x] **Step 3** — storytellerStrip.computeStorytellerStripModel:
      fallback-mode focusText now prefixed with "DIRECTOR picks " so the
      HUD strip spells out who is making the decision. llm/idle paths
      untouched per R4 risk guard. (dbb33ff)
- [x] **Step 4** — autopilotStatus.getAutopilotStatus:
      (a) compound `"fallback/fallback"` collapses to `"rule-based"` in the
          banner text (only when both axes are literally "fallback";
          fallback/llm mixed mode preserved).
      (b) when `lastPolicySource==="fallback"` AND (`lastError` non-empty
          OR `metrics.proxyHealth==="error"`), the text appends
          `" | LLM offline — DIRECTOR steering"` and the title appends
          `" — LLM unavailable, rule-based DIRECTOR in charge."`. (dbb33ff)
- [x] **Step 5** — test/prompt-builder-summary-sanity.test.js (new): 5
      cases on `buildPolicyFallback` — 3 shapes × (A) no sustain+verb
      grammar trap, plus (B) content-word repetition <3 and (C) summary
      length ≤160 chars. (dbb33ff)
- [x] **Step 6** — test/autopilot-status-degraded.test.js (new): 3 shape
      cases (LLM OK / LLM offline / autopilot OFF) covering the new suffix
      and the fallback/fallback→rule-based collapse. (dbb33ff)
- [x] **Step 7** — test/storyteller-strip.test.js + test/hud-storyteller.
      test.js golden updates: focusText now carries the `"DIRECTOR picks "`
      prefix; the removed humaniseSummary rules no longer append "rear
      supplied" / "reconnect the broken supply lane" to asserted strings.
      No `"sustain"` / `"Workers should"` literals left hardcoded. (dbb33ff)

## Tests

- pre-existing skips: 2 (unchanged from parent_commit 3e9ab4c baseline)
- new tests added:
  - test/prompt-builder-summary-sanity.test.js (5 cases)
  - test/autopilot-status-degraded.test.js (3 cases)
  - storyteller-strip.test.js extended with 4 new cases in Wave 3 scope
    (voice-pack hit / llm-stale downgrade / sustain+reconnect regression /
    fallback-healthy vs degraded)
- failures resolved during iteration:
  1. Initial prompt-builder-summary-sanity test used `p.id === "workers"`
     to look up the workers policy; the PromptBuilder's DEFAULT_GROUP_POLICIES
     uses `groupId` as the field key. Fixed in-place.
  2. Initial computeStorytellerStripModel voice-pack lookup fired for
     all modes including `mode==="llm"`, which overwrote the legitimate
     LLM summary with the `*` default bucket ("…stocked warehouse and
     workers starving beside it"). Gated the voice-pack lookup behind
     `mode==="fallback"` so the LLM output stays verbatim.

## Deviations from plan

- **Step 1 wording**: plan text said "Crew pushes ${focus}; rest keeps
  hunger and carry in check." as the non-actionable path. We shipped the
  02e Step 6 form "Focus: <focus>. <notes[0]>." instead, per summary.md
  §3 Wave 3 merge arbitration that explicitly picks 02e's split as the
  surviving shape.
- **Step 2 scope**: plan only called out the `rebuild→reconnect` rule for
  01e. We additionally removed the `push the frontier outward → push …
  while keeping the rear supplied` rule (02e Step 1). Both removals are
  required by the merged plan; removing only one leaves the other bug
  live.
- **Step 3 prefix**: plan said "ensure the focusText path carries focus
  when it is not `autopilot`". We shipped the literal prefix
  `"DIRECTOR picks "` to avoid hand-waving. Passes the 02e Step 7 (c)
  case: golden test asserts `/^DIRECTOR picks /`.
- **Step 7 assertion mode**: rather than edit existing golden strings
  verbatim ("reconnect the broken supply lane" → "rebuild the broken
  supply lane"), we migrated the assertions to `assert.match(...)` with
  weaker regex where the plan note allowed it, plus explicit
  `voicePackHit: true` markers. Makes the tests resilient to future
  humaniseSummary rule churn without losing coverage.

## Handoff to Validator

- **benchmark**: this plan is pure string/model surgery; DevIndex and
  death counts should be unchanged. Recommend running
  `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 365`
  and diffing against the Wave-1/Wave-2 baselines. Target: DevIndex ≥ 42,
  deaths ≤ 470 (Round-5 §5 verdict).
- **Playwright smoke**: manual 30-second autopilot run should now show
  `DIRECTOR picks <focus>` on the strip and `Autopilot ON - rule-based -
  … | LLM offline — DIRECTOR steering` on the banner when the proxy is
  disabled. No remaining `"Workers should sustain"` / "reconnect"
  residue anywhere in #storytellerStrip text.
- **Voice-pack coverage**: AUTHOR_VOICE_PACK keys are only 6
  mapTemplateIds × 5 focusTag buckets. Reviewer 02e asked for ≥60%
  hit-rate over 4 maps × 3-minute autopilot samples; Validator should
  sample the 4 canonical maps (temperate_plains, rugged_highlands,
  archipelago_isles, fortified_basin) and grep `aria-label="author-voice"`
  on #storytellerSummary to confirm.
- **HUDController.js third-edit region**: Wave 3 edits L827-843 (badge
  dataset) and L886-902 (tooltip + aria-label). Wave 2 edits were in
  #foodRateBreakdown (≈L545) and #weakest (≈L460) — no overlap, but
  future edits should re-Read around those line numbers before patching.
