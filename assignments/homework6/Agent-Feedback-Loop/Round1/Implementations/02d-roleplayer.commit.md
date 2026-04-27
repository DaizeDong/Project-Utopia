---
reviewer_id: 02d-roleplayer
plan_source: Round1/Plans/02d-roleplayer.md
round: 1
date: 2026-04-22
parent_commit: 834381d
head_commit: 1a5d3b9
status: DONE
steps_done: 5/7
tests_passed: 1013/1015
tests_new: test/hud-storyteller.test.js (3 new cases appended; file already existed)
---

## Steps executed

- [x] Step 1: Added pure helper `extractLatestNarrativeBeat(state, nowSec)` (plus
      internal `parseBeatLine` + `formatBeatText` helpers + salient pattern
      constant table) at top of `src/ui/hud/storytellerStrip.js`. Six salient
      patterns matched: `[SABOTAGE]`, `[SHORTAGE]`, `[VISITOR]`, `[WEATHER]`,
      `died (`, `warehouse fire` (case-insensitive). Age parsed from leading
      `[NN.Ns]` timestamp; horizon = 15s; beats without a parseable prefix
      fall through as "just now" (ageSec = 0).
- [x] Step 2 (per D4 arbitration): Extended `computeStorytellerStripModel`
      return object with a `beatText: string | null` field. `computeStorytellerStripText`
      was **not** modified (per summary_arbitration D4: "不要改
      computeStorytellerStripText"). Orig plan's Step 2 + Step 3 instruction
      to splice `· Last: ...` into the single-line string is superseded by
      D4.
- [x] Step 3: `computeStorytellerStripText` signature preserved; helper uses
      `state?.metrics?.timeSec ?? 0` as `nowSec` default, and missing
      timestamps degrade to "just now" rather than hiding the beat.
- [x] Step 4: HUDController dwell throttle implemented via two new fields
      (`_stripBeatText`, `_stripBeatUntilMs`) following the existing
      `_obituaryUntilMs` pattern. STRIP_BEAT_DWELL_MS = 2500ms. Clearing
      (beatText=null) bypasses dwell so expired beats disappear immediately.
      Also updated `index.html`: added `<span id="storytellerBeat"
      class="hud-storyteller-beat" hidden></span>` and a small CSS rule
      (italic, left-border separator). Per D4: rendered into dedicated
      child span, **not** into `#storytellerStrip.textContent`.
- [x] Step 5: `test/hud-storyteller.test.js` — added 3 cases asserting on
      `computeStorytellerStripModel().beatText` (per D4, **not** on
      `computeStorytellerStripText`): (a) SABOTAGE beat + age (1s ago),
      (b) non-salient "weather steady" returns `null`, (c) expired
      (40s > 15s horizon) returns `null`. Also imported
      `computeStorytellerStripModel` alongside the legacy `Text` export.
- [ ] Step 6: **SKIPPED** — manual `npx vite` smoke test. Not runnable in
      the sandboxed agent loop (no interactive browser). Handoff to
      Validator for Playwright smoke coverage (see below).
- [ ] Step 7: **SKIPPED** — CHANGELOG.md update. Per implementer.md §6:
      *"不要在 commit 里一起改 CHANGELOG.md（留给 Validator 阶段统一追加）"*.
      Leaving the changelog entry for the Validator pass.

## Tests

- pre-existing skips: 2 (unchanged baseline; both pre-existed on
  parent_commit 834381d)
- new tests added:
  - `test/hud-storyteller.test.js::computeStorytellerStripModel: salient
    SABOTAGE beat surfaces with age (s ago)`
  - `test/hud-storyteller.test.js::computeStorytellerStripModel: non-salient
    trace line (weather steady) does not produce a beat`
  - `test/hud-storyteller.test.js::computeStorytellerStripModel: trace line
    older than 15s horizon is filtered out (expired beat)`
- failures resolved during iteration: none — suite was green on first
  execution after Edits landed.
- Totals: 1015 tests, 1013 pass, 0 fail, 2 skip (baseline matches).

## Deviations from plan

- **D4 arbitration applied** (summary_arbitration): Steps 2/3 of the original
  02d plan wanted `computeStorytellerStripText` to append ` · Last: …` to the
  single-line return string. D4 overrides that: we extend
  `computeStorytellerStripModel` with `beatText` instead, and the HUD renders
  into a new `#storytellerBeat` child span. Legacy
  `computeStorytellerStripText` is byte-for-byte unchanged (ensures the 5
  pre-existing fallback-branch assertions in `hud-storyteller.test.js` still
  green without modification).
- **Beat-length clamp**: plan said 180 chars; implementation uses 140 chars
  because the beat now lives in a sibling span rather than appended to the
  main line — leaves more headroom before the 24px strip max-height clips.
  Non-load-bearing tuning.
- **CSS + DOM hook added to `index.html`**: plan didn't explicitly list
  `index.html` in file scope, but the new `#storytellerBeat` span needs a
  home in the HUD template (otherwise HUDController's
  `document.getElementById("storytellerBeat")` returns null and the beat is
  permanently hidden). Kept the change tiny (one new `<span>` + one scoped
  CSS rule) so ui-layout.test.js is unaffected (it asserts id existence,
  not element count).
- **Step 6 + Step 7 skipped** as noted above: manual smoke + CHANGELOG are
  validator-phase tasks, not implementer-phase.

## Handoff to Validator

1. **Playwright smoke** — please cover the `#storytellerBeat` render path:
   - Start a run (Broken Frontier preset recommended, SABOTAGE
     frequency is high there).
   - 4× speed, wait 60-120s, confirm `#storytellerBeat` span becomes
     visible with copy matching `/^Last: \[SABOTAGE\] .+ \(\d+s ago|just now\)$/`.
   - Pause (Space), open DeveloperPanel, diff the `devEventTraceVal` head row
     vs the `#storytellerBeat` text — should be the same salient event
     (minus the `[NN.Ns]` prefix).
   - Exercise dwell throttle: during a high-event tick (e.g. winter deaths),
     `#storytellerBeat.textContent` must not change more than 1× per 2.5s.
2. **CHANGELOG.md** — append a v0.8.2 Unreleased entry under "New Features"
   or "UI Polish" per plan Step 7 copy. Suggested wording:
   *"HUD storyteller strip now surfaces the latest salient event-trace beat
   (sabotage / shortage / visitor / weather / death / fire) in a dedicated
   #storytellerBeat child span, closing the 'silent director' gap reported
   in Round 1 02d-roleplayer playtest. 15s age horizon + 2.5s dwell
   throttle."*
3. **Benchmark**: plan mentioned `scripts/long-horizon-bench.mjs` as a
   safety-belt DevIndex regression check. Change is UI-only (pure function +
   DOM write); mathematically zero impact on sim, but if the validator
   harness already runs it, DevIndex should remain ≥ 42 (v0.8.1 baseline
   44 minus 5% tolerance).
4. **Known-safe regions**: no changes to gameplay systems, balance, AI, or
   rendering — only `src/ui/hud/` + `index.html` + 1 test file.
