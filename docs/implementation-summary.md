# Project Utopia Implementation Summary

Updated: 2026-05-01 (post HW7 R0-R3 + hotfix iter 1-6)

## 1. Summary

The project is in a playable and debuggable state with:
- deterministic simulation loop
- procedural seeded map generation
- visible AI/fallback behavior
- telemetry and step-based debugging controls
- Assignment-oriented test/build readiness
- HW7-tuned food balance, recruit flow, and autopilot guardrails

## 2. What Is Implemented

Simulation and systems:
- Worker / Visitor / Animal simulation
- A* navigation + Boids local steering (with active-path dampening so
  pathing entities no longer jitter against free-roaming swarms)
- resources, weather, and world events
- doctrine modifiers + objective progression
- food-cost recruitment (manual + auto) replacing auto-reproduction
- starvation chain reconnected: global food drain
  (`workerFoodConsumptionPerSecond = 0.038`) plus low-food
  per-entity hunger decay (`workerHungerDecayWhenFoodLow = 0.020/s`
  triggered when `state.resources.food < 8`)

Worker AI:
- **PriorityFSM** (v0.10.0) is the single source of truth — flat
  priority transition table, 14 named states, ~30 LOC dispatcher
- **Job layer is DELETED** — `src/simulation/npc/jobs/` removed
  wholesale (13 Job classes + JobScheduler + JobRegistry + JobHelpers
  + sticky-bonus hysteresis all retired in v0.10.0)
- Survival preempt is `priority: 1` inside HARVESTING's transition list
  (no separate `isSurvivalCritical` bypass)

Visitor AI:
- **VisitorFSM** is ON in production
  (`src/simulation/npc/fsm/VisitorFSM.js` + `VisitorStates.js` +
  `VisitorTransitions.js` + `VisitorHelpers.js`)

Animal AI:
- **AnimalAISystem** intentionally remains on the legacy
  StatePlanner / StateGraph path (no FSM rewrite scheduled)

AI pipeline:
- environment/policy request channels
- schema validation + guardrails
- deterministic fallback mode on failures
- local proxy endpoints for integration
- LLM SYSTEM_PROMPT extended with SURVIVAL CHECK (zero-farm →
  `farm@critical`), STONE-DEFICIT CHECK (`stone < 10` + no quarries →
  `quarry@critical`), extractor-saturated highlight, defense-gap
  highlight, and `workerFocus` enum (`{build, guard}`) for late-game
  allocation steering
- ColonyDirector autopilot reads a shared
  `RECOVERY_ESSENTIAL_TYPES` whitelist
  (`farm` / `lumber` / `warehouse` / `road`) so recovery branches do
  not block essential builds, plus a zero-farm safety net (priority 99,
  fires when `currentFarms === 0 && timeSec < 180`) and a
  `proposeScoutRoadTowardFoggedStone` heuristic
- Autopilot non-emergency proposals capped at scenario logistics goals
  so it stops over-building once warehouses/farms/lumbers/walls are met

Map generation:
- default `96 x 72`
- 6 template presets with deterministic seed behavior
- domain-warped fBm terrain fields
- meandering rivers, bridge corridors, organic roads
- district blobs and template-specific walls
- post-generation playability safeguards
- empty-base tile detection and normalization (`emptyBaseTiles`)
- runtime terrain tuning override support from UI controls
- per-template scenario goals for `frontier_repair`: Riverlands now
  ships 8 farms / 4 walls / +2 bridges and distinct objective copy,
  diverging from Plains (6 farms / 8 walls / no bridges)

Rendering and UX:
- bright top-down orthographic view
- textured tiles for every tile type
- icon overlays + hover/build previews
- amplified day-night lighting tint
  (`AtmosphereProfile.colorBlend = 0.62`, deeper dawn/dusk/night colours
  with retuned ambient/sun ramps so the cycle reads through overlays)
- clickable units with detailed inspector output
- HUD chips flex-wrap at ≤1366px and collapse to icon-only at ≤1280px
- themed scrollbars (wildcard `::-webkit-scrollbar` rule + Firefox
  `scrollbar-color`)
- toast layer z-order raised above the Entity Focus card
- food-rate display now subtracts spoilage so the HUD value matches
  the recovery sampler used by the autopilot toast
- supply-chain heat-lens label flips RED markers from
  *"supply surplus"* → *"queued (delivery blocked)"* when any worker
  is actively food-seeking; live click-popover + 4-bullet Help dialog
  available

Controls and tooling:
- map template/seed regeneration
- terrain tuning controls + reset-to-preset
- simulation pause/resume/step controls
- stress benchmark and CSV export
- sidebar population target controls for all creature groups
- `Recruit One` button on the always-visible Population sidebar card
  (right side); disabled-button tooltip exposes the blocking reason
- Performance Panel dev-mode entity inject (`?dev=1` /
  `Ctrl+Shift+D`)
- Bottom developer telemetry dock (`#devDock`) is force-hidden via
  CSS in both production and dev mode (HW7 R3 hotfix iter4 batch F);
  the panel module is preserved for future re-enable, all other dev
  surfaces remain (Debug sidebar tab, AI Decision / Exchange / Policy
  floating panels)

Population caps:
- `infraCap` no longer clipped to 80 (`PopulationGrowthSystem`)
- `state.controls.recruitTarget` default raised 16 → 500
- `ColonyPerceiver.popCap` mirror also uncapped
- soft per-building caps and food / cooldown gates preserved

## 3. Verification Status

Latest local checks:
- `node --test`: 1784 / 1776 pass / 5 fail / 3 skip (5 fails are
  pre-existing on parent — raid-escalator log curve drift,
  exploit-regression escalation-lethality, ResourceSystem
  foodProducedPerMin emit timing, RoleAssignment STONE quota,
  RaidFallbackScheduler popFloor; not regressions from HW7 work)
- `npm run build`: pass

## 4. Documentation and Deliverables

Core docs:
- `README.md`
- `docs/system-design.md`
- `docs/gameplay-design.md`
- `CHANGELOG.md` (HW7 R0-R3 + hotfix iter1-6 entries under `[Unreleased]`)
- `assignments/homework7/Post-Mortem.md`
- `assignments/homework7/Demo-Video-Plan.md`
- `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md`

Asset attribution:
- `public/assets/models/ATTRIBUTION.md`
- `public/assets/worldsim/ATTRIBUTION.md`

## 5. Known Limits

Not implemented in current scope:
- save/load persistence
- multiplayer sync
- late-game macro systems and final art pass

Documented HW7 deferrals (Post-Mortem §4.5):
- audio bus + SFX
- worker walk-cycle sprite atlas / rig
- directional shadow + sunset LUT
- DPI scaling pass

The current baseline is optimized for stable demonstration and iterative extension.
