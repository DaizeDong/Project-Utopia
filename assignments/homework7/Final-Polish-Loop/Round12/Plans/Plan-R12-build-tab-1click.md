---
reviewer_id: Plan-R12-build-tab-1click (A3-first-impression finding 1)
feedback_source: assignments/homework7/Final-Polish-Loop/Round12/Feedbacks/A3-first-impression.md
round: 12
date: 2026-05-01
build_commit: fa6cda1
priority: P1
track: ui (sidebar tab routing — first click should open Build Tools, not just objectives strip)
freeze_policy: hard
rollback_anchor: fa6cda1
estimated_scope:
  files_touched: 1
  loc_delta: ~30
  new_tests: 1
  wall_clock: 25
conflicts_with: []
---

# Plan-R12-build-tab-1click — One click on Build tab opens Build Tools panel directly (no two-step objectives-then-tools detour)

**Plan ID:** Plan-R12-build-tab-1click
**Source feedback:** A3-first-impression finding 1 ("The Build button on the right sidebar is two clicks deep — and the first click does nothing visible")
**Track:** ui
**Priority:** **P1** — A3 quote: "The opening briefing explicitly says 'Open the Build tab in the right sidebar' so this is the first instruction the player follows — and it appears to fail." The first-click-does-nothing pattern is the single worst possible new-player UX failure: the in-game tutorial tells the player to do X, the player does X, and the game appears unresponsive. A3 says this contributed to a 7-minute wipe.
**Freeze policy:** hard — no new mechanic, no new tab, no new panel. Only changes the click handler in `index.html` (the inline `<script>` at lines 3895-3961) so that the first click opens the Build panel directly without showing any intermediate "objectives strip" state.
**Rollback anchor:** `fa6cda1`

---

## 1. Core problem (one paragraph)

A3 reports that clicking the Build sidebar tab on a fresh game produces no visible Build Tools panel — only an "objectives strip" (`routes 0/1`, `depots 0/1`, `warehouses 0/2`, `farms 0/6`, `lumber 0/3`, `walls 0/8`) appears at the top of the sidebar. The actual Build Tools palette only opens on the second click. Inspecting `index.html:3944-3961`, the click handler logic is:
```js
btn.addEventListener('click', () => {
  const key = btn.dataset.sidebarTarget;
  const alreadyActive = btn.classList.contains('active');
  const sidebarOpen = wrap?.classList.contains('sidebar-open');
  if (!sidebarOpen) {
    setSidebarOpen(true);
    showSidebarPanel(key);
  } else if (alreadyActive) {
    setSidebarOpen(false);
  } else {
    showSidebarPanel(key);
  }
});
```
On a fresh boot, the Build tab is `class="sidebar-tab-btn active"` (line 3556 of index.html — it's the default active tab). If the sidebar is in the collapsed state (`!sidebarOpen`), the handler correctly calls `setSidebarOpen(true)` + `showSidebarPanel('build')`. But the first-click-shows-objectives-strip behaviour A3 observed suggests one of two root causes: (a) the sidebar is ALREADY open on boot (so the handler hits the `alreadyActive` branch and CLOSES it), or (b) the Build panel's `panel-open` class is being set but the actual `BuildToolbar` rendering is gated behind a separate "objectives strip dismissed" state that requires a second click. Step 1 inspects the live DOM to determine which.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — collapse the two-step into one: first click ALWAYS shows the Build palette

Audit Step 1 will reveal whether the issue is (a) sidebar-collapsed-default-but-Build-already-active, or (b) Build panel renders but the BuildToolbar component is still hidden behind an objectives-strip overlay. Fix path (a): change the `alreadyActive` branch to NOT close the sidebar when the panel content was not actually shown (e.g. the `BuildToolbar` element was hidden). Fix path (b): remove the objectives-strip-as-Build-panel-prelude entirely; surface the objectives strip as a persistent HUD element above the sidebar panel content.

Specifically, the fix likely looks like:
```js
btn.addEventListener('click', () => {
  const key = btn.dataset.sidebarTarget;
  const alreadyActive = btn.classList.contains('active');
  const sidebarOpen = wrap?.classList.contains('sidebar-open');
  // R12 Plan-R12-build-tab-1click (A3 #1): first click on a sidebar tab
  // ALWAYS opens the corresponding panel. Previous logic would close the
  // sidebar if the tab was the already-active one but the panel was hidden
  // because the sidebar-collapsed state defaulted Build to active. New
  // semantics: clicking an already-active tab on a CLOSED sidebar opens it
  // (does NOT toggle it shut). Only closing happens when the sidebar is
  // already open AND the user clicks the active tab a second time.
  if (!sidebarOpen) {
    setSidebarOpen(true);
    showSidebarPanel(key);  // always force the panel open even if already-active
  } else if (alreadyActive) {
    setSidebarOpen(false);
  } else {
    showSidebarPanel(key);
  }
});
```
(The above is functionally identical to the current code IF the audit shows root cause (a). Path (b) requires an additional change to remove the objectives-strip prelude.)

If the objectives strip is occluding the Build palette (path b), audit `BuildToolbar.js` for an "intro screen" gate and either remove it or render the objectives strip ABOVE the Build palette so both are visible on the first click.

- Files: `index.html` (sidebar click handler at lines 3944-3961), possibly `src/ui/tools/BuildToolbar.js` (intro gate), 1 small test.
- Scope: ~30 LOC including test.
- Expected gain: closes A3 #1 P1.
- Main risk: changing the toggle semantics could surprise users who learned the "click active tab = close sidebar" pattern (mitigated — the new code preserves close-on-already-active when the sidebar IS open; it only changes the case where the sidebar is closed and the tab is already active).

### Suggestion B (in-freeze, MINIMAL VARIANT) — only force `showSidebarPanel(key)` to also expand the BuildToolbar

If audit Step 1 reveals the issue is the BuildToolbar component itself has a "first paint" delay or intro state, add an explicit `BuildToolbar.show()` call in the showSidebarPanel function for `key === 'build'`:
```js
function showSidebarPanel(key) {
  // ... existing code ...
  if (key === 'build') {
    // R12 force first-click open
    document.getElementById('buildPanelToolbar')?.classList.remove('intro-collapsed');
  }
}
```
~10 LOC. Less invasive but only helps if root cause is (b).
- Files: `index.html` only
- Scope: ~10 LOC

### Suggestion C (in-freeze, COMBINED) — also persist the last-active tab across reloads

Currently the Build tab is `active` by default. Switch to reading `localStorage.getItem('utopiaSidebarLastTab')` so a player who last used Colony tab returns to Colony. ~15 extra LOC. Tangentially helpful but not what A3 is asking for. Recommend defer.
- Files: `index.html`
- Scope: ~15 extra LOC
- Expected gain: minor

### Suggestion D (FREEZE-VIOLATING, do not ship) — replace right-rail tabs with a top-of-canvas tabbed dock

A3 also notes the sidebar uses vertical text rotations (rejected by accessibility). Bigger redesign; defer to v0.10.2.

## 3. Selected approach

**Suggestion A**, with Step 1 (audit) determining whether the secondary `BuildToolbar` intro-state fix is also needed. This is the smallest change that closes A3's specific complaint.

## 4. Plan steps

- [ ] **Step 1 — Live DOM audit to determine root cause (a) vs (b).**
  Open the build at `http://localhost:5173`. Boot fresh (no existing sidebar state in `localStorage`). Use Playwright `browser_evaluate` to read:
  ```js
  ({
    bodyClasses: document.body.className,
    sidebarOpen: document.querySelector('#wrap')?.classList.contains('sidebar-open'),
    sidebarCollapsed: document.querySelector('#wrap')?.classList.contains('sidebar-collapsed'),
    buildTabActive: document.querySelector('.sidebar-tab-btn[data-sidebar-target="build"]')?.classList.contains('active'),
    buildPanelOpen: document.querySelector('[data-sidebar-panel="build"]')?.classList.contains('active'),
    buildPanelDisplay: getComputedStyle(document.querySelector('[data-sidebar-panel="build"]') ?? document.body).display,
    buildToolbarVisible: getComputedStyle(document.getElementById('buildPanelToolbar') ?? document.body).display,
    objectivesStripVisible: getComputedStyle(document.getElementById('objectiveStrip') ?? document.body).display,
  })
  ```
  Then click the Build tab once and re-evaluate. Determine: does `sidebarOpen` flip? Does `buildToolbarVisible` go from "none" to "block"? If `sidebarOpen` was already true at boot AND `buildTabActive === true` AND `buildToolbarVisible === "none"`, root cause is (a) — the click hit the `alreadyActive` branch and CLOSED a sidebar that was already open with no panel content rendered. Document the actual root cause in the plan comments.
  - Type: read (no edit)

- [ ] **Step 2 — Patch the click handler at `index.html:3944-3961` per Suggestion A.**
  Apply the corrected logic. If Step 1 showed the issue is the `alreadyActive` branch closing on first click, change the conditional to require `sidebarOpen && alreadyActive && buildPanelHasContent` before closing. If Step 1 showed the issue is the BuildToolbar intro state, add the secondary force-show in `showSidebarPanel`.
  - Type: edit (inline `<script>` block in index.html)
  - depends_on: Step 1

- [ ] **Step 3 — If Step 1 revealed root cause (b), fix the BuildToolbar intro gate.**
  Locate the gate in `src/ui/tools/BuildToolbar.js` (search for `intro-collapsed` or `objectivesStrip` or any first-render gate). Remove the intermediate state OR render the objectives strip as a persistent header above the toolbar (always visible, not gating the toolbar).
  - Type: conditional edit
  - depends_on: Step 2

- [ ] **Step 4 — Add a regression test `test/sidebar-tab-first-click.test.js` (~40 LOC).**
  Test cases (uses jsdom + the inline-handler logic exported / re-imported from a small extracted module if needed):
  1. Fresh boot: BuildToolbar element exists in DOM but is hidden.
  2. After single click on Build tab: BuildToolbar element is visible (not hidden).
  3. After second click on Build tab: sidebar collapses (preserves the toggle pattern for users who DO want to close it).
  4. Click on Colony tab from collapsed sidebar: opens sidebar AND shows Colony panel (regression-guard for the Suggestion A change).
  - Type: add
  - depends_on: Step 3

- [ ] **Step 5 — Run the suite + manual Playwright re-verification.**
  `node --test test/*.test.js` — baseline 1646 / 0 fail / 2 skip preserved + 1 new test passes.
  Manual: open the build, do NOT preset any localStorage. Click Build tab once. Confirm: BuildToolbar palette renders immediately with all 12 tool buttons visible. Repro the A3 sequence: click Build, then click Road, then click a tile. Confirm: Road builds without intermediate "objectives strip" detour.
  - Type: verify
  - depends_on: Step 4

- [ ] **Step 6 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  *"R12 Plan-R12-build-tab-1click (A3 P1 #1): first click on the Build sidebar tab now opens the Build Tools palette directly. Previously the player needed two clicks (first revealed the objectives strip, second opened the toolbar), which contradicted the in-game briefing's 'Open the Build tab in the right sidebar' instruction."*
  - Type: edit
  - depends_on: Step 5

## 5. Risks

- **Behaviour change of the toggle semantics.** Users who learned "click active tab = close sidebar" may be surprised. Mitigated — the new logic preserves close-on-already-active when the sidebar IS open AND the panel is rendered. Only the boot-state-with-default-active case changes behaviour.
- **Step 1 may surface root cause (b)**, requiring an additional BuildToolbar.js edit. Scope estimate (`files_touched: 1`) holds for path (a); path (b) bumps to 2 files.
- **CSS changes may also be required** if `display: none` is being set on the BuildToolbar by a CSS selector that the click handler can't influence. Audit in Step 1.
- **Possible affected tests:** `test/sidebar*.test.js`, `test/build-toolbar*.test.js`, `test/ui/build-bar-order.test.js`. Audit in Step 4.

## 6. Verification

- **New unit test:** `test/sidebar-tab-first-click.test.js` (Step 4).
- **Manual Playwright:** Step 5 — repro A3's exact sequence (Build → Road → tile click).
- **No bench regression expected** — pure UI handler change.

## 7. UNREPRODUCIBLE marker

N/A — A3 reproduced the two-click-detour in screenshots 03 and 06 (first click → objectives strip; second click → Build Tools palette). Reliable repro on fresh boot.

---

## Acceptance criteria

1. Fresh-boot single click on Build tab → Build Tools palette renders with all 12 tool buttons visible (no intermediate "objectives strip" detour).
2. Second click on Build tab (when palette is visible) → sidebar closes (preserves toggle-to-close pattern).
3. Click on Colony tab from collapsed sidebar → opens sidebar AND shows Colony panel content (regression guard).
4. Briefing copy "Open the Build tab in the right sidebar" works as a literal instruction — one click, palette appears.
5. New unit test `test/sidebar-tab-first-click.test.js` passes.
6. Test baseline 1646 / 0 fail / 2 skip preserved (+1 new pass).

## Rollback procedure

```
git checkout fa6cda1 -- index.html src/ui/tools/BuildToolbar.js && rm test/sidebar-tab-first-click.test.js
```
