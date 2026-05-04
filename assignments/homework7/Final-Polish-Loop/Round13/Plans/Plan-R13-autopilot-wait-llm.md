---
reviewer_id: Plan-R13-autopilot-wait-llm (R13 user issue #6)
feedback_source: assignments/homework7/Final-Polish-Loop/Round13/Feedbacks/summary.md
round: 13
date: 2026-05-01
build_commit: 527f460
priority: P1
track: code (autopilot startup gate — wait for first /api/ai/plan response or fallback)
freeze_policy: hard
rollback_anchor: 527f460
estimated_scope:
  files_touched: 3
  loc_delta: ~40
  new_tests: 1
  wall_clock: 35
conflicts_with: [Plan-R13-fog-aware-build]
---

# Plan-R13-autopilot-wait-llm — Autopilot waits for first LLM plan response (or fallback mode) before placing buildings

**Plan ID:** Plan-R13-autopilot-wait-llm
**Source feedback:** R13 user directive issue #6 — "Autopilot currently builds immediately. Should wait for first LLM /api/ai/plan response before issuing build proposals (unless fallback mode active). Add state.ai.autopilotReady = false until first plan received OR state.ai.fallbackMode = true."
**Track:** code
**Priority:** **P1** — Player observes autopilot rushing into questionable placements within the first 3 seconds, before the LLM has had a chance to influence strategy. The first-3s placements then anchor the colony layout and the LLM's later guidance can't course-correct.
**Freeze policy:** hard — only adds a startup gate flag; no new mechanic, no new tile, no new advisor logic.
**Rollback anchor:** `527f460`
**Conflicts with:** `Plan-R13-fog-aware-build` — both gate BuildAdvisor's entry. Merge order: this plan's `autopilotReady` check goes ABOVE BuildAdvisor entry; fog-aware plan's per-candidate gate goes INSIDE evaluate. Layered cleanly.

---

## 1. Core problem (one paragraph)

`BuildAdvisor` runs every tick from sim start. The first `/api/ai/plan` LLM response typically lands 1.5-3.0 seconds in (network + token gen). During that window the advisor's local heuristics + proposer chain place 3-6 buildings using fallback policies. When the LLM response finally arrives, those placements are anchored — the LLM can only add to the layout, not undo. Per the user directive, autopilot should hold off building until either (a) the first LLM plan response is received OR (b) fallback mode is explicitly active (offline / API key missing / repeated 5xx errors).

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — gate BuildAdvisor entry on `state.ai.autopilotReady`

Add `state.ai.autopilotReady = false` to the initial state. Set true:
- when `PlanExecutor` (or the AI bridge that posts to `/api/ai/plan`) receives its first successful response — set `state.ai.autopilotReady = true; state.ai.firstPlanReceivedSec = state.metrics.timeSec`
- when fallback policy activates (`state.ai.fallbackMode = true`) — set `state.ai.autopilotReady = true` (so fallback isn't blocked too)
- when the user manually toggles autopilot (treat as explicit consent — set true immediately)

In the system that calls `BuildAdvisor.evaluate` per tick (audit which system — likely `AdvisorSystem` or directly in `ColonyDirectorSystem`), early-return if `state.ai.autopilotMode === 'on' && !state.ai.autopilotReady`. Optional UI hint: "Awaiting first AI plan…" toast + tiny status pip.

- Files: `src/app/types.js` (initial state field), `src/simulation/ai/colony/PlanExecutor.js` (set true on first response), `src/simulation/construction/BuildAdvisor.js` OR the calling system (gate).
- Scope: ~40 LOC + 1 test ~20 LOC.
- Expected gain: closes user issue #6.
- Main risk: if LLM never responds AND fallback never activates (silent network hang), autopilot stalls forever. Mitigate with a 10-sec timeout that flips `fallbackMode = true` AND `autopilotReady = true`.

### Suggestion B (in-freeze, MINIMAL) — only delay autopilot for fixed 5 seconds

Doesn't honor the directive's intent (the wait should be data-driven, not time-driven). Skip.

### Suggestion C (in-freeze, AGGRESSIVE) — defer autopilot until LLM AND first scout AND first farm

Coupling too many gates; harder to reason about. Skip.

## 3. Selected approach

**Suggestion A** — gate on `autopilotReady` driven by either first LLM response or fallback. Add 10-sec safety timeout to flip fallback mode if LLM never returns.

## 4. Plan steps

- [ ] **Step 1 — Add `state.ai.autopilotReady` and `state.ai.firstPlanReceivedSec` to initial state.**
  In `src/app/types.js` (or wherever `createInitialAiState` / equivalent lives — audit), add:
  ```js
  autopilotReady: false,
  firstPlanReceivedSec: null,
  autopilotReadyReason: null, // "first-plan" | "fallback" | "user-toggled" | "timeout"
  ```
  - Type: edit

- [ ] **Step 2 — In `PlanExecutor.js` (or the AI bridge that posts to `/api/ai/plan`), set the flag true on first successful response.**
  Wherever the first `Bridge` / `LLMRequest` resolves to a parsed plan, gate:
  ```js
  if (!state.ai.autopilotReady) {
    state.ai.autopilotReady = true;
    state.ai.firstPlanReceivedSec = state.metrics.timeSec;
    state.ai.autopilotReadyReason = "first-plan";
  }
  ```
  Also set true when `state.ai.fallbackMode` flips true (search the fallback-activation site):
  ```js
  if (!state.ai.autopilotReady) {
    state.ai.autopilotReady = true;
    state.ai.autopilotReadyReason = "fallback";
  }
  ```
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Add safety timeout in `ColonyDirectorSystem` or a new tiny `AutopilotReadinessGuard`.**
  After 10 sim-sec without flag flip, force `fallbackMode = true` AND `autopilotReady = true; autopilotReadyReason = "timeout"`. Constant `BALANCE.autopilotReadyTimeoutSec = 10`.
  - Type: add
  - depends_on: Step 2

- [ ] **Step 4 — Gate BuildAdvisor calls in the system that invokes them.**
  Audit which system calls `BuildAdvisor.evaluate` per tick (ColonyDirectorSystem? AdvisorSystem? AutopilotPlacementSystem?). At the top of that system's update:
  ```js
  if (state.ai.autopilotMode === "on" && !state.ai.autopilotReady) {
    return; // hold off until first LLM plan or fallback
  }
  ```
  - Type: edit
  - depends_on: Step 3

- [ ] **Step 5 — Add a status pip / toast to HUD.**
  In `HUDController.js`, when `state.ai.autopilotMode === "on" && !state.ai.autopilotReady`, show a small "Awaiting first AI plan…" pip near the autopilot toggle. Clears once `autopilotReady` flips.
  - Type: edit (small)
  - depends_on: Step 4

- [ ] **Step 6 — Unit test `test/autopilot-wait-llm.test.js` (~30 LOC).**
  Test cases:
  1. Fresh state with autopilotMode=on, no LLM response: BuildAdvisor not called for ≥5 ticks.
  2. Simulate first plan response: BuildAdvisor called next tick.
  3. Simulate fallback flip without plan: BuildAdvisor called next tick.
  4. 10-sec safety timeout fires when neither flag flips: fallback forced.
  5. autopilotMode=off → flag never gates anything (always-on for manual mode).
  - Type: add
  - depends_on: Step 5

- [ ] **Step 7 — CHANGELOG.md entry.**
  *"R13 #6 Plan-R13-autopilot-wait-llm (P1): autopilot now holds off building until first /api/ai/plan response received OR fallback mode active OR 10-sec safety timeout. Adds state.ai.autopilotReady + firstPlanReceivedSec + autopilotReadyReason. HUD shows 'Awaiting first AI plan…' pip during the wait."*
  - Type: edit
  - depends_on: Step 6

## 5. Risks

- **Conflicts with `Plan-R13-fog-aware-build`** — both gate BuildAdvisor entry. Merge order: this plan ABOVE (early-return before BuildAdvisor.evaluate); fog gate INSIDE evaluate (per-candidate skip). Layered cleanly.
- **LLM-down silent hang** — mitigated by 10-sec timeout flipping fallback.
- **Manual-mode players** — gate only fires when `autopilotMode === "on"`. Manual click-to-build always works.
- **First-plan response may be invalid/empty** — only counts as "received" if the response parses successfully. Failed parses do NOT flip the flag (so autopilot keeps waiting until either a valid plan OR fallback OR timeout).
- **Possible affected tests:** `test/autopilot*.test.js`, `test/plan-executor*.test.js`, `test/colony-director*.test.js`.

## 6. Verification

- **New unit test:** `test/autopilot-wait-llm.test.js` (Step 6).
- **Manual:** dev server, autopilot on, fresh map. Observe no buildings placed for first ~2 sec, then first batch appears once LLM responds.
- **Manual offline:** disconnect network, autopilot on → 10s timeout → fallback policy takes over and builds.
- **No bench regression** — long-horizon DevIndex unchanged (the 2-3 sec startup delay is sub-1% of run length).

## 7. UNREPRODUCIBLE marker

N/A — observable in dev build per directive.

---

## Acceptance criteria

1. With autopilotMode=on and no LLM response, BuildAdvisor.evaluate is NOT called.
2. First valid LLM plan flips `autopilotReady=true`, BuildAdvisor runs next tick.
3. Fallback activation also flips the flag.
4. 10-sec timeout flips fallback + ready.
5. Manual mode (autopilotMode=off) is never gated.
6. HUD pip shows during wait.
7. Test baseline 1646 / 0 fail / 2 skip preserved + new test passes.
8. CHANGELOG.md updated.

## Rollback procedure

```
git checkout 527f460 -- src/app/types.js src/simulation/ai/colony/PlanExecutor.js src/simulation/construction/BuildAdvisor.js src/simulation/meta/ColonyDirectorSystem.js src/ui/hud/HUDController.js src/config/balance.js && rm test/autopilot-wait-llm.test.js
```
