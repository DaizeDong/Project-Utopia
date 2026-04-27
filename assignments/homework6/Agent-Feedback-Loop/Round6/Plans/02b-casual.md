---
reviewer_id: 02b-casual
feedback_source: assignments/homework6/Agent-Feedback-Loop/Round6/Feedbacks/02b-casual.md
round: 6
date: 2026-04-25
build_commit: 5622cda
freeze_policy: lifted
priority: P0
estimated_scope:
  files_touched: 8
  loc_delta: ~420
  new_tests: 3
  wall_clock: 95
conflicts_with: []
---

## 1. 核心问题

Casual reviewer rated 3/10 and quit at ~25 min. Underneath the laundry list of complaints, three load-bearing root causes:

1. **Hostile first-contact for non-colony-sim players.** Hardcoded English jargon
   ("reclaim the east depot", "surplus is trapped", "starving input", "peckish",
   "halo"), engineering-grade error text exposed to the player ("AI proxy
   unreachable (timeout). Running fallback mode.", "Why no WHISPER?: LLM never
   reached"), and **`label: "halo"` literal strings rendered on every secondary
   Heat-Lens marker** (`src/render/PressureLens.js:409`,
   `src/render/SceneRenderer.js:1811`) which the casual player screenshotted
   and compared to "ASCII art placeholders". The game looks unfinished.
2. **Keyboard-shortcut traps that destroy progress.** F1 is documented as
   "reopen this guide" but is **not** in `shortcutResolver.js`'s handled
   keyset — so the browser default (F1 in some setups, plus the menu
   `<select id="overlayMapTemplate">` keeping focus after Start Colony)
   reloads the page or switches map template via the focused select's
   keyboard navigation. Net effect: the casual player lost progress 3 times in
   25 minutes. `shortcutResolver.js` already has phase-gating for L/T/0-9 but
   ignores F1 and never blurs the menu select on session start.
3. **No emotional payoff layer.** The colony sim is silent (no audio at all),
   newborn events are buried as a 5-second log line in a folded panel, and
   contradictory KPIs ("STABLE" badge + "1m 12s until empty" runout hint)
   appear simultaneously because the badge is keyed on `gameplay.threat` while
   the runout hint is keyed on per-resource `producedPerMin - consumedPerMin`
   (`src/ui/hud/HUDController.js:1462-1492` vs `:1494-1520`).

`freeze_policy: lifted` puts audio, accessibility, jargon de-engineering, and
Heat-Lens label cleanup in scope. We tackle root cause #1 + #2 in this plan;
audio (root cause #3 sub-a) is parked in a follow-up because asset
authoring/licensing dwarfs a single Coder slot.

## 2. Suggestions（可行方向）

### 方向 A: "Casual Onboarding Pack" — strip player-facing engineering jargon, fix the F1/menu-select shortcut traps, and quiet Heat-Lens halo labels

- 思路：treat the first 5 minutes as a UX product. Replace 4 player-facing
  diagnostic strings with non-engineering copy, swallow F1 in the global
  keydown handler so the browser cannot reload the page, blur the
  `#overlayMapTemplate` select after Start Colony so 1-9 doesn't reassign the
  template, and hide the `"halo"` text label on secondary Heat-Lens markers
  (keep the colored tile pulse — that's the actual visual signal).
- 涉及文件：`src/app/shortcutResolver.js`, `src/app/GameApp.js`,
  `src/ui/hud/HUDController.js`, `src/ui/hud/storytellerStrip.js`,
  `src/render/SceneRenderer.js`, `src/render/PressureLens.js`,
  `src/world/scenarios/ScenarioFactory.js`, `src/ui/hud/GameStateOverlay.js`.
- scope：中（~420 LOC, mostly string + small handler edits）
- 预期收益：directly addresses the top 3 score-sinks the reviewer called out
  (–1 jargon, –1 shortcut conflicts, partial –0.5 UI matrix from "halo"
  spam). Casual reviewer's 3/10 should pull toward 5/10 without changing any
  mechanic. Zero benchmark risk (text + UI only).
- 主要风险：existing tests may snapshot the old strings ("Reconnect the west
  lumber line", "AI proxy unreachable", "halo"). Need to grep test/ first
  and either update the assertions or keep the engineering string as an
  internal `state.debug.lastAiError` while showing a friendly version on the
  HUD.

### 方向 B: "Newborn Moment + Contradiction Sweep" — emotional set-piece for births and reconcile STABLE-vs-runout KPI mismatch

- 思路：when `PopulationGrowthSystem` emits a birth, raise a 4-second
  full-strip "WHISPER" toast with the newborn's name and a camera nudge
  toward the warehouse (no audio yet). Separately, change
  `#updateColonyHealthCard` to downgrade THRIVING/STABLE → STRUGGLING when
  any tracked resource has `runoutSec < 90`, so the badge cannot say STABLE
  while a runout hint says "1m 12s until empty".
- 涉及文件：`src/simulation/population/PopulationGrowthSystem.js`,
  `src/ui/hud/HUDController.js`, `src/ui/hud/storytellerStrip.js`,
  `src/render/SceneRenderer.js` (camera nudge).
- scope：中（~280 LOC）
- 预期收益：gives the casual player one real "ahh" moment per playthrough +
  closes the most embarrassing UI contradiction. Smaller scoreboard
  improvement than 方向 A but a more memorable single moment.
- 主要风险：camera-nudge code path is fragile (Three.js coordinate math, has
  bitten previous PRs). KPI threshold change risks shifting benchmark-mode
  status badges and breaking 3-4 existing tests in
  `test/colony-health-card*.test.js`.

### 方向 C: "Audio MVP" — add a 3-cue sound layer (UI click, build complete, birth)

- 思路：introduce `src/audio/AudioBus.js`, hook `state.events` for
  `BUILD_COMPLETE` / `VISITOR_ARRIVED` / tool-button click, wire 3 short
  procedurally-generated WebAudio tones (no asset files).
- 涉及文件：new `src/audio/AudioBus.js`, `src/app/GameApp.js`,
  `src/ui/tools/BuildToolbar.js`, `src/simulation/meta/GameEventBus.js`.
- scope：大（~600 LOC + new system + new test surface）
- 预期收益：directly hits the reviewer's biggest single complaint
  ("没有任何声音/音乐"–2 分). High emotional payoff.
- 主要风险：adds a brand-new subsystem (mute toggle, autoplay-policy gating,
  per-event rate-limiting); high risk of being half-baked in one Coder slot
  and amplifying the "unfinished" perception. Procedural tones still won't
  deliver Stardew-grade warmth — they'll sound like a calculator. Likely
  needs a 2-round arc and asset sourcing.

## 3. 选定方案

选 **方向 A**（"Casual Onboarding Pack"）.

理由：

- **Highest yield-per-LOC.** All three sub-problems (jargon / F1 / halo) are
  cheap surface-level fixes whose absence is currently doing 4-5 points of
  damage to the casual rubric.
- **Deterministic, low-blast-radius.** No new subsystems, no benchmark
  perturbation, no AI-policy changes. Test green is realistic in one slot.
- **方向 B's contradiction sweep is tempting** but the underlying
  threat-vs-runout decoupling is a bigger refactor than it looks (4+
  callsites, including AI prompt input), and would burn the slot with one
  reviewer's blood-pressure complaint while leaving the jargon + shortcut
  bugs intact for every other casual player.
- **方向 C is a 2-round arc**, not a one-Coder fix. Park it for Round 7+
  when an asset budget exists; Audio MVP without curated assets sounds worse
  than silence.
- Stays inside `freeze_policy: lifted` constraints — no `src/benchmark/**`
  edits, no `scripts/long-horizon-bench.mjs` edits, no `package.json`
  changes, no rolled-back prior work.

## 4. Plan 步骤

- [ ] **Step 1**: `src/app/shortcutResolver.js:24-78` (`resolveGlobalShortcut`)
  — `add` — handle `F1` and `Slash`+`?` keys: when `code === "F1"` or
  `key === "f1"` or (`key === "?"` / `code === "Slash"` with shift), return
  `{ type: "openHelp" }`. Critical: **always preventDefault for F1**, even
  when `phase !== "active"`, so the browser can't reload.

- [ ] **Step 2**: `src/app/GameApp.js:1474-1530` (`#onGlobalKeyDown`) — `add`
  — branch for the new `action.type === "openHelp"` returned by Step 1:
  call the existing help-modal opener (search for "How to Play" /
  `helpModal` / `controlsTab` in `HUDController.js`) and `event.preventDefault()`
  unconditionally for `event.key === "F1"`, even if no action resolved
  (defensive against browser default).
  - depends_on: Step 1

- [ ] **Step 3**: `src/app/GameApp.js` near the Start-Colony click handler
  (search for `phase === "active"` transition / `startSession`) — `add` — on
  session-start, call `document.getElementById("overlayMapTemplate")?.blur()`
  AND `document.activeElement?.blur()` so the menu's `<select>` no longer
  receives 1-9 keyboard nav. Add the same blur on `#cycleSelectedWorker` and
  on the first `keydown` after phase becomes active (defensive).
  - depends_on: none

- [ ] **Step 4**: `src/render/SceneRenderer.js:1811`
  (`el.textContent = String(marker.label ?? marker.kind ?? "")`) — `edit` —
  hide the text label entirely when `marker.kind` is a halo (detect via
  `String(marker.id).startsWith("halo:")` OR `marker.label === "halo"`):
  `el.style.display = "none"; continue;`. Keep the colored heat-tile
  overlay (`#updateHeatTileOverlay` at :1818) untouched — the visual
  pulse is the real signal.

- [ ] **Step 5**: `src/render/PressureLens.js:409` — `edit` — change
  `label: "halo"` to `label: ""` (empty string) as belt-and-braces in case
  Step 4's id-prefix check is bypassed by future refactor. Comment why:
  halos are a *visual* expansion of a primary marker, not a separate
  semantic event with its own label.

- [ ] **Step 6**: `src/ui/hud/GameStateOverlay.js:64`
  (`Heat Lens: red means surplus is trapped...`) — `edit` — replace with
  casual-friendly copy: `"Heat Lens: red tiles = stuff piling up unused. Blue tiles = a building waiting on input. (${tagLine})"`.
  Remove "surplus is trapped" and "starving input" wholesale.

- [ ] **Step 7**: `src/world/scenarios/ScenarioFactory.js:26,28,341,387` —
  `edit` — soften the four scenario blurbs that the reviewer flagged as
  "OKR speak". Replace literal "Reconnect the west lumber line, reclaim the
  east depot, then scale the colony." with a casual-voice version that
  names what's on screen: e.g. `"Your colony just landed. The west forest
  is overgrown — clear a path back, then rebuild the east warehouse."`
  Same treatment for `hintInitial` (line 28) and `logisticsDescription`
  (line 387). Keep the gameplay flag/objective IDs unchanged so behaviour
  tests don't move.

- [ ] **Step 8**: `src/app/GameApp.js:1353,1368` — `edit` — replace both
  `state.controls.actionMessage` strings:
  - `:1353` `"AI proxy has no API key. Running fallback mode."` →
    `"Heads-up: smart AI is offline (no key). The colony will run on
    built-in rules — totally playable."`
  - `:1368` `"AI proxy unreachable (timeout). Running fallback mode."` →
    `"Heads-up: couldn't reach the smart AI. Switching to built-in rules —
    totally playable."`
  Move the original `err.message` into `state.debug.lastAiError` (new
  field, init at `src/app/GameApp.js` constructor) so DeveloperPanel still
  shows the engineering string — no information lost.

- [ ] **Step 9**: `src/ui/hud/HUDController.js:1031-1059`
  (`Why no WHISPER?` block) — `edit` — gate the `Why no WHISPER?` DOM-write
  behind `state.debug?.devMode === true` (or whatever dev-flag exists; see
  `src/app/devModeGate.js`). Casual players never see "WHISPER" / "LLM
  never reached"; developers still get the diagnostic via DeveloperPanel.
  - depends_on: none

- [ ] **Step 10**: `src/ui/panels/EntityFocusPanel.js` (search for `peckish`)
  — `edit` — replace the literal word `peckish` in the player-facing label
  with `"a bit hungry"`. Leave any internal enum / `state.agents[i].mood`
  ID untouched — change is in the display string only.
  - depends_on: none

## 5. Risks

- **Snapshot tests likely assert the old strings.** Pre-flight grep
  required: `test/`, especially `test/colony-health-card*.test.js`,
  `test/scenario-factory*.test.js`, `test/heat-lens*.test.js`,
  `test/storyteller-strip*.test.js`. Update assertions in lockstep with
  the string changes; don't snapshot-explode the suite.
- **F1 may already be intercepted somewhere.** Some browsers interpret F1
  as Help (Edge dev-tools, Firefox quick-find). Step 1+2's
  preventDefault is essential; verify by manual repro before declaring
  done.
- **`document.activeElement?.blur()` on session start can blur an input
  the user is mid-typing in.** Mitigation: only blur if the active element
  matches `#overlayMapTemplate, #mapTemplateSelect, #doctrineSelect`
  (the three menu selects). Don't use a blanket blur.
- **Step 4's id-prefix check is fragile** if a future refactor renames
  halo IDs. Step 5 (label: "") is the belt-and-braces.
- **可能影响的现有测试**:
  - `test/scenario-factory*.test.js` (scenario blurb assertions)
  - `test/heat-lens*.test.js` / `test/pressure-lens*.test.js` (halo
    label/id assertions)
  - `test/storyteller-strip*.test.js` (Why no WHISPER text)
  - any e2e snapshot capturing `actionMessage`
- **`src/benchmark/**` and `scripts/long-horizon-bench.mjs` are
  untouched** by this plan; benchmark gate should be a no-op pass.

## 6. 验证方式

- **新增测试**:
  - `test/casual-shortcut-resolver-f1.test.js` — assert
    `resolveGlobalShortcut({ key: "F1", code: "F1" }, { phase: "active" })`
    returns `{ type: "openHelp" }` and not null; same for `{ key: "F1" }`
    when phase is `"menu"` (must still resolve to openHelp so we
    `preventDefault` instead of letting the browser reload).
  - `test/heat-lens-halo-suppressed.test.js` — render
    `updateHeatLensLabels` with a primary marker + 4 halo children; assert
    `el.style.display === "none"` for halo elements and `"block"` for the
    primary.
  - `test/casual-jargon-strings.test.js` — guard rail: assert the
    refreshed `actionMessage` (Step 8) does **not** contain the substrings
    `"unreachable"`, `"WHISPER"`, `"LLM"`, `"halo"`, `"surplus is trapped"`,
    `"starving input"`, `"peckish"`. This is a low-cost regression net.

- **手动验证 (dev server)**:
  1. `npx vite` → open `http://localhost:5173`.
  2. On the menu, press **F1**. Expect: How-to-Play modal opens. Game does
     **not** reload, URL unchanged.
  3. Click **Start Colony**. After load, press **3**. Expect: Quarry tool
     selected. URL unchanged (no `?template=archipelago_isles`).
  4. Toggle Heat Lens (**L**). Expect: red/blue tile pulses visible, but
     **no `"halo"` text labels** plastered on the secondary tiles.
  5. With `VITE_AI_PROXY=` unset (or unreachable), confirm the HUD action
     message reads "Heads-up: …built-in rules — totally playable." rather
     than "AI proxy unreachable (timeout)."
  6. Hover an idle worker. Expect status string says "a bit hungry"
     instead of "peckish".

- **benchmark 回归**:
  `scripts/long-horizon-bench.mjs` is **not edited** (freeze constraint).
  Run the 4-seed gate (seeds 42 / 1337 / 2025 / 8675309 on
  `temperate_plains`). DevIndex must not drop more than 5% vs the current
  baseline (≈44 from CLAUDE.md "Current State"; floor = 41.8). This change
  is text-and-UI only so we expect ≤1% noise.

## 7. UNREPRODUCIBLE 标记

Not applicable — feedback's three concrete reproducible claims (F1
reloads, **3** key switches template, `"halo"` labels visible) all map to
verifiable code locations cited above. Playwright was not used because
the static-analysis trace already pinpoints the lines and the user said
to keep tool use lean.
