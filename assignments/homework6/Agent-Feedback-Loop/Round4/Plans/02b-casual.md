---
reviewer_id: 02b-casual
feedback_source: assignments/homework6/Agent-Feedback-Loop/Round4/Feedbacks/02b-casual.md
round: 4
date: 2026-04-23
build_commit: 65a8cb7
priority: P1
estimated_scope:
  files_touched: 7
  loc_delta: ~220
  new_tests: 3
  wall_clock: 70
conflicts_with: []
---

## 1. Core Issues

- The first-run HUD surfaces system status, but not enough executable guidance. `src/ui/hud/nextActionAdvisor.js:getFoodCrisisAdvice`, `getRouteAdvice`, `getDepotAdvice`, and `getTargetAdvice` still return outcome labels like `Recover food now` / `Build Farm 4/6`, and `src/ui/hud/HUDController.js:#renderNextAction` only renders that label plus a tooltip, so a casual player is told the goal without being walked to the valid tool, tile, and success condition.
- Placement feedback explains rejection after the player is already lost, and the wording stays diagnostic. `src/simulation/construction/BuildAdvisor.js:374-387` emits blockers such as `Cannot build on unexplored terrain. Scout this area first.` and `Clear the grass before building here.`, while `src/ui/tools/BuildToolbar.js:898-925` mirrors the blocker but does not turn it into a concrete recovery step or highlight what *would* count as a valid placement.
- AI-facing language is still framed around internal runtime states instead of player reassurance. `src/ui/hud/autopilotStatus.js:16-39` exposes `Autopilot ON/OFF`, `fallback`, `coverage`, and policy timing directly; `src/ui/hud/storytellerStrip.js:146-173` and `computeStorytellerStripModel` keep `DIRECTOR` / `DRIFT` style terminology prominent; `src/ui/panels/AIDecisionPanel.js:110-230` opens with parsed policy internals. For a casual player this reads like system telemetry, not “the game is helping you recover.”

## 2. Suggestions (Viable Directions)

### Direction A: Actionable onboarding pass across HUD + build preview
- Idea: turn the current “state report” surfaces into step-by-step action prompts that name the tool, valid tile type / anchor, and immediate success signal.
- Files involved: `src/ui/hud/nextActionAdvisor.js`, `src/ui/hud/HUDController.js`, `src/simulation/construction/BuildAdvisor.js`, `src/ui/tools/BuildToolbar.js`
- Scope: medium
- Expected benefit: directly addresses the reviewer’s main failure mode of “I know I need a farm, but not where/how to place one.”
- Main risk: if the guidance becomes too verbose, the compact HUD chip and build panel preview can overflow on smaller widths.

### Direction B: Reframe AI/autopilot language for casual-mode reassurance
- Idea: keep the same systems, but rewrite the visible AI/autopilot/storyteller copy so it communicates what the player should expect, not internal scheduler state.
- Files involved: `src/ui/hud/autopilotStatus.js`, `src/ui/hud/HUDController.js`, `src/ui/hud/storytellerStrip.js`, `src/ui/panels/AIDecisionPanel.js`, `index.html`
- Scope: medium
- Expected benefit: removes the “is the game driving or failing?” confusion around `Autopilot`, `DIRECTOR`, and `DRIFT`, especially in the first 10-15 minutes.
- Main risk: reducing technical specificity too far could make the existing AI/debug surfaces less useful for experienced players unless the casual/full profile split is preserved.

### Direction C: Softer fail-state and micro-win feedback polish
- Idea: keep current mechanics, but upgrade rejection/success copy so failed placements immediately suggest the next move and successful placements reinforce progress before later shortages overwrite the moment.
- Files involved: `src/simulation/construction/BuildAdvisor.js`, `src/ui/tools/BuildToolbar.js`, `src/app/GameApp.js`, `src/ui/hud/HUDController.js`
- Scope: small
- Expected benefit: improves the emotional curve by replacing cold blocker text with “do this next” language and making early wins more legible.
- Main risk: this helps moment-to-moment feel, but on its own does not fully solve the reviewer’s larger “I still do not know where to build” complaint.

## 3. Chosen Direction

Choose **Direction A**, with a small amount of Direction B copy cleanup folded in where the same surfaces already render. This is the best fit for a P1 casual-onboarding problem: it stays inside HW06 freeze, fixes the player’s actual stall point fastest, and avoids a broader UI rewrite.

## 4. Plan Steps

- [ ] Step 1: `src/ui/hud/nextActionAdvisor.js:getFoodCrisisAdvice`, `src/ui/hud/nextActionAdvisor.js:getRouteAdvice`, `src/ui/hud/nextActionAdvisor.js:getDepotAdvice`, `src/ui/hud/nextActionAdvisor.js:getTargetAdvice`, `src/ui/hud/nextActionAdvisor.js:getNextActionAdvice` - edit - expand the advice model from result-only labels into explicit casual instructions with tool name, valid target/anchor hint, and a short success check/recovery phrase.
- [ ] Step 2: `src/ui/hud/HUDController.js:#renderNextAction` - edit - render the richer advice returned from Step 1 into the visible next-action chip and tooltip so the player sees an actionable sentence instead of only `Next: Build Farm 4/6`.
  - depends_on: Step 1
- [ ] Step 3: `src/simulation/construction/BuildAdvisor.js:374-387`, `src/simulation/construction/BuildAdvisor.js:summarizeBuildPreview`, `src/simulation/construction/BuildAdvisor.js:getBuildToolPanelState` - edit - rewrite placement blocker text and preview summaries so each common rejection explains the unlock action or valid alternative tile, not just the failure reason.
- [ ] Step 4: `src/ui/tools/BuildToolbar.js:898-925` - edit - make the build preview row surface the revised blocker/recovery wording from Step 3 and, in casual mode, preserve a positive “valid placement” preview when the hovered tile is legal.
  - depends_on: Step 3
- [ ] Step 5: `src/ui/hud/autopilotStatus.js:getAutopilotStatus` and `src/ui/hud/HUDController.js:885-891` - edit - keep the existing chip, but replace `manual / coverage fallback / next policy` style copy with player-facing expectations about whether the AI is assisting, waiting, or not currently rescuing the colony.
- [ ] Step 6: `src/ui/hud/storytellerStrip.js:146-173` and `src/ui/hud/storytellerStrip.js:237-307` - edit - soften the early-game storyteller/focus text in casual mode so it prioritizes plain-language guidance over `DIRECTOR` / `DRIFT` framing while preserving the structured model for non-casual surfaces.
- [ ] Step 7: `src/ui/panels/AIDecisionPanel.js:#renderCausalChain`, `src/ui/panels/AIDecisionPanel.js:#renderPolicyBlock`, `index.html:1759-1770` - edit - add a short plain-language lead-in for the AI Decisions/help surfaces so casual players who open them see “what this means for me now” before parsed policy internals.

## 5. Risks

- Longer next-action and preview copy may overflow `#statusNextAction` (`index.html:116-125`, `index.html:857`, `index.html:865`) unless the text budget is kept tight.
- If casual-mode wording diverges too far from the existing AI/debug terms, full-profile and tests that assert current strings may need explicit branching rather than blanket replacements.
- Placement-help copy that overcommits to a tile type or coordinate can mislead when the nearest valid tile changes with fog, roads, or scenario gaps.
- Possible existing tests impacted: any current or newly added assertions around `getAutopilotStatus`, `getNextActionAdvice`, and `BuildAdvisor.explainBuildReason` string output.

## 6. Validation

- New tests: `src/ui/hud/nextActionAdvisor.test.js` covering food-crisis, route-gap, depot-missing, and logistics-target advice strings in casual mode.
- New tests: `src/simulation/construction/BuildAdvisor.test.js` covering `explainBuildReason`, `summarizeBuildPreview`, and `getBuildToolPanelState` so blocker copy always includes a concrete recovery hint.
- New tests: `src/ui/hud/autopilotStatus.test.js` covering the player-facing idle/assist/waiting wording and ensuring casual/full profile expectations remain stable.
- Manual verification: open `http://127.0.0.1:4173/`, start a `Fertile Riverlands` run, wait for the first `food` or `farm` prompt, and confirm the top chip now tells the player which tool to use and what kind of tile/anchor to place it on.
- Manual verification: hover an invalid build tile and then a valid grass tile with `Farm` or `Warehouse` selected; expect the build preview row to switch from blocker + remedy wording to a positive valid-placement summary before clicking.
- Manual verification: toggle the top `Autopilot` switch and open the `AI Decisions` panel; expect the visible copy to describe what the AI is currently doing for the player without surfacing raw `coverage fallback` style jargon as the primary message.
- Benchmark regression: run `scripts/long-horizon-bench.mjs` with `seed 42` on `temperate_plains`; `DevIndex` should not fall more than 5% from the current baseline because this plan only changes HUD/help/build-preview presentation.

## 7. UNREPRODUCIBLE Notes

- Attempted Playwright MCP reproduction on 2026-04-23, but `mcp__playwright__.browser_tabs` / `browser_snapshot` failed before a live snapshot with: `Browser is already in use for C:\Users\dzdon\AppData\Local\ms-playwright\mcp-chrome-7cb89f3, use --isolated to run multiple instances of the same browser`.
- The assigned build URL `http://127.0.0.1:4173/` returned HTTP 200, so the plan is grounded in the assigned feedback plus direct code inspection of the actual HUD/build/AI files above, but not a completed MCP browser walkthrough.
