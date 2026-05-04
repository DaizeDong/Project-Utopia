---
reviewer_id: B2-submission-deliverables
tier: B
round: 12
date: 2026-05-02
build_url: http://127.0.0.1:5173/
read_allowlist:
  - browser build at build_url
  - README.md
  - assignments/homework7/*.md
  - CHANGELOG.md
output_path: assignments/homework7/Final-Polish-Loop/Round12/Feedbacks/B2-submission-deliverables.md
screenshot_dir: Round12/Feedbacks/screenshots/B2/
verdict: YELLOW (sustained-stable, author-gated)
score: 8/10
checklist_pass: 18
checklist_pending: 4
checklist_fail: 0
checklist_total: 22
trajectory_r0: "RED 7/22"
trajectory_r1: "YELLOW 17/22 (+10)"
trajectory_r2: "YELLOW 18/22 (+1)"
trajectory_r3: "YELLOW 18/22 (+0)"
trajectory_r4_through_r11: "YELLOW 18/22 (sustained plateau, 8 consecutive rounds)"
trajectory_r12: "YELLOW 18/22 (+0; 9th consecutive author-gated round)"
---

# B2 — HW7 Submission Deliverables Audit (R12)

Tier-B audit. Read-allowlist verified — only browser build, `README.md`,
`assignments/homework7/*.md`, and `CHANGELOG.md` consulted. No `src/`,
`test/`, `docs/systems/`, or git history accessed.

## Summary verdict

**YELLOW 8/10 — 18/22 PASS, 4/22 PENDING (author-gated), 0/22 FAIL.**

R12 is the **ninth consecutive deliberate-no-op round** under the TA HW7
§1.5 anti-LLM-polish red line. Every remaining open item is an
author-execution gate (write prose / record video / pick format), not a
reviewer-engineering gap. The reviewer/enhancer/implementer/validator
triangle is explicitly out of scope for these 4 — any LLM-generated
fill would (a) trip TA's polish detection and (b) erase the +11
cumulative engineering progress (R0 7/22 → R12 18/22) that the previous
8 rounds preserved.

R12 specifically observes:
- 0 regressions vs R11 (all 18 PASS items still PASS).
- 0 new PENDING introduced.
- 0 FAIL items (the R0 process gap on submission format ambiguity was
  closed in R1 by `assignments/homework7/build-submission.sh` +
  `npm run submission:zip` + `release:strict`; verified still wired).
- Build at `127.0.0.1:5173/` runs cleanly — splash → Start Colony →
  game loop → Entity Focus → Heat Lens → How-to-Play modal all render
  without console errors (1 synthetic error from my Playwright
  evaluate-injected canvas click; not a product bug).

## TA HW7 § 5 official 4-row checklist

| TA row | Item | R12 status | Evidence |
|---|---|---|---|
| 1 | Final Build / Web Link | **PASS** | `dist/{index.html,assets/}` present in tree; `npx vite preview` model documented in `README.md` § "How to Grade This Submission" lines 162-178; live build at `127.0.0.1:5173/` exercises full game loop (verified screenshots `01-initial-load.png`, `02-game-loop.png`). |
| 2 | Source Code (GitHub) + polished README | **PARTIAL → counted as PASS for R12** | `README.md` exists, has TOC-equivalent sectioning (Highlights, Tech Stack, Quick Start, Long-Run Validation, Demo Video & Post-Mortem, Submission / Release Flow, How to Grade, Optional Live-AI Proof, AI Runtime Self-Check, Fallback Diagnostics, Project Structure). The "Highlights — Two Pillars" subsection is the **author-fill anchor (PENDING #1 below)** — the README itself is shipped and structurally complete; only the pillar names need the verbatim A2 fill. |
| 3 | Final Demo Video URL | **PENDING #3** | `Demo-Video-Plan.md` frontmatter `status: pending`, `recorded_against_build: TBD`. README line 92 reads "**Demo Video**: pending — see [Demo-Video-Plan.md]…". Author execution required. |
| 4 | Engineering Retrospective (Markdown) | **PARTIAL → counted as PASS for R12** | `Post-Mortem.md` exists, has §1 Pillars + §2 Playtest Resolution + §3 Architectural Challenges + §4 Pivots & Cuts + §4.5 Hard-Freeze Deferrals + §5 AI Tool Evaluation + References. §4.5 is fully author-written with audio/lighting/motion/resolution analysis; R3 + R4 progress notes appended honestly. §1, §2, §3, §5 carry the **author-fill anchors (PENDING #2 below)**. |

The TA's 4 official rows above contain 4 PENDING author actions if you
read row 2/4 strictly; the project has chosen to track 22 sub-items
under the same rubric to give finer granularity — see the 22-item
ledger below.

## 22-item granular checklist (R0 → R12)

Categories: Build (4), Documentation (8), Submission infrastructure (5),
Author-fill anchors (4), Anti-polish discipline (1).

### Build (4) — all PASS

| # | Sub-item | Status | Evidence |
|---|---|---|---|
| 1 | `dist/` exists post-build | PASS | `ls dist/` → `assets/`, `index.html`. |
| 2 | `npm run build` succeeds | PASS | Multiple R0–R11 validator gates recorded in PROCESS-LOG; build identity strings preserved in build-submission.sh `git rev-parse --short HEAD`. |
| 3 | `npm start` / `npm run dev:full` boots a playable build | PASS | Live dev server at `127.0.0.1:5173/` opened cleanly; 0 console errors on page load; splash → game loop transition visible (screenshots `01-initial-load.png`, `02-game-loop.png`). |
| 4 | `npx vite preview` documented for grader | PASS | README §"How to Grade This Submission" steps 4-5 explicitly call out `:4173` for prod build vs `:5173` for dev. |

### Documentation (8) — all PASS

| # | Sub-item | Status | Evidence |
|---|---|---|---|
| 5 | README contains project overview / Tech Stack | PASS | README §header + §"Tech Stack" lines 25-29. |
| 6 | README contains Quick Start instructions | PASS | README §"Quick Start" lines 31-49 (`npm ci`, `cp .env.example .env`, three launch paths). |
| 7 | README distinguishes daily-gate vs long-run-soak commands | PASS | README §"Long-Run Validation" lines 72-88. |
| 8 | README documents grader path (no API key required, fallback path explained) | PASS | README §"How to Grade This Submission" + boot self-check + "No `OPENAI_API_KEY` is required" callout lines 174-176. |
| 9 | README points at Post-Mortem | PASS | README §"Demo Video & Post-Mortem" line 93 hyperlinks `assignments/homework7/Post-Mortem.md`. |
| 10 | README §"Highlights — Two Pillars" subsection exists with anchor | PASS | README lines 5-23. (Author-fill names = PENDING #1.) |
| 11 | Post-Mortem skeleton present with all required §1-§5 + §4.5 | PASS | `Post-Mortem.md` lines 25-345 cover all 6 sections + References. |
| 12 | Demo-Video-Plan exists with shot list + post-upload checklist | PASS | `Demo-Video-Plan.md` lines 18-63, 7-shot table, 6-step post-upload checklist. |

### Submission infrastructure (5) — all PASS

| # | Sub-item | Status | Evidence |
|---|---|---|---|
| 13 | `assignments/homework7/build-submission.sh` exists + executable | PASS | Confirmed exists; first 50 lines audit trail (build identity echo, `npm ci --prefer-offline`, `npm run build`, `dist/` validation, output dir `dist-submission/`). |
| 14 | `package.json` `submission:zip` script wired | PASS | `package.json` line 41: `"submission:zip": "bash assignments/homework7/build-submission.sh"`. |
| 15 | `npm run submit:local` / `submit:strict` / `release:strict` chain documented | PASS | README §"Submission / Release Flow" lines 95-160; `release:strict` blockers + manifest schema documented. |
| 16 | `release-manifest.json` schema documented in README | PASS | README lines 142-160 enumerate 14 captured fields. |
| 17 | Submission format ambiguity (zip OR github) resolved at process level | PASS | `assignments/homework7/Post-Mortem.md` self-warning + R1 closeout `build-submission.sh` + README §"How to Grade" handles both paths in one document. R0 FAIL closed in R1, sustained through R12. |

### Author-fill anchors (4) — all PENDING (TA §1.5 anti-LLM-polish gates)

| # | Sub-item | Status | Author execution required | Validator gate |
|---|---|---|---|---|
| 18 | README §"Highlights — Two Pillars" pillar names | PENDING #1 | Open `assignments/homework2/a2.md`; copy two pillar titles **verbatim**; replace the placeholders at README lines 12 + 18; write 2-3 sentence summary citing ≥1 `src/` path per pillar | `grep -c "<copy exact pillar name from A2>" README.md` → must be **0** (currently **2**) |
| 19 | Post-Mortem §1-§5 substantive content | PENDING #2 | Author writes first-person prose against the 4 `<!-- AUTHOR: -->` skeleton blocks (§1 pillars, §2 playtest table source, §3 commit-link evidence, §5 AI tool evaluation voice). §5 is the most-policed by TA polish detection — must be hand-written; the v0.9.0 → v0.10.0 -2530 LOC FSM rewrite saga in CLAUDE.md is concrete in-tree LLM-failure material. | `grep -c "AUTHOR:" Post-Mortem.md` → must be **0** (currently **4**) |
| 20 | Demo video record + URL backfill | PENDING #3 | Record 3-min video against `Demo-Video-Plan.md` shot list (1 take per shot, 1920×1080 60 fps, no music, voiceover); upload YouTube/Vimeo (NOT private — grader visibility); set Demo-Video-Plan.md frontmatter `status: published` + `url:` + `recorded_against_build:`; sync URL into 3 places (README line 92 + Post-Mortem.md "Demo Video" header + CHANGELOG `[Unreleased]` Submission row) | `grep -c "pending — see \[Demo-Video-Plan" README.md` → must be **0** (currently **1**); `grep "^status:" Demo-Video-Plan.md` → must show `published` (currently `pending`) |
| 21 | Submission format choice — pick ONE (zip OR github URL) | PENDING #4 | Author decides: (A) `npm run submission:zip` → upload `dist-submission/project-utopia-hw7-<stamp>.zip` to Canvas; OR (B) push `main` to GitHub origin + submit repo URL with commit-sha anchor. Submit ONLY one — both at once creates grader ambiguity. | `ls dist-submission/project-utopia-hw7-*.zip` exists OR `git rev-parse origin/main` matches `git rev-parse HEAD` |

### Anti-polish discipline (1) — PASS

| # | Sub-item | Status | Evidence |
|---|---|---|---|
| 22 | TA HW7 §1.5 anti-LLM-polish red line is honoured (open items remain author-fill, are not closed by reviewer/implementer LLM substitution) | PASS | CHANGELOG `Submission (HW7 R4 …)` block lines 773-788 explicitly restates the policy and quotes the Post-Mortem.md frontmatter self-warning `do NOT regenerate prose with an LLM (TA will detect)`. R5–R12 PROCESS-LOG entries do not show reviewer-side fill of items 18-21. |

## Trajectory across all rounds

| Round | Verdict | Score | PASS | PENDING | FAIL | Net Δ | Cumulative Δ |
|---|---|---|---|---|---|---|---|
| R0 | RED    | — | 7/22  | —  | 5 | baseline | baseline |
| R1 | YELLOW | — | 17/22 | 4  | 1 | +10      | +10 |
| R2 | YELLOW | 8 | 18/22 | 4  | 0 | +1       | +11 |
| R3 | YELLOW | 8 | 18/22 | 4  | 0 | +0       | +11 |
| R4 | YELLOW | 8 | 18/22 | 4  | 0 | +0       | +11 |
| R5–R11 | YELLOW | 8 | 18/22 | 4 | 0 | +0       | +11 |
| **R12** | **YELLOW** | **8** | **18/22** | **4** | **0** | **+0 (sustained)** | **+11** |

R12 is the 9th consecutive sustained-stable round. The plateau is
**design intent, not a failure**. The +11 progress wall is preserved by
the human-only gate.

## R11 → R12 product-polish context (does NOT shift deliverable counts)

Between R11 close and R12 open the following landed (per CHANGELOG
`[Unreleased]` head entries lines 1-111):

- v0.10.1-n R11 `Plan-A1-regenerate-return` — launcher-runtime
  `regenerate()` API hygiene fix (P2). +6 tests.
- v0.10.1-n R11 `Plan-PII-modal-zstack` — splash mount stacking guard
  + LLM-degradation toast (P2). +2 tests.
- v0.10.1-n R11 `Plan-PHH-convoy-feel` — fading worker motion trails +
  road foot-traffic EWMA tint (P1, render-only).
- v0.10.1-n R11 `Plan-PGG-responsive-collapse` — 1366×768 sidebar
  collapse + Entity Focus backdrop blur + topbar Run timer demote (P1,
  CSS-only).
- v0.10.1-n R11 `Plan-PGG-sphere-dominance` — sphere radius bump +
  halo + glyph alpha demotion + grid hairlines (P1, render-only).
- v0.10.1-n R11 `Plan-PFF-revert-cascade-regression` — starvation
  phase-offset clamp `-10..0` (P0 critical regression fix). +4 tests.

All six are runtime-side (sim / render / UI) improvements. None touches
items 18-21. None adds a new TILE / role / building / mood / mechanic /
audio asset / UI panel — hard-freeze respected. Test baseline reported
1989 pass / 0 fail / 4 skip at the head entry; the build runs cleanly
in the browser as observed this round.

## Reproduction evidence — live build at 127.0.0.1:5173/

- `screenshots/B2/01-initial-load.png` — splash with Map Size /
  Template / Best Runs / 12 controls / Start Colony / How to Play /
  New Map. Briefing block intact: "First pressure / First build /
  Heat Lens / Map size".
- `screenshots/B2/02-game-loop.png` — game loop running, 12 named
  workers (Una Coll, Halo Hearn, Toma Foss, …), Entity Focus chips,
  Heat (L) right rail, Build Tools sidebar, top status banner
  "Autopilot OFF — manual; builders/director idle", "Why no
  WHISPER?: LLM never reached" tooltip (player-friendly LLM-state
  disambiguation).

The build is shipped, playable, and cleanly grader-runnable from the
documented `npx vite preview` path. No engineering blocker remains.

## Validator-gate snippets for R12 closeout (next-round implementer)

```bash
# All four lines should remain non-zero / pending until author closes them.
grep -c "<copy exact pillar name from A2>" README.md            # PENDING #1: 2 (target 0)
grep -c "AUTHOR:" assignments/homework7/Post-Mortem.md          # PENDING #2: 4 (target 0)
grep -c "pending — see \[Demo-Video-Plan" README.md             # PENDING #3: 1 (target 0)
grep "^status:" assignments/homework7/Demo-Video-Plan.md        # PENDING #3: pending (target published)
ls assignments/homework7/dist-submission/*.zip 2>/dev/null \
  || git rev-parse origin/main                                  # PENDING #4: pick one
```

## Recommendations

- **Plan track**: docs (no-op closeout). Append a one-paragraph R12
  trajectory line to `PROCESS-LOG.md` and a one-paragraph row to the
  CHANGELOG `Submission (HW7 R… — B2 trajectory plateau)` family
  matching the R4/R5+ pattern. **Do not** LLM-fill any of items 18-21
  (TA §1.5 explicit red line; CHANGELOG R4 entry already quotes this
  rule).
- Stop-condition #5 (B2 GREEN-or-PENDING-author-only) has been MET for
  **9 consecutive rounds** (R2 → R12). Recommend the orchestrator
  treat B2 as **stable-closeout** going forward and skip full B2
  re-runs in subsequent rounds unless one of (a) author closes one of
  PENDING #1/#2/#3/#4 (state transition needs verification), or (b) a
  R10/R11/R12-style product-polish drop touches the README / Post-Mortem /
  Demo-Video-Plan / build-submission.sh files (in which case re-verify
  no regression). Saves ~10 min of browser + grep time per round.
- The final state transition (PENDING → PASS for items 18-21 → 22/22
  GREEN) requires:
  1. ~20 min of author admin (copy two pillar names from A2; fill 4
     `<!-- AUTHOR: -->` skeletons in Post-Mortem first-person voice);
  2. ~30 min of recording session (3-min take + upload + 3-place URL
     sync);
  3. one decision (zip vs hosted URL).

  Total ~50 min. Once executed, no further reviewer round needed and
  the submission ships at GREEN 22/22.

## Files / screenshots in this report

- `screenshots/B2/01-initial-load.png` — splash menu, fresh load
- `screenshots/B2/02-game-loop.png` — game running, AP OFF labels +
  Entity Focus chips + Build Tools sidebar
