---
reviewer_id: A2-performance-auditor
reviewer_tier: A
feedback_source: Round3/Feedbacks/A2-performance-auditor.md
round: 3
date: 2026-05-01
build_commit: 0344a4b
priority: P2
track: docs
freeze_policy: hard
estimated_scope:
  files_touched: 2
  loc_delta: ~+45 / -0
  new_tests: 0
  wall_clock: 25
conflicts_with: []
rollback_anchor: 0344a4b
---

## 1. 核心问题

1. **Playwright headless RAF 1Hz 节流是测量管道问题，不是产品问题** —— A2 自己用 `__perftrace.topSystems` 给出了 ground-truth：avg sim cost <2ms / peak <6ms / 30 min 内存增长 11.52% 全部 PASS。verdict YELLOW 是因为 spec 硬性条款 "p50 < target → YELLOW" 字面命中，但根因在测量环境而非代码。
2. **R4 reviewer 没有可操作的修复指令** —— A2 明确给出 orchestrator 应加的 Chromium flags (`--disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows`)，但这是 Reviewer/Orchestrator 流程级别动作，不是代码改动。track 走 docs。

## 2. Suggestions（可行方向）

### 方向 A: PROCESS-LOG 加 R3 perf-methodology note + Validator note + 后续 round 必读条款

- 思路：在 `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` 末尾追加 R3 closeout 子节，记录 (a) Playwright RAF throttle 的现象、(b) 推荐的三个 Chromium flag、(c) `__perftrace` 是 ground-truth 的判定规则，作为 R4+ Reviewer 的 onboarding 指引。
- 涉及文件：`assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` 追加 ~30 LOC；`assignments/homework7/Post-Mortem.md` §4.5 加一句 cross-ref；可选 `CHANGELOG.md` `[Unreleased]` 块 R3 docs 子节加一行。
- scope：小
- 预期收益：未来 round 的 perf reviewer 不会再误判 RED；orchestrator 启动 Playwright 时有显式提醒。
- 主要风险：仅文档；几乎无。
- freeze 检查：OK（无任何代码 / mechanic 改动）

### 方向 B: 在 vite dev / preview 启动 wrapper 加 npm script 注入 Chromium flags

- 思路：写一个 `scripts/qa-launch.sh` 启动带 Playwright + 三个 flag 的 Chromium，绕开 throttle。
- 涉及文件：`scripts/qa-launch.sh` (新建)，`package.json` (加 npm script)
- scope：中
- 预期收益：Reviewer 跑 `npm run qa:launch` 一键得到正确测量。
- 主要风险：触及代码 / 工程层；与 P2 docs track 不匹配；本轮 freeze conservatism 倾向 docs-only 修复。
- freeze 检查：OK 但越界 P2 优先级（应留给后续轮次实现）。

### 方向 C: 更新 PROCESS.md 给 reviewer 注入新 Runtime Context flag 字段

- 思路：在 PROCESS.md 中要求 Reviewer 启动 Playwright 时显式列出使用的 Chrome flags，便于复盘是否带 throttle。
- 涉及文件：`assignments/homework7/Final-Polish-Loop/PROCESS.md`
- scope：小
- 预期收益：从流程层杜绝 ambiguity。
- 主要风险：与方向 A 一定程度重叠；但更轻。
- freeze 检查：OK

## 3. 选定方案

选 **方向 A**（同时合并方向 C 的 PROCESS.md 一行注解）。理由：(a) feedback verdict 是 YELLOW 不是 RED，P2 docs track 与 freeze conservatism 一致；(b) 方向 B 越界 P2 优先级（属于工程改造）；(c) PROCESS-LOG R3 closeout note 是当前 process discipline 的标准做法，与 R0/R1/R2 的 closeout 子节一致。

## 4. Plan 步骤

- [ ] Step 1: `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` (末尾) — add — 追加 `### R3 Closeout — Perf Methodology Note (A2)` 子节 ~25 LOC：(a) 现象描述（RAF throttle 1Hz / dt≈1004ms / 全场景 fps≈0.996）；(b) ground-truth 路径（`__perftrace.topSystems` avg <2ms / peak <6ms / 30min mem +11.52%）；(c) 推荐 Chromium flags 三条；(d) 给 R4+ Reviewer 的明确指令："perf measurement must run with `--disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows` flags or cite `__perftrace` as ground-truth".
- [ ] Step 2: `assignments/homework7/Post-Mortem.md` §4.5 (Hard-Freeze Deferrals 段) — edit — 追加 1 行 cross-ref：`> [R3 perf measurement note: see PROCESS-LOG R3 Closeout — Playwright RAF 1Hz throttle is environment, not product.]`
  - depends_on: Step 1
- [ ] Step 3: `assignments/homework7/Final-Polish-Loop/PROCESS.md` (Runtime Context 章节) — edit — 在 Runtime Context block 追加一行 `playwright_chrome_flags: <if-perf-test, list flags>`，让 Reviewer 自查使用了什么启动参数。
  - depends_on: Step 1
- [ ] Step 4: `CHANGELOG.md` `[Unreleased]` 块 — edit — 在 `### Docs (HW7 Round 2 → Round 3 — sustained stable)` 子节（若不存在则新建）追加一条：`- A2 R3 perf YELLOW: documented Playwright headless RAF 1Hz throttle as measurement-pipeline issue (not product); see PROCESS-LOG R3 Closeout for required Chromium flags.`
  - depends_on: Step 1

## 5. Risks

- 纯 docs；无运行时 / 测试影响。
- 唯一风险：未来 R4 orchestrator 不读 PROCESS-LOG 仍走 throttle 默认。Mitigation：PROCESS.md Runtime Context 字段强制提示。
- 可能影响的现有测试：无。

## 6. 验证方式

- 新增测试：无（docs track）。
- 手动验证：`grep "R3 Closeout" assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` → 期望 1+ hit；`grep "disable-renderer-backgrounding" assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` → 1+ hit。
- FPS 回归：N/A。
- benchmark 回归：N/A。
- prod build：N/A（仅 markdown 改动）。

## 7. 回滚锚点

- 当前 HEAD: `0344a4b`
- 一键回滚：`git reset --hard 0344a4b`

## 8. UNREPRODUCIBLE 标记（如适用）

不适用 — A2 已在自己的 feedback 中通过 `__perftrace` ground-truth 路径自证现象，无需复现。
