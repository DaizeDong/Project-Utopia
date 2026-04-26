---
round: 8
stage: B
date: 2026-04-26
source: Round8/Feedbacks/summary.md
status: ACCEPTED
---

# Round 8 Stage B - Plan Summary

## Accepted Scope

Round 8 focuses on four small, testable loops instead of broad redesign:

| Plan | Priority | Status | Implementation target |
|------|----------|--------|-----------------------|
| manual-objective-feedback | P0 | ACCEPTED | Build failures, hover hints, route/depot completion messages |
| autopilot-plan-card | P0 | ACCEPTED | HUD next-action ownership and expected outcome copy |
| starvation-diagnostics | P0 | ACCEPTED | Worker focus food diagnosis and death context explanation |
| character-memory-traits | P1 | ACCEPTED | Durable worker history, family names, behavior-facing trait copy |

## Deferred

| Item | Reason |
|------|--------|
| `01c-ui` blank-page finding | 9 of 10 blind reviewers loaded the same URL successfully; treat as a reviewer runtime/tool isolation anomaly unless reproduced locally. |
| Economy rebalance | Needs benchmark pass after feedback loops are legible. |
| New buildings or threats | Would expand scope without fixing the main control/diagnosis gap. |
| Full AI personality rewrite | Current issue is visibility of decisions, not enough evidence that core policy needs replacement. |

## Implementation Order

1. Add player-language recovery strings to build previews and failed placement toasts.
2. Emit scenario objective confirmations when repaired routes or reclaimed depots increase.
3. Make the next-action HUD state whether it is manual guidance or autopilot execution, including why-now and expected-outcome text.
4. Add worker food diagnosis to the focus panel.
5. Record durable worker history for births, death witnesses, and relationship memories.
6. Update character panel trait/family copy so traits and lineage have visible gameplay meaning.

## Validation

Targeted tests:

```powershell
npm test -- --run test/build-toast-feedback.test.js test/build-hint-reasoned-reject.test.js test/progression-milestone.test.js test/hud-next-action.test.js test/entity-focus-relationships.test.js test/entity-focus-player-view.test.js
```

If the targeted suite passes, run broader smoke tests only if time remains because full long-horizon validation is expensive.
