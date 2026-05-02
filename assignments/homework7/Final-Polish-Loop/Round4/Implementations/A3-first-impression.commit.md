---
implementer_id: A3-first-impression
plan: Round4/Plans/A3-first-impression.md
round: 4
date: 2026-05-01
parent_commit: cad38c3
track: code
status: COMPLETE
---

# A3-first-impression — R4 wave-1 Plan 1/3 implementation log

## Status

**COMPLETE** — 6 of 7 plan steps landed (Step 7 deferred), 1 new test (2 cases) added, full suite stable.

## Parent → head

- parent: `cad38c3` (v0.10.1-r4-A5: zero-lumber safety net + Recovery food-floor gate + per-map starting wood)
- head:   see `git log --oneline -2` confirmation at the end of this log

## Files changed

- `src/simulation/construction/BuildAdvisor.js` — Step 1: `explainBuildReason("hidden_tile")` text upgraded with actionable "extend a road from visible ground" hint. `explainBuildRecovery("hidden_tile")` already mentioned roads — kept consistent.
- `src/ui/panels/EntityFocusPanel.js` — Steps 2+3: default `entityFocusFilter` flipped from `"all"` → `"workers"` (a virtual filter that selects `entity.type === "WORKER"`); the new "My workers" chip renders leftmost (before "All"); empty-list footer learns the new id; `requestedFilter` whitelist + fallback both accept `"workers"`.
- `index.html` — Steps 4+5: 13-button BuildToolbar broken into 3 lightweight section headings (Foundation / Defense & Edit / Processing) via `<div class="build-cat-heading">` with `grid-column:1/-1`; new minimal CSS rule (`.tool-grid .build-cat-heading`, 9px uppercase muted text). No buttons added/removed; existing `data-tool-tier` casual-mode gating preserved.
- `src/render/FogOverlay.js` — Step 6: HIDDEN-zone alpha bumped 0.75 → 0.88 (~17%) in both the inline shader `mix()` call and the descriptive `edgeSoftness` comment block.
- `test/buildadvisor-fog-hint.test.js` — Step 8: NEW test file, 2 cases pinning the actionable "extend a road" substring + roads-mentioned recovery text (fast unit tests, no game-state setup).
- `CHANGELOG.md` — new "[Unreleased] — v0.10.1-r4-A3" section above the existing A5 section, documenting the four behavioural changes and the deferred Step 7.

## Tests

- New test: `test/buildadvisor-fog-hint.test.js` — 2/2 pass.
- Targeted regression sweep (entity-focus / fog / build-toolbar / build-toast / build-hint adjacent suites): 48/48 pass.
- Full suite (`node --test test/*.test.js`): 1799 tests / **1791 pass** / 5 fail / 3 skip.
- Parent baseline (`git stash` + same suite on `cad38c3`): 1799 / **1790 pass** / 6 fail / 3 skip.
- **Net delta: +1 pass, -1 fail vs parent.** The 5 remaining failures are all pre-existing on parent (escalation-lethality, ResourceSystem flush, RoleAssignment quarry, RaidEscalator DI=30, RaidFallback popFloor) and unrelated to BuildAdvisor / EntityFocus / FogOverlay / BuildToolbar.

## Deferred from plan

- **Step 7** (briefing depot scout-hint chip on the `east ruined depot` label) — the plan referenced "ScenarioOverlay or HUDController" without a concrete render path. A grep of HUDController surfaced only one matching `setAttribute("title", "Current scenario briefing")` line at HUDController.js:1936 with no obvious chip-render hook. Skipped to keep the plan tight and atomic; can be picked up in a follow-up plan after locating the briefing-label render path. The other three F1/F3/F6 friction points are fully addressed by Steps 1–6 + 8.

## CONFIRM `git log --oneline -2`

(Inserted post-commit by the commit step below.)
