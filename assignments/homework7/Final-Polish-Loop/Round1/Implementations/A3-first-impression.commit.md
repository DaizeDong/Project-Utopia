---
reviewer_id: A3-first-impression
plan_source: Round1/Plans/A3-first-impression.md
round: 1
date: 2026-05-01
parent_commit: 99bef3b
head_commit: 5d0bc5f
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 7/8
tests_passed: 1695/1702
tests_new:
  - test/scene-renderer-pointer-priority.test.js
  - test/build-toast-routes-honest-progress.test.js
---

## Steps executed

- [x] **Step 1**: `src/render/SceneRenderer.js:524` — orthoSize factor 0.65 → 1.05;
      `:530` zoom 1.12 → 1.0; mirrored at `resetView()` (line ≈4030 after A2 drift).
- [x] **Step 2**: `src/render/SceneRenderer.js:372` — `DEFAULT_CAMERA_VIEW.zoom` 1.12 → 1.0
      so `applyViewState(DEFAULT_CAMERA_VIEW)` matches the constructor frustum.
- [x] **Step 3**: `src/render/SceneRenderer.js:#onPointerDown` — reordered so a placement
      tool tries `#pickTile` + `placeToolAt` first; entity-pick is the fallback,
      triggered when (a) user is inside the 24 px guard annulus or (b) placement
      was rejected with `reason === "occupiedTile"`. Other rejections (water,
      hardCap, missing_resource_node, …) surface the rejection toast as
      dominant feedback. Extracted `decidePointerTarget` pure helper for unit
      testing.
- [x] **Step 4**: `src/world/scenarios/ScenarioFactory.js:1182` — added
      `getRouteEndpointStatus(grid, anchorFrom, anchorTo)` returning
      `{ fromOnNetwork, toOnNetwork, connected }`. Reuses
      `isInfrastructureNetworkTile` and `hasInfrastructureConnection`. No
      collision with existing exports.
- [x] **Step 5**: `src/simulation/construction/BuildAdvisor.js` road branch — replaced
      the "extends the first network line" copy with a counter-honest toast:
      `"Road at (x,y): 1 segment placed, K/N route anchors linked."` where K
      counts how many route endpoints currently sit on the infrastructure
      network and N = `routeLinks.length × 2`. Falls back to the warehouse-
      distance variant when the scenario has no `routeLinks`. Imports the
      new `getRouteEndpointStatus` helper.
- [x] **Step 6**: `test/build-toast-routes-honest-progress.test.js` (new file, 5
      cases) — asserts the new copy on a 16×16 synthetic grid: mid-map road
      with no anchor touched → `0/2 route anchors linked`; road on an anchor
      → `1/2`; no-scenario fallback path; touching-existing-road path; and a
      summarizeBuildPreview surface check.
- [x] **Step 7**: `test/scene-renderer-pointer-priority.test.js` (new file, 7
      cases) — tests the extracted `decidePointerTarget` helper for the
      tool-vs-entity priority decision: placement+legal+no-entity → place;
      placement+illegal-tile → place (so rejection surfaces); placement+
      occupied-by-entity → select; placement+near-worker → select; select
      tool → select; inspect tool → select; null/undefined tool → select.
- [ ] **Step 8**: SKIPPED (TRACK boundary) — CHANGELOG.md edit is forbidden on
      track=code per implementer.md's track table. Deferred to the docs-track
      validator / closeout.

## Tests

- pre-existing skips: 3 (carried from baseline)
- pre-existing/flaky failures (not introduced by this commit, still red):
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
    (passes in isolation; flaky under full-suite ordering)
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
    (passes in isolation; flaky under full-suite ordering)
- new tests added:
  - `test/scene-renderer-pointer-priority.test.js` (7 pass)
  - `test/build-toast-routes-honest-progress.test.js` (5 pass)
- failures resolved during iteration:
  - `entity-pick-hitbox.test.js`: "SceneRenderer source wires proximity
    fallback into #pickEntity and a build-tool guard" — its regex defended
    the old "Click a bit closer to the worker (hitbox is small)" UX text,
    which Step 3 retired by design (the 24 px guard now redirects the click
    to entity-pick instead of blocking placement). Updated the regex to the
    new redirect message `"Selecting nearby unit (release the build tool to
    place)"`. Test now passes.

## Deviations from plan

- **Step 8 SKIPPED**: track=code forbids CHANGELOG.md edits — surfaced
  explicitly in the commit body so the docs-track validator can pick it up.
- **Step 1 line numbers**: A2 (parent commit 99bef3b) shifted SceneRenderer.js
  internals; the constructor block I targeted is around line 524–531, the
  resetView mirror is around line 4030 (was 3944 in the plan text). Re-
  anchored by semantic search; landed on the correct two literals.
- **Step 5 anchor count**: plan says "× 2" (endpoint count); the
  implementation uses `routeLinks.length × 2` exactly as written. The HUD
  chip uses whole-route connectivity (`connectedRoutes / routes.length`); the
  toast uses endpoint-on-network (`linked / total`). They are honest but
  different gauges — both advance as the player connects more anchors.
- **Decision helper extraction**: the plan said "extract the priority
  decision into a pure module function" only conditionally ("if `#onPointerDown`
  is hard to instantiate without WebGL"). Done unconditionally so the test
  in Step 7 has a deterministic surface; the renderer's `#onPointerDown`
  body still implements the same priority order so the helper stays
  load-bearing (truth source) rather than orphaned.

## Freeze / Track check 结果

- **freeze_check: PASS** — no new tile / role / building / mood / mechanic /
  audio / UI panel was added. The work is purely (a) two scalar constants,
  (b) a click-priority swap, (c) one read-only diagnostic helper, and (d)
  toast-copy strings.
- **track_check: PASS** — only `src/**` and `test/**` were modified. No
  README, no `assignments/homework7/*.md`, no CHANGELOG, no `docs/`.

## Handoff to Validator

Validator should focus on:

- **First-paint smoke**: `npx vite` → load http://localhost:5173 → click
  "Start Colony". Confirm the full 96×72 grid (both `west lumber route` and
  `east ruined depot` markers) is visible in a single frame, not the
  ~58%-width sliver the reviewer reported.
- **Click-priority manual run**: with Road pre-selected, click a grass tile
  near a wandering animal. Expect a road blueprint, NOT entity selection.
  Click a water tile with Road still selected → expect the red rejection
  toast, NOT entity selection.
- **Honest road toast**: place a road in the middle of the map (no anchor
  touched). Toast must read `0/N route anchors linked` and the HUD chip
  `routes 0/N` must agree.
- **FPS regression**: `browser_evaluate` average over 5 s ≥ 30 fps. The
  camera change does not affect render cost (same draw call count); the
  pointer reorder runs only on click and the toast-copy change only formats
  a string, so render-loop perf is unchanged.
- **Long-horizon benchmark**: optional, but `scripts/long-horizon-bench.mjs`
  seed 42 temperate_plains DevIndex should stay within −5% of the v0.10.1-m
  baseline because none of the changes touch simulation balance.
- **Prod build smoke**: `npx vite build` then `vite preview` 3-min smoke
  with no console errors.
- **CHANGELOG follow-up**: a docs-track plan should pick up the v0.10.1-n
  bug-fix bullets (camera, click priority, honest road toast).
