# Changelog

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
