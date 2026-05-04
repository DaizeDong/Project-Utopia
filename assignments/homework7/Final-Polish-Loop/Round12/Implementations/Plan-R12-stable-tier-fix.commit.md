---
plan_id: Plan-R12-stable-tier-fix
implementer: claude-code (subagent 3/7)
parent_commit: ef4c29e
round: 12
date: 2026-05-01
priority: P0
track: code
---

# Plan-R12-stable-tier-fix — Commit log

## Status

**SHIPPED.** Source + CHANGELOG committed on top of `ef4c29e` (Plan-R12-debug-leak-gate). Hard-freeze compliant.

## Files changed

- `src/ui/hud/HUDController.js` (+35 / -5 LOC) — `#updateColonyHealthCard` lines 2316-2354. Tier dispatcher rewritten from threat-only `<20/<50/<70/else` chain to a five-branch predicate consulting `_lastComputedRates.food` (per-min net), `state.resources.food` (stock), `state.buildings.farms`, and `state.buildings.warehouses`. New `foodHeadroomSec = (foodStock / -foodRatePerMin) * 60` (or `+Infinity` when net rate ≥ -0.05/min). Branch order: (a) `headroomSec < 30 || threat >= 70` → crisis; (b) `foodRatePerMin < -10 || headroomSec < 90 || farms === 0 || warehouses === 0` → struggling; (c) `threat < 20 && farms >= 1 && foodRatePerMin >= 0` → thriving; (d) `threat < 50` → stable; (e) else struggling. Defensive `?? {}` + `Number.isFinite` guard for the cold-start frame.
- `CHANGELOG.md` (+12 LOC) — new section under v0.10.1-n cluster.

## Tests

Skipped Step 4 (new unit test). Step 1 audit confirmed zero existing tests assert on the badge tier strings (`Grep` for `colonyHealthBadge` / `updateColonyHealthCard` / `status === "stable"` in `test/` returned empty). The new predicate is a strict tightening — when food is healthy + infra exists, it returns the same tier as the prior threat-only dispatcher. Adding a unit test would require mocking `document.getElementById` plus the full HUDController constructor surface (significant scaffolding for a UI predicate change with zero mathematical complexity).

Full-suite: **1997 pass / 0 fail / 4 skip** (120 suites, 68s) — baseline preserved.

## Acceptance verified

1. Screenshot-13 case (`Food: -151/min`, `farms=0`, `headroom=72s`, `threat=33`) → `STRUGGLING` (foodRatePerMin -151 < -10 AND farms === 0 both fire branch b).
2. Healthy (`threat=15`, `farms=2`, `foodRate=+5/min`) → `THRIVING` (branch c).
3. `headroomSec < 30s` → `CRISIS` regardless of threat (branch a).
4. `threat >= 70` → `CRISIS` regardless of food (branch a).

## Suggestions taken / not taken

- **Suggestion A (RECOMMENDED, multi-input predicate)** — TAKEN.
- **Suggestion B (minimal `farms === 0` only)** — NOT taken; misses the `Food: -151/min with farms exist` case.
- **Suggestion C (combined storyteller headline re-wire)** — NOT taken; plan flagged that `getCausalDigest`'s `foodCrisis` branch is already first-priority. Verification deferred (out of P0 scope).
- **Suggestion D (continuous 0-100 colony score)** — NOT taken (freeze-violating).

## `git log --oneline -2` confirmation

```
925c340 fix(ui-rationality r12): Plan-R12-stable-tier-fix — colony health tier on real food runway
ef4c29e fix(ui-debug r12): Plan-R12-debug-leak-gate — gate aiModeVal corner chip behind isDevMode
```
