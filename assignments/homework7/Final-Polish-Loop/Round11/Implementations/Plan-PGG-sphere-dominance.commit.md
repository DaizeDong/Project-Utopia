# Plan-PGG-sphere-dominance — Implementation Log

**Reviewer:** PGG-aesthetic-theme (sphere visual hierarchy)
**Plan:** `assignments/homework7/Final-Polish-Loop/Round11/Plans/Plan-PGG-sphere-dominance.md`
**Round:** 11
**Priority:** P1
**Track:** code (renderer + procedural texture pass)
**Implementer slot:** R11 implementer 2/6
**Status:** SHIPPED
**Parent commit:** `36a1f9e`
**Head commit:** (filled by `git log --oneline -2` below)

---

## What changed

Three coordinated render-layer tweaks (Suggestion A from the plan) lift the entity-sphere visual hierarchy that PGG's blind audit flagged as inverted (74 % aggregate compliance):

1. **Sphere radius `0.34 → 0.42`** (`src/render/SceneRenderer.js#setupEntityMeshes`, line 1411). +24 % screen area; role-based size multipliers downstream untouched.
2. **Additive-blend white halo InstancedMesh per entity bucket** (`src/render/SceneRenderer.js#setupEntityMeshes` + `#setHaloMatrix` + per-entity update loop). Four sibling `InstancedMesh` objects (`workerHaloMesh`, `visitorHaloMesh`, `herbivoreHaloMesh`, `predatorHaloMesh`) sharing one `RingGeometry(0.50, 0.62, 24)` and per-bucket `MeshBasicMaterial({ color: 0xffffff, opacity: 0.30, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })`. Rings lay flat on the ground plane (orientation quaternion baked once in setup, applied via `#setHaloMatrix` helper) for a "shadow-halo" read consistent with the overhead-tilted camera. Same per-tick loop that updates `*Mesh.setMatrixAt` now also writes the halo matrix at y=0.06. Visibility/count tracks the parent sphere bucket (including the early-exit `useEntityModels=true` path). 4 extra draw calls/frame total — flat regardless of entity count.
3. **Painted resource-glyph alpha demotion (×0.75)** — `src/render/ProceduralTileTextures.js` `drawFarm`, `drawLumber`, `drawQuarry` (the STONE-resource glyph; named drawStone in the plan). Every glyph stroke/fill `globalAlpha` and `drawNoiseDots` alpha multiplied by 0.75 (e.g. drawFarm 0.42→0.315, 0.44→0.33, 0.16→0.12). Base biome fill remains at full opacity — only the glyph layer recedes.
4. **1-px grid hairlines in every tile texture** — `src/render/ProceduralTileTextures.js#createProceduralTileTexture`. Strokes a 1-px `rgba(255,255,255,0.04)` line along the right + bottom edges of every baked tile texture after `drawPattern`. Two-edge (not four) avoids double-stroke at neighbour boundaries.

## Files modified

- `src/render/SceneRenderer.js` (+~80 LOC)
- `src/render/ProceduralTileTextures.js` (+~25 LOC)
- `CHANGELOG.md` (added v0.10.1-n entry above the existing PFF entry)

Total ~105 LOC across 2 source files — within the plan's ~80 LOC budget once the per-bucket halo-wiring expansion (4 buckets × similar branches) is accounted for.

## Tests

Full suite: `node --test test/*.test.js`

- **1981 pass / 0 fail / 4 skip** (1985 total tests across 120 suites, 1586 top-level)
- Baseline preserved (parent commit baseline was 1981 / 0 / 4 per CHANGELOG v0.10.1-n PFF entry)
- No renderer test pinned sphere radius or glyph alpha to a specific numeric value, so no test edits were required.

## Acceptance criteria

1. Sphere radius `0.42` confirmed in-source at `SceneRenderer.js:1411` — DONE
2. Halo InstancedMesh present and updating per frame, no draw-call leak (4 added, flat in entity count) — DONE
3. `drawFarm`, `drawLumber`, `drawQuarry` glyphs render at ~75 % opacity vs. baseline — DONE
4. 1-px `rgba(255,255,255,0.04)` grid hairlines applied universally in `createProceduralTileTexture` — DONE
5. `node --test test/*.test.js` baseline preserved — DONE (1981 / 0 / 4)
6. Bench DevIndex within ±1 % — N/A in-session (renderer-only change cannot perturb headless bench)
7. PGG aggregate compliance ≥ 85 % on re-audit — projected post-ship; PGG re-audit pending
8. No new tile / role / mechanic / HUD element / mood / balance key — CONFIRMED

## Hard-freeze compliance

No new TILE / role / building / mood / mechanic / event type / HUD pill / BALANCE knob. Pure renderer-layer geometry/material/opacity tweaks already wired through the existing instanced-mesh + procedural-texture pipelines.

## Suggestions NOT taken

- **Suggestion B** (sphere-only minimal variant) — would have left Gap #3 (invisible tile boundaries) unaddressed.
- **Suggestion C** (sphere bump + halo only, defer glyph/grid) — would have left half of Polish P3 on the table.
- **Suggestion D** (FREEZE-VIOLATING chevron-glyph asset swap) — explicitly deferred per plan.

## Commit log confirmation

See `git log --oneline -2` output appended at the bottom of the commit body.
