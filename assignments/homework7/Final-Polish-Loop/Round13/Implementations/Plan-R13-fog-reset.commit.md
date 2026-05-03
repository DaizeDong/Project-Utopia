# Plan-R13-fog-reset — Implementation log

**Status:** SUCCESS — all acceptance criteria met, committed.
**Plan:** `assignments/homework7/Final-Polish-Loop/Round13/Plans/Plan-R13-fog-reset.md`
**Track:** code only
**Priority:** P0 (cross-run fog bleed bug)
**Parent commit:** 527f460
**Head commit:** see `git log --oneline -2` below
**Wall clock:** ~15 min

## What changed

1. **`src/app/GameApp.js`** (+10 LOC) — Added explicit `next.fog = { visibility: null, version: 0 }` reset in `regenerateWorld` immediately after `createInitialGameState`, before `deepReplaceObject`. This ensures `VisibilitySystem`'s existing length-mismatch reseed branch fires on the next tick. `restartSession` and `resetSessionWorld` both route through `regenerateWorld`, so the single patch covers all session-start paths.

2. **`test/fog-reset-on-regenerate.test.js`** (+95 LOC, NEW) — 2 cases:
   - `regenerateWorld clears prior run's fog visibility array` — boots a run, walks agents to expand the explored area beyond the fresh-boot box, then mimics `regenerateWorld` (createInitialGameState + `next.fog = ...` + deepReplaceObject). Asserts visibility is `null` immediately after, then `(2*r+1)²` revealed tiles after one VisibilitySystem tick (no carryover).
   - `dim-change still reseeds` — regression guard for the existing length-mismatch branch.

3. **`CHANGELOG.md`** (+10 LOC) — New `Plan-R13-fog-reset` entry under Unreleased.

## Acceptance criteria (all met)

- [x] After `regenerateWorld()`, `state.fog.visibility === null` at the moment of the call.
- [x] Cross-run fog bleed eliminated: revealed-tile count after regenerate + 1 tick equals fresh-boot box.
- [x] Save/load round-trip unaffected (loadSnapshot writes its own fog, separate code path).
- [x] Test baseline preserved + 2 new cases pass.
- [x] CHANGELOG.md updated.

## Tests

- New test: `test/fog-reset-on-regenerate.test.js` — both cases pass.
- Related tests confirmed green: `test/fog-visibility.test.js` (3/3 pass), `test/launcher-regenerate-contract.test.js` (8/8 pass), `test/v0.10.1-restart-workers-move.test.js` (2/2 pass).
- Full suite: **2008 pass / 0 fail / 4 skip** (was 2006 / 0 fail / 4 skip; +2 from new cases).

## Files changed (committed)

- `src/app/GameApp.js`
- `test/fog-reset-on-regenerate.test.js`
- `CHANGELOG.md`

## Risks / followups

- Per the plan §5: other state slices may have similar bleeds. Out of scope for this P0; an A1-stability follow-up plan can audit.
- LoadSnapshot path independently brings back its own fog state — unchanged behaviour, correct.
