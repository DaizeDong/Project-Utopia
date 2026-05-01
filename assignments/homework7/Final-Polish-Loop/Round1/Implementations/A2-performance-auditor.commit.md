---
reviewer_id: A2-performance-auditor
plan_source: Round1/Plans/A2-performance-auditor.md
round: 1
date: 2026-05-01
parent_commit: 9b77339
head_commit: <will-fill-after-commit>
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 5/5
tests_passed: 1683/1690 (3 skip, 4 pre-existing fail)
tests_new: test/perf-allocation-budget.test.js
---

## Steps executed

- [x] **Step 1**: `src/render/SceneRenderer.js#pressureLensSignature` —
      added length / version / scalar pre-filter that returns the cached
      string by *identity* when no input has changed. 11 cache fields
      tracked: `_cachedLensSignature`, `_lastEventsLen`, `_lastHotspotsLen`,
      `_lastGridVerForLensSig`, `_lastTrafficVerForLensSig`,
      `_lastTrafficHotspotsForLensSig`, `_lastObjectiveIdxForLensSig`,
      `_lastWeatherCurrentForLensSig`, `_lastWeatherHazardForLensSig`,
      `_lastWeatherScoreForLensSig`, `_lastSpatialSummaryForLensSig`. Cache
      miss falls through to the original full string build. Eliminates
      ~6 string-builds + 2 transient arrays per stable frame.

- [x] **Step 2**: `src/render/SceneRenderer.js#updatePressureLensLabels`
      projection / dedup loops — added 5 instance-scope scratch buffers in
      the constructor (`this._labelProjectedScratch`, `_labelEntriesScratch`,
      `_labelEntryToPoolIdxScratch`, `_labelVisibleCandidatesScratch`,
      `_labelVisibleScratchMap`) reused via `arr.length = 0` and
      `map.clear()`. Eliminates 4 transient arrays + 1 transient Map
      per frame. **Note**: the inner `slice(0, labelBudget)` was preserved
      verbatim because `test/heat-lens-label-budget.test.js` literal-greps
      for that exact pattern as a smoke-check that the budget is applied;
      the slice produces a small bounded array (≤ 24) per frame, which is
      vastly outweighed by the 5 allocations now eliminated.

- [x] **Step 3**: `src/render/SceneRenderer.js#entityMeshUpdateIntervalSec` —
      small-entity branch (< 350 totalEntities) now returns `1 / 30` (was
      `0` = full RAF cadence). When `state.controls.selectedEntityId != null`
      the throttle is bypassed (returns 0) so the selection ring stays
      smooth. Halves InstancedMesh.needsUpdate work at 60 Hz RAF for the
      Round-1 P3/P4 measurement profile (pop ≈ 21).

- [x] **Step 4**: `src/render/SceneRenderer.js#updateEntityMeshes` —
      `renderEntityLookup = { workers, visitors, herbivores, predators }`
      object-literal (allocated every frame) replaced with field-by-field
      assignment onto the constructor-allocated lookup object. Eliminates
      one 4-key object literal per frame.

- [x] **Step 5**: `test/perf-allocation-budget.test.js` — new test file
      with 8 assertions covering: (a) pressureLensSignature cache
      identity (`===`) over 50 stable frames, (b) cache invalidation
      on grid.version / events.active.length / ecology.hotspotFarms.length
      bumps, (c) Array `length = 0` reuse semantics over 100 frames,
      (d) Map `clear()` reuse semantics over 100 frames, (e) source-level
      smoke check that SceneRenderer.js actually declares the expected
      cache + scratch field names, (f) source-level check that the
      `1 / 30` throttle and `selectedEntityId` fast-path are present.
      All 8 tests pass; soft-skip via `CI_FAST=1`.

## Tests

- pre-existing skips (3, unchanged):
  - `road-roi exploit-regression` (latent balance issue, v0.8.8)
  - `perf-system-budget` (CI_FAST gate)
  - one more (CI_FAST or LLM gate)
- pre-existing failures (4, baseline confirmed via stash-and-rerun):
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
  All 4 pre-date this commit (stash-rerun showed identical failures
  without A2 changes); they are A5 BALANCE-shift fallout per the runtime
  context note.
- new tests added: `test/perf-allocation-budget.test.js` (8 tests, all pass)
- failures resolved during iteration:
  - Initial Step 2 rewrite replaced `visibleCandidates.slice(0, labelBudget)`
    with a `Math.min` for-loop, which broke `heat-lens-label-budget.test.js`
    line 30 (regex literal-grep for that exact text). Reverted that one
    line back to `slice(0, labelBudget)` while keeping the
    `_labelVisibleScratchMap` reuse — net: 4 of 5 transient allocations
    eliminated instead of 5 of 5.

## Deviations from plan

- **Step 2 partial**: kept `visibleCandidates.slice(0, labelBudget)` in
  the loop iterator because a pre-existing source-grep test
  (`test/heat-lens-label-budget.test.js`) asserts that exact substring
  exists in SceneRenderer.js. The slice is a small bounded allocation
  (≤ 24 items) and only one of 5 per-frame allocations the plan
  targeted; the other 4 (`projected[]`, `entries[]`, `entryToPoolIdx[]`,
  `visible Map`) are all on instance scratch buffers as the plan directs.
- **Step 5 test design**: SceneRenderer cannot be instantiated under
  `node --test` (no DOM / WebGL). The plan explicitly authorised falling
  back to "只测 #pressureLensSignature 的 cache identity（不需要 DOM）"
  in this case. The test uses a faithful surrogate that mirrors the
  exact pre-filter logic from the production class plus a source-level
  field-name smoke check to catch silent contract drift.

## Freeze / Track check 结果

- **Freeze check**: PASS — no new TILE / role / building / panel / audio
  asset added. Pure internal data-structure / control-flow optimisation
  in the renderer.
- **Track check**: PASS — all changes confined to `src/render/` and
  `test/`. No README / CHANGELOG / docs / assignments touched in this
  commit.

## Handoff to Validator

- **FPS smoke**: launch `npx vite` → `http://localhost:5173?perftrace=1`,
  run Temperate Plains for ~120 s real-time (pop ~21), record 5 s on
  DevTools Performance. Expect `SceneRenderer.render` self-time to drop
  ~0.5–1.0 ms; `__fps_observed.fps` 5 s avg should rise from baseline
  ~54.6 toward ~57–58 (reminder: headless RAF is throttled, must use a
  real browser). FPS regression threshold ≥ 55 fps.
- **prod build**: `npx vite build` should succeed; `npx vite preview`
  smoke ≥ 3 min with no console errors and no label rendering
  artefacts (overlapping / stale labels).
- **Pressure lens visual**: hover heat-lens markers; verify labels
  appear / dedup / merge correctly at zoom 1.12 (label budget 5) and
  zoom 2.4 (expanded). Trigger weather change and event spawn — confirm
  labels update within 1 frame (cache invalidates on input change).
- **Selection ring smoke**: click a worker → selection ring should track
  the unit at full RAF cadence (Step 3 fast-path). Click empty tile →
  ring disappears, throttle re-engages.
- **Benchmark sanity**: `node scripts/long-horizon-bench.mjs --seed 42
  --template temperate_plains` — DevIndex must not regress > 5 % vs
  baseline (this commit is purely renderer; sim untouched).
- **Conflict surface for A3 / A4**: this commit modifies
  `#pressureLensSignature` (line ~2568), `#updatePressureLensLabels`
  (lines ~2256-2310), the constructor (lines ~575-580), and
  `#entityMeshUpdateIntervalSec` (lines ~3145-3170). A3 (camera /
  onPointerDown) and A4 (InstancedMesh setMatrix jitter) operate on
  different line ranges per the runtime context. The 1/30 s throttle
  intentionally aligns with sim fixed-step, so any A4 jitter applied
  inside `setInstancedMatrix` is unaffected — it just runs at 30 Hz
  instead of 60 Hz at the small-entity-count regime.
