---
round: 9
stage: C
wave: W3
plan: automation-ownership
date: 2026-04-26
commit: "pending final Round9 commit"
status: implemented
source: "Round9/Plans/summary.md"
---

# W3 - automation-ownership

## Implementation

- `ColonyDirectorSystem` now gates scenario repair separately from Autopilot phase/connector builders and returns early when Autopilot is off.
- Scenario repair, connector repair, and Autopilot builds now pass explicit `owner` and `reason` metadata.
- `BuildSystem` persists build owner/reason into build history, action callbacks, emitted build events, and placement results.
- `autopilotStatus` now exposes subsystem copy for builders, directors, live LLM vs rules/fallback, and food recovery state.
- HUD copy now states that builders/directors are idle when Autopilot is off and shows target-vs-running speed when capped.

## Files

- `src/simulation/meta/ColonyDirectorSystem.js`
- `src/simulation/construction/BuildSystem.js`
- `src/simulation/meta/GameEventBus.js`
- `src/ui/hud/autopilotStatus.js`
- `src/ui/hud/HUDController.js`
- `test/autopilot-status-degraded.test.js`
- `test/hud-autopilot-status-contract.test.js`
- `test/ui/hud-autopilot-chip.test.js`
- `test/colony-director.test.js`

## Validation Evidence In Diff

- Autopilot status tests were updated to assert the new player-control boundary: `Autopilot OFF - manual; builders/director idle`.
- Director tests assert that automatic phase builds do not run while Autopilot is off.

## Notes

- The current diff does not include the planned AI panel ordering changes for `AIAutomationPanel`, `AIExchangePanel`, `AIPolicyTimelinePanel`, or `EventPanel`; ownership attribution landed in the director/build/HUD surfaces.
