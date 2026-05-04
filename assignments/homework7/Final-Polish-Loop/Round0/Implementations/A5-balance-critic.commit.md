---
reviewer_id: A5-balance-critic
plan_source: Round0/Plans/A5-balance-critic.md
round: 0
date: 2026-05-01
parent_commit: 3f87bf4
head_commit: 98e18c2
status: PARTIAL
track: code
freeze_check: PASS
track_check: PASS
steps_done: 4/5
tests_passed: 1640/1648
tests_new: test/balance-opening-runway.test.js
---

## Steps executed

- [x] Step 1: `src/config/balance.js` — `INITIAL_RESOURCES.food` 200 → 320 with v0.10.1-r0-A5 comment.
- [x] Step 2: `src/config/balance.js` — `workerFoodConsumptionPerSecond` 0.050 → 0.038 with multi-line rationale comment (colony drain at 12 workers ~0.456 food/s, runway 333 s → 702 s).
- [x] Step 3: `src/config/balance.js` — `resourceCollapseCarryGrace` 0.5 → 1.5 with rationale comment (widen carry-in-transit grace).
- [x] Step 4: `test/balance-opening-runway.test.js` — new test file with 2 assertions: (a) pure-burn runway >= 600 s, (b) `resourceCollapseCarryGrace >= 1.0`. Both pass.
- [ ] Step 5: SKIPPED — `CHANGELOG.md` edit. Plan asks for it, but orchestrator runtime context says "DO NOT touch CHANGELOG.md (that's docs track, not yours; B2 / A4 will)." Track-edge enforcement wins over plan step.

## Tests

- baseline (parent commit `3f87bf4`, with my balance.js changes stashed and new test removed): 1646 tests, 4 pre-existing failures, 4 skips. Verified by `git stash` + targeted re-run.
- after my changes: **1648 tests, 1640 pass, 4 fail, 4 skip.** Net delta: +2 tests, +2 pass, 0 new failures, 0 new skips.
- new tests added: `test/balance-opening-runway.test.js` (2 passing assertions)
- pre-existing failures (NOT introduced by this plan, confirmed via baseline run):
  1. `test/food-rate-breakdown.test.js:55` — `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires` (`expected near-zero spoiledPerMin, got 2.12`) — pre-existing v0.10.1-j spoilage interaction.
  2. `test/phase1-resource-chains.test.js` — `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role` — passes in isolation, fails when run with full suite (test isolation issue, pre-existing).
  3. `test/raid-escalator.test.js` — `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)` — pre-existing curve-tuning drift.
  4. `test/raid-fallback-scheduler.test.js` — `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)` — pre-existing.
- failures resolved during iteration: none — all 4 are pre-existing on parent.

## Deviations from plan

- **Step 5 dropped (CHANGELOG.md):** orchestrator runtime context explicitly forbids it for code-track plans. Defer to docs-track owner (B2 or A4).
- All math/values match plan exactly. Comments added with `// v0.10.1-r0-A5:` prefix as specified.

## Freeze / Track check 结果

- **freeze_check: PASS.** No new TILE / role / building / mechanic / audio asset / UI panel. Only existing BALANCE keys edited (numeric tweaks only).
- **track_check: PASS.** Only `src/config/balance.js` and `test/balance-opening-runway.test.js` modified. Whitelist: `src/**` + `test/**`. CHANGELOG.md / README.md / docs/** / assignments/** not touched (one untracked uncommitted CHANGELOG.md modification existed in working tree from before the session — left untouched).

## Handoff to Validator

- **Manual verification needed (per plan §6):**
  - Open `npx vite` → Riverlands map → 8x speed, no input → assert Survived clock reaches >= 5:30 before any "colony stalled" toast (vs current 3:11 baseline). Repeat on Plains + Highlands.
- **Long-horizon benchmark regression:** `node scripts/long-horizon-bench.mjs --seed 42 --map temperate_plains --days 90` — DevIndex must stay within `baseline - 5%`. New food generosity may overshoot by 5–10%; if so, plan §5 mitigation is to scale `INITIAL_RESOURCES.food` back to 280 (still > 5-min runway).
- **FPS regression:** none expected (no rendering changes). 5-second `performance.now()` sample, average FPS >= 30.
- **Prod build smoke:** `npx vite build` + `vite preview` 3-min run, no console errors.
- **Test runner final state:** 1640/1648 pass, 4 pre-existing fail (NOT introduced by A5), 4 skip. New test file: `test/balance-opening-runway.test.js`.
- **Followups for Round 1+:** Direction B (pre-built starter warehouse) and Direction C (hard-stop sim at loss-tick) from plan §2 remain open if Round 0 validation shows numeric tweak alone is insufficient.
