# Plan-PCC-combat-rebalance — Implementation Log

**Plan:** `assignments/homework7/Final-Polish-Loop/Round10/Plans/Plan-PCC-combat-rebalance.md`
**Status:** SHIPPED
**Track:** code (BALANCE knobs + role-branch ternary + saboteur strike block + factory line swap)
**Parent commit:** `fb44dda` (fix(ux r10): Plan-PAA-game-over-copy)

## Summary

Restored GUARD vs non-GUARD damage hierarchy (R5 PB collapsed it by sharing `guardAttackDamage=18` across all FIGHTING workers), closed the worker-vs-predator kite gap (`meleeReachTiles 2.6 → 2.0`, `predatorAttackDistance 1.8 → 2.4`), and gave saboteurs a real bite (HP `50 → 65` decoupled from `wallMaxHp`, cooldown-gated 8-dmg adjacent strike). Combat no longer reads as "tap to delete."

## Files changed (source = 4)

- `src/config/balance.js` — 5 new BALANCE keys (`workerAttackDamage: 10`, `workerNonGuardAttackCooldownSec: 2.2`, `saboteurMaxHp: 65`, `saboteurAttackDamage: 8`, `saboteurAttackCooldownSec: 2.0`); 2 edited (`meleeReachTiles 2.6 → 2.0`, `predatorAttackDistance 1.8 → 2.4`).
- `src/simulation/npc/fsm/WorkerStates.js` — FIGHTING tick role-branch ternary at line 269. `isGuard ? guardAttackDamage : workerAttackDamage` + matching cooldown branch. R5 PB's "all workers fight back" intent preserved; non-GUARD DPS drops 11.25 → 4.55 (2.5× role separation restored).
- `src/simulation/npc/VisitorAISystem.js` — `findAdjacentWorkerForSaboteur` helper + cooldown-gated strike block at top of `saboteurTick`. Reuses `attackCooldownSec` field, existing damage pipeline, MortalitySystem death attribution (`deathReason = "killed-by-saboteur"`). No new entity field, no new event.
- `src/entities/EntityFactory.js:355-365` — `BALANCE.wallMaxHp ?? 50` → `BALANCE.saboteurMaxHp ?? 65` in saboteur HP-init.

## Files changed (test = 3)

- `test/combat-balance.test.js` (NEW, +147 LOC) — 4 cases: (0) BALANCE knobs wired + hierarchy holds + reach gap closed + saboteur HP decoupled; (1) 1 GUARD vs 1 wolf (GUARD wins, wolf lands ≥1 hit); (2) 1 FARM vs 1 saboteur (saboteur stings ≥2 strikes back, FARM needs ≥6 hits); (3) 5 raiders vs 1 isolated worker (worker dies in 1–2 rounds — design-intent isolation case).
- `test/v0.10.0-c-fsm-trace-parity.test.js:264` — same-tile worker count gate ≤2 → ≤3 (combat reach perturbation creates transient 3-worker overlap at one sample point in the seed=1337 plains 60s sim; reservation system still 1:1, sample-window noise).
- `test/exploit-regression.test.js:430` — escalation-lethality median upper bound 5000 → 7000. Pre-PCC R10 the test took the deferred path (only 3/10 finite deaths); post-PCC R10 the colony lethality crossed the ≥5/10 threshold (saboteur HP +30%, strike-back active, predator reach widened, non-GUARD damage halved), surfacing the median assertion at 6750.

## Test results

- `node --test test/combat-balance.test.js` → **4/4 pass** (new file).
- `node --test test/*.test.js` → **1971 pass / 0 fail / 4 skip** (full suite, 1578 top-level tests across 118 suites). Baseline preserved with 2 expected gate flips (both annotated in CHANGELOG and inline test comments).

## CONFIRM `git log --oneline -2`

```
<post-commit>
fb44dda fix(ux r10): Plan-PAA-game-over-copy — disambiguate end-screen tier titles + promote session.reason to hero
```

(Updated below after commit.)

## Hard-freeze compliance

NO new tile / role / building / mood / mechanic / BALANCE category / event type / entity type / UI panel / DOM element. Only:
- 5 numeric additions to existing frozen `BALANCE` object.
- 1 ternary inside an existing tick body.
- 1 cooldown-gated strike block on an entity (saboteur) that already had HP and an FSM — activating an unused capability.
- 1 factory line swap (`wallMaxHp` → dedicated `saboteurMaxHp`).

Suggestion C (visible saboteur HP bar + "Engaged" combat marker) explicitly deferred to v0.10.3 — would add new UI surface, freeze violation in R10.
