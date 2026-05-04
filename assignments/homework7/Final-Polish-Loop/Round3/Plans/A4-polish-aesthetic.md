---
reviewer_id: A4-polish-aesthetic
reviewer_tier: A
feedback_source: Round3/Feedbacks/A4-polish-aesthetic.md
round: 3
date: 2026-05-01
build_commit: 0344a4b
priority: P2
track: docs
freeze_policy: hard
estimated_scope:
  files_touched: 2
  loc_delta: ~+35 / -0
  new_tests: 0
  wall_clock: 25
conflicts_with: []
rollback_anchor: 0344a4b
---

## 1. 核心问题

1. **R2→R3 视觉打磨从 RED → YELLOW** — A4 自评 score 4/10（v1=4, v2=5, v3=1, v4=3）；R1 已落 lighting 增强（CLAUDE.md 提到 "lighting amplify already done R1"）。当前剩余三大缺口：audio 完全缺失（v3=1）、4 种艺术风格混用（v2=5）、动效与微交互不足（v4=3）。
2. **三大缺口都在 hard-freeze 红线后** — 增 audio bus / SFX / day-night directional shadow / motion / DPI 整改 均已被 §4.5 Hard-Freeze Deferrals 显式 deferred 到 post-MVP 工时（≈5 工周 vs HW7 budget <1 周）。
3. **本轮 R3 不应触碰代码** — 应在 Post-Mortem §4.5 加 R3 progress note 明确"上一轮 R1 灯光放大 → 本轮 R3 RED→YELLOW + 仍 deferred"，而不是再做新代码。

## 2. Suggestions（可行方向）

### 方向 A: Post-Mortem §4.5 加 R3 progress note；CHANGELOG 加 docs 子节

- 思路：在 `assignments/homework7/Post-Mortem.md` §4.5 段（line 143-230）后追加 ≤30 LOC R3 子节，记录 (a) R2→R3 verdict 转变 (RED→YELLOW)，(b) v1=4/v2=5/v3=1/v4=3 当前评分对照 R2 baseline，(c) 重申 4 项 deferred items 仍 deferred 不修，(d) 列 "good v1 spec" 在 R4 之后的工时窗口。
- 涉及文件：`assignments/homework7/Post-Mortem.md`、`CHANGELOG.md`
- scope：小
- 预期收益：R3 closeout 文档完整；与 §4.5 anti-LLM-polish posture 一致。
- 主要风险：仅 docs，无。
- freeze 检查：OK

### 方向 B: 在代码里加 1 条 ambient audio loop（最低限度证明 audio pipeline）

- 思路：A4 改进建议 "至少 1 条 ambient" — 但这要求新建 AudioBus + audio resource pipeline + Settings → Audio toggle。
- 涉及文件：可能 4-6 个新文件
- scope：大
- 预期收益：v3 从 1 → 4。
- 主要风险：**FREEZE-VIOLATION** — hard freeze 禁止新 audio asset / 新 mood/UI panel；§4.5 已显式 deferred。不选定。
- freeze 检查：**FREEZE-VIOLATION**

### 方向 C: 加 directional shadow + sunset color shift (P1 v1 改进建议)

- 思路：在 SceneRenderer 加 light-direction uniform + sky color LUT。
- 涉及文件：SceneRenderer.js + 新 shader uniforms
- scope：中
- 预期收益：v1 从 4 → 6。
- 主要风险：触碰核心 render loop；§4.5 已 deferred；本轮 P2 不应做。
- freeze 检查：边缘越界（属于"显著代码改造"非"hard freeze 直接禁"，但 §4.5 已 deferred 留给 post-MVP）；不选定。

## 3. 选定方案

选 **方向 A**。理由：(a) feedback verdict YELLOW 不是 RED，P2 优先级；(b) R1 已落灯光放大，再次代码改造不符合 freeze conservatism；(c) §4.5 显式 deferred 这类工作；(d) R3 应是稳态文档化 round 而非新工程 round（与 B2 reviewer 强调的 "稳态 not regression" 一致）。

## 4. Plan 步骤

- [ ] Step 1: `assignments/homework7/Post-Mortem.md` §4.5 (line 143-230 子节末尾) — add — 追加 `### R3 Progress Note (2026-05-01)` 子节 ~25 LOC，含：(a) verdict 轨迹 R0→R1→R2→R3 (R3 YELLOW score 4/10)；(b) sub-axis 对比 v1=4 / v2=5 / v3=1 / v4=3；(c) R1 灯光放大已落，R3 不再加码；(d) 4 项 deferred (audio/lighting/motion/DPI) 仍 deferred 不修；(e) "good v1" 工时再次确认 ≈5 工周。
- [ ] Step 2: `CHANGELOG.md` `[Unreleased]` 块 → `### Docs (HW7 Round 2 → Round 3 — sustained stable)` 子节（若不存在则新建） — edit — 追加 `- A4 R3 polish-aesthetic YELLOW (RED→YELLOW since R2): visual polish 4/10; v3 audio still deferred per §4.5 (~5 work-weeks > HW7 budget); see Post-Mortem §4.5 R3 Progress Note.`
  - depends_on: Step 1

## 5. Risks

- 纯 docs；无运行时 / 测试 / FPS 影响。
- 唯一风险：未来 author 写 §5 AI Tool Evaluation 时可能误把这次 R3 progress note 当 commit-able insight；mitigation：note 内显式标 "documentation-only, no code change".
- 可能影响的现有测试：无。

## 6. 验证方式

- 新增测试：无（docs track）。
- 手动验证：`grep "R3 Progress Note" assignments/homework7/Post-Mortem.md` → 1+ hit；CHANGELOG 子节 grep R3 + A4 → 1+ hit。
- FPS 回归：N/A。
- benchmark 回归：N/A。
- prod build：N/A（仅 markdown 改动）。

## 7. 回滚锚点

- 当前 HEAD: `0344a4b`
- 一键回滚：`git reset --hard 0344a4b`

## 8. UNREPRODUCIBLE 标记（如适用）

不适用 — A4 给的截图证据（A4-game-day-start.jpeg / A4-worker-inspect.jpeg / steam-3-thriving-colony.jpeg 等）已确认现象，本轮无需复现。
