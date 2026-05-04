---
reviewer_id: Plan-R13-event-mitigation (R13 user issue #2)
feedback_source: assignments/homework7/Final-Polish-Loop/Round13/Feedbacks/summary.md
round: 13
date: 2026-05-01
build_commit: 527f460
priority: P0
track: code (event lifecycle — pre-event warning + preparedness-capped intensity)
freeze_policy: hard
rollback_anchor: 527f460
estimated_scope:
  files_touched: 2
  loc_delta: ~50
  new_tests: 1
  wall_clock: 40
conflicts_with: []
---

# Plan-R13-event-mitigation — 30-sec pre-event warning + intensity capped by preparedness (walls + guards)

**Plan ID:** Plan-R13-event-mitigation
**Source feedback:** R13 user directive issue #2 — "Events (raid/fire/vermin) currently kill all without mitigation. Add (a) pre-event warning toast 30 sim-sec early, (b) event intensity capped by colony preparedness (walls + guards)"
**Track:** code
**Priority:** **P0** — Wipe-causing event with no actionable signal is the most visible "this game is unfair" complaint. Existing R6 Plan-defense raid-tier infrastructure already exposes preparedness data; we just need to read it back.
**Freeze policy:** hard — no new event types, no new mechanic. Only adds (a) a `state.gameplay.events.upcoming` queue with single-pass scheduler peek for 30-sec warning toasts, and (b) a multiplier read against existing `combat.activeRaiders` / wall HP / guard count.
**Rollback anchor:** `527f460`

---

## 1. Core problem (one paragraph)

`WorldEventSystem.js` fires raid / wildfire / vermin events at scheduled tick boundaries with full intensity regardless of player preparedness. The R6 Plan-defense raid-tier infrastructure already populates `state.combat.raidTier`, `state.gameplay.raidEscalation`, and per-event payloads with `projectedDrain`, but (a) the player never sees a pre-event warning that would let them react (build walls, draft a guard) — the toast fires AT raid start, not before — and (b) the intensity numbers don't read back colony preparedness, so 8 walls + 3 guards faces the same drain as 0 walls + 0 guards. Per the user directive, both gaps should close.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — schedule a "warning" tick 30s before event spawn + multiply intensity by `(1 - preparednessFraction)`

Modify the raid scheduler in `WorldEventSystem.js` to peek the next scheduled raid timestamp; when `nextRaidSec - currentSec ≤ 30`, fire `pushToast("Bandit raid incoming in 30s — build walls or draft guards", "warning", { dedupKey: "raid-warning-${eventId}" })` exactly once per event. Then, when the event actually spawns, compute:
```js
const wallCount = state.metrics.buildingStats?.wallTotal ?? 0;
const guardCount = state.metrics.combatRoles?.guard ?? 0;
const prepBalance = Number(BALANCE.eventPreparednessFullCapAtWalls ?? 12);
const guardWeight = Number(BALANCE.eventPreparednessGuardWeight ?? 1.5);
const prepScore = wallCount + guardCount * guardWeight;
const prepFraction = Math.min(0.7, prepScore / prepBalance); // cap at 70% mitigation
event.payload.projectedDrain = Math.round(event.payload.projectedDrain * (1 - prepFraction));
```
Apply same multiplier to wildfire `fireLossFraction` and vermin loss. Floor at 30% of original (cannot fully no-op an event — preparedness only mitigates).

- Files: `src/world/events/WorldEventSystem.js`, `src/config/balance.js` (3 constants).
- Scope: ~50 LOC + 1 test ~20 LOC.
- Expected gain: closes both halves of user issue #2; player has 30s to react and preparedness investments visibly pay off.
- Main risk: if preparedness math reads stale `state.metrics.combatRoles` between RoleAssignmentSystem ticks, mitigation can be 1-tick stale (negligible at 60Hz tick).

### Suggestion B (in-freeze, MINIMAL) — only the 30-sec warning toast, no intensity cap

Quicker fix, ~20 LOC, but only addresses half the user complaint and players will still wipe with full walls.

- Files: `src/world/events/WorldEventSystem.js` only
- Scope: ~20 LOC
- Expected gain: half-fix
- Main risk: user issue #2(b) remains open

### Suggestion C (FREEZE-VIOLATING) — new "Defense Drill" event-cancellation mechanic

New mechanic. Out of freeze. Defer.

## 3. Selected approach

**Suggestion A** — both halves of the user directive in one hard-frozen patch. Reuses existing R6 PD raid-tier counters; no new state shape.

## 4. Plan steps

- [ ] **Step 1 — Add BALANCE constants in `src/config/balance.js`.**
  ```js
  eventPreWarningLeadSec: 30,                // emit warning toast 30s before event spawn
  eventPreparednessFullCapAtWalls: 12,       // walls+guards needed for 70% mitigation cap
  eventPreparednessGuardWeight: 1.5,         // each guard counts as 1.5 walls
  eventPreparednessMaxMitigation: 0.7,       // floor: events always do at least 30% damage
  ```
  - Type: edit

- [ ] **Step 2 — Add `peekNextScheduledRaid(state)` helper near top of `WorldEventSystem.js`.**
  Walks `state.gameplay.raidEscalation.scheduledRaids` (or whatever the existing field is — audit during step) and returns the soonest `{eventId, scheduledSec}`.
  - Type: add
  - depends_on: Step 1

- [ ] **Step 3 — In the raid update loop, emit warning toast when `nextRaidSec - currentSec ∈ [0, 30]` AND `!event.payload.warningEmitted`.**
  Pattern mirrors existing `event.payload.toastEmittedThisRaid` dedup at line ~774:
  ```js
  if (!event.payload.warningEmitted && (event.scheduledSec - currentSec) <= Number(BALANCE.eventPreWarningLeadSec ?? 30)) {
    event.payload.warningEmitted = true;
    pushToast(state, "Bandit raid incoming in 30s — build walls or draft guards", "warning", { dedupKey: `raid-warning-${event.id}` });
  }
  ```
  - Type: add
  - depends_on: Step 2

- [ ] **Step 4 — Add `applyPreparednessMitigation(event, state)` at the top of the raid spawn / wildfire spawn / vermin spawn handlers.**
  Reads `state.metrics.buildingStats?.wallTotal` + `state.metrics.combatRoles?.guard`, computes `prepFraction`, multiplies `event.payload.projectedDrain` (raid), `event.payload.lossFraction` (wildfire), `event.payload.warehouseLossFraction` (vermin) by `(1 - prepFraction)`. Floor at `1 - eventPreparednessMaxMitigation = 0.3`.
  - Type: add
  - depends_on: Step 3

- [ ] **Step 5 — Add unit test `test/event-mitigation.test.js` (~40 LOC).**
  Test cases:
  1. Schedule raid in 25s → warning toast emitted exactly once.
  2. Schedule raid in 35s → no warning yet; tick 10s → warning emits.
  3. Zero walls + zero guards → no mitigation (drain unchanged).
  4. 12 walls + 0 guards → 70% mitigation cap (drain × 0.3).
  5. 6 walls + 4 guards (= 6 + 6 = 12) → 70% mitigation cap.
  6. 20 walls + 10 guards → still 70% mitigation cap (floor).
  - Type: add
  - depends_on: Step 4

- [ ] **Step 6 — CHANGELOG.md entry under unreleased label.**
  *"R13 #2 Plan-R13-event-mitigation (P0): events now emit a 30-sec pre-warning toast (BALANCE.eventPreWarningLeadSec) and intensity is capped by preparedness (walls + guards × 1.5, up to 70% mitigation). Reuses R6 PD raid-tier infrastructure."*
  - Type: edit
  - depends_on: Step 5

## 5. Risks

- **Raid scheduler shape varies per scenario** — if `scheduledRaids` is not the canonical field, Step 2 needs adapting to whatever WorldEventSystem actually uses internally.
- **Mitigation could be too generous and trivialize events** — capped at 70% per `eventPreparednessMaxMitigation`; tunable.
- **Toast spam during back-to-back raids** — dedup via `dedupKey: "raid-warning-${event.id}"` ensures one warning per event lifecycle.
- **Possible affected tests:** `test/world-event*.test.js`, `test/raid*.test.js`, `test/exploit-regression*.test.js` (raid drain numbers shift downward by mitigation %).

## 6. Verification

- **New unit test:** `test/event-mitigation.test.js` (Step 5).
- **Manual:** play dev server, wait for first raid, observe 30s warning toast → build 4 walls before raid hits → confirm projected drain in toast is reduced vs no-walls baseline.
- **Bench:** survival mode DevIndex should slightly improve (player has reaction window).

## 7. UNREPRODUCIBLE marker

N/A — design directive.

---

## Acceptance criteria

1. Pre-event warning toast fires 30 sim-sec before raid/fire/vermin spawn (within ±1 tick).
2. Each event lifecycle emits exactly one warning toast (deduped).
3. Drain/loss fractions multiplied by `(1 - prepFraction)` with prepFraction floored at 0 and capped at 0.7.
4. Test baseline 1646 / 0 fail / 2 skip preserved + 1 new test passes.
5. CHANGELOG.md updated.

## Rollback procedure

```
git checkout 527f460 -- src/world/events/WorldEventSystem.js src/config/balance.js && rm test/event-mitigation.test.js
```
