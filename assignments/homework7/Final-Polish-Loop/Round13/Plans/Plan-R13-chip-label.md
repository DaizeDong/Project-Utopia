---
reviewer_id: Plan-R13-chip-label (R13 user issue #3)
feedback_source: assignments/homework7/Final-Polish-Loop/Round13/Feedbacks/summary.md
round: 13
date: 2026-05-01
build_commit: 527f460
priority: P1
track: code (HUD chip semantics — show building name alongside count, prevent overlap)
freeze_policy: hard
rollback_anchor: 527f460
estimated_scope:
  files_touched: 1
  loc_delta: ~30
  new_tests: 1
  wall_clock: 25
conflicts_with: []
---

# Plan-R13-chip-label — Scenario goal chips show "Farms 3/8" (label + count) instead of bare "3/8"

**Plan ID:** Plan-R13-chip-label
**Source feedback:** R13 user directive issue #3 — "Top scenario goal chips show '3/8' but no building name. Add label like 'Farms 3/8' + ensure no overlap with adjacent chips"
**Track:** code
**Priority:** **P1** — bare "3/8" forces the player to either hover for the tooltip or guess from chip order. The icon is small and ambiguous (lumber + warehouse + walls all look like brown rectangles at chip size). User-invisible meaning is a UX bug.
**Freeze policy:** hard — only changes the text rendering inside `#renderGoalChips` in `HUDController.js`. No new chip types, no new state shape.
**Rollback anchor:** `527f460`

---

## 1. Core problem (one paragraph)

`HUDController.js:84` (`scenarioGoalChips`) emits chip objects with `{ name, count, target, done, ... }`. The render path at line 729 (`#renderGoalChips`) currently formats the chip text as `count/target` only (e.g. "3/8"). Per the user directive, the chip text should be `${capitalize(name)} ${count}/${target}` (e.g. "Farms 3/8") so the player can read the chip without hovering. Additionally, the priority-overflow hider at line 345 already trims chips when the bar would overflow, but the wider chip text may now trigger overflow earlier — Step 3 confirms the existing hider still produces sensible behaviour.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — inline label in chip text + tighten chip max-width CSS

In `#renderGoalChips`, change the text node generation so each chip renders `<span class="hud-goal-chip__label">Farms</span> <span class="hud-goal-chip__count">3/8</span>`. CSS gives `.hud-goal-chip__label` a `max-width: 7ch` truncate-ellipsis fallback so very long names ("Herb Garden") still fit. Existing priority-overflow hider continues to drop low-priority chips first when the row overflows.

- Files: `src/ui/hud/HUDController.js` (chip text generation + small CSS rule).
- Scope: ~30 LOC + ~15 LOC test.
- Expected gain: closes user issue #3.
- Main risk: existing tests that match on exact chip text content (e.g. `expect(chip.text).toBe("3/8")`) will need updating. Audit in Step 4.

### Suggestion B (in-freeze, MINIMAL) — append label as a tooltip only, leave visible text as "3/8"

Doesn't satisfy the user directive ("no building name"). Skip.

### Suggestion C (in-freeze) — show only the icon + name on hover, visible chip text just `3/8`

Same as current behaviour. Skip.

### Suggestion D (FREEZE-VIOLATING) — redesign goal-chip strip as a vertical sidebar widget

Out of freeze. Defer.

## 3. Selected approach

**Suggestion A** — minimal change, directly satisfies directive, no new state.

## 4. Plan steps

- [ ] **Step 1 — Locate chip text node generation in `src/ui/hud/HUDController.js`.**
  Around line 740 (`chipNodes = chips.map`), find the line that sets the chip's textContent or innerHTML to `${count}/${target}`. Document the exact lines.
  - Type: read

- [ ] **Step 2 — Modify the chip text builder to prefix the building name.**
  Replace bare count text with two nested spans:
  ```js
  const labelEl = doc.createElement("span");
  labelEl.className = "hud-goal-chip__label";
  labelEl.textContent = capitalizeBuildingName(chip.name); // "farm" → "Farms" (already plural in chip.name? audit)
  const countEl = doc.createElement("span");
  countEl.className = "hud-goal-chip__count";
  countEl.textContent = `${chip.count}/${chip.target}`;
  el.append(labelEl, countEl);
  ```
  Add `capitalizeBuildingName` near top of file (or import from `pluralBuildingKey` if it exists in balance.js — audit at Step 1).
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Add CSS rules to `<style>` block in `index.html` (or wherever `.hud-goal-chip` lives — audit).**
  ```css
  .hud-goal-chip__label { max-width: 7ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.85; margin-right: 4px; }
  .hud-goal-chip__count { font-variant-numeric: tabular-nums; font-weight: 600; }
  .hud-goal-chip { display: inline-flex; align-items: center; gap: 2px; }
  ```
  Verify priority-overflow hider at line 345 still produces a sensible truncation cascade with the wider chip widths.
  - Type: edit
  - depends_on: Step 2

- [ ] **Step 4 — Audit existing tests for hardcoded chip text matchers.**
  Grep for `"3/8"`, `goalChip`, `scenarioGoalChips`. Update any test that expects bare count text.
  - Type: edit (test fixtures)
  - depends_on: Step 3

- [ ] **Step 5 — Add regression test `test/hud-goal-chip-label.test.js` (~25 LOC).**
  Test cases:
  1. Chip with `name: "farm", count: 3, target: 8` → rendered text contains "Farms" AND "3/8".
  2. Chip with `name: "herb_garden", count: 0, target: 2` → rendered text contains "Herb Garden" or "Herbs" (label transform — assert exact form chosen in Step 2).
  3. Long-name chip does not overflow `.hud-goal-chip` box (jsdom getComputedStyle check OR snapshot HTML structure).
  - Type: add
  - depends_on: Step 4

- [ ] **Step 6 — CHANGELOG.md entry under unreleased label.**
  *"R13 #3 Plan-R13-chip-label (P1): scenario goal chips now display building name alongside count (e.g. 'Farms 3/8'). Truncate-ellipsis CSS prevents overflow."*
  - Type: edit
  - depends_on: Step 5

## 5. Risks

- **Wider chip widths trigger overflow hider earlier.** Existing hider at line 345 drains in priority order so the most useful chips survive. Verify in Step 3.
- **Possible affected tests:** `test/hud-controller*.test.js`, `test/scenario-goal*.test.js`, `test/ui/*.test.js` — any test that matches chip textContent literally.
- **Localisation: chip names are English-only** — ok at this build phase.

## 6. Verification

- **New unit test:** `test/hud-goal-chip-label.test.js` (Step 5).
- **Manual:** open dev server, observe top status bar shows "Farms 3/8" / "Lumber 2/3" / "Walls 0/8" etc. Resize window narrow → verify low-priority chips still drop first per existing hider.
- **No bench regression** — pure UI text change.

## 7. UNREPRODUCIBLE marker

N/A — design directive.

---

## Acceptance criteria

1. Each chip's visible text contains both the building name AND the count/target (e.g. "Farms 3/8").
2. Long names ("Herb Garden") truncate via ellipsis rather than overflow chip box.
3. Priority-overflow hider continues to trim chips left-to-right by priority on narrow viewports.
4. Test baseline 1646 / 0 fail / 2 skip preserved + new test passes.
5. CHANGELOG.md updated.

## Rollback procedure

```
git checkout 527f460 -- src/ui/hud/HUDController.js index.html && rm test/hud-goal-chip-label.test.js
```
