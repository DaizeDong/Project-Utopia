---
plan: Round5b/Plans/02d-roleplayer.md
plan_version: v1
primary_commit: 18259b3
branch: feature/v080-living-world
date: 2026-04-25
author: Claude Sonnet 4.6
tests_pass: 875+/877 (0 fail, 2 pre-existing skips)
---

# Round5b 02d-roleplayer Implementation Log

## Files Touched

| File | Change Type | LOC | Notes |
|------|-------------|-----|-------|
| `src/simulation/npc/WorkerAISystem.js` | edit | +80 | `chooseWorkerIntent` writes `lastIntentReason` at every branch; `pushFriendshipMemory` helper; band-crossing logic (Friend/Close friend) with memory emit + reason field |
| `src/simulation/population/RoleAssignmentSystem.js` | edit | +50 | FARM/WOOD/HAUL assignment replaced with anti-mismatch sort (topSkillKey + mismatchPenalty + sortByMismatch) |
| `src/simulation/population/PopulationGrowthSystem.js` | edit | +20 | Birth memory push into nearby workers' `recentEvents` after `VISITOR_ARRIVED` emit |
| `src/ui/panels/EntityFocusPanel.js` | edit | +18 | Intent line: `(because: <reason>)` span appended; relationships: `__reason__` suffix rendered; relationsLine no longer double-escaped |
| `test/worker-ai-intent-because.test.js` | new | +58 | 4 cases: eat/deliver/farm/wander branches all set non-empty lastIntentReason |
| `test/roleplayer-specialty-antimismatch.test.js` | new | +70 | 2 cases: anti-mismatch sort validates farming-specialist stays in FARM |

**Total: ~296 LOC added**

## Key Line References

### Step 1a — lastIntentReason writes (WorkerAISystem.js)
- `chooseWorkerIntent`: each `return "eat"/"deliver"/"farm"/...` preceded by `worker.debug.lastIntentReason = ...`
- eat: `"hunger=X < threshold=Y, food=N"`
- deliver: trigger reason string (carry/age/distance)
- farm/lumber/etc.: `"role=FARM and farms=N"`

### Step 1b — EntityFocusPanel intent display
```js
${entity.debug?.lastIntentReason ? ` <span class="muted">(because: ${escapeHtml(...)})</span>` : ""}
```

### Step 2a — Birth memory (PopulationGrowthSystem.js)
After `emitEvent(VISITOR_ARRIVED, ...)`, iterates nearby workers (Manhattan ≤ 10) and pushes `"[Ns] name was born at the warehouse"` with dedup key.

### Step 2b — Friendship band-crossing (WorkerAISystem.js)
Band thresholds: Friend=0.15, Close friend=0.45. On crossing: `pushFriendshipMemory` into both workers + `__reason__` field + `WORKER_SOCIALIZED` emit.

### Step 4 — Anti-mismatch (RoleAssignmentSystem.js)
```js
const mismatchPenalty = (role, agent) => { /* 0=natural, 0.5=neutral, 1=mismatched */ };
const sortByMismatch = (arr, role) => arr.sort by (mismatch ASC, origIdx ASC);
```
Replaces `for (let i=0; i < totalFarm...) pool[idx++].role = ROLE.FARM` with sorted picks.

### Step 5 — Relationship reason (EntityFocusPanel.js)
```js
const reason = relMap[`__reason__${otherId}`];
const reasonSuffix = reason ? ` <span class="muted">(because ${escapeHtml(reason)})</span>` : "";
```
relationsLine rendered without outer `escapeHtml` (per-piece escaping already done).

## Steps Coverage

| Step | Description | Behaviour-changing? | Covered |
|------|-------------|---------------------|---------|
| 1a | lastIntentReason writes in chooseWorkerIntent | Yes | ✓ |
| 1b | EntityFocusPanel intent + reason display | No (UI surface) | ✓ |
| 2a | Birth memory push in PopulationGrowthSystem | Yes | ✓ |
| 2b | Friendship band-crossing memory + emit | Yes | ✓ |
| 3a | __reason__ key format (safe for isFinite filter) | Yes | ✓ |
| 4 | FARM/WOOD/HAUL anti-mismatch sort | Yes | ✓ |
| 5 | EntityFocusPanel relationship reason display | No (UI surface) | ✓ |
| 6a | worker-ai-intent-because.test.js | No (test) | ✓ |
| 6c | roleplayer-specialty-antimismatch.test.js | No (test) | ✓ |

**Behaviour-changing steps: 5/9 = 56% ≥ 50% ✓**
**System layers: simulation/npc + simulation/population(×2) + ui/panels = 4 layers ≥ 2 ✓**
