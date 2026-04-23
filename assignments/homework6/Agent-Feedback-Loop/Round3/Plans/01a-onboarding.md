---
reviewer_id: 01a-onboarding
feedback_source: Round3/Feedbacks/01a-onboarding.md
round: 3
date: 2026-04-23
build_commit: 53da600
priority: P0
estimated_scope:
  files_touched: 4
  loc_delta: ~180
  new_tests: 2
  wall_clock: 45m
conflicts_with: [01c-ui, 02b-casual]
---

## 1. 核心问题

- New players now receive more explanation, but the first actionable loop is still missing: do this tile-level action, confirm it worked, then advance.
- Scenario goals are visible as counts, but the UI does not choose one current bottleneck for the player.

## 2. Suggestions

### 方向 A: Current Next Action Contract
- 思路：derive one current action from existing scenario runtime/logistics state and render it as a persistent HUD contract.
- 涉及文件：`src/ui/hud/nextActionAdvisor.js`, `src/ui/hud/HUDController.js`, `index.html`
- scope：中
- 预期收益：turns scenario text into a concrete next step.
- 主要风险：another HUD chip could crowd the status bar.

### 方向 B: Pause-First Help Flow
- 思路：pause simulation while Help is open and show scenario-specific first steps.
- 涉及文件：`src/ui/help/*`, `GameApp`
- scope：中
- 预期收益：less pressure during reading.
- 主要风险：mostly onboarding polish; does not change long-run loop.

## 3. 选定方案

选择 **方向 A**。It directly addresses the structural failure path without adding a tutorial level or new content.

## 4. Plan 步骤

- [ ] Step 1: `src/ui/hud/nextActionAdvisor.js` — add — export `getNextActionAdvice(state)` returning `{priority,label,detail,tool,target,reason}` from existing scenario runtime, resources, and logistics metrics.
- [ ] Step 2: `src/ui/hud/HUDController.js:constructor/render` — edit — read `#statusNextAction`, render the next-action label/detail, and set `data-priority`.
  - depends_on: Step 1
- [ ] Step 3: `index.html:#statusBar` — edit — add `#statusNextAction` chip and minimal CSS that truncates safely at 1024px.
- [ ] Step 4: `test/next-action-advisor.test.js` — add — cover route gap, depot missing, food crisis, and logistics target fallbacks.
- [ ] Step 5: `test/hud-next-action.test.js` — add — cover DOM render and priority attributes.

## 5. Risks

- Status bar overflow at 1024-1200 px.
- Advice duplication with `statusAction` and storyteller strip.
- 可能影响现有测试：`test/ui-layout.test.js`, `test/hud-controller.test.js`, `test/responsive-status-bar.test.js`.

## 6. 验证方式

- 新增测试：`test/next-action-advisor.test.js`, `test/hud-next-action.test.js`
- 手动验证：start game, observe one next-action chip, build/advance a route or depot, confirm advice changes.
- benchmark 回归：no expected DevIndex drop; this is a control-surface change.
