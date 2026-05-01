import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// v0.10.1-n (A7-rationality-audit R1) — visitor / animal entities falling
// into the entity-focus list must render their `kind` (saboteur, trader,
// predator, herbivore) instead of a bare "-" so the player can recognise
// hostile presence before the death toast.
//
// This test asserts the source-level contract: the worker-list row
// rendering must contain the kind-fallback branches for VISITOR and
// ANIMAL types, AND must preserve the original `w.role` path for normal
// workers (regression lock).

const SRC = fs.readFileSync("src/ui/panels/EntityFocusPanel.js", "utf8");

test("worker-list row injects (kind) suffix for VISITOR entities with no role", () => {
  // The VISITOR branch must lower-case the kind and wrap it in parens so
  // it reads "(saboteur)" / "(trader)" instead of "SABOTEUR".
  assert.match(
    SRC,
    /wType\s*===\s*"VISITOR"/,
    "missing VISITOR branch in worker-list role suffix logic",
  );
  assert.match(
    SRC,
    /String\(w\.kind\s*\?\?\s*"VISITOR"\)\.toLowerCase\(\)/,
    "VISITOR branch must lower-case the kind for player-friendly display",
  );
});

test("worker-list row injects (kind) suffix for ANIMAL entities with no role", () => {
  assert.match(
    SRC,
    /wType\s*===\s*"ANIMAL"/,
    "missing ANIMAL branch in worker-list role suffix logic",
  );
  assert.match(
    SRC,
    /String\(w\.kind\s*\?\?\s*"ANIMAL"\)\.toLowerCase\(\)/,
    "ANIMAL branch must lower-case the kind for player-friendly display",
  );
});

test("worker-list row preserves original w.role path for actual workers (regression lock)", () => {
  // The fallback must only kick in when role is missing. A worker with
  // role="FARM" must render the role string verbatim — not "(worker)".
  assert.match(
    SRC,
    /const\s+hasRole\s*=\s*rawRole\s*!==\s*undefined/,
    "regression: hasRole guard must short-circuit the kind-fallback path",
  );
  assert.match(
    SRC,
    /let\s+roleSuffix\s*=\s*String\(rawRole\s*\?\?\s*"-"\)/,
    "regression: default roleSuffix must remain rawRole (or -) so workers with FARM/LOG/etc. render unchanged",
  );
});

test("worker-list row still composes role with groupMeta shortLabel (existing format preserved)", () => {
  // The "<groupShortLabel> / <roleSuffix>" structure (e.g. "Hungry / FARM"
  // or "Hungry / (saboteur)") must be preserved so layout / a11y snapshots
  // do not shift.
  assert.match(
    SRC,
    /entityFocusGroupMeta\(row\.groupId\)\.shortLabel\}\s*\/\s*\$\{roleSuffix\}/,
    "row composition must keep the '<group> / <role>' template shape",
  );
});
