---
round: 4
date: 2026-04-23
plans_total: 10
plans_accepted: 3
plans_deferred: 7
waves: 3
---

# Round 4 Stage B Plans Summary

## 1. Plans 一览

| plan | priority | decision | scope(loc) | files_touched | focus 简述 |
|---|---:|---|---:|---:|---|
| 01a-onboarding | P0 | SUBSUMED | ~180 | 7 | Onboarding/help/next-action rewrite, but too much copy-layer churn overlaps 01b/02c |
| 01b-playability | P0 | ACCEPT | ~190 | 6 | Causal next-action loop, build-preview consequence, autopilot truth demotion |
| 01c-ui | P1 | SUBSUMED | ~180 | 6 | UI hierarchy cleanup is valid, but accepted plans already cover the load-bearing surfaces |
| 01d-mechanics-content | P1 | DEFERRED | ~260 | 8 | Broad causal rewording across HUD/Event/Inspector; too wide for one round and conflicts with narrower 01b |
| 01e-innovation | P1 | DEFERRED | ~180 | 6 | Weakly grounded AI-differentiation plan with wildcard paths and no code-verified runtime contract |
| 02a-rimworld-veteran | P1 | ACCEPT | ~140 | 6 | Menu briefing + template/size truth contract so Start Colony matches what the player just selected |
| 02b-casual | P1 | SUBSUMED | ~220 | 7 | Casual actionable guidance mostly duplicates 01b on the same bottleneck loop |
| 02c-speedrunner | P0 | ACCEPT | ~45 | 4 | Fresh-load run-entry stability, help modal non-blocking, run-start confirmation |
| 02d-roleplayer | P1 | DEFERRED | ~140 | 6 | Narrative/cast-first first-screen pass is lower priority than broken run/start/system trust |
| 02e-indie-critic | P1 | SUBSUMED | ~140 | 6 | Authorial-voice hierarchy critique maps to 02a first-screen contract plus 01b active-play contract |

## 2. 冲突矩阵

- **D1 REDUNDANT: 01a-onboarding x 01b-playability**. Both rewrite `nextActionAdvisor`, `HUDController`, `GameStateOverlay`, and related onboarding copy. Keep `01b` because it is narrower and ties the text directly to build-preview/system consequence instead of broad help/glossary churn.
- **D1 REDUNDANT: 02b-casual x 01b-playability**. Both target the same casual-player stall: “I know I need a farm, but not why/where/how this fixes the colony.” Keep `01b`; drop the duplicate copy pass.
- **D1 REDUNDANT: 01c-ui x 02e-indie-critic**. Both mainly rebalance hierarchy and tone on `index.html`, `GameStateOverlay`, `HUDController`, and `WorldExplain`. Do not spend Round 4 budget on a standalone hierarchy/voice pass before the run contract is fixed.
- **D1 REDUNDANT: 02e-indie-critic x 02a-rimworld-veteran**. Both want the menu to read like a strategic briefing instead of a control sheet. Keep `02a` because it also fixes the concrete template/size truth contract.
- **D2 CONFLICT: 01d-mechanics-content x 01b-playability**. They overlap on `ScenarioFactory`, `nextActionAdvisor`, `HUDController`, `autopilotStatus`, and player-facing causal wording, but `01d` spreads the same theme across `WorldExplain`, `EventPanel`, `InspectorPanel`, milestone copy, Heat Lens copy, and Dev tooltip in one pass. Accept `01b` and defer `01d` because Round 4 needs a smaller contract that can be tested, benchmarked, and rolled back cleanly.
- **D2 CONFLICT: 01e-innovation x 01b-playability/01d-mechanics-content**. `01e` tries to foreground AI differentiation on the same HUD/panel surfaces, but the plan is not code-grounded: wildcard file paths, no live reproduction, and no stable white-listable touch set. Defer.
- **D2 CONFLICT: 02d-roleplayer x 02a-rimworld-veteran**. Both compete for the same menu-overlay real estate in `index.html` and `GameStateOverlay`, but Round 4 first needs trustworthy run briefing and template/start coherence before it spends first-screen budget on cast/stakes narration.
- **D3 SEQUENCE: 02c-speedrunner -> 02a-rimworld-veteran**. `02c` stabilizes fresh-load entry and active-run transition in `index.html`, `GameApp`, and `GameStateOverlay`; `02a` then layers a more strategic briefing on a stable entry path.
- **D3 SEQUENCE: 02a-rimworld-veteran -> 01b-playability**. `02a` makes the menu/start contract trustworthy first; `01b` then rewrites the in-run causal loop and build preview without fighting a moving run-entry surface.
- **D4 INDEPENDENT: none among accepted plans**. All accepted plans touch overlapping startup/HUD surfaces, so serial waves are required.
- **D5 OUT-OF-SCOPE: none accepted or deferred this round**. The weak plans were rejected for duplication/precision/prioritization, not for proposing new mechanics.

## 3. Wave 调度

### Wave 1（基础 / 无依赖 / 优先级高）

- `02c-speedrunner`: remove first-load run blockers, make run start immediate and legible, and keep help discoverable without stealing focus.

### Wave 2（依赖 Wave 1）

- `02a-rimworld-veteran`: make the menu reflect the currently selected template/size immediately and ensure `Start Colony` consumes exactly that visible selection.

### Wave 3（依赖 Wave 2）

- `01b-playability`: tighten the active-play loop into “bottleneck -> recommended action -> expected consequence,” including build preview and autopilot phrasing on the same contract.

## 4. DEFERRED plans（不在本轮落地）

| plan | 原因（D2/D5 之一） | 交还给下轮的 reviewer 处理 |
|---|---|---|
| 01d-mechanics-content | D2: same causal-feedback surfaces as `01b`, but much wider copy/event/inspector churn with higher regression risk | Verify after `01b` whether the core causal loop is still too weak before reopening broader explanation surfaces |
| 01e-innovation | D2: vague and weakly grounded; wildcard paths and no reproducible contract make it unsafe for implementer handoff | Re-review only after the AI/autopilot layer has a stable, concrete player-visible contract |
| 02d-roleplayer | D2: first-screen narrative/cast work conflicts with higher-priority run-entry/system-trust work on the same menu surfaces | Re-review whether stronger run trust creates room for cast/stakes framing without crowding the entry screen |

## 5. Implementer 输入契约

Wave order is strict. Each accepted plan is implemented and committed separately. No later wave starts before the prior wave passes `node --test test/*.test.js`.

Accepted plan paths:

- `assignments/homework6/Agent-Feedback-Loop/Round4/Plans/02c-speedrunner.md`
- `assignments/homework6/Agent-Feedback-Loop/Round4/Plans/02a-rimworld-veteran.md`
- `assignments/homework6/Agent-Feedback-Loop/Round4/Plans/01b-playability.md`

Commit scope white-lists:

- `02c-speedrunner`
  - `index.html`
  - `src/app/GameApp.js`
  - `src/ui/hud/GameStateOverlay.js`
  - `test/help-modal.test.js`
  - `test/game-state-overlay.test.js`

- `02a-rimworld-veteran`
  - `index.html`
  - `src/app/GameApp.js`
  - `src/ui/hud/GameStateOverlay.js`
  - `src/world/grid/Grid.js`
  - `src/world/scenarios/ScenarioFactory.js`
  - `test/game-state-overlay.test.js`
  - `test/start-button-applies-template.test.js`
  - `test/help-modal.test.js`
  - `test/scenario-voice-by-template.test.js`
  - `test/ui-voice-consistency.test.js`

- `01b-playability`
  - `src/simulation/construction/BuildAdvisor.js`
  - `src/ui/hud/nextActionAdvisor.js`
  - `src/ui/hud/HUDController.js`
  - `src/ui/hud/autopilotStatus.js`
  - `src/ui/hud/GameStateOverlay.js`
  - `src/ui/panels/EventPanel.js`
  - `src/world/scenarios/ScenarioFactory.js`
  - `test/build-consequence-preview.test.js`
  - `test/next-action-advisor.test.js`
  - `test/hud-next-action.test.js`
  - `test/hud-autopilot-status-contract.test.js`
  - `test/hud-controller.test.js`

Forbidden in Round 4 Stage C:

- any edits under `Round4/Feedbacks/` or `Round4/Plans/`
- any new buildings, tools, tiles, score systems, victory conditions, tutorial scenarios, audio/assets, relationship/mood/grief mechanics
- any white-list escape outside the accepted plan’s file set
- any attempt to “improve reviewability” by adding extra explanatory copy that is not attached to the accepted plan’s contract

If a plan cannot be completed inside these constraints, mark it `SKIPPED` in its implementation log rather than widening scope.

## 6. 已知风险 / 潜在回归

- `02c` and `02a` both change `index.html`, `GameApp`, and `GameStateOverlay`; menu/start tests will be brittle if the sequence is violated.
- `02a` changes the meaning of `Start Colony`: existing behavior may implicitly rely on `New Map` being the only place that applies width/height. This needs tight regression coverage.
- `01b` rewrites active-play message hierarchy across `HUDController`, `nextActionAdvisor`, `autopilotStatus`, and `BuildAdvisor`; text overflow and stale tests are likely.
- `01b` must not over-claim causality. If build preview says a warehouse/farm/road will fix a route or shortage, the underlying preview logic has to support that claim.
- Round 4 is declared “more structural” in `PROCESS.md`, so benchmark regression cannot be hand-waved as a UI-only round.

## 7. 下一步

把 `summary.md` 交给 Coder Implementer，按 Wave 1 -> Wave 2 -> Wave 3 串行执行 `02c`, `02a`, `01b`。
