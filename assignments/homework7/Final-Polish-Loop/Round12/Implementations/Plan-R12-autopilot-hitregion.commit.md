---
plan_id: Plan-R12-autopilot-hitregion
priority: P1
track: code (ui)
freeze_policy: hard
parent_commit: a67c6f1
head_commit: 6c94d2a
date: 2026-05-01
implementer: 5/7
---

# Plan-R12-autopilot-hitregion — Implementation Log

## Status
COMMITTED. CSS hit-region expansion + eager banner-sync landed in a single commit on `main`.

## Parent → Head
- parent: `a67c6f1` (Plan-R12-build-tab-1click)
- head: `6c94d2a` (fix(ui-hitregion r12): Plan-R12-autopilot-hitregion)

## Files changed (3)
- `index.html` — `+34 / -6` LOC. Replaced the 9-line `.speed-toggle` rule (lines 1320-1329) with a ~37-line block: bumped min-height 26→32px, padding 0/7→4/10, font-size 11→12, gap 4→6; added `cursor:pointer` + `user-select:none` + 0.12s transition + `:hover` / `:focus-within` / `:has(input:checked)` rules; bumped inner `<input>` to 16x16.
- `src/ui/hud/HUDController.js` — `+18 / -3` LOC. Added `eagerSyncBanner(checked)` helper inside the `bindEvents` setup; both `aiToggleTop` and `aiToggleMirror` change handlers now call it before `syncAutopilot()` so `#aiAutopilotChip.textContent` updates immediately on toggle (the next render() tick still overwrites with the canonical `getAutopilotStatus()` output).
- `CHANGELOG.md` — `+14 / 0` LOC. New `## [Unreleased] — v0.10.1-n (R12 Plan-R12-autopilot-hitregion, P1)` section at the top, citing A3 #3 + A5 secondary stale-banner fold-in.

## Tests
- `node --test test/*.test.js` — **2001 pass / 0 fail / 4 skip / 120 suites / 68.2s** (baseline preserved). No new tests — CSS `:has()` selector requires a real browser engine (jsdom does not implement it), and the eager-banner DOM write is verified via Playwright per the plan's Step 4 (deferred to manual verification).

## Suggestion selected
Suggestion A (CSS hit-region expansion + visible affordances) folded with Suggestion C (eager banner sync). Suggestion B (CSS-only minimal variant) skipped because A3 specifically requested the visible :checked affordance. Suggestion D (custom toggle-switch component) freeze-violating, not taken.

## Notes / risks
- The plan referenced `#headerStatus` / `#autopilotStatusBanner` element IDs that don't exist anywhere in the codebase outside the plan itself. Audit found the actual stale-banner element is `#aiAutopilotChip` (driven by `getAutopilotStatus(state)` inside `HUDController.render()`). The eager-sync handler now writes to that element directly.
- `:has()` selector is supported in Chrome 105+ / Safari 15.4+ / Firefox 121+. Vite dev server defaults to a modern browser target; if a future end-user reports a missing checked-state tint, fall back to a JS-driven `.checked` class.
- The eager-sync placeholder (`"Autopilot ON · syncing…"`) is intentionally distinct from the canonical post-render text (`"Autopilot ON · llm/llm"` etc.) so that observers can verify the eager-write path actually fired during manual Playwright testing.

## CONFIRM `git log --oneline -2`
```
6c94d2a fix(ui-hitregion r12): Plan-R12-autopilot-hitregion — Autopilot toggle hit-region + eager banner sync
a67c6f1 fix(ui-onboarding r12): Plan-R12-build-tab-1click — first click on Build tab opens palette directly
```
