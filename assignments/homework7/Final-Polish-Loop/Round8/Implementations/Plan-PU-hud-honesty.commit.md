# Plan-PU-hud-honesty — Implementation Log

**Reviewer**: PU-holistic-rank (Tier B, P1, code track)
**Plan**: R8 Plan-PU-holistic-rank (inline spec; no separate Plans/ file in repo)
**Direction taken**: Both sub-fixes (a) + (b) shipped in single commit
**Parent commit**: 174fe43 (`fix(playability r8): PT-raid-pressure-restore ...`)
**Implementer**: R8 implementer 4/4 (last R8 implementer)

## Status

**SUCCESS** — both sub-fixes shipped; 24/24 autopilot+HUD tests pass; pre-existing `ui/hud-score-dev-tooltip` failure unrelated (verified on parent via stash).

## Summary of changes

### (a) HUD Score/Dev/Run header does NOT freeze in Recovery mode
Audited `src/ui/hud/HUDController.js:1748-1851` for any early-return path during recovery. Finding: the `inActive` freeze gate is purely `state.session?.phase === "active" && totalSec > 0`. `foodRecoveryMode` does NOT pause the simulation (only `pausedByCrisis` flips `controls.isPaused` via `GameApp.#maybeAutopauseOnFoodCrisis`), so the timer correctly keeps ticking during recovery — no early-return exists. Made the contract explicit:

- **Comment block** (HUDController.js:1748-1758) explaining that the freeze gate must stay phase-only and that recovery must not freeze the timer.
- **`data-recovery="active"` attribute** on `#statusObjective` set when `state.ai?.foodRecoveryMode === true`, cleared otherwise. Lets visual layers (CSS / consumers) apply a non-freezing cue (e.g. amber tint) without affecting the displayed timer text.

### (b) "Manual takeover recommended" sub-banner is now actionable
`src/ui/hud/autopilotStatus.js:142-154`. Appended a tool-key hint and landmark coord to both the chip text and the hover title:

- **Hint**: `press Space to pause, 2 for Farm tool` — pulls Space (togglePause) + Digit2 (Farm tool from `TOOL_SHORTCUTS`).
- **Landmark coord**: `near (X,Y)` derived from `state.grid.{width,height}` centroid (defensive fallback when grid is missing — e.g., test fixtures without a grid emit no landmark).
- **Title**: gains the same hint phrasing for screen-reader / hover surfaces.
- **Legacy substring `"manual takeover recommended"` preserved** so the existing `test/autopilot-struggling-banner.test.js` substring assertion (Test A) still pins the trigger condition.

## Files changed (3)

- `src/ui/hud/HUDController.js` (+12 / -2 net): comment block + `inRecovery` derivation + `data-recovery` attribute set/clear
- `src/ui/hud/autopilotStatus.js` (+14 / -3 net): landmark coord derivation + actionHint string + struggling text/title enriched
- `CHANGELOG.md` (+11 / -0 net): new R8-PU section

**Net diff**: +37 / -5 LOC across 3 files. Track: code only (CHANGELOG is doc-mandated by CLAUDE.md). Hard-freeze compliant — no new tile / role / building / mood / mechanic.

## Test results

```
node --test test/autopilot-struggling-banner.test.js \
            test/hud-autopilot-status-contract.test.js \
            test/autopilot-status-degraded.test.js \
            test/autopilot-food-crisis-autopause.test.js \
            test/ui/hud-autopilot-chip.test.js \
            test/hud-autopilot-toggle.test.js
# tests 24
# pass 24
# fail 0
```

Pre-existing failure on parent commit (verified via `git stash`): `test/ui/hud-score-dev-tooltip.test.js` Test 1 expects `+5/birth` but code emits `+10/birth`. Unrelated to this change — a stale balance-tuning expectation.

## Plan compliance

- (a) Investigated HUDController.js:1748-1851: no early-return path exists; recovery doesn't freeze. Codified with comment + `data-recovery` attribute.
- (b) Made struggling banner actionable: tool key hint (Space + 2/Farm) + landmark coord (grid centroid).
- ~40 LOC budget: delivered ~26 net source LOC + ~11 CHANGELOG.
- Track=code: source files + CHANGELOG only; no docs/plans touched.

## Confirmation

`git log --oneline -2` will be appended after commit.
