---
reviewer_id: 02e-indie-critic
feedback_source: assignments/homework6/Agent-Feedback-Loop/Round4/Feedbacks/02e-indie-critic.md
round: 4
date: 2026-04-23
build_commit: 65a8cb7
priority: P1
estimated_scope:
  files_touched: 6
  loc_delta: ~140
  new_tests: 0
  wall_clock: 90
conflicts_with: []
---

## 1. Core Issues

- The build already has authored scenario voice (`Broken Frontier`, west lumber line, east depot), but the first screen still leads with dense control callouts, map-size tooling, and benchmark-flavored survival/score framing, so the game's point of view reads weaker than its systems.
- During active play, the HUD keeps foregrounding telemetry (`Score`, `Dev`, per-rule score math, terse target counters) more aggressively than the scenario fiction and frontier-repair framing that the reviewer actually responded to.
- The existing "voice" surfaces are fragmented across the menu, help modal, storyteller strip, and casual HUD copy, so the player gets clear instructions but not a coherent tonal through-line.

## 2. Suggestions

### Direction A: Rebalance first-impression hierarchy around scenario voice
- Idea: keep all existing mechanics and controls, but rewrite the startup/menu/HUD copy hierarchy so scenario fiction and frontier intent lead while score/debug framing recedes behind casual/full gating.
- Files involved: `index.html`, `src/ui/hud/GameStateOverlay.js`, `src/ui/hud/HUDController.js`, `src/ui/interpretation/WorldExplain.js`
- Scope: medium
- Expected benefit: strongest improvement to the reviewer's complaint without crossing feature-freeze boundaries; changes are mostly copy hierarchy and gating, not systems work.
- Main risk: over-softening the UI could hide useful operational information if casual/full behavior is not kept explicit and test-covered.

### Direction B: Lean harder on the storyteller strip as the authored "voice" layer
- Idea: keep the menu mostly intact, but make the in-run storyteller strip and scenario-progress language more atmospheric and scenario-specific so the game's identity emerges after the first minute.
- Files involved: `src/ui/hud/storytellerStrip.js`, `src/ui/hud/HUDController.js`, `src/ui/interpretation/WorldExplain.js`
- Scope: small-medium
- Expected benefit: lower implementation cost and lower layout risk.
- Main risk: it improves flavor after play starts, but does less to fix the reviewer's main first-screen criticism.

### Direction C: Fold more differentiation into the help/onboarding copy only
- Idea: rewrite the help modal and startup hints so "What makes Utopia different" stops sounding like documentation and starts sounding like a clear authored stance.
- Files involved: `index.html`
- Scope: small
- Expected benefit: lowest risk and clearly inside freeze.
- Main risk: too shallow by itself; the HUD and overlay would still read as system-first.

## 3. Selected Direction

Choose **Direction A** because it addresses the highest-signal complaint at the actual first-impression surfaces, stays inside HW06 polish/fix scope, and can reuse the existing casual/full and dev-mode gates instead of introducing new mechanics.

## 4. Plan Steps

- [ ] Step 1: `index.html:1200-1228` - edit - Rewrite the menu overlay lead, control-hint rows, and action-button copy so the opening panel leads with scenario fiction and essential actions, while long shortcut density is reduced on the first screen.
- [ ] Step 2: `index.html:1704-1773` - edit - Tighten the Help modal tabs and body copy so `Controls`, `Threat & Prosperity`, and `What makes Utopia different` reinforce the frontier-repair identity instead of reading like neutral tool documentation.
  - depends_on: Step 1
- [ ] Step 3: `src/ui/hud/GameStateOverlay.js:4-28` and `src/ui/hud/GameStateOverlay.js:203-279` - edit - Reformat menu/end overlay meta and survival card text so scenario title/setting stay primary, and score/survival stats read as secondary run-summary information rather than the headline promise.
  - depends_on: Step 1
- [ ] Step 4: `src/ui/interpretation/WorldExplain.js:getFrontierStatus` and `src/ui/interpretation/WorldExplain.js:getScenarioProgressCompactCasual` - edit - Replace counter-heavy casual strings with more human, authored frontier-task phrasing while preserving the existing runtime data and full-profile compact counters.
  - depends_on: Step 3
- [ ] Step 5: `src/ui/hud/HUDController.js:896-1005` and `src/ui/hud/HUDController.js:956-978` - edit - Re-prioritize the active-play HUD so casual mode keeps scenario headline/progress visible, demotes score-rule math, and avoids letting `Score`/`Dev` dominate the top-bar reading order.
  - depends_on: Step 4
- [ ] Step 6: `src/ui/hud/storytellerStrip.js:146-183` and `src/ui/hud/storytellerStrip.js:237-291` - edit - Adjust the strip's humanization/template-tag output so the visible AI narration stays in-world and scenario-specific instead of sounding like an exposed subsystem label.
  - depends_on: Step 5
- [ ] Step 7: `test/world-explain-casual.test.js:19-60`, `test/hud-storyteller.test.js:24-175`, and `test/ui-layout.test.js:5-87` - edit - Extend coverage for the new casual-copy hierarchy, storyteller phrasing, and required first-screen ids/text anchors without changing gameplay logic.
  - depends_on: Step 6

## 5. Risks

- Casual/full and dev-mode gates can drift apart, leaving score/debug text hidden visually but still exposed through tooltips or DOM text.
- Copy changes in `index.html` can break brittle string-based UI tests that currently assert exact wording.
- Reordering the HUD emphasis can accidentally reduce discoverability of score/DevIndex for players who expect that feedback during active runs.
- Possible affected existing tests: `test/world-explain-casual.test.js`, `test/hud-storyteller.test.js`, `test/ui-layout.test.js`, `test/ui/hud-score-dev-tooltip.test.js`, `test/ui/hudController.casualScoreBreakGate.test.js`

## 6. Verification

- Extend `test/world-explain-casual.test.js` to cover more narrative casual-progress phrasing while keeping the dev-profile compact string unchanged.
- Extend `test/hud-storyteller.test.js` to verify the storyteller strip still emits readable mode/focus/beat output after copy humanization.
- Extend `test/ui-layout.test.js` with static assertions for the revised startup/help text anchors so the first-screen hierarchy does not regress silently.
- Manual verification: open `http://127.0.0.1:4173/` -> confirm the menu overlay foregrounds scenario framing before shortcut density -> start a run in default casual mode -> confirm the top HUD reads as scenario/headline/progress first, with score math no longer acting like the primary flavor layer.
- Benchmark regression: no gameplay-system change expected, but run `scripts/long-horizon-bench.mjs` with seed 42 on the default template if any HUD/render branching change leaks into sim state; DevIndex should remain within 5% of current baseline.

## 7. UNREPRODUCIBLE Notes

- Attempted Playwright MCP reproduction against `http://127.0.0.1:4173/`, but the MCP browser returned `Browser is already in use for ...\\mcp-chrome-7cb89f3, use --isolated to run multiple instances of the same browser`.
- Verified separately that the assigned build URL responds with HTTP 200, so the blocker is the MCP browser lock rather than the local build being down.
