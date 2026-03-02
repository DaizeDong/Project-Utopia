# Project Utopia Gameplay Design (Current Playable Scope)

Updated: 2026-03-02

## 1. Gameplay Positioning

Project Utopia is a systems-driven colony sandbox prototype.

The player does not follow scripted missions. Instead, the player edits infrastructure and policy, then observes coupled simulation outcomes.

Core player verbs:
- build and erase infrastructure tiles
- adjust doctrine and role pressure
- regenerate maps with template + seed
- control population targets
- pause/step simulation for analysis and tuning

## 2. Core Loops

## 2.1 Logistics Loop
1. Place roads and production/support tiles.
2. Workers navigate, collect, deliver, and rebalance roles.
3. Resource stocks update and enable additional construction.

## 2.2 Governance Loop
1. Switch doctrine presets (`balanced`, `agrarian`, `industry`, `fortress`, `trade`).
2. Doctrine modifies production/risk behavior.
3. Prosperity and threat curves shift based on systemic outcomes.

## 2.3 Pressure and Recovery Loop
1. Weather/events/visitors/predators inject instability.
2. Pathing congestion and supply pressure emerge.
3. Player adjusts layout, population targets, and doctrine to recover.

## 3. Map Strategy and Identity

Default map size:
- `96 x 72`

Generation uses deterministic terrain algorithms (seeded) instead of rigid rectangular zoning.

Template presets:
- `temperate_plains`: broad balanced lowland logistics
- `rugged_highlands`: mountain-dominant rugged terrain pressure
- `archipelago_isles`: island-fragmented transport challenge
- `coastal_ocean`: ocean-heavy coastal settlement pressure
- `fertile_riverlands`: food-rich river plain optimization
- `fortified_basin`: fortified interior choke control

Each template preserves distinct terrain and route characteristics while guaranteeing playable infrastructure minimums.
The generator also tracks `emptyBaseTiles` (uncovered base cells before final normalization) to guarantee there are no invalid blank tiles in final output.

## 4. Readability and Feedback Design

Visual goals are immediate readability and debugability.

Implemented:
- bright top-down orthographic camera
- textured tiles for all tile types
- tile borders + hover highlight + build preview validity colors
- icon overlays to reinforce tile semantics
- unit selection ring and full path visualization

UI feedback principles:
- button interactions produce visible state changes/messages
- AI mode and simulation mode states are always observable
- debug telemetry is available without opening external tools

## 5. Developer-Friendly Controls

Simulation controls:
- Pause/Resume
- Step x1
- Step x5
- Time scale

Population controls:
- target workers
- target visitors
- target herbivores
- target predators
- apply target counts (spawn/despawn)

Terrain controls:
- water level
- river count / width / meander
- mountain strength
- island and ocean bias
- road and settlement density
- wall mode and ocean side
- reset to current preset defaults

Diagnostics:
- Inspector for selected tile/entity details
- developer dock for A*/Boids/AI/system timings/events
- stress benchmark and CSV export

## 6. Current Boundaries

In scope (implemented):
- single-session colony simulation loop
- map templates with deterministic seed generation
- AI fallback-safe orchestration
- visual + telemetry-driven debugging

Out of scope (not in current iteration):
- save/load or replay timeline
- multiplayer synchronization
- long-horizon tech tree/faction diplomacy endgame systems
- final art polish pass

## 7. Near-Term Expansion Directions

Practical next steps that fit current architecture:
1. stronger seasonal food chain dynamics
2. area brush tools for faster macro planning
3. richer event chains (fire, disease, convoy disruptions)
4. template-specific victory conditions and score summaries

