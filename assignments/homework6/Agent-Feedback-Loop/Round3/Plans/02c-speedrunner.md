---
reviewer_id: 02c-speedrunner
feedback_source: Round3/Feedbacks/02c-speedrunner.md
round: 3
date: 2026-04-23
build_commit: 53da600
priority: P0
estimated_scope:
  files_touched: 3
  loc_delta: ~70
  new_tests: 1
  wall_clock: 30m
conflicts_with: []
---

## 1. 核心问题

- Speedrunner path works best, but autopilot/timeScale UI must be a trustworthy truth source.
- If the checkbox, HUD chip, and actual state disagree, high-speed control becomes unreliable.

## 2. Suggestions

### 方向 A: Autopilot/Speed Truth Contract
- 思路：centralize visible autopilot/timeScale label text from current state and include mode/coverage target.
- 涉及文件：`src/ui/hud/autopilotStatus.js`, `src/ui/hud/HUDController.js`, tests
- scope：小
- 预期收益：reduces high-speed decision ambiguity.
- 主要风险：copy churn in tests.

### 方向 B: New Speedrunner Overlay
- 思路：dedicated optimization panel.
- scope：中
- 主要风险：adds UI surface without changing systems.

## 3. 选定方案

选择 **方向 A**。

## 4. Plan 步骤

- [ ] Step 1: `src/ui/hud/autopilotStatus.js` — add — export `getAutopilotStatus(state)` returning text/mode/title from `state.ai.enabled`, `state.ai.mode`, `coverageTarget`, and remaining policy seconds.
- [ ] Step 2: `src/ui/hud/HUDController.js` — edit — use helper for `#aiAutopilotChip`, `#aiToggleTop`, and mirror checkbox sync.
- [ ] Step 3: `test/hud-autopilot-status-contract.test.js` — add — assert helper and HUD render agree for on/off/fallback cases.

## 5. Risks

- Existing autopilot chip tests may assert older text.

## 6. 验证方式

- New helper/HUD test.
- Manual: toggle autopilot at 1x and 4x and confirm chip/checkbox stay consistent.
