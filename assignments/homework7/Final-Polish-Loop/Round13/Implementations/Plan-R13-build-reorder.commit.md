---
plan: Plan-R13-build-reorder
round: 13
priority: P1
track: code
parent_commit: 06f1745
status: COMMITTED
date: 2026-05-01
---

# Plan-R13-build-reorder — implementation log

## Status

COMMITTED. Pure UI reorder per R13 user issue #4.

## Parent → head

- parent: `06f1745` (feat(chip-label r13): Plan-R13-chip-label (P1) — capitalize scenario goal chip name)
- head: see `git log --oneline -2` below

## What changed

1. **`index.html`** (build bar block, ~22 LOC): rebuilt the 12-button `.tool-grid` per the R13 canonical order:
   - **Infrastructure**: Road=1, Bridge=2, Wall=3, Demolish=4
   - **Resource**: Farm=5, Lumber=6, Quarry=7, Herbs=8, Warehouse=9
   - **Processing**: Kitchen=no-hotkey (0 reserved for Select), Smithy=-, Clinic==
   - Bridge moved next to Road (both pathing/infrastructure).
   - Quarry+Herbs moved into Resource next to Farm+Lumber (no longer buried in the advanced/processing band).
   - Each `data-hotkey` attribute + parenthetical `(N)` inside `title=` updated in tandem.
   - Category headings renamed `Foundation`/`Defense` → `Infrastructure`; `Processing` retained for cooked-goods band.

2. **`test/ui/build-bar-order.test.js`** (rewritten, ~118 LOC): SUPERSEDES the v0.10.1-r6-PI Demolish-at-slot-2 invariant. New test pins the full 12-tool DOM order AND the hotkey mapping; adds an `extractToolHotkeyMap` helper; includes a "no two tools share the same hotkey" sanity check.

3. **`CHANGELOG.md`**: new top-level entry.

## What did NOT need editing

- `src/ui/tools/BuildToolbar.js` — iterates `[data-tool]` from the DOM at construction time. Reordering the DOM is sufficient. Confirmed via grep: only references `data-hotkey="0"` once for the runtime-injected Select button.
- `index.html` `.hint` strip — already advertises generic "1–9/-/=: tools".
- `index.html` `.hotkey-grid` panel — already advertises generic "1–9 / - / =: select build tool".
- `test/index-html-tool-cost-consistency.test.js` — greps tooltips by tool name not by position; continues to pass.

## Tests

- Targeted (build-bar-order + cost-consistency): **14 / 14 pass**.
- Full suite: **2057 pass / 2 fail / 3 skip**. Both failures are pre-existing and unrelated:
  - `exploit-regression: exploit-degradation` — known v0.8.7+ deterministic seed shift, latent.
  - `HUDController gives Score and Dev independent numeric tooltips` — passes in isolation; flake on full-suite cross-test pollution.
- Verified by re-running `test/ui/HUDController*.test.js` standalone (3 / 3 pass) and by re-running the failing exploit test on the parent commit (still failed → pre-existing).

## Files (absolute)

- C:/Users/dzdon/CodesOther/Project Utopia/index.html
- C:/Users/dzdon/CodesOther/Project Utopia/test/ui/build-bar-order.test.js
- C:/Users/dzdon/CodesOther/Project Utopia/CHANGELOG.md
- C:/Users/dzdon/CodesOther/Project Utopia/assignments/homework7/Final-Polish-Loop/Round13/Implementations/Plan-R13-build-reorder.commit.md
