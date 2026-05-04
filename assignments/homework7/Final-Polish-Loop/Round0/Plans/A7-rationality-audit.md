---
reviewer_id: A7-rationality-audit
reviewer_tier: A
feedback_source: Round0/Feedbacks/A7-rationality-audit.md
round: 0
date: 2026-05-01
build_commit: 3f87bf4
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 5
  loc_delta: ~180
  new_tests: 2
  wall_clock: 35
conflicts_with:
  - A5-* (food rate display — P0 #2 overlaps with A5's economy-display plan; coordinate on whose change-set actually edits the headline computation)
  - A6-* (HUD/toast cleanup — P0 #1 stat-bar reset and P0 #3 L-key toast both touch top-bar / toast surfaces A6 likely also touches)
rollback_anchor: 3f87bf4
---

## 1. 核心问题

A7 surfaced 4 P0 "display ≠ reality" disconnects, all rooted in the same class of bug: **state / labels / debug surfaces that were correct during dev but never wired to the player-visible layer**. Specifically:

1. **Cross-run state leakage** — Top stat bar renders cached "previous run" string (Survived/Score/Dev) for ≥1 minute after Try Again. A reset hook is missing on the lifecycle event that Try Again fires.
2. **Headline ≠ breakdown** — Food shows `▼ -562.4/min (cons -39 / spoil -2)`. The headline number disagrees with its own parenthetical breakdown by 14× (and the time-to-empty calculation uses the breakdown, confirming the breakdown is the truthful one). One sampling path is double-counting (likely per-tick × 60 instead of per-second).
3. **Documented behaviour ≠ wired behaviour** — `L` key toast says "Tile icons enabled/disabled" but Help dialog + Build legend both promise it toggles Heat Lens. The keybinding handler is bound to the wrong action; Heat Lens lives on the sidebar `Heat (L)` button only.
4. **Dev-only surface leaked to player** — Inspector renders 70+ `<details>` panels (LLM Call I/O, Prompt Input, Raw Model Content, Director Timeline, A* + Boids, AI Trace, …). These need to be gated behind the existing `window.__utopiaDevApp` flag (same pattern HW6 used for AI-10) rather than deleted, since dev workflows still need them.

## 2. Suggestions（可行方向）

### 方向 A: 4 atomic, surgical fixes — one per P0 — sharing a single dev-flag helper

- 思路: Treat each P0 as an independent narrow fix. (1) hook `resetGameState()`/Try-Again handler to clear the stat-bar cache; (2) make headline rate read from the same accumulator that produces the `(cons / spoil)` breakdown so they cannot disagree; (3) remap `L`-keydown handler to the same callback the sidebar `Heat (L)` button calls, and update the toast text; (4) wrap the LLM debug `<details>` block in `if (window.__utopiaDevApp)` (or move into a single `<details>` collapsed by default and hidden unless flag set).
- 涉及文件: `src/ui/hud/StatBar.*`, `src/ui/hud/ResourcePanel.*` (or wherever Food rate breakdown is computed — Grep needed at impl time), `src/ui/keyBindings.*` / `src/ui/inputHandlers.*`, `src/ui/panels/InspectorPanel.*`, `src/ui/devFlag.*` (helper).
- scope: 中（4 files of substantive edit, ~150–200 LOC delta, no new modules）
- 预期收益: All 4 P0s closed; rationality score 4 → ~6 (per A7's own projection 4 P0 + 11 P1 → 7).
- 主要风险: (a) The dev-flag hide on debug panels may break a Playwright trace test that asserts panel presence; need to grep for `LLM Call I/O` text in tests. (b) Food headline fix may briefly regress other rate displays if the same buggy multiplier is shared across resources (Wood/Stone "sampling…" + `-248.6/min` in P1 #5 is suspicious — same root?).
- freeze 检查: OK — no new tile/role/building/mood/audio/UI panel; only fixes existing surfaces.

### 方向 B: Big "UI hygiene pass" — refactor Inspector + StatBar into a single dev-mode-aware view layer

- 思路: Introduce a `ViewMode` enum (`PLAYER` / `DEV`) read from `window.__utopiaDevApp`, then thread it through every panel, classifying each `<details>` block as player-visible or dev-only. Same pass would normalize stat-bar lifecycle hooks and rate-formatter contracts.
- 涉及文件: All of `src/ui/panels/*`, `src/ui/hud/*`, plus new `src/ui/viewMode.js`.
- scope: 大（10+ files, ~600 LOC, touches every panel）
- 预期收益: Long-term clean fix; eliminates the whole class of "dev surface leaked to player" bugs.
- 主要风险: 30-min budget cannot land this safely; high regression surface; will conflict with A5 + A6 plans which also touch panels. Likely breaks Playwright snapshots wholesale.
- freeze 检查: OK technically (no new mechanics) but practically infeasible inside the deadline.

## 3. 选定方案

选 **方向 A**. Reasons:
- Priority is **P0** → enhancer spec instructs "选小 scope / 快速落地". Direction A is the surgical option.
- Direction B's scope (~600 LOC, 10+ files) blows the ≤400 LOC C1 cap (and we're not even C1) and the 30-min wall-clock budget.
- Direction A ships all 4 P0 fixes inside the budget and leaves the door open for B as a follow-up wave.
- Hard freeze respected: no new tile/role/building/mood/audio/UI panel — only existing-surface bug fixes and a dev-flag gate.

## 4. Plan 步骤

- [ ] **Step 1**: `src/ui/` — Grep for the stat-bar render function. Likely candidate: `src/ui/hud/StatBar.js:render` or `src/ui/StatusBar.js`. Locate the `Survived HH:MM:SS Score N Dev N/100` template and the lifecycle hook that fires on **Try Again** / **New Map** (search for `resetGameState`, `restartRun`, `gameLifecycle.reset`, or the GameEventBus event name e.g. `run:restart` / `lifecycle:newRun`).
  - Modify: in the lifecycle reset handler, clear the stat-bar's cached `survivedSec / score / devIndex / motto` fields to their initial values (`0 / 0 / 0 / ''`) **before** the next render tick so the visible string updates within ≤100 ms of Try Again click.
  - 修改类型: `edit`
- [ ] **Step 2**: `src/ui/hud/<ResourcePanel-or-equivalent>:formatFoodRate` (or whichever function emits the `▼ -562.4/min (cons -X / spoil -Y)` line) — make the headline number a derived value: `headline = -(cons + spoil)`, **not** an independently sampled accumulator. Remove (or comment-and-delete) the second sampling path. Apply the same fix to Wood / Stone / Herbs to also kill P1 #5 (`-248.6/min` while Wood is constant 35).
  - 修改类型: `edit`
  - depends_on: none
- [ ] **Step 3**: `src/ui/keyBindings.*` (likely `src/ui/inputHandlers.js` or `src/ui/keyboard.js`) — Find the case for `event.key === 'l' || event.key === 'L'`. Remap to call the **same** function the sidebar `Heat (L)` button calls (search `Heat lens ON`, `toggleHeatLens`, `setOverlay('heat')`). Update the toast text emitted by the L handler from "Tile icons enabled/disabled" to match the sidebar wording: `Heat lens ON — red = surplus, blue = starved.` / `Heat lens OFF.`.
  - 修改类型: `edit`
  - depends_on: none
- [ ] **Step 4**: `src/ui/panels/InspectorPanel.*` (likely `src/ui/InspectorPanel.js`) — Locate the LLM debug section (search `LLM Call I/O`, `Prompt Input`, `Raw Model Content`). Wrap the entire 70+ `<details>` block in a guard:
  ```
  if (window.__utopiaDevApp) { ...existing debug render... }
  ```
  Do **not** delete the panels — dev/QA still need them. Confirm the same guard pattern is already used elsewhere (HW6 AI-10) by Grep'ing `__utopiaDevApp`.
  - 修改类型: `edit`
  - depends_on: none
- [ ] **Step 5**: `test/ui/statBar.reset.test.js` (new) — Add a Node `--test` unit asserting that calling the lifecycle-reset handler clears `survivedSec / score / devIndex` to 0 and that the next `formatStatBar()` returns the "fresh-run" string template. Mock GameEventBus if needed.
  - 修改类型: `add`
  - depends_on: Step 1
- [ ] **Step 6**: `test/ui/foodRateConsistency.test.js` (new) — Add a Node `--test` unit asserting `headlineRate === -(consRate + spoilRate)` for a fixture state with non-trivial cons + spoil. This locks the invariant so future refactors cannot regress.
  - 修改类型: `add`
  - depends_on: Step 2
- [ ] **Step 7**: `CHANGELOG.md` — Append a `v0.10.1-n` (or current unreleased section) entry under "Bug Fixes" listing the 4 P0 closures with a one-line rationale each. Per project convention: every commit must update CHANGELOG.
  - 修改类型: `edit`
  - depends_on: Steps 1–4

## 5. Risks

- **Step 4 dev-flag hide may break a Playwright snapshot/trace test** that asserts the LLM debug panels are present in the player DOM. Mitigation: Grep tests for `LLM Call I/O` / `Raw Model Content` strings before flipping; if any exist, guard them with the same `__utopiaDevApp` flag or move them under `test/dev-only/`.
- **Step 2 may have shared-rate-formatter side effects** — if Food/Wood/Stone all flow through one formatter, fixing Food fixes the others (P1 #5 bonus), but if they're three independent paths, only Food is fixed in this round.
- **Step 3 may create a duplicate-toast** if both the keybinding handler **and** the sidebar button each fire a toast — verify only one path emits the toast post-fix (single source of truth: route both into the same callback that includes the toast call).
- **Step 1 risk**: if the stat bar reads from a *separate* in-memory cache from the bottom-of-screen simulation timer (which DOES reset correctly), there may be more than one stale field — be thorough and clear *all* fields the StatBar reads from, not just the ones in the visible string.
- **可能影响的现有测试**: any test in `test/ui/` that snapshots InspectorPanel HTML; any test that asserts a specific Food rate string format; any Playwright trace that presses `L` and expects the old "Tile icons" toast. Run full `node --test test/*.test.js` before commit.

## 6. 验证方式

- **新增测试**: `test/ui/statBar.reset.test.js` (Step 5) and `test/ui/foodRateConsistency.test.js` (Step 6).
- **手动验证 (P0 #1)**: dev server → die → Try Again → within 1 second confirm top stat bar reads `Survived 00:00:00 Score 0 Dev 0/100` (or the equivalent fresh-run motto).
- **手动验证 (P0 #2)**: dev server → wait until headline shows non-trivial Food drain → confirm headline number `≈ -(cons + spoil)` (allow ±1 rounding). Repeat for Wood and Stone if Step 2 covered them.
- **手动验证 (P0 #3)**: dev server → press `L` → confirm toast says "Heat lens ON" (not "Tile icons") AND the heat overlay actually appears AND pressing `L` again toggles it OFF. Cross-check: clicking the sidebar `Heat (L)` button produces identical behaviour.
- **手动验证 (P0 #4)**: dev server (no dev flag) → die → open Inspector → confirm **no** LLM Call I/O / Prompt Input / Raw Model Content panels are visible. Then run with `window.__utopiaDevApp = true` set in console before reload → confirm panels reappear.
- **FPS 回归**: `browser_evaluate` 5-sec average ≥ baseline — 5%. (Hiding 70 `<details>` should *improve* FPS slightly for non-dev users.)
- **benchmark 回归**: `scripts/long-horizon-bench.mjs` seed 42 / temperate_plains — DevIndex baseline ± 2 tolerance (no simulation logic changed, only UI).
- **prod build**: `npx vite build` no errors; `vite preview` 3-min smoke produces zero console errors and zero "previous-run residue" in the stat bar across two consecutive Try Agains.

## 7. 回滚锚点

- 当前 HEAD: `3f87bf4`
- 一键回滚: `git reset --hard 3f87bf4` (only triggered by orchestrator if Implementer cannot land clean within deadline).

## 8. UNREPRODUCIBLE 标记

N/A — A7 supplied direct screenshots (14/15/19/20/21 for P0 #1; in-feedback Food number `-562.4/min vs -41/min` for P0 #2; explicit toast text capture for P0 #3; Inspector panel listing for P0 #4). All four reproduce by definition from the same build commit `3f87bf4` the audit ran on. Live Playwright re-verification deferred to Implementer (saves Enhancer budget; behaviour is unambiguous).
