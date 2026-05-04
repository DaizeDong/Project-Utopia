---
reviewer_id: A6-ui-design
reviewer_tier: A
feedback_source: Round2/Feedbacks/A6-ui-design.md
round: 2
date: 2026-05-01
build_commit: d242719
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 2
  loc_delta: ~85
  new_tests: 1
  wall_clock: 25
conflicts_with: []
rollback_anchor: d242719
---

## 1. 核心问题

1. **响应式断点未闭环 (P0)** — R1 在 `index.html:80-103` 加了 `min-height:32px` 和 `flex-wrap:nowrap; overflow-x:hidden` 试图把 statusBar 钉在单行；但 1366×768 与 1024×768 下顶部 KPI/goal chips 仍被裁切或被 sidebar 推出可视区。1366 段没有专门的媒体查询接管；1024 段虽然把 sidebar 改成底栏，但 R1 的 `right:0 !important` 与 `flex-wrap:wrap` 让 chips 又触发了 toast 重叠（见问题 2）。
2. **Toast 与 statusBar z-order 冲突 (P0)** — `#alertStack` 在 `index.html:639-642` 是 `top:36px; z-index:40; right:44px`，statusBar 是 `z:15; min-height:32px`。1366 下当 statusBar 因 goal-list 换行扩到 ~52px 时，`top:36px` 的 toast 直接覆盖在 chip 数字上方；R1 的 1024 块给了 `top:38px` 但 1366 没改，且未引入 `--hud-height` 联动。
3. **Director Timeline 9 行复读 (P1)** — `src/ui/panels/AIPolicyTimelinePanel.js:48-66` 直接对 `state.ai.policyHistory.slice(0,12)` 逐条 render `formatRow`，没有任何相邻去重；NPCBrainSystem 在 fallback-healthy 重连阶段每次 brain-tick 都 push 同一 entry → 9 条 `fallback-healthy rebuild the broken supply lane fallback`。需要在 render 阶段做相邻折叠（`badgeState + focus + errorKind` 全等且时间戳差 ≤ 80s 视为同一组），输出 `×N last <span>` 计数行。

## 2. Suggestions（可行方向）

### 方向 A: 纯 CSS 媒体查询补齐 1366 断点 + 抬高 alertStack；Timeline 在 render 阶段相邻折叠

- 思路：在 `index.html` 已有的 1024 / 1280 / 1440 媒体查询体系里补一个 `@media (max-width: 1366px) and (min-width: 1025px)` 块，把 `#statusBar` `--hud-height` 提到 56px 容纳 2 行、`#alertStack { top: var(--hud-height) + 8px }`，并把 `right` 推到 sidebar 之外；Timeline 折叠纯 JS render-time，无 state 写入。
- 涉及文件：`index.html`（CSS）、`src/ui/panels/AIPolicyTimelinePanel.js`（render dedupe）、`test/ui/aiPolicyTimelinePanel.dedupe.test.js`（新增）
- scope：小（~85 LOC，无新 mechanic / panel / role / tile）
- 预期收益：P0×2 + P1 一并闭环；视觉表现在 1366/1024 下 chips 完整可见、toast 不再压 KPI 数字；Timeline 9 连击折叠成单行 `×9 fallback-healthy …`，密度立刻回到“仪表盘”级别
- 主要风险：1366 媒体查询里改 `--hud-height` 可能让 `#sidebarPanelArea { padding-top: var(--hud-height) }` 在过渡瞬间出现 +24px 跳变（已存在 transition）；Timeline 折叠如果 entry 缺 `atSec` 字段会落入 NaN 比较 → 需用 `Number.isFinite` 守卫
- freeze 检查：OK（无新 tile / building / role / mood / audio / panel；Timeline 是已有 panel 内部 render 调整）

### 方向 B: 引入 ResizeObserver + JS 动态计算 statusBar 实际渲染高度，把 alertStack `top` 写入 CSS var

- 思路：HUDController 启动时 `new ResizeObserver(([e]) => document.documentElement.style.setProperty('--hud-height', e.contentRect.height + 'px'))` 观察 `#statusBar`；alertStack 用 `top: calc(var(--hud-height) + 8px)`。Timeline 折叠同方向 A。
- 涉及文件：`src/ui/hud/HUDController.js`、`index.html`（CSS）、`src/ui/panels/AIPolicyTimelinePanel.js`、新增测试
- scope：中（~140 LOC + 浏览器 API 边界）
- 预期收益：完全自适应任意 statusBar 高度，未来再加 chip 也不会回归
- 主要风险：ResizeObserver 在 Node test runner 下不存在 → 需 typeof guard；observer 抖动可能导致 1366 临界宽度下 statusBar 1↔2 行震荡（chip 触发 wrap 后 hud-height 增大 → goal-list 重排 → 又恢复 1 行 → 循环），需要 hysteresis 阈值；超出 P0 修复所需复杂度
- freeze 检查：OK

## 3. 选定方案

选 **方向 A**，理由：

- P0 优先级 → 选小 scope / 快速落地（HARD freeze + 30min deadline）
- 媒体查询是 R1 既定模式（已有 1024/1280/1440 三段），1366 段补齐是“同构延伸”而非新机制
- 方向 B 的 ResizeObserver 抖动风险在 1366 临界宽度下会回归 P0，得不偿失
- Timeline 折叠两方向都一致 → 不影响选择

## 4. Plan 步骤

- [ ] **Step 1**: `index.html:1883`（已有的 `@media (max-width: 1366px)` 块） — `edit` — 把现有 1366 hotkey-grid 单列规则保留，同时在该块**追加** `#statusBar { min-height: 56px; }`、`:root { --hud-height: 56px; }`、`#alertStack { top: calc(var(--hud-height) + 8px); right: calc(clamp(280px, 22vw, 460px) + 16px); z-index: 16; }`、`.hud-goal-list { max-width: none; flex-wrap: wrap; }`；目的：让 statusBar 显式容纳 2 行 chip，alertStack 读 `--hud-height` 而非硬编码 36px，避免 toast 压 KPI。

- [ ] **Step 2**: `index.html:1836`（1024 媒体查询里的 `#alertStack` 块） — `edit` — 把 `top: 38px` 改成 `top: calc(var(--hud-height) + 8px)`；目的：1024 段也走 CSS var 通道，统一逻辑（不依赖具体数值）。
  - depends_on: Step 1

- [ ] **Step 3**: `index.html:1803`（1024 `@media` 内 `#statusBar` 块） — `edit` — 在该块内追加 `:root { --hud-height: 64px; }`（1024 下 statusBar 因 `flex-wrap:wrap` 实际可达 2-3 行，给足 64px）；同时把 `#sidebarPanelArea { padding-top: var(--hud-height); ... }` 留给已有规则消费。目的：闭合 1024 段 statusBar 真实高度与 alertStack `top` 联动。
  - depends_on: Step 1

- [ ] **Step 4**: `src/ui/panels/AIPolicyTimelinePanel.js:28-37` (`formatRow`) — `edit` — 把签名改为 `formatRow(entry, nowSec, count)`；当 `count > 1` 时在末尾追加 `<span class="muted">×${count} last ${Math.round(spanSec)}s</span>`。

- [ ] **Step 5**: `src/ui/panels/AIPolicyTimelinePanel.js:48-66` (`render`) — `edit` — 在 `history.slice(0, 12).map(...)` 之前插入 dedupe pass：循环 history，若当前 entry 的 `(badgeState||source) + focus + (errorKind||"none")` 与 group 头一致且 `Number.isFinite(entry.atSec) && (groupHead.atSec - entry.atSec) <= 80` 则 `count++` 并扩展 `spanSec = groupHead.atSec - entry.atSec`，否则结束当前 group → 输出 `[head, count, spanSec]` 并开新 group。最终对 group 数组（最多 12 组）调用 `formatRow(head, nowSec, count, spanSec)`。
  - depends_on: Step 4

- [ ] **Step 6**: `test/ui/aiPolicyTimelinePanel.dedupe.test.js` — `add` — 新增 Node test：构造一个 stub `state.ai.policyHistory = [9× same fallback-healthy in 60s window, 1× different]`，模拟 DOM via `globalThis.document = { getElementById: () => ({ innerHTML:'' }) }`，断言 `panel.render()` 后 `root.innerHTML` 含 `×9` 且只出现 1 个 `<li` 标签对应该组（共 2 组 = 2 个 `<li`）。验证 80s 窗口外不折叠。
  - depends_on: Step 5

## 5. Risks

- 1366 媒体查询将 `--hud-height` 提至 56px → `#sidebarPanelArea { padding-top: var(--hud-height) }` 在窗口跨过 1366 阈值瞬间 sidebar 内容会下移 16px。可接受（只在 resize 瞬间），但需手动验证无视觉断层。
- Timeline dedupe 80s 窗口若 NPCBrainSystem 的 push 间隔大于 80s 则不折叠 → 与 R2 feedback 期望一致（"`×9 last 80s`"）；若未来调整 brain tick 间隔需重新校准窗口。
- alertStack `z-index:16` 在 1366 段从原本的 40 降到 16 — 仍高于 statusBar 的 15，但低于 helpModal (1500) 与 customTooltip (9999)，不破坏现有层级。
- 可能影响的现有测试：`test/ui/hud-autopilot-chip.test.js`（autopilot chip CSS clamp）、`test/ui/hudController.casualScoreBreakGate.test.js`（statusScoreBreak 在 1366 下显隐）— 都是 jsdom 无 viewport，CSS 媒体查询不会触发，应保持绿。

## 6. 验证方式

- 新增测试：`test/ui/aiPolicyTimelinePanel.dedupe.test.js` — 覆盖：(a) 9 同名 entries 80s 内折叠为 1 组带 `×9`；(b) 第 10 条不同 badgeState 开新组；(c) 81s 间隔不折叠；(d) `entry.atSec` 为 undefined / NaN 时回退到不折叠（不抛错）。
- 手动验证：`npx vite` → 浏览器开发者工具切到 1366×768 → 顶 KPI bar 6 个 goal chip 全部可见（含 `walls 0/8`），toast `Last: Deer-X died` 出现在 statusBar **下方** 不重叠；切到 1024×768 → sidebar 在底部，topbar 全宽，chips 可换行 2-3 行，toast 在 64+8=72px 起始 top；切到 1920×1080 → 与 R1 一致无回归。
- AI Log → Director Timeline 9 同名条目应折叠为单行 `fallback-healthy rebuild the broken supply lane fallback ×9 last <span>s`。
- prod build：`npx vite build` 无错；`vite preview` 启动后 3 分钟 smoke 无 console error。
- 测试基线：`node --test test/ui/*.test.js test/ui/aiPolicyTimelinePanel.dedupe.test.js` 全绿；CLAUDE.md 记录的 1646 pass / 0 fail / 2 skip 不退化。

## 7. 回滚锚点

- 当前 HEAD: `d242719`
- 一键回滚：`git reset --hard d242719`（仅当 Implementer 失败时由 orchestrator 触发）
- 与 R1 目标 commit `1f6ecc6` 之间的差为本轮已完成增量；`d242719` 是 R2 进入前的稳定锚点。

## 8. UNREPRODUCIBLE 标记

不适用（feedback 提供了 03/04/05 三档分辨率截图 + AI Log 截图 07，证据充分，无需 Playwright 重新复现即可定位）。
