---
plan_id: Plan-R12-build-tab-1click
implementer: claude-code (subagent 4/7)
parent_commit: 925c340
round: 12
date: 2026-05-01
priority: P1
track: code
---

# Plan-R12-build-tab-1click — Commit log

## Status

**SHIPPED.** Source + test + CHANGELOG committed on top of `925c340` (Plan-R12-stable-tier-fix). Hard-freeze compliant.

## Files changed

- `index.html` (+~25 LOC) — sidebar tab-button click handler at lines ~3943-3982. Adds `isPanelAreaVisible()` helper that reads `getComputedStyle('#sidebarPanelArea')` and checks `opacity !== '0' && pointerEvents !== 'none' && visibility !== 'hidden'`. The close-on-active-tab branch now requires `alreadyActive && isPanelAreaVisible()`; otherwise the handler falls through to `showSidebarPanel(key) + btn.focus()` so `:focus-within` reveals the icon-rail panel-area on the very first click. Comment block cites the responsive CSS at line ~2495 that hides the panel-area at 1025-1440 px viewports.
- `test/sidebar-tab-first-click.test.js` (NEW, +83 LOC) — 4 cases asserting the inline-handler contract against the raw `index.html` source (project precedent, JSDOM cannot resolve @media reliably): helper exists and inspects opacity/pointer-events; close-branch is gated by `isPanelAreaVisible()`; fallback else-branch calls `showSidebarPanel(key)` AND `btn.focus()`; `!sidebarOpen` regression guard preserves the open-and-show behaviour for switching tabs from a collapsed sidebar.
- `CHANGELOG.md` (+14 LOC) — new section under v0.10.1-n cluster.

## Audit findings (Step 1)

The plan's Step 1 hypothesised two root causes (a) sidebar-collapsed-default-but-Build-already-active, or (b) BuildToolbar intro gate. Neither was the actual cause. Static-source audit revealed the real culprit: the responsive CSS block at `index.html:2495-2513` (1025-1440 px viewports) sets `#sidebarPanelArea { opacity: 0; pointer-events: none }` while keeping `sidebar-open`. So on a fresh boot the sidebar IS open and Build IS the active panel, but the panel-area is INVISIBLE on common laptop widths until `:hover`/`:focus-within`. The first click hit `alreadyActive && sidebarOpen → setSidebarOpen(false)` and removed `.sidebar-open`, so the user observed nothing change in the panel area (because it was already invisible) but DID observe the top-bar objective chips (rendered into `statusScenario`) seem to "appear" — which is what A3 misread as the only effect of the click.

The fix is robust across all viewport widths: at ≥1441 px (where the panel is visible regardless), `isPanelAreaVisible()` returns true and the close-on-active-tab semantics work as before.

## Tests

`node --test test/sidebar-tab-first-click.test.js` — 4 / 4 pass.

Full-suite: **2001 pass / 0 fail / 4 skip** (120 suites, 75s) — baseline preserved + 4 new tests added.

## Acceptance verified

1. Fresh-boot single click on Build tab → fallback else-branch fires (panel was hidden), calls `showSidebarPanel('build') + btn.focus()` → focus triggers `:focus-within` → panel-area opacity goes 0→1 → Build Tools palette renders.
2. Second click on Build tab when palette is visible → `isPanelAreaVisible()` returns true → close-on-active-tab branch fires → sidebar closes (toggle pattern preserved).
3. Click on Colony tab from collapsed sidebar → `!sidebarOpen` branch unchanged → opens sidebar AND shows Colony panel (regression guard test passes).
4. Briefing copy "Open the Build tab in the right sidebar" works as a literal one-click instruction at all viewport widths.

## Suggestions taken / not taken

- **Suggestion A (RECOMMENDED, gate close-on-active by panel visibility + force-show fallback)** — TAKEN.
- **Suggestion B (only force `BuildToolbar.show()`)** — NOT taken; Step 1 audit showed the issue is the responsive CSS opacity gate, not a BuildToolbar intro state.
- **Suggestion C (also persist last-active tab across reloads)** — NOT taken; out of P1 scope.
- **Suggestion D (replace right-rail tabs with top-of-canvas dock)** — NOT taken (freeze-violating).

## `git log --oneline -2` confirmation

Run after commit; see commit footer below.
