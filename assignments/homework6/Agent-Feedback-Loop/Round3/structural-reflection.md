---
round: 3
date: 2026-04-23
base_commit: 53da600
purpose: "Explain why Rounds 0-2 did not produce essential improvement, and define Round 3 selection bias."
---

# Round 3 Structural Reflection

## Why Rounds 0-2 Were Not Essential

Rounds 0-2 improved surface comprehension: the player can now click more reliably, see more HUD state, read stronger storyteller text, understand Heat Lens colors, and receive clearer death/milestone/resource feedback. These changes reduced friction, but they did not materially change the underlying game loop.

The evidence is the benchmark: after two UX-heavy rounds and one stabilization fix, the long-horizon `temperate_plains` benchmark still sits at DevIndex `37.77`, deaths `157`, survival score `20070`, matching the Round 1/Round 2 baseline. The game is more legible, but the colony outcome is almost unchanged.

The reason is structural:

1. **The player still lacks a reliable early action loop.** The UI says more, but the first 5-10 minutes still do not force a coherent sequence such as food -> storage -> route -> defense -> recovery. The player receives signals but not enough causal leverage.
2. **The simulation economy still contains the same carrying/deposit/eating bottleneck.** Prior rounds surfaced shortages, routes, Heat Lens pressure, and deaths, but did not change the flow of food, depot use, travel cost, starvation recovery, or worker assignment consequences.
3. **The AI/autopilot/manual boundary remains a presentation problem instead of a control contract.** Autopilot can be mirrored, defaulted off, and labeled, but the player still cannot reason about what it will do next or override it as a stable planning partner.
4. **Most changes were symptoms, not systems.** Death toasts, goal chips, memory text, template tags, and stronger copy explain failures after they happen. They do not prevent the failure path or add new player decisions that improve outcomes.
5. **Feature-freeze pressure made reviewers converge on safe polish.** The D5 filter correctly rejected new content/mechanics, but it also biased the pipeline toward low-risk UI diffs. The result is green tests with little movement in the product-quality score.

## Round 3 Selection Bias

Round 3 should prioritize changes that alter player agency or benchmark-relevant behavior while staying inside HW06 constraints. Accepted plans should normally satisfy at least one of these:

- Reduce early starvation or idle time through tuning/fix-level simulation changes, not a new mechanic.
- Make existing logistics, routes, depots, food, and job assignment behavior more controllable.
- Turn existing AI/autopilot state into an explicit player contract: what it will do, when it will stop, and how manual actions override it.
- Improve long-run benchmark health without adding new building/tool/tile/content types.
- Remove a false affordance where the UI suggests the player has a decision but the simulation ignores it.

Pure copy, tooltip, toast, glossary, badge, or layout polish is allowed only as support for a structural fix. A standalone presentation-only plan should be deferred unless it fixes a crash, blocker, or severe accessibility regression.

## Round 3 Hard Lines

- Do not add new building types, tile types, tools, assets, audio, victory conditions, score formulas, mood systems, grief systems, tutorial levels, or new content pipelines.
- Prefer tuning, bug fixes, existing-system wiring, existing-state exposure, and bounded control contracts.
- Benchmark regressions are not soft-passable in Round 3. If DevIndex remains below the inherited baseline after a structural change, fix or roll back.
- The round can accept fewer than 10 plans. It is better to land 3-5 structural changes than 10 cosmetic patches.
