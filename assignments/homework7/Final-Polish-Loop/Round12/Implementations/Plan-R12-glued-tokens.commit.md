---
plan_id: Plan-R12-glued-tokens
implementer: 1/7
priority: P0
track: code
parent_commit: fa6cda1
date: 2026-05-01
status: COMMITTED
---

# Plan-R12-glued-tokens — Implementation log

## Status
COMMITTED on track=code. Surgical UI string-template fix per A7 #2.

## Diff summary
`${entry.groupId}:${entry.focus}` → `${titleCaseGroup(entry.groupId)}: ${entry.focus}` in `src/ui/interpretation/WorldExplain.js#getAiInsight`. Adds local `titleCaseGroup()` helper (defensive against null/undefined/empty). Three downstream surfaces (Live Causal Chain, AI Decisions, Director timeline tooltip) now render `Workers: rebuild the broken supply lane` instead of the glued `workersrebuild ...` A7 captured in screenshots 15 + 16.

Selected Suggestion A combined with Suggestion C from the plan: Title-Case + colon-space (~5 LOC). Suggestion B (em-dash) rejected — `" | "` already separates groups. Suggestion D (re-architect as structured object) is freeze-violating.

## Files changed
- `src/ui/interpretation/WorldExplain.js` (+12 / -1 LOC: helper + template + comments)
- `test/world-explain.test.js` (+2 / -1 LOC: existing assertion `/workers:depot/` → `/Workers: depot/` + negative regression on `workersdepot`)
- `test/world-explain-ai-summary.test.js` (+72 LOC, NEW: 4 cases — single-group Title-Case, multi-group separator + negative regressions on `saboteursstrike` / `workersrebuild` / `tradershug`, no-groups fallback preserved, defensive empty-groupId path)
- `CHANGELOG.md` (+14 LOC: v0.10.1-n entry under Unreleased)

Total source/test delta: +85 / -2 LOC. Plan target ~20 LOC for code; the plan's own Step 4 prescribed the +30 LOC regression test — landed at the upper edge but within scope.

## Tests
- Targeted: `node --test test/world-explain.test.js test/world-explain-ai-summary.test.js` → **13 pass / 0 fail / 0 skip**
- Full suite: `node --test test/*.test.js` → **1993 pass / 0 fail / 4 skip** (120 suites, ~75 s wall-clock). +4 over the prior baseline (1989) from the new test file's four cases. Baseline preserved.

## Acceptance (from plan §7)
1. Live Causal Chain renders `Workers: rebuild ...` not `workersrebuild ...` — verified by `world-explain-ai-summary` test 1.
2. AI Decisions block renders the same — same template, same `getAiInsight` call site, verified.
3. Director timeline tooltip renders the same — same template, verified.
4. New unit test passes — yes.
5. Test baseline preserved — 1989 → 1993 (+4 net), 0 fail, 4 skip.
6. Substring `saboteursstrike` does not appear in rendered HUD — negative regression in `world-explain-ai-summary` test 2.

## Commit
HEAD: `<see git log --oneline -2 below>`
Parent: `fa6cda1` (R11 Plan-A1-regenerate-return)

## Confirmation
`git log --oneline -2` output captured in commit step.
