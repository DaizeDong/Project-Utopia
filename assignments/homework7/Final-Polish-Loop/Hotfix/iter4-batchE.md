# HW7 Final-Polish-Loop — Hotfix iter4 Batch E

## Issue #9 — Pop cap stuck at 16 + missing manual recruit button

**User playtest report (zh):** "后期 worker 到 16 个就不增长了, 很多地方
都缺人. 检查是不是有限制, 你要去除所有游戏里的硬性限制, 不要制约发展.
并且右侧界面似乎没有手动招募按钮, 即使用食物就行 worker 招募."

**English:** Late-game workers are stuck at 16 forever; many places need
more workers. Check if there are limits — remove ALL hard limits in the
game, do not constrain development. Also, the right sidebar appears to
have no manual recruit button despite food-cost recruit existing in code.

## Investigation

### Root causes (Part A — pop stuck at 16)

Three independent caps converged on a 16-worker bottleneck:

1. **`PopulationGrowthSystem.js:130-141`** — `infraCap = Math.min(80, ...)`
   clamped the infrastructure-derived cap to a hard global ceiling of 80.
2. **`ColonyPerceiver.js:1377`** — companion `popCap = Math.min(80, ...)`
   used by the LLM observation packet (perceiver feeds the prompt
   "growth blockers" list — "at pop cap" entry was hard-clipped at 80).
3. **`EntityFactory.js:1185` + `BuildToolbar.js:359`** — initial /
   backfill default for `state.controls.recruitTarget = 16`. The
   `workerTargetInput` slider in index.html supports `min=0 max=500`,
   but pre-fix the slider opened at 16 and `RecruitmentSystem.update()`
   uses `Math.min(recruitTargetRaw, infraCap)` as the effective cap, so
   players who never moved the slider were capped at 16 forever.

The **infraCap formula itself is preserved** (warehouses × 3 + farms ×
0.5 + lumbers × 0.5 + quarries × 2 + kitchens × 2 + smithies × 2 +
clinics × 2 + herbGardens — soft, infrastructure-derived). Only the
`Math.min(80, …)` outer clamp is gone.

### Root cause (Part B — missing recruit button)

The `#recruitOneBtn` already exists in `index.html` at line ~3317, but
inside `Settings → Dev Tools → Population Control`. That subtree is:
- behind `class="card dev-only"` (only renders for users opting into
  dev-mode via URL `?dev=1` / localStorage / Ctrl+Shift+D chord),
- inside a `<details class="subpanel">` that is **collapsed by default**.

Most players never see it. CLAUDE.md confirms "v0.8.4 Phase 11 ...
food-cost recruitment replacing auto-reproduction" — the functionality
exists; it just was never surfaced on a player-facing panel.

## Fix

### Part A — hard caps removed

| File | Change |
| --- | --- |
| `src/simulation/population/PopulationGrowthSystem.js` | `Math.min(80, …)` clamp removed from `infraCap`. Per-building soft cap formula preserved. |
| `src/simulation/ai/colony/ColonyPerceiver.js` | Matching `Math.min(80, …)` clamp removed from `popCap`. LLM observation now reflects uncapped reality. |
| `src/entities/EntityFactory.js` | `recruitTarget: 16 → 500` (matches `workerTargetInput` slider max in index.html). |
| `src/ui/tools/BuildToolbar.js` | Backfill default for legacy snapshots: `recruitTarget = 16 → 500`. |

### Part B — Recruit button surfaced on right sidebar

| File | Change |
| --- | --- |
| `index.html` (line 2876-2891 in modified file) | New `#recruitOneSidebarBtn` + `#autoRecruitSidebarToggle` + `#recruitStatusSidebarVal` block inside the always-open `data-panel-key="population"` card on the Colony sidebar, right between the entity counts and the role breakdown. |
| `src/ui/tools/BuildToolbar.js` | `#setupRecruitControls()` extended: resolves the new sidebar nodes alongside the existing dev-panel nodes; both buttons share a single `handleRecruitClick` closure; both auto toggles share `handleAutoToggle`. Sync loop in `#syncManagementInfo` mirrors the same status string + disabled state + tooltip to both buttons. |

Disabled tooltip pattern (A6 R3 alignment): when the button is disabled,
hover surfaces "Need 25 food (have 12)" (food gate) or "Recruit queue
full (12/12)" (queue gate) so the blocking reason is obvious without
the player having to read the status line.

### Tests updated

| File | Change |
| --- | --- |
| `test/colony-perceiver.test.js:303-310` | Removed obsolete `popCap <= 80` upper bound assertion (formula is now uncapped). Replaced with a finite-number sanity check. Lower bound (`>= 8`) preserved. |
| `test/recruitment-system.test.js:50-56` | Default `recruitTarget` assertion bumped 16 → 500 (matches new EntityFactory seed). |

## Verification

### Targeted tests
```
node --test test/recruitment-system.test.js test/colony-perceiver.test.js
# tests 44 / pass 44 / fail 0 / skip 0
```

### Full suite
```
node --test test/*.test.js
# tests 1784 / pass 1776 / fail 5 / skip 3
```

All 5 failures are **pre-existing** on parent commit `4814af5` (verified
by stash + run — same 5 failures in baseline):
1. `exploit-regression: escalation-lethality — median loss tick`
2. `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
3. `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
4. `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
5. `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`

**No new regressions from Batch E.**

## Files changed

```
CHANGELOG.md                                              | + new section
assignments/homework7/Final-Polish-Loop/Hotfix/iter4-batchE.md | + new
index.html                                                | +16 lines (recruit button block)
src/entities/EntityFactory.js                             | recruitTarget 16 → 500
src/simulation/ai/colony/ColonyPerceiver.js               | popCap clamp removed
src/simulation/population/PopulationGrowthSystem.js       | infraCap clamp removed
src/ui/tools/BuildToolbar.js                              | sidebar recruit wiring + tooltip
test/colony-perceiver.test.js                             | popCap upper bound removed
test/recruitment-system.test.js                           | recruitTarget default 16 → 500
```

7 production / test files + CHANGELOG.md + this commit log = 9 files.

## Hard rules compliance

- HW7 hard freeze: NO new role / building / mechanic / UI panel.
  Recruit button surfaces existing functionality (`#recruitOneBtn`
  enqueue logic identical to the dev-panel button) — not a new mechanic.
- Track=code: only touched `src/**` + `test/**` + `index.html`
  (sidebar area only — `data-panel-key="population"` card).
- Did NOT touch `src/data/prompts/*` (Batch D).
- Did NOT touch the bottom debug panel (Batch F owns its removal —
  separate working-tree changes left intact for Batch F's commit).
- Did NOT touch `src/simulation/role/*` (allocation logic — left alone).
- Single `chore(hotfix iter4): batch E — …` commit (Parts A + B together).
- No `--amend`, no `--no-verify`, no force push.

## Recruit button location

- DOM: `index.html:2884` — `<button id="recruitOneSidebarBtn">`
- CSS selector: `#recruitOneSidebarBtn`
- Visible at: Colony sidebar → Population card (always open, first card
  in `data-sidebar-panel="colony"` body), positioned between the entity
  counts and the role breakdown.
- Tooltip when enabled: "Spawn one worker now (costs 25 food, blocked
  when food below the recruit buffer or queue full)."
- Tooltip when disabled: "Need 25 food (have N)" or "Recruit queue
  full (N/12)" depending on the gate.
