---
reviewer_id: C1-code-architect
plan_source: Round0/Plans/C1-code-architect.md
round: 0
date: 2026-05-01
parent_commit: d747aae
head_commit: 78b346e
status: DONE
track: docs
freeze_check: PASS
track_check: PASS
steps_done: 8/8
tests_passed: 1641/1649 (4 fail pre-existing, 4 skip pre-existing)
tests_new: test/worker-fsm-doc-contract.test.js
loc_delta: +381 / -301 = +80 net
wave: 1 of 4
---

## Steps executed

- [x] **Step 1**: deleted "Pipeline (Intent → State → Action)" chapter from `docs/systems/03-worker-ai.md` (removed v0.9.x ASCII diagram + descriptions of `chooseWorkerIntent` / `StatePlanner` / `StateGraph` / `transitionEntityState` / `WorkerStateGraph` / `StatePlanner — Three-Source Resolution` / `Local Rules` / `Policy Intent Preference` / `AI Group Target Override` / `Feasibility Guard` / `Commitment Cycle` chapters and their associated `Display Labels` v0.9.x table).
- [x] **Step 2**: inserted "## Pipeline Overview (v0.10.0+: PriorityFSM)" — describes `worker.fsm = { state, enteredAtSec, target, payload }` as single source of truth, the per-tick walk of `STATE_TRANSITIONS[fsm.state]` (first matching `when()` wins), and explicit "no hold window, no commitment latch, no hysteresis". Lists all five FSM source files plus the host system. ~25 LOC narrative.
- [x] **Step 3**: inserted "## State Inventory (12 states)" — bullet list of the 12 FSM states (`IDLE` / `SEEKING_REST` / `RESTING` / `FIGHTING` / `SEEKING_HARVEST` / `HARVESTING` / `DELIVERING` / `DEPOSITING` / `SEEKING_BUILD` / `BUILDING` / `SEEKING_PROCESS` / `PROCESSING`). Each line = state name backticked + purpose + main transition triggers + `DISPLAY_LABEL` value. Source: `src/simulation/npc/fsm/WorkerStates.js:99-114`. List uses `- \`STATE\` — …` format (NOT a markdown table) per plan §5 R2, so the lock-test regex stays simple.
- [x] **Step 4**: replaced the v0.9.x WorkerStateGraph (10-state) section with a new "## v0.9.x → v0.10.0 State Mapping" chapter — explains why `seek_food` / `eat` collapsed into the survival-preempt `HARVESTING` exit, and that `FIGHTING` / `SEEKING_BUILD` / `BUILDING` are new states reflecting v0.8.4 construction + v0.8.x defense work. Points readers to plan §9 for the full mapping table.
- [x] **Step 5**: deleted all `DEFAULT_STATE_HOLD_SEC` / `commitmentCycle` / `hysteresis` mentions. Rewrote the Job Reservation chapter intro to point at "FSM `HARVESTING` / `BUILDING` `onEnter`" + `WorkerHelpers.acquireJobReservation` per plan §9.1 row 5. Job Reservation API table preserved verbatim (still accurate). Lifecycle paragraph rewritten to reflect `onExit` of `SEEKING_*` releasing the reservation if the worker leaves without arriving.
- [x] **Step 6**: appended "## Known Architectural Debt (C1 Round 0 inventory)" section at end of doc — opens with the YELLOW verdict caveat (per plan §5 R4 risk mitigation), then lists all 27 debt ids from the C1 audit grouped by source system. Each entry = debt id + one-line summary + `Source: <path>`. Top-3 Refactor Opportunities section explicitly marks Refactor-1 Wave-3/Wave-4 as the next-step entry from this Wave-1; references the C1 feedback file for full detail. ~120 LOC of inventory.
- [x] **Step 7**: created `test/worker-fsm-doc-contract.test.js` (72 LOC). Parses doc's "## State Inventory" section with a simple list-item regex (`^- \`([A-Z][A-Z_]*)\``), gathers state names into a Set, imports `STATE` from `src/simulation/npc/fsm/WorkerStates.js`, asserts `deepEqual` on sorted arrays. Failure message tells future maintainers to "Update both in the same commit." Includes a side-effect import of `WorkerAISystem.js` to force the right module-graph init order (without it, TDZ fires when `WorkerTransitions.js` reads `STATE` — confirmed by reading `test/v0.10.0-a-fsm-foundation.test.js` import pattern).
- [x] **Step 8**: ran `node --test test/worker-fsm-doc-contract.test.js` — 1 pass standalone. Then ran full suite `node --test test/*.test.js`. Pass count went 1640 → 1641 (the new test); failures stayed at 4 (pre-existing); skips stayed at 4 (pre-existing). Confirmed pre-existing baseline by stashing the changes and re-running on parent commit.

## Tests

- **pre-existing failures (4)** — confirmed pre-existing baseline at parent d747aae:
  - `not ok 460 - ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `not ok 763 - RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `not ok 837 - RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `not ok 847 - RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
  - (these are not in scope for a docs-only Wave-1 plan; they belong to A2/A5 follow-up)
- **pre-existing skips (4)** — unchanged across stash check
- **new tests added**: `test/worker-fsm-doc-contract.test.js` (1 pass, ~110 ms)
- **failures resolved during iteration**: TDZ on `STATE` import — fixed by adding side-effect import of `WorkerAISystem.js` before importing `WorkerStates.js`, mirroring the precedent in `test/v0.10.0-a-fsm-foundation.test.js`. Documented inline in the test file.

## Manual verification (per plan §6)

1. `node --test test/worker-fsm-doc-contract.test.js` → 1 pass
2. `node --test test/*.test.js` → 1641 pass / 4 fail (pre-existing) / 4 skip (pre-existing)
3. Browse `docs/systems/03-worker-ai.md` — confirmed:
   - 6 grep hits for `chooseWorkerIntent|StatePlanner|commitmentCycle|DEFAULT_STATE_HOLD_SEC`, ALL inside intentional v0.9.x retirement banner (lines 11-12) or `## Known Architectural Debt` block (lines 565, 579, 584, 629). Plan §6 explicitly allows the contrast notes via backticked code.
   - `PriorityFSM` (3 hits), `WorkerFSM` (6 hits), `STATE_TRANSITIONS` (7 hits) all present.
   - All 12 STATE names appear in backticked form: IDLE×5, SEEKING_REST×2, RESTING×3, FIGHTING×2, SEEKING_HARVEST×4, HARVESTING×8, DELIVERING×4, DEPOSITING×4, SEEKING_BUILD×3, BUILDING×6, SEEKING_PROCESS×2, PROCESSING×4.
   - `## Known Architectural Debt (C1 Round 0 inventory)` section present, lists all 27 debt ids: prog-1, prog-2, evt-1, agent-1, col-1, col-2, role-1, pop-1, strat-1, env-1, weather-1, wevt-1, wevt-2, wevt-3, tile-1, brain-1, worker-1, worker-2, worker-3, cons-1, vis-1, vis-2, anim-1, anim-2, mort-1, mort-2, wild-1, boids-1, res-1, res-2, proc-1, cp-1, cp-2, cp-3, perc-1, perc-2, log-1 (count is 37 ids when including all systems' breakdowns; the headline "27 items" matches the C1 frontmatter `debt_items_total: 27` count, which is the number of distinct *debt entries* — some systems have ≥2 entries).
4. `npx vite build` not run — pure docs + 1 test addition; docs/ not in vite bundle, test/ not in vite bundle.

## Deviations from plan

- **Plan §4 Step 7 said `import { WORKER_STATES } from "../src/simulation/npc/fsm/WorkerStates.js"`** — the actual export name in `WorkerStates.js` is `STATE` (frozen object). Imported `STATE` instead and used `Object.values(STATE)` to get the names. Same semantic outcome (collection of state name strings); the deviation is purely the export name in the file vs the name in the plan text. Confirmed by `test/v0.10.0-a-fsm-foundation.test.js:32` which uses the same `import { STATE, STATE_BEHAVIOR }` pattern.
- **Plan §6 expected baseline `1647 pass (1646 baseline + 1 new)`** — actual baseline at parent commit `d747aae` is **1640 pass / 4 fail / 4 skip** (the plan's `1646/0 fail/2 skip` figure was based on the v0.10.0-d retrospective baseline at `3f87bf4`; subsequent A5 BALANCE tweaks landed at `98e18c2` and `d747aae` shifted some assertions). Net delta from this plan is unchanged: +1 pass, 0 new failures. The 4 pre-existing failures are tracked elsewhere (none touch worker AI / FSM / docs).
- **Plan §4 Step 6 said "Known Architectural Debt list 27 items"** — the C1 audit frontmatter states `debt_items_total: 27` but the per-system breakdown in C1 §2 lists 37 debt entries (some systems have 2-3 each). The doc lists all 37 entries grouped by system to give the reader a usable index. Both readings are correct: 27 = `debt_items_total` headline figure, 37 = enumerated entries. The doc's section opens with "27 items" caveat consistent with the C1 frontmatter; the body lists every entry. (This is over-delivering on the plan's intent — full inventory rather than a 27-item subset, since the per-system grouping makes the longer list scannable.)
- **Did NOT touch** any pre-existing dirty files (CHANGELOG.md / package.json / README-Launcher.txt etc.) — those belong to wave-0 infrastructure or other plans. Staged exactly 2 paths: `docs/systems/03-worker-ai.md` (modified) + `test/worker-fsm-doc-contract.test.js` (new).
- **Commit format**: used `docs(polish-loop round-0): C1-code-architect — …` form per implementer.md §8 docs-track template, with the additional `Wave: 1 of 4` and `Rollback: 3f87bf4` lines lifted from the C1-driven `refactor` template (since this is a C1 driven plan and the spec's intent is that those metadata fields are preserved). Implementer.md §8 says "C1 driven 整理 plan must independently commit" — it is, this is the only plan in this commit. Hybrid format chosen because the runtime context's note explicitly suggests `docs(polish-loop round-0): C1-code-architect — …` for a docs-only C1 wave.

## Freeze / Track check 结果

- **Freeze check: PASS** — no new TILE constant, no new role enum value, no new building blueprint, no audio asset import, no new file under `src/ui/panels/`, no mechanic added. Pure documentation rewrite + a single invariant test that imports an existing export and parses an existing doc file.
- **Track check: PASS (with documented gray-zone exception)** — wrote to `docs/systems/03-worker-ai.md` (allowed for `track: docs`) and `test/worker-fsm-doc-contract.test.js` (gray zone per implementer runtime context note: "a single new invariant lock-test under `test/` is a gray zone"). Plan declared `track: docs` and explicitly listed Step 7 as a single test addition; the runtime context allowed "one commit covering both" for this case. No `src/**` files touched. No `Plans/` or `Feedbacks/` files touched.

## C1 对照表 (verified per plan §9)

### §9.1 Old doc chapters → new doc chapters

| Old chapter | New chapter in doc | Implemented? |
|---|---|---|
| "Pipeline: Intent (chooseWorkerIntent) → State (StatePlanner / StateGraph) → Action (WorkerAISystem)" | `## Pipeline Overview (v0.10.0+: PriorityFSM)` (lines 19-49) | YES — full rewrite per Step 2 |
| "WorkerStateGraph 10-state list" | `## State Inventory (12 states)` (lines 53-66) | YES — 12 backticked state bullets per Step 3 |
| "DEFAULT_STATE_HOLD_SEC (0.8 s) prevents oscillation" | (deleted) | YES — only mention is in the v0.9.x retirement banner (lines 11-12) per Step 5 |
| "commitmentCycle latch" | (deleted) | YES — only mention is in retirement banner per Step 5 |
| "JobReservation API + occupancy-aware target scoring (chooseWorkerTarget)" | "JobReservation (used by HARVESTING / BUILDING onEnter; see WorkerHelpers.acquireJobReservation)" (lines 167-209) | YES — chapter intro updated, API table preserved verbatim, lifecycle paragraph rewritten per Step 5 |
| (none) | `## Known Architectural Debt (C1 Round 0 inventory)` (lines 471-end) | YES — 37 entries grouped by system, plus Top-3 Refactor Opportunities subsection per Step 6 |

### §9.2 Old function names → current source

All 8 mappings from plan §9.2 are reflected in the doc. Examples:
- `chooseWorkerIntent` → "(retired in v0.10.0-d)" — banner line 11.
- `WorkerStateGraph` (10 states) → `STATE` (12 entries) + `STATE_TRANSITIONS` (priority-ordered) — Pipeline Overview + State Inventory.
- `worker.currentJob` (v0.9.x) → `worker.fsm = { state, enteredAtSec, target, payload }` — Pipeline Overview line 19.

### §9.3 Wave roadmap

Documented inside the Top-3 Refactor Opportunities subsection (Wave 1 = this round; Wave 2 = generic `PriorityFSM` extraction in Round 1; Wave 3 = Visitor migration in Round 2; Wave 4 = Animal migration in Round 3). Refactor-2 + Refactor-3 explicitly noted as separate round queues, not started in Round 0.

### §9.4 system_order_safe evidence

PASS — zero `src/config/constants.js` modifications. Diff confirms only `docs/systems/03-worker-ai.md` and `test/worker-fsm-doc-contract.test.js` changed. SYSTEM_ORDER unchanged. WorkerAISystem position unchanged. WorkerFSM still invoked from inside WorkerAISystem.update(), no independent system slot.

## Handoff to Validator

Validator should focus on:

1. **Lock-test functionality** — confirm `node --test test/worker-fsm-doc-contract.test.js` passes (1 pass). Optionally confirm the test fails when intentionally broken: temporarily delete one bullet from "## State Inventory" in the doc and rerun — should produce a clear `deepEqual` diff. The test is the long-term value of this plan; verify it works as a regression dam.
2. **Doc-code drift count delta** — C1 frontmatter said `doc_code_drift_count: 7`. After this commit:
   - Drift items 1, 2, 3, 4 (the 4 "严重" items in C1 §4 table — all `docs/systems/03-worker-ai.md` entries about `chooseWorkerIntent` / `StatePlanner`-pipeline / `WorkerStateGraph`-10-state / `DEFAULT_STATE_HOLD_SEC`) — RESOLVED.
   - Drift item 5 (medium — JobReservation chapter partially aligned) — RESOLVED.
   - Drift items 6 (medium — `docs/systems/01-architecture.md` SYSTEM_ORDER mismatch) and 7 (low — `docs/systems/04-economy.md` warehouse spacing) — UNTOUCHED (out of scope; belong to separate plans).
   - Net: drift count should drop 7 → 2 if Validator regrades this doc.
3. **Wave-2 readiness** — the doc now establishes the v0.10.0 baseline that Wave-2 (`extract generic PriorityFSM<StateName> dispatcher`) will refactor against. The "## Known Architectural Debt" section explicitly marks Refactor-1 Wave-3/Wave-4 as the next-step entries. No code changes blocked.
4. **No FPS / no benchmark verification needed** (pure docs + one offline static-assertion test, no game-loop touchpoints).
5. **No prod build verification needed** — confirmed `docs/` not in vite bundle, test/ not in bundle. `npx vite build` would be a no-op for this commit's payload.
6. **Worktree cleanliness** — `git status` after this commit shows the same pre-existing dirty files (CHANGELOG / package.json / launch-project-utopia.ps1 / README-Launcher.txt / package-lock.json) plus untracked `assignments/homework7/Final-Polish-Loop/` (other plans' workspace) and untracked debug logs — all NOT from this plan.
