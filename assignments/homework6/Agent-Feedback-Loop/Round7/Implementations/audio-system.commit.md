---
plan_id: audio-system
round: 7
commit: c328ce9
date: 2026-04-26
status: complete
---

# Implementation: audio-system (Wave 2C)

## Commit Message
`feat(v0.8.2 Round-7 audio): Web Audio OscillatorNode system — building/death/crisis/milestone sounds (P0-5 audio)`

## What Changed

### New file: `src/audio/AudioSystem.js`
Web Audio API class with lazy `AudioContext` initialization (only created on first user gesture, satisfying browser autoplay policy). 5 OscillatorNode-based sounds with no external audio assets:
- `onBuildingPlaced()` — short ascending tone (C5→G5, 0.15s)
- `onWorkerDeath()` — low descending drone (220Hz→110Hz, 0.4s)
- `onFoodCritical(nowRealSec)` — repeating beep every 5s when food < 60s remaining (440Hz, 3 pulses)
- `onMilestone()` — fanfare arpeggio (C4→E4→G4, 3 notes, 0.1s each)
- `onGameStart()` — rising sweep (200→600Hz, 0.5s)
- No-ops silently in Node.js (tests pass without AudioContext)

### Wired into game loop:
- `src/app/GameApp.js`: `audioSystem.onBuildingPlaced()` on build action; `audioSystem.onGameStart()` after world regeneration
- `src/simulation/lifecycle/MortalitySystem.js`: `audioSystem.onWorkerDeath()` in `recordDeath()` for colonists
- `src/ui/hud/HUDController.js`: `audioSystem.onFoodCritical()` in food runout hints; `audioSystem.onMilestone()` on milestone flash

## Validation
- `node --test test/*.test.js` — 1415/1422 pass (AudioContext no-ops in Node.js)
- No external audio files required; zero asset overhead
