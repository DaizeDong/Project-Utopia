# Round 9 Blind Review - Reviewer B

Date: 2026-04-26  
Build reviewed: `http://127.0.0.1:5173`  
Method: black-box headed-browser playtest with screenshots and browser-frame probes only.

## Score: 5/10

The current build is readable and has much better AI/autopilot disclosure than a typical opaque automation toggle, but the simulation becomes visibly unstable under ultra speed and high entity counts. The largest UX issue is that "Autopilot off" still allows substantial background/build automation, so the player cannot confidently tell what is manual, what is automated, and what is AI-driven.

## P0 Findings

No P0 release blockers found.

## P1 Findings

### P1 - Ultra speed has visible stutter even at modest entity counts, and high-load ultra becomes effectively unplayable

Reproduction steps:
1. Open `http://127.0.0.1:5173`.
2. Start the default Temperate Plains / Broken Frontier colony.
3. Click the ultra speed button.
4. Let the sim run for about 3 minutes.
5. Repeat with stress/load controls set to 500 extra workers and population targets pushed high.

Observed evidence:
- Default run at normal play measured smoothly in-browser: about 154 FPS, p95 frame interval about 16.7 ms.
- The same default run at ultra speed degraded to about 21 FPS, p95 about 74.9 ms, 501 long tasks in the sample, and visible hitching.
- With high load applied, the UI showed about 1000 entities (`+980 more...` initially, later `+966 more...`) and the browser-frame probe measured about 0.9 FPS, with roughly 1.1 second average frame intervals and long tasks over 1.5 seconds.
- The visible sim speed indicator under high load reported `actual x4.0` despite ultra being selected, so the game was both visibly lagging and failing to deliver the selected speed.

Acceptance criteria:
- Ultra speed should remain visually responsive at the advertised supported entity counts.
- At 500 added workers / around 1000 visible entities, the UI should maintain at least 30 FPS or automatically degrade rendering/simulation detail with a clear "performance capped" message.
- The speed control should not imply a speed that the sim cannot deliver; show target speed and actual speed prominently when they diverge.
- Long frames over 100 ms should be rare during supported stress scenarios.

### P1 - Autopilot/AI ownership is still confusing because "Autopilot off" does not mean automation is off

Reproduction steps:
1. Start the default colony.
2. Leave Autopilot unchecked/off.
3. Run at ultra speed for several minutes.
4. Open `AI Log`.
5. Compare the top status line with the automation map and visible colony changes.

Observed evidence:
- Top status said: `Autopilot off. Manual guidance active; director may still react.`
- The AI Log simultaneously reported fallback directors, strategic decisions, NPC brain decisions, and active build automation.
- In the Autopilot-off run, the log showed build automation as active with many placed builds, while the player-facing top line still framed the state as manual.
- From a player perspective, this makes it unclear whether roads/buildings/work assignments are player-authored, background automation, AI/fallback automation, or scenario scripting.

Acceptance criteria:
- Separate the concepts in the UI: player Autopilot, background simulation directors, NPC policies, and automatic builder.
- When Autopilot is off, either stop player-facing build placement automation or label every continuing automated subsystem as still active.
- Add clear action attribution such as "Built by player", "Built by scenario repair", "Built by rule automation", or "Built by Autopilot".
- Avoid requiring the AI Log to understand core control ownership; the main HUD should make the current automation state obvious.

## P2 Findings

### P2 - No clear in-game bottleneck signal for visible lag, CPU/GPU, or benchmark outcome

Reproduction steps:
1. Open the debug/telemetry panel.
2. Run the built-in benchmark with the exposed benchmark controls.
3. Apply 300 to 500 extra workers and run fast/ultra speed.
4. Observe the main HUD and debug panel during stutter.

Observed evidence:
- The built-in benchmark screenshot did not surface an obvious summary that a normal player/reviewer could use to connect lag with CPU/GPU/render/simulation bottlenecks.
- During severe stutter, the main HUD showed colony state and speed, but not a clear FPS/sim-tick/CPU/GPU utilization indicator.
- This makes it hard to answer whether low CPU/GPU utilization corresponds to visible lag without external tooling.

Acceptance criteria:
- Add an always-available performance overlay or benchmark summary with FPS, frame p95/p99, sim tick time, render time, entity count, and actual-vs-target sim speed.
- If CPU/GPU utilization is intentionally shown or benchmarked, label whether the bottleneck is render-bound, simulation-bound, or throttled.
- After benchmark completion, display a concise pass/fail summary and last-run numbers in the UI.

### P2 - High-entity entity focus list becomes hard to use

Reproduction steps:
1. Start a default colony.
2. Apply high entity load until hundreds of entities are present.
3. Inspect the Entity Focus panel while the sim is running.

Observed evidence:
- At high load the panel showed only a small set of rows plus `+980 more...` / `+966 more...`.
- Starvation/death events spammed the HUD while individual entity diagnosis remained difficult.
- There was no obvious grouping by role, status, or crisis severity in the visible focus list.

Acceptance criteria:
- Provide grouping/filtering for high entity counts, especially starving, idle, blocked, hauling, and combat/threat states.
- Make aggregate crisis counts clickable or expandable into actionable filtered lists.
- Keep the top-level entity panel useful at 500+ entities without forcing row-by-row scanning.

## Screenshots

- `01-initial-load.png` - initial menu and default scenario.
- `02-before-start.png` - pre-start default menu.
- `03-started-default.png` - default colony immediately after start.
- `04-one-minute-play.png` - normal play after about one minute.
- `05-ultra-after-three-minutes.png` - default colony after ultra-speed run.
- `06-ai-log-after-ultra.png` - Autopilot-off AI Log after ultra-speed run.
- `07-high-load-applied.png` - high load applied, about 1000 entities visible in UI.
- `08-high-load-ultra-after-four-minutes.png` - high-load ultra-speed state.
- `09-high-load-ai-log.png` - high-load AI Log with Autopilot off.
- `10-dev-telemetry-open.png` - debug/telemetry panel opened.
- `11-built-in-benchmark-result.png` - built-in benchmark/result area after run.
- `12-300-extra-fast-after-two-minutes.png` - 300 extra workers at fast speed.
- `14-autopilot-on-ultra.png` - Autopilot enabled at ultra speed.
- `15-autopilot-on-ai-log.png` - Autopilot-on AI Log and fallback/paused state.

