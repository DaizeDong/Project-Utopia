# R10 PCC — Worker vs Raider Combat Balance

**Reviewer**: PLAYABILITY-Combat-Balance (BLIND, Playwright `?dev=1` probe)
**Date**: 2026-05-01
**User report**: "worker 和掠夺者之间的战斗太简单了, 似乎都是 worker 秒杀掠夺者"
**Verdict**: User report is **PARTIALLY VALIDATED** — the issue is NOT that workers globally one-shot raiders, but that the engagement model has **two failure modes** that produce the "easy combat" feel.

---

## 1. Combat Stat Table (extracted from `BALANCE` + `EntityFactory`)

| Entity | HP | Attack DMG | Cooldown (s) | DPS | Reach (tiles) | Source |
|---|---|---|---|---|---|---|
| **Worker** (any role, FARM/WOOD/HAUL/COOK/GUARD) | 100 | **18** | 1.6 | **11.25** | 2.6 (`meleeReachTiles`) | `BALANCE.guardAttackDamage`, `WorkerStates.js:271` |
| Wolf | 80 | 26 | 1.4 | 18.6 | 1.8 (`predatorAttackDistance`) | `EntityFactory.js:368`, `BALANCE.predatorAttackDamage` |
| Bear | 130 | 26 | 2.6 | 10.0 | 1.8 | same |
| Raider-beast | 110 (±15%) | 26 (±15%) | 1.8 (±15%) | ~14.4 | 1.8 | jittered in EntityFactory |
| **Saboteur** | **50** (=`wallMaxHp`) | **0** (no melee) | — | **0** | — | `EntityFactory.js:357`, `VisitorAISystem.js:521` |

**Key code findings**:
- `WorkerStates.js:269-274` (FIGHTING tick): every worker that enters FIGHTING deals `BALANCE.guardAttackDamage = 18`. **There is no separate `workerAttackDamage` — non-GUARDs in FIGHTING hit just as hard as GUARDs.**
- `WorkerTransitions.js:53-59` (R5 PB rename): the priority-0 COMBAT_PREEMPT row was widened from `hostileInAggroRadiusForGuard` to `hostileInAggroRadius`. **Every worker, regardless of role, preempts to FIGHTING when a hostile enters `guardAggroRadius = 12` tiles.** GUARD-specific behaviour reduces to the RoleAssignmentSystem draft headcount; combat damage / engagement is identical.
- The legacy `BALANCE.workerCounterAttackDamage = 9` (passive retaliation when hit) still exists in `AnimalAISystem.js:977`, but it is now nearly unreachable — workers fight back actively at 18 dmg before passive retaliation triggers.

---

## 2. Per-Encounter Resolution Times (live Playwright probe)

### Encounter A — 1 GUARD (worker_4) vs 1 Wolf (HP 80, dmg 26, range 1.8)
| t (s) | Wolf HP | Worker HP | dist | state |
|---|---|---|---|---|
| 95.67 | 62 | 100 | 2.77 | FIGHTING |
| 96.47 | 44 | 100 | 1.43 | FIGHTING |
| 97.27 | 26 | 100 | 1.65 | FIGHTING |
| 98.70 | 8 | 100 | 2.43 | FIGHTING |
| 99.27 | 8 | **100** | 2.76 | FIGHTING |

**Wolf takes 4 hits in ~3.6s of melee, deals ZERO damage**. Worker reach (2.6) > wolf reach (1.8), and the worker's `desiredVel = followPath(...)` while attacking causes oscillation at distance 1.0–4.5 — wolf rarely pins inside its 1.8 reach.

### Encounter B — 1 isolated worker (worker_2 WOOD, no GUARD draft) vs **5 raider-beasts** (HP 99-126, dmg 24-29)
- Start: 12 workers alive; raiders spawned at distance 1.5.
- After ~28s sim time: **5 workers dead** (worker_1, _2, _3, _7, _10), worker_11 at HP 52, all 5 raiders alive. Raider HP roll: 108→54, 113→77, 111→93, 99→81, 103→103 (untouched).
- **Raiders TPK'd half the colony with only 1 raider taking >30% dmg. None died.**

### Encounter C — 1 worker vs 1 saboteur (HP 50, dmg 0)
- Saboteur removed within < 5 sim seconds. Worker: HP 100 unchanged. **3 worker hits (18×3=54) > 50 HP ⇒ dead in ≈3.2s of melee, 0 worker damage.**

---

## 3. Diagnosis — Why Combat Feels "Too Easy"

The user's perception is correct for the cases the player actually *sees and reacts to*:

1. **Saboteurs are noncombatants** but get drafted into `combat.activeSaboteurs` and trigger GUARD spawns + UI alarm. Player sees "Threat!" → drafts GUARDs → saboteur evaporates in 3 hits with no risk. R8 PT increased saboteur draft, amplifying this — more saboteurs = more "free kill" feel.

2. **Worker melee reach (2.6) > predator reach (1.8)**. Combined with `followPath` micromovement during FIGHTING, GUARDs can kite wolves/bears — Encounter A shows 4 wolf-hits taken at distances 1.43–2.77, all of which are inside worker reach but mostly outside wolf reach (1.8). The wolf's `chaseDistanceMult: 1.0` (in `AnimalAISystem.js:33`) keeps it at preferred chase distance but workers attack from 0.8 tiles further.

3. **No role differentiation in damage**. The R5 PB widening of `COMBAT_PREEMPT` was a fairness fix (a FARM worker getting eaten should fight back), but it accidentally collapsed GUARDs into "just regular workers with priority draft" — a HAUL worker bumping into a saboteur kills it just as fast as a 4-pop GUARD detail.

4. **The dangerous case (Encounter B) is invisible**: when raiders meet an isolated unsupported worker far from base, the worker dies near-instantly (4 hits ≈ 7s). This is the v0.8.5 design intent. But because BALANCE.guardAttackDamage = 18 stacks linearly when ≥2 workers swarm a raider, **2 workers vs 1 raider DPS = 22.5 vs ~14.4 = decisive worker win in ~5s**, while raider needs 4 hits = ~7s on each worker. **The colony almost always has ≥2 workers near a contact**, so the isolated case rarely surfaces.

---

## 4. Top Imbalance Ranking

1. **Saboteur HP = 50, attackDamage = 0**: most-visible imbalance; user almost certainly means *this* by "秒杀掠夺者" (saboteurs ARE the visible "raid" event). Three worker hits, zero risk, with confetti UI.
2. **Worker melee reach 2.6 vs predator reach 1.8** (+44%): kiting is mathematically free in FIGHTING.
3. **Worker DPS 11.25 ≈ raider DPS 14.4** but worker HP 100 ≈ raider HP 110 + workers stack. 2-worker swarm wins decisively.
4. **No role differentiation**: every worker is a 11.25-DPS swordsman; FARM === GUARD in combat, undermining the GUARD identity.

---

## 5. Suggested BALANCE Knob Adjustments

Tuning targets: 1 GUARD vs 1 wolf should be a coin-flip; 1 saboteur should require commitment to neutralize; non-GUARD workers should fight back but be inferior.

| Knob | Current | Proposed | Rationale |
|---|---|---|---|
| `BALANCE.saboteurAttackDamage` (NEW field) | n/a (0) | **8** per 2.0s | Saboteurs sting back when engaged; player must commit ≥2 workers, not single-tap them. Add to `VisitorAISystem.js` saboteurTick: when adjacent to a worker AND `attackCooldownSec ≤ 0`, deal damage and reset cooldown. |
| Saboteur HP (`wallMaxHp` reuse) | 50 | **65** (split: introduce `BALANCE.saboteurMaxHp` so wallMaxHp doesn't drift) | 4 hits not 3 — gives the saboteur time to land its own dmg. |
| `BALANCE.meleeReachTiles` | 2.6 | **2.0** | Closes the kiting gap with predator reach 1.8. |
| `BALANCE.guardAttackDamage` (GUARD only) | 18 | **18** (keep) | GUARD identity preserved. |
| `BALANCE.workerAttackDamage` (NEW — non-GUARD) | n/a (=18) | **10** | Restore role differentiation. WorkerStates.js:271 should branch: `worker.role === 'GUARD' ? guardAttackDamage : workerAttackDamage`. Non-GUARD still fights back (R5 intent preserved) but ≈2/3 the DPS. |
| `BALANCE.workerAttackCooldownSec` (non-GUARD) | 1.6 | **2.2** for non-GUARD | Further softens unintended FARMer-bear-killer cases. |
| `BALANCE.predatorAttackDistance` | 1.8 | **2.4** | Predator can reach as far as a GUARD. Eliminates oscillation kite. |
| `BALANCE.raiderStatsVariance` | 0.15 | 0.15 (keep) | Already balanced. |

**Estimated effect on Encounter A (1 GUARD v 1 wolf)**: with reach parity + raised `predatorAttackDistance`, wolf lands 1-2 hits = 26-52 dmg before dying ⇒ GUARD wins at 50-75% HP. Coin-flip restored.

**Estimated effect on Encounter C (1 FARM v 1 saboteur)**: FARM dmg 10, cooldown 2.2s ⇒ ~7s to drop a 65-HP saboteur. Saboteur with 8-dmg/2.0s ⇒ ~3 strikes back = 24 dmg. Worker survives at HP ~76. No more "tap to delete".

**Estimated effect on Encounter B (5 raiders v isolated worker)**: unchanged (worker still loses fast — design-intent for unsupported isolation).

---

## 6. Files Touched For Proposed Fix

- `src/config/balance.js` — add `saboteurMaxHp`, `saboteurAttackDamage`, `workerAttackDamage`, split cooldowns; bump `meleeReachTiles`, `predatorAttackDistance`.
- `src/entities/EntityFactory.js:357` — use `BALANCE.saboteurMaxHp` instead of `BALANCE.wallMaxHp`.
- `src/simulation/npc/fsm/WorkerStates.js:271` — branch dmg/cooldown by `worker.role === 'GUARD'`.
- `src/simulation/npc/VisitorAISystem.js` (`saboteurTick`) — add adjacent-worker melee strike when `attackCooldownSec ≤ 0`.
- Tests: add `test/combat-balance.test.js` asserting 1 GUARD v 1 wolf is a 40-60% HP win, 1 FARM v 1 saboteur takes ≥6 sim-seconds with ≥15 worker dmg taken.
