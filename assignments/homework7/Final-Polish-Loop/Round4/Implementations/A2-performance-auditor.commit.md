# A2-performance-auditor — R4 Implementation Log

- **reviewer_id:** A2-performance-auditor
- **round:** 4
- **track:** docs
- **priority:** P2
- **parent_commit:** `f749184`
- **head_commit:** _filled by orchestrator after commit_
- **freeze_policy:** hard
- **plan:** `assignments/homework7/Final-Polish-Loop/Round4/Plans/A2-performance-auditor.md`

## Status

**COMPLETE — docs-only, single commit.** Plan direction A executed verbatim.
No source / test / config files touched. Track = `docs` honoured.

## Why docs-only (recap of plan §3 selection)

A2 R4 verdict YELLOW 4/10 with `__fps_observed.fps` p50 = 48.76 (P3) /
55.01 (P4). Same-window `__perftrace.topSystems` shows every sim system
sub-millisecond avg, sim 4× / 8× stable, and an in-tab RAF probe measures
~238 fps free-run vs the 50–57 fps band the in-app observer reports.
Conclusion: the gap is **headless Chromium RAF cap**, not a sim regression.
Correct R4 action under P2 + hard-freeze is to archive the measurement
set + a R5 retest protocol (headed Chrome + display vsync + 30 min P5);
direction B (in-app `renderFps` / `simTickFps` instrumentation split)
is real R5+ work, not R4.

## Files changed (2)

1. **`CHANGELOG.md`** — appended a new `### Performance (HW7 R4 — A2 headless cap noted)` subsection at the bottom of the existing `## [Unreleased] — HW7 Final Polish Loop Hotfix iter4` block (immediately above the `## [Unreleased] — HW7 Final Polish Loop Round 3` heading). Subsection contents:
   - R4 measurement summary: P3 p50 = 48.76, P4 p50 = 55.01 (sample partially polluted by colony-wipe), P5 heap +14.84% over compressed 5 min window, `__perftrace.topSystems` all sub-ms avg, sim 4× / 8× stable.
   - Known cap statement: headless Chromium RAF lock at 50–57 fps vs ~238 fps free-run RAF probe — harness-side, not sim-side.
   - R5 retest protocol: headed Chrome + display vsync / `--disable-gpu-vsync` A/B; P5 re-run at brief-spec 30 min (vs wave-0 5 min); deferred instrumentation split called out as out-of-scope for R4.
   - Files-changed line listing the 2 docs files + this log.

2. **`assignments/homework7/Post-Mortem.md`** — appended a new `#### R4 Progress Note (2026-05-01) — A2 headless perf measurement caveat` subsection inside §4.5, immediately AFTER the existing R3 Progress Note's perf-measurement-note quote block and BEFORE the `---` separator that terminates §4.5. Subsection mirrors the CHANGELOG narrative in the established §4.5 progress-note voice: feedback verdict + RAF-cap diagnosis, R5 retest protocol bullets, explicit pointer to the CHANGELOG entry, and a closing line classifying the caveat as a measurement-methodology gap (queued alongside the four §4.5 deferrals, distinct from product-feature deferrals).

## Plan steps — executed

- [x] Step 1: `CHANGELOG.md`:91 — edit — added `### Performance (HW7 R4 — A2 headless cap noted)` under the iter4 `[Unreleased]` block.
- [x] Step 2: `CHANGELOG.md`:`### Performance` — populated R4 A2 measurement summary (P3 / P4 / P5 + perftrace + sim-speed stability).
- [x] Step 3: `CHANGELOG.md`:`### Performance` — populated headless Chromium RAF cap known-cap paragraph + R5 headed-Chrome / display-vsync retest requirement.
- [x] Step 4: `Post-Mortem.md`:end-of-§4.5 — added `R4 Progress Note` subsection after R3 Progress Note, before the `---` separator.
- [x] Step 5: `CHANGELOG.md`:`### Performance` — included the P5 5-min vs 30-min known-gap line + R5 brief retest requirement.

## Plan-§5 risks — handling

- **Post-Mortem §4.5 R3 Progress Note ordering** — preserved. New R4 Progress Note is inserted strictly AFTER the R3 note's closing `> [R3 perf measurement note: …]` quote and BEFORE the `---` separator that terminates §4.5. R3 Progress Note structure is untouched.
- **CHANGELOG `[Unreleased]` chronological placement** — new `### Performance` subsection is appended at the end of the iter4 hotfix block (after Batch E's Test baseline closer), immediately before the `## [Unreleased] — HW7 Final Polish Loop Round 3` heading at the prior line 92.
- **Existing tests impacted** — none (pure documentation).

## Plan-§6 verification

- `rg "headless cap" CHANGELOG.md` → 1 hit (in the new `### Performance (HW7 R4 — A2 headless cap noted)` subsection heading).
- `rg "headless perf measurement" Post-Mortem.md` → 1 hit (in the new `R4 Progress Note (2026-05-01) — A2 headless perf measurement caveat` subsection heading).
- FPS regression test — N/A (no code change; track = docs).
- `npx vite build` — not run for this commit (docs-only; orchestrator-side sanity if required).

## Rollback

Anchor: `f749184`. One-shot revert: `git reset --hard f749184` (or
`git revert <head_commit>` for a non-destructive undo of just this
commit).

## Commit message (used)

```
docs(perf): A2 R4 — archive headless RAF cap caveat + R5 retest protocol

Append to CHANGELOG [Unreleased] iter4 block: new ### Performance
subsection records the R4 A2 measurement set (P3 p50 48.76 / P4 p50
55.01 / P5 +14.84% heap over compressed 5 min window), notes the
headless Chromium RAF cap (50-57 fps observed vs ~238 fps free-run
RAF probe) with __perftrace.topSystems all sub-ms avg as the
ground-truth signal that sim is not the bottleneck, and specifies
the R5 retest protocol (headed Chrome + display vsync / GPU-vsync
A/B + 30 min P5) required to lift the YELLOW.

Append to Post-Mortem §4.5: new R4 Progress Note (2026-05-01)
mirrors the same diagnosis in the established §4.5 voice, classifies
the caveat as a measurement-methodology gap distinct from the four
product-feature deferrals, and points back to the CHANGELOG entry
for the full numeric set.

No source / test / config changes. Track = docs only. Plan:
assignments/homework7/Final-Polish-Loop/Round4/Plans/A2-performance-
auditor.md.
```
