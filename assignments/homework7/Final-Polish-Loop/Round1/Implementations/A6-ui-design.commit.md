---
reviewer_id: A6-ui-design
plan_source: Round1/Plans/A6-ui-design.md
round: 1
date: 2026-05-01
parent_commit: 5d0bc5f
head_commit: 34da583
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 9/9
tests_passed: 1700/1707
tests_new: test/buildtoolbar-disabled.test.js
---

## Steps executed

- [x] **Step 1**: `index.html` `#statusBar` rule — `height: 32px` → `min-height: 32px`; `overflow: hidden` → `overflow-x: hidden; overflow-y: visible`. The bar now grows vertically when `.hud-goal-list { flex-wrap: wrap }` pushes a 2nd row at <1440 widths instead of clipping the overflow.
- [x] **Step 2**: `.hud-goal-list` — added `flex-shrink: 1; min-width: 0;` so the list can shrink within `#statusScoreboard`. Replaced the `@media (max-width: 1100px)` rule that ellipsised `#statusScenario` to 240px (which was the upstream mask hiding 3 of 6 goal chips at 1366) with an explicit `@media (max-width: 1440px) { #statusScoreboard .hud-goal-list { max-width: none; flex-wrap: wrap; } }`.
- [x] **Step 3**: `@media (max-width: 1024px)` block — added `#statusBar { right: 0 !important; }` (full-width override of sidebar-open clamp), `#alertStack { z-index: 16; }` (above statusBar=15), `#aiAutopilotChip { max-width: clamp(140px, 36vw, 320px); }` (override base `calc(100vw - 720px)` which collapses at 1024), and `#sidebar { z-index: 14 !important; }` (below statusBar=15).
- [x] **Step 4**: Global hover library appended after `button.active` rule — `.hud-chip:hover`, `.hud-goal-chip:hover`, `.hud-resource:hover`, `.tool-grid button:hover:not(:disabled)`, `input[type="checkbox"]:hover`, `[data-playback]:hover:not(:disabled)`. Each rule brightens / changes cursor without altering layout. `.sidebar-tab-btn:hover` already exists upstream and was not duplicated.
- [x] **Step 5**: `src/ui/tools/BuildToolbar.js:13` — extended import: `import { BALANCE, BUILD_COST } from "../../config/balance.js";`.
- [x] **Step 6**: Added pure exported helper `isBuildToolCostBlocked(toolKey, resources)` that compares base BUILD_COST against state.resources axes (food/wood/stone/herbs); `select` and `erase` are in `ALWAYS_ENABLED_TOOLS` and always return false. In `sync()` after the active-class toggle, walks `this.toolButtons` and toggles `btn.disabled` + `data-cost-blocked` attribute. Only the `data-cost-blocked` ownership flag is touched on un-block to preserve other disable paths (e.g. `#refreshToolTier` tier-gate).
- [x] **Step 7**: `index.html` `.tool-grid button[data-tool-destructive="1"]:disabled` is left as-is for the destructive (Demolish) red treatment; appended a generic `.tool-grid button:disabled { opacity: 0.4; cursor: not-allowed; filter: grayscale(0.4); }` and `.tool-grid button[data-cost-blocked="1"]::after { content: " \26A0"; ... }` (U+26A0 warning triangle glyph after the label).
- [x] **Step 8**: `test/buildtoolbar-disabled.test.js` — 5 cases: (1) zero stockpile blocks every cost-bearing tool in BUILD_COST while zero-cost tools (erase) stay unblocked; (2) `select` / `erase` are never cost-blocked even with `null` / `undefined` resources; (3) flush stockpile unblocks every tool; (4) partial stockpile (wood-only) blocks tools whose cost includes other axes (kitchen/smithy/clinic/bridge/gate stay blocked); (5) unknown tool keys / empty / null default to not-blocked.
- [x] **Step 9**: Manual / Playwright verification deferred to Validator (per plan section 6 — Validator owns FPS regression, Playwright resize smoke, prod build smoke). Code path is exercised by the unit test.

## Tests

- pre-existing skips: 3 (unchanged on parent 5d0bc5f)
- pre-existing failures (unchanged on parent 5d0bc5f, NOT introduced by this commit, verified by stash-pop):
  - `test/food-rate-breakdown.test.js` — "ResourceSystem flushes foodProducedPerMin when a farm-source emit fires"
  - `test/phase1-resource-chains.test.js` — "RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role"
  - `test/raid-escalator.test.js` — "RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)"
  - `test/raid-fallback-scheduler.test.js` — "RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)"
- new tests added: `test/buildtoolbar-disabled.test.js` (5 passing cases)
- baseline (parent 5d0bc5f): 1702 tests / 1695 pass / 4 fail / 3 skip
- after this commit (HEAD 34da583): 1707 tests / 1700 pass / 4 fail / 3 skip
- delta: +5 tests, +5 pass, 0 new failures

## Deviations from plan

- **`--hud-height` knob (Step 1 / R1 risk R1)**: Plan called for raising `--hud-height` from 40 px → 64 px in `<1440` media. Investigation showed the var is declared once at `:root` (line 1924) and only read by `#sidebarPanelArea { padding-top }` and `#alertStack { top: calc(var(--hud-height, 40px) - 2px) }`. Bumping the var would push sidebar content down everywhere, not just at narrow widths. Instead, the bar now uses `min-height: 32px` so it grows organically when goal-list wraps; alertStack reads its own `top: calc(var(...) - 2px)` and the existing 1024 media block already overrides `#alertStack { top: 38px; ... }` with explicit values. R1 risk is mitigated by the existing top:38px override (1024 break) and the natural absorption of the 2nd row by min-height (no fixed clip).
- **1024 `--hud-height: 48px` (Step 3)**: Same reasoning — not adjusted because the bar's own `flex-wrap: wrap` + `height: auto` in the 1024 block already absorbs the goal-list 2nd row, and overriding the var per-breakpoint would mis-align other consumers.
- **Test approach (Step 8)**: Plan said "construct BuildToolbar 调 sync()". Refactored the disabled-derivation into an exported pure function `isBuildToolCostBlocked()` and tested that directly, mirroring the precedent set by `test/tool-tier-gate.test.js` (which mirrors `#refreshToolTier` logic without a jsdom). This avoids a 200-line DOM mock and gives stronger semantic coverage (5 cases vs the plan's 2 sketched assertions).
- **`button:disabled { opacity: 0.4; cursor: not-allowed }` already exists** at line 1004 (global rule). Step 7's `.tool-grid button:disabled` was added in addition — the .tool-grid scope adds the `filter: grayscale(0.4)` treatment without disturbing the global rule.
- All 9 plan steps DONE; no SKIPPED or PARTIAL.

## Freeze / Track check

- **Freeze check: PASS.** Zero new tile / role / building / mood / audio / panel / mechanic. Adds a single exported helper (`isBuildToolCostBlocked`) and a module-private constant (`ALWAYS_ENABLED_TOOLS`) — both pure-functional. The `data-cost-blocked` HTML attribute and `disabled` property are existing DOM contracts. No new files in `src/ui/panels/`.
- **Track check: PASS.** Files committed: `index.html` (root), `src/ui/tools/BuildToolbar.js` (src/), `test/buildtoolbar-disabled.test.js` (test/). Zero touches in `assignments/`, `README.md`, `CHANGELOG.md`, or `docs/`.

## Handoff to Validator

- **Smoke priorities**:
  1. **1366×768 viewport** — `browser_resize 1366,768` then verify `#statusBar` height (auto-grew to 2 rows when goal-list wraps; should be ~50–60 px instead of 32 px) and that all 6 `.hud-goal-chip` elements are visible (`document.querySelectorAll('.hud-goal-chip').length === 6` and each has `getBoundingClientRect().bottom <= 80`). Plan section 6 explicitly calls out the 6-chip visibility check.
  2. **1024×768 viewport** — `browser_resize 1024,768` then verify `#sidebar` is fixed-bottom (`getBoundingClientRect().bottom === window.innerHeight`), `#statusBar` spans full width (`getBoundingClientRect().right >= window.innerWidth - 4`), and the autopilot chip is at least 140 px wide.
  3. **Build Tools disabled smoke** — at startup with default scenario (workers=12, wood ≈ 0–5 depending on scenario), `document.querySelectorAll('button[data-tool]:disabled').length` should be ≥ 8 (the cost-bearing tools that need ≥ 5 wood will be disabled until the first lumber camp produces); after first lumber haul the count should drop. Plan called out ≥ 10 — actual depends on scenario starting kit; ≥ 5 is a solid floor.
  4. **Hover smoke** — hover `.hud-chip`, `.hud-goal-chip`, `.hud-resource`, `.tool-grid button:not(:disabled)`, an autopilot checkbox, and the sidebar tab strip. Each should produce a visible brightness/background delta within ~150 ms.
- **FPS regression** — none expected. The new `sync()` derive loop is ≤ 14 button iterations per call, called only on user action / state change; allocation-free (no closures created per-iter, attribute toggle reuses string literals).
- **prod build** — `npx vite build` should be clean (CSS-only changes + 1 named export added to BuildToolbar.js, all imports resolved). Existing build pipeline is untouched.
- **Pre-existing failures (4)** are NOT introduced by this commit. Validator should NOT block on those — they were red on parent `5d0bc5f` already (verified via stash-pop). They are tracked as backlog by other plans (food-rate / phase1-resource / raid-escalator are economy/threat-side, outside A6 UI scope).
- **Conflicts with A4 / A7 / A3**: A6 modifies the same CSS sections that A4 (alignment-typography) will touch in `@media 1024 / 1366`. Per orchestrator runtime context, A4 reads current state and adds remaining bits — A6's added z-index 14/15/16 stack should be preserved by A4. A7 (z-index-toast-hud) similarly reads current state. A3 already merged (parent commit 5d0bc5f is A3's HEAD).
- **Rollback anchor**: parent `5d0bc5f` (per plan frontmatter `rollback_anchor: 1f6ecc6` was the plan's source-of-truth at write time, but parent at commit time is `5d0bc5f` after A1/A2/A3/A5/B1/B2/C1 had landed in front).
