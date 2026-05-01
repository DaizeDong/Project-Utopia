---
title: Project Utopia — Post-Mortem
date: 2026-05-01
build_commit: 3f87bf4
author: Daize Dong (dd1376)
status: skeleton — author to flesh out each section in the first person; do NOT regenerate prose with an LLM (TA will detect)
---

## Demo Video

Status: **pending** — see [Demo-Video-Plan.md](Demo-Video-Plan.md) for the recording plan and embed checklist.

When the recording is uploaded, replace this section with:

```
- URL: <https://...>
- Duration: <m:ss>
- Recorded against build commit: <sha>
```

…and mirror the same line at the top of `README.md` § "Demo Video & Post-Mortem".

---

## §1 Pillars Overview

<!-- AUTHOR: The two pillars below MUST match the wording you committed to in
     assignments/homework2/a2.md and assignments/homework2/Assignment 2_ Project Approval & Specs.md.
     Do NOT let an LLM rename them. A2 framed the project around (a) interpretable real-time
     crowd simulation with live map editing and (b) an LLM-driven AI layer with deterministic
     fallback. Use those exact framings — the names below are placeholders, not gospel. -->

### Pillar A — _\<copy exact pillar name from A2\>_

Guiding questions to answer in 4–8 sentences (first person, your own words):

1. What user-facing problem does this pillar solve, in the language of A2's "Problem & Opportunity" / user stories?
2. What is the technical mechanism that makes this pillar real in v0.10.1 — which systems / files? (Cite at least one path under `src/`.)
3. Which 2–3 commits are the load-bearing evidence that this pillar shipped? (Use `git log --oneline` to pull real shas.)
4. Where would a grader see this pillar in 30 seconds of play? (Tile placement? HUD readout? Inspector panel? Trace line?)

### Pillar B — _\<copy exact pillar name from A2\>_

Same four questions, applied to the second pillar.

> Cross-reference: `README.md` § "Highlights — Two Pillars" should carry the
> one-paragraph summary version of each pillar; this Post-Mortem is the long form.

---

## §2 Playtest Resolution

User-study findings from HW6 and how they were (or were not) addressed in HW7's
Final Polish Loop. Fill in the table from the tester notes you collected; one
row per substantive finding, even if Status is "WON'T FIX".

| User Study Finding | Action Item | Commit / File Evidence | Status |
|---|---|---|---|
| _e.g. "I can't tell when a worker is starving"_ | Added Critical-hunger group label + red HP tint | v0.8.7 Tier 3 — `src/ui/panels/InspectorPanel.js` | DONE |
| _\<finding 2\>_ | _\<action\>_ | _\<sha / path\>_ | DONE / PARTIAL / WON'T FIX |
| _\<finding 3\>_ | _\<action\>_ | _\<sha / path\>_ | _\<status\>_ |

<!-- AUTHOR: Source material for this table:
       - assignments/homework6/ (your HW6 user-study writeups)
       - assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md (round-by-round resolutions)
       - assignments/homework7/Final-Polish-Loop/Round0/Feedbacks/A4-polish-aesthetic.md
       - assignments/homework7/Final-Polish-Loop/Round0/Feedbacks/A6-ui-design.md
     If a finding had no resolution this cycle, still list it with status WON'T FIX or DEFERRED — do not silently drop it. -->

---

## §3 Technical Post-Mortem — Architectural Challenges

Pick the four challenges that actually consumed the most calendar time. The
prompts below are starting points; replace each with a 1-paragraph narrative
plus a line of evidence.

### 3.1 Worker AI: three rewrites in two months (v0.7 commitment latch → v0.9.0 utility scoring → v0.10.0 flat priority FSM)

Questions to answer:

- What was wrong with the v0.7 commitment latch + 3 intent pickers that motivated v0.9.0? (What bug or what design smell?)
- Why did v0.9.0's utility scoring + sticky-bonus hysteresis still feel wrong, given it passed tests?
- What did the v0.10.0 FSM rewrite actually buy you? (See the **−2530 LOC across 35 files** delta in CLAUDE.md.)
- What would you have done differently if you'd seen the FSM destination from v0.7?

Evidence anchors (real, in-tree):

- `docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md`
- `docs/superpowers/plans/2026-04-30-fsm-rewrite-retrospective.md`
- `docs/superpowers/plans/2026-04-29-job-layer-rewrite-retrospective.md`
- `CHANGELOG.md` § v0.10.0, v0.9.0

### 3.2 LLM proxy fault tolerance (timeouts, retries, fallback transparency)

- What broke in `server/ai-proxy.js` under a flaky network in HW3-era testing?
- Why was the fallback policy painful to keep parity with the live LLM path?
- What did the v0.8.7 Tier 4 retry work (`OPENAI_REQUEST_ATTEMPT_TIMEOUT_MS` /
  `OPENAI_MAX_RETRIES` / `OPENAI_RETRY_BASE_DELAY_MS`) actually fix?
- How do you know the runtime self-check (README § "AI Runtime Self-Check") is
  truthful and not just a HUD label?

### 3.3 Long-horizon benchmark stability (`MONOTONICITY_RATIO` 0.85 → 0.70)

- What was the original assumption behind requiring monotonic DevIndex growth?
- What real game behaviour (survival-over-peak, raid escalator) made that
  assumption wrong, and when did you discover that?
- Why is dropping the threshold the right call rather than fixing the test or
  fixing the game?

### 3.4 Production build freshness gate (`release:strict`)

- What stale-`dist` bug forced the freshness gate into existence?
- Why is local-build-as-authoritative the right submission model for this
  project rather than a hosted preview URL?
- What does `release-manifest.json` capture that a Vercel deploy log wouldn't?

<!-- AUTHOR: For each subsection, link 1–2 commits via `git log --grep` so the
     grader can verify the timeline. Do not simply repeat what CLAUDE.md says —
     CLAUDE.md is the summary, this section is the story behind it. -->

---

## §4 Technical Post-Mortem — Pivots & Cuts from A2 MVP

Questions to answer in your own voice:

1. **Survival mode vs the original "complete progression loop" cut.** A2 § MoSCoW
   listed "Complete progression loop" as Won't Have. v0.8.0 shipped survival mode
   with a DevIndex score. Does that effectively replace the cut victory loop,
   or is it a different game now?
2. **Wildlife / defense scope.** A2 said wildlife / animals were a "Could Have" /
   "expanded visitor and animal behaviors". v0.8.5+ shipped predators, raiders,
   saboteurs, walls, gates, and a raid escalator. Was this scope creep, or did
   it become structurally necessary once survival mode existed?
3. **Multi-LLM persona / multiple AI agents.** A2 § AI Integration Strategy
   described an LLM Director plus an NPC Policy decision path. Did you ever
   plan multiple personas (e.g. one LLM per faction) and cut it? If yes, why?

Be honest. "I planned X, started X, hit Y problem, cut X, shipped Z instead"
is the structure of a real post-mortem.

### §4.5 Hard-Freeze Deferrals — Audio & Worker Walk Cycle

HW7 ran under a hard freeze (no new tile / role / building / mechanic /
audio asset / UI panel). Two reviewer-flagged polish gaps fall outside
what the freeze allows; both are deferred to post-HW7 work, not silently
skipped:

- **Audio bus + SFX (V3 = 0/10).** A4 (Final-Polish-Loop Round 0/1)
  correctly observes that no `<audio>` elements, no Web Audio nodes, and
  no audio assets ship in v0.10.1. Adding even one ambient loop or one
  UI stinger would require a new asset import (`assets/audio/*`) which
  HW7 §"七条硬约束 §5" forbids. Future-cut item: introduce
  `src/audio/AudioBus.js` with master/music/sfx volume sliders alongside
  the first audio asset; budget ≈ 4 hours including freesound asset
  licensing review.
- **Worker walk cycle (V4 = 3/10).** Workers currently translate via
  a continuous lerp on `entity.x` / `entity.z` with no sprite / skeletal
  animation between FSM ticks. A genuine walk cycle requires a new
  rigged mesh asset or a 2-frame sprite atlas — both are new asset
  imports. The R1 plan ships a deterministic per-entity stack offset
  (Step 5 of `Round1/Plans/A4-polish-aesthetic.md`) that breaks the
  "stack of tiny goblins" silhouette but does NOT animate motion.
  Future-cut item: ship a 4-frame walk sprite + a phase-locked
  ground-bob (sin(t) on y) when entity speed > 0.

Both items are paid down here in writing so future polish loops do not
treat them as oversight: they are scoped, sized, and parked.

---

## §5 AI Tool Evaluation

<!-- AUTHOR: This section is the one TA reviewers explicitly flagged as
     anti-LLM-polish (Final-Polish-Loop §1.5). It must be in YOUR voice, with
     specific commits and specific files. If this section reads like a generic
     "I used Claude for refactors and it was helpful" essay, the grader will
     correctly conclude an LLM wrote it. Concrete failure stories are MORE
     valuable than concrete success stories here.

     Required elements:
       - At least 2 named commits or file paths where AI assistance helped.
       - At least 1 named commit / decision where AI assistance HURT — wrote
         a regression you had to revert, suggested an architecture you later
         tore out (the v0.7→v0.9→v0.10 worker rewrite saga is the canonical
         in-repo example), produced over-engineered tests, etc.
       - At least 1 sentence on prompt strategy: how did you keep an LLM
         on-task across a multi-week refactor? (CLAUDE.md is part of that
         answer; so are the `docs/superpowers/plans/` plan files.)
       - At least 1 sentence on what you would NOT use an LLM for next time. -->

Suggested narrative spine (replace bullets with paragraphs):

- **Where it worked**: e.g. CLAUDE.md as a context anchor across long sessions;
  the `docs/superpowers/plans/` write-then-execute pattern; HW7
  Final-Polish-Loop's reviewer-architect-implementer separation.
- **Where it hurt**: e.g. the v0.9.0 utility-scoring layer that survived its
  own tests but oscillated in play, then had to be deleted wholesale in
  v0.10.0; cite the −2530 LOC retrospective.
- **Prompt strategy**: how you used CLAUDE.md, frozen project conventions, and
  the multi-stage plan/feedback/implement/validate loop to constrain LLM
  output.
- **What you would not use an LLM for**: e.g. balance tuning by feel,
  user-study synthesis, architectural commitments without a written plan.

---

## References

- `CLAUDE.md` — project conventions, version timeline, and current state summary
- `CHANGELOG.md` — per-version detail of every shipped change
- `assignments/homework2/a2.md` — original PRD, MoSCoW, MVP definition
- `assignments/homework6/` — user-study notes feeding §2
- `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` — Round-by-round
  reviewer / planner / implementer / validator log for HW7
- `docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md` and the
  matching retrospective — primary evidence for §3.1
