---
reviewer_id: A4-polish-aesthetic
reviewer_tier: A
feedback_source: assignments/homework7/Final-Polish-Loop/Round1/Feedbacks/A4-polish-aesthetic.md
round: 1
date: 2026-05-01
build_commit: 1f6ecc6
priority: P1
track: both
freeze_policy: hard
estimated_scope:
  files_touched: 5
  loc_delta: ~150
  new_tests: 1
  wall_clock: 30
conflicts_with: []
rollback_anchor: 1f6ecc6
---

## 1. 核心问题

A4 returns RED **3 / 10 again** (identical to Round 0). The verdict prose acknowledges that audio (V3 = 0) and a true walk cycle (V4 = 3) are structurally beyond a single polish loop under HARD freeze, so this round must not chase those — they must be **explicitly deferred in writing** to Post-Mortem (so the same RED doesn't ratchet the next reviewer for the same uncloseable items). What CAN move R1 → R2 is:

1. **Lighting tint must become *visible*, not just "implemented".** R0 landed `applyDayNightModulation` + 4-stop ramp + 32-bin quantization (`src/render/AtmosphereProfile.js:209-311`), but A4 sat 6 minutes at 2× speed and saw no warm/cool shift. The R0 numbers — `colorBlend = 0.35`, ambient ramp `0.85→1.20→0.85→0.45`, sun ramp `0.70→1.00→0.70→0.20` — are too gentle for the player to *perceive* once weather + scenario base + pressure overlay all mix on top. R1 amplifies those parameters in-place. Still **no new mesh / shadow rig / asset** — pure number changes inside the existing function.
2. **The 4 specific visual bugs A4 listed** (1024×768 HUD clipping, 1366×768 shortcut wrap-stack, mountain-checker biome, worker stacking z-fight) — all fixable inside existing files via CSS / texture-binding params / matrix-offset jitter.
3. **Audio + walk-cycle deferral must be on paper.** Both are unambiguous freeze violations (audio = new asset; walk cycle = new sprite/anim rig). They are documented as *deferred to post-HW7* in `assignments/homework7/Post-Mortem.md` so when A4 lands the same RED in R2 the score reads "RED with two known structural deferrals" not "RED with same gaps unaddressed."

This plan is **wave-1 of 2** (R0 was wave-0). No new tile / role / building / mechanic / audio asset / UI panel.

## 2. Suggestions（可行方向）

### 方向 A: Amplify R0 lighting tint + fix all 4 V5 bugs + Post-Mortem deferral note (RECOMMENDED)

- 思路: One coordinated polish pass that (a) doubles the perceptual amplitude of R0's day-night modulation by widening the colorBlend, deepening the night/dusk colours, and biasing the intensity ramps, (b) closes the 4 specific V5 bugs in-place, and (c) appends a `§4.5 Hard-Freeze Deferrals` paragraph to Post-Mortem so audio + walk cycle are formally on the cut list.
- 涉及文件:
  - `src/render/AtmosphereProfile.js` (amplify modulation constants only — pure parameter change, function signature unchanged)
  - `index.html` (4 CSS / DOM tweaks for V5 bugs; all inside existing `<style>` blocks)
  - `src/render/SceneRenderer.js` (one-line per-entity matrix offset for worker stacking)
  - `assignments/homework7/Post-Mortem.md` (append deferral subsection)
  - `CHANGELOG.md` (R1 entry)
  - `test/atmosphere/dayNightLightingTint.test.js` (extend R0 test with new amplitude expectations)
- scope: 中 (5 files, ~150 LOC, 1 amended test)
- 预期收益: 4 of 4 V5 bugs closed; V1 lighting score 2 → 4 once player can actually *see* a dawn warm cast and a night cool cast; V3 audio + V4 walk-cycle moved from "silent gap" to "consciously deferred under HARD freeze with paper trail" — matches HW7 enhancer spec §"freeze 检查".
- 主要风险: Amplifying tint risks (i) clashing with `WEATHER_OVERRIDES` (DROUGHT already adds an orange cast → night might over-saturate), (ii) PressureLens heat overlay reading dim at night, (iii) `dayNightLightingTint.test.js` snapshot tolerances drifting beyond the existing ±0.02 envelope. Mitigation: clamp() guards already in place at lines 305-307 keep ambient ≥ 0.18 / sun ≥ 0.08 / hemi ≥ 0.16 — re-tighten lower bounds one notch (0.22 / 0.12 / 0.20) so weather × night doesn't crush the scene to black; update test tolerances to ±0.04 for the new amplitude.
- freeze 检查: **OK**. No new mesh, no new texture asset, no new audio file, no new role / tile / panel / building / mood. The directional + ambient + hemi lights are pre-existing `THREE.AmbientLight` / `THREE.DirectionalLight` / `THREE.HemisphereLight` instances created at SceneRenderer init lines 577-600. The modulation function `applyDayNightModulation` (R0) is amended in-place — no new export, no new call site.

### 方向 B: Skip lighting amplification, fix bugs only, defer V1 to Post-Mortem too

- 思路: Concede V1 lighting along with V3 audio and V4 walk-cycle; write all three into Post-Mortem as deferred. Code track only fixes the 4 V5 bugs.
- 涉及文件: `index.html`, `src/render/SceneRenderer.js`, `assignments/homework7/Post-Mortem.md`, `CHANGELOG.md`.
- scope: 小 (~60 LOC).
- 预期收益: Closes the 4 specific bugs A4 called out; minimal risk of FPS / weather conflict.
- 主要风险: A4's verdict prose explicitly cites V1 (lighting) as the **#2 highest-ROI item** ("Day/night cycle that actually re-lights the scene"). Passing on V1 means R2 will land with V1 still scored 2/10 and no reviewer-visible movement on what A4 marked as the cheapest perceptual win. R0's lighting code is already paid for; not turning the dial up wastes that investment.
- freeze 检查: OK.

### 方向 C: Add audio bus + ambient SFX (not allowed — listed for completeness)

- 思路: Land a 90-second ambient pad + 4 stinger SFX as A4's verdict suggests.
- 涉及文件: New `src/audio/AudioBus.js`, new `assets/audio/*.ogg`, hooks in SceneRenderer / GameApp.
- scope: 大.
- 预期收益: V3 0 → 5; overall RED → YELLOW.
- 主要风险: **FREEZE-VIOLATION** — adding any audio asset is a new asset import per HW7 enhancer spec §"七条硬约束 §5". Adding `src/audio/` is a new directory under `src/`. Both are explicit hard-freeze violators. Listed only to satisfy "≥ 2 Suggestions" and the rule "at least 1 not triggering freeze" (A and B don't, C does — C is the eliminated option).

## 3. 选定方案

选 **方向 A**. Maximizes reviewer-visible movement under HARD freeze: turns R0's already-shipped lighting code into a *perceptible* tint (the difference between "implemented" and "playable"), closes all 4 V5 bugs in place, and converts the two structurally-blocked categories (audio + walk cycle) from "missed again" to "deferred on paper, traceable in Post-Mortem". Direction B leaves V1 unmoved despite R0's investment; Direction C is a freeze violation. The amplitude bump (Step 1) is a pure constant change inside an existing exported function — zero ABI surface — so the R0 tests can be extended rather than rewritten.

## 4. Plan 步骤

- [ ] **Step 1**: `src/render/AtmosphereProfile.js:228-307` — `edit` — amplify the day-night modulation so the player can perceive the cycle.
  - Line 229: dawn stop `color: 0xffd9a8` → `0xffb070` (deeper amber so dawn is recognizably warm-orange, not nearly-white).
  - Line 231: dusk stop `color: 0xffb574` → `0xff7a3a` (stronger sunset cast).
  - Line 232: night stop `color: 0x3a4a78` → `0x1c2850` (deeper blue so night reads as *night*, not "dim day").
  - Line 230: day stop unchanged (`0xffffff`) — noon is the neutral anchor.
  - Lines 229-232 ambient ramp `0.85 / 1.20 / 0.85 / 0.45` → `0.78 / 1.25 / 0.72 / 0.32` (widen contrast: night dimmer, midday brighter).
  - Lines 229-232 sun ramp `0.70 / 1.00 / 0.70 / 0.20` → `0.55 / 1.10 / 0.55 / 0.08` (shadow-side tells player what time it is more strongly).
  - Line 299: `colorBlend = 0.35` → `0.62` (mix tint at ~62% strength so weather overlays no longer drown it).
  - Line 304: `colorBlend * 0.6` → `colorBlend * 0.7` (hemi gets ~43% of tint instead of 21%).
  - Lines 305-307 clamp lower bounds: ambient `0.18 → 0.22`, sun `0.08 → 0.12`, hemi `0.16 → 0.20` — prevents weather × night double-multiply from crushing scene to black.
  - depends_on: none

- [ ] **Step 2**: `index.html:80-106` (`#statusBar` rules and `@media (max-width: 1024px)` block at line 1720) — `edit` — fix V5 P1 bug #1: HUD clipping at 1024×768.
  - Inside `#statusBar` (line 80 base rule), reduce `.hud-resource` horizontal padding by 1-2 px and let `.hud-sublabel` font-size step down at narrow widths.
  - Inside the `@media (max-width: 1024px)` block at line 1721, add `#statusBar { padding: 2px 6px; gap: 4px; font-size: 10px; }` and `#statusBar .hud-resource { min-width: 30px; padding: 0 2px; }` so the resource cells fit inside the available width minus sidebar.
  - Ensure `#wrap.sidebar-open #statusBar { right: clamp(280px, 22vw, 460px); }` (existing line 106) is honoured at 1024 width — currently the sidebar-open rule is only inside the desktop scope; mirror it inside the 1024 media query so the HUD properly stops 280 px from the right edge instead of getting clipped by the sidebar.
  - depends_on: none

- [ ] **Step 3**: `index.html:381-415` and `index.html:1755-1762` (`.hotkey-grid` rules + 1366 media query) — `edit` — fix V5 P1 bug #2: shortcut wrap-stack at 1366×768.
  - The R0 work already collapsed the grid to 1 column at ≤1366 px. The remaining stack is inside each `.hk-row`: `.hk-key` + `.hk-desc` flex-row but `.hk-desc` `word-break: break-word` (line 413) causes mid-word breaks at narrow panel widths.
  - Change `.hk-desc { word-break: break-word; }` → `word-break: normal; overflow-wrap: anywhere;` so words break only at natural boundaries. Add `.hk-row { flex-wrap: nowrap; min-width: 0; }` (so the row stays single-line until it absolutely cannot). Reduce `.hk-key` padding from `1px 5px` → `1px 4px` to claw back ~6 px per row.
  - Inside the existing `@media (max-width: 1366px)` block (line 1757), add `.hotkey-grid { font-size: 9.5px; padding: 5px 6px; }` and `.hotkey-grid .hk-desc { font-size: 8.5px; }` so descriptions like "supply-chain heat lens" fit on one line.
  - depends_on: none

- [ ] **Step 4**: `src/render/SceneRenderer.js:337-356` (TILE_TEXTURE_BINDINGS) — `edit` — fix V5 P2 bug #3: mountain-checker pattern.
  - The "checker mountain" A4 reports is the WALL / RUINS / QUARRY bindings rendering with `repeatX: 8, repeatY: 8` over the procedural texture, which at the default zoom produces a visible 8×8 grid that reads as a checker pattern at the top of the frame (where the grid scenarios place RUINS / WALL clusters).
  - Adjust `[TILE.WALL]` line 343: `repeatX: 8, repeatY: 8` → `repeatX: 4, repeatY: 4` (halves repeat → texture cells double in size, checker grid disappears into a single coherent stone surface).
  - Adjust `[TILE.RUINS]` line 344: `repeatX: 8, repeatY: 8` → `repeatX: 5, repeatY: 5`.
  - Adjust `[TILE.QUARRY]` line 346: `repeatX: 9, repeatY: 9` → `repeatX: 5, repeatY: 5`.
  - Reduce `roughness` on WALL from `0.88` → `0.82` so the directional light catches the surface and breaks up the flat appearance under the new R1 tint amplitude (Step 1).
  - Adjust `[TILE.GATE]` line 355: `repeatX: 6, repeatY: 6` → `repeatX: 3, repeatY: 3` for consistency with WALL.
  - depends_on: none (independent of Step 1, but Step 1's stronger directional light makes the larger texture cells read better)

- [ ] **Step 5**: `src/render/SceneRenderer.js:3248-3294` (worker / visitor / herbivore / predator instanced-matrix loops) — `edit` — fix V5 P2 bug #4: worker stacking z-fight.
  - All four entity meshes write `setInstancedMatrix(mesh, n, e.x, 0.48, e.z)` with no per-entity offset, so 4+ workers on the same tile pile at the exact same world coordinate and z-fight.
  - Add a deterministic per-entity stack offset derived from `entity.id` (an integer): `const stackJitter = (id) => { const h = ((id * 2654435761) >>> 0) / 0xffffffff; return { dx: (h - 0.5) * 0.32, dy: ((h * 7) % 1) * 0.06, dz: (((h * 13) % 1) - 0.5) * 0.32 }; };`. Place the helper above the worker loop or as a module-level function near `setInstancedMatrix` (line 172).
  - At line 3253: `setInstancedMatrix(this.workerMesh, n, e.x + jx, 0.48 + jy, e.z + jz)` where `(jx, jy, jz)` come from `stackJitter(e.id ?? n)`.
  - Apply the same jitter to lines 3266 (visitor), 3279 (herbivore), 3292 (predator) — all four meshes.
  - The 0.32-unit horizontal range is ~⅓ tile so workers spread inside a tile but never cross to the neighbour. The 0.06-unit y range gives a tiny altitude variation that erases z-fighting and reads as "they're standing in slightly different spots" — entirely an existing-data transformation, no new entity field, no new mesh.
  - depends_on: none

- [ ] **Step 6**: `assignments/homework7/Post-Mortem.md` — `edit` — append a `§4.5 Hard-Freeze Deferrals — Audio & Worker Walk Cycle` subsection after line 142 (end of §4) and before `## §5 AI Tool Evaluation` (line 145). Content:
  ```
  ### §4.5 Hard-Freeze Deferrals — Audio & Worker Walk Cycle

  HW7 ran under a hard freeze (no new tile / role / building / mechanic /
  audio asset / UI panel). Two reviewer-flagged polish gaps fall outside
  what the freeze allows; both are deferred to post-HW7 work, not silently
  skipped:

  - **Audio bus + SFX (V3 = 0/10).** A4 (Final-Polish-Loop Round 0/1)
    correctly observes that no `<audio>` elements, no Web Audio nodes, and
    no audio assets ship in v0.10.1. Adding even one ambient loop or one
    UI stinger would require a new asset import (`assets/audio/*`) which
    HW7 §"七条硬约束 §5" forbids. Future-cut item: introduce
    `src/audio/AudioBus.js` with master/music/sfx volume sliders alongside
    the first audio asset; budget ≈ 4 hours including freesound asset
    licensing review.
  - **Worker walk cycle (V4 = 3/10).** Workers currently translate via
    a continuous lerp on `entity.x` / `entity.z` with no sprite / skeletal
    animation between FSM ticks. A genuine walk cycle requires a new
    rigged mesh asset or a 2-frame sprite atlas — both are new asset
    imports. The R1 plan ships a deterministic per-entity stack offset
    (Step 5 of `Round1/Plans/A4-polish-aesthetic.md`) that breaks the
    "stack of tiny goblins" silhouette but does NOT animate motion.
    Future-cut item: ship a 4-frame walk sprite + a phase-locked
    ground-bob (sin(t) on y) when entity speed > 0.

  Both items are paid down here in writing so future polish loops do not
  treat them as oversight: they are scoped, sized, and parked.
  ```
  - depends_on: Steps 1-5

- [ ] **Step 7**: `CHANGELOG.md` — `edit` — under the current unreleased section, add R1 entry:
  ```
  ### Polish (HW7 Round 1 — A4 wave-1)
  - polish: amplify day-night lighting tint amplitude (colorBlend 0.35 → 0.62, dawn 0xffd9a8 → 0xffb070, dusk 0xffb574 → 0xff7a3a, night 0x3a4a78 → 0x1c2850; ambient ramp 0.78 / 1.25 / 0.72 / 0.32; sun ramp 0.55 / 1.10 / 0.55 / 0.08). Reviewer A4 reported R0 tint was implementation-correct but visually imperceptible.
  - fix: HUD clipping at 1024×768 (#statusBar padding/gap/font-size + sidebar-open right offset honoured inside the 1024 media query)
  - fix: shortcut legend vertical word-stack at 1366×768 (.hk-desc word-break: break-word → overflow-wrap: anywhere; .hk-row flex-wrap: nowrap; 1366 media-query font-size step-down)
  - fix: mountain-biome checker pattern (TILE.WALL/RUINS/QUARRY/GATE texture repeatX/repeatY halved so the procedural texture no longer reads as a developer placeholder grid)
  - fix: worker / visitor / herbivore / predator stacking z-fight (deterministic id-hash jitter on x/y/z when writing the InstancedMesh matrix; spread is ~⅓ tile horizontally, ≤ 0.06 unit vertically, no new entity field)

  ### Hard-freeze deferrals (Post-Mortem §4.5)
  - V3 audio bus + SFX — first audio asset blocked by HW7 freeze; documented as cut item.
  - V4 worker walk cycle — sprite atlas / rig blocked by HW7 freeze; documented as cut item.
  ```
  - depends_on: Steps 1-6

## 5. Risks

- **Step 1 amplitude × WEATHER_OVERRIDES interaction.** Night × DROUGHT or night × STORM could now stack into either an over-saturated orange (drought sun_color × night blue tint blend) or crushed-black (storm sun_mul 0.58 × night sun_mul 0.08 = 0.046 before clamp). Mitigation: the clamp lower bounds at lines 305-307 are tightened in Step 1 (sun ≥ 0.12); add a manual Playwright check at phase=0.85 weather=STORM and phase=0.85 weather=DROUGHT.
- **Step 1 may break R0's `dayNightLightingTint.test.js`** — its tolerance is ±0.02 against the old ramp values. Mitigation: extend the test in the same plan (counted in `new_tests: 1` budget — actually test amendment, not new file). Update expected colors to the new stops and tolerance to ±0.04.
- **Step 4 texture repeat halving** may reveal seam artefacts on the procedural texture if it isn't tile-able at 4×4 (R0 used 8×8 partly to hide non-seamless edges). Mitigation: spot-check WALL clusters in Playwright at zoom 1.0 and 0.6; if seams visible at 4×4, fall back to 6×6 (still better than 8×8 checker).
- **Step 5 jitter** changes worker on-screen position by up to 0.32 world units, which is below the typical click-pick threshold (`thresholdPx` at line 145 area) but could shift `findProximityEntity` results when two workers are on adjacent tiles. Mitigation: jitter is fully deterministic (id-hashed) so click-pick is reproducible; verify by clicking a worker and confirming the inspector still binds to it.
- **Step 5** — InstancedMesh shadow casting (lines 1339-1346) — the y-jitter ≤ 0.06 is below the shadow-bias range so should not produce shadow popping. If shadow flicker shows up, fall back to dx/dz-only jitter (set dy = 0).
- 可能影响的现有测试:
  - `test/atmosphere/dayNightLightingTint.test.js` — Step 1 invalidates exact colour expectations (will be amended in this plan, not deleted).
  - `test/atmosphere/AtmosphereProfile.test.js` — pure-function purity test should still hold (no signature change); Implementer must verify.
  - `test/render/SceneRenderer.*.test.js` — any test that asserts entity world-x === entity.x exactly will fail post-Step-5; grep for `setMatrixAt` / `instanceMatrix` in `test/` before editing.
  - `test/ui/*.test.js` — index.html CSS changes; if any UI test computes layout heights they may need updated baselines.

## 6. 验证方式

- **Test amendment** (counted as `new_tests: 1` per spec): extend `test/atmosphere/dayNightLightingTint.test.js`:
  - At phases [0.00, 0.25, 0.50, 0.75], assert ambient + sun colour matches the NEW R1 stops (0xffb070 / 0xffffff / 0xff7a3a / 0x1c2850) within tolerance 0.04 (was 0.02).
  - Assert ambient intensity at phase 0.25 ≥ 1.20 (R0 was ≥ 1.10).
  - Assert ambient intensity at phase 0.75 ≤ 0.40 (R0 was ≤ 0.55) — this is the *visibility* claim made flesh in test.
  - Assert sunIntensity at phase 0.75 ≤ 0.16 (R0 had ≤ 0.30) — same.
  - Assert clamp lower bounds (Step 1): ambient ≥ 0.22, sun ≥ 0.12, hemi ≥ 0.20 even at weather=STORM × phase=0.75 (compose `applyDayNightModulation(applyDayNightModulation(stormProfile, 0.75), …)` style).
- **Manual Playwright** (build_commit base 1f6ecc6):
  1. `npx vite` → `http://127.0.0.1:5173` → Start Colony.
  2. **Lighting visibility**: enable Autopilot 4×, watch one full 90 s day cycle. Expect: a clearly warm-orange tint at ~22 s (dawn → day transition), a neutral noon at ~45 s, an amber-to-rose tint at ~67 s (dusk), and a navy-blue cool tint at ~85 s (night). If the cycle is still imperceptible, raise `colorBlend` (Step 1) to 0.72 or deepen night to 0x121d3c.
  3. **HUD clip 1024×768**: `browser_resize(1024, 768)`. The full HUD ribbon must show without clipping: Food / Wood / Stone / Herbs / Workers + secondary tier. Open the right sidebar — HUD must reflow inside `right: clamp(280px, 22vw, 460px)`.
  4. **Shortcut wrap 1366×768**: `browser_resize(1366, 768)`. Open Build sidebar → scroll to keyboard-shortcut grid. Each `.hk-row` must be a single line; description must not break "supply-chain" → "supply" + "chain".
  5. **Mountain checker**: zoom out, capture top half of map. Stone / wall clusters must read as a textured surface, not a 8×8 grid.
  6. **Worker stacking**: place 4 workers on a 1×1 tile (or wait until autopilot clusters them on a farm), screenshot. Each worker must be individually visible — none fully overlapping at the same pixel.
- **FPS regression**: `browser_evaluate` 5 s avg ≥ 55 fps at 1920×1080 default scenario; Step 5 adds ≤ 4 multiplications per worker per frame (1200 workers max → ≤ 4800 ops/frame, sub-microsecond budget).
- **Benchmark regression**: `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 90` — DevIndex must not drop below baseline 46.66 × 0.95 = 44.33 (lighting + texture-repeat + jitter are render-only; sim untouched).
- **Prod build smoke**: `npx vite build` → `vite preview --port 4173` → 3-min smoke at 1024×768 / 1366×768 / 1920×1080. Zero console errors. Confirm Post-Mortem.md still parses (no broken markdown).

## 7. 回滚锚点

- 当前 HEAD: `1f6ecc6` (R0 closeout commit, validated YELLOW per `assignments/homework7/Final-Polish-Loop/Round0/Validation/test-report.md`).
- 一键回滚: `git reset --hard 1f6ecc6` (orchestrator-only, on Implementer failure). Each of Steps 1-7 is independently revertable: Step 1 is a constant edit in one file, Steps 2-3 are CSS-only, Step 4 is a 4-line config table edit, Step 5 is a single helper + 4 call-site edits, Steps 6-7 are docs-only. If lighting amplitude (Step 1) lands too aggressive, Implementer may halve only the colour-stop deltas (e.g. dawn 0xffd9a8 → 0xffc890 instead of 0xffb070) without rolling back the whole plan.

## 8. UNREPRODUCIBLE 标记

Not applicable — A4's Round 1 feedback includes specific resolution-tagged screenshots (`res-1024.png`, `res-1366.png`, `steam-2.png`, `steam-3.png`, `steam-5.png`) and explicit reproduction steps for all 4 V5 bugs. The lighting visibility claim (V1) was self-reproduced over a 6-minute autopilot 2× run; Implementer can replicate via the manual Playwright step in §6.2.
