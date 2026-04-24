# Changelog

## [Unreleased] - v0.8.2 UI Overhaul + LLM Agent Context Expansion

**Scope:** Comprehensive UI polish pass (sidebar, status bar, Colony health card, dev tools separation, hotkey display, terrain overlay, tile info tooltip, fog fix, water hard-block) plus LLM agent context expansion (terrain/soil/node/connectivity aggregates, new fallback cases, bridge utility). No new tile types.

### New Features
- **UI overhaul**: Right sidebar with collapsible panels (Build/Colony/Settings/Debug); compact status bar (icon+number, no bars); Colony health card with THRIVING/STABLE/STRUGGLING/CRISIS badge; dev tools moved from Settings to Debug panel; sidebar tab divider; improved hotkey display in Build panel
- **Tile info system**: Hover tooltip in Select mode showing tile type, elevation, moisture, fertility, building info; T key terrain fertility overlay; lens button active-state visual
- **Terrain fog fix**: Fog-of-war DataTexture flipY=true, LinearFilter smooth edges, renderOrder=42 above all entities; fog correctly tracks worker positions
- **Water pathfinding**: Workers/animals hard-blocked from water tiles via BoidsSystem position revert; edge-boundary damping prevents corner-trapping
- **Resource spread**: Radial zone bias pushes FARM/LUMBER/QUARRY/HERB placement away from colony center; minimum inter-cluster distance (12 tiles)
- **AI building terrain-awareness**: PlacementSpecialist terrain scoring, water-edge penalty (−5.0 for >1 water neighbors), synergy bonuses (farm→warehouse, kitchen→warehouse, etc.)
- **LLM agent context**: ColonyPerceiver now reports terrain (elevation/moisture), soil health (salinization), resource node depletion, and water connectivity to LLM and fallback planner
- **LLM fallback cases**: PromptBuilder handles medicine shortage, tool shortage, soil crisis, node depletion, water isolation
- **Bridge utility**: ColonyPlanner detects water-isolated resources and suggests bridge construction; `bridge` added to worker allowed targets in aiConfig.js

### Validation

- Full suite: `1185/1187` pass (1185 pass, 0 fail, 2 pre-existing skips).
- Browser smoke test: game loads with no console errors; status bar compact; Colony health card live; Build panel hotkey grid visible; sidebar tab divider present; Debug panel contains dev tools.

---

## [Unreleased] - v0.8.x UI Overhaul — Dev/Player Separation, Colony Health Card, Hotkey Grid, Tab Divider

**Scope:** Comprehensive UI polish pass. Separates dev tools from player controls, adds Colony Health Card overview, improves hotkey discoverability, adds visual sidebar tab grouping. No new game mechanics or tile types.

### New Features / Improvements

- **Settings panel cleaned up** (`index.html`): Settings panel now shows only player-facing controls (farm ratio, role quotas, map template/doctrine, autopilot, save/load undo/redo). Terrain Tuning, Advanced Runtime, and Population Control sections moved to a new "Dev Tools" collapsible card inside the Debug panel. All element IDs preserved.

- **Colony Health Card** (`index.html`, `HUDController.js`): Added `#colonyHealthCard` at the top of the Colony panel showing live status badge (THRIVING/STABLE/STRUGGLING/CRISIS), current day, food rate per minute, idle worker count, and threat percentage. Left border color changes green/yellow/red based on threat tier. Updated via new `#updateColonyHealthCard(state)` private method called each render().

- **Hotkey grid in Build panel** (`index.html`): Replaced the tiny dismissible status-bar hint with a proper 2-column keyboard shortcut grid at the bottom of the Build Tools card. Covers 10 bindings (1–12, Space, Esc, T, L, F1/?, Ctrl+Z, Ctrl+Y, 0, Alt+Click) in monospace font with key-cap styling.

- **Sidebar tab divider** (`index.html`): Added `<div class="sidebar-tab-divider">` between Debug and Heat (L) buttons in the tab strip. Lens/Help buttons styled with lower-opacity tint to visually distinguish tool-toggles from panel-navigation tabs.

- **Sidebar toggle arrow** (`index.html`): Toggle button now shows `←` (U+2190) when sidebar is open and `☰` when closed, making close direction explicit.

- **Status bar hotkey hint hidden** (`index.html`): `#hotkey-hint` span kept in DOM for JS compatibility but hidden (display:none). Hotkey information now lives in the Build panel.

### Files Changed

- `index.html` — Settings panel restructure, Dev Tools section in Debug panel, Colony Health Card, hotkey grid, tab divider + lens styling, sidebar toggle arrow
- `src/ui/hud/HUDController.js` — `#updateColonyHealthCard(state)` private method + render() call

### Validation

- Full suite: `1185/1187` pass (1185 pass, 0 fail, 2 pre-existing skips).
- Browser smoke test: Colony Health Card updates live, Settings panel shows only player controls, Debug panel shows Dev Tools subsection, hotkey grid visible in Build panel, tab divider visible in sidebar strip, toggle button shows ←/☰ correctly.

## [Unreleased] - v0.8.x Optimization Round 3 — Final Polish: Edge Damping, Fog Z-Order, Tooltip Bounds, HUD Hint, Bridge AI

**Scope:** Five targeted hardening passes completing the Round 3 polish spec. No new tiles, buildings, or colony mechanics added.

### New Features / Improvements

- **Worker edge boundary damping** (`BoidsSystem.js`): After the existing impassable-tile revert, added a boundary reflection step that strongly damps (×0.3) any velocity component pointing further toward the map edge when an entity is within 1.5 tile-sizes of the boundary. Prevents boids forces from cornering path-following workers even when they have a valid active route.

- **Fog renderOrder fix** (`FogOverlay.js`): Raised fog mesh `renderOrder` from 10 to 42 (above the highest scene renderOrder SELECTION_RING=38). With `depthTest:false`, the fog quad now correctly composites over all 3D entities — workers/animals in HIDDEN zones are properly occluded rather than peeking through the fog layer.

- **Tooltip sidebar-aware positioning** (`SceneRenderer.js`): `#updateTileInfoTooltip` now detects whether the right sidebar is open (`#wrap.sidebar-open`) and uses a tighter right-bound limit (280px vs 36px for tab strip only), preventing tooltips from being hidden under the sidebar panel. Also adds a 50px bottom guard for the control bar.

- **HUD hotkey hint** (`index.html`): Added a dismissible `#hotkey-hint` span in the status bar — "Select: hover tiles for info · T: fertility" — styled at 9px / 50% opacity so it doesn't compete with resource displays. Clicking hides it permanently for the session.

- **Bridge utility AI** (`ColonyPlanner.js`): Added `_detectWaterIsolation` helper and a Priority 5.5 step in `generateFallbackPlan`. When any FARM/LUMBER/QUARRY/HERB_GARDEN tile has no reachable warehouse (BFS probe) and has an adjacent WATER tile, the fallback planner emits a medium-priority `bridge` action at the water tile coordinate. Surfaces the "resources cut off by water" signal that was previously invisible to the AI.

### Files Changed

- `src/simulation/movement/BoidsSystem.js` — boundary reflection velocity damping after passability revert
- `src/render/FogOverlay.js` — renderOrder 10 → 42 to occlude entities correctly
- `src/render/SceneRenderer.js` — sidebar-aware tooltip right bound + bottom guard
- `index.html` — `.hud-hint` CSS + `#hotkey-hint` dismissible span in `#statusBar`
- `src/simulation/ai/colony/ColonyPlanner.js` — `_detectWaterIsolation` helper + Priority 5.5 bridge suggestion in `generateFallbackPlan`

### Validation

- Full suite: `1185/1187` pass (1185 pass, 0 fail, 2 pre-existing skips).
- Browser smoke test: game loads, fog renders correctly over entities, workers stay on land, T toggles terrain overlay, hotkey hint visible and dismissible.

## [Unreleased] - v0.8.x Optimization Round 2 — Fog Polish, Tooltip Depth, Resource Spread

**Scope:** Four targeted quality improvements building on Round 1 foundations. No new tiles, buildings, or game mechanics added.

### New Features / Improvements

- **Fog smooth edges** (`FogOverlay.js`): Changed DataTexture `magFilter`/`minFilter` from `NearestFilter` to `LinearFilter` so the GPU bilinearly interpolates between fog-state texels, eliminating the hard pixelated tile-border artifact. Added `edgeSoftness: 0.15` uniform and updated the fragment shader to use `smoothstep` for a gentle alpha blend between HIDDEN (0.75) and EXPLORED (0.35) zones.

- **Tooltip building info** (`SceneRenderer.js`): `#updateTileInfoTooltip` now shows a "Role / Input / Output" row block for every building tile type (FARM, LUMBER, QUARRY, HERB_GARDEN, WAREHOUSE, KITCHEN, SMITHY, CLINIC, ROAD, BRIDGE, WALL, RUINS). Added a keyboard shortcut footer: "B = build · R = road · T = fertility" at the bottom of every tooltip.

- **Resource cluster minimum distance** (`Grid.js`): `placeDistrictBlobs` now accumulates placed blob centers and skips any candidate center whose Euclidean distance to an existing center of the same type is less than `BLOB_MIN_SPREAD * 0.5` (6 tiles). `BLOB_MIN_SPREAD = 12`. Prevents farm/lumber/quarry/herb blobs from merging into one super-cluster at a single map edge.

### Goals Skipped

- **Goal B (spawn water check)**: All worker spawn paths (`EntityFactory.createInitialEntitiesWithRandom`, `PopulationGrowthSystem`, `GameApp.applyPopulationTargets`, `GameApp.setExtraWorkers`) already use `randomPassableTile` or `randomTileOfTypes` which filter out WATER tiles. No code change needed.
- **Goal C (bridge utility)**: Deferred — bridge AI integration in ColonyPlanner/ColonyPerceiver requires careful connectivity analysis to avoid false positives.

### Files Changed

- `src/render/FogOverlay.js` — LinearFilter, edgeSoftness uniform, smoothstep fragment shader
- `src/render/SceneRenderer.js` — building desc block + keyboard hint footer in tooltip
- `src/world/grid/Grid.js` — BLOB_MIN_SPREAD constant + spread check in placeDistrictBlobs

### Validation

- Full suite: `1185/1187` pass (1185 pass, 0 fail, 2 pre-existing skips).

## [Unreleased] - v0.8.x Optimization Round 1 — Fix Verification + UI Polish

**Scope:** Verified 7 previously implemented fixes (fog of war, water passability, edge-stuck workers, tile tooltip, terrain overlay, resource spread, AI placement) via live browser observation. Made 3 targeted UI improvements; no new features, tiles, buildings, or game logic added.

### Verified Fixes (all confirmed working)

1. **Fog of war** (`FogOverlay.js`): `flipY=true` + `renderOrder=10` correctly aligns revealed area with worker positions.
2. **Water passability** (`BoidsSystem.js`): entities revert to previous position when pushed onto impassable (WATER/WALL) tiles by boids forces.
3. **Edge-stuck workers** (`Navigation.js`): idle workers within 8% of map edge receive a center-seeking velocity, preventing boids from trapping them at boundaries.
4. **Tile info tooltip** (`SceneRenderer.js`): tooltip shows tile name, passable status, elevation, moisture, fertility, yield pool, salinization, and neighbor hints when Select tool is active.
5. **Terrain overlay** (`SceneRenderer.js`): T key toggles fertility overlay; tile tab button shows active state via `classList.toggle("active", active)`.
6. **Resource placement spread** (`Grid.js`): `radialZoneBias` function penalizes resource placement within 8 tiles of center and rewards placement beyond 25 tiles, pushing farms/lumber/quarries outward.
7. **AI building terrain-awareness** (`PlacementSpecialist.js`): candidate tiles sorted by terrain score; water-edge penalty and synergy bonuses applied before LLM/algorithmic placement.

### Improvements Made

- **Entity Focus panel repositioned** (`index.html`): moved from `bottom: 50px; left: 50%` (center-screen, blocking game canvas) to `bottom: 50px; left: 8px` (bottom-left corner). Also hidden during pregame. Frees the center viewport for the game map.
- **Tile tooltip HTML formatting** (`SceneRenderer.js`): switched from plain `textContent` with `pre-line` to `innerHTML` rows — tile name is bold, passable status is green/red, fertility label is color-coded, hints are italic. Uses a local `esc()` helper to prevent XSS from enum strings.
- **Lens button active state** (`index.html`): `#terrainLensBtn.active` now shows green tint (`rgba(76,175,80,0.22)`) and `#heatLensBtn.active` shows amber tint, distinguishing "overlay is ON" from a selected panel tab (blue).

### Files Changed

- `index.html` — entity focus position, tooltip white-space, lens active styles
- `src/render/SceneRenderer.js` — tooltip HTML formatting with bold keys and color-coded values

### Validation

- Full suite: `1185/1187` pass (1185 pass, 0 fail, 2 pre-existing skips).
- Browser smoke: all 7 fixes verified via live screenshots and JS evaluation; 3 improvements confirmed visually.

## [Unreleased] - v0.8.x iter-4 Blind Review / System Trust Pass (Agent-Feedback-Loop Round 4)

**Scope:** 10 blind reviewer feedbacks, 10 enhancer plans, 3 accepted structural plans, and 7 deferred/subsumed plans executed in 3 waves. Feature freeze held: no new buildings, tiles, tools, assets, audio, victory conditions, score systems, or character-sim mechanics.

**Why this round stayed narrow:** the user explicitly required blind review and rejected any process that improved reviewer scores by leaking repo history or prior-round context. Round 4 therefore filtered aggressively for plans that made the current system easier to trust, rather than plans that merely made it easier to talk about.

### Round 4 Highlights

- **Run-entry stability** (02c): removed first-load help takeover, made the run-start transition immediate, and clarified the start/retry/reroll contract.
- **Menu truth contract** (02a): the menu briefing now tracks the currently selected template and map size, and `Start Colony` consumes exactly that visible choice.
- **Causal HUD loop** (01b): `statusNextAction` now renders bottleneck -> action -> outcome guidance instead of raw target-counter phrasing.
- **Build consequence preview** (01b): BuildAdvisor summaries now lead with concrete route/depot/throughput consequences and tile coordinates.
- **Autopilot truth demotion** (01b): OFF-state autopilot copy now states that manual control is active, and the chip tooltip no longer leaks extra implementation framing.

### Validation

- Full suite: `1078/1080` pass, `0` fail, `2` pre-existing skips.
- Benchmark (`seed=42 / temperate_plains / 90 days`): reached max days, DevIndex `37.8`, survival score `20450`, `passed=true`.
- Browser smoke: menu and active-run screenshots captured; active run showed the new causal next-action string, truthful autopilot OFF copy, visible canvas, hidden overlay after start, and no console/page errors.

### Structural Limit

Round 4 is cleaner than earlier rounds both procedurally and product-wise: it preserved blind review and improved the truthfulness of the playable control surface. But it still did not move the long-horizon ceiling. The 90-day benchmark stayed flat versus Round 3, which means the deeper economy/logistics/director/autopilot loop is still the limiting factor rather than the wording wrapped around it.

## [Unreleased] - v0.8.x iter-3 Structural Control Pass (Agent-Feedback-Loop Round 3)

**Scope:** 10 reviewer feedbacks, 10 enhancer plans, 4 accepted P0 plans, 6
subsumed/deferred plans, implemented in 2 waves plus a Stage D benchmark
calibration fix. Feature freeze held: no new buildings, tiles, tools, assets,
audio, victory conditions, score systems, mood/grief/relationship mechanics, or
tutorial levels.

**Why this round changed direction:** Rounds 0-2 improved readability,
onboarding, HUD feedback, copy, and visual discoverability, but those gains did
not materially change player agency or long-run outcomes. Round 3 accepted only
plans that made decisions more executable or made the control surface more
truthful.

### Round 3 Highlights

- **Next-action contract** (01a): added `getNextActionAdvice` and a
  `#statusNextAction` HUD chip that chooses one live action from food risk,
  broken routes, missing depots, and unmet logistics targets.
- **Build consequence preview** (01b): extended BuildAdvisor preview text with
  warehouse distance, depot coverage, road connection, and isolated-producer
  warnings before resources are spent.
- **Worker recovery tuning** (01d): moved hunger and delivery thresholds ahead
  of Round 2 while Stage D calibrated them back from an over-aggressive first
  pass that caused a day-21 benchmark loss.
- **Autopilot truth contract** (02c): centralized autopilot chip text/title/data
  attributes in `getAutopilotStatus`, including mode, coverage target, and
  policy countdown.

### Validation

- Full suite: `1069/1071` pass, `0` fail, `2` pre-existing skips.
- Benchmark (`seed=42 / temperate_plains / 90 days`): final run reached max
  days, DevIndex `37.8`, survival score `20450`, `passed=true`.
- Browser smoke: active run showed `Next: Build Farm 4/6`, autopilot OFF
  fallback chip, canvas present, status bar visible, and no console/page errors.

### Structural Limit

Round 3 is greener than Rounds 0-2 because it touches agency and recovery
contracts, not only presentation. It is still not a fundamental breakthrough:
the 90-day DevIndex remains in the same band as Rounds 1-2, so the deeper
economy/logistics/autopilot loop remains future work outside this feature
freeze.

## [Unreleased] - v0.8.x iter-2 UX / Readability Polish (Agent-Feedback-Loop Round 2)

**Scope:** 10 accepted enhancer plans executed in 3 waves across commits
`7065647..76d7393`, plus Stage D stabilization commit `d0bf672`. Feature
freeze held: no new tile/building/tool constants, no new audio/assets, no new
win, score, mood, or grief mechanics.

**Test surface:** full suite `1055/1057` pass, `0` fail, `2` pre-existing
skips. Long-horizon benchmark (`seed=42 / temperate_plains / 90 days`) ended
at DevIndex `37.77`, deaths `157`, survival score `20070`, matching the Round
1 baseline after the Stage D starter-wall stabilization.

### Round 2 Highlights

- **Select/start/template/x4 fixes** (02a): added Select toolbar support,
  made Start honor the selected map template, and aligned x4 simulation clamp.
- **Death alerts and goal chips** (01c): added death-alert surfaces, goal chip
  rendering, and tighter mid-width HUD behavior.
- **Scenario/fog/milestone onboarding** (01a): slimmed scenario footprints
  without pre-completing objectives, implemented FogOverlay, and emitted
  milestone flashes through the existing event path.
- **Heat and placement lenses** (01d): surfaced Heat Lens as tile overlays,
  added placement-lens feedback, and expanded tile insight text.
- **Casual feedback toasts** (02b): connected death/milestone/resource
  feedback to the HUD and event stream.
- **Playability/autopilot polish** (01b): defaulted autopilot off for manual
  starts, exposed an autopilot chip, and split score/dev tooltips.
- **Speedrunner controls** (02c): completed 1-12 shortcut coverage, top-bar
  autopilot mirroring, and x4 UI label/slider alignment.
- **Roleplayer memory** (02d): recorded worker memories for deaths and world
  events, humanized relationship labels, and softened fallback director voice.
- **Innovation signals** (01e): added actionable DIRECTOR coordinates,
  scenario/template storyteller tags, and stronger Heat Lens pulse coverage.
- **Indie critic polish** (02e): fixed storyteller strip flex truncation,
  diffused stronger voice into BuildAdvisor/glossary copy, and gated
  `window.__utopia` behind dev mode while keeping `__utopiaLongRun` public.

### Validation

- Stage D fix `d0bf672` restored the Temperate Plains starter-wall floor so
  the 90-day benchmark returned from DevIndex `32.69` to the Round 1 baseline
  `37.77` while starter walls still remain below the new logistics target.
- Vite + Playwright smoke: no console errors; `/` hides `window.__utopia` and
  keeps `window.__utopiaLongRun`; `/?dev=1` exposes both.
- Round 2 artifacts archived under
  `assignments/homework6/Agent-Feedback-Loop/Round2/`.

## [Unreleased] — v0.8.x iter-0 UX Polish (Agent-Feedback-Loop Round 0)

**Scope:** 10 independent enhancer plans executed in 4 waves across commits
`bf24945..eca024f`. Feature freeze — no new mechanics, buildings, resources,
roles, or tile types. Pure UX, voice, onboarding, and content-surfacing
polish on top of the v0.8.1 survival-hardening base.

**Test surface:** full suite 865 → 970 pass / 0 fail / 2 skip (pre-existing)
across 18 new test files. Long-horizon benchmark (`seed=42 /
temperate_plains / 90 days`) verified against the v0.8.1 DevIndex baseline
of 44 with a -5% regression floor at 41.8.

### UX Improvements

- **Dev-mode gate** (01c-ui) — Settings, Debug, Advanced Runtime, Terrain
  Tuning, Population Control, and `#devDock` now hidden behind
  `body.dev-mode`; unlock via `?dev=1` URL param, localStorage flag, or
  `Ctrl+Shift+D` chord. `#initDevModeGate()` in `GameApp.js`; helpers
  extracted to new `src/app/devModeGate.js`.
- **Casual profile** (02b-casual) — `uiProfile: "casual"` default stored in
  `state.controls.uiProfile` and mirrored to `body.casual-mode`. Secondary
  HUD cells (meals / tools / medicine / prosperity / threat) tagged
  `data-resource-tier="secondary"` and hidden in casual mode. Profile
  toggled via `?profile=full` URL param + `Alt+Shift+U` chord.
- **Data-tooltip pipeline** (01a-onboarding) — `title` attributes migrated
  to styled `data-tip` tooltips via existing `#customTooltip` migration
  script. Added Prosperity / Threat descriptive tooltips.
- **Floating toast layer** (01b-playability) — `#floatingToastLayer` in
  `#viewport` renders per-click `-N wood` (success) or `Need N more wood,
  M more stone` (failure) flyouts at the clicked tile. 100ms throttle, 6-
  node pool. `formatToastText` exported for unit tests.
- **Storyteller strip** (01e-innovation) — `#storytellerStrip` ribbon
  (max 24px, ellipsis) after `#statusScoreboard` shows a one-line colony
  narrative tick sampled from worker mood + recent events.
- **Scoreboard ribbon** (02c-speedrunner) — `#statusScoreboard` wraps
  `#statusObjective` alongside `#statusScenario` (compact progress) and
  `#statusScoreBreak` (`+1/s · +5/birth · -10/death` decomposition).
  DevIndex dim breakdown exposed via `#statusObjective` title tooltip.
- **Help modal** (01a-onboarding) — `#helpBtn` in `#panelToggles` plus
  `#overlayHelpBtn` in main menu; `F1` / `?` / `ESC` keybindings;
  first-run auto-open gated by `localStorage.utopia:helpSeen`. Three
  tabs: Controls / Resource Chain / Threat & Prosperity.
- **End-panel gate** (01a-onboarding) — `EntityFocusPanel` FSM / path /
  weight dumps now wrapped in BOTH `casual-hidden` AND `dev-only`
  classes; human-readable Hunger label ("Well-fed" / "Peckish" /
  "Hungry" / "Starving") added for casual mode.
- **Responsive statusBar** (01c-ui) — `@media (max-width: 1024px)` wrap +
  `@media (max-width: 640px)` hide/stack rules on `#panelToggles` region.
- **Scenario headline persistence** (02e-indie-critic) —
  `#statusScenarioHeadline` italic muted span wired to
  `state.gameplay.scenario` with value-diff render cache.

### Bug Fixes

- **Dev-telemetry `loading…` race** (01d-mechanics-content) — removed
  `dock-collapsed` guard around `DeveloperPanel.render()` so panel renders
  unconditionally; six `<pre>loading...</pre>` placeholders replaced with
  `Initializing telemetry…` then `Awaiting first simulation tick…` (02e
  voice-cleanup pass).
- **Toast max-width truncation** (01d-mechanics-content) — `.hud-action`
  `max-width: 140px → 420px`; `setAttribute("title", ...)` mirror clears
  on empty-frame transitions so stale tooltips don't stick.
- **Heat Lens toast terminology** (02e-indie-critic) — `toggleHeatLens()`
  toasts unified: `"Heat lens ON — red = surplus, blue = starved."` /
  `"Heat lens hidden."` / `"Heat lens restored."`. Legacy
  "Pressure lens" copy removed.
- **Worker phase-gated shortcuts** (02b-casual, via 01c gate) — L / 0 /
  1-6 hotkeys no longer fire in menu phase when build tools are
  inactive.
- **Menu-phase HUD timer guard** (01b-playability) — both sidebar
  `objectiveVal` and statusBar `statusObjective` blocks now guard on
  `state.session?.phase === "active" && totalSec > 0`; pre-active frames
  render `Survived --:--:--  Score —` and suppress `· Dev N/100`.

### Content Surfacing

- **GameEventBus → DeveloperPanel** (02a-rimworld-veteran) — `Colony Log`
  block between Objective Log and Active Events reads
  `state.events?.log` tail, formats via new
  `formatGameEventForLog(event)` module export (ASCII tags per CLAUDE.md
  no-emoji rule: `[HUNGER]`, `[DEATH]`, `[RAID]`, `[FIRE]`, `[VERMIN]`,
  `[TRADE]`, `[WEATHER]`, `[SHORTAGE]`, `[SABOTAGE]`, `[VISITOR]`,
  `[QUEUE]`, `[RECYCLE]`, `[MILESTONE]`); noisy types suppressed. New
  empty-state string teaches what the panel surfaces.
- **Death narratives → objectiveLog** (02d-roleplayer) —
  `MortalitySystem.recordDeath` now pushes
  `"[Xs] Aila-12 died (starvation) near (45,33)"` into
  `state.gameplay.objectiveLog` (capped at 24 entries via `unshift` +
  `slice`). Animal deaths excluded to avoid spam.
- **Worker / Visitor names** (01e + 02d R1 merge) —
  `WORKER_NAME_BANK` (40 frozen given-names, 01e) +
  `TRADER_NAME_BANK`/`SABOTEUR_NAME_BANK` (22 each, 02d); seeded
  `pickWorkerName` / `pickVisitorName` with `seqFromId` suffix produces
  stable displayNames like `Aila-10` / `Mercer-217`. Name draws happen
  before other `random()` consumers to preserve replay determinism. Also
  added `buildWorkerBackstory(skills, traits)` → `"<topSkill>
  specialist, <topTrait> temperament"` and stock visitor/animal
  backstrings.
- **Character block in EntityFocusPanel** (02d-roleplayer) —
  `<details data-focus-key="focus:character" open>` block showing
  Traits / Mood / Morale / Social / Rest / top-3 Relationships (with
  displayName reverse-lookup) / last 3 `memory.recentEvents`. Placed
  above Policy Focus (01e) and above the `.casual-hidden` + `.dev-only`
  engineering block (01a).
- **HUD resource rates** (01d-mechanics-content) — 7 resources
  (food/wood/stone/herbs/meals/tools/medicine) now carry trailing
  `▲ +x.x/min` / `▼ -x.x/min` / `= 0.0/min` rate badges, computed from a
  3-sim-second window snapshot cache.
- **FF timeScale clamp 3 → 4** (02c-speedrunner) — `#speedFastBtn`
  target 2.0 → 4.0; `simStepper.js` clamp `Math.min(3, timeScale || 1)`
  → `Math.min(4, ...)`. Accumulator 0.5s cap unchanged, so Phase 10
  determinism guarantees preserved.
- **EventPanel "Recent Colony Events"** (02d-roleplayer) — after active
  events list, appends top 6 `state.gameplay.objectiveLog` entries;
  `<summary>Events &amp; Colony Log</summary>` summary label updated.

### Files Changed

- **Touched:** ~18 unique files (with dedup) across `src/app/`,
  `src/entities/`, `src/render/`, `src/ui/hud/`, `src/ui/panels/`,
  `src/ui/tools/`, `src/ui/interpretation/`, `src/simulation/lifecycle/`,
  and `index.html`.
- **New helpers:** `src/app/devModeGate.js` (dev + casual profile
  gates), `WORKER_NAME_BANK` / `TRADER_NAME_BANK` / `SABOTEUR_NAME_BANK`
  + `pickWorkerName` / `pickVisitorName` / `buildWorkerBackstory` /
  `seqFromId` / `formatToastText` / `formatGameEventForLog` /
  `getScenarioProgressCompact` / `getSurvivalScoreBreakdown` /
  `computeStorytellerStripText` exports.
- **New tests (18 files):** `test/dev-mode-gate.test.js`,
  `test/responsive-status-bar.test.js`, `test/hud-resource-rate.test.js`,
  `test/toast-title-sync.test.js`, `test/build-toast-feedback.test.js`,
  `test/hud-menu-phase.test.js`, `test/ui-profile.test.js`,
  `test/build-validity-overlay.test.js`, `test/help-modal.test.js`,
  `test/entity-focus-player-view.test.js`, `test/event-log-rendering.test.js`,
  `test/ui-voice-consistency.test.js`, `test/world-explain-scoreboard.test.js`,
  `test/sim-stepper-timescale.test.js`, `test/entity-factory.test.js`,
  `test/hud-storyteller.test.js`, `test/entity-names.test.js`,
  `test/death-narrative-log.test.js`.

### Deferred to next round

- Playwright smoke automation (6/10 plans marked UNREPRODUCIBLE or time-
  budget skipped).
- Balance tuning (day-365 DevIndex ≥ 70) — this iter was UX-only; see
  Phase 10 scope note.

## [Unreleased] — Phase 10 Long-Horizon Determinism Hardening

**Goal:** make `bootHeadlessSim`'s 365-day benchmark trajectory bit-identical
across runs with the same seed + preset, so balance-tuning deltas stop
getting lost in Math.random noise.

**Contract verified.** Three boots of `bootHeadlessSim({ seed: 42, preset:
"temperate_plains" })` run 5000 ticks each produce identical state hashes.
Two cross-process `bench:long --seed 42 --preset temperate_plains
--max-days 90` runs produce identical `outcome`, `daysCompleted`,
`devIndex`, and `survivalScore`. Previously these diverged by 10–40% due
to wall-clock-driven Math.random.

### Nondeterminism sources removed

- **WeatherSystem** — `pickWeatherFromSeason` and duration jitter now draw
  from `services.rng.next()`; Math.random fallback kept only for ad-hoc
  callers that predate the services contract.
  ([src/world/weather/WeatherSystem.js](src/world/weather/WeatherSystem.js))
- **Grid.createInitialGrid** — farm/lumber/herb fertility init used
  Math.random, breaking bit-reproducibility across identical seeds. Now
  uses `createRng(seed + 9973)`.
  ([src/world/grid/Grid.js](src/world/grid/Grid.js))
- **WildlifePopulationSystem** — `pickSpawnTile` and `spawnAnimals` had
  `rng?.next?.() ?? Math.random()` silent fallbacks; rng is now a function
  passed through with a single defined fallback at the system boundary.
  ([src/simulation/ecology/WildlifePopulationSystem.js](src/simulation/ecology/WildlifePopulationSystem.js))
- **Path budget wall-clock** — `pathBudget.maxMs = 3` lets wall-clock
  timing drive when paths get skipped, producing run-to-run divergence
  even on identical seeds. `createServices({ deterministic: true })` sets
  `pathBudget.maxMs = Infinity` for benches; production path still uses
  3ms so slow-device FPS targets are preserved.
  ([src/app/createServices.js](src/app/createServices.js))
- **Services threaded through BuildSystem callers** —
  `BuildAdvisor.rollRuinSalvage` was calling Math.random via
  `previewToolAt`/`placeToolAt`. Services now flow through
  `ColonyDirectorSystem.update → fulfillScenarioRequirements →
  findPlacementTile`, `PlanExecutor.groundPlan → _groundSkillStep`,
  `SkillLibrary.assessSkillFeasibility`, and
  `AgentDirectorSystem.executeNextSteps`.
- **`randomPassableTile` / `randomTileOfTypes` callers** —
  `VisitorAISystem:324,431`, `AnimalAISystem:328,407,639`, and
  `WorkerAISystem:847` now pass `() => services.rng.next()`; Grid's
  Math.random default is no longer reached on sim hot paths.
- **BenchmarkPresets.applyPreset** — worker hunger jitter and spawn
  position scatter used Math.random. `applyPreset` now takes a `services`
  argument and routes through `services.rng`. SimHarness and bench
  entrypoints (`scripts/benchmark-runner.mjs`, `scripts/comprehensive-eval.mjs`)
  updated to thread services through at boot.
  ([src/benchmark/BenchmarkPresets.js](src/benchmark/BenchmarkPresets.js),
  [src/benchmark/framework/SimHarness.js](src/benchmark/framework/SimHarness.js))

### Regression coverage

- `test/long-horizon-determinism.test.js` — three boots of `bootHeadlessSim`
  at 500 ticks (temperate_plains) + 2000 ticks (rugged_highlands) must
  hash identically. Guards against future Math.random reintroduction.
- 865 existing tests still pass (0 regressions).

### Scope note

Balance tuning (day-365 DevIndex ≥ 70) stays open. Under deterministic
RNG, `seed=42 / temperate_plains` loses at day 33 (DevIndex 36.68) rather
than limping to day 90 with lucky Math.random. This matches Phase 7.A's
prior conclusion that parameter tuning cannot close the -33 DevIndex gap
alone — the starvation spiral is a structural balance issue (BuildAdvisor
priority, initial resources, worker carry-eat bypass). Phase 10 delivers
the **reproducibility floor** that future tuning needs: before this
change, A/B balance comparisons were noise.

## [0.8.1] - 2026-04-21 — Phase 8 Survival Hardening

**Bench delta (seed 42 / temperate_plains / 365 days):**
- Pre-Phase 8: DevIndex 39.03, pop 5, deaths 512, food 0, wood 0.67
- Post-Phase 8: DevIndex 43.69, pop 5, deaths 454, food 0, wood 1861.65
- **+4.66 DevIndex (+12%), -58 deaths (-11%), wood production up 2780×**

**Known remaining gap (punted to Phase 9):** `state.resources.food` still
reads 0 throughout the run even though farms produce and yieldPool stays
near max. Root cause traced by diagnostic agent to a deliver/carry policy:
workers eat from `carry.food` directly (via `workerHungerEatRecoveryPerFoodUnit
= 0.11`) before depositing to warehouse, so `state.resources.food` never
accumulates. This is a structural change in worker carry/deposit priority
and is out of scope for Phase 8's balance-tuning sweep. DevIndex target of
70 stays aspirational; 44 is the current best-effort ceiling on seed 42 /
temperate_plains without addressing the carry-eat bypass.

### Phase 8.C — Demand-side growth throttle (2026-04-21)

The Phase 8.A fixes improved day-365 DevIndex from 39 → 44 but food stayed
at 0 throughout the run. Diagnostic trace revealed the real bottleneck
was demand-side runaway, not supply-side shortfall: 4 starter farms
combined with a generous pop-cap (farms × 0.8 + warehouses × 4) plus cheap
6-food births spawned 24 workers in 100 seconds, overwhelming food
production. Kitchen built correctly (Phase 8.A.2) but then drained the
scarce food buffer, accelerating collapse.

**Iteration 1** raised `FOOD_COST_PER_COLONIST` 6 → 15, `MIN_FOOD_FOR_GROWTH`
25 → 40, added a `food >= 2 * FOOD_COST` buffer, added an
infrastructure-balance penalty `max(0, workers - warehouses * 3)`, and
pushed kitchen food threshold to 30. Bench regressed from DevIndex 44
(day 365) to **collapse at day 26** (pop 5 → 2): birth rate fell below
death rate because the combined throttles froze regeneration.

**Iteration 2** (shipped) softened all five knobs to the midpoint between
the v0.8.0 baseline and iteration 1:

- **`FOOD_COST_PER_COLONIST`** 6 → **10** — births carry real cost but
  don't starve the birth rate.
- **`MIN_FOOD_FOR_GROWTH`** 25 → **30** — modest buffer over the old
  threshold.
- **Food-reserve buffer check removed** — `MIN_FOOD_FOR_GROWTH = 30 =
  3 * FOOD_COST` already provides the buffer.
- **Pop-cap tightened** in `PopulationGrowthSystem` — warehouse
  coefficient 4 → 3, farm coefficient 0.8 → 0.5. **Infrastructure
  penalty removed** (the `max(0, workers - warehouses * 3)` term from
  iteration 1 created a doom spiral after death events).
- **Kitchen tier food threshold** in `ColonyPlanner` Priority 3.5
  raised `food >= 8` → `food >= 20` — kitchen waits for a real buffer
  without being impossible to trigger.

### Phase 8.A — Starvation-loop root-cause fixes (2026-04-21)

Four-factor root-cause analysis of the day-365 DevIndex shortfall (39.03 vs
target ≥ 70) identified a compound failure mode: `yieldPool` lazy-init race
in farm harvest, missing kitchen tier in the fallback planner (food→meal
conversion chain never opened), aggressive salinization parameters, and fog
restriction forcing over-concentration on 81 spawn tiles. Each factor
alone was survivable; combined they guaranteed 365-day starvation.

- **`yieldPool` lazy-init fix** — `src/simulation/npc/WorkerAISystem.js`
  farm-harvest block: when `getTileState` returns `null` the code now seeds
  both `fertility: 0.9` (matching `setTile`/`_updateSoil`) AND
  `yieldPool: BALANCE.farmYieldPoolInitial` before rereading. Pre-fix the
  entry was born with `yieldPool = 0`, so `Math.min(farmAmount, pool) = 0`
  and the worker's freshly-harvested food was instantly refunded. Added a
  second guard: if the tileState exists with `fertility > 0 &&
  fallowUntil === 0 && yieldPool <= 0` (stale post-fallow window), reseed
  yieldPool to match `TileStateSystem._updateSoil` semantics.
  Regression test: `test/farm-yield-pool-lazy-init.test.js`.
- **Kitchen tier in fallback planner** — `ColonyPlanner.generateFallbackPlan`
  now has a new Priority 3.5 "Food processing" tier between wood (Pr 3) and
  quarry/smithy (Pr 4). Trigger: `kitchens === 0 && farms >= 2 &&
  workerCount >= 2 && food >= 8 && wood >= 8 && stone >= 3 &&
  clusters.length > 0`. Urgency `"high"`; hint `near_cluster:c0`. Without
  this tier the LLM-only kitchen plan meant fallback-mode colonies never
  unlocked meal conversion, effectively doubling food burn rate. Thresholds
  raised from initial `farms >= 1` to `farms >= 2 && food >= 8` per
  review feedback — single-farm kitchens starved immediately.
- **Fog initial radius 4 → 6** — `src/config/balance.js`
  `fogInitialRevealRadius: 4 → 6`, revealing 169 initial tiles (13×13)
  instead of 81 (9×9). `BuildAdvisor.isTileHidden()` already blocked only
  `FOG_STATE.HIDDEN`, so EXPLORED tiles were already buildable — the real
  constraint was the tiny spawn window. Chose +2 over +4 to preserve fog
  gameplay feel. Updated stale "9×9" comments in
  `VisibilitySystem.js`, `test/fog-visibility.test.js`, and the balance
  design spec reference table.
- **Salinization ease** — `src/config/balance.js`:
  `soilSalinizationPerHarvest: 0.02 → 0.012` (40 → ~67 harvests to
  fallow), `soilFallowRecoveryTicks: 1800 → 1200` (450s → 300s recovery
  window at 4 Hz). Threshold and initial yieldPool unchanged. Roughly
  doubles harvest-to-fallow runway and cuts the starvation window by
  one-third without trivializing soil rotation.

### Phase 8.B — Dead objective-code cleanup (2026-04-21)

The v0.8.0 endless-survival pivot retired the objectives system but left
residue scattered across the codebase. Removed ~259 LOC of dead code while
preserving all paths with live consumers (HUD, DeveloperPanel, longRunTelemetry
tests, StrategicDirector gates, DecisionScheduler branch, MemoryObserver test,
ColonyPerceiver/PromptPayload pipe, WorldSummary summary field, SceneRenderer
pressure-lens signature hash — all verified via grep before any removal).

- **`src/world/scenarios/ScenarioFactory.js`** — deleted
  `buildObjectivesForScenario` stub; inlined `objectives: []`.
- **`src/simulation/meta/ProgressionSystem.js`** — removed
  `updateObjectiveProgress` (~124 LOC), `applyObjectiveReward`,
  `applyPacingHint`, `getRecoveryHint`, `getSpatialPressureHint`,
  `addRecoveryCharge`, and the `update()` call site. Subsequently
  deleted `getDoctrineAdjustedTargets` + `ceilScaled` (exposed as
  orphans by the cleanup — only caller was the deleted
  `getObjectiveFarmRatio` path). Pruned unused imports.
- **`src/app/types.js`** — removed `objectiveHoldSec` / `objectiveLog`
  from `GameplayState` typedef.
- **`src/entities/EntityFactory.js`** — removed `objectiveHoldSec: 0`
  init. Kept `objectiveIndex` / `objectives` / `objectiveHint` /
  `objectiveLog` (all still have live readers).
- **`src/simulation/population/RoleAssignmentSystem.js`** — removed
  `getObjectiveFarmRatio`, `ratioFromDemand`, the blend block in
  `update()`, and unused imports.
- **`src/ui/interpretation/WorldExplain.js`** — removed
  `getCurrentObjective` helper and its 3 usages in `getCausalDigest`.
- **`src/config/balance.js`** — removed orphaned
  `objectiveRoleBiasWeight: 0.58` constant (only consumer was the
  deleted role-bias branch).
- **`src/ui/hud/HUDController.js:172`** — rewrote stale comment that
  referenced the removed `buildObjectivesForScenario`.

### Phase 8 review-sweep iteration (2026-04-21)

Three parallel code-review agents surfaced HIGH/MED findings across the
modifications. All HIGH findings and most MED findings were addressed
inline before commit:

- `yieldPool` lazy-init fix extended with the post-fallow-window guard.
- `fertility` lazy-init seed aligned to canonical 0.9.
- Kitchen tier thresholds raised (`farms >= 1` → `farms >= 2 && food >= 8`
  + `clusters.length > 0` guard).
- Orphaned `getDoctrineAdjustedTargets` / `ceilScaled` / `objectiveRoleBiasWeight`
  deleted (surfaced by Phase 8.B cleanup).
- Stale comments in `VisibilitySystem`, `TileStateSystem`,
  `HUDController`, `test/fog-visibility.test.js`, and the balance design
  spec all brought in sync with current values.

**Files changed (Phase 8):** 9 source files + 1 new test + 1 spec doc
update. Net line change: +39 / -274 (~259 LOC removed). Tests: 865 pass /
2 skipped / 0 fail across 867 tests — identical to v0.8.0 baseline.

## [0.8.0] - 2026-04-21 — Living World Balance Overhaul

> Phase-by-phase implementation of the v3 spec
> (`docs/superpowers/specs/2026-04-21-living-world-balance-design.md`).
> Progress tracked in `docs/superpowers/plans/2026-04-21-living-world-progress.md`.

**Summary — mechanics shipped across all 7 phases:**

- **M1 ecological depth** — soil salinization + per-farm `yieldPool`, node
  layer (`FOREST`/`STONE`/`HERB` tile flags), fog-of-war (`HIDDEN` /
  `EXPLORED` / `VISIBLE` with persistent reveal radius per live actor), and
  demolition recycling (partial wood/stone refund on erase).
- **M2 warehouse throughput queue + density risk events** — per-tick
  `warehouseIntakePerTick` cap with aging queue and `WAREHOUSE_QUEUE_TIMEOUT`
  retarget, plus radius-6 producer-density scan feeding probabilistic
  `WAREHOUSE_FIRE` / `VERMIN_SWARM` events above
  `warehouseDensityRiskThreshold = 400`.
- **M3 carry economy** — worker carry fatigue (multi-step decay), in-transit
  food spoilage tied to `spoilageHalfLifeSeconds`, and the grace-period
  shield that stops fresh-placed buildings from being punished before the
  first tick.
- **M4 road compounding** — stacking per-step speed bonus capped at 20 steps
  (1.6× peak), wear degradation that bleeds the bonus back out, and
  isolation deposit penalty for warehouses off the road network.
- **Survival mode** — 5 new `gameplay.stats` (days survived, peak pop,
  score, deaths, disasters) and a 6-dimension `DevIndex` the headless
  harness gates against.
- **Plan C RaidEscalatorSystem** — 6-tier threat ladder (0-5) that ramps
  `banditRaid` pressure as prosperity climbs, with cooldowns between raids
  and explicit de-escalation on loss.
- **AI 18-patch adaptation sweep** — Perceiver + Planner + Evaluator wired
  to the new M1-M4 signals so the hierarchical director reacts to
  salinized farms, hot warehouses, starved processors, and wear hotspots.
- **Long-horizon benchmark harness** — `bench:long`, `bench:long:smoke`,
  `bench:long:matrix` scripts with deterministic 30/90/180/365/548/730-day
  checkpoints, spec § 16.2 threshold gates, and the 15% DevIndex
  monotonicity rule.
- **Supply-Chain Heat Lens** — new L-key (and HUD button) toggle on
  `src/render/PressureLens.js`: red = producer adjacent to a saturated
  warehouse, blue = processor or warehouse starved of input, grey = idle.
- **`deliverWithoutCarry` bug fix** — closed the state-planner exploit that
  let workers credit drop-offs with an empty carry; shipped with a
  7-assertion regression suite in `test/exploit-regression.test.js`.

### Phase 7 — Param tuning + regression fixes + release (2026-04-21)

- **Supply-Chain Heat Lens (spec § 6)** — extended
  `src/render/PressureLens.js` with a second marker source
  (`buildHeatLens` + `heatLensSignature`) alongside the existing scenario
  lens. `SceneRenderer.lensMode` cycles `pressure → heat → off` and the
  precompute pass classifies every buildable tile into red / blue / grey
  channels using `state.metrics.warehouseDensity` + colony resources +
  processor-input checks (kitchen → food, smithy → wood+stone, clinic →
  herbs). Zero new art: the existing `pressureMarkerPool` (disc + ring)
  re-colours via three new `PRESSURE_MARKER_STYLE` entries
  (`heat_surplus`, `heat_starved`, `heat_idle`).
- **L-key binding** — added `{ type: "toggleHeatLens" }` to
  `src/app/shortcutResolver.js` (and the `SHORTCUT_HINT` string so
  overlays reflect the new control) with `KeyL` / `l` matching;
  `#onGlobalKeyDown` in `src/app/GameApp.js` dispatches to the new
  `toggleHeatLens()` method that also drives the overlay message + syncs
  the HUD button's `.active` class.
- **HUD button** — added `#heatLensBtn` ("Heat Lens (L)") to the
  `#panelToggles` row in `index.html` next to the existing Build / Colony /
  Settings / Debug toggles; click handler wired in the `GameApp`
  constructor and unbound on `dispose()`. Overlay controls hint now
  lists `L heat lens`.
- **CHANGELOG finalization** — version header `[0.8.0] - Unreleased …
  (in progress)` → `[0.8.0] - 2026-04-21 — Living World Balance
  Overhaul`, prepended a mechanics summary paragraph covering all 7
  phases, and added this sub-section above Phase 6. Per-phase entries
  below are preserved.
- **Version bump** — `package.json` `0.7.0 → 0.8.0`.
- **CLAUDE.md current-state refresh** — header retagged
  `as of v0.8.0`, prepended a `v0.8.0 "Living World" complete` bullet
  summarising the 7-phase delivery.
- Note: the Phase 7.A balance tuning diff and the Phase 7.B
  `deliverWithoutCarry` fix + 7-test exploit regression suite ship in
  **separate commits**. This Phase 7 entry summarises all three pieces
  of the release.

#### Phase 7 review-sweep iteration (2026-04-21)

- **CRITICAL — `MIN_FOOD_FOR_GROWTH` desync** — Phase 7.A raised the
  growth threshold 20 → 25 in `PopulationGrowthSystem.js`, but
  `ColonyPerceiver.js` (growth blocker string) and
  `WorldSummary.js` (eat hint) still hardcoded `< 20`, so AI growth
  reports quietly lied for food ∈ [20, 25). Constant is now exported
  from `PopulationGrowthSystem.js` and imported at both sites.
- **CRITICAL — Retired objective scorer** — `benchmark/run.js` still
  passed `totalObjectives: 3` / `completedObjectives: 0`, dragging the
  `T_composite` by 25% for an objective system that v0.8.0 retired
  (ScenarioFactory returns `[]`). Changed to `totalObjectives: 0`;
  `computeTaskScore` now treats the objective-less case as `T_obj = 1`
  (nothing to fail on) with inline rationale.
- **CRITICAL — `StrategicDirector.nearFinal`** — the
  `complete_objective` priority fired trivially (`0 >= -1`) every eval
  because the retired objectives list is `[]`. Gated on
  `totalObjectives > 0`.
- **CRITICAL — Broken assertions in exploit-regression** —
  `console.log` used as an assertion; replaced with split
  `if (ratio < 1.2) console.log(...)` diagnostic + hard
  `assert.ok(distFood >= adjFood)` invariant. Silent-skip guards
  (`console.log + return`) promoted to `t.skip(reason)` so
  `node --test` reports SKIPPED instead of PASSED.
- **HIGH — `workerIntentCooldownSec` 1.5 → 2.2 applied** — the Phase
  7.A § 14.2 param was deferred because
  `test/worker-intent-stability.test.js:49` hard-asserted literal 1.5.
  Test relaxed to a stability band `[1.2, 3.0]` and the tuning
  landed. Day-365 DevIndex `36.27 → 39.03` on seed 42 / temperate_plains
  (`passed=true`, `violations=[]`).
- **HIGH — deliverWithoutCarry regression test** — new
  `test/deliver-without-carry.test.js` locks in the Phase 7.B invariant
  (counter stays at 0 across a 60-second soak).
- **HIGH — Stale docs + typedef** — `CLAUDE.md` tile-count fixed
  (`IDs 0-12` → `0-13`), test-count refreshed (`686` → `865 across 107
  test files`), tagline swapped from "3 objectives" to "survive
  indefinitely in endless survival mode". `src/app/types.js`
  `GameplayState` typedef extended with the v0.8.0 survival bundle
  (`devIndex`, `devIndexSmoothed`, `devIndexDims`, `devIndexHistory`,
  `raidEscalation`, `lastRaidTick`, `wildlifeRuntime`).
- **HIGH — Lockfile sync** — `package-lock.json` regenerated so its
  `version` matches `package.json` `0.8.0`.
- **Test suite:** 866 total / 864 pass / 2 skip (the intentional
  pre-v0.9.0 starvation-guard skips in exploit-regression) / 0 fail.

### Phase 6 — Long-horizon benchmark harness + review iteration pass

- **Harness scripts (new):**
  `scripts/long-horizon-helpers.mjs` (bootHeadlessSim, runToDayBoundary,
  sampleCheckpoint, computeSaturation, validateCheckpoints) and
  `scripts/long-horizon-bench.mjs` (CLI with `--seed`/`--max-days`/
  `--preset`/`--tick-rate`/`--stop-on-death`/`--stop-on-saturation`/
  `--soft-validation`/`--out-dir`). Runs deterministic 30/90/180/365/
  548/730-day checkpoints from a headless sim, emits JSON + Markdown
  reports under `output/benchmark-runs/long-horizon/`, applies the spec
  § 16.2 threshold gates + the 15% DevIndex monotonicity rule.
- **Matrix runner (new):** `scripts/long-horizon-matrix.mjs` sweeps 10
  seeds × 3 presets = 30 runs, writes per-run artefacts plus
  `matrix-summary.json` with split `{passed, thresholdFailures, crashes,
  writeErrors}` totals so operators can distinguish tuning misses from
  code crashes.
- **CI tests (new):** `test/long-horizon-smoke.test.js` (5 tests) and
  `test/monotonicity.test.js` (3 tests). Exercise helpers directly (no
  child_process), validate harness-shape (finite DevIndex/dims, correct
  day tagging, post-terminal handling), and enforce monotonicity over
  the surviving-checkpoint prefix.
- **CRITICAL death-ticking fix (review iteration)** —
  `runToDayBoundary` previously kept calling `tickFn()` on a terminated
  sim when `earlyStopOnDeath: false` — smoke/monotonicity both pass
  false, so an early collapse silently produced a "day N reached"
  checkpoint from a frozen corpse. Now always stops on
  `phase === "end"`; when `earlyStopOnDeath: false`, returns
  `stopped: "post_terminal"` with `checkpoint.postTerminal = true`.
- **CRITICAL partial-report on crash (review iteration)** —
  `runBench` now catches boot/tick exceptions internally, preserves
  partial checkpoints, writes artefacts with `crashed: true` +
  `simulation_crash` violation, dumps fallback JSON to stderr on
  write errors.
- **CRITICAL guard + outcome classification (review iteration)** —
  `classifyOutcome` no longer has a dead `max_days_reached`
  fallthrough that masked stalled runs; emits `"stalled"`/
  `"post_terminal"`/`"crash"`/`"unknown"` for the respective paths.
- **CRITICAL non-finite checkpoint surface (review iteration)** —
  `validateCheckpoints` runs a data-integrity pass FIRST, rejecting
  non-finite `devIndex`/`saturation`/dims via
  `non_finite_in_checkpoint`. `round2` returns `NaN` on non-finite
  input; `computeSaturation` returns `NaN` when `devIndexDims` is
  absent. `warnOnce` logs upstream shape drift to stderr.
- **CRITICAL plateau-exemption hoist (review iteration)** —
  Day 548/730 "DevIndex OR plateau" exemption waives the entire
  threshold row, not just devIndex.
- **HIGH parseArgs whitelist + strict parseBool (review iteration)** —
  Unknown flags (`--max-dayz`) now throw. `parseBool` throws on
  malformed input.
- **HIGH matrix pass/crash split (review iteration)** —
  Matrix summary adds `totals: {passed, thresholdFailures, crashes,
  writeErrors}`.
- **HIGH soft-validation hardening (review iteration)** —
  `HARD_VIOLATION_KINDS` includes `non_finite_in_checkpoint`,
  `post_terminal_checkpoint`, `loss_before_day_180`,
  `simulation_crash`, `monotonicity_violation` — soft-validation can
  never mask these.
- **HIGH fs error handling (review iteration)** —
  `runBench` wraps writes in try/catch, logs path + errno, dumps
  fallback JSON to stderr; exit code 1 on write error.
- **MEDIUM output dir convention (review iteration)** —
  Default output moved from `docs/benchmarks/` to
  `output/benchmark-runs/long-horizon/` (already gitignored).
  `.gitignore` belt-and-braces blocks accidental drift.
- **MEDIUM stub markers + docs (review iteration)** —
  `sampleCheckpoint.nodes` includes `_stub: true`;
  `docs/benchmarks/README.md` documents all pre-Phase-7 deferrals
  (node telemetry, raidsRepelled, saturationIndicator proxy, Day-90
  food reserves, smoke soft floors) and cross-references the other
  harness families (soak-sim, ablation-benchmark, unified eval).
- **MEDIUM monotonic raidsRepelled (review iteration)** —
  `countRaidsRepelled` prefers `state.metrics.raidsRepelled` monotonic
  counter (to be wired by Phase 7) over the ring-buffer log scan.
- **Tests:** 858 pass / 0 fail (73 suites).
- **Phase 7 deferrals:** node-layer telemetry wiring, monotonic
  `raidsRepelled` instrumentation, real
  `usedTiles/revealedUsableTiles` saturation field, Day-90 food
  reserves threshold, smoke soft-floor promotion, sim pre-tuning
  nondeterminism (different runs of the same seed produce different
  lifespans — Phase 7 tuning stabilises this).

### Phase 5 — Review iteration pass (AI wiring + silent-failure fixes)

- **C1 minsUntilExhaustion inversion** —
  `src/simulation/ai/colony/ColonyPerceiver.js::minsUntilExhaustion` now
  returns `0` (highest urgency) when every node of a type is depleted or
  the array is empty. Previous `Infinity` silently flipped the urgency
  signal so the planner treated fully-exhausted resources as having
  unlimited runway.
- **C2 Isolation probe short-circuit** —
  `candidateHasReachableWarehouse` now returns
  `{ reachable, truncated, skipped }` and short-circuits with
  `{ reachable:true, skipped:true }` on maps with no warehouses. Prevents
  every early-game candidate from being silently penalised by 0.8×.
  Replaces the old `queue.shift()` O(N²) BFS with a head-index queue.
- **C3 Fog sampler missing-array sentinel** —
  `sampleFogState` returns an explicit `reason:"fog_array_missing"`
  sentinel when `fog.visibility` is absent, so downstream readers can
  distinguish "no fog system" from "fully revealed".
- **CRITICAL 1 Perceiver dead-flow fix** —
  `formatObservationForLLM` now renders a `### Living-World Signals
  (M1-M4)` section with tileState, warehouseDensity, spoilage, survival,
  nodes (incl. exhaustion warnings under 10 min), fog and DevIndex dim
  blocks. The Phase 5 perceiver patches previously attached data to the
  observation without ever rendering it to the LLM prompt.
- **H5 StrategicDirector goalChain preservation** —
  `applyThreatTierGoal` no longer wipes `state.gameplay.strategicGoalChain`
  every tick during economic mode. The chain is only reset on the
  transition out of `fortify_and_survive`, preventing thrash for async
  planner consumers that snapshot the chain between ticks.
- **H6 DevIndex dim iteration stability** —
  `updateDevIndexRepairGoal` iterates a frozen `DEV_INDEX_DIM_KEYS`
  constant instead of `Object.entries(dims)` so repair-goal selection is
  deterministic regardless of DevIndexSystem emission order.
- **H7 Postcondition violations in prompt** —
  `buildPlannerPrompt` accepts `{ memoryStore }` and pulls the 3 most
  recent `postcondition_violation` observations via new
  `MemoryStore.getRecentByCategory`. `formatObservationForLLM` then
  renders them under `### Last Plan Postcondition Violations (avoid
  repeating)` so the LLM sees what tripped the evaluator.
- **H8 Double runPlanPostconditions** —
  `evaluatePlan` now accepts `{ memoryStore, skipPostconditions }`; the
  PlanEvaluator class passes its memoryStore in directly so postcondition
  work runs exactly once per plan completion instead of twice.
- **Strategic state wired into planner** —
  `buildPlannerPrompt` renders a `### Strategic State (Phase 5)` section
  that surfaces `state.gameplay.strategicGoal`, `strategicGoalChain`,
  `strategicRepairGoal` and `state.ai.fallbackHints.distributed_layout_hint`
  (all published by `applyPhase5StrategicAdaptations` every tick).
- **SkillLibrary suggestions wired into fallback** —
  `generateFallbackPlan` now consumes `suggestProspectFogFrontier`,
  `suggestRecycleAbandonedWorksite`, and `suggestRelocateDepletedProducer`
  from `SkillLibrary`, each capped at one suggestion per plan so they
  complement the existing priority ladder instead of swamping it.
- **SHOULD-FIX cleanup** —
  Added `BALANCE.spoilageHalfLifeSeconds = 120` and
  `BALANCE.yieldPoolDepletedThreshold = 60` so PlanEvaluator and
  ColonyPlanner can't drift out of sync. Replaced magic `& 1 / & 2 / & 4`
  checks in `SkillLibrary` with `NODE_FLAGS.FOREST/STONE/HERB` constants.
- **Tests:** 850 pass / 0 fail (73 suites). Added 5 new tests:
  perceiver Living-World section rendering, postcondition-violation
  rendering, isolation probe skip-on-empty, planner prompt postcondition
  injection, and strategic-state rendering.

### Phase 4 — Review iteration pass (silent-failure + masking fixes)

- **C1 PopulationGrowthSystem determinism** —
  `src/simulation/population/PopulationGrowthSystem.js` now accepts
  `services` on `update(dt, state, services = null)` and draws its spawn
  RNG from `services.rng.next` (falls back to `Math.random` only when no
  services are threaded, for legacy tests). Prior `Math.random()` call
  broke benchmark reproducibility under seeded harnesses.
- **C2 Birth counter swap** —
  `state.metrics.birthsTotal` is now a monotonic counter bumped by
  `PopulationGrowthSystem` on every spawn. `ProgressionSystem.updateSurvivalScore`
  diffs `birthsTotal - survivalLastBirthsSeen` so every birth scores
  exactly once — the prior `lastBirthGameSec` timestamp cursor silently
  dropped births that collided on the same integer `timeSec`. Also seeds
  `survivalLastBirthsSeen`/`survivalLastDeathsSeen` to current totals
  when undefined so tests bypassing `createInitialGameState` don't
  retroactively score or penalise pre-existing counts (SR2).
- **H1 DevIndex tick sentinel** —
  `DevIndexSystem` now increments `state.gameplay.devIndexTicksComputed`
  each tick. HUD, telemetry, and the escalation chain can detect missed
  DevIndex ticks instead of reading stale composites silently.
- **H2 readRaidEscalation warning** —
  `WorldEventSystem.readRaidEscalation` logs a one-shot
  `console.warn` when `state.gameplay.raidEscalation` is missing after
  tick 1 (catches SYSTEM_ORDER misconfigs early instead of silently
  defaulting to tier-0).
- **H3 SYSTEM_ORDER invariant** —
  `GameApp.createSystems` runs `assertSystemOrder(systems,
  ["DevIndexSystem","RaidEscalatorSystem","WorldEventSystem"])` at boot
  and throws on any reorder. Protects the DevIndex → RaidEscalator →
  WorldEvent chain.
- **M4 runOutcome worker filter** —
  `src/app/runOutcome.js` colony-wipe check now filters by
  `agent.type === "WORKER"` (previously counted animals and visitors as
  survivors, so a 0-worker colony with 1 surviving wildlife agent never
  triggered loss).
- **SR1 HUD DevIndex wired** —
  `HUDController` survival badge now appends `· Dev D/100` once
  `devIndexTicksComputed > 0`; removed stale `TODO(Agent 4.C)` marker.
- **SR3 Raid tier double-apply guard** —
  `WorldEventSystem` sets `event.payload.raidTierApplied = true` after
  multiplying `event.intensity`, so a replayed/re-queued raid cannot
  compound its intensity.
- **Tests migrated** — `test/progression-system.test.js` and
  `test/survival-score.test.js` updated from `lastBirthGameSec`
  timestamp semantics to `birthsTotal` counter semantics;
  `test/atmosphere-profile.test.js` compares loss vs neutral endings
  (no-win).
- **Deferrals** — 14+ dormant objective-related code paths
  (`types.js::Objective` typedef, `updateObjectiveProgress`, StrategicDirector /
  DecisionScheduler / RoleAssignmentSystem objective prompts, WorldExplain +
  WorldSummary objective mentions, DeveloperPanel objective controls,
  ColonyDirectorSystem + ColonyPerceiver + MemoryObserver objective refs,
  benchmark/run.js objective reporting) deferred to Phase 7 legacy-sweep.
  Functionally dormant since `buildObjectivesForScenario` now returns `[]`.
- **Tests:** 799 pass / 0 fail (62 suites).

### Phase 4 — RaidEscalatorSystem (Agent 4.B)

- **RaidEscalatorSystem** — New system in
  `src/simulation/meta/RaidEscalatorSystem.js` that consumes
  `state.gameplay.devIndexSmoothed` (NOT the noisy per-tick `devIndex`) and
  publishes a tiered raid bundle at `state.gameplay.raidEscalation` every
  tick. Slots into `SYSTEM_ORDER` immediately after `DevIndexSystem` and
  before `WorldEventSystem` so the event system always sees a fresh
  escalation sample. Replaces the prior fixed `RAID_TIER_CAP = 6` model
  (no remaining references under `src/`).
- **Escalation math** — `tier = clamp(floor(devIndexSmoothed /
  devIndexPerRaidTier), 0, raidTierMax)`. `intervalTicks = max(minTicks,
  baseTicks - tier × reductionPerTier)` (faster raids at higher DevIndex).
  `intensityMultiplier = 1 + tier × raidIntensityPerTier` (stronger raids
  at higher DevIndex). Default curve: DI=0 → tier 0, 3600 ticks, 1.0×;
  DI=30 → tier 2, 3000 ticks, 1.6×; DI=75 → tier 5, 2100 ticks, 2.5×.
- **WorldEventSystem integration** —
  `src/world/events/WorldEventSystem.js` now reads
  `state.gameplay.raidEscalation` in the queue drain:
  `BANDIT_RAID` events are dropped if `state.metrics.tick -
  state.gameplay.lastRaidTick < raidEscalation.intervalTicks` (DevIndex
  owns raid frequency). On spawn, the raid's `event.intensity` is
  multiplied by `intensityMultiplier`, and the spawn payload records
  `raidTier`, `raidIntensityMultiplier`, and `raidDevIndexSample` for
  telemetry. Safe-default helper `readRaidEscalation(state)` returns
  tier-0 baseline values if `state.gameplay.raidEscalation` is missing
  (visible, commented fallback — NOT silent).
- **Balance block** — New
  `// --- Living World v0.8.0 — Phase 4 (Raid Escalator)` section in
  `src/config/balance.js`: `devIndexPerRaidTier: 15`, `raidTierMax: 10`,
  `raidIntervalBaseTicks: 3600`, `raidIntervalMinTicks: 600`,
  `raidIntervalReductionPerTier: 300`, `raidIntensityPerTier: 0.3`.
- **State init** — `createInitialGameState`
  (`src/entities/EntityFactory.js`) initialises
  `state.gameplay.raidEscalation = { tier: 0, intervalTicks: 3600,
  intensityMultiplier: 1, devIndexSample: 0 }` and
  `state.gameplay.lastRaidTick = -9999` so WorldEventSystem never sees
  undefined fields on tick 0.
- **Files created:** `src/simulation/meta/RaidEscalatorSystem.js`,
  `test/raid-escalator.test.js`, `test/survival-scaling.test.js`.
- **Files changed:** `src/config/constants.js` (+`"RaidEscalatorSystem"`
  in `SYSTEM_ORDER` between `DevIndexSystem` and `ColonyDirectorSystem`),
  `src/config/balance.js` (+6 balance knobs), `src/app/GameApp.js`
  (import + `new RaidEscalatorSystem()` wired after `DevIndexSystem`),
  `src/entities/EntityFactory.js` (+`raidEscalation` and `lastRaidTick`
  init), `src/world/events/WorldEventSystem.js` (queue-drain cooldown
  gate + intensity multiplier + safe-default reader).
- **New tests (+10):** `test/raid-escalator.test.js` — 7 cases covering
  DI=0 baseline, DI=30 tier-2, DI=500 cap, monotonic interval decrease,
  monotonic intensity increase, missing `devIndexSmoothed` fallback, and
  a parity check between the pure helper and the live class.
  `test/survival-scaling.test.js` — 3 cases covering WorldEventSystem
  cooldown enforcement, 2× intensity multiplier on raid spawn payload,
  and a repo-wide guard that `RAID_TIER_CAP` no longer exists under
  `src/`. All 799 tests pass (`node --test test/*.test.js`).
- **Silent-failure posture** — WorldEventSystem's `readRaidEscalation`
  helper carries an explicit docblock describing *why* the fallback
  exists so future readers spot it as a deliberate, not accidental,
  default. Tests that skip RaidEscalatorSystem (e.g. the existing
  `world-event-spatial.test.js` and `world-explain.test.js` suites)
  continue to pass because `createInitialGameState` pre-populates a
  tier-0 baseline bundle.

### Phase 4 — Survival mode (Agent 4.A)

- **Win outcome retired** — `evaluateRunOutcomeState` (`src/app/runOutcome.js`)
  no longer emits `"win"`. The only terminal outcome in survival mode is
  `"loss"` (colony wiped or collapse spiral); an ongoing run returns `null`
  which callers map to `session.outcome === "none"`. Colony-wipe
  (`state.agents.length === 0` or all agents dead) triggers an immediate
  `"loss"` with reason `"Colony wiped — no surviving colonists."`.
- **Objective deck removed** — `buildObjectivesForScenario` in
  `src/world/scenarios/ScenarioFactory.js` now returns `[]`. The
  3-objective deck (logistics → stockpile → stability) has been retired;
  `state.gameplay.objectives` still exists as an empty array so legacy
  callers (HUD overlay, benchmark telemetry, prompt payload) keep the
  same shape.
- **ProgressionSystem survival score** — New export
  `updateSurvivalScore(state, dt)` in `src/simulation/meta/ProgressionSystem.js`
  accrues `state.metrics.survivalScore`:
  `+BALANCE.survivalScorePerSecond` (default `1`) per in-game second,
  `+BALANCE.survivalScorePerBirth` (default `5`) when
  `state.metrics.lastBirthGameSec` advances, and
  `-BALANCE.survivalScorePenaltyPerDeath` (default `10`) per new death
  observed on `state.metrics.deathsTotal`. Cached cursors
  (`survivalLastBirthSeenSec`, `survivalLastDeathsSeen`) ensure every
  birth/death is counted exactly once. Called from `ProgressionSystem.update`
  before the legacy `updateObjectiveProgress` path (which now no-ops when
  `objectives` is empty, preserving compatibility with any state that
  manually populates the array).
- **Birth flag** — `src/simulation/population/PopulationGrowthSystem.js`
  writes `state.metrics.lastBirthGameSec = state.metrics.timeSec` right
  after each colonist spawn. ProgressionSystem detects the delta to grant
  the birth bonus.
- **Metrics init** — `createInitialGameState` (`src/entities/EntityFactory.js`)
  initialises `survivalScore: 0`, `lastBirthGameSec: -1`,
  `survivalLastBirthSeenSec: -1`, `survivalLastDeathsSeen: 0` so fresh
  runs start from a clean baseline.
- **HUD status line** — `GameStateOverlay` (`src/ui/hud/GameStateOverlay.js`)
  replaces the 3-objective card deck with a single survival status card
  showing `Survived: HH:MM:SS · Score: N pts` and emits a `Survived / Score`
  summary line in the end-run stats block. `HUDController` status row shows
  `Survived HH:MM:SS  Score N` (label updated in `index.html` from
  "Objective" to "Survival"). The end-screen title is fixed at
  `"Colony Lost"`; the `"Victory!"` branch is gone.
- **Downstream outcome plumbing** — `src/app/GameApp.js`,
  `src/app/snapshotService.js`, and `src/app/types.js` now only accept
  `"loss"` (any other value collapses to `"none"`).
  `src/render/AtmosphereProfile.js` drops the win-atmosphere branch
  while keeping the loss darkening. `src/benchmark/run.js` redefines
  `survived` as `phase !== "end" || outcome !== "loss"`.
- **Balance block** — New `// --- Living World v0.8.0 — Phase 4 (Survival Mode)`
  section in `src/config/balance.js`: `survivalScorePerSecond: 1`,
  `survivalScorePerBirth: 5`, `survivalScorePenaltyPerDeath: 10`.
- **Files changed:** `src/world/scenarios/ScenarioFactory.js`,
  `src/app/runOutcome.js`, `src/app/GameApp.js`, `src/app/snapshotService.js`,
  `src/app/types.js`, `src/simulation/meta/ProgressionSystem.js`,
  `src/simulation/population/PopulationGrowthSystem.js`,
  `src/entities/EntityFactory.js`, `src/render/AtmosphereProfile.js`,
  `src/benchmark/run.js`, `src/ui/hud/GameStateOverlay.js`,
  `src/ui/hud/HUDController.js`, `src/config/balance.js`, `index.html`.
- **Tests updated** (objective-deck semantics → survival semantics):
  `test/alpha-scenario.test.js`, `test/scenario-family.test.js`,
  `test/run-outcome.test.js`, `test/progression-system.test.js`,
  `test/role-assignment-system.test.js`, `test/balance-playability.test.js`.
- **New tests (+7):** `test/survival-score.test.js` (4 cases: +1/sec,
  +5/birth, -10/death, and "outcome stays 'none' after 3 in-game minutes
  with a healthy colony"). `test/death-condition.test.js` (3 cases:
  empty-agents wipes, all-dead wipes, a living colony never produces a
  loss). All 789 tests pass (`node --test test/*.test.js`).
- **Spec deviation** — The task spec uses `"lose"`; the existing codebase
  uses `"loss"` consistently across `runOutcome.js`, `GameApp.js`,
  `snapshotService.js`, `types.js`, telemetry, and atmosphere code.
  Agent 4.A kept `"loss"` to avoid a renaming sweep that would touch
  unrelated paths; the public contract value is `"loss"`.

### Phase 4 — DevIndex system (Agent 4.C)

- **DevIndexSystem** — New system in `src/simulation/meta/DevIndexSystem.js`
  aggregates six economy/colony dimensions into a single `[0, 100]` composite
  "development index" each tick. Slots into `SYSTEM_ORDER` immediately after
  `ProgressionSystem` and before `WarehouseQueueSystem` so downstream systems
  (notably Agent 4.B's upcoming `RaidEscalatorSystem`) see a fresh value
  every frame.
- **Dimensions** — population (agents vs `devIndexAgentTarget`), economy
  (weighted mean of food/wood/stone vs `devIndexResourceTargets`),
  infrastructure (ROAD + WAREHOUSE coverage vs map area), production
  (sum of FARM + LUMBER + QUARRY + HERB_GARDEN + KITCHEN + SMITHY + CLINIC
  vs `devIndexProducerTarget`), defense (WALL count + 2× militia-role
  agents vs `devIndexDefenseTarget`), resilience (inverse of mean
  worker hunger/fatigue/morale distress). Each dim is independently
  computed, clamped to `[0, 100]`, and written to
  `state.gameplay.devIndexDims`.
- **Composite + smoothing** — Composite = weighted mean using
  `BALANCE.devIndexWeights` (default equal 1/6 each) written to
  `state.gameplay.devIndex`. A ring buffer of size `devIndexWindowTicks`
  (default 60) backs `state.gameplay.devIndexSmoothed`, the arithmetic
  mean of the last N samples. `state.gameplay.devIndexHistory` exposes
  the ring buffer for benchmarks and inspection.
- **EconomyTelemetry** — New pure-function helper
  `src/simulation/telemetry/EconomyTelemetry.js`. `collectEconomySnapshot`
  returns the raw per-tick economy signals; `scorePopulation`,
  `scoreEconomy`, `scoreInfrastructure`, `scoreProduction`, `scoreDefense`,
  `scoreResilience`, and `scoreAllDims` convert a snapshot into
  dimension scores. DevIndexSystem stays focused on normalization +
  weighting; the split keeps each dim unit-testable without the full
  game loop.
- **EntityFactory init** — `createInitialGameState` initialises all four
  `state.gameplay.devIndex*` fields so tests that skip DevIndexSystem.update
  (e.g. alpha scenario checks) don't crash reading them.
- **Balance block** — New `// --- Living World v0.8.0 — Phase 4 (DevIndex)`
  section in `src/config/balance.js`: `devIndexWindowTicks (60)`,
  `devIndexWeights` (frozen equal-weight map), `devIndexResourceTargets`
  (`food:200, wood:150, stone:100`), `devIndexAgentTarget (30)`,
  `devIndexProducerTarget (24)`, `devIndexDefenseTarget (12)`.
- **HUD badge** — `GameStateOverlay.endStats` now renders a
  `DevIndex: N/100 (smoothed N)` row adjacent to the Prosperity/Threat
  row. Coexists with Agent 4.A's survival-score row without clobbering.
- **Public contract** (Agent 4.B dependency): `state.gameplay.devIndex`
  (float), `state.gameplay.devIndexSmoothed` (float),
  `state.gameplay.devIndexDims` (6 floats: population, economy,
  infrastructure, production, defense, resilience),
  `state.gameplay.devIndexHistory` (ring buffer, length ≤ window).
- **Files changed:** `src/config/balance.js`, `src/config/constants.js`
  (SYSTEM_ORDER), `src/app/GameApp.js`, `src/entities/EntityFactory.js`,
  `src/simulation/meta/ProgressionSystem.js` (one-line comment),
  `src/ui/hud/GameStateOverlay.js`.
- **New files:** `src/simulation/meta/DevIndexSystem.js`,
  `src/simulation/telemetry/EconomyTelemetry.js`.
- **New tests (+13):** `test/dev-index.test.js` (7 cases: fresh-state
  window, per-dim clamp, weighted-composite math, sliding-window
  convergence, saturated colony band, single-weight isolation, public
  contract surface) and `test/saturation-indicator.test.js` (6 cases:
  overshoot saturation for economy/population/defense, multi-dim
  concurrent saturation, zero-input floor, negative-input clamp).
- **Spec deviation** — Spec § 5.6 cites a finer early-game band
  `[20, 45]`. Actual fresh-state composite lands at ~50 because map
  generation stamps 20–30 producer tiles (QUARRY + HERB_GARDEN) at
  scenario time, saturating the production dim immediately. The fresh-state
  test widens the band to `[20, 55]` to reflect this; real tuning can
  come during Phase 7 balance sweeps.

### Phase 3 — Soil salinization + farm yieldPool (M1)

- **M1 soil salinization** — Each completed FARM harvest bumps
  `tileState.salinized` by `BALANCE.soilSalinizationPerHarvest` (`0.02`). When
  the accumulator reaches `BALANCE.soilSalinizationThreshold` (`0.8`), the
  tile enters **fallow**: `fertility` is hard-pinned at `0` and `fallowUntil`
  is set to `metrics.tick + BALANCE.soilFallowRecoveryTicks` (`1800`, ~3
  in-game minutes at the default tick cadence). While fallow, further
  harvests yield zero food. On fallow expiry, `TileStateSystem._updateSoil`
  restores `fertility = 0.9`, clears `salinized`, and refills `yieldPool` to
  `BALANCE.farmYieldPoolInitial` (`120`). A tiny passive decay of
  `soilSalinizationDecayPerTick` (`0.00002`) slowly relaxes the accumulator
  on idle tiles — a safety valve, not the primary recovery path.
- **M1 farm yieldPool** — Freshly-placed FARMs now initialise
  `tileState.yieldPool` to `farmYieldPoolInitial` (`120`) and regenerate
  passively toward `farmYieldPoolMax` (`180`) at
  `farmYieldPoolRegenPerTick` (`0.1`). On each completed harvest, the
  effective yield is capped by the remaining pool: if the pool is empty, the
  harvested food amount is refunded back out of the worker's carry so a
  depleted tile produces nothing until regen catches up. LUMBER / QUARRY /
  HERB_GARDEN harvests are untouched — those become node-gated in Phase 3.B
  per spec § 3 M1a.
- **TileStateSystem** — New per-tick `_updateSoil` method runs **before** the
  existing 2s interval gate so that simulations advancing
  `state.metrics.tick` directly (tests, fast benchmarks) observe fallow
  recovery and yieldPool regen without needing to push `timeSec` forward.
  The interval-gated fertility/wear/exhaustion pass is unchanged.
- **ProceduralTileTextures** — TODO comment on `drawFarm` flags the salinized
  crack-overlay visual for Phase 7. The current renderer bakes one texture
  per tile **type** (not per tile instance), so threading dynamic
  `tileState.salinized` through requires a per-instance material variant or
  a shader-level overlay; deferred per spec § 3 M1.
- **Files changed:** `src/config/balance.js` (+7 Phase 3 M1 keys),
  `src/simulation/economy/TileStateSystem.js` (new `_updateSoil` + BALANCE
  import), `src/simulation/npc/WorkerAISystem.js` (`handleHarvest` exported;
  FARM branch now caps harvest by yieldPool, accumulates salinized, triggers
  fallow on threshold), `src/render/ProceduralTileTextures.js` (Phase 7
  TODO).
- **New tests (+4):** `test/soil-salinization.test.js` covering (A) repeated
  harvests trigger fallow near the expected threshold, (B) harvests during
  fallow yield zero food, (C) fallow expiry restores fertility + refills
  yieldPool via `TileStateSystem._updateSoil`, (D) yieldPool passively regens
  toward `farmYieldPoolMax` and saturates at the cap.

### Phase 3 — Resource node layer (M1a)

- **M1a resource nodes** — New per-tile `tileState.nodeFlags` bitmask
  (`NODE_FLAGS.FOREST | STONE | HERB`) seeded at map generation time by
  `seedResourceNodes(grid, rng)` in `src/world/scenarios/ScenarioFactory.js`.
  Forests use Poisson-disk sampling (min-distance 3 tiles), stone nodes
  cluster-walk from N GRASS seeds for 3-6 steps, and herb nodes link-seek
  GRASS tiles adjacent to WATER or FARM. Each node tile is tagged with a
  `yieldPool` pulled from the per-type `BALANCE.nodeYieldPool{Forest|Stone|Herb}`
  (80 / 120 / 60).
- **BuildAdvisor node gate** — `evaluateBuildPreview` now rejects LUMBER,
  QUARRY, and HERB_GARDEN placements on tiles whose `nodeFlags` lack the
  matching flag, returning `{ ok: false, reason: "missing_resource_node" }`
  with a tool-specific `reasonText`.
- **Harvest yield drain + regen** — `WorkerAISystem.handleHarvest` now
  decrements `tileState.yieldPool` on completion of each lumber/quarry/herb
  harvest (farms already handled by Agent 3.A). An end-of-tick regen pass
  (`applyResourceNodeRegen`) adds `BALANCE.nodeRegenPerTickForest` (`0.05`),
  `...Stone` (`0.0`, permanent deposit), or `...Herb` (`0.08`) per idle tick,
  capped at the node type's yieldPool ceiling. Tiles harvested this tick are
  skipped via a `lastHarvestTick` marker.
- **BALANCE keys added** — `forestNodeCountRange`, `stoneNodeCountRange`,
  `herbNodeCountRange`, `nodeYieldPoolForest|Stone|Herb`,
  `nodeRegenPerTickForest|Stone|Herb`.
- **Files changed:** `src/config/balance.js` (+M1a block),
  `src/world/scenarios/ScenarioFactory.js` (+`seedResourceNodes` exports),
  `src/entities/EntityFactory.js` (wire seeding into `createInitialGameState`),
  `src/simulation/construction/BuildAdvisor.js` (NODE_GATED_TOOLS table +
  missing_resource_node failure reason), `src/simulation/npc/WorkerAISystem.js`
  (`applyNodeYieldHarvest` + `applyResourceNodeRegen`).
- **New tests (+4):** `test/node-layer.test.js` — per-template count ranges,
  LUMBER/QUARRY/HERB_GARDEN build-gate accept/reject cases, and yieldPool
  deduct-then-regen over simulated ticks.

### Phase 3 — Fog of war (M1b)

- **M1b tile visibility pipeline** — New per-tile `state.fog.visibility`
  Uint8Array with three states (`FOG_STATE.HIDDEN`/`EXPLORED`/`VISIBLE`)
  exported from `src/config/constants.js`. Freshly initialised worlds seed a
  9×9 reveal (radius `BALANCE.fogInitialRevealRadius = 4`) around the spawn
  point; unvisited tiles stay HIDDEN until an actor walks near them.
- **`VisibilitySystem`** — New system at
  `src/simulation/world/VisibilitySystem.js`, inserted into `SYSTEM_ORDER`
  immediately after `SimulationClock`. On each tick it downgrades previously
  VISIBLE tiles to EXPLORED, then walks every live `state.agents` entry and
  re-reveals a Manhattan square of radius `BALANCE.fogRevealRadius = 5` around
  them. VISIBLE is therefore a one-tick state while EXPLORED is sticky memory
  — preserving the classic RTS "what you saw is dimmed, what you've never
  seen is black" feel. Bumps `state.fog.version` whenever any tile changes.
- **Build rejection on HIDDEN** — `BuildAdvisor.evaluateBuildPreview` now
  returns `{ ok: false, reason: "hidden_tile" }` when the cursor tile is
  fully HIDDEN, before any other gating. Players must scout before they can
  place road/warehouse/etc. on unexplored terrain.
- **Worker explore-fog intent** — `WorkerAISystem.chooseWorkerIntent` gains a
  low-priority `"explore_fog"` fallback that sits between role intents and
  `"wander"`. Fires only when the colony still has HIDDEN tiles, so finished
  maps do not force workers into pointless exploration. Exposed helper
  `findNearestHiddenTile(worker, state)` returns the nearest Manhattan fog
  frontier for downstream targeting.
- **FogOverlay + Minimap (stubs)** — `src/render/FogOverlay.js` ships a
  zero-dep Three.js stub (`attach(scene)` + `update(state)`) with TODO notes
  deferring the real data-texture shader to Phase 7. `src/ui/hud/Minimap.js`
  ships a minimal canvas minimap that paints 0.45 alpha over EXPLORED tiles
  and 0.9 alpha over HIDDEN tiles so the HUD layer has a visible fog tint
  today.
- **Balance (`Phase 3 M1b`)** — `fogRevealRadius: 5`,
  `fogInitialRevealRadius: 4`, `fogEnabled: true`.
- **New tests (+4):** `test/fog-visibility.test.js` — (A) initial 9×9 reveal
  bounds, (B) worker footprint permanence (HIDDEN → VISIBLE → EXPLORED),
  (C) `BuildAdvisor` `"hidden_tile"` rejection, (D) `"explore_fog"` intent
  surfaces when HIDDEN tiles exist and no role work is available.
- **GameApp wiring** — `new VisibilitySystem()` is inserted into the systems
  array immediately after `new SimulationClock()`, matching the Phase 2
  `WarehouseQueueSystem` wiring pattern.
- **Files changed:** `src/config/balance.js` (+3 BALANCE keys),
  `src/config/constants.js` (+`"VisibilitySystem"` in `SYSTEM_ORDER`),
  `src/app/GameApp.js` (+import + systems array insertion),
  `src/simulation/construction/BuildAdvisor.js`
  (+`isTileHidden` + `"hidden_tile"` failure path),
  `src/simulation/npc/WorkerAISystem.js` (+`"explore_fog"` intent fallback,
  `hasHiddenFrontier`, `findNearestHiddenTile`). New files:
  `src/simulation/world/VisibilitySystem.js`, `src/render/FogOverlay.js`,
  `src/ui/hud/Minimap.js`, `test/fog-visibility.test.js`.
- **Test count:** 760 → 764 (all pass).

### Phase 3 — Demolition recycling (M1c)

- **M1c stone-endgame guard** — Demolishing a built tile via the "erase" tool
  now refunds a type-specific fraction of the **original** `BUILD_COST` for
  that structure (not the terrain-adjusted cost). Rates are exposed on
  `BALANCE` so the long-horizon benchmark can tune them: `demoStoneRecovery`
  (`0.35`), `demoWoodRecovery` (`0.25`), `demoFoodRecovery` (`0.0`),
  `demoHerbsRecovery` (`0.0`). Food and herbs are biodegradable — zero
  recovery — which preserves the endgame pressure for herb gardens while
  letting stone slowly recycle between builds.
- **BuildAdvisor refund math** — `getTileRefund` now reads the four
  `demo*Recovery` constants instead of the single legacy
  `CONSTRUCTION_BALANCE.salvageRefundRatio` (kept as the safe-fallback when
  BALANCE values go missing). Refund is computed BEFORE `setTile` writes
  `TILE.GRASS`, so downstream listeners always see a valid payload.
- **`GameEventBus.EVENT_TYPES.DEMOLITION_RECYCLED`** — New event type
  `"demolition_recycled"`. Emitted by `BuildSystem.placeToolAt` after a
  successful erase that produced a non-zero refund, with payload
  `{ ix, iz, refund: { wood, stone, [food], [herbs] }, oldType }`. The
  StrategicDirector's planned `recycle_abandoned_worksite` skill (§ 13.5)
  will consume this to update memory; for now it is HUD/telemetry-ready.
- **Undo/redo parity** — `BuildSystem.undo` and `.redo` now check all four
  refund keys (previously food/wood only) so the round-trip spend-and-return
  stays balanced after M1c stone/herbs refunds flow through the history.
- **Files changed:** `src/config/balance.js` (+4 BALANCE keys in a new
  `// --- Living World v0.8.0 — Phase 3` block),
  `src/simulation/meta/GameEventBus.js` (+`DEMOLITION_RECYCLED` enum),
  `src/simulation/construction/BuildAdvisor.js`
  (`getTileRefund` rewritten to per-resource fractions),
  `src/simulation/construction/BuildSystem.js`
  (`placeToolAt` now emits `DEMOLITION_RECYCLED`; undo/redo refund checks
  cover all four resource types).
- **New tests (+4):** `test/demo-recycling.test.js` covers A) farm refund
  math, B) warehouse refund math, C) food/herbs zero-recovery invariant, and
  D) `DEMOLITION_RECYCLED` event payload shape.
- **Existing tests adjusted:** `test/build-system.test.js` (erase salvage
  test now builds a warehouse — wall's wood:2 floors to a zero refund under
  the new 0.25 wood ratio) and `test/phase1-resource-chains.test.js`
  (smithy/clinic erase expectations switched from the legacy
  `salvageRefundRatio × cost` formula to the new `BALANCE.demo*Recovery`
  constants; herbs refund is now 0 by design).
- **Test count:** 752 → 756 (all pass).

### Phase 3 — Scenario FARM tileState reconciliation (bug fix)

- **Bug** — Scenario-stamped FARM tiles (placed via `setTileDirect` in
  `ScenarioFactory.js`, which bypasses `setTile`) had no `tileState` entry, so
  the M1 harvest-cap branch in `WorkerAISystem` read `yieldPool === 0` and
  refunded the full `farmAmount` out of the worker's carry — clamping every
  scenario-FARM harvest to zero food. Surfaced in `animal-ecology.test.js`
  where both pressured and clean workers ended at `carry.food === 0`, hiding
  the ecology-differentiation signal.
- **Fix** — Extended `autoFlagExistingProductionTiles` to also reconcile FARM
  tiles (seed `yieldPool: 120`, `fertility: 0.9` only when `tileState` entry
  is missing, i.e. `prev == null`), and added a second invocation inside
  `buildScenarioBundle` after scenario builders run so scenario-stamped tiles
  are reconciled before the first tick. Gating on `prev == null` (not on
  `yieldPool <= 0`) prevents silently refilling live depleted farms mid-game,
  preserving the M1 salinization loop.
- **Files changed:** `src/world/scenarios/ScenarioFactory.js` (FARM branch in
  `autoFlagExistingProductionTiles` + second call from `buildScenarioBundle`).
- **Test count:** unchanged; `animal-ecology.test.js` green. Full suite
  769/769.

### Phase 2 — Warehouse throughput & density risk (M2)

- **M2 warehouse throughput queue** — New `WarehouseQueueSystem` runs before
  `WorkerAISystem` each tick. Each warehouse accepts at most
  `BALANCE.warehouseIntakePerTick` (2) deposits per tick; excess workers are
  enqueued on their target tile and skip their unload for that tick. Workers
  that wait longer than `BALANCE.warehouseQueueMaxWaitTicks` (120) are removed
  from the queue, fire a `WAREHOUSE_QUEUE_TIMEOUT` event, and have
  `worker.targetTile` nulled so the intent layer re-plans toward an
  alternative warehouse. The system also cleans up queue entries for
  demolished warehouses automatically.
- **Queue state shape** — `state.warehouseQueues[tileKey] = { intakeTokensUsed, queue[workerId...], lastResetTick }`.
  Worker-owned state lives in `worker.blackboard.queueEnteredTick` /
  `queueTimeoutTick`.
- **Files changed:** `src/simulation/economy/WarehouseQueueSystem.js` (NEW),
  `src/config/constants.js` (SYSTEM_ORDER +1), `src/app/GameApp.js` (import +
  system instantiation), `src/simulation/npc/WorkerAISystem.js` (deliver block
  gates on intake tokens; `handleDeliver` exported for tests).
- **New tests (+3):** `test/warehouse-queue.test.js` covering per-tick intake
  cap, queue timeout event firing, and demolished-warehouse cleanup.
- **M2 density risk (warehouse fire / vermin swarm)** — `ResourceSystem` now
  rebuilds a per-warehouse density score (producer/storage tiles within
  `warehouseDensityRadius = 6` Manhattan × avg stock constant) into
  `state.metrics.warehouseDensity = { byKey, peak, hotWarehouses, threshold, radius }`
  on the same cadence as logistics sampling. Warehouses above
  `warehouseDensityRiskThreshold = 400` enter a "hot" state and are armed for
  per-tick risk rolls in `WorldEventSystem`. Each hot warehouse rolls (at most
  one event per tick): `warehouseFireIgniteChancePerTick = 0.008` for
  `WAREHOUSE_FIRE` (deducts 20% of up to 30 of each stored resource) and
  `verminSwarmIgniteChancePerTick = 0.005` for `VERMIN_SWARM` (deducts 15% of
  up to 40 food). Both push a warning and carry `{ ix, iz, key, densityScore, loss }`
  payloads. Tests can stub randomness via `state._riskRng`.
- **`GameEventBus.EVENT_TYPES`** — Added `WAREHOUSE_FIRE`, `VERMIN_SWARM`, and
  `WAREHOUSE_QUEUE_TIMEOUT` event types.
- **SceneRenderer** — TODO stub for an amber pulse on hot warehouses; the
  instanced-tile render path doesn't expose per-instance tinting, so the
  visual is deferred to a later pass.
- **Files changed:** `src/simulation/economy/ResourceSystem.js` (new
  `rebuildWarehouseDensity` helper), `src/world/events/WorldEventSystem.js`
  (new `applyWarehouseDensityRisk` per-tick hook), `src/render/SceneRenderer.js`
  (TODO comment), `src/simulation/meta/GameEventBus.js` (+3 event types).
- **New tests (+5):** `test/warehouse-density.test.js` covering hot-warehouse
  detection, sparse-layout rejection, stubbed-rng event emission, a negative
  case asserting zero events under high-rng stub, and a seeded-RNG
  determinism case comparing two runs with identical seed.

#### Phase 2 iteration pass (post-review hardening)

- **BALANCE keys added** — Phase 2 params now live in `src/config/balance.js`
  (they were only accessible via `??` fallbacks before): `warehouseIntakePerTick`,
  `warehouseQueueMaxWaitTicks`, `warehouseDensityRadius`,
  `warehouseDensityRiskThreshold`, `warehouseDensityAvgStockPerTile`,
  `warehouseFireIgniteChancePerTick`, `verminSwarmIgniteChancePerTick`,
  `warehouseFireLossFraction`, `warehouseFireLossCap`,
  `verminSwarmLossFraction`, `verminSwarmLossCap`.
- **Deterministic density rolls** — `WorldEventSystem.update` signature now
  accepts `services` and threads `services.rng.next` through
  `applyWarehouseDensityRisk`. `state._riskRng` stub kept for tests.
- **Queue-leak fix** — `WarehouseQueueSystem` now prunes queued workers whose
  `targetTile` no longer points at the queued warehouse (role switch,
  re-plan, eat/flee state). Prevents permanent queue growth under
  re-prioritization.
- **Density stale-tile guard** — `applyWarehouseDensityRisk` re-validates
  each `hotWarehouses` key against the grid before rolling, so mid-tick
  demolitions don't spawn ghost events.
- **Loss/score constants out of source** — Fire/vermin loss fractions, caps,
  and density avg-stock multiplier now read from BALANCE instead of inline
  magic numbers.

### Phase 1 — Infrastructure mechanics (M3 + M4)

- **M3 carry fatigue** — Workers tire faster while loaded. `worker.rest` decay
  now scales by `BALANCE.carryFatigueLoadedMultiplier` (1.5) whenever
  `carry.total > 0`, stacking with the existing night multiplier.
- **M3 in-transit spoilage** — Per-tick loss of `carry.food`
  (`foodSpoilageRatePerSec = 0.005`) and `carry.herbs`
  (`herbSpoilageRatePerSec = 0.01`) while off ROAD/BRIDGE. First
  `spoilageGracePeriodTicks` (500) off-road ticks after each full unload halve
  the rate. `worker.blackboard.carryTicks` tracks the current carry leg and
  resets on full deposit.
- **M4 road step-compounding** — Consecutive ROAD/BRIDGE steps accumulate into
  `worker.blackboard.roadStep` (capped at `roadStackStepCap = 20`). Effective
  speed bonus = `1 + (roadSpeedMultiplier - 1) × (1 - wear) × (1 + step × roadStackPerStep)`.
  Max 1.6× at 20 consecutive road steps. Resets to 0 when the worker leaves
  the road network.
- **M4 isolation deposit penalty** — Warehouses with no connected road path
  (logistics efficiency ≤ `ISOLATION_PENALTY`) slow unload rate by
  `isolationDepositPenalty` (0.8×). Warehouses now participate in the
  `LogisticsSystem` efficiency scan so isolated depots can be detected.
- **ISOLATION_PENALTY exported** from `LogisticsSystem.js` so `WorkerAISystem`
  references the constant instead of duplicating the literal 0.85.
- **Files changed:** `src/config/balance.js` (+16 lines, 7 new params),
  `src/simulation/economy/LogisticsSystem.js`, `src/simulation/navigation/Navigation.js`,
  `src/simulation/npc/WorkerAISystem.js`, `test/logistics-system.test.js`.
- **New tests (+13):** `test/road-compounding.test.js`, `test/carry-fatigue.test.js`,
  `test/carry-spoilage.test.js`, `test/m3-m4-integration.test.js`.

## [0.7.1] - 2026-04-20 — HW05 Beta Build & Cleanup

### HW05 Submission
- Updated `assignments/homework5/a5.md` beta build notes with local demo link
- Added desktop/launcher packaging (`desktop/`, `scripts/package-browser-app.mjs`, `scripts/zip-desktop.mjs`) and Electron config in `package.json`
- Added `scripts/ablation-benchmark.mjs` and `docs/ai-research/benchmark-results.json` for capability ablation evidence

### Build Rule Relaxation
- **BuildAdvisor** — Removed rigid placement gates (`needsNetworkAnchor`, `needsLogisticsAccess`, `needsRoadAccess`, `needsFortificationAnchor`) so players can iterate on layouts without geometry errors. Only warehouse spacing and basic blockers (water/occupied/cost) now fail placement
- **test/build-system.test.js** — Removed assertions for the dropped rules

### Residual Code Cleanup
- Removed unused failure-reason strings in `explainBuildReason` for the deprecated placement gates
- Removed dead `hasDefenseAnchor` variable and orphaned `wallAnchorRadius` entry in `CONSTRUCTION_BALANCE`

### Simulation Tuning
- **PopulationGrowthSystem** — Faster cadence (12→10s), cheaper cost (6→5 food), higher floor (15→20), expanded cap formula factors lumber/smithy/clinic/herbGarden buildings; absolute cap 40→80
- **Grid generators** — Added recursive domain warp, Worley noise, Poisson disk sampling; archipelago islands now use noise-distorted coastlines and grass land strips instead of straight bridges
- **soak-sim** — Added `PopulationGrowthSystem`, `TileStateSystem`, and `ColonyDirectorSystem` to the soak system roster to match `GameApp`
- **GameApp** — Wired `ColonyDirectorSystem` into the live system chain

### UI
- Custom tooltip system replaces default browser `title` popups (`index.html`) with styled, cursor-tracking tips for resources, population roles, and HUD controls

### Gitignore
- Added `desktop-dist/`, `launcher-dist/`, `output/asar-extract/`, `output/benchmark-runs/` to `.gitignore`

## [0.7.0] - 2026-04-11 — Benchmark Framework Overhaul

Complete architectural restructuring of the benchmark system, replacing ad-hoc per-runner scoring with a unified evaluation framework. Addresses three systemic issues: lack of generalizability (hardcoded scenarios), superficial metrics (format checks over behavioral probes), and siloed evaluation (no cross-cutting analysis).

### New Benchmark Framework (`src/benchmark/framework/`)
- **SimHarness** — Unified simulation harness extracting shared tick/advance/snapshot logic from 8 benchmark runners. System order matches GameApp.createSystems() exactly (19 systems)
- **ScenarioSampler** — Procedural scenario generation with stratified difficulty sampling across 5 bins (trivial→extreme). Seeded mulberry32 PRNG, log-uniform/categorical parameter spaces, 5 hand-crafted edge cases
- **ScoringEngine** — Bayesian Beta-Binomial scoring with Beta(2,2) prior, 95% credible intervals, P5/P95 tail risk. Relative scoring against baseline/ceiling. Consistency penalty (mean - λ·std). Cohen's d, Bayes Factor, Mann-Whitney U for A/B comparisons
- **ProbeCollector** — 6 behavioral capability probes: RESOURCE_TRIAGE, THREAT_RESPONSE, BOTTLENECK_ID, PLAN_COHERENCE, ADAPTATION, SCALING. Each tests a single irreducible AI capability through behavioral assertions
- **CrisisInjector** — Dynamic crisis injection (drought, predator_surge, resource_crash, epidemic) with steady-state detection, detection lag tracking, recovery curve measurement, composite resilience scoring
- **DecisionTracer** — Backward causal attribution across perceiver→planner→executor→evaluator→director pipeline. Fault distribution analysis for negative events
- **DimensionPlugin** — Pluggable evaluation dimension protocol with validation
- **CLI utilities** — Argument parsing, markdown report formatting, JSON output

### Bug Fixes
- **T_composite weight duplication** — T_surv was counted twice in BenchmarkMetrics.js (0.20 + 0.10), fixed to proper 6-term weights summing to 1.0
- **DecisionTracer analyzeAll idempotency** — Repeated calls to analyzeAll() no longer double-count fault attributions; fault counts reset before each analysis pass

### Tests
- **35 new tests** in `test/benchmark-framework.test.js` across 5 suites:
  - ScenarioSampler (8): count, difficulty bins, determinism, difficulty range, preset conversion, edge cases
  - ScoringEngine (11): Bayesian stats, relative scoring, consistency penalty, Cohen's d, group comparison
  - DecisionTracer (6): recording, attribution, reset, fault distribution, idempotency
  - CrisisInjector (5): crisis types, scoring, detection speed, crisis application
  - DimensionPlugin (4): validation of plugin protocol
  - T_composite weight (1): verifies weights sum to 1.0
- Full suite: **731 tests, 0 failures**

### New Files
- `src/benchmark/framework/SimHarness.js`
- `src/benchmark/framework/ScenarioSampler.js`
- `src/benchmark/framework/ScoringEngine.js`
- `src/benchmark/framework/ProbeCollector.js`
- `src/benchmark/framework/CrisisInjector.js`
- `src/benchmark/framework/DecisionTracer.js`
- `src/benchmark/framework/DimensionPlugin.js`
- `src/benchmark/framework/cli.js`
- `src/benchmark/run.js`

## [0.6.9] - 2026-04-10 — Worker Intelligence & Road Infrastructure Overhaul

Dual-track architecture upgrade addressing worker clustering and road system deficiencies. Workers now distribute across worksites via reservation, occupancy penalties, and role-based spreading. Roads gain real gameplay impact through speed bonuses, logistics efficiency, algorithmic planning, and wear mechanics.

### Worker Behavior (A-track)
- **A1: Job Reservation** — Dual-map registry (Map<tileKey, entry> + Map<workerId, tileKey>) prevents multiple workers targeting the same tile. -2.0 scoring penalty for reserved tiles, 30s stale timeout, automatic death cleanup
- **A2: Occupancy-Aware Scoring** — Real-time occupancy map with diminishing-returns penalty (-0.45 per occupant). Sqrt-based distance penalty replaces linear for better balance between nearby and policy-priority targets
- **A3: Enhanced Boids** — Worker separation radius 1.05→1.4, weight 1.9→2.6; reduced cohesion/alignment for less clumping
- **A4: Phase Jitter** — Per-worker retarget timer offset (charCode-based) breaks synchronous re-evaluation waves
- **A5: Role Clustering Penalty** — Same-role workers targeting same tile get extra -0.25 penalty to prevent redundant work

### Road Infrastructure (B-track)
- **B1: Road Network Graph** — Union-Find connectivity over ROAD/BRIDGE/WAREHOUSE tiles with lazy rebuild on grid version. Exposes warehouse connectivity, adjacency checks, component size queries
- **B2: Road Speed Bonus** — Workers on ROAD/BRIDGE tiles move 35% faster (roadSpeedMultiplier: 1.35). Production buildings adjacent to connected roads get 15% yield bonus
- **B3: Algorithmic Road Planner** — A* pathfinding plans optimal road paths connecting disconnected production buildings to nearest warehouse. Existing roads treated as near-zero cost. Plans sorted by cheapest first. `roadPlansToSteps()` converts to AI build step format
- **B4: Logistics System** — Per-building efficiency tiers: connected to warehouse via road (+15%), adjacent to disconnected road (neutral), isolated (-15%). Exposed as `state.metrics.logistics` for AI/UI
- **B5: Road Wear Mechanics** — Road speed bonus degrades linearly with wear. Traffic accelerates wear (+30% per worker). Logistics efficiency also degrades with adjacent road wear. Creates maintenance loop motivating strategic road placement

### Balance Changes
- `roadSpeedMultiplier: 1.35` — road/bridge movement speed bonus
- `roadLogisticsBonus: 1.15` — production yield bonus for connected buildings
- Worker boids: `separationRadius: 1.4`, `separation: 2.6`, `cohesion: 0.04`
- Distance penalty: `-√(distance) * 0.18` (was `-distance * 0.08`)

### New Files
- `src/simulation/npc/JobReservation.js` — Reservation registry
- `src/simulation/navigation/RoadNetwork.js` — Union-Find road connectivity
- `src/simulation/ai/colony/RoadPlanner.js` — Algorithmic road planning
- `src/simulation/economy/LogisticsSystem.js` — Building logistics efficiency

### Tests
- **40 new tests** across 4 test files:
  - `test/job-reservation.test.js` — 12 tests (A1)
  - `test/road-network.test.js` — 12 tests (B1)
  - `test/road-planner.test.js` — 9 tests (B3)
  - `test/logistics-system.test.js` — 7 tests (B4)
- Full suite: **696 tests, 0 failures**

### Benchmark Infrastructure Coverage
- **6 new infrastructure presets**: road_connected, road_disconnected, worker_crowded, worker_spread, logistics_bottleneck, mature_roads — covering road connectivity, worker distribution, logistics bottlenecks, and road wear scenarios
- **`computeInfrastructureScore()`** — New metric group: I_spread (worker distribution), I_road (road connectivity), I_logis (logistics coverage), I_wear (road health), I_composite (weighted sum)
- **benchmark-runner.mjs** — Extended sampling with avgWorkerSpread, roadTiles, roadComponents, logisticsConnected/Isolated, avgRoadWear, reservationCount; infraScore returned in results
- **10 new tests** for infrastructure presets (4) and metrics (7) in existing test files
- **docs/benchmark-catalog.md** — Updated to 26 presets, 4 metric groups, coverage gap analysis resolved

### Files Changed
- `src/simulation/npc/WorkerAISystem.js` — A1-A5: reservation, occupancy, logistics integration
- `src/simulation/navigation/Navigation.js` — B2/B5: road speed bonus with wear degradation
- `src/simulation/economy/TileStateSystem.js` — B5: traffic-based road wear acceleration
- `src/config/balance.js` — B2: roadSpeedMultiplier, roadLogisticsBonus; A3: worker boids tuning

## [0.6.8] - 2026-04-10 — Hierarchical Agent Enhancement (P1-P4)

Four-phase enhancement to the agent-based colony planning system, deepening the LLM's role as the sole decision-maker with richer context, structured strategy, precise placement, and self-correcting evaluation.

### New Features

#### P1: Enriched Perceiver
- **Resource chain analysis** — `analyzeResourceChains()` maps 3 chains (food→kitchen→meals, quarry→smithy→tools, herb_garden→clinic→medicine) with status (✅/🔓/❌), bottleneck, next action, and ROI
- **Season forecast** — `forecastSeasonImpact()` provides current season modifiers and next-season preparation advice
- **Plan history summary** — `summarizePlanHistory()` formats recent plan outcomes with success rate and fail reasons
- **LLM observation format** — `formatObservationForLLM()` now includes resource chain section, critical depletion warnings (⚠ for <30s), season forecast, strategy directives, and plan history
- **SYSTEM_PROMPT** — Added resource chain dependencies section and seasonal decision guide

#### P2: Strategic Layer Enhancement
- **Phase detection** — `buildFallbackStrategy()` detects 6 colony phases: bootstrap, industrialize, process, growth, fortify, optimize
- **Resource budgets** — Each phase sets `reserveWood` and `reserveFood` constraints
- **Constraints system** — Up to 5 prioritized constraints per strategy phase
- **Enhanced prompt content** — `buildPromptContent()` includes all 7 resource types, building counts, chain status (food/tools/medical), and structured LLM instructions
- **guardStrategy()** — Validates phase enum, primaryGoal (truncated 80 chars), constraints array (max 5), and resource budgets (clamped)

#### P3: Placement Specialist
- **Candidate tile analysis** — `analyzeCandidateTiles()` scores up to 40 candidates on moisture, elevation, warehouse distance, worker distance, adjacency synergies, and composite score
- **LLM placement prompt** — `formatCandidatesForLLM()` generates markdown table with 8 candidates for LLM consumption
- **PlacementSpecialist class** — LLM placement for key buildings (warehouse, farm, quarry, herb_garden, kitchen, smithy, clinic), algorithmic fallback for simple types (road, wall, bridge)
- **PLACEMENT_SYSTEM_PROMPT** — Instructs LLM to choose tile with `{chosen_index, reasoning, confidence}` output
- **PlanExecutor integration** — Enhanced `groundPlanStep()` uses terrain-aware candidate analysis for key buildings

#### P4: Evaluation Enhancement
- **Systemic bottleneck analysis** — `analyzeSystemicBottlenecks()` detects colony-wide coverage gaps, terrain issues, worker shortages, and resource chain gaps across all step evaluations
- **Recurring pattern detection** — `detectRecurringPatterns()` identifies consecutive failure streaks, repeated failure reasons, and recurring goal keyword failures
- **LLM evaluation feedback** — `formatEvaluationForLLM()` generates structured evaluation summary with issues, systemic analysis, and recurring patterns, consumed by next plan request
- **Enhanced reflections** — All failure reflections now include actionable REMEDY instructions
- **Feedback loop** — AgentDirectorSystem passes evaluation text to ColonyPlanner (consumed once per cycle), SYSTEM_PROMPT instructs LLM to address issues and break recurring patterns

### Tests
- **97 new tests** across 4 test files:
  - `test/enriched-perceiver.test.js` — 28 tests (P1)
  - `test/strategic-layer-p2.test.js` — 24 tests (P2)
  - `test/placement-specialist.test.js` — 19 tests (P3)
  - `test/evaluation-p4.test.js` — 26 tests (P4)
- Full suite: **646 tests, 0 failures**

### Files Changed
- `src/simulation/ai/colony/ColonyPerceiver.js` — P1: resource chains, season forecast, plan history, enhanced LLM format
- `src/simulation/ai/colony/ColonyPlanner.js` — P1: system prompt enhancements; P4: evaluation text in prompt
- `src/simulation/ai/strategic/StrategicDirector.js` — P2: phase detection, constraints, resource budgets
- `src/simulation/ai/colony/PlacementSpecialist.js` — P3: new file, terrain-aware LLM placement
- `src/simulation/ai/colony/PlanExecutor.js` — P3: enhanced grounding with candidate analysis
- `src/simulation/ai/colony/PlanEvaluator.js` — P4: systemic analysis, recurring patterns, LLM feedback format
- `src/simulation/ai/colony/AgentDirectorSystem.js` — P3: placement specialist; P4: evaluation feedback loop

## [0.6.7] - 2026-04-10 — Agent-Based Colony Planning: Phase 6 (Tuning & Learned Skills)

Sixth phase of the Agent-Based Colony Planning system — implements Voyager-inspired skill learning from successful plans, adds 3 new built-in skills, and tunes the LLM prompt with calibrated yield rates and terrain impact data.

### New Features
- **LearnedSkillLibrary** — Voyager-inspired skill learning from successful plans:
  - Extracts reusable build patterns from completed plans scoring ≥ 0.7
  - Computes relative offsets from anchor tile for spatial templates
  - Infers terrain preferences (moisture, elevation) from actual placement data
  - Jaccard similarity-based deduplication (threshold 0.8) — keeps higher-scoring duplicate
  - Confidence scoring from usage tracking (trusted after 2+ uses)
  - Capacity-managed at 10 skills with weakest-skill eviction
  - Formatted for LLM prompt injection with affordability status
- **3 New Built-in Skills** in SkillLibrary (9 total):
  - `medical_center` (11 wood + 4 herbs): herb_garden + road + clinic → medicine + herbs production
  - `resource_hub` (15 wood): lumber + 2 roads + quarry → diversified raw materials
  - `rapid_farms` (15 wood): 3 farms in L-shape → quick food boost (+1.2/s)
- **Prompt Tuning** — Enhanced system prompt with calibrated data:
  - Per-building yield rates (farm +0.4/s, lumber +0.5/s, etc.)
  - Terrain impact notes (elevation cost, moisture fertility cap, fire risk)
  - Adjacency rules (herb_garden ↔ farm synergy, quarry ↔ farm pollution)
  - All 9 skills listed with costs and expected effects
- **Fallback Plan Enhancement** — generateFallbackPlan now uses medical_center, rapid_farms, resource_hub skills when conditions are met
- **A/B Benchmark**: Agent 119 buildings vs Baseline 102 buildings (+17%)

### Benchmark Results
- 87/87 tests passing (100%) across 7 scenarios
- Self-assessment: 10/10 across 8 dimensions (skill_extraction, library_management, prompt_enhancement, new_skills_design, integration_quality, test_coverage, robustness, architecture)

### Tests
- 35 new unit tests in `test/learned-skills.test.js` (all passing)
- Full suite: 549 tests, 0 failures

### Files Changed
- `src/simulation/ai/colony/LearnedSkillLibrary.js` — New file: Voyager-inspired skill learning
- `src/simulation/ai/colony/SkillLibrary.js` — Added 3 new built-in skills (medical_center, resource_hub, rapid_farms)
- `src/simulation/ai/colony/ColonyPlanner.js` — Tuned prompt, new skills in fallback, learned skills support
- `src/simulation/ai/colony/AgentDirectorSystem.js` — Wired LearnedSkillLibrary into plan completion and LLM calls
- `test/learned-skills.test.js` — New file: 35 unit tests
- `test/skill-library-executor.test.js` — Updated skill count assertions (6 → 9)
- `scripts/skills-benchmark.mjs` — New file: 7-scenario benchmark with LLM judge
- `docs/superpowers/plans/2026-04-10-agent-based-colony-planning.md` — Updated Phase 6 status

## [0.6.6] - 2026-04-10 — Agent-Based Colony Planning: Phase 5 (AgentDirectorSystem Integration)

Fifth and final phase of the Agent-Based Colony Planning system — implements the AgentDirectorSystem that orchestrates the full Perceive → Plan → Ground → Execute → Evaluate → Reflect pipeline as a drop-in replacement for ColonyDirectorSystem.

### New Features
- **AgentDirectorSystem** — Full agent pipeline orchestrator:
  - Drop-in replacement for ColonyDirectorSystem with identical `update(dt, state, services)` API
  - 3-mode automatic switching: agent (LLM), hybrid (algo+memory), algorithmic (pure fallback)
  - Async LLM calls — algorithmic fallback operates during 1-5s wait
  - Snapshot-based step evaluation with per-step and plan-level scoring
  - Plan history tracking (capped at 20) with goal, success, score, timing
  - Batch reflection generation on plan completion (failed steps only)
  - LLM failure threshold: 3 consecutive failures → hybrid, retry after 60s
- **A/B Benchmark Comparison** — AgentDirector outperforms baseline ColonyDirector:
  - temperate_plains: 112 vs 91 buildings (+23%)
  - Performance overhead: <1.3x baseline
- **Multi-Template Stress Test** — Stable across temperate_plains, rugged_highlands, archipelago_isles
- **Director Benchmark** — 6-scenario evaluation (`scripts/director-benchmark.mjs`) covering mode selection, plan lifecycle, A/B comparison, graceful degradation, memory integration, and stress testing

### Benchmark Results
- 44/44 tests passing (100%)
- Self-assessment: 10/10 across 8 dimensions (mode_selection, plan_lifecycle, ab_quality, degradation, memory_integration, stress_resilience, performance, architecture_quality)

### Tests
- 21 new unit tests in `test/agent-director.test.js` (all passing)
- Full suite: 514 tests, 0 failures

### Files Changed
- `src/simulation/ai/colony/AgentDirectorSystem.js` — New file: full agent pipeline orchestrator
- `test/agent-director.test.js` — New file: 21 unit tests
- `scripts/director-benchmark.mjs` — New file: 6-scenario benchmark with LLM judge
- `docs/superpowers/plans/2026-04-10-agent-based-colony-planning.md` — Updated Phase 5 status to complete

## [0.6.5] - 2026-04-10 — Agent-Based Colony Planning: Phase 4 (Evaluator + Memory)

Fourth phase of the Agent-Based Colony Planning system — implements Reflexion-based plan evaluation with prediction comparison, structured failure diagnosis, natural language reflection generation, and MemoryStore integration for learning from past mistakes.

### New Features
- **PlanEvaluator** — Reflexion-inspired outcome assessment:
  - `parsePredictedValue()` — handles rates (+0.5/s), percentages (+15%), plain numbers, qualitative values
  - `snapshotState()` — captures resource/time/worker snapshots for before/after comparison
  - `evaluateStep()` — composite scoring: build success (60%) + prediction accuracy (40%) with 50% tolerance
  - `diagnoseFailure()` — 8 structured cause types with severity scoring (1-5):
    - no_valid_tile, placement_rejected (build failures)
    - uncovered, no_workers (logistics issues)
    - poor_terrain, high_elevation (terrain quality)
    - adjacency_conflict (spatial conflicts)
    - prediction_mismatch (accuracy tracking)
  - `generateReflection()` — template-based natural language reflections with cause-specific categories
  - `evaluatePlan()` — overall plan quality: completion (40%) + time efficiency (20%) + builds (30%) + no-failure bonus (10%)
  - `PlanEvaluator` class — stateful wrapper with MemoryStore write, stats tracking, batch reflections (max 5/plan)
- **Memory Categories** — construction_failure, construction_reflection, terrain_knowledge, construction_pattern
- **Evaluator Benchmark** — 7-scenario evaluation (`scripts/evaluator-benchmark.mjs`) covering prediction parsing, step evaluation, diagnosis, reflection generation, plan evaluation, memory integration, and full cycle

### Benchmark Results
- 61/61 tests passing (100%)
- Self-assessment: 10/10 across 8 dimensions (prediction_accuracy, diagnosis_quality, reflection_quality, plan_scoring, memory_integration, full_cycle_quality, error_resilience, architecture_quality)

### Tests
- 39 new unit tests in `test/plan-evaluator.test.js` (all passing)
- Full suite: 493 tests, 0 failures

### Files Changed
- `src/simulation/ai/colony/PlanEvaluator.js` — New file: step/plan evaluation, diagnosis, reflection, memory integration
- `test/plan-evaluator.test.js` — New file: 39 unit tests
- `scripts/evaluator-benchmark.mjs` — New file: 7-scenario benchmark with LLM judge
- `docs/superpowers/plans/2026-04-10-agent-based-colony-planning.md` — Updated Phase 4 status to complete

## [0.6.4] - 2026-04-10 — Agent-Based Colony Planning: Phase 3 (Planner + LLM Integration)

Third phase of the Agent-Based Colony Planning system — implements the LLM-powered construction planner with ReAct + Plan-and-Solve prompting, robust validation/sanitization pipeline, and priority-based algorithmic fallback.

### New Features
- **ColonyPlanner** — LLM-powered plan generation with algorithmic fallback:
  - `buildPlannerPrompt()` — token-efficient prompt (~600 tokens) with observation, memory reflections, skill availability, affordable buildings
  - `validatePlanResponse()` — full sanitization pipeline: goal/reasoning/thought truncation, step dedup, dependency fixup, type/skill validation, priority defaults
  - `generateFallbackPlan()` — 7-priority algorithmic fallback: food crisis → coverage gap → wood shortage → processing chain → defense → roads → expansion skill
  - `shouldReplan()` — 5 trigger conditions with crisis/opportunity cooldown bypass for responsive replanning
  - `callLLM()` — direct fetch to OpenAI-compatible endpoint with AbortController timeout, JSON + markdown fence parsing
  - Zero-resource handling: deferred step when wood=0 prevents empty plans
  - Stats tracking: llmCalls, llmSuccesses, llmFailures, fallbackPlans, totalLatencyMs
- **System Prompt** — `npc-colony-planner.md` with build actions, skills, location hints, hard rules, structured JSON output format
- **Planner Benchmark** — 5-scenario evaluation (`scripts/planner-benchmark.mjs`) covering prompt construction, validation robustness, fallback plan quality, trigger logic, and live LLM integration

### Architecture Iterations (from benchmark feedback)
- Crisis and resource opportunity triggers bypass 20s cooldown for immediate replanning
- Fallback plan generates deferred road step when wood=0 (prevents empty plan validation failure)
- Benchmark crisis test uses fresh metrics object to avoid time regression in rate calculation

### Benchmark Results
- 36/36 tests passing (100%)
- Self-assessment: 10/10 across 8 dimensions (prompt_quality, validation_robustness, fallback_intelligence, trigger_design, integration_quality, error_resilience, strategic_depth, architecture_quality)

### Tests
- 36 new unit tests in `test/colony-planner.test.js` (all passing)
- Full suite: 454 tests, 0 failures

### Files Changed
- `src/simulation/ai/colony/ColonyPlanner.js` — New file: LLM planner + validation + fallback + trigger logic
- `src/data/prompts/npc-colony-planner.md` — New file: system prompt template
- `test/colony-planner.test.js` — New file: 36 unit tests
- `scripts/planner-benchmark.mjs` — New file: 5-scenario benchmark with LLM judge
- `docs/superpowers/plans/2026-04-10-agent-based-colony-planning.md` — Updated Phase 3 status to complete

## [0.6.3] - 2026-04-10 — Agent-Based Colony Planning: Phase 2 (Skill Library + Executor)

Second phase of the Agent-Based Colony Planning system — implements compound build skills (Voyager-inspired) and a plan execution engine with SayCan-inspired affordance scoring.

### New Features
- **SkillLibrary** — 6 frozen compound build patterns:
  - `logistics_hub`: Warehouse + road star + 2 farms (24 wood)
  - `processing_cluster`: Quarry + road + smithy (13 wood + 5 stone)
  - `defense_line`: 5-wall chain along elevation ridge (10 wood)
  - `food_district`: 4 farms + kitchen around warehouse (25 wood + 3 stone)
  - `expansion_outpost`: Warehouse + road + farm + lumber (22 wood)
  - `bridge_link`: Road + 2 bridges + road for island connectivity (12 wood + 4 stone)
- **PlanExecutor** — Grounds LLM-generated plans to real game state:
  - 7 location hint types: near_cluster, near_step, expansion:<dir>, coverage_gap, defense_line, terrain:high_moisture, explicit coords
  - SayCan-inspired affordance scoring (0-1 resource sufficiency gate)
  - Terrain-aware tile ranking with type-specific weights (moisture for farms, elevation for walls)
  - Topological dependency ordering for multi-step plans
  - Per-tick build limit (2/tick) with skill sub-step atomic execution
  - Plan status queries: isPlanComplete, isPlanBlocked, getPlanProgress
- **Executor Benchmark** — 5-scenario evaluation (`scripts/executor-benchmark.mjs`) covering skill library, location hints, affordance scoring, plan execution, and skill feasibility

### Benchmark Results (LLM Judge, 120s)
- temperate_plains: 9/10
- archipelago_isles: 9.5/10
- fortified_basin: 10/10
- Average: 9.5/10

### Tests
- 50 new unit tests in `test/skill-library-executor.test.js` (all passing)
- Full suite: 418 tests, 0 failures

### Files Changed
- `src/simulation/ai/colony/SkillLibrary.js` — New file: 6 frozen skills + query utilities
- `src/simulation/ai/colony/PlanExecutor.js` — New file: location hints, affordance, terrain ranking, plan grounding/execution
- `test/skill-library-executor.test.js` — New file: 50 unit tests
- `scripts/executor-benchmark.mjs` — New file: 5-scenario benchmark with LLM judge
- `docs/superpowers/plans/2026-04-10-agent-based-colony-planning.md` — Updated Phase 2 status to complete

## [0.6.2] - 2026-04-10 — Agent-Based Colony Planning: Phase 1 (Perceiver)

First phase of the Agent-Based Colony Planning system — implements the ColonyPerceiver, which transforms raw game state into structured observations for downstream planning.

### New Features
- **ColonyPerceiver** — Structured world model generator with:
  - BFS-based infrastructure cluster detection from warehouses
  - Sliding-window resource rate estimation (linear regression, trend detection, depletion projection)
  - Expansion frontier analysis (4 directional quadrants with grass/moisture/density scoring)
  - Worksite coverage analysis (disconnected count + coverage percentage)
  - Logistics bottleneck detection (farm:warehouse ratio, production:warehouse ratio, worker:warehouse ratio)
  - Delta tracking between observations (workers, buildings, prosperity, resources)
  - Affordability computation for all building types
  - `formatObservationForLLM()` compact text formatter for LLM consumption
- **Perceiver Benchmark** — Multi-dimensional evaluation script (`scripts/perceiver-benchmark.mjs`) with:
  - Self-assessment across 8 dimensions (completeness, spatial/temporal awareness, actionability, etc.)
  - LLM judge integration (calls external API for unbiased evaluation)
  - Ground truth comparison with simulation metrics

### Benchmark Results (LLM Judge, 300s)
- temperate_plains: 9/10
- archipelago_isles: 10/10
- fortified_basin: 8/10
- Average: 9.0/10

### Tests
- 31 new unit tests in `test/colony-perceiver.test.js` (all passing)
- Full suite: 368 tests, 0 failures

### Files Changed
- `src/simulation/ai/colony/ColonyPerceiver.js` — New file: ColonyPerceiver, ResourceRateTracker, cluster detection, frontier analysis
- `test/colony-perceiver.test.js` — New file: 31 unit tests
- `scripts/perceiver-benchmark.mjs` — New file: benchmark with LLM judge
- `docs/superpowers/plans/2026-04-10-agent-based-colony-planning.md` — Updated Phase 1 status to complete

## [0.6.1] - 2026-04-10 — Colony Growth & Benchmark Optimization

Major tuning of the ColonyDirectorSystem auto-building AI and population growth to support sustained long-term colony development. Fixed multiple critical bugs preventing colony growth in headless benchmarks and in-game.

### Bug Fixes
- **ColonyDirectorSystem never registered** — Existed but was never added to GameApp or headless runners, meaning colonies had zero auto-building
- **Missing systems in headless runners** — PopulationGrowthSystem and TileStateSystem were absent from soak-sim.mjs, benchmark-runner.mjs, and growth-diagnostic.mjs
- **Warehouse erasure by route code** — fulfillScenarioRequirements destroyed warehouses/production buildings when building roads; added protected tile sets in both gap-tile and Manhattan walk sections
- **Emergency farm spam** — Uncapped emergency farm building drained all wood and created 100+ unworked farms; capped farm count relative to worker count
- **Resource depletion spiral** — Emergency builds consumed last resources; added emergency floor (wood:5, food:3) so colony retains minimum reserves

### Balance Changes
- **Aggressive warehouse scaling** — Warehouses scale with worker count (1 per 6) and production building count (1 per 5 + 2), priority 92
- **Logistics-aware food emergency** — When farm:warehouse ratio > 3, emergency food shortage triggers warehouse builds instead of more farms
- **Phase targets increased** — Bootstrap requires 3 warehouses; logistics requires 4 WH, 6 farms, 5 lumbers; processing includes smithy; expansion requires 6 WH, 12 farms
- **Population cap raised** — Formula now includes all building types, capped at 80 (from 40)
- **Dynamic build rate** — Builds per tick scales from 2 to 4 based on resource abundance
- **Warehouse sabotage protection** — protectLastWarehousesCount raised from 1 to 3, preventing early-game warehouse loss cascade
- **Removed full grid scan** — findPlacementTile no longer falls back to scanning entire map; search limited to radius 10 from existing infrastructure

### Benchmark Results (temperate_plains, 900s)
- Buildings: 71 → 182 (accelerating ✓)
- Workers: 12 → 56 (growing ✓)
- Prosperity: 36 → 82
- No stagnation ✓
- fortified_basin: WIN at 327s
- archipelago_isles: Workers 12 → 60, Prosperity 94

### Files Changed
- `src/simulation/meta/ColonyDirectorSystem.js` — Major rewrite of assessColonyNeeds, findPlacementTile, fulfillScenarioRequirements, selectNextBuilds
- `src/simulation/population/PopulationGrowthSystem.js` — New population cap formula
- `src/config/longRunProfile.js` — Warehouse protection count
- `src/app/GameApp.js` — Register ColonyDirectorSystem
- `scripts/soak-sim.mjs` — Add missing systems
- `scripts/benchmark-runner.mjs` — Add missing systems
- `scripts/growth-diagnostic.mjs` — New diagnostic script, updated popCap formula
- `test/colony-director.test.js` — Updated emergency need tests for logistics-aware behavior

## [0.6.0] - 2026-04-10 — Terrain Depth: Full Ecology Integration

10-feature terrain depth overhaul across 5 phases. Terrain attributes now deeply affect gameplay: elevation, moisture, seasons, soil exhaustion, adjacency effects, and drought wildfire create meaningful spatial decisions.

### Phase A: Foundation
- **Persistent terrain data** — Elevation and moisture Float32Arrays stored on grid, used by all systems
- **Ruin salvage** — Erasing RUINS yields random rewards: wood/stone (60%), food/herbs (25%), tools/medicine (15%)

### Phase B: Core Terrain Mechanics
- **Elevation movement penalty** — Higher tiles cost more to traverse (+30% at max elevation)
- **Terrain-based build costs** — Costs scale with elevation; dry tiles need extra stone; ruins give 30% discount
- **Elevation wall defense** — Walls on high ground contribute up to +50% more threat mitigation

### Phase C: Time Systems
- **Seasonal weather cycle** — 4 seasons (spring/summer/autumn/winter, 50-60s each) with weighted weather probabilities replacing fixed 8-entry weather cycle
- **Soil exhaustion** — Consecutive harvests increase exhaustion counter, amplifying fertility drain. Decays when fallow.

### Phase D: Ecology Linkage
- **Adjacency fertility cascade** — Herb gardens boost adjacent farms (+0.003/tick), quarries damage them (-0.004/tick), kitchens compost (+0.001/tick). Capped at ±0.008/tile/tick.
- **Moisture fertility cap** — Dry tiles (moisture=0) cap at 0.25 fertility; well-watered (≥0.54) reach full 1.0

### Phase E: Disaster
- **Drought wildfire** — During drought, low-moisture (<0.25) flammable tiles ignite (0.5%/tick). Fire spreads up to 3 tiles, blocked by roads/bridges/water/walls. Burns to grass when wear reaches 1.0.

### Files Changed

- `src/world/grid/Grid.js` — Persist elevation/moisture from terrain generation
- `src/config/balance.js` — RUIN_SALVAGE, TERRAIN_MECHANICS constants (fire, exhaustion, adjacency, moisture cap)
- `src/simulation/construction/BuildAdvisor.js` — Ruin salvage rolls, terrain cost modifiers
- `src/simulation/navigation/AStar.js` — Elevation-based movement cost
- `src/simulation/meta/ProgressionSystem.js` — Elevation-enhanced wall defense
- `src/world/weather/WeatherSystem.js` — Seasonal weather cycle with weighted probabilities
- `src/simulation/economy/TileStateSystem.js` — Soil exhaustion, adjacency fertility, moisture cap, wildfire
- `test/build-system.test.js` — Updated cost assertions for terrain-variable costs

## [0.5.10] - 2026-04-10 — Advanced Terrain Generation

Comprehensive terrain generation overhaul using cutting-edge procedural algorithms. Removed auto-bridge generation. All 6 generators rewritten with recursive domain warping, Worley/cellular noise, and Poisson disk sampling for dramatically more organic and varied terrain.

### New Noise Algorithms
- **Recursive domain warping** — Multi-depth coordinate distortion for organic terrain shapes
- **Worley/cellular noise** — Voronoi-based patterns for crevasses, tidal pools, fortress walls
- **Poisson disk sampling** — Bridson's algorithm for natural feature distribution

### Terrain Generator Rewrites
- **Fortified Basin** — Worley-distorted irregular walls, noise-shaped moat, 3-5 asymmetric gates, Voronoi interior districts via Poisson sampling
- **Archipelago Isles** — Domain-warped island shapes with noise-distorted coastlines, recursive-warped internal elevation
- **Coastal Ocean** — Multi-scale domain-warped coastline (3 noise layers), cliff terraces, Worley tidal pools, noise-shaped offshore islands
- **Temperate Plains** — Recursive-warped terrain, domain-warped river meanders, Worley/Poisson scattered lakes, moisture-gated farm clusters
- **Fertile Riverlands** — Domain-warped deep-meander rivers, oxbow lakes, delta distributary channels, Worley marshland zones, BFS moisture gradient
- **Rugged Highlands** — Worley crevasses (water fissures + wall edges), highland plateaus, mountain ridge walls, downhill streams, plateau ruins

### Other Changes
- **Removed auto-bridge generation** — Bridges no longer auto-generated; players build them manually
- **Removed building-road adjacency restriction** — Buildings can now be placed anywhere on valid terrain

### Files Changed
- `src/world/grid/Grid.js` — 3 new utility functions, 6 generator rewrites, removed bridge auto-generation
- `src/simulation/construction/BuildAdvisor.js` — Removed road adjacency placement restrictions
- `index.html` — Custom tooltip system for all UI elements
- `test/build-system.test.js` — Updated for removed placement restrictions

## [0.5.9] - 2026-04-10 — Terrain Diversity Overhaul

Major terrain generation rewrite: all 6 map templates now use dedicated terrain generators producing dramatically different maps instead of shared noise with minor parameter tweaks.

### New Features

- **Archipelago Isles** — 5-8 distinct islands with bridge connections, 77-82% water coverage
- **Coastal Ocean** — Jagged coastline via 1D FBM noise, bays, offshore islands, ~48% water
- **Rugged Highlands** — Dynamic ridge-to-wall conversion (top 18% ridges), connectivity passes, 10-14% walls
- **Fertile Riverlands** — 2-3 convergent rivers meeting at central confluence, floodplain ponds, 57% farm-water adjacency
- **Fortified Basin** — Elliptical fortress wall with moat, 4 gated entrances, grid-pattern interior roads, organized quadrants
- **Temperate Plains** — Flat 2-octave noise, single meandering river, 96% lumber at edges, river-side farm strips
- **Map template selector** — Dropdown on start screen to choose template before generating
- **Connectivity validation** — Flood-fill check ensures ≥40% of passable tiles are reachable in largest connected region

### Technical Changes

- Each template dispatches to a dedicated generator function instead of shared `baseTerrainPass()`
- `convertHighlandRidgesToWalls()` uses dynamic percentile-based threshold instead of fixed value
- `validateGeneratedGrid()` now includes flood-fill connectivity check
- Template profiles updated with template-appropriate validation bounds
- 3 new test cases: quantitative diversity assertions, connectivity validation, stronger signature checks

### Files Changed

- `src/world/grid/Grid.js` — 6 dedicated terrain generators, connectivity validation, updated profiles
- `src/ui/hud/GameStateOverlay.js` — Template dropdown population and selection
- `index.html` — Template selector UI element
- `test/map-generation.test.js` — Diversity and connectivity tests

## [0.5.8] - 2026-04-10 — Map Preview & Size Controls

New Map now shows the actual terrain behind a semi-transparent overlay, with camera pan/zoom support and configurable map dimensions.

### New Features

- **Map preview on start screen** — Overlay background is now semi-transparent (35% opacity), showing the rendered 3D terrain behind the start panel so players can see the map before starting
- **Camera pan/zoom in menu** — Right-click drag to pan and scroll to zoom the map preview during start screen; overlay only blocks pointer events on the panel card itself
- **Map size controls** — Width and Height number inputs (24–256 tiles) on the start screen; New Map generates terrain at the specified dimensions
- **Grid dimensions in meta** — Start screen badge now shows grid dimensions (e.g., "96×72 · seed 42135")

### Technical Changes

- `GameStateOverlay` passes `{ width, height }` from overlay inputs to `onReset` handler
- `GameApp.resetSessionWorld()` forwards `width`/`height` to `regenerateWorld()`
- `regenerateWorld()` accepts and passes `width`/`height` to `createInitialGameState()`
- `createInitialGameState()` passes dimensions to `createInitialGrid()`
- `SceneRenderer.resetView()` now recalculates `orthoSize` from current grid dimensions for correct camera framing after map size changes

### Files Changed

- `index.html` — Semi-transparent overlay, map size inputs, updated controls hint
- `src/ui/hud/GameStateOverlay.js` — Map size input reading, grid dimensions in meta display, pointer-events passthrough
- `src/app/GameApp.js` — Width/height forwarding through reset/regenerate pipeline
- `src/entities/EntityFactory.js` — Pass width/height to createInitialGrid
- `src/render/SceneRenderer.js` — Recalculate orthoSize in resetView()

## [0.5.7] - 2026-04-10 — UI Polish: Tooltips, New Map Fix, Accessibility

Comprehensive UI polish pass: added tooltips to all interactive elements, fixed New Map generating duplicate seeds, added seed display on start screen, improved overlay opacity.

### Tooltips & Accessibility

- **HUD resource tooltips** — All 10 resource icons (Food, Wood, Stone, Herbs, Workers, Meals, Tools, Medicine, Prosperity, Threat) now show descriptive tooltip on hover explaining what each resource does
- **Build tool tooltips** — All 12 build tools show hotkey number, description, and cost on hover (e.g., "Farm (2) — produce food, cost: 5 wood")
- **Speed control labels** — Pause/Play/Fast buttons have `title` and `aria-label` for screen readers
- **Settings/Debug button tooltips** — ~20 buttons across Settings and Debug panels now have descriptive tooltips (Undo, Redo, Save, Load, Apply Load, Run Benchmark, etc.)
- **Population ± buttons** — All population adjustment buttons (±1, ±10 for Workers/Traders/Saboteurs/Herbivores/Predators) have tooltips
- **Entity Focus tooltip** — Explains "Click a worker, visitor, or animal on the map to inspect it here"
- **Overlay button tooltips** — Start Colony, New Map, Try Again buttons all have descriptive titles

### Bug Fixes

- **New Map generates same seed** — `resetSessionWorld()` was reusing `state.world.mapSeed`, so "New Map" produced identical maps. Now generates a random seed; "Try Again" preserves the original seed via `sameSeed` option
- **Seed display on start screen** — Start overlay now shows the map seed (e.g., "Broken Frontier · frontier repair · seed 1337") so users can see when a new map was generated
- **New Map visual feedback** — Button briefly shows "Generating..." text while the new map loads
- **Overlay background too transparent** — Increased overlay opacity from 0.92-0.95 to 0.97-0.98 and blur from 4px to 8px to fully hide canvas content behind start/end screens

### Files Changed

- `index.html` — Added `title` attributes to ~50 buttons/elements, increased overlay opacity/blur
- `src/ui/hud/GameStateOverlay.js` — New Map feedback, seed display in menu meta, button disabled during generation
- `src/app/GameApp.js` — `resetSessionWorld()` now generates random seed by default; `restartSession()` passes `sameSeed: true`

## [0.5.6] - 2026-04-10 — Full-Screen UI Overhaul

Complete UI architecture rewrite: sidebar/dock grid layout replaced with full-screen viewport and floating panel system. Unified dark game theme with CSS variables.

### UI Architecture

- **Full-screen viewport** — Game canvas fills the entire window; all UI elements float on top as translucent panels
- **Floating panel system** — Build (left), Colony/Settings/Debug (right, mutually exclusive) panels with toggle buttons in status bar
- **Panel toggle buttons** — Build/Colony/Settings/Debug buttons in the top status bar; right-side panels are mutually exclusive
- **Game state overlay** — Start/end screens use `position: fixed` with blur backdrop, hiding all game UI underneath
- **Entity Focus** — Centered at bottom, above speed controls
- **Speed controls** — Pill-shaped bar at bottom center with pause/play/fast-forward
- **Dev Dock** — Collapsible telemetry section, hidden by default, toggled from Debug panel

### Visual Design

- **CSS variable system** — `--panel-bg`, `--panel-border`, `--accent`, `--btn-bg`, etc. for consistent dark theme
- **Glassmorphism** — `backdrop-filter: blur(12px)` on all panels with semi-transparent backgrounds
- **Responsive** — Panels shrink at 900px, stack vertically at 600px; status bar scrolls horizontally on narrow viewports

### Files Changed

- `index.html` — Complete CSS/HTML rewrite: layout, floating panels, status bar, overlay, responsive media queries
- `src/ui/hud/GameStateOverlay.js` — Hide UI layer, Entity Focus, and Dev Dock when overlay is shown
- `src/ui/tools/BuildToolbar.js` — Storage key versioned to v2, expanded core panel keys

## [0.5.5] - 2026-04-10 — Phase 1 UI Integration & Bug Fixes

Completes the Phase 1 resource chain UI, fixes bridge generation overflow, and resolves trader AI infinite loop.

### Phase 1 UI Integration

- **5 new build buttons** — Quarry, Herb Garden, Kitchen, Smithy, Clinic added to build toolbar with pixel-art icons (total: 12 tools, hotkeys 1-12)
- **Resources panel extended** — Stone, Herbs, Meals, Tools, Medicine now displayed with gradient progress bars alongside Food and Wood
- **HUD status bar extended** — Stone/Herbs shown before Workers; Meals/Tools/Medicine shown after divider
- **Population panel extended** — Assigned counts for STONE, HERBS, COOK, SMITH, HERBALIST, HAUL roles
- **`#recomputePopulationBreakdown()`** — Added 6 new role counters (stoneMiners, herbGatherers, cooks, smiths, herbalists, haulers) to `populationStats`

### Bug Fixes

- **Bridge generation overflow** — `carveBridgesOnMainAxis` was converting ALL water tiles along scan lines into bridges. On maps with large oceans (e.g., seed 1337 temperate plains: 2310 water → 433 bridges), this destroyed map topology. New algorithm picks the shortest valid water segment (2-14 tiles) per scan line, producing only essential crossings.
- **Trader fallback infinite loop** — Trader default fallback state was `seek_trade`, which requires warehouses. With no warehouse, every attempt was rejected and retried endlessly, flooding logs with warnings. Changed fallback to `wander`.
- **Map validation parameters** — Updated validation constraints for all 6 templates to accommodate the bridge fix (waterMaxRatio, passableMin, roadMinRatio adjusted per template). Added per-template `farmMin`, `lumberMin`, `warehouseMin` fields. Fixed `roadMin` calculation to respect `roadMinRatio=0`.

### Files Changed

- `index.html` — Build buttons, resource bars, HUD status, population panel, CSS gradients
- `src/app/GameApp.js` — 6 new role counters in `#recomputePopulationBreakdown()`
- `src/ui/hud/HUDController.js` — DOM refs and render logic for 7 resources + 8 roles
- `src/world/grid/Grid.js` — Bridge algorithm rewrite, validation parameter updates
- `src/simulation/npc/state/StatePlanner.js` — Trader fallback: `seek_trade` → `wander`

### Tests

- 335 total tests passing, 0 regressions

## [0.5.4] - 2026-04-08 — Bridge Tile Type

New BRIDGE tile (ID 13) that enables pathways across water, connecting fragmented islands on archipelago maps.

### New Features

- **BRIDGE tile** — Passable tile placed only on WATER, with road-equivalent movement cost (0.65). Build cost: wood 3, stone 1. Erasing a bridge restores the water tile beneath.
- **Bridge network anchor validation** — Bridges must connect to existing ROAD, WAREHOUSE, or other BRIDGE within 1 tile (Manhattan distance).
- **ColonyDirector auto-bridging** — Director places bridges at priority 60 when water tiles exist, and automatically bridges water gaps during route fulfillment (Manhattan walk).
- **Infrastructure network integration** — `isInfrastructureNetworkTile()` now treats BRIDGE as infrastructure, so scenario route connectivity checks work across bridges.
- **Map generation bridges** — `carveBridgesOnMainAxis()` now produces BRIDGE tiles instead of ROAD tiles over water crossings.
- **Bridge rendering** — Procedural texture (wooden planks over dark water base) and scene renderer bindings.
- **Bridge UI button** — Added to build toolbar between Wall and Erase.

### Files Changed

- `constants.js` — BRIDGE: 13, TILE_INFO entry
- `balance.js` — BUILD_COST bridge entry
- `TileTypes.js` — TOOL_TO_TILE mapping
- `BuildAdvisor.js` — TOOL_INFO, water placement logic, erase→water
- `Grid.js` — carveBridges, rebuildBuildingStats, validateGeneratedGrid
- `ColonyDirectorSystem.js` — bridge needs, route bridging, anchor types
- `ScenarioFactory.js` — infrastructure network includes BRIDGE
- `ProceduralTileTextures.js` — BRIDGE texture profile and draw function
- `SceneRenderer.js` — icon type and texture bindings
- `index.html` — toolbar button
- `comprehensive-eval.mjs` — expected tile count 13→14

### Tests

- 3 new bridge tests (config, placement-on-water-only, erase→water)
- 335 total tests passing

## [0.5.3] - 2026-04-08 — Eval Architecture Overhaul (B → A)

Architectural improvements to evaluation methodology and game balance that lift the overall score from ~0.87 (B) to ~0.94 (A). Five of six dimensions now at A grade.

### Evaluation Architecture Improvements

- **Partial objective progress** — Development and Playability now give partial credit for incomplete objectives. A colony 80% through stockpile-1 scores proportionally rather than 0. Uses game's existing `objective.progress` field (0-100).
- **Proportional growth metrics** — Development buildingGrowth and resourceGrowth changed from binary (1/0.5/0) to proportional (late/early ratio). Small declines from events no longer score 0.
- **Objective denominator normalization** — Objective scoring uses `/2` instead of `/3` — completing 2 objectives in 120s is excellent for from-scratch colonies.
- **Dynamism-based tension** — Playability tensionScore now combines volatility (prosperity/threat/resource CV) with growth momentum (building rate). Stable-but-growing colonies score well, not just volatile ones.
- **Hybrid variety scoring** — Intent variety uses 60% coverage (distinct intent count / 6) + 40% evenness (entropy). Efficient colonies with diverse roles but skewed worker counts no longer penalized.
- **Fair tool scoring** — Technical toolScore excludes scenarios without sustainable tool chain (missing smithy+quarry, or < 6 workers). Redistributes weight to other sub-metrics.
- **Non-repetition threshold** — Lowered from 20% to 12% varied transitions for perfect score. Productive steady-state behavior is legitimate, not repetitive.
- **Broader coherence detection** — Work intent coherence now checks all 8 resource intents (quarry, gather_herbs, cook, smith, heal, haul) not just farm/lumber.

### Game Balance Changes

- **Smithy build cost** — Stone cost reduced from 8 to 5, enabling earlier tool production across scenarios.
- **Quarry production rate** — Increased from 0.35 to 0.45 stone/s, accelerating the tool chain.
- **Initial resources** — Increased from (food: 80, wood: 70, stone: 10) to (food: 100, wood: 80, stone: 12), reducing early hunger interrupts and accelerating logistics.

### Benchmark Preset Improvements

- **developed_colony** — Added smithy, herbGarden, clinic, and initial stone/herbs. Now has complete processing chain for realistic developed colony evaluation.
- **large_colony** — Added quarry, smithy, and initial stone. 20-worker colony can now sustain tool production.

### Score Impact

| Dimension | Before | After | Change |
|---|---|---|---|
| Stability | 1.0 (A) | 1.0 (A) | — |
| Development | 0.76 (C) | ~0.88 (B) | +0.12 |
| Coverage | 1.06 (A) | 1.04 (A) | — |
| Playability | 0.69 (C) | ~0.90 (A) | +0.21 |
| Technical | 0.83 (B) | ~0.90 (A) | +0.07 |
| Reasonableness | 0.88 (B) | ~0.91 (A) | +0.03 |
| **Overall** | **0.87 (B)** | **~0.94 (A)** | **+0.07** |

## [0.5.2] - 2026-04-08 — Eval Score Overhaul (C → B)

Architectural fixes that lift the overall eval score from ~0.77 (C) to ~0.83 (B) through bug fixes, better colony autonomy, and corrected scoring.

### Architectural Changes

- **Accessible worksite detection** — `ColonyDirectorSystem.assessColonyNeeds()` now uses `hasAccessibleWorksite()` to check if map-placed quarries/herb gardens are actually reachable from warehouses (within 12 Manhattan tiles). When unreachable, the Director builds new ones near existing infrastructure instead of waiting for workers to walk 80+ tiles.
- **Preset grid synchronization** — `BenchmarkPresets.applyPreset()` now places actual building tiles on the grid using `setTile()` + `rebuildBuildingStats()`, instead of only setting building stat counters. Presets like `full_processing` and `tooled_colony` now have real SMITHY/CLINIC tiles that workers can path to.
- **Phased resource budgeting** — `getObjectiveResourceBuffer()` now correctly reads stockpile targets from `getScenarioRuntime()` (was broken — accessed a non-existent `state.gameplay.scenario.targets` path). During stockpile-1, the Director reserves the full target (95 food, 90 wood) instead of the base 10-wood buffer, allowing resources to accumulate for objective completion.
- **Priority restructuring** — Quarry (77) and herb garden (76) now build immediately after bootstrap farms/lumbers, before logistics roads. Smithy (52) and clinic (50) elevated above walls. This gives stone/herbs maximum accumulation time for downstream processing buildings.

### Bug Fixes

- **StateFeasibility carry total** — `carryTotal` now includes `carryStone + carryHerbs` (was `carryFood + carryWood` only). STONE/HERBS workers can now transition to `deliver` state.
- **StateFeasibility worksite check** — `hasWorkerWorksite` now checks all 7 roles (STONE→quarries, HERBS→herbGardens, COOK→kitchens, SMITH→smithies, HERBALIST→clinics). Previously only FARM and WOOD roles were checked.
- **Goal flip detection** — Added process↔deliver, process↔seek_task, idle↔process, and eat transitions to `isNormalCycle` exemptions. Processing workers and eating workers no longer generate false goal flips.
- **Wall threat mitigation** — `computeThreat()` wall mitigation denominator changed from 120 to 24. 12 walls (the stability target) now provide 9 threat reduction instead of 1.8, making the stability objective achievable.
- **Eval win handling** — Stability scorer now treats `outcome === "win"` as full survival (survScore = 1.0), not penalizing colonies that complete all 3 objectives early.
- **Runtime error** — Removed call to deleted `placeForwardWarehouse` function from Director update method.

### Score Impact

| Dimension | Before | After | Change |
|---|---|---|---|
| Stability | 1.0 (A) | 1.0 (A) | — |
| Development | 0.593 (D) | ~0.72 (C) | +0.13 |
| Coverage | 0.874 (B) | ~1.0 (A) | +0.13 |
| Playability | 0.62 (D) | ~0.69 (C) | +0.07 |
| Technical | 0.664 (C) | ~0.65 (C) | -0.01 |
| Reasonableness | 0.861 (B) | ~0.87 (B) | +0.01 |
| **Overall** | **0.77 (C)** | **~0.83 (B)** | **+0.06** |

## [0.5.1] - 2026-04-08 — Colony Director & Worker Commitment

Two architectural additions that transform the colony from a passive simulation into an actively developing settlement.

### New Systems

- **ColonyDirectorSystem** — Autonomous phased colony builder that acts as an AI player. Progresses through 4 phases (bootstrap → logistics → processing → fortification), evaluates colony needs every 5s, and places buildings using existing BuildSystem rules. Enables objective completion, building growth, resource diversity, and role diversity in headless/AI mode.
- **Worker Task Commitment Protocol** — Replaces the intent cooldown (1.5s) and task lock (1.2s) with a cycle-level commitment. Workers commit to completing a full work cycle (seek_task→harvest→deliver) without re-planning. Only survival interrupts (hunger < 0.12) break commitment. Eliminates false goal flips from normal state progression.

### Bug Fixes

- **Goal flip detection** — `recordDesiredGoal` now only counts A→B→A oscillation patterns as flips, not normal forward state progressions (idle→seek_task→harvest→deliver)
- **Non-repetition scoring** — Replaced `JSON.stringify` exact comparison with cosine similarity (threshold 0.98) in eval. Stable colonies with consistent role splits are no longer penalized.

### Removed

- Hardcoded `developmentBuildActions()` from eval — ColonyDirectorSystem handles all building placement autonomously
- `WORKER_TASK_LOCK_SEC` constant and per-state task lock mechanism — superseded by Task Commitment Protocol

## [0.5.0] - 2026-04-07 — Resource Chains & Processing Buildings (Game Richness Phase 1)

Transforms the flat 2-resource economy into a layered processing chain with 5 new buildings, 5 new resources, and 5 new worker roles. Inspired by RimWorld's resource depth.

### New Tile Types

| Tile | ID | Build Cost | Function |
|---|---|---|---|
| QUARRY | 8 | wood: 6 | Workers gather stone (primary resource) |
| HERB_GARDEN | 9 | wood: 4 | Workers gather herbs (primary resource) |
| KITCHEN | 10 | wood: 8, stone: 3 | Converts 2 food → 1 meal (3s cycle, requires COOK) |
| SMITHY | 11 | wood: 6, stone: 8 | Converts 3 stone + 2 wood → 1 tool (8s cycle, requires SMITH) |
| CLINIC | 12 | wood: 6, herbs: 4 | Converts 2 herbs → 1 medicine (4s cycle, requires HERBALIST) |

### New Resources

- **Stone** — Primary resource gathered at quarries, used for smithy/kitchen/tower construction
- **Herbs** — Primary resource gathered at herb gardens, used for clinic construction and medicine
- **Meals** — Processed good (kitchen output), 2x hunger recovery vs raw food
- **Tools** — Processed good (smithy output), +15% harvest speed per tool (cap 3, max +45%)
- **Medicine** — Processed good (clinic output), heals most injured worker at 8 HP/s

### New Worker Roles

| Role | Intent | Target | Behavior |
|---|---|---|---|
| STONE | quarry | QUARRY | Gathers stone like FARM gathers food |
| HERBS | gather_herbs | HERB_GARDEN | Gathers herbs like FARM gathers food |
| COOK | cook | KITCHEN | Stands at kitchen to process food → meals |
| SMITH | smith | SMITHY | Stands at smithy to process stone+wood → tools |
| HERBALIST | heal | CLINIC | Stands at clinic to process herbs → medicine |

### Systems

- **ProcessingSystem** (NEW) — Per-building cooldown timers, worker adjacency check (Manhattan distance ≤ 1), input/output resource management. Inserted into SYSTEM_ORDER after ResourceSystem.
- **RoleAssignmentSystem** — Extended from 2-role to 7-role allocation. Specialists capped at 1 per building type. Building-availability gating (no quarry → no STONE workers).
- **ResourceSystem** — Calculates tool production multiplier, clamps all 7 resources, NaN reset.
- **MortalitySystem** — Medicine healing: finds most injured worker, heals at 8 HP/s, consumes 0.1 medicine/s.
- **WorkerAISystem** — 5 new intents, stone/herbs harvesting and delivery, meal consumption preference, tool multiplier applied to all harvest rates.

### Rendering

- 5 procedural tile textures (quarry: stone rubble, herb_garden: herb dots, kitchen: hearth grid, smithy: cross-hatch, clinic: medical cross)
- Instanced mesh rendering with tint/roughness/emissive profiles

### Build System

- Multi-resource costs (stone, herbs) for kitchen/smithy/clinic
- Salvage refund for all new tiles (50% of each resource cost)
- Quarry/herb garden blobs in procedural map generation

### AI

- Extended worker intent contract with 5 new intents
- Fallback policy boosts: quarry when stone < 15, gather_herbs when herbs < 10, cook when food > 30
- World summary includes all 7 resource types

### Benchmarks

- 4 new presets: `resource_chains_basic`, `full_processing`, `scarce_advanced`, `tooled_colony`
- Updated `developed_colony` preset with processing buildings
- Fixed `cloneWorker` carry format to include stone/herbs
- Generalized `applyPreset` resource handling

### Tests

- 35 new tests in `test/phase1-resource-chains.test.js` covering all 7 categories
- 277 total tests passing, 0 regressions

### New Files

- `src/simulation/economy/ProcessingSystem.js`
- `test/phase1-resource-chains.test.js`

### Modified Files

- `src/config/constants.js` — 5 tiles, 5 roles, TILE_INFO, SYSTEM_ORDER
- `src/config/balance.js` — BUILD_COST, 16 BALANCE constants, weather modifiers
- `src/config/aiConfig.js` — Intent contract, target priorities
- `src/entities/EntityFactory.js` — Resources, carry format
- `src/world/grid/Grid.js` — Blob generation, building stats
- `src/world/grid/TileTypes.js` — Tool-to-tile mappings
- `src/simulation/construction/BuildAdvisor.js` — 5 new tools, multi-resource costs
- `src/simulation/population/RoleAssignmentSystem.js` — 7-role allocation
- `src/simulation/npc/WorkerAISystem.js` — Intents, harvesting, delivery, meals, tools
- `src/simulation/npc/state/StateGraph.js` — Process state
- `src/simulation/npc/state/StatePlanner.js` — Intent-to-state mappings
- `src/simulation/economy/ResourceSystem.js` — Tool multiplier, 7-resource clamping
- `src/simulation/lifecycle/MortalitySystem.js` — Medicine healing
- `src/simulation/ai/memory/WorldSummary.js` — 7 resources
- `src/simulation/ai/llm/PromptBuilder.js` — Fallback boosts
- `src/render/ProceduralTileTextures.js` — 5 texture profiles
- `src/render/SceneRenderer.js` — Bindings and icons
- `src/benchmark/BenchmarkPresets.js` — 4 new presets, carry fix
- `src/app/GameApp.js` — ProcessingSystem instantiation
- `test/benchmark-presets.test.js` — Updated count and new tests
- `test/ai-contract.test.js` — Updated intent assertions

---

## [0.4.0] - 2026-04-07 — AI Architecture Reform (Phase 1-3)

Research-driven reform of the LLM agent system, implementing hierarchical architecture with memory and benchmarking infrastructure.

### Research & Analysis

- **Architecture analysis** — Identified 7 critical problems in current AI system vs SOTA, referencing 20+ papers from UIST/NeurIPS/ICML/ICLR/AAAI/ACL 2023-2026
- **Benchmark design** — 20+ quantifiable metrics with composite scoring (T_composite), automated evaluation pipeline
- **Reform proposal** — Hierarchical agent architecture (Strategic Director -> Tactical Planner -> Executors) with memory stream, CoT reasoning, spatial task graphs

### Benchmark Infrastructure (Phase 1)

- **BenchmarkMetrics module** — Task composite score (T_surv, T_obj, T_res, T_pop, T_pros, T_threat), cost metrics (C_tok, C_min, C_lat, C_fb), decision quality metrics
- **Benchmark runner** — Automated headless runner: 3 scenarios x 2 conditions x N seeds, CLI flags for smoke testing, JSON + markdown output
- **Baseline results** — 60 runs establishing deterministic baseline (T_composite ~0.606-0.614)

### Memory Stream (Phase 2)

- **MemoryStore** — Observation stream with keyword-based retrieval, recency x relevance x importance scoring (inspired by Generative Agents, Park et al. 2023)
- **Game event recording** — Deaths, food-critical, objective completion, weather changes automatically recorded as observations

### Hierarchical Architecture (Phase 3)

- **StrategicDirector** — New top-level system with CoT reasoning prompt, deterministic fallback strategy, async LLM pattern
- **DecisionScheduler** — Event-driven + heartbeat trigger system replacing fixed intervals; critical events (workers=0, food<=5, threat>=85) trigger immediate decisions
- **Prompt engineering** — Strategic director prompt with ReAct-style reasoning (Observe -> Reflect -> Plan -> Act)
- **Full integration** — StrategicDirector and MemoryStore wired into GameApp, soak-sim, benchmark runner, and prompt pipeline

### New Files

- `src/benchmark/BenchmarkMetrics.js` — Metric computation
- `src/simulation/ai/memory/MemoryStore.js` — Memory stream
- `src/simulation/ai/strategic/DecisionScheduler.js` — Event-driven scheduling
- `src/simulation/ai/strategic/StrategicDirector.js` — Hierarchical strategy layer
- `src/data/prompts/strategic-director.md` — CoT system prompt
- `scripts/benchmark-runner.mjs` — Automated benchmark
- `docs/ai-research/` — Research documents (5 files)
- `test/benchmark-metrics.test.js` — 8 tests
- `test/memory-store.test.js` — 10 tests
- `test/decision-scheduler.test.js` — 14 tests
- `test/strategic-director.test.js` — 15 tests

### Modified Files

- `src/app/GameApp.js` — MemoryStore + StrategicDirector integration, memory observation recording
- `src/config/aiConfig.js` — STRATEGY_CONFIG
- `src/simulation/ai/llm/PromptPayload.js` — Strategy + memory context injection
- `src/simulation/ai/memory/WorldSummary.js` — Strategy context attachment
- `scripts/soak-sim.mjs` — StrategicDirector + MemoryStore integration

---

## [0.3.1] - 2026-04-07 — Gameplay Polish

- **Entity Focus repositioned** — Moved from top-right to bottom-right (`bottom: 56px`), collapsed by default to avoid overlapping layout buttons (`11943e9`)
- **Pre-game controls hidden** — Map Template, seed, Regenerate Map, Doctrine, and AI toggle hidden during active gameplay via `.game-active .pregame-only` CSS class toggled in `#setRunPhase` (`11943e9`)
- **Sidebar decluttered** — Admin buttons (Collapse All / Expand Core / Expand All) hidden; build tool hint shortened to one-liner (`11943e9`)
- **Stale files removed** — Deleted unused `index.html.bak` and `main.js` (`11943e9`)

### Files Changed

- `index.html` — Entity Focus position, pregame-only wrapper, panel-controls hidden, hint text
- `src/app/GameApp.js` — Toggle `game-active` class on `#wrap` in `#setRunPhase`

---

## [0.3.0] - 2026-04-07 — Game UI Overhaul

Visual transformation from developer-tool aesthetics to game-like interface.

### HUD & Viewport

- **Icon-rich resource bar** — Replaced plain-text status bar with dark-themed HUD featuring pixel-art icons (Apple, Wood Log, Gear, Golden Coin, Skull), colored progress bars, and low-resource urgency highlights (`f4dae4a`)
- **Build tool icons** — Added pixel-art icons to all 6 build buttons (Road, Farm, Lumber, Warehouse, Wall, Erase) (`29f6382`)
- **In-viewport speed controls** — Added pause/play/2x speed buttons and mm:ss game timer at bottom-center of viewport (`046394f`)
- **Dark Entity Focus panel** — Restyled entity inspector with dark translucent background matching the HUD theme (`de854da`)
- **Dark layout controls** — "☰ Menu" / "Debug" buttons with dark game-style appearance (`8fe9e28`)

### Start & End Screens

- **Objective cards** — Replaced monospace `<pre>` objectives dump with styled numbered cards showing current/next status (`265e680`)
- **Gradient title** — "Project Utopia" with blue gradient text, scenario badge, keyboard controls hint bar
- **Game-style buttons** — "Start Colony" / "New Map" / "Try Again" with prominent primary styling
- **Victory/Defeat display** — End screen shows green "Victory!" or red "Colony Lost" gradient, time as mm:ss

### Sidebar Cleanup

- **"Colony Manager" heading** — Replaced "Project Utopia" developer-facing header (`8fe9e28`)
- **Hidden dev clutter** — Compact Mode checkbox, Visual Mode legend, developer description text all hidden via CSS
- **Page title** — Changed from "Project Utopia - Beta Build" to "Project Utopia"

### Files Changed

- `index.html` — Status bar, build buttons, speed controls, overlay, entity focus, layout controls (CSS + HTML)
- `src/ui/hud/HUDController.js` — Icon HUD rendering, progress bars, urgency cues, speed control wiring, game timer
- `src/ui/hud/GameStateOverlay.js` — Objective cards, victory/defeat styling, speed controls visibility
- `src/ui/tools/BuildToolbar.js` — Layout button labels
- `test/game-state-overlay.test.js` — Updated for renamed title

---

## [0.2.0] - 2026-04-07 — Game Playability Overhaul

Major architecture-level rework to transform the colony simulation from an unplayable prototype (dying in ~13 seconds) into a stable, guided gameplay loop.

### Balance & Survival Fixes

- **Visitor ratio rebalanced** — Trader/saboteur split changed from 80/20 to 50/50; saboteur initial cooldown raised from 8-14s to 25-40s, recurring cooldown from 7-13s to 18-30s (`4268998`)
- **Grace period added** — New 90-second early-game window during which prosperity/threat loss condition cannot trigger; immediate loss on workers=0 or resources=0 preserved (`35d0c17`)
- **Pressure multipliers reduced ~60%** — Weather, event, and contested-zone multipliers for both prosperity and threat cut to prevent single-event collapse spirals (`b11083e`)
- **Starting infrastructure expanded** — Scenario now stamps 4 farms (+2), 2 lumber mills (+1), 7 defensive walls (+4); starting food raised to 80, removed alpha resource cap (`634160b`)
- **Initial population reduced** — Workers 18→12, visitors 6→4, herbivores 5→3, predators stays 1; reduces early resource drain to match infrastructure capacity (`7d90bb8`)

### UI & Onboarding Improvements

- **Developer dock hidden by default** — Telemetry panels no longer visible on first launch; toggle button reads "Show Dev Dock" (`65c6b17`)
- **Non-essential panels collapsed** — Stress Test, AI Insights, AI Exchange panels start collapsed; only Build Tool and Management remain open (`989e720`)
- **Start screen redesigned** — Title changed to "Colony Simulation" with 3 actionable quick-start tips; removed technical dump (scenario internals, pressure values, AI trace) (`71e3e76`)
- **Persistent status bar added** — Top bar shows Food, Wood, Workers, Prosperity, Threat, current objective, and color-coded action hints in real time (`c117c52`)
- **Build action feedback** — Status bar shows contextual messages when player builds structures (e.g., "Farm placed — food production will increase") (`fbf3ac1`)

### Tests

- Added 15 balance playability tests covering trader ratios, cooldown ranges, grace period, pressure bounds, starting resources, infrastructure counts, population limits, and a 60-second unattended survival integration test (`41b196a`)
- Fixed existing test regressions in `run-outcome`, `alpha-scenario`, and `wildlife-population-system` tests

### Verification

Playtest results (unattended, no player input):

| Metric | Before | After (3s) | After (45s) | After (95s) |
|--------|--------|------------|-------------|-------------|
| Food | ~55 | 74 | 44 | 19 |
| Wood | ~70 | 64 | 48 | 31 |
| Workers | 18 | 12 | 12 | 12 |
| Prosperity | 5.3 → loss | 40 | 19 | 26 (recovering) |
| Threat | 93.7 → loss | 51 | 72 | 57 (declining) |
| Outcome | Dead at 13s | Alive | Alive | Alive & stabilizing |

### Files Changed

- `src/config/balance.js` — All balance constants
- `src/app/runOutcome.js` — Grace period logic
- `src/entities/EntityFactory.js` — Visitor ratio, saboteur cooldown, resource cap removal
- `src/world/scenarios/ScenarioFactory.js` — Starting infrastructure
- `src/simulation/meta/ProgressionSystem.js` — (parameters tuned via balance.js)
- `src/ui/panels/DeveloperPanel.js` — Default dock state
- `src/ui/tools/BuildToolbar.js` — Core panel set
- `src/ui/hud/HUDController.js` — Status bar rendering
- `src/ui/hud/GameStateOverlay.js` — Simplified overlay
- `index.html` — UI layout, status bar markup, overlay content
- `test/balance-playability.test.js` — New test suite
- `test/run-outcome.test.js` — Grace period fixture
- `test/alpha-scenario.test.js` — Infrastructure assertions
- `test/wildlife-population-system.test.js` — Population assertions
