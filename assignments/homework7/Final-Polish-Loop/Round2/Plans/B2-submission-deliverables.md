---
reviewer_id: B2-submission-deliverables
reviewer_tier: B
feedback_source: Round2/Feedbacks/B2-submission-deliverables.md
round: 2
date: 2026-05-01
build_commit: d242719
priority: P1
track: docs
freeze_policy: hard
estimated_scope:
  files_touched: 2
  loc_delta: ~40
  new_tests: 0
  wall_clock: 20
conflicts_with: []
rollback_anchor: 1f6ecc6
---

## 1. 核心问题

B2 R2 verdict = **YELLOW 18/22** (R0 RED 7/22 → R1 YELLOW 17/22 → R2 YELLOW 18/22, +11 cumulative). All structural / engineering / build / submission-format columns are PASS. The remaining 4 PENDING items are **strictly author-fill** activities forbidden by TA HW7 §1.5 anti-LLM-polish for the implementer/enhancer to auto-execute:

1. README "Highlights — Two Pillars" pillar names (3 hits of `<copy exact pillar name from A2>` placeholder)
2. Post-Mortem.md §1-§5 substantive content (6 hits of `AUTHOR:` placeholder)
3. Demo video URL (currently `pending — see Demo-Video-Plan` at README line 92)
4. Submission-format final choice (zip via `npm run submission:zip` OR push to GitHub + commit-sha anchor — pick exactly one)

Root issue: **the enhancer/implementer correctly cannot fill these in R2** (doing so trips TA §1.5 LLM-polish red line). What the implementer **can** do is reinforce the author-fill gate so the author cannot ship without addressing these, and record the trajectory math (R0 7/22 → R1 17/22 → R2 18/22) for grader/reviewer continuity.

## 2. Suggestions（可行方向）

### 方向 A: Re-emphasize PROCESS-LOG checklist + add R2 trajectory entry to CHANGELOG (docs only, no auto-fill)
- 思路：Two surgical docs edits. (1) `assignments/homework7/PROCESS-LOG.md` R2 closeout: re-list the 4 PENDING author-fill items with explicit grep-gate commands (`grep -c "<copy exact pillar name from A2>" README.md` must be 0; `grep -c "AUTHOR:" assignments/homework7/Post-Mortem.md` must be 0; `grep -c "pending — see Demo-Video-Plan" README.md` must be 0; submission-format choice recorded as a single line). Cross-reference the existing `build-submission.sh` heredoc grep gates so the author sees the SAME 3 grep commands at zip-time and at log-review time. (2) `CHANGELOG.md` `[Unreleased]` block: append `### Docs (HW7 Round 1 → Round 2 — submission trajectory)` recording the 7→17→18/22 progression and stating that the residual 4 PENDING are intentional anti-polish gates.
- 涉及文件：`assignments/homework7/PROCESS-LOG.md`, `CHANGELOG.md`
- scope：小
- 预期收益：strengthens the author-fill gate without crossing TA §1.5; gives grader an explicit trajectory chart; Implementer cannot accidentally LLM-fill content because the plan explicitly forbids it
- 主要风险：none material; pure docs reinforcement
- freeze 检查：OK (zero new tile/role/building/mood/mechanic/audio/UI panel)

### 方向 B: Auto-fill all 4 PENDING items using LLM (pillar names from a2.md, post-mortem narrative, etc.)
- 思路：Read `assignments/homework2/a2.md` for pillar names, generate post-mortem prose from CLAUDE.md history, draft a fake video URL placeholder, pick zip arbitrarily.
- 涉及文件：`README.md`, `assignments/homework7/Post-Mortem.md`, `Demo-Video-Plan.md`
- scope：中
- 预期收益：B2 GREEN immediately (22/22)
- 主要风险：**FORBIDDEN by TA HW7 §1.5 anti-LLM-polish** (B2 R2 feedback explicitly calls this "design intent" and warns against auto-fill); a TA / grader recognizing LLM voice would tank the entire submission grade
- freeze 检查：technically not a freeze violation (no new tile/role/building/etc.) but is a **TA-policy violation** which is more severe; do NOT select

### 方向 C: Add a pre-commit hook that blocks `git commit` until all 4 grep gates clear
- 思路：Wire a Husky / native git hook that runs the 3 grep commands + checks for a `submission_format_chosen.txt` marker, blocking commits that leave placeholders.
- 涉及文件：`.husky/pre-commit` (new), `package.json`, `scripts/check-submission-gates.sh` (new)
- scope：中
- 预期收益：mechanical enforcement
- 主要风险：requires new tooling during freeze; existing project does not appear to use husky; could break the author's own workflow when they iterate on the post-mortem (each save would block); over-engineered for a 4-item author-fill checklist already enforced by `build-submission.sh` heredoc + B2 review process
- freeze 检查：OK on freeze axis but adds new tooling surface — disproportionate to the problem

## 3. 选定方案

选 **方向 A** (PROCESS-LOG checklist re-emphasis + CHANGELOG R2 trajectory entry).

Reasoning:
- B2's R2 feedback **explicitly states** "R2 review 不应越界" and "PENDING 状态本身不是 bug, 是 design intent" — the reviewer is licensing a non-fill response
- The 4 PENDING items each have an existing gate (build-submission.sh heredoc grep checks); duplicating them in PROCESS-LOG creates a second checkpoint without adding new tooling
- CHANGELOG trajectory entry preserves R0 RED 7/22 → R1 YELLOW 17/22 → R2 YELLOW 18/22 progression as a single audit-friendly line for the grader
- ~40 LOC of docs, 2 files, no code, no LLM-generated narrative content (the PROCESS-LOG and CHANGELOG bullets are factual checklist items, not author-voice prose)

## 4. Plan 步骤

- [ ] Step 1: `assignments/homework7/PROCESS-LOG.md`:end-of-file (or existing R2 closeout section if Implementer finds one) — `add` — append a `## Round 2 (2026-05-01) — Submission Closeout Gates` block listing **exactly the 4 author-fill items**, each with: (a) the literal grep command, (b) the required result (0 hits), (c) which file the placeholder lives in. Wording template:
  ```
  AUTHOR-FILL GATE 1: README pillar names
    grep -c "<copy exact pillar name from A2>" README.md   # must be 0
    Source for fill: assignments/homework2/a2.md

  AUTHOR-FILL GATE 2: Post-Mortem §1-§5 substantive content
    grep -c "AUTHOR:" assignments/homework7/Post-Mortem.md  # must be 0
    Sections owned by author: §1 / §2 / §3 / §4 / §5 (§4.5 already complete in R1)

  AUTHOR-FILL GATE 3: Demo video URL
    grep -c "pending — see Demo-Video-Plan" README.md       # must be 0
    Sync targets: README line 92 + Post-Mortem "Demo Video" + CHANGELOG [Unreleased]

  AUTHOR-FILL GATE 4: Submission format (choose ONE)
    Option A: npm run submission:zip → upload Canvas zip
    Option B: push main + submit GitHub URL with commit-sha anchor
    Record choice in this PROCESS-LOG entry as: "submission_format: zip" OR "submission_format: github"
  ```
  Add a header line before the gates: "These 4 gates are the residual PENDING items from B2 R2 (verdict: YELLOW 18/22, distance to GREEN = 4 author-fills). All four are TA HW7 §1.5 anti-LLM-polish protected — must be filled by author hand, not LLM."
- [ ] Step 2: `CHANGELOG.md`:`[Unreleased]` block — `add` — append a new `### Docs (HW7 Round 1 → Round 2 — submission deliverables trajectory)` subsection containing:
  - Bullet 1: "B2 submission-deliverables R2 verdict: YELLOW 18/22 (R0 RED 7/22 → R1 YELLOW 17/22 → R2 YELLOW 18/22, cumulative +11)"
  - Bullet 2: "C5 submission-format upgraded R1 FAIL → R2 PASS via `assignments/homework7/build-submission.sh` (119 LOC) + `npm run submission:zip` entry in `package.json:42` — verified intact in R2"
  - Bullet 3: "4 PENDING items remaining are author-fill (pillar names / Post-Mortem §1-§5 / demo video URL / submission-format choice); all 4 are TA HW7 §1.5 anti-LLM-polish gated and intentionally not auto-filled by the polish loop — see PROCESS-LOG R2 closeout for grep gates"
  - Bullet 4: "Distance to GREEN = 4 author-fill items (≈ 30 min admin + 1 recording session); R1's 5 engineering fixes (build-submission.sh / npm script / PROCESS-LOG / CHANGELOG / README port comment) all present in R2 with no regression"
  - depends_on: Step 1 (so the PROCESS-LOG gates and CHANGELOG bullet 3 cross-reference each other consistently)
- [ ] Step 3: (no further steps; do NOT edit README pillar names; do NOT edit Post-Mortem §1-§5; do NOT pick submission format on author's behalf; do NOT add fake video URL)

## 5. Risks

- Implementer ignores the explicit "do NOT auto-fill" instruction and edits README/Post-Mortem placeholder text → mitigation: plan repeats the prohibition in Step 3 and the verdict frontmatter; reviewer next round will catch via grep gate
- PROCESS-LOG R2 section conflicts with an already-existing R2 closeout block written by another reviewer's plan in this same round → mitigation: Step 1 instructs Implementer to "append to existing R2 entry if found" rather than creating a duplicate header
- Wording drift between PROCESS-LOG gates and CHANGELOG bullets → mitigation: Step 2 depends_on Step 1, share gate copy
- 可能影响的现有测试：none — markdown-only edits; `node --test test/*.test.js` does not pick up these files

## 6. 验证方式

- 新增测试：none
- 手动验证（after Implementer executes):
  1. `git diff CHANGELOG.md` shows the new `### Docs (HW7 Round 1 → Round 2 — submission deliverables trajectory)` subsection with 4 bullets
  2. `git diff assignments/homework7/PROCESS-LOG.md` shows the new `## Round 2 (2026-05-01) — Submission Closeout Gates` block with 4 explicit GATE entries
  3. **Negative checks** (these MUST still hit, proving Implementer did NOT auto-fill):
     - `grep -c "<copy exact pillar name from A2>" README.md` → must be 3 (unchanged)
     - `grep -c "AUTHOR:" assignments/homework7/Post-Mortem.md` → must be 6 (unchanged)
     - `grep -c "pending — see Demo-Video-Plan" README.md` → must be 1 (unchanged)
  4. Grep `R0 RED 7/22 → R1 YELLOW 17/22 → R2 YELLOW 18/22` against CHANGELOG.md → must hit
  5. Grep `AUTHOR-FILL GATE` against PROCESS-LOG.md → must hit 4 times
- FPS 回归：N/A (no code change)
- benchmark 回归：N/A (no code change)
- prod build：optional sanity `npx vite build` still passes; `npm run submission:zip` still produces a zip (should be unaffected by markdown edits, but a smoke run validates the heredoc gates still fire)

## 7. 回滚锚点

- 当前 HEAD (R2 build): `d242719`
- 回滚锚点 (R1 baseline before this plan): `1f6ecc6`
- 一键回滚：`git reset --hard 1f6ecc6` (only if Implementer's docs edits accidentally clobber R1's existing CHANGELOG/PROCESS-LOG content or — worse — auto-fill the 4 PENDING items)

## 8. UNREPRODUCIBLE 标记

N/A — B2 R2 reproduced all 22 checklist items against the live build at `127.0.0.1:5173/` with `screenshots/B2/01-initial-load.png` and `02-game-loop.png` as evidence. The 4 PENDING items are observable as literal placeholder strings in the repo (verified by grep counts in §6.3), not flaky reproduction failures.
