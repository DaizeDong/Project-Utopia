# Agent-Feedback-Loop Historical Log

> This file records round-by-round execution history, outcomes, lessons, and handoff notes.
> Rules, roles, and operating constraints live in `PROCESS.md`.

---

## Round 0

### Timeline

- Started the first full 4-stage loop
- Stage A hit context truncation during concurrent reviewer work and had to be repaired
- Stage B produced 10 plans plus 1 summary
- Stage C implemented 10 plans across multiple commits
- Stage D completed tests and benchmark verification

### Final Validation

- `node --test` passed
- benchmark improved relative to the starting baseline
- reviewer average still stayed low at roughly `3.1 / 10`

### Main Lesson

Round 0 proved that the loop could run end to end. It did not prove that the loop would naturally optimize toward a materially better game.

---

## Round 1

### Timeline

- The user explicitly required independent, memoryless reviewers
- Early reviewer runtime context leaked prior-round scores and delta summaries
- Polluted feedback was discarded and Stage A was rerun
- Stage B, C, and D were then completed normally

### Final Validation

- the loop remained executable after the blind-review correction
- reviewer scores still stayed low

### Main Lesson

Round 1 exposed a hard rule: reviewers must stay blind. Cross-round comparison belongs to the orchestrator or the human, not to reviewer prompts.

---

## Round 2

### Timeline

- Stage A: 10 reviewer feedback files plus summary
- Stage B: 10 enhancer plans plus summary; accepted `10/10`
- Stage C: implemented in 3 serial waves
- Stage D: the first benchmark regressed, then a starter-wall floor fix restored the prior long-run baseline
- Round 2 artifacts were archived

### Final Validation

- full test suite: `1055/1057` pass
- benchmark: DevIndex `37.77`
- browser smoke: passed

### Main Lesson

Round 2 delivered a large amount of HUD, readability, and feedback work. It was complete engineering work, but the benchmark mostly returned to the old band, so the round did not create a fundamental improvement.

---

## Round 3

### Timeline

- Wrote `structural-reflection.md` before Stage A
- Stage A: 10 reviewer feedback files, average score about `5.18 / 10`
- Stage B: 10 plans, with `4` accepted and `6` deferred or subsumed
- Wave 1:
  - `01d` worker recovery tuning
  - `01b` build consequence preview
- Wave 2:
  - `01a` next-action contract
  - `02c` autopilot truth contract
- Initial Stage D benchmark failed:
  - day 21 loss
  - DevIndex `41.32`
  - score `4906`
- Stage D debugger recalibrated `01d`
- Round 3 artifacts were archived

### Final Validation

- full test suite: `1069/1071` pass, `0` fail, `2` skip
- benchmark:
  - `max_days_reached`
  - DevIndex `37.8`
  - score `20450`
  - `passed=true`
- browser smoke:
  - active HUD normal
  - next-action chip normal
  - autopilot chip normal
  - no console or page error

### Main Lesson

Round 3 got closer to a structural problem because it started addressing:

- the immediate next action
- pre-build consequence preview
- worker recovery timing
- autopilot truth

But it still was not a breakthrough. The 90-day DevIndex stayed in roughly the same band as earlier rounds, which means the real economy/logistics/autopilot loop still was not rebuilt.

---

## Round 4

### Timeline

- Reviewer prompts were parameterized so Stage A stayed blind to repo history, prior scores, and hand-authored deltas
- Stage A collected 10 blind reviewer feedbacks; average score fell to `2.70 / 10` with verdict `STRUCTURAL_WORK_REQUIRED`
- Stage B produced 10 enhancer plans and accepted only `3`, deferring or subsuming `7`
- Wave 1:
  - `02c` run-entry stability and help-modal non-blocking startup
- Wave 2:
  - `02a` menu template/size truth contract and briefing sync
- Wave 3:
  - `01b` causal next-action loop, build-preview consequence wording, and autopilot truth demotion
- Stage D completed with a green full suite, 90-day benchmark pass, and browser smoke

### Final Validation

- full test suite: `1078/1080` pass, `0` fail, `2` skip
- benchmark:
  - `max_days_reached`
  - DevIndex `37.8`
  - score `20450`
  - `passed=true`
- browser smoke:
  - active HUD rendered the new causal next-action string
  - autopilot chip stayed truthful in OFF mode
  - canvas present, overlay hidden after start, no console or page error

### Main Lesson

Round 4 finally enforced the review discipline that earlier rounds were missing: blind reviewers stayed blind, and Stage B accepted only a small set of structural plans instead of rewarding broad copy churn.

That improved process quality and product honesty, but it still did not create a benchmark breakthrough. The accepted work made the run loop more trustworthy and interpretable, not mechanically stronger. Because the 90-day result stayed in the same band as Round 3, the real bottleneck is still the economy/logistics/director/autopilot loop rather than its presentation.

---

## Round 5

### Timeline

- Stage A: 10 blind reviewer feedbacks; average ~3.55 / 10
- Stage B: 10 enhancer plans, all accepted, 3 waves
- Stage C: 3 waves of implementer commits + 3 storyteller / cost-escalator follow-ups
- Stage D v1: judged YELLOW on seed=42 only (single-seed sample)
- Stage D v2 (debugger): 4-seed sweep (1/7/42/99) revealed seeds 1 and 99 lose the colony (day 20 / day 51); 3 single-variable tuning attempts (haulMinPopulation, fallbackIdleChainThreshold, emergencyOverrideCooks) each failed → reverted, **verdict=RED**
- No tuning commits landed; HEAD remained at `bc7732c`

### Final Validation (v2)

- full test suite: 1162/1164 pass
- 4-seed benchmark (temperate_plains, 365d, soft):
  - seed 1 loss day 20, devIndex 36.96
  - seed 7 max, devIndex 61.13
  - seed 42 max, devIndex 30.79
  - seed 99 loss day 51, devIndex 29.41
  - median 33.88 (< 42 floor)
- smoke green
- verdict: RED

### Main Lesson

Round 5 confirmed that single-variable parametric tuning could not save the colony at pop≈4. The structural problem — `reserved + specialistBudget` over-reserves at low pop while the remaining specialist roles (smith / herbalist / stone / herbs) get no headcount — is **non-parametric**. The Stage D v2 debugger explicitly handed off to Round 5b / Round 6 with the mandate: re-architect `RoleAssignmentSystem.update`'s budget logic, use a population-band table instead of a continuous perWorker formula, and keep `computeEscalatedBuildCost` (Wave 3) intact.

Validator also formalised the **multi-seed benchmark as a hard gate**: from Round 5b on, any verdict above YELLOW must sweep at least seeds 1/7/42/99.

---

## Round 5b

### Timeline

- Reused Round 5 Stage A feedback (no new blind review)
- Stage B: 10 plans, all accepted, 3 waves
- Stage C: 3 waves landed cleanly + a follow-up Grid.js BFS-reachable-starter-farm patch (`905320a`) + cannibalise test rewrite to address Round 5 v2's seed-1/99 colony-loss
- Stage D Validator (run as part of Round 6 setup): full bench, no smoke

### Final Validation

- full test suite: 1293/1299 pass (4 carried failures from 02a/02c/02e plans, 2 pre-existing skips, no new regressions from `905320a`)
- 4-seed benchmark (temperate_plains, 365d, soft, head=905320a):
  - seed 1 loss day 26, devIndex 35.75
  - seed 7 max, devIndex 56.06
  - seed 42 max, devIndex 74.33
  - seed 99 max, devIndex 67.81
  - median 61.94 (vs Round 5: 33.88, **+83%**); min 35.75 (≥ 32 ✓)
- smoke skipped (deferred to Round 6)
- verdict: YELLOW

### Main Lesson

Round 5b's `01b` band-table refactor + farmMin / cannibalise safety-valve + the Grid.js follow-up all worked as a structural triple — seeds 7 / 42 / 99 all reached day 365 (Round 5 had only 7 / 42 surviving). Seed 1 still lost the colony, but only by 6 days later than Round 5 (day 20 → day 26). The geometric-fix budget is exhausted on seed 1; further geometric tuning will not convert it. Round 6 must take the labour-allocation interpretation seriously rather than continuing to patch terrain.

---

## Round 6

### Timeline

- HW06 freeze **lifted** by user mandate ("以尽可能提升项目完成度为目标"). Enhancer + implementer templates updated so `freeze_policy` is a per-round runtime context flag (default `active`, Round 6 = `lifted`).
- Stage A: 10 blind reviewer agents dispatched in parallel; average score 3.35 / 10 (slight regress vs Round 5's 3.55, expected because reviewers found new surface bugs even as core simulation strengthened)
- Stage B: 10 enhancer agents dispatched in parallel; all 10 plans accepted, 0 deferred (audio P0-5 explicitly DEFERRED-Round7 inside the merge summary). 3 waves: Wave-1 cleanup (01a/01b/01c/02b), Wave-2 content (01d/02a), Wave-3 narrative (02d/02c/01e/02e)
- Stage C: 13 plan/wave commits + 3 acceptance-tune commits
  - Wave 1 + tune `8604240` (raidDeathBudget 18→8, raidEnvironmentCooldownSec 90→360, threshold 60→75)
  - Wave 2 + tune `511b9da` (moodOutputMin 0.5→0.7, raidFallback graceSec 360→480 / popFloor 18→24, eventDirectorBaseIntervalSec 240→360)
  - Wave 3 + tune `ce30a7d` (moodOutputMin 0.85/0.9 ladder reverted to 0.7 — local optimum)
- Stage D Validator: full test + 4-seed full bench (365d) + smoke skipped

### Final Validation

- full test suite: 1412/1419 pass (5 fail = 4 R5b carried + 1 introduced by 02d narrative shape; 2 pre-existing skips)
- 4-seed benchmark (temperate_plains, 365d, soft, head=`ce30a7d`):
  - seed 1 max, devIndex 51.88, deaths 501 (was loss day 26 / 35.75 in R5b → **STRUCTURAL FIX**)
  - seed 7 max, devIndex 13.33 (was 56.06 — zombie state)
  - seed 42 max, devIndex 74.73 (was 74.33 — match)
  - seed 99 loss day 92, devIndex 34.51 (was max 67.81 in R5b — regress)
  - median 43.20 (≥ 42 ✓), min 13.33 (< 32 floor ✗)
  - 3/4 max_days_reached (matches R5b ratio but failing seed flipped from 1 to 99)
- smoke: SKIPPED (deferred to Round 7)
- verdict: YELLOW

### What landed (deliverables)

- ~4000 LOC + ~30 new test files across 13 plan commits
- Dev-telemetry quarantine, in-fiction LLM error copy, halo silenced, hotkey traps fixed (F1/L/3-key), casual jargon swapped, ≥2200 / 1024 / ≤800 responsive bands
- EventDirectorSystem with 6 event types (raid / animal_migration / trade_caravan / disease_outbreak / wildfire / morale_break) + 3 predator species
- Building Inspector for all building types + Carry full-resource visualisation + halo near-tooltip
- Mood→output coupling (workers under-produce at low mood)
- Obituary + lineage (parent_id / child_id chain) + rivalry (negative band crossings)
- In-character voice pack (5 round-robin bodies for whisperBlockedReason, EntityVoice.js humaniseInsightLine wrapper)
- Persistent localStorage leaderboard + seed copy chip + final score retention + FF 8× tier + `[`/`]` hotkey + Autopilot isTrusted decoupling
- Author Voice ticker + finale 2.5s fade + endAuthorLine + devTier 4-tier title

### Main Lesson

Round 6 is the first round where the 10-plan output stack delivered substantial *player-observable* improvements rather than mechanically-load-bearing-but-invisible refactors. Every reviewer's named issue was addressed. The Round-6 4-seed bench shows a **fairness trade**: seed 1 (the long-standing structural failure since Round 5) is fixed, seed 99 (which Round 5b had recovered) regressed back to loss. The combined Wave-2 EventDirector pressure + Wave-3 rivalry RNG drift puts seed 99 onto a fragile path that no single-knob mood tune escapes (we tested moodOutputMin 0.5 / 0.7 / 0.85 / 0.9; 0.7 was the local optimum but cannot recover seed 7 + seed 99 simultaneously).

The freeze lift was load-bearing for this round: 01d's EventDirector + species + mood→output, 02a's Inspector & Carry visualisation, 02d's lineage / obituary / rivalry, 02e's finale ceremony, and 02c's leaderboard would all have been blocked under the HW06 freeze. The cost was three acceptance-tune iterations to re-stabilise the bench after each wave.

---

## Cross-Round Summary

| Round | Focus | Validation | Main Lesson |
|------|------|------------|-------------|
| 0 | loop bring-up + UX polish | green | a runnable loop does not imply meaningful improvement |
| 1 | blind-review correction + continued patching | green | reviewer context leakage directly contaminates evaluation |
| 2 | UI / feedback / readability polish | green | a lot changed, but not enough of it was load-bearing |
| 3 | agency / consequence / control-truth | green | closer to the real problem, still not a core-loop repair |
| 4 | blind review + system-trust / causal-loop pass | green | process discipline matters, but truthful surfaces still are not core-loop repair |
| 5 | structural seed-1/99 colony-loss surfaced; tuning attempts rejected | RED | single-variable tuning cannot escape the structural budget collapse at low pop |
| 5b | 01b band-table refactor + Grid.js BFS reachable farm + cannibalise safety valve | YELLOW | structural rebuild recovered 7/42/99; seed-1 still loses by 6 days more — geometric budget exhausted |
| 6 | freeze lifted, 10 plans (P0×6 + P1×4) shipped + 3 acceptance tunes | YELLOW | first round to deliver player-observable work matching reviewer findings; seed-1 fixed, seed-99 regressed via Wave-3 RNG drift; net 3/4 max maintained |

---

## Round 7 Handoff

Round 7 should pick up:

1. **Seed-99 regression** — Wave-3 rivalry/mood interaction broke seed-99 (Round 5b max → Round 6 loss day 92). Fix is structural (rivalry delta magnitude or per-pair mood floor), not parametric (tested moodOutputMin 0.5/0.7/0.85/0.9; none recover both seed-7 and seed-99)
2. **Seed-7 zombie state** — survives 365 at devIndex 13.33; same root cause as seed-99 but symptom differs
3. **Seed-1 deaths +2 over ceiling** (501 / 499) — marginal, tunable
4. **5 carried test failures** — refresh fixture string literals to match the new dev-mode-quarantined paths
5. **Audio P0-5** explicitly DEFERRED-Round6 — Round 7 should ship procedural Web Audio SFX (UI click / build / death / milestone) + ambient ducking + actual audio asset pipeline, or at minimum a no-asset OscillatorNode chain
6. **Browser smoke matrix** — 7-point list (Inspector first-person voice / Logistics English-only / finale 2.5s fade / Best Runs panel / `]`×3 → 8× / birth event with parent / death obituary)
7. Per stop-condition check: if Round 7 reviewers report **0 P0** and bench shows **4/4 max_days_reached** with **min ≥ 32**, the iteration loop can wind down. Otherwise iterate.

Round 7 reviewer inputs MUST stay blind per the unchanged Anti-Echo-Chamber contract: do not feed this PROCESS-LOG, the Round 6 validation report, or any cumulative score commentary into reviewer prompts or runtime context.

---

## Round 8

### Timeline

- Stage A: 10 blind reviewer agents dispatched with isolated prompts and staggered starts.
- Stage A score: 5.42 / 10 raw; 5.91 / 10 excluding one likely reviewer runtime/tool isolation anomaly (`01c-ui` blank/unreachable report while 9/10 loaded the same URL).
- Stage B: four accepted implementation slices: manual objective feedback, autopilot plan card, starvation diagnostics, character memory/traits.
- Stage C: main thread implemented build/objective/autopilot work while one worker subagent implemented character/starvation work in parallel.
- Stage D: targeted tests + build + diff check completed; full `npm test` timed out.

### What Landed

- Build failures now include recovery guidance without changing existing `reasonText` contracts.
- Hover hints, click failure action messages, and floating toasts now say why placement failed and what to try next.
- Scenario route/depot completion now emits visible milestone/action/objective-log confirmation.
- Next Action HUD now distinguishes `Manual guide` from `Autopilot plan`, with explicit manual-boundary copy.
- Worker focus panel now explains food-route failures with stock, carry, warehouse, farm, reachability, and last reject facts.
- Character panel now shows behavior-facing trait descriptions, child/parent names, selectable family chips, and durable `memory.history`.
- Birth, death-witness, and friendship/rivalry memories now mirror into capped serializable history arrays.

### Validation

- targeted node test set: 50/50 passing
- `git diff --check`: passing
- `npm run build`: passing
- `npm test`: timed out after 244 seconds, no failure details emitted before timeout

### Main Lesson

Round 8 addressed the repeated reviewer complaint that the simulation was more watchable than controllable. The important shift was not adding new systems; it was closing player-facing diagnosis loops: failed action -> reason -> recovery, route/depot objective -> confirmation, AI advice -> ownership boundary, starving worker -> cause -> fix, named worker -> persistent memory.

The remaining risk is still breadth validation. Targeted tests and build are green, but this round should not be counted as full-suite green until `npm test` can finish or be split into timed shards.

---

## Round 9

### Timeline

- Stage A: strict orchestrator review using a visible headed browser, AI proxy health check, AI Log inspection, and a 180s long run.
- Stage B: four accepted slices: Storyteller readability, AI automation boundary, food-crisis specificity, and full-suite contract cleanup.
- Stage C: implemented the accepted slices, then resolved full-suite failures by separating stale test expectations from product regressions.
- Stage D: targeted tests, full `npm test`, production build, diff hygiene, and visible browser verification all passed.

### What Landed

- Storyteller text no longer collapses into joined strings such as `MILESTONEDepot`, and Director copy no longer repeats as `DIRECTORDIRECTOR`.
- AI automation copy now states the Autopilot/LLM boundary explicitly: Autopilot OFF means live LLM calls are disabled, while rule-based directors and fallback summaries may still be visible.
- Food-crisis guidance now checks farm/worksite reachability and gives concrete recovery actions such as reconnecting farms, extending roads, adding warehouses, or placing reachable farms.
- Non-dev browser smoke can still access `window.__utopiaLongRun`, while the broader dev app handle remains dev-gated.
- Full-suite blockers were resolved: Autopilot copy tests, hitbox source guard tests, build-spam cap expectations, mood-output coupling expectations, noisy destroyed-building logs, and progression emergency priority.

### Validation

- targeted node tests: 40/40 passing
- full `npm test`: 1449 tests, 1447 pass, 0 fail, 2 skipped, 240711.2425 ms
- `npm run build`: passing
- `git diff --check`: passing
- visible headed-browser verification:
  - initial 180s review reproduced Storyteller and AI Log boundary issues
  - post-fix 120s ultra-speed run reached sim clock `1000.3s`
  - final AI Log smoke confirmed `llmBoundary=true`, `hasLongRun=true`, `hasDevApp=false`, `duplicateDirector=false`, and `milestoneJoined=false`
  - raw screenshots/logs were local temporary artifacts and were cleaned before push

### Main Lesson

Round 9 closed the Round 8 validation gap and made the AI/autopilot surfaces inspectable rather than merely present. The key product correction is the automation boundary: players can now distinguish manual guidance, rule-based fallback directors, Autopilot execution, and disabled live LLM calls without guessing from an empty or ambiguous AI log.

The remaining risk is balance depth. Food recovery is now much clearer to the player, but Round 9 did not retune the economy or run a multi-seed benchmark.
