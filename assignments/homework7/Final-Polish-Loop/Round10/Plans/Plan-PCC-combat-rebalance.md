# Plan-PCC-combat-rebalance — Restore GUARD Identity, Close Predator Kite Gap, Make Saboteurs Sting

**Plan ID:** Plan-PCC-combat-rebalance
**Source feedback:** `assignments/homework7/Final-Polish-Loop/Round10/Feedbacks/PCC-combat-balance.md`
**Track:** code (BALANCE knobs + minimal damage-branch + 1 saboteur tick branch)
**Priority:** P0 (combat feels "tap to delete"; GUARD role identity collapsed in R5 PB)
**Freeze policy:** hard
**Rollback anchor:** `d2a83b5`
**Estimated scope:** ~50 LOC across 4 files

---

## Problem statement (one paragraph)

R5 PB widened `WorkerTransitions.js:53-59`'s priority-0 COMBAT_PREEMPT row from `hostileInAggroRadiusForGuard` to `hostileInAggroRadius`, so every worker (FARM, WOOD, HAUL, COOK, GUARD alike) preempts to FIGHTING when a hostile enters `guardAggroRadius=12`. Combined with `WorkerStates.js:271` reading the single `BALANCE.guardAttackDamage = 18` for all FIGHTING workers, GUARD-vs-non-GUARD damage parity collapsed. Saboteurs are noncombatants (HP 50 reusing `wallMaxHp`, attackDamage 0) so the most-visible "raid" event evaporates in 3 worker hits with zero risk. Worker `meleeReachTiles=2.6` exceeds `predatorAttackDistance=1.8` by 44%, allowing GUARDs to kite wolves at distance 2.4–2.6 (Encounter A: 4 wolf hits taken at HP 100, wolf dies). User correctly perceives combat as "tap to delete." This plan restores GUARD identity, closes the kite gap, and gives saboteurs a sting without inventing any new mechanic — only BALANCE knobs, one role-branch in an existing FIGHTING tick, and one cooldown-gated melee strike inside the existing `saboteurTick`.

## Hard-freeze posture

NO new tile / role / building / mood / mechanic / audio / UI panel. Touch only:
- BALANCE knob additions (numbers in a frozen config; no new system).
- One role-branch ternary in `WorkerStates.js` FIGHTING tick (existing function, existing fields).
- One `attackCooldownSec`-gated damage line in the existing `saboteurTick` (existing function, existing field — saboteurs already have HP and an FSM, we are activating an unused capability, not adding a new behaviour).
- One `EntityFactory.js` line swap (`wallMaxHp` → `saboteurMaxHp`) so saboteur HP no longer drifts with wall buffs.

No new entity types. No new combat states. No new UI affordance. No new tile damage path. The saboteur strike rides on the existing damage pipeline (predators already use the same `dealDamage`/HP path).

---

## Atomic steps

### Step 1 — Add new BALANCE knobs

**File:** `src/config/balance.js`

Add to the frozen `BALANCE` object (next to existing combat keys — search for `guardAttackDamage:` for the locality):

```js
// PCC R10: split GUARD vs non-GUARD damage to restore role identity
workerAttackDamage: 10,           // non-GUARD melee dmg (was implicit 18 via shared key)
workerAttackCooldownSec: 2.2,     // non-GUARD cooldown (was implicit 1.6)
// GUARD keeps existing guardAttackDamage: 18, guardAttackCooldownSec: 1.6

// PCC R10: saboteurs sting back when engaged (was: noncombatant)
saboteurMaxHp: 65,                // was reusing wallMaxHp=50; decoupled + buffed
saboteurAttackDamage: 8,          // damage per strike when adjacent to a worker
saboteurAttackCooldownSec: 2.0,   // cooldown between strikes
```

Adjust two existing knobs:

```js
meleeReachTiles: 2.0,             // was 2.6 — closes 0.8-tile kite gap vs predators
predatorAttackDistance: 2.4,      // was 1.8 — predator can reach as far as a GUARD
```

Total: 5 new keys, 2 existing keys edited. All numeric. All added to existing frozen `BALANCE` object — no new module, no new export.

### Step 2 — Branch FIGHTING damage by role

**File:** `src/simulation/npc/fsm/WorkerStates.js:271` (the FIGHTING tick body)

**Before** (paraphrased — single damage path for all workers):
```js
const dmg = BALANCE.guardAttackDamage;
const cd = BALANCE.workerAttackCooldownSec ?? 1.6; // or whatever the existing key is
target.hp -= dmg;
worker.attackCooldownSec = cd;
```

**After** (role-aware branch):
```js
const isGuard = worker.role === "GUARD";
const dmg = isGuard ? BALANCE.guardAttackDamage : BALANCE.workerAttackDamage;
const cd  = isGuard ? (BALANCE.guardAttackCooldownSec ?? 1.6) : BALANCE.workerAttackCooldownSec;
target.hp -= dmg;
worker.attackCooldownSec = cd;
```

Note: if `guardAttackCooldownSec` does not currently exist (the feedback table shows `Cooldown 1.6` as the worker default with no GUARD-specific key), keep the GUARD branch reading the original cooldown key it was already reading. The functional change is: non-GUARDs now read `workerAttackCooldownSec=2.2` instead of `1.6`. GUARDs unchanged. Damage: GUARDs unchanged (18); non-GUARDs drop 18 → 10.

Atomic edit guarantee: the branch is a single ternary in the existing tick; FIGHTING entry/exit conditions, transition table, and target acquisition all unchanged. R5 PB's "all workers fight back" intent preserved — non-GUARDs still engage, just less effectively.

### Step 3 — Activate saboteur melee in `saboteurTick`

**File:** `src/simulation/npc/VisitorAISystem.js` — locate `saboteurTick` (the feedback references it; line ~521 is the EntityFactory creation site, the tick is in VisitorAISystem).

In the existing tick body, after the saboteur's pathing/state update, add an adjacent-worker melee strike branch:

```js
// PCC R10: saboteurs strike back when adjacent to a worker
if ((entity.attackCooldownSec ?? 0) <= 0) {
  const adjacentWorker = findAdjacentWorker(entity, state); // existing helper or 4-neighbour scan
  if (adjacentWorker) {
    adjacentWorker.hp -= BALANCE.saboteurAttackDamage;
    entity.attackCooldownSec = BALANCE.saboteurAttackCooldownSec;
    // existing damage-event / death-attribution pipeline picks this up automatically
    if (adjacentWorker.hp <= 0) {
      handleWorkerDeath(adjacentWorker, state, { killedBy: "saboteur" });
    }
  }
}
// existing cooldown decrement at end of tick (or top — match existing convention)
entity.attackCooldownSec = Math.max(0, (entity.attackCooldownSec ?? 0) - dt);
```

If `findAdjacentWorker` does not exist verbatim, use the existing predator-target-acquisition helper (predators already do "find nearest worker within reach"); the saboteur reach is 1 tile (adjacency), trivially derivable. If `handleWorkerDeath` is named differently (likely — match existing predator-kill attribution path), use whatever the existing predator-kill site uses; the v0.8.6 Tier 1 fix added `killed-by-worker` attribution semantics — we mirror with `killed-by-saboteur` only if that string already exists in the death-attribution map; otherwise pass `killedBy: "saboteur"` and let downstream code coerce as it does for predators.

Atomic edit guarantee: pure addition to an existing tick. No new state field on `entity` (saboteurs are spawned via `EntityFactory.js:357` which already gives them `hp`; `attackCooldownSec` is the same field workers already use, defaulted-via-`?? 0`). No new event type, no new HUD element.

### Step 4 — Decouple saboteur HP from wall HP

**File:** `src/entities/EntityFactory.js:357`

**Before:**
```js
hp: BALANCE.wallMaxHp, // saboteur reuse — 50
```

**After:**
```js
hp: BALANCE.saboteurMaxHp, // dedicated saboteur HP — 65
```

Atomic. Eliminates the "future wall buff also buffs saboteurs" coupling that drove the original `wallMaxHp` reuse.

### Step 5 — Add combat balance test fixture

**File:** Create `test/combat-balance.test.js` (new test file is permitted under hard-freeze — tests are not gameplay).

Three test cases per the feedback's "Estimated effect" projections:

1. **1 GUARD vs 1 wolf** → GUARD wins at 50–75% HP after wolf lands 1–2 hits. Assertion: `worker.hp >= 50` and `worker.hp <= 75` AND `wolf.hp <= 0` after fight resolution.
2. **1 FARM vs 1 saboteur** → fight takes ≥6 sim-seconds; saboteur lands ≥2 strikes (≥16 dmg total); FARM survives with HP ≥60. Assertion: `worker.hp >= 60` AND `worker.hp <= 85` AND `saboteur.hp <= 0` AND `simSecondsElapsed >= 6`.
3. **5 raiders vs 1 isolated worker** → unchanged (worker still loses fast, design-intent isolation case). Assertion: `worker.hp <= 0` within 8 sim-seconds.

Use existing combat-test scaffolding if present; pattern from `test/worker-combat-*.test.js` family. If no scaffolding exists, build a minimal harness state with a single worker, single hostile, 4-tile separation, and tick `WorkerAISystem.update` + `AnimalAISystem.update` + `VisitorAISystem.update` until either side reaches HP 0.

### Step 6 — Run the suite and confirm green

`node --test test/*.test.js` — baseline 1646 pass / 0 fail / 2 skip. Existing combat tests must stay green; **expected** breaks if any test asserted "non-GUARD worker deals 18 dmg" — that assertion now reflects the bug, not the intent, and should flip to assert the role branch. Note any flips in CHANGELOG.

---

## Suggestions (≥2, ≥1 not freeze-violating)

### Suggestion A (in-freeze, RECOMMENDED) — Steps 1–6 as written

Single ternary in FIGHTING tick + cooldown-gated strike in `saboteurTick` + 5 BALANCE knobs + 1 EntityFactory line + 1 test file. No new entity types, no new combat states, no new UI. Restores GUARD identity, closes kite gap, makes saboteurs sting — all three "Top imbalance" findings addressed.

### Suggestion B (in-freeze, MINIMAL VARIANT) — Skip Step 3 (saboteur strike-back)

If the saboteur melee activation is judged too risky (it changes a noncombatant entity into a combatant, which is the closest this plan comes to a "new mechanic"), ship Steps 1, 2, 4, 5, 6 only. Without Step 3:
- GUARD identity restored (Step 2).
- Predator kite gap closed (Step 1: meleeReach 2.6→2.0, predatorAttackDistance 1.8→2.4).
- Saboteur HP raised 50→65 (Step 1+4) so non-GUARDs need 7 hits at 10 dmg ≈ 15s instead of 3 hits at 18 dmg ≈ 5s.

Saboteurs still don't fight back, but with non-GUARD damage halved and saboteur HP +30%, the "tap to delete" feel is materially blunted (a HAUL worker accidentally aggroing a saboteur now spends 15 seconds away from haul work, which IS a cost — just an opportunity cost rather than an HP cost). The saboteur damage path can be added in v0.10.2 if the post-deploy trace shows sabos still feel trivial.

This is the most conservative read of "no new mechanic." Recommended fallback if reviewer flags Step 3.

### Suggestion C (FREEZE-VIOLATING — flagged, do not ship in R10) — Add saboteur visible health bar + "Engaged" combat marker

The feedback notes saboteurs trigger UI alarm but their death feels anticlimactic. A small floating HP bar on engaged saboteurs would close the loop. **NEW UI panel = freeze violation.** Tagged for v0.10.2.

---

## Acceptance criteria

1. `node --test test/combat-balance.test.js` passes all three cases (Step 5).
2. `node --test test/*.test.js` baseline preserved (with notes for any combat-test assertion flips).
3. Manual repro (Encounter A from feedback): 1 GUARD vs 1 wolf is no longer "wolf takes 4 hits, deals 0 damage." With Step 1's reach changes, wolf lands ≥1 hit and worker exits with HP < 100.
4. Manual repro (Encounter C from feedback): 1 FARM vs 1 saboteur. Without Step 3 (Suggestion B): fight takes >10s and FARM exits with HP 100 but saboteur takes 7 hits not 3. With Step 3 (Suggestion A): FARM exits with HP 60–85 and saboteur lands ≥2 strikes.
5. No new BALANCE *categories*, no new entity types, no new UI elements, no new event types. New BALANCE *keys* (5) are additions to the existing frozen object — config addition only.

## Rollback procedure

`git checkout d2a83b5 -- src/config/balance.js src/simulation/npc/fsm/WorkerStates.js src/simulation/npc/VisitorAISystem.js src/entities/EntityFactory.js && rm test/combat-balance.test.js` reverts cleanly. Saboteur HP reverts to 50 (wallMaxHp), kite gap reopens, GUARD damage parity returns — i.e. R10 state.
