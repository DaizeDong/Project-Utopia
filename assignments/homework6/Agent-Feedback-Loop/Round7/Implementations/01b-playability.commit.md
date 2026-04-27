---
plan_id: 01b-playability
round: 7
commit: 6dfd257
date: 2026-04-26
status: complete
---

# Implementation: 01b-playability

## Commit Message
`feat(v0.8.2 Round-7 01b): type=button audit + canvas preventDefault + toast dedup + food 200→400 + rate sign cross-check + no-farms advisor`

## What Changed

### Root fixes
- **type=button audit** (`index.html`): All `<button>` elements without explicit `type` attribute now have `type="button"`, preventing accidental form submission inside overlay panels.
- **canvas preventDefault** (`src/render/SceneRenderer.js`): Keyboard events on canvas now call `preventDefault()` to stop scrolling the page when using Space/arrows in game.
- **toast dedup** (`src/ui/hud/HUDController.js`): Duplicate toast messages within 5s are suppressed — prevents visual noise from repeated warnings.

### Balance
- **food 200→400** (`src/config/balance.js`): Starting food increased from 200 to 400, giving new players more runway to learn before starvation.

### Information display
- **rate sign cross-check** (`src/ui/hud/HUDController.js`): Resource rate display now validates sign consistency — negative rates shown in red, positive in green.
- **no-farms advisor** (`src/simulation/meta/ColonyPlanner.js`): When colony has 0 farms and food is falling, an advisor tip "Build a Farm on green terrain" appears in the HUD.

## Validation
- `node --test test/*.test.js` — 1415/1422 pass
- New players start with 400 food; duplicate toasts no longer spam the UI
