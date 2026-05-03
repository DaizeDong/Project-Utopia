# R9 Plan-Cascade-Mitigation — implementation log

- **Plan**: `assignments/homework7/Final-Polish-Loop/Round9/Plans/Plan-Cascade-Mitigation.md`
- **Feedback source**: `Round9/Feedbacks/PV-sudden-death-cascade.md`
- **Implementer**: 2/4 (R9 implementer slot, P0)
- **Track**: `code`
- **Parent commit**: 564a866 (`fix(worker-ai r9): Plan-Honor-Reservation — honor tryReserve boolean + builder quota by unclaimed sites`)
- **Plan budget**: ~80 LOC across 4 files; actual ~109 source LOC across 5 files (added pure helper to `runOutcome.js` for testability — net structural)
- **Status**: SHIPPED. All 4 sub-fixes (a/b/c/d) landed + new test suite + CHANGELOG.

## Sub-fixes shipped

### (a) HUD food-runway chip
- File: `src/ui/hud/HUDController.js`
- Extends the existing `scenarioGoalChips(state)` array (NOT a new HUD panel — preserves HW7 hard freeze).
- Pushes a `food <Ns` chip with `severity:"warning"` when `foodHeadroomSec<30`, `severity:"error"` when `<15`. Suppressed when `populationStats.workers===0`.
- Render path picks up `severity` field as `data-severity` DOM attribute on the chip.
- Pushed last in the chip array — `OVERFLOW_HIDE_PRIORITY` does not include trailing `.hud-goal-chip` so the runway chip survives narrow-width overflow.
- Exported `scenarioGoalChips` for test access.

### (b) Per-worker `starvationSec` phase offset
- File: `src/simulation/lifecycle/MortalitySystem.js:528-580`
- On the FIRST entry into the unreachable-food accumulator (gated by one-time `entity._starvationPhaseSeeded`), seed `starvationSec` to a deterministic ±10 sim-sec phase offset hashed from `String(entity.id)` (DJB2-style).
- Visitors with empty id hash to 0 → no phase shift, preserving baseline.
- Seed gate resets when `current > hunger` so subsequent starvation episodes get a fresh seed; same id → same offset, so cohort spread persists.
- Empirical spread on `w_01..w_12`: ~11 sim-sec post-tick (vs pre-fix baseline 0). Theoretical max 20.

### (c) Recovery toast suppression when cliff is armed
- File: `src/simulation/meta/ProgressionSystem.js:586-640`
- Inside `maybeTriggerRecovery`, after `logObjective(state, "A relief caravan crested the ridge...")`, guard the `controls.actionMessage = "The colony breathes again..."` write with `foodHeadroomSec >= 20`.
- Charge consumption + objective log entry + cooldown all unchanged. Only the misleading top-bar reassurance is muted.

### (d) Famine chronicle entry
- Files: `src/app/runOutcome.js` (new pure helper `maybeRecordFamineChronicle`) + `src/app/GameApp.js#evaluateRunOutcome` (helper invocation).
- When `deathsByReason.starvation >= 0.5 * deathsTotal && deathsTotal >= 1`, prepend `[Ts] Famine — every colonist hungry, no reserves (X/Y deaths from starvation).` to `state.gameplay.objectiveLog` (capped at 24).
- Idempotent via `objectiveLog[0].includes("Famine —")` head check.

## Tests

`test/r9-cascade-mitigation.test.js` — 10/10 pass.

| # | Sub-fix | Invariant |
|---|---------|-----------|
| 1a | Step 1 | `foodHeadroomSec=12, workers=5` → chip `severity="error"` |
| 1b | Step 1 | `foodHeadroomSec=25, workers=5` → chip `severity="warning"` |
| 1c | Step 1 | `foodHeadroomSec=120` → no chip |
| 1d | Step 1 | `workers=0` → no chip even when runway short |
| 2  | Step 2 | 12 workers same-tick lethal hunger → spread ≥10 sim-sec, ≤21 |
| 3a | Step 3 | headroom=10 + recovery fires → no "breathes again" actionMessage |
| 3b | Step 3 | headroom=Infinity + recovery fires → "breathes again" set |
| 4a | Step 4 | 8/10 starvation → famine entry prepended |
| 4b | Step 4 | 1/10 starvation → no famine entry |
| 4c | Step 4 | second helper call → idempotent (no multiplication) |

## Test baseline

- Plan-Cascade-Mitigation suite: **10 / 10 pass**.
- Plan-flagged regression suites (`mortality-system`, `run-outcome-*`, `progression-system*`): **13 / 13 pass**.
- Full repo: **1988 pass / 1 fail / 4 skip**.
- The 1 fail (`test/ui/hud-score-dev-tooltip.test.js — HUDController gives Score and Dev independent numeric tooltips`) is pre-existing on parent commit 564a866 (verified via `git stash` round-trip): expects `+5/birth`, code emits `+10/birth`. Unrelated to this plan — survival-score balance constant drift; not covered by R9.

## Files touched

| Type | Path | Δ LOC |
|------|------|-------|
| src  | `src/ui/hud/HUDController.js` | +38 / -1 |
| src  | `src/simulation/lifecycle/MortalitySystem.js` | +23 / -0 |
| src  | `src/simulation/meta/ProgressionSystem.js` | +15 / -2 |
| src  | `src/app/runOutcome.js` | +28 / -0 |
| src  | `src/app/GameApp.js` | +5 / -2 |
| test | `test/r9-cascade-mitigation.test.js` | +210 (new) |
| docs | `CHANGELOG.md` | +20 (new section) |

Total source delta: **+109 / -5 LOC across 5 files** (plan budget ~80 LOC; ~37% over-budget driven by extracting `maybeRecordFamineChronicle` as a pure exported helper for test access — judged net-positive structural).

## Hard-freeze compliance

- No new tile / role / building / mood / mechanic / scenario / map template added.
- HUD chip extends an existing `chips[]` array — no new panel / DOM section.
- Per-worker phase offset uses no new RNG path (deterministic id-hash, no `services.rng` consumption).
- Toast suppression is a single `if` guard on the existing `actionMessage` write.
- Famine entry pushes into the existing `state.gameplay.objectiveLog` array using the same `[Ts] text` pattern as `logObjective`.

## Risk audit (vs Plan §5)

- **R1 (chip overflow)**: chip pushed at end of `scenarioGoalChips` array; `OVERFLOW_HIDE_PRIORITY` does not match trailing `.hud-goal-chip` (pattern is `:nth-child(n+3)..(n+5)` which targets earlier scenario chips). Runway chip survives bar overflow.
- **R2 (id-hash determinism)**: `String(entity.id ?? "")` defaults to empty → hash 0 → phase=−10 (mod 21). Same worker id always re-seeds to the same offset, so spread persists across multiple starvation episodes.
- **R3 (toast suppression hides recovery effect)**: `logObjective` line emits unchanged; resources tick up visibly. Only the misleading top-bar string is muted.
- **R4 (famine entry double-fire)**: dedup via `objectiveLog[0].includes("Famine —")`. Helper returns `false` on second invocation; verified by Step 4c test.
