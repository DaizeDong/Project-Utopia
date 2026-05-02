# Project Utopia Gameplay Design (Current Playable Scope)

Updated: 2026-05-01 (post HW7 R0-R3 + hotfix iter 1-6)

## 1. Gameplay Positioning

Project Utopia is a systems-driven colony sandbox prototype.

The player does not follow scripted missions. Instead, the player edits infrastructure and policy, then observes coupled simulation outcomes.

Core player verbs:
- build and erase infrastructure tiles (12 build tools, hotkeys 1-12)
- adjust doctrine and role pressure
- regenerate maps with template + seed
- recruit workers manually (food cost) or via the auto-recruit gate
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
4. The autopilot's recovery branch is gated to a small essential whitelist
   (farm / lumber / warehouse / road) so emergency builds cannot be
   crowded out by lower-priority infrastructure. A dedicated zero-farm
   safety net (priority 99) fires when `currentFarms === 0` and
   `timeSec < 180s` so the colony cannot start a run without a farm in
   the queue.

## 2.4 Ecology and Attrition Loop
1. Humans and animals consume hunger buffers over time.
2. Predators can damage and kill herbivores in close range.
3. Starvation and predation deaths permanently remove entities (no auto-respawn).
4. Worker starvation flow: a fixed global drain
   (`workerFoodConsumptionPerSecond = 0.038`) burns down
   `state.resources.food`. When food drops below
   `workerHungerDecayLowFoodThreshold = 8`, each worker's
   `entity.hunger` decays at `workerHungerDecayWhenFoodLow = 0.020/s`,
   reconnecting MortalitySystem's existing starvation chain
   (`hunger <= 0.045` + holdSec). The colony has ~84s of warning between
   the first low-food tick and the first death.
5. Population structure shifts, feeding back into production and safety pressure.

## 2.5 Recruitment Loop (food-cost growth)
1. Manual recruit: `Recruit One` button on the Population sidebar card
   (right side, always-visible) deducts `recruitFoodCost = 25` per spawn
   and respects a queue clamp + cooldown.
2. Auto recruit: when enabled, the system spawns up to
   `state.controls.recruitTarget` workers (default raised to 500 — see
   §6 cap removal).
3. Both paths share the same food gate; the disabled-button tooltip
   surfaces the blocking reason ("Need 25 food (have 12)" or
   "Recruit queue full").

## 3. Map Strategy and Identity

Default map size:
- `96 x 72`

Generation uses deterministic terrain algorithms (seeded) instead of rigid rectangular zoning.

Template presets:
- `temperate_plains`: broad balanced lowland logistics — *Broken Frontier* scenario.
  Goals: 6 farms / 3 lumbers / 2 warehouses / 8 walls / 20 roads.
- `rugged_highlands`: mountain-dominant terrain pressure — *Gate Bastion*.
- `archipelago_isles`: island-fragmented transport challenge — *Island Relay*.
- `coastal_ocean`: ocean-heavy coastal pressure — *Driftwood Harbor*.
- `fertile_riverlands`: food-rich river plain — *Silted Hearth*.
  Distinct from Plains: 8 farms (+33%), 2 lumbers, 1 warehouse,
  4 walls (-50%), 18 roads, **2 bridges**; stockpile 110 food / 80 wood.
  Wetland identity now reads in the goal stripe at game start.
- `fortified_basin`: fortified interior choke control — *Hollow Keep*.

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
- amplified day-night lighting tint (HW7 R1 polish; dawn / dusk /
  night colour amplitude bumped via `AtmosphereProfile.colorBlend = 0.62`
  so the cycle reads through weather + scenario overlays)

UI feedback principles:
- button interactions produce visible state changes/messages
- AI mode and simulation mode states are always observable
- debug telemetry is available without opening external tools
- HUD chips wrap (≤1366px) and collapse to icon-only (≤1280px) to fit narrow laptop displays
- toasts spawn above the Entity Focus card (z-order resolved)
- supply-chain heat-lens "supply surplus" markers flip the label to
  *"queued (delivery blocked)"* when any worker is actively food-seeking
  (`hunger < 0.35`), removing the surplus-vs-starvation contradiction
- food-rate display in the HUD subtracts spoilage so it matches the
  recovery-toast sampler (no more 13× drift)
- threat scale label anchors to the raid inflection: `Threat 50% (raid at 80%)`

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
- manual `Recruit One` button (Population sidebar card, always-visible)
- auto-recruit toggle

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
- Heat Lens (key `L`) with live click-popover and 4-bullet Help dialog
- developer dock for A*/Boids/AI/system timings/events is **hidden** in
  both production and dev mode (CSS `display:none !important` on
  `#devDock`); telemetry remains accessible via the Debug sidebar tab,
  AI Decision / AI Exchange / AI Policy floating panels, and the
  Performance Panel
- Performance Panel offers a dev-mode entity inject control
  (`?dev=1` URL or `Ctrl+Shift+D` chord)
- `Entity Focus` with full AI exchange payloads (request + raw response + parsed + guarded)
- Logic consistency counters include `deliverWithoutCarry`, feasibility rejects, and starvation risk entity counts
- stress benchmark and CSV export

AI behavior groups (current):
- workers
- traders
- saboteurs
- herbivores
- predators

AI steering mode:
- AI policy may publish temporary group `stateTargets` (with priority + TTL).
- Entities still obey legal FSM transitions; AI target is guidance, not arbitrary teleport between states.
- Infeasible AI/policy targets are rejected by the strict feasibility gate, then fall back to group default work states.
- LLM SYSTEM_PROMPT carries explicit survival heuristics: a SURVIVAL CHECK
  rule (zero-farm → `farm@critical`), a STONE-DEFICIT CHECK
  (`stone < 10` and no quarries → `quarry@critical`), and a
  `workerFocus` enum (`{build, guard}`) for late-game allocation.
  Extractor-saturated and defense-gap states are highlighted to the
  LLM so it stops over-building one resource chain.
- Autopilot includes a `proposeScoutRoadTowardFoggedStone` heuristic
  that extends roads toward fog-hidden STONE deposits before the
  player has scouted them.
- Autopilot now caps non-emergency proposals at the scenario's
  declared logistics goal counts (warehouses / farms / lumbers / walls)
  so it stops over-building once a goal is met. Emergency proposals
  (priority ≥ 90) bypass the cap.

Movement behavior profile:
- animals: higher cohesion/alignment for visible flocking
- humans: lower cohesion and stronger separation to avoid unrealistic crowd clumps
- workers/visitors with an active path get steering dampening from the
  Boids layer, so pathing units no longer jitter against the swarm
  behaviour of free-roaming agents
- initial wildlife spawn count raised (`INITIAL_POPULATION.herbivores = 8`,
  `predators = 2`) and the spawn-radius bonus widened
  (`wildlifeSpawnRadiusBonus = 6`) so the world reads as alive from frame 1

## 6. Current Boundaries

In scope (implemented):
- single-session colony simulation loop
- map templates with deterministic seed generation
- AI fallback-safe orchestration
- visual + telemetry-driven debugging

Hard population caps removed (HW7 hotfix iter4 batch E):
- `infraCap` no longer clipped to a 80-worker ceiling — the
  warehouse / farm / lumber / quarry / kitchen / smithy / clinic /
  herbGarden infrastructure formula now scales without an artificial cap.
- `popCap` mirror in `ColonyPerceiver` matches the new uncapped reality.
- `state.controls.recruitTarget` default raised 16 → 500 (matches the
  worker-target slider's `max="500"`).
- Per-building soft caps and the food-buffer / cooldown gates are preserved.

Out of scope (not in current iteration):
- save/load or replay timeline
- multiplayer synchronization
- long-horizon tech tree/faction diplomacy endgame systems
- final art polish pass (audio, walk cycle, directional shadow LUT —
  documented in `assignments/homework7/Post-Mortem.md` §4.5 as deferred
  beyond the HW7 budget)

## 7. Near-Term Expansion Directions

Practical next steps that fit current architecture:
1. stronger seasonal food chain dynamics
2. area brush tools for faster macro planning
3. richer event chains (fire, disease, convoy disruptions)
4. template-specific victory conditions and score summaries
