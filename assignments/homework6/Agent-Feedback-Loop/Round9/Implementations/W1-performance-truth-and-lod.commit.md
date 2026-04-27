---
round: 9
stage: C
wave: W1
plan: performance-truth-and-lod
date: 2026-04-26
commit: "pending final Round9 commit"
status: implemented
source: "Round9/Plans/summary.md"
---

# W1 - performance-truth-and-lod

## Implementation

- `GameLoop` now passes raw frame timing to `GameApp.update()` and `GameApp.render()` while retaining clamped simulation dt.
- `GameApp` computes wall-clock actual speed, observed FPS, raw frame ms, adaptive `performanceCap`, and a lower effective max-step cap under high speed/frame pressure.
- High-load 8x fast-forward now uses larger macro-step `fixedStepSec` values (up to 1/10s at 1000+ entities) so capped frames still advance meaningful sim time instead of only reporting that the target cannot be reached.
- High-load worker, animal, visitor, and boids systems now use cadence LOD while still following active paths between full AI decisions.
- Worker targeting now caches candidate tiles, reuses target occupancy, budgets path requests under extreme total-entity load, and uses spatial hashing for social/relationship scans.
- Worker/Visitor/Animal LOD now considers total entity pressure, not just each subsystem's own count, so mixed 1000-entity stress runs cannot leave expensive decisions at full frequency.
- Boids high-load skipped ticks keep simple movement, but the next flock solve no longer double-integrates skipped time; flock solve cadence is expressed as target wall-clock Hz under 8x.
- Animal AI uses local spatial queries at high counts; A* avoids dynamic-cost lookup work when no dynamic costs are present.

## Files

- `src/app/GameApp.js`
- `src/app/GameLoop.js`
- `src/simulation/npc/WorkerAISystem.js`
- `src/simulation/npc/AnimalAISystem.js`
- `src/simulation/npc/VisitorAISystem.js`
- `src/simulation/movement/BoidsSystem.js`
- `src/simulation/navigation/AStar.js`
- `src/simulation/ai/brains/NPCBrainSystem.js`
- `test/worker-ai-lod-budget.test.js`
- `test/boids-traffic.test.js`

## Validation Evidence In Diff

- Runtime debug fields were added for worker/animal/visitor/boids LOD so high-load cadence can be inspected.
- Added regression coverage for total-entity WorkerAI LOD budgeting and Boids no-double-integration behavior.
- The accepted `src/app/simStepper.js` target was implemented at the `GameApp` call site by passing an adaptive `maxSteps` value into the existing step planner rather than changing that file.
