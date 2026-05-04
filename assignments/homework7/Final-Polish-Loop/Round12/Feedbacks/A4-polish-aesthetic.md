# A4 - Polish & Aesthetic - Round 12 (Tier A, R12)

- **Build URL:** http://127.0.0.1:5173/
- **Date:** 2026-05-02
- **Mode:** Strictly blind. No prior R12 feedback consulted.
- **Coverage:** visual / audio / motion (start screen, in-game, heat lens, terrain overlays, build panel, help modal, pause).

## Verdict

**Conditional Pass — Visual Pass / Audio Fail / Motion Pass.** Title screen, briefing, help modal, build sidebar and resource HUD all look clean and tonally consistent (slate-blue palette, good type hierarchy, no obvious clipping). In-game motion is smooth at 1x with no jitter on worker sprites. **However**, the build ships with literally **zero audio** (0 `<audio>`, 0 `AudioContext`, 0 audio/sound/sfx/volume references in the live DOM) — there is no music, no UI click, no death sting, no pause cue, no rain. For a "Living World" colony sim this is the single biggest aesthetic gap. Two visual issues also stack on top.

## Top 3 Polish Issues

1. **(Audio) Total silence — no music, no SFX, no volume control.** `screenshots/A4/01-initial-load.png` through `08-paused.png` were captured with a live page audit (`audioElements: 0`, `audioContexts: 0`, `audioMentions: 0`). Pause/resume, deer-deaths, build-place, hunger crisis — all happen in dead silence. Even a single ambient bed + 4 UI clicks (place, error, pause, milestone) would lift perceived production value enormously. This is the most impactful single polish ROI on the project.

2. **(Visual) Camera framing wastes the upper third of the canvas; map sits in a black void.** `screenshots/A4/02-game-start.png`, `03-after-10s.png`, `06-terrain-overlay.png` (post `R` reset) all show ~30-45% of the viewport as solid `#000` above the visible coastline. Even after hitting `R / Home` the colony is bottom-anchored with empty sky. Fix: re-center the default zoom on the colony bounding-box +10% padding, or fade the "outside-grid" area to a warm horizon gradient instead of pure black so it reads as atmosphere not as missing pixels.

3. **(Visual / Motion) Critical-event toasts pile up dead-center over the action and use diagnostic copy.** `screenshots/A4/02` and `03` show three red `Deer-NN died - predation` toasts stacked centerscreen during the first minute, plus a slate `Story AI is offline — fallback director is steering. (Game still works.) [timeout]` line. The deer-death toasts (a) are not player-actionable, (b) obscure the actual workers, (c) repeat the same ID-pattern verbatim — a small wildlife icon in the side ticker would carry the same info without covering the playfield. The fallback-director toast leaks engineering jargon ("[timeout]", "fallback director") into the player-facing surface; rewrite as "Director resting — colony on autopilot." or hide entirely behind a debug flag.

## Secondary Notes (not in top 3)

- `Heat lens ON — red = surplus, blue = starved` displays a "plus" badge that is half-clipped against the right rail edge near the Heat (L) tab (`04-heat-lens.png`). Move the badge inboard ~6px or anchor to the tab interior.
- Terrain overlays (Fertility / Elevation / Connectivity) paint a fine grid that visually fights the diamond tile silhouettes (`06`, `08`, `09`). Connectivity in particular tints the entire world a uniform sandy beige with no visible road/cluster boundaries — overlay reads as "color drained," not "info added."
- Toast text occasionally duplicates location labels: `east ruined depot x2` (`03-after-10s.png`) — counter suffix is ungainly; prefer pluralising the noun or suppressing duplicates.
- No global PAUSED scrim/banner over the canvas when `Space` is hit — only the bottom toolbar icon recolors. A 30%-opacity slate vignette + center "PAUSED" badge would make the state unmissable.
- Font stack falls back to Segoe UI / Trebuchet — fine on Windows but inconsistent cross-platform. A bundled webfont (Inter or similar) would lock visual identity.

## Screenshots
- `screenshots/A4/01-initial-load.png` — title screen
- `screenshots/A4/02-game-start.png` — frame 1 of run, deer-death toast already up
- `screenshots/A4/03-after-10s.png` — toast pile-up + fallback director banner
- `screenshots/A4/04-heat-lens.png` — heat lens with clipped "plus" badge
- `screenshots/A4/05-build-panel.png` — build panel (clean)
- `screenshots/A4/06-terrain-overlay.png` — fertility overlay + camera reset wastage
- `screenshots/A4/07-help.png` — help modal (clean)
- `screenshots/A4/08-paused.png` — elevation overlay, paused
- `screenshots/A4/09-motion-frame-a.png` — connectivity overlay, color drained
