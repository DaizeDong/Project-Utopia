---
round: 3
date: 2026-04-23
plans_total: 10
plans_accepted: 4
plans_deferred: 6
waves: 2
---

# Round 3 Stage B Plans Summary

## 1. Plans 一览

| plan | priority | decision | scope(loc) | files_touched | focus |
|---|---:|---|---:|---:|---|
| 01a-onboarding | P0 | ACCEPT | ~180 | 4 | Current next-action contract from existing runtime state |
| 01b-playability | P0 | ACCEPT | ~110 | 2 | Pre-build consequence / logistics ROI preview |
| 01c-ui | P1 | SUBSUMED | ~0 | 0 | Duplicates 01a/01b UI cause loop |
| 01d-mechanics-content | P0 | ACCEPT | ~80 | 3 | Existing hunger/delivery/carry tuning for recoverability |
| 01e-innovation | P2 | SUBSUMED | ~0 | 0 | Structural novelty is covered by 01a/01b |
| 02a-rimworld-veteran | P1 | SUBSUMED | ~0 | 0 | Veteran mechanics critique maps to 01d |
| 02b-casual | P1 | SUBSUMED | ~0 | 0 | Casual next-step guidance maps to 01a |
| 02c-speedrunner | P0 | ACCEPT | ~70 | 3 | Autopilot/timeScale truth contract |
| 02d-roleplayer | P2 | DEFERRED | ~0 | 0 | Relationship-aware decisions would be new mechanics |
| 02e-indie-critic | P1 | SUBSUMED | ~0 | 0 | Broad product critique maps to accepted P0s |

## 2. 冲突矩阵

- **D1 REDUNDANT: 01c-ui x 01a-onboarding**. Both ask for a current bottleneck / cause loop in HUD. Keep 01a because it defines the advisor logic and DOM.
- **D1 REDUNDANT: 02b-casual x 01a-onboarding**. Both ask for casual next-step guidance. Keep 01a and require imperative wording.
- **D1 REDUNDANT: 01e-innovation x 01b-playability**. Innovation request becomes actionable as pre-build consequence preview. Keep 01b.
- **D1 REDUNDANT: 02a-rimworld-veteran x 01d-mechanics-content**. Both target logistics/recovery. Keep 01d because it provides concrete tuning/testing scope.
- **D1 REDUNDANT: 02e-indie-critic x 01a/01b/01d**. Critique is broad; actionable pieces are already represented by accepted P0s.
- **D2 CONFLICT: none among accepted plans**. 01a touches HUD status rendering; 01b touches BuildAdvisor preview; 01d touches balance + worker intent tests; 02c touches autopilot status helper/HUD.
- **D3 SEQUENCE: 01a before 02c** only in `HUDController.js` merge order. 01a adds a new status chip; 02c then changes autopilot chip rendering in the same file.
- **D5 OUT-OF-SCOPE: 02d-roleplayer**. Full request implies relationship/memory changing assignments, which is a new character/mood/relationship mechanic under HW06 freeze. Defer.

## 3. Wave 调度

### Wave 1（simulation / consequence foundation）

- **01d-mechanics-content**: tune existing hunger/delivery/carry thresholds and validate benchmark does not regress.
- **01b-playability**: strengthen existing build preview with logistics consequence text.

### Wave 2（HUD control contracts）

- **01a-onboarding**: add current next-action advisor and status chip.
- **02c-speedrunner**: centralize autopilot status text and mirror all visible autopilot controls from one helper.

## 4. DEFERRED plans

| plan | 原因 | next reviewer handling |
|---|---|---|
| 01c-ui | D1 subsumed by 01a/01b | Re-review whether accepted chips/previews actually reduce cause ambiguity. |
| 01e-innovation | D1 subsumed by 01a/01b | Re-review whether structural guidance feels meaningfully novel. |
| 02a-rimworld-veteran | D1 subsumed by 01d | Re-review whether tuning makes logistics recovery feel strategic. |
| 02b-casual | D1 subsumed by 01a | Re-review first 3 minutes and whether next step is obvious. |
| 02d-roleplayer | D5 new relationship/assignment mechanic | Revisit only after feature freeze allows character mechanics. |
| 02e-indie-critic | D1 subsumed by accepted P0s | Re-review whether game feels less like a benchmark after structural fixes. |

## 5. Implementer 输入契约

Wave order is strict: Wave 1 must pass targeted tests before Wave 2.

Accepted plan paths:

- `assignments/homework6/Agent-Feedback-Loop/Round3/Plans/01d-mechanics-content.md`
- `assignments/homework6/Agent-Feedback-Loop/Round3/Plans/01b-playability.md`
- `assignments/homework6/Agent-Feedback-Loop/Round3/Plans/01a-onboarding.md`
- `assignments/homework6/Agent-Feedback-Loop/Round3/Plans/02c-speedrunner.md`

Commit scopes:

- 01d: `src/config/balance.js`, `test/worker-intent-stability.test.js`, `test/worker-intent.test.js`
- 01b: `src/simulation/construction/BuildAdvisor.js`, `test/build-consequence-preview.test.js`
- 01a: `src/ui/hud/nextActionAdvisor.js`, `src/ui/hud/HUDController.js`, `index.html`, `test/next-action-advisor.test.js`, `test/hud-next-action.test.js`
- 02c: `src/ui/hud/autopilotStatus.js`, `src/ui/hud/HUDController.js`, `test/hud-autopilot-status-contract.test.js`

Forbidden in Round 3:

- no new buildings, tools, tiles, score formulas, win conditions, tutorial levels, audio/assets, mood/grief/relationship mechanics, or new simulation systems;
- no changes to `BUILDING_TYPES`, `TILE`, or `SYSTEM_ORDER`;
- keep `window.__utopiaLongRun` public.

## 6. 已知风险

- 01d may improve survival but reduce production if workers deliver too frequently.
- 01a/02c both touch `HUDController.js`; sequence must be respected.
- Additional status chip may stress 1024-1200 px layout.
- Build preview text may get too long for the right toolbar.
- Benchmark is mandatory because Round3 explicitly targets structural improvement.

## 7. 下一步

Execute Wave 1: 01d, then 01b. Run targeted tests and a soft 90-day benchmark before Wave 2.
