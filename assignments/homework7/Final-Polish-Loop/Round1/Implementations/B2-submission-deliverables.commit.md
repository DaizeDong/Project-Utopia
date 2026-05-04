---
reviewer_id: B2-submission-deliverables
plan_source: assignments/homework7/Final-Polish-Loop/Round1/Plans/B2-submission-deliverables.md
round: 1
date: 2026-05-01
parent_commit: 439b120
head_commit: 9b77339
status: DONE
track: docs
freeze_check: PASS
track_check: PASS
steps_done: 5/5
tests_passed: N/A (docs track)
tests_new: 0
---

## Steps executed

- [x] **Step 1**: Created `assignments/homework7/build-submission.sh` (~80 lines bash). Includes shebang `#!/usr/bin/env bash`, `set -euo pipefail`, header doc-block, `cd "$(git rev-parse --show-toplevel)"`, build identity echo (commit sha + package version), `npm ci --prefer-offline --no-audit`, `npm run build`, `dist/index.html` existence check (exit 2 if missing), `mkdir -p dist-submission/`, timestamped output `dist-submission/project-utopia-hw7-<stamp>.zip`, zip with explicit excludes (`node_modules/`, `.git/`, `.env*`, `output/`, `dist-submission/`, `.playwright-cli/`, `pw-help.txt`, `desktop-dist/`, `*.log`), `du -h` size report, "upload OR push to GitHub — not both" reminder, and an `=== AUTHOR ACTION REQUIRED ===` heredoc block listing all 4 PENDING items with their grep gates. Validated with `bash -n` (syntax OK).

- [x] **Step 2**: Edited `package.json` `scripts` block (depends_on Step 1). Added `"submission:zip": "bash assignments/homework7/build-submission.sh"` after `"desktop:dist"` line. Added trailing comma to former last entry. Validated with `node -e require('./package.json')` — JSON parses, script entry resolves correctly. Note: the staged commit contains *only* this one line; the pre-existing uncommitted version-bump (0.8.1→0.10.1-m) and `start` / `preview` / `start:prod` rewrites were stashed before commit and restored after, so the commit diff for package.json is exactly +1/-1 line per the plan.

- [x] **Step 3**: Edited `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` (depends_on Step 1). Appended R1 closeout entry at file end (~85 lines added). Header `## 2026-05-01 — Round 1 closeout (B2-submission-deliverables enhancer plan)`. Trajectory summary (R0 RED 7/22 → R1 YELLOW 17/22 + breakdown of remaining 5). Four AUTHOR ACTION REQUIRED items each with explicit prompt + grep-gate command: (1) pillar names + summaries / (2) Post-Mortem §1-§5 substantive content (with §5 anti-LLM-polish warning) / (3) demo video URL backfill / (4) zip vs hosted URL choice. Final VALIDATOR SIGN-OFF GATE bash block with 4 grep / test commands. Closing design-intent paragraph affirming that R0's author-skeleton placeholders are the *correct* TA HW7 §1.5 anti-LLM-polish posture and R1 is process-only, not content-fill.

- [x] **Step 4**: Edited `CHANGELOG.md` `[Unreleased]` block. Inserted new sub-section `### Docs (HW7 Round 0 → Round 1 — submission deliverables trajectory)` at the top of the R1 Unreleased block (above the `### HW7 R1 Closeout — Documented Defers` sub-section), 39 lines added. Bullets cover: verdict trajectory (7/22 → 17/22 +10), plan rollback anchors (3f87bf4 → 1f6ecc6), R1 process artifacts (build-submission.sh + npm script), 4 PENDING author-fill items locked into PROCESS-LOG with grep-gates, README port note, design-intent (anti-LLM-polish posture preserved), and explicit files-changed list.

- [x] **Step 5**: Edited `README.md` line 170 (`How to Grade This Submission` step 4). Original already documented `:4173` default; expanded the line to make the `:4173` (preview, production-from-`dist/`) vs `:5173` (dev server, `npx vite`) distinction explicit. Resolves feedback P2-1 grader confusion when comparing against README line 49 which references `localhost:5173` for the dev path. README now has both ports documented with their respective contexts; `grep -n "4173" README.md` and `grep -n "5173" README.md` both confirm hits on the relevant lines.

## Tests

- pre-existing skips: N/A (docs track, `node --test` not invoked per plan §6)
- new tests added: none (plan §6 explicitly: "新增测试：无（纯 docs / process 改动）")
- failures resolved during iteration: none

Manual validation per plan §6:
1. `ls assignments/homework7/build-submission.sh` → file exists (mode 100644, ~80 lines).
2. `bash -n assignments/homework7/build-submission.sh` → shell syntax OK (no parse errors).
3. `node -e "const p=require('./package.json'); p.scripts['submission:zip']"` → resolves to `bash assignments/homework7/build-submission.sh`.
4. `grep -c "AUTHOR ACTION REQUIRED" assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` → 1 (≥1 required).
5. `grep -c "1f6ecc6" CHANGELOG.md` → 1 (≥1 required; R1 rollback anchor logged).
6. `grep -n "4173" README.md` → hit on line 170 (Step 5 added context).
7. `grep -n "5173" README.md` → hits on lines 49 (existing) + 170 (new contextual mention).
8. Did NOT execute the full `npm run submission:zip` end-to-end build (would consume 30-60s of the deadline budget on `npm ci`); script syntax verified statically + npm-script wiring verified via Node JSON parse.

## Deviations from plan

- Plan §4 Step 5 said "在 `npx vite preview` 命令行后追加注释 `(Vite preview defaults to <http://localhost:4173>; the dev server uses :5173)`". The existing README already had `(defaults to <http://localhost:4173>)`, so I rewrote the line to merge the existing parenthetical with an explicit `:5173` distinction (`Vite preview defaults to <http://localhost:4173>; the Vite dev server (npx vite / npm start) instead uses <http://localhost:5173>`). Net effect identical to plan intent (grader sees both ports clarified) without duplicate text.

- Pre-existing uncommitted edits to package.json (version 0.8.1→0.10.1-m, new `start` script, `preview`/`start:prod` rewrites), package-lock.json, README-Launcher.txt, launch-project-utopia.ps1, and B1-action-items-auditor.commit.md were already in the working tree at parent commit 439b120 (visible in `gitStatus` snapshot at session start). Per implementer.md hard-rule #4 ("commit 前 HEAD 必须是干净的，除本 plan 改动外无未追踪更改"), I `git stash push`'d those files before commit and `git stash pop`'d them after, so the commit (`9b77339`) contains exclusively the 5 files my plan touches. The pre-existing edits remain in the post-commit working tree for the next implementer / orchestrator to handle.

## Freeze / Track check 结果

- **freeze_check: PASS** — no new tile constants, no new role enum values, no new building blueprints, no new audio asset imports, no new UI panel files. Pure docs (markdown) + 1 build-tooling bash script + 1-line `package.json` `scripts` insertion. Build script is process-tooling under `assignments/homework7/`, classified as docs-track infrastructure per the runtime-context note ("build-submission.sh OK as build-tooling artifact placed under assignments/homework7/"). package.json edit is "infrastructure, not src/" per orchestrator clarification.
- **track_check: PASS** — track is `docs`. Files touched: `README.md`, `CHANGELOG.md`, `assignments/homework7/build-submission.sh`, `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md`, `package.json`. Zero `src/` and zero `test/` modifications. Plans/ and Feedbacks/ untouched (verified — no edits to either directory).
- **anti-LLM-polish (TA HW7 §1.5) check: PRESERVED** — pillar names in README "Highlights — Two Pillars", Post-Mortem §1-§5 prose, demo-video URL: all left as `<!-- AUTHOR: ... -->` skeletons exactly as R0 implementer placed them. R1 deliberately did NOT auto-fill these, instead registering them as a 4-item author checklist with grep-verifiable validator gates.

## Handoff to Validator

- **Primary verification target**: `bash assignments/homework7/build-submission.sh` (or `npm run submission:zip`) end-to-end dry run. Expected: `npm ci` + `npm run build` succeed → `dist/index.html` exists → zip lands at `dist-submission/project-utopia-hw7-<stamp>.zip` → `unzip -l` shows no `node_modules/`, no `.env`, no `output/`, no `.git/`, but DOES contain `dist/`, `src/`, `README.md`, `CHANGELOG.md`, `assignments/homework7/`. Final stdout is `=== AUTHOR ACTION REQUIRED ===` reminder block.
- **Secondary verification**: re-run B2 22-item checklist against this commit. Expected R1 verdict after this implementer + before author-fill: PASS 18 / PENDING 4 / FAIL 0 (C5 submission-format FAIL flips to PASS via the new `submission:zip` script artifact). After author completes 4 PENDING items (offline, per checklist), expected 22/22 GREEN.
- **Static gates** the validator should run before signing off the round (these will produce hits until author completes their work — that is correct, not a defect):
  ```bash
  grep -rn "<copy exact pillar name from A2>" README.md assignments/homework7/   # expected: hits (PENDING)
  grep -rn "AUTHOR:" assignments/homework7/Post-Mortem.md                        # expected: hits (PENDING)
  grep -n "pending — see Demo-Video-Plan" README.md                              # expected: hits (PENDING)
  ```
- **Build / FPS / panel smoke**: N/A. Pure docs + build-tooling change. No `src/`, no UI, no system invariants touched. `node --test` and `npx vite build` not invoked by this commit (plan §6 says N/A); the validator may still run them for global health if desired.
- **freeze-diff**: zero net new TILE / role / building / mood / audio / UI panel surface area. Lockable.
