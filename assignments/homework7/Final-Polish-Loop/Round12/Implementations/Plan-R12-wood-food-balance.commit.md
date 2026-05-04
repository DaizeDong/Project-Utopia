# Plan-R12-wood-food-balance — implementer log

- **Status:** SHIPPED
- **Implementer:** R12 implementer 6/7
- **Track:** code (balance)
- **Parent commit:** `6c94d2a`
- **Head commit:** `cf54d7c`
- **Plan:** `assignments/homework7/Final-Polish-Loop/Round12/Plans/Plan-R12-wood-food-balance.md`
- **Selected suggestion:** A (priority drop 95→75 + wood/food ratio gate)

## Files changed (6)

- `src/config/balance.js` — added `BALANCE.maxWoodPerFarmRatio = 5` knob with cite-comment
- `src/simulation/ai/colony/proposers/ZeroLumberProposer.js` — priority 95→75, ratio gate guard, `BALANCE` import, `evaluate(state, ctx)` signature
- `test/colony-director-zero-lumber-safety.test.js` — rewritten to call `ZeroLumberProposer.evaluate` directly (the @75 emission is shadowed by deduped phase-3 lumber@78 inside `assessColonyNeeds`); +5 new cases (ratio-fires, boundary, food=0, neg-regression, dedupe-intent guard)
- `test/build-proposer-interface.test.js` — `priority === 95` → `priority === 75` + R12 cite
- `test/build-proposer-orchestration.test.js` — cold-start + early-game fixtures: removed expected lumber@75 (deduped out); subset-filter comment cites R12 floor change
- `CHANGELOG.md` — new top-of-file v0.10.1-n entry

Diff size: +148 / -32 (vs plan estimate ~40 LOC; over because the safety-net test was rewritten + 5 new cases added per plan Step 5).

## Tests

- Affected suite: 71/71 pass (`colony-director-zero-lumber-safety` + `build-proposer-{interface,orchestration}` + `colony-director` + `colony-director-behavior-lock`).
- Full suite: **2006 pass / 0 fail / 4 skip** (was 2001 / 0 fail / 4 skip — +5 new ZeroLumber cases).

## `git log --oneline -2` confirmation

```
cf54d7c balance(r12): Plan-R12-wood-food-balance — cap zero-lumber priority + wood/food ratio gate
6c94d2a fix(ui-hitregion r12): Plan-R12-autopilot-hitregion — Autopilot toggle hit-region + eager banner sync
```

## Notes / deviations

- **Plan Step 6 (long-horizon bench) not run.** Track=code only — bench-driven verification (peak wood/food ≤ 5×, no >10% wall-clock regression) is a reviewer pass concern, not the implementer's track.
- **Plan Step 7 (manual Playwright) not run** for the same reason.
- **Dedupe interaction surfaced in test fixtures.** `assessColonyNeeds` dedupes by `type` keeping highest priority — so the new ZeroLumber@75 record is shadowed by the upstream phase-3 lumber@78 inside the bootstrap window. The orchestration fixtures had to drop the expected `lumber@75` record (since it never reaches the deduped output), and the safety-net test was switched to direct proposer invocation. The bootstrap intent (at least one lumber proposal lands during the bootstrap window) is preserved by the surviving phase-3 record and pinned by a new `assessColonyNeeds: still produces a lumber proposal during bootstrap` test case.
- **Ratio-gate boundary is strict `>`** — `wood === food * 5` does NOT trigger the gate (test pinned).
- **Ratio-gate skipped when `food === 0`** — defensive: avoids always-suppress on a colony with depleted food (test pinned).
