# Round 9 Blind Review - Reviewer A

Date: 2026-04-26  
Target: http://127.0.0.1:5173  
Review mode: black-box browser playthrough only. No repository source/docs/history/prior feedback reviewed.

## Score

6/10

The build is playable and has much better automation transparency than a typical opaque "AI mode": the HUD, AI Log, entity list, event feed, and heat lens all help explain what is automated. The main blockers are high-count performance/stutter at 8x, Autopilot overbuilding into a food collapse, and AI transparency that still mixes player-facing decisions with internal/debug language and fallback errors.

## P0 Findings

None found.

## P1 Findings

### P1 - High entity count at 8x produces visible stutter and fails to sustain target speed

Reproduction steps:

1. Open http://127.0.0.1:5173.
2. Start the default Temperate Plains / 96x72 colony.
3. Toggle Autopilot on.
4. Select Ultra speed 8x.
5. Let the run proceed until the worker count reaches roughly 75-80.
6. Observe visual smoothness, HUD actual-speed readout, and interaction latency while the simulation is still running.

Observed evidence:

- At ~80 workers, the browser visibly stuttered during camera/map animation and dense worker movement.
- A 15-second `requestAnimationFrame` sample during the ~80-worker 8x run showed about 31.7 FPS, average frame interval 31.6 ms, p95 70.7 ms, p99 87.4 ms, and 96 frames over 50 ms.
- The HUD reported `actual x7.0` during the same sampled state, below the selected 8x speed.
- Browser remained interactive, but the frame pacing was visibly uneven enough to affect review/play readability.

Screenshots:

- `05-80-workers-actual-7x-stutter.png`
- `06-autopilot-paused-food-crisis.png`

Acceptance criteria:

- At 75-100 workers on the default 96x72 scenario, 8x mode should sustain at least 45 FPS p95 frame interval under 35 ms on the same browser environment.
- If 8x cannot be sustained, the UI should clearly degrade the selected speed, explain why, and avoid showing a stable 8x control state while actual simulation speed drops.
- Dense worker movement should remain readable without multi-frame hitches over 50 ms during normal camera view.

### P1 - Autopilot scales into starvation, then requires manual takeover without enough preventive clarity

Reproduction steps:

1. Start the default colony.
2. Toggle Autopilot on.
3. Select 8x.
4. Let the run continue through the growth phase until the worker count reaches roughly 78-80.
5. Watch food, starvation events, and Autopilot status.

Observed evidence:

- Autopilot grew the colony rapidly from 13 workers to ~80 workers.
- Multiple starvation events occurred.
- The HUD eventually showed `Autopilot PAUSED - food crisis` and a message telling the player to build/restock food, then resume.
- The pause behavior is good as a fail-safe, but it happens after deaths, and the earlier Autopilot state did not make the pending collapse clear enough for a player trusting automation.

Screenshots:

- `03-autopilot-8x-33-workers.png`
- `05-80-workers-actual-7x-stutter.png`
- `06-autopilot-paused-food-crisis.png`
- `07-heat-lens-after-crisis.png`

Acceptance criteria:

- Autopilot should surface a pre-crisis warning before starvation, with a concrete explanation such as "population growth exceeds food production" and the next automated/manual corrective action.
- Autopilot should either throttle expansion or prioritize food recovery before the colony reaches zero food.
- If Autopilot pauses, the player should see a short recovery checklist that maps directly to available controls, not just a generic takeover instruction.

### P1 - AI/Autopilot status is transparent but too contradictory for player trust

Reproduction steps:

1. Start the default colony.
2. Toggle Autopilot on.
3. Open AI Log.
4. Let the run proceed at 8x for several minutes.
5. Compare the top HUD Autopilot label, AI Log status cards, timeline, and decision results.

Observed evidence:

- HUD says `Autopilot ON - rules`.
- AI Log says Autopilot attempts AI calls when available, but the visible status shows fallback mode/proxy down/model fallback.
- Director cards showed fallback decisions and HTTP 500 errors while the player-facing toggle still reads like Autopilot/AI is active.
- The timeline repeatedly showed `fallback-degraded rebuild the broken supply lane`, which is transparent, but the wording is not player-friendly.
- This is not a hidden failure, which is good. The problem is that the player has to interpret several technical labels to understand what is automated, what is rule-based, and what is unavailable.

Screenshots:

- `04-ai-log-fallback-http500.png`
- `05-80-workers-actual-7x-stutter.png`
- `06-autopilot-paused-food-crisis.png`

Acceptance criteria:

- The main HUD should distinguish "Rule Autopilot active", "AI unavailable", and "AI active" without requiring the AI Log.
- AI Log should separate player-facing explanation from debug/error details.
- Fallback/error states should include practical impact: what still works, what is disabled, and whether the player needs to act.

## P2 Findings

### P2 - Help opens on Resource Chain instead of Controls

Reproduction steps:

1. Open the start screen.
2. Click `How to Play`.
3. Observe the default selected tab.

Observed evidence:

- The help dialog opened with the `Resource Chain` tab selected, even though `Controls` is the first tab and this was my first help open.
- This is minor, but for first-time players the controls tab is the expected landing point.

Screenshots:

- `02-help-resource-chain-default.png`

Acceptance criteria:

- First help open should default to `Controls`, or the selected tab should match the user intent/context.

### P2 - Heat lens is useful, but crisis overlays can become visually noisy

Reproduction steps:

1. Reach the food-crisis state under Autopilot at high speed.
2. Toggle `Heat (L)`.
3. Observe the map around the central cluster.

Observed evidence:

- Heat lens clearly labels `supply surplus` and `input starved`, which is valuable.
- During crisis, many overlapping labels appear in the central cluster and can obscure individual workers/buildings.

Screenshots:

- `07-heat-lens-after-crisis.png`

Acceptance criteria:

- Heat labels should cluster, prioritize, or fade by zoom level so the player can identify the top 3-5 actionable issues without covering the colony.
- Hover/click drilldown should expose lower-priority labels instead of always rendering every nearby issue.

## Screenshots List

- `01-start-screen.png` - start screen and opening briefing.
- `02-help-resource-chain-default.png` - help dialog opens to Resource Chain.
- `03-autopilot-8x-33-workers.png` - Autopilot on at high speed after early growth.
- `04-ai-log-fallback-http500.png` - AI Log showing fallback/proxy-down/HTTP 500 state.
- `05-80-workers-actual-7x-stutter.png` - high entity count 8x run around 80 workers.
- `06-autopilot-paused-food-crisis.png` - Autopilot paused after starvation/food crisis.
- `07-heat-lens-after-crisis.png` - heat lens labels during crisis.

## Overall Acceptance Criteria

- Default scenario at 75-100 workers remains visibly smooth and readable at high speed, or high speed degrades transparently.
- Autopilot prevents or clearly forecasts resource-collapse failure before deaths occur.
- Player-facing AI status explains automation mode in plain language: rule-based, AI fallback, unavailable, or live AI.
- AI Log remains available for debug detail but does not require the player to parse technical fallback/error wording to understand gameplay impact.
- Heat lens remains actionable under dense colony conditions by prioritizing the most important labels.
