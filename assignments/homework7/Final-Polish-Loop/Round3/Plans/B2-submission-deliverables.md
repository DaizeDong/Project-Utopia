---
reviewer_id: B2-submission-deliverables
reviewer_tier: B
feedback_source: Round3/Feedbacks/B2-submission-deliverables.md
round: 3
date: 2026-05-01
build_commit: 0344a4b
priority: P1
track: docs
freeze_policy: hard
estimated_scope:
  files_touched: 2
  loc_delta: ~+30 / -0
  new_tests: 0
  wall_clock: 20
conflicts_with: []
rollback_anchor: 0344a4b
---

## 1. 核心问题

1. **R3 稳态 18/22，4 PENDING 全是作者亲手填** — pillar names / Post-Mortem 内容 / demo video URL / submission format 决定。reviewer 不应越界 LLM-fill（TA HW7 §1.5 anti-LLM-polish 红线）。
2. **CHANGELOG 缺 R3 closeout 子节** — Reviewer P2 #1 直接说 "应在 R3 完成后追加 `### Docs (HW7 Round 2 → Round 3 — sustained stable)` 子节"。
3. **PROCESS-LOG R3 trajectory 未记录** — R0 7/22 → R1 17/22 → R2 18/22 → R3 18/22 累计 +11 平稳期；author-fill 阻断点 4 项；R1 工程修复在 R3 完整保留无回退。

## 2. Suggestions（可行方向）

### 方向 A: PROCESS-LOG R3 trajectory note + CHANGELOG R3 docs 子节（不动 PENDING）

- 思路：
  1. PROCESS-LOG 末尾追加 R3 closeout 子节，记录 22-item 轨迹表 (R0→R3 累计 +11) + 4 PENDING items 的 author-action checklist + R1+R2 工程修复 R3 保留 verification；
  2. CHANGELOG 加 `### Docs (HW7 Round 2 → Round 3 — sustained stable)` 子节，列出 R3 verdict YELLOW score 8/10、checklist 18/22、4 PENDING list。
- 涉及文件：`assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md`、`CHANGELOG.md`
- scope：小
- 预期收益：R3 closeout trail 完整；author 看 PROCESS-LOG 立即得到 4-item to-do；submission 流程 clear。
- 主要风险：仅 docs；无。
- freeze 检查：OK

### 方向 B: LLM-fill PENDING 4 项（FREEZE-VIOLATION + TA red line）

- 思路：直接帮作者填 pillar names + Post-Mortem 内容 + demo video plan finalisation。
- 涉及文件：README + Post-Mortem
- scope：中
- 预期收益：18/22 → 22/22。
- 主要风险：**违反 TA HW7 §1.5 anti-LLM-polish 红线**（reviewer 已警告 "TA will detect"）；不选定。
- freeze 检查：违反 review 元规则 / 不在 hard freeze 范围但等价禁区。

### 方向 C: 不动文件（pure inert R3）

- 思路：保持 R2 18/22。
- 涉及文件：无
- scope：零
- 主要风险：缺 R3 trail；author 看不到 4-item to-do summary；reviewer P2 #1 P2 #2 未关。
- freeze 检查：OK

## 3. 选定方案

选 **方向 A**。理由：(a) reviewer 的 P2 #1 / P2 #2 显式建议 R3 必须加 trail；(b) 4 PENDING 是 author-only 必须保持 status；(c) 方向 B 撞 TA 红线；方向 C 无 trail。

## 4. Plan 步骤

- [ ] Step 1: `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` (末尾) — add — 追加 `### R3 Closeout — Submission Deliverables (B2)` 子节 ~25 LOC，含：(a) 22-item 轨迹表 R0 7/22 → R1 17/22 → R2 18/22 → **R3 18/22**（累计 +11，R3 +0 = sustained-stable）；(b) 4 PENDING items 完整 author-action checklist (pillar names from a2.md / Post-Mortem AUTHOR comments / demo video record + URL backfill / submission format zip-OR-github)；(c) R1+R2 工程修复 R3 verification 表（build-submission.sh exists / npm script wired / dist/ built / placeholders count match design intent）；(d) anti-LLM-polish posture 重申。
- [ ] Step 2: `CHANGELOG.md` `[Unreleased]` 块 — add — 在已存在或新建 `### Docs (HW7 Round 2 → Round 3 — sustained stable)` 子节追加：`- B2 R3 submission-deliverables YELLOW score 8/10 (R2→R3 sustained; checklist 18/22 PASS, 4 PENDING author-fill, 0 FAIL); R1 build-submission.sh + npm submission:zip + R2 placeholder gates all preserved; see PROCESS-LOG R3 Closeout — B2.`
  - depends_on: Step 1

## 5. Risks

- 纯 docs；无运行时 / 测试 / FPS 影响。
- 唯一风险：作者忽略 PROCESS-LOG 4-item checklist；mitigation：build-submission.sh heredoc 已有 3 grep gate 在 stdout 提醒，与 PROCESS-LOG 互补。
- 可能影响的现有测试：无。

## 6. 验证方式

- 新增测试：无（docs track）。
- 手动验证：`grep "R3 Closeout — Submission Deliverables" assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` → 1+ hit；`grep "B2 R3 submission-deliverables" CHANGELOG.md` → 1+ hit；`grep -c "<copy exact pillar name from A2>" README.md` → 仍是 2 (符合 design intent)；`grep "AUTHOR:" assignments/homework7/Post-Mortem.md` → 仍是 4 hits.
- FPS 回归：N/A。
- benchmark 回归：N/A。
- prod build：N/A（仅 markdown）。

## 7. 回滚锚点

- 当前 HEAD: `0344a4b`
- 一键回滚：`git reset --hard 0344a4b`

## 8. UNREPRODUCIBLE 标记（如适用）

不适用 — B2 已通过 grep gate + browser smoke 自证；reviewer trail 完整。
