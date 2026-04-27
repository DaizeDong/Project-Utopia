---
reviewer_id: 01c-ui
round: 7
date: 2026-04-26
build_commit: f0bc153
priority: P0+P1
estimated_scope: medium  # ~180-260 LOC across index.html + HUDController.js
conflicts_with: []
freeze_policy: lifted
---

# Plan: 01c-ui — Round 7 UI Remediation

## 1. Core Problems (Distilled)

**Problem A — Secondary-resource HUD chips have no visible text labels.**
`hudMeals`, `hudTools`, `hudMedicine`, `hudProsperity`, `hudThreat` all carry `data-resource-tier="secondary"`, which triggers the CSS rule `#statusBar [data-resource-tier="secondary"] { display: none !important; }` during play. The five resources are completely invisible to players in the default (non-casual-mode) configuration. The reviewer saw "21" and "39" appearing from somewhere, meaning at least Prosperity and Threat are visible *in dev-mode* (where `body.casual-mode` is off and the `data-resource-tier` hide-rule is also absent), but without text labels on their `hud-meter` elements—unlike Food/Wood/Stone/Herbs which have a `<span class="hud-sublabel">` child.

**Problem B — HUD right-side overflow at 1280 px cuts off Survived-time and Autopilot chip.**
The `#statusBar` uses `overflow: hidden` and `flex-wrap: nowrap` at widths above 800 px. The right half (`#statusScoreboard` → `#statusObjective` → `#statusObjectiveTime`, `#aiAutopilotChip`) is flexible but the left resource chips have `flex-shrink: 1` with a floor of `min-width: 28px`, so at 1280 px the scoreboard cluster is pushed off-screen before it can wrap. The 1280-band CSS (`@media (max-width: 1280px)`) hides `#statusScenario` and `#statusScoreBreak` but does **not** hide any left-side chips, so the scoreboard continues to overflow.

**Problem C — Milestone toast (`build-toast--milestone`) is spawned at the 3D world-projected position of the anchor tile, can be near screen center, and is styled at `font-size: 14px; font-weight: 900` with no `max-width` constraint.** At 1300 px viewport width the toast floats to the map centre, and because `transform: translate(-50%, -55%)` centres it horizontally, it visually occupies roughly 40 % of the canvas width. The animation duration is 3200 ms—long enough to block the player's view through multiple fast-forward ticks.

---

## 2. Code Locations

| File | Relevant region |
|---|---|
| `index.html` (lines 8–1770, inline `<style>`) | CSS variables, HUD layout, `.build-toast--milestone`, `@media` breakpoints, secondary-resource display rules |
| `index.html` (lines 1836–1863) | DOM for `hudMeals`, `hudTools`, `hudMedicine`, `hudProsperity`, `hudThreat` — missing `.hud-sublabel` spans |
| `index.html` (lines 1574–1585) | `@media (max-width: 1280px)` — incomplete overflow fix |
| `index.html` (lines 561–586) | `.build-toast--milestone` styles + `@keyframes toastMilestone` |
| `src/ui/hud/HUDController.js` (line 1277) | `statusThreat` / `statusProsperity` update — no color-coding applied |
| `src/ui/hud/HUDController.js` (lines 1293–1295) | `data-urgency` attribute pattern used for Food/Wood/Workers — needs extension to Threat/Prosperity |
| `src/render/SceneRenderer.js` (lines 2923–2939) | `#handleMilestoneToastEvent` — spawns toast at anchor tile world-coords |
| `src/render/SceneRenderer.js` (lines 2992–2997) | `#spawnFloatingToast` — sets `animationName` and `durationMs` for milestone kind |

---

## 3. Suggestions

### Suggestion A — Label secondary HUD resources + color-code Threat/Prosperity (addresses Problem A)

Add `<span class="hud-sublabel">` children to the five secondary resource chips so they display their names in the 11 px sub-label style already used by Food/Wood/Stone/Herbs. Because `#statusBar .hud-sublabel { display: none !important; }` already suppresses sub-labels in the 32 px status bar (too tall), the label will only appear when the chips are rendered outside the bar (e.g. if a future layout exposes them), but more importantly the `alt` text on the icons and the `title` attribute on the wrapper already handle accessibility — this change adds the visible label for non-status-bar contexts without any layout cost.

Separately, extend `HUDController.render()` to apply `data-urgency` (or a dedicated `data-threat` attribute) on `#hudThreat` so that a CSS rule can color the threat chip amber at ≥30 and red at ≥50 without JavaScript DOM-style writes—keeping the pattern consistent with the existing `food`/`wood`/`workers` urgency system.

### Suggestion B — Fix 1280 px overflow by clamping left-side resources + milestone toast right-edge anchor (addresses Problems B and C)

For Problem B: At 1280 px the existing breakpoint already hides `#statusScenario` and `#statusScoreBreak`. Extend it to also set `flex: 0 0 auto; max-width: min(content, 24px)` on tertiary chips (`hudMeals`, `hudTools`, `hudMedicine`) so their combined width shrinks enough for the scoreboard to remain fully visible. An alternative is to move the five secondary chips under `display: none` at ≤1280 px (they are already hidden in the bar by `data-resource-tier="secondary"` anyway in the default profile), making this a no-op change for casual mode and a minor loss for dev-mode.

For Problem C: Clamp `build-toast--milestone` to a fixed `max-width: 260px` and pin it to the **right edge** of the viewport (e.g. `right: 52px; left: auto` and `transform: translateY(-55%)`) so it never covers the center map area. Reduce duration to 2400 ms to match the existing `err` toast UX. The `#spawnFloatingToast` caller (`#handleMilestoneToastEvent`) already computes a `px` / `py` world-projection — override this for `kind === "milestone"` to use a fixed position (viewport top-right minus sidebar width) instead of the tile projection.

---

## 4. Selected Approach

Implement both suggestions in combination. The changes are low-risk, fully additive, and do not require new JS APIs or logic rewrites:

- HTML-only label additions (Suggestion A, part 1)
- CSS-only urgency extension + breakpoint patch (Suggestion A part 2 + Suggestion B part 1)
- Hybrid JS + CSS fix for milestone toast (Suggestion B part 2)

---

## 5. Implementation Steps

### Step 1 — Add sublabel spans to secondary HUD chips
**File:** `index.html` — lines 1839, 1843, 1847, 1852–1854, 1860
**What:** In the `hud-meter` div of `hudMeals`, `hudTools`, `hudMedicine`, `hudProsperity`, `hudThreat`, prepend a `<span class="hud-sublabel">` with the resource name before the existing `hud-label` span. Follow the same pattern as `hudFood` (line 1800–1801). The status-bar suppression rule `#statusBar .hud-sublabel { display: none !important; }` already prevents them from expanding the 32 px bar.

### Step 2 — Add Threat/Prosperity color urgency via CSS data-attributes
**File:** `index.html` — inline `<style>` block, after the `.hud-resource[data-urgency="low"]` rule (around line 153)
**What:** Add two new attribute rules:
```css
#hudThreat[data-threat="warn"]     { background: rgba(255,193,7,0.18); }
#hudThreat[data-threat="warn"]     .hud-label { color: #ffd08a; }
#hudThreat[data-threat="critical"] { background: rgba(244,67,54,0.22); }
#hudThreat[data-threat="critical"] .hud-label { color: #ff8a80; }
#hudProsperity[data-prosp="low"]   { background: rgba(244,67,54,0.15); }
#hudProsperity[data-prosp="low"]   .hud-label { color: #ff8a80; }
```

### Step 3 — Wire Threat/Prosperity urgency attributes in HUDController.render()
**File:** `src/ui/hud/HUDController.js` — `render()` method, near line 1293 (the existing `data-urgency` setAttribute block)
**What:** After the existing `hudWorkers` urgency line, add:
```js
const threat = state.gameplay?.threat ?? 0;
const prosp  = state.gameplay?.prosperity ?? 0;
if (this.hudThreat) {
  this.hudThreat.setAttribute("data-threat",
    threat >= 50 ? "critical" : threat >= 30 ? "warn" : "");
}
if (this.hudProsperity) {
  this.hudProsperity.setAttribute("data-prosp", prosp < 20 ? "low" : "");
}
```
Constructor ref: `this.hudThreat` and `this.hudProsperity` must be obtained in the constructor; add them after the existing `this.hudWorkers = document.getElementById("hudWorkers")` line (around line 236):
```js
this.hudThreat      = document.getElementById("hudThreat");
this.hudProsperity  = document.getElementById("hudProsperity");
```

### Step 4 — Fix 1280 px overflow: hide secondary chips from the status bar at ≤1280 px
**File:** `index.html` — inline `<style>`, inside `@media (max-width: 1280px) and (min-width: 1025px)` block (around line 1574)
**What:** Add:
```css
#hudMeals, #hudTools, #hudMedicine,
#hudProsperity, #hudThreat,
.hud-divider[data-resource-tier="secondary"] { display: none !important; }
```
These elements are **already** suppressed at ≤1200 px by the `data-resource-tier="secondary"` hide rule; this extends suppression to the full 1025–1280 band where the scoreboard previously overflowed. Because casual-mode already hides them globally, this change is only visible to dev-mode users on wide screens, which is the correct tradeoff.

### Step 5 — Pin milestone toast to viewport top-right, cap width and duration
**File:** `index.html` — inline `<style>`, inside the `.build-toast--milestone` rule (around line 561)
**What:** Add:
```css
.build-toast--milestone {
  max-width: 260px;
  white-space: normal;
  word-break: break-word;
  text-align: center;
}
```
Also change `@keyframes toastMilestone` — the vertical travel `translate(-50%, -110%)` is fine; no keyframe change needed.

**File:** `src/render/SceneRenderer.js` — `#handleMilestoneToastEvent` method (lines 2923–2939)
**What:** Override the world-projected `px`/`py` for milestone toasts to anchor them at a fixed viewport position (top-right area, clear of the sidebar). Replace the `tileToWorld` projection call with a viewport-relative anchor:
```js
// Pin milestone toasts to top-right corner so they never cover
// the center map area (reviewer reported ~40 % coverage).
const sidebarOpen = document.getElementById("wrap")?.classList?.contains("sidebar-open");
const rightOffset = sidebarOpen ? 316 : 52; // sidebar 280 px + 36 px tab strip + margin
const vpX = (this.canvas?.clientWidth ?? 800) - rightOffset - 130; // 130 = half max-width
const vpY = 80; // below status bar
```
Then call `#spawnFloatingToast` using these `vpX`/`vpY` values **converted back through the camera inverse projection** or — simpler — bypass the world-projection entirely by writing `node.style.left` / `node.style.top` directly in a new branch inside `#spawnFloatingToast` when `kind === "milestone"`, skipping the `VEC_TMP.project(this.camera)` path.

**Implementation detail:** The cleanest approach is to add a `screenOverride` parameter to `#spawnFloatingToast(worldX, worldZ, text, kind, tileIx, tileIz, screenOverride = null)`. When `screenOverride` is `{px, py}`, skip the world-to-NDC projection and use those values directly. The milestone handler passes `{ px: vpX, py: vpY }`.

### Step 6 — Reduce milestone toast duration to 2400 ms
**File:** `src/render/SceneRenderer.js` — `#spawnFloatingToast`, line 2995
**What:** Change `kind === "milestone" ? 3200` to `kind === "milestone" ? 2400` so the milestone notification clears faster and matches the `err`/`warn` UX cadence.

---

## 6. Risks and Verification

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `data-threat`/`data-prosp` attributes conflict with existing test selectors | Low | Grep `test/` for `hudThreat`/`hudProsperity` attribute assertions before shipping; none found in codebase search |
| Step 4 hides Meals/Tools/Medicine at 1280 px for dev-mode users who rely on them in the HUD bar | Low | They are already invisible via `data-resource-tier` rule in the default profile; dev-mode users lose 0 visible info since the rule already fires |
| `screenOverride` parameter on `#spawnFloatingToast` changes the private method signature | Low | Method is `#private`; only two callers in the same file — `#handleDeathToastEvent` and `#handleMilestoneToastEvent`. Pass `null` / omit in `#handleDeathToastEvent` call |
| Pinned viewport position for milestone toast may overlap the `#alertStack` (top-right, z-index 40) at high death rates | Medium | `#alertStack` uses `top: 36px; right: 44px`; the milestone pin at `right: 52px` is slightly wider offset. Set milestone `z-index` to 38 (below alertStack) so death alerts always win |

### Verification Checklist

- [ ] At 1280 px viewport: `#statusObjectiveTime` text "Survived 0:00:00" visible, not clipped
- [ ] At 1280 px viewport: `#aiAutopilotChip` "Autopilot OFF" visible, not clipped
- [ ] Threat ≥ 30: `#hudThreat` chip background shifts to amber
- [ ] Threat ≥ 50: `#hudThreat` chip background shifts to red
- [ ] Milestone event fires: toast appears in top-right quadrant, max-width ≤ 260 px, does not overlap center of map
- [ ] Milestone toast disappears within 2400 ms (confirm via DevTools animation timeline)
- [ ] `node --test test/*.test.js` — all 865+ tests pass (no HUD DOM selectors broken)
- [ ] At 1024 px viewport: sidebar tab strip remains visible (the 1024 `@media` breakpoint is untouched)
- [ ] At 1920 px viewport: `hudMeals`/`hudTools`/`hudMedicine`/`hudProsperity`/`hudThreat` display correctly in dev-mode (no regression from Step 4 which only affects ≤1280 px)
