---
plan: Round5b/Plans/01b-playability.md
plan_version: v2
commit: fbaebb6
branch: feature/v080-living-world
date: 2026-04-24
author: Claude Sonnet 4.6
tests_pass: 1198/1200 (0 fail, 2 pre-existing skips)
---

# Round-6 Wave-1 01b-playability Implementation Log

## Commit Hash

`fbaebb6` — feat(round6 wave-1 01b-structural): bandTable + dynamic farmMin + cannibalise safety valve

## Files Changed

| File | Change Type | LOC Delta | Notes |
|------|-------------|-----------|-------|
| `src/config/balance.js` | edit | ~28 | bandTable structural zeros; comment rework |
| `src/simulation/population/RoleAssignmentSystem.js` | edit | ~32 | dynamic farmMin; inline tryBoost q(role)>=1 gate |
| `test/role-assignment-band-table.test.js` | new | +155 | Step 6 — 9 band semantics tests |
| `test/role-assignment-cannibalise.test.js` | new | +130 | Step 7 — 4 cannibalise valve tests |
| `test/role-assignment-population-scaling.test.js` | edit | ~16 | Step 8 — n=6 test updated for structural zeros |
| `test/role-assignment-system.test.js` | edit | ~48 | Step 8 — industry doctrine test updated for dynamic farmMin |
| `CHANGELOG.md` | edit | +40 | Required per CLAUDE.md convention |

---

## Key Line References (§4.12 FIXED Coverage Delivery)

### F1/F2 — pop=4 allocation loss (smith/herbalist/stone/herbs structurally blocked)

**Root fix: `src/config/balance.js` lines ~258-274 — bandTable structural zeros**

Old bandTable: all bands had `allow: { cook:1, smith:1, herbalist:1, haul:1, stone:1, herbs:1 }` — no blocking, 6 specialists contended for 1 budget slot.

New bandTable:
```
{ minPop: 0, maxPop: 3, allow: { cook: 0, smith: 0, herbalist: 0, haul: 0, stone: 0, herbs: 0 } },
{ minPop: 4, maxPop: 5, allow: { cook: 1, smith: 0, herbalist: 0, haul: 0, stone: 0, herbs: 0 } },
{ minPop: 6, maxPop: 7, allow: { cook: 1, smith: 0, herbalist: 0, haul: 1, stone: 1, herbs: 0 } },
```

**Support fix: `src/simulation/population/RoleAssignmentSystem.js` line ~301-303 — inline tryBoost gated on `q(role) >= 1`**

Prevents pipeline-idle boost from overriding bandTable explicit zeros for the inline path:
```javascript
cookSlots = tryBoost(cookSlots, kitchenCount > 0 && foodStock >= idleThreshold * 2 && q("cook") >= 1);
smithSlots = tryBoost(smithSlots, smithyCount > 0 && stoneStock >= 10 && q("smith") >= 1);
herbalistSlots = tryBoost(herbalistSlots, clinicCount > 0 && herbsStock >= 6 && q("herbalist") >= 1);
```

The `pendingRoleBoost` hint path (LLM emergency override) retains band-override authority per plan Risk 3 decision.

### F3 — Dynamic farmMin (Step 3)

**`src/simulation/population/RoleAssignmentSystem.js` lines ~154-165**

```javascript
const farmMinScaled = Math.floor(targetFarmRatio * n);
const farmMin = Math.max(1, Math.min(n - 1, Math.max(farmMinScaled, 1)));
```

Old: `const farmMin = Math.min(2, n)` — capped at 2 for all pop sizes.
New: scales with `targetFarmRatio * n` so at pop=10 with balanced doctrine farmMin=5 instead of 2.

---

## Steps Coverage

| Step | Status | Deviation |
|------|--------|-----------|
| Step 1 — balance.js bandTable structural zeros | DONE | bandTable was already present with wrong values; replaced with plan-specified zeros |
| Step 2 — computePopulationAwareQuotas band lookup | ALREADY PRESENT | Function already existed and correctly returned band values verbatim; no minFloor promotion in band path |
| Step 3 — dynamic farmMin | DONE | Implemented `floor(targetFarmRatio * n)` formula |
| Step 4 — specialist-cannibalise-FARM safety valve | ALREADY PRESENT | Code from Round-5b Wave-1 already in place; validated by new tests |
| Step 5 — ColonyPlanner low-pop idle-chain threshold | ALREADY PRESENT | Code was already in ColonyPlanner.js from Round-5b Wave-1 |
| Step 6 — test/role-assignment-band-table.test.js | DONE | 9 tests, all pass |
| Step 7 — test/role-assignment-cannibalise.test.js | DONE | 4 tests, all pass |
| Step 8 — update existing tests | DONE | role-assignment-population-scaling n=6 + role-assignment-system industry doctrine |

## Additional Fix (not in plan but required)

**Inline tryBoost band-awareness** (added beyond plan scope): The plan addressed `computePopulationAwareQuotas` returning 0, but the `tryBoost` inline pipeline-idle boost at lines 301-303 was not gated on `q(role)>=1`. It fired whenever `specialistBudget>=1 && building_exists && stock>=threshold`, completely bypassing the band's explicit 0. This caused smith=1 at n=4 in integration tests despite band returning smith=0. Fixed by adding `&& q("smith") >= 1` etc. to each tryBoost gate.

This is a correct extension of the structural fix: the band's explicit zeros must be honoured by ALL allocation paths except the explicit LLM override hint.

## Deviations from Plan

1. **Step 3 (dynamic farmMin) not reverted**: Prior code comment said "Step 3 is retained as a configuration knob but not currently wired." Plan v2 says to implement it. Implemented as specified.

2. **tryBoost band-awareness**: Not in the plan steps but required for correctness. The plan's Risk 3 discussed the `pendingRoleBoost` hint override, not the inline tryBoost. The inline tryBoost is NOT an "LLM emergency override" — it fires automatically when stock thresholds are met. Adding q(role)>=1 gate is consistent with the plan's structural intent.

3. **ColonyPlanner Step 5 already complete**: The low-pop idle-chain threshold was already correctly implemented from Round-5b Wave-1. No change needed.

## Test Results Summary

```
node --test test/*.test.js
# tests 1200
# pass 1198
# fail 0
# skipped 2   (pre-existing)
```

New tests added: 13 total (9 band-table + 4 cannibalise).

## Load-Bearing Constraints (Verified Intact)

- `emergencyOverrideCooks >= 1` — preserved; test confirms cook still activates in emergency (test 9 in band-table)
- `computeEscalatedBuildCost` — not touched
- `ColonyPlanner generateFallbackPlan Priority 1/3.5` kitchen branches — not touched; verified by passing colony-planner-idle-chain.test.js
- `haulMinPopulation` field in balance.js — still present (value=8)
