---
reviewer_id: Plan-R13-build-reorder (R13 user issue #4)
feedback_source: assignments/homework7/Final-Polish-Loop/Round13/Feedbacks/summary.md
round: 13
date: 2026-05-01
build_commit: 527f460
priority: P1
track: code (build bar reorder — group by category, renumber hotkeys, update help)
freeze_policy: hard
rollback_anchor: 527f460
estimated_scope:
  files_touched: 2
  loc_delta: ~40
  new_tests: 1
  wall_clock: 30
conflicts_with: []
---

# Plan-R13-build-reorder — Reorder build bar: Bridge next to Road; Quarry+Herbs next to Farm+Lumber; renumber hotkeys 1-12

**Plan ID:** Plan-R13-build-reorder
**Source feedback:** R13 user directive issue #4 — "Reorder build bar in index.html data-tool array: Bridge next to Road; Quarry + Herbs into Resource category next to Farm + Lumber; renumber hotkeys 1-12; update Help text"
**Track:** code
**Priority:** **P1** — current order (Road, Farm, Lumber, Warehouse, Wall, Bridge, Demolish, Quarry, Herbs, Kitchen, Smithy, Clinic) splits the resource category (Quarry+Herbs are after Demolish/Wall) and separates infrastructure (Road from Bridge). Player has to jump across the bar to find related buildings.
**Freeze policy:** hard — pure reorder + renumber. No new tools, no behaviour changes.
**Rollback anchor:** `527f460`

---

## 1. Core problem (one paragraph)

`index.html:2901-2915` defines the build bar buttons in DOM order: Demolish, Road, Farm, Lumber, Warehouse, Wall, Bridge, Quarry, Herbs, Kitchen, Smithy, Clinic. The `data-hotkey` values map digits 1-9 + `-` `=` to tools but the categorical groupings are broken: Bridge (infrastructure) sits in the secondary tier between Wall and Quarry; Quarry+Herbs (resource) sit in the advanced tier despite being primary resource extractors. Per user directive, regroup as **Infrastructure**: Road(1), Bridge(2), Wall(3), Demolish(4) → **Resource**: Farm(5), Lumber(6), Quarry(7), Herbs(8), Warehouse(9) → **Processing/advanced**: Kitchen(0), Smithy(-), Clinic(=). Update titles, hotkey hints, and Help text in tandem.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — DOM reorder + hotkey renumber + title rewrite + help text sync

Edit `index.html:2901-2915` to reorder buttons per the new groupings. Update each button's `data-hotkey` attribute and the parenthetical hotkey hint inside its `title=` attribute. Locate the Help/keybindings panel (likely in same file or `src/ui/panels/`) and update the printed list. Add a regression test that asserts the new DOM order and hotkey mapping.

Proposed final order (12 tools):
| pos | tool         | hotkey | tier      | category   |
|-----|--------------|--------|-----------|------------|
| 1   | road         | 1      | primary   | infra      |
| 2   | bridge       | 2      | secondary | infra      |
| 3   | wall         | 3      | secondary | infra      |
| 4   | erase        | 4      | primary   | infra      |
| 5   | farm         | 5      | primary   | resource   |
| 6   | lumber       | 6      | primary   | resource   |
| 7   | quarry       | 7      | advanced  | resource   |
| 8   | herb_garden  | 8      | advanced  | resource   |
| 9   | warehouse    | 9      | primary   | resource   |
| 10  | kitchen      | 0      | advanced  | processing |
| 11  | smithy       | -      | advanced  | processing |
| 12  | clinic       | =      | advanced  | processing |

- Files: `index.html` (button DOM block + help text), possibly `src/ui/tools/BuildToolbar.js` (if it has a hardcoded tool order list).
- Scope: ~40 LOC.
- Expected gain: closes user issue #4.
- Main risk: hotkey conflicts with other UI shortcuts; tests that select buttons by `[data-hotkey="N"]` may break (but they SHOULD continue to work because the data attribute now means "press N for this tool" — the test just needs to know the new mapping).

### Suggestion B (in-freeze, MINIMAL) — only DOM reorder, keep hotkeys at original positions

Less disruptive but leaves the visual order misaligned with hotkey order — confusing.

- Files: `index.html`
- Scope: ~10 LOC

### Suggestion C (FREEZE-VIOLATING) — add visual category dividers / sub-headers in toolbar

New UI element. Out of freeze. Defer.

## 3. Selected approach

**Suggestion A** — full reorder + renumber per directive. The hotkey renumber is explicit user intent and necessary to keep visual order = hotkey order.

## 4. Plan steps

- [ ] **Step 1 — Audit current build bar in `index.html` (lines 2899-2915) and adjacent help/tooltip refs.**
  Document current order, hotkeys, title text. Search for any test or fixture that hardcodes the order or hotkeys: `Grep "data-hotkey" test/`, `Grep "data-tool=\"" test/`, `Grep "Road (1)" src/ test/`.
  - Type: read

- [ ] **Step 2 — Rewrite the button block in `index.html:2899-2915` per the new order.**
  Reorder DOM nodes. Update each `data-hotkey` and the `(N)` prefix inside `title=`. Update `data-tool-tier` to reflect re-tiering if any (e.g. erase moves from primary to category-infra position 4).
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Locate help-text / keybindings printout and update.**
  Likely lives in `index.html` (search "1 — Road" or "Hotkeys"). Reorder the listed shortcuts to match the new mapping. If it's auto-generated from the DOM (BuildToolbar.js iterates `[data-tool]`), no edit needed — verify.
  - Type: edit (conditional)
  - depends_on: Step 2

- [ ] **Step 4 — Update `BuildToolbar.js` if it has a hardcoded tool order array.**
  Search for `["road", "farm", "lumber", ...]` or similar. Reorder to match new DOM order. If it iterates `[data-tool]` from the DOM, no edit needed.
  - Type: edit (conditional)
  - depends_on: Step 3

- [ ] **Step 5 — Add regression test `test/ui/build-bar-order.test.js` (~30 LOC).**
  Test cases:
  1. Parse `index.html` build bar — assert exact DOM order matches the table in Suggestion A.
  2. For each tool, assert `data-hotkey` matches the table.
  3. Help-text printout (if present) lists hotkeys in same order.
  - Type: add
  - depends_on: Step 4

- [ ] **Step 6 — CHANGELOG.md entry.**
  *"R13 #4 Plan-R13-build-reorder (P1): build bar regrouped by category — Infrastructure (Road,Bridge,Wall,Demolish), Resource (Farm,Lumber,Quarry,Herbs,Warehouse), Processing (Kitchen,Smithy,Clinic). Hotkeys renumbered 1-9,0,-,= to match. Help text updated."*
  - Type: edit
  - depends_on: Step 5

## 5. Risks

- **Existing tests assume specific hotkey mapping.** Step 1 audit identifies which need updating.
- **Player muscle memory disruption** — players who learned 1=Road, 2=Farm now find 5=Farm. Documented in changelog; help text reflects new mapping.
- **`data-hotkey="0"` for kitchen conflicts with select tool** — current tooltip note says "0 reserved for select". Either keep kitchen on no-hotkey (toolbar-button-only) OR re-document. Recommend: leave kitchen with no `data-hotkey` (mirrors current behaviour) — only positions 1-9 + `-` + `=` get hotkeys; kitchen at position 10 is button-only.
- **Possible affected tests:** `test/ui/build-bar*.test.js`, `test/keyboard-shortcuts*.test.js`, anything with `data-hotkey` selectors.

## 6. Verification

- **New unit test:** `test/ui/build-bar-order.test.js` (Step 5).
- **Manual:** open dev server, press `1` → Road tool active; press `2` → Bridge tool active; press `7` → Quarry; press `8` → Herbs. Hover Help icon → list shows new order.
- **No bench regression** — pure UI reorder.

## 7. UNREPRODUCIBLE marker

N/A — design directive.

---

## Acceptance criteria

1. DOM order in `index.html:2899-2915` matches the table in Suggestion A.
2. Each tool's `data-hotkey` attribute matches the table.
3. Tooltip `(N)` parenthetical inside each `title=` matches the new hotkey.
4. Help-text printout (if present) lists shortcuts in the new order.
5. Test baseline 1646 / 0 fail / 2 skip preserved + new test passes.
6. CHANGELOG.md updated.

## Rollback procedure

```
git checkout 527f460 -- index.html src/ui/tools/BuildToolbar.js && rm test/ui/build-bar-order.test.js
```
