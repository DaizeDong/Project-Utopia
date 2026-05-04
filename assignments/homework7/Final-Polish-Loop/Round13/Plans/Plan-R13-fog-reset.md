---
reviewer_id: Plan-R13-fog-reset (R13 user issue #7)
feedback_source: assignments/homework7/Final-Polish-Loop/Round13/Feedbacks/summary.md
round: 13
date: 2026-05-01
build_commit: 527f460
priority: P0
track: code (fog state cleanup on session restart — fixes cross-run bleed)
freeze_policy: hard
rollback_anchor: 527f460
estimated_scope:
  files_touched: 1
  loc_delta: ~30
  new_tests: 1
  wall_clock: 25
conflicts_with: []
---

# Plan-R13-fog-reset — Bug fix: fog state from prior run persists into new game; clear on session-start

**Plan ID:** Plan-R13-fog-reset
**Source feedback:** R13 user directive issue #7 (the "fog reset" sub-bug, distinct from the fog-aware-build directive #5+#7 reorg) — "after game over + new game/regenerate, fog state from prior run persists. Find fog/visibility reset path in regenerate() or session-start. Ensure FogSystem state cleared on any session-start."
**Track:** code
**Priority:** **P0** — Carrying fog state across runs means the second game starts with the first game's exploration map, which both leaks information (player can see where they explored last run, including hostile zones they shouldn't know about) AND breaks the AI proposer fog gate from `Plan-R13-fog-aware-build` (proposers think tiles are EXPLORED when they're not in this run).
**Freeze policy:** hard — pure bug fix; clears `state.fog` on regenerate/session-start. No new mechanic.
**Rollback anchor:** `527f460`

---

## 1. Core problem (one paragraph)

`GameApp.regenerateWorld()` at `src/app/GameApp.js:1575-1684` rebuilds the grid via `createInitialGameState({ bareInitial: true })` and then `deepReplaceObject(this.state, next)`. Inspecting `VisibilitySystem.update`, the system reseeds `state.fog.visibility` only if `fog.visibility.length !== width * height` — i.e. if the dimensions match (which they do across regenerates with the same map size), it KEEPS the old visibility array. `createInitialGameState({ bareInitial: true })` likely does NOT reset `state.fog` to a clean object, so deepReplaceObject preserves the old array. Result: cross-run fog bleed.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — explicitly null out `state.fog` in regenerateWorld and session-start

Two-line fix at the top of regenerateWorld (after `next = createInitialGameState(...)` AND before `deepReplaceObject`), and in session-start / new-game path:
```js
// R13 #7 fog-reset: ensure VisibilitySystem reseeds initial reveal on every new session
next.fog = { visibility: null, version: 0 };
```
After `deepReplaceObject(this.state, next)`, the old `state.fog.visibility` Uint8Array is replaced by `null`, so VisibilitySystem's next tick reseeds it via the existing length-mismatch branch.

Also audit `setRunPhase('active')` for a similar leak — if there's a session-start path that doesn't go through regenerateWorld (e.g. "start over" button after game-over), apply the same fix there.

- Files: `src/app/GameApp.js` (regenerateWorld + any newGame/restart path).
- Scope: ~10 LOC fix + ~20 LOC test.
- Expected gain: closes user issue #7 fog-reset bug.
- Main risk: very low — explicit null is the cleanest signal to VisibilitySystem to reseed.

### Suggestion B (in-freeze) — fix in VisibilitySystem instead

Add a `state.fog.runId !== state.session.runId` check inside VisibilitySystem.update and reseed when mismatch. More invasive (adds a runId concept) and couples VisibilitySystem to session lifecycle. Skip.

### Suggestion C (FREEZE-VIOLATING) — fog-of-war setting toggle

Out of scope.

## 3. Selected approach

**Suggestion A** — surgical 2-line fix at the regenerate path, mirrored at any session-start path.

## 4. Plan steps

- [ ] **Step 1 — Audit all session-start paths in `GameApp.js`.**
  Grep for `regenerateWorld`, `setRunPhase`, `newGame`, `restartRun`, `resetSession`. Document each entry point.
  - Type: read

- [ ] **Step 2 — Patch `regenerateWorld` at `src/app/GameApp.js:1590` (after `createInitialGameState`).**
  Add immediately after the `const next = createInitialGameState(...)` line:
  ```js
  // R13 #7 Plan-R13-fog-reset: explicitly clear fog state so VisibilitySystem
  // reseeds the initial reveal on every new session. Without this, the prior
  // run's visibility Uint8Array is preserved across regenerate (because the
  // length-mismatch reseed branch only fires when grid dims change, which
  // they typically don't).
  next.fog = { visibility: null, version: 0 };
  ```
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Apply the same fix to any other session-start path identified in Step 1.**
  E.g. if there's a "Restart with same map" path that doesn't call regenerateWorld, add the same `state.fog = { visibility: null, version: 0 }` reset.
  - Type: edit (conditional)
  - depends_on: Step 2

- [ ] **Step 4 — Confirm `createInitialGameState` includes `fog: { visibility: null, version: 0 }` in its base initial state.**
  Grep `createInitialGameState` in `src/app/types.js` or wherever defined. If it doesn't have a `fog` field, add it (so cold-start has a deterministic seed too).
  - Type: edit (conditional)
  - depends_on: Step 3

- [ ] **Step 5 — Unit test `test/fog-reset-on-regenerate.test.js` (~30 LOC).**
  Test cases:
  1. Boot game, walk worker around to reveal a chunk of fog. Snapshot `state.fog.visibility` non-zero count.
  2. Call `regenerateWorld({ templateId, seed })`. Verify `state.fog.visibility` is null OR (after one tick) is reseeded with only the initial-reveal box around the spawn point (not the prior run's exploration).
  3. Same template + seed → after regenerate + 1 tick, fog visibility count = (2 * fogInitialRevealRadius + 1)^2 (no carryover).
  4. Different template / dim change → also reseeds (regression guard for the existing length-mismatch branch).
  - Type: add
  - depends_on: Step 4

- [ ] **Step 6 — CHANGELOG.md entry.**
  *"R13 #7 Plan-R13-fog-reset (P0 bug fix): fog visibility array now resets on every regenerateWorld() / new-session call. Previously the prior run's exploration leaked into the new run because VisibilitySystem only reseeded on grid-dim mismatch."*
  - Type: edit
  - depends_on: Step 5

## 5. Risks

- **Other state slices may have similar bleeds.** Out of scope for this plan; A1-stability follow-ups can audit.
- **Possible affected tests:** `test/visibility-system*.test.js`, `test/fog*.test.js`, `test/regenerate*.test.js`, `test/save-load*.test.js`.
- **Save/load round-trip:** confirm loadSnapshot doesn't subsequently overwrite the freshly-cleared fog with a stale snapshot. (Not the same code path; loadSnapshot brings back its own fog state — correct behaviour.)

## 6. Verification

- **New unit test:** `test/fog-reset-on-regenerate.test.js` (Step 5).
- **Manual:** dev server, walk worker around to reveal terrain, click "New Game" or "Regenerate" → confirm fog returns to fresh initial-reveal box (not prior exploration).
- **No bench regression** — pure data reset.

## 7. UNREPRODUCIBLE marker

N/A — observable per user directive.

---

## Acceptance criteria

1. After `regenerateWorld()`, `state.fog.visibility` is null at the moment of the call (and reseeded by VisibilitySystem on the next tick to the initial-reveal box).
2. Cross-run fog bleed eliminated: visible-tile count immediately after regenerate + 1 tick matches a fresh boot's count.
3. Save/load round-trip still works correctly.
4. Test baseline 1646 / 0 fail / 2 skip preserved + new test passes.
5. CHANGELOG.md updated.

## Rollback procedure

```
git checkout 527f460 -- src/app/GameApp.js src/app/types.js && rm test/fog-reset-on-regenerate.test.js
```
