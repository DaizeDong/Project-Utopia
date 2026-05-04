---
reviewer_id: B2-submission-deliverables
plan_source: Round2/Plans/B2-submission-deliverables.md
round: 2
date: 2026-05-01
parent_commit: c2ef09f
head_commit: 425d669
status: DONE
track: docs
freeze_check: PASS
track_check: PASS
steps_done: 2/2
tests_passed: 1701/1708
tests_new: 0
---

## Steps executed

- [x] Step 1: Append `## Round 2 (2026-05-01) — Submission Closeout Gates`
  block to `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` with
  the 4 explicit AUTHOR-FILL GATEs (README pillar names, Post-Mortem
  AUTHOR: comments, demo video URL, submission-format choice). Each
  gate carries the literal grep command, the required count (must be
  0), the file owning the placeholder, and a "Note" line reconciling
  the plan's stated count vs the actual current placeholder shape in
  the live build.
- [x] Step 2: Append `### Docs (HW7 Round 1 → Round 2 — submission
  deliverables trajectory)` subsection to `CHANGELOG.md`'s
  `[Unreleased] — HW7 Final Polish Loop Round 1` block, immediately
  after the existing B1 R2 closeout entry. Subsection contains the
  four bullets specified by the plan: verdict trajectory
  (R0 RED 7/22 → R1 YELLOW 17/22 → R2 YELLOW 18/22, cumulative +11),
  C5 submission-format R1 FAIL → R2 PASS confirmation, 4 PENDING
  author-fill items with cross-reference to the new PROCESS-LOG
  section, distance-to-GREEN delta plus R1 engineering-fix
  no-regression statement.
- [N/A] Step 3 of plan was explicitly "no further steps; do NOT edit
  README pillar names; do NOT edit Post-Mortem §1-§5; do NOT pick
  submission format on author's behalf; do NOT add fake video URL".
  Verified: no edits to README.md, no edits to Post-Mortem.md, no
  edits to Demo-Video-Plan.md. The 4 placeholder strings were
  deliberately preserved.

## Tests

- pre-existing skips: 3 (per CHANGELOG R0 entry — unchanged)
- pre-existing failures: 4 (`ResourceSystem flushes foodProducedPerMin`,
  `RoleAssignment: 1 quarry → 1 STONE worker`, `RaidEscalator: DI=30
  yields tier 3`, `RaidFallbackScheduler: pop < popFloor does not
  trigger`) — all unchanged from R1 baseline; `node --test test/*.test.js`
  reports 1701/1708 pass (4 fail / 3 skip), identical posture to the
  pre-edit run. Markdown-only edits do not interact with the test
  harness.
- new tests added: none (plan §6 explicitly specifies
  `新增测试: none`, docs-only change)
- failures resolved during iteration: none required

## Deviations from plan

- **Plan §6.3 negative-check counts vs reality.** Plan asserted
  `grep -c "<copy exact pillar name from A2>" README.md` should hit
  3, `grep -c "AUTHOR:" Post-Mortem.md` should hit 6, and
  `grep -c "pending — see Demo-Video-Plan" README.md` should hit 1.
  Actual current state at parent commit `c2ef09f`:
    - README backslash-escaped pillar placeholder (`\<copy exact pillar name from A2\>`): **2** hits (lines 12 and 18)
    - Post-Mortem `AUTHOR:` HTML-comment guard blocks: **4** hits (§1, §2, §3, §5)
    - README `pending — see [Demo-Video-Plan` (markdown-link form,
      since the README uses bracketed link not bare text): **1** hit
      (line 92); the bare-text form `pending — see Demo-Video-Plan`
      that the plan grepped against returns **0** hits as written.
  The intent of the gates (block submission while placeholders
  remain) is preserved; the gate text in PROCESS-LOG records both
  the literal grep command and a "Note:" line reconciling each
  count delta vs the plan, so a reviewer or grader can immediately
  verify whether a placeholder count drifted because an author
  filled it in vs because the plan grepped against a slightly
  different surface form. No author content was filled.
- No other deviations from the plan steps; freeze posture preserved
  (no new tile/role/building/audio/UI panel; pure markdown edits).

## Freeze / Track check 结果

- **Freeze check: PASS.** Zero new tile / role / building / audio
  asset / UI panel introduced. Both edits are append-only markdown
  in `CHANGELOG.md` and
  `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md`. No `src/`
  files touched.
- **Track check: PASS.** Track is `docs`; whitelist allows
  `assignments/homework7/**/*` and `CHANGELOG.md`; both edited
  files are inside the whitelist. Negative confirmation:
  `git diff --stat <parent>..HEAD` shows exactly two files, both in
  the docs whitelist, totalling +162 / −0 LOC. No `src/` or `test/`
  paths in the diff.
- **TA HW7 §1.5 anti-LLM-polish posture: PRESERVED.** All four
  PENDING author-fill placeholders remain in the repo with their
  literal text intact. The implementer wrote only structural gates
  (PROCESS-LOG checklist) and factual trajectory bullets
  (CHANGELOG numerics) — zero author-voice prose was generated.

## Handoff to Validator

- **Smoke target**: none — markdown-only edit, no UI / system
  interaction.
- **Diff scope**: `git diff c2ef09f..425d669` should show exactly
  two files, +162 / −0 LOC, both inside the docs whitelist.
- **Negative-check verification**: validator should re-run the
  three placeholder greps from PROCESS-LOG GATE 1/2/3 to confirm
  the placeholder count is unchanged from parent (2 / 4 / 1
  respectively against the surface forms documented in the GATE
  Note: lines). If any of those counts dropped, the implementer
  silently auto-filled a placeholder — a TA §1.5 violation that
  should trip rollback to anchor `1f6ecc6`.
- **Positive-check verification**:
  `grep -c "AUTHOR-FILL GATE" PROCESS-LOG.md` must return 4;
  `grep "R2 YELLOW 18/22" CHANGELOG.md` must hit at least once
  (verified hits twice — line 49 in the existing R1 closeout
  entry and line 136 in the new R2 trajectory entry).
- **No FPS / build / benchmark gate applies.** Plan §6 explicitly
  states `FPS 回归: N/A` and `benchmark 回归: N/A`. Optional
  `npx vite build` smoke is unaffected by markdown edits but a
  validator may run it if desired; `npm run submission:zip`
  heredoc grep gates are unchanged from R1 and will still fire
  identically.
- **Rollback anchor**: plan specifies `1f6ecc6` (R1 baseline) for
  the unlikely case the docs edits clobbered R1 content. Spot-
  check: existing R1 entries in both files were preserved
  verbatim (PROCESS-LOG R1 closeout entry untouched at lines
  254-326; CHANGELOG `### Docs (HW7 Round 0 → Round 1 — submission
  deliverables trajectory)` entry untouched starting line 47).
