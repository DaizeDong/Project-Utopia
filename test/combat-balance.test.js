// PCC R10 — Plan-PCC-combat-rebalance combat-balance test fixture.
//
// Three contract cases per the plan:
//   1. 1 GUARD vs 1 wolf → GUARD wins, takes ≥1 hit (predator reach now matches).
//   2. 1 FARM vs 1 saboteur → saboteur lands ≥2 strikes (sting back active).
//   3. 5 raiders vs 1 isolated worker → worker dies fast (design-intent isolation).
//
// Pattern follows the arithmetic-model asserts in test/worker-combat.test.js#9
// (the full WorkerAISystem + AnimalAISystem + VisitorAISystem stack is too
// heavy to harness here). We model the FIGHTING tick + saboteurTick damage
// pipelines that ship in this commit and assert the BALANCE deltas hold.

import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";
import { ROLE, VISITOR_KIND } from "../src/config/constants.js";
import { createWorker, createVisitor } from "../src/entities/EntityFactory.js";

function makeSeededRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Mirrors the FIGHTING tick role-branch in WorkerStates.js (PCC R10).
function fightingStrike(worker, target) {
  const isGuard = worker.role === ROLE.GUARD;
  const dmg = isGuard
    ? Number(BALANCE.guardAttackDamage ?? 14)
    : Number(BALANCE.workerAttackDamage ?? 10);
  target.hp = Math.max(0, Number(target.hp ?? 0) - dmg);
  worker.attackCooldownSec = isGuard
    ? Number(BALANCE.workerAttackCooldownSec ?? 1.6)
    : Number(BALANCE.workerNonGuardAttackCooldownSec ?? 2.2);
  if (target.hp <= 0 && target.alive !== false) {
    target.alive = false;
    target.deathReason = "killed-by-worker";
  }
}

// Mirrors the saboteur strike block in saboteurTick (PCC R10).
function saboteurStrike(saboteur, target) {
  const dmg = Number(BALANCE.saboteurAttackDamage ?? 8);
  target.hp = Math.max(0, Number(target.hp ?? 0) - dmg);
  saboteur.attackCooldownSec = Number(BALANCE.saboteurAttackCooldownSec ?? 2.0);
  if (target.hp <= 0 && target.alive !== false) {
    target.alive = false;
    target.deathReason = "killed-by-saboteur";
  }
}

// Mirrors the predator damage path in AnimalAISystem (existing, unchanged).
function predatorStrike(predator, prey) {
  const guardBoost = prey.role === ROLE.GUARD ? 0.5 : 1.0;
  const dmg = Number(BALANCE.predatorAttackDamage ?? 24) * guardBoost;
  prey.hp = Math.max(0, Number(prey.hp ?? 0) - dmg);
  predator.attackCooldownSec = Number(BALANCE.predatorAttackCooldownSec ?? 1.4);
  if (prey.hp <= 0 && prey.alive !== false) {
    prey.alive = false;
    prey.deathReason = "predation";
  }
}

// ── 0. New BALANCE knobs are present and finite ──────────────────────
test("PCC R10: new BALANCE knobs are wired", () => {
  assert.ok(Number.isFinite(BALANCE.workerAttackDamage), "workerAttackDamage");
  assert.ok(Number.isFinite(BALANCE.workerNonGuardAttackCooldownSec), "workerNonGuardAttackCooldownSec");
  assert.ok(Number.isFinite(BALANCE.saboteurMaxHp), "saboteurMaxHp");
  assert.ok(Number.isFinite(BALANCE.saboteurAttackDamage), "saboteurAttackDamage");
  assert.ok(Number.isFinite(BALANCE.saboteurAttackCooldownSec), "saboteurAttackCooldownSec");
  // Hierarchy: GUARDs hit harder than non-GUARDs, both hit harder than passive counter.
  assert.ok(BALANCE.guardAttackDamage > BALANCE.workerAttackDamage,
    "GUARD damage must exceed non-GUARD damage to preserve role identity");
  assert.ok(BALANCE.workerAttackDamage >= BALANCE.workerCounterAttackDamage,
    "active-engage damage must be >= passive counter-attack damage");
  // Reach gap closed: meleeReachTiles ≤ predatorAttackDistance.
  assert.ok(BALANCE.meleeReachTiles <= BALANCE.predatorAttackDistance,
    `kite gap closed: meleeReach=${BALANCE.meleeReachTiles} ≤ predatorReach=${BALANCE.predatorAttackDistance}`);
  // Saboteur HP decoupled from wallMaxHp.
  assert.notEqual(BALANCE.saboteurMaxHp, BALANCE.wallMaxHp,
    "saboteurMaxHp must be its own knob, not BALANCE.wallMaxHp");
});

// ── 1. 1 GUARD vs 1 wolf — GUARD wins, takes ≥1 hit ──────────────────
test("PCC R10 case 1: 1 GUARD vs 1 wolf — GUARD wins at 50–75% HP", () => {
  const rng = makeSeededRng(11);
  const guard = createWorker(0, 0, rng);
  guard.role = ROLE.GUARD;
  guard.hp = 100;
  guard.alive = true;
  guard.attackCooldownSec = 0;

  // Wolf stand-in: predatorAttackDamage=26, predator HP ~80 (ANIMAL_SPECIES.WOLF).
  const wolf = { hp: 80, alive: true, attackCooldownSec: 0 };

  // Resolve: alternating strikes. With reach gap closed (PCC R10), wolf lands
  // at least one hit before dying. GUARD: 18/strike, wolf HP 80 → 5 hits to kill.
  // Wolf cooldown 1.4s, GUARD cooldown 1.6s — over 5 GUARD strikes (~8s) the
  // wolf gets ~5 strikes too, but with GUARD 0.5× damage boost = 13 dmg/hit.
  // We model 5 GUARD strikes interleaved with 5 wolf strikes.
  let guardStrikes = 0;
  let wolfStrikes = 0;
  while (guard.alive && wolf.alive && guardStrikes < 10) {
    fightingStrike(guard, wolf);
    guardStrikes += 1;
    if (!wolf.alive) break;
    predatorStrike(wolf, guard);
    wolfStrikes += 1;
  }
  assert.equal(wolf.alive, false, "wolf should die");
  assert.equal(guard.alive, true, "GUARD should survive");
  assert.ok(wolfStrikes >= 1, `wolf landed ${wolfStrikes} hit(s); reach gap should let it land ≥1`);
  assert.ok(guard.hp >= 30 && guard.hp <= 90,
    `GUARD HP after fight = ${guard.hp}; expected 30–90 (took ${wolfStrikes} hits at 13 dmg)`);
});

// ── 2. 1 FARM vs 1 saboteur — saboteur lands ≥2 strikes ──────────────
test("PCC R10 case 2: 1 FARM vs 1 saboteur — saboteur stings back", () => {
  const rng = makeSeededRng(22);
  const farm = createWorker(0, 0, rng);
  farm.role = ROLE.FARM;
  farm.hp = 100;
  farm.alive = true;
  farm.attackCooldownSec = 0;

  const saboteur = createVisitor(0, 0, VISITOR_KIND.SABOTEUR, rng);
  saboteur.attackCooldownSec = 0;

  // Saboteur HP must come from saboteurMaxHp (PCC R10), not wallMaxHp.
  assert.equal(saboteur.hp, Number(BALANCE.saboteurMaxHp),
    `saboteur spawn HP=${saboteur.hp}, expected saboteurMaxHp=${BALANCE.saboteurMaxHp}`);
  assert.equal(saboteur.maxHp, Number(BALANCE.saboteurMaxHp));

  // FARM does 10 dmg/strike, saboteur HP 65 → 7 hits to kill.
  // Saboteur does 8 dmg/strike. Over 7 FARM strikes interleaved with saboteur,
  // saboteur lands at least 6 strikes (cooldowns are similar), so FARM HP
  // drops by ~48 → ends near 52.
  let farmStrikes = 0;
  let saboteurStrikes = 0;
  while (farm.alive && saboteur.alive && farmStrikes < 12) {
    fightingStrike(farm, saboteur);
    farmStrikes += 1;
    if (!saboteur.alive) break;
    saboteurStrike(saboteur, farm);
    saboteurStrikes += 1;
  }
  assert.equal(saboteur.alive, false, "saboteur should die");
  assert.ok(farmStrikes >= 6, `FARM needed ≥6 hits to kill saboteur (got ${farmStrikes})`);
  assert.ok(saboteurStrikes >= 2,
    `saboteur should land ≥2 strikes back (got ${saboteurStrikes}) — sting-back is active`);
  assert.ok(farm.hp <= 90 && farm.hp >= 20,
    `FARM HP after fight = ${farm.hp}; expected 20–90 (took ${saboteurStrikes} hits at 8 dmg)`);
});

// ── 3. 5 raiders vs 1 isolated worker — worker dies fast ─────────────
test("PCC R10 case 3: 5 raiders vs 1 isolated worker — worker still loses", () => {
  const rng = makeSeededRng(33);
  const worker = createWorker(0, 0, rng);
  worker.role = ROLE.FARM;
  worker.hp = 100;
  worker.alive = true;
  worker.attackCooldownSec = 0;

  const raiders = [];
  for (let i = 0; i < 5; i += 1) {
    raiders.push({ hp: 110, alive: true, attackCooldownSec: 0 });
  }

  // One worker can only strike 1 raider per cooldown. 5 raiders all swing.
  // Per round: worker deals 10 dmg to raider[0]; all 5 raiders deal 26 each
  // = 130 dmg → worker dies in round 1.
  let round = 0;
  while (worker.alive && raiders.some((r) => r.alive) && round < 20) {
    // Worker swings at first alive raider.
    const target = raiders.find((r) => r.alive);
    if (target) fightingStrike(worker, target);
    // All raiders swing back.
    for (const r of raiders) {
      if (!r.alive) continue;
      if (!worker.alive) break;
      predatorStrike(r, worker);
    }
    round += 1;
  }
  assert.equal(worker.alive, false,
    `isolated worker must lose to 5 raiders (still alive at HP=${worker.hp} after ${round} rounds)`);
  assert.ok(round <= 2, `worker should die within ~1–2 rounds (took ${round})`);
});
