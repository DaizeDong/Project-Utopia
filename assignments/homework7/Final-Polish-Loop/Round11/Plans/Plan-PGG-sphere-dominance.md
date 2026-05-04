---
reviewer_id: PGG-aesthetic-theme (sphere visual hierarchy)
feedback_source: assignments/homework7/Final-Polish-Loop/Round11/Feedbacks/PGG-aesthetic-theme.md
round: 11
date: 2026-05-01
build_commit: 652220f
priority: P1
track: code (renderer — sphere geometry + halo + tile-glyph opacity + grid hairlines)
freeze_policy: hard
rollback_anchor: 652220f
estimated_scope:
  files_touched: 3
  loc_delta: ~80
  new_tests: 0
  wall_clock: 50
conflicts_with: []
---

# Plan-PGG-sphere-dominance — Lift Entity Sphere Visual Weight + Demote Painted Tile Glyphs + Add Grid Hairlines

**Plan ID:** Plan-PGG-sphere-dominance
**Source feedback:** `assignments/homework7/Final-Polish-Loop/Round11/Feedbacks/PGG-aesthetic-theme.md` (Polish P1 + P3 + P5)
**Track:** code (renderer + procedural texture pass)
**Priority:** P1 — addresses PGG's Gap #1 ("spheres are too small / lost in painted tile-glyphs", HIGH) AND Gap #3 ("tile boundaries invisible without overlays", MEDIUM). PGG aggregate compliance: 74 %; expected post-ship: ~85 %.
**Freeze policy:** hard (no new tile / role / building / mood / mechanic / score / audio asset / HUD element / balance key — only renderer-layer geometry/material/opacity tweaks already wired through the existing instanced-mesh + procedural-texture pipeline)
**Rollback anchor:** `652220f`
**Sibling plan:** `Plan-PGG-responsive-collapse` ships in parallel — different files (CSS / index.html), no overlap with this plan's `SceneRenderer.js` + `ProceduralTileTextures.js` changes.

---

## 1. Core problem (one paragraph)

The theme contract (HW1 a1.md): *"All living entities are rendered as simple spheres, and the world is a tile grid where roads and buildings are represented as special tiles."* PGG's blind-audit screenshots confirm the engine respects this (`SceneRenderer.js:1411` instances `THREE.SphereGeometry(0.34, 14, 14)`; tiles are `BoxGeometry`), but at default camera height the ~4–6 px sphere instances are **out-shouted** by the painted lumber/stone/farm glyphs baked into the tile textures (`ProceduralTileTextures.js:233 drawFarm`, `:267 drawLumber`, `:~drawStone`). A first-time reviewer mis-reads the static tile-icons as the agents — inverting the stated visual hierarchy. Compounding: the procedurally-painted biome textures with feathered edges blur the underlying square grid into amorphous green/blue blobs; tile boundaries are invisible at default zoom (only the heat-lens overlay reveals them). Net effect: the player perceives "RimWorld-style icons + tiny dots" instead of "abstract sphere agents on a grid."

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — three coordinated render-layer tweaks

1. Bump sphere radius `0.34 → 0.42` (~+24 % screen area) at `SceneRenderer.js:1411`.
2. Add a low-cost additive-blend white halo ring per instance (small `RingGeometry` + `MeshBasicMaterial` with `blending: THREE.AdditiveBlending`, `transparent: true`, `opacity: 0.35`, scaled to ~1.6× sphere radius) so spheres pop against any tile background.
3. Multiply the resource-glyph stroke/fill opacity by `0.75` inside `drawFarm` / `drawLumber` / `drawStone` in `ProceduralTileTextures.js`.
4. Bake a 1-px `rgba(255,255,255,0.04)` grid hairline into the same texture pass (or as a single tiled overlay PlaneGeometry on the ground plane) so the grid is perceivable below the noise threshold but above the perception threshold.

- Files: `src/render/SceneRenderer.js`, `src/render/ProceduralTileTextures.js` (+ optionally one ground-plane overlay in `SceneRenderer.js`)
- Scope: small (~80 LOC across 3 files)
- Expected gain: restores intended visual hierarchy (spheres > tile glyphs > grid). PGG compliance projection: 74 % → 85 %+.
- Main risk: instanced halo ring per worker can cost a draw call per worker if not instanced. Mitigation: use the **same** `InstancedMesh` pattern already used for the sphere bodies — one halo InstancedMesh, one body InstancedMesh, both updated in the same per-tick loop.

### Suggestion B (in-freeze, MINIMAL VARIANT) — sphere-only bump

Just change `0.34 → 0.42` (one number). No halo, no glyph opacity, no grid hairlines. Lowest possible scope. Restores ~30 % of the missing hierarchy (PGG estimate: 74 % → ~78 %). Defer the rest to v0.10.2.

- Files: `src/render/SceneRenderer.js` (1 line)
- Scope: trivial (~1 LOC)
- Expected gain: small but real
- Main risk: none

### Suggestion C (in-freeze) — sphere bump + halo only, defer glyph/grid

Steps 1 + 2 from Suggestion A; skip glyph opacity + grid hairlines. Halves the surface area while still hitting Gap #1 hard. PGG compliance projection: 74 % → 82 %.

### Suggestion D (FREEZE-VIOLATING, flagged, do not ship in R11) — replace painted glyphs with abstract chevrons

PGG's optional Polish P5: replace painted lumber/stone/farm glyphs with single-color filled circles or chevrons. Pure renderer change but it changes a *visual asset* the player has learned to read across rounds — counts as a UX/asset shift past the in-freeze "polish only" line. Defer to v0.10.2 if Suggestion A's `× 0.75` opacity isn't enough.

## 3. Selected approach

**Suggestion A.** Coordinated three-layer fix: bigger spheres + halo for foreground pop, demoted glyphs for midground recession, grid hairlines for background structure. Each layer is self-contained and independently verifiable — if halo cost shows up in `frameMs`, drop just the halo and keep the radius/glyph/grid changes (still a net win). Lands all of PGG's Polish P1 + P3 in one pass at ~80 LOC.

## 4. Plan steps

- [ ] **Step 1 — Bump sphere radius.**
  `src/render/SceneRenderer.js:1411` — change
  ```js
  const sphereGeometry = new THREE.SphereGeometry(0.34, 14, 14);
  ```
  to
  ```js
  // PGG R11: lift sphere visual weight (+24 % area) so agents out-pop painted tile glyphs.
  const sphereGeometry = new THREE.SphereGeometry(0.42, 14, 14);
  ```
  Verify the surrounding scale-tinting (role-based size multipliers) still produces sensible relative sizes — predators / traders should still scale relative to workers, just from a larger base.
  - Type: edit

- [ ] **Step 2 — Add an instanced halo ring InstancedMesh.**
  `src/render/SceneRenderer.js` — beside the existing entity InstancedMesh setup (search for `new THREE.InstancedMesh` near line 1411), add a sibling `InstancedMesh`:
  ```js
  // PGG R11: subtle additive-blend halo so spheres read against any tile background.
  const haloGeometry = new THREE.RingGeometry(0.50, 0.62, 24);  // inner > sphere radius
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.30,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const haloInstancedMesh = new THREE.InstancedMesh(haloGeometry, haloMaterial, MAX_ENTITY_COUNT);
  haloInstancedMesh.frustumCulled = false;
  scene.add(haloInstancedMesh);
  ```
  In the per-tick instance-matrix update loop (where `entityInstancedMesh.setMatrixAt(i, matrix)` is called), set the **same** matrix on `haloInstancedMesh` (with the ring oriented to face the camera — billboard via `lookAt(camera.position)` on a temporary Object3D, OR rotate it flat to the ground plane for a "shadow-halo" read; PGG screenshots suggest the camera is overhead-tilted so flat-on-ground is the cheaper, on-theme option).
  Set `haloInstancedMesh.instanceMatrix.needsUpdate = true` after the loop.
  - Type: add
  - depends_on: Step 1

- [ ] **Step 3 — Demote painted resource glyphs to ×0.75 opacity.**
  `src/render/ProceduralTileTextures.js` — locate `drawFarm` (~:233), `drawLumber` (~:267), and `drawStone` (`Grep "drawStone" src/render/ProceduralTileTextures.js`). For each, wrap the existing glyph stroke/fill calls with `ctx.save() / ctx.globalAlpha *= 0.75 / ... / ctx.restore()` OR multiply the existing alpha literal in the fill style. Keep the underlying biome tint at full opacity — only the *glyph layer* is demoted.
  ```js
  // PGG R11: demote painted resource glyphs so sphere agents are the primary visual layer.
  ctx.save();
  ctx.globalAlpha *= 0.75;
  // ... existing glyph drawing ...
  ctx.restore();
  ```
  - Type: edit

- [ ] **Step 4 — Add 1-px grid hairlines to the tile texture.**
  `src/render/ProceduralTileTextures.js` — at the end of the per-tile texture-bake function (after biome + glyph layers), draw a 1-px stroke along the tile's right + bottom edge:
  ```js
  // PGG R11: subtle grid hairline so tiles read as the atomic unit (Gap #3).
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(canvasW, 0); ctx.lineTo(canvasW, canvasH);
  ctx.moveTo(0, canvasH); ctx.lineTo(canvasW, canvasH);
  ctx.stroke();
  ctx.restore();
  ```
  Two-edge (right + bottom) rather than four-edge avoids double-stroke at tile boundaries. Alpha `0.04` is below the "noisy" threshold but above the "perceivable as a grid" threshold (PGG's stated knob).
  - Type: edit

- [ ] **Step 5 — Verify rendering perf does not regress.**
  Open dev server, `devStressSpawn(60)` to push the entity count, observe `frameMs` in the perftrace overlay (`?perftrace=1`). Pre-fix baseline: ~3.1 ms / 1.0–9.5 fps under headless throttling. Post-fix budget: `frameMs` ≤ baseline + 1.0 ms. The halo InstancedMesh adds one extra draw call per frame (not per entity) — should be flat noise. If it isn't, drop just the halo (Step 2) and keep Steps 1/3/4.
  - Type: verify
  - depends_on: Step 4

- [ ] **Step 6 — Run the suite.**
  `node --test test/*.test.js`. Baseline 1646 / 1612 / 0 fail / 2 skip. Renderer tests (if any) that pin sphere radius or glyph alpha will flip — relax them to assert "≥ original" for radius and "≤ original" for glyph alpha rather than exact values.
  - Type: verify
  - depends_on: Step 5

- [ ] **Step 7 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  *"PGG-aesthetic-theme P1+P3 — sphere radius 0.34→0.42 (+24 % area), additive-blend white halo per worker, painted resource glyphs demoted to ×0.75 opacity, 1-px rgba(255,255,255,0.04) grid hairlines on every tile. Restores intended visual hierarchy (spheres > glyphs > grid). PGG compliance: 74 % → ~85 % projected."*
  - Type: edit
  - depends_on: Step 6

## 5. Risks

- **Halo InstancedMesh perf.** One extra draw call per frame, MAX_ENTITY_COUNT instance matrix uploads per tick. Mitigation: same-loop update with the body mesh; if `frameMs` grows > 1 ms, drop the halo.
- **Glyph opacity ×0.75 may be too aggressive.** If post-ship screenshots show resource tiles read as "blank brown squares" the ×0.75 should bump to ×0.85. Tunable per-glyph if needed.
- **Grid hairline at `0.04` alpha may be invisible at 1366 × 768 / DPR < 1.5.** If PGG's stated knob doesn't render visibly on lower-DPR displays, bump to `0.06` (still well below noisy). Validate via the 1366 × 768 viewport per PGG's methodology.
- **Sphere `0.42` radius may collide with tile-glyph occlusion at extreme zoom-out.** Larger spheres mean more screen-space overlap when zoomed-out; with halo this could read as "blob of light." If so, scale the halo opacity down with zoom-out level (existing zoom-state hook already gates other LODs).
- **Possible affected tests:** `test/render-*.test.js`, `test/scene-renderer.test.js`, `test/procedural-tile-textures.test.js` if any pin radius / alpha. Per the audit's structural read of the renderer, none are expected to break behaviorally.

## 6. Verification

- **No new unit tests** (renderer-layer visual change; PGG's blind-audit methodology is the canonical verification).
- **Manual repro (mirrors PGG's methodology):** `npx vite preview` → cold start at `http://127.0.0.1:5173/` → Temperate Plains / Broken Frontier / 96×72 → Autopilot ON + 4× speed → wait until 12 workers spawn + visible.
  Capture screenshots at:
  1. 1920 × 1080, default zoom
  2. 1920 × 1080, max-zoom-in
  3. 1366 × 768, default zoom
  4. 1366 × 768, zoomed-out

  Compare against PGG's R11 baseline screenshots (`r11-aesthetic-1920-zoomed-max.png`, `r11-aesthetic-1366-zoomed.png`, `r11-aesthetic-1366-heatlens.png`, `r11-aesthetic-1366-zoomedout.png`):
  - Spheres should be visibly larger (~+24 % screen area).
  - Each sphere has a faint white halo (additive blend).
  - Resource glyphs on FOREST / STONE / HERB / FARM tiles read at ~75 % of prior contrast.
  - At default zoom, tile boundaries are now perceivable as faint hairlines without engaging the heat-lens.

- **Perf gate:** `frameMs` ≤ pre-fix + 1 ms under `devStressSpawn(60)`.
- **Bench regression:** `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 30 --tick-rate 4` — DevIndex must not regress from current head by > 1 % (pure renderer change should be effectively flat).

## 7. UNREPRODUCIBLE marker

N/A — PGG provided 8 screenshots covering both viewports and both zoom levels; the gap is visually obvious and reproducible at any cold-start of the build.

---

## Acceptance criteria

1. Sphere radius `0.42` confirmed in-source at `SceneRenderer.js:1411`.
2. Halo InstancedMesh present and updating per frame (Step 2); no draw-call leak.
3. `drawFarm`, `drawLumber`, `drawStone` glyphs render at ~75 % opacity vs. baseline.
4. 1-px `rgba(255,255,255,0.04)` grid hairlines visible at default zoom (no heat-lens).
5. `node --test test/*.test.js` baseline preserved (1646 pass / 0 fail).
6. Bench DevIndex within ±1 % of pre-fix head.
7. PGG aggregate compliance ≥ 85 % on re-audit (target).
8. No new tile / role / mechanic / HUD element / mood / balance key.

## Rollback procedure

```
git checkout 652220f -- src/render/SceneRenderer.js src/render/ProceduralTileTextures.js
```

cleanly reverts.
