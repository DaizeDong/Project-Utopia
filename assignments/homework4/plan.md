# Project Utopia HW04 Detailed Plan

This file is the detailed companion to the condensed schedule in `a4.md`.

## MVP 2.0 Definition

The project is not just "an AI sandbox." The real MVP 2.0 is:

- a colony game with a real start, active, and end loop
- authored scenarios that force the player to repair logistics through map editing
- visible A* reroutes, warehouse pressure, congestion, and spatial threats
- interpretable AI decisions layered on top of the simulation instead of replacing it
- enough stability that fallback mode can survive long browser sessions without collapsing immediately

## Core Pillars

1. Map editing must create visible systemic consequences.
2. Logistics and pathfinding must remain the backbone of progression.
3. AI must stay interpretable and secondary to feasibility and survival rules.
4. Weather, events, visitors, and ecology must create spatial pressure, not only numeric pressure.
5. The build must behave like a real product, not only a technical demo.

## Detailed Schedule

### Weeks 9-10: Alpha Wrapper and Core Loop

**Engineering**

- Finish menu, active play, win/loss/reset flow.
- Clean up input routing so the canvas remains usable during active play.
- Lock down core player actions: build, erase, inspect, select, pan, zoom, undo, and redo.
- Make sure scenario start states are valid and each run begins with a real logistics problem.

**Asset / Content**

- Finalize scenario names, objective titles, hints, and panel copy.
- Clean up control hints and inspection wording so the game is readable without external explanation.

**Integration**

- Join UI, simulation, and scenario progression into one coherent play loop.
- Ensure the player can always tell what to do first in each scenario.

**Exit Criteria**

- The game starts cleanly from menu.
- The player can build and inspect without input conflicts.
- At least one authored scenario can be played from start to finish locally without obvious interaction failure.

### Weeks 11-12: Systems Integration and Readability

**Engineering**

- Strengthen worker delivery, warehouse throughput, and congestion handling.
- Keep route repair, depot reclamation, and chokepoint logic visible in both world behavior and metrics.
- Tighten weather/event pressure so threats are spatial and legible.
- Continue improving ecology so wildlife affects farms and frontier pressure without turning into background noise.
- Keep AI policy shaping high-level preference only, not local survival or feasibility.

**Asset / Content**

- Tune authored layouts for `frontier_repair`, `gate_chokepoints`, and `island_relay`.
- Refine HUD, Inspector, and AI panel structure so all three point at the same causal story.

**Integration**

- Make sure construction, logistics, ecology, visitors, and weather all feed back into progression.
- Remove systems that create noise without giving the player clearer decisions.

**Exit Criteria**

- The three scenario families all express different map-editing problems.
- Route changes, shortages, and pressure zones are readable from the main UI.
- Fallback AI produces believable support behavior without breaking core simulation logic.

### Weeks 13-14: Long-Run Stability, Tuning, and Evidence

**Engineering**

- Run deterministic offline soaks to catch balance regressions quickly.
- Run authoritative fallback browser idle soaks across the authored scenarios.
- Tune wildlife recovery, predator pressure, and long-run thresholds until fallback runs stop failing for shallow reasons.
- Keep release checks, snapshots, and replay-related tooling usable for evidence generation.

**Asset / Content**

- Capture screenshots and summary artifacts for release evidence.
- Tighten report language so the alpha is documented honestly.

**Integration**

- Bring performance, long-run stability, and gameplay pacing into one release gate instead of treating them separately.

**Exit Criteria**

- Fallback authoritative idle evidence exists for all authored scenarios.
- The test suite and production build both pass.
- Release artifacts can be regenerated from the repo.

### Week 15: Buffer Week

**Engineering**

- Bug fixes only.
- Re-run validation after every important fix.
- Do not add new mechanics.

**Asset / Content**

- Documentation cleanup only.
- Final screenshot and artifact refresh only if needed.

**Integration**

- Freeze the submission build and verify the exact release path one more time.

**Exit Criteria**

- Submission package is stable.
- No new feature work remains open in the buffer week.

## System Backlog After HW04

These are the next upgrades after the current alpha baseline is stable.

### Logistics and Economy

- Make depot support and frontier warehousing more legible at a glance.
- Improve shortage recovery so the colony can recover from temporary starvation without feeling scripted.
- Tune production/transport balance so map edits matter more than passive waiting.

### AI and Interpretation

- Improve live-LLM reliability once valid credentials are available again.
- Push AI explanations toward shorter, more player-useful summaries.
- Continue preventing policy steering from manufacturing fake local urgency.

### Ecology and Spatial Pressure

- Raise wildlife from "stable low floor" to a more convincing target population range.
- Improve predator/prey territory balance so frontier ecology feels alive rather than merely preserved.
- Keep weather and events focused on route value, depot safety, and build decisions.

### Presentation and Productization

- Continue reducing visual noise in terrain and panel layouts.
- Keep build and release tooling reproducible and lightweight.
- Revisit bundle size and longer operator validation once gameplay tuning settles.

## Validation Gates

- `node --test` must pass.
- `npm run build` must pass.
- Fallback idle browser evidence must remain reproducible.
- Release artifacts under `docs/assignment4/metrics/` must stay current.
- Buffer week must not introduce new feature scope.
