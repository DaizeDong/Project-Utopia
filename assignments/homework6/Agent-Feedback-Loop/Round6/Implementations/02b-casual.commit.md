---
reviewer_id: 02b-casual
plan_source: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/02b-casual.md
round: 6
date: 2026-04-25
parent_commit: 87fa17b
head_commit: PENDING
status: DONE
steps_done: 10/10
tests_passed: 1337/1343
tests_new:
  - test/casual-shortcut-resolver-f1.test.js
  - test/heat-lens-halo-suppressed.test.js
  - test/casual-jargon-strings.test.js
---

## Steps executed

- [x] **Step 1**: `src/app/shortcutResolver.js` — added F1 / Shift+/ / bare `?` branches resolving to `{ type: "openHelp" }` in **every** phase (active / menu / end). Critical: returns non-null in menu so `#onGlobalKeyDown` can call `event.preventDefault()` and prevent browser refresh.
- [x] **Step 2**: `src/app/GameApp.js#onGlobalKeyDown` — added defensive `event.preventDefault()` for any F1 key (runs before the resolver) plus new `if (action.type === "openHelp")` branch that delegates to `window.__utopiaHelp.open()` (the modal lives in `index.html`).
- [x] **Step 3**: `src/app/GameApp.js#startSession` — added blur loop over `#overlayMapTemplate`, `#mapTemplateSelect`, `#doctrineSelect`, plus a defensive `document.activeElement.matches(...)` check. Whitelist-scoped — does NOT blanket-blur unrelated focus.
- [x] **Step 4**: DONE-by-predecessor (01a). `src/render/SceneRenderer.js#updatePressureLensLabels` already pushes `null` into the projection array when `labelText === ""`. Reaffirmed via static-source assertion in `test/heat-lens-halo-suppressed.test.js`.
- [x] **Step 5**: DONE-by-predecessor (01a). `src/render/PressureLens.js:552` already emits `label: ""` for halo markers. Reaffirmed via runtime assertion in `test/heat-lens-halo-suppressed.test.js` ("buildHeatLens emits halo markers with empty-string label").
- [x] **Step 6**: `src/ui/hud/GameStateOverlay.js#formatHeatLensUseCase` — replaced "red means surplus is trapped and blue means the first bottleneck is starving input" with "red tiles = stuff piling up unused. Blue tiles = a building waiting on input.". Comment was carefully rephrased to NOT contain the forbidden substrings (the test scans the whole source file).
- [x] **Step 7**: `src/world/scenarios/ScenarioFactory.js` — softened `temperate_plains.summary`, `temperate_plains.openingPressure`, `temperate_plains.hintInitial`, and the frontier-repair `objectiveCopy.logisticsDescription`. Mechanical anchors / route IDs / target counts UNCHANGED. Title "Broken Frontier" preserved (pinned by `scenario-voice-by-template.test.js`). Other 5 templates not touched (out of scope for this plan).
- [x] **Step 8**: DONE-by-predecessor (01a + 01c). The "Story AI offline — fallback director is steering. (Game still works.)" wording is pinned by `test/onboarding-noise-reduction.test.js` (do-not-rollback rule). 01c added `state.debug.lastAiError = errText` + dev-mode `actionMessage` append. The 02b plan's "Heads-up: ..." copy is superseded; per Stage B summary §2 D1 the casual phrasing is already in place.
- [x] **Step 9**: DONE-by-predecessor (01c). The `Why no WHISPER?` DOM-write at `HUDController.js:1051-1091` is already gated behind `isDevMode(state)` (the `body.dev-mode` quarantine). Casual players see the friendly `#storytellerWhisperBadge` ⚠ tooltip instead.
- [x] **Step 10**: `src/ui/panels/EntityFocusPanel.js#renderWorkerList` — lowercase mood label `"peckish"` → `"a bit hungry"`. The capital-P "Peckish" Hunger row in the entity-detail template is INTENTIONALLY left unchanged because `test/entity-focus-player-view.test.js` pins the literal "Peckish" — only the worker-list rollup is rewritten here.

## Tests

### Pre-existing skips / failures (baseline, NOT caused by this work)
Verified by stashing all 02b changes and re-running on parent state:
- not ok 147 — `build-spam: per-copy wood cost is capped by BUILD_COST_ESCALATOR.warehouse.cap`
- not ok 348 — `SceneRenderer source wires proximity fallback into #pickEntity and a build-tool guard`
- not ok 364 — `formatGameEventForLog returns null for noisy event types`
- not ok 916 — `ui voice: main.js gates window.__utopia behind devModeGate but keeps __utopiaLongRun public`

### New tests added
- `test/casual-shortcut-resolver-f1.test.js` — 8 cases (F1 / openHelp resolution + edge cases incl. Ctrl+F1 not swallowed).
- `test/heat-lens-halo-suppressed.test.js` — 3 cases (Step 4 + Step 5 reaffirmation).
- `test/casual-jargon-strings.test.js` — 7 cases (forbidden-substring net + new casual phrasing positive assertions).

All 18 new tests pass. Net: +18 passes, 0 new failures.

### Failures resolved during iteration
- Initial run: `casual-jargon-strings.test.js` test "Plan-required forbidden tokens absent" failed because my Step 6 source comment quoted the old jargon ("surplus is trapped" / "starving input") in the rationale. Fixed by rephrasing the comment to describe the change without quoting the literal forbidden substrings. The user-facing string was unaffected.

## Deviations from plan

- **Step 8 superseded by predecessor**: Plan §4 Step 8 specifies the "Heads-up: smart AI is offline (no key)..." / "Heads-up: couldn't reach the smart AI..." actionMessage strings. 01a Step 3 in `2b04f16` landed the equivalent "Story AI offline — fallback director is steering. (Game still works.)" / "Story AI is offline — fallback director is steering. (Game still works.)" wording, and `test/onboarding-noise-reduction.test.js` pins the 01a-shaped strings as a do-not-rollback rule. Per Stage B summary §2 D1 ("LLM 错误文案 Wave-1 由 02b 主笔（最 casual 友好）") the casual outcome is achieved; only the exact wording differs. Kept 01a's strings to avoid breaking the existing test contract.
- **Step 9 already done by 01c**: Plan §4 Step 9 specifies a `state.debug?.devMode === true` gate. 01c implemented the equivalent via `isDevMode(state)` (which inspects both `state.controls.devMode` and `body.dev-mode`). Marked DONE-by-predecessor.
- **Step 4 / Step 5 already done by 01a**: The halo `label=""` (Step 5) and the empty-label suppression branch in SceneRenderer (Step 4) shipped in 01a `2b04f16`. Marked DONE-by-predecessor; new test reaffirms the contract for 02b's regression net.

## Handoff to Validator

- **Manual smoke priorities** (per plan §6):
  1. On menu, press **F1** — Help modal opens, page does NOT reload, URL unchanged.
  2. Click **Start Colony**, then press **3** — Lumber tool selected, URL unchanged (no `?template=...` change).
  3. Toggle **Heat Lens** (L) — red/blue tile pulses visible, NO "halo" text labels on secondary tiles.
  4. Hover an idle worker in the worker list — status row reads "a bit hungry" instead of "peckish".
  5. With `VITE_AI_PROXY` unset, confirm HUD action message reads "Story AI is offline — fallback director is steering. (Game still works.)" (NOT "AI proxy unreachable (timeout)").
  6. Heat Lens overlay help line on the menu briefing reads "Heat Lens: red tiles = stuff piling up unused. Blue tiles = a building waiting on input." (NOT "surplus is trapped" / "starving input").
- **Benchmark gate**: `scripts/long-horizon-bench.mjs` is NOT edited by this plan (freeze constraint respected). Run the 4-seed gate (seeds 42 / 1337 / 2025 / 8675309 OR — per Round-6 §3 D3 — the unified seeds 42 / 7 / 9001 / 123 on `temperate_plains`). DevIndex must not drop more than 5% vs baseline (≈44 from CLAUDE.md). This change is text + UX-handler only; expect ≤1% noise.
- **Wave-1 lock list to enforce going forward** (per Stage B summary §3): `PressureLens.js:409` halo label, SceneRenderer dedup helper API, `storytellerStrip.js` whisperBlockedReason main string + dev field, GameApp LLM error wording + `state.debug.lastAiError` schema, **shortcutResolver registered keys (KeyR / F1 / Slash / Space)** — Wave-2/3 may only `append` (e.g. `[` / `]` for 02c speedrunner), NOT rewrite.
- **CHANGELOG updated**: New "v0.8.2 Round-6 Wave-1 02b-casual" section prepended to `CHANGELOG.md`.
