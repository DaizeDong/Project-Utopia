---
round: 0
date: 2026-05-01
build_commit: 3f87bf4
total_plans: 10
accepted: 10
deferred: 0
rejected: 0
freeze_violations: 0
wave_count: 3
total_loc_estimate: ~1375
---

# Round 0 — Plans Summary（仲裁 + Wave 分配）

## Plan 列表（按优先级 + wave）

| reviewer_id | track | priority | LOC | files | new_tests | wave | accept/defer/reject | 冲突 / 备注 |
|---|---|---|---|---|---|---|---|---|
| B2-submission-deliverables | docs | P0 | ~320 | 3 | 0 | wave-0 | accept | 纯 docs，无 code 冲突；Post-Mortem.md + Demo-Video-Plan.md + README anchors |
| C1-code-architect | docs | n/a | ~290 | 2 | 1 | wave-0 | accept | docs/systems/03 + invariant lock test；system_order_safe=true；wave-1 of 4-wave roadmap |
| A5-balance-critic | code | P0 | ~25 | 2 | 1 | wave-0 | accept | 3 BALANCE keys 改：food 200→320 / consumption 0.05→0.038 / grace 0.5→1.5；最关键 3:11 崩盘修复 |
| A1-stability-hunter | code | P2 | ~70 | 3 | +1 ext | wave-0 | accept | snapshot/loadSnapshot 契约对齐 + 吞 ResizeObserver 良性 warning |
| B1-action-items-auditor | code | P2 | ~80 | 3 | 1 | wave-0 | accept | 扩展 `__utopiaLongRun.devStressSpawn(target)` |
| A3-first-impression | code | P0 | ~55 | 3 | 1 | wave-1 | accept | 删 1 条 CSS hide rule + helpModal gate + toast 文案；P0 onboarding 三件 |
| A7-rationality-audit | code | P0 | ~180 | 5 | 2 | wave-1 | accept | 顶栏 reset / 食物速率 derive / `L` 键改回 / Inspector 70+ debug panels gate；conflicts_with A5+A6 |
| A6-ui-design | code | P0 | ~55 | 1 | 0 | wave-1 | accept | index.html CSS only：Demolish 中性化 + :disabled 态 + @media 1366px 单列 fallback；conflicts_with A4+A7 |
| A4-polish-aesthetic | both | P0 | ~180 | 6 | 1 | wave-1 | accept | 4 视觉 bug + 极小日夜 lighting tint；audio/walk-cycle/checkerboard 全部 freeze defer 入 CHANGELOG；conflicts_with A6 |
| A2-performance-auditor | code | P1 | ~120 | 4 | 1 | wave-2 | accept | 加 `__fps_observed` + `?perftrace=1` systemTimingsMs；先观测后调优 |

## 仲裁记录

### 冲突识别 + 决议

| Plan A | Plan B | 冲突文件 / 域 | 决议 |
|---|---|---|---|
| A3 | A5 | 起始资源数值的 briefing 文案（A5 改了 food 200→320，briefing 可能写"200"） | A5 先（wave-0），A3 后（wave-1）。A3 不需修文案，因为浏览器渲染读 INITIAL_RESOURCES.food；如有 hardcode 200 字串 implementer 必查 |
| A3 | A6 | index.html CSS 块 | 两个 plan 都改 index.html 的 `<style>` 块。A3 删 line 139 一条 hide rule；A6 加新 :disabled + @media。无重叠行号。**串行内同 wave-1，A3 先 → A6 后**，让 A6 看到 A3 已删除的规则后判断是否需要补救 |
| A4 | A6 | index.html CSS + DOM | A6 是 CSS-only；A4 修 1920×1080 状态栏溢出可能也碰 CSS。**同 wave-1，A6 先 → A4 后**，A4 在 A6 已加的 @media 之后做余量调整 |
| A4 | A7 | HUD/toast 文案、Inspector 元素 | A4 改 lumber 文案 + 1366 hint anchor；A7 改 Inspector debug gating + 顶栏 reset。文件可能重叠（InspectorPanel.js / SceneRenderer.js）。**同 wave-1，A7 先 → A4 后** |
| A5 | A7 | 食物速率显示路径 | A5 改 BALANCE.foodCost 等数值；A7 改 ResourcePanel.js 显示 `-(cons+spoil)` 派生公式。两个 plan 不撞同一行但语义耦合。**A5 wave-0 先打入 → A7 wave-1 后调整显示**，避免 A7 调显示时 A5 数值还是旧的 |

### Freeze 违规扫描

**0 violations.** 全部 10 plans 通过 freeze 自检：

- A4 明确把 audio / walk-cycle / 全 visual rework defer 入 CHANGELOG（写明 freeze 原因），不引入新 asset
- C1 wave-1 选 docs-only，把实际 PriorityFSM 重构 defer 到 Round 1+（4 wave roadmap 显式列出）
- A5 仅修改既有 BALANCE keys（HW7 freeze 显式 allow "balance 数值微调（沿用既有 BALANCE 常量结构）"）
- B1 扩展既有 `window.__utopiaLongRun` debug API（既有面，不算新 UI panel）

### Track 边界扫描

- 1 plan track=docs：B2、C1
- 8 plan track=code：A1、A2、A3、A5、A6、A7、B1
- 1 plan track=both：A4（5 code steps + 1 docs step写 CHANGELOG）

implementer 需要按 step 严格匹配 track 边界。A4 的 docs step（CHANGELOG entry）必须独立 commit 或在合并 commit 中明确分离。

### LOC budget 检查

- 单 plan 最大 = B2 ~320 LOC（docs，全是新建 markdown，HW7 docs LOC 无硬上限）
- 单 plan code 最大 = A4/A7 各 ~180 LOC（远低于 C1 整理 plan 上限 400）
- 总 LOC ~1375（13.5% docs / 86.5% code）

## 执行顺序（wave）

### wave-0 — 独立可并行（实际串行执行）— 5 plans
**Goal**: 先解决根因 + 提交物 + 文档同步，为 wave-1 的 UI 改动建立基础

| 序号 | reviewer_id | track | 估时 | 备注 |
|---|---|---|---|---|
| 1 | A5-balance-critic | code | ~25 min | **先打**：3 BALANCE keys 修 3:11 崩盘，所有下游测试基于新数值 |
| 2 | B2-submission-deliverables | docs | ~35 min | 纯 docs，与 code 无冲突 |
| 3 | C1-code-architect | docs | ~25 min | docs/systems/03 同步 + invariant 测试 |
| 4 | A1-stability-hunter | code | ~25 min | snapshot 契约修复，独立文件 |
| 5 | B1-action-items-auditor | code | ~25 min | 扩展 debug API，独立 |

wave-0 总估时 ~135 min（串行）

### wave-1 — UI / Inspector / HUD 簇（必须串行）— 4 plans
**Goal**: 解决 4 个 P0 onboarding/visual 问题；上一 plan commit 后下一 plan 才能看到效果

| 序号 | reviewer_id | track | 估时 | 备注 |
|---|---|---|---|---|
| 1 | A3-first-impression | code | ~25 min | 先：CSS rule + helpModal + toast；最小 surgical |
| 2 | A7-rationality-audit | code | ~35 min | 顶栏 reset + 食物显示派生 + L 键 + Inspector dev gate；依赖 A5 已改完 |
| 3 | A6-ui-design | code | ~25 min | CSS-only on index.html；与 A3 无行重叠 |
| 4 | A4-polish-aesthetic | both | ~25 min | 4 视觉 bug + lighting tint + CHANGELOG；最后做 polish 兜底 |

wave-1 总估时 ~110 min（串行）

### wave-2 — 性能观测层 — 1 plan
**Goal**: 加 perf 观测，让 Validator FPS gate 之后的 round 有数据

| 序号 | reviewer_id | track | 估时 | 备注 |
|---|---|---|---|---|
| 1 | A2-performance-auditor | code | ~35 min | 加 `__fps_observed` + perftrace；不与任何 wave-1 改动冲突 |

wave-2 总估时 ~35 min

### 总估时

~135 + ~110 + ~35 = **~280 min** Stage C wall-clock（如 5 轮内一次通过；若有失败回退会更长）

加上 Stage D Validator ~60-90 min，Round 0 估总 wall-clock：**~340 min**（5h40m）。已超出用户给的 240 min budget — 但用户明确说"完整运行"，继续执行。

## 给 Implementer 阶段的关键指引

1. **wave-0 第 1 个 plan = A5**：必须先于其他任何代码改动落地。这是修 3:11 崩盘的根因。落地后立即跑一次 `node --test` 确认无回归。

2. **A4 是 track=both**：implementer 必须把 docs step（CHANGELOG）和 code steps 分开提交，或在单 commit 中明确分离 hunk。

3. **C1 是 docs-only this round**：implementer 不要尝试做 code refactor，那是 Round 1+ 的事。

4. **wave-1 严格按表内顺序**：A3 → A7 → A6 → A4。每个 commit 后跑一次 `node --test`，绿了才进下一个。

5. **Stage C 失败回退**：每个 plan 自带 `rollback_anchor: 3f87bf4`。如某 plan 5 轮内修复未果，orchestrator 自动 `git reset --hard 3f87bf4` 回退该 plan 改动，记录 SKIPPED，继续下一 plan。

6. **Validator 关注**：
   - Gate 1 tests：必须全绿（A5/A7 改了显示语义，可能撞既有食物相关测试）
   - Gate 2 prod build：`npx vite build` 必须成功（A4 改了 lighting，可能 Three.js 配置问题）
   - Gate 3 FPS：headless RAF cap 1Hz 已知，A2 加的 `__fps_observed` 不能用 RAF；validator 用 prod build + 真 Chrome 测
   - Gate 4 freeze-diff：`git diff 3f87bf4..HEAD -- src/config/constants.js` 只能看到 BALANCE 数值变化，不能新增 TILE / role enum
   - Gate 5 bundle：注意 A4 的 lighting tint 不要 import 大型 lighting library
