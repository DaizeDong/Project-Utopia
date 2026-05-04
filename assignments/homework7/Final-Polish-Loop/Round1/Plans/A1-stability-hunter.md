---
reviewer_id: A1-stability-hunter
reviewer_tier: A
feedback_source: Round1/Feedbacks/A1-stability-hunter.md
round: 1
date: 2026-05-01
build_commit: 1f6ecc6
priority: P2
track: docs
freeze_policy: hard
estimated_scope:
  files_touched: 1
  loc_delta: ~15
  new_tests: 0
  wall_clock: 5
conflicts_with: []
rollback_anchor: 1f6ecc6
---

## 1. 核心问题

A1 reviewer 给出 **GREEN / 9-of-10 / 0 P0 / 0 P1 / 0 P2**，5 个 session、累计 ~30 分钟覆盖默认对局、UI 宏量切换、6 模板 reroll、长程快进 (~6:24 in-game)、resize/blur/zoom stress —— 全部 0 console.error / 0 unhandledrejection / 0 崩溃，heap 不增反降（96 MB → 86 MB → 64 MB）。**没有需要修复的代码缺陷**，唯一可记录的事项是把这次稳定性绿条留档供 Post-Mortem 引用。

## 2. Suggestions（可行方向）

### 方向 A: 文档化 GREEN streak，build 不动
- 思路：在 Post-Mortem / CHANGELOG unreleased 段落记录 A1 R1 GREEN 30-min 多场景验证结果 + heap 走势，作为 v0.10.1 稳定性基线证据。
- 涉及文件：`assignments/homework7/Final-Polish-Loop/Round1/Plans/A1-stability-hunter.md`（本文件即记录），可选 `CHANGELOG.md` unreleased section（由后续 Implementer 评估是否同步）。
- scope：小
- 预期收益：把 A1 视角的稳定性结论锚定到回滚 anchor `1f6ecc6`，后续 round 可直接对比是否退化。
- 主要风险：无（纯只读记录，零代码改动）。
- freeze 检查：OK（不新增 tile / building / role / mechanic / audio / UI panel）

### 方向 B: 加一条稳定性 invariant lock-test
- 思路：在 `test/` 下新增 lock-test，断言 game-loop 启动后 N 秒内 `console.error` / `unhandledrejection` 计数为 0、HUD 文本无 `NaN`、heap snapshot 不 monotonic 增长，把 A1 手测的 5 个 session 中 S1+S5 的 invariant 转成 CI 可重放断言。
- 涉及文件：`test/stability-invariants.test.js`（新增）；可能需要 headless harness 改造。
- scope：中
- 预期收益：未来 reviewer 不必重复手测 30 分钟即可拿到 A1 维度的快速回归信号。
- 主要风险：headless / Node `--test` 不直接驱动 Three.js 渲染管线；新增 harness 可能涉及 jsdom / playwright 依赖，超出 docs-defer 范畴；A1 已 GREEN 的情况下 ROI 偏低，且可能引入 flaky 信号。
- freeze 检查：OK（仅新增测试，不新增 mechanic / asset）

## 3. 选定方案

选 **方向 A**，理由：

1. A1 reviewer verdict = GREEN, score = 9/10, **0 P0 / 0 P1 / 0 P2** —— 没有任何 actionable defect，code track 在此 round 缺乏修复目标。
2. HW7 Round 1 deadline ~10 min，方向 B 涉及新建 harness + 测试基础设施，wall-clock 预算不允许。
3. freeze_policy = hard，方向 A 是纯 docs-defer，零回归面，符合"GREEN 时优先记录、不动 build"的 Final-Polish-Loop 设计意图。
4. 方向 B 留档为 v0.10.2+ backlog，待 reviewer 在后续 round 出现 stability regression 时再激活。

## 4. Plan 步骤

- [ ] Step 1: `assignments/homework7/Final-Polish-Loop/Round1/Plans/A1-stability-hunter.md` — add — 本 plan 文件本身即记录载体，Implementer 仅需确认本文件已落盘，无需进一步代码 / 文档改动。
- [ ] Step 2: `assignments/homework7/Final-Polish-Loop/Round1/Plans/A1-stability-hunter.md:section-9` — add — 在 Post-Mortem backlog 中保留方向 B（stability invariant lock-test）作为 deferred item，标注触发条件 = "future round 出现 console.error 或 heap monotonic 增长"。
  - depends_on: Step 1

## 5. Risks

- 无代码改动 → 无回归风险。
- 唯一风险：后续 reviewer 若误把本 plan 当成 actionable code-track plan 推进，会浪费 wall-clock —— 通过 frontmatter `track: docs` + `priority: P2` + Suggestion A 标注"build 不动"显式防御。
- 可能影响的现有测试：无（不触碰 `test/`、`src/`）。

## 6. 验证方式

- 新增测试：无（docs-defer）。
- 手动验证：Implementer 仅需 `git status` 确认未对 `src/`、`test/`、`docs/`、`CHANGELOG.md`、`README.md` 产生 diff；本 plan 文件存在于 `Round1/Plans/`。
- FPS 回归：N/A（无运行时改动）。
- benchmark 回归：N/A。
- prod build：N/A（未触碰构建相关文件）。
- A1 维度抽样复测（可选）：`npx vite` → 默认 Temperate Plains autopilot ON 跑 60 秒 → DevTools console 0 error / 0 unhandledrejection 即可视为 GREEN streak 延续。

## 7. 回滚锚点

- 当前 HEAD: `1f6ecc6`
- 一键回滚：`git reset --hard 1f6ecc6`（仅当 Implementer 失败时由 orchestrator 触发；本 plan 为 no-op 性质，回滚通常无必要）。

## 8. UNREPRODUCIBLE 标记

不适用 —— A1 reviewer 报告 GREEN，无问题需要复现。

## 9. Deferred Backlog

- **stability-invariants lock-test**（方向 B）：待 future round 出现 console.error / unhandledrejection / heap monotonic 增长 / HUD `NaN` 任一信号时激活；建议 harness 选型先评估 Playwright MCP 录制 → Node `--test` 重放，避免 jsdom 不支持 WebGL 的坑。
- **save/load 持久化路径覆盖**：A1 自评扣 1 分的原因（30 分钟未覆盖跨刷新会话恢复）；归属 future round 或 dedicated reviewer。
