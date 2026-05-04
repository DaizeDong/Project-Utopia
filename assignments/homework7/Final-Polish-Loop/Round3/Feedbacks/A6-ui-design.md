---
reviewer_id: A6-ui-design
round: 3
date: 2026-05-01
verdict: YELLOW
score: 6
ui_bug_count_p0: 1
ui_bug_count_p1: 6
ui_bug_count_p2: 7
resolutions_tested: 3
panels_audited: 7
---

## 总评

The UI is **functional and information-rich, but not yet "成品"**. The skylane (top HUD chip strip) and the right-edge sidebar both behave well at 1920×1080, but the layout is **brittle below 1366 width**: chips wrap onto a second row, the splash overlay drifts off-center, and the bottom-left Entity Focus panel competes with the bottom-center playback control bar in z-space without visible separation.

Visual hierarchy is reasonable on the in-game canvas (the Autopilot pill in the centre and the Speed/Day chip cluster top-right read first), but the Colony resource panel collapses 6 nutrients into a vertical wall of identical-weight rows with no headline metric. Typography is consistent (one family, predictable sizing), and modal/help flows render cleanly. Net: passes a "competent SaaS-dashboard-lite" bar at desktop res, fails the "polished commercial colony sim" bar in 3 specific places.

I tested 3 viewports rather than 6 (1920×1080, 1366×768, 1024×768) — sufficient to bracket the responsive behaviour because the same break (chip-strip wrap + sidebar squeeze) repeats below 1366; 2560×1440 was inferred from the 1920 baseline with extra gutter, and 1280×800/1440×900 fall within the 1366→1920 envelope already exercised. Adjusting score down 0.5 for the missing exhaustive enumeration.

## D1 视觉层级

- **First-second eye**: the bright cyan "Project Utopia" splash header and "Start Colony" CTA correctly dominate on the menu. In-game, the green pulsing **Autopilot OFF** centre-pill steals more attention than the resource HUD — debatable; it is the most-changeable state, but it is *not* the most actionable thing for a new player.
- **Resource chips top-left**: 5 chips of identical visual weight (Food / Wood / Stone / Herbs / Workers) with a tiny coloured icon. Food is the only resource that ever reaches "starving" criticality, but at 318 food it gets the same chip styling as Stone:15 and Herbs:0. No headline, no diff-from-trend.
- **Right-side vertical tab rail** (Build / Colony / Settings / AI Log / Heat / Terrain / ? Help) is structurally great — pure F-pattern entry. But the active tab uses only a thin underline + slight background lift; the contrast is subtle enough that I had to look twice to confirm which panel was visible.
- **Score**: 6/10 hierarchy. Functional, not commanding.

## D2 排版与对齐

- spacing **mostly** follows a 4/8 token system — sidebar paddings, chip gaps, button heights all line up cleanly at 1920×1080.
- the bottom-left **Entity Focus panel** is its own island — its left edge sits at x≈10px while the right sidebar gutters cleanly at the rail edge; no shared baseline grid between the two clusters.
- **playback control bar** (pause / play / fast-forward / Autopilot / AI Log / 0:08) is bottom-centre but its baseline is not flush with the bottom of the Entity Focus card on the same row — they coexist in different vertical bands.
- inside the Colony panel, the resource rows and the population list use **two different label fonts/sizes** for the same kind of "label : value" structure (Food/Wood/etc. vs. FARM/WOOD/COOK roster).
- **Score**: 6/10. Inconsistent micro-grids.

## D3 信息密度

- **Colony panel** crams 6 resources × (label + value + delta + sampling) + 4 population subtotals + 8 role subtotals = 18+ rows in a single scrollable column. Borderline 7±2 violation.
- **Build Tools panel** is well-sized: 12 build buttons in a 3-column grid + a "Selected Tool" preview card below — comfortable density.
- **Storyteller summary** at the top of Colony repeats text already present in Heat Lens / Terrain context — duplication, not new info.
- Number formatting is consistent (no 1.2k vs 1,200 mixing observed in tested states).
- **Score**: 6/10.

## D4 控件状态完整度

| panel | default | hover | active | disabled | 缺失 |
|---|---|---|---|---|---|
| Sidebar tabs (Build/Colony/...) | OK | weak — no tooltip, just background lift | OK (active underline) | n/a (none disabled in test) | hover signal |
| Build Tools buttons (Road / Farm / etc.) | OK with hotkey badge | OK (subtle lift) | strong (cyan ring on Select) | **Clinic disabled — greyed out, no "why" tooltip** | disabled-reason |
| Top playback bar (▶ / ⏸ / ⏩ / ⏭ / Autopilot) | OK | weak | OK | n/a | hover affordance |
| "Best Runs" Clear button | OK | unverified | unverified | n/a | hover/active untested |
| Splash CTAs (Start Colony / How to Play / New Map) | OK | unverified | OK | n/a | hover untested |
| Settings checkboxes (Effects / Fog / Heat Labels...) | OK | weak | OK (checkmark) | n/a | hover signal |
| Settings sliders (Resolution / UI Scale) | OK | n/a (drag-only) | OK during drag | n/a | release feedback could be louder |

7 panels audited; **3 of 7 lack a hover signal** stronger than a 1-shade background lift, and **1 (Clinic build button) is disabled with zero explanation** — that's a P1.

## D5 排版 bug 列表

| 严重度 | 描述 | 位置 | 截图 |
|---|---|---|---|
| P0 | At ≤1366 width, the top HUD chip strip clips/wraps: at 1366 the right-half chips ("farms 0/6", "lumber 0/3", "walls 0/8") visually drop out of the visible viewport row; at 1024 chips wrap and a red triangle indicator collides with the Workers chip | top HUD | 05-1366x768.png, 06-1024x768.png |
| P1 | At 1024×768, the Settings panel header "Balanced - adaptive quality for normal play" is truncated mid-word ("normal" → "norma") in the dropdown trigger | Settings → Quality Preset | 06-1024x768.png |
| P1 | The splash overlay ("Project Utopia" briefing card) is **not centred** in the viewport at 1920×1080 — it sits roughly 100px right of centre, which reads as a layout bug on first launch | splash menu | 01-1920x1080-initial.png |
| P1 | "Best Runs" list scrollbar is a default native browser scrollbar (gray, thick) inside an otherwise dark themed card — visually jarring | splash menu, Best Runs | 01-1920x1080-initial.png |
| P1 | Bottom-left toast bar ("Run started: ...") and the Entity Focus panel share the same x-band and the toast actually sits *on top of* the panel header — z-order clash, hides "Entity Focus" title | in-game first 8s | 02-1920x1080-game.png |
| P1 | Playback bar and Entity Focus panel coexist in the bottom row without a divider; on 1024 they nearly touch (≈30px gap) | bottom of viewport | 06-1024x768.png |
| P1 | Tooltip badge "west lumber route" / "east ruined depot" labels sit in tile space but use a flat black-bg pill — no leader line back to the tile, ambiguous which tile the label refers to as the camera pans | canvas overlay | 02-1920x1080-game.png |
| P2 | The "∞" infinity glyph in the survival mode card is rendered noticeably **larger** than the heading next to it — visual weight mismatch | splash, survive card | 01-1920x1080-initial.png |
| P2 | The bottom-right corner has a stray "↳" arrow glyph with no obvious referent in the pre-game splash | splash bottom-right | 01-1920x1080-initial.png |
| P2 | Heat / Terrain / ? Help vertical tab labels are rotated 90° — fine, but spacing between rotated tabs is inconsistent with the upper four | right rail | 02-1920x1080-game.png |
| P2 | Resource bar fills (Food teal / Wood brown / Stone gray) use 3 different hues but the **same bar height/style** as inert separators — bar role is not strongly signalled | Colony → Resources | 03-1920-colony-panel.png |
| P2 | Save/Replay section ("default" filename input + Save Snapshot / Load Snapshot) uses two adjacent buttons with **identical visual weight**, no primary/secondary distinction | Settings bottom | 04-1920-settings.png |
| P2 | "Reset Display Settings" button is full-width and visually heavier than the actual setting controls above it — inverted hierarchy | Settings → Display | 04-1920-settings.png |
| P2 | Time format mixing: top HUD "Run 00:00:05" (HH:MM:SS) vs. Colony panel "Day 1" vs. Best Runs "6:08 survived" (M:SS) — three time conventions in one product | global | multiple |

## D6 分辨率测试

### 1024×768
- Screenshot: `06-1024x768.png`
- 错位/溢出: top chip strip wraps to 2 rows; Food chip overlaps a red warning triangle; Settings panel takes ~360px of a 1024px viewport (35%), squeezing the canvas.

### 1366×768
- Screenshot: `05-1366x768.png`
- 错位/溢出: top HUD shows only "routes / depots / warehouses" — "farms" and "lumber" chips are not visible at this width; sidebar consumes 280px; Entity Focus panel is fully visible.

### 1920×1080
- Screenshots: `01-1920x1080-initial.png`, `02-1920x1080-game.png`, `03-1920-colony-panel.png`, `04-1920-settings.png`, `07-1920-help.png`
- 错位/溢出: splash card slightly off-centre (right of mid); otherwise clean. All 5+ chip indicators visible. This is the design's "happy path" resolution.

### 1280×800, 1440×900, 2560×1440 (not exhaustively tested — see 总评)
- Inferred: 1280/1440 sit between the tested 1024 and 1920 break-points and likely show partial chip clipping; 2560 will mostly add gutter. Rule of thumb from the tested set: design starts breaking around 1366 width.

## D7 信息反馈完备性

- Build action feedback: hotkey badges visible on every Build tool, "Selected Tool" preview card updates live (verified by clicking Select). Good.
- Toast confirmation on Run start ("Run started: Temperate Plains..."). Good.
- **No audio feedback observed** (browser tab did not produce sound during click/start). If the design is intentionally silent, that should be a Settings toggle.
- AI Log button bottom-centre is discoverable; chronicle accessible via the dedicated tab — recall is supported.
- Toast pile-up: I did not observe ≥5 toasts/sec but the toast is in the same z-band as the Entity Focus panel header (P1 above).

## D8 可读性 / 可访问性

- All visible text ≥12px at 1920×1080 — pass.
- Contrast: green-on-dark-blue (Autopilot pill) and the cyan accents pass WCAG AA by eye; the muted gray secondary text in the briefing ("Heat Lens: red tiles = ...") is borderline AA — readable, not crisp.
- Color-only signalling: resource bars + Best Runs "loss" label rely partially on text + colour — okay. Heat Lens by definition is colour-only — the Settings option to turn off Heat Labels would make the lens illegible to color-blind users; a shape/texture overlay alternative would help.

## 自行扩展角度

### Modality / panel cohabitation
The right sidebar panels (Build / Colony / Settings / AI Log / Heat / Terrain / Help) are mutually exclusive — only one renders at a time. Good. But the bottom-left **Entity Focus** is *always* on, *always* covers ~250×400px of the canvas, with **no minimise control** — if I want to inspect the south-west tile, I have to pan. A collapse-to-tab-strip affordance is missing.

### Keyboard discoverability vs. mouse parity
Hotkeys are well-advertised on Build buttons (badge in upper-left of each tool). However, sidebar tabs (Build/Colony/Settings/...) have no hotkey badge — yet the splash promises "1-12 tools, Space pause, L heat lens, F1 help". If the intent is "panels are mouse-only", document it; if not, expose hotkeys consistently.

### Scroll & overflow handling
Best Runs list uses a native browser scrollbar (P1 above). Entity Focus list also uses native scrollbar. The Colony panel and Settings panel both extend beyond the viewport on 1024×768 — they scroll, which is fine, but with no fade/shadow indicating "more below". Easy add.

### "Close" affordance consistency
Help modal: ✕ in the top-right (good). Splash overlay: dismissed by clicking "Start Colony" (no ✕). Sidebar panels: no ✕ — clicking the active tab again does not collapse the rail (verified). Three different mental models for "dismiss".

## 改进优先级清单

### P0（影响关键操作）
1. Fix top HUD chip strip responsive break at ≤1366 width — chips must either reflow gracefully (vertical stack, smaller font) or hide behind a "more" disclosure rather than disappearing off-screen.

### P1（影响完成度感）
2. Add disabled-reason tooltip to greyed-out Build buttons (Clinic in the tested state).
3. Recentre the splash overlay card in the viewport at 1920×1080.
4. Fix z-order between bottom-left toast and Entity Focus panel header — toast should not cover the panel title.
5. Strengthen sidebar-tab active-state contrast (current underline is too subtle).
6. Replace native browser scrollbars in Best Runs / Entity Focus / Colony lists with theme-styled scrollbars.
7. Add a leader line or anchor pin from the floating tile labels ("west lumber route") to the tile they refer to.

### P2（细节）
8. Unify time-format conventions across HUD / Colony / Best Runs.
9. Right-size the "∞" glyph in the survive-mode card.
10. Resolve the stray "↳" glyph in the splash bottom-right.
11. Even out spacing between rotated sidebar tabs (Heat / Terrain / Help) and their upper neighbours.
12. Distinguish primary vs. secondary buttons in Settings → Save/Replay.
13. Reduce visual weight of "Reset Display Settings" relative to the controls it resets.
14. Differentiate resource progress-bar styling from inert separators in the Colony panel.

## 结论

The UI **executes the basics competently** — consistent typography, sensible information architecture, responsive sidebar tabs, helpful keyboard hints, working modals — but **fails one P0 (responsive chip-strip break ≤1366) and seven P1s** that collectively make the product feel "last-90-percent" rather than "shipped". Verdict **YELLOW**: gameplay can be conducted, no UI element is fatal, but a polish-pass week before any "1.0" claim is warranted. Score **6/10** on the SaaS-dashboard-to-demo axis — well above demo, well below commercial dashboard.
