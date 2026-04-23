---
reviewer_id: 01c-ui
feedback_source: Round3/Feedbacks/01c-ui.md
round: 3
date: 2026-04-23
build_commit: 53da600
priority: P1
estimated_scope:
  files_touched: 3
  loc_delta: ~90
  new_tests: 1
  wall_clock: 25m
conflicts_with: [01a-onboarding, 01b-playability]
---

## 1. 核心问题

- The UI is legible, but cause/effect is split across too many surfaces.
- The requested fix overlaps heavily with 01a next-action and 01b build consequence preview.

## 2. Suggestions

### 方向 A: Merge Into Next Action Chip
- 思路：use 01a's next-action chip as the UI vehicle for cause/effect.
- 涉及文件：same as 01a
- scope：小
- 预期收益：avoids adding another HUD surface.
- 主要风险：depends on 01a.

### 方向 B: Add Another Cause Digest Row
- 思路：separate action digest under status bar.
- 涉及文件：`index.html`, `HUDController`
- scope：中
- 预期收益：more explicit cause text.
- 主要风险：presentation-only and overcrowded.

## 3. 选定方案

选择 **方向 A**，并在 Stage B 聚合中标记为 D1 SUBSUMED by 01a/01b.

## 4. Plan 步骤

- [ ] Step 1: no standalone code; ensure 01a next-action chip carries `detail` and `reason`.
- [ ] Step 2: no standalone code; ensure 01b preview supplies pre-placement cause text.

## 5. Risks

- If 01a is skipped, the UI still lacks a single current bottleneck.

## 6. 验证方式

- Covered by 01a/01b tests.
