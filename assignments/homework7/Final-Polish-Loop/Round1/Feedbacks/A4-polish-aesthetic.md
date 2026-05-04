---
reviewer_id: A4-polish-aesthetic
round: 1
date: 2026-05-01
verdict: RED
score: 3
v1_lighting: 2
v2_color: 4
v3_audio: 0
v4_motion: 3
v5_bugs_count: 4
---

## 总评

Project Utopia plays like a competent simulation prototype that an engineer wrote for an engineer audience. As a *systems* artifact it is dense and clever — the heat lens, the AI Log telemetry, the role splits, the AI Storyteller storyline copy ("STRUGGLING — Day 7 / Food: -786/min / 0 idle / Threat: 55%"), and the autopilot's narrative beats ("First Farm raised: Your colony has a food foothold", "Tier-5 raid defended") are all the bones of a real game. As a *product* it is nowhere near a Steam page. There is no music, no SFX, no particle work, no day/night cycle that a player would actually notice, no procedural shading depth, no creature animation beyond a sprite drift, no transitions on panels, no settle motion when buildings appear, and the entire color story is "flat green on flat dark blue with HTML form widgets pasted on top." If I were scrolling Steam Next Fest at 60 thumbnails a minute I would not stop on any of the five candidate frames I captured. The genre I'm being scored against — RimWorld, Going Medieval, Dwarf Fortress with graphics, Against the Storm — has each long since solved this with at least *one* signature visual hook (parallax fog, isometric depth, painterly tiles, particle systems for fire/rain/sparkle). Utopia ships zero such hook. The "aesthetic" right now is "grid + colored squares + browser-default scrollbars." That is fine for a debug build. It is RED for "Steam screenshot test."

## V1 灯光与昼夜

- 现象描述: I sat through ~6 minutes of in-game time at autopilot 2× speed and the scene was lit identically the entire run. There is no warm/cool color shift, no shadow direction change, no ambient occlusion, no rim light, no time-of-day overlay. The "Day 7" counter in the Colony panel is purely a number — the actual rendered scene does not know what time it is. Buildings and worker sprites do not cast shadows; nothing responds to elevation other than a darker tile color. Water is a flat blue grid with hand-drawn wavelet sprites that never animate. The mountains in the north use a checker pattern that reads as "developer placeholder," not as terrain.
- 截图: `screenshots/A4/early-game.png`, `screenshots/A4/steam-2.png`, `screenshots/A4/steam-5.png` (all of these are the same lighting environment despite being minutes apart in-sim).
- 评分: **2 / 10**. The only reason it isn't 1 is that the night-sky border around the world map (the unexplored region) does have a subtle vignette/star-field treatment that gives the briefing screen some atmosphere.
- 改进建议: Even a 60-second cosine over (sun_angle, ambient_color, fog_density) would 5× the perceived production value. Cast a single directional shadow per building. Tint the overall lighting warm at "dawn" and cool at "dusk." Make weather actually re-tint the canvas (rain → desaturate + blue cast; drought → orange cast). Right now the simulation has weather and a day counter that the renderer simply does not visualize.

## V2 后处理与调色

- 现象描述: Zero post-processing. No bloom, no DOF, no SSAO, no color grading LUT, no tonemapping pass. Tile colors are saturated solid fills (forest green, beach tan, water blue, mountain navy) with no gradient or texture variation within a tile. Buildings look like 16-color HTML icons (the Quarry is literally a tiny grey hammer-on-pickaxe sprite, the Farm is a brown tilled square). The HUD chrome (sidebar, top bar, entity focus panel) uses one cohesive dark-blue glassmorphism style — that part is actually fine and consistent. But the *world* and the *UI* read as two different games glued together: the UI looks like a 2026 SaaS dashboard, the map looks like a 2010 Flash prototype.
- 截图: `screenshots/A4/steam-3.png`, `screenshots/A4/steam-4.png`.
- 评分: **4 / 10**. UI consistency rescues this from a 2 — if I cropped just the right sidebar I'd believe it was a real product. The map kills it.
- 改进建议: Pick a single PP stack (mild bloom on lights, slight chromatic aberration on edges, vignette, FXAA) and commit. Hand-paint one tile-edge transition gradient — even a 3-pixel blend between forest and grass would erase 80% of the "checker placeholder" feeling. Add subtle per-tile noise so identical tiles aren't pixel-identical.

## V3 音频混音

- 现象描述: I confirmed via `window.AudioContext` probing and DOM inspection that there are zero `<audio>` elements, no Howler, no Tone.js, no Web Audio nodes, no game audio bus. Six minutes of gameplay including a "Tier-5 raid defended" event, two warehouse completions, a Dev 40 milestone, and a starvation toast all happened in **complete silence**. There is no main menu music, no ambient bed, no UI click, no construction "thunk," no death stinger, no hover sound. The game does not currently ship audio at all.
- 截图: N/A — silence is silence.
- 评分: **0 / 10**. This is not a matter of mixing being bad; it is a matter of the audio pipeline not existing.
- 改进建议: This is the single highest-ROI polish item. Even a 90-second looping ambient pad (wind + faint birdsong) plus four stinger SFX (UI click, build complete, raid warning, worker death) would lift the perceived production value by an entire score point. A Steam reviewer who plays your build with their headphones on will assume their browser tab is muted and write you off in 30 seconds.

## V4 动效与微交互

- 现象描述: Mixed bag.
  - **Buttons**: Tooltips appear on hover (good — see `farm-hover.png`), but the buttons themselves have no hover transform, no shadow lift, no color shift on press. Disabled state is just slightly dimmer text. No focus ring for keyboard navigation that I could see.
  - **Worker animation**: Workers slide from tile to tile in a continuous lerp with no walk cycle, no foot-bobble, no idle breathing, no work-action animation. A FARM worker harvesting a tile just stands on the tile until the tile color updates. There is no "attack" animation during the raid I witnessed — the Tier-5 raid resolved with a toast and a counter increment, no visible combat.
  - **Buildings**: Construction does not have a build-up animation, no scaffolding, no progress bar that visibly drains; the tile recolors from "blueprint orange" to "completed brown" in a single frame. Demolish presumably is the same.
  - **Panels**: The right-sidebar tab switching (Build → Colony → AI Log) is **instant** — no slide, no fade. The Entity Focus panel pop-in is also instant.
  - **Toasts**: The "Tier-5 raid defended" and "First Farm raised" toasts do appear with what looks like a brief opacity fade, which is the one tasteful touch.
  - **Camera**: Pan / zoom appear to be raw — no smoothing, no inertia, no easing.
- 截图: `screenshots/A4/raid-defended-toast.png`, `screenshots/A4/farm-hover.png`, `screenshots/A4/colony-panel.png`.
- 评分: **3 / 10**. Toasts and tooltips exist; almost nothing else does.
- 改进建议: The cheapest 4-hour polish pass that would move this score from 3 → 6: (a) `transition: transform 120ms ease, box-shadow 120ms ease` on every button + a `:hover { transform: translateY(-1px); box-shadow: ... }` rule, (b) a `transition: opacity 200ms` on sidebar panel switches, (c) a 2-frame sprite toggle on the worker mesh during walk so they look like they're moving instead of skating, (d) a 0.4s `scale(0) → scale(1)` ease-out on building completion, (e) camera lerp of 0.15 on pan/zoom inputs.

## V5 视觉 bug 列表

| 严重度 | 描述 | 截图 | 复现 |
|---|---|---|---|
| P1 | At 1024×768 the top resource HUD is visibly clipped — words like "warehouses 4/2" become "s 4/2" and "5/6" floats orphaned because the right sidebar overlaps the HUD's right edge. | `res-1024.png` | Resize browser to 1024×768 in-game. |
| P1 | At 1366×768 the keyboard-shortcut legend in the right sidebar wraps so badly it becomes a vertical word-stack ("select / inspect tool" / "supply-chain heat lens") losing readability. | `res-1366.png` | Resize browser to 1366×768. |
| P2 | The mountain biome is rendered as a plain blue **checker pattern** with tiny tree icons sprinkled on the squares. It reads as a developer placeholder, not as terrain. | `steam-2.png` (top of frame), `steam-5.png` | Always present. |
| P2 | Worker sprites overlap each other on the same tile with full opacity, creating a "stack of tiny goblins" silhouette that is hard to parse. No outline / no separation. | `steam-3.png` (the orange 3×3 farm cluster), `steam-4.png` | Cluster 4+ workers on adjacent tiles. |

(P0 visible bugs: 0. P1: 2. P2: 2. Total: 4.)

## Steam 截图测试

### steam-1.png — 主菜单 / briefing 屏

- **时刻**: First load, before clicking Start Colony. Briefing card is centered with the unexplored-world tile texture as the background.
- **selling point**: The card layout is clean. The "Survive as long as you can / 00:00:00 · 0 pts" pill is genuinely nice. The "Best Runs" list with mixed templates suggests progression.
- **缺什么**: The background is a near-uniform dark blue with a checker pattern of identical tiny "?" icons — it looks like a placeholder, not a hero shot. There's no logo, no character art, no environmental hook. The screenshot reads as "settings page," not "game." Add a parallax world map peek, a hero illustration, or a moody vignette of a real colony in trouble.
- **Steam-worthy?** No. I'd swipe past.

### steam-2.png — 殖民地刚落地

- **时刻**: ~13 seconds into the run. Two scenario tags on the map ("west lumber route", "east ruined depot ×2"). 19 workers in the focus panel, all "Wander / a bit hungry."
- **selling point**: The two scenario tags with the colored ring underneath them are clever — they communicate "objectives" visually. The focus panel is information-dense in a way that hardcore sim fans like.
- **缺什么**: 80% of the visible map is the empty grid and the right-sidebar Build palette. The actual colony is invisible because nothing has been built yet. The "wander" workers are fly-spec-sized motes. There's no focal point, no leading line, no character. As a Steam screenshot it reads as "spreadsheet of icons + grid."
- **Steam-worthy?** No.

### steam-3.png — 第一次扩张 / autopilot 在建造

- **时刻**: ~1:42 into the run, autopilot ON, "Recovery: food runway" event running. The center of the map shows an orange-tile cluster (farms in progress) with workers harvesting and a few warehouse blueprints.
- **selling point**: This is the **best of the five**. There is finally something visible *happening* — orange farm tiles, the start of a road, blue heat-lens water on the left, workers in role colors. The toast "The colony breathes again. Rebuild your routes before the next wave." reads like a real game beat.
- **缺什么**: Still no contrast — everything is the same midtone saturation. The buildings are 16×16 icons not models. The orange farm tiles look like spreadsheet cells with brown frosting. The worker sprites are 4-pixel motes. A Steam buyer wants to see *one* big building, *one* dramatic moment, not a grid of orange squares.
- **Steam-worthy?** Borderline. Maybe as a #4 / #5 secondary screenshot showing systems depth, never as a hero.

### steam-4.png — 中后期 / Dev-40 milestone

- **时刻**: ~2:46 into the run. "First Farm raised: Your colony has a food foothold" toast. Multiple farm tiles, a quarry, two warehouses, ~21 workers split across FARM/WOOD/HAUL/BUILDER.
- **selling point**: Dense activity — you can see colony scale ramping. The role mix in the Entity Focus is finally varied (not all hungry).
- **缺什么**: Same fundamental problem — the rendering is so flat that "more activity" just means "more colored squares." There's no skyline silhouette, no smoke from a chimney, no glowing window, no campfire. Compare to a single Going Medieval screenshot: one timber house with a thatched roof and two villagers in winter cloaks beats this entire frame.
- **Steam-worthy?** No.

### steam-5.png — 殖民地稳定运营

- **时刻**: ~5:12 into the run. "Dev 40 — foothold: Your colony is surviving; widen the production chain." Big farm cluster, two warehouses, road network beginning to form, mountain checker at top.
- **selling point**: This is the closest thing the game currently has to a "thriving colony" hero shot. The road tile (the small blue stripe at center) has a slight pattern that hints at infrastructure depth. The "Dev 40" banner is a real progression beat.
- **缺什么**: Top half of the frame is a checker mountain that screams "placeholder texture." The bottom half is a near-empty grass field. The actual colony occupies maybe 12% of the visible area. Recompose: zoom in 2× on the colony cluster, crop out the placeholder mountain, add a soft vignette, push the saturation 15%. *Then* it might be a hero shot.
- **Steam-worthy?** No, but it has the most potential of the five if reshot.

## 结论

This build is at the **"vertical slice of systems"** stage, not the **"Steam Early Access trailer"** stage. It is RED on the polish-aesthetic axis, and the gap is structural, not a checklist of nits. The three things I would do *before any other polish work*, in this order:

1. **Ship audio at all** (V3, currently 0). Even one ambient loop + four UI/event SFX would move audio from 0 → 5 and the overall verdict from RED to YELLOW by itself.
2. **Day/night cycle that actually re-lights the scene** (V1). Just modulating ambient color + a moving directional shadow over a 90s loop would make every screenshot dynamic instead of static.
3. **Replace the checker-pattern mountain biome and the icon-on-square buildings with even one tier of art**. You don't need RimWorld's pixel art — just a tile-edge gradient + a building silhouette with a 1-pixel rim light would 3× the perceived production value.

Without those three, no amount of UI hover-state work will make this look like a finished product. With those three, this build could plausibly hit a YELLOW verdict in one polish loop.

## 缩放 / 分辨率合规性 (硬性规则)

Tested at: 1920×1080 (primary), 1366×768, 1024×768, 2560×1440 (capture artifact — Playwright clamps the screenshot to viewport scaling, so the 2560 image is unreliable; the visible layout at that size showed empty right-side dead space and a HUD that doesn't scale up). HUD clipping at 1024 and shortcut-legend wrap at 1366 are both P1 issues that should be fixed before any public build.
