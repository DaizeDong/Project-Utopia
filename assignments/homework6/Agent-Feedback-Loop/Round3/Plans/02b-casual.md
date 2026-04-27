---
reviewer_id: 02b-casual
feedback_source: Round3/Feedbacks/02b-casual.md
round: 3
date: 2026-04-23
build_commit: 53da600
priority: P1
estimated_scope:
  files_touched: 0
  loc_delta: ~0
  new_tests: 0
  wall_clock: 0m
conflicts_with: [01a-onboarding]
---

## 1. 核心问题

- Casual players understand failures better, but still cannot reliably perform the next correct action.
- This is the same structural surface as 01a's next-action contract.

## 2. Suggestions

### 方向 A: Fold Into 01a Next Action Contract
- 思路：ensure the next-action chip uses casual, imperative wording.
- scope：小
- 预期收益：serves casual players without another tutorial layer.
- 主要风险：may not be enough for very new players.

### 方向 B: New Guided Tutorial Overlay
- 思路：step-by-step guided tutorial.
- scope：大
- 主要风险：D5 new tutorial content.

## 3. 选定方案

选择 **方向 A**，Stage B 标记为 D1 SUBSUMED by 01a.

## 4. Plan 步骤

- [ ] Step 1: no standalone code; wording requirement feeds 01a.

## 5. Risks

- If next-action logic is too terse, casual score stays low.

## 6. 验证方式

- Covered by 01a tests.
