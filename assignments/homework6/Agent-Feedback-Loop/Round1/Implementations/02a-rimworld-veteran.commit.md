---
reviewer_id: 02a-rimworld-veteran
plan_source: Round1/Plans/02a-rimworld-veteran.md
round: 1
date: 2026-04-22
parent_commit: f5c60f5
head_commit: 3d701e8
status: DONE
steps_done: 8/8
tests_passed: 982/984
tests_new: test/role-assignment-quotas.test.js
---

## Steps executed

- [x] Step 1: `src/app/types.js` — added `roleQuotas: {cook,smith,herbalist,haul,stone,herbs}` field to `ControlState` typedef directly after `farmRatio`.
- [x] Step 2: `src/entities/EntityFactory.js` — added default `roleQuotas: { cook:1, smith:1, herbalist:1, haul:1, stone:1, herbs:1 }` in the `controls` init block (preserves byte-equivalent legacy behaviour).
- [x] Step 3: `src/simulation/population/RoleAssignmentSystem.js` — replaced 6 hardcoded `(building>0 && budget>0) ? 1 : 0` slot computations with `(building>0) ? Math.min(quotas[key], specialistBudget) : 0`, sourcing quotas from `state.controls.roleQuotas` with `?? {all:1}` fallback. Gate rules (kitchen/smithy/clinic/quarry/herbGarden for the respective roles, `n>=10 && warehouseCount>=1` for HAUL) preserved.
- [x] Step 4: `index.html` — inserted a `<details class="subpanel">Role Quotas</details>` block after `#farmRatio`. Contains 6 `<input type="range" min="0" max="8" step="1" value="1">` rows with IDs `roleQuotaCook / Smith / Herbalist / Haul / Stone / Herbs` and matching `<span>` labels.
- [x] Step 5: `src/ui/tools/BuildToolbar.js` constructor — grabbed 12 DOM refs (6 inputs + 6 labels).
- [x] Step 6: `src/ui/tools/BuildToolbar.js` — added `#setupRoleQuotaControls()` that binds `input` events on all 6 sliders; writes `state.controls.roleQuotas[key]` clamped to `[0,8]`; invoked from `#setupManagementControls`.
- [x] Step 7: `src/ui/tools/BuildToolbar.js.sync()` — added a `roleQuotas` reflection block that mirrors values back to the 6 slider inputs and text labels using the existing `#setFieldValueIfIdle` pattern.
- [x] Step 8: `test/role-assignment-quotas.test.js` — created 5 test cases: (a) HAUL gate (n<10) disables haulers regardless of quota, (b) quota.haul=3 yields 3 haulers when gate+warehouse satisfied, (c) kitchen gate dominates quota.cook=5, (d) specialistBudget bounds quota.cook=7 at worker budget, (e) default quota=1 path is byte-equivalent.

## Tests

- **Full suite**: `node --test test/*.test.js` → 982 pass / 984 total (2 pre-existing skips, 0 failures).
- **Pre-existing skips**: 2 (baseline, unchanged by this commit).
- **New tests added**: `test/role-assignment-quotas.test.js` (5 cases, all green).
- **Failures resolved during iteration**: 2 test cases in the first pass of `role-assignment-quotas.test.js` mis-assumed that `createInitialGameState` starts with <10 workers and no quarries — actual defaults are 12 workers + 13 quarry tiles + 1 warehouse + 2 lumbers. Fixed by introducing a `setWorkerCount(state, n)` helper that both prunes and pads, and by explicitly pruning worker count below the HAUL gate for the "HAUL gate active" case.
- Legacy `test/role-assignment-system.test.js` (2 cases) still pass — default `roleQuotas` keeps old behaviour.

## Deviations from plan

- **Step 3**: plan showed `Math.min(quotas.cook|0, (kitchenCount > 0 ? quotas.cook|0 : 0), specialistBudget)` which is semantically equivalent to the simpler `(kitchenCount > 0) ? Math.min(quotas.cook, specialistBudget) : 0`. Used the cleaner form and extracted a `q(key)` helper that clamps negatives and coerces to int via `| 0`.
- **Step 6**: plan suggested one bind block per role; collapsed into a `bind(el, key)` helper loop for 6 identical bindings (same semantics, fewer LOC).
- **Step 8**: extended the 2 cases requested in plan §4 to 5 cases (added byte-equivalent regression guard + specialistBudget dominance + HAUL-gate-below-10). The 2 plan-mandated cases are included.
- **No plan step skipped** per summary.md §4/§5 — 02a had no REDUNDANT/CONFLICT decisions (only S4 referenced 01a glossary as an optional enhancer, which is not a blocker; glossary titles were not required for this plan to land).

## Handoff to Validator

- **Benchmark reminder**: `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 365` must still yield DevIndex >= 42 (v0.8.1 baseline 44, -5% floor). Default quotas are byte-equivalent to the legacy hardcoded `1` path, so the expectation is unchanged DevIndex and deaths365. **Not run here** (outside the 55-min budget for Implementer); Validator should run this as part of the regression sweep.
- **Playwright smoke focus**: the new `<details class="subpanel">Role Quotas</details>` sits inside `#settingsFloatingPanel` under the `Map & Doctrine` card, after `#farmRatio`. Worth confirming: (1) the 6 new DOM IDs are reachable in `test/ui-layout.test.js` if that file has an id-whitelist check, (2) sliders render and respond to drag, (3) label text updates live. The `details` element is **not** wrapped in `.pregame-only`, so quotas stay editable mid-session.
- **Snapshot compatibility**: `state.controls.roleQuotas` will be `undefined` when loading a pre-commit slot; `RoleAssignmentSystem` handles this via `?? { cook:1,... }` and the UI `#setupRoleQuotaControls` lazy-inits on first input. `#setFieldValueIfIdle` tolerates missing values. No migration script needed.
- **Freeze compliance**: no new mechanic was added. Every change is a surface of an existing hardcoded value (the "1-per-type" slot cap that lived inline in `RoleAssignmentSystem`). Gating semantics are identical.
