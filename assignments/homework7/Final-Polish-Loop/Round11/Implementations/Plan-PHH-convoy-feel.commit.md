# Plan-PHH-convoy-feel — Implementation Log

**Reviewer:** PHH-living-system (convoy promise unfulfilled at default density)
**Plan:** `assignments/homework7/Final-Polish-Loop/Round11/Plans/Plan-PHH-convoy-feel.md`
**Round:** 11
**Priority:** P1
**Track:** code (renderer — worker motion trails + road foot-traffic tint)
**Implementer slot:** R11 implementer 4/6
**Status:** SHIPPED
**Parent commit:** `0fe2b9c`
**Head commit:** (filled by `git log --oneline -2` below)

---

## What changed

Two coordinated render-only additive layers (Suggestion A from the plan) convert sparse worker motion into "visible convoy past + present" without spawning entities, addressing PHH's lowest-scoring living-system pillar (3/10 convoys → projected 6.5/10):

1. **Per-worker fading motion trails — single LineSegments for all workers** — `src/render/SceneRenderer.js#setupEntityMeshes`. Allocates one `THREE.LineSegments` for the entire worker pool (max 1200), backed by a `Float32Array(maxWorkers × 8 × 2 × 3)` position buffer + `Float32Array(× 4)` RGBA color buffer. Single draw call regardless of worker count. Per-worker history (`Map<id, [{x,z,age}]>` ring buffer of last 8 positions) is maintained in the per-tick worker loop; alpha decays linearly from 0.5 (head) → 0 (tail) over the 8 segments (~2 sim-sec at 30 Hz mesh cadence). Material: `vertexColors: true`, additive blending, `depthTest: false`. Stale ids are pruned each tick.
2. **Road foot-traffic EWMA tint — per-tile weights → setColorAt on existing road InstancedMesh** — `src/render/SceneRenderer.js#setupTileMesh` + `#rebuildTilesIfNeeded` + new `#updateWorkerTrailsAndRoadTraffic`. `Float32Array(W*H)` per-tile weights + `Int32Array(W*H)` reverse-map (tileIdx → road instance index, populated during tile rebuild). On each tick, when a worker stands on a `TILE.ROAD` tile, `weights[idx] = weights[idx] * 0.97 + 0.12` (capped at 4). Per-tick decay `× 0.999` (~30 s half-life at 30 Hz). Mapped via 5-bucket quantization (`Math.floor(t*4)/4` where `t = min(weight/4, 1)`) and lerped from base road color → warm amber `0xff9a3a`, written via `roadMesh.setColorAt(roadInstanceIdx, color)`. Zero new draw calls — reuses the existing road `InstancedMesh` per-instance color.

Both layers gated behind `workerFallbackVisible` so they sleep when the model-mode (3D worker meshes) is active. Trail mesh `.visible = false` in the inactive branch.

## Files modified

- `src/render/SceneRenderer.js` (+137 / -1 LOC: trail BufferGeometry + road weights/reverse-map init in setup, road-instance index capture in tile rebuild, new private `#updateWorkerTrailsAndRoadTraffic` helper called from the worker bucket loop in `#updateEntityMeshes`)
- `CHANGELOG.md` (added v0.10.1-n PHH entry above the existing PGG-responsive-collapse entry)

Total ~138 LOC source — over the plan's ~60 LOC estimate (the four functional pieces — trail init / road init / per-tick worker loop with history + EWMA / per-tile decay + tint write — are each modest individually but sum higher with comments + the seen-set cleanup + zero-out of unused trail slots required for safe reuse of the shared buffer).

## Tests

Full suite: `node --test test/*.test.js`

- **1981 pass / 0 fail / 4 skip** (1985 total tests across 120 suites, 1586 top-level)
- Baseline preserved (parent commit `0fe2b9c` baseline was 1981 / 0 / 4 per CHANGELOG v0.10.1-n entries)
- No renderer test pinned road tile color or worker mesh structure beyond what already exists, so no test edits were required.

## Acceptance criteria

1. Per-worker fading white trail (~2 sim-sec decay, 8 segments) — DONE (`workerTrailMesh` LineSegments + history ring buffer)
2. Road tiles with recent traversal show warm-amber tint — DONE (5-bucket quantized lerp via setColorAt)
3. Trail alpha decays linearly with age, oldest fully transparent — DONE (`Math.max(0, 0.5 - age * (0.5/TRAIL_LEN))`)
4. Road tint decays over ~30 sim-sec — DONE (`× 0.999/tick @ 30 Hz`)
5. Trail / tint additions add ≤ 1.5 ms `frameMs` at 60 workers — N/A in-session (perftrace overlay verification deferred to manual repro per plan)
6. `node --test test/*.test.js` baseline preserved — DONE (1981 / 0 / 4)
7. Bench DevIndex within ±1 % — N/A in-session (renderer-only change cannot perturb headless bench)
8. PHH living-system "convoys" pillar ≥ 5/10 on re-audit — projected post-ship; PHH re-audit pending
9. No new entity / AI / balance key / HUD element — CONFIRMED

## Hard-freeze compliance

No new TILE / role / building / mood / mechanic / event type / HUD pill / BALANCE knob. Pure renderer-layer additive geometry on already-wired pipelines (workerEntities loop in `#updateEntityMeshes`, road `InstancedMesh` from `#setupTileMesh`).

## Suggestions NOT taken

- **Suggestion B** (trails-only minimal variant) — would have left road historical traffic invisible.
- **Suggestion C** (road-tint-only minimal variant) — would have left live convoy flow unsurfaced at the per-worker level.
- **Suggestion D** (FREEZE-VIOLATING Boids cohesion at AI layer) — explicitly deferred per plan.
- **Suggestion E** (FREEZE-VIOLATING new convoy-escort entity) — explicitly forbidden per plan.

## Commit log confirmation

See `git log --oneline -2` output appended below the commit body.
