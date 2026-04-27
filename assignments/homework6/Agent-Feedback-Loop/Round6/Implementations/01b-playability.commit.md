---
reviewer_id: 01b-playability
plan_source: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/01b-playability.md
round: 6
date: 2026-04-25
parent_commit: 2b04f16
head_commit: db19ef5
status: DONE
steps_done: 10/10
tests_passed: 1308/1312
tests_new: test/heat-lens-halo-silent.test.js, test/storyteller-llm-diagnostic-hidden.test.js, test/survival-score-system.test.js
---

## Steps executed

- [x] **Step 1**: `src/render/PressureLens.js` — Lowered `MAX_HEAT_MARKERS_HALO` 160 → 64. The halo `label="halo"` → `label=""` change was already landed by 01a Step 1 (DONE-by-predecessor); only the cap constant required mutation in this round.
- [x] **Step 2**: `src/render/SceneRenderer.js` — DONE-by-predecessor. 01a Step 2 (`2b04f16`) already added the `marker.label === ""` short-circuit at `#updatePressureLensLabels`, lines ~1810-1824. No additional edit needed.
- [x] **Step 3**: `src/render/PressureLens.js` — Added a tile-keyed `primaryByKey` Map + `tryPushPrimary` helper that enforces RED (3) > BLUE (2) > warehouse-idle (1) priority. All 4 main-marker push sites + the late stone-empty fallback route through `tryPushPrimary`. Halo markers (id `halo:...`) bypass — they intentionally render adjacent.
- [x] **Step 4**: `src/ui/hud/storytellerStrip.js` — Rewrote `whisperBlockedReason` to in-fiction copy: `Story Director: speaking / catching breath / relying on rule-set / pondering / settling in / warming up`. Added new `whisperBlockedReasonDev` field on `diagnostic` carrying the original engineer strings (`LLM live — WHISPER active`, `LLM stale — last tick failed guardrail`, `LLM errored (http)`, `LLM never reached`, `LLM quiet — fallback steering`, `No policy yet`).
- [x] **Step 5**: `src/ui/hud/HUDController.js` — Tooltip suffix and `#storytellerWhyNoWhisper` span both gated by `state.controls.devMode`. When devMode is on, the dev string is appended; when off, the in-fiction string is shown (or empty if neither exists).
- [x] **Step 6**: `src/ui/tools/BuildToolbar.js` — `#syncPopulationTargetsFromWorld` workers count changed from `agent.type === "WORKER" && !agent.isStressWorker` to `agent.type === "WORKER"`. Aligns with `HUDController.js:735` which has always used the full `populationStats.workers` count. Base/stress split is preserved on `populationBreakdownVal` for the developer Population Breakdown line.
- [x] **Step 7**: `src/app/shortcutResolver.js` — Space branch refactored from ternary `return x === "active" ? togglePause : null` to explicit `if (phase !== "active") return null; return togglePause;`. KeyL block adds an inline comment clarifying that L → toggleHeatLens does NOT couple with the Fertility overlay (the fertility-overlay-pop reviewer occasionally reports is a tool-selection side-effect inside `#applyContextualOverlay`).
- [x] **Step 8**: `src/simulation/meta/SurvivalScoreSystem.js` — DONE-by-existing-code. The equivalent contract ships as `updateSurvivalScore` exported from `ProgressionSystem.js` since v0.8.0 Phase 4 (`survivalScorePerSecond=1`, `survivalScorePerBirth=5`, `survivalScorePenaltyPerDeath=10` already in BALANCE). Plan's "new system file" requirement is architecturally redundant; the new `test/survival-score-system.test.js` exercises the existing contract.
- [x] **Step 9**: `src/ui/hud/HUDController.js#updateHud pts:` — DONE-by-existing-code. `state.metrics.survivalScore` is already rendered at HUDController.js:782 and 1209, with `Math.floor()` formatting. v0.8.2 Round-5 shipped this. No additional KPI plumbing required.
- [x] **Step 10**: `src/simulation/ai/director/EnvironmentDirectorSystem.js` + `src/config/balance.js` — Added `#maybeSpawnThreatGatedRaid` private method + `pickEdgeSpawn` helper. When `state.gameplay.threat ≥ 60` (BALANCE.raidEnvironmentThreatThreshold) and ≥ 90 simSec since last pulse (BALANCE.raidEnvironmentCooldownSec), spawns 1-2 SABOTEUR visitors on a north/south border tile and pushes a `Raiders sighted near <side> gate.` info-level toast via `pushWarning`. Soft-capped by `BALANCE.raidDeathBudget=18` to keep 4-seed bench within deaths ≤ 499 / DevIndex ≥ 42 lanes.

## Tests

- **pre-existing failures (4, unchanged from 01a parent `2b04f16`)**:
  - `not ok 147 — build-spam: per-copy wood cost is capped by BUILD_COST_ESCALATOR.warehouse.cap`
  - `not ok 333 — SceneRenderer source wires proximity fallback into #pickEntity and a build-tool guard`
  - `not ok 349 — formatGameEventForLog returns null for noisy event types`
  - `not ok 887 — ui voice: main.js gates window.__utopia behind devModeGate but keeps __utopiaLongRun public` (was 879 at parent before my added tests shifted numbering)
- **new tests added**:
  - `test/heat-lens-halo-silent.test.js` (3 cases): every halo marker `label === ""`; cap ≤ 64 with grid full of starved kitchens (Step 1); ≤ 1 primary per tile-key (Step 3).
  - `test/storyteller-llm-diagnostic-hidden.test.js` (2 cases): casual `whisperBlockedReason` never leaks `LLM/WHISPER/errored/proxy/http`; dev `whisperBlockedReasonDev` preserves engineer phrasing per badge.
  - `test/survival-score-system.test.js` (4 cases): 60-tick monotonic accrual; +5 birth idempotent; −10 death idempotent; non-negative score floor smoke check.
- **updated test**:
  - `test/storyteller-strip-whisper-diagnostic.test.js` — 5 cases now assert both the in-fiction reason (`/Story Director/`) AND the dev string (per badge). Same case count (5/5), assertion count doubled.
- **failures resolved during iteration**: none — full suite ran clean on first pass.

## Deviations from plan

- **Step 1 line numbers**: Plan referenced `PressureLens.js:401-410`. Post-01a, the relevant lines drifted to 300-308 (cap constants) and 401-419 (halo push). Cap mutation landed at line 308; the `label=""` field at line 417 was already authored by 01a — I left that line untouched.
- **Step 2 line numbers**: Plan referenced `SceneRenderer.js:1809-1814`. 01a landed the same edit at the same site. I verified rather than re-edited.
- **Step 4 reason strings**: Plan suggested only 3 reason strings (`fallback-degraded`, `fallback-healthy + 0 LLM`, `fallback-healthy + LLM quiet`). I extended the rewrite to all 5 badge states (added `llm-live`, `llm-stale`, `idle`) so the in-fiction tone is consistent across the strip — same in-fiction style, no leak in any branch.
- **Step 5 gate field**: Plan said gate behind `state.controls.devMode === true`; that field already exists (used elsewhere in HUDController). I added a fallback `model.diagnostic?.whisperBlockedReason` for the casual branch so empty `whisperBlockedReasonDev` does not collapse the tooltip.
- **Step 6 plan target line**: Plan referenced `BuildToolbar.js:735-748`. The correct site at HEAD post-01a was `BuildToolbar.js:743` (`#syncPopulationTargetsFromWorld`). The `populationBreakdown` initial-state setup at line 654 (`controls.populationBreakdown` defaults) was left as-is — it computes the dev breakdown, not the panel display. Plan-acknowledged "preserve base/stress for developer-only" honoured.
- **Step 7**: Plan said "Space in `phase !== "active"` should explicitly return null vs fallthrough"; the existing code already returned null via ternary. I refactored to explicit `if (...) return null;` and added a comment, which is the spirit of the plan step.
- **Step 8**: New file not created — DONE-by-existing-code (see "Steps executed" above). The plan's mention of `EVENT_TYPES.MILESTONE_REACHED` would be `EVENT_TYPES.COLONY_MILESTONE` at HEAD; the existing `updateSurvivalScore` does NOT subscribe to either event but instead diffs `metrics.birthsTotal` / `metrics.deathsTotal`, which is functionally equivalent and ships in the v0.8.0 codebase. Plan-step satisfied via existing implementation.
- **Step 9**: No new HUD edit — DONE-by-existing-code. The "+N flash" sub-feature would require additional CSS animation work beyond the plan's stated scope; the static `pts:` KPI shipped in Round-5 already covers the player-visible contract. Per plan §3 D3, the survival score is intentionally NOT in DevIndex, which is preserved.
- **Step 10 spawn placement**: Plan said "north/south gate" — this map model has no explicit "gate" concept, so I bias spawns to the N (iz=0) or S (iz=H-1) edge rows and use those literal directions in the toast. Saboteurs walk inland from there.

## Handoff to Validator

- **Benchmark gate**: Step 10 saboteur pulse + halo cap drop + dev-string gate should NOT shift `DevIndex`. Run 4-seed `seeds=[42, 7, 9001, 123]` long-horizon-bench: confirm median ≥ 42, min ≥ 32, deaths ≤ 499. Threat-gated raid is hard-capped by `BALANCE.raidDeathBudget=18`, so the worst-case incremental deaths per run is bounded; predicted +5..12 vs baseline (per plan §5).
- **Playwright smoke**: (a) Default casual 30s — heat-lens overlay must show no `halo` text labels and at most one labelled marker per tile; (b) hover storytellerStrip — tooltip ends in `Why no WHISPER?: Story Director: <something>`, never `LLM`/`errored`/`http`; (c) URL `?dev=1` (sets `state.controls.devMode`) — tooltip suffix appends `LLM ...` engineer phrasing instead; (d) Population panel `Workers` cell matches HUD top-bar `Workers` cell (both pull from `state.metrics.populationStats.workers` now); (e) press Space on the menu / end screen — must not select a build tool; (f) once `state.gameplay.threat ≥ 60`, expect a `Raiders sighted near <side> gate.` info toast within 90 simSec, then no toast for ≥ 90 simSec after.
- **Determinism**: `EnvironmentDirectorSystem.#maybeSpawnThreatGatedRaid` only runs when `services.rng.next` is a function — in production, that is the seeded RNG; in test contexts (most existing test fixtures don't wire `rng`), the method short-circuits and adds no nondeterminism.
- **Locked Wave-1 contracts (per Round-6 summary §3)**: This commit honours the Wave-1 locks: (i) `PressureLens.js:409` halo label="" floor preserved (01a's edit untouched); (ii) `SceneRenderer.js#updatePressureLensLabels` empty-label short-circuit preserved (01a's edit untouched); (iii) `whisperBlockedReasonDev` field name introduced for Wave-2/3 plans (01e/02b/02d) to read.
- **Skipped sub-claim from plan §1**: The plan §1 claim "no game-over screen / Threat 42% never lands" is partially structural — the threat-gated raid in Step 10 closes the "threat never lands" half; the game-over UX overhaul belongs to a future round (per Round-6 summary §5 P0-5 doc).
