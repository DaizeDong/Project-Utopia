---
reviewer_id: 01e-innovation
plan_source: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/01e-innovation.md
round: 6
date: 2026-04-25
parent_commit: e735970
head_commit: ea79f95
status: DONE
steps_done: 9/9
tests_passed: 1395/1402
tests_new:
  - test/entity-voice.test.js (6 cases)
  - test/storyteller-voicepack-roundrobin.test.js (3 cases)
  - test/i18n-no-cjk-in-html.test.js (1 case)
---

## Steps executed

- [x] Step 1: NEW `src/ui/interpretation/EntityVoice.js` (~190 LOC).
  Three pure exports — `humaniseInsightLine(rawLine, entity, opts?)` covers
  all 9 known `WorldExplain.getEntityInsight` patterns plus the Group-AI
  bias line; `humaniseGroupVoice(focus, role)` translates state names;
  `pickVoicePackEntry(bucket, seed)` is a deterministic round-robin (no
  `Math.random`, no `services.rng` — caller supplies the seed). Dev profile
  short-circuits to verbatim. Unrecognised inputs return rawLine.
- [x] Step 2: `src/ui/panels/EntityFocusPanel.js` — imports `EntityVoice`;
  `entityInsights` now maps through `humaniseInsightLine` keyed by
  `state.controls.uiProfile` (`"dev"`/`"full"` passes through verbatim,
  every other profile gets the in-character rewrite). The 9th rewrite rule
  in EntityVoice handles `Group AI is currently biasing this unit toward X`,
  giving `aiTargetState` the same humanised treatment via a single helper.
- [x] Step 3: `src/ui/hud/storytellerStrip.js` — `AUTHOR_VOICE_PACK` buckets
  switched from single strings to frozen `string[]` (2-5 variations per
  bucket); `lookupAuthorVoice` returns `{ bucket, hit }`;
  `computeStorytellerStripModel` calls `pickVoicePackEntry(bucket,
  Math.floor(timeSec/30))` so the strip rotates the authored voice every
  ~30s of game time. `bucket[0]` of every existing key preserves the
  original authored line so unit tests with no `metrics.timeSec` (seed=0
  → idx=0) stay green. New `*.sabotage` bucket pre-positions in-world
  copy for the Round-7 P2 saboteur visibility hook.
- [x] Step 4: `src/ui/hud/storytellerStrip.js` — 5 player-facing
  `whisperBlockedReason` strings rewritten to richer in-world copy
  (`Story Director: on air, the storyteller is listening.` etc.).
  `whisperBlockedReasonDev` engineer strings preserved verbatim per the
  Wave-1 contract (`storyteller-strip-whisper-diagnostic.test.js` +
  `storyteller-llm-diagnostic-hidden.test.js` both green). Casual quarantine
  test still passes — no `LLM` / `WHISPER` / `errored` / `proxy` / `http`
  tokens in player copy.
- [x] Step 5: `index.html` Logistics Legend block — title `物流图例 (Logistics
  Legend)` → `Logistics Legend`; 7 row labels translated; bracketed lens-mode
  keys (`heat_surplus` / `route` / `depot` / etc.) preserved verbatim;
  color glyphs (`● 红圈` / `◎ 橙环` / etc.) → ASCII labels (`red dot` /
  `orange ring` / etc.). Also translated 2 additional CJK strings discovered
  during Step 8 verification (`AI 决策记录 (Decisions)` → `AI Decisions`,
  `AI 调用日志 (I/O Log)` → `AI I/O Log`) — see Deviations.
- [x] Step 6: `test/entity-voice.test.js` (6 cases) — carry-pressure
  rewrite preserves seconds + strips third person; dev profile passes
  through verbatim; 9-pattern fixture table all rewrite; unrecognised
  input returns rawLine without throwing; `humaniseGroupVoice` known
  states translate + unknown passes through with `_` → space;
  `pickVoicePackEntry` round-robin + non-finite seed → idx 0 + empty
  bucket → "".
- [x] Step 7: `test/storyteller-voicepack-roundrobin.test.js` (3 cases) —
  ≥3 distinct voice lines across timeSec 0/30/60/90; deterministic
  same-input twice → same summaryText; cascade fallback for unknown
  focusTag / unknown mapTemplateId.
- [x] Step 8: `test/i18n-no-cjk-in-html.test.js` (1 case) — regex scan
  of `index.html` asserts no characters in `[\u3400-\u9FFF]`. Initial run
  flagged `AI 决策记录` and `AI 调用日志` (not in the plan author's grep);
  cleaned in Step 5 follow-up.
- [x] Step 9: `CHANGELOG.md` — new section under `[Unreleased]` documenting
  voice pack expansion, EntityVoice introduction, 5-string
  `whisperBlockedReason` rewrite, Logistics Legend i18n, 3 new test files.

## Tests

- pre-existing skips: 2 (carried from baseline, unchanged)
- pre-existing failures (unchanged baseline):
  - `build-spam: per-copy wood cost is capped by BUILD_COST_ESCALATOR.warehouse.cap`
  - `SceneRenderer source wires proximity fallback into #pickEntity and a build-tool guard`
  - `formatGameEventForLog returns null for noisy event types`
  - `mood→output: low-mood worker (0.1) yields ≥40% less than high-mood (0.9)`
  - `ui voice: main.js gates window.__utopia behind devModeGate but keeps __utopiaLongRun public`
- new tests added:
  - `test/entity-voice.test.js`
  - `test/storyteller-voicepack-roundrobin.test.js`
  - `test/i18n-no-cjk-in-html.test.js`
- failures resolved during iteration:
  - Initial CJK-test failure flagged 2 unmentioned CJK strings in
    `index.html` (lines 2263, 2270). Resolved by translating them in
    Step 5 follow-up. Final test run: 1395/1402 pass (matches the
    Wave-3 baseline failure set exactly).

## Deviations from plan

1. **Step 5 scope expansion**: The plan author noted "当前实现下 grep 仅命中
   1918-1926 这 1 个区块" — they had not run a CJK grep across the entire
   file. The Step 8 test surfaced 2 additional Chinese strings in AI panel
   summaries (`AI 决策记录 (Decisions)`, `AI 调用日志 (I/O Log)`). I
   translated both to `AI Decisions` / `AI I/O Log` since (a) they fall
   squarely within the spirit of the i18n hygiene goal, (b) the Step 8
   test would otherwise be PARTIAL/skipped, (c) leaving them would
   immediately fail the regression guard the plan asks me to build.
2. **Step 4 voice copy**: The plan's verbatim suggested strings (`"WHISPER
   on air — the storyteller is listening."` etc.) would have failed the
   Wave-1 quarantine test (`storyteller-llm-diagnostic-hidden.test.js`
   bans `LLM` / `WHISPER` / `errored` / `proxy` / `http` tokens in player
   copy). I kept the locked `Story Director:` lead (so existing
   `storyteller-strip-whisper-diagnostic.test.js` `/Story Director/`
   regex still matches) but enriched each string with the same flavour the
   plan asked for — `"Story Director: on air, the storyteller is
   listening."` / `"Story Director: line dropped — the rule-book is
   taking the wheel."` etc. Information preserved, Wave-1 contract
   honoured. No test assertions changed.

## Handoff to Validator

- **Determinism**: `pickVoicePackEntry` is pure and consumes a
  caller-supplied integer seed (`Math.floor(timeSec/30)`). It does NOT
  touch `services.rng`. `long-horizon-determinism.test.js` should be
  unaffected — please confirm in the validation pass.
- **Bench**: single-seed sanity check (seed 42, temperate_plains, 90
  days, --soft-validation): `outcome=max_days_reached
  devIndex(last)=71.44 survivalScore=20785 passed=true`. Far above the
  41.8 implementer hand-off threshold. UI-only changes; no sim-system
  edits expected to perturb 4-seed bench medians.
- **Playwright smoke**: focus regions for QA:
  1. **Inspector "Why is this worker doing this?"** — should read as
     first-person worker monologue ("I've been hauling for nearly 6
     seconds — time to drop this load at the depot."). Toggle `?ui=full`
     in URL or Ctrl+Shift+D dev chord to verify dev profile still shows
     verbatim text ("Carry pressure has been building for 5.8s, …").
  2. **Storyteller strip tooltip** — should display the new in-world
     `whisperBlockedReason` ("Story Director: pondering — the rule-book
     is calling shots from the page tonight.") in casual mode. Dev mode
     should still surface the engineer string via
     `whisperBlockedReasonDev` in the diagnostic span.
  3. **Logistics Legend (press L → opens lens overlay)** — title and 7
     rows fully English; bracketed lens-mode keys preserved.
  4. **Storyteller strip refresh** — wait 30+ in-game seconds; the
     authored voice line should rotate to a different bucket entry.
- **Region-disjoint check**: 02d's SALIENT_BEAT_PATTERNS / classifyMemoryLine
  / Family line additions are untouched; 02c's leaderboard / autopilot
  isTrusted gate is untouched; Wave-1's `body.dev-mode` + `isDevMode` helper
  is re-used (not modified) by Step 2's `uiProfile` read.
