---
reviewer_id: A7-rationality-audit
reviewer_tier: A
plan_source: Round3/Plans/A7-rationality-audit.md
round: 3
date: 2026-05-01
parent_commit: ffa012f
head_commit: c4b526d
track: code
priority: P0 + P1
status: GREEN
---

## Summary

Round-3 A7 rationality audit closes 1 P0 (heat-lens "supply surplus" vs
starvation contradiction), 2 P1s (autopilot Goal-reached cap, Threat
scale anchor), and confirms the remaining 2 P0s (tile-inspector key
hint, T overlay cycle) were already resolved by A3 R3 (`3f87bf4`) +
SceneRenderer R2.

## Files Changed

| File | Δ | Purpose |
|---|---|---|
| `src/render/PressureLens.js` | +28 / −2 | Context-sensitive heat-lens label (P0) |
| `src/simulation/meta/ColonyDirectorSystem.js` | +35 / 0 | Autopilot Goal-reached cap (P1 #5) |
| `src/ui/hud/HUDController.js` | +5 / −1 | Threat scale anchor "Threat 50% (raid at 80%)" (P1 #7) |
| `test/heat-lens-context-label.test.js` | +95 (new) | 4 test points pinning the label flip |
| `CHANGELOG.md` | +44 | Unreleased section A7 entry |

Total: ~+207 / −3 LOC across 5 files (planning estimate was +60 / −25 + 1 test).

## Decisions

- **Plan Step 1 (TileInspector hint)** — already done by A3 R3
  (`3f87bf4`, SceneRenderer.js line 2259). No-op confirmed; no conflict.
- **Plan Step 2 (T overlay cycle)** — code is already correct
  (`SceneRenderer.toggleTerrainLens()` cycles
  `null → fertility → elevation → connectivity → nodeDepletion → null`,
  `shortcutResolver.js` `KeyT` branch routes to `toggleTerrainLens` action,
  `GameApp.toggleTerrainLens()` flips `_lastAutoOverlay = null` to mark
  user-driven so context overlay won't re-override). No code change needed.
- **Plan Step 3 (heat-lens label)** — implemented. Read `state.agents` for
  any alive WORKER with `hunger < 0.35` (workerHungerSeekThreshold proxy);
  swap RED marker label and tooltip when found. Marker kind/id/priority
  unchanged so dedup + halo paths stay green.
- **Plan Step 4 (autopilot cap)** — implemented in `selectNextBuilds`
  rather than `assessColonyNeeds` so existing planner unit tests stay
  green and the cap acts at the proposal-emit gate. `getScenarioRuntime`
  was already imported. Emergency proposals (priority ≥ 90) bypass the
  cap so food-crisis / recovery branches still fire above scenario goals.
  Skip-only (no toast spam every tick).
- **Plan Step 5 (HUD threat anchor)** — text-only edit:
  `"Threat: 50%"` → `"Threat 50% (raid at 80%)"` in colony-health card.
- **Plan Step 6 (new test)** — `test/heat-lens-context-label.test.js`,
  4 test points (baseline label / flip label / kind-preservation /
  threshold gate at 0.35).
- **Out of scope (per plan)** — KeymapRegistry refactor (Plan §C, C1
  wave); Dev /100 tooltip authoring (no concrete spec).

## Verification

- `node --test test/heat-lens-context-label.test.js` — 4/4 pass.
- `node --test test/heat-lens-*.test.js` — 23/23 pass (no regression in
  halo / coverage / budget / legend / tile-overlay / visual-strength
  suites).
- `node --test test/colony-director.test.js test/autopilot-*.test.js
  test/hud-autopilot-*.test.js` — 45/45 pass (Goal-reached cap doesn't
  break existing director / autopilot contracts).
- `node --test test/hud-controller.test.js test/hud-chip-responsive.test.js
  test/hud-goal-chips.test.js test/colony-planner.test.js
  test/colony-planner-idle-chain.test.js` — 52/52 pass.
- Full suite: **1762 pass / 6 fail / 3 skip / 1771 total** vs baseline
  (parent ffa012f) **1760 pass / 8 fail / 3 skip / 1771 total**.
  Net: **+2 pass, −2 fail** (the new test file existed pre-source-edit
  during stash baseline; with source applied both files agree).
  All 6 fails are pre-existing on parent and out-of-scope for A7
  (`exploit-regression escalation-lethality`, `ResourceSystem
  foodProducedPerMin emit`, `RoleAssignment STONE quota`,
  `RaidEscalator DI=30 tier 3`, `RaidFallbackScheduler popFloor`,
  `v0.10.0-c #2 scenario E walled-warehouse FSM carry-eat`).

## Closure Map

| Plan Item | Status | Note |
|---|---|---|
| P0 TileInspector hint | CLOSED (by A3) | `3f87bf4` SceneRenderer.js |
| P0 Heat-lens supply-surplus context | CLOSED | this commit |
| P1 #4 T overlay cycle | CLOSED (already) | SceneRenderer code already correct |
| P1 #5 Autopilot over-build | CLOSED | this commit |
| P1 #7 Threat scale anchor | CLOSED | this commit |

## Risks / Follow-ups

- The Goal-reached cap reads `scenario.targets.logistics`, which has a
  per-template default `{ warehouses: 2, farms: 4, lumbers: 3, roads:
  20, walls: 0 }`. Templates that intentionally want more
  (riverlands/highlands) override this and are unaffected. Templates
  with no `targets.logistics` field fall through to the default and
  may cap autopilot earlier than v0.10.1-r2; if a long-horizon
  benchmark drops in DevIndex this is the place to dial back.
- Heat-lens hunger threshold (0.35) matches `workerHungerSeekThreshold`
  in `WorkerConditions.js`. If that BALANCE constant moves, the label
  flip threshold should follow; consider sourcing from BALANCE in a
  follow-up.

## Rollback

`git revert <head_commit>` restores parent ffa012f. No DB / file
migrations.
