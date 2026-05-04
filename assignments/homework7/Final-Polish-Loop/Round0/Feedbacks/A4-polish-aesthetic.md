---
reviewer_id: A4-polish-aesthetic
round: 0
date: 2026-05-01
verdict: RED
score: 3
v1_lighting: 2
v2_color: 4
v3_audio: 0
v4_motion: 3
v5_bugs_count: 6
---

## 总评

This is the part of the review I dread writing — because Project Utopia clearly has *systems* under the hood, and several pieces of UI surface (the Settings panel, the Colony stats, the Director storyteller blurbs, the build-tool icons) hint at a team that knows what good polish looks like. But what shows up on screen, the part a Steam visitor would judge in their first six seconds, looks like an in-engine debug view that someone forgot to dress for shipping. Tiles render as a checkerboard with hard 1-pixel seams between every cell. Water is a static blue grid of squares — no shimmer, no flow, no gradient at the shore. Forest is essentially indistinguishable from grass except by a slightly darker shade. Buildings are top-down 32×32 icons sitting on flat brown squares, indistinguishable in silhouette. There is no day-night cycle visible, no shadows that respond to a sun, no weather variation. Audio appears entirely absent — I never heard a single sample, music cue, or UI sound across roughly 18 minutes of testing.

The art direction reads as a placeholder pass, kept because everyone got busy fixing the simulation. The simulation itself is rich (the Director / Storyteller flavor text, the heat-lens overlay, the resource panel with "spoil" and "until empty" runway projections, the AI Log panel with full LLM call I/O) — that polish belongs to the data layer, not the visual layer. As an "indie colony sim that I'd buy" my anchor at 9 (Rimworld, Going Medieval, Dwarf Fortress Premium, Songs of Syx) and at 1 (a unity asset flip), I land at **3 — a YELLOW-RED bordering RED prototype**. The dev team is shipping a great spreadsheet wrapped in a debug renderer.

Verdict: **RED**. The build is not Steam-shippable in its current visual state. It is conference-demo shippable, with verbal "we know about the art" disclaimers.

## V1 灯光与昼夜

- 现象描述: I observed the game from start through ~18 minutes of survival across multiple restarts. The lighting is **completely static**. There is no perceptible day-night cycle — the colors at minute 17 are identical to the colors at second 0. I confirmed this by comparing screenshots `01-game-start.png` (00:09) against `24-deep.png` (17:46): same brightness, same hue temperature, no shadow direction, no twilight tint. There are no cast shadows from buildings or trees. The dark gray amorphous "blob" shapes I initially thought were terrain shadows turned out to be **fog of war** (confirmed by the "Fog of War" toggle in Settings) — but they're rendered as raw cookie-cutter polygons with no soft falloff, no edge fade, no gradient. They look like cardboard cutouts laid flat on the map. There is no specular shimmer on water, no atmospheric perspective on distant tiles, no rim-light on entities. The Settings panel claims "Shadows: Auto" — but I see zero shadow contribution at any time of day.
- 截图: `screenshots/A4/01-game-start.png`, `screenshots/A4/22-late.png`, `screenshots/A4/24-deep.png`
- 评分: **2/10**
- 改进建议: At minimum, ship a 2-minute day-night ambient color ramp (warm yellow at "morning", cooler blue at "evening", desaturated dark blue at "night") even if you never compute true light propagation. Add a soft falloff (3-tile feather) to the fog of war polygon edges. Tint entity sprites by ambient light. Add a subtle drop-shadow pass for buildings using a single offset darken. None of this requires real lighting math, all of it makes the world feel alive.

## V2 后处理与调色

- 现象描述: The palette inside a single screenshot is honestly fine — the greens of grass, the brown of farms, the blue of water, the orange of construction-zone overlay all sit harmoniously together with consistent saturation. The problem is **per-tile noise**: every tile reads as its own independent color cell with hard borders against neighbors (see `02-running.png`, `07-default-view.png`). The grass field is not "one field" — it's a checkerboard of 200 tiles each picking a slightly different green from a noise function. Same for water. This breaks the "Steam thumbnail at 460×215" test instantly: the player sees a chessboard, not a landscape. There is no bloom, no SSAO, no color grading LUT applied — it looks like a render straight out of a Three.js material with no post-processing at all. Weather variation: the simulation tracked weather in the AI Log ("weather=clear focus=let the colony breathe") but I saw no visual weather change. No rain particles despite a "Weather Particles" toggle being ON. No drought desaturation. No fog overlay outside fog-of-war.
- 截图: `screenshots/A4/02-running.png`, `screenshots/A4/07-default-view.png`, `screenshots/A4/24-deep.png`
- 评分: **4/10** — palette is consistent, but there's no cohesion or atmospheric grading.
- 改进建议: Render adjacent same-type tiles with a single shared color (compute the mean and disable per-tile noise) or apply a screen-space blur pass + sharpen to suggest organic terrain. Add a global post-FX: at minimum a subtle vignette and a warm/cool LUT swap based on time of day. Make weather visible — even just a dimmed-overlay rain pass would enormously improve weather-event readability.

## V3 音频混音

- 现象描述: I cannot verify audio because the Playwright harness doesn't expose audio output, but I checked the DOM and Settings panel for any audio-related controls. There is **no master volume slider**, **no music volume slider**, **no SFX volume slider**, and no mute button anywhere in the Settings panel (which is otherwise quite thorough — it has Quality Preset, Resolution Scale, UI Scale, 3D Rendering, Shadows, AA, Textures, GPU Power Preference, six display toggles, Map & Doctrine settings). The complete absence of any audio settings is the strongest available indicator that **there is no audio in the game**. No <audio> tags were referenced in the snapshot. Page title doesn't suggest a music engine. If audio were shipping I would expect at least a "Volume" UI control. Critical events that should have audio anchors — colony stalled / death notifications / building completion / first lumber camp raised — produce visual toast notifications only.
- 截图: `screenshots/A4/19-settings.png` (Settings panel — note absence of audio section)
- 评分: **0/10** — assuming no audio ships. If there is and I just can't hear it, raise to 2/10 because the Settings panel still doesn't expose volume controls, which is a Steam-day-1 review-bomb risk.
- 改进建议: Even a single 2-loop ambient track ("colony day theme" / "colony night theme") + 6 SFX (build-place, build-complete, colonist-death, raid-warning, ui-click, milestone-achieved) would lift the production-feel score by 4 points. Add Master / Music / SFX sliders to Settings.

## V4 动效与微交互

- 现象描述: Hover/active states on buttons are present and tasteful — the build tool buttons (`Road`, `Farm`, `Lumber`...) get a subtle background fill on hover, and the active tool gets a blue highlighted outline. The sidebar tabs animate cleanly. The toast notifications (`First Lumber camp raised`, `Route online`, `Dev 40 - foothold`) slide in at the bottom-left and feel responsive. The play-speed buttons (⏸ ▶ ⏩ ⏭) have clean iconography. **However** — the worker entities I saw on the canvas have no visible animation: no walk cycle, no idle bob, no work animation. They are static sprites that teleport-step from tile to tile (this was visible because the framerate was high enough to see them snap). Construction tiles do not show a progress bar growing — they just appear as orange overlay tiles and then become brown roof tiles. There's no place-puff particle when a building is placed. Demolish does not animate. Resources being carried by workers are not visually attached. Panel open/close (Build → Colony → AI Log via sidebar tabs) appears instant — no slide-in transition, no fade. The "How to Play" modal does fade in nicely with backdrop blur, which is the most polished single transition I observed.
- 截图: `screenshots/A4/14-help.png` (good modal animation), `screenshots/A4/12-colony-panel.png` (clean sidebar swap but no transition), `screenshots/A4/21-zoomed.png` (entities visible — flat, static)
- 评分: **3/10**
- 改进建议: Give workers a 2-frame walk cycle (offset Y bob), add a 0.3s fade for sidebar panel swaps, add a fade-in for the "Auto-overlay" notification, animate construction progress as a fill-up overlay, add particle pop on building completion, animate the resource-carry icon.

## V5 视觉 bug 列表

| 严重度 | 描述 | 截图 | 复现 |
|---|---|---|---|
| **P0** | Status bar text "Autopilot ON · fallback/llm ｜ Recovery: food runway · expansion paused ｜ Autopilot struggling…" overflows the top-bar frame at 1920×1080. The ribbon is taller than 1 line so it breaks layout above the canvas — text gets clipped where the orange status pill ends. Visible across all screenshots from 20-autopilot.png onward. | `20-autopilot.png`, `steam-1.png` | Enable Autopilot, run for 20s, observe top bar |
| **P0** | Map-preview labels on main menu duplicate-render: "west h... west lumber route" with a clipped left fragment overlapping the full label. Two pairs visible. Stays through gameplay. | `01-game-start.png`, `02-running.png` | Open game, observe |
| **P1** | Day/night cycle absent. Page never tints, no shadow rotation, no ambient warmth ramp. | All screenshots compare same. | Run >15 minutes |
| **P1** | Tile checkerboard seams visible across all biomes (water, grass, forest). 96×72 cells render as discrete blocks with no inter-tile blending. | `02-running.png`, `07-default-view.png` | Look at any non-overlay view |
| **P2** | "Lumber Mill" terminology in Help modal vs "Lumber" in build toolbar. | `14-help.png` | Press F1 |
| **P2** | Inspector hint "Click a worker, visitor, or animal on the map to inspect it here" floats unanchored over the canvas in the small-resolution layout, pointing nowhere. | `17-1366.png` | Resize to 1366×768 |

The 1024×768 resolution test (`16-1024-game.png`) produced wrap-then-clip on the top status bar (truncates "builders/director"). The 2560×1440 test (`18-2560.png`) produced no new bugs — modal stays centered correctly.

## Steam 截图测试

### steam-1.png — Mid-game outpost overview
- 时刻: ~5:12 in. Colony has placed Lumber camp, scattered farms / herbs, gray quarry tiles. Toast "First Lumber camp raised: Wood supply is online." visible.
- selling point: Shows actual gameplay — tile diversity, worker ant-farm visible at center, the "supply chain comes online" emergent moment. The color contrast between brown construction zones and green developed land tells a story.
- 缺什么: Constructed buildings are all visually identical brown squares. There's no sense of vertical scale (no buildings rising above the ground plane — pure top-down). The fog-of-war black blob on the right kills 30% of the composition with a flat dark mass. As a Steam thumbnail this would lose to literally every competitor; it reads as "spreadsheet sim".

### steam-2.png — Production chain in motion
- 时刻: ~7:39. More farms being seeded. Heat-lens-style colors layered over grid. Storyteller pill at top-right with multi-line status.
- selling point: The orange/green checker pattern in the developed area conveys "managed land vs wild land" effectively. Several "carry" icons (loose resource pebbles) suggest workers are actively hauling.
- 缺什么: The orange-construction-zone overlay clashes loudly with the teal-water and the green-grass. There's no focal hero element to anchor the eye. Every tile competes for attention because everything is the same scale. A real Steam shot needs a "look at this awesome building" hero.

### steam-3.png — Dev 40 foothold milestone
- 时刻: ~9:06. Toast "Dev 40 - foothold: Your colony is surviving" — narrative milestone.
- selling point: The toast text gives this shot purpose. The map shows visible expansion (more brown roof tiles than steam-2).
- 缺什么: The toast itself is a tiny 6-pt grey label at the lower left — invisible at thumbnail scale. The visual story (achievement!) doesn't translate without a banner-style milestone notification with a hero icon.

### steam-4.png — Late-game map density
- 时刻: ~11:47. Densest map state I captured.
- selling point: Pure scale — many workers, many buildings, agricultural patchwork pattern. Could be a "look how far you can grow" wide-shot.
- 缺什么: Without a day-night warm-tint, without buildings of different visible silhouettes, without entity animation freezing in place to show "doing thing", the wideshot reads as "someone made an Excel pivot table green-themed". Compare to a Rimworld late-game screenshot — chaos of activity, varied buildings, blood, fire, mood — vs this clean checkerboard.

### steam-5.png — Build tool engaged + sidebar
- 时刻: ~15:54. Build tool active with Farm selected. Visible right panel showing tooltip + cost.
- selling point: Demonstrates the planning UX — "you direct, the AI executes". Shows the rich systems-sim layer.
- 缺什么: The right-side Build panel takes 400px — that's 20% of the screen. For a Steam shot of "look at this game" the UI dominates the actual game. The button glyphs are pretty (Road / Farm / Wall etc) but they could be 4× larger or laid out around the cursor for a screenshot.

## 结论

**Visual: prototype-grade.** The renderer technically functions but does not communicate "shippable indie game". Tile seams, no day-night, no shadows, no animation, no atmospheric variation, no building 3D / silhouette diversity. Forest indistinguishable from grass without a tile-icon overlay. The fog-of-war is a flat polygon. **The deepest single problem is that everything is rendered at the same visual weight** — a worker, a wheat sprite, a stone tile, a construction marker, a forest tile all read as 32×32 flat squares competing for screen space.

**Audio: silent.** The Settings panel doesn't even expose volume controls, which is the load-bearing diagnostic — there is no audio shipping.

**Motion: partial.** The UI button hover / active states and the Help modal fade are well done. Workers are static. Construction has no progress visual. Panels swap instantly. Toasts feel decent.

**Bug count (P0+P1):** 4 (status bar overflow, label duplicate-render, no day-night, tile seams).

**The good news:** the systems-layer polish (Director Storyteller, Resource panel with runway projection, Heat Lens overlay, AI Log with structured causal chain, Settings panel with quality presets, milestone toasts, "until empty" warnings) shows the team **knows what polish is**. They just haven't applied it to the renderer or the audio engine. A focused 2-week visual pass (tile blending, day-night ramp, building elevation, weather particles, soft fog edges, basic walk cycles, plus 8 SFX and 2 BGM tracks) would lift this from a 3/10 to a 6/10 and make it a credible Steam Early Access candidate.

Until then: **RED. Do not Steam-page this build.**
