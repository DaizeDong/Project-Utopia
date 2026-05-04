---
plan_id: Plan-R12-debug-leak-gate
implementer: 2/7
priority: P0
track: code
parent_commit: 4cfc3b8
date: 2026-05-01
status: COMMITTED
---

# Plan-R12-debug-leak-gate — Implementation log

## Status
COMMITTED on track=code. Surgical UI string-gate fix per A6 Top issue #1 + A7 Top issue #3.

## Audit (Step 1) — leak path identified
Per the plan investigation, the WHISPER suffix (`HUDController.js:1561`) and the AI Log engineering footer (`AIAutomationPanel.js:134`) already had `isDevMode(state)` gates from prior rounds, and the `[timeout]` toast suffix at `GameApp.js:2106` was also already gated. The only ungated emitter was the `aiModeVal` corner chip at `HUDController.js:1221`, which unconditionally wrote `${on/off} / ${mode} (${proxyHealth}, ${proxyModel})` — this is the actual leak R12 reviewers were observing on every frame in casual mode.

## Diff summary
Wraps the `aiModeVal.textContent` write at `HUDController.js:1221` in `if (isDevMode(state)) { … legacy full string … } else { … "AI online" / "AI offline" … }`. `isDevMode` was already imported at line 7; no new imports needed. Casual players see the compact two-word label; dev-mode (`?dev=1`, `localStorage.utopia:devMode=1`, `Ctrl+Shift+D`, or programmatic `state.controls.devMode=true`) preserves the legacy full string for local debugging. Companion gates verified already in place — Steps 3-5 collapsed to verify-only.

Selected Suggestion A from the plan, but reduced to a single-site fix because the plan's audit (Step 1) confirmed the other three sites were already gated. Suggestion B (skip audit, only fix `aiModeVal`) was effectively realised. Suggestion D (FREEZE-VIOLATING redesign) explicitly NOT taken.

## Files changed
- `src/ui/hud/HUDController.js` (+10 / -1 LOC: `isDevMode(state)` branch + comment block at `aiModeVal.textContent` write, line ~1221)
- `test/hud-debug-leak-gate.test.js` (+138 LOC, NEW: 4 cases — casual `AI offline`, casual `AI online`, dev-mode via `state.controls.devMode`, dev-mode via `body.dev-mode` class)
- `CHANGELOG.md` (+18 LOC: v0.10.1-n entry under Unreleased)
- `assignments/homework7/Final-Polish-Loop/Round12/Implementations/Plan-R12-debug-leak-gate.commit.md` (this file)

Total source/test delta: ~+30 / -1 LOC (excluding the new-test boilerplate, which mirrors `hud-dev-string-quarantine.test.js`'s harness verbatim). Plan target was ~40 LOC.

## Tests
- Targeted: `node --test test/hud-debug-leak-gate.test.js` → **4 pass / 0 fail / 0 skip**
- Full suite: `node --test test/*.test.js` → **1997 pass / 0 fail / 4 skip** (120 suites, ~76 s wall-clock). +4 over the prior baseline (1993) from the new test file's four cases. Baseline preserved.

## Acceptance (from plan §Acceptance)
1. Casual-mode boot: `#aiModeVal.textContent` is `"AI offline"` (when `ai.enabled === false`) or `"AI online"` (when `true`) — no `proxy=`, `model=`, `mode=fallback`, or `gpt-` substring. Verified by tests 1 + 2.
2. Casual-mode boot: `#storytellerWhyNoWhisper.textContent === ""` and hidden — already pinned by `hud-dev-string-quarantine.test.js`, gate verified at line 1561.
3. Casual-mode boot: `#aiAutomationSummaryBody.innerHTML` contains no `coverage=`/`proxy=`/`model=` substring — already gated at `AIAutomationPanel.js:134`, verified.
4. Casual-mode boot: storyteller-offline toast does not contain `[timeout]` — already gated at `GameApp.js:2106`, verified.
5. Dev-mode boot (`?dev=1`): all four engineering strings render with full identifiers — verified by tests 3 + 4 (both `state.controls.devMode` and `body.dev-mode` class signals).
6. New unit test `test/hud-debug-leak-gate.test.js` passes — yes (4/4).
7. Test baseline 1993 → 1997 (+4 net), 0 fail, 4 skip — preserved.

## Commit
HEAD: `ef4c29e` — `fix(ui-debug r12): Plan-R12-debug-leak-gate — gate aiModeVal corner chip behind isDevMode`
Parent: `4cfc3b8` (R12 Plan-R12-glued-tokens)

## Confirmation
```
$ git log --oneline -2
ef4c29e fix(ui-debug r12): Plan-R12-debug-leak-gate — gate aiModeVal corner chip behind isDevMode
4cfc3b8 fix(ui-narrative r12): Plan-R12-glued-tokens — Title-Case + colon-space AI summary
```
