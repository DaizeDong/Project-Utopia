---
reviewer_id: A1-stability-hunter
plan_source: Round3/Plans/A1-stability-hunter.md
round: 3
date: 2026-05-01
parent_commit: 0344a4b
head_commit: c002b64
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 6/6
tests_passed: 1727/1736
tests_new:
  - test/snapshot-tileState-roundtrip.test.js
  - test/snapshot-listener-strip.test.js
---

## Steps executed

- [x] Step 1: `src/app/snapshotService.js` — added `stripUncloneable(value, seen)` recursive scrubber (cycle-guarded WeakSet, preserves Map/Set/TypedArray/Array/plain-object structure, drops only `typeof === "function"` fields). Wired into `ensureStructuredClone` entry point so every clone path (save + restore + exportJson + importJson) benefits.
- [x] Step 2: `src/app/snapshotService.js` `makeSerializableSnapshot` — added `if (state.grid.tileState instanceof Map) snapshot.grid.tileState = mapToEntries(state.grid.tileState);` after `grid.tiles` line, symmetric with `ai.groupPolicies` handling.
- [x] Step 3: `src/app/snapshotService.js` `restoreSnapshotState` — rehydrate `snapshot.grid.tileState` as Map; tolerate three input shapes (already-Map from in-process structuredClone, entries-array from JSON-roundtrip, missing/legacy → empty Map). Defensive against legacy snapshots.
- [x] Step 4: `src/app/GameApp.js:1625` `saveSnapshot` — wrapped `snapshotService.saveToStorage(...)` in try/catch; failure surfaces via existing `controls.actionMessage` + `actionKind="error"` channel and returns `{ok:false, reason:'saveError', reasonText}`. No `this.toast` exists on GameApp (plan suggested it) — used the `actionMessage` channel that the rest of the file uses for user-visible feedback.
- [x] Step 5: `test/snapshot-tileState-roundtrip.test.js` — new, 2 tests. (a) inject `{idx:5, payload:{nodeFlags:2, yieldPool:99, fertility:0.92, salinized:0.1}}`, JSON roundtrip, assert Map identity + field fidelity. (b) legacy tolerance: delete `tileState` from payload, restore must return empty Map without throwing.
- [x] Step 6: `test/snapshot-listener-strip.test.js` — new, 2 tests. (a) inject function leaks at top-level / nested / inside arrays; assert `makeSerializableSnapshot` does not throw and all function fields are dropped while sibling fields preserved. (b) end-to-end: leak + JSON roundtrip + restore preserves legitimate state and elides leak.

## Tests

- pre-existing skips: 3 (unchanged)
- new tests added: 4 (all green)
- pre-existing failures (6, identical on parent commit 0344a4b — verified via stash):
  - `exploit-regression: escalation-lethality` (R2 anticipated)
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires` (food-rate-breakdown)
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role` (role-assignment STONE)
  - `RaidEscalator: DI=30 yields tier 3` (raid-escalator)
  - `RaidFallbackScheduler: pop < popFloor does not trigger` (raid-fallback-scheduler)
  - `v0.10.0-c #2 scenario E walled-warehouse` (R2 anticipated "scenario E food=5")
- known flake observed: `worker-ai-bare-init.test.js` "Fix 2/3 stuck >3.0s simulated" — wall-clock dependent; failed in 1st full-suite run, passed in 2nd full-suite run + isolated run. Not introduced by this commit (also passes on parent commit 0344a4b in isolation).
- failures resolved during iteration: none (all green on first try)

## Deviations from plan

- Plan Step 4 referenced `this.toast.warn(...)` but GameApp has no `toast` member; substituted the existing `controls.actionMessage` + `actionKind="error"` channel which is the canonical user-feedback path used throughout GameApp.js. Behavioural intent preserved (UI surfaces the failure, main loop does not crash).
- Step 1 scope clarification: plan mentioned "EventTarget / NPCBrain listener arrays" — chose conservative implementation that strips only `typeof === "function"` (mitigation noted in plan §5). Cycle-guard via WeakSet handles the inevitable world-graph back-references safely.
- Plan Step 3 included extra defensive branches not strictly in the spec (handle in-process Map / entries-array / missing) — added these because `restoreSnapshotState` is also called via `restoreSnapshotState(makeSerializableSnapshot(state))` in tests/in-process flows (no JSON roundtrip), where structuredClone preserves Map identity and `entriesToMap(Map)` would have collapsed it.

## Freeze / Track check 结果

- freeze_check: PASS — no new TILE / role / building / mood / UI panel / audio asset.
- track_check: PASS — only `src/app/*.js` and `test/snapshot-*.test.js` modified. Zero touches to README / assignments / CHANGELOG / docs.

## Handoff to Validator

- **Manual smoke**: `npx vite` → enter game → trigger 1 worker-kills-wolf event (so a death-toast listener is attached) → Debug panel → Save Snapshot → expect "Snapshot saved (default, N bytes)" not DataCloneError → Load Snapshot → expect colony state restored, no `tileState.get is not a function` in console, main loop continues rendering.
- **FPS check**: `window.__fps_observed.fps` Save before/after delta should be < 5%. `stripUncloneable` adds an O(N) walk on save; tileState `mapToEntries` adds O(tileStateSize) ≈ <10ms.
- **prod build**: `npx vite build` then `vite preview` → 1-min smoke + Save/Load → 0 console errors.
- **Long-horizon bench**: `node scripts/long-horizon-bench.mjs` seed=42 temperate_plains DevIndex must not regress > 5%.
- **Invariants preserved**: `ai.groupPolicies` Map roundtrip (existing test `snapshot-service.test.js` line 41 still green); `weather.hazardTileSet` Set rebuild (line 43 still green); `meta.view` `meta.rng` `session.phase` migrations all unchanged.
- **Rollback**: `git reset --hard 0344a4b` (single commit on top).
