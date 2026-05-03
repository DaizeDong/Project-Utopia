---
reviewer_id: PFF-r9-regression-audit
feedback_source: assignments/homework7/Final-Polish-Loop/Round11/Feedbacks/PFF-r9-regression-audit.md
round: 11
date: 2026-05-01
build_commit: 652220f
priority: P0
track: code (sim balance — MortalitySystem starvation phase-offset)
freeze_policy: hard
rollback_anchor: 652220f
estimated_scope:
  files_touched: 2
  loc_delta: ~30
  new_tests: 1
  wall_clock: 25
conflicts_with: []
---

# Plan-PFF-revert-cascade-regression — Make Starvation Phase-Offset Non-Positive

**Plan ID:** Plan-PFF-revert-cascade-regression
**Source feedback:** `assignments/homework7/Final-Polish-Loop/Round11/Feedbacks/PFF-r9-regression-audit.md`
**Track:** code (sim balance / lifecycle)
**Priority:** **P0 CRITICAL** — bisection-confirmed regression at commit `2f87413` (Plan-Cascade-Mitigation) wiped a +12 DevIndex / +18 K SurvivalScore win and pushed the seed-42 / temperate_plains / 30-day bench from "max_days_reached @ DevIndex 43.87" back to "loss @ day-9 / DevIndex 28.68." The ~60 % long-horizon regression that R10's validator flagged (R8 73.18 → R10 head 29.11) traces to one line.
**Freeze policy:** hard (single-line numeric/operator change inside an existing function; one new bench-floor invariant test; no new system, mechanic, tile, building, role, mood, balance key, or HUD element)
**Rollback anchor:** `652220f`

---

## 1. Core problem (one paragraph)

`src/simulation/lifecycle/MortalitySystem.js` introduced (commit `2f87413`) a per-worker deterministic phase-offset on `entity.starvationSec` to **stretch** the starvation cliff so deaths spread across ~50 sim-sec instead of clustering in ~25 sim-sec. The intent was **delay only** (the cliff arrives at the same head, the tail spreads). The implementation is **symmetric ±10 s** (`((Math.abs(h) % 21) - 10)`), so half the cohort enters the unreachable-food accumulator with `starvationSec = +N` (N up to +10), advancing their death by up to ~29 % vs. baseline `holdSec = 34 s`. Mean is unchanged but the *fastest deaths arrive 10 s sooner* — beneath the recovery latch's response window. The cohort that should have been the stretched tail of the cliff is instead a **front-loaded spike** that breaks the recovery loop's latency budget. The cascade doesn't widen, it **arrives earlier**, then continues just as steep.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — non-positive offset by construction

Change the offset expression at `MortalitySystem.js:567` from `((Math.abs(h) % 21) - 10)` to `-(Math.abs(h) % 11)` (range `-10..0`). Workers die at `holdSec + 0` through `holdSec + 10` — preserves the spread, **never advances** death past baseline. One operator + literal change; zero side effects on cohort shape other than removing the regressive half. Bench at `564a866` (DevIndex 43.87 / SurvivalScore 26 092 / max_days_reached @ 30) should be reachable again.

- Files: `src/simulation/lifecycle/MortalitySystem.js` (1 line edit)
- Scope: tiny (~1 LOC prod + ~25 LOC test)
- Expected gain: restores the +12 DevIndex / +18 K survival lift Plan-Honor-Reservation delivered; closes the R10 validator's 60 % gap
- Main risk: deterministic phase-offset distribution changes — any test that pins the *exact* starvationSec value of a specific worker id post-offset will flip. Per CLAUDE.md baseline (1646 / 1612 / 0 fail / 2 skip) no such pinning is expected, but to confirm, Step 4 runs `node --test test/*.test.js`.

### Suggestion B (alternative, in-freeze) — clamp at apply time

Keep the symmetric range generator but clamp the result to non-positive at the assignment site:

```js
entity.starvationSec = Math.min(0, Number(entity.starvationSec ?? 0) + phaseOffset);
```

- Files: `src/simulation/lifecycle/MortalitySystem.js` (1 line edit)
- Scope: tiny
- Expected gain: same as A
- Main risk: the `Math.min(0, …)` clamp also clobbers any *legitimate* positive `starvationSec` that flowed in from a prior tick (i.e. a worker who was already mid-starvation on the previous tick gets reset to 0 — that is **wrong** if the offset is being re-applied per-tick rather than once-at-cohort-entry). Need to verify the offset is computed at first-entry only (per the comment "enters the unreachable-food accumulator"). If the offset re-applies every tick, B silently masks the bug; A is the only safe shape.

### Suggestion C (in-freeze, MINIMAL) — full revert of lines 552–579

Revert the entire phase-offset block to its pre-`2f87413` shape. Loses the (intended) cliff-spreading benefit but is the smallest-surface restoration of pre-regression behaviour.

- Files: `src/simulation/lifecycle/MortalitySystem.js` (~28 LOC delete)
- Scope: tiny
- Expected gain: matches `564a866` exactly
- Main risk: re-introduces the original cluster-death problem Plan-Cascade-Mitigation was attempting to solve — known to make survival graphs visibly steppy. Lower fitness than A.

### Suggestion D (FREEZE-VIOLATING, flagged, do not ship in R11) — replace phase-offset with adaptive recovery latch

Re-design the cascade-mitigation to widen the *recovery latch's response window* rather than the death cohort's spread. Address the latency-budget mismatch directly. **New tunable + control-loop modification = mechanic change**; defer to v0.10.2.

## 3. Selected approach

**Suggestion A.** Lowest-risk, single-line change, preserves design intent (deterministic per-worker spread), eliminates the regressive half by construction (no clamp gymnastics, no need to verify per-tick re-apply behaviour). Adds a bench-floor invariant test so the regression cannot recur silently.

## 4. Plan steps

- [ ] **Step 1 — Read the regression block in context.**
  `src/simulation/lifecycle/MortalitySystem.js:540–585` (the whole `applyStarvationPhaseOffset` / inline block per PFF's audit; verify exact line numbers via `Grep "phaseOffset" src/simulation/lifecycle/MortalitySystem.js`). Confirm the offset is applied once at cohort entry vs. every tick — this informs whether the comment in Step 2 should read "applied at cohort entry" or "re-clamped each tick."
  - Type: read (no edit)

- [ ] **Step 2 — One-line operator/range fix.**
  `src/simulation/lifecycle/MortalitySystem.js:567` — replace
  ```js
  const phaseOffset = ((Math.abs(h) % 21) - 10);  // -10 .. +10 sim-sec
  ```
  with
  ```js
  // PFF R11: non-positive only — phase-offset must DELAY death, never accelerate.
  // Symmetric ±10 s (pre-fix) front-loaded the cohort head by ~29 % vs baseline
  // holdSec=34 s, breaking the recovery latch's response window.
  const phaseOffset = -(Math.abs(h) % 11);  // -10 .. 0 sim-sec
  ```
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Add a bench-floor invariant unit test.**
  Create `test/mortality-phase-offset-non-positive.test.js`. Iterate `i = 0..1023` worker ids (or use a deterministic id-hash fixture that mirrors the `h` derivation in `MortalitySystem.js`), compute the phase-offset for each, assert **every** offset satisfies `phaseOffset <= 0` AND `phaseOffset >= -10`. Failure mode: any single positive offset detected = test fails with the offending id and value. ~25 LOC.
  - Type: add (new file)
  - depends_on: Step 2

- [ ] **Step 4 — Run the suite.**
  `node --test test/*.test.js`. Baseline 1646 / 1612 / 0 fail / 2 skip (per CLAUDE.md). Expect: +1 pass (the new invariant test). Any pre-existing tests that pinned an exact post-offset `starvationSec` for a specific worker id will surface here — none expected.
  - Type: verify
  - depends_on: Step 3

- [ ] **Step 5 — Bench regression check.**
  `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 30 --tick-rate 4`. Required: DevIndex (last) ≥ 40, SurvivalScore ≥ 20 000, outcome `max_days_reached`. PFF measured 43.87 / 26 092 / 30-day-survive at `564a866`; we expect the fix to recover most of that. Acceptance gate: DevIndex ≥ 40 (≥ 90 % of `564a866` win); SurvivalScore ≥ 20 000 (≥ 76 %); outcome must NOT be `loss @ day-9`.
  - Type: verify
  - depends_on: Step 4

- [ ] **Step 6 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  Add: *"PFF-r9-regression-audit fix — MortalitySystem phase-offset clamped to -10..0 (was symmetric ±10 s); cascade head no longer arrives 10 sim-sec early. Restores Plan-Honor-Reservation's +12 DevIndex / +18 K SurvivalScore win that Plan-Cascade-Mitigation had unintentionally wiped. New invariant test guards against recurrence."*
  - Type: edit
  - depends_on: Step 5

## 5. Risks

- **Phase-offset distribution change.** Any test that pinned the exact post-offset `starvationSec` of a specific worker id will flip. Step 4 catches this; if it surfaces, the test was over-specified (asserting cosmetic determinism rather than behaviour) and should be relaxed. Files at risk: `test/mortality-*.test.js`, `test/lifecycle-*.test.js` — none currently expected per the audit's clean bisection.
- **Bench seed sensitivity.** PFF bisected at seed 42 / temperate_plains / 30-day. Other seeds may show different magnitudes. If Step 5's seed-42 gate passes but a smoke seed (e.g. 7777) regresses, this means the original `2f87413` code was net-positive on *some* seeds and the fix has broader balance implications — flag for Coder, do NOT silently revert.
- **Adjacent helper drift.** PFF's "secondary contributing surface" notes `ProgressionSystem.maybeTriggerRecovery`'s `foodHeadroomSec < 20` suppression of the action message. That branch reads from live worker count; with workers no longer dying 10 s early, `foodHeadroomSec` becomes more honest, so the recovery message may now fire in cases it previously suppressed. This is a *positive* side effect (the player sees the recovery they earn) but if a UX test asserted suppression, it flips.
- **CHANGELOG-only commits forbidden.** Per CLAUDE.md, every commit must include a CHANGELOG.md update. Step 6 is part of the same commit, not a separate one.
- **Possible affected tests:** `test/mortality-*.test.js`, `test/lifecycle-*.test.js`, `test/long-horizon-*.test.js` (if any pin DevIndex to a specific cohort death-arrival distribution). Per the bisection, none are currently expected to flip.

## 6. Verification

- **New unit test:** `test/mortality-phase-offset-non-positive.test.js` (Step 3). Iterates ≥ 1024 worker-id hashes, asserts `phaseOffset ∈ [-10, 0]` for every one. Negative-control: temporarily change the operator back to `(Math.abs(h) % 21) - 10` locally, confirm the test fails on at least one positive id. Revert.
- **Manual sim verification:** open dev server, devStressSpawn(40), withhold all food (`debug.zeroFood()` if available, else delete every food source), watch starvation cohort death timestamps in `state.deathLog`. Pre-fix: first death within ~24 sim-sec of cohort entry. Post-fix: first death at ≥ 34 sim-sec.
- **Benchmark regression:** `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 30 --tick-rate 4` — DevIndex ≥ 40, SurvivalScore ≥ 20 000, outcome ≠ `loss`. Compare against PFF's table:

  | Commit | Plan | DevIndex (last) | SurvivalScore | Outcome | Days |
  | --- | --- | --- | --- | --- | --- |
  | `564a866` | Plan-Honor-Reservation | 43.87 | 26 092 | max_days_reached | 30 |
  | `2f87413` | Plan-Cascade-Mitigation (REGRESSION) | 28.68 | 7955 | loss | 9 |
  | post-fix | Plan-PFF-revert-cascade-regression | **≥ 40** (target) | **≥ 20 000** (target) | **max_days_reached** (target) | **30** (target) |

- **Smoke benchmarks (don't gate, but capture):** seeds 7777 + 160 304 153 (the two seeds PHH used) at the same preset/days. Any regression > 5 % vs `564a866` flags a deeper interaction.

## 7. UNREPRODUCIBLE marker

N/A — PFF reproduced via deterministic bisection at the four R9 commits with seed-42 / temperate_plains / 30-day. The audit data is sufficient evidence; no further repro needed before applying the fix.

---

## Acceptance criteria

1. `node --test test/*.test.js` baseline preserved (≥ 1646 pass / 0 fail; +1 from new invariant test).
2. New invariant test `test/mortality-phase-offset-non-positive.test.js` passes.
3. Bench `--seed 42 --preset temperate_plains --max-days 30 --tick-rate 4` reaches `outcome: max_days_reached` with `DevIndex ≥ 40` and `SurvivalScore ≥ 20 000`.
4. No new TILE / role / building / mechanic / mood / balance key / HUD element introduced.
5. `CHANGELOG.md` updated under unreleased v0.10.1-n.

## Rollback procedure

`git checkout 652220f -- src/simulation/lifecycle/MortalitySystem.js && rm test/mortality-phase-offset-non-positive.test.js` cleanly reverts.
