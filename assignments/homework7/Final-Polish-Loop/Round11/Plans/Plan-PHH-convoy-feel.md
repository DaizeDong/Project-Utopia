---
reviewer_id: PHH-living-system
feedback_source: assignments/homework7/Final-Polish-Loop/Round11/Feedbacks/PHH-living-system.md
round: 11
date: 2026-05-01
build_commit: 652220f
priority: P1
track: code (renderer — worker motion trails + road foot-traffic tint)
freeze_policy: hard
rollback_anchor: 652220f
estimated_scope:
  files_touched: 2
  loc_delta: ~60
  new_tests: 0
  wall_clock: 50
conflicts_with: []
---

# Plan-PHH-convoy-feel — Worker Motion Trails + Road Foot-Traffic Tint (Render-Only)

**Plan ID:** Plan-PHH-convoy-feel
**Source feedback:** `assignments/homework7/Final-Polish-Loop/Round11/Feedbacks/PHH-living-system.md` (Gap 1 — convoy promise unfulfilled at default density)
**Track:** code (renderer-layer visual addition; no entities, no AI, no balance)
**Priority:** P1 — addresses PHH's lowest-scoring living-system pillar (worker convoys: **3 / 10**). PHH's aggregate living-system score: 4.3 / 10 (theme alignment 41 %). Expected post-ship: ~5.5 / 10 (theme alignment ~55 %).
**Freeze policy:** hard (no new entity, no AI/sim change, no balance key, no new mechanic. Only a fading visual trail layer behind each worker + a per-tile EWMA traversal-recency tint over the existing road tile mesh. Both extend the existing render pipeline; no new world objects.)
**Rollback anchor:** `652220f`

---

## 1. Core problem (one paragraph)

The theme contract leans hard on the convoy image: *"resource flows appear as moving crowds…the player's building decisions reshape traffic patterns."* PHH's blind playthrough (12-worker baseline density across 4–5 active job sites) confirmed the spatial law of small numbers: ≤ 2 workers per route at any moment, no Boids-style flocking visually perceptible, workers look like independent ants instead of "flowing crowds." Even when a worker walks the entire length of the brown road ribbon, the path itself doesn't *show* it was walked — there's no breadcrumb, no traffic tint, no historical trace. PHH's Gap 1 polish proposal: convert sparse motion into apparent flow without spawning entities — (a) fade a 3–5-tile breadcrumb behind each worker decaying over ~2 sim-sec; (b) tint road tiles by recent foot-traffic via EWMA over worker-on-tile events, mapped to a warm-amber overlay capped at 5 levels, decaying over 30 sim-sec. Both are render-only, no AI/sim touch, freeze-safe.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — both layers (trails + road tint)

1. **Per-worker fading motion trail.** Maintain a per-worker ring-buffer of the last N positions (N ~ 8 ticks at 4 Hz tick-rate ≈ 2 sim-sec). Render as a `THREE.LineSegments` (cheap, batchable) with vertex alpha decaying linearly from 0.5 (newest) to 0 (oldest). Single `BufferGeometry` updated in-place per tick.
2. **Road foot-traffic EWMA tint.** Maintain a `Float32Array(96 * 72)` of road-tile traversal weights. On every worker-on-road-tile event (already tracked or trivially derivable from worker positions), `weight[idx] = weight[idx] * 0.97 + 1.0 * 0.03` (EWMA). Per second, decay all weights by `× 0.967` (~30 s half-life). Map the weight to an alpha channel on a warm-amber overlay layer over the road tile texture (cap 5 visible levels via `Math.min(weight / 4, 1.0)` then quantize to 5 buckets).

- Files: `src/render/SceneRenderer.js`, optionally `src/render/RoadTileOverlay.js` (new tiny render module if the existing road-tile renderer is monolithic) OR `src/render/ProceduralTileTextures.js` (if road tiles are texture-baked and we re-bake on weight change — less efficient).
- Scope: small (~60 LOC across 2 files).
- Expected gain: PHH Gap 1 score 3 → ~6.5; aggregate 4.3 → ~5.5; theme alignment 41 % → ~55 %.
- Main risk: trail `LineSegments` per worker can cost a draw call per worker if not batched. Mitigation: ONE `LineSegments` for ALL workers, with worker-id-keyed segment ranges in a single BufferGeometry — same pattern as the existing entity InstancedMesh, but for line segments.

### Suggestion B (in-freeze, MINIMAL VARIANT) — trails only

Just the per-worker fading trail (Step 1 in plan). Skip the road EWMA tint. Half the surface area, ~70 % of the perceptual win — a single worker walking the brown road ribbon now visibly *paints* its path even if the road tile itself doesn't accumulate. Lower complexity, lower perf risk.

- Files: `src/render/SceneRenderer.js` (~30 LOC)
- Scope: trivial
- Expected gain: PHH Gap 1 score 3 → ~5; aggregate 4.3 → ~4.8.
- Main risk: none.

### Suggestion C (in-freeze, MINIMAL VARIANT) — road tint only

Just the road EWMA tint. Skip the trails. ~50 % of the perceptual win — players see "this road is hot" but don't see live convoy flow.

- Files: `src/render/SceneRenderer.js` + (likely) the road tile renderer (~30 LOC).
- Scope: trivial.
- Expected gain: PHH Gap 1 score 3 → ~4.5; aggregate 4.3 → ~4.6.

### Suggestion D (FREEZE-VIOLATING, flagged, do not ship in R11) — Boids flock-strengthening at the AI layer

Increase worker cohesion / alignment weight inside the existing Boids movement so workers naturally cluster on roads. **Behaviour change at the AI/sim layer = mechanic shift.** Defer to v0.10.2.

### Suggestion E (FREEZE-VIOLATING, flagged, do not ship in R11) — spawn additional "convoy escort" worker types

PHH explicitly rules this out ("not a new entity, just visual layer extending existing render path"). Tagged for completeness. Do not ship.

## 3. Selected approach

**Suggestion A.** Both layers ship together because they target different perceptual gaps: trails make individual motion legible at any density; road tint makes historical traffic legible without watching it happen. Together they convert "sparse independent ants" into "visible convoy past + present" using only render-layer additions. The two are independently rollback-safe (delete one, keep the other).

## 4. Plan steps

- [ ] **Step 1 — Locate the per-tick worker render loop.**
  `Grep "InstancedMesh\|setMatrixAt" src/render/SceneRenderer.js` — find the entity matrix update loop. The trail head needs to be inserted in the same loop (we already know each worker's current x/z; the new step is appending it to a per-worker ring buffer and updating the LineSegments BufferGeometry).
  - Type: read (no edit)

- [ ] **Step 2 — Allocate the trails BufferGeometry + LineSegments.**
  At renderer init (near the entity InstancedMesh allocation), add:
  ```js
  // PHH R11: fading motion trails — single LineSegments for all workers,
  // worker-id-keyed segment ranges in one BufferGeometry. Decays alpha 0.5 → 0.
  const TRAIL_LENGTH = 8;            // 8 segments × ~0.25 s/tick = ~2 s decay
  const MAX_TRAIL_WORKERS = 1200;
  const trailPositions = new Float32Array(MAX_TRAIL_WORKERS * TRAIL_LENGTH * 2 * 3);  // 2 verts/segment, 3 floats/vert
  const trailColors = new Float32Array(MAX_TRAIL_WORKERS * TRAIL_LENGTH * 2 * 4);     // RGBA
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 4));
  const trailMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const trailMesh = new THREE.LineSegments(trailGeometry, trailMaterial);
  trailMesh.frustumCulled = false;
  scene.add(trailMesh);

  // Per-worker ring buffer of last positions: [{x, z, ageTicks}, ...]
  const workerTrailHistory = new Map();  // workerId → [{x, z, age}]
  ```
  - Type: add
  - depends_on: Step 1

- [ ] **Step 3 — Per-tick: append head + decay tail + write geometry.**
  In the entity matrix update loop, for each worker:
  ```js
  // 1. Append current position to ring buffer head.
  let history = workerTrailHistory.get(worker.id);
  if (!history) {
    history = [];
    workerTrailHistory.set(worker.id, history);
  }
  history.push({ x: worker.x, z: worker.z, ageTicks: 0 });
  // 2. Decay all ages, drop expired.
  for (let h = 0; h < history.length; h++) history[h].ageTicks++;
  while (history.length > TRAIL_LENGTH) history.shift();

  // 3. Write segments into geometry: each (h, h+1) pair is one segment.
  const wOffset = workerIndex * TRAIL_LENGTH * 2 * 3;
  for (let h = 0; h < TRAIL_LENGTH - 1; h++) {
    const a = history[h] ?? history[history.length - 1] ?? { x: worker.x, z: worker.z };
    const b = history[h + 1] ?? a;
    const segOffset = wOffset + h * 2 * 3;
    trailPositions[segOffset]     = a.x;  trailPositions[segOffset + 1] = 0.05;  trailPositions[segOffset + 2] = a.z;
    trailPositions[segOffset + 3] = b.x;  trailPositions[segOffset + 4] = 0.05;  trailPositions[segOffset + 5] = b.z;
    // alpha decays linearly with age
    const alphaA = Math.max(0, 0.5 - (a.ageTicks ?? 0) * (0.5 / TRAIL_LENGTH));
    const alphaB = Math.max(0, 0.5 - (b.ageTicks ?? 0) * (0.5 / TRAIL_LENGTH));
    const colOffset = workerIndex * TRAIL_LENGTH * 2 * 4 + h * 2 * 4;
    trailColors[colOffset]     = 1; trailColors[colOffset + 1] = 1; trailColors[colOffset + 2] = 1; trailColors[colOffset + 3] = alphaA;
    trailColors[colOffset + 4] = 1; trailColors[colOffset + 5] = 1; trailColors[colOffset + 6] = 1; trailColors[colOffset + 7] = alphaB;
  }
  ```
  After the loop: `trailGeometry.attributes.position.needsUpdate = true; trailGeometry.attributes.color.needsUpdate = true;`
  Clean up workerTrailHistory entries for workers no longer present (iterate the Map, drop ids not seen this tick).
  - Type: add
  - depends_on: Step 2

- [ ] **Step 4 — Add the road foot-traffic EWMA weights.**
  At renderer init (near the road tile setup):
  ```js
  // PHH R11: road foot-traffic EWMA. Tile weight grows with worker traversal,
  // decays toward 0 over ~30 sim-sec. Visualised as warm-amber overlay alpha.
  const roadTrafficWeights = new Float32Array(96 * 72);
  const ROAD_TRAFFIC_EWMA_ALPHA = 0.03;     // per-traversal weight
  const ROAD_TRAFFIC_DECAY_PER_SEC = 0.967; // ~30 s half-life
  let lastTrafficDecaySec = 0;
  ```
  In the same per-tick worker loop:
  ```js
  // Increment weight for the tile the worker is currently on (only if it's a road tile).
  const tileIdx = Math.floor(worker.z) * 96 + Math.floor(worker.x);
  if (state.grid[tileIdx] === TILE.ROAD) {
    roadTrafficWeights[tileIdx] = roadTrafficWeights[tileIdx] * (1 - ROAD_TRAFFIC_EWMA_ALPHA) + ROAD_TRAFFIC_EWMA_ALPHA * 4;
  }
  ```
  In the per-second decay (or per-tick scaled):
  ```js
  const nowSec = state.simSec;
  if (nowSec - lastTrafficDecaySec >= 1) {
    const dtSec = nowSec - lastTrafficDecaySec;
    const factor = Math.pow(ROAD_TRAFFIC_DECAY_PER_SEC, dtSec);
    for (let i = 0; i < roadTrafficWeights.length; i++) roadTrafficWeights[i] *= factor;
    lastTrafficDecaySec = nowSec;
  }
  ```
  - Type: add
  - depends_on: Step 3

- [ ] **Step 5 — Render the road traffic tint as an overlay.**
  Two options based on existing road-tile architecture:
  - **Option 5a (preferred, lower-cost):** if road tiles are `InstancedMesh` BoxGeometry with per-instance color, push the tint into the instance color: `roadInstancedMesh.setColorAt(roadIdx, baseRoadColor.clone().lerp(amberColor, Math.min(weight / 4, 1.0)))`. Quantize to 5 buckets via `Math.floor(weight) / 4`. Mark `instanceColor.needsUpdate = true`.
  - **Option 5b (fallback, if road tiles are texture-baked):** create a single PlaneGeometry overlay across the world plane with a `DataTexture` driven by `roadTrafficWeights`. Update the DataTexture per second.
  Choose the option that matches existing road tile renderer structure (Step 1's audit).
  - Type: add
  - depends_on: Step 4

- [ ] **Step 6 — Worker-cleanup hook.**
  When a worker dies / is removed, delete its entry from `workerTrailHistory` to prevent memory growth. Add the cleanup call inside the existing worker-removal hook (find via `Grep "deathLog\|removeWorker\|onWorkerDeath" src/`). ~3 LOC.
  - Type: add
  - depends_on: Step 3

- [ ] **Step 7 — Perf verification.**
  Open dev server, `devStressSpawn(60)`, observe `frameMs` in perftrace overlay. Pre-fix baseline ≤ ~3.1 ms. Budget: ≤ +1.5 ms post-fix at 60 workers. Trails are 1 draw call (LineSegments) regardless of worker count; road tint adds 0 draw calls if Option 5a, 1 draw call if 5b. Both should be flat under 60-worker stress.
  - Type: verify
  - depends_on: Step 6

- [ ] **Step 8 — Run the suite.**
  `node --test test/*.test.js`. Baseline 1646 / 1612 / 0 fail / 2 skip. Renderer tests should pass; if any test pins the road tile color, relax to "≥ baseRoadColor.r" (the tint adds amber on top, never subtracts).
  - Type: verify
  - depends_on: Step 7

- [ ] **Step 9 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  *"PHH-living-system Gap 1 — fading worker motion trails (8-segment LineSegments, alpha 0.5 → 0 over ~2 sim-sec) + road tile foot-traffic EWMA tint (warm amber, 30 s half-life, 5 buckets). Sparse worker motion now reads as visible convoy flow without spawning entities. PHH living-system pillar 'convoys' projected 3/10 → ~6.5/10."*
  - Type: edit
  - depends_on: Step 8

## 5. Risks

- **Trail BufferGeometry size.** `1200 workers × 8 segments × 2 verts × 3 floats = 57 600 floats × 4 bytes ≈ 230 KB` for positions, ~307 KB for colors. ~540 KB total — flat allocation, not per-tick. Fine.
- **Empty trail slots for absent workers** still render zero-length segments. Visually invisible (alpha 0) but consume vertex shader work. Mitigation: skip the geometry write for unused worker indices (set alpha 0 explicitly — already in Step 3).
- **Road tint Option 5b DataTexture upload cost.** If the existing road renderer is texture-baked (Option 5b path), a per-second DataTexture upload is cheap but not free. Per-second cadence keeps it manageable. Option 5a (per-instance color) is preferred if available.
- **Worker death without cleanup hook fired.** If a worker's `id` is removed from `state.workers` but not signalled via the death/removal hook, `workerTrailHistory` leaks one entry per orphan. Mitigation: at the end of each tick, iterate `workerTrailHistory` and drop any id not in `state.workers` (cheap for ≤ 1200 entries).
- **Trail visibility through fog-of-war.** If a worker walks into FoW its trail head will still render. PHH's screenshots don't show this conflict, but if a FoW system masks worker positions, the trails should be masked the same way. Step 1's audit should confirm whether the current renderer already masks worker positions in FoW; if so, apply the same gate to trail-head appends.
- **Possible affected tests:** `test/render-*.test.js`, `test/scene-renderer-*.test.js`, `test/road-tile-*.test.js`. None expected to break; renderer changes are additive.

## 6. Verification

- **No new unit tests** (renderer-layer visual change; PHH's blind-audit methodology + screenshots are the canonical verification).
- **Manual repro (mirrors PHH's methodology):** open `localhost:19090/?dev=1&perftrace=1`, Temperate Plains seed 160 304 153, autopilot ON + 4× speed. Wait until the first 12-worker steady state. Capture screenshots at:
  1. ~0:30 sim-time — workers in motion: trails should be visible behind each as a fading white ribbon.
  2. ~1:00 sim-time — focus on the road network: road tiles with recent traversal should show warm-amber tint; quiet roads should be neutral.
  3. ~2:00 sim-time — focus on a busy job site (e.g. construction cluster): convergent motion should read as multiple trails braiding together — visibly a "convoy" rather than independent ants.
  Compare against PHH's R11 baseline screenshots (`PHH-04`, `PHH-08`, `PHH-10` for "no convoy at default density"). Post-fix: same density, but visible flow.
- **Perf gate:** `frameMs` ≤ pre-fix + 1.5 ms under `devStressSpawn(60)`.
- **Bench regression:** `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 30 --tick-rate 4` — DevIndex within ±1 % of pre-fix head (pure renderer change, must be flat).

## 7. UNREPRODUCIBLE marker

N/A — PHH provided 13 screenshots (`PHH-01` to `PHH-13`) and explicitly described the absent-convoy gap. The fix is a render-layer addition — verifiable by direct visual comparison.

---

## Acceptance criteria

1. Each visible worker has a fading white trail (~2 s decay, ~3–5 tile span at typical worker speed).
2. Road tiles with recent worker traversal show warm-amber tint; quiet roads show neutral road color.
3. Trail alpha decays linearly with age; oldest segments are fully transparent.
4. Road tint decays over ~30 sim-sec (half-life); a road un-traversed for 60 sim-sec returns to neutral.
5. Trail / tint additions add ≤ 1.5 ms `frameMs` at 60 workers under `devStressSpawn`.
6. `node --test test/*.test.js` baseline preserved.
7. Bench DevIndex within ±1 % of pre-fix head.
8. PHH living-system "convoys" pillar ≥ 5 / 10 on re-audit.
9. No new entity, no new AI, no new balance key, no new HUD element.

## Rollback procedure

```
git checkout 652220f -- src/render/SceneRenderer.js
```

(plus any new render module file if Step 5 took Option 5b path).
