# A6 - UI Design - Round 12 (Tier A, R12)

- **Build URL:** http://127.0.0.1:5173/
- **Date:** 2026-05-02
- **Mode:** Strictly blind. No prior R12 feedback consulted before/while reviewing.
- **Coverage:** layout / responsive (1920, 1440, 1366, 1024) / IA / accessibility / state feedback. Title screen, in-game, heat lens (L), terrain overlay (T-fertility), help modal (F1), pause (Space). Live DOM audit via `browser_evaluate`.

## Verdict

**Conditional Pass — Layout Pass / IA Mixed / Accessibility Fail / State-Feedback Fail.** The slate-blue palette and information density work. The right-rail Build sidebar collapses to vertical tabs at <=1366px (R11 PGG-responsive-collapse landed cleanly), the title-screen modal is well-organised, and the help modal has correct tab structure. **However**, three structural UI issues stack: (1) the 1920px layout leaves the canvas backdrop as a vast solid-black void above and outside the colony footprint with no horizon framing; (2) at 1024px the top scoreboard horizontally overflows its container (`statusScoreboard` scrollWidth 362 vs clientWidth 280) and the engineering string "Why no WHISPER?: LLM never reached" wraps to two lines, pushing the autopilot label into a mid-word ellipsis; (3) state feedback for paused / heat-lens-on / overlay-on collapses into an identical small green pill bottom-left of the entity panel, with no canvas-wide cue (no scrim, no border, no banner) — Space pause is essentially silent.

## Top 3 UI Issues

1. **(Responsive / Information Architecture) Top HUD overflows + leaks engineering text at 1024px.** `screenshots/A6/08-1024-game.png` plus DOM audit: `#statusScoreboard` reports `scrollWidth: 362, clientWidth: 280` — that is a clipped overflow inside a fixed header. The right-side header slot prints `Why no WHISPER?: LLM never reached` (a debug telemetry string from `GameApp.js` AI-proxy timeout) which wraps to two lines and squeezes the centre `Autopilot OFF — manual; builders/...` label into a mid-word ellipsis. Fix: (a) hide the WHISPER status string behind a debug flag or rewrite as a small icon-only chip ("AI offline" with tooltip), (b) collapse the Autopilot string to "Manual" when width <1280, (c) right-align the scoreboard inside its own grid track so it can grow without colliding with header neighbours. Same string is visible in every other in-game capture (02, 03, 04, 06, 07, 09, 10, 11) — it is a permanent player-facing artefact, not a transient toast.

2. **(Accessibility / State Feedback) Pause / overlay / lens state changes have no canvas-wide affordance and the toggle pill is one shape with no role/label.** Compare `11-1920-paused.png` (Space pressed) to `10-1920-terrain-overlay.png` (T pressed) and `04-1920-heat-lens.png` (L pressed): the only signal is a 200-px green pill ("Simulation paused." / "Terrain Overlay: Fertility overlay ON." / "Heat lens ON…") that pops up bottom-left of the EntityFocus panel and fades. There is no PAUSED scrim, no canvas border tint, no toolbar button toggle (the bottom ⏸ icon does not visibly change pressed-state), and no `aria-pressed` / `aria-live` annotation on these toggles. Result: a player who pressed Space to take a phone call cannot tell from a glance whether the sim is running. Fix: add a low-opacity slate vignette + centered "PAUSED" badge on the canvas while paused; render an `aria-live="polite"` region for overlay-state changes; flip `aria-pressed` on the toolbar pause button.

3. **(Layout) 1920px layout floats the playfield in a solid-black void; canvas backdrop is unframed.** `01-1920-title.png` shows the title modal as a small island in a near-empty `#000` field (20% of viewport on each side is solid black). Once in-game (`02-1920-game-start.png`, `09-1920-inspector.png`) the colony bottom-anchors to the lower-left and roughly 35% of the canvas above the visible coastline is the same flat `#020912`-ish black, reading as missing pixels rather than atmosphere. Fix: either (a) re-target the camera-reset (R / Home) to colony-bbox + 10% padding so the playfield centres properly, or (b) gradient the off-grid area to a warm horizon (top: dusk slate, bottom: deep navy) so the empty space reads as world-extent. Also: the title-screen modal should grow a max-width breakpoint at >=1600 and add ambient art (parallax stars, faint colony silhouette) to the surrounding void so the first impression is not just dark grey.

## Secondary Notes (not in top 3)

- **Heat-lens "plus" badge is half-clipped against the right rail** (`04-1920-heat-lens.png`, near the vertical "Heat (L)" tab) — same defect A4 R12 flagged. Move inboard ~6px or anchor inside the tab.
- **EntityFocus panel always shows ~538×426 px even when the player has not selected anyone** ("No entity selected. Click any worker, visitor, or animal on the map to inspect it here.") — that is ~12% of a 1920×1080 canvas burned on a placeholder string. Collapse to a single-line bottom-rail strip until something is selected, or auto-pick the most-stressed worker.
- **Death/event toasts pile up dead-centre over the playfield** (`02-1920-game-start.png` shows a red `Wolf-26 died - killed-by-worker` mid-canvas) — moving them into a dedicated right-side or bottom-side ticker would stop them from occluding the action and would give the canvas room to breathe.
- **Toast counter suffix `east ruined depot ×2`** is grammatically ungainly — prefer pluralising the noun ("east ruined depots") or suppressing duplicate location pings.
- **Resource HUD chips are 11px / `rgb(208,232,255)` on `rgba(255,255,255,0.04)` over a dark canvas — readable but at the floor of WCAG AA for small text** when the underlying canvas is the lighter green tile colour. Either bump to 12-13px or solidify the chip background.
- **No tab buttons (`Build`, `Colony`, `Settings`, `AI Log`, `Debug`, `Heat (L)`, `Terrain (T)`, `? Help`) carry `aria-label` or `aria-pressed`** — they are vertical text rotations that screen-readers will announce as the literal label only. Add `aria-pressed` matching the open/closed sidebar state.
- **No focus-visible outline on the "✕" close button in the help modal** — keyboard-only users would lose track. Add `:focus-visible` with a visible ring.
- **Z-stack reports modal panels with `z-index: auto`** (overlayPanel, overlayMenuTitle, overlay-* etc.) — relies on document order, brittle if any future panel injects above. Lock these to explicit z-index values matching the R11 PII modal-zstack contract.
- **Title-screen "Best Runs" list scrolls inside the modal but the scroll affordance is invisible** (`01-1920-title.png`) — needs a faint scroll-thumb or a "10 of N" label. Currently the list looks like the entire history.
- **Top-right `←` button (back to menu)** has no aria-label — confirm what state-loss it triggers.

## Coverage Matrix

| Viewport | Title | In-game | Heat lens | Terrain | Help | Pause | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1920×1080 | 01 | 02, 03, 09 | 04 | 10 | 05 | 11 | Right rail expanded; modal islanded |
| 1440×900 | — | 06 | — | — | — | — | Sidebar auto-collapsed to vertical tabs |
| 1366×768 | — | 07 | — | — | — | — | Top HUD adds objectives chips inline |
| 1024×768 | — | 08 | — | — | — | — | Sidebar re-expands; scoreboard overflows |

## Screenshots
- `screenshots/A6/01-1920-title.png` — title screen, void around modal
- `screenshots/A6/02-1920-game-start.png` — first frame in-game, central death toast
- `screenshots/A6/03-1920-after-10s.png` — `east ruined depot ×2` counter suffix, fallback director banner
- `screenshots/A6/04-1920-heat-lens.png` — clipped "plus" badge near Heat tab
- `screenshots/A6/05-1920-help.png` — help modal (clean)
- `screenshots/A6/06-1440-game.png` — sidebar auto-collapsed
- `screenshots/A6/07-1366-game.png` — header objectives chips inline
- `screenshots/A6/08-1024-game.png` — header WHISPER string wraps two lines, autopilot label clipped, scoreboard overflow
- `screenshots/A6/09-1920-inspector.png` — empty EntityFocus burning ~12% of viewport
- `screenshots/A6/10-1920-terrain-overlay.png` — fertility overlay (color-only encoding, R/G colourblind risk)
- `screenshots/A6/11-1920-paused.png` — paused state, indistinguishable from running except a small bottom-left pill
