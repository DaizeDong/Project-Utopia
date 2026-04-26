---
plan_ids: [01e-innovation, 02b-casual]
round: 7
commit: 300e592
date: 2026-04-26
status: complete
---

# Implementation: 01e-特质接线/WHISPER + 02b-Advisory HUD (Wave 3A)

## Commit Message
`feat(v0.8.2 Round-7 01e+02b): trait behavioral wiring + local WHISPER narrative + emotional decision prefix + manual advisory HUD chip`

## What Changed

### 01e — Trait behavioral wiring

**`src/config/balance.js`**:
Added 6 trait constants: `workerTraitEffectsEnabled` (toggle), `traitHardyWeatherMult` (0.6), `traitHardyMoraleDecayMult` (0.75), `traitSocialRestDecayMult` (0.75), `traitSocialFriendBonus` (0.15), `traitEfficientTaskMult` (0.85), `traitResilientDeathThresholdDelta` (−0.05).

**`src/simulation/npc/WorkerAISystem.js`**:
- `getWorkerTraitModifiers(worker)` — reads `worker.traits[]`, returns modifier bundle applied per-tick.
- `addEmotionalPrefix(worker, state, text)` — prepends hunger/morale/grief status to decision context string.
- Per-tick wiring: `hardy` workers take 25% less adverse-weather morale damage; `social` workers lose rest 25% slower and gain rest bonus when near a Close Friend (opinion ≥ 0.45, within 3 tiles, sampled every 30 ticks). Emotional context written to `worker.blackboard.emotionalContext`.

**`src/ui/panels/EntityFocusPanel.js`**:
- Trait tags rendered as `<span class="trait-tag">hardy<span class="trait-desc"> (weather resistant)</span></span>` for 5 known traits.
- Grief notice (`💔 Grieving [name]`) when `blackboard.griefFriendName/griefUntilSec` active.
- Emotional context line below Decision Context in Why block.

### 01e — Local WHISPER narrative

**`src/ui/hud/storytellerStrip.js`**:
- `buildLocalWhisperNarrative(state)` — checks recent deaths, food < 30, cold kitchen → returns personalized narrative or `null`.
- Integrated into `computeStorytellerStripModel` fallback path before static voice-pack lookup.

### 02b — Manual mode advisory HUD chip

**`src/ui/hud/HUDController.js`**:
- Imports `ColonyPlanner`; in `#renderNextAction` when autopilot is off and next-action is idle/done, shows `💡 [advisory text]` chip from `ColonyPlanner.getAdvisoryRecommendation(state)`.
- New `#renderUrgentResourceEta(state)` — appends `⚠ [Resource] runs out in Xs` to `#statusObjective` when any resource ETA ≤ 120s.

## Validation
- `node --test test/*.test.js` — 1415/1422 pass (5 pre-existing failures)
- `hardy` workers' morale now degraded at 75% rate in adverse weather
- Manual mode HUD shows `💡` advisory chip when autopilot is off
- MOST URGENT resource ETA shown when any resource < 120s remaining
