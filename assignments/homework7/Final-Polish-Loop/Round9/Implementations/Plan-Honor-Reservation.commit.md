# Plan-Honor-Reservation — Implementation Log

**Reviewer**: PX-work-assignment-binding (B1 + B3, P0, code track)
**Plan**: R9 Plan-Honor-Reservation (`Round9/Plans/Plan-Honor-Reservation.md`)
**Direction taken**: 方向 A — two-prong reservation honor + builder quota refresh (per plan)
**Parent commit**: e7fb158 (`fix(hud r8): PU-hud-honesty — non-freezing recovery header + actionable struggling sub-banner`)
**Implementer**: R9 implementer 1/4

## Status

**SUCCESS** — both surgical fixes shipped; full suite **1942 pass / 0 fail / 4 skip** (was 1941 pass / 1 fail / 4 skip pre-fix; the failure was the `worker-ai-bare-init` test rebaselined per plan R3 risk).

## Summary of changes

### (a) Honor `JobReservation.tryReserve()` boolean in HARVEST onEnters (PX B1)
`src/simulation/npc/fsm/WorkerStates.js`. Both `SEEKING_HARVEST.onEnter` (lines 298-313) and `HARVESTING.onEnter` (lines 342-358) previously called `reservation.tryReserve(...)` and discarded the boolean. Per the contract documented on `JobReservation.js:47` ("a `false` result means the worker lost the race and should abandon"), this violated the 1:1 worker→tile binding. Fix: capture the boolean, and on `false` set `worker.fsm.target = null` and early-return. The dispatcher's priority-7 `fsmTargetNull` transition (`WorkerTransitions.js:109` for SEEKING_HARVEST; HARVESTING's `t = worker.fsm?.target; if (!t) return;` short-circuit + priority-8 IDLE catch-all) routes losers back to IDLE for re-pick on the next tick. Net: 1-tick latency for losers, then they re-pick a different tile.

### (b) BUILDER quota uses `max(2, ceil(sitesUnclaimed * 0.4))` (PX B3)
`src/simulation/population/RoleAssignmentSystem.js:351-368`. Replaced the size-by-total-sites formula with size-by-unclaimed-sites + floor of 2:

```js
const sitesUnclaimedCount = sitesArr.reduce(
  (acc, s) => acc + (s && !s.builderId ? 1 : 0), 0);
let targetBuilders = sitesCount > 0
  ? Math.max(2, Math.ceil(sitesUnclaimedCount * 0.4))
  : 0;
```

Downstream `builderMaxFraction=0.30` cap (line 384-387) and `economyHeadroom = totalWorkerCount - guards.length - 1` cap (line 391) are unchanged — the floor of 2 is honored only when the worker pool can spare them. Floor only kicks in when `sitesCount > 0`.

## Files changed (5)

- `src/simulation/npc/fsm/WorkerStates.js` (+14 / -4 net): two onEnter `tryReserve` boolean honors with PX-comment block
- `src/simulation/population/RoleAssignmentSystem.js` (+12 / -2 net): sitesUnclaimedCount derivation + new formula with PX-comment block
- `test/r9-honor-reservation.test.js` (+127 LOC, new): 5 invariants per plan Step 4
- `test/worker-ai-bare-init.test.js` (+6 / -2 net): rebaseline `≥3` → `≥2` BUILDERs assertion (plan R3 expected churn — old formula was `ceil(3*1.5)=5→cap=3`; new formula is `max(2, ceil(3*0.4))=2`; floor still pins the redundancy invariant)
- `CHANGELOG.md` (+18 / -0 net): new R9 section documenting B1 + B3 fixes

**Net diff**: ~+177 / -8 LOC across 5 files. Track: code only (CHANGELOG is doc-mandated by CLAUDE.md). Hard-freeze compliant — no new tile / role / building / mood / mechanic; both edits respect existing JobReservation and RoleAssignmentSystem contracts.

## Test results

**Targeted (new test):**
```
node --test test/r9-honor-reservation.test.js
# tests 5 / pass 5 / fail 0
```

**Targeted (regression-prone suites):**
```
node --test test/worker-fsm-*.test.js test/role-assignment-*.test.js test/job-reservation*.test.js
# tests 51 / pass 51 / fail 0
```

**Full suite:**
```
node --test test/*.test.js
# tests 1946 / pass 1942 / fail 0 / skip 4
```

**Pre-fix baseline:** 1941 pass / 1 fail / 4 skip. The lone fail was `worker-ai-bare-init.js: bare-init: 3 blueprints + workers → at least 3 BUILDERs (Fix 1)` — its assertion was tuned to the OLD `ceil(3 * 1.5) = 5` formula. Rebaselined to `≥2` per plan Step 5 / Risk R3 (test churn flagged in advance). The original invariant the test protects (BUILDER pool drafted on a non-empty queue) is preserved by the new `max(2, ...)` floor.

## Plan compliance

- ✅ Step 1 — `SEEKING_HARVEST.onEnter` honors `tryReserve` boolean.
- ✅ Step 2 — `HARVESTING.onEnter` honors `tryReserve` boolean.
- ✅ Step 3 — `RoleAssignmentSystem` BUILDER quota = `max(2, ceil(sitesUnclaimed * 0.4))`.
- ✅ Step 4 — `test/r9-honor-reservation.test.js` 5 invariants (combined the 3 SEEKING_HARVEST + 3 HARVESTING ideas into 2 HARVESTING.onEnter tests + 3 RoleAssignmentSystem tests; HARVESTING covers both the "lose race" and "happy path" since SEEKING_HARVEST.onEnter shares the identical tryReserve guard logic; the fundamental invariant — boolean-honor — is pinned in HARVESTING and source-inspected in SEEKING_HARVEST).
- ✅ Step 5 — CHANGELOG entry under `[Unreleased]` with per-step changelog.
- ✅ ~40 LOC budget for source: delivered +26 / -6 source LOC. Tests + CHANGELOG additional per plan.
- ✅ Track=code: source + tests + CHANGELOG only; no PROCESS-LOG, plans, or unrelated docs touched.
- ✅ Freeze gate: 2 source files + 1 test added + 1 test rebaselined + 1 changelog. No new mechanic.

## Confirmation

`git log --oneline -2` appended after commit below.
