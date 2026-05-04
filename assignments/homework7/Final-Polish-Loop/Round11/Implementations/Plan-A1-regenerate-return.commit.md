---
implementer_id: R11-A1-regenerate-return (final R11, 6/6)
plan: assignments/homework7/Final-Polish-Loop/Round11/Plans/Plan-A1-regenerate-return.md
parent_commit: d243c96
head_commit: fa6cda1
track: code
freeze_policy: hard (compliant)
date: 2026-05-01
---

# Plan-A1-regenerate-return — Implementation Log

## Status: SHIPPED

Mirrors `saveSnapshot()` / `loadSnapshot()`'s `{ok:true, ...}` contract on
`__utopiaLongRun.regenerate()`. Closes A1-stability-hunter R11 P2 #1.

## Parent → Head

```
d243c96 (parent)  →  fa6cda1 (head)
```

`git log --oneline -2` confirms:
```
fa6cda1 api(launcher r11): Plan-A1-regenerate-return — {ok:true,...} return contract
d243c96 ux(modals r11): Plan-PII-modal-zstack — splash stacking guard + LLM degradation toast
```

## Files (4 total — all in-scope code/test/changelog only)

| File | Δ | Notes |
|------|---|-------|
| `src/app/GameApp.js` | +16 LOC | Input validation guard at top of `regenerateWorld` (`MAP_TEMPLATES` membership + `Number.isFinite` seed check); success-shape return at bottom. |
| `src/main.js` | +3 / -1 | `__utopiaLongRun.regenerate` shim: `?? null` → `?? {ok:false, reason:'notReady', reasonText}` matching `saveSnapshot`/`loadSnapshot` shims. |
| `test/launcher-regenerate-contract.test.js` | +136 LOC NEW | 6 cases: undefined-app notReady, success shape, invalid template, invalid seed, chained-call regression guard, `template`-alias composition. |
| `CHANGELOG.md` | +14 LOC | New `[Unreleased] v0.10.1-n Plan-A1-regenerate-return` section at top. |

`MAP_TEMPLATES` was already imported in `GameApp.js` (line 67) — no new imports.

## Implementation notes

- **Echo committed state, not requested args.** Success return uses `this.state.world.mapTemplateId` / `this.state.world.mapSeed` / `this.state.session.phase` (post-`deepReplaceObject` + post-`#setRunPhase`) rather than the request bag. Matters when caller passes `undefined` template — they observe the resolved default.
- **Validation rejects, doesn't fall back.** Pre-fix, `createInitialGameState` silently coerced unknown templateIds to `DEFAULT_MAP_TEMPLATE_ID`. New guard surfaces this as `{ok:false, reason:'invalid_template'}` so harness scripts get a clear signal. Empty/undefined still pass through to default-resolution (preserves existing call sites that omit templateId).
- **Internal callers unaffected.** `onRegenerateMap`, `resetSessionWorld`, `startSession` (3 call sites in GameApp + 1 callback wiring) all discard the return value. Verified via `Grep regenerateWorld src/`.
- **No existing test asserted `regenerate(...) === null`** — confirmed via Grep across `test/`. Step 4 (caller cleanup) was a no-op as the plan predicted.

## Tests

Full suite (run twice): **1989 pass / 0 fail / 4 skip** (1993 total, 120 suites). +6 over baseline from the new contract test.

Targeted run on the new file:
```
1..6
# tests 6
# pass 6
# fail 0
```

## Verification

- Acceptance criteria 1-7 from the plan all met.
- Hard-freeze compliant: no new mechanic, no new HUD pill, no behaviour change for valid inputs other than the return shape. Invalid-input behaviour does change (was: silent fallback; is: `{ok:false, reason}`) — this is the explicitly-requested A1 contract that mirrors `loadSnapshot`'s "missing slot" shape.

## Rollback

```
git revert fa6cda1
```
