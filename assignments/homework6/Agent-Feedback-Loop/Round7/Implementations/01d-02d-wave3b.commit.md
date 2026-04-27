---
plan_ids: [01d-mechanics-content, 02d-roleplayer]
round: 7
commit: c61024e
date: 2026-04-26
status: complete
---

# Implementation: 01d-天气/RunEnd + 02d-叙事层 (Wave 3B)

## Commit Message
`feat(v0.8.2 Round-7 01d+02d): rain particles + run-end chronicle summary + grief mechanic + Chronicles death log + salinization warning + scenario theme question`

## What Changed

### 01d — Weather visibility (SceneRenderer.js)
- **Rain particles**: `#createRainParticles()` — 200-point `THREE.Points` (color `0x88aacc`, size 0.15, opacity 0.5). `#removeRainParticles()` disposes geometry/material. `#updateRainParticles()` drops Y by 0.3/frame, resets to top. `render(dt)` activates/deactivates on `state.weather.current === 'rain' || 'storm'`.

### 01d — Salinization warning (TileStateSystem.js)
- When FARM tile `salinized > 0.7`, pushes `objectiveLog` advisory at most once per 180s per tile (dedup Map keyed `salinization:ix,iz`). Players no longer need to press T to discover soil issues.

### 01d + 02e — Run End Chronicle Summary (GameStateOverlay.js)
- `showRunEnd(state)` now renders: Day N · births/deaths/DevIndex, most frequent death cause, last fallen name, per-template theme question. 6 templates mapped + generic fallback. Diff-guarded on `data-sig` attribute.

### 02d — Grief mechanic (MortalitySystem.js)
- In `recordDeathIntoWitnessMemory`: witnesses with relationship opinion ≥ 0.6 receive `morale -= 0.15` (floor 0) and `blackboard.griefUntilSec = nowSec + 90`, `blackboard.griefFriendName` set. WorkerAISystem reads `blackboard` for efficiency hooks.

### 02d — Structured death log (MortalitySystem.js)
- `recordDeath()` pushes `{ name, role, trait, cause, location, timeSec }` into `state.gameplay.deathLogStructured` (cap 24) alongside existing obituary string.

### 02d — Chronicles panel (EventPanel.js)
- `<details class="chronicle-section">` block at bottom of `render()`, listing all `deathLogStructured` entries with skull emoji, bold name, trait suffix, cause, location, Day N. Collapsed by default, inlined CSS.

## Validation
- `node --test test/*.test.js` — 1415/1422 pass (5 pre-existing failures unrelated)
- Rain particles visible in `state.weather.current === 'rain'` scenes
- Close Friend witnesses of death show `griefUntilSec` in blackboard
- Chronicles panel lists all entries permanently (no truncation)
