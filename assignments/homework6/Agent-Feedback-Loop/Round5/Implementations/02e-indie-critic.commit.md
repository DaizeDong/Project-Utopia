---
reviewer_id: 02e-indie-critic
plan_source: Round5/Plans/02e-indie-critic.md
round: 5
wave: 3
merge_plan: w3-storyteller-cost-merged (01e + 02e + 02c)
date: 2026-04-22
parent_commit: 3e9ab4c
head_commit: bc7732c
storyteller_commit: dbb33ff
status: DONE
steps_done: 8/8
tests_passed: 1160/1162
tests_new:
  - storyteller-strip.test.js extended (4 new cases: voice-pack hit,
    llm-stale downgrade, sustain+reconnect regression, fallback-healthy
    vs degraded)
---

## Steps executed

- [x] **Step 1** — storytellerStrip.humaniseSummary: deleted the
      `push the frontier outward → push … while keeping the rear supplied`
      rewrite rule (primary 02e cause). Partner rule
      `rebuild → reconnect the broken supply lane` removed in the merged
      01e Step 2. Added an entry prehook that swallows leftover
      `(the colony should )?sustain <verb>` residue so older cached
      LLM payloads cannot re-introduce the grammar trap. (dbb33ff)
- [x] **Step 2** — storytellerStrip.js AUTHOR_VOICE_PACK: frozen constant
      added above `buildTemplateTag`. Keys: 6 mapTemplateIds × 5 focusTag
      buckets + global `*` default. Every line is a direct reuse of
      existing repo text (scenario.meta openingPressure from
      src/world/scenarios/ScenarioFactory.js:27-77 and the Kitchen
      BuildAdvisor tooltip from src/simulation/construction/
      BuildAdvisor.js:61). No new authored prose — the pack is a
      transport layer per HW06 freeze. (dbb33ff)
- [x] **Step 3** — computeStorytellerStripModel voice-pack lookup:
      `deriveFocusTag(focus)` maps raw focus text into 5 focusTag
      buckets (broken-routes / cargo-stall / stockpile / frontier /
      safety / default). `lookupAuthorVoice(mapTemplateId, focusTag)`
      cascades template → default → `*` default. On hit, `summaryText`
      is overwritten and `voicePackHit=true`. Gated to `mode==="fallback"`
      so live-LLM output is never overwritten (fix discovered during
      iteration — see Deviations). (dbb33ff)
- [x] **Step 4** — computeStorytellerStripModel badgeState four-split:
      `llm-live` (source=llm + no lastPolicyError) / `llm-stale` (source=
      llm + lastPolicyError) / `fallback-degraded` (source=fallback +
      proxyHealth="error" OR lastPolicyError) / `fallback-healthy`
      (source=fallback, clean) / `idle`. WHISPER prefix now requires
      badgeState==="llm-live"; llm-stale falls back to DIRECTOR. (dbb33ff)
- [x] **Step 5** — HUDController.js L722-842 storyteller render block:
      - badgeEl.dataset.state = model.badgeState (four-split independent
        of dataset.mode)
      - tooltip gets the `[LLM offline — rule director in charge] ` prefix
        when badgeState==="fallback-degraded"
      - summaryEl gets `aria-label="author-voice"` when voicePackHit is
        true; cleared otherwise (dbb33ff)
- [x] **Step 6** — PromptBuilder.js:322-324 adjustWorkerPolicy (+
      adjustTraderPolicy L362-363, adjustSaboteurPolicy L401-402):
      `"Workers should sustain <focus> while …"` template split into
      two short sentences: "Focus: <focus>." plus the first note when
      present. Trader and Saboteur twins synced. The "sustain <verb>"
      grammar trap is unreachable from any of the 3 adjust*Policy paths
      now. (dbb33ff)
- [x] **Step 7** — test/storyteller-strip.test.js extended with 4 new
      cases (02e Step 7 + Step 4 shape coverage):
      (a) fortified_basin + broken-routes focus → voicePackHit=true with
          "danger is not distance but exposure" substring
      (b) source=llm + lastPolicyError="HTTP 503" → prefix "DIRECTOR" +
          badgeState="llm-stale" (WHISPER stays dark)
      (c) 4 fallback shapes × assert never co-emit "sustain" AND
          "reconnect" (regression guard)
      (d) healthy vs proxyHealth=error fallback → badgeState differs
      Existing golden assertions migrated to match new DIRECTOR prefix +
      voice-pack summary. (dbb33ff)
- [x] **Step 8** — test/prompt-payload.test.js inspected for legacy
      "Workers should sustain" / "while keeping hunger and carried cargo"
      golden fixtures. None found; the file asserts on the payload's
      operationalHighlights/groupContracts schema, not on the summary
      wording. No edit needed. (n/a — confirmed in audit)

## Tests

- pre-existing skips: 2 (unchanged from parent_commit 3e9ab4c baseline)
- new tests added (all green):
  - storyteller-strip.test.js +4 cases (voice pack, llm-stale, sustain+
    reconnect regression, fallback-healthy vs degraded)
- failures resolved during iteration:
  1. Initial voice-pack lookup fired for mode==="llm" too, overwriting
     the legitimate LLM summary with the `*` default bucket. Fixed by
     gating the lookup behind `mode==="fallback"`.
  2. Existing golden assertions in storyteller-strip.test.js / hud-
     storyteller.test.js pinned "push the frontier outward while
     keeping the rear supplied" and "stockpile food" / "Reserve
     dwindling" as `model.focusText` / `model.summaryText`. Updated to
     assert the new "DIRECTOR picks ..." prefix + `voicePackHit: true`
     marker.

## Deviations from plan

- **Step 2 voice-pack source**: the plan named `help panel` as a source
  to lift text from. No help-panel module exists in the repo (grep
  confirmed). Substituted scenario.meta (6 openingPressure lines) +
  Kitchen BuildAdvisor tooltip for the `*` default bucket. All pack
  entries remain direct reuses — no new prose.
- **Step 3 focusTag bucket count**: plan listed `"broken-routes" /
  "cargo-stall" / "stockpile" / "frontier" / "safety"` — we implemented
  exactly these 5 plus a `default` bucket for unmatched focus text.
  No additions beyond the plan spec.
- **Step 4 badgeState llm-stale → WHISPER downgrade**: plan said "prefix
  仅在 badgeState==='llm-live' 时才返回 WHISPER (其他 llm-stale 也降回
  DIRECTOR)". Implemented verbatim; added a golden test case (b) to lock
  the contract.
- **Step 6 trader/saboteur twins**: plan called out these as secondary
  sync points. Implemented the same "Focus: <focus>. <notes[0]>." split
  for both so no residual "Traders should circulate..." / "Saboteurs
  should create..." templates leak the grammar trap.

## Handoff to Validator

- **voice-pack hit-rate target**: reviewer 02e §6 asks for
  `voice-pack-hit ≥ 60%` over 4 maps × 3-minute autopilot. With the `*`
  default bucket, hit-rate is effectively 100% in fallback mode — but
  the MORE important measurement is author-specific (not-`*`) hit-rate.
  Validator should grep `aria-label="author-voice"` on
  `#storytellerSummary` while the badge state is
  `fallback-healthy`/`fallback-degraded`.
- **WHISPER honesty**: with a live LLM proxy + successful policy tick,
  badgeState must land on `llm-live` and the prefix span should read
  WHISPER. Kill the proxy mid-session; badge should flip to `llm-stale`
  → DIRECTOR prefix → tooltip does NOT carry the "[LLM offline …]"
  prefix (that is reserved for fallback-degraded). Validator can drive
  this via the existing AI toggle + DevTools network panel.
- **benchmark**: no simulation changes; DevIndex and deaths unchanged
  from Wave-2 head. Target DevIndex ≥ 42 per summary.md §5 Wave 3.
- **HUDController.js third-edit region**: see 01e handoff notes.
