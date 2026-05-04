---
reviewer_id: Plan-R12-debug-leak-gate (A6-ui-design + A7-rationality-audit)
feedback_source: assignments/homework7/Final-Polish-Loop/Round12/Feedbacks/A6-ui-design.md, assignments/homework7/Final-Polish-Loop/Round12/Feedbacks/A7-rationality-audit.md
round: 12
date: 2026-05-01
build_commit: fa6cda1
priority: P0
track: ui (engineering-string quarantine on player-facing surfaces)
freeze_policy: hard
rollback_anchor: fa6cda1
estimated_scope:
  files_touched: 3
  loc_delta: ~40
  new_tests: 1
  wall_clock: 25
conflicts_with:
  - Plan-R12-stable-tier-fix    # both modify src/ui/hud/HUDController.js (Step 2 here vs Step 1 there)
---

# Plan-R12-debug-leak-gate — Quarantine three permanent debug strings behind `isDevMode(state)`

**Plan ID:** Plan-R12-debug-leak-gate
**Source feedback:** A6-ui-design (Top issue #1, "Top HUD overflows + leaks engineering text at 1024px") + A7-rationality-audit (Top issue #3, "Three independent debug strings render permanently in player-facing UI")
**Track:** ui
**Priority:** **P0** — both reviewers independently flagged the same three engineering strings on every in-game frame across every captured viewport. A6 specifically calls the WHISPER chip a "permanent player-facing artefact, not a transient toast." A7 calls it the highest-confidence "engineering leakage" defect of R12. The gate exists (`isDevMode(state)` in `src/app/devModeGate.js`, already in production), but two of the three call sites either bypass it or were never wired through it. R11 PII landed `body:not(.dev-mode) #storytellerWhyNoWhisper { display: none !important; }` but R12 reviewers still see the chip — likely either (a) a sibling element duplicates the text outside the gated `<span>`, or (b) the casual-mode `body` class is not actually being applied by the time the strip renders.
**Freeze policy:** hard — no new mechanic, no behaviour change. Only changes which strings render conditional on `isDevMode(state)` (already-existing, fully-tested, single-source-of-truth gate). Three small wrappings + 1 unit test.
**Rollback anchor:** `fa6cda1`

---

## 1. Core problem (one paragraph)

Three independent engineering strings render in player-facing UI on every R12 in-game frame: (a) the storyteller strip top-of-screen shows `Why no WHISPER?: LLM never reached` (A6 screenshot 08, A7 screenshots 02/06/13); (b) the AI Log header in `AIAutomationPanel.js:136` shows `coverage=fallback mode=fallback proxy=unknown model=gpt-5-4-nano`; (c) the Debug World State block in `DeveloperPanel.js:311` shows `AI: enabled=false mode=fallback ... proxy=unknown ... model=gpt-5-4-nano` AND `HUDController.js:1221` writes `aiModeVal` as `off / fallback (unknown, gpt-5-4-nano)`. All three express the same fact ("LLM proxy is offline; fallback directors are running") in three different jargons. Two have an existing `isDevMode(state)` gate in source (`HUDController.js:1516`, `AIAutomationPanel.js:134`) but R12 reviewers still see them — either the gate is inactive (default casual-mode body class not applied at strip-render time) or there are siblings that bypass it. The third (`HUDController.js:1221` aiModeVal) was never gated. Fix: wrap all three in the same `isDevMode(state)` check that `whisperBlockedReasonDev` already uses; emit a single short human chip `[AI offline]` with hover tooltip in casual mode.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — wrap all three emitters in `isDevMode(state)` and emit one casual-mode shorthand

For each of the three sites, replace the unconditional `${engineering-string}` with:
```js
import { isDevMode } from "<relative-path>/src/app/devModeGate.js";
const showEngText = isDevMode(state);
node.textContent = showEngText
  ? `<full engineering string today>`
  : "AI offline";   // or "" / hide entirely depending on the surface
```

Sites:
1. **HUDController.js:1221** — wrap the `aiModeVal.textContent = ...` line. Casual: `aiModeVal.textContent = ai.enabled ? "AI online" : "AI offline";` (the existing AI mode chip is already a tiny corner element; the long `off / fallback (unknown, gpt-5-4-nano)` is dev-only).
2. **HUDController.js:1561** — verify the `whySpan.textContent = "Why no WHISPER?: ${reasonText}"` write only happens under `devModeOn` (already coded — re-verify that `devModeOn = isDevMode(state)` actually fires false for casual; if not, audit `applyInitialDevMode` boot order in `GameApp.js`). The R12 reviewers still see this string, so either the gate is inactive at boot OR a sibling element in the storytellerStrip carries the same text. Step 2 audits the live DOM via Playwright to find the leak.
3. **AIAutomationPanel.js:136** — already has `showEngineeringFooter = isDevMode(state)`. Same R11 audit confirms the gate; no change needed if the gate fires. If A7 screenshot 15 shows it WHILE casual-mode is asserted, the bug is upstream (`isDevMode` returning true for casual). Step 4 is a defensive paranoia check.
4. **DeveloperPanel.js:311** — DeveloperPanel is itself dev-only (the `#debugFloatingPanel` carries `class="dev-only"`), so the panel as a whole never renders for casual players. Verify by inspecting the `body.dev-mode` class state from the screenshot (A7 captured at viewport 1920 — likely dev-mode was enabled by accident). If DeveloperPanel is rendering for a casual player, that's a separate bug in CSS gating.

- Files: `src/ui/hud/HUDController.js`, `src/ui/panels/AIAutomationPanel.js` (verify), `src/ui/panels/DeveloperPanel.js` (audit), 1 small test.
- Scope: ~40 LOC total + 30 LOC test.
- Expected gain: closes A6 #1 + A7 #3.
- Main risk: dev-mode users lose the corner-chip detail (mitigated — it remains in DeveloperPanel which is dev-only, plus the AIAutomationPanel footer which is gated to dev-mode).

### Suggestion B (in-freeze, MINIMAL VARIANT) — only fix the WHISPER chip + the `aiModeVal`, leave AIAutomationPanel/DeveloperPanel as-is

Skip the AIAutomationPanel + DeveloperPanel audit. Only wrap `HUDController.js:1221` (`aiModeVal`). Saves ~15 LOC and the audit step. Acceptable but does not close A7 #3 fully.
- Files: `src/ui/hud/HUDController.js`, 1 test
- Scope: ~20 LOC
- Expected gain: ~70% of A6+A7 request

### Suggestion C (in-freeze, COMBINED with R11 PII) — also lock down the `[timeout]` toast leak A7 surfaces in screenshot 17

A7 secondary defect: `Story AI is offline ... (Game still works.) [timeout]` toast — the bracketed `[timeout]` is internal jargon. Drop it under `isDevMode` too, or rephrase. ~10 extra LOC. Recommend folding into Suggestion A as a Step 5 add-on.
- Files: search for the toast emitter (probably `storytellerStrip.js` or `autopilotStatus.js`)
- Scope: ~10 extra LOC

### Suggestion D (FREEZE-VIOLATING, do not ship in R12) — redesign AI Log + Debug as one panel

Collapse AI Log + Debug into one tabbed surface and make every engineering field a "Show telemetry" toggle. Cuts 5+ engineering strings in one PR but is a UI redesign, not a polish.

## 3. Selected approach

**Suggestion A** with Suggestion C folded in as Step 5. Closes A6 #1 + A7 #3 + the `[timeout]` follow-up in one PR with ~40 LOC total. The audit (Step 2) is critical — if the gate exists but reviewers still see the string, the root cause is gate-not-firing, not gate-not-wired.

## 4. Plan steps

- [ ] **Step 1 — Audit live DOM for which gate is actually firing.**
  Open the build at `http://localhost:5173`, do NOT add `?dev=1` or set `localStorage.utopia:devMode = "1"`. Use Playwright `browser_evaluate` to read:
  ```js
  ({
    bodyDevClass: document.body.classList.contains('dev-mode'),
    bodyCasualClass: document.body.classList.contains('casual-mode'),
    whySpanText: document.getElementById('storytellerWhyNoWhisper')?.textContent,
    whySpanVisible: getComputedStyle(document.getElementById('storytellerWhyNoWhisper')).display,
    aiModeValText: document.getElementById('aiModeVal')?.textContent,
    aiAutomationBodyText: document.getElementById('aiAutomationSummaryBody')?.textContent?.slice(0, 200),
    debugPanelVisible: getComputedStyle(document.getElementById('debugFloatingPanel') || document.body).display,
  })
  ```
  This identifies (a) is `body.dev-mode` accidentally on, (b) is `casual-mode` actually being asserted, (c) which surface still shows the engineering text. Documents the root cause.
  - Type: verify (no edit)

- [ ] **Step 2 — Wrap `HUDController.js:1221` aiModeVal write under `isDevMode(state)`.**
  Add an `isDevMode` import at the top of `src/ui/hud/HUDController.js` if not already present. Replace line 1221:
  ```js
  // CURRENT:
  this.aiModeVal.textContent = `${state.ai.enabled ? "on" : "off"} / ${state.ai.mode} (${state.metrics.proxyHealth ?? "unknown"}, ${proxyModel})`;

  // AFTER:
  // R12 Plan-R12-debug-leak-gate: collapse the engineering jargon
  // (`off / fallback (unknown, gpt-5-4-nano)`) to a casual one-liner so
  // the corner chip stops leaking proxy/model identifiers to first-time
  // players. Dev-mode preserves the full string for local debugging.
  if (isDevMode(state)) {
    this.aiModeVal.textContent = `${state.ai.enabled ? "on" : "off"} / ${state.ai.mode} (${state.metrics.proxyHealth ?? "unknown"}, ${proxyModel})`;
  } else {
    this.aiModeVal.textContent = state.ai.enabled ? "AI online" : "AI offline";
  }
  ```
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Re-verify `HUDController.js:1516` `devModeOn` gate fires correctly for the WHISPER chip.**
  Per Step 1's audit: if `body.dev-mode` is unexpectedly on at boot, fix the boot-time `applyInitialDevMode` call in `src/app/GameApp.js` (search via `Grep "applyInitialDevMode"`). If `body.dev-mode` is correctly off but the WHISPER text still appears, search for a SECOND emitter that writes to `#storytellerWhyNoWhisper` or a sibling node. Search:
  ```
  Grep -n "Why no WHISPER" src/
  ```
  Wrap any unconditional emit under `if (isDevMode(state))`. Likely zero changes needed if Step 1's audit shows the gate is already firing (then the screenshot was taken with `?dev=1` accidentally set).
  - Type: conditional edit
  - depends_on: Step 1

- [ ] **Step 4 — Verify `AIAutomationPanel.js:134-136` gate.**
  The gate `const showEngineeringFooter = isDevMode(state)` already exists. Per Step 1's audit, if the engineering footer still shows in casual mode, replace the conditional with a defensive double-check:
  ```js
  // R12 Plan-R12-debug-leak-gate Step 4: double-check engineering footer
  // gating; A7 R12 reported the string visible in screenshots — ensure
  // both the body-class signal AND the state.controls.devMode flag must
  // be true (defense-in-depth against single-signal misconfiguration).
  const showEngineeringFooter = isDevMode(state);
  ```
  Likely no actual change required.
  - Type: verify (likely no edit)
  - depends_on: Step 1

- [ ] **Step 5 — Strip the `[timeout]` debug suffix from the storyteller-offline toast (A7 secondary).**
  `Grep "\[timeout\]" src/` to find the emitter. If it's in `autopilotStatus.js` or `storytellerStrip.js`, gate the bracketed reason:
  ```js
  const reasonSuffix = isDevMode(state) ? ` [${reason}]` : "";
  toastText = `Story AI is offline — fallback director is steering. (Game still works.)${reasonSuffix}`;
  ```
  - Type: edit
  - depends_on: Step 4

- [ ] **Step 6 — Add a unit test pinning the casual-mode contract.**
  Create `test/hud-debug-leak-gate.test.js` (~30 LOC). Test cases:
  1. Casual mode (no `body.dev-mode`, `state.controls.devMode === false`): `HUDController.render(state)` produces `aiModeVal.textContent === "AI offline"` (when `state.ai.enabled === false`).
  2. Dev mode (`state.controls.devMode === true`): `aiModeVal.textContent` matches `/off \/ fallback \(.+\)/`.
  3. Casual mode: `#storytellerWhyNoWhisper.textContent === ""` regardless of `whisperBlockedReason`.
  4. Casual mode: `AIAutomationPanel.render()` produces no `coverage=` / `proxy=` / `model=` substring in `aiAutomationSummaryBody.innerHTML`.
  - Type: add
  - depends_on: Step 5

- [ ] **Step 7 — Run the suite + manual Playwright re-verification.**
  `node --test test/*.test.js` — baseline 1646 / 0 fail / 2 skip preserved + 1 new test passes. Then re-run Step 1's Playwright audit and confirm all four engineering strings are absent in casual mode.
  - Type: verify
  - depends_on: Step 6

- [ ] **Step 8 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  *"R12 Plan-R12-debug-leak-gate (A6+A7 P0): aiModeVal corner chip and storyteller WHISPER suffix now collapse to 'AI online/offline' in casual mode; engineering jargon (`off / fallback (unknown, gpt-5-4-nano)`, `coverage=fallback proxy=unknown`, `[timeout]`) is dev-mode-only behind `isDevMode(state)`. Closes the three permanent debug strings A6/A7 R12 flagged on every in-game frame."*
  - Type: edit
  - depends_on: Step 7

## 5. Risks

- **Existing tests asserting full engineering string in `aiModeVal`.** Mitigated — the new test covers both branches; pre-existing tests likely either set `state.controls.devMode = true` or read the corner chip without asserting on its text. Audit by `Grep "aiModeVal" test/` in Step 1.
- **CSS rule already hides `#storytellerWhyNoWhisper` for casual** (`body:not(.dev-mode) #storytellerWhyNoWhisper { display: none !important; }`, index.html:1888). If the screenshot DID set `body.dev-mode` accidentally, this plan does not regress that (the gate still fires under dev-mode). The fix here is defensive layering.
- **`isDevMode(state)` import cycle risk.** HUDController already imports `isDevMode` (line 1516); AIAutomationPanel already imports it (line 134). Only DeveloperPanel might need a new import — but DeveloperPanel is dev-only by panel-class CSS so no change required.
- **Conflict with Plan-R12-stable-tier-fix** — both touch `src/ui/hud/HUDController.js`. This plan edits line 1221 (aiModeVal); the sibling plan edits lines 2308-2354 (`#updateColonyHealthCard`). Distinct lines, mergeable. Implementer should take this plan FIRST (P0, simpler) then rebase the sibling.
- **Possible affected tests:** `test/hud-storyteller-strip.test.js`, `test/storyteller-strip-whisper-diagnostic.test.js`, `test/ai-automation-panel*.test.js` — all should still pass (the dev-mode branch preserves prior behaviour).

## 6. Verification

- **New unit test:** `test/hud-debug-leak-gate.test.js` (Step 6) — pins casual-mode contract for all three surfaces.
- **Manual Playwright:** Step 1's eval block re-run after Step 7. Expect: `whySpanText === ""`, `aiModeValText === "AI offline"`, `aiAutomationBodyText` contains no `coverage=`/`proxy=`/`model=` substring.
- **No bench regression expected** — UI-string-only change. Optionally confirm `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 30 --tick-rate 4` — DevIndex unchanged.

## 7. UNREPRODUCIBLE marker

N/A — A6 + A7 both reproduced these strings in 5+ screenshots each (A6 02/03/04/06/07/08/09/10/11; A7 02/06/13/15/16/17). Reliable repro on default boot.

---

## Acceptance criteria

1. Casual-mode boot (no `?dev=1`, no `localStorage.utopia:devMode = "1"`): `#aiModeVal.textContent` contains "AI online" or "AI offline" (no `proxy=`, `model=`, `coverage=`).
2. Casual-mode boot: `#storytellerWhyNoWhisper.textContent === ""` and `display === "none"`.
3. Casual-mode boot: `#aiAutomationSummaryBody.innerHTML` contains no `coverage=`, `proxy=`, or `model=` substring.
4. Casual-mode boot: storyteller-offline toast does not contain `[timeout]` or other bracketed engineering reasons.
5. Dev-mode boot (`?dev=1`): all four engineering strings render with full identifiers (preserves dev-mode debugging).
6. New unit test `test/hud-debug-leak-gate.test.js` passes.
7. Test baseline 1646 / 0 fail / 2 skip preserved (+1 new pass).

## Rollback procedure

```
git checkout fa6cda1 -- src/ui/hud/HUDController.js src/ui/panels/AIAutomationPanel.js && rm test/hud-debug-leak-gate.test.js
```
