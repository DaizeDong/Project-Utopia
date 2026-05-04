# A3 — First Impression (Strictly Blind)

- **Reviewer**: Brand-new player, no prior knowledge of Project Utopia
- **Build URL**: http://127.0.0.1:5173/
- **Date**: 2026-05-02
- **Run length**: ~7 minutes (single attempt, colony wiped)
- **Final score**: Survival 237, DevIndex 22/100, Time 7:11, Deaths 19
- **Screenshots**: `Round12/Feedbacks/screenshots/A3/01..13`

---

## Verdict

**B (better than B-, worse than B+).** The opening menu is unusually well-onboarded for an indie sim — the briefing literally tells me my first build, the legend explains the heat lens, and the seed is exposed right under the title. The game-over modal closes the loop with a real postmortem (time / workers / prosperity / threat / DevIndex / deaths) and a one-line narrative. Between those two screens, however, a brand-new player gets dropped into a busy HUD with no in-game guidance and several small UX gaps that compound into a fast, confusing wipe.

I followed the briefing's "First build: road to the west forest, warehouse on the broken east platform" instruction. I selected the Build sidebar, picked Road, placed one tile, and then the run unraveled in under five minutes — wood hit 1, food hit 0, eleven workers went into Critical hunger simultaneously, then Marek Pike starved and a chain death cascade followed. The "Try Again" / "New Map" buttons on the wipe screen are a nice touch and the death copy is honest, but I never built a second structure.

---

## Top onboarding friction (ranked)

### 1. The Build button on the right sidebar is two clicks deep — and the first click does nothing visible

When I clicked the **Build** tab in the right sidebar (screenshot 03), the only visible change was that a strip of objective chips (`routes 0/1`, `depots 0/1`, `warehouses 0/2`, `farms 0/6`, `lumber 0/3`, `walls 0/8`) appeared at the top. The actual Build Tools palette did not appear until I clicked Build a **second** time (screenshot 06). On the first click I assumed the sidebar was broken or that "Build" was just a status filter. The opening briefing explicitly says "Open the Build tab in the right sidebar" so this is the first instruction the player follows — and it appears to fail.

**Fix**: First click on a sidebar tab should always open the corresponding panel. The objectives strip should be a separate persistent HUD element, not gated behind a Build click.

### 2. Number-key tool selection (1-12) is mentioned in the launcher legend but doesn't appear to give any visible feedback unless the Build panel is already open

Pressing `3` on a fresh game (with the Build panel collapsed) silently changed the selected tool to Lumber, but the right-side "Construction" panel still read **Selected Tool: Road** (screenshot 07). Worse, the Build Tools button list never highlighted the active tool unless I forced a hover. I went five seconds wondering if my keystroke had been swallowed by the canvas.

**Fix**: Show a tiny floating "Tool: Lumber" toast at the cursor (or in the top-center status bar) on every hotkey switch, regardless of whether the Build panel is currently visible.

### 3. The "Autopilot" checkbox in the bottom HUD did not toggle on a single click

Screenshot 11: I clicked the Autopilot checkbox after watching food collapse. The checkbox did not change state and the top header continued to read "Autopilot OFF — manual; builders/director idle." A `cb.click()` via JS evaluation did toggle it (`checked: true`) — so the click target may be smaller than its hit-region, or there is a wrapper-label preventing event delegation. For a panicking new player who sees the colony dying, this is the single worst possible UX failure: the rescue button appears not to work.

**Fix**: Audit the checkbox label/hit-region. Confirm the user-visible click anywhere on the "Autopilot" word toggles it. Bonus: when toggled ON, briefly flash the text green and update the top "Autopilot OFF" banner immediately rather than waiting on the next sim tick.

### 4. The "Story AI is offline — fallback director is steering" banner reads as an error in green text

Screenshots 02, 11. The banner sits in the entity-focus panel, in the same green color as success toasts, but the message ("Story AI is offline — fallback director is steering. (Game still works.) [timeout]") looks like a bug warning. The parenthetical reassurance is appreciated, but it is buried. A first-time player has no model for what the "Story AI" is or whether they need to do something to fix it.

**Fix**: Either suppress the banner entirely on a fresh game (route the message to a DEBUG log only), or rephrase as a neutral one-liner: "Narrator: offline (gameplay unaffected)" in a muted gray, not the green that is otherwise reserved for positive messages.

### 5. The map's color/biome rendering is hard to parse without the Terrain overlay

Screenshot 02 (default view): the map looks like a few scattered green diamonds floating in a near-black void. I genuinely could not tell whether the dark area was unreachable water, fog of war, or ungenerated terrain. Only after pressing T (Terrain overlay, screenshot 08) did I see a clean tan grid with biome zones, ridges, and connectivity. The default view should be the readable one — the dark-mood aesthetic of the default render is sacrificing the most important first-impression data ("where can I actually build?").

**Fix**: Boost the GRASS / FOREST baseline brightness in the default render, or auto-enable the Terrain overlay for the first 60 seconds of a fresh colony.

### 6. Wood went from 34 → 1 in under three minutes with no warning before the red turn

The wood resource chip turned red at 1 (screenshot 10), but there was no amber/yellow warning at, say, 5 or 10. The first I knew that wood was a constrained resource was when it was already gone and three of my builders were idle waiting on it. Combined with the Build panel needing wood to place anything, this kills momentum hard.

**Fix**: Introduce a yellow/amber threshold on resource chips at ~25% of starting stock so the player gets ~30 seconds of warning before red.

---

## Things that worked unusually well

- **Opening briefing copy**: "First pressure / First build / Heat Lens / Map size" four-line structure is excellent — it gives a beginner an explicit first action without spoiling the systems.
- **Tile labels** ("west lumber route", "east ruined depot", "west frontier wilds") rendered on the map are a great in-world narrative anchor — I knew immediately what the briefing was talking about geographically.
- **Game-over modal** (screenshot 13) is honest, narrative, and gives me a one-click "Try Again" with the same seed. The "Low-tier finale · 'The colony stalled.'" tier label is a nice touch — it implies there's a higher tier to chase.
- **Construction panel detail** ("Cost: 1 wood. Rules: Place on grass or ruins. Roads must extend from existing infrastructure or repair a scenario gap.") explains both cost and placement rules in one panel — exactly what a beginner needs.
- **Best Runs leaderboard** on the launcher is a quiet but powerful retention hook. Seeing "Score 1459 · Dev 25 · 21:21 survived" implies a clear progression goal for a fresh player.

---

## Summary

The shell of the new-player experience is genuinely good — better than most colony sims I've bounced off. The single biggest wins available now are mechanical: (a) make the sidebar Build click open on the first click, (b) fix the Autopilot checkbox hit-region, (c) make the default map readable without the Terrain overlay. After those, the rest is polish.
