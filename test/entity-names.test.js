// v0.8.2 Round-0 02d-roleplayer (Step 7) — Visitor identity tests.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/02d-roleplayer.md
//
// 01e-innovation landed WORKER_NAME_BANK + deterministic worker naming and
// covered it in test/entity-factory.test.js. 02d extends the same pattern to
// visitors (traders and saboteurs) so the "XXX-217 sabotaged your barn"
// narrative line reads as a character, not a row id. These tests guard:
//   (a) TRADER_NAME_BANK / SABOTEUR_NAME_BANK are frozen non-empty arrays of
//       capitalised short names (same shape contract as WORKER_NAME_BANK);
//   (b) createVisitor.displayName follows "<Name>-<seq>" and comes from the
//       correct bank for the given kind;
//   (c) same deterministic seed → same visitor name (snapshot determinism);
//   (d) 30 visitors of one kind yield enough name diversity that the HUD
//       doesn't just show the same "Mercer" three times in a row.

import test from "node:test";
import assert from "node:assert/strict";

import {
  createVisitor,
  TRADER_NAME_BANK,
  SABOTEUR_NAME_BANK,
} from "../src/entities/EntityFactory.js";
import { VISITOR_KIND } from "../src/config/constants.js";
import { resetIdsForTest } from "../src/app/id.js";

function seededRandom(seed = 1337) {
  let s = Number(seed) >>> 0;
  if (!s) s = 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("TRADER_NAME_BANK and SABOTEUR_NAME_BANK are frozen arrays of capitalised short names", () => {
  for (const bank of [TRADER_NAME_BANK, SABOTEUR_NAME_BANK]) {
    assert.ok(Array.isArray(bank));
    assert.ok(Object.isFrozen(bank));
    assert.ok(bank.length >= 20, `visitor bank too small: ${bank.length}`);
    for (const name of bank) {
      assert.match(name, /^[A-Z][a-z]+$/, `bank entry "${name}" must be capitalised + lowercase tail`);
    }
  }
});

test("createVisitor(TRADER).displayName is drawn from TRADER_NAME_BANK with seq suffix", () => {
  resetIdsForTest();
  const rng = seededRandom(42);
  const trader = createVisitor(0, 0, VISITOR_KIND.TRADER, rng);
  assert.match(trader.displayName, /^[A-Z][a-z]+-\d+$/);
  const baseName = trader.displayName.split("-")[0];
  assert.ok(TRADER_NAME_BANK.includes(baseName), `"${baseName}" not in TRADER_NAME_BANK`);
  assert.strictEqual(trader.kind, VISITOR_KIND.TRADER);
});

test("createVisitor(SABOTEUR).displayName is drawn from SABOTEUR_NAME_BANK with seq suffix", () => {
  resetIdsForTest();
  const rng = seededRandom(42);
  const saboteur = createVisitor(0, 0, VISITOR_KIND.SABOTEUR, rng);
  assert.match(saboteur.displayName, /^[A-Z][a-z]+-\d+$/);
  const baseName = saboteur.displayName.split("-")[0];
  assert.ok(SABOTEUR_NAME_BANK.includes(baseName), `"${baseName}" not in SABOTEUR_NAME_BANK`);
  assert.strictEqual(saboteur.kind, VISITOR_KIND.SABOTEUR);
});

test("createVisitor is deterministic: identical seed → identical displayName", () => {
  resetIdsForTest();
  const rngA = seededRandom(99);
  resetIdsForTest();
  const rngB = seededRandom(99);
  const a = createVisitor(0, 0, VISITOR_KIND.TRADER, rngA);
  resetIdsForTest();
  const b = createVisitor(0, 0, VISITOR_KIND.TRADER, rngB);
  assert.strictEqual(a.displayName, b.displayName);
});

test("creating 30 traders produces at least 8 distinct base names", () => {
  resetIdsForTest();
  const rng = seededRandom(1234);
  const names = new Set();
  for (let i = 0; i < 30; i += 1) {
    const v = createVisitor(0, 0, VISITOR_KIND.TRADER, rng);
    names.add(v.displayName.split("-")[0]);
  }
  assert.ok(names.size >= 8, `expected >= 8 distinct trader names, got ${names.size}`);
});
