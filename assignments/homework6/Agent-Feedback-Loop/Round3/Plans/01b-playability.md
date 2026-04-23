---
reviewer_id: 01b-playability
feedback_source: Round3/Feedbacks/01b-playability.md
round: 3
date: 2026-04-23
build_commit: 53da600
priority: P0
estimated_scope:
  files_touched: 2
  loc_delta: ~110
  new_tests: 1
  wall_clock: 30m
conflicts_with: [01c-ui, 02e-indie-critic]
---

## 1. 核心问题

- Player actions change the world, but the short-term consequence is not explicit enough to support strategy.
- Build preview already has cost/effects, but it does not consistently expose logistics ROI.

## 2. Suggestions

### 方向 A: Build Consequence Preview
- 思路：extend existing build preview with depot distance, route/depot/choke relevance, and coverage warnings.
- 涉及文件：`src/simulation/construction/BuildAdvisor.js`, tests
- scope：小
- 预期收益：lets players predict what a placement fixes before spending resources.
- 主要风险：preview wording may become too long.

### 方向 B: Post-Build Outcome Toasts
- 思路：after each build, emit a stronger cause/effect toast.
- 涉及文件：`GameApp`, `SceneRenderer`, HUD
- scope：中
- 预期收益：confirms decisions after the fact.
- 主要风险：still reactive, not predictive.

## 3. 选定方案

选择 **方向 A**。It changes decision quality before placement and reuses existing preview plumbing.

## 4. Plan 步骤

- [ ] Step 1: `src/simulation/construction/BuildAdvisor.js:evaluateBuildPreview` — edit — add distance-to-warehouse and coverage effects/warnings for producer and warehouse tools.
- [ ] Step 2: `src/simulation/construction/BuildAdvisor.js:summarizeBuildPreview` — edit — keep summary under one line by prioritizing first logistics effect plus one warning.
- [ ] Step 3: `test/build-consequence-preview.test.js` — add — assert producer previews mention haul/depot distance and isolated placements warn before build.

## 5. Risks

- Longer preview text could overflow BuildToolbar.
- Existing voice consistency tests may need updated expected strings.

## 6. 验证方式

- 新增测试：`test/build-consequence-preview.test.js`
- 手动验证：hover road/farm/warehouse sites and confirm preview gives a reason, not only a cost.
- benchmark 回归：not expected to alter sim state.
