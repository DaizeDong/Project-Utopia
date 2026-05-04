---
reviewer_id: PII-holistic-rank (modal z-stack + LLM degradation toast)
feedback_source: assignments/homework7/Final-Polish-Loop/Round11/Feedbacks/PII-holistic-rank.md
round: 11
date: 2026-05-01
build_commit: 652220f
priority: P2
track: code (UI — modal stacking discipline + LLM-state-transition toast)
freeze_policy: hard
rollback_anchor: 652220f
estimated_scope:
  files_touched: 2
  loc_delta: ~30
  new_tests: 1
  wall_clock: 30
conflicts_with: []
---

# Plan-PII-modal-zstack — Fix Game-Over / Splash Z-Stacking Trap + Surface LLM Degradation Toast

**Plan ID:** Plan-PII-modal-zstack
**Source feedback:** `assignments/homework7/Final-Polish-Loop/Round11/Feedbacks/PII-holistic-rank.md` (most-frustrating moment + fun-lift #1, #2)
**Track:** code (UI — modal stacking + transition observability)
**Priority:** P2 — both issues are UX (no game-loop break) but the modal trap silently *pauses the game behind a visible splash* on restart, which a real player would diagnose as "the game froze, reload." That fragility is a goodwill killer worth more than the +0.5 PII gave R11. The LLM-degradation silence is a smaller fix that closes PII's "Storyteller silently muted" complaint.
**Freeze policy:** hard (no new mechanic, no new HUD component, no new event type — only (a) a stacking-discipline guard at the splash mount path that unmounts a stale `overlay-panel.run-ended` if present, and (b) a one-line toast emission inside the existing AI-state observer when `state.ai.mode` transitions `llm/llm → fallback/llm`. Both extend existing infrastructure.)
**Rollback anchor:** `652220f`

---

## 1. Core problem (one paragraph)

PII's blind playthrough surfaced two silent regressions that share a common root: **the UI fails to narrate state transitions the player needs to perceive.** (1) After a "Run Ended" overlay mounts, clicking "New Map" re-mounts the splash *behind* the still-mounted run-ended overlay — sim clock stuck at 0:04 for two minutes, real-time, because the run-ended overlay holds the pause latch and the splash's Start button is occluded by an invisible layer-stack ordering issue. A real player would conclude "game froze, reload." (2) Mid-run, `state.ai` flipped from `llm/llm` to `fallback/llm` with **no toast, no log line, no badge color change.** R10's most satisfying moment was "the Storyteller line after the saboteur kill"; R11 silently mutes that voice without telling the player it happened. Both fixes are surgical: enforce stacking discipline at the splash mount, and emit a toast on the AI-state transition the observer already detects (it just doesn't currently write a player-facing surface).

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — both fixes, narrowly scoped

1. **Splash-mount stacking guard.** At the splash-panel mount entry point (likely `src/ui/panels/SplashPanel.js` / `src/ui/SplashController.js` — locate via `Grep "splash\|briefing-panel" src/ui/`), add a precondition: if `document.querySelector('.overlay-panel.run-ended')` exists, unmount it (or call its existing `.dispose()`) BEFORE mounting the splash. Defensive and idempotent.
2. **LLM-degradation toast.** At the AI-mode transition watcher (likely in `src/ui/HUD.js` or `src/ui/AIPanel.js` — locate via `Grep "ai\.mode\|aiMode\|fallback/llm\|llm/llm" src/ui/`), when the prior tick's mode was `llm/llm` and the current is `fallback/llm`, emit a one-line toast: *"Story AI offline — fallback director taking over."* Reuse the string already present in the boot-time "Why no WHISPER?" panel (PII confirms it exists).

- Files: `src/ui/panels/SplashPanel.js` (or wherever splash mounts), `src/ui/HUD.js` (or AIPanel — wherever the AI mode is read for display)
- Scope: trivial (~30 LOC across 2 files + 1 small unit test on the stacking guard)
- Expected gain: closes PII's most-frustrating moment + restores the LLM-voice observability that R10 earned
- Main risk: dedup. The AI-mode-transition toast could fire repeatedly if mode flickers `llm/llm → fallback/llm → llm/llm → fallback/llm` rapidly. Mitigation: only emit when transitioning *into* `fallback/llm` from `llm/llm`, AND debounce per ≥ 30 sim-sec (i.e. don't re-fire within 30 s of the last emission).

### Suggestion B (in-freeze, MINIMAL VARIANT) — splash stacking guard only

Just fix #1 (splash unmounts stale run-ended). Skip the LLM toast. Closes the most-frustrating-moment. The LLM toast (PII fun-lift #2) is real but lower-impact — the game keeps running, just silently dumber.

### Suggestion C (in-freeze, MINIMAL VARIANT) — LLM toast only

Just fix #2. Skip the splash guard. PII's most-frustrating moment is preserved but at least the Storyteller mute is surfaced.

### Suggestion D (FREEZE-VIOLATING, flagged, do not ship in R11) — adopt PII fun-lift #3 (Frontier-progress pill in topbar)

PII's #3 is "promote scenario-goal completion to a persistent topbar pill." **New HUD element = freeze violation.** Defer to v0.10.2 — same recommendation R10 PEE made. Tagged for completeness.

### Suggestion E (FREEZE-VIOLATING, flagged, do not ship in R11) — refactor the modal layer into a single z-stack manager

Build a centralised modal manager that owns z-index assignments and unmount cascades for all overlay-panels. **New module = past-freeze.** Defer. Suggestion A's guard is the surgical version.

## 3. Selected approach

**Suggestion A.** Both fixes ship together because they share the "UI narrates transitions" theme and together they materially improve PII's score (5.5 → ~6.0+). Each fix is independently rollback-safe.

## 4. Plan steps

- [ ] **Step 1 — Locate the splash mount entry point.**
  `Grep "splash\|briefing-panel\|.overlay-panel" src/ui/` (and `src/main.js` / `src/index.js` if the splash mounts at boot). Identify:
  - The function that creates / mounts the splash DOM (likely `mountSplash()` / `showSplash()` / `SplashPanel.show()`).
  - The CSS class or selector for the run-ended overlay (PII calls it `.overlay-panel.run-ended`).
  - The dispose / unmount path for the run-ended overlay (existing — PII confirmed it exists since the panel mounts cleanly on its own).
  - Type: read

- [ ] **Step 2 — Add the unmount guard at splash-mount.**
  In the splash-mount function, BEFORE creating the splash DOM:
  ```js
  // PII R11: ensure no stale run-ended overlay is left mounted behind us.
  // PII observed a 2-minute "frozen" trap when New Map was clicked while a
  // run-ended overlay was still mounted (sim clock stuck at 0:04, splash
  // visible but its Start button occluded by an invisible stacking-order issue).
  const staleRunEnded = document.querySelector('.overlay-panel.run-ended');
  if (staleRunEnded) {
    // Prefer the panel's own dispose hook; fall back to remove() if absent.
    if (typeof staleRunEnded._dispose === 'function') staleRunEnded._dispose();
    else staleRunEnded.remove();
  }
  // Also un-pause the sim if the run-ended overlay had latched the pause.
  if (state.run?.pausedByOverlay) state.run.pausedByOverlay = false;
  ```
  Selector + dispose-hook name to be confirmed in Step 1.
  - Type: add
  - depends_on: Step 1

- [ ] **Step 3 — Locate the AI-mode display path.**
  `Grep "ai.mode\|aiMode\|fallback/llm\|llm/llm" src/ui/` — find where the autopilot indicator reads `state.ai.mode` and renders the badge. The transition watcher will live alongside (or wrap) this read.
  - Type: read

- [ ] **Step 4 — Add the LLM-degradation transition toast.**
  At the AI-mode-display read site (or in a per-tick UI update hook), maintain a `_lastAiMode` local + a `_lastDegradeEmitSec` debounce timestamp:
  ```js
  // PII R11: surface the llm/llm → fallback/llm degradation. R10's most satisfying
  // moment was "the Storyteller line after the saboteur kill"; R11 silently mutes it.
  const currentMode = state.ai?.mode ?? 'fallback/llm';
  const now = state.simSec ?? 0;
  if (
    _lastAiMode === 'llm/llm' &&
    currentMode === 'fallback/llm' &&
    (now - (_lastDegradeEmitSec ?? -Infinity)) >= 30
  ) {
    emitToast({
      message: 'Story AI offline — fallback director taking over.',
      kind: 'warning',
      durationSec: 4,
    });
    _lastDegradeEmitSec = now;
  }
  _lastAiMode = currentMode;
  ```
  Reuse the existing `emitToast` API (verify shape via `Grep "emitToast\|toast(" src/ui/`). The 30 s debounce prevents re-emission if the mode flickers.
  - Type: add
  - depends_on: Step 3

- [ ] **Step 5 — Add a unit test for the splash stacking guard.**
  Create `test/splash-unmount-stale-run-ended.test.js` (~25 LOC). Stub a minimal DOM (use `happy-dom` or a manual `document` mock — confirm conventions via `Grep "happy-dom\|jsdom\|document\." test/`):
  1. Append a fake `<div class="overlay-panel run-ended">` to `document.body`.
  2. Call the splash-mount function.
  3. Assert `document.querySelector('.overlay-panel.run-ended') === null`.
  4. Negative-control: mount splash with no run-ended overlay present — should not throw.
  - Type: add (new file)
  - depends_on: Step 2

- [ ] **Step 6 — Manual repro of PII's two scenarios.**
  - **Modal z-stack:** start a new run, force a Run Ended (e.g. devKillAllWorkers or wait for natural loss), click "New Map" / Start Colony from the run-ended panel. Confirm: splash mounts cleanly, run-ended overlay is gone, Start button is interactive, sim does not pause-trap.
  - **LLM degradation toast:** start a run with autopilot ON + LLM reachable. Force a proxy timeout (cut network or force a transient LLM error). Confirm a toast reads *"Story AI offline — fallback director taking over."* within 1 tick of the mode transition. Wait 30 s and force another timeout — confirm second toast also fires (debounce honoured but not blocking).
  - Type: verify
  - depends_on: Step 5

- [ ] **Step 7 — Run the suite.**
  `node --test test/*.test.js`. Baseline 1646 / 1612 / 0 fail / 2 skip. Expect: +1 pass (the new splash test). No regressions expected.
  - Type: verify
  - depends_on: Step 6

- [ ] **Step 8 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  *"PII-holistic-rank Most-Frustrating + #2 — splash mount now unmounts any stale `.overlay-panel.run-ended` before rendering, fixing the 2-minute pause-trap PII observed when 'New Map' was clicked from a Run Ended panel; LLM mode-degradation (`llm/llm → fallback/llm`) now emits a player-facing toast 'Story AI offline — fallback director taking over.' (30 s debounce). Closes PII's two top R11 frustrations."*
  - Type: edit
  - depends_on: Step 7

## 5. Risks

- **Splash-mount path isn't the only mount path.** If there are multiple entry points that can mount the splash (e.g. boot, "New Map" button, regenerate callback), the guard must apply to all. Step 1's grep should surface them; if there's a shared `mountOverlayPanel()` helper, the guard goes there.
- **`_dispose` hook may not exist.** If the run-ended overlay's dispose path is implicit (relies on garbage collection of the React/Vue/vanilla DOM tree), `staleRunEnded.remove()` is the safe fallback. The `pausedByOverlay` flag may need explicit clearing — Step 2 includes that defensively.
- **AI-mode toast firing during boot transitions.** On cold boot the `_lastAiMode` is `undefined`, so the first observed `fallback/llm` does NOT trigger the toast (only `llm/llm → fallback/llm` does). This is correct — the boot-time "Why no WHISPER?" panel already covers boot-state communication. If a user starts a run with LLM reachable and it never goes down, no toast fires (correct).
- **Toast spam on flicky proxy.** 30 s debounce prevents flood. If the proxy oscillates rapidly (1× per few seconds), the player sees one toast and it then stays in `fallback/llm` until the proxy stabilises — which is the right UX.
- **Possible affected tests:** `test/splash-*.test.js` (if existing splash tests asserted no DOM cleanup, they'll need a relax), `test/ai-mode-*.test.js` (if any). PII's audit didn't surface any.

## 6. Verification

- **New unit test:** `test/splash-unmount-stale-run-ended.test.js` (Step 5). Asserts the guard removes a stale run-ended overlay; asserts it doesn't throw when none is present.
- **Manual repro (mirrors PII's methodology):** see Step 6 — both scenarios reproducible from a Playwright session.
- **No bench regression expected** (UI-only change; the bench harness doesn't observe the splash or the AI mode toast). Optionally confirm: `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 30 --tick-rate 4` — DevIndex within ±1 % of pre-fix head.

## 7. UNREPRODUCIBLE marker

N/A — PII reproduced both issues at HEAD `652220f` in a Playwright session. Splash modal z-stack: trivially reproducible by clicking "New Map" while a run-ended panel is mounted. LLM degradation: required a real proxy hiccup but was directly observed.

---

## Acceptance criteria

1. Mounting the splash with a stale `.overlay-panel.run-ended` in the DOM unmounts it BEFORE the splash renders.
2. New unit test `test/splash-unmount-stale-run-ended.test.js` passes.
3. AI mode transition `llm/llm → fallback/llm` emits a single warning-style toast within 1 tick.
4. Toast does NOT fire on boot (when `_lastAiMode` was never `llm/llm`).
5. Toast does NOT fire more than once per 30 sim-sec.
6. `node --test test/*.test.js` baseline preserved (1646 pass / 0 fail; +1 from new test).
7. PII's most-frustrating moment is gone: clicking "New Map" from a Run Ended panel never produces a pause-trap.
8. No new HUD components, no new mechanic, no new event types.

## Rollback procedure

```
git checkout 652220f -- <splash-file> <hud-file> && rm test/splash-unmount-stale-run-ended.test.js
```

(exact files resolved in Steps 1 + 3).
