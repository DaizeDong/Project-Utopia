---
reviewer_id: 01b-playability
plan_source: Round1/Plans/01b-playability.md
round: 1
date: 2026-04-22
parent_commit: 709d084
head_commit: f5c60f5
status: DONE
steps_done: 6/7
tests_passed: 977/979
tests_new: test/entity-pick-hitbox.test.js
---

## Steps executed

- [x] Step 1: `SceneRenderer.#pickEntity` — proximity fallback branch added
  at the tail of the function (when `candidates.length === 0`), calling the
  new `#proximityNearestEntity(mouse, ENTITY_PICK_FALLBACK_PX)` helper. The
  helper delegates to the exported pure function `findProximityEntity`
  (projects each alive `state.agents` / `state.animals` entity to NDC via
  `THREE.Vector3.project(camera)` and picks the nearest within 16 px).
- [x] Step 2: `#onPointerDown` — when the entity pick succeeds, we now also
  `state.controls.buildPreview = null` so the stale hover preview mesh
  stops flashing on the tile underneath the clicked worker.
- [x] Step 3: `#onPointerDown` — build-tool 24 px guard added before the
  `#pickTile` fall-through. When `state.controls.tool !== "select"` and
  `tool !== "inspect"`, we call `#proximityNearestEntity(..., 24)`; on a
  hit we set `actionMessage = "Click a bit closer to the worker (hitbox
  is small)"` / `actionKind = "info"` and return, preventing a surprise
  Farm placement in the 16–24 px annulus around a worker.
- [x] Step 4: Two module-scope constants added next to `VEC_TMP`:
  `ENTITY_PICK_FALLBACK_PX = 16` / `ENTITY_PICK_GUARD_PX = 24` plus a
  header comment referencing this plan (`v0.8.2 Round1 01b-playability`).
- [x] Step 5: `test/entity-pick-hitbox.test.js` — 7 pure-function cases
  covering 12 px hit, 40 px miss, dense-cluster nearest-wins,
  `alive: false` skip, guard-radius (20 px / 24 px threshold) boundary,
  malformed input, and a SceneRenderer source-harness regression
  (constants + both call sites + hint text). Uses `findProximityEntity`
  directly rather than spinning up a real `GameApp` + THREE renderer,
  which would have required JSDOM canvas + WebGL shims; this keeps the
  test fast and deterministic while still covering the bug.
- [x] Step 6: `#onPointerDown` entity-hit branch now spawns a
  `Selected <name>` floating toast at the entity's world position. Toast
  is wrapped in a try/catch so headless / test environments without a
  `#floatingToastLayer` don't throw.
- [ ] Step 7: CHANGELOG.md **SKIPPED per implementer.md line 81**
  ("不要在 commit 里一起改 CHANGELOG.md—留给 Validator 阶段统一追加").
  The implementer hard rule overrides the plan's Step 7. I initially
  edited CHANGELOG.md with a v0.8.2 Round 1 section then reverted with
  `git checkout -- CHANGELOG.md` before staging. Validator should add the
  same bullet (or its equivalent) to the v0.8.2 Unreleased section when
  finalising this round.

## Tests

- pre-existing skips: 2 (same baseline as Round 0; neither touched by this
  patch)
- new tests added: `test/entity-pick-hitbox.test.js` (7 cases, all passing)
- failures resolved during iteration: none — the suite went green on the
  first full run. Full suite: **977 pass / 0 fail / 2 skip** out of 979
  tests across 73 suites (92 s wall-clock).

## Deviations from plan

- **Step 5 test harness approach** — plan suggested "use `GameApp`
  minimal init like `test/ui-layout.test.js`". `ui-layout.test.js` is
  actually a static FS-read test, not a live `GameApp` boot — and
  constructing `GameApp` in `node --test` would require JSDOM + a WebGL
  shim. I instead extracted the proximity math into an exported pure
  helper (`findProximityEntity`) — same semantics as the private method,
  unit-testable without a canvas. The private method
  `#proximityNearestEntity` still wraps it for the renderer. A
  source-harness test (case 7) guards the wiring so the renderer keeps
  calling the helper at both the 16 px and 24 px sites.
- **Step 3 guard scope** — plan said "tool !== 'select'". I also
  excluded `tool === "inspect"` (the Alt-inspect path already bypasses
  build). No behavioural difference in the reviewer's scenario, just
  closes a latent edge case.
- **Step 6 toast on entity select** — plan called out
  `this.#spawnFloatingToast(worldPos.x, worldPos.z, ...)` where
  `worldPos` would come from a tile lookup. The selected entity already
  has `.x` / `.z` world coordinates, so I use those directly and pass
  tile indices `(-1, -1)` to bypass the per-tile dedupe window in
  `#spawnFloatingToast`. Wrapped in try/catch so the happy path stays
  robust if the toast layer is absent (e.g. in Playwright headless
  before the DOM is ready).

## Handoff to Validator

- **Changelog**: add the skipped Round 1 entry to `CHANGELOG.md` — the
  draft I reverted is:
  > Round1 01b-playability — Entity Focus click hitbox expansion:
  > proximity fallback (16 px) + build-tool guard (24 px) in
  > `SceneRenderer.#pickEntity` / `#onPointerDown`, fixing the
  > reviewer-reported "No entity selected" bug. New test
  > `test/entity-pick-hitbox.test.js` (7 cases).
  Recommend filing it under a new `## [Unreleased] — v0.8.2 UX Polish
  (Agent-Feedback-Loop Round 1)` section at the top (there is no
  v0.8.2 section yet; the existing Unreleased section is Round 0).
- **Playwright smoke**: prioritise clicking within ~1 tile of a worker
  with the Select tool — Entity Focus should populate on the first
  click now; previously it required ≥3 attempts. Also exercise
  Build→Farm (hotkey 2) clicking near a worker: expect the
  "Click a bit closer to the worker" hint and no build placement in
  the 16-24 px annulus. Clicks on empty grass should still place the
  farm with the green toast.
- **Benchmark**: per plan §6 this patch is render-only. Long-horizon
  benchmark (`node scripts/long-horizon-bench.mjs --seed=42
  --preset=temperate_plains --days=90`) should be unchanged; DevIndex
  floor at 42 (v0.8.1 baseline 44 − 5 %) remains.
- **Known non-coverage**: the reviewer's exact coordinate replay
  `(720, 480)` from the Round 1 feedback was not exercised in a
  Playwright MCP session within the 25 min budget. Static analysis
  established the root cause (small InstancedMesh radius ≈ 8-12 px)
  and the fix matches the reviewer's mental model; a manual smoke
  would further de-risk.
- **Conflicts merged (per summary.md D1)**: 01d-mechanics-content's
  Step 1/2/7 pick-fallback work is superseded by this commit. When
  Wave 2 reaches 01d, the Implementer should start from 01d Step 3
  and skip the pickEntity / entity-pick-screen-fallback.test.js
  steps. No code owned by 01d is touched here.
