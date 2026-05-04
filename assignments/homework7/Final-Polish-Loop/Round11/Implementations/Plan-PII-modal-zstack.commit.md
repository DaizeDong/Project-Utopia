# Plan-PII-modal-zstack — Implementer Commit Log (R11 5/6)

**Status:** SHIPPED
**Plan:** `assignments/homework7/Final-Polish-Loop/Round11/Plans/Plan-PII-modal-zstack.md`
**Track:** code only
**Priority:** P2
**Parent commit:** `4cc200a` → **Head:** `d243c96`

## Files changed
- `src/ui/hud/GameStateOverlay.js` (+~20 LOC) — `priorPhase` capture before `#lastPhase` overwrite; `if (isMenu)` !menu→menu transition guard force-hides `#overlayEndPanel`, sweeps `.overlay-panel.run-ended` via `document.querySelector` (`_dispose()` else `.remove()`), clears `state.run.pausedByOverlay`.
- `src/ui/hud/HUDController.js` (+~22 LOC) — autopilot-chip render block now tracks `_llmLastModeCombined` + `_llmDegradeLastEmitSec`; on `llm/llm → fallback/llm` with ≥30 sim-sec since last emit, writes `state.controls.actionMessage = "Story AI offline — fallback director taking over."` (kind=warn). Cold boot does not fire (undefined lastMode).
- `test/splash-unmount-stale-run-ended.test.js` (NEW, 2 cases) — stale-overlay removal on end→menu transition + no-throw negative control. Manual `globalThis.document` mock with `querySelector` matching the project's existing test conventions.
- `CHANGELOG.md` — new unreleased v0.10.1-n entry under Plan-PII heading.

## Tests
- New test: 2/2 pass.
- Impacted UI suites (`game-state-overlay`, `end-panel-finale`, `hud-controller`, `hud-autopilot-status-contract`, `hud-autopilot-toggle`): 19/19 pass.
- **Full suite: 1987 pass / 0 fail / 4 skip** (+2 from new test; baseline preserved).

## Acceptance check
- (1) `.overlay-panel.run-ended` swept on menu mount: covered by test #1.
- (2) Negative control (no stale element): covered by test #2.
- (3) LLM degradation toast: only fires on `llm/llm → fallback/llm` with 30 s debounce (boot-time `undefined` lastMode is intentionally excluded).
- (4) Hard-freeze: no new mechanic / HUD component / event type — both fixes reuse existing infrastructure (`actionMessage`/`actionKind` toast surface; `endPanel.hidden` write).

## Confirmation: `git log --oneline -2`
```
d243c96 ux(modals r11): Plan-PII-modal-zstack — splash stacking guard + LLM degradation toast
4cc200a feat(render r11): Plan-PHH-convoy-feel — fading worker trails + road foot-traffic EWMA tint
```
