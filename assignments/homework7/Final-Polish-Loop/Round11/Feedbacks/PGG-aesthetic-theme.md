# PGG-aesthetic-theme — R11 Aesthetic / Theme-Alignment Audit

Reviewer: PGG (Aesthetic-Theme-Alignment, BLIND).
Build under test: v0.10.1-m, preview server `http://127.0.0.1:5173/` (vite preview).
Methodology: Single playthrough, ~7 min wall-clock at 4x sim-speed (run timer reached 00:07:20 in-game), Fast Forward via `#speedFastBtn`, Story AI offline (LLM proxy timed out → fallback director, expected for offline review).
Viewports captured: 1920x1080 (initial / 1-min / 2-min / max-zoom-in), 1366x768 (zoomed / zoomed-out / heat-lens / entities). Screenshots stored as `r11-aesthetic-*.png` in the Playwright MCP output dir.

---

## 1. Theme Reference (HW1 a1.md, verbatim)

> "Project Utopia is a **minimalist, grid-based management simulation** where a small world runs itself through autonomous agents and emergent group motion. **All living entities are rendered as simple spheres**, and the world is a **tile grid where roads and buildings are represented as special tiles**."
>
> "the goal is to **watch the settlement become a living system**: resource flows appear as moving crowds, herds create organic motion, and the player's building decisions reshape traffic patterns."

The pact has four enforceable visual axes:
- **A1 — Sphere entities** (all living things = spheres, no meshes/sprites/icons).
- **A2 — Tile-grid clarity** (square grid; roads & buildings as *special tiles*, not dioramas).
- **A3 — Minimalist UI** (HUD readable, not crowded; the world stays the hero).
- **A4 — Living-system legibility** (motion/flow/crowds visible; supply chains readable in <5 s).

---

## 2. Theme-Compliance Audit

### A1 — Sphere entities  (PASS, with caveats)
- **Engine truth**: `SceneRenderer.js:1411` — `new THREE.SphereGeometry(0.34, 14, 14)` is the canonical entity geometry; instanced for up to 1200 workers + 240 visitors. No PlaneGeometry sprites, no glTF meshes, no canvas-text overlays for entities. Workers, visitors, animals, predators, traders, saboteurs all share the sphere primitive (color/scale-tinted by role).
- **Visual truth (zoomed-in screenshot `r11-aesthetic-1920-zoomed-max.png`)**: The little white dots roaming green tiles are clearly spheres with ambient-only lighting. **Theme-compliant.**
- **Caveat**: At default zoom the spheres are 4–6 px tall and visually compete with the painted *tile-glyphs* (lumber-icon, stone-pile, sheaf-of-grain) baked into ProceduralTileTextures (see `ProceduralTileTextures.js:233 drawFarm`, `:267 drawLumber`, etc.). On first glance a reviewer mistakes the *static tile-icons* for the entities — diluting the "spheres are the agents" reading.
- **Compliance score: 90%** (engine compliant; visual hierarchy understated).

### A2 — Tile-grid clarity  (PARTIAL — 70%)
- The grid IS square (96x72 Uint8Array, BoxGeometry per tile, `SceneRenderer.js:1124`). However, the procedural textures and overlay alpha-blending give an organic, hand-painted appearance — large green diamond/lozenge "biome blobs" with jagged feathered edges dominate the wide-shot. **You cannot see the grid lines** at default zoom (only the heat-lens overlay reveals true tile boundaries — see `r11-aesthetic-1366-heatlens.png`).
- Roads ARE special tiles (brown ribbon — clearly readable). Warehouses/farms ARE special tiles (brown clearings with glyphs) — but the glyphs (stone-piles, sheaves) push them visually toward "diorama icon" instead of "abstract tile."
- The water tile uses a fine-textured ripple pattern that looks more like a Civ-V tile than a minimalist square. Soft, but inconsistent with stated minimalism.
- **Compliance score: 70%.**

### A3 — Minimalist UI  (FAIL on 1366x768 — 55%)
- **At 1920x1080**: HUD breathes. Topbar resource pills (Food/Wood/Stone/Herbs/Workers) are tidy, status banner readable, sidebar (~22% width) acceptable, Entity Focus panel docks tidy at bottom-left.
- **At 1366x768** (still a common laptop default): the right Build Tools sidebar consumes ~25% horizontal real-estate; the Entity Focus card consumes the bottom-left ~30% of the canvas; the topbar story-banner truncates ("Autopilot OFF - manual; buil…"); the status text wraps onto two lines. The world canvas — the *hero* of the theme — is squeezed to ~50% of its natural area. Two screenshots confirm: `r11-aesthetic-1366-zoomed.png`, `r11-aesthetic-1366-zoomedout.png`.
- The right sidebar tab strip ("Build / Colony / Settings / AI Log / Debug / Heat / Terrain / Help") shows EIGHT vertical tabs at 1366px — visually dense. Plus a giant kbd-shortcut card permanently visible below the build tools.
- The "Story AI is offline — fallback director is steering" banner sits as a **green** chip at top of Entity Focus, mimicking a success banner; cognitively reads "good," but it's actually a degraded state.
- **Compliance score: 55%.**

### A4 — Living-system legibility  (PASS — 80%)
- Floating death-toasts ("Wolf-40 died - killed-by-worker", "Deer-20 died - predation") give immediate causal feedback — strong signal that this is a living world.
- Annotated POI rings ("west lumber route x2", "east ruined depot") are an inspired touch — they label *where the system is currently focused.* Theme-aligned.
- Heat lens (`L` key) shows red/blue tile overlays for piling-up vs. waiting buildings — extremely on-theme: the world becomes data without losing the grid.
- Worker convoys along the brown road ribbon ARE visible as moving white sphere streams at zoom — pillar #2 (Boids) is visually delivered.
- Gap: at default zoom the spheres are too small to read as a "crowd" — the eye is drawn to the static painted glyphs first.
- **Compliance score: 80%.**

### Aggregate compliance: **(90 + 70 + 55 + 80) / 4 = 73.75% ≈ 74%**

---

## 3. Top 3 Aesthetic Gaps

### Gap #1 — Spheres are too small / lost in the painted tile-glyphs (HIGH)
The **single most violated theme tenet** by visual weight: "all living entities are rendered as **simple spheres**" — but at the default camera height the painted lumber/stone/farm icons baked into the tile textures dominate the eye. A blind reviewer arriving at the splash and starting a colony will see "RimWorld-style icons + tiny dots" rather than "abstract sphere agents on a grid." This inverts the stated visual hierarchy.

### Gap #2 — 1366x768 layout collapses into chrome-dominant (HIGH)
On a common laptop viewport, UI chrome takes >50% of pixels. The Entity Focus panel at bottom-left, Build Tools + tab strip + kbd card on the right, plus a wrapping topbar leaves the world canvas as a postcard. "Minimalist UI" is the theme's third word; current reading is dense / cluttered.

### Gap #3 — Tile boundaries invisible without overlays (MEDIUM)
The "tile grid" theme tenet relies on the player perceiving tiles as the atomic unit. Currently there is no subtle grid hairline, and the procedurally-painted biome textures with feathered edges blur the underlying square grid into amorphous green/blue blobs. Only when the player presses `L` (heat lens) does the grid materialize.

---

## 4. Suggested In-Freeze Polish (small, low-risk)

These are scoped for v0.10.1-n / R11 freeze — no new systems, only render/CSS knobs.

### Polish P1 — Lift entity sphere visual weight (addresses Gap #1)
- Bump default sphere radius from `0.34` → `0.42` (≈+24% area) in `SceneRenderer.js:1411`.
- Add a subtle 1.5px white outline ring (cheap rim-light shader OR `MeshBasicMaterial` halo plane behind each instance) so spheres pop against the green tiles. Workers should be visually *louder* than the static tile glyphs.
- Lower opacity of the painted *resource glyphs* on FOREST/STONE/HERB tiles by ~25% so the scene reads "grid + agents" not "glyphs + dots."

### Polish P2 — 1366x768 sidebar collapse + transparency (addresses Gap #2)
- Right sidebar: collapse to a 32px icon-rail by default at width <1440px; expand on hover/tab-click. Saves ~18% horizontal real-estate.
- Entity Focus panel: make backdrop-filter `blur(6px)` + `rgba(20,28,40,0.55)` so the world stays partially visible underneath; OR add a "minimize" chevron that docks it to a bottom strip showing only counters.
- Compact the kbd-shortcut card into a single `?` floating button (already exists as F1 — the always-visible card is redundant).
- Topbar: shrink the "Run … Score … Dev …" run-status block; move it into the Colony tab to free the topbar for resource pills + autopilot only.

### Polish P3 — Make the grid actually visible (addresses Gap #3)
- Add a 1-px `rgba(255,255,255,0.04)` grid overlay (single PlaneGeometry with a tiled fragment shader, or a pre-baked 96x72 line texture) on the ground plane, always on. Below the threshold of "noisy" but above the threshold of "perceivable as a grid."
- Alternative if perf-sensitive: only render grid-lines on tiles within a 12-tile radius of the camera focus (existing fog-of-war machinery already culls per-tile).

### Polish P4 — Re-color the "Story AI offline" chip (5-min fix)
Change the green success-style chip at `#story-status` to amber (`#f4b740` background) so the degraded-state reads correctly. This is purely a CSS tweak.

### Polish P5 — Tile-glyph polish, optional
If P1's opacity-reduction isn't enough, replace the painted lumber/stone/farm glyphs with single-color **filled circles or chevrons** — staying true to the abstract minimalism the theme calls for. Dramatic but pure-render-layer change.

---

## 5. Things That Are Already Theme-Compliant (don't break them)

- The dark-navy background palette (`#0a1320`-ish) — gives the bright spheres room to pop. Keep.
- Heat-lens red/blue tile fills — exemplary minimalist data-viz. Keep.
- POI ring labels ("west lumber route") — inspired. Keep.
- Death-toasts with causes — strong "living system" signal. Keep.
- Splash screen (centered modal, "balanced map / steady opening" chip) — clean and on-brand.
- Hex-button quick-keys (1–9 build tool numbering) — minimalist + functional.

---

## 6. Closing

Project Utopia at v0.10.1-m delivers the theme structurally (engine spheres, tile grid, autonomous-agent loop) but loses 25% of the aesthetic compliance to **visual hierarchy issues** — the small spheres get out-shouted by painted tile glyphs, and the UI chrome dominates at 1366x768. All three top gaps are addressable with sub-day, render/CSS-only changes (P1+P2+P3) — no system rewrites required. After P1+P2+P3 I would expect compliance to lift from ~74% → ~88%.
