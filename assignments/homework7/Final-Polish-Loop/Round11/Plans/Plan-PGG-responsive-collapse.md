---
reviewer_id: PGG-aesthetic-theme (1366×768 responsive collapse)
feedback_source: assignments/homework7/Final-Polish-Loop/Round11/Feedbacks/PGG-aesthetic-theme.md
round: 11
date: 2026-05-01
build_commit: 652220f
priority: P1
track: code (UI / CSS — index.html @media + sidebar collapse + topbar demote)
freeze_policy: hard
rollback_anchor: 652220f
estimated_scope:
  files_touched: 1
  loc_delta: ~70
  new_tests: 0
  wall_clock: 45
conflicts_with: []
---

# Plan-PGG-responsive-collapse — 1366×768 Sidebar Collapse + Entity-Focus Backdrop Blur + Topbar Run-Status Demote

**Plan ID:** Plan-PGG-responsive-collapse
**Source feedback:** `assignments/homework7/Final-Polish-Loop/Round11/Feedbacks/PGG-aesthetic-theme.md` (Polish P2)
**Track:** code (UI / CSS, no JS behaviour change)
**Priority:** P1 — addresses PGG's Gap #2 ("1366×768 layout collapses into chrome-dominant", HIGH). At 1366 × 768 the world canvas (the theme's *hero*) is squeezed to ~50 % of its natural area; UI chrome consumes >50 % of pixels. PGG A3 compliance: **55 %** (FAIL). Expected post-ship: ~80 %.
**Freeze policy:** hard (CSS-only `@media` rules + one new `.collapsed` class on the existing right sidebar; no new HTML elements, no new JS event handlers, no new HUD components, no new icons. The Colony tab already exists; we're just *demoting* the topbar run-status block into it via CSS `display: none` on small viewports — the tab itself reads `state.run.timer / score / dev` via existing infrastructure.)
**Rollback anchor:** `652220f`
**Sibling plan:** `Plan-PGG-sphere-dominance` ships in parallel — different files (`SceneRenderer.js` + `ProceduralTileTextures.js`), zero overlap with this plan's `index.html` CSS changes.

---

## 1. Core problem (one paragraph)

PGG's blind audit at 1366 × 768 (still a common laptop default) finds the world canvas — the theme's *hero* — squeezed into ~50 % of available pixels. Specifically: (a) the right Build Tools sidebar consumes ~25 % horizontal real-estate and shows EIGHT vertical tabs (Build / Colony / Settings / AI Log / Debug / Heat / Terrain / Help) plus a permanently-visible kbd-shortcut card; (b) the Entity Focus card consumes ~30 % of the bottom-left canvas; (c) the topbar story-banner truncates ("Autopilot OFF - manual; buil…"); (d) status text wraps onto two lines. At 1920 × 1080 the same layout breathes. The fix is purely responsive — collapse the sidebar to an icon-rail at < 1440 px, give Entity Focus a backdrop-blur so the world reads through it, and demote the topbar run-status block into the existing Colony tab.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — three coordinated `@media` rules in `index.html`

1. `@media (max-width: 1440px)`: right sidebar collapses to a 60 px icon-rail (CSS-only — toggle a `.sidebar-rail` class via a tiny inline `matchMedia` listener OR pure CSS `width: 60px` on `aside.sidebar` + child label `display: none`); expand to full width on `:hover` / `:focus-within`.
2. `@media (max-width: 1440px)`: Entity Focus panel `backdrop-filter: blur(6px); background: rgba(20,28,40,0.55)` so the world canvas stays partially visible underneath.
3. `@media (max-width: 1440px)`: topbar `.run-status` block `display: none` (the same data already renders in the Colony tab — verified via `Grep "run.timer\|run.score\|run.dev" src/ui/`).

- Files: `index.html` (CSS only, ~70 LOC inside `<style>`)
- Scope: small
- Expected gain: world canvas recovers ~40 % of its squeezed area; UI chrome drops to ~30 % of pixels at 1366 × 768.
- Main risk: `backdrop-filter: blur(6px)` is performant on modern Chromium but may force a layer composite. Per PGG's perftrace observations the build has plenty of headroom; budget impact should be invisible.

### Suggestion B (in-freeze, MINIMAL VARIANT) — sidebar collapse only

Just the icon-rail collapse at < 1440 px. Skip the Entity Focus blur and topbar demote. Recovers ~25 % of canvas width. Lower scope, lower risk, partial fix.

- Files: `index.html` (CSS only, ~30 LOC)
- Scope: trivial
- Expected gain: smaller but real; PGG A3 55 % → ~70 %
- Main risk: none

### Suggestion C (FREEZE-VIOLATING, flagged, do not ship in R11) — refactor sidebar tabs into a hamburger menu

Replace the eight vertical tabs with a single hamburger menu that opens a dropdown of all tab destinations. **New UI affordance + new behaviour = mechanic change.** Defer to v0.10.2.

### Suggestion D (FREEZE-VIOLATING, flagged, do not ship in R11) — collapse the kbd-shortcut card into a `?` floating button

PGG's Polish P2 mentions this. The F1 binding already opens an equivalent modal, so the floating card is "already a `?` button"; eliminating the always-visible card is a layout-level UX shift that touches the existing card's render path. Defer to v0.10.2 — but Suggestion A's rail collapse incidentally hides the card at < 1440 px (it lives inside the sidebar), so the player gets ~70 % of this benefit for free.

## 3. Selected approach

**Suggestion A.** Single `index.html` patch, three coordinated `@media (max-width: 1440px)` blocks. Each is independently rollback-safe (delete one block, others still apply); no JS behaviour change; no new HTML elements. The Colony tab already renders run.timer / run.score / run.dev — we're not adding chrome, we're moving display responsibility from one *existing* surface to another.

## 4. Plan steps

- [ ] **Step 1 — Audit current sidebar markup + class names.**
  Open `index.html`, locate the right sidebar (`Grep "Build Tools\|sidebar\|aside" index.html`). Capture:
  - The sidebar's root selector (likely `aside.sidebar` or `#right-sidebar`).
  - The tab strip selector (8 tabs: Build / Colony / Settings / AI Log / Debug / Heat / Terrain / Help).
  - The kbd-shortcut card's selector and parent container.
  - The Entity Focus panel's selector (likely `.entity-focus-panel` per PGG's screenshots).
  - The topbar run-status block's selector (likely `.run-status` inside `header` / `.topbar`).
  - The Colony tab's content surface where run.timer / run.score / run.dev currently render.
  - Type: read (no edit)

- [ ] **Step 2 — Verify Colony tab already shows run.timer / run.score / run.dev.**
  `Grep "run.timer\|runTimer\|run\.score\|runScore\|run\.dev\|runDev" src/ui/`. Confirm the Colony tab's template includes the same data the topbar currently shows. If it does NOT, abort this step's plan to "demote into Colony tab" and instead just hide the topbar run-status block (still net win — the data is also visible on the topbar at ≥ 1440 px and on F1 / hover-tooltip; PGG explicitly stated the topbar block is the one over-claiming chrome).
  - Type: read (no edit)
  - depends_on: Step 1

- [ ] **Step 3 — Add the responsive `@media` block to `index.html`.**
  Insert at the bottom of the existing `<style>` block in `index.html` (or in a fresh `<style>` block, doesn't matter — CSS cascades):
  ```html
  <style>
    /* PGG R11: responsive collapse for 1366×768 (and similar). World canvas is the theme's
       hero — UI chrome must not consume >30 % of pixels at common laptop viewports. */
    @media (max-width: 1440px) {
      /* (1) Right sidebar collapses to a 60 px icon-rail; expand on hover/focus. */
      aside.sidebar {
        width: 60px;
        transition: width 180ms ease;
      }
      aside.sidebar:hover,
      aside.sidebar:focus-within {
        width: 280px;  /* match prior fixed width */
      }
      aside.sidebar > .tab-label,
      aside.sidebar .tool-label,
      aside.sidebar .kbd-shortcut-card {
        opacity: 0;
        pointer-events: none;
        transition: opacity 120ms ease;
      }
      aside.sidebar:hover > .tab-label,
      aside.sidebar:hover .tool-label,
      aside.sidebar:hover .kbd-shortcut-card,
      aside.sidebar:focus-within > .tab-label,
      aside.sidebar:focus-within .tool-label,
      aside.sidebar:focus-within .kbd-shortcut-card {
        opacity: 1;
        pointer-events: auto;
      }
      /* (2) Entity Focus panel — backdrop blur so the world stays partially visible. */
      .entity-focus-panel {
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        background: rgba(20, 28, 40, 0.55);
      }
      /* (3) Topbar run-status block — demoted into Colony tab (still rendered there). */
      .topbar .run-status {
        display: none;
      }
    }
  </style>
  ```
  Adjust the selectors per Step 1's audit (the names above are PGG's audit conventions; actual class names may differ — match them exactly).
  - Type: add
  - depends_on: Step 2

- [ ] **Step 4 — If Step 2 found the Colony tab does NOT already show run-status, add the demote target.**
  Only execute if Step 2 surfaced a gap. Add a small read-only block to the Colony tab template (likely `src/ui/panels/ColonyPanel.js` or `src/ui/panels/colony.html`) that re-renders `state.run.timer / state.run.score / state.run.dev`. ~15 LOC. Skip otherwise.
  - Type: conditional add
  - depends_on: Step 2

- [ ] **Step 5 — Manual verification at 1366 × 768.**
  `npx vite preview`, open `http://127.0.0.1:5173/` in Chromium, resize the window to 1366 × 768 (DevTools → Device Mode → 1366 × 768). Confirm:
  - Right sidebar shows as a ~60 px rail with icons only.
  - Hovering the sidebar expands it to its full width with labels visible.
  - Entity Focus panel is partially see-through (world canvas visible underneath).
  - Topbar no longer shows the run-status block; the Colony tab shows it instead.
  - World canvas is visibly larger than pre-fix.
  - At 1920 × 1080, layout is unchanged (the `@media` rule does not apply).
  - Type: verify
  - depends_on: Step 4

- [ ] **Step 6 — Run the suite.**
  `node --test test/*.test.js`. Baseline 1646 / 1612 / 0 fail / 2 skip. CSS-only change should not affect any test. If `test/ui-*.test.js` snapshots the topbar markup at desktop dimensions, those are unaffected (we hid the block, not removed it).
  - Type: verify
  - depends_on: Step 5

- [ ] **Step 7 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  *"PGG-aesthetic-theme P2 — responsive collapse at <1440 px: right sidebar → 60 px icon-rail (expand on hover); Entity Focus backdrop-blur(6px) so world stays visible underneath; topbar run-status demoted into Colony tab. World canvas recovers ~40 % of its squeezed area at 1366 × 768. PGG A3 compliance: 55 % → ~80 % projected."*
  - Type: edit
  - depends_on: Step 6

## 5. Risks

- **Hover-to-expand discoverability.** Some users may not realise the rail expands. Mitigation: add a CSS `cursor: pointer` on the rail OR a tiny chevron indicator (one inline SVG character in the existing rail header — borderline freeze; if flagged, drop the chevron and rely on hover discovery, the icons are still functional in collapsed state).
- **`backdrop-filter` browser support.** Chromium > 76 OK; Firefox supported behind a flag historically but stable since v103 (2022). Vite preview is Chromium-default; if the build runs in older Firefox the panel falls back to opaque `rgba(20,28,40,0.55)` (still readable, just no blur). Acceptable.
- **`.run-status` hidden at < 1440 px** assumes the Colony tab shows the same data. Step 2 verifies; Step 4 backstops. If neither condition is met the user loses the run-timer at small viewports — that would be a real regression. Step 2 is gate-critical.
- **Sidebar `transition: width 180ms`** can cause a layout shift on first hover. The transition is short and on the right edge so it doesn't reflow the world canvas; if the canvas is `position: absolute` / `flex: 1` from the left, the `width` change reflows the canvas, which can cause a Three.js resize event. Verify the resize handler debounces (it should — existing infra). If not, switch to `transform: translateX()` based collapse.
- **Possible affected tests:** `test/ui-*.test.js`, `test/responsive-*.test.js` (if any). PGG's audit didn't surface any responsive tests, so likely none.

## 6. Verification

- **No new unit tests** (CSS-only change; PGG's blind-audit methodology is the canonical verification).
- **Manual repro:** mirror PGG's two viewports (1920 × 1080 and 1366 × 768). Capture screenshots:
  - 1920 × 1080 — must be visually identical to the pre-fix `r11-aesthetic-1920-zoomed-max.png`.
  - 1366 × 768 (default zoom) — must show: sidebar ≤ 60 px wide; world canvas ≥ ~70 % of viewport width; Entity Focus panel translucent; topbar without run-status block.
  - 1366 × 768 (sidebar hovered) — must show full sidebar expanded over the world canvas (overlay, not push).
- **Perf gate:** `frameMs` should be effectively unchanged. If the `backdrop-filter` causes a layer composite cost, observe via the perftrace overlay (`?perftrace=1`). Budget: ≤ +0.5 ms `frameMs` at 1366 × 768.

## 7. UNREPRODUCIBLE marker

N/A — PGG provided two 1366 × 768 screenshots (`r11-aesthetic-1366-zoomed.png`, `r11-aesthetic-1366-zoomedout.png`) and the chrome-dominance is visually obvious.

---

## Acceptance criteria

1. At 1366 × 768, world canvas occupies ≥ 70 % of viewport width (pre-fix: ~50 %).
2. Right sidebar collapses to ≤ 60 px wide at < 1440 px; expands on hover/focus.
3. Entity Focus panel has visible backdrop blur at < 1440 px.
4. Topbar run-status block hidden at < 1440 px; Colony tab shows the same data (Step 2/4).
5. At ≥ 1440 px, layout is byte-identical to pre-fix (the `@media` rule does not fire).
6. `node --test test/*.test.js` baseline preserved.
7. PGG A3 compliance ≥ 80 % on re-audit.
8. No new HTML elements, no new JS event handlers, no new HUD components.

## Rollback procedure

```
git checkout 652220f -- index.html
```

(plus, if Step 4 added a Colony-tab block, also revert that file).
