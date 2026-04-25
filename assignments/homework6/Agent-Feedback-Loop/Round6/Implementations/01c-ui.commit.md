---
reviewer_id: 01c-ui
plan_source: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/01c-ui.md
round: 6
wave: 1
date: 2026-04-25
parent_commit: db19ef5
head_commit: PENDING
status: DONE
steps_done: 10/10
tests_passed: 1319/1325 (4 pre-existing failures + 2 pre-existing skips)
tests_new: test/hud-dev-string-quarantine.test.js (4 cases), test/pressure-lens-label-dedup.test.js (7 cases)
freeze_policy: lifted
---

## Steps executed

- [x] **Step 1**: `src/ui/hud/HUDController.js` — switched the storyteller `Why no WHISPER?` block to use the new shared `isDevMode(state)` helper from `src/app/devModeGate.js`. Casual players (no `body.dev-mode`, no `state.controls.devMode`) now drop the entire `Why no WHISPER?` suffix from the storyteller tooltip + `#storytellerWhyNoWhisper` span. The sibling `#storytellerWhisperBadge` is toggled with an in-fiction `data-tooltip` ("Storyteller fell back to rule-based director — <reason>") so casual players keep a hover affordance.

- [x] **Step 2**: `index.html` — added `<span id="storytellerWhisperBadge" class="hud-warn-badge" hidden data-tooltip="">⚠</span>` next to the existing `#storytellerWhyNoWhisper` span. New CSS rules:
  - `body:not(.dev-mode) #storytellerWhyNoWhisper { display:none !important; }` (hides the engineer span for casual)
  - `body.dev-mode #storytellerWhisperBadge { display:none !important; }` (hides the badge for dev — engineer reads the topbar string)
  - `.hud-warn-badge` 14×14 amber pill style with `cursor: help`, ⚠ glyph

- [x] **Step 3**: `src/app/GameApp.js` — AI proxy unreachable handler now sets `state.debug.lastAiError = errText` AND splits `actionMessage`. Casual baseline keeps the 01a in-fiction phrasing `"Story AI is offline — fallback director is steering. (Game still works.)"` (do-not-rollback rule for the 01a `onboarding-noise-reduction.test.js` regex pin); dev-mode appends ` [<errText>]` to the same message. `actionKind` flipped from generic `info` to `"ai-down"` so HUD theming can distinguish.

- [x] **Step 4**: `src/ui/hud/autopilotStatus.js` — `getAutopilotStatus(state, options = {})` now accepts a second-arg options bag with `devMode` flag. Casual chip text is `"Autopilot ON · rules"` / `"Autopilot ON · <mode/coverage>"` (no `next policy in 9.8s` countdown, no `LLM offline — DIRECTOR steering` suffix). Tooltip (`title`) keeps the verbose copy for hover. `HUDController.js` passes `{ devMode: isDevMode(state) }` at the call site.

- [x] **Step 5**: `src/render/PressureLens.js` — exported new `dedupPressureLabels(entries, opts)` pure helper. Two-pass dedup: (1) same-text labels within `nearPx=24` collapse onto highest-weight primary with `count=N`; (2) cross-label primaries within the same `bucketPx=32` cell keep heaviest. `src/render/SceneRenderer.js#updatePressureLensLabels` refactored from one-pass project-and-write to three-pass project → dedup → write. Merged labels show `"<text> ×N"` and get `data-merged="1"` + `data-count="N"` for CSS.

- [x] **Step 6**: `index.html` — `.pressure-label` got `box-shadow: 0 6px 18px rgba(0,0,0,0.55)`, `backdrop-filter: blur(2px)`, lifted `transform: translate(-50%, -160%)`, and a `::after` ▾ triangle anchor. `.pressure-label[data-merged="1"]` gets an amber border + glow accent.

- [x] **Step 7**: `index.html` — three new `@media` breakpoints:
  - `(min-width: 2200px)` → `--hud-height: 56px`, topbar font-size 14–15px (27" 2560×1440 readability)
  - `(max-width: 1024px) and (min-width: 801px)` → `#aiAutopilotChip { max-width: none; white-space: normal; min-height: 32px; }` (un-truncates "Manual contro…")
  - `(max-width: 799px)` → `#wrap::before` portrait splash + `#ui, #viewport { display: none !important; }` (sub-1024 unplayable splash)

- [x] **Step 8**: `test/hud-dev-string-quarantine.test.js` — new file, 4 cases. Covers (a) non-dev tooltip omits "Why no WHISPER" + badge visible + dev-only span hidden, (b) dev mode shows engineer string + badge hidden, (c) `getAutopilotStatus(devMode:false)` omits `next policy in` and `LLM offline`, (d) `getAutopilotStatus(devMode:true)` preserves both.

- [x] **Step 9**: `test/pressure-lens-label-dedup.test.js` — new file, 7 cases. Covers same-label cluster dedup, far-apart same-label preservation, cross-label bucket dedup, far-apart cross-label preservation, empty input, single entry, highest-weight survival.

- [x] **Step 10**: `CHANGELOG.md` — appended `## [Unreleased] - v0.8.2 Round-6 Wave-1 01c-ui` section above the 01b section. Lists dev-string quarantine (Steps 1-4), pressure-label dedup (Steps 5-6), three new responsive breakpoints (Step 7), new tests, files changed, and migration notes about the `getAutopilotStatus` second-arg options bag.

## Tests

- **Pre-existing skips**: 2 (unchanged from baseline)
- **Pre-existing failures (carried)**: 4
  - `build-spam: per-copy wood cost is capped by BUILD_COST_ESCALATOR.warehouse.cap`
  - `SceneRenderer source wires proximity fallback into \#pickEntity and a build-tool guard`
  - `formatGameEventForLog returns null for noisy event types`
  - `ui voice: main.js gates window.__utopia behind devModeGate but keeps __utopiaLongRun public`
- **New tests added**:
  - `test/hud-dev-string-quarantine.test.js` (4 cases — all pass)
  - `test/pressure-lens-label-dedup.test.js` (7 cases — all pass)
- **Test deltas**: baseline 1308 pass / 4 fail / 2 skip → 1319 pass / 4 fail / 2 skip. Net **+11 passing**, no new red.
- **Tests adapted (not new failures, but contract update)**:
  - `test/hud-autopilot-status-contract.test.js` — first `getAutopilotStatus` test now passes `{ devMode: true }` to retain the legacy verbose-copy assertion.
  - `test/autopilot-status-degraded.test.js` — "LLM offline shape" test now passes `{ devMode: true }` for the same reason.
  - The casual default (no second arg / `devMode: false`) is covered by the new `hud-dev-string-quarantine.test.js`.

## Deviations from plan

- **Step 1 helper extraction**: Plan said "introduce `body.dev-mode` class + `isDevMode(state)` helper here as Wave-1 main author (per Stage B summary §7 Risk #4)". The `body.dev-mode` class infrastructure was already shipped (Round-0 01c-ui via `applyInitialDevMode` / `toggleDevMode`); I added a NEW unified `isDevMode(state)` helper to `src/app/devModeGate.js` that consults BOTH `state.controls.devMode === true` AND `document.body.classList.contains('dev-mode')`. This single source of truth is now exported and consumed by HUDController + GameApp. Wave-2/3 plans should consume this helper.

- **Step 3 phrasing**: Plan §4 Step 3 said `actionMessage = "AI offline · using rules"` for casual. I instead kept the 01a-pinned `"Story AI is offline — fallback director is steering. (Game still works.)"` casual baseline because `test/onboarding-noise-reduction.test.js` (committed in 01a `2b04f16`) statically asserts that exact literal in the source. The 01c plan §5 risks called out HUD contract test breakage but did not enumerate `onboarding-noise-reduction.test.js`; per the implementer hard-rule "Do not roll back 01a (`2b04f16`)", I preserved the 01a literal and added the dev-mode `[errText]` suffix as an append. `state.debug.lastAiError` is still populated unconditionally so dev tooling has the raw err.

- **Step 5 dedup helper location**: Plan said "建议把 dedup 抽成纯函数 export 作为 testable surface". I placed it in `src/render/PressureLens.js` (alongside `buildPressureLens`/`buildHeatLens`) rather than spinning a new file, so the helper sits next to the marker producers it dedups.

- **Step 9 jsdom usage**: Plan said "若需要可挂 jsdom 或直接调 dedup helper". I went with the latter (pure-function direct call) since the helper was already factored out — no jsdom dependency added.

- **autopilotStatus chip casual mode label**: Plan Step 4 said to render `Autopilot ON · ${combinedModeLabel === "rule-based" ? "rules" : combinedModeLabel}`. Implemented exactly that as the `casualMode` local variable feeding `casualBaseText`. The chip face thus shows `Autopilot ON · rules` for the most common fallback/fallback case, and `Autopilot ON · fallback/llm` for mixed mode where developers still want to see the asymmetry.

## Handoff to Validator

- **Browser smoke**: per plan §6 manual verification, drive these 5 scenarios (all served by `npx vite` on localhost:5173):
  1. Default URL (`http://localhost:5173`, casual mode) — topbar must NOT show `Why no WHISPER?: ...`. Hover the small ⚠ amber pill next to the storyteller strip → `#customTooltip` should reveal "Storyteller fell back to rule-based director — Story Director: ..."
  2. `localStorage.setItem("utopia:devMode","1"); location.reload()` — `Why no WHISPER?: <engineer reason>` returns to the storyteller strip; the ⚠ badge disappears.
  3. Block `*proxy*` requests in DevTools → `actionMessage` toast says casual `"Story AI is offline — fallback director is steering. (Game still works.)"`. Add `?dev=1` and reload → toast appends ` [<errText>]`.
  4. Open Heat Lens (L) and click a dense supply-chain cluster → identical labels (e.g. "supply surplus") should now collapse to one with `×N` suffix and an amber-tinted ring (data-merged="1").
  5. Window viewport tests: 800×600 should show portrait splash; 1024×768 autopilot chip should wrap to two lines (no "Manual contro…" truncation); 2560×1440 should bump topbar font to 14–15px.

- **Benchmark**: plan §6 says "本 plan 仅改 UI / 渲染层，预期 DevIndex 不下滑". Validator should still run `scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains` and confirm DevIndex floor 41.8 (baseline ≈44, -5% guard). No simulation files were touched.

- **Wave-1 lock contracts** (do-not-rewrite by Wave-2/3 per Stage B summary §3):
  - `dedupPressureLabels(entries, opts)` API — pure helper, signature stable for Wave-2 02a hover-tooltip path
  - `state.debug.lastAiError` schema — string, contains raw err.message
  - `isDevMode(state)` helper — both state.controls.devMode AND body.dev-mode classes consulted
