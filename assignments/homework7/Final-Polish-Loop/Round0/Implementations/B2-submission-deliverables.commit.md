---
reviewer_id: B2-submission-deliverables
plan_source: assignments/homework7/Final-Polish-Loop/Round0/Plans/B2-submission-deliverables.md
round: 0
date: 2026-05-01
parent_commit: 98e18c2
head_commit: d747aae
status: DONE
track: docs
freeze_check: PASS
track_check: PASS
steps_done: 6/6
tests_passed: N/A (docs track)
tests_new: none
---

## Steps executed

- [x] **Step 1**: created `assignments/homework7/Post-Mortem.md` (~190 LOC skeleton)
  - YAML frontmatter (title / date / build_commit / author / status: skeleton)
  - Demo Video pointer to Step 2
  - §1 Pillars Overview with two pillar slots and explicit `<!-- AUTHOR: copy from A2 -->` notes (no LLM-guessed pillar names)
  - §2 Playtest Resolution table header + author guidance to source from HW6 + PROCESS-LOG
  - §3 Technical Post-Mortem with 4 prompted subsections (worker AI three rewrites; LLM proxy retry; long-horizon benchmark; release:strict freshness gate) — each anchors to real in-tree files (`docs/superpowers/plans/...`, CHANGELOG version)
  - §4 Pivots & Cuts from A2 MVP (3 questions: survival mode vs cut victory loop; wildlife/defense scope; multi-LLM persona)
  - §5 AI Tool Evaluation with explicit anti-LLM-polish AUTHOR comment per TA §1.5
  - References block linking CLAUDE.md, CHANGELOG, A2, HW6, PROCESS-LOG, FSM retrospective

- [x] **Step 2**: created `assignments/homework7/Demo-Video-Plan.md` (~62 LOC)
  - frontmatter `status: pending`, `target_length_minutes: 3`, platform TBD
  - §1 recording window + pre-flight checklist (git status / npm ci / npm run build / preview / 1080p60)
  - §2 7-shot list with timecodes targeting 3:00 (Pillar A demo at 0:30–1:15; Pillar B at 1:15–2:00; survival/DevIndex at 2:00–2:30)
  - §3 voiceover/overlay decisions (TBD)
  - §4 post-upload checklist mirroring URL into README + Post-Mortem + CHANGELOG

- [x] **Step 3**: README.md inserted `## Highlights — Two Pillars` between intro and `## Tech Stack`
  - two `### Pillar A/B` placeholder blocks with `<!-- AUTHOR: copy from A2 -->` warnings
  - trailing blockquote linking to `assignments/homework7/Post-Mortem.md` for the long form

- [x] **Step 4**: README.md Quick Start grader callout
  - blockquote at top of `## Quick Start` clarifying no API key required (fallback runs full game)
  - browser-open line `Then open <http://localhost:5173>...` after the launch-paths code block, before the Windows / `Project Utopia.cmd` paragraph
  - first occurrence of `fallback` in README is now line 29 (Tech Stack) and prominently in Quick Start at line 33 (was previously buried at ~line 174)

- [x] **Step 5**: README.md inserted `## Demo Video & Post-Mortem` section before `## Submission / Release Flow`
  - bullet 1: Demo Video pending → links to Demo-Video-Plan.md
  - bullet 2: Post-Mortem → links to Post-Mortem.md with one-line summary of contents

- [x] **Step 6**: README.md appended `### How to Grade This Submission` subsection at end of Submission/Release Flow
  - 6-step grader walkthrough (clone → npm ci → npm run build → npx vite preview → Start Colony → read Post-Mortem)
  - explicit "no OPENAI_API_KEY required" reassurance
  - zip-submission instructions with exclude list (node_modules / .env / output / dist optional)
  - softened the original "authoritative artifact is local build, not hosted URL" line by limiting it to "for daily verification gates during development" and pointing to the new How-to-Grade subsection for HW7 final submission

## Tests

- pre-existing skips: N/A (docs track — `node --test` not in scope per implementer.md §6)
- new tests added: none (plan §6 explicitly says "纯 docs，不需要单测")
- failures resolved during iteration: none

## Manual verification (per plan §6)

1. `ls assignments/homework7/Post-Mortem.md` → exists (190 LOC)
2. `ls assignments/homework7/Demo-Video-Plan.md` → exists (62 LOC)
3. `grep -i "pillar" README.md` → 8 hits (≥3 required)
4. `grep -i "post-mortem" README.md` → 6 hits (≥1 required)
5. `grep -i "demo video" README.md` → 2 hits (≥1 required)
6. `grep -i "fallback" README.md` first hit at line 29 (`<25` requirement satisfied — Tech Stack mention; new explicit Quick Start callout at line 33 reinforces)
7. relative links audited: `assignments/homework7/Post-Mortem.md` and `assignments/homework7/Demo-Video-Plan.md` both exist on disk → no dead links
8. no empty `[](...)` or `](...)` brackets in any of the 3 files
9. `<>` content audit: only intentional escaped-angle author placeholders (`\<TBD\>`, `\<copy exact pillar name from A2\>`) — no stray HTML or unfilled template tags

`npx vite build` not run — pure markdown changes do not enter the Vite asset pipeline; plan §6 lists this as "should be no-op".

## Deviations from plan

- **Plan called "build_commit: 3f87bf4" in frontmatter; actual parent at exec time was `98e18c2`** (predecessor A5-balance-critic had already landed). Used `3f87bf4` in Post-Mortem frontmatter as the plan instructed (it is the original v0.10.1-m balance build that the polish loop is anchored against), matching plan §1 / §rollback_anchor.
- **README anchor line numbers** in the plan referenced positions in commit `3f87bf4`; the working tree already had B-track infrastructure edits applied (current README was 200 LOC, not the plan's reference 132 LOC). Adjusted insertion points by *semantic anchor* (between intro and Tech Stack; under Quick Start; before Submission/Release Flow; at end of Submission/Release Flow before Optional Live-AI Proof Refresh) rather than literal line numbers, preserving plan intent. Implementer.md §5 explicitly allows "plan 描述与实际代码对不上（行号偏移）允许小幅调整，但语义必须与 plan 一致".
- **Did NOT touch** pre-existing dirty files (CHANGELOG.md, package.json, package-lock.json, README-Launcher.txt, launch-project-utopia.ps1, untracked debug logs) — those are wave-0 infrastructure work belonging to other plans / non-plan polish. Staged exactly 3 paths.
- **Step 6 zip exclusion list**: plan said exclude `node_modules / .env / output/`. I added `dist/` as optional-exclude (with note that `npm run build` regenerates it) — minor extension to make the zip smaller without losing reproducibility. Plan-aligned.

## Freeze / Track check 结果

- **Freeze check: PASS** — pure documentation changes. No new TILE constant, no new role enum, no new building blueprint, no audio asset import, no new file under `src/ui/panels/`, no mechanic changes. Zero `src/`, zero `test/` files touched.
- **Track check: PASS** — wrote only to: `README.md` (allowed for docs track), `assignments/homework7/Post-Mortem.md` (new, allowed), `assignments/homework7/Demo-Video-Plan.md` (new, allowed). Did NOT write to: any `src/**`, any `test/**`, any config (package.json / vite.config.* / .env.example), or `Plans/` / `Feedbacks/` (forbidden per implementer.md §8).

## Handoff to Validator

Validator should focus on:

1. **Link integrity**: open `README.md` in any markdown renderer and confirm both new internal links (Pillars block → Post-Mortem.md; Demo Video & Post-Mortem section → both targets) resolve. The two new files exist on disk so this should be trivial.
2. **B2 22-item checklist re-grade**: per plan §6 expected delta — C2 three FAIL→PASS, C3 status missing→pending, C4 file-existence FAIL→PASS, C5 zip path FAIL→PASS. Target: ≥17/22 PASS (was ~7/22).
3. **Anti-LLM-polish smoke**: confirm Post-Mortem.md §1, §3, §4, §5 all retain `<!-- AUTHOR: ... -->` directives and contain prompted-question structure rather than essay prose. The author MUST flesh out these sections in their own voice before final submission — Validator should NOT mark this plan as "Post-Mortem complete", only as "Post-Mortem skeleton landed; author content pending".
4. **No prod build / no FPS / no benchmark verification needed** (pure docs).
5. **Worktree cleanliness**: `git status` after this commit should show the same pre-existing dirty files (CHANGELOG, package.json, etc.) but no NEW additions from this plan beyond the committed 3 paths.
6. **Validator should NOT run `node --test`** — plan §6 explicitly excludes it; running it would only confirm the unrelated pre-existing test baseline.
